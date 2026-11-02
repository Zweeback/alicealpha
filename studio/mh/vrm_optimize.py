#!/usr/bin/env python3
"""Verkleinert ein VRM/GLB ohne sichtbaren Verlust:
  * Morph-Targets -> sparse accessors (nur bewegte Vertices), Morph-NORMALs entfallen
  * opake Texturen -> JPEG (q), Größen-Cap pro Textur; Texturen mit Alpha bleiben PNG
  * nicht mehr referenzierte Daten werden entfernt, Buffer neu gepackt
usage: python3 mh/vrm_optimize.py IN.vrm OUT.vrm [--tex-max 2048] [--small-max 512] [--jpeg-q 90]
"""
import argparse, io, json, struct
import numpy as np
from PIL import Image

ap = argparse.ArgumentParser(); ap.add_argument('src'); ap.add_argument('dst')
ap.add_argument('--tex-max', type=int, default=2048); ap.add_argument('--small-max', type=int, default=512)
ap.add_argument('--small', default='teeth,tongue,eye,lash,brow', help='Namensteile, die auf --small-max begrenzt werden')
ap.add_argument('--jpeg-q', type=int, default=90); ap.add_argument('--eps', type=float, default=1e-6)
a = ap.parse_args()

raw = open(a.src, 'rb').read()
assert raw[:4] == b'glTF'
off = 12; j = None; bin_ = b''
while off < len(raw):
    l, t = struct.unpack('<II', raw[off:off + 8]); d = raw[off + 8:off + 8 + l]; off += 8 + l
    if t == 0x4E4F534A: j = json.loads(d)
    elif t == 0x004E4942: bin_ = d
bvs, accs = j['bufferViews'], j['accessors']
CT = {5120: 'b', 5121: 'B', 5122: 'h', 5123: 'H', 5125: 'I', 5126: 'f'}; NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}


def read_acc(ai):
    A = accs[ai]; bv = bvs[A['bufferView']]; n = NC[A['type']]; dt = np.dtype(CT[A['componentType']]).newbyteorder('<')
    base = bv.get('byteOffset', 0) + A.get('byteOffset', 0); stride = bv.get('byteStride', 0) or n * dt.itemsize
    if stride == n * dt.itemsize:
        return np.frombuffer(bin_, dt, A['count'] * n, base).reshape(A['count'], n).astype(np.float32)
    return np.stack([np.frombuffer(bin_, dt, n, base + i * stride) for i in range(A['count'])]).astype(np.float32)


new_chunks = []  # (bytes, target) – wir erzeugen neue bufferViews am Ende, alte werden später verworfen


def add_bv(data, target=None):
    new_chunks.append((bytes(data), target)); return -len(new_chunks)  # negativer Platzhalter, später ersetzt


# ---- Morph targets -> sparse
saved = 0
for m in j['meshes']:
    for p in m['primitives']:
        for t in p.get('targets', []):
            t.pop('TANGENT', None)
            for att, eps in (('POSITION', a.eps), ('NORMAL', 2e-3)):   # Morph-Normalen behalten (sonst falsche Schattierung, z. B. geschlossene Lider)
                if att not in t: continue
                ai = t[att]; A = accs[ai]
                if 'sparse' in A or 'bufferView' not in A: continue
                d = read_acc(ai); keep = np.abs(d).max(axis=1) > eps; nz = np.where(keep)[0]; d[~keep] = 0
                n = len(d); ict = 5123 if n < 65536 else 5125
                idx = nz.astype(np.uint16 if ict == 5123 else np.uint32); val = d[nz].astype('<f4')
                saved += A['count'] * 12 - (len(nz) * (idx.itemsize + 12))
                A.pop('bufferView', None); A.pop('byteOffset', None)
                if att == 'POSITION': A['min'] = d.min(axis=0).tolist(); A['max'] = d.max(axis=0).tolist()
                else: A.pop('min', None); A.pop('max', None)
                if len(nz) == 0: continue
                A['sparse'] = {'count': int(len(nz)), 'indices': {'bufferView': add_bv(idx.tobytes()), 'componentType': ict}, 'values': {'bufferView': add_bv(val.tobytes())}}
print('morph: gespart ~%.1f MB' % (saved / 1e6))

