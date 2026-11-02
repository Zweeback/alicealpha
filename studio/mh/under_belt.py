"""P_Belt (Gürtel, Schnalle, Pouches, Ampulle, Beingurte mit Schnallen, Beinmodule mit cyan Fenstern) und P_Pendant.
Bänder werden per Raycast auf die Anzugoberfläche gelegt; Hardware starr (Gewichte des Ankerpunkts)."""
import math
import numpy as np
from under_common import *


def band_rings(bvh, center_fn, dir_fn, n, offsets):
    """offsets: Liste (axial_param, normal_offset). center_fn(param)->Punkt, dir_fn(param, ang)->Strahlrichtung."""
    rings = []
    for par, off in offsets:
        ring = []
        c = center_fn(par)
        for k in range(n):
            ang = 2 * math.pi * k / n
            d = dir_fn(par, ang)
            r = bvh.ray_cast(Vector(c + d * 0.4), Vector(-d))
            if r[0] is None: r = bvh.find_nearest(Vector(c + d * 0.1))
            ring.append(np.array(r[0][:]) + np.array(r[1][:]) * off)
        rings.append(np.array(ring))
    return rings


def surf_frame(bvh, origin, d):
    r = bvh.ray_cast(Vector(origin + d * 0.4), Vector(-d))
    if r[0] is None: r = bvh.find_nearest(Vector(origin + d * 0.1))
    p = np.array(r[0][:]); n = np.array(r[1][:])
    return p, n


def hw_box(mb, mat, center, xax, yax, zax, size, bevel, w, segs=2):
    V, F = prim_box(size, bevel=bevel, segs=segs)
    x = np.asarray(xax) / np.linalg.norm(xax); z = np.asarray(zax); z = z - np.dot(z, x) * x; z /= np.linalg.norm(z); y = np.cross(z, x)
    M = mat_from(center, x, y, z)
    mb.add(xform(V, M), F, mat, w=[w] * len(V), sharp_deg=45)


def hw_cyl(mb, mat, center, axis, r, h, w, seg=16, bevel=0.0):
    V, F = prim_cyl(r, h, seg=seg, bevel=bevel)
    x, y, z = basis_from_dir(axis)
    M = mat_from(center, x, y, z)
    mb.add(xform(V, M), F, mat, w=[w] * len(V), sharp_deg=45)


def buckle(mb, MI, p, n, t, up, w, wdt=0.05, hgt=0.042, bar=0.0055, th=0.004):
    """Rechteckige Metallschnalle (Rahmen aus 4 Bars + Mittelsteg + dunkle Platte)."""
    side = np.cross(up, n); side /= np.linalg.norm(side)
    c = p + n * (th / 2 + 0.006)
    for s in (-1, 1):
        hw_box(mb, MI['metal'], c + up * s * (hgt / 2 - bar / 2), side, n, up, (wdt, th, bar), 0.0012, w)
        hw_box(mb, MI['metal'], c + side * s * (wdt / 2 - bar / 2), side, n, up, (bar, th, hgt), 0.0012, w)
    hw_box(mb, MI['metal'], c + n * 0.0006, side, n, up, (bar * 0.7, th * 1.1, hgt - bar), 0.0008, w)
    hw_box(mb, MI['module'], c - n * 0.001, side, n, up, (wdt - bar, th * 0.6, hgt - bar), 0.0006, w)


def pouch(mb, MI, p, n, up, w, size=(0.05, 0.028, 0.06)):
    side = np.cross(up, n); side /= np.linalg.norm(side)
    c = p + n * (size[1] / 2 + 0.006)
    hw_box(mb, MI['pouch'], c, side, n, up, size, 0.006, w, segs=3)
    # Klappe
    hw_box(mb, MI['pouch'], c + up * (size[2] * 0.30) + n * (size[1] / 2 + 0.0015), side, n, up, (size[0] * 1.02, 0.004, size[2] * 0.46), 0.0018, w)
    hw_cyl(mb, MI['metal'], c + up * (size[2] * 0.16) + n * (size[1] / 2 + 0.0042), n, 0.0035, 0.003, w, seg=12)
    # Steppnähte-Akzent: schmaler Gurt über die Tasche
    hw_box(mb, MI['webbing'], c + n * (size[1] / 2 + 0.0008), side, n, up, (0.012, 0.002, size[2] * 1.02), 0.0006, w)


