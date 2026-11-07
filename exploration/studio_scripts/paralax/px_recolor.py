#!/usr/bin/env python3
"""Paralax-Look, Textur-Teil: Outfit-Atlas (T-Shirt+Jeans) per UV-Rasterisierung mit Weltpositionen umfärben.
  Shirt -> weißes geripptes Crop-Top mit schwarzem V-Ausschnitt, Bauch + V-Dekolleté -> Haut
  Jeans -> schwarze Shorts (oben), Haut-Streifen am Oberschenkel, weiße Overknees mit rosa Diagonalstreifen
  Körper: Knöchel weiß (Strumpf), Iris -> blau.
  python3 fin/px_recolor.py IN.vrm OUT.vrm"""
import io, json, struct, sys, numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter
src, dst = sys.argv[1:3]
raw = open(src, 'rb').read(); off = 12; ch = []
while off < len(raw):
    l, t = struct.unpack('<II', raw[off:off + 8]); ch.append(raw[off + 8:off + 8 + l]); off += 8 + l
j = json.loads(ch[0]); b = bytearray(ch[1])
CT = {5121: 'u1', 5123: 'u2', 5125: 'u4', 5126: 'f4'}; NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}
def acc(ai):
    A = j['accessors'][ai]; n = NC[A['type']]; dt = np.dtype('<' + CT[A['componentType']]); bv = j['bufferViews'][A['bufferView']]
    o = bv.get('byteOffset', 0) + A.get('byteOffset', 0); return np.frombuffer(bytes(b[o:o + A['count'] * n * dt.itemsize]), dt).reshape(-1, n).copy()
def img(name):
    im = next(i for i in j['images'] if i.get('name') == name); bv = j['bufferViews'][im['bufferView']]; o = bv.get('byteOffset', 0)
    return im, np.asarray(Image.open(io.BytesIO(bytes(b[o:o + bv['byteLength']]))).convert('RGB')).astype(np.float32) / 255
def put(im, arr, fmt='JPEG'):
    buf = io.BytesIO(); Image.fromarray((np.clip(arr, 0, 1) * 255).astype(np.uint8)).save(buf, fmt, quality=94); d = buf.getvalue()
    while len(b) % 4: b.append(0)
    j['bufferViews'].append({'buffer': 0, 'byteOffset': len(b), 'byteLength': len(d)}); b.extend(d); im['bufferView'] = len(j['bufferViews']) - 1
    im['mimeType'] = 'image/jpeg' if fmt == 'JPEG' else 'image/png'
def raster(mesh_name, H, W):
    """Pro Texel: Weltposition (bind) + Normale, per Dreieck in UV-Raum gerastert. Rückgabe Pos(H,W,3), Nz, Maske."""
    n = next(x for x in j['nodes'] if x.get('name') == mesh_name); pr = j['meshes'][n['mesh']]['primitives'][0]
    P = acc(pr['attributes']['POSITION']); N = acc(pr['attributes']['NORMAL']); UV = acc(pr['attributes']['TEXCOORD_0']); I = acc(pr['indices']).reshape(-1, 3)
    pos = np.zeros((H, W, 3), np.float32); nor = np.zeros((H, W, 3), np.float32); m = np.zeros((H, W), bool)
    uvp = UV * np.array([W, H]) - 0.5
    for tri in I:
        a, bb, c = uvp[tri]; x0, y0 = np.floor(np.minimum(np.minimum(a, bb), c)).astype(int); x1, y1 = np.ceil(np.maximum(np.maximum(a, bb), c)).astype(int)
        x0, y0 = max(x0, 0), max(y0, 0); x1, y1 = min(x1, W - 1), min(y1, H - 1)
        if x1 < x0 or y1 < y0: continue
        yy, xx = np.mgrid[y0:y1 + 1, x0:x1 + 1]; d = (bb[1] - c[1]) * (a[0] - c[0]) + (c[0] - bb[0]) * (a[1] - c[1])
        if abs(d) < 1e-12: continue
        l0 = ((bb[1] - c[1]) * (xx - c[0]) + (c[0] - bb[0]) * (yy - c[1])) / d; l1 = ((c[1] - a[1]) * (xx - c[0]) + (a[0] - c[0]) * (yy - c[1])) / d; l2 = 1 - l0 - l1
        ins = (l0 >= -0.02) & (l1 >= -0.02) & (l2 >= -0.02)
        if not ins.any(): continue
        L = np.stack([l0, l1, l2], -1)[ins]; pos[yy[ins], xx[ins]] = L @ P[tri]; nor[yy[ins], xx[ins]] = L @ N[tri]; m[yy[ins], xx[ins]] = True
    return pos, nor, m

