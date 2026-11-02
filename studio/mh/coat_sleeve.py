"""Aermel: Rohr entlang der Arm-Mittellinie, Radius aus Koerper-Querschnitt + Zuschlag + Falten, aufgekrempelte Manschette."""
import numpy as np
from coat_common import *

TAU = 2 * np.pi
J0 = np.array([0.157, -0.021, 1.283]); E0 = np.array([0.317, -0.025, 1.109]); W0 = np.array([0.428, -0.163, 0.987])


def catmull(P, n_per=40):
    """Catmull-Rom (centripetal approx) durch Punkte P (k,3) -> dichte Polyline"""
    P = np.asarray(P, float)
    Q = np.vstack([2 * P[0] - P[1], P, 2 * P[-1] - P[-2]])
    out = []
    for i in range(1, len(Q) - 2):
        p0, p1, p2, p3 = Q[i - 1], Q[i], Q[i + 1], Q[i + 2]
        for t in np.linspace(0, 1, n_per, endpoint=False):
            t2 = t * t; t3 = t2 * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    out.append(P[-1])
    return np.array(out)


def resample(poly, ss):
    d = np.r_[0, np.cumsum(np.linalg.norm(np.diff(poly, axis=0), axis=1))]
    return np.stack([np.interp(ss, d, poly[:, k]) for k in range(3)], 1), d[-1]


def frames(P, up0):
    """Rotation-minimizing frames. P (n,3). Rueckgabe T,U,V"""
    T = norm(np.gradient(P, axis=0))
    U = np.zeros_like(P); V = np.zeros_like(P)
    u = up0 - T[0] * np.dot(up0, T[0]); u /= np.linalg.norm(u)
    for i in range(len(P)):
        if i > 0:
            u = u - T[i] * np.dot(u, T[i]); u /= np.linalg.norm(u)
        U[i] = u; V[i] = np.cross(T[i], u)
    return T, U, V


def sleeve_clearance(s, L_cuff, s_elbow):
    """radialer Zuschlag (m) ueber Haut je Position s entlang des Aermels"""
    c = np.interp(s, [-0.05, 0.0, 0.06, 0.14, s_elbow, s_elbow + 0.08, L_cuff - 0.09, L_cuff - 0.06],
                  [0.026, 0.026, 0.024, 0.028, 0.033, 0.035, 0.032, 0.022])
    return c


def build_sleeve(B, side=+1, nphi=24, seed=11, cuff_frac=0.60):
    sg = np.array([side, 1, 1])
    J, E, W = J0 * sg, E0 * sg, W0 * sg
    C = E + cuff_frac * (W - E)
    d1 = norm(E - J); d2 = norm(W - E)
    path = catmull(np.array([J - 0.05 * d1, J, E, C, C + 0.03 * d2]), 60)
    # Bogenlaenge ab J
    dJ = np.r_[0, np.cumsum(np.linalg.norm(np.diff(path, axis=0), axis=1))]
    iJ = np.argmin(np.linalg.norm(path - J, axis=1)); sJ = dJ[iJ]
    iC = np.argmin(np.linalg.norm(path - C, axis=1)); sC = dJ[iC]
    iE = np.argmin(np.linalg.norm(path - E, axis=1)); sE = dJ[iE]
    L_cuff = sC - sJ; s_el = sE - sJ
    # Ringpositionen (s ab J)
    ss = np.concatenate([
        np.array([-0.04, -0.012]),
        np.linspace(0.015, s_el - 0.09, 5),
        np.linspace(s_el - 0.06, s_el + 0.06, 6),
        np.linspace(s_el + 0.10, L_cuff - 0.105, 4),
        np.array([L_cuff - 0.085, L_cuff - 0.066]),          # Einzug zur Manschette
        np.array([L_cuff - 0.061, L_cuff - 0.054, L_cuff - 0.028, L_cuff - 0.006, L_cuff + 0.004, L_cuff + 0.009]),
    ])
    n = len(ss)
    P, _ = resample(path, ss + sJ)
    up0 = np.array([0.74 * side, 0.0, 0.68])
    T, U, V = frames(P, up0)
    phi = -np.pi + TAU * np.arange(nphi) / nphi
    # Koerper-Querschnitt je Ring
    armm = B.arm_w > 0.5
    rb = np.full((n, nphi), np.nan)
    for k in range(n):
        if ss[k] < 0.02:
            continue
        # Punkte nahe der Achse
        pts = B.plane_slice(P[k], T[k], armm)
        dd = np.linalg.norm(pts - P[k], axis=1)
        pts = pts[dd < 0.14]
        if len(pts) < 5:
            continue
        # Ebene-Koordinaten (u,v) um Schwerpunkt der Punkte, dann radial aus Ringzentrum P[k]
        p2 = np.stack([(pts - P[k]) @ U[k], (pts - P[k]) @ V[k]], 1)
        def dfn(th): return np.stack([np.cos(th), np.sin(th)], -1)
        rb[k] = hull_radial(p2, np.zeros(2), phi, dfn)       # radial um die Armachse
    # fehlende Ringe fuellen
    valid = np.isfinite(rb[:, 0])
    first = np.argmax(valid)
    for k in range(n):
        if not valid[k]:
            rb[k] = rb[first] * (0.78 if ss[k] < -0.02 else 1.0)
    # glaetten entlang s (nicht phi) leicht
    rb = gauss_smooth(rb, 0.8, 0)
    rb = gauss_smooth(rb, 1.0, 1, mode='wrap')
    # Rahmen nach der Zentrumskorrektur neu (T gleich)
    rng = np.random.default_rng(seed)
    # Innenseite der Biegung (Ellenbogen)
    kappa = d2 - d1
    ie = int(np.argmin(abs(ss - s_el)))
    ph_in = np.arctan2(np.dot(kappa, V[ie]), np.dot(kappa, U[ie]))
    R = np.zeros((n, nphi)); FO = np.zeros((n, nphi))
    ph = rng.uniform(0, TAU, 8)
    for k in range(n):
        s = ss[k]
        clr = sleeve_clearance(s, L_cuff, s_el)
        # Falten
        dphi = np.angle(np.exp(1j * (phi - ph_in)))
        inner = np.exp(-(dphi / 0.9) ** 2)                      # 1 auf der Innenseite der Biegung
        ell = np.exp(-((s - s_el) / 0.07) ** 2)
        f = 0.0085 * ell * inner * np.sin((s - s_el) * 2 * np.pi / 0.040 + 0.5)                          # Quer-Stauchfalten am Ellenbogen
        f = f + 0.0050 * np.sin(4 * phi + ph[0] + 7 * s) * smoothstep(0.02, 0.15, s) * (1 - 0.6 * ell)           # Laengsfalten
        f = f + 0.0035 * np.sin(7 * phi + ph[1] - 11 * s) * smoothstep(0.05, 0.2, s)
        # Stoff-Zug von der Schulter: diagonale Falten am Oberarm
        f = f + 0.0045 * np.sin(3 * phi - 22 * s + ph[2]) * smoothstep(0.03, 0.10, s) * (1 - smoothstep(s_el - 0.04, s_el + 0.02, s))
        # Raffung vor der Manschette
        gath = smoothstep(L_cuff - 0.14, L_cuff - 0.07, s) * (1 - smoothstep(L_cuff - 0.066, L_cuff - 0.061, s))
        f = f + 0.0035 * gath * np.sin(11 * phi + ph[3] + 40 * s)
        R[k] = rb[k] + clr + f
        FO[k] = f
    # Manschetten-Profil (absolute Radien ueber Haut): s relativ L_cuff
    cuff_prof = {
        L_cuff - 0.066: 0.022, L_cuff - 0.061: 0.031, L_cuff - 0.054: 0.033, L_cuff - 0.028: 0.033,
        L_cuff - 0.006: 0.031, L_cuff + 0.004: 0.025, L_cuff + 0.009: 0.017,
    }
    for k in range(n):
        for sk, cv in cuff_prof.items():
            if abs(ss[k] - sk) < 1e-9:
                R[k] = rb[k] + cv + 0.0015 * np.sin(9 * phi + ph[4]) * (0.0 if sk > L_cuff - 0.01 else 1.0)
    # Ringpunkte
    pts = np.zeros((n, nphi, 3))
    for k in range(n):
        pts[k] = P[k] + R[k][:, None] * (np.cos(phi)[:, None] * U[k] + np.sin(phi)[:, None] * V[k])
    return dict(rb=rb, V=pts, phi=phi, ss=ss, R=R, FO=FO, P=P, T=T, U=U, V_=V, L_cuff=L_cuff, s_el=s_el, J=J, E=E, W=W, C=C, side=side)


