"""Alice-Finish: Laborkittel (vom echten v1.1-Körper abgeleitet), Kapuze, Gürtel, Anhänger + Kordel, A-Patch, Dutt + Strähnen.
Ausgabe: fin/parts.npz (glTF-Frame, Gewichte mit Knochennamen) + Texturen in fin/tex/.
  python3 fin/build_parts.py"""
import bpy, bmesh, math, os, sys, numpy as np
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
from PIL import Image, ImageDraw, ImageFilter
D = '/home/claude/alice_vrm/fin'; os.makedirs(D + '/tex', exist_ok=True)
rng = np.random.default_rng(3)
bpy.ops.wm.open_mainfile(filepath=D + '/base.blend')
body = bpy.data.objects['AvatarBody']; outfit = bpy.data.objects['outfit']; head = bpy.data.objects['AvatarHead']
dg = bpy.context.evaluated_depsgraph_get()
def bvh_of(o):
    bm = bmesh.new(); bm.from_mesh(o.data); bm.transform(o.matrix_world); t = BVHTree.FromBMesh(bm); bm.free(); return t
T_out, T_body, T_head = bvh_of(outfit), bvh_of(body), bvh_of(head)
PARTS = {}

def weights_of(o):
    names = [g.name for g in o.vertex_groups]; W = []
    for v in o.data.vertices:
        W.append({names[g.group]: g.weight for g in v.groups if g.weight > 1e-4})
    return W

def pack(name, o, mat, uv_fn=None, weight_fn=None):
    """Mesh-Objekt -> trianguliert, glTF-Frame, Gewichte (Top 4) -> PARTS."""
    me = o.data; bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.triangulate(bm, faces=bm.faces[:]); bm.to_mesh(me); bm.free()
    me.calc_loop_triangles() if hasattr(me, 'calc_loop_triangles') else None
    mw = o.matrix_world; nm = mw.to_3x3().inverted().transposed()
    W = weights_of(o) if weight_fn is None else None
    uvl = me.uv_layers.active.data if me.uv_layers else None
    P, N, UV, J, WT, I = [], [], [], [], [], []
    for poly in me.polygons:
        tri = []
        for li in poly.loop_indices:
            vi = me.loops[li].vertex_index; v = me.vertices[vi]
            p = mw @ v.co; n = (nm @ (v.normal if not poly.use_smooth is False else poly.normal)).normalized()
            if not poly.use_smooth: n = (nm @ poly.normal).normalized()
            uv = tuple(uvl[li].uv) if uvl else (0, 0)
            w = weight_fn(p) if weight_fn else W[vi]
            top = sorted(w.items(), key=lambda kv: -kv[1])[:4]; s = sum(x for _, x in top) or 1
            P.append((p.x, p.z, -p.y)); N.append((n.x, n.z, -n.y)); UV.append((uv[0], 1 - uv[1]))
            J.append([k for k, _ in top] + [''] * (4 - len(top))); WT.append([x / s for _, x in top] + [0] * (4 - len(top)))
            tri.append(len(P) - 1)
        I.append(tri)
    PARTS[name] = dict(P=np.array(P, np.float32), N=np.array(N, np.float32), UV=np.array(UV, np.float32), J=np.array(J), W=np.array(WT, np.float32),
                       I=np.array(I, np.uint32).reshape(-1), mat=np.array(mat))
    print('PART', name, len(P), 'verts', len(I), 'tris')

# ---------------------------------------------------------------- Texturen
def coat_tex(path, base=(236, 238, 240), size=1024):
    a = np.ones((size, size, 3)) * np.array(base, float)
    n = rng.standard_normal((size, size));
    from scipy.ndimage import gaussian_filter
    weave = (np.sin(np.arange(size) * 2 * math.pi / 6)[None, :] * np.sin(np.arange(size) * 2 * math.pi / 6)[:, None]) * 2.5
    a += (gaussian_filter(n, 1.0) * 4 + gaussian_filter(n, 30) * 18 + weave)[..., None]
    # Nahtlinien (Taschen/Seitennähte) leicht dunkler
    Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).save(path)