# ---------------------------------------------------------------- Hautfarbe aus Körpertextur (Mittelwert heller Hautbereiche)
_, BT = img('AvatarBodyFemale_Color_1K'); L = BT.mean(2); sk = (L > 0.45) & (L < 0.9); SKIN = np.median(BT[sk], 0); print('skin', SKIN)
# ---------------------------------------------------------------- Outfit
oim, A = img('ARPI_Color_1K'); nim, NM = img('ARPI_Normal_1K'); H, W = A.shape[:2]
pos, nor, m = raster('outfit', H, W); x, y, z = pos[..., 0], pos[..., 1], pos[..., 2]
yy, xx = np.mgrid[0:H, 0:W] / np.array([H, W])[:, None, None]
shoe = ((xx > 0.74) & ~((yy < 0.34) & (xx < 0.80))) | (m & (y < 0.10))
Lm = A.mean(2); blue = A[..., 2] > A[..., 0] + 0.03
detail = Lm - gaussian_filter(Lm, 5)
jean_col = (A[..., 2] - A[..., 0] > 0.06) & (Lm < 0.62)
jean_col = gaussian_filter(jean_col.astype(np.float32), 2) > 0.5
jeans = m & ~shoe & ((y < 0.95) | ((y < 1.08) & jean_col))
shirt = m & ~shoe & ~jeans
out = A.copy(); flatN = np.zeros(A.shape[:2], np.float32)
def paint(mask, col, keep_detail=0.5, soft=0.8):
    global out
    w = np.maximum(mask, gaussian_filter(mask.astype(np.float32), soft))[..., None]; c = np.broadcast_to(np.array(col, np.float32), out.shape) + detail[..., None] * keep_detail
    out = out * (1 - w) + np.clip(c, 0, 1) * w
# Crop-Top: weiß, feine vertikale Rippen (in Weltkoordinaten -> Rippen laufen am Körper senkrecht)
rib = 0.025 * np.sin(np.arctan2(x, z + 0.02) * 120)
top_col = np.dstack([0.93 + rib, 0.93 + rib, 0.94 + rib])
cropy = 1.19
vneck_half = np.clip((y - 1.255) * 0.62, 0, None)                 # halbe V-Breite wächst nach oben
front = z > 0.0
vskin = front & (np.abs(x) < vneck_half) & (y > 1.255)
vtrim = front & (np.abs(x) < vneck_half + 0.011) & ~vskin & (y > 1.25) & (y < 1.43)
neckband = (y > 1.425) & (np.abs(x) < 0.075) & ~vskin
top = shirt & (y >= cropy) & ~vskin
w = gaussian_filter(top.astype(np.float32), 0.7)[..., None]; out = out * (1 - w) + np.clip(top_col + detail[..., None] * 0.4, 0, 1) * w
paint(shirt & ((y < cropy) | vskin), SKIN, 0.05, 1.0)
paint(shirt & (vtrim | (neckband & (y < 1.44))) & ~vskin, (0.05, 0.05, 0.06), 0.1, 0.6)
paint(shirt & (y >= cropy) & (y < cropy + 0.012), (0.82, 0.82, 0.84), 0.1, 0.6)      # Saum
# Jeans: schwarze Shorts / Haut / Overknee-Strümpfe
SH0, SK0 = 0.745, 0.625
SKIN = np.clip(SKIN * 1.03, 0, 1)
shorts = jeans & (y >= SH0) & (y < 1.03)
paint(jeans & (y >= 1.03), SKIN, 0.03, 1.0)
skin_leg = jeans & (y < SH0) & (y >= SK0)
sock = jeans & (y < SK0)
paint(shorts, (0.06, 0.06, 0.07), 0.35, 0.8)
paint(skin_leg, SKIN, 0.03, 1.0)
paint(sock, (0.95, 0.94, 0.95), 0.25, 0.8)
paint(sock & (y > SK0 - 0.022), (0.90, 0.89, 0.91), 0.1, 0.6)                      # Bündchen
# rosa Diagonalstreifen: rechtes Bein (x<0) zwei Streifen, linkes Bein (x>0) einer
def stripe(c, xc, slope=0.75, wd=0.008, leg=-1):
    d = (y - (c + slope * (x - xc)))
    return sock & (np.sign(x) == leg) & (np.abs(d) < wd)
