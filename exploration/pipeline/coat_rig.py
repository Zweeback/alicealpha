"""Kittel-Rigging: Gewichte per Naechste-Flaeche vom Body + Rock-Panels (Spring-Chains) + Collider-JSON."""
import numpy as np
from coat_common import *

TAU = 2 * np.pi
HIP_Z = 0.845


def tri_bary(p, a, b, c):
    v0 = b - a; v1 = c - a; v2 = p - a
    d00 = v0 @ v0; d01 = v0 @ v1; d11 = v1 @ v1; d20 = v2 @ v0; d21 = v2 @ v1
    den = d00 * d11 - d01 * d01
    if abs(den) < 1e-20:
        return np.array([1.0, 0, 0])
    v = (d11 * d20 - d01 * d21) / den; w = (d00 * d21 - d01 * d20) / den
    return np.array([1 - v - w, v, w])


class BodyBVH:
    def __init__(self, B: Body):
        from mathutils.bvhtree import BVHTree
        self.B = B
        self.bvh = BVHTree.FromPolygons([tuple(map(float, v)) for v in B.co], [tuple(map(int, t)) for t in B.tris], all_triangles=True)

    def nearest(self, pts):
        from mathutils import Vector
        n = len(pts)
        loc = np.zeros((n, 3)); nrm = np.zeros((n, 3)); idx = np.zeros(n, int); dist = np.zeros(n)
        for i, p in enumerate(pts):
            l, nn, ix, d = self.bvh.find_nearest(Vector(p))
            loc[i] = l; nrm[i] = nn; idx[i] = ix; dist[i] = d
        return loc, nrm, idx, dist

    def signed(self, pts):
        """positiv = ausserhalb des Koerpers (Normalen-Test an naechster Flaeche)"""
        loc, nrm, idx, dist = self.nearest(pts)
        s = np.einsum('ij,ij->i', pts - loc, nrm)
        return np.where(s >= 0, dist, -dist)

    def weights(self, pts):
        loc, nrm, idx, dist = self.nearest(pts)
        W = np.zeros((len(pts), self.B.W.shape[1]))
        for i in range(len(pts)):
            t = self.B.tris[idx[i]]
            bc = tri_bary(loc[i], self.B.co[t[0]], self.B.co[t[1]], self.B.co[t[2]])
            bc = np.clip(bc, 0, 1); bc /= bc.sum()
            W[i] = bc @ self.B.W[t]
        return W, dist


def remap_groups(W, names):
    """Kopf -> Hals (Kragen darf nicht am Kopf kleben), Finger -> Hand, Augen raus."""
    W = W.copy()
    ix = {n: i for i, n in enumerate(names)}
    for s in 'lr':
        for fn in ('index', 'middle', 'ring', 'pinky', 'thumb'):
            for k in (1, 2, 3):
                nm = f'{fn}_0{k}_{s}'
                if nm in ix:
                    W[:, ix[f'hand_{s}']] += W[:, ix[nm]]; W[:, ix[nm]] = 0
        for nm in (f'ball_{s}',):
            if nm in ix:
                W[:, ix[f'foot_{s}']] += W[:, ix[nm]]; W[:, ix[nm]] = 0
    if 'head' in ix:
        W[:, ix['neck_01']] += W[:, ix['head']]; W[:, ix['head']] = 0
    return W


def smooth_weights(W, V, F, iters=2, lam=0.5, mask=None):
    """Laplace-Glaettung der Gewichte ueber Mesh-Nachbarschaft (Quads/Tris)."""
    n = len(V)
    nb = [set() for _ in range(n)]
    for f in F:
        vs = [int(x) for x in f if x >= 0]
        for i in range(len(vs)):
            a = vs[i]; b = vs[(i + 1) % len(vs)]
            nb[a].add(b); nb[b].add(a)
    W = W.copy()
    for _ in range(iters):
        W2 = W.copy()
        for i in range(n):
            if mask is not None and not mask[i]:
                continue
            if nb[i]:
                m = W[list(nb[i])].mean(0)
                W2[i] = (1 - lam) * W[i] + lam * m
        W = W2
    return W


