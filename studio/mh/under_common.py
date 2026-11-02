"""UNTERLAGE-Abteilung: gemeinsame Helfer (Körper laden, BVH, Gewichtstransfer, Mesh-Builder, Primitive).
Alles in Metern, Blender-Weltraum der A-Pose (Z oben, Figur schaut -Y, Charakter-links = +X)."""
import os, sys, math, json
import numpy as np
import bpy, bmesh
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
from mathutils import interpolate

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
CORE = os.path.join(ROOT, 'out', 'mh', 'core.blend')
OUTDIR = os.path.join(ROOT, 'out', 'mh')
TEXDIR = os.path.join(ROOT, 'out', 'mh', 'under_tex')


def log(*a):
    print('[under]', *a, flush=True)


# ------------------------------------------------------------------ Körper / Rig
class Core:
    """core.blend laden und Körperdaten (Positionen, Faces, Gewichte, Bones) als numpy bereitstellen."""

    def __init__(self, path=CORE):
        bpy.ops.wm.open_mainfile(filepath=path)
        self.body = bpy.data.objects['Alice_Body']
        self.arm = bpy.data.objects['Alice_Armature']
        me = self.body.data
        self.co = np.array([v.co[:] for v in me.vertices], dtype=np.float64)
        self.faces = [tuple(p.vertices) for p in me.polygons]
        self.names = [g.name for g in self.body.vertex_groups]
        n = len(me.vertices)
        W = np.zeros((n, len(self.names)), dtype=np.float32)
        for v in me.vertices:
            for g in v.groups:
                W[v.index, g.group] = g.weight
        self.W = W
        self.uv = np.array([l.uv[:] for l in me.uv_layers[0].data], dtype=np.float64)  # pro Loop
        self.bone = {b.name: (np.array(b.head_local[:]), np.array(b.tail_local[:])) for b in self.arm.data.bones}
        self.bone_parent = {b.name: (b.parent.name if b.parent else None) for b in self.arm.data.bones}
        self.dom = np.array([self.names[i] for i in W.argmax(1)])
        # Normalen
        me.calc_normals() if hasattr(me, 'calc_normals') else None
        self.nrm = np.array([v.normal[:] for v in me.vertices], dtype=np.float64)
        self.bvh = BVHTree.FromPolygons([tuple(v) for v in self.co.tolist()], self.faces, epsilon=0.0)

    def head(self, b): return self.bone[b][0]
    def tail(self, b): return self.bone[b][1]
    def axis(self, b):
        h, t = self.bone[b]; d = t - h; return d / np.linalg.norm(d)


def vnormals(V, F):
    """Flächen-gewichtete Vertex-Normalen. F: Liste von Index-Tupeln (Tris/Quads)."""
    V = np.asarray(V); N = np.zeros_like(V)
    for f in F:
        if len(f) == 3:
            n = np.cross(V[f[1]] - V[f[0]], V[f[2]] - V[f[0]])
            for i in f: N[i] += n
        else:
            n = np.cross(V[f[2]] - V[f[0]], V[f[3]] - V[f[1]])
            for i in f: N[i] += n
    l = np.linalg.norm(N, axis=1, keepdims=True); l[l < 1e-12] = 1
    return N / l


def adjacency(nv, F):
    adj = [set() for _ in range(nv)]
    for f in F:
        k = len(f)
        for i in range(k):
            a, b = f[i], f[(i + 1) % k]
            adj[a].add(b); adj[b].add(a)
    return [np.array(sorted(s), dtype=np.int64) for s in adj]


def smooth_field(X, adj, iters=5, lam=0.5, mask=None):
    """Laplace-Glättung eines (n,k)-Felds; mask: Bool pro Vertex (nur dort verändern)."""
    X = X.copy()
    for _ in range(iters):
        Y = X.copy()
        for i in range(len(X)):
            if mask is not None and not mask[i]: continue
            a = adj[i]
            if len(a): Y[i] = X[i] * (1 - lam) + X[a].mean(0) * lam
        X = Y
    return X


def smooth_field_fast(X, adj_idx, adj_cnt, iters=5, lam=0.5, mask=None):
    """Vektorisierte Laplace-Glättung. adj_idx: (n,maxdeg) mit -1 Padding."""
    X = X.copy()
    valid = adj_idx >= 0
    safe = np.where(valid, adj_idx, 0)
    for _ in range(iters):
        nb = X[safe] * valid[..., None] if X.ndim == 2 else X[safe] * valid
        mean = nb.sum(1) / np.maximum(adj_cnt, 1)[:, None] if X.ndim == 2 else nb.sum(1) / np.maximum(adj_cnt, 1)
        Y = X * (1 - lam) + mean * lam
        if mask is not None:
            Y = np.where(mask[:, None] if X.ndim == 2 else mask, Y, X)
        X = Y
    return X


