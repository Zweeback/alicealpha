#!/usr/bin/env python3
"""Textur-/Material-Veredelung direkt im VRM (vor vrm_optimize.py ausführen, das räumt alte Daten weg).
  python3 mh/vrm_retex.py IN.vrm OUT.vrm
- hair_strand: feinere Einzelhaare (hochfrequente Strähnen-Modulation), Kartenränder in Strähnen aufgelöst
- hair_cap:    weicher, ausgefranster Haaransatz (breiter Übergang statt harter Kante)
- Hair_*:      Roughness höher, Specular niedriger (kein bläulicher Umgebungs-Glanz)
"""
import io, json, struct, sys
import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter

src, dst = sys.argv[1], sys.argv[2]
raw = open(src, 'rb').read(); off = 12; chunks = []
while off < len(raw):
    l, t = struct.unpack('<II', raw[off:off + 8]); chunks.append((t, raw[off + 8:off + 8 + l])); off += 8 + l
j = json.loads(chunks[0][1]); bin_ = bytearray(chunks[1][1])
rng = np.random.default_rng(7)


def img_bytes(im):
    bv = j['bufferViews'][im['bufferView']]; o = bv.get('byteOffset', 0); return bytes(bin_[o:o + bv['byteLength']])


def put(im, pil):
    b = io.BytesIO(); pil.save(b, 'PNG', optimize=True); data = b.getvalue()
    while len(bin_) % 4: bin_.append(0)
    j['bufferViews'].append({'buffer': 0, 'byteOffset': len(bin_), 'byteLength': len(data)}); bin_.extend(data)
    im['bufferView'] = len(j['bufferViews']) - 1; im['mimeType'] = 'image/png'


def fine_strands(H, W, sig_v, sig_u):
    n = gaussian_filter(rng.standard_normal((H, W)), sigma=(sig_v, sig_u), mode='wrap'); return n / (n.std() + 1e-9)


def strand(a):
    a = a.astype(np.float32) / 255.; H, W = a.shape[:2]
    n1 = fine_strands(H, W, 40, 0.55); n2 = fine_strands(H, W, 90, 1.4)
    shade = np.clip(0.80 + 0.22 * n1 + 0.10 * n2, 0.45, 1.25)
    rgb = a[..., :3] * shade[..., None]
    # dezente Farbvariation Kupfer <-> Feuerrot entlang der Strähnen
    hue = fine_strands(H, W, 160, 6.0) * 0.05; rgb[..., 1] *= (1 + hue); rgb[..., 0] *= (1 - 0.3 * hue)
    # Kartenränder in Einzelsträhnen auflösen: Alpha mit feinem Rauschen erodieren, wo Alpha < 1 (Rand) stärker
    al = a[..., 3]; edge = np.clip(1.0 - al, 0, 1)
    al2 = np.clip(al * (0.92 + 0.30 * n1) - 0.35 * edge * np.clip(-n1, 0, None), 0, 1)
    # Spitzen ausdünnen (v=1 ganz unten = Spitze)
    v = np.linspace(0, 1, H)[:, None]; al2 *= np.clip(1.15 - 0.55 * np.clip((v - 0.7) / 0.3, 0, 1) * (1 - 0.6 * n1), 0, 1)
    out = np.dstack([np.clip(rgb, 0, 1), al2]); return Image.fromarray((out * 255).astype(np.uint8), 'RGBA')


def cap(a):
    a = a.astype(np.float32) / 255.; H, W = a.shape[:2]
    n = fine_strands(H, W, 14, 0.6)
    v = np.linspace(0, 1, H)[:, None]                     # unten (v→1) = Haaransatz
    ramp = np.clip((0.985 - v) / 0.17, 0, 1)              # breiter Übergang über ~17 %
    al = np.clip(ramp * 1.25 + 0.35 * n * (1 - ramp) * (ramp > 0), 0, 1) * a[..., 3]
    rgb = a[..., :3] * (0.85 + 0.15 * ramp[..., None])    # zum Ansatz hin leicht dunkler (Okklusion)
    return Image.fromarray((np.dstack([rgb, al]) * 255).astype(np.uint8), 'RGBA')


for im in j['images']:
    nm = (im.get('name') or '').lower()
    if nm == 'hair_strand': put(im, strand(np.asarray(Image.open(io.BytesIO(img_bytes(im))).convert('RGBA')))); print('retex', nm)
    elif nm == 'hair_cap': put(im, cap(np.asarray(Image.open(io.BytesIO(img_bytes(im))).convert('RGBA')))); print('retex', nm)
for m in j['materials']:
    if m['name'].startswith('Hair_'):
        m['pbrMetallicRoughness']['roughnessFactor'] = 0.66
        ext = m.setdefault('extensions', {}).get('KHR_materials_specular')
        if ext is not None: ext['specularFactor'] = 0.35
        if m['name'] == 'Hair_Cap': m['alphaCutoff'] = 0.5
        print('mat', m['name'])
j['buffers'][0]['byteLength'] = len(bin_)
while len(bin_) % 4: bin_.append(0)
jb = json.dumps(j, separators=(',', ':')).encode()
while len(jb) % 4: jb += b' '
out = struct.pack('<III', 0x46546C67, 2, 28 + len(jb) + len(bin_)) + struct.pack('<II', len(jb), 0x4E4F534A) + jb + struct.pack('<II', len(bin_), 0x004E4942) + bytes(bin_)
open(dst, 'wb').write(out); print('OK', dst)
