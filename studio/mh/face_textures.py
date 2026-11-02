"""Face-Abteilung: erzeugt die Haut-/Augen-/Brauen-/Wimpern-Texturen (numpy/PIL, kein bpy nötig).
    python3 mh/face_textures.py [--only skin,eye,brow,lash,mouth] [--res 2048]
Voraussetzung: out/mh/face_work/body_uv.npz (python3 mh/face_uvbake.py out/mh/core.blend ...) – enthält pro UV-Pixel die 3D-Position
der Alice_Body-Basis; alle Zonen (Lippen, Wangen, Sommersprossen, Lid-Schatten …) werden im 3D-Raum definiert -> nahtfrei, UV-unabhängig.
Ausgabe: out/mh/tex/face_*.png  (sRGB-Diffuse, Tangent-Normalmap (OpenGL), Rauheit in G(+R))."""
import os, sys, itertools, argparse
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..'))
D = __import__('os').environ.get('MPFB_DATA', '/root/.config/blender/5.2/extensions/.user/user_default/mpfb/data')
OUT = os.path.join(ROOT, 'out', 'mh', 'tex')
WORK = os.path.join(ROOT, 'out', 'mh', 'face_work')
os.makedirs(OUT, exist_ok=True)
F32 = np.float32

# ----------------------------------------------------------------------------------------------- Landmarks (Meter, Blender, Z oben, -Y vorn)
EYE_C = (0.0290, -0.1197, 1.5211)
MOUTH_Z = 1.4598
MOUTH_HW = 0.0285
NOSE_TIP = np.array([0.0, -0.1617, 1.4950], F32)
EAR_C = np.array([0.080, -0.040, 1.517], F32)


def s2l(c):  # sRGB 0..1 -> linear
    c = np.asarray(c, F32); return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4).astype(F32)


def l2s(c):
    c = np.clip(c, 0, 1); return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055).astype(F32)


def hexc(h):
    h = h.lstrip('#'); return np.array([int(h[i:i + 2], 16) / 255. for i in (0, 2, 4)], F32)


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a + 1e-9), 0, 1); return (t * t * (3 - 2 * t)).astype(F32)


# ----------------------------------------------------------------------------------------------- 3D-Rauschen
def hash3(ix, iy, iz, seed):
    with np.errstate(over='ignore'):
        h = (ix.astype(np.uint32) * np.uint32(73856093)) ^ (iy.astype(np.uint32) * np.uint32(19349663)) ^ \
            (iz.astype(np.uint32) * np.uint32(83492791)) ^ np.uint32((seed * 2654435761) % (2 ** 32))
        h ^= h >> np.uint32(13); h *= np.uint32(0x5bd1e995); h ^= h >> np.uint32(15)
        h *= np.uint32(0x27d4eb2d); h ^= h >> np.uint32(16)
    return (h & np.uint32(0xFFFFFF)).astype(F32) / F32(16777216.0)


def vnoise(P, scale, seed=0):
    q = P / F32(scale); i = np.floor(q); f = q - i; i = i.astype(np.int64)
    u = f * f * (3 - 2 * f)
    out = 0
    for dx, dy, dz in itertools.product((0, 1), repeat=3):
        w = (u[:, 0] if dx else 1 - u[:, 0]) * (u[:, 1] if dy else 1 - u[:, 1]) * (u[:, 2] if dz else 1 - u[:, 2])
        out = out + w * hash3(i[:, 0] + dx, i[:, 1] + dy, i[:, 2] + dz, seed)
    return out.astype(F32)


def fbm(P, scale, octs=3, seed=0, gain=0.5):
    a, tot, out = 1.0, 0.0, 0
    for o in range(octs):
        out = out + a * vnoise(P, scale / (2 ** o), seed + 17 * o); tot += a; a *= gain
    return (out / tot).astype(F32)


def blobs(P, cs, dens, rmin, rmax, seed, soft=2.2, irregular=0.35, amin=0.55):
    """Punktprozess aus 3D-Zellen: pro Zelle max. 1 Fleck (Sommersprosse). dens = Dichte (0..1) je Pixel. Rückgabe Intensität 0..1."""
    q = P / F32(cs); i0 = np.floor(q).astype(np.int64)
    out = np.zeros(len(P), F32)
    nz = fbm(P, cs * 0.9, 2, seed + 99)
    for d in itertools.product((-1, 0, 1), repeat=3):
        ci = i0 + np.array(d)
        r0 = hash3(ci[:, 0], ci[:, 1], ci[:, 2], seed)
        act = r0 < dens
        if not act.any(): continue
        fx = hash3(ci[:, 0], ci[:, 1], ci[:, 2], seed + 1); fy = hash3(ci[:, 0], ci[:, 1], ci[:, 2], seed + 2); fz = hash3(ci[:, 0], ci[:, 1], ci[:, 2], seed + 3)
        fp = (ci + np.stack([0.15 + 0.7 * fx, 0.15 + 0.7 * fy, 0.15 + 0.7 * fz], 1)) * cs
        dist = np.linalg.norm(P - fp, axis=1)
        rad = rmin + (rmax - rmin) * hash3(ci[:, 0], ci[:, 1], ci[:, 2], seed + 4) ** 1.5
        rad = rad * (1 - irregular + 2 * irregular * nz)
        a = amin + (1 - amin) * hash3(ci[:, 0], ci[:, 1], ci[:, 2], seed + 5)
        val = np.exp(-(dist / np.maximum(rad, 1e-5)) ** 2 * soft) * a * act
        out = np.maximum(out, val)
    return out