coat_tex(D + '/tex/coat.png'); coat_tex(D + '/tex/belt.png', (28, 30, 34), 256)
# A-im-Kreis-Patch
im = Image.new('RGB', (512, 512), (18, 30, 58)); d = ImageDraw.Draw(im)
d.ellipse((40, 40, 472, 472), outline=(235, 240, 245), width=26)
d.polygon([(256, 120), (150, 390), (196, 390), (256, 220), (316, 390), (362, 390)], fill=(235, 240, 245)); d.rectangle((205, 300, 307, 336), fill=(235, 240, 245))
d.ellipse((6, 6, 506, 506), outline=(60, 220, 230), width=10); im.save(D + '/tex/patch.png')
Image.new('RGB', (64, 64), (60, 230, 235)).save(D + '/tex/teal.png'); Image.new('RGB', (64, 64), (20, 22, 26)).save(D + '/tex/cord.png')

# ---------------------------------------------------------------- 1) Kittel aus Körper
from scipy.ndimage import gaussian_filter, gaussian_filter1d
bmU = bmesh.new()
for o in (body, outfit):
    t = bmesh.new(); t.from_mesh(o.data); t.transform(o.matrix_world); tm = bpy.data.meshes.new('tmp'); t.to_mesh(tm); t.free(); bmU.from_mesh(tm)
T_U = BVHTree.FromBMesh(bmU)
NA = 72; ANG = np.linspace(-math.pi, math.pi, NA, endpoint=False)
ZT = np.arange(1.445, 0.905 - 1e-6, -0.012)
# Rumpf-Radien: vom Mittelpunkt nach außen, erster Treffer
R = np.zeros((len(ZT), NA)); C = []
for zi, z in enumerate(ZT):
    sl = [v for v in outfit.data.vertices if abs((outfit.matrix_world @ v.co).z - z) < 0.01 and abs((outfit.matrix_world @ v.co).x) < 0.2]
    cx = 0.0; cy = float(np.mean([(outfit.matrix_world @ v.co).y for v in sl])) if sl else 0.0; C.append((cx, cy))
    for ai, a_ in enumerate(ANG):
        d = Vector((math.cos(a_), math.sin(a_), 0)); o = Vector((cx, cy, z))
        h = T_U.ray_cast(o, d, 0.35); R[zi, ai] = (h[0] - o).length if h[0] is not None else 0.12
R = np.minimum(R, np.where(np.abs(np.cos(ANG))[None, :] > 0.7, 0.22, 0.2))   # Schulter/Arm-Ausreißer begrenzen
R = gaussian_filter(R, (1.2, 1.0), mode=('nearest', 'wrap')) + 0.016 + 0.024 * np.exp(-((ZT[:, None] - 1.0) / 0.08) ** 2)
C = np.array(C); C[:, 1] = gaussian_filter1d(C[:, 1], 2, mode='nearest')
bm = bmesh.new(); rows = []
def wfront(z): return float(np.interp(z, [0.4, 0.95, 1.2, 1.40, 1.48], [0.13, 0.085, 0.07, 0.045, 0.06]))
NO = 80
def add_row(z, cx, cy, radii, flare=1.0, back=0.0, wav=0.0):
    row = []; rf = float(np.interp(-math.pi / 2, ANG, radii)) * flare; phi = math.asin(min(0.95, wfront(z) / max(rf, 0.05)))
    for k in range(NO + 1):
        a_ = -math.pi / 2 + phi + (2 * math.pi - 2 * phi) * k / NO; aw = (a_ + math.pi) % (2 * math.pi) - math.pi
        r = float(np.interp(aw, ANG, radii, period=2 * math.pi)) * flare * (1 + wav * math.sin(a_ * 6))
        row.append(bm.verts.new((cx + r * math.cos(a_), cy + r * math.sin(a_) + back, z)))
    rows.append(row)
# Stehkragen oben (leicht nach innen geneigt)
add_row(ZT[0] + 0.03, C[0, 0], C[0, 1] + 0.01, R[0] * 0.92)
for zi, z in enumerate(ZT): add_row(z, C[zi, 0], C[zi, 1], R[zi])
ZB = 0.46; SR = 16
for k in range(1, SR + 1):
    t = k / SR; add_row(ZT[-1] - (ZT[-1] - ZB) * t, C[-1, 0], C[-1, 1], R[-1], flare=1 + 0.40 * t ** 1.1, back=0.04 * t ** 1.5, wav=0.025 * t)
for r0, r1 in zip(rows[:-1], rows[1:]):
    for i in range(NO):
        bm.faces.new((r0[i], r0[i + 1], r1[i + 1], r1[i]))