pink = (0.96, 0.62, 0.78)
for s_ in (stripe(0.505, -0.10), stripe(0.46, -0.10), stripe(0.385, 0.10, leg=1)): paint(s_, pink, 0.05, 0.6)
from scipy.ndimage import distance_transform_edt
def bleed(arr, mask):
    _, (iy, ix) = distance_transform_edt(~mask, return_indices=True); return arr[iy, ix]
out = np.where(m[..., None], out, bleed(out, m))
paint(shoe & m, (0.95, 0.94, 0.95), 0.0, 1.5)
put(oim, out)

# Sneaker -> Strumpffuß: Schuh-Geometrie schlanker/flacher formen (Sohle verschwindet optisch)
_on = next(x_ for x_ in j['nodes'] if x_.get('name') == 'outfit'); _pr = j['meshes'][_on['mesh']]['primitives'][0]
_P = acc(_pr['attributes']['POSITION']); sh = _P[:, 1] < 0.115
for sg in (-1, 1):
    m_ = sh & (np.sign(_P[:, 0]) == sg)
    if not m_.any(): continue
    cxf = np.median(_P[m_, 0]); czf = np.median(_P[m_, 2]); ymin = _P[m_, 1].min()
    t = np.clip((0.115 - _P[m_, 1]) / 0.06, 0, 1)                     # 0 am Knöchel, 1 unten
    _P[m_, 0] = cxf + (_P[m_, 0] - cxf) * (1 - 0.24 * t)
    _P[m_, 2] = czf + (_P[m_, 2] - czf) * (1 - 0.08 * t)
    _P[m_, 1] = ymin + (_P[m_, 1] - ymin) * (1 - 0.18 * t) + 0.004 * t
while len(b) % 4: b.append(0)
_d = _P.astype(np.float32).tobytes(); j['bufferViews'].append({'buffer': 0, 'byteOffset': len(b), 'byteLength': len(_d), 'target': 34962}); b.extend(_d)
j['accessors'].append({'bufferView': len(j['bufferViews']) - 1, 'componentType': 5126, 'count': len(_P), 'type': 'VEC3', 'min': _P.min(0).tolist(), 'max': _P.max(0).tolist()}); _pr['attributes']['POSITION'] = len(j['accessors']) - 1
# Normalmap in Haut-/Strumpf-Flächen glätten (keine Jeansnähte mehr)
flat = gaussian_filter((shirt & ((y < cropy) | vskin) | skin_leg | sock | (jeans & (y >= 1.03)) | (shoe & m)).astype(np.float32), 1.5)[..., None]
NM2 = NM * (1 - flat) + np.array([0.5, 0.5, 1.0]) * flat; NM2 = np.where(m[..., None], NM2, bleed(NM2, m)); put(nim, NM2)
Image.fromarray((np.clip(out, 0, 1) * 255).astype(np.uint8)).save('out/px/outfit_tex.png')
# ---------------------------------------------------------------- Körper: Knöchel/Fuß-Ansatz weiß (Strumpf unter Jeans-Saum)
bim, B = img('AvatarBodyFemale_Color_1K'); Hb, Wb = B.shape[:2]; bpos, _, bm = raster('AvatarBody', Hb, Wb)
ank = bm & (bpos[..., 1] < 0.25); wa = gaussian_filter(ank.astype(np.float32), 0.8)[..., None]
B2 = B * (1 - wa) + np.array([0.95, 0.94, 0.95]) * wa; put(bim, B2)
# ---------------------------------------------------------------- Kopf: Haar kupfern/heller, Sommersprossen
him, HT = img('AvatarHeadFemale_Color_1K'); Hh, Wh = HT.shape[:2]; hp, hn, hm = raraster = raster('AvatarHead', Hh, Wh)
hx, hy, hz = hp[..., 0], hp[..., 1], hp[..., 2]
hsv = np.asarray(Image.fromarray((HT * 255).astype(np.uint8)).convert('HSV')).astype(np.float32); hh_, hs_, hv_ = hsv[..., 0] * 360 / 255, hsv[..., 1] / 255, hsv[..., 2] / 255
face = hm & (hz > 0.035) & (np.abs(hx) < 0.056) & (hy < 1.655)
hairm = (hs_ > 0.40) & (hv_ < 0.80) & ~face & ((hh_ < 40) | (hh_ > 340))
facew = gaussian_filter(face.astype(np.float32), 6.0)
hairw = gaussian_filter(hairm.astype(np.float32), 1.0) * (1 - np.clip(facew * 1.6, 0, 1))
nh = np.full_like(hh_, 19.0); ns = np.clip(hs_ * 0.92, 0, 1); nv = np.clip(hv_ * 1.45 + 0.04, 0, 1)
newh = np.asarray(Image.fromarray(np.dstack([nh / 360 * 255, ns * 255, nv * 255]).astype(np.uint8), 'HSV').convert('RGB')).astype(np.float32) / 255
HT2 = HT * (1 - hairw[..., None]) + newh * hairw[..., None]
# Sommersprossen: Wangen + Nasenrücken
fr = hm & (hz > 0.05) & (hy > 1.565) & (hy < 1.628) & (np.abs(hx) < 0.062) & ~hairm
ys_, xs_ = np.nonzero(fr); rngf = np.random.default_rng(11); pick = rngf.choice(len(ys_), size=min(len(ys_), 340), replace=False)
dots = np.zeros((Hh, Wh), np.float32)
for i in pick:
    yq, xq = ys_[i], xs_[i]; r = rngf.uniform(0.6, 1.4); a = rngf.uniform(0.18, 0.45)
    d = np.zeros((Hh, Wh), np.float32)
    dots[max(yq - 2, 0):yq + 3, max(xq - 2, 0):xq + 3] = np.maximum(dots[max(yq - 2, 0):yq + 3, max(xq - 2, 0):xq + 3], a * np.exp(-((np.mgrid[-2:3, -2:3] ** 2).sum(0)) / (2 * r * r))[:min(yq + 3, Hh) - max(yq - 2, 0), :min(xq + 3, Wh) - max(xq - 2, 0)])
