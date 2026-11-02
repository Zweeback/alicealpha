"""Haar-Abteilung: Materialien ueber mh/mats.py (+ Alpha-Clip-Fix, damit MASK im glTF wirklich als alphaMode MASK exportiert wird)."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
import mats


def ensure_mask(mat, cutoff):
    """Blender 5.x glTF-Exporter erkennt MASK nur ueber einen Math-Knoten 'Greater Than' zwischen Textur-Alpha und BSDF-Alpha.
    (mats.pbr setzt nur blend_method, das der Exporter ignoriert -> BLEND.) Idempotent."""
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    lk = bsdf.inputs['Alpha'].links
    if not lk: return
    src = lk[0].from_node
    if src.type == 'MATH': return
    gt = nt.nodes.new('ShaderNodeMath'); gt.operation = 'GREATER_THAN'; gt.inputs[1].default_value = cutoff
    gt.location = (200, -250)
    from_sock = lk[0].from_socket
    nt.links.remove(lk[0])
    nt.links.new(from_sock, gt.inputs[0]); nt.links.new(gt.outputs[0], bsdf.inputs['Alpha'])


def add_vertex_color(mat, layer='Col'):
    """Basisfarbe = Textur x Vertex-Farbe (exportiert als glTF COLOR_0; AO/Clump-Tint pro Karte). Idempotent."""
    nt = mat.node_tree
    if any(n.type == 'VERTEX_COLOR' for n in nt.nodes): return
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    tex = next(n for n in nt.nodes if n.type == 'TEX_IMAGE')
    vc = nt.nodes.new('ShaderNodeVertexColor'); vc.layer_name = layer; vc.location = (-300, 350)
    mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'; mix.inputs['Factor'].default_value = 1.0
    mix.location = (100, 200)
    nt.links.new(tex.outputs['Color'], mix.inputs[6]); nt.links.new(vc.outputs['Color'], mix.inputs[7]); nt.links.new(mix.outputs[2], bsdf.inputs['Base Color'])


def build_materials(paths, cutoff=0.35):
    strand = mats.pbr('Hair_Strand', tex=paths['hair_strand'], rough=0.48, spec=0.32, alpha='MASK', cutoff=cutoff, double_sided=True)
    ensure_mask(strand, cutoff)
    cap = mats.pbr('Hair_Cap', tex=paths['hair_cap'], rough=0.6, spec=0.25, alpha='MASK', cutoff=cutoff, double_sided=True)
    ensure_mask(cap, cutoff)
    wisp = mats.pbr('Hair_Wisp', tex=paths['hair_wisp'], rough=0.5, spec=0.3, alpha='BLEND', double_sided=True)
    for m in (strand, cap, wisp):
        add_vertex_color(m)
        for n in m.node_tree.nodes:
            if n.type == 'TEX_IMAGE' and n.image: n.image.pack()
    return dict(strand=strand, cap=cap, wisp=wisp)