def adj_arrays(nv, F):
    adj = adjacency(nv, F)
    md = max(len(a) for a in adj)
    idx = -np.ones((nv, md), dtype=np.int64); cnt = np.zeros(nv)
    for i, a in enumerate(adj):
        idx[i, :len(a)] = a; cnt[i] = len(a)
    return idx, cnt


def bvh_of(V, F):
    return BVHTree.FromPolygons([tuple(v) for v in np.asarray(V).tolist()], [tuple(f) for f in F], epsilon=0.0)


def nearest_info(bvh, P):
    """Für Punkte P -> (loc(n,3), nrm(n,3), face_index(n), dist(n)). Punkte ohne Treffer: dist=inf."""
    n = len(P); loc = np.zeros((n, 3)); nr = np.zeros((n, 3)); fi = -np.ones(n, dtype=np.int64); ds = np.full(n, np.inf)
    for i, p in enumerate(P):
        r = bvh.find_nearest(Vector(p))
        if r[0] is None: continue
        loc[i] = r[0]; nr[i] = r[1]; fi[i] = r[2]; ds[i] = r[3]
    return loc, nr, fi, ds


def transfer_weights(core, P, maxinf=4, prune=0.01):
    """Gewichte vom Körper (nächste Fläche, interpoliert) -> Liste von dicts {bone: w}."""
    loc, nr, fi, ds = nearest_info(core.bvh, P)
    out = []
    for i in range(len(P)):
        f = core.faces[fi[i]]
        pts = [Vector(core.co[k]) for k in f]
        try:
            wts = interpolate.poly_3d_calc(pts, Vector(loc[i]))
        except Exception:
            wts = [1.0 / len(f)] * len(f)
        acc = {}
        for k, wk in zip(f, wts):
            if wk <= 0: continue
            row = core.W[k]
            for j in np.nonzero(row)[0]:
                acc[j] = acc.get(j, 0.0) + float(row[j]) * wk
        out.append(limit_weights({core.names[j]: w for j, w in acc.items()}, maxinf, prune))
    return out


def limit_weights(d, maxinf=4, prune=0.01):
    it = sorted(d.items(), key=lambda kv: -kv[1])[:maxinf]
    it = [(k, v) for k, v in it if v >= prune] or it[:1]
    s = sum(v for _, v in it)
    return {k: v / s for k, v in it}


# ------------------------------------------------------------------ Mesh-Builder
class MB:
    """Sammelt Verts/Faces/Material/UV/Gewichte/Sharp-Kanten und baut ein bpy-Mesh-Objekt."""

    def __init__(self):
        self.V = []      # Liste von (k,3) Arrays
        self.nv = 0
        self.F = []      # Tupel (global indices)
        self.FM = []     # Materialindex pro Face
        self.UV = []     # pro Face: Liste (len,2)
        self.W = []      # pro Vertex dict oder None
        self.sharp = set()
        self.tag = []    # pro Face ein String/Int (für spätere Selektion)

    def add(self, V, F, mat=0, uv=None, w=None, bone=None, tag=None, sharp_deg=None, uvscale=None):
        """V (k,3), F: Liste von Tupeln lokal; uv: (n_loops,2) in Face-Reihenfolge oder None; w: Liste dicts oder None;
        bone: rigid an Bone (Gewicht 1). sharp_deg: Kanten mit Winkel > x als hart markieren."""
        V = np.asarray(V, dtype=np.float64); o = self.nv
        self.V.append(V); self.nv += len(V)
        if w is not None:
            self.W.extend(w)
        else:
            self.W.extend([({bone: 1.0} if bone else None)] * len(V))
        if uv is None:
            uv = box_uv(V, F, uvscale or 10.0)
        k = 0
        for f in F:
            self.F.append(tuple(i + o for i in f)); self.FM.append(mat); self.tag.append(tag)
            self.UV.append(uv[k:k + len(f)]); k += len(f)
        if sharp_deg is not None:
            self.sharp |= sharp_edges(V, F, sharp_deg, o)
        return o

    def build(self, name, mats, collection=None):
        V = np.vstack(self.V)
        me = bpy.data.meshes.new(name)
        me.from_pydata([tuple(v) for v in V.tolist()], [], [tuple(f) for f in self.F])
        me.update()
        uvl = me.uv_layers.new(name='UVMap')
        arr = np.concatenate([np.asarray(u) for u in self.UV]) if self.UV else np.zeros((0, 2))
        uvl.data.foreach_set('uv', arr.reshape(-1).astype(np.float32))
        me.polygons.foreach_set('material_index', np.array(self.FM, dtype=np.int32))
        me.polygons.foreach_set('use_smooth', [True] * len(self.F))
        if self.sharp:
            ed = {tuple(sorted((e.vertices[0], e.vertices[1]))): e.index for e in me.edges}
            for k in self.sharp:
                if k in ed: me.edges[ed[k]].use_edge_sharp = True
        for m in mats: me.materials.append(m)
        ob = bpy.data.objects.new(name, me)
        (collection or bpy.context.scene.collection).objects.link(ob)
        # Gewichte
        groups = {}
        for i, w in enumerate(self.W):
            if not w: continue
            for b, x in w.items():
                if x <= 0: continue
                groups.setdefault(b, []).append((i, x))
        for b, lst in groups.items():
            vg = ob.vertex_groups.new(name=b)
            for i, x in lst: vg.add([i], x, 'REPLACE')
        return ob


