#!/usr/bin/env python3
"""Paralax-Teile (fin/parts_px.npz + fin/mats_px.json) einfügen + Haare zum kinnlangen Bob kürzen.
  python3 fin/merge_px.py IN.vrm OUT.vrm"""
import io, json, struct, sys, os, math, numpy as np
from PIL import Image
src, dst = sys.argv[1:3]; D = os.path.dirname(os.path.abspath(__file__))
raw = open(src, 'rb').read(); off = 12; ch = []
while off < len(raw):
    l, t = struct.unpack('<II', raw[off:off + 8]); ch.append(raw[off + 8:off + 8 + l]); off += 8 + l
j = json.loads(ch[0]); b = bytearray(ch[1])
CT = {5121: 'u1', 5123: 'u2', 5125: 'u4', 5126: 'f4'}; NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}
def acc(ai):
    A = j['accessors'][ai]; n = NC[A['type']]; dt = np.dtype('<' + CT[A['componentType']]); bv = j['bufferViews'][A['bufferView']]
    o = bv.get('byteOffset', 0) + A.get('byteOffset', 0); return np.frombuffer(bytes(b[o:o + A['count'] * n * dt.itemsize]), dt).reshape(-1, n).copy()
def add_bv(data, target=None):
    while len(b) % 4: b.append(0)
    e = {'buffer': 0, 'byteOffset': len(b), 'byteLength': len(data)}
    if target: e['target'] = target
    b.extend(data); j['bufferViews'].append(e); return len(j['bufferViews']) - 1
def add_acc(arr, ct, typ, target=None, mm=False):
    a = {'bufferView': add_bv(np.ascontiguousarray(arr).tobytes(), target), 'componentType': ct, 'count': int(arr.shape[0]), 'type': typ}
    if mm: a['min'] = arr.min(0).tolist(); a['max'] = arr.max(0).tolist()
    j['accessors'].append(a); return len(j['accessors']) - 1