frc = np.array([0.62, 0.38, 0.26]); HT2 = HT2 * (1 - dots[..., None]) + (HT2 * frc / frc.max() * 0.8) * dots[..., None]
put(him, HT2); Image.fromarray((np.clip(HT2, 0, 1) * 255).astype(np.uint8)).save('out/px/head_tex.png'); print('hair px', int(hairm.sum()), 'freckles', len(pick))
# Augenbrauen/Wimpern-Haare im Haar-Mesh? (Augenbrauen sind Kopftextur: werden mit kupfern, passt zur Referenz)
# ---------------------------------------------------------------- Iris -> blau
eim, E = img('AvatarEyes_Color_512')
hsv = np.asarray(Image.fromarray((E * 255).astype(np.uint8)).convert('HSV')).astype(np.float32); h, s, v = hsv[..., 0] * 360 / 255, hsv[..., 1] / 255, hsv[..., 2] / 255
iris = (s > 0.18) & (h > 160) & (h < 260); wi = np.clip((s - 0.18) / 0.15, 0, 1) * iris
new = Image.fromarray(np.dstack([np.where(iris, 208, h) / 360 * 255, np.clip(s * np.where(iris, 0.9, 1), 0, 1) * 255, np.clip(v * np.where(iris, 1.08, 1), 0, 1) * 255]).astype(np.uint8), 'HSV').convert('RGB')
E2 = E * (1 - wi[..., None]) + np.asarray(new).astype(np.float32) / 255 * wi[..., None]; put(eim, E2)
for mt in j['materials']:
    if mt['name'] == 'outfit': mt['pbrMetallicRoughness']['roughnessFactor'] = 0.75
j['buffers'][0]['byteLength'] = len(b)
while len(b) % 4: b.append(0)
jb = json.dumps(j, separators=(',', ':')).encode()
while len(jb) % 4: jb += b' '
open(dst, 'wb').write(struct.pack('<III', 0x46546C67, 2, 28 + len(jb) + len(b)) + struct.pack('<II', len(jb), 0x4E4F534A) + jb + struct.pack('<II', len(b), 0x004E4942) + bytes(b)); print('OK', dst)
