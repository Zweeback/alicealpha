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
coat_node = nid['Alice_jacket']; cp = j['meshes'][j['nodes'][coat_node]['mesh']]['primitives'][0]; P = acc(cp['attributes']['POSITION'])
J0 = acc(cp['attributes']['JOINTS_0']).astype(np.int64); W0 = acc(cp['attributes']['WEIGHTS_0']).astype(np.float64)
low = P[:, 1] < 0.93; cz = float(np.median(P[low, 2])); cx = 0.0
NCH = 8; YS = [0.92, 0.84, 0.76, 0.70]; chains = []
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
def reweight(cp, P, J0, W0, low):
    ang = np.arctan2(P[:, 0] - cx, P[:, 2] - cz)
    for i in np.where(low)[0]:
        y = P[i, 1]; t = float(np.clip((0.93 - y) / 0.10, 0, 1)) * 0.95
        if t <= 0: continue
        f = (ang[i] + math.pi) / (2 * math.pi) * NCH - 0.5; c0 = int(math.floor(f)) % NCH; c1 = (c0 + 1) % NCH; fc = f - math.floor(f)
        seg = int(np.clip(np.searchsorted(-np.array(YS), -min(y, YS[0])) - 1, 0, len(YS) - 2))
        w = {}
        for cc, wc in ((c0, 1 - fc), (c1, fc)):
            jn = chains[cc][1][seg][1]; w[jn] = w.get(jn, 0) + t * wc
        for k_, wk in zip(J0[i], W0[i]):
            if wk > 0: w[int(k_)] = w.get(int(k_), 0) + wk * (1 - t)
        top = sorted(w.items(), key=lambda kv: -kv[1])[:4]; s_ = sum(v for _, v in top)
        J0[i] = [k_ for k_, _ in top] + [0] * (4 - len(top)); W0[i] = [v / s_ for _, v in top] + [0] * (4 - len(top))
    cp['attributes']['JOINTS_0'] = add_acc(J0.astype(np.uint16), 5123, 'VEC4', 34962); cp['attributes']['WEIGHTS_0'] = add_acc(W0.astype(np.float32), 5126, 'VEC4', 34962)
reweight(cp, P, J0, W0, low)
# hängende Gurte/Bänder/Schnallen/Laschen an der Jacke mitschwingen lassen (unterhalb Taille)
nh = 0
for nm, ni in list(nid.items()):
    if not nm or not any(nm.startswith('Alice_' + k) for k in ('strap', 'ribbon', 'tip', 'buckle', 'xtab')): continue
    pr = j['meshes'][j['nodes'][ni]['mesh']]['primitives'][0]; Pp = acc(pr['attributes']['POSITION'])
    lw = Pp[:, 1] < 0.93
    if not lw.any(): continue
    reweight(pr, Pp, acc(pr['attributes']['JOINTS_0']).astype(np.int64), acc(pr['attributes']['WEIGHTS_0']).astype(np.float64), lw); nh += 1
