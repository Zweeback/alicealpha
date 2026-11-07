"""Bob-Frisur aus Hair-Cards (Alpha-Strähnen) für Alice: kinnlang, Seitenscheitel (rechts), Pony schräg zur linken Seite, Volumen, Spitzen leicht nach außen.
Ausgabe: fin/parts_hair.npz + fin/tex_px/hair_cards.png + Eintrag in fin/mats_px.json      python3 fin/build_hair.py"""
import bpy, bmesh, math, json, numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from PIL import Image
from scipy.ndimage import gaussian_filter
D = '/home/claude/alice_vrm/fin'; rng = np.random.default_rng(3)
bpy.ops.wm.open_mainfile(filepath=D + '/base.blend')
head = bpy.data.objects['AvatarHead']; body = bpy.data.objects['AvatarBody']
bm = bmesh.new()
for o in (head, body):
    t = bmesh.new(); t.from_mesh(o.data); t.transform(o.matrix_world); me = bpy.data.meshes.new('t'); t.to_mesh(me); t.free(); bm.from_mesh(me)
T = BVHTree.FromBMesh(bm)
C = Vector((0.0, 0.004, 1.632))
PART = -0.032                 # Scheitel (x, Blender: +x = ihre linke Seite)
def dirv(th, el): return Vector((math.sin(th) * math.cos(el), -math.cos(th) * math.cos(el), math.sin(el)))
def surf_r(d):
    h = T.ray_cast(C + d * 0.3, -d, 0.3); return (h[0] - C).length if h[0] is not None else 0.1
def hairline(th):             # minimale Wurzel-Elevation (Grad) je Richtung
    a = abs(math.degrees(th)); return np.interp(a, [0, 40, 70, 95, 130, 180], [44, 42, 30, 12, -12, -24])
def facemin(th):              # Strähnen dürfen hier nicht tiefer (Gesicht frei)
    a = abs(math.degrees(th)); return np.interp(a, [0, 50, 62, 78, 180], [26, 24, 10, -80, -80])
# ---------------- Wurzeln (Fibonacci-Kugel)
N = 3200; roots = []
for i in range(N):
    z = 1 - 2 * (i + 0.5) / N; el = math.asin(z); th = (i * math.pi * (3 - math.sqrt(5))) % (2 * math.pi) - math.pi
    if math.degrees(el) < hairline(th): continue
    roots.append((th, el))
print('roots', len(roots))
# ---------------- Strähnen
strands = []
for (th0, el0) in roots:
    for layer in range(2):
        p0 = C + dirv(th0, el0) * surf_r(dirv(th0, el0))
        side = 1 if p0.x > PART else -1
        # Ziel-Azimut: vorn liegende Wurzeln seitlich wegkämmen, Pony zur +x-Seite (weg vom Scheitel)
        a0 = abs(math.degrees(th0))
        if a0 < 75:
            tgt = side * math.radians(rng.uniform(64, 90))
            if side > 0 and a0 < 45: tgt = math.radians(rng.uniform(66, 86))
        else:
            tgt = th0 + side * math.radians(rng.uniform(0, 8)) * (1 if abs(th0) < 2.7 else 0)
        el_low = math.radians(-38 + rng.uniform(-6, 4)); L = 10; pts = []
        lay = 0.006 + layer * 0.006 + rng.uniform(0, 0.004)
        for k in range(L + 1):
            t = k / L; sw = min(1, t / 0.55); sw = sw * sw * (3 - 2 * sw)
            th = th0 + (tgt - th0) * sw
            el = el0 + (el_low - el0) * (t ** 1.15)
            el = max(el, math.radians(facemin(th)) + (0.0 if t > 0.3 else 0.0))
            d = dirv(th, el); off = lay + 0.010 * t + (0.012 if el0 > math.radians(55) else 0.004) * math.sin(math.pi * min(1, t * 1.6))
            pts.append(C + d * (surf_r(d) + off))
        # hängender Teil bis Kinnhöhe, Spitzen nach außen
        last = pts[-1]; yend = 1.487 + rng.uniform(-0.02, 0.012) + (0.012 if abs(th0) > 2.6 else 0)
        ax = Vector((last.x - C.x, last.y - C.y, 0)); r0 = ax.length; ax.normalize()
        nB = 6
        for k in range(1, nB + 1):
            t = k / nB; z = last.z + (yend - last.z) * t
            r = r0 + 0.010 * t + 0.016 * t ** 3
            q = Vector((C.x + ax.x * r, C.y + ax.y * r, z))
            hh = T.ray_cast(Vector((C.x, C.y, z)), ax, 0.25)
            if hh[0] is not None:
                rmin = (Vector((hh[0].x - C.x, hh[0].y - C.y, 0))).length + 0.012
                if r < rmin: q = Vector((C.x + ax.x * rmin, C.y + ax.y * rmin, z))
            pts.append(q)
        if last.z < yend + 0.01: pts = pts[:L + 1]
        segs = [(pts[i + 1] - pts[i]).length for i in range(len(pts) - 1)]
        if max(segs) > 0.05: continue
        strands.append((pts, layer))