def sharp_edges(V, F, deg, o=0):
    """Kanten zwischen Faces mit Winkel > deg als (min,max)-Indexpaar (global, mit Offset o)."""
    ed = {}
    nrm = []
    for fi, f in enumerate(F):
        p = V[list(f)]
        n = np.cross(p[2] - p[0], p[3 % len(p)] - p[1]) if len(f) == 4 else np.cross(p[1] - p[0], p[2] - p[0])
        l = np.linalg.norm(n); nrm.append(n / l if l > 1e-15 else n)
        k = len(f)
        for i in range(k):
            a, b = f[i], f[(i + 1) % k]
            ed.setdefault((min(a, b), max(a, b)), []).append(fi)
    c = math.cos(math.radians(deg)); out = set()
    for (a, b), fl in ed.items():
        if len(fl) == 2 and np.dot(nrm[fl[0]], nrm[fl[1]]) < c:
            out.add((a + o, b + o))
        elif len(fl) == 1:
            out.add((a + o, b + o))
    return out


def box_uv(V, F, scale=10.0):
    """Box-Projektion: UV = (Meter * scale) in der dominanten Achse der Flächennormale."""
    out = []
    for f in F:
        p = V[list(f)]
        n = np.cross(p[2] - p[0], p[3 % len(p)] - p[1]) if len(f) == 4 else np.cross(p[1] - p[0], p[2] - p[0])
        a = np.argmax(np.abs(n))
        ax = [(1, 2), (0, 2), (0, 1)][a]
        for q in p: out.append((q[ax[0]] * scale, q[ax[1]] * scale))
    return np.array(out)


# ------------------------------------------------------------------ Primitive (numpy)
def basis_from_dir(d, up_hint=(0, 0, 1)):
    """Orthonormalbasis (x,y,z) mit z = d."""
    z = np.asarray(d, dtype=float); z = z / np.linalg.norm(z)
    up = np.asarray(up_hint, dtype=float)
    if abs(np.dot(z, up)) > 0.95: up = np.array([1.0, 0, 0])
    x = np.cross(up, z); x /= np.linalg.norm(x)
    y = np.cross(z, x)
    return x, y, z


def xform(V, M):
    V = np.asarray(V); return V @ M[:3, :3].T + M[:3, 3]


def mat_from(origin, x, y, z):
    M = np.eye(4); M[:3, 0] = x; M[:3, 1] = y; M[:3, 2] = z; M[:3, 3] = origin; return M


def prim_box(size, bevel=0.0, segs=2, profile=0.6):
    """Quader (Mitte im Ursprung), size=(sx,sy,sz) in m. Gibt (V,F) mit Quads."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts: v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
    if bevel > 0:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, offset_type='OFFSET', segments=segs, profile=profile, affect='EDGES')
    return bm_to_np(bm)


def prim_cyl(r, h, seg=16, bevel=0.0, bsegs=2, r2=None, caps=True, axis='z'):
    """Zylinder entlang z (Mitte im Ursprung) -> (V,F)."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=caps, cap_tris=False, segments=seg, radius1=r, radius2=(r if r2 is None else r2), depth=h)
    if bevel > 0:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, offset_type='OFFSET', segments=bsegs, profile=0.6, affect='EDGES')
    return bm_to_np(bm)


