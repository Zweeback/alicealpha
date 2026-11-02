"""Klinikum Dortmund (Klinikzentrum Mitte, Beurhausstraße) aus echten OpenStreetMap-Daten -> GLB.
  python3 mh/build_klinikum_osm.py MAP.osm OUT.glb [radius_m=330]
Gebäude-Grundrisse + Geschosszahlen (building:levels / height) aus OSM, Straßen als Bänder, Grünflächen, Bäume.
Klinik-Gebäude (amenity/building=hospital bzw. Name enthält Klinik) weiß mit Fensterband-Textur, Umgebung grau.
Daten © OpenStreetMap-Mitwirkende, ODbL 1.0. 1 Einheit = 1 m, Ursprung = Klinikum-Mittelpunkt, +Y = Norden (Blender)."""
import sys, math, xml.etree.ElementTree as ET, bpy, bmesh
import numpy as np
from PIL import Image
OSM, OUT = sys.argv[1], sys.argv[2]; R = float(sys.argv[3]) if len(sys.argv) > 3 else 330
LAT0, LON0 = 51.50836, 7.45674
KX = 111320 * math.cos(math.radians(LAT0)); KY = 110574
root = ET.parse(OSM).getroot()
nodes = {n.get('id'): ((float(n.get('lon')) - LON0) * KX, (float(n.get('lat')) - LAT0) * KY) for n in root.iter('node')}
ntags = {n.get('id'): {t.get('k'): t.get('v') for t in n.iter('tag')} for n in root.iter('node') if n.find('tag') is not None}
ways = {}
for w in root.iter('way'):
    ways[w.get('id')] = ([nd.get('ref') for nd in w.iter('nd')], {t.get('k'): t.get('v') for t in w.iter('tag')})
bpy.ops.wm.read_factory_settings(use_empty=True)

# ---------------- Materialien (Fensterband-Textur prozedural gebacken)
def tex_facade(name, base, win, lit, cols=6, rows=1, size=256):
    a = np.zeros((size, size, 3), np.float32); a[:] = base
    cw = size // cols
    for c in range(cols):
        x0 = c * cw + cw // 6; x1 = (c + 1) * cw - cw // 6
        col = lit if (c * 7 + 3) % 5 == 0 else win
        a[size * 30 // 100:size * 80 // 100, x0:x1] = col
    a[:size * 8 // 100] = [v * 0.8 for v in base]
    im = Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8)); p = f'/tmp/{name}.png'; im.save(p); return p

def mat(name, col, rough=0.7, tex=None, emit=0.0, metal=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; b = nt.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*col, 1); b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    if tex:
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(tex); t.image.pack(); nt.links.new(t.outputs['Color'], b.inputs['Base Color'])
        if emit: nt.links.new(t.outputs['Color'], b.inputs['Emission Color']); b.inputs['Emission Strength'].default_value = emit
    return m

M = {
    'hosp': mat('Hospital_Facade', (1, 1, 1), 0.6, tex_facade('hosp', (0.88, 0.88, 0.86), (0.2, 0.3, 0.38), (0.95, 0.85, 0.55)), emit=0.0),
    'bldg': mat('City_Facade', (1, 1, 1), 0.8, tex_facade('bldg', (0.62, 0.58, 0.54), (0.22, 0.25, 0.28), (0.8, 0.7, 0.5))),
    'roof': mat('Roof', (0.33, 0.33, 0.35), 0.95), 'hroof': mat('Hospital_Roof', (0.45, 0.46, 0.48), 0.9),
    'road': mat('Road', (0.14, 0.14, 0.15), 0.9), 'path': mat('Footway', (0.55, 0.53, 0.5), 0.85),
    'green': mat('Green', (0.2, 0.34, 0.15), 0.95), 'ground': mat('Ground', (0.36, 0.36, 0.35), 0.95),
    'park': mat('Parking', (0.22, 0.22, 0.23), 0.9), 'leaf': mat('Tree', (0.15, 0.33, 0.13), 0.9),
    'rail': mat('Rail', (0.3, 0.27, 0.25), 0.9), 'heli': mat('Helipad', (0.7, 0.1, 0.1), 0.6), 'water': mat('Water', (0.15, 0.3, 0.4), 0.1),
}

