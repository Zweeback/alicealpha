"""Cycles-Vorschau der Unterlage: core.blend + P_*-Teile aus einer/mehreren .blend, optional ohne entfernte Körper-Verts, optional Pose.
  python3 mh/under_preview.py --parts out/mh/under.blend --out PREFIX --shots full,q34,legs [--pose relaxed|knee|tpose] [--samples 16] [--res 0.7]
  eigene Kamera: --cam "x,y,z:tx,ty,tz:lens" (Shot-Name 'cam')"""
import sys, os, json, math, argparse
import numpy as np
import bpy
from mathutils import Vector, Matrix, Euler

ap = argparse.ArgumentParser()
ap.add_argument('--parts', nargs='*', default=['out/mh/under.blend'])
ap.add_argument('--out', required=True)
ap.add_argument('--shots', default='full,q34')
ap.add_argument('--pose', default='')
ap.add_argument('--samples', type=int, default=16)
ap.add_argument('--res', type=float, default=0.7)
ap.add_argument('--cam', default='')
ap.add_argument('--keepbody', action='store_true')
ap.add_argument('--bg', default='')
a = ap.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:])
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT, 'out/mh/core.blend'))
arm = bpy.data.objects['Alice_Armature']
sc = bpy.context.scene
for p in a.parts:
    pb = os.path.join(ROOT, p) if not os.path.isabs(p) else p
    before = set(bpy.data.objects.keys())
    with bpy.data.libraries.load(pb, link=False) as (src, dst):
        dst.objects = [n for n in src.objects if n.startswith('P_')]
    for o in [o for o in bpy.data.objects if o.name not in before]:
        if o.type != 'MESH': bpy.data.objects.remove(o, do_unlink=True); continue
        sc.collection.objects.link(o)
        o.parent = arm; o.matrix_parent_inverse = Matrix.Identity(4)
        if not any(m.type == 'ARMATURE' for m in o.modifiers):
            m = o.modifiers.new('Armature', 'ARMATURE'); m.object = arm
        for m in o.modifiers:
            if m.type == 'ARMATURE': m.object = arm
        for mat in o.data.materials:
            pass
    jp = os.path.splitext(pb)[0] + '.json'
    if os.path.exists(jp) and not a.keepbody:
        j = json.load(open(jp)); rem = set(j.get('body_remove_verts', []))
        if rem:
            body = bpy.data.objects['Alice_Body']
            import bmesh
            bm = bmesh.new(); bm.from_mesh(body.data); bm.verts.ensure_lookup_table()
            bmesh.ops.delete(bm, geom=[bm.verts[i] for i in rem if i < len(bm.verts)], context='VERTS')
            bm.to_mesh(body.data); bm.free()
# ---- Pose
def rot(bn, x=0, y=0, z=0):
    pb = arm.pose.bones[bn]; pb.rotation_mode = 'XYZ'; pb.rotation_euler = Euler((math.radians(x), math.radians(y), math.radians(z)), 'XYZ')
if a.pose == 'knee':
    for s in 'lr':
        rot(f'thigh_{s}', -45); rot(f'calf_{s}', 60); rot(f'foot_{s}', -15)
    rot('spine_01', 15); rot('upperarm_l', 0, 0, 20); rot('lowerarm_l', -70)
elif a.pose == 'relaxed':
    rot('thigh_l', -20); rot('calf_l', 35); rot('thigh_r', 10, 0, -8); rot('lowerarm_l', -60); rot('lowerarm_r', -30)
    rot('upperarm_l', 25, 0, 0); rot('hand_l', 0, 0, 20); rot('hand_r', 0, 0, -15); rot('spine_02', 8, 6, 0)