def ell(P, c, r):
    d = (P - np.asarray(c, F32)) / np.asarray(r, F32)
    return np.exp(-(d * d).sum(1)).astype(F32)


def sym(P):  # Spiegel auf +X (Gesichtsfelder sind symmetrisch)
    Q = P.copy(); Q[:, 0] = np.abs(Q[:, 0]); return Q


# ----------------------------------------------------------------------------------------------- UV-Maps
class Maps:
    def __init__(self, res=2048, path=None):
        path = path or os.path.join(WORK, 'body_uv.npz')
        d = np.load(path)
        self.res = d['cover'].shape[0]
        self.cover = d['cover']; self.idx = np.flatnonzero(self.cover.ravel())
        self.P = d['pos'].reshape(-1, 3)[self.idx].astype(F32)
        self.N = d['nrm'].reshape(-1, 3)[self.idx].astype(F32)
        self.attr = d['attr'].reshape(-1, d['attr'].shape[-1])[self.idx]
        self.keys = list(d['keys'])
        self.n = len(self.idx)
        # Pixel-Gradient der Position (Texeldichte)  -> m / px
        pos = d['pos']
        gx = np.zeros(pos.shape[:2], F32); gy = np.zeros(pos.shape[:2], F32)
        dx = np.linalg.norm(pos[:, 2:] - pos[:, :-2], axis=2) / 2; gx[:, 1:-1] = dx
        dy = np.linalg.norm(pos[2:] - pos[:-2], axis=2) / 2; gy[1:-1] = dy
        okx = np.zeros(self.cover.shape, bool); okx[:, 1:-1] = self.cover[:, 2:] & self.cover[:, :-2]
        oky = np.zeros(self.cover.shape, bool); oky[1:-1] = self.cover[2:] & self.cover[:-2]
        gx[~okx] = np.nan; gy[~oky] = np.nan
        self.mpp_x = gx.reshape(-1)[self.idx]; self.mpp_y = gy.reshape(-1)[self.idx]
        self.pos_img = pos

    def img(self, vals, fill=0.0):
        """(N,[C]) -> (H,W,[C]) Bild; nicht abgedeckte Pixel bleiben fill"""
        shp = (self.res * self.res,) + vals.shape[1:]
        out = np.full(shp, fill, F32); out[self.idx] = vals
        return out.reshape((self.res, self.res) + vals.shape[1:])

    def pad(self, im, iters=24):
        """Rand-Padding (nächster gültiger Pixel) gegen Mip-/Naht-Artefakte"""
        inv = ~self.cover
        _, (iy, ix) = ndi.distance_transform_edt(inv, return_indices=True)
        out = im[iy, ix]
        return out


def save_png(arr, name, mode=None):
    a = np.clip(arr, 0, 1); a = (a * 255 + 0.5).astype(np.uint8)
    p = os.path.join(OUT, name); Image.fromarray(a, mode).save(p, optimize=True); print('  wrote', p, a.shape)
    return p


# ----------------------------------------------------------------------------------------------- Gesichts-Geometriehilfen
def interp(x, xs, ys): return np.interp(x, xs, ys).astype(F32)


UP_X = [0.0150, 0.0168, 0.0207, 0.0249, 0.0293, 0.0330, 0.0368, 0.0392, 0.0411, 0.0443, 0.0480, 0.0520]
UP_Z = [1.5213, 1.5215, 1.5242, 1.5254, 1.5258, 1.5256, 1.5246, 1.5236, 1.5219, 1.5210, 1.5200, 1.5195]
LO_X = [0.0150, 0.0168, 0.0213, 0.0252, 0.0285, 0.0326, 0.0364, 0.0385, 0.0409, 0.0430, 0.0460, 0.0520]
LO_Z = [1.5207, 1.5175, 1.5159, 1.5157, 1.5153, 1.5156, 1.5166, 1.5173, 1.5190, 1.5200, 1.5205, 1.5200]


def front_depth(M, x0=-0.045, x1=0.045, z0=1.38, z1=1.64, cell=0.0005):
    """Tiefe eines Pixels hinter der vordersten Oberfläche (Frontansicht) – trennt Außenlippe/Mundinneres, Nasenlöcher usw."""
    P = M.P
    nx = int((x1 - x0) / cell) + 1; nz = int((z1 - z0) / cell) + 1
    ix = np.clip(((P[:, 0] - x0) / cell).astype(int), 0, nx - 1); iz = np.clip(((P[:, 2] - z0) / cell).astype(int), 0, nz - 1)
    ok = (P[:, 1] < -0.04) & (P[:, 2] > z0) & (P[:, 2] < z1) & (np.abs(P[:, 0]) < x1)
    H = np.full((nx, nz), 9.0, F32)
    np.minimum.at(H, (ix[ok], iz[ok]), P[ok, 1])
    H[H > 8] = np.nan
    # Lücken auffüllen
    msk = np.isnan(H); 
    if msk.any():
        _, (a, b) = ndi.distance_transform_edt(msk, return_indices=True); H = H[a, b]
    H = ndi.minimum_filter(H, size=2)
    depth = P[:, 1] - H[ix, iz]
    depth[~ok] = 0
    return depth.astype(F32)