def inside(p): return p[0] * p[0] + p[1] * p[1] <= R * R
def ring(refs): return [nodes[r] for r in refs if r in nodes]
def is_hosp(t): return t.get('building') == 'hospital' or t.get('amenity') == 'hospital' or 'Klinik' in (t.get('name') or '') or t.get('healthcare') == 'hospital'

# Klinikgelände-Polygone (für Zuordnung Gebäude -> Klinik)
campus = [np.array(ring(r)) for r, t in ways.values() if t.get('amenity') == 'hospital' and len(r) > 3]
from matplotlib.path import Path
campus_paths = [Path(c) for c in campus]
def in_campus(p): return any(cp.contains_point(p) for cp in campus_paths)

def height(t):
    try:
        if 'height' in t: return float(t['height'].replace('m', '').strip())
    except ValueError: pass
    try:
        lv = float(t.get('building:levels', 'nan'))
        if not math.isnan(lv): return lv * 3.4 + float(t.get('roof:levels', 0) or 0) * 2.5
    except ValueError: pass
    return None

objs = {'hosp': [], 'bldg': []}
def extrude(name, pts, h, side_mat, roof_mat, base=0.0):
    if len(pts) > 2 and pts[0] == pts[-1]: pts = pts[:-1]
    if len(pts) < 3: return None
    a = np.array(pts); area = 0.5 * np.sum(a[:, 0] * np.roll(a[:, 1], -1) - np.roll(a[:, 0], -1) * a[:, 1])
    if abs(area) < 4: return None
    if area < 0: pts = pts[::-1]
    bm = bmesh.new(); vb = [bm.verts.new((x, y, base)) for x, y in pts]
    try: f = bm.faces.new(vb)
    except ValueError: bm.free(); return None
    r = bmesh.ops.extrude_face_region(bm, geom=[f]); top = [g for g in r['geom'] if isinstance(g, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, vec=(0, 0, h), verts=top)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o)
    me.materials.append(side_mat); me.materials.append(roof_mat)
    uv = me.uv_layers.new();
    for p in me.polygons:
        if abs(p.normal.z) > 0.5: p.material_index = 1
        for li in p.loop_indices:
            v = me.vertices[me.loops[li].vertex_index].co
            if abs(p.normal.z) > 0.5: uv.data[li].uv = (v.x / 20, v.y / 20)
            else:
                d = v.x * -p.normal.y + v.y * p.normal.x
                uv.data[li].uv = (d / 6.0, (v.z - base) / 3.4)      # 6 m pro Fensterachse, 3,4 m pro Geschoss
    return o

def flat(name, pts, m, z=0.02):
    if len(pts) > 2 and pts[0] == pts[-1]: pts = pts[:-1]
    if len(pts) < 3: return
    bm = bmesh.new(); vb = [bm.verts.new((x, y, z)) for x, y in pts]
    try: bm.faces.new(vb)
    except ValueError: bm.free(); return
    bmesh.ops.triangulate(bm, faces=bm.faces[:]); me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o); me.materials.append(m)

def ribbon(name, pts, w, m, z=0.03):
    if len(pts) < 2: return
    bm = bmesh.new(); prev = None
    for i, (x, y) in enumerate(pts):
        a = np.array(pts[max(i - 1, 0)]); b = np.array(pts[min(i + 1, len(pts) - 1)]); d = b - a; n = np.linalg.norm(d)
        if n < 1e-6: continue
        nx, ny = -d[1] / n * w / 2, d[0] / n * w / 2
        l = bm.verts.new((x + nx, y + ny, z)); r = bm.verts.new((x - nx, y - ny, z))
        if prev: bm.faces.new((prev[0], prev[1], r, l))
        prev = (l, r)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o); me.materials.append(m)

