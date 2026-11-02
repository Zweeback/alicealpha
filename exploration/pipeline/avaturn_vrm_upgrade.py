#!/usr/bin/env python3
"""Avaturn-basiertes VRM (alice-fbx-source.vrm) zu Alice aufwerten – direkt im glTF-JSON:
  * alle 52 ARKit- + 15 Viseme-Blendshapes als Custom-Expressions (für Bot / Perfect Sync)
  * VRM-Presets neu: happy, angry, sad, relaxed, surprised, blink(+L/R), aa/ih/ou/ee/oh, lookUp/Down/Left/Right
  * Alice-Emotionen: curious, thinking, excited, serious, confused, playful, smirk
  * lookAt über Augenknochen, Meta auf Alice
usage: python3 mh/avaturn_vrm_upgrade.py IN.vrm OUT.vrm
"""
import json, struct, sys
src, dst = sys.argv[1], sys.argv[2]
raw = open(src, 'rb').read(); off = 12; ch = []
while off < len(raw):
    l, t = struct.unpack('<II', raw[off:off + 8]); ch.append([t, raw[off + 8:off + 8 + l]]); off += 8 + l
j = json.loads(ch[0][1])
# morph name -> [(node, index)] über alle Meshes
binds = {}
for ni, n in enumerate(j['nodes']):
    if 'mesh' not in n: continue
    m = j['meshes'][n['mesh']]
    names = m.get('extras', {}).get('targetNames') or m['primitives'][0].get('extras', {}).get('targetNames') or []
    for i, nm in enumerate(names): binds.setdefault(nm, []).append((ni, i))
print('morphs', len(binds))


def expr(weights, binary=False, ovr=None):
    mt = []
    for k, w in weights.items():
        for ni, i in binds.get(k, []): mt.append({'node': ni, 'index': i, 'weight': float(w)})
    e = {'morphTargetBinds': mt, 'isBinary': binary}
    if ovr: e.update(ovr)
    return e


S = lambda *ks, w=1.0: {k: w for k in ks}
def LR(base, w=1.0): return {base + 'Left': w, base + 'Right': w}
P = {
    'happy': {**LR('mouthSmile', 0.75), **LR('cheekSquint', 0.55), **LR('eyeSquint', 0.35), 'mouthDimpleLeft': .25, 'mouthDimpleRight': .25},
    'angry': {**LR('browDown', 0.95), **LR('eyeSquint', 0.45), **LR('noseSneer', 0.5), **LR('mouthFrown', 0.55), **LR('mouthPress', 0.5), 'mouthRollUpper': .2},
    'sad': {'browInnerUp': 0.95, **LR('mouthFrown', 0.8), **LR('eyeSquint', 0.2), 'mouthShrugLower': .45, **LR('mouthLowerDown', .15)},
    'relaxed': {**LR('mouthSmile', 0.35), **LR('eyeBlink', 0.3), **LR('cheekSquint', 0.2)},
    'surprised': {**LR('eyeWide', 0.9), 'browInnerUp': 0.85, **LR('browOuterUp', 0.85), 'jawOpen': 0.35, 'mouthFunnel': .25},
    'neutral': {},
    'blink': LR('eyeBlink'), 'blinkLeft': {'eyeBlinkLeft': 1}, 'blinkRight': {'eyeBlinkRight': 1},
    'aa': {'aa': 1}, 'ih': {'ih': 1}, 'ou': {'ou': 1}, 'ee': {'E': 1}, 'oh': {'oh': 1},
    'lookUp': LR('eyeLookUp'), 'lookDown': LR('eyeLookDown'),
    'lookLeft': {'eyeLookOutLeft': 1, 'eyeLookInRight': 1}, 'lookRight': {'eyeLookInLeft': 1, 'eyeLookOutRight': 1},
}
C = {
    'curious': {'browInnerUp': .45, 'browOuterUpLeft': .55, **LR('eyeWide', .3), 'mouthSmileLeft': .25, 'mouthSmileRight': .15},
    'thinking': {'browDownLeft': .45, 'browOuterUpRight': .45, 'eyeSquintLeft': .3, 'mouthPressLeft': .35, 'mouthLeft': .3, 'eyeLookUpLeft': .35, 'eyeLookUpRight': .35},
    'excited': {**LR('mouthSmile', .95), **LR('eyeWide', .45), **LR('browOuterUp', .5), 'jawOpen': .25, **LR('cheekSquint', .4)},
    'serious': {**LR('browDown', .4), **LR('mouthPress', .4), **LR('eyeSquint', .2)},
    'confused': {'browInnerUp': .6, 'browDownRight': .5, 'mouthLeft': .35, 'mouthFrownRight': .3, 'eyeSquintRight': .3},
    'playful': {'mouthSmileLeft': .8, 'mouthSmileRight': .4, 'eyeBlinkRight': .6, 'cheekSquintLeft': .4, 'browOuterUpLeft': .4},
    'smirk': {'mouthSmileLeft': .7, 'mouthDimpleLeft': .4, 'cheekSquintLeft': .3, 'browOuterUpLeft': .2},
}
ov_mouth = {'overrideBlink': 'none', 'overrideLookAt': 'none', 'overrideMouth': 'none'}
ov_emo = {'overrideBlink': 'blend', 'overrideLookAt': 'none', 'overrideMouth': 'blend'}
v = j['extensions']['VRMC_vrm']
preset = {}
for k, w in P.items():
    o = ov_emo if k in ('happy', 'angry', 'sad', 'relaxed', 'surprised') else None
    preset[k] = expr(w, binary=False, ovr=o)
custom = {k: expr(w, ovr=ov_emo) for k, w in C.items()}
for nm in binds:                                       # alle Roh-Blendshapes für Perfect Sync / Bot
    if nm not in custom and nm not in preset: custom[nm] = expr({nm: 1})
v['expressions'] = {'preset': preset, 'custom': custom}
# lookAt: Knochen
v['lookAt'] = {'type': 'bone', 'offsetFromHeadBone': [0, 0.06, 0],
               'rangeMapHorizontalInner': {'inputMaxValue': 90, 'outputScale': 9}, 'rangeMapHorizontalOuter': {'inputMaxValue': 90, 'outputScale': 11},
               'rangeMapVerticalDown': {'inputMaxValue': 90, 'outputScale': 8}, 'rangeMapVerticalUp': {'inputMaxValue': 90, 'outputScale': 9}}
v['meta'].update({'name': 'Alice', 'version': '1.0-alpha', 'authors': ['Ben (Bentropie)'], 'avatarPermission': 'onlyAuthor',
                  'commercialUsage': 'personalNonProfit', 'allowRedistribution': False, 'modification': 'prohibited',
                  'creditNotation': 'required'})
hb = v['humanoid']['humanBones']; print('eyes in humanoid', 'leftEye' in hb, 'rightEye' in hb, '| preset', len(preset), 'custom', len(custom))
jb = json.dumps(j, separators=(',', ':')).encode()
while len(jb) % 4: jb += b' '
b = ch[1][1]
out = struct.pack('<III', 0x46546C67, 2, 28 + len(jb) + len(b)) + struct.pack('<II', len(jb), 0x4E4F534A) + jb + struct.pack('<II', len(b), 0x004E4942) + b
open(dst, 'wb').write(out); print('OK', dst, len(out))