def node_world():
    par = {c: i for i, n in enumerate(j['nodes']) for c in n.get('children', [])}; W = {}
    def loc(n):
        T = np.eye(4); T[:3, 3] = n.get('translation', [0, 0, 0]); x, y, z, w = n.get('rotation', [0, 0, 0, 1])
        R = np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)], [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)], [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
        M = np.eye(4); M[:3, :3] = R @ np.diag(n.get('scale', [1, 1, 1])); return T @ M
    def g(i):
        if i not in W: W[i] = g(par[i]) @ loc(j['nodes'][i]) if i in par else loc(j['nodes'][i])
        return W[i]
    for i in range(len(j['nodes'])): g(i)
    return W
NW = node_world(); skin = j['skins'][0]; jn = skin['joints']; names = {j['nodes'][n]['name']: k for k, n in enumerate(jn)}
IBM = acc(skin['inverseBindMatrices']).reshape(-1, 4, 4).transpose(0, 2, 1); JM = np.stack([NW[n] @ IBM[k] for k, n in enumerate(jn)])
def add_tex(path, name):
    im = Image.open(path); buf = io.BytesIO(); fmt = 'PNG'; im.save(buf, fmt)
    j['images'].append({'name': name, 'mimeType': 'image/png', 'bufferView': add_bv(buf.getvalue())})
    j['textures'].append({'source': len(j['images']) - 1, **({'sampler': 0} if j.get('samplers') else {})}); return len(j['textures']) - 1
def add_mat(name, tex=None, rough=0.7, emissive=None, ds=False, metal=0.0, alpha=None, es=2.5):
    m = {'name': name, 'pbrMetallicRoughness': {'metallicFactor': metal, 'roughnessFactor': rough}, 'doubleSided': ds}
    if alpha: m['alphaMode'] = alpha; m['alphaCutoff'] = 0.5
    if tex is not None: m['pbrMetallicRoughness']['baseColorTexture'] = {'index': tex}
    if emissive: m['emissiveFactor'] = emissive; m['extensions'] = {'KHR_materials_emissive_strength': {'emissiveStrength': es}}
    j['materials'].append(m); return len(j['materials']) - 1
head_node = next(i for i, n in enumerate(j['nodes']) if n.get('name') == 'AvatarHead'); head_prim = j['meshes'][j['nodes'][head_node]['mesh']]['primitives'][0]
MS = json.load(open(f'{D}/mats_px.json')); MAT = {}
for k, c in MS.items():
    MAT[k] = add_mat('Alice_PX_' + k, add_tex(f'{D}/tex_px/{c["tex"]}', 'px_' + k), c.get('rough', 0.7), c.get('emissive'), c.get('ds', False), c.get('metal', 0.0), c.get('alpha'), c.get('es', 2.5))
if 'KHR_materials_emissive_strength' not in j.setdefault('extensionsUsed', []): j['extensionsUsed'].append('KHR_materials_emissive_strength')
Z = np.load(f'{D}/parts_px.npz'); parts = sorted({k.split('__')[0] for k in Z.files})
scene_nodes = j['scenes'][j.get('scene', 0)]['nodes']; tot = 0
for pn in parts:
    P, N, UV, J, W, I, mat = (Z[f'{pn}__{k}'] for k in ('P', 'N', 'UV', 'J', 'W', 'I', 'mat'))
    key = np.round(np.c_[P, N * 0.01, UV], 5); _, uq, inv = np.unique(key, axis=0, return_index=True, return_inverse=True)
    P, N, UV, J, W = P[uq], N[uq], UV[uq], J[uq], W[uq]; I = inv.reshape(-1)[I].astype(np.uint32)
    Ji = np.array([[names.get(x, names['Hips']) if x else 0 for x in row] for row in J], np.uint16)
    M = np.einsum('nk,nkij->nij', W.astype(np.float64), JM[Ji]); Mi = np.linalg.inv(M)
    Pl = np.einsum('nij,nj->ni', Mi, np.c_[P, np.ones(len(P))])[:, :3].astype(np.float32)
    Nl = np.einsum('nij,nj->ni', Mi[:, :3, :3], N.astype(np.float64)); Nl = (Nl / (np.linalg.norm(Nl, axis=1, keepdims=True) + 1e-9)).astype(np.float32)
    attrs = {'POSITION': add_acc(Pl, 5126, 'VEC3', 34962, True), 'NORMAL': add_acc(Nl, 5126, 'VEC3', 34962), 'TEXCOORD_0': add_acc(UV, 5126, 'VEC2', 34962),
             'JOINTS_0': add_acc(Ji, 5123, 'VEC4', 34962), 'WEIGHTS_0': add_acc(W.astype(np.float32), 5126, 'VEC4', 34962)}
    j['meshes'].append({'name': 'Alice_' + pn, 'primitives': [{'attributes': attrs, 'indices': add_acc(I, 5125, 'SCALAR', 34963), 'material': MAT[str(mat)]}]})
    j['nodes'].append({'name': 'Alice_' + pn, 'mesh': len(j['meshes']) - 1, 'skin': 0}); scene_nodes.append(len(j['nodes']) - 1)
    tot += len(I) // 3
print('parts', len(parts), 'total added tris', tot)
# ---------------------------------------------------------------- Bob: Haarvorhang auf Kinnhöhe kürzen, unten etwas Volumen
pa = head_prim['attributes']; PH = acc(pa['POSITION'])
mat = j['materials'][head_prim['material']]; ti = mat['pbrMetallicRoughness']['baseColorTexture']['index']; im = j['images'][j['textures'][ti]['source']]
bv = j['bufferViews'][im['bufferView']]; UVH = acc(pa['TEXCOORD_0'])
tex = np.asarray(Image.open(io.BytesIO(bytes(b[bv.get('byteOffset', 0):bv.get('byteOffset', 0) + bv['byteLength']]))).convert('HSV')).astype(float)
Ht, Wt = tex.shape[:2]; px = np.clip((UVH[:, 0] % 1 * Wt).astype(int), 0, Wt - 1); py = np.clip((UVH[:, 1] % 1 * Ht).astype(int), 0, Ht - 1)
sat = tex[py, px, 1] / 255; val = tex[py, px, 2] / 255
x, y, z = PH[:, 0], PH[:, 1], PH[:, 2]
Y0 = float(os.environ.get('BOB_Y0', 1.60)); YE = float(os.environ.get('BOB_END', 1.468))
hair = (sat > 0.45) & (val < 0.75) & ((np.abs(x) > 0.058) | (z < 0.0)) & (y < Y0)
ymin = float(y[hair].min()); k = (Y0 - YE) / (Y0 - ymin)
yn = Y0 - (Y0 - y) * k; s = np.clip((Y0 - yn) / (Y0 - YE), 0, 1)
cx, cz = 0.0, -0.006; dx, dz = x - cx, z - cz; rr = np.hypot(dx, dz) + 1e-9
push = 0.010 * s ** 1.5 + 0.006 * np.clip((s - 0.8) / 0.2, 0, 1)       # leicht ausgestellte Spitzen
PH2 = PH.copy(); PH2[hair, 1] = yn[hair]; PH2[hair, 0] = (x + dx / rr * push)[hair]; PH2[hair, 2] = (z + dz / rr * push)[hair]
pa['POSITION'] = add_acc(PH2.astype(np.float32), 5126, 'VEC3', 34962, True)
print('bob: hair verts', int(hair.sum()), 'ymin', round(ymin, 3), 'k', round(k, 3))
v = j['extensions']['VRMC_vrm']; v['meta']['version'] = '2.0-paralax'; v['meta']['name'] = 'ALICE (Paralax look)'
j['buffers'][0]['byteLength'] = len(b)
while len(b) % 4: b.append(0)
jb = json.dumps(j, separators=(',', ':')).encode()
while len(jb) % 4: jb += b' '
open(dst, 'wb').write(struct.pack('<III', 0x46546C67, 2, 28 + len(jb) + len(b)) + struct.pack('<II', len(jb), 0x4E4F534A) + jb + struct.pack('<II', len(b), 0x004E4942) + bytes(b))
print('OK', dst, round((28 + len(jb) + len(b)) / 1e6, 1), 'MB')