print('hanging parts reweighted', nh)
# ---- Haar-Ketten (Bob): 8 Ketten um den Kopf, unterhalb 1.60 umgewichtet
coat_chains, coat_YS, coat_cx, coat_cz = chains, YS, cx, cz
if 'Alice_haircards' in nid:
    hp_ = j['meshes'][j['nodes'][nid['Alice_haircards']]['mesh']]['primitives'][0]; PHc = acc(hp_['attributes']['POSITION'])
    cx, cz = 0.0, -0.004; YS = [1.62, 1.555, 1.49]; chains = []
    for c in range(NCH):
        a = -math.pi + 2 * math.pi * (c + 0.5) / NCH; parent = HEAD; ch_ = []
        for k, yv in enumerate(YS):
            m_ = (np.abs(PHc[:, 1] - yv) < 0.02) & (np.abs(((np.arctan2(PHc[:, 0] - cx, PHc[:, 2] - cz) - a + math.pi) % (2 * math.pi)) - math.pi) < math.pi / NCH)
            r = float(np.median(np.hypot(PHc[m_, 0] - cx, PHc[m_, 2] - cz))) * 0.9 if m_.any() else 0.09
            node, ji = add_joint(f'hair_{c}_{k}', parent, np.array([cx + r * math.sin(a), yv, cz + r * math.cos(a)])); ch_.append((node, ji, None)); parent = node
        chains.append((a, ch_))
    hair_chains = chains
    def hw(nm):
        pr = j['meshes'][j['nodes'][nid[nm]]['mesh']]['primitives'][0]; Pp = acc(pr['attributes']['POSITION'])
        J_ = acc(pr['attributes']['JOINTS_0']).astype(np.int64); W_ = acc(pr['attributes']['WEIGHTS_0']).astype(np.float64)
        low_ = Pp[:, 1] < 1.62; ang = np.arctan2(Pp[:, 0] - cx, Pp[:, 2] - cz)
        for i in np.where(low_)[0]:
            y = Pp[i, 1]; t = float(np.clip((1.62 - y) / 0.06, 0, 1)) * 0.9
            f = (ang[i] + math.pi) / (2 * math.pi) * NCH - 0.5; c0 = int(math.floor(f)) % NCH; c1 = (c0 + 1) % NCH; fc = f - math.floor(f)
            seg = 0 if y > YS[1] else 1; w = {}
            for cc, wc in ((c0, 1 - fc), (c1, fc)):
                jn = chains[cc][1][seg][1]; w[jn] = w.get(jn, 0) + t * wc
            for k_, wk in zip(J_[i], W_[i]):
                if wk > 0: w[int(k_)] = w.get(int(k_), 0) + wk * (1 - t)
            top = sorted(w.items(), key=lambda kv: -kv[1])[:4]; s_ = sum(v for _, v in top)
            J_[i] = [k_ for k_, _ in top] + [0] * (4 - len(top)); W_[i] = [v / s_ for _, v in top] + [0] * (4 - len(top))
        pr['attributes']['JOINTS_0'] = add_acc(J_.astype(np.uint16), 5123, 'VEC4', 34962); pr['attributes']['WEIGHTS_0'] = add_acc(W_.astype(np.float32), 5126, 'VEC4', 34962)
    for nm in ('Alice_haircards', 'Alice_hairbase'):
        if nm in nid: hw(nm)
    print('hair chains', len(hair_chains))
else: hair_chains = []
chains = coat_chains
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
col(hb['neck']['node'], 0.055, (0, 0.03, 0)); col(hb['upperChest']['node'] if 'upperChest' in hb else hb['chest']['node'], 0.12, (0, 0.06, -0.02))
springs = []
for a, ch_ in chains:
    springs.append({'name': f'coat_{round(math.degrees(a))}', 'colliderGroups': [0],
                    'joints': [{'node': n_, 'hitRadius': 0.03, 'stiffness': 1.4 if k == 0 else 0.9, 'gravityPower': 0.25, 'gravityDir': [0, -1, 0], 'dragForce': 0.55} for k, (n_, _, _) in enumerate(ch_)]})
pass  # kein Dutt
if False: springs.append({'name': 'bun', 'colliderGroups': [1], 'joints': [{'node': b0, 'hitRadius': 0.03, 'stiffness': 2.5, 'gravityPower': 0.05, 'gravityDir': [0, -1, 0], 'dragForce': 0.6}, {'node': b1, 'hitRadius': 0.02, 'stiffness': 2.5, 'gravityPower': 0.05, 'gravityDir': [0, -1, 0], 'dragForce': 0.6}]})
for a, ch_ in hair_chains:
    springs.append({'name': f'hair_{round(math.degrees(a))}', 'colliderGroups': [1],
                    'joints': [{'node': n_, 'hitRadius': 0.02, 'stiffness': 1.6 if k == 0 else 1.1, 'gravityPower': 0.15, 'gravityDir': [0, -1, 0], 'dragForce': 0.5} for k, (n_, _, _) in enumerate(ch_)]})
j['extensions']['VRMC_springBone'] = {'specVersion': '1.0', 'colliders': cols, 'colliderGroups': [{'name': 'legs', 'colliders': list(range(len(cols) - 3))}, {'name': 'headneck', 'colliders': [len(cols) - 3, len(cols) - 2, len(cols) - 1]}], 'springs': springs}
if 'VRMC_springBone' not in j['extensionsUsed']: j['extensionsUsed'].append('VRMC_springBone')
j['extensions']['VRMC_vrm']['meta']['version'] = '2.0-paralax'
j['buffers'][0]['byteLength'] = len(b)
while len(b) % 4: b.append(0)
jb = json.dumps(j, separators=(',', ':')).encode()
while len(jb) % 4: jb += b' '
open(dst, 'wb').write(struct.pack('<III', 0x46546C67, 2, 28 + len(jb) + len(b)) + struct.pack('<II', len(jb), 0x4E4F534A) + jb + struct.pack('<II', len(b), 0x004E4942) + bytes(b))
print('OK', dst, 'chains', len(chains), 'joints', len(skin['joints']))