def lip_shape(P):
    """Lippen-Maske: (upper_coord, lower_coord) -> weiche Maske, plus Koordinaten; X = |x|/Mundhalbbreite."""
    X = np.abs(P[:, 0]) / MOUTH_HW; dz = P[:, 2] - MOUTH_Z
    Xc = np.clip(X, 0, 1)
    bow = 0.0011 * np.exp(-((Xc - 0.22) / 0.16) ** 2) - 0.0009 * np.exp(-(Xc / 0.09) ** 2)
    top = 0.0098 * (1 - Xc ** 2.6) ** 0.55 + bow
    bot = 0.0128 * (1 - Xc ** 2.2) ** 0.6
    return X, dz, top.astype(F32), bot.astype(F32)


def hairline_weight(P, width=0.009):
    """1 über der Haarlinie (Kopfhaut), 0 darunter (Gesicht/Nacken). Haarlinie als Funktion des Winkels um die Kopfachse."""
    ang = np.degrees(np.arctan2(P[:, 0], -(P[:, 1] + 0.045)))  # 0 = vorn, +-90 seitlich, 180 hinten
    a = np.abs(ang)
    z_hl = interp(a, [0, 25, 50, 75, 100, 125, 150, 180], [1.600, 1.596, 1.586, 1.566, 1.545, 1.515, 1.490, 1.478])
    return smoothstep(-width, width, P[:, 2] - z_hl)


# ----------------------------------------------------------------------------------------------- Brauen-Mittellinie
def brow_centerline():
    d = np.load(os.path.join(WORK, 'helper_meshes.npz'), allow_pickle=True)
    co = d['Alice_Brows_co']; co = co[co[:, 0] > 0]
    xs = np.sort(co[:, 0]); bins = np.linspace(xs.min(), xs.max(), 22)
    pts = []
    for a, b in zip(bins[:-1], bins[1:]):
        s = co[(co[:, 0] >= a) & (co[:, 0] <= b)]
        if len(s): pts.append(s.mean(0))
    return np.array(pts, F32)


def dist_to_polyline(P, line):
    """Abstand, Bogenlängenparameter (0..1) und Seitenabstand (vorzeichenbehaftet in Z) zu einer Polyline"""
    seg = line[1:] - line[:-1]; L = np.linalg.norm(seg, axis=1); cum = np.concatenate([[0], np.cumsum(L)])
    best = np.full(len(P), 9.0, F32); s_out = np.zeros(len(P), F32); side = np.zeros(len(P), F32)
    for i in range(len(seg)):
        a = line[i]; ab = seg[i]; t = np.clip(((P - a) @ ab) / (ab @ ab), 0, 1)
        q = a + t[:, None] * ab; dv = P - q; d = np.linalg.norm(dv, axis=1)
        m = d < best
        best[m] = d[m]; s_out[m] = (cum[i] + t[m] * L[i]) / cum[-1]; side[m] = np.sign(dv[m, 2]) * d[m]
    return best, s_out, side


# ----------------------------------------------------------------------------------------------- HAUT
SKIN_CFG = dict(base='#dd9f86', freckle=1.0, blush=1.0, lips='#c4655d', lip_alpha=0.86, verbose=True)


