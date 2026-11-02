# Blender-Render: Klinikum (LoD2) + RTW + Alice (VRM).  python3 mh/render_scene.py OUT_PREFIX RTW_X RTW_Y RTW_ROT ALICE_X ALICE_Y ALICE_ROT
import sys, math, bpy
sys.path.insert(0, __import__('os').path.join(__import__('os').path.dirname(__file__), '..', 'blender')); import vrm_env
P, rx, ry, rr, ax, ay, ar = sys.argv[1], *map(float, sys.argv[2:8])
bpy.ops.wm.read_factory_settings(use_empty=True); vrm_env.setup()
bpy.ops.import_scene.gltf(filepath=__import__('os').environ.get('SCENE_GLB', 'out/env/klinikum_dortmund_lod2.glb'))
bpy.ops.import_scene.gltf(filepath=__import__('os').environ.get('RTW_GLB', 'out/env/rtw_rettungswagen.glb')); rtw = [o for o in bpy.context.selected_objects if o.parent is None][0]
# Bodenhöhe unter dem RTW per Raycast
dg = bpy.context.evaluated_depsgraph_get()
def ground(x, y):
    hit, loc, *_ = bpy.context.scene.ray_cast(dg, (x, y, 200), (0, 0, -1)); return loc.z if hit else 0
rtw.location = (rx, ry, ground(rx, ry) + 0.02); rtw.rotation_euler.z = math.radians(rr)
bpy.ops.import_scene.vrm(filepath=__import__('os').environ.get('ALICE_VRM', 'out/alice.vrm'))
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
gz = ground(ax, ay); arm.location = (ax, ay, gz + 0.02); arm.rotation_euler.z = math.radians(ar)
# entspannte Armhaltung
bpy.context.view_layer.objects.active = arm; bpy.ops.object.mode_set(mode='POSE')
import mathutils
for side, sgn in (('Left', 1), ('Right', -1)):
    b = arm.pose.bones.get(side + 'Arm')
    if not b: continue
    b.rotation_mode = 'XYZ'
    # Oberarm ~70° nach unten: Rotation um Welt-Y (Blickrichtung) in lokale Achsen umrechnen
    M = (arm.matrix_world @ b.bone.matrix_local).to_3x3().normalized()
    q = mathutils.Quaternion((0, 1, 0), math.radians(-72 * sgn) if False else math.radians(72 * sgn))
    loc_axis = M.inverted() @ mathutils.Vector((0, 1, 0))
    b.rotation_mode = 'QUATERNION'; b.rotation_quaternion = mathutils.Quaternion(loc_axis, math.radians(72 * sgn))
bpy.ops.object.mode_set(mode='OBJECT')
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); bpy.context.scene.collection.objects.link(cam); bpy.context.scene.camera = cam
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sun.data.energy = 3.2; sun.rotation_euler = (0.9, 0.2, 2.3); bpy.context.scene.collection.objects.link(sun)
w = bpy.data.worlds.new('w'); w.use_nodes = True; w.node_tree.nodes['Background'].inputs[0].default_value = (0.55, 0.68, 0.85, 1); w.node_tree.nodes['Background'].inputs[1].default_value = 0.9; bpy.context.scene.world = w
s = bpy.context.scene; s.render.engine = 'CYCLES'; s.cycles.samples = 24; s.cycles.device = 'CPU'; s.render.resolution_x = 1280; s.render.resolution_y = 720; s.view_settings.view_transform = 'AgX' if 'AgX' in [v.identifier for v in s.view_settings.bl_rna.properties['view_transform'].enum_items] else 'Filmic'
def shot(name, loc, look, lens):
    cam.location = loc; d = (look[0] - loc[0], look[1] - loc[1], look[2] - loc[2])
    import mathutils; cam.rotation_euler = mathutils.Vector(d).to_track_quat('-Z', 'Y').to_euler(); cam.data.lens = lens; cam.data.clip_end = 3000
    s.render.filepath = f'{P}_{name}.png'; bpy.ops.render.render(write_still=True)
g = arm.location.z
shot('alice', (ax + 1.6, ay - 3.0, g + 1.6), (ax, ay, g + 1.15), 40)
shot('rtw', (rx + 9, ry - 11, rtw.location.z + 4.5), (rx, ry, rtw.location.z + 1.2), 30)
shot('both', (ax + 6, ay - 14, g + 6), ((ax + rx) / 2, (ay + ry) / 2, g + 1.4), 28)
print('DONE')
