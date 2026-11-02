#!/usr/bin/env python3
"""Klinikum Dortmund Mitte aus AMTLICHEN Geodaten NRW -> GLB (Web/Three.js/Godot tauglich).
  python3 mh/build_klinikum_lod2.py NRW_DIR OUT.glb [half_size_m=360]
Quellen (Land NRW, Datenlizenz Deutschland – Zero – Version 2.0, frei nutzbar):
  * 3D-Gebäudemodelle LoD2 (CityGML)  https://www.opengeodata.nrw.de/produkte/geobasis/3dg/lod2_gml/
  * Digitale Orthophotos (WMS nw_dop_rgb) https://www.wms.nrw.de/geobasis/wms_nw_dop
Dächer + Boden mit Luftbild texturiert (Dachfarben/-anlagen echt), Wände mit Fassaden-Kachel, Gelände aus Gebäude-Bodenhöhen interpoliert.
Koordinaten: x = Ost, y = Höhe, z = -Nord (glTF, Y-oben), Ursprung = Klinikum-Mittelpunkt (E 392900, N 5707488), 1 Einheit = 1 m."""
import glob, sys, os, io  # noqa
import numpy as np, trimesh, mapbox_earcut as earcut
from lxml import etree
from PIL import Image
from scipy.interpolate import griddata

SRC, OUT = sys.argv[1], sys.argv[2]; HS = float(sys.argv[3]) if len(sys.argv) > 3 else 360
E0, N0 = 392900.0, 5707488.0
_c = os.path.join(SRC, 'center.txt')
if os.path.exists(_c): E0, N0, HS = map(float, open(_c).read().split())
NS = {'gml': 'http://www.opengis.net/gml', 'bldg': 'http://www.opengis.net/citygml/building/1.0'}
roofs, walls, grounds = [], [], []   # Listen von (n,3)-Arrays (E,N,H)
nb = 0
for f in sorted(glob.glob(os.path.join(SRC, 'LoD2_*.gml'))):
    for _, b in etree.iterparse(f, tag='{%s}Building' % NS['bldg'], huge_tree=True):
        if b.getparent() is not None and b.getparent().tag.endswith('consistsOfBuildingPart'): continue
        pts = b.xpath('.//gml:posList/text()', namespaces=NS)
        if not pts: b.clear(); continue
        first = np.array(pts[0].split(), float).reshape(-1, 3)
        if abs(first[0, 0] - E0) > HS + 40 or abs(first[0, 1] - N0) > HS + 40: b.clear(); continue
        nb += 1
        for kind, store in (('RoofSurface', roofs), ('WallSurface', walls), ('GroundSurface', grounds)):
            for pl in b.xpath('.//bldg:%s//gml:posList/text()' % kind, namespaces=NS):
                store.append(np.array(pl.split(), float).reshape(-1, 3))
        b.clear()
print('buildings', nb, 'roof', len(roofs), 'wall', len(walls), 'ground', len(grounds))
gpts = np.concatenate([g for g in grounds]); Z0 = float(np.median(gpts[np.hypot(gpts[:, 0] - E0, gpts[:, 1] - N0) < 120][:, 2]))
print('Bezugshöhe (NHN)', round(Z0, 2))


def tri(poly):
    """3D-Polygon triangulieren (Projektion auf Hauptebene)."""
    if len(poly) > 3 and np.allclose(poly[0], poly[-1]): poly = poly[:-1]
    if len(poly) < 3: return None
    n = np.cross(poly[1] - poly[0], poly[2] - poly[0]); c = poly.mean(0)
    n = np.zeros(3)
    for i in range(len(poly)): a, b2 = poly[i] - c, poly[(i + 1) % len(poly)] - c; n += np.cross(a, b2)
    if np.linalg.norm(n) < 1e-9: return None
    ax = np.argmax(np.abs(n)); keep = [i for i in range(3) if i != ax]
    idx = earcut.triangulate_float64(poly[:, keep], np.array([len(poly)], np.uint32)).reshape(-1, 3)
    if len(idx) == 0: return None
    # Wicklung an Flächennormale ausrichten
    t = poly[idx]; tn = np.cross(t[:, 1] - t[:, 0], t[:, 2] - t[:, 0]).sum(0)
    if np.dot(tn, n) < 0: idx = idx[:, ::-1]
    return poly, idx


def build(polys, clip=True):
    V, F = [], []; off = 0
    for p in polys:
        r = tri(p)
        if r is None: continue
        P, I = r
        if clip and (np.abs(P[:, 0] - E0).max() > HS or np.abs(P[:, 1] - N0).max() > HS): continue
        V.append(P); F.append(I + off); off += len(P)
    return np.concatenate(V), np.concatenate(F)


