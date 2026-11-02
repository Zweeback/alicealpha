"""Alice (MPFB-Basis) -> VRM 1.0.   python3 mh/export_vrm.py --out OUT.vrm [--core out/mh/core.blend] [--parts a.blend b.blend ...]
                                                             [--no-tpose] [--save-blend X.blend]
Part-Konvention: Abteilungen liefern  out/mh/<name>.blend  mit Objekten  P_*  (Armature-Modifier / Vertex-Gruppen = Bone-Namen)
und optional  out/mh/<name>.json  { "bones":[{name,head,tail,parent,roll,deform}], "springs":[{name,joints:[..],stiffness,drag,gravity,
hit_radius,center}], "colliders":[{name,bone,type:'sphere'|'capsule',offset,tail,radius}] }  (Koordinaten im Blender-Weltraum, Meter)."""
import sys, os, json, math, argparse, traceback
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'blender'))
import numpy as np
import bpy
from mathutils import Vector, Matrix
import vrm_env

ap = argparse.ArgumentParser()
ap.add_argument('--out', required=True)
ap.add_argument('--core', default='out/mh/core.blend')
ap.add_argument('--parts', nargs='*', default=[])
ap.add_argument('--no-tpose', action='store_true')
ap.add_argument('--save-blend', default='')
ap.add_argument('--thumb', default='')
args = ap.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:])


def log(*a): print('[export]', *a, flush=True)


vrm_env.setup()
bpy.ops.wm.open_mainfile(filepath=os.path.abspath(args.core))
vrm_env.setup_after_open() if hasattr(vrm_env, 'setup_after_open') else None
import addon_utils
if 'io_scene_vrm' not in bpy.context.preferences.addons:
    addon_utils.enable('io_scene_vrm', default_set=True)
arm = bpy.data.objects['Alice_Armature']

# ------------------------------------------------------------------ Parts anhängen
extra_json = []
for pb in args.parts:
    pb = os.path.abspath(pb)
    before = set(bpy.data.objects.keys())
    with bpy.data.libraries.load(pb, link=False) as (src, dst):
        dst.objects = [n for n in src.objects if n.startswith('P_')]
    new = [o for o in bpy.data.objects if o.name not in before]
    keep = [o for o in new if o.name.startswith('P_') and o.type == 'MESH']
    # alles Fremde (z. B. mitgezogene Armatures) verwerfen
    for o in new:
        if o not in keep and o.type != 'MESH':
            bpy.data.objects.remove(o, do_unlink=True)
    for o in keep:
        bpy.context.scene.collection.objects.link(o)
        o.parent = arm; o.parent_type = 'OBJECT'; o.matrix_parent_inverse = Matrix.Identity(4)
        for m in o.modifiers:
            if m.type == 'ARMATURE': m.object = arm
        if not any(m.type == 'ARMATURE' for m in o.modifiers):
            m = o.modifiers.new('Armature', 'ARMATURE'); m.object = arm
        log('part', os.path.basename(pb), o.name, len(o.data.vertices), 'verts')
    jp = os.path.splitext(pb)[0] + '.json'
    if os.path.exists(jp):
        extra_json.append(json.load(open(jp)))

# Zusatz-Bones
bones_added = []
if any(j.get('bones') for j in extra_json):
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='EDIT')
    eb = arm.data.edit_bones
    pending = [b for j in extra_json for b in j.get('bones', [])]
    guard = 0
    while pending and guard < 100:
        guard += 1; rest = []
        for b in pending:
            par = b.get('parent')
            if b['name'] in eb: continue
            if par and par not in eb: rest.append(b); continue
            e = eb.new(b['name']); e.head = Vector(b['head']); e.tail = Vector(b['tail'])
            if 'roll' in b: e.roll = b['roll']
            e.parent = eb[par] if par else None; e.use_connect = False
            e.use_deform = b.get('deform', True); bones_added.append(b['name'])
        pending = rest
    bpy.ops.object.mode_set(mode='OBJECT')
    if pending: log('WARN: Bones ohne Eltern', [b['name'] for b in pending])
