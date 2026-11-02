# Augenlid-Fix: Texturbereich, der beim Blinzeln sichtbar wird (innere Lidfalte), mit Hautton füllen.
#   python3 mh/fix_eyelid_tex.py  -> überschreibt out/mh/tex/face_skin_diffuse.png (Backup *_orig.png)
import bpy, numpy as np, os, shutil, cv2
from PIL import Image, ImageDraw
bpy.ops.wm.open_mainfile(filepath='out/mh/core_v1.blend' if False else 'out/mh/core.blend')
o = bpy.data.objects['Alice_Body']; kb = o.data.shape_keys.key_blocks; me = o.data
n = len(me.vertices); base = np.empty(n * 3, np.float32); kb['Basis'].data.foreach_get('co', base); base = base.reshape(-1, 3)
moved = np.zeros(n, bool)
for k in ['eyeBlinkLeft', 'eyeBlinkRight']:
    if k not in kb: print('missing', k); continue
    c = np.empty(n * 3, np.float32); kb[k].data.foreach_get('co', c); d = np.linalg.norm(c.reshape(-1, 3) - base, axis=1)
    moved |= d > 0.0006
print('moved verts', moved.sum())
P = 'out/mh/tex/face_skin_diffuse.png'; orig = P.replace('.png', '_orig.png')
if not os.path.exists(orig): shutil.copy(P, orig)
img = np.asarray(Image.open(orig).convert('RGB')); H, W = img.shape[:2]
mask = Image.new('L', (W, H), 0); dr = ImageDraw.Draw(mask); uv = me.uv_layers.active.data
cnt = 0
for p in me.polygons:
    if all(moved[v] for v in p.vertices):
        pts = [(uv[li].uv[0] * W, (1 - uv[li].uv[1]) * H) for li in p.loop_indices]; dr.polygon(pts, fill=255); cnt += 1
m = np.asarray(mask); m = cv2.dilate(m, np.ones((5, 5), np.uint8))
# Nur die Lid-INNENseite füllen: Pixel, die deutlich dunkler sind als der lokale Hautton
lum = img.mean(axis=2); skin = cv2.GaussianBlur(lum, (0, 0), 25)
dark = (lum < skin * 0.93).astype(np.uint8) * 255
fillmask = m.copy()   # gesamte Lidfläche neu aus umgebender Haut aufbauen
fixed = cv2.inpaint(img[..., ::-1].copy(), fillmask, 12, cv2.INPAINT_TELEA)[..., ::-1]
# Sommersprossen-Rauschen leicht zurückgeben, damit der Bereich nicht glatt wirkt
noise = cv2.GaussianBlur(np.random.default_rng(3).standard_normal((H, W)).astype(np.float32), (0, 0), 1.2) * 6
fixed = np.where(fillmask[..., None] > 0, np.clip(fixed + noise[..., None], 0, 255), img).astype(np.uint8)
Image.fromarray(fixed).save(P); Image.fromarray(fillmask).save('out/mh/tex/eyelid_mask.png')
ys, xs = np.nonzero(m); print('faces', cnt, 'mask px', int((m > 0).sum()), 'filled px', int((fillmask > 0).sum()), 'bbox', xs.min(), ys.min(), xs.max(), ys.max())
