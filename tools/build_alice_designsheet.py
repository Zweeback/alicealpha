#!/usr/bin/env python3
"""ALICE reference-sheet character pass: mesh construction on existing FBX rig.

NOT an identity-certified photogrammetric reconstruction. Builds separately
reviewable GLB/VRM candidate, never changes canonical model.
Run: blender --background --python tools/build_alice_designsheet.py
"""
import bpy
import math
import json
import hashlib
import sys
from pathlib import Path
from mathutils import Vector, Matrix

ROOT = Path.cwd()
SRC = ROOT / 'public/avatars/alice-fbx-source.glb'
OUT = ROOT / 'public/avatars/alice-designsheet-candidate.glb'
AUDIT = ROOT / 'public/avatars/alice-designsheet-candidate.json'
EXPECTED = '4580ac1c35a8bf4b49ac29d390197dd49cea053de42d563dbe940d09c0adeb30'
if not SRC.is_file() or hashlib.sha256(SRC.read_bytes()).hexdigest() != EXPECTED:
    raise SystemExit('Original FBX-derived GLB missing or SHA mismatch.')
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(SRC))
armatures=[a for a in bpy.data.objects if a.type == 'ARMATURE']
if len(armatures) != 1:
    raise SystemExit('Expected exactly one source armature.')
rig=armatures[0]
bones=rig.data.bones
for essential in ('Head','Spine2','Hips','LeftArm','RightArm','LeftForeArm','RightForeArm','LeftFoot','RightFoot'):
    if essential not in bones:
        raise SystemExit('Missing original rig bone: '+essential)

# Leave original face, eyes and ARKit blendshapes fully intact.
# Remove only the old, separately weighted outfit.
outfit=bpy.data.objects.get('outfit')
removed_original_outfit=bool(outfit and outfit.type == 'MESH')
if removed_original_outfit:
    bpy.data.objects.remove(outfit, do_unlink=True)

def world_bone(name, end='head'):
    b=bones[name]
    return rig.matrix_world @ (b.head_local if end == 'head' else b.tail_local)

def bounds(obj):
    pts=[obj.matrix_world @ Vector(c) for c in obj.bound_box]
    return (Vector(tuple(min(p[i] for p in pts) for i in range(3))),
            Vector(tuple(max(p[i] for p in pts) for i in range(3))))

skin_objs=[bpy.data.objects.get(n) for n in ('AvatarBody','AvatarHead')]
if any(o is None for o in skin_objs):
    raise SystemExit('Original body or head absent; refuse generic substitute.')
all_bounds=[bounds(o) for o in skin_objs]
lo=Vector(tuple(min(v[0][i] for v in all_bounds) for i in range(3)))
hi=Vector(tuple(max(v[1][i] for v in all_bounds) for i in range(3)))
h=max(hi.z-lo.z, .01)
s=h/1.75
head_min, head_max=bounds(skin_objs[1])
hc=(head_min+head_max)/2
head_radius=max(head_max.x-head_min.x, head_max.y-head_min.y)*.51
if not (0.8<h<3.0 and .08<head_radius<.6):
    raise SystemExit('Character scale outside human bounds: '+str((h,head_radius)))

# The face direction is determined from ORIGINAL eye meshes, not guessed.
eyes=[bpy.data.objects.get(n) for n in ('AvatarLeftEyeball','AvatarRightEyeball')]
if any(o is None for o in eyes):
    raise SystemExit('Cannot determine face direction: original eyeballs absent.')
eye_center=sum(((bounds(o)[0]+bounds(o)[1])/2 for o in eyes),Vector())/2
forward=eye_center-hc
forward.z=0
if forward.length<0.005:
    raise SystemExit('Face axis ambiguous; refuse blind placement.')
