"""Koerper-Huelle r_body(theta, z) fuer den Kittel (Polar um vertikale Achse, theta=0 vorn (-Y), theta=+90deg = Charakter-links +X)."""
import numpy as np
from coat_common import *

JL = np.array([0.157, -0.021, 1.283])      # Schulter-Gelenk links (A-Pose)


def dirf(th):
    th = np.asarray(th)
    return np.stack([np.sin(th), -np.cos(th)], -1)


class Envelope:
    Z0, Z1, DZ = 0.10, 1.50, 0.01
    NT = 360

    def __init__(self, body):
        self.b = body
        self.z = np.arange(self.Z0, self.Z1 + 1e-9, self.DZ)
        self.th = np.arange(self.NT) * 2 * np.pi / self.NT
        co = body.co
        torso = (body.arm_w < 0.5) & (body.head_w < 0.5)
        dl = np.linalg.norm(co - JL, axis=1)
        sl = (dl < 0.095) & (co[:, 2] > 1.20)
        dr = np.linalg.norm(co - JL * np.array([-1, 1, 1]), axis=1)
        sr = (dr < 0.095) & (co[:, 2] > 1.20)
        self.mask_torso = torso | sl | sr
        R = np.full((len(self.z), self.NT), np.nan)
        C = np.full((len(self.z), 2), np.nan)
        for k, z in enumerate(self.z):
            pts = body.plane_slice((0, 0, z), (0, 0, 1), self.mask_torso)[:, :2]
            if len(pts) < 6:
                continue
            c = np.array([0.0, 0.5 * (pts[:, 1].min() + pts[:, 1].max())])
            C[k] = c
            R[k] = hull_radial(pts, c, self.th, dirf)
        # Zentrum glaetten
        cy = fill_nan_rows(C[:, 1:2])[:, 0]
        self.cy = gauss_smooth(cy, 2.0, 0)
        # R mit festem (geglaettetem) Zentrum neu rechnen
        for k, z in enumerate(self.z):
            pts = body.plane_slice((0, 0, z), (0, 0, 1), self.mask_torso)[:, :2]
            if len(pts) < 6:
                continue
            R[k] = hull_radial(pts, np.array([0.0, self.cy[k]]), self.th, dirf)
        R = fill_nan_rows(R)
        R = gauss_smooth(R, 1.2, 0)
        R = gauss_smooth(R, 2.0, 1, mode='wrap')
        self.R = R

    def cy_at(self, z):
        return np.interp(z, self.z, self.cy)

    def r_at(self, th, z):
        """bilinear (theta wrap) ; th,z beliebige gleich geformte Arrays"""
        th = np.asarray(th, float) % (2 * np.pi); z = np.asarray(z, float)
        ti = th / (2 * np.pi) * self.NT
        t0 = np.floor(ti).astype(int) % self.NT; t1 = (t0 + 1) % self.NT; ft = ti - np.floor(ti)
        zi = np.clip((z - self.Z0) / self.DZ, 0, len(self.z) - 1.001)
        z0 = np.floor(zi).astype(int); fz = zi - z0
        r00 = self.R[z0, t0]; r01 = self.R[z0, t1]; r10 = self.R[z0 + 1, t0]; r11 = self.R[z0 + 1, t1]
        return (r00 * (1 - ft) + r01 * ft) * (1 - fz) + (r10 * (1 - ft) + r11 * ft) * fz


if __name__ == '__main__':
    import bpy, matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    bpy.ops.wm.open_mainfile(filepath=os.path.join(OUT, 'core.blend'))
    B = Body(bpy.data.objects['Alice_Body'])
    E = Envelope(B)
    fig, axs = plt.subplots(2, 5, figsize=(25, 10))
    for ax, z in zip(axs.flat, [0.4, 0.6, 0.8, 0.95, 1.1, 1.2, 1.28, 1.34, 1.4, 1.46]):
        m = np.abs(B.co[:, 2] - z) < 0.006
        ax.scatter(B.co[m, 0], B.co[m, 1], s=3, c='k')
        c = E.cy_at(z); r = E.r_at(E.th, np.full(E.NT, z))
        ax.plot(r * np.sin(E.th), c - r * np.cos(E.th), 'r-')
        ax.set_aspect('equal'); ax.set_title(f'z={z}'); ax.set_xlim(-0.4, 0.4); ax.set_ylim(-0.3, 0.2); ax.grid(True)
    plt.savefig(SCR + '/env.png', dpi=50)
    print('cy', E.cy[::10])
