"""Kittel-Abteilung: gemeinsame Hilfen (Body-Analyse, Schnitt/Hull, Mesh-Builder, BVH).
Alles in Blender-Weltkoordinaten (Meter, Z oben, Charakter schaut -Y, Charakter-links = +X), A-Pose."""
import os, sys, math
import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
OUT = os.path.join(ROOT, 'out', 'mh')
SCR = '/tmp/claude-0/-home-claude/ba6ce5eb-0729-5bb9-9dab-f777d50aa901/scratchpad/coat'


def smoothstep(a, b, x):
    t = np.clip((np.asarray(x, dtype=float) - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def lerp(a, b, t):
    return a + (b - a) * t


def interp(x, xs, ys):
    return np.interp(x, xs, ys)


def pchip(x, xs, ys):
    from scipy.interpolate import PchipInterpolator
    return PchipInterpolator(xs, ys, extrapolate=True)(x)


def norm(v, axis=-1):
    n = np.linalg.norm(v, axis=axis, keepdims=True)
    return v / np.maximum(n, 1e-12)


# ---------------------------------------------------------------------------- Body
class Body:
    """Alice_Body als numpy (co, tris, Gewichte) + Schnitt-Helfer."""

    def __init__(self, obj):
        me = obj.data
        n = len(me.vertices)
        co = np.empty(n * 3, np.float32); me.vertices.foreach_get('co', co)
        self.co = co.reshape(-1, 3).astype(np.float64)
        me.calc_loop_triangles()
        t = np.empty(len(me.loop_triangles) * 3, np.int32); me.loop_triangles.foreach_get('vertices', t)
        self.tris = t.reshape(-1, 3)
        self.names = [g.name for g in obj.vertex_groups]
        self.W = np.zeros((n, len(self.names)))
        for i, v in enumerate(me.vertices):
            for g in v.groups:
                self.W[i, g.group] = g.weight
        e = np.concatenate([self.tris[:, [0, 1]], self.tris[:, [1, 2]], self.tris[:, [2, 0]]])
        e.sort(axis=1)
        self.edges = np.unique(e, axis=0)
        self.arm_w = self.group_w(('upperarm', 'lowerarm', 'hand', 'index', 'middle', 'ring', 'pinky', 'thumb'))
        self.head_w = self.group_w(('head',))
        self.leg_w = self.group_w(('thigh', 'calf', 'foot', 'ball'))

    def group_w(self, subs):
        idx = [k for k, nm in enumerate(self.names) if any(nm.startswith(s) for s in subs)]
        return self.W[:, idx].sum(1)

    def plane_slice(self, point, normal, mask=None):
        """Schnittpunkte aller Dreieckskanten mit der Ebene (point, normal) -> (m,3)."""
        point = np.asarray(point, float); normal = np.asarray(normal, float)
        d = (self.co - point) @ normal
        e = self.edges
        d0 = d[e[:, 0]]; d1 = d[e[:, 1]]
        ok = (d0 * d1) < 0
        if mask is not None:
            ok &= mask[e[:, 0]] & mask[e[:, 1]]
        e = e[ok]; d0 = d0[ok]; d1 = d1[ok]
        t = d0 / (d0 - d1)
        return self.co[e[:, 0]] + t[:, None] * (self.co[e[:, 1]] - self.co[e[:, 0]])


def hull_radial(pts2, c, thetas, dirf):
    """Radius des konvexen Hulls von pts2 (m,2) in Richtung dirf(theta) vom Zentrum c (2,)."""
    from scipy.spatial import ConvexHull
    if len(pts2) < 3:
        return np.full(len(thetas), np.nan)
    try:
        h = ConvexHull(pts2)
    except Exception:
        return np.full(len(thetas), np.nan)
    P = pts2[h.vertices]
    Q = np.roll(P, -1, axis=0)
    D = dirf(thetas)                    # (T,2)
    E = Q - P                           # (K,2)
    # c + t*D = P + u*E  -> t,u
    # cross products
    PC = P - c
    den = D[:, None, 0] * E[None, :, 1] - D[:, None, 1] * E[None, :, 0]    # (T,K)
    with np.errstate(divide='ignore', invalid='ignore'):
        t = (PC[None, :, 0] * E[None, :, 1] - PC[None, :, 1] * E[None, :, 0]) / den
        u = (PC[None, :, 0] * D[:, None, 1] - PC[None, :, 1] * D[:, None, 0]) / den
    ok = (den != 0) & (u >= -1e-9) & (u <= 1 + 1e-9) & (t > 0)
    t = np.where(ok, t, -np.inf)
    r = t.max(axis=1)
    r[~np.isfinite(r)] = np.nan
    return r


def gauss_smooth(a, sigma, axis, mode='nearest'):
    from scipy.ndimage import gaussian_filter1d
    return gaussian_filter1d(a, sigma, axis=axis, mode=mode)


def fill_nan_rows(a):
    """Interpoliert NaNs entlang Achse 0 (je Spalte)."""
    a = a.copy()
    x = np.arange(a.shape[0])
    for j in range(a.shape[1]):
        m = np.isfinite(a[:, j])
        if m.sum() == 0:
            continue
        a[:, j] = np.interp(x, x[m], a[m, j])
    return a


# ---------------------------------------------------------------------------- Mesh-Builder
class MeshB:
    """Sammelt Verts/Faces (Quads/Tris), UVs pro Face-Ecke, Material-Index, Vertex-Tags."""

    def __init__(self, name):
        self.name = name
        self.V = []          # list of (n,3) arrays
        self.F = []          # list of int arrays (nf,4)  (Tris als 4. = -1)
        self.UV = []         # (nf,4,2)
        self.M = []          # (nf,) material index
        self.nv = 0
        self.attr = {}       # per-vertex float attrs: name -> list of arrays
        self.fattr = {}      # per-face attrs

    def add(self, V, F, UV=None, mat=0, attrs=None, fattrs=None):
        V = np.asarray(V, float); F = np.asarray(F, int)
        if F.shape[1] == 3:
            F = np.concatenate([F, -np.ones((len(F), 1), int)], 1)
        base = self.nv
        self.V.append(V)
        Fo = F.copy(); Fo[F >= 0] += base
        self.F.append(Fo)
        if UV is None:
            UV = np.zeros((len(F), 4, 2))
        self.UV.append(np.asarray(UV, float))
        self.M.append(np.full(len(F), mat, int) if np.isscalar(mat) else np.asarray(mat, int))
        for k in set(self.attr) | set(attrs or {}):
            arr = (attrs or {}).get(k)
            if arr is None:
                arr = np.zeros(len(V))
            self.attr.setdefault(k, [np.zeros(self.nv)])
            while len(self.attr[k]) < len(self.V) - 1:
                self.attr[k].append(np.zeros(0))
            self.attr[k].append(np.asarray(arr, float))
        self.nv += len(V)
        return base

    def arrays(self):
        V = np.concatenate(self.V); F = np.concatenate(self.F); UV = np.concatenate(self.UV); M = np.concatenate(self.M)
        attr = {}
        for k, lst in self.attr.items():
            attr[k] = np.concatenate([a if len(a) == len(v) else np.zeros(len(v)) for a, v in zip(lst, self.V)])
        return V, F, UV, M, attr


def grid_faces(nu, nv, wrap_u=False, flip=False, mask=None):
    """Quads fuer ein Gitter (nu x nv) Vertex-Index = i*nv + j. Rueckgabe (nf,4)."""
    idx = np.arange(nu * nv).reshape(nu, nv)
    nu_q = nu if wrap_u else nu - 1
    F = []
    for i in range(nu_q):
        i2 = (i + 1) % nu
        a = idx[i, :-1]; b = idx[i2, :-1]; c = idx[i2, 1:]; d = idx[i, 1:]
        q = np.stack([a, b, c, d], 1)
        if mask is not None:
            q = q[mask[i]]
        F.append(q)
    F = np.concatenate(F) if F else np.zeros((0, 4), int)
    if flip:
        F = F[:, ::-1]
    return F


def make_bpy_mesh(name, V, F, UV=None, M=None, smooth=True):
    import bpy
    me = bpy.data.meshes.new(name)
    V = np.asarray(V, float)
    F = np.asarray(F, int)
    loops = []; starts = []; total = []
    for f in F:
        vs = [int(x) for x in f if x >= 0]
        starts.append(len(loops)); total.append(len(vs)); loops.extend(vs)
    me.vertices.add(len(V)); me.loops.add(len(loops)); me.polygons.add(len(F))
    me.vertices.foreach_set('co', V.astype(np.float32).reshape(-1))
    me.loops.foreach_set('vertex_index', np.array(loops, np.int32))
    me.polygons.foreach_set('loop_start', np.array(starts, np.int32))
    me.polygons.foreach_set('loop_total', np.array(total, np.int32))
    me.update(calc_edges=True)
    if UV is not None:
        uvl = me.uv_layers.new(name='UVMap')
        flat = []
        for k, f in enumerate(F):
            n = int((f >= 0).sum())
            flat.extend(UV[k, :n].tolist())
        uvl.data.foreach_set('uv', np.array(flat, np.float32).reshape(-1))
    if M is not None:
        me.polygons.foreach_set('material_index', np.asarray(M, np.int32))
    if smooth:
        me.polygons.foreach_set('use_smooth', np.ones(len(F), bool))
    me.update()
    return me


def get_bvh(V, F):
    from mathutils.bvhtree import BVHTree
    from mathutils import Vector
    tris = []
    for f in F:
        vs = [int(x) for x in f if x >= 0]
        for k in range(1, len(vs) - 1):
            tris.append((vs[0], vs[k], vs[k + 1]))
    return BVHTree.FromPolygons([tuple(map(float, v)) for v in V], tris, all_triangles=True)


def nearest_info(bvh, pts):
    """pro Punkt: (loc, normal, face_index, dist) (Listen)"""
    from mathutils import Vector
    out = []
    for p in pts:
        loc, nrm, idx, dist = bvh.find_nearest(Vector(p))
        out.append((np.array(loc), np.array(nrm), idx, dist))
    return out