def prune(W, k=4, eps=0.01):
    """max k Einfluesse, renormalisiert"""
    W = W.copy()
    for i in range(len(W)):
        w = W[i]
        if np.count_nonzero(w) > k:
            thr = np.sort(w)[-k]
            w[w < thr] = 0
        w[w < eps] = 0
        s = w.sum()
        W[i] = w / s if s > 0 else w
    return W


# ----------------------------------------------------------------------------------- Rock-Panels
PANELS = [  # Name, theta (rad), Breite (Hut-Funktion, rad)
    ('FL', np.radians(24)), ('SL', np.radians(70)), ('BL', np.radians(118)), ('BCL', np.radians(158)),
    ('BCR', np.radians(202)), ('BR', np.radians(242)), ('SR', np.radians(290)), ('FR', np.radians(336)),
]


def chain_nodes(shell_base_r, cy_axis, hem_z, theta, z_nodes):
    """Koordinaten der Chain-Knoten (Oberflaeche des Rocks) fuer Winkel theta; z_nodes: Hoehen (letzter = Saum)."""
    pts = []
    for z in z_nodes:
        r = float(shell_base_r(np.array([theta]), np.array([z]))[0])
        pts.append([r * np.sin(theta), cy_axis(z) - r * np.cos(theta), z])
    return np.array(pts)


def build_chains(shell_base_r, cy_axis, hem_z):
    """liefert bones(list dicts), springs(list), node-Daten fuer Gewichte"""
    bones = []; springs = []; chains = {}
    for name, th in PANELS:
        zh = float(hem_z(th))
        zn = [HIP_Z, HIP_Z - 0.17, HIP_Z - 0.34, zh + 0.0]
        # Knoten auf nur leicht eingerueckter Flaeche (Aussenflaeche - 0.0)
        pts = chain_nodes(shell_base_r, cy_axis, hem_z, th, zn)
        names = []
        for i in range(3):
            bn = f'coat_{name}_{i + 1:02d}'
            bones.append(dict(name=bn, head=pts[i].tolist(), tail=pts[i + 1].tolist(), parent=('pelvis' if i == 0 else names[-1]), roll=0.0, deform=True))
            names.append(bn)
        tip = f'coat_{name}_tip'
        tail_dir = pts[3] - pts[2]
        bones.append(dict(name=tip, head=pts[3].tolist(), tail=(pts[3] + tail_dir / np.linalg.norm(tail_dir) * 0.05).tolist(), parent=names[-1], roll=0.0, deform=False))
        springs.append(dict(name=f'coat_skirt_{name}', joints=names + [tip], stiffness=0.62 if name in ('FL', 'FR') else 0.7, drag=0.42, gravity=0.1, hit_radius=0.025))
        chains[name] = dict(theta=th, nodes=pts, bones=names)
    return bones, springs, chains


