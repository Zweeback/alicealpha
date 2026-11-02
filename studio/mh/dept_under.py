"""UNTERLAGE-Abteilung (Anzug, Handschuhe, Schuhe, Gürtel/Gadgets, Anhänger, Badge) -> out/mh/under.blend + under.json
Aufruf:  python3 mh/dept_under.py [--only suit,gloves,shoes,belt,pendant,badge] [--res 2048] [--no-bake]
Alle Teile sind starr/gewichtet auf die Kern-Bones, Weltkoordinaten der A-Pose, Objekt-Transform = Identität."""
import sys, os, json, time, argparse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
import bpy
from under_common import *
import mats

ap = argparse.ArgumentParser()
ap.add_argument('--only', default='suit,gloves,shoes,belt,pendant,badge')
ap.add_argument('--res', type=int, default=2048)
ap.add_argument('--no-bake', action='store_true', help='vorhandene Texturen wiederverwenden')
ap.add_argument('--out', default=os.path.join(OUTDIR, 'under.blend'))
args = ap.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:])
ONLY = set(args.only.split(','))
os.makedirs(TEXDIR, exist_ok=True)
T0 = time.time()


def tex_path(name): return os.path.join(TEXDIR, name)


def main():
    core = Core()
    objs = {}
    meta = {'under_remove': []}
    garments = {}      # Name -> (V, F) für Body-Entfernung
    if 'suit' in ONLY:
        import under_suit
        objs['P_Suit'], garments['suit'] = under_suit.make(core, args)
    # --- aufräumen: nur P_*-Objekte behalten (Körper/Rig dürfen als Hilfsobjekte bleiben, wir entfernen sie aber)
    for o in list(bpy.data.objects):
        if not o.name.startswith('P_'):
            bpy.data.objects.remove(o, do_unlink=True)
    tris = {n: tri_count(o) for n, o in objs.items()}
    log('Tris:', tris, 'Summe', sum(tris.values()))
    bpy.ops.wm.save_as_mainfile(filepath=args.out)
    log('gespeichert', args.out, 'in %.1fs' % (time.time() - T0))


main()