print('strands', len(strands))
# ---------------- Karten
bm = bmesh.new(); uvs = []; NV = 8
for si, (pts, layer) in enumerate(strands):
    col = rng.integers(0, NV); w0 = rng.uniform(0.011, 0.016) * (1.0 if layer == 0 else 0.85); L, R = [], []; n = len(pts)
    for k, p in enumerate(pts):
        a = pts[max(k - 1, 0)]; b = pts[min(k + 1, n - 1)]; tg = (b - a).normalized(); out = (p - C); out.z *= 0.5; out.normalize()
        sd = tg.cross(out).normalized(); w = w0 * (1 - 0.55 * (k / (n - 1)) ** 2)
        L.append(bm.verts.new(p - sd * w / 2)); R.append(bm.verts.new(p + sd * w / 2)); uvs.append((col, k / (n - 1)))
    for k in range(n - 1): bm.faces.new((L[k], R[k], R[k + 1], L[k + 1]))
me = bpy.data.meshes.new('HairCards'); bm.to_mesh(me); bm.free(); o = bpy.data.objects.new('HairCards', me); bpy.context.scene.collection.objects.link(o)
me.uv_layers.new(name='UV'); uvd = me.uv_layers.active.data
# Vertex-Reihenfolge: je Punkt (L, R) -> Index 2k / 2k+1 innerhalb der Strähne; UV über Laufindex
vi_uv = []
for (col, v) in uvs: vi_uv += [(col / NV + 0.004, v), ((col + 1) / NV - 0.004, v)]
for poly in me.polygons:
    for li in poly.loop_indices:
        u, v = vi_uv[me.loops[li].vertex_index]; uvd[li].uv = (u, 1 - v)
for p in me.polygons: p.use_smooth = True
# ---------------- Textur: feine Strähnen mit Alpha, Wurzel dunkler, Spitzen ausgedünnt
H, W = 1024, 1024; img = np.zeros((H, W, 4), np.float32)
base = np.array([0.74, 0.31, 0.13]); hi = np.array([0.93, 0.50, 0.26]); dark = np.array([0.42, 0.15, 0.06])
for c in range(NV):
    x0 = c * W // NV; cw = W // NV
    for _ in range(46):
        x = x0 + rng.uniform(3, cw - 3); amp = rng.uniform(0.5, 2.5); fr = rng.uniform(2, 6); ph = rng.uniform(0, 6.28)
        end = rng.uniform(0.80, 1.0); wpx = rng.uniform(1.2, 2.6); tone = rng.uniform(0, 1); colr = base * (1 - tone * 0.5) + hi * tone * 0.5
        ys = np.arange(H); yy = ys / H; xs = x + amp * np.sin(yy * fr * 6.28 + ph) * yy
        m = yy < end
        for dx in range(-3, 4):
            xi = np.clip((xs + dx).astype(int), x0, x0 + cw - 1); a = np.clip(1 - np.abs(xs + dx - xi - 0.5) / wpx, 0, 1) * m
            a = a * np.clip((end - yy) / 0.08, 0, 1)
            shade = (dark * (1 - np.clip(yy / 0.25, 0, 1))[:, None] + colr * np.clip(yy / 0.25, 0, 1)[:, None])
            sel = a > img[ys, xi, 3]
            img[ys[sel], xi[sel], :3] = shade[sel]; img[ys[sel], xi[sel], 3] = a[sel]
