#!/usr/bin/env python3
"""Convert Alice's existing FBX without declaring its identity or rig approved.
Run with Blender: blender --background --python tools/convert_alice_source_fbx.py
"""
import bpy
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path.cwd()
SOURCE = ROOT / 'public/avatars/candidates/model.fbx'
TARGET = ROOT / 'public/avatars/alice-fbx-source.glb'
REPORT = ROOT / 'public/avatars/alice-fbx-source.json'
EXPECTED_SOURCE_SHA256 = 'da4e5c3bc65b21bdbf9c73c2651df81a645bb315d747c2d9383aa0da025e4c59'

def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

if not SOURCE.is_file() or sha256(SOURCE) != EXPECTED_SOURCE_SHA256:
    raise SystemExit('Source model.fbx is missing or fails the recorded SHA-256; stopping.')

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.fbx(filepath=str(SOURCE), use_anim=True)

meshes = [obj for obj in bpy.data.objects if obj.type == 'MESH']
armatures = [obj for obj in bpy.data.objects if obj.type == 'ARMATURE']
if not meshes:
    raise SystemExit('FBX produced no mesh; no GLB candidate created.')

weighted_meshes = []
for obj in meshes:
    armature_mods = [mod for mod in obj.modifiers
                     if mod.type == 'ARMATURE' and mod.object and mod.object.type == 'ARMATURE']
    has_bone_weights = any(any(group.weight > 0 for group in vertex.groups)
                           for vertex in obj.data.vertices)
    if armature_mods and has_bone_weights:
        weighted_meshes.append(obj.name)

blendshapes = {
    obj.name: [key.name for key in obj.data.shape_keys.key_blocks][1:]
    for obj in meshes if obj.data.shape_keys and len(obj.data.shape_keys.key_blocks) > 1
}
armature_bones = {obj.name: [bone.name for bone in obj.data.bones] for obj in armatures}
actions = [a.name for a in bpy.data.actions]

TARGET.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=str(TARGET), export_format='GLB',
    use_selection=False, export_skins=True,
    export_animations=True, export_morph=True,
    export_cameras=False, export_lights=False,
)
if TARGET.stat().st_size > 25 * 1024 * 1024:
    TARGET.unlink()
    raise SystemExit('Converted candidate exceeds the 25 MB in-browser limit.')

report = {
    'id': 'alice-fbx-source-conversion-20261014',
    'status': 'unapproved_candidate',
    'source': {
        'path': '/avatars/candidates/model.fbx',
        'sha256': EXPECTED_SOURCE_SHA256,
        'bytes': SOURCE.stat().st_size,
    },
    'asset': {
        'path': '/avatars/alice-fbx-source.glb',
        'sha256': sha256(TARGET),
        'bytes': TARGET.stat().st_size,
    },
    'conversion': {
        'tool': 'Blender',
        'version': '.'.join(map(str, bpy.app.version[:3])),
        'timestamp_utc': datetime.now(timezone.utc).isoformat(),
        'meshCount': len(meshes),
        'armatureCount': len(armatures),
        'boneCounts': {name: len(bones) for name, bones in armature_bones.items()},
        'boneNames': armature_bones,
        'weightedMeshCount': len(weighted_meshes),
        'weightedMeshNames': weighted_meshes,
        'shapeKeys': blendshapes,
        'animationActions': actions,
    },
    'quality': {
        'skinBindingDetected': bool(weighted_meshes),
        'identityVerified': False,
        'deformationVerifiedInBrowser': False,
        'faceRigVerified': False,
        'approved': False,
    },
    'notes': [
        'Converted from existing FBX without changing its identity or geometry intentionally.',
        'Armature/weights are evidence from Blender, not proof of usable facial or body animation.',
        'Candidate is opt-in only until owner-approved identity and mobile visual review.',
    ],
}
REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print('ALICE_FBX_CONVERSION_REPORT=' + json.dumps(report, ensure_ascii=False))