def skirt_weights(V, Wbody, names, chains, hip_z=HIP_Z, cy_axis=None, fmax=0.92):
    """Mischt unterhalb der Huefte die Panel-Chain-Gewichte ein. V (n,3). Rueckgabe W (n, nbody+nchain), Namen."""
    ix = {n: i for i, n in enumerate(names)}
    extra = [b for ch in chains.values() for b in ch['bones']]
    allnames = list(names) + extra
    ix2 = {n: i for i, n in enumerate(allnames)}
    W = np.zeros((len(V), len(allnames)))
    W[:, :len(names)] = Wbody
    keys = sorted(chains.keys(), key=lambda k: chains[k]['theta'])
    th_all = np.array([chains[k]['theta'] for k in keys])
    for i, p in enumerate(V):
        z = p[2]
        f = fmax * float(smoothstep(hip_z + 0.015, hip_z - 0.19, z))
        if f <= 0:
            continue
        cy = cy_axis(z) if cy_axis else -0.035
        th = np.arctan2(p[0], -(p[1] - cy)) % TAU
        # Koerper-Anteil: Torso-Gewichte (spine) auf pelvis schlagen, Rest (pelvis/thigh/calf) behalten
        wb = Wbody[i].copy()
        for nm in ('spine_01', 'spine_02', 'spine_03'):
            wb[ix['pelvis']] += wb[ix[nm]]; wb[ix[nm]] = 0
        W[i, :len(names)] = (1 - f) * wb
        k = int(np.searchsorted(th_all, th)) % len(th_all)
        a = (k - 1) % len(th_all); b = k
        d = (th_all[b] - th_all[a]) % TAU
        t = float(np.clip(((th - th_all[a]) % TAU) / d, 0, 1)) if d > 0 else 0.5
        t = t * t * (3 - 2 * t)
        for kk, wpan in ((a, 1 - t), (b, t)):
            ch = chains[keys[kk]]
            zn = ch['nodes'][:, 2]
            seg = int(np.clip(np.searchsorted(-zn, -z) - 1, 0, 2))
            tt = float(np.clip((zn[seg] - z) / max(zn[seg] - zn[seg + 1], 1e-6), 0, 1))
            b0 = ix2[ch['bones'][seg]]
            if seg < 2:
                b1 = ix2[ch['bones'][seg + 1]]
                W[i, b0] += f * wpan * (1 - tt); W[i, b1] += f * wpan * tt
            else:
                W[i, b0] += f * wpan
    return W, allnames


def thigh_colliders(B: Body, arm_obj):
    """Collider-Liste (VRM) fuer thigh_l/r (Kapsel), pelvis (Kugel), calf (Kapsel). offsets im Bone-Local-Frame."""
    cols = []
    bones = arm_obj.data.bones
    from mathutils import Vector

    def local(bone, wp):
        M = bone.matrix_local.to_3x3().inverted()
        return (M @ (Vector(wp) - bone.head_local)).to_tuple()
    for s in 'lr':
        th = bones[f'thigh_{s}']; ca = bones[f'calf_{s}']
        h = np.array(th.head_local); t = np.array(th.tail_local)
        # Radius: mittlerer Abstand Thigh-Verts zur Achse
        m = B.W[:, [B.names.index(f'thigh_{s}')]].ravel() > 0.6
        pts = B.co[m]
        ax = (t - h) / np.linalg.norm(t - h)
        d = pts - h; proj = d @ ax
        rad = np.linalg.norm(d - np.outer(proj, ax), axis=1)
        sel = (proj > 0.05) & (proj < 0.30)
        r_up = float(np.percentile(rad[sel], 60)) if sel.any() else 0.08
        cols.append(dict(name=f'c_thigh_{s}', bone=f'thigh_{s}', type='capsule', offset=list(local(th, h + ax * 0.02)),
                         tail=list(local(th, h + ax * (np.linalg.norm(t - h) * 0.92))), radius=round(r_up * 0.97, 4)))
        hc = np.array(ca.head_local); tc = np.array(ca.tail_local)
        axc = (tc - hc) / np.linalg.norm(tc - hc)
        mc = B.W[:, [B.names.index(f'calf_{s}')]].ravel() > 0.6
        pc = B.co[mc]; dd = pc - hc; pj = dd @ axc
        rc = np.linalg.norm(dd - np.outer(pj, axc), axis=1); selc = (pj > 0.03) & (pj < 0.25)
        r_c = float(np.percentile(rc[selc], 60)) if selc.any() else 0.055
        cols.append(dict(name=f'c_calf_{s}', bone=f'calf_{s}', type='capsule', offset=list(local(ca, hc + axc * 0.02)),
                         tail=list(local(ca, hc + axc * (np.linalg.norm(tc - hc) * 0.7))), radius=round(r_c * 0.97, 4)))
    pel = bones['pelvis']
    cols.append(dict(name='c_pelvis', bone='pelvis', type='sphere', offset=list(local(pel, (0, -0.02, 0.86))), radius=0.115))
    return cols