# Ärmel: Röhren entlang der Armachse (Oberarm -> Handgelenk), radiale Raycasts
arm = bpy.data.objects['Armature']
def bpos(n): return arm.matrix_world @ arm.data.bones[n].head_local
NS = 24
for side in ('Left', 'Right'):
    A = [bpos(side + 'Arm'), bpos(side + 'ForeArm'), bpos(side + 'Hand')]
    sg = 1 if side == 'Left' else -1
    xs = np.linspace(0.12, 0.60, 34) * sg
    srows = []
    for xi, x in enumerate(xs):
        f = (abs(x) - abs(A[0].x)) / (abs(A[2].x) - abs(A[0].x)); f = min(max(f, 0), 1)
        if abs(x) < abs(A[1].x): q = A[0].lerp(A[1], (abs(x) - abs(A[0].x)) / (abs(A[1].x) - abs(A[0].x)) if abs(x) > abs(A[0].x) else 0)
        else: q = A[1].lerp(A[2], (abs(x) - abs(A[1].x)) / (abs(A[2].x) - abs(A[1].x)))
        q = Vector((x, q.y, q.z)); row = []
        for k in range(NS):
            ph = 2 * math.pi * k / NS; d = Vector((0, math.cos(ph), math.sin(ph)))
            h = T_U.ray_cast(q, d, 0.12); r = (h[0] - q).length if h[0] is not None else 0.045
            if abs(x) < 0.2: r = min(r, 0.075)
            row.append(r)
        srows.append((q, np.array(row)))
    Rs = gaussian_filter(np.array([r for _, r in srows]), (1.5, 1.0), mode=('nearest', 'wrap'))
    Rs = Rs + 0.018 + 0.010 * np.linspace(0, 1, len(xs))[:, None]            # Ärmel nach unten weiter
    vrows = []
    for (q, _), rr in zip(srows, Rs):
        vrows.append([bm.verts.new(q + Vector((0, math.cos(2 * math.pi * k / NS), math.sin(2 * math.pi * k / NS))) * rr[k]) for k in range(NS)])
    for r0, r1 in zip(vrows[:-1], vrows[1:]):
        for i in range(NS):
            j = (i + 1) % NS; bm.faces.new((r0[i], r0[j], r1[j], r1[i]) if sg > 0 else (r0[j], r0[i], r1[i], r1[j]))
bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
me = bpy.data.meshes.new('coat'); bm.to_mesh(me); bm.free(); coat = bpy.data.objects.new('Alice_Coat', me); bpy.context.scene.collection.objects.link(coat)
mw = coat.matrix_world; bpy.context.view_layer.objects.active = coat
bm = bmesh.new(); bm.from_mesh(me)
# Frontöffnung (offener Kittel zeigt den schwarzen Anzug)
dels = []
bmesh.ops.delete(bm, geom=dels, context='FACES')
bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
bm.to_mesh(me); bm.free()
# Normalen nach außen? (Körper-Normalen zeigen raus; Rock per recalc)
# UVs: zylindrisch, ~40 cm pro Kachel
me.uv_layers.new(name='UV'); uvd = me.uv_layers.active.data
for poly in me.polygons:
    for li in poly.loop_indices:
        p = mw @ me.vertices[me.loops[li].vertex_index].co
        uvd[li].uv = ((math.atan2(p.y, p.x) / (2 * math.pi)) * 2.0 + (p.x if abs(p.x) > 0.2 else 0) * 2.5, p.z * 2.5)
sol = coat.modifiers.new('sol', 'SOLIDIFY'); sol.thickness = 0.006; sol.offset = -1; sol.use_rim = True; sol.use_even_offset = True
bpy.ops.object.modifier_apply(modifier='sol')
for p in coat.data.polygons: p.use_smooth = True
# Gewichte: Körper-Gewichte übertragen, Rock zunehmend an die Hüfte
src = outfit.copy(); src.data = outfit.data.copy(); bpy.context.scene.collection.objects.link(src); b2 = body.copy(); b2.data = body.data.copy(); bpy.context.scene.collection.objects.link(b2)
for o in (src, b2):
    for m in list(o.modifiers): o.modifiers.remove(m)
bpy.ops.object.select_all(action='DESELECT'); src.select_set(True); b2.select_set(True); bpy.context.view_layer.objects.active = src; bpy.ops.object.join(); bpy.context.view_layer.objects.active = coat; coat.select_set(True)
dt = coat.modifiers.new('dt', 'DATA_TRANSFER'); dt.object = src; dt.use_vert_data = True; dt.data_types_verts = {'VGROUP_WEIGHTS'}
dt.vert_mapping = 'POLYINTERP_NEAREST'; dt.layers_vgroup_select_src = 'ALL'; dt.layers_vgroup_select_dst = 'NAME'
bpy.ops.object.datalayout_transfer(modifier='dt'); bpy.ops.object.modifier_apply(modifier='dt')
def coat_w(p, base):
    if p.z >= 0.93: return base
    t = min(1, (0.93 - p.z) / 0.35); out = {k: v * (1 - 0.75 * t) for k, v in base.items()}; out['Hips'] = out.get('Hips', 0) + 0.75 * t; return out
