"""Kernmaterialien. Besitzer: Face-Abteilung. build_core.py ruft apply(base, eyes, D) am Ende auf.
Texturen kommen aus out/mh/tex/ (erzeugt von mh/face_textures.py); fehlen sie, werden die MPFB-Originale (CC0) verwendet."""
import os, sys, bpy
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mats

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
TEX = os.path.join(ROOT, 'out', 'mh', 'tex')


def T(name, fallback=None):
    p = os.path.join(TEX, name)
    return p if os.path.exists(p) else fallback


def apply(base, eyes, D):
    # ------------------------------------------------------------------ Materialien (einfaches PBR, glTF-kompatibel)
    skin_png = os.path.join(D, 'skins', 'toigo_light_skin_female_ginger_2', 'young_lightskinned_female_diffuse_Ginger2.png')
    dif = T('face_skin_diffuse.png', skin_png); nrm = T('face_skin_normal.png'); rgh = T('face_skin_rough.png')
    m_skin = mats.pbr('Alice_Skin', tex=dif, rough=0.52, spec=0.45, normal=nrm, normal_strength=1.0, rough_tex=rgh)
    mats.set_material(base, m_skin)
    m_eye = mats.pbr('Alice_Eye', tex=T('face_eye.png', os.path.join(D, 'eyes', 'materials', 'bluegreen_eye.png')), rough=0.10, spec=0.6)
    mats.set_material(eyes, m_eye)
    m_brow = mats.pbr('Alice_Brow', tex=os.path.join(D, 'eyebrows', 'eyebrow002', 'eyebrow002.png'), rough=0.6, alpha='BLEND',
                      tint=(0.62, 0.25, 0.12, 1), double_sided=True)   # volle, kupferrote Brauen (eyebrow002)
    mats.set_material(bpy.data.objects['Alice_Brows'], m_brow)
    m_lash = mats.pbr('Alice_Lash', tex=T('face_lash.png', os.path.join(D, 'eyelashes', 'eyelashes02', 'eyelashes02.png')), rough=0.6, alpha='BLEND',
                      tint=None if T('face_lash.png') else (0.35, 0.16, 0.10, 1), double_sided=True)
    mats.set_material(bpy.data.objects['Alice_Lashes'], m_lash)
    m_teeth = mats.pbr('Alice_Teeth', tex=T('face_teeth.png', os.path.join(D, 'teeth', 'teeth_base', 'teeth.png')), rough=0.35)
    mats.set_material(bpy.data.objects['Alice_Teeth'], m_teeth)
    m_tongue = mats.pbr('Alice_Tongue', tex=T('face_tongue.png', os.path.join(D, 'tongue', 'tongue01', 'tongue01_diffuse.png')), rough=0.4)
    mats.set_material(bpy.data.objects['Alice_Tongue'], m_tongue)
    for im in bpy.data.images:
        if im.source == 'FILE' and not im.packed_file:
            try: im.pack()
            except Exception as e: print('pack fail', im.name, e)
    # Kern-Shape-Keys auf ARKit-Standardnamen (ohne Präfix) für VRM-Tracking-Kompatibilität
    for o in bpy.data.objects:
        if o.type == 'MESH' and o.data.shape_keys:
            for kb in o.data.shape_keys.key_blocks:
                if kb.name.startswith('ARKit_'): kb.name = kb.name[6:]