def to_gltf(P):   # (E,N,H) -> (x, y, z) glTF
    return np.c_[P[:, 0] - E0, P[:, 2] - Z0, -(P[:, 1] - N0)]


dop = Image.open(os.path.join(SRC, 'dop.png')).convert('RGB')
def uv_ortho(P):  # Luftbild deckt [E0-HS, E0+HS] x [N0-HS, N0+HS]
    return np.c_[(P[:, 0] - (E0 - HS)) / (2 * HS), (P[:, 1] - (N0 - HS)) / (2 * HS)]

ortho_mat = trimesh.visual.material.PBRMaterial(name='NRW_DOP_Orthophoto', baseColorTexture=dop, roughnessFactor=0.9, metallicFactor=0.0)
# Dächer
RV, RF = build(roofs)
roof = trimesh.Trimesh(to_gltf(RV), RF, process=False, visual=trimesh.visual.TextureVisuals(uv=uv_ortho(RV), material=ortho_mat))
# Wände: Fassaden-Kachel (Putz + Fensterraster), UV = (Wandlänge, Höhe) in Metern
WV, WF = build(walls)
tile = np.zeros((256, 256, 3), np.uint8); tile[:] = (205, 198, 186)
for cx in range(0, 256, 128):
    for cy in range(0, 256, 128): tile[cy + 34:cy + 94, cx + 34:cx + 94] = (58, 70, 82)
tile[0:6] = (170, 164, 154)
wall_mat = trimesh.visual.material.PBRMaterial(name='Facade_Generic', baseColorTexture=Image.fromarray(tile), roughnessFactor=0.85, metallicFactor=0.0)
uw = np.zeros((len(WV), 2))
for f in WF:
    p = WV[f]; d = p[1] - p[0]; d[2] = 0
    if np.linalg.norm(d[:2]) < 1e-6: d = p[2] - p[0]; d[2] = 0
    d /= np.linalg.norm(d) + 1e-9
    for i in f: uw[i] = (np.dot(WV[i][:2], d[:2]) / 6.0, (WV[i][2] - Z0) / 6.8)   # 2 Fensterachsen à 3 m, 2 Geschosse à 3,4 m pro Kachel
wall = trimesh.Trimesh(to_gltf(WV), WF, process=False, visual=trimesh.visual.TextureVisuals(uv=uw, material=wall_mat))
# Gelände: Gitter, Höhe aus Gebäude-Bodenflächen interpoliert, Luftbild-Textur
g = np.concatenate(grounds); g = g[(np.abs(g[:, 0] - E0) < HS + 60) & (np.abs(g[:, 1] - N0) < HS + 60)]
n = 97; xs = np.linspace(E0 - HS, E0 + HS, n); ys = np.linspace(N0 - HS, N0 + HS, n); GX, GY = np.meshgrid(xs, ys)
GZ = griddata(g[:, :2], g[:, 2], (GX, GY), method='linear'); GZn = griddata(g[:, :2], g[:, 2], (GX, GY), method='nearest'); GZ = np.where(np.isnan(GZ), GZn, GZ) - 0.15
GP = np.c_[GX.ravel(), GY.ravel(), GZ.ravel()]
idx = np.arange(n * n).reshape(n, n); F = np.r_[np.c_[idx[:-1, :-1].ravel(), idx[:-1, 1:].ravel(), idx[1:, 1:].ravel()], np.c_[idx[:-1, :-1].ravel(), idx[1:, 1:].ravel(), idx[1:, :-1].ravel()]]
ground = trimesh.Trimesh(to_gltf(GP), F[:, ::-1], process=False, visual=trimesh.visual.TextureVisuals(uv=uv_ortho(GP), material=ortho_mat))
for m in (roof, wall, ground): m.fix_normals() if m is ground else None
sc = trimesh.Scene(); sc.add_geometry(ground, geom_name='Terrain_Orthophoto'); sc.add_geometry(roof, geom_name='LoD2_Roofs'); sc.add_geometry(wall, geom_name='LoD2_Walls')
sc.metadata['extras'] = {'title': 'Klinikum Dortmund Mitte – LoD2 + DOP', 'source': 'Geobasis NRW: 3D-Gebäudemodelle LoD2, Digitale Orthophotos',
                         'license': 'Datenlizenz Deutschland – Zero – Version 2.0 (dl-de/zero-2-0)', 'origin_utm32': [E0, N0, Z0]}
sc.export(OUT)
print('OK', OUT, 'tris', len(RF) + len(WF) + len(F), 'MB', round(os.path.getsize(OUT) / 1e6, 1))
