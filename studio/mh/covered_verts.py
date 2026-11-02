# Körper-Vertices finden, die unter einer Kleidungs-Hülle liegen -> body_remove_verts in <part>.json
# python3 mh/covered_verts.py out/mh/under_fix.blend P_Suit [max_dist]
import sys, json, os, bpy
from mathutils.bvhtree import BVHTree
part, objname = sys.argv[1], sys.argv[2]; md = float(sys.argv[3]) if len(sys.argv) > 3 else 0.03
import os; bpy.ops.wm.open_mainfile(filepath=os.environ.get('ALICE_CORE', 'out/mh/core.blend'))
body = bpy.data.objects['Alice_Body']; bw = body.matrix_world
with bpy.data.libraries.load(part) as (src, dst): dst.objects = [objname]
cl = dst.objects[0]; bpy.context.scene.collection.objects.link(cl)
dg = bpy.context.evaluated_depsgraph_get(); tree = BVHTree.FromObject(cl, dg)
rm = []
for v in body.data.vertices:
    p = bw @ v.co
    if p.z > 1.33: continue   # Hals nie entfernen (Kragenbereich)
    hit = tree.find_nearest(p, md)
    if hit[0] is None: continue
    loc, nrm, _, dist = hit
    if (p - loc).dot(nrm) < 0.012:   # innerhalb bzw. auf der Hülle
        rm.append(v.index)
# Sicherheitsrand: Vertices nahe der Öffnungen behalten (Hals/Hand/Fuß) -> nur entfernen, wenn alle Nachbarn auch bedeckt
s = set(rm); adj = {}
for e in body.data.edges:
    a, b = e.vertices; adj.setdefault(a, []).append(b); adj.setdefault(b, []).append(a)
rm = [i for i in rm if all(n in s for n in adj.get(i, []))]
jp = os.path.splitext(part)[0] + '.json'
j = json.load(open(jp)) if os.path.exists(jp) else {}
j['body_remove_verts'] = sorted(rm); json.dump(j, open(jp, 'w'))
print('covered', len(rm), 'of', len(body.data.vertices), '->', jp)
