"""Haar-Abteilung: Frisur-Definition (Alice: hoher, chaotischer Dutt, seitlich gescheitelte Ponyfransen, lose Locken).
Alle Funktionen liefern MeshAcc-Objekte (hair_geom.MeshAcc) in Blender-Weltkoordinaten (A-Pose, Kopf unveraendert)."""
import numpy as np
from hair_geom import *

D = np.pi / 180.0
NCOL = 8
BUN_C = np.array([0.0, 0.016, 1.668])
BUN_AX = np.array([0.060, 0.053, 0.043])      # Halbachsen des Dutt-Ellipsoids
POLE_TH, POLE_PH = 180 * D, 64 * D           # Ansatzrichtung des Duttes (vom Kopfzentrum)
CAP_H = 0.0025

# Haaransatz phi_h(|theta|) (Grad)  (symmetrisch)
HAIRLINE = [(0, 35), (18, 35), (36, 32), (50, 26), (60, 19), (66, 12), (72, 5), (77, 0), (81, 1), (86, 2), (96, 3), (105, 1), (112, -6), (122, -18), (135, -32), (150, -46), (165, -54), (180, -57)]


def hairline_phi(theta):
    a = np.abs(((np.asarray(theta) + np.pi) % (2 * np.pi)) - np.pi) / D
    xs = [h[0] for h in HAIRLINE]; ys = [h[1] for h in HAIRLINE]
    return np.interp(a, xs, ys) * D


def col_u(c, pad=0.0):
    return c / NCOL + pad, (c + 1) / NCOL - pad


def hat_weights(s, knots):
    """lineare Gewichte der Bones an den Kopfpositionen 'knots' (aufsteigend) fuer Parameter s (n,) -> (n,k)"""
    s = np.clip(s, knots[0], knots[-1]); k = len(knots)
    W = np.zeros((len(s), k))
    idx = np.clip(np.searchsorted(knots, s, side='right') - 1, 0, k - 2)
    f = (s - np.asarray(knots)[idx]) / (np.asarray(knots)[idx + 1] - np.asarray(knots)[idx])
    W[np.arange(len(s)), idx] = 1 - f; W[np.arange(len(s)), idx + 1] = f
    return W


def blend_normals(nr, pos, center, k):
    out = nrm(pos - center)
    return nrm(nr * (1 - k) + out * k)


