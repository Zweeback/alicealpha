"""Haar-Abteilung (Alice).  python3 mh/dept_hair.py [--seed N] [--out out/mh/hair.blend]
Erzeugt: out/mh/hair.blend (P_HairCap, P_HairBangs, P_HairBun, P_HairLocks, P_HairWisps), out/mh/hair.json (Spring-Bones, Collider), Texturen out/mh/hair_tex/*.png.
Voraussetzung: out/mh/core.blend (wird nur gelesen)."""
import os, sys, json, argparse
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..'))
sys.path.insert(0, HERE)
import numpy as np
import bpy
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

ap = argparse.ArgumentParser()
ap.add_argument('--seed', type=int, default=7)
ap.add_argument('--core', default=os.path.join(ROOT, 'out/mh/core.blend'))
ap.add_argument('--out', default=os.path.join(ROOT, 'out/mh/hair.blend'))
ap.add_argument('--json', default=os.path.join(ROOT, 'out/mh/hair.json'))
ap.add_argument('--tex', default=os.path.join(ROOT, 'out/mh/hair_tex'))
ap.add_argument('--only', default='', help='Debug: nur diese P_-Objekte (Komma)')
ap.add_argument('--notex', action='store_true', help='Texturen nicht neu erzeugen')
a = ap.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:])


def log(*x): print('[hair]', *x, flush=True)


import hair_geom as G
import hair_style as H
import hair_tex as T
import hair_mat as M

# ------------------------------------------------------------------ Basis laden
bpy.ops.wm.open_mainfile(filepath=a.core)
body = bpy.data.objects['Alice_Body']; arm = bpy.data.objects['Alice_Armature']
os.makedirs(os.path.dirname(a.out), exist_ok=True)
cache = os.path.join(ROOT, 'out/mh/hair_scalp_R.npz')
scalp = G.Scalp(body, cache=cache)
dg = bpy.context.evaluated_depsgraph_get()
bvh = BVHTree.FromObject(body, dg)

# ------------------------------------------------------------------ Texturen
if a.notex and os.path.exists(os.path.join(a.tex, 'hair_strand.png')):
    paths = {k: os.path.join(a.tex, k + '.png') for k in ('hair_strand', 'hair_cap', 'hair_wisp')}
else:
    paths = T.build_all(a.tex)

# ------------------------------------------------------------------ Geometrie
rng = np.random.default_rng(a.seed)
cap = H.build_cap(scalp)
layers = H.build_layers(scalp, np.random.default_rng(a.seed + 1))
bangs = H.build_bangs(scalp, np.random.default_rng(a.seed + 2))
bun = H.build_bun(scalp, np.random.default_rng(a.seed + 3))
locks, bones, springs = H.build_locks(scalp, np.random.default_rng(a.seed + 4))
wisps = H.build_wisps(scalp, np.random.default_rng(a.seed + 5))

# Cap + Layers -> ein Objekt (zwei Materialien)
PARTS = [('P_HairCap', [(cap, 'cap'), (layers, 'strand')]), ('P_HairBangs', [(bangs, 'strand')]), ('P_HairBun', [(bun, 'strand')]),
         ('P_HairLocks', [(locks, 'strand')]), ('P_HairWisps', [(wisps, 'wisp')])]

if a.only:
    PARTS = [p for p in PARTS if p[0] in a.only.split(',')]

# ------------------------------------------------------------------ Durchdringung (Haut) aufloesen
CLEAR = {'cap': 0.0015, 'strand': 0.0022, 'wisp': 0.002}


def push_out(co, clear, iters=3):
    moved = 0
    for _ in range(iters):
        changed = 0
        for i in range(len(co)):
            p = Vector(co[i])
            loc, nor, idx, dist = bvh.find_nearest(p)
            if loc is None: continue
            inside = (p - loc).dot(nor) < 0
            if inside or dist < clear:
                co[i] = np.array(loc + nor * clear); changed += 1
        moved += changed
        if not changed: break
    return moved


