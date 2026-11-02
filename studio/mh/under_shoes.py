"""P_Sneakers: chunky weiß-schwarz-graue Sneaker (Außensohle, Zwischensohle, Obermaterial, Kragen, Zunge, Schnürung, Akzente).
Sohle flach auf z=0; Gewichte foot_x / ball_x (Kragen anteilig calf_x)."""
import math
import numpy as np
from under_common import *

XC, YM, LH = 0.171, -0.1015, 0.1265     # linker Schuh: Mitte x, Mitte y, halbe Länge


def outline(th, scale=1.0, n=2.6):
    """Superellipsen-Umriss; th: Winkel (0 = Ferse +y). Rückgabe (k,2) x,y."""
    c, s = np.cos(th), np.sin(th)
    W = 0.0468 - 0.0058 * c                                     # Ferse schmaler, Ballen breiter
    x = XC + W * np.sign(s) * np.abs(s) ** (2 / n) * scale
    y = YM + LH * np.sign(c) * np.abs(c) ** (2 / n) * (0.97 + 0.03 * scale)
    return np.stack([x, y], 1)


def h_top(y):
    """Oberkante des Obermaterials (Mittellinie) über y."""
    ys = [-0.226, -0.205, -0.17, -0.13, -0.095, -0.07, -0.04, 0.0, 0.03]
    hs = [0.036, 0.052, 0.061, 0.070, 0.082, 0.090, 0.082, 0.078, 0.072]
    return np.interp(y, ys, hs)


def shoe_weights(V, side, part):
    out = []
    for p in V:
        y, z = p[1], p[2]
        wb = float(smoothstep(-0.125, -0.165, y))
        w = {f'foot_{side}': 1 - wb, f'ball_{side}': wb}
        if part == 'collar':
            wc = float(smoothstep(0.085, 0.13, z)) * 0.55
            w = {f'foot_{side}': 1 - wc, f'calf_{side}': wc}
        out.append(limit_weights(w))
    return out


