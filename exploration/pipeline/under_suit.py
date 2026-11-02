"""P_Suit: schwarzer Tech-Overall (Rollkragen, lange Ärmel mit Bündchen, Hose bis Knöchel) als Offset-Schale des Körpers."""
import numpy as np
from under_common import *

# Offsets (Meter)
D_BASE = 0.0032       # Haut -> Anzug
D_COLLAR = 0.0058     # Kragen oben
D_CUFF = 0.0046       # Bündchen
D_ANKLE = 0.0042
MIN_CLEAR = 0.0022
HEM_DEPTH = 0.0011    # Dicke der Saum-Lippe


def unit(v):
    v = np.asarray(v, dtype=float); return v / np.linalg.norm(v)


def cut_planes(core):
    """Schnittebenen (Punkt, Normale nach außen = Richtung weg vom Anzug) für Kragen, Handgelenke, Knöchel."""
    pl = {}
    nh, nt = core.bone['neck_01']
    pl['neck'] = (nh + 0.48 * (nt - nh), unit(nt - nh))
    for s in ('l', 'r'):
        h, t = core.bone[f'lowerarm_{s}']
        pl[f'wrist_{s}'] = (h + 0.935 * (t - h), unit(t - h))
        h, t = core.bone[f'calf_{s}']
        pl[f'ankle_{s}'] = (h + 0.925 * (t - h), unit(t - h))
    return pl


def family(name):
    if name in ('head', 'eye_l', 'eye_r'): return 'head'
    if name == 'neck_01': return 'neck'
    if name.startswith(('spine', 'pelvis', 'clavicle')): return 'torso'
    if name.startswith(('upperarm', 'lowerarm')): return 'arm'
    if name.startswith(('hand', 'thumb', 'index', 'middle', 'ring', 'pinky')): return 'hand'
    if name.startswith(('thigh', 'calf')): return 'leg'
    if name.startswith(('foot', 'ball')): return 'foot'
    return 'torso'


def region(core):
    """Vertex-/Face-Auswahl des Anzugs auf dem Körper + Signed-Distanzen zu den Schnittebenen."""
    co = core.co; n = len(co); pl = cut_planes(core)
    fam = np.array([family(d) for d in core.dom])
    side = np.array(['l' if d.endswith('_l') else ('r' if d.endswith('_r') else ('l' if co[i, 0] >= 0 else 'r')) for i, d in enumerate(core.dom)])
    s_neck = (co - pl['neck'][0]) @ pl['neck'][1]
    s_wr = np.where(side == 'l', (co - pl['wrist_l'][0]) @ pl['wrist_l'][1], (co - pl['wrist_r'][0]) @ pl['wrist_r'][1])
    s_an = np.where(side == 'l', (co - pl['ankle_l'][0]) @ pl['ankle_l'][1], (co - pl['ankle_r'][0]) @ pl['ankle_r'][1])
    inc = np.zeros(n, dtype=bool)
    m = np.isin(fam, ['torso', 'neck', 'head']) & (co[:, 2] < 1.47)
    inc |= m & (s_neck < 0)
    inc |= np.isin(fam, ['arm', 'hand']) & (s_wr < 0)
    inc |= np.isin(fam, ['leg', 'foot']) & (s_an < 0)
    # Kopf-Verts (Kiefer/Hals-Übergang): nur wenn deutlich unter Ebene und unten
    keep_faces = [f for f in core.faces if all(inc[i] for i in f)]
    return dict(inc=inc, faces=keep_faces, fam=fam, side=side, s_neck=s_neck, s_wr=s_wr, s_an=s_an, planes=pl)


def boundary_verts(F, nv):
    ec = {}
    for f in F:
        k = len(f)
        for i in range(k):
            a, b = f[i], f[(i + 1) % k]
            ec.setdefault((min(a, b), max(a, b)), []).append((a, b))
    bnd = {k: v[0] for k, v in ec.items() if len(v) == 1}
    return bnd  # {(min,max): (a,b) directed as in face}


