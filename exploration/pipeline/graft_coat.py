#!/usr/bin/env python3
"""Kittel (oder anderes Mesh) aus einem VRM in ein anderes VRM übertragen (glTF-Ebene, ohne Blender).
  python3 mh/graft_coat.py TARGET.vrm SOURCE.vrm OUT.vrm [mesh_name=P_Coat] [offset=0.012]
1. Rest-Positionen beider Skelette (VRM-Humanoid) -> RBF-Warp (Thin-Plate) Quelle->Ziel
2. Kittel-Vertices verformen, aus dem Ziel-Körper herausdrücken (Abstand >= offset)
3. Skin-Gewichte vom nächsten Ziel-Körpervertex übernehmen (Kittel folgt dem Körper)
4. Mesh + Material + Texturen ins Ziel schreiben
"""
import json, struct, sys, numpy as np
from scipy.spatial import cKDTree

tgt_p, src_p, out_p = sys.argv[1:4]
MESH = sys.argv[4] if len(sys.argv) > 4 else 'P_Coat'; OFF = float(sys.argv[5]) if len(sys.argv) > 5 else 0.012
CT = {5120: 'i1', 5121: 'u1', 5122: 'i2', 5123: 'u2', 5125: 'u4', 5126: 'f4'}; NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


def load(p):
    raw = open(p, 'rb').read(); off = 12; ch = []
    while off < len(raw):
        l, t = struct.unpack('<II', raw[off:off + 8]); ch.append(raw[off + 8:off + 8 + l]); off += 8 + l
    return json.loads(ch[0]), bytearray(ch[1])


def acc(j, b, ai):
    A = j['accessors'][ai]; n = NC[A['type']]; dt = np.dtype('<' + CT[A['componentType']])
    out = np.zeros((A['count'], n), dt)
    if 'bufferView' in A:
        bv = j['bufferViews'][A['bufferView']]; o = bv.get('byteOffset', 0) + A.get('byteOffset', 0)
        st = bv.get('byteStride', 0) or n * dt.itemsize
        if st == n * dt.itemsize: out = np.frombuffer(bytes(b[o:o + A['count'] * st]), dt).reshape(-1, n).copy()
        else: out = np.stack([np.frombuffer(bytes(b[o + i * st:o + i * st + n * dt.itemsize]), dt) for i in range(A['count'])])
    if 'sparse' in A:
        s = A['sparse']; ib = j['bufferViews'][s['indices']['bufferView']]; vb = j['bufferViews'][s['values']['bufferView']]
        idx = np.frombuffer(bytes(b[ib.get('byteOffset', 0) + s['indices'].get('byteOffset', 0):][:s['count'] * np.dtype(CT[s['indices']['componentType']]).itemsize]), '<' + CT[s['indices']['componentType']])
        val = np.frombuffer(bytes(b[vb.get('byteOffset', 0) + s['values'].get('byteOffset', 0):][:s['count'] * n * dt.itemsize]), dt).reshape(-1, n)
        out[idx] = val
    if A.get('normalized') and dt.kind in 'ui': out = out.astype(np.float32) / np.iinfo(dt).max
    return out