forward.normalize()
up=Vector((0,0,1))
right=forward.cross(up).normalized()
back=-forward
centre=Vector((hc.x,hc.y,lo.z))
def P(x,y,z): return centre + right*(x*s) + forward*(y*s) + up*(z*s)
def R(x,y,z): return hc+right*(x*s)+forward*(y*s)+up*(z*s)
def B(name): return world_bone(name)
def local(v): return Vector(((v-centre).dot(right)/s,(v-centre).dot(forward)/s,(v-centre).dot(up)/s))
head_height=(head_max.z-head_min.z)/s
floor_z=(lo.z-centre.z)/s

pal={
'hood':('#a894d9',.76,0),'hood_light':('#d2c4fa',.7,0),
'hood_shadow':('#3d334f',.82,0),'black':('#282637',.78,0),
'black_soft':('#464253',.82,0),'white':('#f4f1ff',.84,0),
'silver':('#c9cbd8',.53,.12),'lilac':('#b4a1e0',.7,0),
'violet':('#8e6acb',.65,0),'cyan':('#59b9cd',.43,.07),
'cyan_glow':('#84e7ec',.23,.25),'coral':('#d76d64',.66,0),
'hair_shadow':('#a3454e',.78,0),'hair_light':('#f0927b',.63,0),
'teal':('#358eae',.55,0),'teal_light':('#79d2de',.51,0),
'pink':('#efa1c7',.56,0),'skin':('#f5c1b0',.69,0)}
materials={}
for name,(color,rough,metal) in pal.items():
    m=bpy.data.materials.new('ALICE_'+name)
    m.diffuse_color=(*[pow(int(color[i:i+2],16)/255,2.2) for i in (1,3,5)],1)
    m.use_nodes=True
    bs=m.node_tree.nodes.get('Principled BSDF')
    if bs:
        bs.inputs['Base Color'].default_value=(*[int(color[i:i+2],16)/255 for i in (1,3,5)],1)
        bs.inputs['Roughness'].default_value=rough
        bs.inputs['Metallic'].default_value=metal
        if name == 'cyan_glow':
            bs.inputs['Emission Color'].default_value=(.1,.7,.83,1)
            bs.inputs['Emission Strength'].default_value=.2
    materials[name]=m
created=[]
def finish(obj,mat=None,bone=None):
    obj.name='ALICE_DESIGN__'+obj.name
    if mat: obj.data.materials.append(materials[mat])
    if bone:
        world=obj.matrix_world.copy()
        obj.parent=rig
        obj.parent_type='BONE'
        obj.parent_bone=bone
        obj.matrix_world=world
    created.append(obj.name)
    return obj

def mesh(name,verts,faces,mat,face_mats=None,bone=None):
    datablock=bpy.data.meshes.new('Alice_'+name)
    datablock.from_pydata([tuple(v) for v in verts], [], faces)
    datablock.update()
    obj=bpy.data.objects.new(name,datablock)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(materials[mat])
    if face_mats:
        for other in dict.fromkeys(face_mats):
            if other != mat: obj.data.materials.append(materials[other])
        ind={m:i for i,m in enumerate([m.name.removeprefix('ALICE_') for m in obj.data.materials])}
        for face,key in zip(obj.data.polygons,face_mats):
            face.material_index=ind[key]
    for face in obj.data.polygons:
        face.use_smooth=True
    return finish(obj,bone=bone)

def ellipsoid(name,xyz,radii,mat,bone=None,segments=24):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=max(10,segments//2),location=xyz)
    obj=bpy.context.object
    obj.name=name
    obj.scale=tuple(radii)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj,mat,bone)

def line(name,points,thickness,mat,bone=None):
    curve=bpy.data.curves.new(name,'CURVE')
    curve.dimensions='3D'
    curve.resolution_u=2
    curve.bevel_depth=thickness*s
    curve.resolution_u=12
    curve.bevel_resolution=3
    sp=curve.splines.new('BEZIER')
    sp.bezier_points.add(len(points)-1)
    for b,p in zip(sp.bezier_points,points):
        b.co=p
        b.handle_left_type='AUTO'
        b.handle_right_type='AUTO'
    obj=bpy.data.objects.new(name,curve)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(materials[mat])
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active=obj
    bpy.ops.object.convert(target='MESH')
    obj=bpy.context.view_layer.objects.active
    return finish(obj,bone=bone)