def build(core, verbose=True):
    """Gibt dict mit V (n,3), F, loop-UV, Gewichte, Metafelder (region ids) zurück. Index-Mapping zu Körper-Verts: 'src'."""
    R = region(core)
    used = sorted({i for f in R['faces'] for i in f})
    remap = {v: k for k, v in enumerate(used)}
    src = np.array(used)
    F = [tuple(remap[i] for i in f) for f in R['faces']]
    P0 = core.co[src].copy()
    nv = len(P0)
    log('Anzug-Region: verts', nv, 'faces', len(F))
    # UV (pro Loop) aus dem Körper: Face-Reihenfolge -> Loop-Indizes
    me = core.body.data
    loop_uv = []
    pidx = {tuple(p.vertices): p for p in me.polygons}
    for f in R['faces']:
        p = pidx[tuple(f)]
        for l in p.loop_indices: loop_uv.append(core.uv[l])
    loop_uv = np.array(loop_uv)

    fam = R['fam'][src]; side = R['side'][src]
    s_neck = R['s_neck'][src]
    # ---------------- Offset-Feld
    d = np.full(nv, D_BASE)
    # Kragen: Abstand zur Kragenkante (s_neck in [-0.07,0]) -> Offset steigt Richtung Oberkante
    neck_zone = (np.abs(P0[:, 0]) < 0.075) & (P0[:, 2] > 1.33)
    t = smoothstep(-0.060, -0.004, s_neck)
    d = np.where(neck_zone, D_BASE + (D_COLLAR - D_BASE) * t, d)
    # Bündchen
    for s in ('l', 'r'):
        sw = R['s_wr'][src]
        mk = (side == s) & np.isin(fam, ['arm', 'hand'])
        t = smoothstep(-0.050, -0.012, sw)
        d = np.where(mk, D_BASE + (D_CUFF - D_BASE) * t, d)
        sa = R['s_an'][src]
        mk = (side == s) & np.isin(fam, ['leg', 'foot'])
        t = smoothstep(-0.14, -0.03, sa)
        d = np.where(mk, D_BASE + (D_ANKLE - D_BASE) * t, d)
    idx, cnt = adj_arrays(nv, F)
    # ---------------- Normalen glätten (Körpernormalen, vollständiges Mesh)
    N = core.nrm[src].copy()
    N = smooth_field_fast(N, idx, cnt, iters=3, lam=0.5)
    N /= np.linalg.norm(N, axis=1, keepdims=True)
    P = P0 + N * d[:, None]
    # ---------------- Grenzen sauber auf Ebene ziehen (Kragen, Bündchen, Knöchel)
    bnd = boundary_verts(F, nv)
    bset = sorted({v for k in bnd for v in k})
    pl = R['planes']
    delta = np.zeros((nv, 3)); isb = np.zeros(nv, dtype=bool)
    for v in bset:
        if fam[v] in ('torso', 'neck', 'head') or P0[v, 2] > 1.3:
            c, nrm_ = pl['neck']
        elif fam[v] in ('arm', 'hand'):
            c, nrm_ = pl['wrist_' + side[v]]
        else:
            c, nrm_ = pl['ankle_' + side[v]]
        s = (P[v] - c) @ nrm_
        delta[v] = -s * nrm_; isb[v] = True
    # Verschiebung nach innen ausbreiten (3 Ringe, Abfall 0.55)
    dd = delta.copy(); has = isb.copy()
    valid = idx >= 0; safe = np.where(valid, idx, 0)
    for it in range(3):
        nbw = has[safe] & valid
        num = (dd[safe] * nbw[..., None]).sum(1); den = nbw.sum(1)
        new = (~has) & (den > 0)
        dd[new] = num[new] / den[new][:, None] * 0.55
        has = has | new
    P = P + dd
    # ---------------- Sonderzonen glätten (Brustwarzen, Schritt) und Abstand erzwingen
    mask = np.zeros(nv, dtype=bool)
    for nip in NIPPLES:
        mask |= np.linalg.norm(P0 - nip, axis=1) < 0.032
    cr = (np.abs(P0[:, 0]) < 0.05) & (P0[:, 2] > 0.70) & (P0[:, 2] < 0.86) & (P0[:, 1] < 0.045)
    mask |= cr
    Ps = P.copy()
    for k in range(10):
        Ps = smooth_field_fast(Ps, idx, cnt, iters=2, lam=0.6, mask=mask)
    # weich ausblenden: außerhalb der Maske unverändert; innerhalb voll
    P = np.where(mask[:, None], Ps, P)
    P = enforce_clear(core, P, MIN_CLEAR, iters=8)
    P = smooth_hold(core, P, idx, cnt, mask_none=True)
    return dict(R=R, src=src, F=F, P=P, P0=P0, N=N, d=d, uv=loop_uv, fam=fam, side=side, idx=idx, cnt=cnt, bnd=bnd, bset=bset, mask=mask)


