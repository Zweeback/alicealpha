"""Kittel-Details: Kapuze, Taschen+Klappen, Druckknoepfe, Patches/Logos, Harness (Gurte, Guertel, Schnallen, Module, LEDs).
Alles wird auf eine 'Stuetzflaeche' (Kittel-Aussenseite + Koerper+12mm) projiziert."""
import numpy as np
from coat_common import *

TAU = 2 * np.pi


class Support:
    def __init__(self, V, F, body=None, body_off=0.014):
        from mathutils.bvhtree import BVHTree
        tris = []
        for f in F:
            vs = [int(x) for x in f if x >= 0]
            for k in range(1, len(vs) - 1):
                tris.append((vs[0], vs[k], vs[k + 1]))
        self.coat = BVHTree.FromPolygons([tuple(map(float, v)) for v in V], tris, all_triangles=True)
        self.body = None
        if body is not None:
            # Koerper nach aussen versetzt (Vertex-Normalen grob ueber Flaechen)
            co = body.co; t = body.tris
            fn = np.cross(co[t[:, 1]] - co[t[:, 0]], co[t[:, 2]] - co[t[:, 0]])
            vn = np.zeros_like(co)
            for k in range(3): np.add.at(vn, t[:, k], fn)
            vn = norm(vn)
            cb = co + vn * body_off
            self.body = BVHTree.FromPolygons([tuple(map(float, v)) for v in cb], [tuple(map(int, x)) for x in t], all_triangles=True)

    def nearest(self, p, use_body=True):
        from mathutils import Vector
        best = None
        for b in ([self.coat] + ([self.body] if (use_body and self.body) else [])):
            l, n, i, d = b.find_nearest(Vector(p))
            if l is not None and (best is None or d < best[2]):
                best = (np.array(l), np.array(n), d)
        return best[0], best[1]

    def ray(self, o, d, use_body=False):
        from mathutils import Vector
        hits = []
        for b in ([self.coat] + ([self.body] if (use_body and self.body) else [])):
            l, n, i, dist = b.ray_cast(Vector(o), Vector(d))
            if l is not None:
                hits.append((dist, np.array(l), np.array(n)))
        if not hits:
            return None, None
        hits.sort(key=lambda h: h[0])
        n = hits[0][2]
        if np.dot(n, d) > 0: n = -n
        return hits[0][1], n


def box(mb, c, X, Y, Z, hx, hy, hz, mat, uvo=(0.9, 0.9), bev=0.0):
    """Quader (optional abgeschraegt) mit Achsen X,Y,Z."""
    X = norm(np.asarray(X, float)); Y = norm(np.asarray(Y, float)); Z = norm(np.asarray(Z, float))
    s = np.array([[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]], float)
    V = c + s[:, 0:1] * hx * X + s[:, 1:2] * hy * Y + s[:, 2:3] * hz * Z
    F = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]
    UV = np.tile(np.array([[0, 0], [0.01, 0], [0.01, 0.01], [0, 0.01]]) + np.array(uvo), (6, 1, 1))
    mb.add(V, F, UV=UV, mat=mat)


def cylinder(mb, c, axis, r, h, n, mat, uvo=(0.9, 0.9), cap=True):
    axis = norm(np.asarray(axis, float))
    a = norm(np.cross(axis, [0.3, 0.2, 0.9] if abs(axis[2]) < 0.9 else [1, 0, 0])); b = np.cross(axis, a)
    ph = np.arange(n) * TAU / n
    ring = r * (np.cos(ph)[:, None] * a + np.sin(ph)[:, None] * b)
    V = np.concatenate([c + ring, c + ring + axis * h, [c + axis * h]])
    F = []
    for i in range(n):
        j = (i + 1) % n
        F.append([i, j, n + j, n + i])
        if cap: F.append([n + i, n + j, 2 * n, -1])
    F = [f if len(f) == 4 else f for f in F]
    UV = np.tile(np.array([[0, 0], [0.01, 0], [0.01, 0.01], [0, 0.01]]) + np.array(uvo), (len(F), 1, 1))
    Fa = np.array([f if len(f) == 4 else f for f in F])
    mb.add(V, Fa, UV=UV, mat=mat)