def vertex_colors(acc, co, uv, oname, mkey, seed=99):
    """AO (Tiefe in der Frisur) x Clump-Tint pro Karte -> linear RGB."""
    rng_c = np.random.default_rng(seed + len(co))
    n = len(co); col = np.ones((n, 3))
    if mkey == 'cap':
        return col * 0.85
    # Tiefe
    if oname == 'P_HairBun':
        k = np.linalg.norm((co - H.BUN_C) / H.BUN_AX, axis=1)
        ao = 0.45 + 0.55 * G.smoothstep(0.55, 1.02, k)
    elif oname in ('P_HairLocks', 'P_HairWisps'):
        ao = 0.55 + 0.45 * G.smoothstep(0.0, 0.3, uv[:, 1])
    else:
        d = np.array([bvh.find_nearest(Vector(p))[3] for p in co])
        ao = 0.42 + 0.58 * G.smoothstep(0.003, 0.024, d)
    col *= ao[:, None]
    for (s0, s1) in acc.card_ranges:
        b = rng_c.uniform(0.80, 1.12); hue = rng_c.uniform(-0.10, 0.10)
        col[s0:s1] *= np.array([b, b * (1 + hue), b * (1 + 0.6 * hue)])
    return np.clip(col, 0, 1.2)


# ------------------------------------------------------------------ Blender-Objekte
mat = M.build_materials(paths)
for o in list(bpy.data.objects):
    if o.name.startswith('P_'): bpy.data.objects.remove(o, do_unlink=True)
objs = []; stats = []
for oname, parts in PARTS:
    cos, uvs, tris, nrs, mi, cols_ = [], [], [], [], [], []
    vg = {}; nv = 0
    for acc, mkey in parts:
        co, uv, tri, nr = acc.arrays()
        m = push_out(co, CLEAR[mkey])
        # Normalen nach Verschiebung neu glaetten: gespeicherte Normalen beibehalten (nur fuer Karten gesetzt)
        cols_.append(vertex_colors(acc, co, uv, oname, mkey))
        cos.append(co); uvs.append(uv); tris.append(tri + nv); nrs.append(nr)
        mi.append(np.full(len(tri), [k for k, (pp, mm) in enumerate(parts) if pp is acc][0]))
        for g, (idx, ww) in acc.vg.items():
            gi, gw = vg.setdefault(g, ([], []))
            gi.append(np.concatenate(idx) + nv); gw.append(np.concatenate(ww))
        nv += len(co)
        if m: log(f'  {oname}/{mkey}: {m} Vertices aus der Haut geschoben')
    co = np.vstack(cos); uv = np.vstack(uvs); tri = np.vstack(tris); nr = np.vstack(nrs); mi = np.concatenate(mi)
    me = bpy.data.meshes.new(oname)
    me.from_pydata(co.tolist(), [], tri.tolist())
    me.update()
    uvl = me.uv_layers.new(name='UVMap')
    lv = np.empty(len(me.loops), dtype=np.int32); me.loops.foreach_get('vertex_index', lv)
    uvl.data.foreach_set('uv', uv[lv].ravel())
    vcol = np.vstack(cols_)
    ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
    ca.data.foreach_set('color', np.hstack([vcol, np.ones((len(vcol), 1))]).astype(np.float32).ravel())
    me.polygons.foreach_set('use_smooth', np.ones(len(me.polygons), dtype=bool))
    me.polygons.foreach_set('material_index', mi.astype(np.int32))
    for _, mkey in parts: me.materials.append(mat[mkey])
    ok = ~np.isnan(nr).any(axis=1)
    if ok.all():
        me.normals_split_custom_set_from_vertices([tuple(x) for x in nr])
    ob = bpy.data.objects.new(oname, me)
    bpy.context.scene.collection.objects.link(ob)
    for g, (gi, gw) in vg.items():
        grp = ob.vertex_groups.new(name=g)
        gi = np.concatenate(gi); gw = np.concatenate(gw)
        for i, w in zip(gi.tolist(), gw.tolist()): grp.add([i], float(w), 'REPLACE')
    objs.append(ob)
    stats.append((oname, len(me.vertices), len(me.polygons)))
    log(f'{oname}: {len(me.vertices)} Verts, {len(me.polygons)} Tris')

