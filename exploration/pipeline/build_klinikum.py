"""Stilisierte Szene „Klinikum Dortmund“ (frei interpretiert, keine exakte Nachbildung, kein Logo) -> GLB.
  python3 mh/build_klinikum.py out/env/klinikum_dortmund.glb
Bettenhaus-Hochhaus, Flachbau-Riegel, Glas-Eingangshalle, Hubschrauber-Landeplatz, Vorplatz, Bäume, Laternen.
Maßstab 1 Einheit = 1 m, Y-oben nach glTF-Export, Eingang zeigt nach +Y (Blender) = Kamera-Seite."""
import sys, math, random, bpy, bmesh
OUT = sys.argv[-1]; random.seed(4)
bpy.ops.wm.read_factory_settings(use_empty=True)


def mat(name, col, rough=0.6, metal=0.0, emit=None, alpha=1.0):
    m = bpy.data.materials.new(name); m.use_nodes = True; b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*col, 1); b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    if emit: b.inputs['Emission Color'].default_value = (*emit, 1); b.inputs['Emission Strength'].default_value = 2.0
    if alpha < 1: b.inputs['Alpha'].default_value = alpha; m.blend_method = 'BLEND' if hasattr(m, 'blend_method') else None
    return m


M = {'facade': mat('Facade_White', (0.86, 0.86, 0.84), 0.7), 'band': mat('Facade_Band', (0.55, 0.58, 0.62), 0.5),
     'glass': mat('Glass_Window', (0.18, 0.28, 0.36), 0.08, 0.3), 'glow': mat('Glass_Lit', (0.9, 0.85, 0.6), 0.3, emit=(1.0, 0.85, 0.55)),
     'roof': mat('Roof_Gravel', (0.35, 0.35, 0.36), 0.95), 'ground': mat('Ground_Asphalt', (0.16, 0.16, 0.17), 0.9),
     'plaza': mat('Plaza_Stone', (0.62, 0.6, 0.56), 0.8), 'grass': mat('Grass', (0.18, 0.32, 0.14), 0.95),
     'heli': mat('Helipad_Red', (0.65, 0.08, 0.08), 0.6), 'line': mat('Paint_White', (0.95, 0.95, 0.95), 0.5),
     'leaf': mat('Tree_Leaf', (0.16, 0.36, 0.14), 0.9), 'trunk': mat('Tree_Trunk', (0.25, 0.17, 0.1), 0.9),
     'metal': mat('Metal', (0.6, 0.62, 0.65), 0.35, 0.8), 'sign': mat('Sign_Teal', (0.1, 0.6, 0.62), 0.4, emit=(0.2, 0.9, 0.95))}


def box(name, loc, size, m):
    bpy.ops.mesh.primitive_cube_add(location=loc); o = bpy.context.object; o.name = name; o.scale = (size[0] / 2, size[1] / 2, size[2] / 2)
    bpy.ops.object.transform_apply(scale=True); o.data.materials.append(m); return o


def windows(name, x0, y, z0, w, h, floors, cols, facing=-1, lit=0.25):
    """Fensterbänder auf einer Fassade (facing -1 = -Y, +1 = +Y)."""
    fh = h / floors; cw = w / cols; objs = []
    for f in range(floors):
        for c in range(cols):
            m = M['glow'] if random.random() < lit else M['glass']
            objs.append(box(f'{name}_w{f}_{c}', (x0 + (c + 0.5) * cw - w / 2, y + facing * 0.06, z0 + (f + 0.55) * fh), (cw * 0.78, 0.1, fh * 0.55), m))
    return objs


