"""Kittel-Hauptkoerper: Kragen + Passe + Rumpf + Rock als ein polares Gitter (offene Front, Rueckenschlitz, Asymmetrie-Saum, Falten)."""
import numpy as np
from coat_common import *
from coat_env import Envelope, dirf

TAU = 2 * np.pi

# ---------------------------------------------------------------------------- Entwurfskurven (z in m)
# Achse (Mittelpunkt der Ringe, y)
def cy_axis(z):
    zs = [0.10, 0.80, 0.95, 1.05, 1.15, 1.25, 1.33, 1.40, 1.50]
    ys = [-0.035, -0.035, -0.045, -0.055, -0.055, -0.035, -0.018, -0.0287, -0.0627]
    return pchip(z, zs, ys)


# Offene Front: halber Abstand der Vorderkanten (x) je Hoehe
def front_gap(z):
    zs = [0.20, 0.40, 0.60, 0.80, 0.90, 1.00, 1.15, 1.26, 1.34, 1.40, 1.47]
    es = [0.215, 0.195, 0.170, 0.140, 0.125, 0.112, 0.105, 0.090, 0.066, 0.055, 0.058]
    return pchip(z, zs, es)


# Saum (asymmetrisch)
def hem_z(th):
    th = np.asarray(th)
    return 0.352 + 0.040 * np.cos(th) + 0.022 * np.cos(2 * th) + 0.020 * np.sin(th) + 0.007 * np.sin(5 * th + 1.0) + 0.004 * np.sin(11 * th)


# Rock-Entwurf (Halbachsen relativ zur Achse)
def skirt_axes(z):
    zs = [0.20, 0.35, 0.50, 0.65, 0.80, 0.90]
    a = [0.345, 0.325, 0.295, 0.255, 0.225, 0.205]       # halbe Breite
    bf = [0.150, 0.145, 0.140, 0.135, 0.130, 0.130]      # vorn (ab Achse)
    bb = [0.205, 0.195, 0.180, 0.165, 0.150, 0.140]      # hinten
    return pchip(z, zs, a), pchip(z, zs, bf), pchip(z, zs, bb)


def design_r(th, z, p=2.6):
    a, bf, bb = skirt_axes(z)
    s = np.abs(np.sin(th)); c = np.cos(th)
    b = np.where(c >= 0, bf, bb)
    return (s / a) ** p + (np.abs(c) / b) ** p


def design_radius(th, z, p=2.6):
    return design_r(th, z, p) ** (-1.0 / p)


def clearance(z):
    """Zuschlag zur Haut (Aussenflaeche Kittel) in m."""
    zs = [0.80, 0.95, 1.05, 1.15, 1.22, 1.30, 1.36]
    cs = [0.040, 0.040, 0.040, 0.034, 0.032, 0.030, 0.028]
    return pchip(z, zs, cs)


def fold_field(th, z, seed=3):
    """Falten-Auslenkung (radial, m) -- wachsen von Huefte zum Saum, nicht-sinusfoermig."""
    rng = np.random.default_rng(seed)
    ph = rng.uniform(0, TAU, 8)
    amp = smoothstep(0.93, 0.42, z)               # 0 oben, 1 unten
    amp = amp ** 1.15
    def ridge(x):                                   # runde Kaemme, spitzere Taeler
        s = np.sin(x)
        return s + 0.28 * np.sin(2 * x + 0.7) - 0.10 * np.sin(3 * x)
    drift = (z - 0.8)
    f = (0.020 * ridge(5 * th + ph[0] + 2.2 * drift)
         + 0.014 * ridge(8 * th + ph[1] - 3.0 * drift)
         + 0.0085 * ridge(13 * th + ph[2] + 4.5 * drift)
         + 0.0035 * ridge(21 * th + ph[3] - 6.0 * drift))
    # Falten wachsen zum Saum (Weite)
    return 1.7 * f * (0.25 + 0.75 * amp) * amp