def sleeve_mesh(S, mb: MeshB, mat=0, uv_off=(0, 0), uv_scale=1 / 1.7, flip=False):
    V = S['V']; n, nphi, _ = V.shape; phi = S['phi']
    idx = np.arange(n * nphi).reshape(n, nphi)
    Rr = S['R']
    # Umfang je Ring (aus Bogenlaenge)
    circ = np.array([np.sum(np.linalg.norm(V[k] - np.roll(V[k], -1, axis=0), axis=1)) for k in range(n)])
    # v-Koordinate: Weg entlang s (cumulative Laenge der Mittellinie)
    ss = S['ss']
    vv = ss - ss[0]
    F = []; UVl = []
    for k in range(n - 1):
        for i in range(nphi):
            i2 = (i + 1) % nphi
            a = idx[k, i]; b = idx[k, i2]; c = idx[k + 1, i2]; d = idx[k + 1, i]
            F.append([a, d, c, b] if flip else [a, b, c, d])
            # UV: u = phi/2pi * Umfang; Naht bei +-pi
            ph0 = -np.pi + TAU * i / nphi; ph1 = ph0 + TAU / nphi
            def uf(kk, p): return p / TAU * circ[kk]
            q = [(uf(k, ph0), vv[k]), (uf(k, ph1), vv[k]), (uf(k + 1, ph1), vv[k + 1]), (uf(k + 1, ph0), vv[k + 1])]
            if flip: q = [q[0], q[3], q[2], q[1]]
            UVl.append(q)
    F = np.array(F); UVl = np.array(UVl, float)
    S['UVg'] = np.stack([(phi[None, :] / TAU * circ[:, None]) * uv_scale + uv_off[0], 1.0 - (vv[:, None] * uv_scale + uv_off[1]) + 0 * phi[None, :]], -1)
    UVl[..., 0] = UVl[..., 0] * uv_scale + uv_off[0]
    UVl[..., 1] = 1.0 - (UVl[..., 1] * uv_scale + uv_off[1])
    attrs = dict(fold=S['FO'].reshape(-1), zrow=V[..., 2].reshape(-1), part=np.full(n * nphi, 1.0 if S['side'] > 0 else 2.0))
    base = mb.add(V.reshape(-1, 3), F, UV=UVl, mat=mat, attrs=attrs)
    # offene Enden: Kappen schliessen? (Anfang liegt in Schulterkuppel, Ende = Manschette -> offen)
    return base, idx
