"""Textur-Backen per Positions-Map: UV-Raster -> Weltposition/Normale/Tangenten pro Texel; Muster werden im 3D-Raum (Meter) ausgewertet,
Höhenfelder -> Tangentialraum-Normalmap. Ergebnis: PNG (sRGB 8 bit)."""
import os, math
import numpy as np
from scipy import ndimage as ndi
from PIL import Image


def _tri_tangents(p, uv):
    e1 = p[1] - p[0]; e2 = p[2] - p[0]
    d1 = uv[1] - uv[0]; d2 = uv[2] - uv[0]
    det = d1[0] * d2[1] - d2[0] * d1[1]
    if abs(det) < 1e-14: return np.array([1.0, 0, 0]), np.array([0, 1.0, 0]), 0.0
    r = 1.0 / det
    T = (e1 * d2[1] - e2 * d1[1]) * r
    B = (e2 * d1[0] - e1 * d2[0]) * r
    return T, B, det


def rasterize(P, F, loop_uv, vnorm, vattr=None, res=2048, pad=6):
    """P (n,3) Positionen; F: Tupel (Quad/Tri); loop_uv: (nloops,2); vnorm (n,3); vattr: (n,k) Zusatzattribute.
    Rückgabe dict: pos, nrm, T, B (res,res,3) float32 (Zeile 0 = v=0 unten), attr (res,res,k), valid(bool), mpp (res,res) Meter/Pixel"""
    pos = np.zeros((res, res, 3), np.float32); nrm = np.zeros((res, res, 3), np.float32)
    Tm = np.zeros((res, res, 3), np.float32); Bm = np.zeros((res, res, 3), np.float32)
    k = 0 if vattr is None else vattr.shape[1]
    att = np.zeros((res, res, max(k, 1)), np.float32)
    valid = np.zeros((res, res), bool)
    mpp = np.zeros((res, res), np.float32)
    li = 0
    for f in F:
        n = len(f)
        uvs = loop_uv[li:li + n] * res; li += n
        tris = [(0, 1, 2)] if n == 3 else [(0, 1, 2), (0, 2, 3)]
        for t in tris:
            a, b, c = uvs[t[0]], uvs[t[1]], uvs[t[2]]
            x0 = int(max(0, math.floor(min(a[0], b[0], c[0]) - 1))); x1 = int(min(res - 1, math.ceil(max(a[0], b[0], c[0]) + 1)))
            y0 = int(max(0, math.floor(min(a[1], b[1], c[1]) - 1))); y1 = int(min(res - 1, math.ceil(max(a[1], b[1], c[1]) + 1)))
            if x1 < x0 or y1 < y0: continue
            gx, gy = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
            den = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
            if abs(den) < 1e-12: continue
            l0 = ((b[1] - c[1]) * (gx - c[0]) + (c[0] - b[0]) * (gy - c[1])) / den
            l1 = ((c[1] - a[1]) * (gx - c[0]) + (a[0] - c[0]) * (gy - c[1])) / den
            l2 = 1 - l0 - l1
            m = (l0 >= -1e-4) & (l1 >= -1e-4) & (l2 >= -1e-4)
            if not m.any(): continue
            ids = [f[t[0]], f[t[1]], f[t[2]]]
            sl = (slice(y0, y1 + 1), slice(x0, x1 + 1))
            w0, w1, w2 = l0[m], l1[m], l2[m]
            pp = np.stack([P[ids[0]], P[ids[1]], P[ids[2]]])
            pos[sl][m] = w0[:, None] * pp[0] + w1[:, None] * pp[1] + w2[:, None] * pp[2]
            nn = np.stack([vnorm[ids[0]], vnorm[ids[1]], vnorm[ids[2]]])
            nrm[sl][m] = w0[:, None] * nn[0] + w1[:, None] * nn[1] + w2[:, None] * nn[2]
            if k:
                aa = np.stack([vattr[ids[0]], vattr[ids[1]], vattr[ids[2]]])
                att[sl][m] = w0[:, None] * aa[0] + w1[:, None] * aa[1] + w2[:, None] * aa[2]
            uvn = np.array([uvs[t[0]], uvs[t[1]], uvs[t[2]]]) / res
            T, B, det = _tri_tangents(pp, uvn)
            Tm[sl][m] = T; Bm[sl][m] = B
            mpp[sl][m] = math.sqrt(max(np.linalg.norm(np.cross(T, B)), 1e-18)) / res
            valid[sl] |= m
    # Padding: nächstgelegene gültige Texel übernehmen
    dist, (iy, ix) = ndi.distance_transform_edt(~valid, return_indices=True)
    fill = (~valid) & (dist <= pad)
    for arr in (pos, nrm, Tm, Bm, att):
        arr[fill] = arr[iy[fill], ix[fill]]
    mpp[fill] = mpp[iy[fill], ix[fill]]
    vmask = valid | fill
    nl = np.linalg.norm(nrm, axis=2, keepdims=True); nl[nl < 1e-9] = 1; nrm /= nl
    return dict(pos=pos, nrm=nrm, T=Tm, B=Bm, attr=att, valid=valid, mask=vmask, mpp=mpp, res=res, dist=dist)


