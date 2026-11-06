"""Alice 'Paralax'-Look nach Referenzbild: übergroße lila Argyle-Kapuzenjacke (offen), schwarze Gurte mit Schnallen,
lila X-Laschen + hängende Bänder, Ärmelbänder, gestreifte Bündchen, Mond-Decals, Planeten-Patch, weißer Minirock mit Gürtel,
Choker mit Herz, Perlenkette, Oberschenkel-Strap mit Herzring + Kristall.
Ausgabe: fin/parts_px.npz + fin/tex_px/*.png + fin/mats_px.json      python3 fin/build_paralax.py"""
import bpy, bmesh, math, os, json, numpy as np
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
from PIL import Image, ImageDraw
from scipy.ndimage import gaussian_filter, gaussian_filter1d
D = '/home/claude/alice_vrm/fin'; TX = D + '/tex_px'; os.makedirs(TX, exist_ok=True)
rng = np.random.default_rng(7)
bpy.ops.wm.open_mainfile(filepath=D + '/base.blend')
body = bpy.data.objects['AvatarBody']; outfit = bpy.data.objects['outfit']; head = bpy.data.objects['AvatarHead']; arm = bpy.data.objects['Armature']
def bvh_of(*objs):
    bm = bmesh.new()
    for o in objs:
        t = bmesh.new(); t.from_mesh(o.data); t.transform(o.matrix_world); tm = bpy.data.meshes.new('tmp'); t.to_mesh(tm); t.free(); bm.from_mesh(tm)
    return BVHTree.FromBMesh(bm)
T_out, T_body = bvh_of(outfit), bvh_of(body); T_U = bvh_of(body, outfit); T_N = bvh_of(body, head, outfit)
PARTS = {}
def weights_of(o):
    names = [g.name for g in o.vertex_groups]; return [{names[g.group]: g.weight for g in v.groups if g.weight > 1e-4} for v in o.data.vertices]
def pack(name, o, mat, weight_fn=None, flat=False):
    me = o.data; bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.triangulate(bm, faces=bm.faces[:]); bm.to_mesh(me); bm.free()
    mw = o.matrix_world; nm = mw.to_3x3().inverted().transposed(); W = weights_of(o) if weight_fn is None else None
    uvl = me.uv_layers.active.data if me.uv_layers else None; P, N, UV, J, WT, I = [], [], [], [], [], []
    for poly in me.polygons:
        tri = []
        for li in poly.loop_indices:
            vi = me.loops[li].vertex_index; v = me.vertices[vi]; p = mw @ v.co
            n = (nm @ (poly.normal if (flat or not poly.use_smooth) else v.normal)).normalized()
            uv = tuple(uvl[li].uv) if uvl else (0, 0); w = weight_fn(p) if weight_fn else (W[vi] or {'Hips': 1.0})
            top = sorted(w.items(), key=lambda kv: -kv[1])[:4]; s = sum(x for _, x in top) or 1
            P.append((p.x, p.z, -p.y)); N.append((n.x, n.z, -n.y)); UV.append((uv[0], 1 - uv[1]))
            J.append([k for k, _ in top] + [''] * (4 - len(top))); WT.append([x / s for _, x in top] + [0] * (4 - len(top))); tri.append(len(P) - 1)
        I.append(tri)
    PARTS[name] = dict(P=np.array(P, np.float32), N=np.array(N, np.float32), UV=np.array(UV, np.float32), J=np.array(J), W=np.array(WT, np.float32),
                       I=np.array(I, np.uint32).reshape(-1), mat=np.array(mat))
    print('PART', name, len(P), 'verts', len(I), 'tris')
def link(name, bm):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free(); o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o); return o
def solid(o, th, off=-1):
    bpy.ops.object.select_all(action='DESELECT'); bpy.context.view_layer.objects.active = o; o.select_set(True)
    s = o.modifiers.new('s', 'SOLIDIFY'); s.thickness = th; s.offset = off; s.use_even_offset = True; bpy.ops.object.modifier_apply(modifier='s')
def smooth(o, on=True):
    for p in o.data.polygons: p.use_smooth = on
# Gewichtsquelle: Outfit + Körper vereint
SRC = outfit.copy(); SRC.data = outfit.data.copy(); bpy.context.scene.collection.objects.link(SRC); b2 = body.copy(); b2.data = body.data.copy(); bpy.context.scene.collection.objects.link(b2)
for o in (SRC, b2):
    for m in list(o.modifiers): o.modifiers.remove(m)
bpy.ops.object.select_all(action='DESELECT'); SRC.select_set(True); b2.select_set(True); bpy.context.view_layer.objects.active = SRC; bpy.ops.object.join()
def dt_weights(o, hips_below=None):
    bpy.ops.object.select_all(action='DESELECT'); bpy.context.view_layer.objects.active = o; o.select_set(True)
    for g in list(o.vertex_groups): o.vertex_groups.remove(g)
    dt = o.modifiers.new('dt', 'DATA_TRANSFER'); dt.object = SRC; dt.use_vert_data = True; dt.data_types_verts = {'VGROUP_WEIGHTS'}
    dt.vert_mapping = 'POLYINTERP_NEAREST'; dt.layers_vgroup_select_src = 'ALL'; dt.layers_vgroup_select_dst = 'NAME'
    bpy.ops.object.datalayout_transfer(modifier='dt'); bpy.ops.object.modifier_apply(modifier='dt')
    W = weights_of(o)
    if hips_below is not None:
        mw = o.matrix_world
        for i, v in enumerate(o.data.vertices):
            z = (mw @ v.co).z
            if z < hips_below:
                t = min(1, (hips_below - z) / 0.30) * 0.8; d = {k: w * (1 - t) for k, w in W[i].items()}; d['Hips'] = d.get('Hips', 0) + t; W[i] = d
    return lambda p, _W=W, _o=o: None, W