Wc = weights_of(coat)
pack('coat', coat, 'coat', weight_fn=None)
# Rock-Gewichte nachträglich anpassen (pack nutzt W direkt) -> neu berechnen
P = PARTS['coat']['P']; Jn = PARTS['coat']['J']; Wn = PARTS['coat']['W']
for i in range(len(P)):
    z = P[i, 1]
    if z < 0.93:
        d = {k: w for k, w in zip(Jn[i], Wn[i]) if k}; d = coat_w(Vector((0, 0, z)), d)
        top = sorted(d.items(), key=lambda kv: -kv[1])[:4]; s = sum(x for _, x in top)
        Jn[i] = [k for k, _ in top] + [''] * (4 - len(top)); Wn[i] = [x / s for _, x in top] + [0] * (4 - len(top))

# ---------------------------------------------------------------- 2) Kapuze (gebauscht im Nacken)
bpy.ops.mesh.primitive_uv_sphere_add(segments=40, ring_count=20, radius=1, location=(0, 0.075, 1.418))
hood = bpy.context.object; hood.name = 'Alice_Hood'; hood.scale = (0.135, 0.062, 0.058); hood.rotation_euler = (math.radians(-18), 0, 0)
bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
bm = bmesh.new(); bm.from_mesh(hood.data)
for v in bm.verts:   # Falten + vorn abflachen (liegt am Nacken an)
    a = math.atan2(v.co.z, v.co.x); v.co.y += 0.006 * math.sin(a * 9) * (1 if v.co.y > 0 else 0.3)
    if v.co.y < -0.02: v.co.y = -0.02 + (v.co.y + 0.02) * 0.3
bm.to_mesh(hood.data); bm.free()
for p in hood.data.polygons: p.use_smooth = True
hood.data.uv_layers.new(name='UV'); uvd = hood.data.uv_layers.active.data
for poly in hood.data.polygons:
    for li in poly.loop_indices:
        p = hood.data.vertices[hood.data.loops[li].vertex_index].co; uvd[li].uv = (p.x * 3 + 0.5, p.z * 3)
pack('hood', hood, 'coat', weight_fn=lambda p: {'Spine2': 0.7, 'Neck': 0.3})

# ---------------------------------------------------------------- 3) Gürtel unter dem Kittel (sichtbar in der Öffnung)
zb = 1.0; pts = []
for k in range(64):
    a = 2 * math.pi * k / 64; d = Vector((math.cos(a), math.sin(a), 0)); o = Vector((0, 0, zb))
    hit = T_out.ray_cast(o + d * 0.4, -d, 0.4); p = hit[0] if hit[0] is not None else o + d * 0.15
    pts.append(p + d * 0.006)
bm = bmesh.new(); lo = [bm.verts.new(p - Vector((0, 0, 0.022))) for p in pts]; hi = [bm.verts.new(p + Vector((0, 0, 0.022))) for p in pts]
for k in range(64):
    j2 = (k + 1) % 64; bm.faces.new((lo[k], lo[j2], hi[j2], hi[k]))
me = bpy.data.meshes.new('belt'); bm.to_mesh(me); bm.free(); belt = bpy.data.objects.new('Alice_Belt', me); bpy.context.scene.collection.objects.link(belt)
bmesh_fix = bmesh.new(); bmesh_fix.from_mesh(me); bmesh.ops.recalc_face_normals(bmesh_fix, faces=bmesh_fix.faces[:]); bmesh_fix.to_mesh(me); bmesh_fix.free()
me.uv_layers.new(name='UV')
pack('belt', belt, 'belt', weight_fn=lambda p: {'Hips': 0.6, 'Spine': 0.4})
# Schnalle (teal leuchtend)
front = pts[48]  # Winkel -90° = vorn (-Y)
bpy.ops.mesh.primitive_cube_add(location=front + Vector((0, -0.006, 0)), scale=(0.026, 0.006, 0.02)); bk = bpy.context.object; bk.data.uv_layers.new(name='UV')
pack('buckle', bk, 'teal', weight_fn=lambda p: {'Hips': 0.6, 'Spine': 0.4})