def prim_sphere(r, seg=12, rings=8, scale=(1, 1, 1)):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=r)
    V, F = bm_to_np(bm)
    return V * np.array(scale), F


def prim_torus(R, r, seg=24, rseg=8):
    """Torus in der XY-Ebene (Achse z)."""
    V = []; F = []
    for i in range(seg):
        a = 2 * math.pi * i / seg
        for j in range(rseg):
            b = 2 * math.pi * j / rseg
            V.append(((R + r * math.cos(b)) * math.cos(a), (R + r * math.cos(b)) * math.sin(a), r * math.sin(b)))
    for i in range(seg):
        for j in range(rseg):
            a = i * rseg + j; b = ((i + 1) % seg) * rseg + j; c = ((i + 1) % seg) * rseg + (j + 1) % rseg; d = i * rseg + (j + 1) % rseg
            F.append((a, b, c, d))
    return np.array(V), F


def bm_to_np(bm):
    bm.verts.ensure_lookup_table(); bm.faces.ensure_lookup_table()
    V = np.array([v.co[:] for v in bm.verts]); idx = {v: i for i, v in enumerate(bm.verts)}
    F = [tuple(idx[v] for v in f.verts) for f in bm.faces]
    bm.free()
    return V, F


def fix_winding(V, F, center=None):
    """Faces so drehen, dass Normalen vom Zentrum weg zeigen (für konvexe Primitive)."""
    V = np.asarray(V); c = V.mean(0) if center is None else np.asarray(center); out = []
    for f in F:
        p = V[list(f)]
        n = np.cross(p[2] - p[0], p[3 % len(p)] - p[1]) if len(f) == 4 else np.cross(p[1] - p[0], p[2] - p[0])
        if np.dot(n, p.mean(0) - c) < 0: f = tuple(reversed(f))
        out.append(tuple(f))
    return out


def loft(rings, closed=True, cap0=False, cap1=False):
    """Rings: Liste (m,3)-Arrays gleicher Länge m. Gibt (V,F) (Quads), Normalen nach 'rechter Hand' der Ring-Richtung.
    closed: Ringe sind geschlossene Schleifen. cap0/cap1: Fan-Kappe am Anfang/Ende."""
    R = len(rings); m = len(rings[0])
    V = np.vstack([np.asarray(r) for r in rings]); F = []
    for i in range(R - 1):
        for j in range(m if closed else m - 1):
            j2 = (j + 1) % m
            F.append((i * m + j, i * m + j2, (i + 1) * m + j2, (i + 1) * m + j))
    if cap0 or cap1:
        V = V.tolist()
        if cap0:
            c = np.mean(rings[0], axis=0); V.append(tuple(c)); ci = len(V) - 1
            for j in range(m): F.append((ci, (j + 1) % m, j))
        if cap1:
            c = np.mean(rings[-1], axis=0); V.append(tuple(c)); ci = len(V) - 1; b = (R - 1) * m
            for j in range(m): F.append((ci, b + j, b + (j + 1) % m))
        V = np.array(V)
    return V, F


def tube(path, radius, seg=8, caps=True, up=(0, 0, 1)):
    """Röhre entlang Polylinie path (n,3); radius: Skalar oder Array n. Parallel-Transport-Rahmen."""
    path = np.asarray(path, dtype=float); n = len(path)
    rad = np.full(n, radius) if np.isscalar(radius) else np.asarray(radius)
    T = np.zeros_like(path)
    T[1:-1] = path[2:] - path[:-2]; T[0] = path[1] - path[0]; T[-1] = path[-1] - path[-2]
    T /= np.linalg.norm(T, axis=1, keepdims=True)
    x, y, _ = basis_from_dir(T[0], up)
    rings = []
    for i in range(n):
        if i > 0:
            # Rahmen parallel transportieren
            ax = np.cross(T[i - 1], T[i]); s = np.linalg.norm(ax)
            if s > 1e-9:
                ax /= s; ang = math.asin(min(1, s))
                x = rot_vec(x, ax, ang); y = rot_vec(y, ax, ang)
        ring = [path[i] + rad[i] * (math.cos(2 * math.pi * k / seg) * x + math.sin(2 * math.pi * k / seg) * y) for k in range(seg)]
        rings.append(np.array(ring))
    V, F = loft(rings, True, caps, caps)
    return V, F