NIPPLES = [np.array([0.10464, -0.16520, 1.17468]), np.array([-0.10464, -0.16520, 1.17468])]


def enforce_clear(core, P, dmin, iters=6):
    """Punkte, die weniger als dmin über der Körperoberfläche liegen (oder innen), entlang der Flächennormale herausschieben."""
    P = P.copy()
    for it in range(iters):
        loc, nr, fi, ds = nearest_info(core.bvh, P)
        sg = np.einsum('ij,ij->i', P - loc, nr)
        signed = np.where(sg >= 0, ds, -ds)
        need = dmin - signed
        m = need > 1e-5
        if not m.any(): break
        P[m] += nr[m] * need[m][:, None]
    return P


def smooth_hold(core, P, idx, cnt, mask_none=True):
    return P


def lip_depth(S, v):
    """Dicke der Saumlippe pro Boundary-Vertex."""
    z = S['P'][v, 2]
    if S['fam'][v] in ('torso', 'neck', 'head') and z > 1.3: return 0.0024      # Kragen: gerollter Rand
    if S['fam'][v] in ('arm', 'hand'): return 0.0020                             # Bündchen
    return 0.0016


def finish(core, S):
    """Fügt Saumlippen an allen offenen Rändern hinzu. Rückgabe: V (n,3), F, loop_uv (nloops,2), W (Liste dicts), ntag (Bool 'Lippe' pro Face)."""
    P = S['P']; F = S['F']; uv = S['uv']
    nv = len(P)
    N = vnormals(P, F)
    # gerichtete Randkanten mit Loop-Indizes
    bedges = []
    li = 0
    ec = {}
    for fi, f in enumerate(F):
        k = len(f)
        for i in range(k):
            a, b = f[i], f[(i + 1) % k]
            ec.setdefault((min(a, b), max(a, b)), []).append((a, b, li + i, li + (i + 1) % k))
        li += k
    for key, lst in ec.items():
        if len(lst) == 1: bedges.append(lst[0])
    lipv = {}
    V = [p for p in P]
    W = [dict(limit_weights({core.names[j]: float(core.W[S['src'][i], j]) for j in np.nonzero(core.W[S['src'][i]])[0]})) for i in range(nv)]
    for a, b, la, lb in bedges:
        for v in (a, b):
            if v not in lipv:
                d = lip_depth(S, v)
                lipv[v] = len(V)
                V.append(P[v] - N[v] * d)
                W.append(W[v])
    Fn = list(F); UVn = list(uv); lipflag = [False] * len(F)
    for a, b, la, lb in bedges:
        Fn.append((a, lipv[a], lipv[b], b)); lipflag.append(True)
        UVn.extend([uv[la], uv[la], uv[lb], uv[lb]])
    return np.array(V), Fn, np.array(UVn), W, np.array(lipflag)


def make(core, args):
    """Baut P_Suit-Objekt (Geometrie, Texturen, Material). Gibt (obj, garment_dict) zurück."""
    import mats, under_tex
    S = build(core)
    V, F, uv, W, lipflag = finish(core, S)
    nmain = len(S['F'])
    res = args.res
    pa = os.path.join(TEXDIR, 'suit_a.png'); pn = os.path.join(TEXDIR, 'suit_n.png')
    if not args.no_bake or not (os.path.exists(pa) and os.path.exists(pn)):
        under_tex.bake_suit(core, S, res=res, out_prefix=os.path.join(TEXDIR, 'suit'))
    ia = mats.load_img(pa, 'sRGB', 'Under_Suit_albedo'); in_ = mats.load_img(pn, 'Non-Color', 'Under_Suit_normal')
    ia.pack(); in_.pack()
    m = mats.pbr('Under_Suit', tex=ia, normal=in_, normal_strength=1.0, rough=0.78, spec=0.35)
    mb = MB()
    mb.add(V, F, 0, uv=uv, w=W, tag='suit')
    ob = mb.build('P_Suit', [m])
    # Lippen hart (Sharp) markieren
    me = ob.data
    for p in me.polygons:
        pass
    garments = dict(V=V, F=F, nmain=nmain, S=S)
    return ob, garments