bpy.context.view_layer.update()
# ---- Render
sc.render.engine = 'CYCLES'; sc.cycles.samples = a.samples; sc.cycles.use_denoising = True; sc.cycles.device = 'CPU'
w = bpy.data.worlds.new('W'); w.use_nodes = True; sc.world = w
bg = w.node_tree.nodes['Background']; bg.inputs[0].default_value = (0.5, 0.55, 0.6, 1); bg.inputs[1].default_value = 0.7
target = bpy.data.objects.new('T', None); sc.collection.objects.link(target); target.location = (0, 0, 1.0)
def light(name, loc, energy, size, col=(1, 1, 1)):
    d = bpy.data.lights.new(name, 'AREA'); d.energy = energy; d.size = size; d.color = col
    o = bpy.data.objects.new(name, d); sc.collection.objects.link(o); o.location = loc
    t = o.constraints.new('TRACK_TO'); t.target = target; t.track_axis = 'TRACK_NEGATIVE_Z'; t.up_axis = 'UP_Y'
light('key', (-1.6, -2.2, 2.4), 260, 1.6, (1, .96, .92)); light('fill', (2.0, -1.6, 1.2), 90, 2.0, (.85, .92, 1))
light('rim', (1.2, 2.0, 2.0), 220, 1.0, (.7, .95, 1)); light('top', (0, -0.5, 3.0), 60, 2.0)
cam = bpy.data.cameras.new('C'); co = bpy.data.objects.new('C', cam); sc.collection.objects.link(co); sc.camera = co
top = 1.63
S = {
 'full': dict(res=(700, 1100), loc=(0, -5.2, top * .52), tgt=(0, 0, top * .5), lens=60),
 'q34': dict(res=(700, 1100), loc=(2.6, -4.2, top * .52), tgt=(0, 0, top * .5), lens=60),
 'side': dict(res=(700, 1100), loc=(5.2, 0, top * .52), tgt=(0, 0, top * .5), lens=60),
 'back': dict(res=(700, 1100), loc=(0, 5.2, top * .52), tgt=(0, 0, top * .5), lens=60),
 'bust': dict(res=(900, 900), loc=(0.6, -1.6, 1.28), tgt=(0, 0, 1.25), lens=70),
 'bust34': dict(res=(900, 900), loc=(1.1, -1.5, 1.28), tgt=(0, 0, 1.25), lens=70),
 'waist': dict(res=(900, 900), loc=(0.9, -1.8, 1.0), tgt=(0, 0, 0.95), lens=70),
 'legs': dict(res=(800, 1000), loc=(1.4, -2.6, 0.45), tgt=(0, 0, 0.42), lens=60),
 'thigh': dict(res=(900, 900), loc=(1.5, -1.4, 0.68), tgt=(0.15, 0, 0.62), lens=65),
 'feet': dict(res=(900, 700), loc=(0.55, -0.85, 0.2), tgt=(0.12, -0.05, 0.07), lens=55),
 'feet2': dict(res=(900, 700), loc=(-0.1, -0.7, 0.3), tgt=(0.0, -0.05, 0.06), lens=50),
 'footside': dict(res=(900, 700), loc=(1.0, -0.05, 0.1), tgt=(0.17, -0.05, 0.07), lens=60),
 'hand': dict(res=(900, 900), loc=(0.85, -0.75, 1.1), tgt=(0.44, -0.2, 0.95), lens=70),
 'hand2': dict(res=(900, 900), loc=(1.0, -0.2, 1.0), tgt=(0.44, -0.2, 0.95), lens=70),
 'neck': dict(res=(900, 900), loc=(0.7, -1.2, 1.45), tgt=(0, -0.03, 1.42), lens=70),
}
if a.cam:
    l, t, ln = a.cam.split(':'); S['cam'] = dict(res=(900, 900), loc=tuple(float(x) for x in l.split(',')), tgt=tuple(float(x) for x in t.split(',')), lens=float(ln))
for s in a.shots.split(','):
    p = S[s]
    sc.render.resolution_x = int(p['res'][0] * a.res); sc.render.resolution_y = int(p['res'][1] * a.res)
    cam.lens = p['lens']; co.location = p['loc']; target.location = p['tgt']
    d = Vector(p['tgt']) - Vector(p['loc']); co.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = f'{a.out}_{s}.png'; bpy.ops.render.render(write_still=True)
    print('RENDERED', sc.render.filepath)