def pack_w(name, o, mat, W):
    """pack mit vorberechneten Gewichten pro Vertex (W-Liste)."""
    o['_W'] = 0; names = None
    vg = {}
    for g in list(o.vertex_groups): o.vertex_groups.remove(g)
    for i, d in enumerate(W):
        for k, w in d.items():
            if k not in vg: vg[k] = o.vertex_groups.new(name=k)
            vg[k].add([i], w, 'REPLACE')
    pack(name, o, mat)

# ================================================================ Texturen
def save(a, name): Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).save(f'{TX}/{name}.png')
S = 1024; v_, u_ = np.mgrid[0:S, 0:S] / S
n_ = 3; A_ = (u_ + v_) * n_; B_ = (u_ - v_) * n_
cell = (np.floor(A_) + np.floor(B_)) % 2
lilac = np.array([178, 156, 228], float); pale = np.array([218, 208, 244], float)
arg = np.where(cell[..., None] > 0, lilac, pale)
fa = (A_ + 0.5) % 1; fb = (B_ + 0.5) % 1
line = (np.minimum(fa, 1 - fa) < 0.012) | (np.minimum(fb, 1 - fb) < 0.012)
arg = np.where(line[..., None], np.array([250, 250, 255.]), arg)
noise = gaussian_filter(rng.standard_normal((S, S)), 1.0) * 2.5 + gaussian_filter(rng.standard_normal((S, S)), 40) * 25
arg += noise[..., None]; save(arg, 'jacket')
save(np.ones((64, 64, 3)) * [56, 42, 78] + rng.standard_normal((64, 64, 1)) * 3, 'lining')
blk = np.ones((128, 128, 3)) * [26, 26, 30]; blk += (np.sin(np.arange(128) * 2.2)[None, :, None] * 3 + rng.standard_normal((128, 128, 1)) * 2); save(blk, 'black')
save(np.ones((32, 32, 3)) * [152, 112, 222], 'purple'); save(np.ones((32, 32, 3)) * [205, 207, 214], 'silver')
save(np.ones((32, 32, 3)) * [242, 238, 230], 'pearl'); save(np.ones((32, 32, 3)) * [150, 125, 255], 'crystal')
sk = np.ones((512, 512, 3)) * [242, 242, 244]; sk += gaussian_filter(rng.standard_normal((512, 512)), 0.8)[..., None] * 3; save(sk, 'skirt')
cuff = np.ones((64, 128, 3)) * [24, 24, 28]
for c0, c1 in ((14, 26), (40, 52)): cuff[:, c0:c1] = [140, 100, 215]
save(cuff, 'cuff')
im = Image.new('RGBA', (256, 256), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
d.ellipse((28, 28, 228, 228), fill=(250, 238, 200, 255)); d.ellipse((78, 8, 268, 198), fill=(0, 0, 0, 0)); im.save(f'{TX}/moon.png')
im = Image.new('RGB', (512, 288), (40, 34, 62)); d = ImageDraw.Draw(im)
d.rectangle((6, 6, 505, 281), outline=(190, 170, 240), width=6)
d.ellipse((196, 84, 316, 204), outline=(205, 185, 245), width=14); d.ellipse((130, 128, 382, 160), outline=(205, 185, 245), width=9)
d.ellipse((380, 40, 440, 100), fill=(250, 238, 200)); d.ellipse((398, 30, 452, 88), fill=(40, 34, 62))
d.ellipse((60, 200, 76, 216), fill=(205, 185, 245)); im.save(f'{TX}/planet.png')
MATS = {'jacket': dict(tex='jacket.png', rough=0.62, ds=True), 'lining': dict(tex='lining.png', rough=0.85, ds=True),
        'black': dict(tex='black.png', rough=0.55, ds=True), 'purple': dict(tex='purple.png', rough=0.5, ds=True),
        'silver': dict(tex='silver.png', rough=0.28, metal=1.0), 'pearl': dict(tex='pearl.png', rough=0.22),
        'crystal': dict(tex='crystal.png', rough=0.08, emissive=[0.45, 0.3, 1.0], es=1.6), 'skirt': dict(tex='skirt.png', rough=0.8, ds=True),
        'cuff': dict(tex='cuff.png', rough=0.6), 'moon': dict(tex='moon.png', rough=0.6, alpha='MASK'), 'planet': dict(tex='planet.png', rough=0.6)}
json.dump(MATS, open(D + '/mats_px.json', 'w'), indent=1)

# ================================================================ 1) Jacke (Rumpf-Loft + Schoß)
NA = 72; ANG = np.linspace(-math.pi, math.pi, NA, endpoint=False)
ZT = np.arange(1.445, 0.905 - 1e-6, -0.012)
R = np.zeros((len(ZT), NA)); C = []
for zi, z in enumerate(ZT):
    sl = [outfit.matrix_world @ v.co for v in outfit.data.vertices if abs((outfit.matrix_world @ v.co).z - z) < 0.01 and abs((outfit.matrix_world @ v.co).x) < 0.2]
    cy = float(np.mean([p.y for p in sl])) if sl else 0.0; C.append((0.0, cy))
    for ai, a_ in enumerate(ANG):
        dd = Vector((math.cos(a_), math.sin(a_), 0)); o = Vector((0, cy, z)); h = T_U.ray_cast(o, dd, 0.35)
        R[zi, ai] = (h[0] - o).length if h[0] is not None else 0.12
R = np.minimum(R, np.where(np.abs(np.cos(ANG))[None, :] > 0.7, 0.22, 0.2))
R = gaussian_filter(R, (1.5, 1.2), mode=('nearest', 'wrap')) + 0.026 + 0.022 * np.clip((1.30 - ZT[:, None]) / 0.3, 0, 1)
C = np.array(C); C[:, 1] = gaussian_filter1d(C[:, 1], 2, mode='nearest')
def wfront(z): return float(np.interp(z, [0.6, 0.95, 1.15, 1.32, 1.42, 1.48], [0.13, 0.115, 0.10, 0.085, 0.07, 0.065]))
NO = 84; bm = bmesh.new(); rows = []; ZB = 0.715; SR = 12
def add_row(z, cy, radii, flare=1.0, back=0.0):
    row = []; rf = float(np.interp(-math.pi / 2, ANG, radii)) * flare; phi = math.asin(min(0.95, wfront(z) / max(rf, 0.05)))
    for k in range(NO + 1):
        a_ = -math.pi / 2 + phi + (2 * math.pi - 2 * phi) * k / NO; aw = (a_ + math.pi) % (2 * math.pi) - math.pi
        r = float(np.interp(aw, ANG, radii, period=2 * math.pi)) * flare
        ox = 0.05 * abs(math.cos(a_)) ** 0.7 * float(np.clip((1.40 - z) / 0.12, 0, 1))
        row.append(bm.verts.new(((r + ox) * math.cos(a_), cy + r * math.sin(a_) * (1 + 0.08 * float(np.clip((1.30 - z) / 0.3, 0, 1))) + back, z)))
    rows.append(row)
add_row(ZT[0] + 0.035, C[0, 1] + 0.012, R[0] * 0.95)
for zi, z in enumerate(ZT): add_row(z, C[zi, 1], R[zi])
for k in range(1, SR + 1):
    t = k / SR; add_row(ZT[-1] - (ZT[-1] - ZB) * t, C[-1, 1], R[-1], flare=1 + 0.24 * t ** 1.2, back=0.02 * t)
for r0, r1 in zip(rows[:-1], rows[1:]):
    for i in range(NO): bm.faces.new((r0[i], r0[i + 1], r1[i + 1], r1[i]))
NS = 24; SLEEVE = {}
def bpos(n): return arm.matrix_world @ arm.data.bones[n].head_local
for side in ('Left', 'Right'):
    A = [bpos(side + 'Arm'), bpos(side + 'ForeArm'), bpos(side + 'Hand')]; sg = 1 if side == 'Left' else -1
    xs = np.linspace(0.12, abs(A[2].x) - 0.035, 36) * sg; srows = []
    for x in xs:
        if abs(x) < abs(A[1].x): q = A[0].lerp(A[1], max(0, (abs(x) - abs(A[0].x)) / (abs(A[1].x) - abs(A[0].x))))
        else: q = A[1].lerp(A[2], (abs(x) - abs(A[1].x)) / (abs(A[2].x) - abs(A[1].x)))
        q = Vector((x, q.y, q.z)); row = []
        for k in range(NS):
            ph = 2 * math.pi * k / NS; h = T_U.ray_cast(q, Vector((0, math.cos(ph), math.sin(ph))), 0.12)
            r = (h[0] - q).length if h[0] is not None else 0.045
            if abs(x) < 0.2: r = min(r, 0.075)
            row.append(r)
        srows.append((q, np.array(row)))
    Rs = gaussian_filter(np.array([r for _, r in srows]), (1.5, 1.0), mode=('nearest', 'wrap'))
    tt = np.linspace(0, 1, len(xs))[:, None]
    Rs = Rs + 0.024 + 0.016 * np.sin(np.clip(tt, 0, 1) * math.pi) ** 0.8 - 0.012 * np.clip((tt - 0.9) / 0.1, 0, 1)   # bauschig, am Bündchen gerafft
    SLEEVE[side] = [(q, rr) for (q, _), rr in zip(srows, Rs)]
    vrows = [[bm.verts.new(q + Vector((0, math.cos(2 * math.pi * k / NS), math.sin(2 * math.pi * k / NS))) * rr[k]) for k in range(NS)] for q, rr in SLEEVE[side]]
    for r0, r1 in zip(vrows[:-1], vrows[1:]):
        for i in range(NS):
            j_ = (i + 1) % NS; bm.faces.new((r0[i], r0[j_], r1[j_], r1[i]) if sg > 0 else (r0[j_], r0[i], r1[i], r1[j_]))
TOPROW = [v.co.copy() for v in rows[0]]
bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:]); jacket = link('Alice_Jacket', bm)
jacket.data.uv_layers.new(name='UV'); uvd = jacket.data.uv_layers.active.data
for poly in jacket.data.polygons:
    for li in poly.loop_indices:
        p = jacket.data.vertices[jacket.data.loops[li].vertex_index].co
        if abs(p.x) > 0.2: uvd[li].uv = (abs(p.x) * 2.2, (math.atan2(p.z - 1.43, p.y) / (2 * math.pi)) * 0.7)
        else: uvd[li].uv = ((math.atan2(p.y, p.x) / (2 * math.pi)) * 2.0, p.z * 2.5)