img[..., 3] = np.clip(gaussian_filter(img[..., 3], 0.6) * 1.6, 0, 1)
img[..., :3] *= (0.75 + 0.25 * img[..., 3:4])
for k in range(3):   # Farbe unter transparente Bereiche bluten lassen (Mipmaps)
    m = img[..., 3:4] > 0.05; blur = gaussian_filter(img[..., :3] * m, (3, 3, 0)) / (gaussian_filter(m.astype(np.float32), (3, 3, 0)) + 1e-6)
    img[..., :3] = np.where(m, img[..., :3], blur)
Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8), 'RGBA').save(D + '/tex_px/hair_cards.png')
M = json.load(open(D + '/mats_px.json')); M['haircards'] = dict(tex='hair_cards.png', rough=0.48, ds=True, alpha='MASK'); json.dump(M, open(D + '/mats_px.json', 'w'), indent=1)
# ---------------- Unterschicht (opak, dunkles Kupfer): verhindert Durchsehen an Schläfen/Nacken
ub = bmesh.new(); TH = np.radians(np.linspace(84, 276, 52)); YS = np.linspace(1.665, 1.50, 14); G = []
rprev = np.zeros(len(TH))
for yi, yv in enumerate(YS):
    row = []
    for ti, th in enumerate(TH):
        d = Vector((math.sin(th), -math.cos(th), 0)); hh = T.ray_cast(Vector((C.x, C.y, yv)) + d * 0.3, -d, 0.3)
        r = ((Vector((hh[0].x - C.x, hh[0].y - C.y, 0))).length if hh[0] is not None else 0.08) + 0.004
        r = max(r, rprev[ti] if yv < 1.56 else 0); rprev[ti] = r
        row.append(ub.verts.new(Vector((C.x, C.y, yv)) + d * r))
    G.append(row)
for a, b in zip(G[:-1], G[1:]):
    for k in range(len(TH) - 1): ub.faces.new((a[k], a[k + 1], b[k + 1], b[k]))
bmesh.ops.recalc_face_normals(ub, faces=ub.faces[:]); bmesh.ops.triangulate(ub, faces=ub.faces[:])
uP, uN, uI, uUV = [], [], [], []
for f in ub.faces:
    for v in f.verts:
        q = v.co; nn = f.normal; uP.append((q.x, q.z, -q.y)); uN.append((nn.x, nn.z, -nn.y))
        th_ = math.atan2(q.x - C.x, -(q.y - C.y)) % (2 * math.pi); uUV.append((th_ / (2 * math.pi) * 5, (1.665 - q.z) / 0.17 * 0.9))
    uI.append([len(uP) - 3, len(uP) - 2, len(uP) - 1])
Image.fromarray(np.full((16, 16, 3), (160, 66, 27), np.uint8)).save(D + '/tex_px/hair_base.png')
M = json.load(open(D + '/mats_px.json')); M['hairbase'] = dict(tex='hair_cards.png', rough=0.6, ds=True); json.dump(M, open(D + '/mats_px.json', 'w'), indent=1)
nu = len(uP)
# ---------------- packen (Gewicht: Kopf)
bmt = bmesh.new(); bmt.from_mesh(me); bmesh.ops.triangulate(bmt, faces=bmt.faces[:]); bmt.to_mesh(me); bmt.free(); uvd = me.uv_layers.active.data
P, Nn, UV, I = [], [], [], []
for poly in me.polygons:
    tri = []
    for li in poly.loop_indices:
        v = me.vertices[me.loops[li].vertex_index]; p = v.co; n = v.normal; uv = uvd[li].uv
        P.append((p.x, p.z, -p.y)); Nn.append((n.x, n.z, -n.y)); UV.append((uv[0], 1 - uv[1])); tri.append(len(P) - 1)
    I.append(tri)
n = len(P); J = np.array([['Head', '', '', '']] * n); Wt = np.zeros((n, 4), np.float32); Wt[:, 0] = 1
Ju = np.array([['Head', '', '', '']] * nu); Wu = np.zeros((nu, 4), np.float32); Wu[:, 0] = 1
np.savez_compressed(D + '/parts_hair.npz', **{'hairbase__P': np.array(uP, np.float32), 'hairbase__N': np.array(uN, np.float32), 'hairbase__UV': np.array(uUV, np.float32), 'hairbase__J': Ju, 'hairbase__W': Wu, 'hairbase__I': np.array(uI, np.uint32).reshape(-1), 'hairbase__mat': np.array('hairbase'),'haircards__P': np.array(P, np.float32), 'haircards__N': np.array(Nn, np.float32), 'haircards__UV': np.array(UV, np.float32),
                    'haircards__J': J, 'haircards__W': Wt, 'haircards__I': np.array(I, np.uint32).reshape(-1), 'haircards__mat': np.array('haircards')})
print('HAIR', n, 'verts', len(I), 'tris')