# ---- Texturen
small = [s for s in a.small.split(',') if s]
for ii, im in enumerate(j.get('images', [])):
    bv = bvs[im['bufferView']]; data = bin_[bv.get('byteOffset', 0):bv.get('byteOffset', 0) + bv['byteLength']]
    img = Image.open(io.BytesIO(data)); name = (im.get('name') or '').lower(); cap = a.small_max if any(s in name for s in small) else a.tex_max
    has_alpha = img.mode in ('RGBA', 'LA', 'PA') and np.asarray(img.convert('RGBA'))[..., 3].min() < 250
    if max(img.size) > cap:
        s = cap / max(img.size); img = img.resize((max(1, int(img.width * s)), max(1, int(img.height * s))), Image.LANCZOS)
    buf = io.BytesIO()
    if has_alpha: img.convert('RGBA').save(buf, 'PNG', optimize=True); mime = 'image/png'
    else: img.convert('RGB').save(buf, 'JPEG', quality=a.jpeg_q, optimize=True, subsampling=0); mime = 'image/jpeg'
    if len(buf.getvalue()) < len(data) or img.size != Image.open(io.BytesIO(data)).size:
        im['bufferView'] = add_bv(buf.getvalue()); im['mimeType'] = mime
    print('tex', im.get('name'), img.size, im['mimeType'], len(data), '->', len(buf.getvalue()))

# ---- Vertex-Farben entfernen (Materialien nutzen sie nicht; three.js würde sonst damit einfärben)
for m in j['meshes']:
    for p in m['primitives']:
        for k in [k for k in p['attributes'] if k.startswith('COLOR_')]: del p['attributes'][k]
# ---- ungenutzte Accessors entfernen (z. B. gestrichene Morph-NORMALs)
ref = set()
for m in j['meshes']:
    for p in m['primitives']:
        ref.update(p['attributes'].values())
        if 'indices' in p: ref.add(p['indices'])
        for t in p.get('targets', []): ref.update(t.values())
for sk in j.get('skins', []):
    if 'inverseBindMatrices' in sk: ref.add(sk['inverseBindMatrices'])
for an in j.get('animations', []):
    for sm in an['samplers']: ref.update((sm['input'], sm['output']))
keep = sorted(ref); amap = {o: n for n, o in enumerate(keep)}
for m in j['meshes']:
    for p in m['primitives']:
        p['attributes'] = {k: amap[v] for k, v in p['attributes'].items()}
        if 'indices' in p: p['indices'] = amap[p['indices']]
        p['targets'] = [{k: amap[v] for k, v in t.items()} for t in p.get('targets', [])] if 'targets' in p else None
        if p['targets'] is None: del p['targets']
for sk in j.get('skins', []):
    if 'inverseBindMatrices' in sk: sk['inverseBindMatrices'] = amap[sk['inverseBindMatrices']]
for an in j.get('animations', []):
    for sm in an['samplers']: sm['input'] = amap[sm['input']]; sm['output'] = amap[sm['output']]
accs = [accs[i] for i in keep]; j['accessors'] = accs

# ---- neu packen: nur referenzierte bufferViews behalten
used = set()
for A in accs:
    if 'bufferView' in A: used.add(A['bufferView'])
    if 'sparse' in A: used.add(A['sparse']['indices']['bufferView']); used.add(A['sparse']['values']['bufferView'])
for im in j.get('images', []): used.add(im['bufferView'])
for b in j.get('bufferViews', []): pass
out = bytearray(); newbvs = []; remap = {}
def emit(data, tgt=None, stride=None):
    while len(out) % 4: out.append(0)
    o = len(out); out.extend(data); e = {'buffer': 0, 'byteOffset': o, 'byteLength': len(data)}
    if tgt: e['target'] = tgt
    if stride: e['byteStride'] = stride
    newbvs.append(e); return len(newbvs) - 1
for i in sorted(x for x in used if x >= 0):
    b = bvs[i]; remap[i] = emit(bin_[b.get('byteOffset', 0):b.get('byteOffset', 0) + b['byteLength']], b.get('target'), b.get('byteStride'))
for k, (data, tgt) in enumerate(new_chunks): remap[-(k + 1)] = emit(data, tgt)
for A in accs:
    if 'bufferView' in A: A['bufferView'] = remap[A['bufferView']]
    if 'sparse' in A:
        for k in ('indices', 'values'): A['sparse'][k]['bufferView'] = remap[A['sparse'][k]['bufferView']]
for im in j.get('images', []): im['bufferView'] = remap[im['bufferView']]
j['bufferViews'] = newbvs; j['buffers'] = [{'byteLength': len(out)}]
while len(out) % 4: out.append(0)
jb = json.dumps(j, separators=(',', ':')).encode()
while len(jb) % 4: jb += b' '
blob = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(jb) + 8 + len(out)) + struct.pack('<II', len(jb), 0x4E4F534A) + jb + struct.pack('<II', len(out), 0x004E4942) + bytes(out)
open(a.dst, 'wb').write(blob)
print('OK %s: %.1f MB -> %.1f MB' % (a.dst, len(raw) / 1e6, len(blob) / 1e6))
