# Löcher im Anzug finden/schließen: out/mh/under.blend -> out/mh/under_fix.blend
import bpy, bmesh
from mathutils import Vector
bpy.ops.wm.open_mainfile(filepath='out/mh/under.blend')
o = bpy.data.objects['P_Suit']; bm = bmesh.new(); bm.from_mesh(o.data)
edges = [e for e in bm.edges if e.is_boundary]; seen = set(); loops = []
for e in edges:
    if e in seen: continue
    loop = []; stack = [e]
    while stack:
        x = stack.pop()
        if x in seen: continue
        seen.add(x); loop.append(x)
        for v in x.verts:
            stack += [y for y in v.link_edges if y.is_boundary and y not in seen]
    vs = {v for x in loop for v in x.verts}; c = sum((v.co for v in vs), Vector()) / len(vs)
    loops.append((len(loop), c, loop))
for n, c, _ in sorted(loops, key=lambda t: -t[0]): print('loop', n, tuple(round(x, 3) for x in c))
import sys
fill = [l for n, c, l in loops if abs(c.x) < 0.05 and 0.6 < c.z < 0.95]   # Schritt-Bereich
for l in fill: bmesh.ops.holes_fill(bm, edges=l, sides=0)
print('filled', len(fill))
bm.to_mesh(o.data); bm.free()
bpy.ops.wm.save_as_mainfile(filepath=bpy.path.abspath('//under_fix.blend'))
