"""Kern-Build: realistischer Alice-Körper aus MPFB (CC0) -> out/mh/core.blend
  python3 mh/build_core.py OUT.blend
Enthält: Gesichts-Design (Targets gebacken), Skin, Augen/Brauen/Wimpern/Zähne/Zunge, game_engine-Rig + Augenknochen,
ARKit-52 + Oculus-Visemes als Shape Keys (auch auf den Proxys), Helfergeometrie entfernt."""
import sys, os, gzip, math, bpy, bmesh, addon_utils
from mathutils import Vector
OUT = sys.argv[-1]
D = '/root/.config/blender/5.2/extensions/.user/user_default/mpfb/data'
FU = '/tmp/claude-0/-home-claude/ba6ce5eb-0729-5bb9-9dab-f777d50aa901/scratchpad/mh_dl/func'
bpy.ops.wm.read_factory_settings(use_empty=True)
addon_utils.enable('bl_ext.user_default.mpfb', default_set=True)
from bl_ext.user_default.mpfb.services.humanservice import HumanService
from bl_ext.user_default.mpfb.services.targetservice import TargetService
from bl_ext.user_default.mpfb.services.locationservice import LocationService
from bl_ext.user_default.mpfb.entities.clothes.mhclo import Mhclo as MHCLO

# ------------------------------------------------------------------ 1. Mensch + Makro
macro = TargetService.get_default_macro_info_dict()
macro.update({"gender": 0.0, "age": 0.5, "muscle": 0.40, "weight": 0.40, "proportions": 0.65, "height": 0.52,
              "cupsize": 0.58, "firmness": 0.6, "race": {"asian": 0.0, "caucasian": 1.0, "african": 0.0}})
base = HumanService.create_human(mask_helpers=False, detailed_helpers=True, extra_vertex_groups=True,
                                 feet_on_ground=True, scale=0.1, macro_detail_dict=macro)
base.name = 'Alice_Body'
T = LocationService.get_mpfb_data('targets')
# Gesichts-Design (Alice: junges, herzförmiges Gesicht, große Augen, feine Nase, volle Lippen)
DESIGN = {
 'head/head-oval': .45, 'cheek/l-cheek-bones-incr': .30, 'cheek/r-cheek-bones-incr': .30,
 'chin/chin-width-decr': .30, 'chin/chin-height-decr': .15, 'forehead/forehead-scale-vert-decr': .2,
 'eyes/l-eye-scale-incr': .40, 'eyes/r-eye-scale-incr': .40,
 'eyes/l-eye-height1-incr': .25, 'eyes/r-eye-height1-incr': .25, 'eyes/l-eye-height2-incr': .25, 'eyes/r-eye-height2-incr': .25,
 'eyes/l-eye-corner2-up': .25, 'eyes/r-eye-corner2-up': .25, 'eyes/l-eye-trans-in': .0, 'eyes/r-eye-trans-in': .0,
 'nose/nose-scale-vert-decr': .25, 'nose/nose-width1-decr': .35, 'nose/nose-width2-decr': .25, 'nose/nose-point-up': .2,
 'nose/nose-volume-decr': .25, 'nose/nose-nostrils-width-decr': .2,
 'mouth/mouth-upperlip-volume-incr': .25, 'mouth/mouth-lowerlip-volume-incr': .35, 'mouth/mouth-cupidsbow-incr': .35,
 'mouth/mouth-angles-up': .25, 'mouth/mouth-scale-horiz-decr': .1,
 'eyebrows/eyebrows-angle-up': .25, 'eyebrows/eyebrows-trans-up': .15,
 'ears/l-ear-scale-decr': .35, 'ears/r-ear-scale-decr': .35,
 'neck/neck-scale-horiz-decr': .15, 'neck/neck-scale-vert-incr': .2,
}
for k, w in DESIGN.items():
    if w == 0: continue
    p = os.path.join(T, k + '.target.gz')
    if not os.path.exists(p):
        print('MISSING target', k); continue
    TargetService.load_target(base, p, weight=w, name='design_' + k.replace('/', '_'))
