"""Prozedural gebackene Texturen der Unterlage (Anzug: Albedo + Normalmap; weitere Materialien siehe unten)."""
import os, math
import numpy as np
from scipy import ndimage as ndi
from under_common import *
from under_bake import *

REG = ['torso', 'neck', 'ua_l', 'la_l', 'ua_r', 'la_r', 'th_l', 'ca_l', 'th_r', 'ca_r']
REG_BONES = {
    'torso': ['pelvis', 'spine_01', 'spine_02', 'spine_03', 'clavicle_l', 'clavicle_r'],
    'neck': ['neck_01', 'head'],
    'ua_l': ['upperarm_l'], 'la_l': ['lowerarm_l'], 'ua_r': ['upperarm_r'], 'la_r': ['lowerarm_r'],
    'th_l': ['thigh_l'], 'ca_l': ['calf_l'], 'th_r': ['thigh_r'], 'ca_r': ['calf_r'],
}


def region_weights(core, src):
    """(n,10) Summe der Bone-Gewichte pro Region für Körper-Vertices src; Hand/Fuß-Bones zählen zu Unterarm/Unterschenkel."""
    names = core.names; W = core.W[src]
    out = np.zeros((len(src), len(REG)), np.float32)
    for j, r in enumerate(REG):
        for i, nme in enumerate(names):
            fam = None
            if nme in REG_BONES[r]: fam = True
            elif r == 'la_l' and nme.endswith('_l') and nme.startswith(('hand', 'thumb', 'index', 'middle', 'ring', 'pinky')): fam = True
            elif r == 'la_r' and nme.endswith('_r') and nme.startswith(('hand', 'thumb', 'index', 'middle', 'ring', 'pinky')): fam = True
            elif r == 'ca_l' and nme in ('foot_l', 'ball_l'): fam = True
            elif r == 'ca_r' and nme in ('foot_r', 'ball_r'): fam = True
            if fam: out[:, j] += W[:, i]
    return out


def region_frames(core):
    """Pro Region: Ursprung O, Achse D, X (Referenz vorn), Y (Richtung a>0), Länge L, R_ref. Rechte Seite wird gespiegelt ausgewertet."""
    fr = {}
    front = np.array([0, -1.0, 0])
    def mk(O, D, L, R, Yhint=None, mirror=False):
        D = np.asarray(D) / np.linalg.norm(D)
        X = front - np.dot(front, D) * D; X /= np.linalg.norm(X)
        Y = np.cross(X, D)
        # Y soll nach +x (Charakter-links) zeigen
        if Y[0] < 0: Y = -Y
        return dict(O=np.asarray(O), D=D, X=X, Y=Y, L=L, R=R, mirror=mirror)
    # Torso: Achse z durch (0,-0.045)
    fr['torso'] = mk([0, -0.045, 0.0], [0, 0, 1], 1.4, 0.13)
    nh, nt = core.bone['neck_01']; fr['neck'] = mk(nh, nt - nh, np.linalg.norm(nt - nh), 0.045)
    for s in ('l', 'r'):
        m = (s == 'r')
        def L_(b): return core.bone[b + '_l']
        uh, ut = L_('upperarm'); lh, lt = L_('lowerarm')
        fr['ua_' + s] = mk(uh, ut - uh, np.linalg.norm(ut - uh), 0.042, mirror=m)
        fr['la_' + s] = mk(lh, lt - lh, np.linalg.norm(lt - lh), 0.032, mirror=m)
        th, tt = L_('thigh'); ch, ct = L_('calf')
        fr['th_' + s] = mk(th, tt - th, np.linalg.norm(tt - th), 0.075, mirror=m)
        fr['ca_' + s] = mk(ch, ct - ch, np.linalg.norm(ct - ch), 0.055, mirror=m)
    return fr


def coords(fr, rid, pos):
    """Pro Texel (a, s, r, u, v) im Region-Koordinatensystem; rid (n,) Index in REG; pos (n,3)."""
    n = len(pos)
    a = np.zeros(n); s = np.zeros(n); r = np.zeros(n)
    for j, name in enumerate(REG):
        m = rid == j
        if not m.any(): continue
        f = fr[name]; p = pos[m].copy()
        if f['mirror']: p[:, 0] = -p[:, 0]
        q = p - f['O']
        ss = q @ f['D']; rad = q - np.outer(ss, f['D'])
        cx = rad @ f['X']; cy = rad @ f['Y']
        a[m] = np.arctan2(cy, cx); s[m] = ss; r[m] = np.hypot(cx, cy)
    return a, s, r


def gauss(d, sig):
    return np.exp(-(d / sig) ** 2)