def build_shell(env: Envelope, NU=85, seed=3):
    """Gitter [NU+1 Spalten (Mitte doppelt), NR Zeilen] -> Verts (NU+1, NR, 3) + Attribute."""
    c0 = NU // 2                                         # Mitte (theta = pi)
    s = np.linspace(0, 1, NU)                            # 0 = Vorderkante links (+X), 1 = rechts (-X)
    # Zeilen-Definition
    n_col, n_yoke, n_torso, n_skirt = 6, 6, 11, 14
    NR = n_col + n_yoke + n_torso + n_skirt
    rowtype = np.zeros(NR, int)
    # nominale Hoehen (fuer Kante e(z))
    zrow_nom = np.zeros(NR)
    zb = 1.385
    for j in range(n_col):
        zrow_nom[j] = lerp(1.462, zb, j / (n_col - 1))
    for k in range(1, n_yoke + 1):
        zrow_nom[n_col - 1 + k] = zb - (zb - 1.30) * k / n_yoke
    for k in range(1, n_torso + 1):
        zrow_nom[n_col + n_yoke - 1 + k] = 1.30 - (1.30 - 0.86) * k / n_torso
    for k in range(1, n_skirt + 1):
        zrow_nom[n_col + n_yoke + n_torso - 1 + k] = 0.86 - (0.86 - 0.40) * k / n_skirt
    j_skirt0 = n_col + n_yoke + n_torso - 1               # Zeile bei z=0.86
    j_col_base = n_col - 1
    NRr = NR

    # Spaltenwinkel: vorlaeufig aus der Kante: theta_e(z) iterativ
    def edge_theta(zrow):
        e = front_gap(zrow)
        th = np.arcsin(np.clip(e / 0.2, -1, 1)) * 0 + 0.6
        for _ in range(8):
            r = base_r(th, zrow)
            th = np.arcsin(np.clip(e / r, 0, 0.99))
        return th

    def base_r(th, z):
        """Radius ohne Falten (relativ zur Achse)."""
        rb = env.r_at(th, np.minimum(z, 1.395)) + clearance(np.clip(z, 0.8, 1.36))
        # Kragen: Neck-Huelle + Aufweitung
        flare = smoothstep(1.395, 1.462, z)
        collar = env.r_at(th, np.full_like(np.asarray(th, float), 1.395)) + 0.034 + 0.040 * flare ** 1.2
        rc = np.where(z > 1.388, collar, rb)
        # Rock
        rd = design_radius(th, np.clip(z, 0.2, 0.9))
        k = smoothstep(0.93, 0.80, z)
        rs = np.maximum(rb, rd) * k + rb * (1 - k)
        r = np.where(z > 1.388, rc, rs)
        # Uebergang Kragenbasis (1.36..1.40)
        return r

    Vg = np.zeros((NU + 1, NR, 3))
    TH = np.zeros((NU + 1, NR)); ZZ = np.zeros((NU + 1, NR)); RR = np.zeros((NU + 1, NR))
    FOLD = np.zeros((NU + 1, NR)); GAP = np.zeros((NU + 1, NR))
    colmap = np.concatenate([np.arange(0, c0 + 1), np.arange(c0, NU)])    # Spalte -> s-Index (Mitte doppelt)
    for j in range(NR):
        zn = zrow_nom[j]
        te = edge_theta(np.array([zn]))[0]
        # s: 0 -> theta=te (links), 1 -> theta=2pi-te
        th_s = lerp(te, TAU - te, s)
        # Spalten: Mitte doppelt, Schlitz-Aufweitung
        for ci in range(NU + 1):
            si = colmap[ci]
            th = th_s[si]
            # z
            if j <= j_col_base:
                zt = 1.405 + 0.060 * np.sin(np.pi * s[si]) ** 0.55
                z = lerp(zt, zb, j / (n_col - 1))
            elif j <= j_skirt0:
                z = zn
            else:
                zh = hem_z(th)
                z = lerp(0.86, zh, (j - j_skirt0) / n_skirt)
            ZZ[ci, j] = z; TH[ci, j] = th
    # Schlitz: Winkelaufweitung nahe der Mitte
    for ci in range(NU + 1):
        pass
    for j in range(NR):
        for ci in range(NU + 1):
            z = ZZ[ci, j]; th = TH[ci, j]
            r0 = base_r(np.array([th]), np.array([z]))[0]
            fo = fold_field(np.array([th]), np.array([z]), seed)[0]
            # Falten an den freien Vorderkanten daempfen (haengen gerade)
            edge_d = min(s[colmap[ci]], 1 - s[colmap[ci]])
            fo *= smoothstep(0.0, 0.09, edge_d) * 0.8 + 0.2
            r = r0 + fo
            cy = cy_axis(z)
            RR[ci, j] = r; FOLD[ci, j] = fo
            Vg[ci, j] = (r * np.sin(th), cy - r * np.cos(th), z)
    # Schlitz (Rueckenmitte): linke Kopie nach +X, rechte nach -X verschieben
    z_v0, gap_max = 0.64, 0.05
    for j in range(NR):
        for ci in (c0, c0 + 1):
            z = ZZ[ci, j]
            g = gap_max * smoothstep(z_v0, 0.33, z) ** 1.3
            GAP[ci, j] = g
            Vg[ci, j, 0] += (+g if ci == c0 else -g)
    return dict(V=Vg, TH=TH, Z=ZZ, R=RR, FOLD=FOLD, GAP=GAP, NU=NU, NR=NR, c0=c0, s=s, colmap=colmap,
                j_col_base=j_col_base, j_skirt0=j_skirt0, n_col=n_col, rows_nom=zrow_nom, z_v0=z_v0, base_r=base_r)