# ---------------------------------------------------------------- 4) Anhänger + Kordel
hit = T_out.ray_cast(Vector((0, -0.5, 1.31)), Vector((0, 1, 0)), 1.0); pf = hit[0] + Vector((0, -0.009, 0))
bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=0.014, depth=0.007, location=pf, rotation=(math.pi / 2, 0, 0)); pend = bpy.context.object; pend.data.uv_layers.new(name='UV')
for p in pend.data.polygons: p.use_smooth = False
pack('pendant', pend, 'teal', weight_fn=lambda p: {'Spine2': 1.0})
bpy.ops.mesh.primitive_torus_add(major_radius=0.019, minor_radius=0.003, location=pf + Vector((0, 0.001, 0)), rotation=(math.pi / 2, 0, 0)); rim = bpy.context.object; rim.data.uv_layers.new(name='UV')
pack('pendant_rim', rim, 'cord', weight_fn=lambda p: {'Spine2': 1.0})
# Kordel: von Halsseiten zum Anhänger
cu = bpy.data.curves.new('cord', 'CURVE'); cu.dimensions = '3D'; cu.bevel_depth = 0.0016; cu.bevel_resolution = 2
sp = cu.splines.new('NURBS'); cps = []
for x, z in ((-0.055, 1.445), (-0.045, 1.40), (-0.02, 1.345), (0, pf.z + 0.016), (0.02, 1.345), (0.045, 1.40), (0.055, 1.445)):
    h = T_out.ray_cast(Vector((x, -0.5, z)), Vector((0, 1, 0)), 1.0); hb = T_body.ray_cast(Vector((x, -0.5, z)), Vector((0, 1, 0)), 1.0)
    y = min([q[0].y for q in (h, hb) if q[0] is not None] + [0.0]) - 0.004
    cps.append((x, y, z))
sp.points.add(len(cps) - 1)
for pt, co in zip(sp.points, cps): pt.co = (*co, 1)
sp.use_endpoint_u = True; sp.order_u = 3
cob = bpy.data.objects.new('cord', cu); bpy.context.scene.collection.objects.link(cob); bpy.context.view_layer.objects.active = cob
bpy.ops.object.select_all(action='DESELECT'); cob.select_set(True); bpy.ops.object.convert(target='MESH'); cob = bpy.context.object; cob.data.uv_layers.new(name='UV')
pack('cord', cob, 'cord', weight_fn=lambda p: {'Spine2': 0.6, 'Neck': 0.4})

# ---------------------------------------------------------------- 5) A-Patch am linken Oberarm (Ärmel)
T_coat = bvh_of(coat)
o = Vector((0.27, -0.4, 1.425)); h = T_coat.ray_cast(o, Vector((0, 1, 0)), 1.0); pp, pn = h[0], h[1]
bpy.ops.mesh.primitive_circle_add(vertices=40, radius=0.034, fill_type='TRIFAN', location=(0, 0, 0)); pat = bpy.context.object
q = pn.to_track_quat('Z', 'Y'); pat.matrix_world = Matrix.Translation(pp + pn * 0.002) @ q.to_matrix().to_4x4()
pat.data.uv_layers.new(name='UV'); uvd = pat.data.uv_layers.active.data
for poly in pat.data.polygons:
    for li in poly.loop_indices:
        v = pat.data.vertices[pat.data.loops[li].vertex_index].co; uvd[li].uv = (v.x / 0.068 + 0.5, v.y / 0.068 + 0.5)
pack('patch', pat, 'patch', weight_fn=lambda p: {'LeftArm': 1.0})

# ---------------------------------------------------------------- 6) Dutt + lose Strähnen (UV in Haar-Bereich der Kopftextur)
def hair_uv(u, v):   # linke Haarbahn der Kopftextur (u 0.04..0.28, v 0.25..0.85)
    return (0.04 + 0.24 * (u % 1.0), 0.25 + 0.6 * min(max(v, 0), 1))