def loft(name,paths,mat,bone=None,decor=None):
    # Paths are corresponding rings in true world coordinates.
    n=len(paths[0]); assert all(len(p)==n for p in paths)
    v=[p for ring in paths for p in ring]
    faces=[]; types=[]
    for i in range(len(paths)-1):
        for j in range(n):
            faces.append((i*n+j, i*n+(j+1)%n, (i+1)*n+(j+1)%n, (i+1)*n+j))
            types.append(decor(i,j) if decor else mat)
    faces.extend([tuple(reversed(range(n))), tuple((len(paths)-1)*n+j for j in range(n))])
    types.extend([mat,mat])
    return mesh(name,v,faces,mat,types,bone)

def ellipse_ring(z, rx, ry, centre_y=0, count=32):
    return [P(math.cos(t*2*math.pi/count)*rx,
              centre_y+math.sin(t*2*math.pi/count)*ry,z) for t in range(count)]
def ring_tube(a,b,radii,mat,name,bone=None,count=12):
    v=(b-a).normalized()
    basis=v.cross(up)
    if basis.length<.2: basis=v.cross(forward)
    basis.normalize()
    basis2=v.cross(basis).normalized()
    ring=[]
    for t,r in zip((0,.24,.52,.78,1),radii):
        p=a.lerp(b,t)
        ring.append([p+(basis*math.cos(i*2*math.pi/count)+basis2*math.sin(i*2*math.pi/count))*r*s for i in range(count)])
    return loft(name,ring,mat,bone=bone)

def polyline_xyz(name,coords,radius,mat,bone=None,ref='body'):
    fn=R if ref=='head' else P
    return line(name,[fn(*p) for p in coords],radius,mat,bone)

# HAIR: layered shaped strands, orange/coral and turquoise highlights.
hair_base_z=.11
ellipsoid('hair_undercap',R(0,-.13,.09),(head_radius*.99,head_radius*.84,head_radius*1.07),
          'hair_shadow','Head',32)
# Tapered tapered 3D ribbons, not flat cards; each follows a distinct curved arc.
def strand(name,coordinates,width,mat='coral'):
    nodes=[R(*v) for v in coordinates]
    rings=[]
    for i,point in enumerate(nodes):
        next_point=nodes[min(i+1,len(nodes)-1)]
        prev_point=nodes[max(0,i-1)]
        tangent=next_point-prev_point
        if tangent.length<1e-5: tangent=up
        tangent.normalize()
        x=tangent.cross(forward)
        if x.length<.1: x=tangent.cross(right)
        x.normalize()
        y=tangent.cross(x).normalized()
        k=max(.025,(1-i/(len(nodes)-.35))**.55)
        rings.append([point+x*math.cos(j*math.pi/4)*width*s*k+y*math.sin(j*math.pi/4)*width*s*k*.63 for j in range(8)])
    return loft(name,rings,mat,bone='Head')

# Wind-swept bang layers around forehead, deliberately outside eyes.
for i in range(15):
    x=-.30+i*.043
    wave=.055*math.sin(i*2.1)
    strand('bang_%02d'%i,[
        (x*.77,-.012,.34),(x*.96,.14,.29),
        (x*.92+wave,.245,.18),(x+wave*.7,.27,.075+abs(i-7)*.008)
    ], .04, 'hair_light' if i%4==0 else ('teal' if i in (4,10) else 'coral'))