def stripe(d, w, soft=0.0004):
    """1 innerhalb |d|<w/2 (weiche Kante)."""
    return 1 - smoothstep(w / 2 - soft, w / 2 + soft, np.abs(d))


def bake_suit(core, S, res=2048, out_prefix=None):
    """Berechnet Albedo + Normalmap des Anzugs. S: Ergebnis von under_suit.build (+ finale Positionen in S['P'], Faces S['F'], uv S['uv'])."""
    P = S['P']; F = S['F']; uv = S['uv']
    vn = vnormals(P, F)
    rw = region_weights(core, S['src'])
    log('Bake: Raster', res)
    M = rasterize(P, F, uv, vn, rw, res=res)
    mask = M['mask']
    iy, ix = np.nonzero(mask)
    pos = M['pos'][iy, ix].astype(np.float64)
    att = M['attr'][iy, ix]
    rid = att.argmax(1)
    a, s, r = coords(region_frames(core), rid, pos)
    mpp = M['mpp'][iy, ix].astype(np.float64)
    x, y, z = pos[:, 0], pos[:, 1], pos[:, 2]
    ax = np.abs(x)
    isT = rid == 0; isN = rid == 1
    isUA = (rid == 2) | (rid == 4); isLA = (rid == 3) | (rid == 5)
    isTH = (rid == 6) | (rid == 8); isCA = (rid == 7) | (rid == 9)
    # ---- Koordinaten für Mikromuster (Meter)
    Rref = np.array([0.13, 0.045, 0.042, 0.032, 0.042, 0.032, 0.075, 0.055, 0.075, 0.055])[rid]
    u = a * Rref; v = s
    # a für Torso: Winkel von vorn, symmetrisch zu |a|
    aa = np.abs(a)
    arcR = r  # lokaler Radius für Bogenlängen
    seams = np.full(len(pos), 1.0)  # Distanz zur nächsten Naht (Meter)
    def addseam(d, mask_=None):
        nonlocal seams
        d = np.abs(d)
        if mask_ is not None: d = np.where(mask_, d, 1.0)
        seams = np.minimum(seams, d)
    # --- Torso-Nähte
    tz = isT
    addseam(a * arcR, tz & (z > 0.84))                                   # Mitte vorn
    addseam(wrap_pi(a - math.pi) * arcR, tz)                             # Mitte hinten
    for sg in (1, -1):
        addseam((a - sg * 1.5708) * arcR, tz & (z > 0.86) & (z < 1.33))  # Seitennaht
        a0 = 0.34 + 0.55 * smoothstep(1.08, 1.34, z)
        addseam((a - sg * a0) * arcR, tz & (z > 1.06) & (z < 1.36))      # Princess-Nähte
        a1 = 2.45 - 0.35 * smoothstep(1.05, 1.30, z)
        addseam((a - sg * a1) * arcR, tz & (z > 1.0) & (z < 1.34))       # Rückenpaneele
    ub = 1.135 - 0.035 * np.sin(np.clip(aa, 0, 1.57)) ** 2
    addseam(z - ub, tz & (aa < 2.0))                                      # unter Brust
    addseam(z - 1.075, tz)                                                # Taille
    addseam(z - 0.905 + 0.02 * np.sin(aa) ** 2, tz & (aa < 2.4))         # Hüfte
    # --- Arm-Nähte
    addseam(wrap_pi(a + 1.5708) * r, isUA | isLA)                         # Innennaht
    addseam(wrap_pi(a - 3.14159) * r, isUA | isLA)                        # Rücken (Phasenversatz verstecken)
    LA = region_frames(core)['la_l']['L']
    addseam(s - LA * 0.74, isLA)                                          # Bündchen-Beginn
    addseam(s - LA * 0.60, isLA)
    addseam(s - 0.02, isUA)
    # --- Bein-Nähte
    addseam(wrap_pi(a - 1.5708) * r, isTH | isCA)                         # Außennaht
    addseam(wrap_pi(a + 1.5708) * r, isTH | isCA)                         # Innennaht
    addseam(wrap_pi(a - 3.14159) * r, isTH | isCA)                        # hinten
    LT = region_frames(core)['th_l']['L']; LC = region_frames(core)['ca_l']['L']
    addseam(s - (LT - 0.075), isTH); addseam(s - 0.075, isCA)             # Knie-Band
    addseam(s - (LC - 0.075), isCA)                                       # Knöchel-Band
    addseam(s - 0.17, isTH)
    # --- Regionsgrenzen (Armloch, Hüft-, Hals-Naht, Ellbogen/Knie)
    rimg = np.full(mask.shape, -1, np.int16); rimg[iy, ix] = rid
    bd = np.zeros(mask.shape, bool)
    for dy, dx in ((0, 1), (1, 0)):
        d1 = (rimg != np.roll(rimg, -dx, axis=1) if dx else rimg != np.roll(rimg, -dy, axis=0)) & (rimg >= 0)
        bd |= d1
    # nur Grenzen zwischen gültigen Pixeln der Insel (nicht Rand der Maske)
    valid_n = M['valid']
    bd &= valid_n
    dpx = ndi.distance_transform_edt(~bd)
    dreg = dpx[iy, ix] * mpp
    seams = np.minimum(seams, dreg)
    # ---------------------------------------------------------------- Höhe (Meter)
    mm = 0.001
    H = np.zeros(len(pos))
    # Waffel-Mikromuster, gedreht 45°
    pit = 0.0026
    p1 = (u + v) / math.sqrt(2); p2 = (u - v) / math.sqrt(2)
    waffle = 0.5 * (np.cos(2 * math.pi * p1 / pit) + np.cos(2 * math.pi * p2 / pit))      # -1..1
    micro = (0.5 + 0.5 * waffle)
    H += 0.11 * mm * micro
    # Körnung (3D Rauschen)
    grain = vnoise3(pos, 700.0, 3) - 0.5
    H += 0.05 * mm * grain
    # Rippen: Kragen (vertikal), Bündchen (Ring), Knöchelband
    collar = isN
    ribs_v = 0.5 + 0.5 * np.cos(2 * math.pi * (a * 0.045) / 0.0032)
    H += np.where(collar, 0.32 * mm * ribs_v - 0.11 * mm * micro, 0.0)
    cuffm = isLA & (s > LA * 0.80)
    ribs_h = 0.5 + 0.5 * np.cos(2 * math.pi * (s) / 0.0030)
    H += np.where(cuffm, 0.34 * mm * ribs_h - 0.11 * mm * micro, 0.0)
    ankm = isCA & (s > LC - 0.075)
    H += np.where(ankm, 0.28 * mm * ribs_h - 0.11 * mm * micro, 0.0)
    # Nahtrillen + Doppelstich
    groove = gauss(seams, 0.00085)
    H -= 0.42 * mm * groove
    st = np.exp(-((seams - 0.0028) / 0.00045) ** 2)
    H += 0.10 * mm * st
    # Reißverschluss vorn (Torso, a ~ 0)
    zip_m = isT & (z > 1.02) & (z < 1.445) & (np.abs(a * arcR) < 0.0017)
    teeth = (np.cos(2 * math.pi * z / 0.0026) > 0)
    H += np.where(zip_m, 0.22 * mm * teeth, 0.0)
    # Kragen-Ringnaht
    H += 0.0
    # ---------------------------------------------------------------- Albedo
    base = srgb8(38, 40, 45)
    # großflächige Variation
    lf = fbm3(pos, 9.0, 3, 5) - 0.5
    col = np.tile(base, (len(pos), 1))
    col *= (1.0 + 0.14 * lf)[:, None]
    # Paneele minimal heller (Torsoseiten, Oberschenkel außen)
    panel = (isT & (aa > 1.0) & (aa < 2.1) & (z > 0.9)) | ((isTH | isCA) & (np.abs(a - 1.5708) < 0.55))
    col *= np.where(panel, 1.12, 1.0)[:, None]
    # Mikro: Täler dunkler
    col *= (0.88 + 0.12 * micro)[:, None]
    # Nähte dunkler, Stiche heller
    col *= (1 - 0.45 * groove)[:, None]
    col = col + srgb8(26, 28, 34) * (0.9 * st)[:, None]
    # Rippenzonen etwas anders
    col *= np.where(collar | cuffm | ankm, 0.92, 1.0)[:, None]
    col = np.where(zip_m[:, None], srgb8(70, 74, 82)[None, :] * (0.55 + 0.45 * teeth)[:, None], col)
    # ---------------------------------------------------------------- Ausgabe
    Himg = np.zeros((res, res), np.float32); Himg[iy, ix] = H
    Nimg = height_to_normal(Himg, M, strength=1.0)
    Nimg[~mask] = (0, 0, 1)
    A = np.zeros((res, res, 3), np.float32); A[...] = base
    A[iy, ix] = col
    out = {}
    if out_prefix:
        out['normal'] = save_normal(Nimg, out_prefix + '_n.png')
        out['albedo'] = out_prefix + '_a.png'
        save_srgb(A, out['albedo'])
    return out, dict(seams=seams, rid=rid, pos=pos, iy=iy, ix=ix, M=M)