log('Zusatz-Bones:', len(bones_added))

# Körper-Vertices unter Kleidung entfernen (Indizes aus den Abteilungs-JSONs, bezogen auf core.blend-Alice_Body)
rm_idx = sorted({i for j in extra_json for i in j.get('body_remove_verts', [])})
if rm_idx:
    import bmesh
    body = bpy.data.objects['Alice_Body']
    bm = bmesh.new(); bm.from_mesh(body.data); bm.verts.ensure_lookup_table()
    n0 = len(bm.verts)
    bmesh.ops.delete(bm, geom=[bm.verts[i] for i in rm_idx if i < n0], context='VERTS')
    bm.to_mesh(body.data); bm.free(); body.data.update()
    log('Körper: %d Vertices unter Kleidung entfernt (%d -> %d)' % (len(rm_idx), n0, len(body.data.vertices)))

meshes = [o for o in bpy.data.objects if o.type == 'MESH']
for o in meshes:
    if o.parent is not arm: o.parent = arm
    if not any(m.type == 'ARMATURE' for m in o.modifiers):
        m = o.modifiers.new('Armature', 'ARMATURE'); m.object = arm
    # Objekt-Transform muss identisch sein
    o.matrix_world = Matrix.Identity(4)

# ------------------------------------------------------------------ T-Pose
def co_array(me_or_key, n):
    a = np.empty(n * 3, dtype=np.float32); me_or_key.foreach_get('co', a); return a.reshape(-1, 3)