def build_skin(M, cfg=None):
    c = dict(SKIN_CFG); c.update(cfg or {}); cfg = c
    P = M.P; n = M.n; Ps = sym(P); z = P[:, 2]; ax = np.abs(P[:, 0])
    log = (lambda *a: print(' ', *a)) if cfg.get('verbose') else (lambda *a: None)
    import cv2
    g = np.array(Image.open(f'{D}/skins/toigo_light_skin_female_ginger_2/young_lightskinned_female_diffuse_Ginger2.png').convert('RGB'))
    gm = cv2.medianBlur(cv2.medianBlur(g, 7), 5).astype(F32) / 255.
    lum = gm @ np.array([.3, .59, .11], F32)
    hp = lum - cv2.GaussianBlur(lum, (0, 0), 7)
    hp = np.where(np.abs(hp) < 0.006, 0, hp - np.sign(hp) * 0.006)
    hpv = hp.reshape(-1)[M.idx]

    # ---------------------------------------------------- Basiston (sRGB), kontinuierlich über Gesicht/Hals/Körper
    base = hexc(cfg['base'])
    col = np.tile(base, (n, 1)).astype(F32)
    nlo = fbm(P, 0.06, 3, 1); nmid = fbm(P, 0.022, 3, 2); nhi = fbm(P, 0.006, 2, 3)
    col *= (1 + 0.07 * (nlo - 0.5) + 0.035 * (nmid - 0.5) + 0.02 * (nhi - 0.5))[:, None]
    pink = (fbm(P, 0.035, 3, 7) - 0.5)
    col[:, 1] -= 0.035 * pink; col[:, 2] -= 0.02 * pink; col[:, 0] += 0.01 * pink
    body_m = smoothstep(1.40, 1.33, z)                      # Detail (Falten/Nägel) aus Ginger2 nur am Körper
    col *= (1 + 1.5 * hpv * body_m * 0.85)[:, None]

    # ---------------------------------------------------- Röte
    red = hexc('#d4493f')
    def tint(m, amt, cc=red):
        nonlocal col
        a = np.clip(m * amt, 0, 1)[:, None]
        col = col * (1 - a) + (col * 0.5 + cc * 0.5) * a
    bl = cfg['blush']
    tint(ell(Ps, (0.049, -0.119, 1.484), (0.027, 0.03, 0.020)), 0.45 * bl)           # Wangenrouge (Apfel)
    tint(ell(Ps, (0.022, -0.142, 1.500), (0.022, 0.02, 0.016)), 0.28 * bl)           # Nasenrücken/Wangenbrücke
    tint(ell(P, (0.0, -0.1612, 1.4955), (0.0070, 0.012, 0.0085)), 0.40 * bl)         # Nasenspitze
    tint(ell(Ps, (0.0125, -0.1535, 1.4885), (0.0075, 0.010, 0.0065)), 0.30 * bl)    # Nasenflügel
    tint(ell(Ps, EAR_C, (0.014, 0.028, 0.034)), 0.55 * bl)                           # Ohren
    tint(ell(P, (0.0, -0.138, 1.428), (0.013, 0.014, 0.008)), 0.16 * bl)             # Kinn
    tint(ell(Ps, (0.050, -0.100, 1.55), (0.03, 0.03, 0.02)), 0.10 * bl)              # Schläfe
    hand = smoothstep(0.36, 0.42, ax) * smoothstep(1.12, 0.98, z)
    tint(hand, 0.22 * bl)
    tint(ell(Ps, (0.317, -0.025, 1.109), (0.035, 0.035, 0.04)), 0.22 * bl)
    tint(ell(Ps, (0.095, -0.06, 0.47), (0.05, 0.05, 0.05)), 0.16 * bl)
    tint(smoothstep(0.12, 0.06, z), 0.18 * bl)
    neck = smoothstep(1.46, 1.39, z) * smoothstep(1.28, 1.36, z)
    col[:, 2] += 0.010 * neck; col[:, 0] -= 0.008 * neck

    # ---------------------------------------------------- Kopfhaut (Haarwurzelton)
    hw = hairline_weight(P)
    col = col * (1 - 0.32 * hw[:, None]) + (col * hexc('#b8704f') * 1.15) * 0.32 * hw[:, None]

    # ---------------------------------------------------- Sommersprossen
    dens = np.zeros(n, F32)
    dens += 0.95 * ell(Ps, (0.050, -0.116, 1.486), (0.032, 0.035, 0.022))
    dens += 1.00 * ell(Ps, (0.010, -0.150, 1.503), (0.017, 0.022, 0.022))
    dens += 0.9 * ell(P, (0.0, -0.1612, 1.4955), (0.012, 0.014, 0.011))
    dens += 0.50 * ell(Ps, (0.055, -0.095, 1.545), (0.04, 0.045, 0.03))
    dens += 0.40 * ell(P, (0.0, -0.125, 1.575), (0.045, 0.04, 0.030))
    dens += 0.30 * ell(Ps, (0.026, -0.130, 1.447), (0.030, 0.03, 0.02))
    dens += 0.20 * ell(Ps, (0.060, -0.07, 1.46), (0.03, 0.04, 0.03))
    dens *= 1 - 0.85 * ell(Ps, (0.029, -0.125, 1.5211), (0.018, 0.02, 0.0105))
    dens *= 1 - smoothstep(0.25, 0.7, ell(P, (0, -0.1387, 1.4598), (0.034, 0.05, 0.016)))
    dens += 0.30 * ell(Ps, (0.12, -0.02, 1.34), (0.07, 0.07, 0.05))
    dens += 0.22 * ell(Ps, (0.28, -0.02, 1.14), (0.12, 0.08, 0.10))
    dens += 0.14 * ell(P, (0, -0.08, 1.30), (0.10, 0.06, 0.07))
    dens += 0.16 * smoothstep(0.35, 0.42, ax) * smoothstep(1.1, 0.95, z)
    dens += 0.12 * smoothstep(1.43, 1.37, z) * smoothstep(1.2, 1.36, z)
    dens = np.clip(dens, 0, 1) * cfg['freckle']
    sel = np.flatnonzero(dens > 0.06); Pf = P[sel]; df = dens[sel]
    frs = np.maximum.reduce([
        blobs(Pf, 0.0036, df * 0.62, 0.0009, 0.0019, 11, 2.0, 0.40, 0.55),
        blobs(Pf, 0.0022, df * 1.00, 0.0005, 0.0011, 23, 2.2, 0.35, 0.50),
        blobs(Pf, 0.0013, df * 1.10, 0.0003, 0.0006, 37, 2.4, 0.30, 0.45) * 0.85])
    fr = np.zeros(n, F32); fr[sel] = frs
    frcol = hexc('#a8452f')
    a = (fr * 0.80)[:, None]
    col = col * (1 - a) + (col * 0.52 + frcol * 0.48) * a
    cl = ndi.gaussian_filter(M.img(fr), 6).reshape(-1)[M.idx]       # sanfte Pigmentwolke um Cluster
    a = (np.clip(cl * 3.2, 0, 0.16))[:, None]
    col = col * (1 - a) + (col * np.array([0.97, 0.88, 0.84], F32)) * a

    # ================================================================== Gesichtsdetails nur auf der Vorderseite des Kopfes
    h = np.flatnonzero((z > 1.40) & (P[:, 1] < -0.04) & (ax < 0.075))
    Ph = P[h]; ch = col[h]; Psh = Ps[h]; zh = Ph[:, 2]; axh = np.abs(Ph[:, 0]); n_h = len(h)
    # ---------------------------------------------------- Augen-Make-up und Lidschatten
    zu = interp(axh, UP_X, UP_Z); zl = interp(axh, LO_X, LO_Z)
    in_x = smoothstep(0.0128, 0.0155, axh) * smoothstep(0.0490, 0.0440, axh)
    front = smoothstep(-0.095, -0.115, Ph[:, 1])
    dzu = zh - zu; dzl = zl - zh
    wing = smoothstep(0.034, 0.046, axh)
    lid = smoothstep(-0.001, 0.0, dzu) * smoothstep(0.0095, 0.0045, dzu) * in_x * front
    ch = ch * (1 - 0.16 * lid[:, None]) + (ch * np.array([1.0, 0.86, 0.80], F32)) * 0.16 * lid[:, None]
    shadow = smoothstep(-0.0005, 0.0012, dzu) * smoothstep(0.0075 + 0.003 * wing, 0.0030, dzu) * in_x * front
    shadow *= 0.55 + 0.45 * wing
    a = (0.24 * shadow)[:, None]
    ch = ch * (1 - a) + (ch * 0.5 + hexc('#a24f3e') * 0.5) * a
    crease = np.exp(-((dzu - (0.0058 + 0.0012 * wing)) / 0.0012) ** 2) * in_x * front
    ch *= (1 - 0.07 * crease)[:, None]
    lw = 0.0006 + 0.0008 * wing + 0.0003 * smoothstep(0.02, 0.03, axh)
    liner = smoothstep(-0.0008, 0.0002, dzu) * smoothstep(lw + 0.0004, lw - 0.0003, dzu) * in_x * front * 0.85
    a = (0.70 * liner)[:, None]
    ch = ch * (1 - a) + hexc('#2a1612') * a
    low = smoothstep(-0.0006, 0.0003, dzl) * smoothstep(0.0012 + 0.0006 * wing, 0.0002, dzl) * in_x * front * (0.30 + 0.70 * smoothstep(0.02, 0.04, axh))
    a = (0.26 * low)[:, None]
    ch = ch * (1 - a) + hexc('#3a1f18') * a
    inner = ell(Psh, (0.0152, -0.126, 1.5200), (0.0030, 0.006, 0.0042)) * front
    a = (0.55 * inner)[:, None]
    ch = ch * (1 - a) + hexc('#d46a63') * a
    rim = np.exp(-(dzl / 0.0005) ** 2) * in_x * front * smoothstep(0.0, 0.0006, dzl + 0.0006)
    a = (0.14 * rim)[:, None]
    ch = ch * (1 - a) + hexc('#c4584f') * a

    # ---------------------------------------------------- Brauen (aufgemalt, Haar-Schraffur)
    line = brow_centerline()
    dB, sB, sideB = dist_to_polyline(Psh, line)
    w = interp(sB, [0, 0.08, 0.3, 0.55, 0.75, 0.9, 1.0], [0.0042, 0.0047, 0.0042, 0.0035, 0.0025, 0.0015, 0.0005])
    off = 0.0004
    dd = np.abs(sideB - off)
    prof = smoothstep(1.0, 0.25, dd / w)
    ang = np.radians(interp(sB, [0, 0.25, 0.55, 1.0], [58, 28, 6, -8]))
    sm = sB * 0.056; tm = sideB
    cc = tm * np.cos(ang) - sm * np.sin(ang); aa = sm * np.cos(ang) + tm * np.sin(ang)
    pit = 0.00055
    hair1 = vnoise(np.stack([cc / pit, aa / 0.0035, np.zeros_like(cc)], 1), 1.0, 41)
    hair2 = vnoise(np.stack([cc / (pit * 0.5), aa / 0.002, np.ones_like(cc)], 1), 1.0, 43)
    hairs = 0.45 + 0.9 * hair1 * (0.6 + 0.4 * hair2) - 0.25
    bz = prof * np.clip(hairs, 0.2, 1.0) * smoothstep(1.62, 1.52, zh) * smoothstep(1.50, 1.52, zh) * front
    a = (0.92 * bz)[:, None]
    ch = ch * (1 - a) + (hexc('#6a2a16') * (0.8 + 0.5 * hair1[:, None])) * a

    # ---------------------------------------------------- Lippen
    X, dz, top, bot = lip_shape(Ph)
    e = 0.00055
    in_up = smoothstep(-e, e, top - dz) * smoothstep(-0.0001, 0.0006, dz + 0.0003)
    in_lo = smoothstep(-e, e, bot + dz) * smoothstep(-0.0001, 0.0006, -dz + 0.0003)
    xm = smoothstep(0.98, 0.86, X)
    lipm = np.maximum(in_up, in_lo) * xm * smoothstep(-0.105, -0.12, Ph[:, 1])
    lipc = hexc(cfg['lips'])
    up_c = lipc * np.array([0.92, 0.86, 0.88], F32)
    lo_c = lipc * np.array([1.04, 1.07, 1.03], F32)
    lc2 = np.where((dz > 0)[:, None], up_c, lo_c)
    lc2 = lc2 * (1 - 0.20 * smoothstep(0.55, 1.0, X)[:, None])
    ridges = vnoise(np.stack([Ph[:, 0] / 0.00055, np.zeros(n_h, F32), Ph[:, 2] / 0.006], 1), 1.0, 61)
    lc2 = lc2 * (0.95 + 0.08 * ridges)[:, None]
    a = (cfg['lip_alpha'] * lipm)[:, None]
    ch = ch * (1 - a) + lc2 * a
    edge = np.exp(-((np.minimum(top - dz, bot + dz) - 0.0001) / 0.00045) ** 2) * xm * lipm
    ch *= (1 - 0.10 * edge)[:, None]
    # ---------------------------------------------------- Mundinneres + Nasenlöcher
    depth_all = front_depth(M); depth = depth_all[h]
    inside = smoothstep(0.0020, 0.0055, depth) * smoothstep(0.034, 0.028, axh) * smoothstep(0.022, 0.014, np.abs(zh - MOUTH_Z))
    a = (0.95 * inside)[:, None]
    ch = ch * (1 - a) + hexc('#4a1618') * a
    deeper = smoothstep(0.006, 0.014, depth) * inside
    ch *= (1 - 0.55 * deeper)[:, None]
    nd = smoothstep(0.0025, 0.0070, depth) * smoothstep(0.016, 0.011, axh) * smoothstep(1.4755, 1.481, zh) * smoothstep(1.507, 1.497, zh)
    a = (0.85 * nd)[:, None]
    ch = ch * (1 - a) + hexc('#3a1814') * a
    col[h] = ch
    lipm_full = np.zeros(n, F32); lipm_full[h] = lipm
    brow_full = np.zeros(n, F32); brow_full[h] = bz
    return dict(col=np.clip(col, 0, 1), dens=dens, fr=fr, lipm=lipm_full, hw=hw, depth=depth_all, brow=brow_full)


