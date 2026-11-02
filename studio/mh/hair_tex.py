"""Haar-Abteilung: Texturen (numpy/PIL).  python3 mh/hair_tex.py  -> out/mh/hair_tex/*.png (zum Ansehen)
 - strand_atlas: 2048x1024, 8 Spalten a 256 px (u quer zur Straehne, v entlang: v=0 Wurzel, v=1 Spitze), RGBA (MASK-tauglich, dichter Kern)
 - cap_tex:      1024x1024 Kopfhaut-Kappe (v=0 Haaransatz -> v=1 Scheitel), dunkle Wurzeln + ausgefranster Haaransatz
 - wisp_atlas:   1024x1024, 8 Spalten a 128 px, feine einzelne Haare (BLEND)
Farben Kupfer/Feuerrot: Wurzel ~#5a1a10, Mitte ~#b5301b, Glanz ~#e0502a."""
import os, numpy as np
from scipy.ndimage import gaussian_filter, gaussian_filter1d
from PIL import Image

# Farbrampe s -> sRGB (0..255)
RAMP_S = [0.00, 0.22, 0.42, 0.62, 0.80, 0.95, 1.10, 1.35]
RAMP_C = [(26, 6, 4), (74, 20, 11), (130, 34, 19), (181, 48, 27), (206, 66, 34), (224, 80, 42), (238, 112, 62), (250, 170, 110)]


def palette(s, hue_shift=0.0, sat=1.0):
    s = np.clip(s, 0, 1.35)
    out = np.stack([np.interp(s, RAMP_S, [c[k] for c in RAMP_C]) for k in range(3)], axis=-1)
    if hue_shift:  # +: orangener (G hoeher), -: dunkler/roter
        out[..., 1] *= (1 + 0.35 * hue_shift)
        out[..., 2] *= (1 + 0.25 * hue_shift)
    if sat != 1.0:
        g = out.mean(axis=-1, keepdims=True); out = g + (out - g) * sat
    return np.clip(out, 0, 255)


