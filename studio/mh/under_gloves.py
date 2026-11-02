"""P_Gloves: fingerlose Tech-Handschuhe mit Fingeransätzen + Unterarm-Bracer und Handgelenk-Gerät."""
import numpy as np
from under_common import *
import under_suit as US


def region(core):
    co = core.co; fam = np.array([US.family(d) for d in core.dom]); n = len(co)
    inc = np.zeros(n, bool); tt_all = np.zeros(n)
    for s, sg in (('l', 1), ('r', -1)):
        h, t = core.bone[f'lowerarm_{s}']; L = np.linalg.norm(t - h); d = (t - h) / L
        tt = ((co - h) @ d) / L
        side = (co[:, 0] * sg) > 0.2
        tt_all = np.where(side, tt, tt_all)
        inc |= side & (fam == 'arm') & (tt > 0.60)
        for i in np.nonzero(side & (fam == 'hand'))[0]:
            nm = core.dom[i]
            if nm.startswith('hand'): inc[i] = True; continue
            b = nm[:-2]
            if b in ('thumb_01',): inc[i] = True; continue
            if b.endswith('_01') or b == 'thumb_02':
                bh, bt = core.bone[nm]; bl = np.linalg.norm(bt - bh)
                tb = ((co[i] - bh) @ ((bt - bh) / bl)) / bl
                inc[i] = tb < (0.55 if b != 'thumb_02' else 0.30)
    faces = [f for f in core.faces if all(inc[i] for i in f)]
    return inc, faces, fam, tt_all


def make(core, args):
    import mats
    inc, faces, fam, tt = region(core)
    used = sorted({i for f in faces for i in f}); remap = {v: k for k, v in enumerate(used)}; src = np.array(used)
    F = [tuple(remap[i] for i in f) for f in faces]
    P0 = core.co[src]; nv = len(P0)
    me = core.body.data; pidx = {tuple(p.vertices): p for p in me.polygons}
    uv = np.array([core.uv[l] for f in faces for l in pidx[tuple(f)].loop_indices])
    idx, cnt = adj_arrays(nv, F)
    N = smooth_field_fast(core.nrm[src], idx, cnt, iters=3, lam=0.5); N /= np.linalg.norm(N, axis=1, keepdims=True)
    t = tt[src]
    d = 0.0027 + 0.0043 * (1 - smoothstep(0.96, 1.04, t))
    d = smooth_field_fast(d[:, None], idx, cnt, iters=4, lam=0.5)[:, 0]
    P = P0 + N * d[:, None]
    # Bracer-Oberkante auf Ebene (tt=0.62) ziehen
    bnd = US.boundary_verts(F, nv); bset = sorted({v for k in bnd for v in k})
    for v in bset:
        if t[v] < 0.8:
            s = 'l' if P0[v, 0] > 0 else 'r'
            h, tl = core.bone[f'lowerarm_{s}']; L = np.linalg.norm(tl - h); dd = (tl - h) / L
            P[v] += dd * (0.62 * L - (P[v] - h) @ dd)
    P = US.enforce_clear(core, P, 0.0022, iters=6)
    S = dict(P=P, F=F, uv=uv, src=src, fam=np.where(t < 1.0, 'arm', 'hand'))
    V, Fa, uva, W, lip = US.finish(core, S)
    mg = mats.pbr('Under_Glove', color=(0.028, 0.029, 0.033, 1), rough=0.48, spec=0.45)
    mm = mats.pbr('Under_Metal', color=(0.62, 0.63, 0.64, 1), metal=0.85, rough=0.32)
    mgl = mats.pbr('Under_Glow', color=(0.2, 0.88, 0.91, 1), emit=(0.2, 0.88, 0.91, 1), emit_strength=3.0, rough=0.2)
    md = mats.pbr('Under_Module', color=(0.07, 0.075, 0.082, 1), metal=0.5, rough=0.38)
    mb = MB(); mb.add(V, Fa, 0, uv=uva, w=W)
    # Handgelenk-Riemen + Gerät (starr an lowerarm)
    for s, sg in (('l', 1), ('r', -1)):
        h, tl = core.bone[f'lowerarm_{s}']; L = np.linalg.norm(tl - h); D = (tl - h) / L
        x, y, z = basis_from_dir(D, (0, 0, 1))
        # Riemen-Ring bei tt=0.90
        c = h + D * 0.90 * L
        rings = []
        for o in (-0.007, -0.006, 0.006, 0.007):
            ring = []
            for k in range(20):
                ang = 2 * np.pi * k / 20; dirv = np.cos(ang) * x + np.sin(ang) * y
                o3 = c + D * o
                r = core.bvh.ray_cast(Vector(o3 + dirv * 0.1), Vector(-dirv))
                p = np.array(r[0][:]) if r[0] else o3 + dirv * 0.025
                ring.append(p + dirv * (0.0085 if abs(o) < 0.0065 else 0.0072))
            rings.append(np.array(ring))
        Vr, Fr = loft(rings, True); Fr = orient_all(Vr, Fr, c)
        wts = transfer_weights(core, [c])[0]
        mb.add(Vr, Fr, 1, w=[wts] * len(Vr), sharp_deg=50)
        # Gerät oben auf dem Handgelenk (Handrückenseite ~ -z/außen)
        up = np.cross(D, np.array([0, -1.0, 0])) * sg; up = -np.array([0, 0, 1.0]) * 0 + np.cross(np.array([0, -1.0, 0]), D) * (1 if sg > 0 else 1)
        # Richtung Handrücken: Hand-Bone-Normal ~ nach außen/oben; nutze (+x*sg + z)
        dorsal = np.array([sg * 0.75, 0.15, 0.65]); dorsal -= D * np.dot(dorsal, D); dorsal /= np.linalg.norm(dorsal)
        c2 = h + D * 0.80 * L
        r = core.bvh.ray_cast(Vector(c2 + dorsal * 0.1), Vector(-dorsal)); base = np.array(r[0][:]) if r[0] else c2 + dorsal * 0.022
        side_v = np.cross(D, dorsal)
        M = mat_from(base + dorsal * 0.0105, side_v, D, dorsal)
        Vb, Fb = prim_box((0.026, 0.034, 0.007), bevel=0.0018, segs=2)
        mb.add(xform(Vb, M), Fb, 3, w=[wts] * len(Vb), sharp_deg=40)
        Vg, Fg = prim_box((0.018, 0.022, 0.0016), bevel=0.0005, segs=1)
        Mg = mat_from(base + dorsal * 0.0142, side_v, D, dorsal)
        mb.add(xform(Vg, Mg), Fg, 2, w=[wts] * len(Vg), sharp_deg=40)
    ob = mb.build('P_Gloves', [mg, mm, mgl, md])
    return ob, dict(V=V, F=Fa[:len(F)], nmain=len(F))