# Kopfoberseite finden
top = T_head.ray_cast(Vector((0, 0.03, 2.0)), Vector((0, 0, -1)), 1.0)[0]
bc = Vector((0, 0.045, top.z - 0.005)) if top else Vector((0, 0.045, 1.73))
hb = T_head.ray_cast(Vector((0, 0.045, 2.0)), Vector((0, 0, -1)), 1.0)[0]; bc = Vector((0, 0.045, (hb.z if hb else 1.72) + 0.03))
bm = bmesh.new()
for k in range(7):   # Dutt aus mehreren verdrehten, zerzausten Haar-Wülsten
    r = 0.040 + 0.006 * rng.standard_normal(); tor = bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=14, radius=1.0)
    vs = tor['verts']; ax = Vector(rng.standard_normal(3)).normalized(); ang = rng.uniform(0, math.pi)
    R = Matrix.Rotation(ang, 3, ax); s = Vector((r * rng.uniform(0.9, 1.25), r * rng.uniform(0.6, 0.9), r * rng.uniform(0.55, 0.8)))
    offs = Vector(rng.normal(0, 0.012, 3)); offs.z = abs(offs.z) * 0.6
    for v in vs:
        p = v.co.copy(); n = 0.12 * math.sin(p.x * 9 + k) * math.sin(p.y * 7 + 2 * k) + 0.08 * math.sin(p.z * 13)
        p = Vector((p.x * s.x, p.y * s.y, p.z * s.z)) * (1 + n); v.co = bc + offs + R @ p
bm.to_mesh(me := bpy.data.meshes.new('bun')); bm.free(); bun = bpy.data.objects.new('Alice_Bun', me); bpy.context.scene.collection.objects.link(bun)
me.uv_layers.new(name='UV'); uvd = me.uv_layers.active.data
for poly in me.polygons:
    poly.use_smooth = True
    for li in poly.loop_indices:
        p = me.vertices[me.loops[li].vertex_index].co - bc; u = math.atan2(p.y, p.x) / (2 * math.pi) + 0.5; v = 0.5 + p.z * 6
        uvd[li].uv = hair_uv(u, v)
pack('bun', bun, 'head', weight_fn=lambda p: {'Head': 1.0})
# Haargummi (teal)
bpy.ops.mesh.primitive_torus_add(major_radius=0.026, minor_radius=0.005, location=bc + Vector((0, 0, -0.022)), rotation=(math.radians(15), 0, 0)); tie = bpy.context.object; tie.data.uv_layers.new(name='UV')
pack('hairtie', tie, 'teal', weight_fn=lambda p: {'Head': 1.0})
# lose Strähnen: dünne flache Bänder vom Scheitel/Schläfe nach unten, leicht gelockt
def strand(name, pts, w):
    bm = bmesh.new(); L = []; R = []
    for i, p in enumerate(pts):
        a = pts[max(i - 1, 0)]; b = pts[min(i + 1, len(pts) - 1)]; t = (b - a).normalized(); side = t.cross(Vector((0, -1, 0))).normalized()
        ww = w * (1 - 0.7 * i / (len(pts) - 1)); L.append(bm.verts.new(p - side * ww)); R.append(bm.verts.new(p + side * ww))
    for i in range(len(pts) - 1): bm.faces.new((L[i], R[i], R[i + 1], L[i + 1]))
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free(); o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o)
    me.uv_layers.new(name='UV'); uvd = me.uv_layers.active.data
    for poly in me.polygons:
        poly.use_smooth = True
        for li in poly.loop_indices:
            vi = me.loops[li].vertex_index
            uvd[li].uv = hair_uv(0.45 + 0.04 * (vi % 2), 0.35 + 0.5 * (vi // 2) / len(pts))
    sol = o.modifiers.new('s', 'SOLIDIFY'); sol.thickness = 0.002; bpy.context.view_layer.objects.active = o; bpy.ops.object.modifier_apply(modifier='s')
    return o
for sgn in (-1, 1):
    for k, (x0, y0) in enumerate(((0.062, -0.075), (0.072, -0.06))):
        pts = []
        for i in range(12):
            t = i / 11; z = 1.66 - 0.17 * t
            x = sgn * (x0 + 0.012 * t + 0.008 * math.sin(t * 9 + k)); y = y0 - 0.012 * math.sin(t * 3) - 0.004 * k
            hh = T_head.ray_cast(Vector((x * 3, y, z)), Vector((-sgn, 0, 0)), 1.0)
            if hh[0] is not None and t < 0.5: x = hh[0].x + sgn * 0.004
            pts.append(Vector((x, y, z)))
        o = strand(f'Strand{sgn}{k}', pts, 0.0035)
        pass  # Strähnen weggelassen (wirkten wie dunkle Balken)
np.savez_compressed(D + '/parts.npz', **{f'{n}__{k}': v for n, d in PARTS.items() for k, v in d.items()})
print('BUN center', tuple(round(x, 3) for x in bc), 'pendant', tuple(round(x, 3) for x in pf))
print('SAVED', len(PARTS), 'parts')
