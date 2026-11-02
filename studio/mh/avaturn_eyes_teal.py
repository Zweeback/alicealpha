# Iris blau -> Alice-Türkis (Bild 'AvatarEyes_Color_512') direkt im VRM.  python3 mh/avaturn_eyes_teal.py IN.vrm OUT.vrm
import io, json, struct, sys, numpy as np
from PIL import Image
src, dst = sys.argv[1:3]
raw = open(src, 'rb').read(); off = 12; ch = []
while off < len(raw):
    l, t = struct.unpack('<II', raw[off:off + 8]); ch.append([t, raw[off + 8:off + 8 + l]]); off += 8 + l
j = json.loads(ch[0][1]); b = bytearray(ch[1][1])
for im in j['images']:
    if im.get('name') != 'AvatarEyes_Color_512': continue
    bv = j['bufferViews'][im['bufferView']]; o = bv.get('byteOffset', 0)
    a = np.asarray(Image.open(io.BytesIO(bytes(b[o:o + bv['byteLength']]))).convert('RGB')).astype(np.float32) / 255
    hsv = np.asarray(Image.fromarray((a * 255).astype(np.uint8)).convert('HSV')).astype(np.float32)
    h, s, v = hsv[..., 0] * 360 / 255, hsv[..., 1] / 255, hsv[..., 2] / 255
    iris = (s > 0.18) & (h > 180) & (h < 260)                     # blaue Iris
    w = np.clip((s - 0.18) / 0.15, 0, 1) * iris
    h2 = np.where(iris, h - 32, h)                                 # blau(~215°) -> türkis(~183°)
    s2 = np.where(iris, np.clip(s * 1.15, 0, 1), s); v2 = np.where(iris, np.clip(v * 1.12, 0, 1), v)
    new = Image.fromarray(np.dstack([h2 / 360 * 255, s2 * 255, v2 * 255]).astype(np.uint8), 'HSV').convert('RGB')
    new = np.asarray(new).astype(np.float32) / 255; out = a * (1 - w[..., None]) + new * w[..., None]
    buf = io.BytesIO(); Image.fromarray((out * 255).astype(np.uint8)).save(buf, 'JPEG', quality=95); d = buf.getvalue()
    while len(b) % 4: b.append(0)
    j['bufferViews'].append({'buffer': 0, 'byteOffset': len(b), 'byteLength': len(d)}); b.extend(d); im['bufferView'] = len(j['bufferViews']) - 1
    Image.fromarray((out * 255).astype(np.uint8)).save('out/mh/av_eye_teal.png'); print('iris px', int(iris.sum()))
j['buffers'][0]['byteLength'] = len(b)
while len(b) % 4: b.append(0)
jb = json.dumps(j, separators=(',', ':')).encode()
while len(jb) % 4: jb += b' '
open(dst, 'wb').write(struct.pack('<III', 0x46546C67, 2, 28 + len(jb) + len(b)) + struct.pack('<II', len(jb), 0x4E4F534A) + jb + struct.pack('<II', len(b), 0x004E4942) + bytes(b)); print('OK', dst)