def to_tpose():
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.select_all(action='DESELECT'); arm.select_set(True)
    bpy.ops.object.mode_set(mode='POSE')
    for side, sgn in (('l', 1.0), ('r', -1.0)):
        for bn in ('upperarm', 'lowerarm', 'hand'):
            pb = arm.pose.bones[f'{bn}_{side}']
            head = pb.head.copy(); cur = (pb.tail - pb.head).normalized()
            q = cur.rotation_difference(Vector((sgn, 0, 0)))
            T = Matrix.Translation(head) @ q.to_matrix().to_4x4() @ Matrix.Translation(-head)
            pb.matrix = T @ pb.matrix
            bpy.context.view_layer.update()
    bpy.ops.object.mode_set(mode='OBJECT')
    dg = bpy.context.evaluated_depsgraph_get()
    store = {}
    for o in [x for x in bpy.data.objects if x.type == 'MESH']:
        n = len(o.data.vertices)
        sk = o.data.shape_keys
        res = {}
        if sk is None:
            ev = o.evaluated_get(dg); me = ev.to_mesh(); res['__basis__'] = co_array(me.vertices, n) if False else np.array([v.co[:] for v in me.vertices], dtype=np.float32); ev.to_mesh_clear()
        else:
            vals = {kb.name: kb.value for kb in sk.key_blocks}
            for kb in sk.key_blocks: kb.value = 0.0
            dg.update(); ev = o.evaluated_get(dg); me = ev.to_mesh()
            res['__basis__'] = np.array([v.co[:] for v in me.vertices], dtype=np.float32); ev.to_mesh_clear()
            for kb in sk.key_blocks[1:]:
                kb.value = 1.0; dg.update(); ev = o.evaluated_get(dg); me = ev.to_mesh()
                res[kb.name] = np.array([v.co[:] for v in me.vertices], dtype=np.float32); ev.to_mesh_clear(); kb.value = 0.0
            for k, v in vals.items(): sk.key_blocks[k].value = v
        store[o.name] = res
    # Pose als Ruhepose übernehmen
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='POSE'); bpy.ops.pose.select_all(action='SELECT'); bpy.ops.pose.armature_apply(selected=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    for name, res in store.items():
        o = bpy.data.objects[name]; me = o.data
        if me.shape_keys:
            for kb in me.shape_keys.key_blocks:
                key = '__basis__' if kb == me.shape_keys.key_blocks[0] else kb.name
                kb.data.foreach_set('co', res[key].reshape(-1))
            me.vertices.foreach_set('co', res['__basis__'].reshape(-1))
        else:
            me.vertices.foreach_set('co', res['__basis__'].reshape(-1))
        me.update()
    log('T-Pose angewandt')


if not args.no_tpose:
    to_tpose()

# ------------------------------------------------------------------ VRM-Setup
ext = arm.data.vrm_addon_extension
ext.spec_version = '1.0'
vrm1 = ext.vrm1
hb = vrm1.humanoid.human_bones
MAP = {'hips': 'pelvis', 'spine': 'spine_01', 'chest': 'spine_02', 'upper_chest': 'spine_03', 'neck': 'neck_01', 'head': 'head',
       'left_eye': 'eye_l', 'right_eye': 'eye_r'}
for s, S in (('l', 'left'), ('r', 'right')):
    MAP.update({f'{S}_shoulder': f'clavicle_{s}', f'{S}_upper_arm': f'upperarm_{s}', f'{S}_lower_arm': f'lowerarm_{s}', f'{S}_hand': f'hand_{s}',
                f'{S}_upper_leg': f'thigh_{s}', f'{S}_lower_leg': f'calf_{s}', f'{S}_foot': f'foot_{s}', f'{S}_toes': f'ball_{s}',
                f'{S}_thumb_metacarpal': f'thumb_01_{s}', f'{S}_thumb_proximal': f'thumb_02_{s}', f'{S}_thumb_distal': f'thumb_03_{s}'})
    for f, F in (('index', 'index'), ('middle', 'middle'), ('ring', 'ring'), ('pinky', 'little')):
        for i, part in enumerate(('proximal', 'intermediate', 'distal'), 1):
            MAP[f'{S}_{F}_{part}'] = f'{f}_0{i}_{s}'
for k, bn in MAP.items():
    getattr(hb, k).node.bone_name = bn
bpy.ops.vrm.update_vrm1_expression_ui_list_elements() if False else None

meta = vrm1.meta
meta.vrm_name = 'Alice'
meta.version = '0.9'
a = meta.authors.add(); a.value = 'Ben (Bentropie)'
meta.copyright_information = '© Ben (Bentropie). Character design ALICE / INK.'
meta.contact_information = ''
meta.third_party_licenses = ('Base body mesh, face targets, skin/eye/eyebrow/eyelash/teeth/tongue assets from MakeHuman / MPFB community assets '
                             '(CC0 1.0, makehumancommunity.org). Custom hair, outfit, textures: original.')
meta.avatar_permission = 'onlyAuthor'
meta.commercial_usage = 'personalNonProfit'
meta.credit_notation = 'required'
meta.allow_redistribution = False
meta.modification = 'prohibited'
meta.allow_excessively_violent_usage = False
meta.allow_excessively_sexual_usage = False

# Expressions
def has_key(o, k): return o.type == 'MESH' and o.data.shape_keys and k in o.data.shape_keys.key_blocks
def bind(expr, key, w=1.0):
    n = 0
    for o in bpy.data.objects:
        if has_key(o, key):
            b = expr.morph_target_binds.add(); b.node.mesh_object_name = o.name; b.index = key; b.weight = w; n += 1
    return n
P = vrm1.expressions.preset
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from expressions import RECIPE
try:
    from expressions import CUSTOM
except ImportError:
    CUSTOM = {}
for name, rec in RECIPE.items():
    ex = getattr(P, name)
    for k, w in rec.items(): bind(ex, k, w)
    if name.startswith('blink'): ex.is_binary = False
    if name in ('aa', 'ih', 'ou', 'ee', 'oh'): ex.override_blink = 'none'
r = bpy.ops.vrm.assign_vrm1_expressions_from_arkit(armature_object_name=arm.name)
log('ARKit-Custom-Expressions:', r)
# Oculus-Visemes ebenfalls als Custom Expressions (für Lip-Sync-Tools)
for k in sorted({kb.name for o in bpy.data.objects if o.type == 'MESH' and o.data.shape_keys for kb in o.data.shape_keys.key_blocks if kb.name.startswith('viseme_')}):
    ce = vrm1.expressions.custom.add(); ce.custom_name = k; bind(ce, k, 1.0)

for cname, rec in CUSTOM.items():
    ce = vrm1.expressions.custom.add(); ce.custom_name = cname
    for k, w in rec.items(): bind(ce, k, w)
log('Custom-Expressions (Rezepte):', len(CUSTOM))

# LookAt (Bone)
la = vrm1.look_at
la.type = 'bone'
eye = Vector((0, 0, 0)); 
if 'Alice_Eyes' in bpy.data.objects:
    ev = [v.co for v in bpy.data.objects['Alice_Eyes'].data.vertices]; eye = sum(ev, Vector()) / len(ev)
head_b = arm.data.bones['head']
la.offset_from_head_bone = (eye - head_b.head_local)[:]
for rm, (inp, outp) in {'range_map_horizontal_inner': (10, 8), 'range_map_horizontal_outer': (10, 8),
                        'range_map_vertical_down': (10, 8), 'range_map_vertical_up': (10, 8)}.items():
    g = getattr(la, rm); g.input_max_value = inp * 1.0; g.output_scale = outp * 1.0

# First Person
fp = vrm1.first_person
for o in [x for x in bpy.data.objects if x.type == 'MESH']:
    an = fp.mesh_annotations.add(); an.node.mesh_object_name = o.name; an.type = 'auto'

# Spring Bones (aus den Abteilungs-JSONs)
sb = ext.spring_bone1
col_names = {}
for j in extra_json:
    for c in j.get('colliders', []):
        cc = sb.colliders.add(); cc.node.bone_name = c['bone']; ct = c['type'].lower(); cc.shape_type = ct.capitalize()
        sh = cc.shape.sphere if ct == 'sphere' else cc.shape.capsule
        sh.offset = c.get('offset', (0, 0, 0)); sh.radius = c['radius']
        if ct == 'capsule': sh.tail = c.get('tail', (0, 0, 0.1))
        cc.name = c['name']; col_names[c['name']] = cc
for j in extra_json:
    for s in j.get('springs', []):
        sp = sb.springs.add(); sp.vrm_name = s['name']
        for bn in s['joints']:
            jt = sp.joints.add(); jt.node.bone_name = bn
            jt.hit_radius = s.get('hit_radius', 0.02); jt.stiffness = s.get('stiffness', 1.0); jt.drag_force = s.get('drag', 0.4)
            jt.gravity_power = s.get('gravity', 0.1); jt.gravity_dir = s.get('gravity_dir', (0, 0, -1))
        if s.get('center'): sp.center.bone_name = s['center']
log('Spring-Gruppen:', len(sb.springs), 'Collider:', len(sb.colliders))

# ------------------------------------------------------------------ Aufräumen + Export
for o in [x for x in bpy.data.objects if x.type == 'MESH']:
    o.select_set(False)
    # nur Bone-Gruppen behalten
    bn = {b.name for b in arm.data.bones}
    for g in list(o.vertex_groups):
        if g.name not in bn: o.vertex_groups.remove(g)
    for p in o.data.polygons: p.use_smooth = True
if args.save_blend:
    bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(args.save_blend), copy=True)
os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
bpy.ops.object.select_all(action='DESELECT')
res = bpy.ops.export_scene.vrm(filepath=os.path.abspath(args.out), armature_object_name=arm.name, ignore_warning=True, export_try_sparse_sk=True)
log('Export:', res, os.path.getsize(args.out) if os.path.exists(args.out) else 'KEINE DATEI')