def build_height_rough(M, S):
    """Mikrorelief (Höhe in m) und Rauheit je Pixel"""
    P = M.P; n = M.n; Ps = sym(P); z = P[:, 2]
    # Höhenfeld: feines Korn (≈1.2 mm), Zellporen (≈0.9 mm), grobe Welligkeit (≈5 mm)
    h = 0.55 * fbm(P, 0.0017, 3, 71) + 0.30 * fbm(P, 0.0009, 2, 73) + 0.15 * fbm(P, 0.006, 2, 75)
    # Porenbereich T-Zone / Nase / Wangen stärker
    pore = np.clip(ell(Ps, (0.012, -0.150, 1.503), (0.02, 0.03, 0.03)) * 1.0 + ell(Ps, (0.05, -0.118, 1.485), (0.03, 0.03, 0.025)) * 0.7 +
                   ell(P, (0.0, -0.13, 1.575), (0.04, 0.04, 0.03)) * 0.6 + 0.25, 0, 1.2)
    h = (h - 0.5) * (0.6 + 0.8 * pore)
    # Lippen: etwas glatter; Mundinneres glatt
    smooth = np.clip(S['lipm'] * 0.65, 0, 0.8)
    h = h * (1 - smooth)
    amp = 0.00009  # m
    h = h * amp * 2.0
    # Rauheit
    rough = np.full(n, 0.56, F32)
    rough -= 0.12 * np.clip(ell(P, (0.0, -0.13, 1.575), (0.03, 0.04, 0.025)), 0, 1)           # Stirn Mitte
    rough -= 0.14 * np.clip(ell(P, (0.0, -0.152, 1.500), (0.012, 0.02, 0.028)), 0, 1)           # Nasenrücken
    rough -= 0.12 * np.clip(ell(P, (0.0, -0.16, 1.495), (0.011, 0.015, 0.009)), 0, 1)           # Nasenspitze
    rough -= 0.08 * np.clip(ell(P, (0.0, -0.138, 1.428), (0.014, 0.015, 0.008)), 0, 1)          # Kinn
    rough += 0.05 * np.clip(ell(Ps, (0.050, -0.116, 1.484), (0.03, 0.03, 0.02)), 0, 1)          # Wangen matter
    rough += 0.04 * np.clip(ell(Ps, EAR_C, (0.02, 0.03, 0.04)), 0, 1)
    rough += 0.04 * smoothstep(1.38, 1.30, z)                                                   # Hals/Körper
    rough -= 0.24 * S['lipm']                                                                    # Lippen glatt
    rough = np.where(S['depth'] > 0.003, np.where(np.abs(z - MOUTH_Z) < 0.02, 0.35, rough), rough)  # Mundinneres feucht
    rough += (fbm(P, 0.004, 2, 81) - 0.5) * 0.08
    return h.astype(F32), np.clip(rough, 0.2, 0.9).astype(F32)