def build_left(mb, mats_idx):
    MI = mats_idx; NA = 56
    th = np.linspace(0, 2 * np.pi, NA, endpoint=False)
    # ---------------- Sohle (Ringe: scale, z, Material)
    prof = [(0.94, 0.0, 'sole'), (0.975, 0.0012, 'sole'), (0.995, 0.004, 'sole'), (1.0, 0.0105, 'sole'), (0.988, 0.0118, 'gray'),
            (1.004, 0.0145, 'gray'), (1.03, 0.0215, 'white'), (1.035, 0.027, 'white'), (1.022, 0.0335, 'white'), (0.985, 0.0375, 'white')]
    rings = []
    for sc, z, _ in prof:
        o = outline(th, sc)
        heel = smoothstep(-0.02, 0.06, o[:, 1]) * (z > 0.011) * 0.009 * (z / 0.0375)
        toe = smoothstep(-0.18, -0.228, o[:, 1]) * (z > 0.011) * (-0.006) * (z / 0.0375)
        rings.append(np.column_stack([o, np.full(NA, z) + heel + toe]))
    V, F = loft(rings, True, cap0=True, cap1=True)
    F = orient_all(V, F, (XC, YM, 0.02))
    # Material je Band
    fm = []
    for f in F:
        zc = V[list(f), 2].mean()
        fm.append('sole' if zc < 0.0108 else ('gray' if zc < 0.0165 else 'white'))
    for k in ('sole', 'gray', 'white'):
        sel = [f for f, m in zip(F, fm) if m == k]
        uvs = 25.0 if k == 'sole' else 12.0
        mb.add(V, sel, MI[k], w=shoe_weights(V, 'l', 'sole'), uvscale=uvs)
    # Rillen an der Zwischensohle (dunkle Akzentlinie + cyan Fersen-Element)
    o = outline(th, 1.034)
    acc = []
    for z in (0.0245, 0.0262):
        acc.append(np.column_stack([o * [1, 1] + 0.0, np.full(NA, z)]))
    # ---------------- Obermaterial: Ringe senkrecht zu y (D-Form)
    ys = np.linspace(-0.222, 0.026, 22)
    NU = 28
    ang = np.linspace(0, np.pi, NU)            # von innen-unten über oben nach außen-unten
    urings = []
    for yv in ys:
        # Halbbreite aus Umriss bei diesem y
        tt = np.linspace(0, 2 * np.pi, 400); oo = outline(tt, 0.93)
        sel = np.abs(oo[:, 1] - yv) < 0.004
        if sel.sum() < 2:
            hw = 0.006; xm = XC
        else:
            hw = (oo[sel, 0].max() - oo[sel, 0].min()) / 2; xm = (oo[sel, 0].max() + oo[sel, 0].min()) / 2
        endf = min(1.0, (yv + 0.228) / 0.03) * min(1.0, (0.034 - yv) / 0.018)
        hw = max(hw, 0.004)
        top = h_top(yv); zb = 0.031
        hh = (top - zb) * max(endf, 0.25) ** 0.5
        pts = []
        for a in ang:
            c, s = math.cos(a), math.sin(a)
            x = xm - hw * np.sign(c) * abs(c) ** (2 / 2.4)
            z = zb + hh * abs(s) ** (2 / 2.4)
            pts.append((x, yv, z))
        # Boden zurück (flach, versteckt in Sohle)
        pts += [(xm + hw * 0.5, yv, zb - 0.002), (xm - hw * 0.5, yv, zb - 0.002)]
        urings.append(np.array(pts))
    Vu, Fu = loft(urings, True, cap0=True, cap1=True)
    Fu = orient_all(Vu, Fu, (XC, YM, 0.045))
    groups = {'white': [], 'black': [], 'gray': [], 'mesh': []}
    for f in Fu:
        p = Vu[list(f)].mean(0)
        dx = abs(p[0] - XC)
        if p[2] < 0.043 and p[1] > -0.2: g = 'black'                     # Schmutzkante
        elif p[1] < -0.19: g = 'gray'                                      # Zehenkappe
        elif dx < 0.024 and -0.165 < p[1] < -0.045 and p[2] > 0.06: g = 'black'   # Schnürleiste
        elif p[1] > -0.01: g = 'black'                                     # Fersenkappe
        elif -0.19 <= p[1] < -0.12: g = 'mesh'
        else: g = 'white'
        groups[g].append(f)
    for g, sel in groups.items():
        mb.add(Vu, sel, MI[g], w=shoe_weights(Vu, 'l', 'upper'), uvscale=25.0 if g == 'mesh' else 12.0)
    # Überlagerte Seitenpaneele (graue Swoosh-freie Wellenform), leicht erhaben
    for sgn in (1, -1):
        path = []
        for yv in np.linspace(-0.175, -0.005, 14):
            zz = 0.046 + 0.018 * math.sin((yv + 0.175) / 0.17 * math.pi) * 0.9
            path.append((yv, zz))
        strip_r = []
        for (yv, zz) in path:
            row = []
            for dz in (-0.009, 0.009):
                # Punkt auf der Oberfläche finden: Ring bei yv
                i = np.argmin(np.abs(ys - yv)); R = urings[i][:NU]
                half = R[:NU // 2] if sgn > 0 else R[NU // 2:]
                j = np.argmin(np.abs(half[:, 2] - (zz + dz)))
                p = half[j].copy(); p[1] = yv
                nrm = np.array([np.sign(p[0] - XC), 0, 0.0])
                row.append(p + nrm * 0.0015)
            strip_r.append(np.array(row))
        Vs = np.vstack(strip_r); Fs = [(2 * i, 2 * i + 1, 2 * i + 3, 2 * i + 2) for i in range(len(strip_r) - 1)]
        Fs = Fs if sgn < 0 else [tuple(reversed(f)) for f in Fs]
        mb.add(Vs, Fs, MI['gray'], w=shoe_weights(Vs, 'l', 'upper'))
    # ---------------- Kragen (doppelwandig, gepolstert)
    cx, cy = 0.168, -0.024
    prof = [(0.000, 0.062), (0.000, 0.110), (0.002, 0.124), (0.000, 0.134), (-0.005, 0.137), (-0.009, 0.131), (-0.010, 0.118), (-0.010, 0.075)]
    NC = 32
    crings = []
    for dr, z in prof:
        k = (z - 0.062) / 0.075
        ax = 0.047 - 0.006 * k + dr; ay = 0.050 - 0.004 * k + dr
        ring = [(cx + ax * math.cos(2 * math.pi * i / NC), cy + ay * math.sin(2 * math.pi * i / NC), z + 0.006 * math.cos(2 * math.pi * i / NC + 0.0) * 0 + (0.008 if math.sin(2 * math.pi * i / NC) < 0 else 0) * abs(math.sin(2 * math.pi * i / NC)) * (z > 0.1)) for i in range(NC)]
        crings.append(np.array(ring))
    Vc, Fc = loft(crings, True)
    # Orientierung: äußeres Band muss radial nach außen zeigen
    f0 = Fc[0]; p = Vc[list(f0)]; n = np.cross(p[2] - p[0], p[3] - p[1])
    if np.dot(n, p.mean(0) - np.array([cx, cy, p.mean(0)[2]])) < 0: Fc = [tuple(reversed(f)) for f in Fc]
    nb = NC * 2
    outer = Fc[:NC * 2]; rim = Fc[NC * 2:NC * 5]; inner = Fc[NC * 5:]
    mb.add(Vc, outer, MI['black'], w=shoe_weights(Vc, 'l', 'collar'))
    mb.add(Vc, rim, MI['gray'], w=shoe_weights(Vc, 'l', 'collar'))
    mb.add(Vc, inner, MI['lining'], w=shoe_weights(Vc, 'l', 'collar'))
    # ---------------- Zunge
    tb = np.array([XC - 0.001, -0.072, 0.083]); tt_ = np.array([XC - 0.002, -0.068, 0.142])
    D = tt_ - tb; L = np.linalg.norm(D); D /= L
    xax = np.array([1.0, 0, 0]); nax = np.cross(xax, D)
    if nax[1] > 0: nax = -nax
    Vt, Ft = prim_box((0.036, L, 0.011), bevel=0.004, segs=2)
    M = mat_from((tb + tt_) / 2 + nax * 0.002, xax, D, nax)
    mb.add(xform(Vt, M), Ft, MI['white'], w=shoe_weights(xform(Vt, M), 'l', 'collar'), sharp_deg=70)
    Vl, Fl = prim_box((0.016, 0.009, 0.002), bevel=0.0006, segs=1)
    Ml = mat_from(tt_ - D * 0.012 + nax * 0.0078, xax, D, nax)
    mb.add(xform(Vl, Ml), Fl, MI['glow'], w=shoe_weights(xform(Vl, Ml), 'l', 'collar'), sharp_deg=40)
    # ---------------- Schnürung (Schnüre quer + Ösen)
    for k, yv in enumerate(np.linspace(-0.158, -0.078, 6)):
        z = h_top(yv) + 0.0028
        a = np.array([XC - 0.019, yv + 0.004, z - 0.004]); b = np.array([XC + 0.019, yv - 0.004, z - 0.004])
        mid = np.array([XC, yv, z + 0.0012])
        path = catmull([a, mid, b], 4)
        Vl, Fl = tube(path, 0.0024, seg=6, caps=True)
        mb.add(Vl, Fl, MI['lace'], w=shoe_weights(Vl, 'l', 'upper'))
        for sx in (-1, 1):
            c = np.array([XC + sx * 0.0215, yv, z - 0.0045])
            Ve, Fe = prim_torus(0.0032, 0.0011, 10, 5)
            Me = mat_from(c, [1, 0, 0], [0, 1, 0], [0, 0, 1]); mb.add(xform(Ve, Me), Fe, MI['metal'], w=shoe_weights(xform(Ve, Me), 'l', 'upper'))
    # ---------------- Akzente: cyan Fersen-Element, Fersenlasche
    Vg, Fg = prim_box((0.022, 0.004, 0.008), bevel=0.0012, segs=1)
    Mg = mat_from(np.array([XC + 0.052, -0.045, 0.024]), [0, -1, 0], [1, 0, 0], [0, 0, 1])
    mb.add(xform(Vg, Mg), Fg, MI['glow'], w=shoe_weights(xform(Vg, Mg), 'l', 'sole'), sharp_deg=40)
    Vg, Fg = prim_box((0.014, 0.004, 0.006), bevel=0.001, segs=1)
    Mg = mat_from(np.array([XC - 0.049, -0.03, 0.025]), [0, 1, 0], [-1, 0, 0], [0, 0, 1])
    mb.add(xform(Vg, Mg), Fg, MI['glow'], w=shoe_weights(xform(Vg, Mg), 'l', 'sole'), sharp_deg=40)
    Vp, Fp = prim_box((0.022, 0.006, 0.03), bevel=0.002, segs=2)
    Mp = mat_from(np.array([cx, cy + 0.052, 0.128]), [1, 0, 0], [0, 1, 0], [0, 0, 1])
    mb.add(xform(Vp, Mp), Fp, MI['gray'], w=shoe_weights(xform(Vp, Mp), 'l', 'collar'), sharp_deg=50)


def make(core, args):
    import mats, os
    tm = tex_tile(os.path.join(TEXDIR, 'shoe_mesh_n.png'), 'mesh'); tr = tex_tile(os.path.join(TEXDIR, 'shoe_rubber_n.png'), 'rubber')
    im = mats.load_img(tm, 'Non-Color', 'Under_ShoeMesh_n'); im.pack(); ir = mats.load_img(tr, 'Non-Color', 'Under_Rubber_n'); ir.pack()
    ML = [mats.pbr('Under_ShoeWhite', color=(0.80, 0.81, 0.82, 1), rough=0.55, normal=ir, normal_strength=0.25),
          mats.pbr('Under_ShoeMesh', color=(0.72, 0.73, 0.75, 1), rough=0.7, normal=im, normal_strength=0.9),
          mats.pbr('Under_ShoeBlack', color=(0.025, 0.026, 0.03, 1), rough=0.45),
          mats.pbr('Under_ShoeGray', color=(0.30, 0.31, 0.33, 1), rough=0.6),
          mats.pbr('Under_Sole', color=(0.03, 0.03, 0.032, 1), rough=0.9, normal=ir, normal_strength=0.8),
          mats.pbr('Under_ShoeLining', color=(0.06, 0.065, 0.07, 1), rough=0.9),
          mats.pbr('Under_Lace', color=(0.06, 0.06, 0.065, 1), rough=0.8),
          bpy.data.materials.get('Under_Metal') or mats.pbr('Under_Metal', color=(0.62, 0.63, 0.64, 1), metal=0.85, rough=0.32),
          bpy.data.materials.get('Under_Glow') or mats.pbr('Under_Glow', color=(0.2, 0.88, 0.91, 1), emit=(0.2, 0.88, 0.91, 1), emit_strength=3.0)]
    MI = dict(white=0, mesh=1, black=2, gray=3, sole=4, lining=5, lace=6, metal=7, glow=8)
    mb = MB(); build_left(mb, MI)
    # rechter Schuh = Spiegelung
    n_l = len(mb.F); V = np.vstack(mb.V)
    Vr = V * np.array([-1, 1, 1])
    Fr = [tuple(reversed(f)) for f in mb.F]
    Wr = [({k[:-2] + '_r': x for k, x in w.items()} if w else None) for w in mb.W]
    UVr = [np.asarray(u)[::-1] for u in mb.UV]
    mb2 = MB(); mb2.V = [V, Vr]; mb2.nv = 2 * len(V)
    mb2.F = list(mb.F) + [tuple(i + len(V) for i in f) for f in Fr]; mb2.FM = mb.FM * 2; mb2.UV = list(mb.UV) + UVr
    mb2.W = list(mb.W) + Wr; mb2.tag = mb.tag * 2
    mb2.sharp = set(mb.sharp) | {(a + len(V), b + len(V)) for a, b in mb.sharp}
    ob = mb2.build('P_Sneakers', ML)
    Vall = np.vstack(mb2.V)
    return ob, dict(V=Vall, F=mb2.F, nmain=len(mb2.F), closed=True)