def shell_mesh(G, mb: MeshB, mat=0, uv_off=(0.0, 0.0), uv_scale=1 / 1.7):
    """Gitter -> MeshB (Quads, UVs aus Bogenlaenge)."""
    V = G['V']; NU1, NR, _ = V.shape; c0 = G['c0']
    # Bogenlaenge u (in m) ab Mitte: links positiv
    U = np.zeros((NU1, NR)); Vv = np.zeros((NU1, NR))
    for j in range(NR):
        # links: Spalten c0 -> 0 (u positiv), rechts: c0+1 -> NU
        for ci in range(c0 - 1, -1, -1):
            U[ci, j] = U[ci + 1, j] + np.linalg.norm(V[ci, j] - V[ci + 1, j])
        for ci in range(c0 + 2, NU1):
            U[ci, j] = U[ci - 1, j] - np.linalg.norm(V[ci, j] - V[ci - 1, j])
    for ci in range(NU1):
        for j in range(1, NR):
            Vv[ci, j] = Vv[ci, j - 1] + np.linalg.norm(V[ci, j] - V[ci, j - 1])
    # Quads (keine zwischen den Mittel-Kopien)
    idx = np.arange(NU1 * NR).reshape(NU1, NR)
    F = []; UVl = []
    for ci in range(NU1 - 1):
        if ci == c0:
            continue
        a = idx[ci, :-1]; b = idx[ci + 1, :-1]; c = idx[ci + 1, 1:]; d = idx[ci, 1:]
        # Orientierung: Normale nach aussen. Spalten laufen von links(+X) nach rechts(-X), Zeilen von oben nach unten.
        q = np.stack([a, d, c, b], 1)
        F.append(q)
        uu = np.stack([U[ci, :-1], U[ci, 1:], U[ci + 1, 1:], U[ci + 1, :-1]], 1)
        vv = np.stack([Vv[ci, :-1], Vv[ci, 1:], Vv[ci + 1, 1:], Vv[ci + 1, :-1]], 1)
        UVl.append(np.stack([uu, vv], -1))
    F = np.concatenate(F); UVl = np.concatenate(UVl)
    G['UVg'] = np.stack([U * uv_scale + 0.5 + uv_off[0], 1.0 - (Vv * uv_scale + uv_off[1])], -1)
    UVl[..., 0] = UVl[..., 0] * uv_scale + 0.5 + uv_off[0]
    UVl[..., 1] = 1.0 - (UVl[..., 1] * uv_scale + uv_off[1])
    attrs = dict(fold=G['FOLD'].reshape(-1), zrow=G['Z'].reshape(-1), part=np.zeros(NU1 * NR))
    base = mb.add(V.reshape(-1, 3), F, UV=UVl, mat=mat, attrs=attrs)
    return base, idx


if __name__ == '__main__':
    import bpy
    bpy.ops.wm.open_mainfile(filepath=os.path.join(OUT, 'core.blend'))
    B = Body(bpy.data.objects['Alice_Body']); E = Envelope(B)
    G = build_shell(E)
    mb = MeshB('P_Coat'); shell_mesh(G, mb)
    V, F, UV, M, attr = mb.arrays()
    print(V.shape, F.shape, V.min(0), V.max(0))
