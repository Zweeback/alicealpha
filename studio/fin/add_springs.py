#!/usr/bin/env python3
"""Spring-Bones für Alice: Kittelschöße (8 Ketten um die Hüfte) + Dutt, Collider an Beinen/Hüfte.
  python3 fin/add_springs.py IN.vrm OUT.vrm
Arbeitet direkt im glTF: neue Knoten, Skin-Joints + IBM, Umgewichtung, VRMC_springBone 1.0."""
import json, struct, sys, math, numpy as np
src, dst = sys.argv[1:3]
raw = open(src, 'rb').read(); off = 12; ch = []
while off < len(raw):
    l, t = struct.unpack('<II', raw[off:off + 8]); ch.append(raw[off + 8:off + 8 + l]); off += 8 + l
j = json.loads(ch[0]); b = bytearray(ch[1])
CT = {5121: 'u1', 5123: 'u2', 5125: 'u4', 5126: 'f4'}; NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}
def acc(ai):
    A = j['accessors'][ai]; n = NC[A['type']]; dt = np.dtype('<' + CT[A['componentType']]); out = np.zeros((A['count'], n), dt)
    if 'bufferView' in A:
        bv = j['bufferViews'][A['bufferView']]; o = bv.get('byteOffset', 0) + A.get('byteOffset', 0)
        out = np.frombuffer(bytes(b[o:o + A['count'] * n * dt.itemsize]), dt).reshape(-1, n).copy()
    if 'sparse' in A:
        s = A['sparse']; ib = j['bufferViews'][s['indices']['bufferView']]; vb = j['bufferViews'][s['values']['bufferView']]; it = np.dtype('<' + CT[s['indices']['componentType']])
        idx = np.frombuffer(bytes(b[ib.get('byteOffset', 0):ib.get('byteOffset', 0) + s['count'] * it.itemsize]), it)
        out[idx] = np.frombuffer(bytes(b[vb.get('byteOffset', 0):vb.get('byteOffset', 0) + s['count'] * n * dt.itemsize]), dt).reshape(-1, n)
    return out
def add_acc(arr, ct, typ, target=None):
    while len(b) % 4: b.append(0)
    j['bufferViews'].append({'buffer': 0, 'byteOffset': len(b), 'byteLength': arr.nbytes, **({'target': target} if target else {})}); b.extend(np.ascontiguousarray(arr).tobytes())
    j['accessors'].append({'bufferView': len(j['bufferViews']) - 1, 'componentType': ct, 'count': int(arr.shape[0]), 'type': typ}); return len(j['accessors']) - 1