solid(jacket, 0.007); smooth(jacket)
_, WJ = dt_weights(jacket, hips_below=0.95); pack_w('jacket', jacket, 'jacket', WJ)
T_J = bvh_of(jacket)

# ================================================================ 2) Kapuze (hinten) + dunkles Futter am Kragen
bpy.ops.mesh.primitive_uv_sphere_add(segments=40, ring_count=20, radius=1, location=(0, 0.085, 1.425))
hood = bpy.context.object; hood.scale = (0.15, 0.072, 0.07); hood.rotation_euler = (math.radians(-15), 0, 0)
bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
bm = bmesh.new(); bm.from_mesh(hood.data)
for v in bm.verts:
    a = math.atan2(v.co.z, v.co.x); v.co.y += 0.007 * math.sin(a * 8) * (1 if v.co.y > 0 else 0.3)
    if v.co.y < -0.025: v.co.y = -0.025 + (v.co.y + 0.025) * 0.3
bm.to_mesh(hood.data); bm.free(); smooth(hood)
hood.data.uv_layers.new(name='UV'); uvd = hood.data.uv_layers.active.data
for poly in hood.data.polygons:
    for li in poly.loop_indices:
        p = hood.data.vertices[hood.data.loops[li].vertex_index].co; uvd[li].uv = (p.x * 2.5 + 0.5, p.z * 2.5)