def normal_from_height(M, h_img, strength=1.0):
    """h_img (H,W) in Metern (gepaddet) -> Tangent-Normalmap (OpenGL) aus UV-Gradient mit physikalischer Texeldichte"""
    mpx = np.nanmedian(M.mpp_x); mpy = np.nanmedian(M.mpp_y)
    mx = np.where(np.isnan(M.mpp_x), mpx, M.mpp_x); my = np.where(np.isnan(M.mpp_y), mpy, M.mpp_y)
    mx_i = M.pad(M.img(np.clip(mx, mpx * 0.4, mpx * 2.5), mpx)); my_i = M.pad(M.img(np.clip(my, mpy * 0.4, mpy * 2.5), mpy))
    dx = np.zeros_like(h_img); dy = np.zeros_like(h_img)
    dx[:, 1:-1] = (h_img[:, 2:] - h_img[:, :-2]) / 2; dy[1:-1] = (h_img[2:] - h_img[:-2]) / 2
    sx = dx / np.maximum(mx_i, 1e-5) * strength; sy = dy / np.maximum(my_i, 1e-5) * strength
    nx = -sx; ny = sy  # Bildzeile nach unten = V nach unten  => +dh/drow = -dh/dv ... (OpenGL: +Y = V oben)
    nz = np.ones_like(nx); L = np.sqrt(nx * nx + ny * ny + nz * nz)
    return np.stack([nx / L, ny / L, nz / L], -1) * 0.5 + 0.5


