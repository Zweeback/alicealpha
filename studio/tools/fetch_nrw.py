#!/usr/bin/env python3
"""Amtliche NRW-Geodaten für einen Ort laden: LoD2-Kacheln (CityGML) + Orthophoto-Ausschnitt (WMS).
  python3 studio/tools/fetch_nrw.py OUT_DIR [--lat 51.50836 --lon 7.45674 | --e 392900 --n 5707488] [--half 360]
Lizenz: Datenlizenz Deutschland – Zero – 2.0 (Geobasis NRW)."""
import argparse, os, math, urllib.request
ap = argparse.ArgumentParser(); ap.add_argument('out'); ap.add_argument('--lat', type=float); ap.add_argument('--lon', type=float)
ap.add_argument('--e', type=float); ap.add_argument('--n', type=float); ap.add_argument('--half', type=float, default=360); ap.add_argument('--px', type=int, default=2880)
a = ap.parse_args(); os.makedirs(a.out, exist_ok=True)
if a.e is None:
    from pyproj import Transformer
    a.e, a.n = Transformer.from_crs(4326, 25832, always_xy=True).transform(a.lon if a.lon is not None else 7.45674, a.lat if a.lat is not None else 51.50836)
H = a.half
tiles = {(int(x // 1000), int(y // 1000)) for x in (a.e - H, a.e + H) for y in (a.n - H, a.n + H)}
for ek, nk in sorted(tiles):
    name = f'LoD2_32_{ek}_{nk}_1_NW.gml'; dst = os.path.join(a.out, name)
    if not os.path.exists(dst):
        print('lade', name); urllib.request.urlretrieve(f'https://www.opengeodata.nrw.de/produkte/geobasis/3dg/lod2_gml/lod2_gml/{name}', dst)
bbox = f'{a.e - H},{a.n - H},{a.e + H},{a.n + H}'
url = ('https://www.wms.nrw.de/geobasis/wms_nw_dop?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=nw_dop_rgb&STYLES=&CRS=EPSG:25832'
       f'&BBOX={bbox}&WIDTH={a.px}&HEIGHT={a.px}&FORMAT=image/png')
print('lade Orthophoto'); urllib.request.urlretrieve(url, os.path.join(a.out, 'dop.png'))
open(os.path.join(a.out, 'center.txt'), 'w').write(f'{a.e} {a.n} {H}\n'); print('OK', a.out, 'E', round(a.e), 'N', round(a.n))