# Large flowing side-locks and narrow teal ribbons.
for side in (-1,1):
    for j in range(7):
        x=side*(.25+j*.045)
        z=-.42-j*.035
        strand('side_lock_%s_%s'%(side,j),[
            (side*.24,-.10,.26),(x,-.06,.09),
            (x+side*.045,-.05,-.17),(x+side*.02,-.015,z)
        ],.045-j*.002,'hair_shadow' if j%5==0 else ('teal' if j in (1,5) else 'coral'))
    for j in range(4):
        x=side*(.13+j*.085)
        strand('rear_lock_%s_%s'%(side,j),[
            (x,-.20,.24),(x+side*.03,-.29,.05),
            (x+side*.08,-.31,-.26),(x+side*.06,-.23,-.48)
        ],.055,'teal' if j==2 else 'hair_shadow')

# Purple hood — open face, full 3D shell and asymmetric pointed tips.
rings=[]
count=32
start=math.pi/2+.54
arc=2*math.pi-1.08
for i in range(10):
    t=i/9
    z=-.22+.67*t
    radius=(.45+.085*math.sin(math.pi*t))*(1-.55*max(0,t-.70))
    cy=-.12-.055*t
    rings.append([R(radius*math.cos(start+arc*j/(count-1)),
                    cy+radius*.78*math.sin(start+arc*j/(count-1)),z)
                  for j in range(count)])
# Open mesh seam, no ring caps.
vs=[p for ring in rings for p in ring]
faces=[(i*count+j,i*count+j+1,(i+1)*count+j+1,(i+1)*count+j)
       for i in range(9) for j in range(count-1)]
mesh('open_hood_shell',vs,faces,'hood_light',bone='Head')
for side,idx in ((-1,0),(1,-1)):
    edge=[ring[idx] for ring in rings]
    line('hood_face_edge_'+str(side),edge,.017,'hood_shadow','Head')
# The hood peak and two folded lilac side ears.
for side in (-1,1):
    verts=[R(side*.29,-.08,.32),R(side*.52,-.115,.42),R(side*.42,-.17,.57),
           R(side*.31,-.19,.37),R(side*.46,-.03,.41),R(side*.39,-.11,.51)]
    mesh('hood_fold_tip_'+str(side),verts,[(0,1,2),(3,5,4),(0,3,4,1),(1,4,5,2),(2,5,3,0)],
         'hood','Head')
# Crescent / plus on upper hood left.
polyline_xyz('crescent_outer',[(.32,.24,.42),(.28,.27,.46),(.30,.29,.51),(.34,.27,.54)],
             .014,'white','Head','head')
polyline_xyz('crescent_inner',[(.36,.30,.44),(.32,.32,.48),(.34,.30,.51)],.015,'hood','Head','head')
for d in (-1,1):
    polyline_xyz('hood_plus_a_'+str(d),[(d*.43,.245,.26),(d*.43,.245,.36)],.012,'pink','Head','head')
    polyline_xyz('hood_plus_b_'+str(d),[(d*.395,.245,.31),(d*.465,.245,.31)],.012,'pink','Head','head')

# White tunic / cropped coat with patterned lilac shoulder fabric.
top_z=(B('Spine2').z-centre.z)/s +.14
hip_z=(B('Hips').z-centre.z)/s
shoulder_z=(B('LeftArm').z+B('RightArm').z)/2/s-centre.z/s
waist_z=hip_z+.10
skirt_z=hip_z-.20
neck_z=(B('Neck').z-centre.z)/s if 'Neck' in bones else top_z+.06
top_z=max(waist_z+.28,min(neck_z-.06,waist_z+.57))
loft('white_tunic',[
    ellipse_ring(skirt_z,.265,.18,-.005),
    ellipse_ring(waist_z,.23,.145,-.005),
    ellipse_ring(top_z-.08,.255,.17,-.007),
    ellipse_ring(top_z,.17,.12,-.005),
], 'white','Spine2',
decor=lambda ring,i:'silver' if ring==0 and i%6 in (0,1) else ('lilac' if ring==1 and i%9==3 else 'white'))
# Split loose coat flaps in front. Faceted side tab panels.
for side in (-1,1):
    for k in range(3):
        x=side*(.24+k*.03)
        mesh('coat_panel_%d_%d'%(side,k),[
             P(x,.075,top_z-.14),
             P(x+side*.10,.035,waist_z-.05),
             P(x+side*.06,.048,skirt_z-.07),
             P(x-.02*side,.12,skirt_z+.035)
        ],[(0,1,2,3)],'hood_light' if k==1 else 'white',bone='Spine2')
    # Hanging ribbons at either hip.
    mesh('hip_ribbon_'+str(side),[
        P(side*.285,.01,waist_z),P(side*.32,.008,waist_z),
        P(side*.34,.015,skirt_z-.30),P(side*.29,.03,skirt_z-.39)
    ],[(0,1,2,3)],'violet','Hips')

