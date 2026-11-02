"""KITTEL-Abteilung: python3 mh/dept_coat.py  ->  out/mh/coat.blend (+ coat.json, notes_coat.md)"""
import os, sys, json, math, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
import bpy, bmesh
from coat_common import *
from coat_env import Envelope
import coat_shell, coat_sleeve, coat_rig
import mats

T0 = time.time()
def log(*a): print(f'[coat {time.time() - T0:5.1f}s]', *a, flush=True)


def merge_doubles(obj, dist=1e-5):
    bm = bmesh.new(); bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=dist)
    bm.to_mesh(obj.data); bm.free()


def solidify(obj, thickness=0.0035, offset=-1.0):
    bpy.ops.object.select_all(action='DESELECT'); obj.select_set(True); bpy.context.view_layer.objects.active = obj
    m = obj.modifiers.new('Solidify', 'SOLIDIFY'); m.thickness = thickness; m.offset = offset
    m.use_even_offset = False; m.use_rim = True; m.use_quality_normals = True
    bpy.ops.object.modifier_apply(modifier=m.name)


def assign_weights(obj, W, names):
    for g in list(obj.vertex_groups): obj.vertex_groups.remove(g)
    for k, nm in enumerate(names):
        col = W[:, k]
        idx = np.nonzero(col > 1e-4)[0]
        if len(idx) == 0: continue
        vg = obj.vertex_groups.new(name=nm)
        for i in idx: vg.add([int(i)], float(col[i]), 'REPLACE')


def mesh_arrays(obj):
    me = obj.data
    V = np.empty(len(me.vertices) * 3, np.float32); me.vertices.foreach_get('co', V)
    return V.reshape(-1, 3).astype(float)


def build():
    bpy.ops.wm.open_mainfile(filepath=os.path.join(OUT, 'core.blend'))
    arm = bpy.data.objects['Alice_Armature']
    body_obj = bpy.data.objects['Alice_Body']
    B = Body(body_obj); E = Envelope(B); log('body+env')
    G = coat_shell.build_shell(E)
    mb = MeshB('P_Coat'); coat_shell.shell_mesh(G, mb)
    SL = {}
    for side, off in ((+1, 0.0), (-1, 0.26)):
        SL[side] = coat_sleeve.build_sleeve(B, side)
        coat_sleeve.sleeve_mesh(SL[side], mb, uv_off=(off, 0.69))
    V, F, UV, M, attr = mb.arrays()
    me = make_bpy_mesh('P_Coat', V, F, UV, M)
    coat = bpy.data.objects.new('P_Coat', me); bpy.context.scene.collection.objects.link(coat)
    merge_doubles(coat)
    V = mesh_arrays(coat); log('coat verts', len(V))
    # ---- Gewichte
    bb = coat_rig.BodyBVH(B)
    Wb, dist = bb.weights(V)
    Wb = coat_rig.remap_groups(Wb, B.names)
    bones, springs, chains = coat_rig.build_chains(G['base_r'], coat_shell.cy_axis, coat_shell.hem_z)
    Fq = np.array([[v for v in p.vertices] + ([-1] if len(p.vertices) == 3 else []) for p in coat.data.polygons])
    W, names = coat_rig.skirt_weights(V, Wb, B.names, chains, cy_axis=coat_shell.cy_axis)
    W = coat_rig.smooth_weights(W, V, Fq, iters=2, lam=0.5)
    W = coat_rig.prune(W)
    assign_weights(coat, W, names); log('weights')
    solidify(coat); log('solidify', len(coat.data.vertices))
    # Material
    m = mats.pbr('Coat_Fabric', color=(0.90, 0.89, 0.88, 1), rough=0.62, alpha='OPAQUE')
    coat.data.materials.clear(); coat.data.materials.append(m)
    for p in coat.data.polygons: p.material_index = 0; p.use_smooth = True
    cols = coat_rig.thigh_colliders(B, arm)
    js = dict(bones=bones, springs=springs, colliders=cols, body_remove_verts=[])
    json.dump(js, open(os.path.join(OUT, 'coat.json'), 'w'), indent=1)
    for o in list(bpy.data.objects):
        if not o.name.startswith('P_'):
            bpy.data.objects.remove(o, do_unlink=True)
    path = os.path.join(OUT, 'coat.blend')
    bpy.ops.wm.save_as_mainfile(filepath=path)
    tris = sum(len(p.vertices) - 2 for p in coat.data.polygons)
    log('saved', path, len(coat.data.vertices), 'verts', tris, 'tris')


if __name__ == '__main__':
    build()