def ribbon(mb, sup, guide, width, thick, off, mat, n=None, uvo=(0.0, 0.0), uv_scale=1 / 1.7, use_body=True, closed=False, rays=None):
    """Gurt entlang einer Leitlinie (projiziert). Rueckgabe: Mittelpunkte, Normalen, Tangenten."""
    from coat_sleeve import catmull
    g = np.asarray(guide, float)
    if closed:
        g = np.vstack([g, g[:1]])
    poly = catmull(g, 30)
    L = np.r_[0, np.cumsum(np.linalg.norm(np.diff(poly, axis=0), axis=1))]
    if n is None: n = max(4, int(L[-1] / 0.02))
    ss = np.linspace(0, L[-1], n)
    P = np.stack([np.interp(ss, L, poly[:, k]) for k in range(3)], 1)
    C = []; N = []
    for i, p in enumerate(P):
        l, nn = sup.nearest(p, use_body)
        C.append(l); N.append(norm(nn))
    C = np.array(C); N = np.array(N)
    # Normalen glaetten
    N = norm(gauss_smooth(N, 1.5, 0, mode='wrap' if closed else 'nearest'))
    C = gauss_smooth(C, 0.8, 0, mode='wrap' if closed else 'nearest')
    T = norm(np.gradient(C, axis=0))
    if closed:
        T[0] = norm(C[1] - C[-2]); T[-1] = T[0]
    S = norm(np.cross(N, T))
    base = C + N * off
    hw = width / 2
    p0 = base - S * hw; p1 = base + S * hw; p2 = p1 + N * thick; p3 = p0 + N * thick
    V = np.concatenate([p0, p1, p2, p3])
    m = len(P)
    F = []; UV = []
    for i in range(m - 1):
        for a, b in ((3, 2), (2, 1), (0, 3)):   # oben, Seite+, Seite-
            q = [a * m + i, a * m + i + 1, b * m + i + 1, b * m + i]
            F.append(q[::-1] if (a, b) != (3, 2) else [3 * m + i, 2 * m + i, 2 * m + i + 1, 3 * m + i + 1])
            u0 = ss[i] * uv_scale; u1 = ss[i + 1] * uv_scale
            UV.append([[uvo[0] + 0.0, 1 - (uvo[1] + u0)], [uvo[0] + 0.02, 1 - (uvo[1] + u0)], [uvo[0] + 0.02, 1 - (uvo[1] + u1)], [uvo[0], 1 - (uvo[1] + u1)]])
    if not closed:
        for i in (0, m - 1):
            q = [0 * m + i, 1 * m + i, 2 * m + i, 3 * m + i]
            F.append(q if i == m - 1 else q[::-1]); UV.append([[0.9, 0.9]] * 4)
    mb.add(V, np.array(F), UV=np.array(UV, float), mat=mat)
    return C, N, T, S


def conform_grid(sup, origin, X, Y, dirv, nu, nv, w, h, use_body=False):
    """Rechteck (Mitte origin, Achsen X (Breite), Y (Hoehe)) entlang dirv auf die Flaeche projizieren -> (nu,nv,3), Normalen"""
    X = norm(np.asarray(X, float)); Y = norm(np.asarray(Y, float)); d = norm(np.asarray(dirv, float))
    P = np.zeros((nu, nv, 3)); N = np.zeros((nu, nv, 3))
    for i in range(nu):
        for j in range(nv):
            q = origin + (i / (nu - 1) - 0.5) * w * X + (j / (nv - 1) - 0.5) * h * Y
            l, nn = sup.ray(q - d * 0.3, d, use_body)
            if l is None:
                l, nn = sup.nearest(q, use_body)
            P[i, j] = l; N[i, j] = norm(nn)
    N = norm(gauss_smooth(gauss_smooth(N, 1.0, 0), 1.0, 1))
    return P, N