pack('hood', hood, 'jacket', weight_fn=lambda p: {'Spine2': 0.7, 'Neck': 0.3})
# Kragen-Futter: Band innen an der Kragenkante (dunkellila), sichtbar im offenen Kragen
bm = bmesh.new(); L = []; U = []; NCo = 40
for k in range(NCo + 1):
    a_ = -math.pi / 2 + math.radians(38) + (2 * math.pi - 2 * math.radians(38)) * k / NCo; dd = Vector((math.cos(a_), math.sin(a_), 0))
    o_ = Vector((0, 0.012, 1.455)); h = T_N.ray_cast(o_ + dd * 0.2, -dd, 0.2); r0 = (h[0] - o_).length if h[0] is not None else 0.055
    L.append(bm.verts.new(o_ + dd * (r0 + 0.030) + Vector((0, 0, -0.03)))); U.append(bm.verts.new(o_ + dd * (r0 + 0.022) + Vector((0, 0, 0.035))))
for k in range(NCo): bm.faces.new((L[k], L[k + 1], U[k + 1], U[k]))
col = link('Collar', bm); col.data.uv_layers.new(name='UV'); smooth(col); solid(col, 0.004)
pack('collar', col, 'lining', weight_fn=lambda p: {'Spine2': 0.6, 'Neck': 0.4})

# ================================================================ 3) Ärmelbänder (schwarz), Bündchen (gestreift), Decals
def arm_ring(name, side, x0, x1, extra, mat, nrow=4):
    rows_ = SLEEVE[side]; xs_ = np.array([abs(q.x) for q, _ in rows_]); bm = bmesh.new(); G = []
    for i in range(nrow):
        x = x0 + (x1 - x0) * i / (nrow - 1); k = int(np.clip(np.searchsorted(xs_, x), 1, len(xs_) - 1)); f = (x - xs_[k - 1]) / (xs_[k] - xs_[k - 1])
        q = rows_[k - 1][0].lerp(rows_[k][0], f); rr = rows_[k - 1][1] * (1 - f) + rows_[k][1] * f; bulge = math.sin(math.pi * i / (nrow - 1)) * 0.002
        G.append([bm.verts.new(q + Vector((0, math.cos(2 * math.pi * s / NS), math.sin(2 * math.pi * s / NS))) * (rr[s] + extra + bulge)) for s in range(NS)])
    for r0, r1 in zip(G[:-1], G[1:]):
        for s in range(NS):
            t_ = (s + 1) % NS; bm.faces.new((r0[s], r0[t_], r1[t_], r1[s]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:]); o = link(name, bm); o.data.uv_layers.new(name='UV'); uvd = o.data.uv_layers.active.data
    for poly in o.data.polygons:
        for li in poly.loop_indices:
            vi = o.data.loops[li].vertex_index; i, s = divmod(vi, NS); uvd[li].uv = (i / (nrow - 1), s / NS)
    smooth(o); solid(o, 0.003); return o
for side, sg in (('Left', 1), ('Right', -1)):
    o = arm_ring(f'Band{side}', side, 0.335, 0.37, 0.006, 'black'); _, W_ = dt_weights(o); pack_w(f'band{sg}', o, 'black', W_)
    xe = abs(SLEEVE[side][-1][0].x); o = arm_ring(f'Cuff{side}', side, xe - 0.045, xe + 0.002, 0.008, 'cuff', 6); _, W_ = dt_weights(o); pack_w(f'cuff{sg}', o, 'cuff', W_)