def rot_vec(v, ax, ang):
    c, s = math.cos(ang), math.sin(ang)
    return v * c + np.cross(ax, v) * s + ax * np.dot(ax, v) * (1 - c)


def catmull(P, n_per=6, closed=False):
    """Catmull-Rom-Spline durch Punkte P (m,3)."""
    P = np.asarray(P, dtype=float); m = len(P); out = []
    rng = range(m) if closed else range(m - 1)
    for i in rng:
        p0 = P[(i - 1) % m] if (closed or i > 0) else P[0] * 2 - P[1]
        p1 = P[i]; p2 = P[(i + 1) % m]
        p3 = P[(i + 2) % m] if (closed or i + 2 < m) else P[-1] * 2 - P[-2]
        for k in range(n_per):
            t = k / n_per
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    if not closed: out.append(P[-1])
    return np.array(out)


def smoothstep(a, b, x):
    t = np.clip((np.asarray(x) - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)


def build_obj_from_np(name, V, F, mat=None, uv=None, w=None, smooth=True):
    """Einzel-Mesh direkt aus numpy (für Hilfsobjekte)."""
    mb = MB(); mb.add(V, F, 0, uv=uv, w=w)
    return mb.build(name, [mat] if mat else [])


def tri_count(ob):
    return sum(len(p.vertices) - 2 for p in ob.data.polygons)


def orient_all(V, F, center=None):
    """Alle Faces einheitlich drehen, so dass die Mehrheit vom Zentrum weg zeigt."""
    V = np.asarray(V); c = V.mean(0) if center is None else np.asarray(center); s = 0
    for f in F:
        p = V[list(f)]
        n = np.cross(p[2] - p[0], p[3 % len(p)] - p[1]) if len(f) == 4 else np.cross(p[1] - p[0], p[2] - p[0])
        s += np.sign(np.dot(n, p.mean(0) - c))
    return F if s >= 0 else [tuple(reversed(f)) for f in F]


def raycast_surf(bvh, origins, dirs, offset=0.0):
    """Strahlen -> Trefferpunkt + Normale, verschoben um offset entlang der Normale."""
    P = []; N = []
    for o, d in zip(origins, dirs):
        r = bvh.ray_cast(Vector(o), Vector(d))
        if r[0] is None:
            r = bvh.find_nearest(Vector(o) + Vector(d) * 0.2)
        n = np.array(r[1][:]); 
        if np.dot(n, d) < 0: pass
        P.append(np.array(r[0][:]) + n * offset); N.append(n)
    return np.array(P), np.array(N)


def tex_tile(path, kind, res=512):
    """Kachelbare Hilfstexturen (Normalmaps): 'mesh' (Sneaker-Gewebe), 'rubber' (Gummi-Körnung), 'webbing' (Gurtband)."""
    from PIL import Image
    y, x = np.mgrid[0:res, 0:res] / res
    if kind == 'mesh':
        f = 18
        u = x * f; v = y * f * 1.1547
        # versetzte Waben-Löcher
        vv = v + 0.5 * (np.floor(u) % 2)
        du = u - np.floor(u) - 0.5; dv = vv - np.floor(vv) - 0.5
        d = np.sqrt(du * du + dv * dv)
        h = smoothstep(0.18, 0.34, d) * 0.7 + 0.3 * (0.5 + 0.5 * np.cos(2 * np.pi * x * 60))
    elif kind == 'rubber':
        rng = np.random.default_rng(3); n = rng.random((res // 8, res // 8))
        from scipy import ndimage as ndi
        h = ndi.zoom(n, 8, order=3, mode='wrap')[:res, :res]
        h = h + 0.4 * (0.5 + 0.5 * np.sin(2 * np.pi * y * 24))
    else:
        h = 0.5 + 0.5 * np.sin(2 * np.pi * x * 48) * (0.6 + 0.4 * np.sin(2 * np.pi * y * 96))
    h = (h - h.min()) / (h.max() - h.min() + 1e-9)
    gx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5 * res / 64; gy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5 * res / 64
    nz = np.ones_like(h); l = np.sqrt(gx * gx + gy * gy + 1)
    n = np.stack([-gx / l, gy / l, nz / l], 2) * 0.5 + 0.5
    Image.fromarray((n * 255).astype(np.uint8)).save(path)
    return path