def make_skin(M, cfg=None, name='face_skin'):
    S = build_skin(M, cfg)
    h, rough = build_height_rough(M, S)
    col = M.pad(M.img(S['col']))
    save_png(col, name + '_diffuse.png', 'RGB')
    himg = M.pad(M.img(h))
    nrm = normal_from_height(M, himg)
    save_png(nrm, name + '_normal.png', 'RGB')
    r = M.pad(M.img(rough), 0.56)
    # glTF: Rauheit = G-Kanal (B = Metall = 0). R als Fallback gleich.
    save_png(np.stack([r, r, np.zeros_like(r)], -1), name + '_rough.png', 'RGB')
    return S



# ----------------------------------------------------------------------------------------------- AUGEN
def _ramp(x, stops):
    xs = [a for a, _ in stops]; cs = np.array([hexc(c) for _, c in stops], F32)
    return np.stack([np.interp(x, xs, cs[:, k]) for k in range(3)], -1).astype(F32)


def _pnoise(rng, rows, cols, sig_r, sig_c, wrap_rows=True):
    n = rng.random((rows, cols)).astype(F32)
    n = ndi.gaussian_filter(n, (sig_r, sig_c), mode=('wrap' if wrap_rows else 'reflect', 'reflect'))
    n = (n - n.min()) / (n.max() - n.min() + 1e-9)
    return n


def make_eye(size=1024, iris_scale=1.13):
    import cv2
    rng = np.random.default_rng(7)
    o = np.array(Image.open(f'{D}/eyes/materials/bluegreen_eye.png').convert('RGB')).astype(F32) / 255.
    scl = np.clip(o * np.array([1.13, 1.10, 1.07], F32), 0, 1)
    # Skleren-Ton: etwas wärmer/heller, Adern bleiben aus dem Original
    out = scl.copy()
    Ri = int(round(116 * iris_scale))           # Iris-Radius in px (Original ≈ 116)
    # --- Iris in Polarkoordinaten
    NR, NA = 260, 1440                           # Radius-Samples / Winkel-Samples
    r = np.linspace(0, 1, NR, dtype=F32)[None, :]            # (1,NR) 0..1 (1 = Irisrand)
    th = np.linspace(0, 2 * np.pi, NA, endpoint=False, dtype=F32)[:, None]
    fib1 = _pnoise(rng, NA, NR, 0.9, 14); fib2 = _pnoise(rng, NA, NR, 0.6, 5.0); fib3 = _pnoise(rng, NA, NR, 3.0, 22)
    fib = 0.55 * fib1 + 0.30 * fib2 + 0.15 * fib3
    jag = _pnoise(rng, NA, 1, 3.0, 1)                         # ausgefranster Kragenrand
    jag2 = _pnoise(rng, NA, 1, 1.2, 1)
    rr = np.broadcast_to(r, (NA, NR)).copy()
    # Farbverlauf (außen türkis -> innen bernstein)
    base = _ramp(rr, [(0.00, '#120a06'), (0.28, '#2a140a'), (0.31, '#6b3a16'), (0.40, '#a8702e'), (0.50, '#8c8a3a'), (0.58, '#2aa8a6'), (0.70, '#36c2c4'),
                      (0.82, '#22a0a8'), (0.90, '#16778a'), (0.96, '#0f5a6c'), (1.00, '#0a3040')])
    ragged = 0.43 + 0.08 * (jag - 0.5) * 2 + 0.03 * (jag2 - 0.5) * 2
    wb = smoothstep(ragged + 0.05, ragged - 0.05, rr)[..., None]
    amber = _ramp(rr, [(0.0, '#1a0e08'), (0.28, '#2a140a'), (0.33, '#7a4418'), (0.45, '#b98238'), (0.60, '#a7893c')])
    col = base * (1 - wb * 0.38) + amber * (wb * 0.38)
    gain = 0.70 + 0.62 * fib[..., None]
    col = col * gain
    # Krypten
    cr = (_pnoise(rng, NA, NR, 2.0, 9.0) > 0.78).astype(F32) * smoothstep(0.38, 0.5, rr) * smoothstep(0.78, 0.62, rr)
    col *= (1 - 0.25 * cr[..., None])
    # Limbus-Ring (dunkel) + Innenrand heller
    limb = smoothstep(0.84, 0.985, rr)[..., None]
    col = col * (1 - 0.55 * limb) + hexc('#082833') * 0.55 * limb
    glow = np.exp(-((rr - 0.80) / 0.06) ** 2)[..., None]
    col = col * (1 - 0.18 * glow) + hexc('#7ff0ec') * 0.18 * glow
    alpha = smoothstep(1.03, 0.965, rr)
    pol = np.concatenate([col, alpha[..., None]], -1)
    # warpPolar: src (rows=phi, cols=rho)
    dsz = 2 * Ri + 8
    cart = cv2.warpPolar(pol, (dsz, dsz), (dsz / 2, dsz / 2), dsz / 2 - 4, cv2.WARP_INVERSE_MAP | cv2.INTER_LINEAR)
    # Pupille (scharf, weich 1.2 px)
    yy, xx = np.mgrid[:dsz, :dsz].astype(F32); rad = np.hypot(xx - dsz / 2 + 0.5, yy - dsz / 2 + 0.5) / (dsz / 2 - 4)
    pup = smoothstep(0.275 + 0.012, 0.275 - 0.012, rad)
    cart[..., :3] = cart[..., :3] * (1 - pup[..., None]) + hexc('#050505') * pup[..., None]
    cart[..., 3] = np.maximum(cart[..., 3] * smoothstep(1.03, 0.965, rad), pup)
    # --- auf beide Augenscheiben legen
    for cx, cy in ((722, 302), (300, 718)):
        x0, y0 = cx - dsz // 2, cy - dsz // 2
        a = cart[..., 3:4]
        out[y0:y0 + dsz, x0:x0 + dsz] = out[y0:y0 + dsz, x0:x0 + dsz] * (1 - a) + cart[..., :3] * a
        # Lidschatten-Verlauf (oben dunkler), Augenwinkel leicht dunkler/rötlicher
        Y, X = np.mgrid[0:size, 0:size].astype(F32)
        dyv = (Y - cy)
        top = smoothstep(-40, -150, dyv) * 0.34 * smoothstep(330, 200, np.hypot(X - cx, Y - cy))
        bot = smoothstep(80, 170, dyv) * 0.10
        sh = (1 - top - bot)[..., None]
        patch = (slice(max(cy - 330, 0), cy + 330), slice(max(cx - 330, 0), cx + 330))
        out[patch] = out[patch] * sh[patch] * np.array([1.0, 0.985, 0.985], F32)
        # Corner redness (inner/outer): beidseitig horizontal
        side = smoothstep(150, 250, np.abs(X - cx)) * smoothstep(330, 230, np.hypot(X - cx, Y - cy)) * 0.10
        out[patch] = out[patch] * (1 - side[patch][..., None]) + hexc('#c9786f') * side[patch][..., None]
    # Pupillen-Kreis unten rechts (Original: schwarze Scheibe) unverändert lassen
    return np.clip(out, 0, 1)