# Gelände
box('Ground', (0, 0, -0.05), (220, 160, 0.1), M['ground'])
box('Plaza', (0, 28, 0.02), (80, 26, 0.06), M['plaza'])
for x in (-50, 50): box(f'Lawn_{x}', (x, 30, 0.03), (24, 22, 0.08), M['grass'])
# Bettenhaus (Hochhaus)
H = 46; box('Tower', (0, -10, H / 2), (52, 18, H), M['facade'])
for f in range(12): box(f'Tower_band{f}', (0, -10, 3.6 + f * 3.6), (52.4, 18.4, 0.35), M['band'])
windows('TowerS', 0, -1, 1.5, 50, H - 3, 12, 18, facing=1)
windows('TowerN', 0, -19, 1.5, 50, H - 3, 12, 18, facing=-1, lit=0.15)
box('Tower_roof', (0, -10, H + 0.3), (52, 18, 0.6), M['roof'])
# Hubschrauber-Landeplatz auf dem Dach
bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=8, depth=0.5, location=(12, -10, H + 1.0)); hp = bpy.context.object; hp.name = 'Helipad'; hp.data.materials.append(M['heli'])
for i, (dx, dy, sx, sy) in enumerate([(-2, 0, 0.8, 6), (2, 0, 0.8, 6), (0, 0, 4, 0.8)]): box(f'Helipad_H{i}', (12 + dx, -10 + dy, H + 1.3), (sx, sy, 0.05), M['line'])
for i in range(4): box(f'Helipad_leg{i}', (12 + 5 * math.cos(i * math.pi / 2), -10 + 5 * math.sin(i * math.pi / 2), H + 0.5), (0.4, 0.4, 1.0), M['metal'])
# Flachbau-Riegel links/rechts
for sx in (-1, 1):
    box(f'Wing_{sx}', (sx * 48, -4, 7), (44, 30, 14), M['facade']); box(f'Wing_roof_{sx}', (sx * 48, -4, 14.2), (44, 30, 0.4), M['roof'])
    for f in range(3): box(f'Wing_band_{sx}_{f}', (sx * 48, -4, 4.4 + f * 4.4), (44.3, 30.3, 0.3), M['band'])
    windows(f'WingS_{sx}', sx * 48, 11, 0.8, 42, 13, 3, 14, facing=1)
# Glas-Eingangshalle
box('Lobby_glass', (0, 9, 4.5), (30, 12, 9), M['glass'])
box('Lobby_roof', (0, 9.5, 9.2), (34, 15, 0.5), M['band'])
for x in range(-14, 15, 4): box(f'Lobby_post{x}', (x, 15.2, 4.5), (0.3, 0.3, 9), M['metal'])
box('Entrance_door', (0, 15.1, 1.6), (6, 0.2, 3.2), M['glow'])
box('Sign_bar', (0, 15.4, 10.4), (16, 0.4, 1.6), M['sign'])           # neutrales Leuchtschild (kein Logo/Text)
# Vordach Notaufnahme (rechts)
box('ER_canopy', (36, 16, 4.2), (14, 8, 0.4), M['band'])
for x in (30, 42): box(f'ER_post{x}', (x, 19.5, 2.1), (0.4, 0.4, 4.2), M['metal'])
box('ER_sign', (36, 19.9, 4.9), (8, 0.3, 0.9), M['heli'])
# Bäume + Laternen
for i in range(14):
    x = random.uniform(-62, 62); y = random.uniform(22, 42)
    if abs(x) < 42 and y < 36: continue
    box(f'Tree_trunk{i}', (x, y, 1.5), (0.4, 0.4, 3), M['trunk'])
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=random.uniform(2.2, 3.2), location=(x, y, 4.2)); t = bpy.context.object; t.name = f'Tree_crown{i}'; t.data.materials.append(M['leaf'])
for i, x in enumerate(range(-36, 37, 12)):
    box(f'Lamp_pole{i}', (x, 40, 2.5), (0.15, 0.15, 5), M['metal']); box(f'Lamp_head{i}', (x, 40, 5.1), (0.8, 0.4, 0.2), M['glow'])
# Parkplatz-Linien
for i in range(16): box(f'Park_line{i}', (-60 + i * 8, 52, 0.04), (0.2, 6, 0.02), M['line'])
for o in bpy.data.objects:
    if o.type == 'MESH':
        for p in o.data.polygons: p.use_smooth = False
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_apply=True)
tris = sum(len(o.data.polygons) for o in bpy.data.objects if o.type == 'MESH')
print('OK', OUT, 'objects', len(bpy.data.objects), 'faces', tris)
