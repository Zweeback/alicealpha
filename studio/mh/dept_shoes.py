# Schuhe aus out/mh/core_extra.blend (MPFB CC0 shoes05, gefittet beim Core-Build) -> out/mh/shoes.blend (P_Shoes)
#   ALICE_EXTRA_CLOTHES=shoes05 mh/lock.sh python3 mh/build_core.py out/mh/core_extra.blend && python3 mh/dept_shoes.py
import os, sys, bpy
sys.path.insert(0, os.path.dirname(__file__)); import mats
D = __import__('os').environ.get('MPFB_DATA', '/root/.config/blender/5.2/extensions/.user/user_default/mpfb/data'); SH = 'shoes05'
bpy.ops.wm.open_mainfile(filepath='out/mh/core_extra.blend')
o = bpy.data.objects['P_' + SH]
bpy.context.view_layer.objects.active = o
for m in [m for m in o.modifiers if m.type != 'ARMATURE']: bpy.ops.object.modifier_apply(modifier=m.name)
for m in list(o.modifiers): o.modifiers.remove(m)
mw = o.matrix_world.copy(); o.parent = None; o.matrix_world = mw
bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
if o.data.shape_keys: o.shape_key_clear()
bones = {b.name for b in bpy.data.objects['Alice_Armature'].data.bones}
for g in list(o.vertex_groups):
    if g.name not in bones: o.vertex_groups.remove(g)
bpy.ops.object.vertex_group_limit_total(limit=4); bpy.ops.object.vertex_group_normalize_all(lock_active=False)
for p in o.data.polygons: p.use_smooth = True
f = lambda n: os.path.join(D, 'clothes', SH, n)
nrm = f(SH + '_normal.png')
mats.set_material(o, mats.pbr('Under_Shoes', tex=mats.load_img(f(SH + '_diffuse.png')), rough=0.55,
                              normal=mats.load_img(nrm, 'Non-Color') if os.path.exists(nrm) else None))
o.name = 'P_Shoes'
# Socken-Schaft entfernen (der Anzug reicht bis zum Knöchel)
import bmesh
bm = bmesh.new(); bm.from_mesh(o.data)
bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z > 0.105], context='VERTS'); bm.to_mesh(o.data); bm.free()
zs = [v.co.z for v in o.data.vertices]
print('P_Shoes verts', len(o.data.vertices), 'polys', len(o.data.polygons), 'z', round(min(zs), 3), round(max(zs), 3), 'groups', [g.name for g in o.vertex_groups])
for ob in list(bpy.data.objects):
    if ob.type == 'MESH' and ob is not o: bpy.data.objects.remove(ob)
bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath('out/mh/shoes.blend')); print('SAVED')
