"""Catmull-Clark-Unterteilung von Alice_Body (+ Proxys) MIT Erhalt aller Shape Keys und Vertex-Gewichte.
  python3 mh/subdiv_core.py IN.blend OUT.blend [levels=1]
Verfahren: pro Shape Key den Subsurf-Modifier auswerten (Key=1, Rest=0), Koordinaten einsammeln, neues Mesh =
ausgewertete Basis + neue Shape Keys. Gewichte/UVs kommen aus dem ausgewerteten Basis-Mesh."""
import sys, bpy, numpy as np
src, dst = sys.argv[1], sys.argv[2]; LV = int(sys.argv[3]) if len(sys.argv) > 3 else 1
bpy.ops.wm.open_mainfile(filepath=src)


def subdiv(o, lv):
    keys = o.data.shape_keys.key_blocks if o.data.shape_keys else []
    names = [k.name for k in keys][1:]
    arm = [m for m in o.modifiers if m.type == 'ARMATURE']
    for m in o.modifiers: m.show_viewport = False
    sub = o.modifiers.new('hd', 'SUBSURF'); sub.levels = lv; sub.quality = 3; sub.uv_smooth = 'PRESERVE_BOUNDARIES'
    sub.show_viewport = True
    for k in keys: k.value = 0.0
    def ev():
        dg = bpy.context.evaluated_depsgraph_get(); e = o.evaluated_get(dg)
        me = e.to_mesh(); co = np.empty(len(me.vertices) * 3, np.float32); me.vertices.foreach_get('co', co); e.to_mesh_clear(); return co
    o.show_only_shape_key = False
    base = ev(); kco = {}
    for n in names:
        keys[n].value = 1.0; kco[n] = ev(); keys[n].value = 0.0
    dg = bpy.context.evaluated_depsgraph_get()
    newme = bpy.data.meshes.new_from_object(o.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
    old = o.data; o.modifiers.remove(sub)
    o.data = newme; newme.name = old.name
    if o.data.shape_keys: o.shape_key_clear()
    o.shape_key_add(name='Basis', from_mix=False)
    for n in names:
        sk = o.shape_key_add(name=n, from_mix=False); sk.data.foreach_set('co', kco[n]); sk.value = 0
    for m in arm: m.show_viewport = True
    for m in o.modifiers: m.show_viewport = True
    for p in o.data.polygons: p.use_smooth = True
    print('HD', o.name, len(old.vertices), '->', len(o.data.vertices), 'keys', len(names), 'groups', len(o.vertex_groups))


for nm in ['Alice_Body', 'Alice_Lashes', 'Alice_Brows']:
    o = bpy.data.objects.get(nm)
    if o: bpy.context.view_layer.objects.active = o; subdiv(o, LV if nm == 'Alice_Body' else 1)
bpy.ops.wm.save_as_mainfile(filepath=bpy.path.abspath(dst) if dst.startswith('//') else __import__('os').path.abspath(dst))
print('SAVED', dst)
