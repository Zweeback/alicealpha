"""Face-Abteilung: bakt Positions-/Normalen-/Shapekey-Attribute der Alice_Body-Basis in den UV-Raum (numpy-Rasterizer).
  python3 mh/face_uvbake.py [core.blend] [out.npz] [res]
Ergebnis: npz mit pos(H,W,3) nrm(H,W,3) attr(H,W,K) cover(H,W) + Meta. Nur Lesezugriff auf core.blend."""
import sys, os, numpy as np
import bpy

KEYS = ['mouthClose', 'mouthPucker', 'mouthFunnel', 'jawOpen', 'eyeBlinkLeft', 'eyeBlinkRight', 'mouthSmileLeft', 'mouthRollUpper',
        'mouthRollLower', 'eyeWideLeft', 'browDownLeft', 'browInnerUp', 'noseSneerLeft', 'cheekSquintLeft', 'mouthShrugUpper', 'mouthShrugLower']


def extract(blend):
    bpy.ops.wm.open_mainfile(filepath=os.path.abspath(blend))
    b = bpy.data.objects['Alice_Body']; me = b.data
    nv = len(me.vertices)
    co = np.empty(nv * 3, np.float32); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
    nrm = np.empty(nv * 3, np.float32); me.vertices.foreach_get('normal', nrm); nrm = nrm.reshape(-1, 3)
    sk = me.shape_keys.key_blocks; base = np.empty(nv * 3, np.float32); sk['Basis'].data.foreach_get('co', base); base = base.reshape(-1, 3)
    disp = {}
    for k in KEYS:
        a = np.empty(nv * 3, np.float32); sk[k].data.foreach_get('co', a); disp[k] = np.linalg.norm(a.reshape(-1, 3) - base, axis=1)
    tris, uvt = [], []
    uv = me.uv_layers['UVMap'].data
    for p in me.polygons:
        l = list(p.loop_indices); v = list(p.vertices)
        for a, c, d in ((0, 1, 2), (0, 2, 3)):
            tris.append([v[a], v[c], v[d]]); uvt.append([uv[l[a]].uv[:], uv[l[c]].uv[:], uv[l[d]].uv[:]])
    return co, nrm, disp, np.array(tris, np.int32), np.array(uvt, np.float32)


def rasterize(uvt, tris, vattr, res):
    """vattr (nv,K) -> (res,res,K) Interpolation; v = 0 unten (Blender-UV) -> Bild-Zeile = (1-v)*res"""
    K = vattr.shape[1]
    out = np.zeros((res, res, K), np.float32); cov = np.zeros((res, res), bool)
    P = uvt.copy(); P[:, :, 0] *= res; P[:, :, 1] = (1 - P[:, :, 1]) * res
    for t in range(len(tris)):
        p = P[t]; x0 = max(int(np.floor(p[:, 0].min() - 0.5)), 0); x1 = min(int(np.ceil(p[:, 0].max() + 0.5)), res - 1)
        y0 = max(int(np.floor(p[:, 1].min() - 0.5)), 0); y1 = min(int(np.ceil(p[:, 1].max() + 0.5)), res - 1)
        if x1 < x0 or y1 < y0: continue
        xs, ys = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
        d = (p[1, 1] - p[2, 1]) * (p[0, 0] - p[2, 0]) + (p[2, 0] - p[1, 0]) * (p[0, 1] - p[2, 1])
        if abs(d) < 1e-12: continue
        l0 = ((p[1, 1] - p[2, 1]) * (xs - p[2, 0]) + (p[2, 0] - p[1, 0]) * (ys - p[2, 1])) / d
        l1 = ((p[2, 1] - p[0, 1]) * (xs - p[2, 0]) + (p[0, 0] - p[2, 0]) * (ys - p[2, 1])) / d
        l2 = 1 - l0 - l1
        m = (l0 >= -1e-4) & (l1 >= -1e-4) & (l2 >= -1e-4)
        if not m.any(): continue
        va = vattr[tris[t]]  # (3,K)
        val = l0[m, None] * va[0] + l1[m, None] * va[1] + l2[m, None] * va[2]
        yy, xx = ys[m].astype(int), xs[m].astype(int)
        out[yy, xx] = val; cov[yy, xx] = True
    return out, cov


if __name__ == '__main__':
    blend = sys.argv[1] if len(sys.argv) > 1 else 'out/mh/core.blend'
    outp = sys.argv[2] if len(sys.argv) > 2 else 'out/mh/face_work/body_uv.npz'
    res = int(sys.argv[3]) if len(sys.argv) > 3 else 2048
    co, nrm, disp, tris, uvt = extract(blend)
    attr = np.concatenate([co, nrm] + [disp[k][:, None] for k in KEYS], axis=1)
    out, cov = rasterize(uvt, tris, attr, res)
    np.savez_compressed(outp, pos=out[..., :3], nrm=out[..., 3:6], attr=out[..., 6:], cover=cov, keys=np.array(KEYS),
                        vco=co, tris=tris, uvt=uvt)
    print('saved', outp, 'coverage', cov.mean())