# Boden
bpy.ops.mesh.primitive_circle_add(vertices=96, radius=R + 20, fill_type='NGON', location=(0, 0, -0.02)); g = bpy.context.object; g.name = 'Ground'; g.data.materials.append(M['ground'])
WIDTH = {'primary': 12, 'secondary': 10, 'tertiary': 9, 'residential': 7, 'unclassified': 7, 'service': 4.5, 'living_street': 6,
         'footway': 2.5, 'path': 2.2, 'pedestrian': 5, 'cycleway': 2.2, 'steps': 2}
nb = nh = 0
for wid, (refs, t) in ways.items():
    pts = ring(refs)
    if not pts or not any(inside(p) for p in pts): continue
    if 'building' in t and t.get('building') not in ('roof', 'construction') and t.get('location') != 'underground' and t.get('layer', '0')[:1] != '-':
        c = np.mean(pts, axis=0); hosp = is_hosp(t) or in_campus(c)
        h = height(t) or (14.0 if hosp else 10.5)
        nm = ('KLINIK_' if hosp else 'BLDG_') + (t.get('name') or wid).replace(' ', '_')[:40]
        o = extrude(nm, pts, h, M['hosp' if hosp else 'bldg'], M['hroof' if hosp else 'roof'], base=float(t.get('min_height', 0) or 0))
        if o: (nh := nh + 1) if hosp else (nb := nb + 1)
    elif 'highway' in t and t['highway'] in WIDTH:
        ribbon('ROAD_' + (t.get('name') or wid)[:30], pts, WIDTH[t['highway']], M['path' if t['highway'] in ('footway', 'path', 'pedestrian', 'cycleway', 'steps') else 'road'], 0.03 if t['highway'] not in ('footway', 'path') else 0.04)
    elif t.get('railway') in ('tram', 'rail', 'light_rail'):
        ribbon('RAIL_' + wid, pts, 2.6, M['rail'], 0.035)
    elif t.get('leisure') in ('park', 'garden') or t.get('landuse') in ('grass', 'meadow', 'recreation_ground') or t.get('natural') in ('wood', 'scrub'):
        flat('GREEN_' + (t.get('name') or wid)[:30], pts, M['green'], 0.01)
    elif t.get('amenity') == 'parking' and t.get('parking') != 'underground':
        flat('PARK_' + wid, pts, M['park'], 0.015)
    elif t.get('aeroway') == 'helipad':
        flat('HELIPAD_' + wid, pts, M['heli'], 0.05)
    elif t.get('natural') == 'water':
        flat('WATER_' + wid, pts, M['water'], 0.012)
# Bäume (OSM natural=tree) + Hubschrauberlandeplätze als Punkte
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=1); tree_proto = bpy.context.object; tree_proto.data.materials.append(M['leaf'])
nt_ = 0
for nid, t in ntags.items():
    p = nodes[nid]
    if not inside(p): continue
    if t.get('natural') == 'tree':
        o = tree_proto.copy(); o.data = tree_proto.data; o.location = (p[0], p[1], 5); o.scale = (3, 3, 3.6); bpy.context.scene.collection.objects.link(o); nt_ += 1
    if t.get('aeroway') == 'helipad':
        bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=8, depth=0.3, location=(p[0], p[1], 0.2)); bpy.context.object.data.materials.append(M['heli']); bpy.context.object.name = 'HELIPAD_pt'
bpy.data.objects.remove(tree_proto)
# Zusammenführen pro Kategorie (weniger Draw-Calls)
def join(prefix, name):
    obs = [o for o in bpy.data.objects if o.name.startswith(prefix) and o.type == 'MESH']
    if len(obs) < 2: return
    bpy.ops.object.select_all(action='DESELECT')
    for o in obs: o.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]; bpy.ops.object.join(); obs[0].name = name
for pre, nm in (('BLDG_', 'City_Buildings'), ('ROAD_', 'Streets'), ('RAIL_', 'Tram'), ('GREEN_', 'Green'), ('PARK_', 'Parking'), ('Ico', 'Trees')):
    join(pre, nm)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_apply=True, export_extras=False)
faces = sum(len(o.data.polygons) for o in bpy.data.objects if o.type == 'MESH')
print('OK', OUT, 'hospital buildings', nh, 'other buildings', nb, 'trees', nt_, 'faces', faces)
