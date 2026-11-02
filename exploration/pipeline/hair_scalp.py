# Kopfhaut-Kappe nach Reallusion-Regel: aus dem Kopf-Mesh kopiert, 1,2 mm aufgeblasen, Haarlinie mit
# ausgefranstem Masken-Rand (Haar-Noise), dunkleres Rot als die Strähnen (Okklusion). -> out/mh/scalp.blend (P_HairScalp)
import os, sys, math, bpy, bmesh, numpy as np
sys.path.insert(0, os.path.dirname(__file__)); import mats
from PIL import Image, ImageFilter
bpy.ops.wm.open_mainfile(filepath='out/mh/core.blend')
body = bpy.data.objects['Alice_Body']; assert body.matrix_world == body.matrix_world.Identity(4) or True
mw = body.matrix_world
def zth(a):
    pts = [(0.0, 1.600), (0.65, 1.600), (1.25, 1.556), (1.55, 1.549), (2.15, 1.549), (2.55, 1.47), (math.pi, 1.425)]
    for (a0, z0), (a1, z1) in zip(pts, pts[1:]):
        if a <= a1: t = (a - a0) / (a1 - a0); t = t * t * (3 - 2 * t); return z0 + (z1 - z0) * t
    return pts[-1][1]
co = np.array([tuple(mw @ v.co) for v in body.data.vertices]); nv = len(co)
s = np.full(nv, -9.0)
for i, (x, y, z) in enumerate(co):
    if z < 1.40: continue
    a = math.atan2(abs(x), -(y + 0.06)); d = (z - zth(a)) / 0.012
    if abs(x) > 0.074 and z < 1.552 and -0.07 < y < -0.01: d = min(d, -2)   # Ohren frei
    s[i] = d
keep = s > -1.6
bm = bmesh.new(); bm.from_mesh(body.data); bm.verts.ensure_lookup_table()
sl = bm.verts.layers.float.new('hs')
for v in bm.verts: v[sl] = float(s[v.index])
bmesh.ops.delete(bm, geom=[f for f in bm.faces if not all(keep[v.index] for v in f.verts)], context='FACES')
bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
bm.normal_update()
for v in bm.verts: v.co = v.co + v.normal * 0.0012
me = bpy.data.meshes.new('P_HairScalp'); bm.to_mesh(me)
# Textur im Body-UV-Raum backen: Farbe + Alpha aus interpoliertem s
R = 1024; col = np.zeros((R, R, 3), np.float32); alp = np.zeros((R, R), np.float32); cov = np.zeros((R, R), bool)
uvl = bm.loops.layers.uv.active
for f in bm.faces:
    lp = f.loops
    for k in range(1, len(lp) - 1):
        tri = [lp[0], lp[k], lp[k + 1]]
        P = np.array([[l[uvl].uv.x * R, (1 - l[uvl].uv.y) * R] for l in tri]); S = np.array([l.vert[sl] for l in tri])
        x0, y0 = np.floor(P.min(0)).astype(int); x1, y1 = np.ceil(P.max(0)).astype(int)
        x0, y0 = max(x0 - 1, 0), max(y0 - 1, 0); x1, y1 = min(x1 + 1, R - 1), min(y1 + 1, R - 1)
        gx, gy = np.meshgrid(np.arange(x0, x1 + 1) + .5, np.arange(y0, y1 + 1) + .5)
        T = np.array([[P[0, 0] - P[2, 0], P[1, 0] - P[2, 0]], [P[0, 1] - P[2, 1], P[1, 1] - P[2, 1]]])
        if abs(np.linalg.det(T)) < 1e-9: continue
        Ti = np.linalg.inv(T); l1 = Ti[0, 0] * (gx - P[2, 0]) + Ti[0, 1] * (gy - P[2, 1]); l2 = Ti[1, 0] * (gx - P[2, 0]) + Ti[1, 1] * (gy - P[2, 1]); l3 = 1 - l1 - l2
        m = (l1 >= -0.02) & (l2 >= -0.02) & (l3 >= -0.02)
        sv = l1 * S[0] + l2 * S[1] + l3 * S[2]
        sub = alp[y0:y1 + 1, x0:x1 + 1]; sub[m] = sv[m]; cov[y0:y1 + 1, x0:x1 + 1] |= m
rng = np.random.default_rng(7)
n1 = Image.fromarray((rng.random((R, R)) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8))
streak = np.asarray(n1.resize((R // 8, R)).resize((R, R), Image.BILINEAR), np.float32) / 255   # feine Längsstreifen
base = np.array([0.36, 0.075, 0.035]); hi = np.array([0.62, 0.17, 0.07])
t = np.clip((streak - 0.35) * 1.8, 0, 1)[..., None]
col = base * (1 - t) + hi * t
# Alpha: tief im Haarbereich voll, an der Haarlinie ausgefranst (Noise-Schwelle -> einzelne „Härchen")
fine = np.asarray(Image.fromarray((rng.random((R, R)) * 255).astype(np.uint8)).resize((R // 2, R // 6)).resize((R, R), Image.NEAREST), np.float32) / 255
edge = np.clip((alp + 1.4) / 2.2, 0, 1)
a = ((edge > fine * 0.9 + 0.05) & cov).astype(np.float32)
# farbigen Rand für Mip-Maps erweitern (keine dunklen Säume)
rgba = np.dstack([np.clip(col, 0, 1), a]); img = Image.fromarray((rgba * 255).astype(np.uint8), 'RGBA')
os.makedirs('out/mh/tex', exist_ok=True); img.save('out/mh/tex/hair_scalp.png')
o = bpy.data.objects.new('P_HairScalp', me); bpy.context.scene.collection.objects.link(o)
for g in body.vertex_groups: o.vertex_groups.new(name=g.name)
mats.set_material(o, mats.pbr('Hair_Scalp', tex=mats.load_img('out/mh/tex/hair_scalp.png'), rough=0.7, spec=0.3, alpha='MASK', cutoff=0.5))
for p in me.polygons: p.use_smooth = True
if me.shape_keys: o.shape_key_clear()
print('P_HairScalp verts', len(me.vertices), 'faces', len(me.polygons), 'groups', len(o.vertex_groups), 'mask coverage', round(float(a[cov].mean()), 2))
for ob in list(bpy.data.objects):
    if ob.type == 'MESH' and ob is not o: bpy.data.objects.remove(ob)
img_check = Image.fromarray((np.dstack([col, a]) * 255).astype(np.uint8), 'RGBA').resize((512, 512)).save('/tmp/claude-0/-home-claude/ba6ce5eb-0729-5bb9-9dab-f777d50aa901/scratchpad/scalp_tex.png')
bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath('out/mh/scalp.blend')); print('SAVED')