def vial(mb, MI, p, n, up, w, L=0.085, r=0.0105):
    c = p + n * (r + 0.009)
    hw_cyl(mb, MI['glass'], c, up, r * 0.86, L * 0.78, w, seg=16)
    hw_cyl(mb, MI['glow'], c, up, r * 0.62, L * 0.70, w, seg=12)
    for s in (-1, 1):
        hw_cyl(mb, MI['metal'], c + up * s * L * 0.42, up, r, L * 0.12, w, seg=16, bevel=0.0015)
        hw_cyl(mb, MI['module'], c + up * s * L * 0.50, up, r * 0.6, L * 0.05, w, seg=12)
    # Halteclips
    side = np.cross(up, n); side /= np.linalg.norm(side)
    for s in (-0.22, 0.22):
        hw_box(mb, MI['webbing'], c + up * L * s - n * (r * 0.4), side, n, up, (r * 2.3, r * 1.2, 0.012), 0.002, w)


def leg_module(mb, MI, p, n, axis, w, L=0.12, r=0.017):
    side = np.cross(axis, n); side /= np.linalg.norm(side)
    hw_box(mb, MI['module'], p + n * 0.007, side, n, axis, (0.036, 0.008, L * 0.8), 0.0025, w)        # Montageplatte
    c = p + n * (0.011 + r)
    hw_cyl(mb, MI['module'], c, axis, r, L * 0.82, w, seg=18)
    for s in (-1, 1):
        hw_cyl(mb, MI['metal'], c + axis * s * L * 0.45, axis, r * 1.08, L * 0.1, w, seg=18, bevel=0.002)
        hw_cyl(mb, MI['metal'], c + axis * s * L * 0.30, axis, r * 1.03, 0.004, w, seg=18)
    hw_box(mb, MI['glow'], c + n * (r - 0.0012), side, n, axis, (0.009, 0.004, L * 0.42), 0.0012, w, segs=1)  # Fenster
    hw_box(mb, MI['metal'], c + n * (r + 0.0003) + axis * L * 0.24, side, n, axis, (0.012, 0.003, 0.006), 0.001, w, segs=1)


def box_module(mb, MI, p, n, axis, w):
    side = np.cross(axis, n); side /= np.linalg.norm(side)
    c = p + n * 0.016
    hw_box(mb, MI['module'], c, side, n, axis, (0.046, 0.022, 0.072), 0.004, w, segs=2)
    hw_cyl(mb, MI['glow'], c + n * 0.0112 + axis * 0.012, n, 0.009, 0.002, w, seg=16)
    hw_cyl(mb, MI['metal'], c + n * 0.0108 + axis * 0.012, n, 0.0115, 0.0016, w, seg=20)
    hw_box(mb, MI['glow'], c + n * 0.0112 - axis * 0.02, side, n, axis, (0.026, 0.0015, 0.004), 0.0006, w, segs=1)
    hw_box(mb, MI['metal'], c + axis * 0.04, side, n, axis, (0.02, 0.012, 0.008), 0.002, w)


