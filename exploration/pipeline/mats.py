"""PBR-Material-Helfer für die Alice-Pipeline (nur einfache Principled-Setups -> exportieren sauber als glTF-PBR im VRM).
Konventionen: Basisfarbe = Textur x Tint; Alpha aus Textur-Alpha; keine eigenen Node-Gruppen, kein SSS."""
import os, bpy


def load_img(path, colorspace='sRGB', name=None):
    im = bpy.data.images.load(os.path.abspath(path), check_existing=True)
    if name: im.name = name
    im.colorspace_settings.name = colorspace
    return im


def pbr(name, color=(1, 1, 1, 1), tex=None, rough=0.5, metal=0.0, spec=0.5, normal=None, normal_strength=1.0,
        rough_tex=None, emit=None, emit_strength=1.0, alpha='OPAQUE', cutoff=0.5, double_sided=False, tint=None,
        sss=0.0, sss_color=None, coat=0.0, coat_rough=0.05):
    """alpha: 'OPAQUE' | 'BLEND' | 'MASK' (Alpha aus tex.alpha). tex/normal/rough_tex = bpy Image oder Pfad."""
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial'); out.location = (700, 0)
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled'); bsdf.location = (400, 0)
    nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    bsdf.inputs['Metallic'].default_value = metal
    bsdf.inputs['Roughness'].default_value = rough
    for k in ('Specular IOR Level', 'Specular'):
        if k in bsdf.inputs: bsdf.inputs[k].default_value = spec; break
    if sss and 'Subsurface Weight' in bsdf.inputs:
        bsdf.inputs['Subsurface Weight'].default_value = sss
        if sss_color: bsdf.inputs['Subsurface Radius'].default_value = sss_color
    if coat and 'Coat Weight' in bsdf.inputs:
        bsdf.inputs['Coat Weight'].default_value = coat; bsdf.inputs['Coat Roughness'].default_value = coat_rough
    def _im(x, cs):
        return x if isinstance(x, bpy.types.Image) else load_img(x, cs)
    last = None
    if tex is not None:
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = _im(tex, 'sRGB'); t.location = (-300, 100)
        t.interpolation = 'Smart' if False else 'Linear'
        if tint is not None:
            mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'; mix.location = (50, 100)
            mix.inputs['Factor'].default_value = 1.0
            mix.inputs[7].default_value = tuple(tint) if len(tint) == 4 else tuple(tint) + (1,)
            nt.links.new(t.outputs['Color'], mix.inputs[6]); nt.links.new(mix.outputs[2], bsdf.inputs['Base Color'])
        else:
            nt.links.new(t.outputs['Color'], bsdf.inputs['Base Color'])
        if alpha != 'OPAQUE':
            nt.links.new(t.outputs['Alpha'], bsdf.inputs['Alpha'])
    else:
        bsdf.inputs['Base Color'].default_value = tuple(color) if len(color) == 4 else tuple(color) + (1,)
    if rough_tex is not None:
        r = nt.nodes.new('ShaderNodeTexImage'); r.image = _im(rough_tex, 'Non-Color'); r.location = (-300, -200)
        nt.links.new(r.outputs['Color'], bsdf.inputs['Roughness'])
    if normal is not None:
        n = nt.nodes.new('ShaderNodeTexImage'); n.image = _im(normal, 'Non-Color'); n.location = (-300, -500)
        nm = nt.nodes.new('ShaderNodeNormalMap'); nm.location = (50, -500); nm.inputs['Strength'].default_value = normal_strength
        nt.links.new(n.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
    if emit is not None:
        bsdf.inputs['Emission Color'].default_value = tuple(emit) if len(emit) == 4 else tuple(emit) + (1,)
        bsdf.inputs['Emission Strength'].default_value = emit_strength
    m.use_backface_culling = not double_sided
    if alpha == 'BLEND':
        m.surface_render_method = 'BLENDED'
        try: m.blend_method = 'BLEND'
        except Exception: pass
    elif alpha == 'MASK':
        m.surface_render_method = 'DITHERED'
        try: m.blend_method = 'CLIP'; m.alpha_threshold = cutoff
        except Exception: pass
    else:
        m.surface_render_method = 'DITHERED'
    return m


def set_material(obj, mat, replace=True):
    if replace: obj.data.materials.clear()
    obj.data.materials.append(mat)
    for p in obj.data.polygons: p.material_index = 0