def _smooth(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def _streaks(rng, H, W, sig_v=38.0, sig_u=0.8):
    n = rng.standard_normal((H, W))
    n = gaussian_filter(n, sigma=(sig_v, sig_u), mode='wrap')
    return n / (n.std() + 1e-9)


# (kind, nsub, hue, bright, light_band)  8 Spalten
COLUMNS = [
    ('broad', 9, 0.00, 1.00), ('broad', 8, 0.35, 1.08), ('broad', 10, -0.45, 0.92), ('broad', 7, 0.15, 1.02),
    ('mid', 5, 0.20, 1.05), ('mid', 6, -0.25, 0.95), ('thin', 3, 0.40, 1.10), ('thin', 2, -0.20, 0.98),
]


def make_column(rng, kind, nsub, hue, bright, W=256, H=1024):
    xs = (np.arange(W) + 0.5) / W * 2 - 1       # -1..1
    vs = (np.arange(H) + 0.5) / H               # 0..1 (0 = Wurzel)
    X, V = np.meshgrid(xs, vs)
    pad = 0.07
    env_w = {'broad': 0.93, 'mid': 0.80, 'thin': 0.60}[kind] - pad
    # Huellkurven-Breite ueber v: Wurzel etwas schmaler, Mitte voll, Spitze laufen zusammen
    fenv = 0.82 + 0.18 * _smooth(0.0, 0.25, vs) - 0.55 * _smooth(0.62, 1.0, vs) ** 1.25
    alpha = np.zeros((H, W)); col = np.zeros((H, W, 3))
    streak = _streaks(rng, H, W, 40, 0.9); streak2 = _streaks(rng, H, W, 8, 0.6)
    lowf = gaussian_filter(rng.standard_normal((H, W)), sigma=(90, 18), mode='wrap'); lowf /= (lowf.std() + 1e-9)
    # Sub-Straehnen (Locken-Fasern-Buendel), zufaellig nebeneinander, hinten -> vorn gemalt
    x0 = np.sort(rng.uniform(-env_w, env_w, nsub)) if nsub > 1 else np.array([0.0])
    order = rng.permutation(nsub)
    base_hw = (2 * env_w / max(nsub, 1)) * {'broad': 1.15, 'mid': 1.1, 'thin': 1.0}[kind]
    for k in order:
        hw0 = base_hw * rng.uniform(0.75, 1.45)
        ph = rng.uniform(0, 6.28); fr = rng.uniform(0.7, 2.2); amp = rng.uniform(0.02, 0.09) * (1.0 if kind != 'thin' else 1.6)
        L = rng.uniform(0.74, 1.0) if k != order[0] else 1.0
        xc = x0[k] * fenv + amp * np.sin(6.283 * fr * vs + ph)            # (H,)
        # Verjuengung zur Spitze
        t_in = _smooth(0.50 * L, L, vs)
        hw = hw0 * fenv * (1 - 0.93 * t_in ** 1.5) * (0.88 + 0.12 * _smooth(0.0, 0.2, vs))
        hw = np.where(vs < L, np.maximum(hw, 1e-4), 1e-4)
        r = (X - xc[:, None]) / hw[:, None]
        ar = np.abs(r)
        a = np.clip((1.0 + 0.10 - ar) / 0.22, 0, 1) * (vs < L)[:, None]          # weiche Kante
        # Helligkeit: zylindrisch (Mitte hell, Rand dunkel) + Faserstruktur
        cyl = 1.0 - 0.55 * np.clip(ar, 0, 1) ** 2
        sb = rng.uniform(0.80, 1.18)
        fib = 1.0 + 0.16 * streak + 0.07 * streak2
        # Glanzstreifen: leicht aus der Mitte versetzt
        gl = np.exp(-((r - 0.28) / 0.34) ** 2) * (_smooth(0.12, 0.45, vs) * (1 - 0.6 * _smooth(0.75, 1.0, vs)))[:, None]
        s = (0.54 * cyl * sb * fib + 0.30 * gl) * bright * 0.92
        s *= (0.50 + 0.50 * _smooth(0.0, 0.32, vs))[:, None]                     # Wurzel dunkler (AO)
        s *= (1.0 + 0.10 * lowf)
        s += 0.06 * _smooth(0.78, 1.0, vs)[:, None]                              # Spitzen leicht heller
        c = palette(s, hue, 1.0)
        m = a > 0.02
        col[m] = col[m] * (1 - a[m][:, None]) + c[m] * a[m][:, None]
        alpha = np.maximum(alpha, a)
    # Wurzelabschluss: weiches Einblenden (Haare kommen aus der Kopfhaut)
    rootnoise = gaussian_filter1d(rng.standard_normal(W), 2.0); rootnoise /= (rootnoise.std() + 1e-9)
    rootcut = 0.012 + 0.012 * rootnoise
    alpha *= _smooth(0.0, 1.0, np.clip((V - rootcut[None, :]) / 0.025, 0, 1))
    # abstehende Einzelhaare (duenn, ueber die Huelle hinaus) -> Silhouette ausgefranst
    nstray = {'broad': 9, 'mid': 7, 'thin': 3}[kind]
    for _ in range(nstray):
        xs0 = rng.uniform(-0.95, 0.95); drift = rng.uniform(-0.35, 0.35); ph = rng.uniform(0, 6.28); fr = rng.uniform(0.6, 1.8)
        v0 = rng.uniform(0.12, 0.55); L = rng.uniform(v0 + 0.25, 1.0)
        xc = xs0 + drift * (vs - v0) + 0.05 * np.sin(6.283 * fr * vs + ph)
        hw = 0.028 * (1 - _smooth(v0, L, vs) ** 1.2) * ((vs > v0) & (vs < L))
        hw = np.maximum(hw, 1e-4)
        a = np.clip((1.0 - np.abs(X - xc[:, None]) / hw[:, None]) / 0.5, 0, 1) * ((vs > v0) & (vs < L))[:, None] * 0.95
        c = palette(np.full((H, W), 0.80 * bright) * (0.9 + 0.2 * rng.random()), hue)
        m = a > 0.02
        col[m] = col[m] * (1 - a[m][:, None]) + c[m] * a[m][:, None]
        alpha = np.maximum(alpha, a)
    # Rand-Padding (Spaltenrand transparent)
    edge = _smooth(0.0, 1.0, np.clip((1 - np.abs(X)) / 0.045, 0, 1))
    alpha *= edge
    return col, alpha


def strand_atlas(seed=11, W=256, H=1024):
    rng = np.random.default_rng(seed)
    cols, alps = [], []
    for kind, nsub, hue, bright in COLUMNS:
        c, a = make_column(rng, kind, nsub, hue, bright, W, H)
        cols.append(c); alps.append(a)
    col = np.concatenate(cols, axis=1); alp = np.concatenate(alps, axis=1)
    return finish(col, alp)


def finish(col, alp, fill=(140, 36, 20)):
    """RGB in transparenten Bereichen auf lokale Farbe fuellen (kein Mip-Saum), Bild vertikal flippen (v=0 unten)."""
    from scipy.ndimage import maximum_filter
    a = alp.copy()
    # Randfuellung: Farbe iterativ in transparente Pixel hinein ausbreiten
    filled = col.copy(); known = a > 0.05
    filled[~known] = fill
    for it in range(3):
        blur = np.stack([gaussian_filter(filled[..., k] * known, 3 + it * 3) for k in range(3)], axis=-1)
        w = gaussian_filter(known.astype(float), 3 + it * 3)[..., None]
        avg = blur / np.maximum(w, 1e-4)
        use = (~known) & (w[..., 0] > 0.02)
        filled[use] = avg[use]
    rgba = np.concatenate([np.clip(filled, 0, 255), np.clip(alp, 0, 1)[..., None] * 255], axis=-1).astype(np.uint8)
    return rgba[::-1].copy()


# --------------------------------------------------------------------------- Kappe
def cap_tex(seed=5, W=1024, H=1024):
    rng = np.random.default_rng(seed)
    xs = (np.arange(W) + 0.5) / W; vs = (np.arange(H) + 0.5) / H
    X, V = np.meshgrid(xs, vs)
    st = _streaks(rng, H, W, 26, 0.9); st2 = _streaks(rng, H, W, 6, 0.7)
    low = gaussian_filter(rng.standard_normal((H, W)), sigma=(60, 30), mode='wrap'); low /= low.std()
    # radiale Fasern ueber u, wellig
    s = 0.27 + 0.08 * st + 0.04 * st2 + 0.04 * low
    s = s * (0.82 + 0.28 * _smooth(0.0, 0.5, V))        # zur Mitte hin etwas heller
    rgb = palette(s, -0.1)
    # Haaransatz: ausgefranst (v klein)
    n1 = gaussian_filter1d(rng.standard_normal(W), 1.6, mode='wrap'); n1 /= n1.std()
    n2 = gaussian_filter1d(rng.standard_normal(W), 0.6, mode='wrap'); n2 /= n2.std()
    edge = 0.020 + 0.012 * n1 + 0.008 * n2
    a = _smooth(0.0, 1.0, np.clip((V - edge[None, :]) / 0.018, 0, 1))
    # feine Babyhaare / Stippeln am Rand
    dots = rng.random((H, W)) < (0.020 * np.clip(1 - V / 0.07, 0, 1))
    dots = gaussian_filter(dots.astype(float), 0.8) > 0.12
    a = np.maximum(a, dots * 0.9 * (V < 0.07))
    return finish(rgb, a, fill=(74, 20, 11))


# --------------------------------------------------------------------------- Wisps (BLEND)
def wisp_atlas(seed=21, W=128, H=1024, ncol=8):
    rng = np.random.default_rng(seed)
    cols = []; alps = []
    xs = (np.arange(W) + 0.5) / W * 2 - 1; vs = (np.arange(H) + 0.5) / H
    X, V = np.meshgrid(xs, vs)
    for c in range(ncol):
        alpha = np.zeros((H, W)); col = np.zeros((H, W, 3))
        nf = [1, 1, 2, 2, 3, 1, 2, 3][c]
        for f in range(nf):
            x0 = rng.uniform(-0.5, 0.5) if nf > 1 else rng.uniform(-0.2, 0.2)
            ph = rng.uniform(0, 6.28); fr = rng.uniform(0.6, 1.5); amp = rng.uniform(0.05, 0.22)
            xc = x0 + amp * np.sin(6.283 * fr * vs + ph) * _smooth(0.0, 0.3, vs)
            L = rng.uniform(0.82, 1.0)
            hw = 0.11 * (1 - _smooth(0.35, L, vs) ** 1.1) * (vs < L)
            hw = np.maximum(hw, 1e-4)
            a = np.clip((1.0 - np.abs(X - xc[:, None]) / hw[:, None]) / 0.6, 0, 1) * (vs < L)[:, None]
            a *= (_smooth(0.0, 0.10, vs) * 0.9 + 0.1)[:, None] * rng.uniform(0.75, 1.0)
            s = 0.78 + 0.25 * (1 - np.abs(X - xc[:, None]) / hw[:, None]).clip(0, 1) + 0.12 * (rng.random() - 0.5)
            s = s * (0.62 + 0.38 * _smooth(0.0, 0.25, vs))[:, None]
            cc = palette(s, rng.uniform(-0.3, 0.4))
            m = a > 0.01
            col[m] = col[m] * (1 - a[m][:, None]) + cc[m] * a[m][:, None]
            alpha = np.maximum(alpha, a)
        alpha *= _smooth(0.0, 1.0, np.clip((1 - np.abs(X)) / 0.08, 0, 1))
        cols.append(col); alps.append(alpha)
    return finish(np.concatenate(cols, axis=1), np.concatenate(alps, axis=1), fill=(190, 60, 30))


def build_all(outdir):
    os.makedirs(outdir, exist_ok=True)
    paths = {}
    for name, fn in (('hair_strand', strand_atlas), ('hair_cap', cap_tex), ('hair_wisp', wisp_atlas)):
        a = fn(); p = os.path.join(outdir, name + '.png'); Image.fromarray(a, 'RGBA').save(p); paths[name] = p
    return paths


if __name__ == '__main__':
    import sys
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'out', 'mh', 'hair_tex')
    print(build_all(out))
