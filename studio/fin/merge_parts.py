#!/usr/bin/env python3
"""Teile aus fin/parts.npz in das VRM einfügen + Haare zum Dutt hochstecken (Kopf-Mesh-Haarvorhang an den Schädel legen).
  python3 fin/merge_parts.py IN.vrm OUT.vrm"""
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
def add_mat(name, tex=None, rough=0.7, emissive=None, ds=False):
    m = {'name': name, 'pbrMetallicRoughness': {'metallicFactor': 0.0, 'roughnessFactor': rough}, 'doubleSided': ds}
    if tex is not None: m['pbrMetallicRoughness']['baseColorTexture'] = {'index': tex}
    if emissive: m['emissiveFactor'] = emissive; m['extensions'] = {'KHR_materials_emissive_strength': {'emissiveStrength': 2.5}}
    j['materials'].append(m); return len(j['materials']) - 1
head_node = next(i for i, n in enumerate(j['nodes']) if n.get('name') == 'AvatarHead'); head_prim = j['meshes'][j['nodes'][head_node]['mesh']]['primitives'][0]
MAT = {'coat': add_mat('Alice_Coat_Fabric', add_tex(f'{D}/tex/coat.png', 'coat_fabric'), 0.78, ds=True),
       'belt': add_mat('Alice_Belt', add_tex(f'{D}/tex/belt.png', 'belt'), 0.45),
       'teal': add_mat('Alice_Teal_Glow', add_tex(f'{D}/tex/teal.png', 'teal'), 0.25, emissive=[0.2, 0.9, 0.95]),
       'cord': add_mat('Alice_Cord', add_tex(f'{D}/tex/cord.png', 'cord'), 0.5),
       'patch': add_mat('Alice_Patch_A', add_tex(f'{D}/tex/patch.png', 'patch_A'), 0.6),
       'head': head_prim['material']}
if 'KHR_materials_emissive_strength' not in j.setdefault('extensionsUsed', []): j['extensionsUsed'].append('KHR_materials_emissive_strength')

# ---------------------------------------------------------------- Teile einfügen
Z = np.load(f'{D}/parts.npz'); parts = sorted({k.split('__')[0] for k in Z.files})
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
    tot += len(I) // 3; print('add', pn, len(P), 'verts', len(I) // 3, 'tris')
print('total added tris', tot)

# ---------------------------------------------------------------- Haare hochstecken (Kopf-Mesh)
pa = head_prim['attributes']; PH = acc(pa['POSITION']); UVH = acc(pa['TEXCOORD_0'])
mat = j['materials'][head_prim['material']]; ti = mat['pbrMetallicRoughness']['baseColorTexture']['index']; im = j['images'][j['textures'][ti]['source']]
bv = j['bufferViews'][im['bufferView']]; tex = np.asarray(Image.open(io.BytesIO(bytes(b[bv.get('byteOffset', 0):bv.get('byteOffset', 0) + bv['byteLength']]))).convert('HSV')).astype(float)
Ht, Wt = tex.shape[:2]; px = np.clip((UVH[:, 0] % 1 * Wt).astype(int), 0, Wt - 1); py = np.clip((UVH[:, 1] % 1 * Ht).astype(int), 0, Ht - 1)
sat = tex[py, px, 1] / 255; val = tex[py, px, 2] / 255
x, y, z = PH[:, 0], PH[:, 1], PH[:, 2]               # glTF: y oben, z vorn
hair = (sat > 0.45) & (val < 0.75) & ((np.abs(x) > 0.055) | (z < 0.01))
cy, cz = 1.635, -0.006; RX, RY, RZ = 0.081, 0.106, 0.100
th = np.arctan2(x, z - cz)                             # 0 = vorn
lim = math.radians(105); thc = np.where(np.abs(th) < lim, np.sign(th + 1e-9) * lim, th)
s = np.sqrt(np.clip(1 - ((np.maximum(y, 1.56) - cy) / RY) ** 2, 0.25, 1))
tx = np.sin(thc) * RX * s; tz = cz + np.cos(thc) * RZ * s
# Nacken unterhalb 1.56: Zylinder
neck = y < 1.56; ncz = 0.010
tx = np.where(neck, np.sin(thc) * 0.054, tx); tz = np.where(neck, ncz + np.cos(thc) * 0.052, tz)
k = 1.004 + 0.004 * (~neck)
w = np.clip((1.655 - y) / 0.05, 0, 1); w = w * w * (3 - 2 * w)              # weicher Übergang zum unveränderten Oberkopf
move = hair & (w > 0)
NX = x + (tx * k - x) * w; NZ = z + ((tz - cz) * k + cz - z) * w
PH2 = PH.copy(); PH2[move, 0] = NX[move]; PH2[move, 2] = NZ[move]; PH2[move & neck, 1] = np.maximum(y[move & neck], 1.47)
# Nacken-Haar bekommt Hautfarbe (UV einer Halshaut-Stelle), wird ohnehin von der Kapuze verdeckt
skin_idx = np.where((~hair) & (y < 1.5) & (z > 0.02))[0]
if len(skin_idx):
    sk = skin_idx[np.argmin(np.abs(y[skin_idx] - 1.48) + np.abs(x[skin_idx]))]; UVH2 = UVH.copy(); UVH2[move & neck & (y < 1.53)] = UVH[sk]
    pa['TEXCOORD_0'] = add_acc(UVH2.astype(np.float32), 5126, 'VEC2', 34962)
pa['POSITION'] = add_acc(PH2.astype(np.float32), 5126, 'VEC3', 34962, True)
print('hair verts moved', int(move.sum()), 'of', len(PH))
# Meta
v = j['extensions']['VRMC_vrm']; v['meta']['version'] = '1.2-alpha'
j['buffers'][0]['byteLength'] = len(b)
while len(b) % 4: b.append(0)
jb = json.dumps(j, separators=(',', ':')).encode()
while len(jb) % 4: jb += b' '
open(dst, 'wb').write(struct.pack('<III', 0x46546C67, 2, 28 + len(jb) + len(b)) + struct.pack('<II', len(jb), 0x4E4F534A) + jb + struct.pack('<II', len(b), 0x004E4942) + bytes(b))
print('OK', dst, round((28 + len(jb) + len(b)) / 1e6, 1), 'MB')