def slab(mb, P, N, off_top, off_bot, mat, uv_rect=(0.8, 0.8, 0.1, 0.1), round_edge=0.0, prof=None):
    """Platte auf der Flaeche: Oberseite (P+N*off_top[*prof]) + Seitenwaende zur Unterkante (P+N*off_bot)."""
    nu, nv, _ = P.shape
    ot = np.full((nu, nv), off_top) if prof is None else off_bot + (off_top - off_bot) * prof
    T = P + N * ot[..., None]
    Bt = P + N * off_bot
    V = np.concatenate([T.reshape(-1, 3), Bt.reshape(-1, 3)])
    idx = np.arange(nu * nv).reshape(nu, nv); ofs = nu * nv
    F = []; UV = []
    u0, v0, du, dv = uv_rect
    def uvp(i, j): return [u0 + du * i / (nu - 1), 1 - (v0 + dv * (1 - j / (nv - 1)))]
    for i in range(nu - 1):
        for j in range(nv - 1):
            F.append([idx[i, j], idx[i + 1, j], idx[i + 1, j + 1], idx[i, j + 1]])
            UV.append([uvp(i, j), uvp(i + 1, j), uvp(i + 1, j + 1), uvp(i, j + 1)])
    # Rand
    border = [idx[i, 0] for i in range(nu)] + [idx[nu - 1, j] for j in range(1, nv)] + [idx[i, nv - 1] for i in range(nu - 2, -1, -1)] + [idx[0, j] for j in range(nv - 2, 0, -1)]
    for k in range(len(border)):
        a = border[k]; b = border[(k + 1) % len(border)]
        F.append([b, a, a + ofs, b + ofs]); UV.append([[u0, 1 - v0]] * 4)
    # Orientierung pruefen: Normale der ersten Oberseite vs N
    Vt = T
    nrm = np.cross(Vt[1, 0] - Vt[0, 0], Vt[0, 1] - Vt[0, 0])
    if np.dot(nrm, N[0, 0]) < 0:
        F = [f[::-1] for f in F]; UV = [u[::-1] for u in UV]
    mb.add(V, np.array(F), UV=np.array(UV, float), mat=mat)
    return T


def flat_ring(mb, c, X, Y, Nn, r0, r1, n, mat, uv=(0.95, 0.95)):
    ph = np.arange(n) * TAU / n
    a = c + (np.cos(ph)[:, None] * X + np.sin(ph)[:, None] * Y) * r0
    b = c + (np.cos(ph)[:, None] * X + np.sin(ph)[:, None] * Y) * r1
    V = np.concatenate([a, b]); F = []
    for i in range(n):
        j = (i + 1) % n
        F.append([i, j, n + j, n + i])
    F = np.array(F)
    if np.dot(np.cross(V[1] - V[0], V[n] - V[0]), Nn) < 0: F = F[:, ::-1]
    mb.add(V, F, UV=np.tile(np.array([[0, 0], [0.005, 0], [0.005, 0.005], [0, 0.005]]) + np.array(uv), (n, 1, 1)), mat=mat)


def flat_bar(mb, p0, p1, Nn, w, mat, uv=(0.95, 0.95)):
    t = norm(p1 - p0); s = norm(np.cross(Nn, t)) * w / 2
    V = np.array([p0 - s, p1 - s, p1 + s, p0 + s]); F = np.array([[0, 1, 2, 3]])
    if np.dot(np.cross(V[1] - V[0], V[3] - V[0]), Nn) < 0: F = F[:, ::-1]
    mb.add(V, F, UV=np.array([[[uv[0], uv[1]], [uv[0] + .005, uv[1]], [uv[0] + .005, uv[1] + .005], [uv[0], uv[1] + .005]]]), mat=mat)


def logo(mb, c, X, Y, Nn, R, mat, lift=0.0015, w=None):
    """A im Kreis als leuchtende Geometrie (Ring + 3 Balken)."""
    w = w or R * 0.13
    c = c + Nn * lift
    flat_ring(mb, c, X, Y, Nn, R - w, R, 40, mat)
    top = c + Y * (R * 0.72); bl = c - Y * (R * 0.55) - X * (R * 0.55); br = c - Y * (R * 0.55) + X * (R * 0.55)
    flat_bar(mb, bl, top, Nn, w, mat); flat_bar(mb, br, top, Nn, w, mat)
    flat_bar(mb, c - Y * R * 0.12 - X * R * 0.33, c - Y * R * 0.12 + X * R * 0.33, Nn, w * 0.9, mat)