TargetService.bake_targets(base)
print('BASE verts', len(base.data.vertices))

# ------------------------------------------------------------------ 2. Rig, Skin, Proxys
rig = HumanService.add_builtin_rig(base, 'game_engine', import_weights=True)
rig.name = 'Alice_Armature'
skin = os.path.join(D, 'skins', 'toigo_light_skin_female_ginger_2', 'toigo_light_skin_female_ginger_2.mhmat')
HumanService.set_character_skin(skin, base, skin_type='ENHANCED_SSS')
ASSETS = {}
def add(path, kind, key):
    o = HumanService.add_mhclo_asset(path, base, asset_type=kind, subdiv_levels=0,
                                     material_type='MAKESKIN' if kind != 'Eyes' else 'PROCEDURAL_EYES')
    ASSETS[key] = (o, path)
    return o
add(os.path.join(D, 'eyes', 'low-poly', 'low-poly.mhclo'), 'Eyes', 'Eyes')
add(os.path.join(D, 'eyebrows', 'eyebrow006', 'eyebrow006.mhclo'), 'Eyebrows', 'Brows')
add(os.path.join(D, 'eyelashes', 'eyelashes02', 'eyelashes02.mhclo'), 'Eyelashes', 'Lashes')
add(os.path.join(D, 'teeth', 'teeth_base', 'teeth_base.mhclo'), 'Teeth', 'Teeth')
add(os.path.join(D, 'tongue', 'tongue01', 'tongue01.mhclo'), 'Tongue', 'Tongue')
for _c in [c for c in os.environ.get('ALICE_EXTRA_CLOTHES', '').split(',') if c]:   # z. B. shoes05 -> P_<name> (ohne Shape Keys)
    _o = HumanService.add_mhclo_asset(os.path.join(D, 'clothes', _c, _c + '.mhclo'), base, asset_type='Clothes', subdiv_levels=0, material_type='MAKESKIN')
    _o.name = 'P_' + _c; print('EXTRA', _c, len(_o.data.vertices))
for k, (o, p) in ASSETS.items():
    o.name = 'Alice_' + k
    print('ASSET', k, len(o.data.vertices))

# Augen: glatt unterteilen (96 -> ~1.5k Verts); starr am Augenknochen, daher ohne Shape Keys
_eo = bpy.data.objects['Alice_Eyes']
bpy.ops.object.select_all(action='DESELECT'); bpy.context.view_layer.objects.active = _eo; _eo.select_set(True)
_m = _eo.modifiers.new('sub', 'SUBSURF'); _m.levels = 2; _m.render_levels = 2
bpy.ops.object.modifier_apply(modifier='sub')
for _p in _eo.data.polygons: _p.use_smooth = True
print('EYES verts after subsurf', len(_eo.data.vertices))
# ------------------------------------------------------------------ 3. ARKit + Visemes als Shape Keys
base.shape_key_add(name='Basis', from_mix=False)
def tgt_path(pack, sub, name): return os.path.join(FU, pack, 'targets', sub, name + '.target')
ARKIT = sorted(f[:-7] for f in os.listdir(os.path.join(FU, 'faceunits01/targets/faceunits')) if f.endswith('.target'))
VIS = sorted(f[:-7] for f in os.listdir(os.path.join(FU, 'visemes02/targets/visemes')) if f.endswith('.target'))
names = []
for n in ARKIT:
    TargetService.load_target(base, tgt_path('faceunits01', 'faceunits', n), weight=0.0, name='ARKit_' + n); names.append('ARKit_' + n)
for n in VIS:
    TargetService.load_target(base, tgt_path('visemes02', 'visemes', n), weight=0.0, name=n); names.append(n)