def decal(name, center, w, h, mat, ray_dir=Vector((0, 1, 0)), rot=0.0, n=6):
    """Quad-Raster, auf die Jacke projiziert (Ray in ray_dir)."""
    bm = bmesh.new(); G = []; up = Vector((0, 0, 1)); right = ray_dir.cross(up).normalized() * -1
    rm = Matrix.Rotation(rot, 3, ray_dir)
    for i in range(n + 1):
        row = []
        for k in range(n + 1):
            off = rm @ (right * (w * (i / n - 0.5)) + up * (h * (k / n - 0.5))); o_ = center + off - ray_dir * 0.4
            hh = T_J.ray_cast(o_, ray_dir, 0.8); p = hh[0] if hh[0] is not None else center + off
            nr = hh[1] if hh[0] is not None else -ray_dir; row.append(bm.verts.new(p + nr * 0.0025))
        G.append(row)
    for i in range(n):
        for k in range(n): bm.faces.new((G[i][k], G[i + 1][k], G[i + 1][k + 1], G[i][k + 1]))
    o = link(name, bm)
    if sum(p_.normal.dot(ray_dir) for p_ in o.data.polygons) > 0: [p_.flip() for p_ in o.data.polygons]
    o.data.uv_layers.new(name='UV'); uvd = o.data.uv_layers.active.data
    for poly in o.data.polygons:
        for li in poly.loop_indices:
            vi = o.data.loops[li].vertex_index; i, k = divmod(vi, n + 1); uvd[li].uv = (i / n, k / n)
    smooth(o); return o
for side, sg in (('Left', 1), ('Right', -1)):
    q = SLEEVE[side][8][0]; o = decal(f'Moon{side}', Vector((q.x, q.y, q.z + 0.012)), 0.06, 0.06, 'moon', Vector((0, 1, -0.25)).normalized())
    _, W_ = dt_weights(o); pack_w(f'moon{sg}', o, 'moon', W_)
q = SLEEVE['Left'][19][0]; o = decal('Planet', Vector((q.x, q.y, q.z + 0.006)), 0.11, 0.062, 'planet', Vector((0, 1, -0.2)).normalized())
_, W_ = dt_weights(o); pack_w('planet', o, 'planet', W_)

# ================================================================ 4) Gurte (schwarz) + Schnallen + lila X-Laschen + hängende Bänder
def front_hit(x, z, T=T_J):
    h = T.ray_cast(Vector((x, -0.6, z)), Vector((0, 1, 0)), 1.2); return (h[0], h[1]) if h[0] is not None else (None, None)
def ribbon(name, P3, w, off=0.0045):
    """P3: Liste (punkt, normale). Flaches Band, Breite w."""
    Q = []
    for p_, n_ in P3:
        if not Q or (p_ - Q[-1][0]).length > 0.0015: Q.append((p_, n_))
    P3 = Q
    bm = bmesh.new(); L, Rr = [], []
    for i, (p, nr) in enumerate(P3):
        a = P3[max(i - 1, 0)][0]; b_ = P3[min(i + 1, len(P3) - 1)][0]; t = (b_ - a).normalized(); sd = t.cross(nr).normalized() * w / 2
        L.append(bm.verts.new(p + nr * off - sd)); Rr.append(bm.verts.new(p + nr * off + sd))
    for i in range(len(L) - 1): bm.faces.new((L[i], Rr[i], Rr[i + 1], L[i + 1]))
    o = link(name, bm)
    if sum(p_.normal.y for p_ in o.data.polygons) > 0: [p_.flip() for p_ in o.data.polygons]
    o.data.uv_layers.new(name='UV'); smooth(o); solid(o, 0.0025); return o
def strap_path(x_of_z, z0, z1, hang_to=None, T=T_J, n=26, ang=None):
    P3 = []; last = None
    for z in np.linspace(z0, z1, n):
        if ang is not None:
            sgn, da = ang; zz = min(z, ZT[0]); cy = float(np.interp(zz, ZT[::-1], C[::-1, 1])) if zz > ZT[-1] else C[-1, 1]
            rf = 0.17; phi = math.asin(min(0.95, wfront(z) / rf)); a_ = -math.pi / 2 + sgn * (phi + da)
            o_ = Vector((0, cy, z)); dd = Vector((math.cos(a_), math.sin(a_), 0)); hh = T.ray_cast(o_ + dd * 0.5, -dd, 0.5)
            p, nr = (hh[0], hh[1]) if hh[0] is not None else (None, None)
        else: p, nr = front_hit(x_of_z(z), z, T)
        if p is None: continue
        P3.append((p, nr)); last = (p, nr)
    if len(P3) > 4:
        PP = np.array([tuple(p) for p, _ in P3]); PS = np.stack([gaussian_filter1d(PP[:, c], 1.6, mode='nearest') for c in range(3)], 1)
        P3 = [(Vector(tuple(PS[i])), P3[i][1]) for i in range(len(P3))]; last = P3[-1]
    if hang_to is not None and last is not None:
        p, nr = last; hn = Vector((0, -1, 0))
        for z in np.linspace(p.z - 0.02, hang_to, 8): P3.append((Vector((p.x, p.y, z)), hn))
    return P3
def surf(sgn, da, z):
    P = strap_path(None, z, z, None, n=1, ang=(sgn, da)); return P[0] if P else (None, None)
def box(name, loc, size, mat, nrm=Vector((0, -1, 0))):
    bpy.ops.mesh.primitive_cube_add(location=loc, scale=size); o = bpy.context.object; o.name = name; o.data.uv_layers.new(name='UV')
    o.rotation_euler = Vector((0, -1, 0)).rotation_difference(nrm).to_euler(); bpy.ops.object.transform_apply(rotation=True); return o