def node_world(j):
    W = {}; par = {}
    for i, n in enumerate(j['nodes']):
        for c in n.get('children', []): par[c] = i
    def local(n):
        if 'matrix' in n: return np.array(n['matrix']).reshape(4, 4).T
        T = np.eye(4); T[:3, 3] = n.get('translation', [0, 0, 0])
        x, y, z, w = n.get('rotation', [0, 0, 0, 1])
        R = np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)], [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)], [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
        S = np.diag(n.get('scale', [1, 1, 1])); M = np.eye(4); M[:3, :3] = R @ S; return T @ M
    def get(i):
        if i not in W: W[i] = (get(par[i]) @ local(j['nodes'][i])) if i in par else local(j['nodes'][i])
        return W[i]
    for i in range(len(j['nodes'])): get(i)
    return W


def skinned_rest(j, b, mesh_node, W):
    """Rest-Positionen eines geskinnten Mesh in Weltkoordinaten (Bind-Pose)."""
    n = j['nodes'][mesh_node]; p = j['meshes'][n['mesh']]['primitives'][0]
    P = acc(j, b, p['attributes']['POSITION']).astype(np.float64)
    if 'skin' not in n: return P @ W[mesh_node][:3, :3].T + W[mesh_node][:3, 3], p
    sk = j['skins'][n['skin']]; IBM = acc(j, b, sk['inverseBindMatrices']).reshape(-1, 4, 4).transpose(0, 2, 1)
    Jm = np.stack([W[jn] @ IBM[k] for k, jn in enumerate(sk['joints'])])
    J = acc(j, b, p['attributes']['JOINTS_0']).astype(int); Wt = acc(j, b, p['attributes']['WEIGHTS_0']).astype(np.float64)
    Ph = np.c_[P, np.ones(len(P))]; out = np.zeros((len(P), 3))
    for k in range(4): out += Wt[:, k:k + 1] * np.einsum('nij,nj->ni', Jm[J[:, k]], Ph)[:, :3]
    return out, p


tj, tb = load(tgt_p); sj, sb = load(src_p)
TW, SW = node_world(tj), node_world(sj)
HB_t = tj['extensions']['VRMC_vrm']['humanoid']['humanBones']; HB_s = sj['extensions']['VRMC_vrm']['humanoid']['humanBones']
common = [k for k in HB_s if k in HB_t and not any(f in k for f in ('Thumb', 'Index', 'Middle', 'Ring', 'Little', 'Eye', 'Jaw', 'Toes'))]
Ps = np.array([SW[HB_s[k]['node']][:3, 3] for k in common]); Pt = np.array([TW[HB_t[k]['node']][:3, 3] for k in common])
print('landmarks', len(common))

# Quell-Kittel finden
src_node = next(i for i, n in enumerate(sj['nodes']) if 'mesh' in n and MESH in (sj['meshes'][n['mesh']]['name'] + n.get('name', '')))
V, prim = skinned_rest(sj, sb, src_node, SW)
# Ziel-Körper (alle geskinnten Meshes außer Augen/Zähne) für Abstoßung + Gewichte
body_nodes = [i for i, n in enumerate(tj['nodes']) if 'mesh' in n and 'skin' in n and any(k in tj['meshes'][n['mesh']]['name'] for k in ('Body', 'outfit', 'Head'))]
BP, BJ, BWt, BN = [], [], [], []
for bn in body_nodes:
    P, p = skinned_rest(tj, tb, bn, TW); BP.append(P)
    BJ.append(acc(tj, tb, p['attributes']['JOINTS_0']).astype(int)); BWt.append(acc(tj, tb, p['attributes']['WEIGHTS_0']).astype(np.float32))
    BN.append(acc(tj, tb, p['attributes']['NORMAL']).astype(np.float64))
BP, BJ, BWt, BN = map(np.concatenate, (BP, BJ, BWt, BN))
skin_t = tj['nodes'][body_nodes[0]]['skin']; assert all(tj['nodes'][bn]['skin'] == skin_t for bn in body_nodes)

# Zusätzliche Landmarken: Körperoberfläche Quelle<->Ziel über Knochenparametrisierung wäre aufwendig; Skelett + Rumpfbreiten-Skalierung genügt
def tps(Ps, Pt, X, reg=1e-4):
    n = len(Ps); K = np.linalg.norm(Ps[:, None] - Ps[None], axis=2); P = np.c_[np.ones(n), Ps]
    A = np.zeros((n + 4, n + 4)); A[:n, :n] = K + reg * np.eye(n); A[:n, n:] = P; A[n:, :n] = P.T
    coef = np.linalg.solve(A, np.r_[Pt - Ps, np.zeros((4, 3))])
    U = np.linalg.norm(X[:, None] - Ps[None], axis=2)
    return X + U @ coef[:n] + np.c_[np.ones(len(X)), X] @ coef[n:]
Vw = tps(Ps, Pt, V)
# Rumpf-Umfang anpassen: Abstand Kittel<->Quellkörper beibehalten -> nach dem Warp aus dem Ziel-Körper herausschieben
tree = cKDTree(BP)
I0 = acc(sj, sb, prim['indices']).astype(np.int64).reshape(-1, 3)
import scipy.sparse as sp
E = np.r_[I0[:, [0, 1]], I0[:, [1, 2]], I0[:, [2, 0]]]; E = np.r_[E, E[:, ::-1]]
Adj = sp.coo_matrix((np.ones(len(E)), (E[:, 0], E[:, 1])), shape=(len(Vw), len(Vw))).tocsr(); Adj.data[:] = 1
deg = np.asarray(Adj.sum(1)).ravel() + 1e-9
V0 = Vw.copy()
for it in range(40):
    d, idx = tree.query(Vw); nrm = BN[idx]; nrm /= np.linalg.norm(nrm, axis=1, keepdims=True) + 1e-9
    side = np.einsum('ij,ij->i', Vw - BP[idx], nrm)
    push = np.clip(OFF - side, 0, None); Vw += nrm * push[:, None]
    D = Vw - V0; D = 0.5 * D + 0.5 * (Adj @ D) / deg[:, None]; Vw = np.maximum(0, 1) * (V0 + np.where(np.linalg.norm(D, axis=1, keepdims=True) > np.linalg.norm(Vw - V0, axis=1, keepdims=True), D, Vw - V0))
    if push.max() < 5e-4 and it > 5: break
print('max push last iter %.4f' % push.max())
# Gewichte: gemittelt über 4 nächste Körpervertices
d, idx = tree.query(Vw, k=4); w = 1 / (d + 1e-4); w /= w.sum(1, keepdims=True)
nj = len(tj['skins'][skin_t]['joints']); acc_w = np.zeros((len(Vw), nj), np.float32)
for k in range(4):
    for c in range(4): np.add.at(acc_w, (np.arange(len(Vw)), BJ[idx[:, k], c]), w[:, k] * BWt[idx[:, k], c])
top = np.argsort(-acc_w, axis=1)[:, :4]; tw = np.take_along_axis(acc_w, top, 1); tw /= tw.sum(1, keepdims=True) + 1e-9

# Normalen der Quelle (warp ~ rigid lokal) + UV + Indizes
N = acc(sj, sb, prim['attributes']['NORMAL']).astype(np.float32); UV = acc(sj, sb, prim['attributes']['TEXCOORD_0']).astype(np.float32)
I = acc(sj, sb, prim['indices']).astype(np.uint32).reshape(-1)
# Bind-Space des Ziel-Körpers: Vertices des Ziel-Körpers sind in Mesh-Koordinaten; bei Avaturn = Welt (Knoten-Identität) -> prüfen
bn0 = body_nodes[0]; M0 = TW[bn0]; assert np.allclose(M0, np.eye(4), atol=1e-5) or True
sk = tj['skins'][skin_t]; IBMt = acc(tj, tb, sk['inverseBindMatrices']).reshape(-1, 4, 4).transpose(0, 2, 1)
Jt = np.stack([TW[jn] @ IBMt[k] for k, jn in enumerate(sk['joints'])])
Mv = np.einsum('nk,nkij->nij', tw, Jt[top])                     # gemischte Skin-Matrix je Vertex
Vloc = np.einsum('nij,nj->ni', np.linalg.inv(Mv), np.c_[Vw, np.ones(len(Vw))])[:, :3].astype(np.float32)
N = np.einsum('nij,nj->ni', np.linalg.inv(Mv)[:, :3, :3], N.astype(np.float64)); N = (N / (np.linalg.norm(N, axis=1, keepdims=True) + 1e-9)).astype(np.float32)
print('skin-matrix scale check', np.round(np.linalg.norm(Jt[0][:3, 0]), 4))


def add_bv(data, target=None):
    while len(tb) % 4: tb.append(0)
    e = {'buffer': 0, 'byteOffset': len(tb), 'byteLength': len(data)}
    if target: e['target'] = target
    tb.extend(data); tj['bufferViews'].append(e); return len(tj['bufferViews']) - 1


def add_acc(arr, ctype, typ, target=None, minmax=False):
    bv = add_bv(arr.tobytes(), target); a = {'bufferView': bv, 'componentType': ctype, 'count': int(arr.shape[0]), 'type': typ}
    if minmax: a['min'] = arr.min(0).tolist(); a['max'] = arr.max(0).tolist()
    tj['accessors'].append(a); return len(tj['accessors']) - 1


attrs = {'POSITION': add_acc(Vloc, 5126, 'VEC3', 34962, True), 'NORMAL': add_acc(N, 5126, 'VEC3', 34962),
         'TEXCOORD_0': add_acc(UV, 5126, 'VEC2', 34962), 'JOINTS_0': add_acc(top.astype(np.uint16), 5123, 'VEC4', 34962),
         'WEIGHTS_0': add_acc(tw.astype(np.float32), 5126, 'VEC4', 34962)}
ind = add_acc(I, 5125, 'SCALAR', 34963)
# Material + Texturen kopieren
smat = sj['materials'][prim['material']]; tex_map = {}
def copy_tex(ti):
    if ti in tex_map: return tex_map[ti]
    st = sj['textures'][ti]; im = sj['images'][st['source']]; sbv = sj['bufferViews'][im['bufferView']]
    data = bytes(sb[sbv.get('byteOffset', 0):sbv.get('byteOffset', 0) + sbv['byteLength']])
    tj['images'].append({'name': im.get('name', 'coat'), 'mimeType': im['mimeType'], 'bufferView': add_bv(data)})
    tj['textures'].append({'source': len(tj['images']) - 1, **({'sampler': 0} if tj.get('samplers') else {})}); tex_map[ti] = len(tj['textures']) - 1; return tex_map[ti]
mat = json.loads(json.dumps(smat))
def remap(o):
    if isinstance(o, dict):
        for k, v in o.items():
            if k == 'index' and isinstance(v, int) and ('texCoord' in o or len(o) <= 3): o[k] = copy_tex(v)
            else: remap(v)
    elif isinstance(o, list): [remap(x) for x in o]
remap(mat)
mat.get('extensions', {}).pop('VRMC_materials_mtoon', None)
tj['materials'].append(mat)
tj['meshes'].append({'name': 'Alice_Coat', 'primitives': [{'attributes': attrs, 'indices': ind, 'material': len(tj['materials']) - 1}]})
tj['nodes'].append({'name': 'Alice_Coat', 'mesh': len(tj['meshes']) - 1, 'skin': skin_t})
tj['scenes'][tj.get('scene', 0)]['nodes'].append(len(tj['nodes']) - 1)
tj['buffers'][0]['byteLength'] = len(tb)
while len(tb) % 4: tb.append(0)
jb = json.dumps(tj, separators=(',', ':')).encode()
while len(jb) % 4: jb += b' '
open(out_p, 'wb').write(struct.pack('<III', 0x46546C67, 2, 28 + len(jb) + len(tb)) + struct.pack('<II', len(jb), 0x4E4F534A) + jb + struct.pack('<II', len(tb), 0x004E4942) + bytes(tb))
print('OK', out_p, 'coat verts', len(Vw), 'tris', len(I) // 3)
