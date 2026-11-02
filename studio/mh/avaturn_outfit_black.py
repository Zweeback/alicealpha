# Avaturn-Outfit (T-Shirt+Jeans) -> schwarzer Tech-Anzug; Sneaker (rechter Atlasbereich) bleiben weiß.
#   python3 mh/avaturn_outfit_black.py IN.vrm OUT.vrm
import io, json, struct, sys, numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter
src, dst = sys.argv[1:3]
raw = open(src, 'rb').read(); off = 12; ch = []
while off < len(raw):
    l, t = struct.unpack('<II', raw[off:off + 8]); ch.append([t, raw[off + 8:off + 8 + l]]); off += 8 + l
j = json.loads(ch[0][1]); b = bytearray(ch[1][1])
def put(im, pil, fmt='JPEG'):
    buf = io.BytesIO(); pil.save(buf, fmt, quality=95); d = buf.getvalue()
    while len(b) % 4: b.append(0)
    j['bufferViews'].append({'buffer': 0, 'byteOffset': len(b), 'byteLength': len(d)}); b.extend(d); im['bufferView'] = len(j['bufferViews']) - 1
    im['mimeType'] = 'image/jpeg' if fmt == 'JPEG' else 'image/png'
for im in j['images']:
    if im.get('name') != 'ARPI_Color_1K': continue
    bv = j['bufferViews'][im['bufferView']]; o = bv.get('byteOffset', 0)
    a = np.asarray(Image.open(io.BytesIO(bytes(b[o:o + bv['byteLength']]))).convert('RGB')).astype(np.float32) / 255
    H, W = a.shape[:2]; yy, xx = np.mgrid[0:H, 0:W] / np.array([H, W])[:, None, None]
    L = a.mean(axis=2)
    shoe = (xx > 0.74) & ~((yy < 0.34) & (xx < 0.80))          # Sneaker-Inseln rechts
    blueish = (a[..., 2] > a[..., 0] + 0.03)                   # T-Shirt (hellblau) + Jeans
    m = (blueish & ~shoe).astype(np.float32); m = gaussian_filter(m, 1.0)
    detail = L - gaussian_filter(L, 6)                          # Falten/Nähte behalten
    shade = gaussian_filter(L, 6)
    suit = 0.055 + 0.10 * (shade - shade.min()) / (np.ptp(shade) + 1e-6) + detail * 0.6
    suitc = np.dstack([suit * 0.95, suit * 0.98, suit * 1.06])  # leicht kühles Schwarz
    out = a * (1 - m[..., None]) + np.clip(suitc, 0, 1) * m[..., None]
    put(im, Image.fromarray((out * 255).astype(np.uint8))); Image.fromarray((out * 255).astype(np.uint8)).save('out/mh/av_outfit_black.png')
for m in j['materials']:
    if m['name'] == 'outfit':
        m['pbrMetallicRoughness']['roughnessFactor'] = 0.62
        m['extensions']['KHR_materials_specular']['specularFactor'] = 0.35   # leichter Satin-Glanz (Tech-Stoff)
j['buffers'][0]['byteLength'] = len(b)
while len(b) % 4: b.append(0)
jb = json.dumps(j, separators=(',', ':')).encode()
while len(jb) % 4: jb += b' '
open(dst, 'wb').write(struct.pack('<III', 0x46546C67, 2, 28 + len(jb) + len(b)) + struct.pack('<II', len(jb), 0x4E4F534A) + jb + struct.pack('<II', len(b), 0x004E4942) + bytes(b)); print('OK', dst)