# =============================================================================== Kappe
def build_cap(scalp, n_th=96, n_ring=11):
    acc = MeshAcc('P_HairCap')
    th = np.linspace(-np.pi, np.pi, n_th + 1)  # Naht bei theta=+-180 -> doppelte Spalte fuer UV
    s = np.linspace(0, 1, n_ring) ** 1.15
    co = np.zeros((n_th + 1, n_ring, 3)); uv = np.zeros((n_th + 1, n_ring, 2)); nr = np.zeros_like(co)
    for i, t in enumerate(th):
        ph_h = float(hairline_phi(t)) - 1.5 * D  # etwas unter die Haarlinie -> Textur-Fransen schneiden ab
        ph = ph_h + (88.5 * D - ph_h) * s
        pts = scalp.point(np.full(n_ring, t), ph, CAP_H)
        co[i] = pts
        nr[i] = nrm(pts - C_HEAD)
        uv[i, :, 0] = (t + np.pi) / (2 * np.pi); uv[i, :, 1] = s
    tri = []
    for i in range(n_th):
        for j in range(n_ring - 1):
            a = i * n_ring + j; b = (i + 1) * n_ring + j; c = (i + 1) * n_ring + j + 1; d = i * n_ring + j + 1
            tri.append((a, b, c)); tri.append((a, c, d))
    acc.add(co.reshape(-1, 3), uv.reshape(-1, 2), np.array(tri), nr.reshape(-1, 3), {'head': np.ones(co.size // 3)})
    return acc


# =============================================================================== Oberflaechen-Karten (Lagen)
def sph_path(U, n):
    return sph_bezier(U, n)


def surface_card(scalp, rng, U0, Uend, h0, h1, width, col, n=11, sweep=0.0, wobble=0.012, lift=0.0, bulge=0.14, tip=0.0,
                 across=3, ctrl=None, normal_k=0.45, twist=0.0, vflip=False):
    """Eine Karte, die entlang einer Bezier-Kurve auf der Kugel von U0 nach Uend verlaeuft, h0 -> h1 (Abstand zur Kopfhaut)."""
    ax = nrm(np.cross(U0, Uend) + 1e-9)
    if ctrl is None:
        lat = np.cross(ax, nrm(Uend - U0))   # tangential seitlich
        c1 = nrm(U0 * 0.62 + Uend * 0.38 + ax * (rng.normal(0, 0.05) + sweep * 0.7))
        c2 = nrm(U0 * 0.30 + Uend * 0.70 + ax * (rng.normal(0, 0.05) + sweep * 0.5))
        ctrl = [U0, c1, c2, Uend]
    Ub = sph_path(ctrl, n)
    t = np.linspace(0, 1, n)
    # seitliches Wabern
    tang = tangents(Ub); sidev = nrm(np.cross(Ub, tang))
    Ub = nrm(Ub + sidev * (wobble * np.sin(2 * np.pi * (rng.uniform(0.6, 1.6) * t + rng.uniform())))[:, None] * (0.4 + 0.6 * np.sin(np.pi * t))[:, None])
    th, ph = dir_sph(Ub)
    h = 0.0028 + (h0 - 0.0028) * smoothstep(0.0, 0.22, t) + (h1 - h0) * smoothstep(0.35, 1.0, t) ** 1.5 + lift * np.sin(np.pi * np.clip(t * 1.15, 0, 1))
    P = scalp.point(th, ph, h)
    Nh = nrm(P - C_HEAD)
    w = taper(n, width * 0.8, width, tip=0.15, root=0.0, tip_ratio=0.25 if tip else 0.6) * rng.uniform(0.92, 1.1)
    u0, u1 = col_u(col)
    co, uv, tri, nr, S = ribbon(P, Nh, w, u0, u1, 0.0, 1.0, across=across, bulge=bulge, twist=twist * np.sin(np.pi * t))
    return co, uv, tri, blend_normals(nr, co, C_HEAD, normal_k)


def build_layers(scalp, rng, counts=(44, 38, 34, 26)):
    acc = MeshAcc('P_HairLayers')
    pole = sph_dir(POLE_TH, POLE_PH)
    # Tangentialbasis am Pol
    pe1 = nrm(np.cross(pole, [0, 0, 1.0])); pe2 = np.cross(pole, pe1)
    layer_h = [0.0045, 0.0095, 0.0150, 0.0215]
    layer_w = [(0.026, 0.040), (0.022, 0.034), (0.018, 0.028), (0.014, 0.022)]
    for L, cnt in enumerate(counts):
        ths = np.sort(rng.uniform(-np.pi, np.pi, cnt)) if False else (np.linspace(-np.pi, np.pi, cnt, endpoint=False) + rng.uniform(-0.5, 0.5, cnt) * (2 * np.pi / cnt))
        for k, t0 in enumerate(ths):
            ph_h = float(hairline_phi(t0))
            # Wurzeln: untere Lagen dichter am Haaransatz, obere verteilt
            lo = ph_h + 1.5 * D
            hi = lo + (POLE_PH - 6 * D - lo) * (0.55 + 0.12 * L)
            if hi <= lo + 4 * D: continue
            u = rng.random() ** (1.6 - 0.2 * L)
            p0 = lo + (hi - lo) * u
            U0 = sph_dir(t0, p0)
            Uend = nrm(pole + (pe1 * rng.normal(0, 0.16) + pe2 * rng.normal(0, 0.16)))
            # Ohr-Naehe: Karten, die ueber das Ohr streichen wuerden, hochziehen -> kein Problem, da Haaransatz ueber dem Ohr liegt
            h0 = layer_h[L] * rng.uniform(0.85, 1.25)
            h1 = rng.uniform(0.026, 0.040) + L * 0.002
            wmin, wmax = layer_w[L]
            width = rng.uniform(wmin, wmax)
            n = 11
            sweep = 0.0
            # Ponyseite: Karten der vorderen Haelfte schwingen nach Charakter-rechts (-X)
            fr = np.exp(-(((t0 / D) - (-10)) / 55.0) ** 2)
            sweep = -0.22 * fr * (1 if True else 0)
            col = rng.choice([0, 1, 2, 3, 4, 5], p=[0.2, 0.2, 0.2, 0.15, 0.13, 0.12])
            co, uv, tri, nr = surface_card(scalp, rng, U0, Uend, h0, h1, width, col, n=n, sweep=sweep * np.sign(np.sin(t0) + 1e-6) * -1 if False else sweep,
                                           wobble=rng.uniform(0.010, 0.03), lift=rng.uniform(0.0, 0.008) * L, tip=0.0)
            acc.add(co, uv, tri, nr, {'head': np.ones(len(co))})
    return acc


# =============================================================================== Ponyfransen (seitlich gescheitelt)
def build_bangs(scalp, rng, n_cards=22):
    acc = MeshAcc('P_HairBangs')
    pole = sph_dir(POLE_TH, POLE_PH)
    for k in range(n_cards):
        f = k / max(n_cards - 1, 1)
        # Scheitel bei theta=+9 deg (Charakter-links); Wurzeln auf/nahe am Scheitel und Richtung -X verteilt
        th0 = (11 - 24 * rng.random() ** 0.8 + (16 * rng.random() if rng.random() < 0.3 else 0)) * D
        ph_h = float(hairline_phi(th0))
        ph0 = ph_h + (1.5 + 6.0 * rng.random()) * D
        U0 = sph_dir(th0, ph0)
        # Schwung ueber die Stirn nach -X, dann hinter das Ohr/nach hinten oben
        thm = th0 - (28 + 20 * rng.random()) * D
        phm = ph0 + rng.uniform(-2, 5) * D
        th2 = (-78 - 22 * rng.random()) * D
        ph2 = (32 + 10 * rng.random()) * D
        U1 = sph_dir(thm, phm); U2 = sph_dir(th2, ph2)
        Uend = nrm(pole + np.cross(pole, [0, 0, 1.0]) * rng.normal(0, 0.14) + np.array([0, 0, 1.0]) * rng.normal(0, 0.05))
        U3 = sph_dir(-150 * D, 55 * D)
        ctrl_pts = nrm(np.array([U0, U1, U2, U3, Uend]))
        # 5-Punkt Bezier ueber catmull auf Kugel
        Ub = nrm(catmull(ctrl_pts, 14))
        n = len(Ub)
        t = np.linspace(0, 1, n)
        tang = tangents(Ub); sidev = nrm(np.cross(Ub, tang))
        Ub = nrm(Ub + sidev * (0.012 * np.sin(2 * np.pi * (rng.uniform(0.7, 1.5) * t + rng.uniform())))[:, None])
        th, ph = dir_sph(Ub)
        layer = rng.choice([0, 1, 2], p=[0.3, 0.4, 0.3])
        h = 0.003 + ((0.003 + 0.0055 * layer) * rng.uniform(0.9, 1.3)) * smoothstep(0, 0.2, t) + 0.016 * np.sin(np.pi * np.clip(t * 1.6, 0, 1)) * (0.4 + 0.6 * rng.random()) \
            + 0.03 * smoothstep(0.62, 1.0, t) ** 1.5
        P = scalp.point(th, ph, h)
        Nh = nrm(P - C_HEAD)
        width = rng.uniform(0.020, 0.034) * (1.0 if layer < 2 else 0.8)
        w = taper(n, width * 0.7, width, tip=0.2, tip_ratio=0.3) * rng.uniform(0.95, 1.1)
        col = rng.choice([0, 1, 2, 3, 4, 5], p=[0.2, 0.2, 0.15, 0.15, 0.15, 0.15])
        u0, u1 = col_u(col)
        co, uv, tri, nr, S = ribbon(P, Nh, w, u0, u1, 0.0, 1.0, across=3, bulge=0.15, twist=0.25 * np.sin(np.pi * t))
        acc.add(co, uv, tri, blend_normals(nr, co, C_HEAD, 0.4), {'head': np.ones(len(co))})
    return acc


# =============================================================================== Dutt
def ell_pt(lam, psi, k, scale=1.0):
    return np.stack([BUN_AX[0] * scale * k * np.cos(lam) * np.cos(psi), BUN_AX[1] * scale * k * np.cos(lam) * np.sin(psi), BUN_AX[2] * scale * k * np.sin(lam)], axis=-1)


def build_bun(scalp, rng, n_outer=44, n_inner=18, n_loose=24):
    acc = MeshAcc('P_HairBun')
    tilt = 14 * D   # Dutt kippt nach hinten
    Rt = np.array([[1, 0, 0], [0, np.cos(tilt), -np.sin(tilt)], [0, np.sin(tilt), np.cos(tilt)]])
    specs = []
    for _ in range(n_outer): specs.append(('outer', rng.uniform(0.93, 1.06)))
    for _ in range(n_inner): specs.append(('inner', rng.uniform(0.55, 0.82)))
    for _ in range(n_loose): specs.append(('loose', rng.uniform(0.92, 1.05)))
    for kind, k0 in specs:
        n = 17 if kind != 'inner' else 13
        t = np.linspace(0, 1, n)
        psi0 = rng.uniform(0, 2 * np.pi); span = rng.uniform(0.9, 2.1) * np.pi * rng.choice([-1, 1])
        if kind == 'loose': span *= 0.8
        lam0 = rng.uniform(-45, 70) * D; lam1 = lam0 + rng.uniform(-60, 60) * D
        lam = np.clip(lam0 + (lam1 - lam0) * t + 0.22 * np.sin(2 * np.pi * (rng.uniform(0.8, 1.8) * t + rng.uniform())), -62 * D, 82 * D)
        psi = psi0 + span * t + 0.25 * np.sin(2 * np.pi * (rng.uniform(0.5, 1.5) * t + rng.uniform()))
        k = k0 + 0.05 * np.sin(2 * np.pi * (rng.uniform(1, 2.5) * t + rng.uniform())) + rng.normal(0, 0.012)
        if kind == 'loose':   # Ende loest sich vom Dutt, Spitze steht ab / rollt sich
            e = smoothstep(0.55, 1.0, t)
            k = k + 0.55 * e ** 1.4 + 0.12 * np.sin(2 * np.pi * 2.2 * t) * e
            lam = lam + rng.normal(0, 0.5) * e ** 1.2
        pts = ell_pt(lam, psi, k) @ Rt.T + BUN_C
        # leichtes raeumliches Rauschen
        pts += rng.normal(0, 0.0015, pts.shape) * 0 + 0.004 * np.stack([np.sin(2 * np.pi * (1.3 * t + rng.uniform())) for _ in range(3)], axis=-1)
        Nh = nrm(pts - BUN_C)
        width = (rng.uniform(0.020, 0.032) if kind == 'outer' else rng.uniform(0.022, 0.034) if kind == 'inner' else rng.uniform(0.011, 0.020))
        w = taper(n, width * 0.85, width, tip=0.30 if kind != 'inner' else 0.12, tip_ratio=0.12 if kind == 'loose' else 0.4)
        col = rng.choice([0, 1, 2, 3, 4, 5, 6], p=[0.2, 0.17, 0.17, 0.14, 0.12, 0.1, 0.1]) if kind != 'loose' else rng.choice([2, 3, 4, 5, 6, 7])
        u0, u1 = col_u(col)
        co, uv, tri, nr, S = ribbon(pts, Nh, w, u0, u1, 0.0, 1.0, across=3, bulge=0.18, twist=rng.uniform(-0.5, 0.5) * np.sin(2 * np.pi * (t * rng.uniform(0.8, 1.6) + rng.uniform())))
        acc.add(co, uv, tri, blend_normals(nr, co, BUN_C, 0.35), {'head': np.ones(len(co))})
    return acc


# =============================================================================== Lose Locken auf Spring-Ketten
class Chain:
    def __init__(self, name, guide, params):
        self.name = name; self.guide = guide; self.params = params; self.bones = []


def guide_curve(P, n=40):
    return resample(catmull(P, 60), n)


def bishop_frames(G):
    T = tangents(G); n = len(G)
    a = np.array([0, 0, 1.0]) if abs(T[0, 2]) < 0.9 else np.array([1.0, 0, 0])
    N1 = nrm(np.cross(T[0], a)); N2 = np.cross(T[0], N1)
    N1s = [N1]; N2s = [N2]
    for i in range(1, n):
        ax = np.cross(T[i - 1], T[i]); s = np.linalg.norm(ax)
        if s > 1e-9:
            ang = np.arcsin(min(s, 1)); N1 = rodrigues(N1, ax, ang); N2 = np.cross(T[i], N1)
        N1s.append(N1); N2s.append(N2)
    return T, np.array(N1s), np.array(N2s)


def curl_ribbon(G, s_g, rng, turns, rho, width, col, phase, s0=0.0, s1=1.0, n=34, across=2, wave=0.0, spring_s=True):
    """Helix-Ribbon um Fuehrungskurve G (n_g,3) mit Parameter s_g (0..1). Gibt co,uv,tri,nr,s (Kettenparameter je Vertex)"""
    T, N1, N2 = bishop_frames(G)
    s = np.linspace(s0, s1, n)
    ts = (s - s0) / max(s1 - s0, 1e-6)
    idx = np.interp(s, s_g, np.arange(len(G)))
    Gp = np.stack([np.interp(idx, np.arange(len(G)), G[:, k]) for k in range(3)], axis=1)
    N1p = nrm(np.stack([np.interp(idx, np.arange(len(G)), N1[:, k]) for k in range(3)], axis=1))
    N2p = nrm(np.stack([np.interp(idx, np.arange(len(G)), N2[:, k]) for k in range(3)], axis=1))
    rr = rho * (0.35 + 0.65 * smoothstep(0, 0.18, ts)) * (1 - 0.55 * smoothstep(0.55, 1.0, ts))
    rr = rr * (1 + 0.28 * np.sin(2 * np.pi * (rng.uniform(0.7, 1.6) * ts + rng.uniform())))
    alpha = 2 * np.pi * turns * ts * (1 + 0.18 * np.sin(np.pi * ts * rng.uniform(0.5, 1.5))) + phase
    off = np.cos(alpha)[:, None] * N1p + np.sin(alpha)[:, None] * N2p
    P = Gp + off * rr[:, None]
    if wave: P = P + N1p * (wave * np.sin(2 * np.pi * 1.3 * ts + phase))[:, None]
    Nh = off  # radial nach aussen
    w = taper(n, width * 0.75, width, tip=0.35, tip_ratio=0.10)
    u0, u1 = col_u(col)
    co, uv, tri, nr, S = ribbon(P, Nh, w, u0, u1, 0.0, 1.0, across=across, bulge=0.12)
    return co, uv, tri, nr, np.repeat(s, across)


def lock_ribbons(acc, rng, G, s_g, n_curl=3, length_frac=(0.8, 1.0), broad=True, rho=(0.006, 0.011), turns=(1.6, 3.8), curl_w=(0.006, 0.010), wavy_w=(0.015, 0.022), ncol_choices=(0, 1, 2, 3, 4, 5, 6, 7)):
    """Fuellt acc mit Ribbons fuer eine Kette; gibt Liste (s-Parameter je Vertex) zurueck fuer Gewichte"""
    out = []
    if broad:
        # breiter, welliger Strang entlang der Fuehrung
        s1 = rng.uniform(0.85, 1.0)
        co, uv, tri, nr, s = curl_ribbon(G, s_g, rng, turns=rng.uniform(0.8, 1.5), rho=rng.uniform(0.003, 0.006), width=rng.uniform(*wavy_w), col=int(rng.choice([0, 1, 2, 3, 4, 5])),
                                         phase=rng.uniform(0, 6.28), s0=0.0, s1=s1, n=22, across=3, wave=0.004)
        out.append((co, uv, tri, nr, s))
    for _ in range(n_curl):
        s1 = rng.uniform(*length_frac)
        co, uv, tri, nr, s = curl_ribbon(G, s_g, rng, turns=rng.uniform(*turns), rho=rng.uniform(*rho), width=rng.uniform(*curl_w), col=int(rng.choice([4, 5, 6, 7, 1, 2])),
                                         phase=rng.uniform(0, 6.28), s0=0.0, s1=s1, n=int(rng.integers(26, 36)), across=2)
        out.append((co, uv, tri, nr, s))
    return out


def lock_chain_defs(scalp, rng):
    """Definition aller Locken-Ketten: Name, Wurzelpunkt-Parameter, Fuehrungspunkte relativ"""
    defs = []
    # ------- Gesicht-umrahmend (vor den Ohren) -------
    for side, sg in (('l', 1), ('r', -1)):
        for i, (th, ph, L, curl) in enumerate([(68, 12, 0.14, 3), (60, 22, 0.12, 3), (74, 6, 0.10, 2)]):
            if side == 'l' and i == 2: continue
            defs.append(dict(name=f'front_{side}{i + 1}', th=sg * th * D, ph=ph * D, L=L * (1.15 if side == 'r' else 1.0), kind='front', n_curl=curl))
    # ------- hinter den Ohren / Nacken -------
    for side, sg in (('l', 1), ('r', -1)):
        for i, (th, ph, L) in enumerate([(116, 6, 0.12), (132, -10, 0.11), (150, -28, 0.09)]):
            defs.append(dict(name=f'ear_{side}{i + 1}', th=sg * th * D, ph=ph * D, L=L, kind='ear', n_curl=2))
    # ------- Dutt-Skirt (hinten) -------
    for i, th in enumerate([-28, -9, 10, 28]):
        defs.append(dict(name=f'nape_{i + 1}', th=(180 + th) * D, ph=(30 + 8 * (i % 2)) * D, L=rng.uniform(0.12, 0.17), kind='nape', n_curl=3))
    # ------- Dutt-lose Locken seitlich -------
    for side, sg in (('l', 1), ('r', -1)):
        defs.append(dict(name=f'bun_{side}1', th=(sg * 128) * D, ph=48 * D, L=0.15, kind='bunside', n_curl=3))
    return defs


def make_guides(scalp, rng, d):
    th, ph, L, kind = d['th'], d['ph'], d['L'], d['kind']
    P0 = scalp.point(th, ph, 0.004)
    out = nrm(np.array([P0[0] - C_HEAD[0], P0[1] - C_HEAD[1], 0.0]))     # horizontal nach aussen
    side = np.sign(P0[0]) if abs(P0[0]) > 0.01 else rng.choice([-1, 1])
    fwd = np.array([0, -1.0, 0]); down = np.array([0, 0, -1.0]); up = np.array([0, 0, 1.0])
    nsurf = nrm(P0 - C_HEAD)
    if kind == 'front':
        P1 = P0 + out * 0.012 + nsurf * 0.004 + down * 0.020 + fwd * 0.004
        P2 = P0 + out * 0.020 + down * (0.35 * L) + fwd * 0.012
        P3 = P0 + out * 0.017 + down * (0.72 * L) + fwd * 0.022 + np.array([side * 0.004, 0, 0])
        P4 = P0 + out * 0.012 + down * L + fwd * 0.026
        pts = [P0, P1, P2, P3, P4]
    elif kind == 'ear':
        P1 = P0 + out * 0.014 + down * 0.018
        P2 = P0 + out * 0.022 + down * (0.4 * L) + np.array([0, 0.010, 0])
        P3 = P0 + out * 0.020 + down * (0.75 * L) + np.array([0, 0.016, 0])
        P4 = P0 + out * 0.016 + down * L + np.array([0, 0.020, 0])
        pts = [P0, P1, P2, P3, P4]
    elif kind == 'nape':
        back = np.array([0, 1.0, 0])
        P1 = P0 + nsurf * 0.016 + down * 0.010
        P2 = P0 + back * 0.030 + out * 0.004 + down * (0.35 * L)
        P3 = P0 + back * 0.034 + down * (0.7 * L) + np.array([rng.normal(0, 0.008), 0, 0])
        P4 = P0 + back * 0.030 + down * L + np.array([rng.normal(0, 0.010), 0, 0])
        pts = [P0, P1, P2, P3, P4]
    else:  # bunside
        P1 = P0 + nsurf * 0.016 + out * 0.010
        P2 = P0 + out * 0.032 + down * (0.35 * L) + np.array([0, 0.012, 0])
        P3 = P0 + out * 0.030 + down * (0.72 * L) + np.array([0, 0.020, 0])
        P4 = P0 + out * 0.022 + down * L + np.array([0, 0.024, 0])
        pts = [P0, P1, P2, P3, P4]
    return np.array(pts)


def build_locks(scalp, rng, n_bone=4):
    """Liefert (MeshAcc, bones, springs). Ketten mit n_bone Segment-Bones + 1 Spitzen-Bone."""
    acc = MeshAcc('P_HairLocks')
    bones = []; springs = []
    for d in lock_chain_defs(scalp, rng):
        pts = make_guides(scalp, rng, d)
        G = guide_curve(pts, 40)
        s_g = arclen(G); total = s_g[-1]; s_g = s_g / total
        knots = np.linspace(0, 1, n_bone + 1)    # Bone-Kopf-Positionen als Anteil der Laenge (letzter = Spitzen-Bone)
        # Bone-Positionen entlang der Fuehrung
        idx = np.interp(knots, s_g, np.arange(len(G)))
        bp = np.stack([np.interp(idx, np.arange(len(G)), G[:, k]) for k in range(3)], axis=1)
        names = [f"hair_{d['name']}_{i + 1:02d}" for i in range(n_bone + 1)]
        for i in range(n_bone + 1):
            head = bp[i]
            tail = bp[i + 1] if i < n_bone else bp[i] + nrm(bp[i] - bp[i - 1]) * 0.012
            bones.append(dict(name=names[i], head=[float(x) for x in head], tail=[float(x) for x in tail],
                              parent='head' if i == 0 else names[i - 1], roll=0.0, deform=True))
        rib = lock_ribbons(acc, rng, G, s_g, n_curl=d['n_curl'])
        for co, uv, tri, nr, s in rib:
            W = hat_weights(s, knots)
            wd = {names[k]: W[:, k] for k in range(n_bone + 1)}
            acc.add(co, uv, tri, nr, wd, meta=d['name'])
        stiff = {'front': 0.75, 'ear': 0.8, 'nape': 0.65, 'bunside': 0.7}[d['kind']]
        springs.append(dict(name=f"hair_{d['name']}", joints=names, stiffness=round(stiff + rng.uniform(-0.05, 0.08), 3),
                            drag=round(rng.uniform(0.38, 0.48), 3), gravity=round(rng.uniform(0.06, 0.13), 3), hit_radius=0.012))
    return acc, bones, springs


# =============================================================================== Wisps (BLEND, einzelne feine Haare)
def build_wisps(scalp, rng, n=60):
    """feine Einzelhaare (BLEND): folgen dem Haarfluss knapp ueber den Lagen, Enden loesen sich leicht; am Dutt kurze Boegen."""
    acc = MeshAcc('P_HairWisps')
    pole = sph_dir(POLE_TH, POLE_PH)
    for k in range(n):
        zone = rng.choice(['flow', 'hairline', 'bun'], p=[0.45, 0.25, 0.30])
        col = int(rng.integers(0, 8)); u0, u1 = col / 8, (col + 1) / 8
        if zone in ('flow', 'hairline'):
            th = rng.uniform(-180, 180) * D
            ph_h = float(hairline_phi(th))
            ph = ph_h + (rng.uniform(0.5, 3) if zone == 'hairline' else rng.uniform(5, 30)) * D
            U0 = sph_dir(th, ph)
            Ue = nrm(U0 * 0.35 + pole * 0.65 + rng.normal(0, 0.12, 3))
            Ub = sph_bezier([U0, nrm(U0 * 0.6 + Ue * 0.4 + rng.normal(0, 0.06, 3)), Ue], 12)
            t = np.linspace(0, 1, 12)
            tt, pp = dir_sph(Ub)
            h = 0.006 + 0.020 * smoothstep(0.0, 1.0, t) * rng.uniform(0.5, 1.2) + 0.006 * np.sin(np.pi * t)
            P = scalp.point(tt, pp, h)
            Nh = nrm(P - C_HEAD)
        else:
            psi = rng.uniform(0, 2 * np.pi); lam = rng.uniform(-30, 50) * D
            P0 = BUN_C + ell_pt(lam, psi, 0.95)
            out = nrm(P0 - BUN_C)
            t = np.linspace(0, 1, 12)
            L = rng.uniform(0.04, 0.09)
            side = nrm(np.cross(out, [0, 0, 1.0]) + 1e-9)
            P = P0 + out * (L * 0.6 * np.sin(np.pi * 0.7 * t))[:, None] + side * (L * 0.5 * t * rng.choice([-1, 1]))[:, None] \
                + np.array([0, 0, -1.0]) * (L * 0.6 * t ** 2)[:, None]
            Nh = nrm(P - BUN_C)
        w = np.full(len(P), rng.uniform(0.009, 0.014))
        co, uv, tri, nr, S = ribbon(P, Nh, w, u0, u1, 0.0, 1.0, across=2, bulge=0.0)
        acc.add(co, uv, tri, nr, {'head': np.ones(len(co))})
    return acc
