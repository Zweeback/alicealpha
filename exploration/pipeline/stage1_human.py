"""Stufe 1: realistischer Mensch aus MPFB (MakeHuman-Basismesh, CC0-Assets) -> .blend
Aufruf: python3 mh/stage1_human.py OUT.blend
"""
import sys, os, bpy, addon_utils
D = '/root/.config/blender/5.2/extensions/.user/user_default/mpfb/data'
OUT = sys.argv[-1]
bpy.ops.wm.read_factory_settings(use_empty=True)
addon_utils.enable('bl_ext.user_default.mpfb', default_set=True)
from bl_ext.user_default.mpfb.services.humanservice import HumanService
from bl_ext.user_default.mpfb.services.targetservice import TargetService
from bl_ext.user_default.mpfb.services.objectservice import ObjectService

macro = TargetService.get_default_macro_info_dict()
macro.update({"gender": 0.0, "age": 0.5, "muscle": 0.42, "weight": 0.42, "proportions": 0.62, "height": 0.55,
              "cupsize": 0.55, "firmness": 0.6,
              "race": {"asian": 0.0, "caucasian": 1.0, "african": 0.0}})
base = HumanService.create_human(mask_helpers=True, detailed_helpers=True, extra_vertex_groups=True,
                                 feet_on_ground=True, scale=0.1, macro_detail_dict=macro)
base.name = 'Alice_Body'
print('BASE verts', len(base.data.vertices), 'dim', tuple(base.dimensions))
# Rig
rig = HumanService.add_builtin_rig(base, 'game_engine', import_weights=True)
print('RIG', rig.name if rig else None, len(rig.data.bones) if rig else 0)
# Skin
skin = os.path.join(D, 'skins', 'toigo_light_skin_female_ginger_2', 'toigo_light_skin_female_ginger_2.mhmat')
HumanService.set_character_skin(skin, base, skin_type='ENHANCED_SSS')
# Eyes, brows, lashes, teeth, tongue
def add(path, kind):
    try:
        o = HumanService.add_mhclo_asset(path, base, asset_type=kind, subdiv_levels=0, material_type='MAKESKIN' if kind != 'Eyes' else 'PROCEDURAL_EYES')
        print('ADDED', kind, o.name, len(o.data.vertices))
        return o
    except Exception as e:
        import traceback; traceback.print_exc(); print('FAIL', kind, path, e)
add(os.path.join(D, 'eyes', 'high-poly', 'high-poly.mhclo'), 'Eyes')
add(os.path.join(D, 'eyebrows', 'eyebrow006', 'eyebrow006.mhclo'), 'Eyebrows')
add(os.path.join(D, 'eyelashes', 'eyelashes02', 'eyelashes02.mhclo'), 'Eyelashes')
add(os.path.join(D, 'teeth', 'teeth_base', 'teeth_base.mhclo'), 'Teeth')
add(os.path.join(D, 'tongue', 'tongue01', 'tongue01.mhclo'), 'Tongue')
bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(OUT))
print('SAVED', OUT)
for o in bpy.data.objects:
    print('OBJ', o.type, o.name, len(o.data.vertices) if o.type == 'MESH' else '')