# Hood resting shawl behind shoulders and long black hanging back-flap.
loft('cape_shoulders',[
    ellipse_ring(top_z-.20,.38,.22,-.085),
    ellipse_ring(top_z+.045,.38,.235,-.075),
], 'hood_light','Spine2',
decor=lambda ri,j:'white' if j%5 in (1,2) else 'lilac')
# Long rear flap, from shoulder to short skirt.
mesh('dark_cape_back',[
    P(-.265,-.18,top_z+.03),P(.265,-.18,top_z+.03),
    P(.30,-.20,skirt_z-.08),P(-.30,-.20,skirt_z-.08)
],[(0,1,2,3)],'hood_shadow','Spine2')
# Saturn ring emblem attached behind tunic
def circle_coords(cx,cy,cz,rx,rz,n=46):
    return [P(cx+math.cos(2*math.pi*i/n)*rx,cy,cz+math.sin(2*math.pi*i/n)*rz) for i in range(n+1)]
line('back_saturn_circle',circle_coords(0,-.214,top_z-.30,.09,.09),.012,'hood','Spine2')
line('back_saturn_orbit',[
    P(.15*math.cos(t),-.229,top_z-.30+.060*math.sin(t)) for t in [i*math.pi/20 for i in range(41)]
],.008,'hood_light','Spine2')
# Black shoulder suspender straps and belt with buckle.
for side in (-1,1):
    polyline_xyz('harness_front_'+str(side),[
        (side*.21,.145,top_z+.015),(side*.18,.185,top_z-.16),
        (side*.14,.17,waist_z+.05),(side*.14,.16,waist_z-.07)],.018,
        'black','Spine2')
polyline_xyz('main_belt',[
    (-.28,.16,waist_z),(-.14,.174,waist_z+.01),(0,.18,waist_z+.02),
    (.14,.174,waist_z+.01),(.28,.16,waist_z)],.032,'black','Hips')
for xx in (-.095,.095):
    line('belt_buckle_side_'+str(xx),[
        P(xx,.205,waist_z-.036),P(xx,.207,waist_z+.04)],.011,'silver','Hips')
# Large collar neckline with V-shaped dark trim.
polyline_xyz('neckline_v',[(-.19,.10,top_z),(-.12,.19,top_z-.125),
                             (0,.205,top_z-.205),(.12,.19,top_z-.125),
                             (.19,.10,top_z)],.023,'black','Spine2')
polyline_xyz('neckline_inside',[(-.095,.198,top_z-.135),
                                 (0,.212,top_z-.20),(.095,.198,top_z-.135)],
                                 .011,'violet','Spine2')