par = {c: i for i, n in enumerate(j['nodes']) for c in n.get('children', [])}
def world(i):
    n = j['nodes'][i]; T = np.eye(4); T[:3, 3] = n.get('translation', [0, 0, 0]); x, y, z, w = n.get('rotation', [0, 0, 0, 1])
    R = np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)], [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)], [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
    M = np.eye(4); M[:3, :3] = R @ np.diag(n.get('scale', [1, 1, 1])); L = T @ M
    return world(par[i]) @ L if i in par else L
nid = {n.get('name'): i for i, n in enumerate(j['nodes'])}
hb = j['extensions']['VRMC_vrm']['humanoid']['humanBones']; HIPS = hb['hips']['node']; HEAD = hb['head']['node']
skin = j['skins'][0]; IBM = acc(skin['inverseBindMatrices']).reshape(-1, 16)
def add_joint(name, parent, wpos):
    Pw = world(parent); loc = np.linalg.inv(Pw) @ np.r_[wpos, 1]
    j['nodes'].append({'name': name, 'translation': [float(x) for x in loc[:3]]}); k = len(j['nodes']) - 1
    j['nodes'][parent].setdefault('children', []).append(k); par[k] = parent
    skin['joints'].append(k); W = world(k); global IBM
    IBM = np.vstack([IBM, np.linalg.inv(W).T.reshape(1, 16)]); return k, len(skin['joints']) - 1
# ---- Kittel-Ketten
coat_node = nid['Alice_coat']; cp = j['meshes'][j['nodes'][coat_node]['mesh']]['primitives'][0]; P = acc(cp['attributes']['POSITION'])
J0 = acc(cp['attributes']['JOINTS_0']).astype(np.int64); W0 = acc(cp['attributes']['WEIGHTS_0']).astype(np.float64)
low = P[:, 1] < 0.93; cz = float(np.median(P[low, 2])); cx = 0.0
NCH = 8; YS = [0.92, 0.78, 0.63, 0.47]; chains = []
for c in range(NCH):
    a = -math.pi + 2 * math.pi * (c + 0.5) / NCH            # Winkel um die Hüfte (atan2(x, z))
    m = low & (np.abs(((np.arctan2(P[:, 0] - cx, P[:, 2] - cz) - a + math.pi) % (2 * math.pi)) - math.pi) < math.pi / NCH)
    ch_ = []; parent = HIPS
    for k, yv in enumerate(YS):
        sel = m & (np.abs(P[:, 1] - yv) < 0.06)
        r = float(np.median(np.hypot(P[sel, 0] - cx, P[sel, 2] - cz))) * 0.85 if sel.any() else 0.15
        wpos = np.array([cx + r * math.sin(a), yv, cz + r * math.cos(a)])
        node, ji = add_joint(f'coat_tail_{c}_{k}', parent, wpos); ch_.append((node, ji, wpos)); parent = node
    chains.append((a, ch_))
# Umgewichten: unterhalb 0.92 zunehmend an die Kettenglieder (nach Winkel zwischen 2 Ketten interpoliert)
ang = np.arctan2(P[:, 0] - cx, P[:, 2] - cz)
for i in np.where(low)[0]:
    y = P[i, 1]; t = float(np.clip((0.93 - y) / 0.10, 0, 1)) * 0.95
    if t <= 0: continue
    f = (ang[i] + math.pi) / (2 * math.pi) * NCH - 0.5; c0 = int(math.floor(f)) % NCH; c1 = (c0 + 1) % NCH; fc = f - math.floor(f)
    seg = int(np.clip(np.searchsorted(-np.array(YS), -y) - 1, 0, len(YS) - 2))   # Segment, in dem y liegt
    w = {}
    for cc, wc in ((c0, 1 - fc), (c1, fc)):
        jn = chains[cc][1][seg][1]; w[jn] = w.get(jn, 0) + t * wc
    for k_, wk in zip(J0[i], W0[i]):
        if wk > 0: w[int(k_)] = w.get(int(k_), 0) + wk * (1 - t)
    top = sorted(w.items(), key=lambda kv: -kv[1])[:4]; s = sum(v for _, v in top)
    J0[i] = [k_ for k_, _ in top] + [0] * (4 - len(top)); W0[i] = [v / s for _, v in top] + [0] * (4 - len(top))
cp['attributes']['JOINTS_0'] = add_acc(J0.astype(np.uint16), 5123, 'VEC4', 34962); cp['attributes']['WEIGHTS_0'] = add_acc(W0.astype(np.float32), 5126, 'VEC4', 34962)
# ---- Dutt
bp = j['meshes'][j['nodes'][nid['Alice_bun']]['mesh']]['primitives'][0]; PB = acc(bp['attributes']['POSITION']); bc = PB.mean(0)
b0, bj0 = add_joint('bun_0', HEAD, bc - np.array([0, 0.03, 0])); b1, bj1 = add_joint('bun_1', b0, bc + np.array([0, 0.035, -0.01]))
for nm in ('Alice_bun', 'Alice_hairtie'):
    pr = j['meshes'][j['nodes'][nid[nm]]['mesh']]['primitives'][0]; n = j['accessors'][pr['attributes']['POSITION']]['count']
    Jb = np.zeros((n, 4), np.uint16); Jb[:, 0] = bj0; Wb = np.zeros((n, 4), np.float32); Wb[:, 0] = 1
    pr['attributes']['JOINTS_0'] = add_acc(Jb, 5123, 'VEC4', 34962); pr['attributes']['WEIGHTS_0'] = add_acc(Wb, 5126, 'VEC4', 34962)
# IBM neu schreiben
skin['inverseBindMatrices'] = add_acc(IBM.astype(np.float32), 5126, 'MAT4')
# ---- Collider + Springs
cols = []
def col(node, r, off=(0, 0, 0)): cols.append({'node': node, 'shape': {'sphere': {'offset': list(off), 'radius': r}}})
col(HIPS, 0.15, (0, -0.02, 0))
for side in ('left', 'right'):
    up = hb[side + 'UpperLeg']['node']; lo = hb[side + 'LowerLeg']['node']
    for o_ in (0.0, -0.13, -0.26): col(up, 0.085, (0, o_, 0))
    for o_ in (0.0, -0.15): col(lo, 0.065, (0, o_, 0))
col(HEAD, 0.10, (0, 0.06, 0))
springs = []
for a, ch_ in chains:
    springs.append({'name': f'coat_{round(math.degrees(a))}', 'colliderGroups': [0],
                    'joints': [{'node': n_, 'hitRadius': 0.03, 'stiffness': 1.4 if k == 0 else 0.9, 'gravityPower': 0.25, 'gravityDir': [0, -1, 0], 'dragForce': 0.55} for k, (n_, _, _) in enumerate(ch_)]})
springs.append({'name': 'bun', 'colliderGroups': [1], 'joints': [{'node': b0, 'hitRadius': 0.03, 'stiffness': 2.5, 'gravityPower': 0.05, 'gravityDir': [0, -1, 0], 'dragForce': 0.6}, {'node': b1, 'hitRadius': 0.02, 'stiffness': 2.5, 'gravityPower': 0.05, 'gravityDir': [0, -1, 0], 'dragForce': 0.6}]})
j['extensions']['VRMC_springBone'] = {'specVersion': '1.0', 'colliders': cols, 'colliderGroups': [{'name': 'legs', 'colliders': list(range(len(cols) - 1))}, {'name': 'head', 'colliders': [len(cols) - 1]}], 'springs': springs}
if 'VRMC_springBone' not in j['extensionsUsed']: j['extensionsUsed'].append('VRMC_springBone')
j['extensions']['VRMC_vrm']['meta']['version'] = '1.3-alpha'
j['buffers'][0]['byteLength'] = len(b)
while len(b) % 4: b.append(0)
jb = json.dumps(j, separators=(',', ':')).encode()
while len(jb) % 4: jb += b' '
open(dst, 'wb').write(struct.pack('<III', 0x46546C67, 2, 28 + len(jb) + len(b)) + struct.pack('<II', len(jb), 0x4E4F534A) + jb + struct.pack('<II', len(b), 0x004E4942) + bytes(b))
print('OK', dst, 'chains', len(chains), 'joints', len(skin['joints']))
