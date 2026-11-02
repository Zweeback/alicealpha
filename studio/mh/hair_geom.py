"""Haar-Abteilung: Geometrie-Bibliothek (reines numpy + bpy/mathutils fuer die Kopfhaut-Abfrage).
 - Scalp: Radialkarte R(theta,phi) des Schaedels um das Kopfzentrum C (aus Raycasts auf Alice_Body)
 - Kurven (Catmull-Rom / Bezier auf der Kugel), Ribbon-/Karten-Builder mit Verjuengung, Bulge, Twist
 Koordinaten: Blender-Welt (Meter, Z oben), Charakter schaut -Y, theta=0 -> vorn (-Y), +90 deg -> +X (Charakter-links), phi = Elevation.
"""
import numpy as np

C_HEAD = np.array([0.0, -0.047, 1.54])


def nrm(v, eps=1e-12):
    v = np.asarray(v, dtype=np.float64)
    return v / np.maximum(np.linalg.norm(v, axis=-1, keepdims=True), eps)


def sph_dir(theta, phi):
    """theta/phi in Radiant -> Einheitsvektor (vorn = -Y, links = +X)."""
    theta = np.asarray(theta, dtype=np.float64); phi = np.asarray(phi, dtype=np.float64)
    return np.stack([np.sin(theta) * np.cos(phi), -np.cos(theta) * np.cos(phi), np.sin(phi)], axis=-1)


def dir_sph(d):
    d = nrm(d)
    return np.arctan2(d[..., 0], -d[..., 1]), np.arcsin(np.clip(d[..., 2], -1, 1))