print('KEYS', len(names))
bkeys = base.data.shape_keys.key_blocks
basis = bkeys['Basis']
# Proxy-Mapping (mhclo) -> Shape Keys
nb = len(base.data.vertices)
import numpy as np
bco = np.empty(nb * 3, dtype=np.float32); basis.data.foreach_get('co', bco); bco = bco.reshape(-1, 3)
for key, (o, path) in ASSETS.items():
    if key == 'Eyes': continue
    m = MHCLO(); m.load(path)
    nv = len(o.data.vertices)
    idx = np.zeros((nv, 3), dtype=np.int64); wts = np.zeros((nv, 3), dtype=np.float32)
    for i in range(nv):
        d = m.verts[i]; idx[i] = d['verts']; wts[i] = d['weights']
    o.shape_key_add(name='Basis', from_mix=False)
    pco = np.empty(nv * 3, dtype=np.float32); o.data.shape_keys.key_blocks['Basis'].data.foreach_get('co', pco); pco = pco.reshape(-1, 3)
    # Proxy-Vertices liegen im selben Raum wie die Basemesh (beide am Rig-Parent, identische Transform?) -> Weltraum-Differenz verwenden
    for n in names:
        kb = bkeys[n]
        kc = np.empty(nb * 3, dtype=np.float32); kb.data.foreach_get('co', kc); kc = kc.reshape(-1, 3)
        disp = kc - bco
        pd = (disp[idx[:, 0]] * wts[:, 0:1] + disp[idx[:, 1]] * wts[:, 1:2] + disp[idx[:, 2]] * wts[:, 2:3])
        sk = o.shape_key_add(name=n, from_mix=False)
        sk.data.foreach_set('co', (pco + pd).reshape(-1))
        sk.value = 0.0
print('PROXY shape keys done')

# ------------------------------------------------------------------ 4. Helfergeometrie entfernen
bm = bmesh.new(); bm.from_mesh(base.data)
vg = base.vertex_groups['body'].index
dl = bm.verts.layers.deform.verify()
rm = [v for v in bm.verts if vg not in v[dl] or v[dl][vg] < 0.5]
bmesh.ops.delete(bm, geom=rm, context='VERTS')
bm.to_mesh(base.data); bm.free()
bone_names = {b.name for b in rig.data.bones}
for g in list(base.vertex_groups):
    if g.name not in bone_names: base.vertex_groups.remove(g)
for m in list(base.modifiers):
    if m.type == 'MASK': base.modifiers.remove(m)
print('BODY verts after helper removal', len(base.data.vertices))

# ------------------------------------------------------------------ 5. Augenknochen
eyes = bpy.data.objects['Alice_Eyes']
ev = [eyes.matrix_world @ v.co for v in eyes.data.vertices]
L = [p for p in ev if p.x > 0]; R = [p for p in ev if p.x < 0]
def centre(ps): return sum(ps, Vector()) / len(ps)
cl, cr = centre(L), centre(R)
print('EYE centres', cl, cr)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode='EDIT')
eb = rig.data.edit_bones
head = eb['head']
for nm, c in (('eye_l', cl), ('eye_r', cr)):
    b = eb.new(nm); b.head = rig.matrix_world.inverted() @ c; b.tail = rig.matrix_world.inverted() @ (c + Vector((0, -0.02, 0)))
    b.parent = head; b.use_connect = False
bpy.ops.object.mode_set(mode='OBJECT')
# Gewichte der Augen: alles auf Augenknochen
for g in list(eyes.vertex_groups): eyes.vertex_groups.remove(g)
gl = eyes.vertex_groups.new(name='eye_l'); gr = eyes.vertex_groups.new(name='eye_r')
for v in eyes.data.vertices:
    (gl if (eyes.matrix_world @ v.co).x > 0 else gr).add([v.index], 1.0, 'REPLACE')

# ------------------------------------------------------------------ 6. Materialien (Face-Abteilung: mh/core_materials.py)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import core_materials
core_materials.apply(base, eyes, D)
bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(OUT))
print('SAVED', OUT)
for o in bpy.data.objects:
    print('OBJ', o.type, o.name, len(o.data.vertices) if o.type == 'MESH' else '', o.parent.name if o.parent else '')