def make(core, args, suit):
    import mats
    bvh = bvh_of(suit['V'], suit['F'][:suit['nmain']])
    ML = [mats.pbr('Under_Webbing', color=(0.022, 0.023, 0.026, 1), rough=0.82, normal=mats.load_img(tex_tile(os.path.join(TEXDIR, 'webbing_n.png'), 'webbing'), 'Non-Color', 'Under_Webbing_n'), normal_strength=0.6),
          bpy.data.materials.get('Under_Metal') or mats.pbr('Under_Metal', color=(0.62, 0.63, 0.64, 1), metal=0.85, rough=0.32),
          bpy.data.materials.get('Under_Glow') or mats.pbr('Under_Glow', color=(0.2, 0.88, 0.91, 1), emit=(0.2, 0.88, 0.91, 1), emit_strength=3.0),
          bpy.data.materials.get('Under_Module') or mats.pbr('Under_Module', color=(0.07, 0.075, 0.082, 1), metal=0.5, rough=0.38),
          mats.pbr('Under_Pouch', color=(0.03, 0.031, 0.034, 1), rough=0.75),
          mats.pbr('Under_Glass', color=(0.55, 0.85, 0.9, 1), rough=0.08, spec=0.6)]
    bpy.data.images['Under_Webbing_n'].pack()
    MI = dict(webbing=0, metal=1, glow=2, module=3, pouch=4, glass=5)
    mb = MB()
    # ---------------- Taillengürtel
    zc, half = 0.984, 0.019
    cfn = lambda par: np.array([0, -0.045, par])
    dfn = lambda par, ang: np.array([math.sin(ang), -math.cos(ang), 0.0])
    rings = band_rings(bvh, cfn, dfn, 72, [(zc - half, 0.0012), (zc - half + 0.002, 0.0045), (zc + half - 0.002, 0.0045), (zc + half, 0.0012)])
    V, F = loft(rings, True); F = orient_all(V, F, (0, -0.045, zc))
    mb.add(V, F, MI['webbing'], w=transfer_weights(core, V), uvscale=20)
    def anchor(ang, z, off=0.0):
        d = dfn(z, ang); p, n = surf_frame(bvh, cfn(z), d); return p + n * off, n
    p, n = anchor(0.0, zc, 0.0045); wb = transfer_weights(core, [p])[0]
    buckle(mb, MI, p, n, None, np.array([0, 0, 1.0]), wb, wdt=0.062, hgt=0.046, bar=0.006)
    # Gürtelschlaufen / Pouches / Ampulle
    for ang in (0.95, -0.95, 2.55):
        p, n = anchor(ang, zc - 0.018, 0.004); w = transfer_weights(core, [p])[0]
        pouch(mb, MI, p, n, np.array([0, 0, 1.0]), w, size=(0.048, 0.026, 0.058) if abs(ang) < 2 else (0.07, 0.03, 0.05))
    p, n = anchor(1.45, zc - 0.05, 0.004); w = transfer_weights(core, [p])[0]
    vial(mb, MI, p, n, np.array([0, 0, 1.0]), w)
    p, n = anchor(-1.40, zc - 0.035, 0.004); w = transfer_weights(core, [p])[0]
    box_module(mb, MI, p, n, np.array([0, 0, 1.0]), w)
    # ---------------- Beingurte + Module
    for s, sg in (('l', 1), ('r', -1)):
        th, tt = core.bone[f'thigh_{s}']; L = np.linalg.norm(tt - th); D = (tt - th) / L
        X = np.array([0, -1.0, 0]); X = X - np.dot(X, D) * D; X /= np.linalg.norm(X); Y = np.cross(D, X)
        if Y[0] * sg < 0: Y = -Y
        cfn2 = lambda par, th=th, D=D, L=L: th + D * par * L
        dfn2 = lambda par, ang, X=X, Y=Y: math.cos(ang) * X + math.sin(ang) * Y
        for par, wd in ((0.40, 0.030), (0.62, 0.024)):
            hl = wd / 2 / L
            rings = band_rings(bvh, cfn2, dfn2, 48, [(par - hl, 0.0012), (par - hl + 0.002 / L, 0.0042), (par + hl - 0.002 / L, 0.0042), (par + hl, 0.0012)])
            V, F = loft(rings, True); F = orient_all(V, F, cfn2(par))
            mb.add(V, F, MI['webbing'], w=transfer_weights(core, V), uvscale=20)
            p, n = surf_frame(bvh, cfn2(par), dfn2(par, 0.55)); p = p + n * 0.0042
            w = transfer_weights(core, [p])[0]
            buckle(mb, MI, p, n, None, -D, w, wdt=0.026, hgt=wd + 0.008, bar=0.004, th=0.0035)
        # vertikaler Gurt vom Gürtel zum oberen Beingurt (außen)
        pts = []
        for par in np.linspace(-0.12, 0.38, 9):
            c = th + D * par * L
            pts.append(surf_frame(bvh, c, dfn2(par, 1.35)))
        pa = [p for p, n in pts]; na = [n for p, n in pts]
        side = [np.cross(D, nn) for nn in na]
        Vs = []; 
        for p, nn, sd in zip(pa, na, side):
            sd = sd / np.linalg.norm(sd)
            for o in (-0.011, 0.011): Vs.append(p + nn * 0.0035 + sd * o)
        Vs = np.array(Vs); Fs = [(2 * i, 2 * i + 2, 2 * i + 3, 2 * i + 1) for i in range(len(pa) - 1)]
        Fs = orient_all(Vs, Fs, th + D * 0.1 * L)
        mb.add(Vs, Fs, MI['webbing'], w=transfer_weights(core, Vs), uvscale=20)
        # Modul an der Außenseite zwischen den Gurten
        par = 0.51; p, n = surf_frame(bvh, cfn2(par), dfn2(par, 1.45)); w = transfer_weights(core, [p])[0]
        w = {k: v for k, v in w.items()}
        if s == 'l': leg_module(mb, MI, p, n, -D, w)
        else: box_module(mb, MI, p, n, -D, w)
    ob = mb.build('P_Belt', ML)
    return ob