# ---------------------------------------------------------------- Rauschen
def _hash3(ix, iy, iz, seed=0):
    h = (ix.astype(np.int64) * 73856093) ^ (iy.astype(np.int64) * 19349663) ^ (iz.astype(np.int64) * 83492791) ^ (seed * 2654435761)
    h = (h ^ (h >> 13)) * 1274126177
    h = h ^ (h >> 16)
    return (h & 0xFFFFFF).astype(np.float64) / float(0xFFFFFF)


def vnoise3(p, freq, seed=0):
    """Value-Noise 3D (0..1). p (n,3) in Metern, freq in 1/m."""
    q = np.asarray(p, dtype=np.float64) * freq
    i = np.floor(q); f = q - i
    u = f * f * (3 - 2 * f)
    c = {}
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                c[(dx, dy, dz)] = _hash3(i[:, 0] + dx, i[:, 1] + dy, i[:, 2] + dz, seed)
    x00 = c[(0, 0, 0)] * (1 - u[:, 0]) + c[(1, 0, 0)] * u[:, 0]
    x10 = c[(0, 1, 0)] * (1 - u[:, 0]) + c[(1, 1, 0)] * u[:, 0]
    x01 = c[(0, 0, 1)] * (1 - u[:, 0]) + c[(1, 0, 1)] * u[:, 0]
    x11 = c[(0, 1, 1)] * (1 - u[:, 0]) + c[(1, 1, 1)] * u[:, 0]
    y0 = x00 * (1 - u[:, 1]) + x10 * u[:, 1]; y1 = x01 * (1 - u[:, 1]) + x11 * u[:, 1]
    return y0 * (1 - u[:, 2]) + y1 * u[:, 2]


def fbm3(p, freq, octaves=3, seed=0):
    s = 0; a = 0.5; tot = 0
    for o in range(octaves):
        s += a * vnoise3(p, freq * (2 ** o), seed + o * 17); tot += a; a *= 0.5
    return s / tot


# ---------------------------------------------------------------- Höhe -> Normalmap
def height_to_normal(H, maps, strength=1.0, valid=None):
    """H (res,res) Höhe in Metern. Tangentialraum (OpenGL, +Y = +v). Gradient entlang T/B in Metern."""
    res = H.shape[0]
    mpp = maps['mpp']
    Tn = np.linalg.norm(maps['T'], axis=2); Bn = np.linalg.norm(maps['B'], axis=2)
    # Gradient pro Pixel (Zentraldifferenz)
    gx = (np.roll(H, -1, axis=1) - np.roll(H, 1, axis=1)) * 0.5
    gy = (np.roll(H, -1, axis=0) - np.roll(H, 1, axis=0)) * 0.5
    # Meter pro Pixel entlang u bzw. v
    mx = np.maximum(Tn / res, 1e-6); my = np.maximum(Bn / res, 1e-6)
    sx = gx / mx; sy = gy / my
    # MikkTSpace: B zeigt in +v-Richtung (auch bei gespiegelter UV), N nach außen -> n_ts = (-dh/dT, -dh/dB, 1)
    nx = -sx * strength; ny = -sy * strength
    nz = np.ones_like(nx)
    l = np.sqrt(nx * nx + ny * ny + nz * nz)
    out = np.stack([nx / l, ny / l, nz / l], axis=2)
    return out


def save_srgb(arr01, path, flipv=True):
    """arr01 (res,res,3|4) 0..1; Zeile 0 = v=0 (unten) -> PNG: Zeile 0 oben -> flip."""
    a = np.clip(arr01, 0, 1)
    img = (a * 255 + 0.5).astype(np.uint8)
    if flipv: img = img[::-1]
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    Image.fromarray(img).save(path, optimize=True)
    return path


def save_normal(n, path):
    return save_srgb(n * 0.5 + 0.5, path)


def srgb_from_linear(x):
    x = np.clip(x, 0, 1)
    return np.where(x <= 0.0031308, 12.92 * x, 1.055 * np.power(x, 1 / 2.4) - 0.055)


def srgb8(r, g, b):
    return np.array([r, g, b], np.float32) / 255.0


def wrap_pi(a):
    return (a + math.pi) % (2 * math.pi) - math.pi