# Puffy sleeves tied to actual original armature segments.
for side,bone_name,forearm in ((-1,'LeftArm','LeftForeArm'),(1,'RightArm','RightForeArm')):
    a=world_bone(bone_name,'head'); b=world_bone(bone_name,'tail')
    la=world_bone(forearm,'head'); lb=world_bone(forearm,'tail')
    ring_tube(a,b,[.18,.20,.19,.155,.13],'white','puff_upper_'+bone_name,bone_name)
    ring_tube(la,lb,[.138,.16,.165,.13,.114],'hood_light','puff_lower_'+forearm,forearm)
    # Black cuff and lilac cuff piping
    cuff=la.lerp(lb,.92)
    direction=(lb-la).normalized()
    ring_tube(cuff-direction*.023*s,cuff+direction*.023*s,[.115]*5,
              'black','sleeve_cuff_'+forearm,forearm)
    ring_tube(cuff-direction*.055*s,cuff-direction*.02*s,[.13]*5,
              'violet','sleeve_cuff_trim_'+forearm,forearm)
    # Small cross badge on each near-outer upper sleeve.
    badge=a.lerp(b,.39)+forward*.16*s+up*.055*s
    line('sleeve_plus_1_'+bone_name,[badge+up*.05*s,badge-up*.05*s],.014,'violet',bone_name)
    line('sleeve_plus_2_'+bone_name,[badge+right*.05*s,badge-right*.05*s],.014,'violet',bone_name)

# Thigh-high right sock and exposed opposite leg retained from original body.
# Sock profile binds to upper / lower leg bones, not free-floating world location.
sock_side='Right'
thigh_a=world_bone(sock_side+'UpLeg','head')
knee=world_bone(sock_side+'UpLeg','tail')
ankle=world_bone(sock_side+'Leg','tail')
ring_tube(thigh_a.lerp(knee,.24),knee,[.145,.148,.137,.13,.125],
          'white','right_thigh_high_upper',sock_side+'UpLeg')
ring_tube(knee,ankle,[.128,.115,.105,.095,.09],
          'white','right_thigh_high_lower',sock_side+'Leg')
# Pink stripes toward lower outer calf; oriented with foot structure.
for f in (.59,.67):
    pt=knee.lerp(ankle,f)+forward*.10*s
    line('sock_stripe_'+str(f),[pt-right*.07*s,pt+right*.055*s+up*.025*s],
         .008,'pink',sock_side+'Leg')
# Black suspender strap and little thigh crystal.
pt=thigh_a.lerp(knee,.3)
line('right_thigh_strap',[pt-right*.08*s+forward*.15*s,pt+right*.12*s+forward*.15*s],
     .027,'black',sock_side+'UpLeg')
ellipsoid('thigh_heart_gem',pt+forward*.163*s,(.025*s,.012*s,.03*s),
          'cyan_glow',sock_side+'UpLeg')

# Foot geometry: layered chunky soles, upper and laces, retained with FOOT bones.
for side in ('Left','Right'):
    foot=B(side+'Foot')
    toe=world_bone(side+'Foot','tail')
    ankle=world_bone(side+'Leg','tail')
    shoecentre=foot.lerp(toe,.42)
    e=shoecentre+up*.02*s
    ellipsoid('sole_black_'+side,e,(.16*s,.24*s,.08*s),'black',side+'Foot',32)
    ellipsoid('sole_white_'+side,e+up*.055*s,(.163*s,.245*s,.076*s),'white',side+'Foot',32)
    ellipsoid('boot_upper_'+side,foot+up*.13*s,(.14*s,.15*s,.22*s),
              'hood_shadow',side+'Foot',28)
    ellipsoid('toe_white_'+side,shoecentre+forward*.055*s+up*.105*s,
              (.143*s,.13*s,.075*s),'white',side+'Foot')
    ellipsoid('boot_cuff_'+side,ankle+up*.13*s,(.14*s,.13*s,.055*s),'violet',side+'Foot')
    for j in range(3):
        z=.13+j*.05
        line('boot_lace_a_%s_%d'%(side,j),[
            foot+forward*.135*s+up*z*s-right*.065*s,
            foot+forward*.14*s+up*(z+.03)*s+right*.065*s
        ],.009,'pink',side+'Foot')
        line('boot_lace_b_%s_%d'%(side,j),[
            foot+forward*.14*s+up*(z+.03)*s-right*.065*s,
            foot+forward*.135*s+up*z*s+right*.065*s
        ],.009,'pink',side+'Foot')
    # cyan triangular boot insignia
    pp=foot+forward*.139*s+up*.29*s
    mesh('shoe_triangle_'+side,[
        pp+up*.035*s,pp-right*.036*s-up*.03*s,
        pp+right*.036*s-up*.03*s
    ],[(0,1,2)],'cyan_glow',bone=side+'Foot')