def make_pendant(core, args, suit):
    import mats
    bvh = bvh_of(suit['V'], suit['F'][:suit['nmain']])
    mm = bpy.data.materials.get('Under_Metal'); mg = bpy.data.materials.get('Under_Glow'); md = bpy.data.materials.get('Under_Module')
    mc = mats.pbr('Under_Chain', color=(0.35, 0.36, 0.38, 1), metal=0.8, rough=0.35)
    mb = MB()
    # Medaillon am Brustbein
    pc, nc = surf_frame(bvh, np.array([0, -0.05, 1.300]), np.array([0, -1.0, 0]))
    up = np.array([0, 0, 1.0]); up = up - np.dot(up, nc) * nc; up /= np.linalg.norm(up)
    w = {'spine_03': 1.0}
    c = pc + nc * 0.0062
    x = np.cross(up, nc)
    M = mat_from(c, x, up, nc)
    Vt, Ft = prim_torus(0.0118, 0.0026, 28, 8); mb.add(xform(Vt, M), Ft, 0, w=[w] * len(Vt))
    Vd, Fd = prim_cyl(0.0098, 0.0034, seg=24); mb.add(xform(Vd, M), Fd, 1, w=[w] * len(Vd), sharp_deg=40)
    Vt, Ft = prim_torus(0.0062, 0.0007, 24, 5); M2 = mat_from(c + nc * 0.0018, x, up, nc); mb.add(xform(Vt, M2), Ft, 2, w=[w] * len(Vt))
    Vb, Fb = prim_cyl(0.0032, 0.0012, seg=12); M3 = mat_from(c + nc * 0.0021, x, up, nc); mb.add(xform(Vb, M3), Fb, 2, w=[w] * len(Vb), sharp_deg=40)
    Vt, Ft = prim_torus(0.0028, 0.0009, 12, 5); M4 = mat_from(c + up * 0.0155, nc, up, x); mb.add(xform(Vt, M4), Ft, 0, w=[w] * len(Vt))
    # Kette: hinten um den Kragenansatz, vorn hinab zum Medaillon
    nh, nt = core.bone['neck_01']
    pts = []
    for ang in np.radians([-80, -100, -130, -160, 180, 160, 130, 100, 80]):
        z = 1.378 + 0.012 * abs(math.cos(ang))
        o = np.array([0, -0.02, z]); d = np.array([math.sin(ang), -math.cos(ang), 0.0])
        p, n = surf_frame(bvh, o, d); pts.append(p + n * 0.0024)
    pts = pts[::-1]
    def front(xv, z):
        p, n = surf_frame(bvh, np.array([xv, -0.04, z]), np.array([0, -1.0, 0])); return p + n * 0.0026
    L_ = [front(-0.034, 1.355), front(-0.018, 1.33), c + up * 0.018 - x * 0.002]
    R_ = [c + up * 0.018 + x * 0.002, front(0.018, 1.33), front(0.034, 1.355)]
    path = catmull(np.array(L_[::-1][::-1] + [] if False else R_ + pts + L_), 5)
    Vc, Fc = tube(path, 0.0011, seg=6, caps=True)
    mb.add(Vc, Fc, 3, w=transfer_weights(core, Vc))
    ob = mb.build('P_Pendant', [mm, mg, md, mc])
    return ob