def frame_buckle(name, p, nr, w=0.026, h=0.02):
    """Rechteck-Schnallenrahmen (silber)."""
    bm = bmesh.new(); up = Vector((0, 0, 1)); rt = up.cross(nr).normalized(); res = []
    for (ox, oz, sx, sz) in ((0, h / 2, w, 0.004), (0, -h / 2, w, 0.004), (w / 2, 0, 0.004, h), (-w / 2, 0, 0.004, h)):
        c = p + nr * 0.008 + rt * ox + up * oz
        bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.Translation(c) @ Matrix(((rt.x * sx, up.x * sz, nr.x * 0.004, 0), (rt.y * sx, up.y * sz, nr.y * 0.004, 0), (rt.z * sx, up.z * sz, nr.z * 0.004, 0), (0, 0, 0, 1))))
    o = link(name, bm); o.data.uv_layers.new(name='UV'); return o
JW = lambda p: ({'Hips': 1.0} if p.z < 1.0 else ({'Spine': 0.5, 'Spine1': 0.5} if p.z < 1.18 else {'Spine2': 1.0}))
for sg in (-1, 1):
    specs = [(0.07, 1.40, 0.73, 0.64), (0.24, 1.36, 0.73, 0.58), (0.42, 1.30, 0.74, None)]
    for k, (da, z0, z1, hang) in enumerate(specs):
        P3 = strap_path(None, z0, z1, hang, ang=(sg, da)); print('strap', sg, k, len(P3))
        if len(P3) < 3: continue
        o = ribbon(f'Strap{sg}{k}', P3, 0.024); pack(f'strap{sg}_{k}', o, 'black', weight_fn=JW)
        for zb in ((1.02, 0.80) if k != 1 else (0.90,)):
            p, nr = surf(sg, da, zb)
            if p is not None: pack(f'buckle{sg}_{k}_{int(zb * 100)}', frame_buckle(f'Bk{sg}{k}{zb}', p, nr), 'silver', weight_fn=JW)
        if hang:
            pe = P3[-1][0]; pack(f'tip{sg}_{k}', box(f'Tip{sg}{k}', pe + Vector((0, -0.004, 0.006)), (0.014, 0.004, 0.008), 'silver'), 'silver', weight_fn=JW)
    for zc, da in ((0.88, 0.28), (1.05, 0.46)):
        p0, n0 = surf(sg, da, zc)
        if p0 is None: continue
        tng = Vector((0, 0, 1)).cross(n0).normalized()
        for s2 in (-1, 1):
            P3 = [(p0 + (tng * s2 + Vector((0, 0, 1))) * t * 0.025, n0) for t in np.linspace(-1, 1, 6)]
            o = ribbon(f'X{sg}{zc}{s2}', P3, 0.012, 0.009); pack(f'xtab{sg}_{int(zc * 100)}_{s2}', o, 'purple', weight_fn=JW)
    # lila hängendes Band seitlich
    P3 = strap_path(None, 0.93, 0.72, 0.43, n=14, ang=(sg, 0.72))
    if P3: o = ribbon(f'Ribbon{sg}', P3, 0.03, 0.006); pack(f'ribbon{sg}', o, 'purple', weight_fn=JW)
    # kurze lila Lasche an der Brust (Ref: oben am Gurt)
    P3 = strap_path(None, 1.10, 0.98, None, n=6, ang=(sg, 0.19))
    if P3: o = ribbon(f'Tab{sg}', P3, 0.022, 0.0075); pack(f'tab{sg}', o, 'purple', weight_fn=JW)

# ================================================================ 5) Minirock + Gürtel
ZS = np.linspace(1.035, 0.755, 16); NR = 64; ANR = np.linspace(-math.pi, math.pi, NR, endpoint=False); bm = bmesh.new(); G = []
for i, z in enumerate(ZS):
    sl = [outfit.matrix_world @ v.co for v in outfit.data.vertices if abs((outfit.matrix_world @ v.co).z - min(z, 0.98)) < 0.01]
    cy = float(np.mean([p.y for p in sl])) if sl else 0.0; t = i / (len(ZS) - 1); rr = []
    for a_ in ANR:
        o_ = Vector((0, cy, max(z, 0.86))); h = T_U.ray_cast(o_ + Vector((math.cos(a_), math.sin(a_), 0)) * 0.4, -Vector((math.cos(a_), math.sin(a_), 0)), 0.4)
        rr.append((h[0] - o_).length if h[0] is not None else 0.17)
    rr = gaussian_filter1d(np.array(rr), 1.5, mode='wrap'); rr = np.maximum.accumulate(rr) if False else rr
    G.append((z, cy, rr))
R0 = np.array([g[2] for g in G]); R0 = np.maximum.accumulate(R0, axis=0)   # nach unten nie enger (Rock fällt über Gesäß)
vs = []
for i, (z, cy, _) in enumerate(G):
    t = i / (len(G) - 1); rr = R0[i] * (1 + 0.06 * t ** 1.1) + 0.008 + 0.003 * t
    vs.append([bm.verts.new((r * math.cos(a_), cy + r * math.sin(a_), z)) for r, a_ in zip(rr, ANR)])
for r0, r1 in zip(vs[:-1], vs[1:]):
    for s in range(NR):
        t_ = (s + 1) % NR; bm.faces.new((r0[s], r0[t_], r1[t_], r1[s]))
bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:]); skirt = link('Skirt', bm); skirt.data.uv_layers.new(name='UV'); uvd = skirt.data.uv_layers.active.data
for poly in skirt.data.polygons:
    for li in poly.loop_indices:
        p = skirt.data.vertices[skirt.data.loops[li].vertex_index].co; uvd[li].uv = (math.atan2(p.y, p.x) / (2 * math.pi) * 3, p.z * 3)
smooth(skirt); solid(skirt, 0.005)
_, WS = dt_weights(skirt)
for i, v in enumerate(skirt.data.vertices):   # oben Hüfte, unten Mix Hüfte/Oberschenkel
    z = v.co.z; t = min(1, max(0, (0.98 - z) / 0.22)); d = {k: w * t * 0.6 for k, w in WS[i].items()}; d['Hips'] = d.get('Hips', 0) + 1 - 0.6 * t; WS[i] = d
pack_w('skirt', skirt, 'skirt', WS)
T_S = bvh_of(skirt)
# Gürtel
zb = 1.012; bm = bmesh.new(); lo, hi = [], []
for k in range(64):
    a_ = 2 * math.pi * k / 64; dd = Vector((math.cos(a_), math.sin(a_), 0)); o_ = Vector((0, G[1][1], zb)); h = T_S.ray_cast(o_ + dd * 0.4, -dd, 0.4)
    p = (h[0] if h[0] is not None else o_ + dd * 0.17) + dd * 0.004; lo.append(bm.verts.new(p - Vector((0, 0, 0.014)))); hi.append(bm.verts.new(p + Vector((0, 0, 0.014))))
for k in range(64): k2 = (k + 1) % 64; bm.faces.new((lo[k], lo[k2], hi[k2], hi[k]))
bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:]); belt = link('Belt', bm); belt.data.uv_layers.new(name='UV'); smooth(belt); solid(belt, 0.003)
pack('belt', belt, 'black', weight_fn=lambda p: {'Hips': 1.0})
p, nr = front_hit(0.0, zb, T_S)
if p is not None:
    pack('beltbuckle', frame_buckle('BeltBuckle', p + nr * 0.002, nr, 0.034, 0.026), 'silver', weight_fn=lambda p: {'Hips': 1.0})
    pack('beltprong', box('Prong', p + nr * 0.011, (0.0015, 0.002, 0.011), 'silver'), 'silver', weight_fn=lambda p: {'Hips': 1.0})
# kurze schwarze Laschen vorn am Rock mit lila X
for sx in (-0.045, 0.06):
    P3 = strap_path(lambda z: sx, 1.0, 0.82, None, T_S, 12)
    if P3:
        o = ribbon(f'SkStrap{sx}', P3, 0.02); pack(f'skstrap{int(sx * 1000)}', o, 'black', weight_fn=lambda p: {'Hips': 1.0})
        for s2 in (-1, 1):
            Q = [front_hit(sx + s2 * t * 0.009, 0.90 + t * 0.013, T_S) for t in np.linspace(-1, 1, 5)]; Q = [(a, b_) for a, b_ in Q if a is not None]
            if len(Q) > 2: o = ribbon(f'SkX{sx}{s2}', Q, 0.005, 0.0075); pack(f'skx{int(sx * 1000)}_{s2}', o, 'purple', weight_fn=lambda p: {'Hips': 1.0})

# ================================================================ 6) Choker + Herz, Perlenkette
zc = 1.478; cyn = 0.0; bm = bmesh.new(); lo, hi = [], []; NC = 48
pts_n = []
for k in range(NC):
    a_ = 2 * math.pi * k / NC; dd = Vector((math.cos(a_), math.sin(a_), 0)); o_ = Vector((0, 0.012, zc)); h = T_N.ray_cast(o_ + dd * 0.2, -dd, 0.2)
    pts_n.append((h[0] if h[0] is not None else o_ + dd * 0.055) + dd * 0.0035)
for p in pts_n: lo.append(bm.verts.new(p - Vector((0, 0, 0.0075)))); hi.append(bm.verts.new(p + Vector((0, 0, 0.0075))))
for k in range(NC): k2 = (k + 1) % NC; bm.faces.new((lo[k], lo[k2], hi[k2], hi[k]))
bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:]); ch_ = link('Choker', bm); ch_.data.uv_layers.new(name='UV'); smooth(ch_); solid(ch_, 0.002)
NECKW = lambda p: {'Neck': 1.0}
pack('choker', ch_, 'black', weight_fn=NECKW)
def heart_curve(name, center, size, nrm, bevel, mat):
    cu = bpy.data.curves.new(name, 'CURVE'); cu.dimensions = '3D'; cu.bevel_depth = bevel; cu.bevel_resolution = 2
    sp = cu.splines.new('POLY'); up = Vector((0, 0, 1)); rt = up.cross(nrm).normalized(); ts = np.linspace(0, 2 * math.pi, 40, endpoint=False)
    sp.points.add(len(ts) - 1)
    for pt, t in zip(sp.points, ts):
        hx = 16 * math.sin(t) ** 3; hz = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
        q = center + rt * hx * size / 32 + up * hz * size / 32; pt.co = (*q, 1)
    sp.use_cyclic_u = True; o = bpy.data.objects.new(name, cu); bpy.context.scene.collection.objects.link(o)
    bpy.ops.object.select_all(action='DESELECT'); bpy.context.view_layer.objects.active = o; o.select_set(True); bpy.ops.object.convert(target='MESH')
    o = bpy.context.object; o.data.uv_layers.new(name='UV'); smooth(o); return o
