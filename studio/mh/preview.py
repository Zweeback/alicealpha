"""Schneller PBR-Preview eines .blend (Cycles CPU). python3 mh/preview.py IN.blend OUTPREFIX [--shots full,face] [--samples 32]"""
import sys, os, math, argparse, bpy
from mathutils import Vector
ap = argparse.ArgumentParser(); ap.add_argument('blend'); ap.add_argument('out')
ap.add_argument('--shots', default='full,face'); ap.add_argument('--samples', type=int, default=24)
ap.add_argument('--res', type=float, default=1.0); ap.add_argument('--keys', default=''); ap.add_argument('--hide', default='')
a = ap.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:])
if a.blend.endswith('.vrm'):
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'blender'))
    import vrm_env; vrm_env.setup(); bpy.ops.import_scene.vrm(filepath=os.path.abspath(a.blend))
else:
    bpy.ops.wm.open_mainfile(filepath=os.path.abspath(a.blend))
sc = bpy.context.scene
for kv in [x for x in a.keys.split(',') if x]:
    k, v = kv.split('='); 
    for o in bpy.data.objects:
        if o.type == 'MESH' and o.data.shape_keys and k in o.data.shape_keys.key_blocks: o.data.shape_keys.key_blocks[k].value = float(v)
for h in [x for x in a.hide.split(',') if x]:
    for o in bpy.data.objects:
        if h in o.name: o.hide_render = True
sc.render.engine = 'CYCLES'; sc.cycles.samples = a.samples; sc.cycles.use_denoising = True
sc.cycles.device = 'CPU'
sc.render.resolution_percentage = 100
# Welt: weiches Studio
w = bpy.data.worlds.new('W'); w.use_nodes = True; sc.world = w
bg = w.node_tree.nodes['Background']; bg.inputs[0].default_value = (0.5, 0.55, 0.6, 1); bg.inputs[1].default_value = 0.6
def light(name, loc, energy, size, col=(1, 1, 1)):
    d = bpy.data.lights.new(name, 'AREA'); d.energy = energy; d.size = size; d.color = col
    o = bpy.data.objects.new(name, d); sc.collection.objects.link(o); o.location = loc
    t = o.constraints.new('TRACK_TO'); t.target = target; t.track_axis = 'TRACK_NEGATIVE_Z'; t.up_axis = 'UP_Y'
target = bpy.data.objects.new('T', None); sc.collection.objects.link(target); target.location = (0, 0, 1.0)
light('key', (-1.6, -2.2, 2.4), 260, 1.6, (1, .96, .92)); light('fill', (2.0, -1.6, 1.2), 80, 2.0, (.85, .92, 1))
light('rim', (1.2, 2.0, 2.0), 220, 1.0, (.7, .95, 1)); light('top', (0, -0.5, 3.0), 60, 2.0)
cam = bpy.data.cameras.new('C'); co = bpy.data.objects.new('C', cam); sc.collection.objects.link(co); sc.camera = co
# Höhe bestimmen
zs = [ (o.matrix_world @ Vector(c)).z for o in bpy.data.objects if o.type == 'MESH' for c in o.bound_box ]
top = max(zs); hz = top
shots = {
 'full': dict(res=(800, 1280), loc=(0, -5.2, top * .52), tgt=(0, 0, top * .5), lens=60),
 'face': dict(res=(900, 900), loc=(0, -1.15, top - .1), tgt=(0, 0, top - .1), lens=85),
 'q34': dict(res=(800, 1280), loc=(2.6, -4.2, top * .52), tgt=(0, 0, top * .5), lens=60),
 'bust': dict(res=(900, 1000), loc=(0, -2.1, top - .3), tgt=(0, 0, top - .3), lens=70),
}
for s in a.shots.split(','):
    p = shots[s]
    sc.render.resolution_x = int(p['res'][0] * a.res); sc.render.resolution_y = int(p['res'][1] * a.res)
    cam.lens = p['lens']; co.location = p['loc']; target.location = p['tgt']
    d = (Vector(p['tgt']) - Vector(p['loc'])); co.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = f'{a.out}_{s}.png'; bpy.ops.render.render(write_still=True)
    print('RENDERED', sc.render.filepath)