def make_brow():
    A = np.array(Image.open(f'{D}/eyebrows/eyebrow006/eyebrow006.png').convert('RGBA')).astype(F32) / 255.
    a0 = A[..., 3]
    a1 = ndi.maximum_filter(a0, size=(5, 3))
    a1 = ndi.gaussian_filter(a1, 0.8)
    al = np.clip(a1 * 2.1, 0, 1) ** 0.85
    rng = np.random.default_rng(11)
    n = ndi.gaussian_filter(rng.random(a0.shape).astype(F32), (0.7, 3.0)); n = (n - n.min()) / (n.max() - n.min())
    c0, c1 = hexc('#3b160b'), hexc('#8a3d1d')
    rgb = c0 + (c1 - c0) * (0.25 + 0.75 * n)[..., None]
    return np.concatenate([rgb, al[..., None]], -1)


def make_lash():
    A = np.array(Image.open(f'{D}/eyelashes/eyelashes02/eyelashes02.png').convert('RGBA')).astype(F32) / 255.
    a = A[..., 3]
    H = a.shape[0]
    rows = (np.arange(H)[:, None] / H)
    low = (rows > 0.53).astype(F32)             # untere Wimpern: Streifen in der unteren Bildhälfte
    low = ndi.gaussian_filter(low, 4)
    al = a * (1 - 0.45 * low)
    al = ndi.gaussian_filter(al, 0.5)
    al = np.clip(al * 1.15, 0, 1)
    rgb = np.broadcast_to(hexc('#150a07'), a.shape + (3,)).copy()
    rng = np.random.default_rng(5); v = ndi.gaussian_filter(rng.random(a.shape).astype(F32), 2)
    rgb = rgb + (hexc('#4a2316') - rgb) * (v - v.min())[..., None] / (v.max() - v.min()) * 0.5
    return np.concatenate([rgb, al[..., None]], -1)


def make_teeth():
    t = np.array(Image.open(f'{D}/teeth/teeth_base/teeth.png').convert('RGBA')).astype(F32) / 255.
    rgb = t[..., :3]; lum = rgb @ np.array([.3, .59, .11], F32)
    sat = rgb.max(-1) - rgb.min(-1)
    whiteness = smoothstep(0.18, 0.04, sat) * smoothstep(0.35, 0.6, lum)    # Zähne = grau-weiß, Zahnfleisch = rot
    ivory = np.clip(rgb * 1.22, 0, 1) * np.array([1.0, 0.965, 0.86], F32)
    gum = np.clip(rgb * np.array([0.95, 0.80, 0.80], F32), 0, 1)
    out = ivory * whiteness[..., None] + gum * (1 - whiteness[..., None])
    return np.concatenate([np.clip(out, 0, 1), t[..., 3:]], -1)


def make_tongue():
    t = np.array(Image.open(f'{D}/tongue/tongue01/tongue01_diffuse.png').convert('RGB')).astype(F32) / 255.
    return np.clip(t * np.array([0.90, 0.68, 0.72], F32), 0, 1)


if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('--only', default='skin,eye,brow,lash,mouth'); a = ap.parse_args()
    M = Maps() if 'skin' in a.only else None
    todo = a.only.split(',')
    if 'skin' in todo: make_skin(M)
    if 'eye' in todo: save_png(make_eye(), 'face_eye.png', 'RGB')
    if 'brow' in todo: save_png(make_brow(), 'face_brow.png', 'RGBA')
    if 'lash' in todo: save_png(make_lash(), 'face_lash.png', 'RGBA')
    if 'mouth' in todo:
        save_png(make_teeth(), 'face_teeth.png', 'RGBA'); save_png(make_tongue(), 'face_tongue.png', 'RGB')
