"""Cycles-Vorschau Koerper + P_*-Teile: python3 mh/coat_preview.py OUT_PREFIX [--blend out/mh/coat.blend] [--shots full,q34,back,side] [--samples 12] [--nobody]"""
import os, sys, math, argparse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from mathutils import Vector
ap = argparse.ArgumentParser(); ap.add_argument('out'); ap.add_argument('--blend', default='out/mh/coat.blend')
ap.add_argument('--shots', default='full,q34,back,side'); ap.add_argument('--samples', type=int, default=12)
ap.add_argument('--res', type=float, default=0.6); ap.add_argument('--nobody', action='store_true'); ap.add_argument('--clay', action='store_true')
ap.add_argument('--hide', default='')
a = ap.parse_args(sys.argv[1:])
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT, 'out/mh/core.blend'))
if a.nobody:
    for o in list(bpy.data.objects):
        if o.type == 'MESH' and o.name in ('Alice_Body',): o.hide_render = True
pb = os.path.join(ROOT, a.blend)
with bpy.data.libraries.load(pb, link=False) as (src, dst):
    dst.objects = [n for n in src.objects if n.startswith('P_')]
for o in dst.objects:
    if o is not None and o.name not in bpy.context.scene.collection.objects:
        bpy.context.scene.collection.objects.link(o)
        if not o.data.materials:
            m = bpy.data.materials.new('clay'); m.diffuse_color = (0.8, 0.8, 0.8, 1); o.data.materials.append(m)
for h in [x for x in a.hide.split(',') if x]:
    for o in bpy.data.objects:
        if h in o.name: o.hide_render = True
sc = bpy.context.scene
sc.render.engine = 'CYCLES'; sc.cycles.samples = a.samples; sc.cycles.use_denoising = True; sc.cycles.device = 'CPU'
w = bpy.data.worlds.new('W'); w.use_nodes = True; sc.world = w
bg = w.node_tree.nodes['Background']; bg.inputs[0].default_value = (0.35, 0.37, 0.4, 1); bg.inputs[1].default_value = 0.7
target = bpy.data.objects.new('T', None); sc.collection.objects.link(target); target.location = (0, 0, 1.0)
def light(name, loc, energy, size, col=(1, 1, 1)):
    d = bpy.data.lights.new(name, 'AREA'); d.energy = energy; d.size = size; d.color = col
    o = bpy.data.objects.new(name, d); sc.collection.objects.link(o); o.location = loc
    t = o.constraints.new('TRACK_TO'); t.target = target; t.track_axis = 'TRACK_NEGATIVE_Z'; t.up_axis = 'UP_Y'
light('key', (-1.8, -2.4, 2.6), 300, 1.8, (1, .96, .92)); light('fill', (2.2, -1.8, 1.4), 100, 2.2, (.85, .92, 1))
light('rim', (1.4, 2.2, 2.2), 260, 1.2, (.8, .95, 1)); light('top', (0, -0.5, 3.0), 80, 2.0)
cam = bpy.data.cameras.new('C'); co = bpy.data.objects.new('C', cam); sc.collection.objects.link(co); sc.camera = co
top = 1.63
shots = {
 'full': dict(res=(800, 1280), az=0, dist=5.0, z=0.85, lens=60),
 'q34': dict(res=(800, 1280), az=38, dist=5.0, z=0.85, lens=60),
 'back': dict(res=(800, 1280), az=180, dist=5.0, z=0.85, lens=60),
 'side': dict(res=(800, 1280), az=90, dist=5.0, z=0.85, lens=60),
 'upper': dict(res=(1000, 1000), az=0, dist=2.4, z=1.15, lens=60),
 'upper34': dict(res=(1000, 1000), az=35, dist=2.4, z=1.15, lens=60),
 'upperback': dict(res=(1000, 1000), az=180, dist=2.4, z=1.15, lens=60),
 'upperside': dict(res=(1000, 1000), az=90, dist=2.4, z=1.15, lens=60),
 'low': dict(res=(1000, 800), az=25, dist=3.0, z=0.55, lens=55),
 'lowback': dict(res=(1000, 800), az=155, dist=3.0, z=0.55, lens=55),
 'bust': dict(res=(900, 900), az=0, dist=1.5, z=1.25, lens=60),
 'bust34': dict(res=(900, 900), az=30, dist=1.5, z=1.25, lens=60),
 'bustback': dict(res=(900, 900), az=180, dist=1.5, z=1.25, lens=60),
 'neck': dict(res=(900, 900), az=40, dist=1.0, z=1.38, lens=60),
 'top': dict(res=(900, 900), az=0, dist=0.001, z=0, lens=40),
}
for s in a.shots.split(','):
    p = shots[s]
    sc.render.resolution_x = int(p['res'][0] * a.res / 0.6 * 0.6); sc.render.resolution_y = int(p['res'][1] * a.res / 0.6 * 0.6)
    azr = math.radians(p['az']); tz = p['z']
    cam.lens = p['lens']
    if s == 'top':
        co.location = (0, -0.05, 3.0); target.location = (0, -0.05, 1.2); co.rotation_euler = (0, 0, 0); cam.lens = 70
        sc.render.resolution_x = 900; sc.render.resolution_y = 900
        co.rotation_euler = (math.radians(0), 0, 0)
    else:
        co.location = (math.sin(azr) * p['dist'], -math.cos(azr) * p['dist'], tz); target.location = (0, 0, tz)
        d = Vector(target.location) - Vector(co.location); co.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = f'{a.out}_{s}.png'; bpy.ops.render.render(write_still=True)
    print('RENDERED', sc.render.filepath, flush=True)