# ------------------------------------------------------------------ Collider (Bone-lokal) + Spring-JSON
def bone_local(bone, p):
    m = arm.data.bones[bone].matrix_local
    v = m.inverted() @ Vector(p)
    return [float(v.x), float(v.y), float(v.z)]


def collider_defs():
    b = arm.data.bones
    C = G.C_HEAD
    out = [
        dict(name='c_head', bone='head', type='sphere', world=[C[0], C[1], C[2] - 0.004], radius=0.074),
        dict(name='c_cheek', bone='head', type='capsule', world=[-0.026, -0.07, 1.486], world_tail=[0.026, -0.07, 1.486], radius=0.040),
        dict(name='c_neck', bone='neck_01', type='capsule', world=list(b['neck_01'].head_local), world_tail=list(b['neck_01'].tail_local), radius=0.044),
        dict(name='c_shoulder_l', bone='clavicle_l', type='capsule', world=list(b['clavicle_l'].head_local), world_tail=list(b['clavicle_l'].tail_local), radius=0.050),
        dict(name='c_shoulder_r', bone='clavicle_r', type='capsule', world=list(b['clavicle_r'].head_local), world_tail=list(b['clavicle_r'].tail_local), radius=0.050),
        dict(name='c_chest', bone='spine_03', type='capsule', world=list(b['spine_03'].head_local), world_tail=list(b['spine_03'].tail_local), radius=0.105),
    ]
    return out


def seg_dist(p, a_, b_):
    p, a_, b_ = map(np.asarray, (p, a_, b_))
    ab = b_ - a_; t = np.clip(np.dot(p - a_, ab) / max(np.dot(ab, ab), 1e-12), 0, 1)
    return np.linalg.norm(p - (a_ + ab * t))


cols = collider_defs()
joints = {bn['name']: np.array(bn['head']) for bn in bones}
joints.update({bn['name'] + '_tail': np.array(bn['tail']) for bn in bones})
for c in cols:
    wa = np.array(c['world']); wb = np.array(c.get('world_tail', c['world']))
    hit = 0.012
    dmin = min(seg_dist(p, wa, wb) for p in joints.values())
    if dmin - hit - 0.003 < c['radius']:
        new = max(0.02, dmin - hit - 0.003)
        log(f"  Collider {c['name']}: Radius {c['radius']:.3f} -> {new:.3f} (Ruhepose-Abstand {dmin:.3f})")
        c['radius'] = new
    c['clear'] = float(dmin)
json_cols = []
for c in cols:
    d = dict(name=c['name'], bone=c['bone'], type=c['type'], offset=bone_local(c['bone'], c['world']), radius=round(float(c['radius']), 4))
    if c['type'] == 'capsule': d['tail'] = bone_local(c['bone'], c['world_tail'])
    json_cols.append(d)

jd = dict(bones=bones, springs=springs, colliders=json_cols, body_remove_verts=[])
os.makedirs(os.path.dirname(a.json), exist_ok=True)
json.dump(jd, open(a.json, 'w'), indent=1)
log('JSON:', a.json, len(bones), 'Bones,', len(springs), 'Springs,', len(json_cols), 'Collider')

# ------------------------------------------------------------------ Aufraeumen + Speichern
for o in list(bpy.data.objects):
    if not o.name.startswith('P_'): bpy.data.objects.remove(o, do_unlink=True)
for coll in (bpy.data.meshes, bpy.data.armatures, bpy.data.materials, bpy.data.images, bpy.data.textures):
    for d in list(coll):
        if d.users == 0: coll.remove(d)
for img in bpy.data.images:
    if img.packed_file is None and img.filepath: img.pack()
tot = sum(s[2] for s in stats)
bpy.ops.wm.save_as_mainfile(filepath=a.out)
log(f'GESAMT {sum(s[1] for s in stats)} Verts, {tot} Tris -> {a.out}')
