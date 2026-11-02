"""Generischer deutscher Rettungswagen (RTW, Kastenaufbau) -> GLB.  python3 mh/build_rtw.py OUT.glb
Keine Marken/Logos/Schriftzüge: weißer Koffer, rot-retroreflektierende Streifen, Blaulichtbalken, Heck-Blitzer.
Maße ~ 6,9 x 2,3 x 2,9 m, Fahrzeug-Front zeigt nach -Y (Blender) bzw. +Z (glTF). Ursprung = Boden-Mitte."""
import sys, math, bpy
OUT = sys.argv[-1]
bpy.ops.wm.read_factory_settings(use_empty=True)


def mat(n, c, r=0.4, m=0.0, e=None, es=3.0):
    M = bpy.data.materials.new(n); M.use_nodes = True; b = M.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*c, 1); b.inputs['Roughness'].default_value = r; b.inputs['Metallic'].default_value = m
    if e: b.inputs['Emission Color'].default_value = (*e, 1); b.inputs['Emission Strength'].default_value = es
    return M


W, R, BK, GL, CH, BL, OR, AM = (mat('RTW_White', (0.92, 0.92, 0.9), 0.3), mat('RTW_RedStripe', (0.8, 0.05, 0.04), 0.35),
    mat('RTW_Black', (0.03, 0.03, 0.035), 0.6), mat('RTW_Glass', (0.05, 0.08, 0.1), 0.05, 0.2), mat('RTW_Chrome', (0.7, 0.7, 0.72), 0.2, 1.0),
    mat('RTW_BlueLight', (0.05, 0.25, 1.0), 0.2, e=(0.1, 0.35, 1.0), es=6), mat('RTW_Orange', (0.95, 0.45, 0.05), 0.3, e=(1, 0.4, 0.0), es=1.5),
    mat('RTW_Headlight', (0.95, 0.95, 0.9), 0.1, e=(1, 0.97, 0.9), es=2))


def box(n, loc, size, m, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(location=loc); o = bpy.context.object; o.name = n; o.scale = [s / 2 for s in size]
    bpy.ops.object.transform_apply(scale=True); o.data.materials.append(m)
    if bevel:
        b = o.modifiers.new('bv', 'BEVEL'); b.width = bevel; b.segments = 3; bpy.ops.object.modifier_apply(modifier='bv')
    for p in o.data.polygons: p.use_smooth = bevel > 0
    return o


# Fahrerhaus (vorn, -Y) + Motorhaube
box('Cab', (0, -2.55, 1.45), (2.05, 1.6, 1.9), W, 0.12)
box('Hood', (0, -3.45, 0.95), (2.0, 0.6, 0.9), W, 0.12)
box('Windshield', (0, -3.12, 1.85), (1.86, 0.06, 0.9), GL); bpy.context.object.rotation_euler.x = math.radians(-22)
for s in (-1, 1): box(f'SideWindow{s}', (s * 1.03, -2.6, 1.85), (0.04, 0.95, 0.7), GL)
box('Grille', (0, -3.76, 0.85), (1.3, 0.04, 0.4), BK)
for s in (-1, 1): box(f'Headlight{s}', (s * 0.78, -3.76, 1.05), (0.34, 0.05, 0.18), AM)
box('Bumper', (0, -3.8, 0.45), (2.1, 0.18, 0.28), BK, 0.04)
# Koffer-Aufbau
box('Box', (0, 0.95, 1.6), (2.3, 4.4, 2.5), W, 0.08)
box('BoxSkirt', (0, 0.95, 0.42), (2.32, 4.4, 0.2), BK)
# rot-reflektierende Seitenstreifen (zwei Bänder, wie bei RTW üblich)
for s in (-1, 1):
    box(f'StripeLow{s}', (s * 1.16, -0.45, 0.82), (0.02, 7.0, 0.22), R)
    box(f'StripeHigh{s}', (s * 1.16, 0.95, 2.45), (0.02, 4.4, 0.16), R)
    box(f'SideDoor{s}', (s * 1.16, -0.4, 1.35), (0.02, 1.1, 1.6), W)
    box(f'SideDoorWin{s}', (s * 1.17, -0.4, 1.85), (0.02, 0.7, 0.5), GL)
    for y in (2.5, 3.0): box(f'Marker{s}{y}', (s * 1.16, y, 0.75), (0.03, 0.12, 0.06), OR)
# Heck: Türen, Streifen in Warnmarkierung, Heckblitzer
box('RearDoors', (0, 3.16, 1.5), (2.0, 0.04, 2.1), W)
for i in range(5): box(f'RearChevron{i}', (-0.8 + i * 0.4, 3.18, 0.75), (0.18, 0.02, 0.3), R if i % 2 == 0 else W)
for s in (-1, 1): box(f'RearBlue{s}', (s * 1.0, 3.18, 2.7), (0.2, 0.05, 0.14), BL); box(f'RearLight{s}', (s * 1.0, 3.18, 0.62), (0.18, 0.05, 0.35), R)
# Blaulichtbalken auf dem Fahrerhaus + Frontblitzer + Dach-Blaulichter am Koffer
box('LightBarBase', (0, -2.55, 2.45), (1.6, 0.35, 0.08), BK)
for x in (-0.55, 0.55): box(f'LightBarBlue{x}', (x, -2.55, 2.55), (0.5, 0.3, 0.14), BL, 0.03)
box('LightBarMid', (0, -2.55, 2.53), (0.5, 0.28, 0.1), W)
for s in (-1, 1): box(f'FrontFlash{s}', (s * 0.35, -3.78, 0.85), (0.14, 0.03, 0.08), BL)
for s in (-1, 1): box(f'BoxRoofBlue{s}', (s * 0.9, -1.2, 2.92), (0.22, 0.22, 0.12), BL, 0.03)
# Spiegel
for s in (-1, 1):
    box(f'MirrorArm{s}', (s * 1.15, -3.0, 1.75), (0.25, 0.04, 0.04), BK); box(f'Mirror{s}', (s * 1.3, -3.0, 1.65), (0.06, 0.18, 0.32), BK, 0.02)
# Räder (Zwillingsbereifung hinten angedeutet)
for y in (-2.85, 2.0):
    for s in (-1, 1):
        bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=0.38, depth=0.28 if y < 0 else 0.42, location=(s * 1.0, y, 0.38), rotation=(0, math.pi / 2, 0))
        t = bpy.context.object; t.name = f'Tire{s}{y}'; t.data.materials.append(BK)
        for p in t.data.polygons: p.use_smooth = True
        bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=0.22, depth=0.02, location=(s * (1.0 + (0.15 if y < 0 else 0.22)), y, 0.38), rotation=(0, math.pi / 2, 0))
        h = bpy.context.object; h.name = f'Hub{s}{y}'; h.data.materials.append(CH)
for o in bpy.data.objects: o.select_set(True)
bpy.context.view_layer.objects.active = bpy.data.objects['Box']; bpy.ops.object.join(); bpy.context.object.name = 'RTW'
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB')
print('OK', OUT, len(bpy.context.object.data.polygons), 'faces')