def smoothstep(a, b, x):
    t = np.clip((np.asarray(x, dtype=np.float64) - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


# --------------------------------------------------------------------------- Kopfhaut-Radialkarte
class Scalp:
    def __init__(self, body_obj=None, cache=None, n_th=240, phi_min=-75.0, phi_max=90.0, n_ph=111):
        self.th = np.linspace(-np.pi, np.pi, n_th, endpoint=False)
        self.ph = np.radians(np.linspace(phi_min, phi_max, n_ph))
        self.R = None
        if cache:
            import os
            if os.path.exists(cache):
                z = np.load(cache)
                if z['R'].shape == (n_th, n_ph):
                    self.R = z['R']; self.bvh_ok = False
        if self.R is None:
            self._build(body_obj, n_th, n_ph)
            if cache: np.savez(cache, R=self.R)

    def _build(self, body_obj, n_th, n_ph):
        import bpy
        from mathutils import Vector
        from mathutils.bvhtree import BVHTree
        dg = bpy.context.evaluated_depsgraph_get()
        bvh = BVHTree.FromObject(body_obj, dg)
        R = np.zeros((n_th, n_ph))
        c = Vector(C_HEAD)
        for i, t in enumerate(self.th):
            for j, p in enumerate(self.ph):
                d = Vector(sph_dir(t, p))
                hit = bvh.ray_cast(c, d, 0.5)
                R[i, j] = hit[3] if hit[0] is not None else 0.1
        # leichte Glaettung (facettierter Schaedel-Oberteil)
        from scipy.ndimage import gaussian_filter
        Rp = np.concatenate([R, R, R], axis=0)
        Rp = gaussian_filter(Rp, sigma=(1.6, 1.6), mode='nearest')
        self.R = Rp[n_th:2 * n_th]

    def radius(self, theta, phi):
        theta = np.asarray(theta, dtype=np.float64); phi = np.asarray(phi, dtype=np.float64)
        nt = len(self.th); dth = 2 * np.pi / nt
        fi = ((theta + np.pi) / dth) % nt
        i0 = np.floor(fi).astype(int); fi = fi - i0; i1 = (i0 + 1) % nt; i0 = i0 % nt
        p0 = self.ph[0]; dph = self.ph[1] - self.ph[0]
        fj = np.clip((phi - p0) / dph, 0, len(self.ph) - 1.001)
        j0 = np.floor(fj).astype(int); fj = fj - j0; j1 = j0 + 1
        R = self.R
        return ((R[i0, j0] * (1 - fi) + R[i1, j0] * fi) * (1 - fj) + (R[i0, j1] * (1 - fi) + R[i1, j1] * fi) * fj)

    def point(self, theta, phi, h=0.0):
        """Weltpunkt ueber der Kopfhaut (Abstand h entlang radial)"""
        d = sph_dir(theta, phi)
        r = self.radius(theta, phi) + h
        return C_HEAD + d * r[..., None]

    def point_dir(self, d, h=0.0):
        t, p = dir_sph(d)
        return self.point(t, p, h), t, p

    def normal(self, theta, phi):
        e = 0.01
        p = self.point(theta, phi)
        dt = self.point(theta + e, phi) - self.point(theta - e, phi)
        dp = self.point(theta, phi + e) - self.point(theta, phi - e)
        n = np.cross(dt, dp)
        n = nrm(n)
        out = sph_dir(theta, phi)
        s = np.sign(np.sum(n * out, axis=-1, keepdims=True)); s[s == 0] = 1
        return n * s


# --------------------------------------------------------------------------- Kurven
def catmull(P, n, closed=False, alpha=0.5):
    """Centripetal Catmull-Rom durch Stuetzpunkte P (k,3) -> n Punkte (gleichmaessig im Parameter)."""
    P = np.asarray(P, dtype=np.float64)
    k = len(P)
    if k == 2:
        t = np.linspace(0, 1, n)[:, None]; return P[0] * (1 - t) + P[1] * t
    Q = np.vstack([2 * P[0] - P[1], P, 2 * P[-1] - P[-2]])
    out = []
    ts = np.linspace(0, k - 1, n)
    for t in ts:
        i = min(int(np.floor(t)), k - 2); u = t - i
        p0, p1, p2, p3 = Q[i], Q[i + 1], Q[i + 2], Q[i + 3]
        # uniform CR (stabil genug, Stuetzpunkte sind gleichmaessig verteilt)
        out.append(0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u ** 3))
    return np.array(out)


def bezier(P, n):
    P = np.asarray(P, dtype=np.float64)
    t = np.linspace(0, 1, n)[:, None]
    deg = len(P) - 1
    from math import comb
    out = np.zeros((n, 3))
    for i, p in enumerate(P):
        out += comb(deg, i) * (1 - t) ** (deg - i) * t ** i * p
    return out


def sph_bezier(U, n):
    """Bezier auf der Einheitskugel (de Casteljau in R3, danach normalisiert) -> (n,3) Einheitsvektoren"""
    return nrm(bezier(np.asarray(U), n))


def arclen(P):
    d = np.linalg.norm(np.diff(P, axis=0), axis=1)
    return np.concatenate([[0], np.cumsum(d)])


def resample(P, n):
    s = arclen(P); s = s / max(s[-1], 1e-9)
    t = np.linspace(0, 1, n)
    return np.stack([np.interp(t, s, P[:, k]) for k in range(3)], axis=1)


def tangents(P):
    T = np.gradient(P, axis=0)
    return nrm(T)


def rodrigues(v, axis, ang):
    axis = nrm(axis)
    c, s = np.cos(ang), np.sin(ang)
    return v * c + np.cross(axis, v) * s + axis * np.sum(axis * v, axis=-1, keepdims=True) * (1 - c)


# --------------------------------------------------------------------------- Mesh-Akkumulator
class MeshAcc:
    def __init__(self, name):
        self.name = name
        self.co = []; self.uv = []; self.tri = []; self.nrm = []
        self.vg = {}          # gruppe -> (index-liste, gewichts-liste)
        self.nv = 0
        self.card_ranges = []  # (start,end) je Karte
        self.meta = []

    def add(self, co, uv, tri, normals=None, weights=None, meta=None):
        """weights: dict gruppe-> (n,) Array (pro Vertex). co (n,3), uv (n,2), tri (m,3) lokale Indizes."""
        n = len(co)
        self.co.append(np.asarray(co, dtype=np.float64)); self.uv.append(np.asarray(uv, dtype=np.float64))
        self.tri.append(np.asarray(tri, dtype=np.int64) + self.nv)
        self.nrm.append(np.asarray(normals, dtype=np.float64) if normals is not None else np.full((n, 3), np.nan))
        if weights:
            for g, w in weights.items():
                idx, ww = self.vg.setdefault(g, ([], []))
                w = np.asarray(w, dtype=np.float64)
                sel = np.nonzero(w > 1e-4)[0]
                idx.append(sel + self.nv); ww.append(w[sel])
        self.card_ranges.append((self.nv, self.nv + n)); self.meta.append(meta)
        self.nv += n

    def arrays(self):
        co = np.vstack(self.co); uv = np.vstack(self.uv); tri = np.vstack(self.tri); nr = np.vstack(self.nrm)
        return co, uv, tri, nr

    def ntris(self):
        return int(sum(len(t) for t in self.tri))


# --------------------------------------------------------------------------- Ribbon / Karte
def ribbon(P, Nh, W, u0=0.0, u1=1.0, v0=0.0, v1=1.0, across=3, bulge=0.12, twist=None, vparam=None,
           width_profile=None, flip_uv=False, side_override=None):
    """Streifen entlang der Mittellinie P (n,3).  Nh: Flaechen-Normalen-Hinweis (n,3) oder (3,), W: Breite (n,) oder float.
    Gibt co (n*across,3), uv, tri, nrm (glatte Normale aus Querschnitt-Buckel), side (n,3)"""
    P = np.asarray(P, dtype=np.float64); n = len(P)
    Nh = np.broadcast_to(np.asarray(Nh, dtype=np.float64), (n, 3)).copy()
    W = np.broadcast_to(np.asarray(W, dtype=np.float64), (n,)).copy()
    T = tangents(P)
    if side_override is None:
        S = np.cross(T, Nh)
        bad = np.linalg.norm(S, axis=1) < 1e-6
        if bad.any():
            S[bad] = np.cross(T[bad], np.array([0, 0, 1.0]))
        S = nrm(S)
    else:
        S = nrm(side_override)
    # S glaetten (Orientierungssprung vermeiden)
    for _ in range(2):
        S[1:-1] = nrm(S[:-2] + 2 * S[1:-1] + S[2:])
    Nf = nrm(np.cross(S, T))
    if twist is not None:
        tw = np.broadcast_to(np.asarray(twist, dtype=np.float64), (n,))
        c, s = np.cos(tw)[:, None], np.sin(tw)[:, None]
        S2 = S * c + Nf * s; Nf = Nf * c - S * s; S = S2
    sc = np.linspace(-0.5, 0.5, across)  # Querposition
    co = np.zeros((n, across, 3)); nr = np.zeros((n, across, 3))
    for j, s in enumerate(sc):
        prof = bulge * (1 - (2 * s) ** 2)  # 0 am Rand, bulge in der Mitte
        co[:, j] = P + S * (W * s)[:, None] + Nf * (W * prof)[:, None]
        # Normale des Querschnitts (Parabel)  -> n ~ Nf - S * d(prof)/dx
        slope = -bulge * 8 * s  # d(prof)/d(s/W...) gewichtet
        nr[:, j] = nrm(Nf - S * slope * 0.5)
    vp = np.linspace(0, 1, n) if vparam is None else np.asarray(vparam)
    uv = np.zeros((n, across, 2))
    for j in range(across):
        uf = j / (across - 1)
        uv[:, j, 0] = u0 + (u1 - u0) * (1 - uf if flip_uv else uf)
        uv[:, j, 1] = v0 + (v1 - v0) * vp
    tri = []
    for i in range(n - 1):
        for j in range(across - 1):
            a = i * across + j; b = a + 1; c = (i + 1) * across + j + 1; d = (i + 1) * across + j
            tri.append((a, b, c)); tri.append((a, c, d))
    return co.reshape(-1, 3), uv.reshape(-1, 2), np.array(tri), nr.reshape(-1, 3), S


def taper(n, w0, w1, tip=0.12, root=0.0, power=1.4, tip_ratio=0.12):
    """Breitenprofil: w0 an der Wurzel, w1 in der Mitte, Spitze verjuengt auf tip_ratio*w1"""
    t = np.linspace(0, 1, n)
    w = w0 + (w1 - w0) * smoothstep(0.0, 0.35, t)
    k = smoothstep(1 - tip * 3.2, 1.0, t) ** power
    w = w * (1 - k * (1 - tip_ratio))
    if root > 0:
        w = w * (0.6 + 0.4 * smoothstep(0, root, t))
    return w