pfront = min(pts_n, key=lambda p: p.y)
pack('chokerheart', heart_curve('ChokerHeart', pfront + Vector((0, -0.004, -0.010)), 0.016, Vector((0, -1, 0)), 0.0016, 'silver'), 'silver', weight_fn=NECKW)
# Perlenkette: Bogen über Schlüsselbein/Dekolleté
bm = bmesh.new(); npl = 0
for t in np.linspace(-1, 1, 33):
    x = 0.062 * math.sin(t * math.pi / 2) ; z = 1.452 - 0.050 * math.cos(t * math.pi / 2) ** 1.4 + 0.004 * abs(t)
    h = T_N.ray_cast(Vector((x, -0.4, z)), Vector((0, 1, 0)), 0.8)
    if h[0] is None: continue
    c = h[0] + h[1] * 0.004; bmesh.ops.create_uvsphere(bm, u_segments=8, v_segments=6, radius=0.0034, matrix=Matrix.Translation(c)); npl += 1
pearls = link('Pearls', bm); pearls.data.uv_layers.new(name='UV'); smooth(pearls)
pack('pearls', pearls, 'pearl', weight_fn=lambda p: {'Spine2': 0.6, 'Neck': 0.4} if p.z > 1.43 else {'Spine2': 1.0}); print('pearls', npl)

# ================================================================ 7) Oberschenkel-Strap (linkes Bein, +x) + Herzring + Kristall
zt = 0.695; sl = [outfit.matrix_world @ v.co for v in outfit.data.vertices if abs((outfit.matrix_world @ v.co).z - zt) < 0.008 and (outfit.matrix_world @ v.co).x > 0.02]
_a, _b = bpos('LeftUpLeg'), bpos('LeftLeg'); _f = (zt - _a.z) / (_b.z - _a.z); _c = _a.lerp(_b, _f); cx, cyl = _c.x, _c.y; bm = bmesh.new(); lo, hi = [], []; pts_t = []
for k in range(48):
    a_ = 2 * math.pi * k / 48; dd = Vector((math.cos(a_), math.sin(a_), 0)); o_ = Vector((cx, cyl, zt)); h = T_out.ray_cast(o_, dd, 0.2)
    pts_t.append((h[0] if h[0] is not None else o_ + dd * 0.07) + dd * 0.003); NH_ = globals().get('NH_', 0) + (h[0] is not None); globals()['NH_'] = NH_
for p in pts_t: lo.append(bm.verts.new(p - Vector((0, 0, 0.011)))); hi.append(bm.verts.new(p + Vector((0, 0, 0.011))))
for k in range(48): k2 = (k + 1) % 48; bm.faces.new((lo[k], lo[k2], hi[k2], hi[k]))
print('thigh hits', NH_, 'center', cx, cyl); bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:]); ts_ = link('ThighStrap', bm); ts_.data.uv_layers.new(name='UV'); smooth(ts_); solid(ts_, 0.003)
_, W_ = dt_weights(ts_); pack_w('thighstrap', ts_, 'black', W_)
pf = min(pts_t, key=lambda p: p.y) + Vector((0, -0.006, 0)); hr = heart_curve('ThighHeart', pf, 0.032, Vector((0, -1, 0)), 0.0022, 'silver')
_, W_ = dt_weights(hr); pack_w('thighheart', hr, 'silver', W_)
cu = bpy.data.curves.new('chain', 'CURVE'); cu.dimensions = '3D'; cu.bevel_depth = 0.0011; sp = cu.splines.new('POLY'); sp.points.add(1)
sp.points[0].co = (*(pf + Vector((0, 0, -0.016))), 1); sp.points[1].co = (*(pf + Vector((0, -0.002, -0.050))), 1)
cob = bpy.data.objects.new('Chain', cu); bpy.context.scene.collection.objects.link(cob); bpy.ops.object.select_all(action='DESELECT'); bpy.context.view_layer.objects.active = cob; cob.select_set(True)
bpy.ops.object.convert(target='MESH'); cob = bpy.context.object; cob.data.uv_layers.new(name='UV'); _, W_ = dt_weights(cob); pack_w('chain', cob, 'silver', W_)
bm = bmesh.new(); cc = pf + Vector((0, -0.002, -0.080)); prof = [(0, 0.032), (0.012, 0.011), (0.010, -0.013), (0, -0.030)]
ring = []
for (r_, dz) in prof[1:3]:
    ring.append([bm.verts.new(cc + Vector((r_ * math.cos(2 * math.pi * s / 6), r_ * math.sin(2 * math.pi * s / 6), dz))) for s in range(6)])
tp = bm.verts.new(cc + Vector((0, 0, prof[0][1]))); bt = bm.verts.new(cc + Vector((0, 0, prof[3][1])))
for s in range(6):
    s2 = (s + 1) % 6; bm.faces.new((tp, ring[0][s], ring[0][s2])); bm.faces.new((ring[0][s], ring[1][s], ring[1][s2], ring[0][s2])); bm.faces.new((ring[1][s2], ring[1][s], bt))
bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:]); cr = link('Crystal', bm); cr.data.uv_layers.new(name='UV'); smooth(cr, False)
_, W_ = dt_weights(cr); pack_w('crystal', cr, 'crystal', W_)
np.savez_compressed(D + '/parts_px.npz', **{f'{n}__{k}': v for n, d in PARTS.items() for k, v in d.items()})
print('SAVED', len(PARTS), 'parts')