# Choker, gem pendant, earrings: follow neck/head.
neck=B('Neck') if 'Neck' in bones else R(0,.10,-.22)
ellipsoid('black_choker',neck+up*.05*s,(.105*s,.11*s,.029*s),
          'black','Head')
gemcentre=neck+forward*.13*s-up*.03*s
mesh('neck_prism',[
    gemcentre+up*.055*s,
    gemcentre-right*.04*s,gemcentre+up*(-.075*s),
    gemcentre+right*.04*s
],[(0,1,3),(1,2,3)],'cyan_glow',bone='Head')
for side in (-1,1):
    for d in (0,.08):
        line('earring_%s_%s'%(side,d),[
            R(side*.29,0,-.07-d),R(side*.31,.07,-.17-d),
            R(side*.29,.08,-.21-d)],.007,'violet','Head')
    ellipsoid('earring_crystal_'+str(side),R(side*.29,.08,-.22),
              (.018*s,.016*s,.035*s),'cyan_glow','Head')
# Triangle / rhombus markings.
for side in (-1,1):
    mesh('upper_hood_mark_'+str(side),[
        R(side*.35,-.22,.35),R(side*.40,-.22,.29),R(side*.30,-.22,.29)
    ],[(0,1,2)],'violet','Head')

# Detect accidental destroy of the original visemes and rig.
head_obj=bpy.data.objects.get('AvatarHead')
if not head_obj or not head_obj.data.shape_keys:
    raise SystemExit('ALICE facial blendshapes were lost.')
shape_names=[k.name for k in head_obj.data.shape_keys.key_blocks]
for required in ('eyeBlinkLeft','eyeBlinkRight','jawOpen','aa','ih','oh'):
    if required not in shape_names:
        raise SystemExit('Critical original face morph missing: '+required)
if len(created)<90:
    raise SystemExit('Too few actual sculpt parts; not a complete pass.')

OUT.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=str(OUT),export_format='GLB',
    use_selection=False,export_skins=True,
    export_morph=True,export_animations=True,
    export_cameras=False,export_lights=False
)
if OUT.stat().st_size>45*1024*1024:
    OUT.unlink()
    raise SystemExit('Excessively large mobile export.')
audit={
 'status':'UNAPPROVED_DESIGNSHEET_CANDIDATE',
 'source':str(SRC.relative_to(ROOT)),
 'sourceSha256':EXPECTED,
 'sourceDesign':'conversation-upload 1000016500.png · ALICE VTuber design sheet',
 'sourceCharacterMeshPreserved':True,
 'sourceOutfitRemoved':removed_original_outfit,
 'rigBoneCount':len(bones),
 'faceMorphCount':len(shape_names)-1,
 'newModelParts':len(created),
 'newModelPartNames':created,
 'newFeatures':['orange cyan hair with flowing strands',
                'lavender pointed hood and head ornaments',
                'white layered jacket and detachable black cape',
                'rig-attached puffy sleeves and cuffs',
                'black belt and harness','single thigh-high right sock',
                'chunky violet black white sneakers','blue gemstone accessories',
                'back planetary emblem'],
 'visualIdentityVerified':False,
 'animationVerified':False,
 'referenceFidelityVerified':False,
 'outputFile':str(OUT.relative_to(ROOT)),
 'outputBytes':OUT.stat().st_size,
 'outputSha256':hashlib.sha256(OUT.read_bytes()).hexdigest()
}
AUDIT.write_text(json.dumps(audit,ensure_ascii=False,indent=2)+'\n')
print('ALICE_DESIGNSHEET_MODEL_RESULT='+json.dumps({k:v for k,v in audit.items() if k!='newModelPartNames'},ensure_ascii=False))
