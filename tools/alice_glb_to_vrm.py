#!/usr/bin/env python3
"""Add VRMC_vrm 1.0 semantic metadata to ALICE's existing FBX-derived rigged GLB.
Keep original meshes, skinning and binary buffers byte-for-byte. Fail closed on missing data.
"""
import argparse
import hashlib
import json
import struct
import sys
from pathlib import Path

REQUIRED = {
 'hips':'Hips','spine':'Spine','head':'Head',
 'leftUpperArm':'LeftArm','leftLowerArm':'LeftForeArm','leftHand':'LeftHand',
 'rightUpperArm':'RightArm','rightLowerArm':'RightForeArm','rightHand':'RightHand',
 'leftUpperLeg':'LeftUpLeg','leftLowerLeg':'LeftLeg','leftFoot':'LeftFoot',
 'rightUpperLeg':'RightUpLeg','rightLowerLeg':'RightLeg','rightFoot':'RightFoot'}
OPTIONAL = {
 'chest':'Spine1','upperChest':'Spine2','neck':'Neck','leftEye':'LeftEye',
 'rightEye':'RightEye','leftShoulder':'LeftShoulder','rightShoulder':'RightShoulder',
 'leftToes':'LeftToeBase','rightToes':'RightToeBase'}
for side in ('Left','Right'):
 for finger in ('Index','Middle','Ring','Pinky'):
  mapped = 'Little' if finger == 'Pinky' else finger
  for i,part in ((1,'Proximal'),(2,'Intermediate'),(3,'Distal')):
   OPTIONAL[side.lower()+mapped+part] = side+'Hand'+finger+str(i)
 for i,part in ((1,'Metacarpal'),(2,'Proximal'),(3,'Distal')):
  OPTIONAL[side.lower()+'Thumb'+part] = side+'HandThumb'+str(i)

PRESETS = {
 'blink':('eyeBlinkLeft','eyeBlinkRight'),
 'blinkLeft':('eyeBlinkLeft',),'blinkRight':('eyeBlinkRight',),
 'aa':('aa',),'ih':('ih',),'ou':('ou',),'ee':('E',),'oh':('oh',),
 'happy':('mouthSmileLeft','mouthSmileRight'),
 'sad':('mouthFrownLeft','mouthFrownRight'),
 'surprised':('eyeWideLeft','eyeWideRight','jawOpen'),
 'neutral':()}
CUSTOM = {
 'jawOpen':('jawOpen',),'smile':('mouthSmileLeft','mouthSmileRight'),
 'curious':('browInnerUp',),'cheerful':('mouthSmileLeft','mouthSmileRight','eyeSquintLeft','eyeSquintRight')}

def read_glb(data):
 if len(data) < 20 or data[:4] != b'glTF':
  raise ValueError('Not a binary glTF file')
 if struct.unpack_from('<II',data,4) != (2,len(data)):
  raise ValueError('Invalid GLB version/length')
 pos=12
 chunks=[]
 while pos < len(data):
  size,kind=struct.unpack_from('<I4s',data,pos)
  pos+=8
  if size % 4 or pos+size > len(data):
   raise ValueError('Invalid GLB chunk length')
  chunks.append((kind,data[pos:pos+size]))
  pos+=size
 if not chunks or chunks[0][0] != b'JSON':
  raise ValueError('GLB JSON chunk absent')
 doc=json.loads(chunks[0][1].decode('utf8'))
 if doc.get('asset',{}).get('version') != '2.0':
  raise ValueError('Not glTF 2.0')
 return doc,chunks

def write_glb(doc,chunks):
 payload=json.dumps(doc,ensure_ascii=False,separators=(',',':')).encode('utf8')
 payload+=b' '*((-len(payload))%4)
 combined=[(b'JSON',payload)]+chunks[1:]
 size=12+sum(8+len(chunk) for kind,chunk in combined)
 result=bytearray(struct.pack('<4sII',b'glTF',2,size))
 for kind,chunk in combined:
  result+=struct.pack('<I4s',len(chunk),kind)+chunk
 return bytes(result)

def normalized(name):
 return str(name).strip().split(':')[-1].split('|')[-1].split('/')[-1].removesuffix('.001').casefold()

def convert(source,target,report,expected):
 raw=source.read_bytes()
 source_hash=hashlib.sha256(raw).hexdigest()
 if expected and source_hash != expected:
  raise ValueError('SHA-256 source mismatch; refusing conversion')
 doc,chunks=read_glb(raw)
 if not doc.get('skins'):
  raise ValueError('Source lacks skinning')
 if 'VRMC_vrm' in doc.get('extensions',{}):
  raise ValueError('Source already VRM; refusing double conversion')
 names={}
 for idx,node in enumerate(doc.get('nodes',[])):
  names.setdefault(normalized(node.get('name','')),[]).append(idx)
 humanoid={}
 for semantic,name in {**REQUIRED,**OPTIONAL}.items():
  candidate=names.get(normalized(name),[])
  if len(candidate)>1:
   raise ValueError('Ambiguous humanoid bone '+name)
  if candidate:
   humanoid[semantic]={'node':candidate[0]}
 absent=sorted(set(REQUIRED)-set(humanoid))
 if absent:
  raise ValueError('Required VRM bones absent: '+','.join(absent))
 parent={}
 for i,node in enumerate(doc['nodes']):
  for child in node.get('children',[]):
   if child in parent:
    raise ValueError('Node has multiple parents')
   parent[child]=i
 def nested(child,ancestor):
  cur=humanoid[child]['node']
  top=humanoid[ancestor]['node']
  seen=set()
  while cur in parent and cur not in seen:
   seen.add(cur)
   cur=parent[cur]
   if cur==top:
    return True
  return False
 paths=[
  ('spine','hips'),('head','spine'),
  ('leftLowerArm','leftUpperArm'),('leftHand','leftLowerArm'),
  ('rightLowerArm','rightUpperArm'),('rightHand','rightLowerArm'),
  ('leftLowerLeg','leftUpperLeg'),('leftFoot','leftLowerLeg'),
  ('rightLowerLeg','rightUpperLeg'),('rightFoot','rightLowerLeg')]
 for child,ancestor in paths:
  if not nested(child,ancestor):
   raise ValueError('Broken humanoid hierarchy '+child+' not below '+ancestor)
 targets={}
 meshes=doc.get('meshes',[])
 for n,node in enumerate(doc['nodes']):
  meshidx=node.get('mesh')
  if not isinstance(meshidx,int) or meshidx >= len(meshes):
   continue
  mesh=meshes[meshidx]
  morph_names=mesh.get('extras',{}).get('targetNames') or []
  if not morph_names:
   continue
  if any(len(p.get('targets',[])) != len(morph_names) for p in mesh['primitives']):
   raise ValueError('Morph target count mismatch in mesh '+str(meshidx))
  for index,name in enumerate(morph_names):
   targets.setdefault(name.casefold(),[]).append({'node':n,'index':index,'weight':1.0})
 def expressions(dictionary):
  result={}
  for expression,nameset in dictionary.items():
   entries=[binding for name in nameset for binding in targets.get(name.casefold(),[])]
   if entries or not nameset:
    result[expression]={'morphTargetBinds':entries}
  return result
 preset=expressions(PRESETS)
 custom=expressions(CUSTOM)
 needed=('blink','blinkLeft','blinkRight','aa','ih','ou','ee','oh')
 if any(key not in preset for key in needed):
  raise ValueError('Missing ARKit/viseme shapes: '+','.join(x for x in needed if x not in preset))
 vrm={
  'specVersion':'1.0',
  'meta':{
   'name':'ALICE FBX candidate — unapproved',
   'version':'0.1.0-candidate',
   'authors':['Zweeback'],
   'references':['https://github.com/Zweeback/alicealpha'],
   'licenseUrl':'https://vrm.dev/licenses/1.0/',
   'avatarPermission':'onlyAuthor',
   'commercialUsage':'personalNonProfit',
   'allowRedistribution':False,
   'modification':'prohibited'},
  'humanoid':{'humanBones':humanoid},
  'expressions':{'preset':preset,'custom':custom}}
 doc.setdefault('extensions',{})['VRMC_vrm']=vrm
 for key in ('extensionsUsed','extensionsRequired'):
  ext=doc.setdefault(key,[])
  if 'VRMC_vrm' not in ext:
   ext.append('VRMC_vrm')
 output=write_glb(doc,chunks)
 check,newchunks=read_glb(output)
 if newchunks[1:] != chunks[1:] or check['extensions']['VRMC_vrm']['specVersion']!='1.0':
  raise ValueError('Binary roundtrip mismatch')
 if source.resolve()==target.resolve():
  raise ValueError('Source cannot be overwritten')
 target.parent.mkdir(parents=True,exist_ok=True)
 target.write_bytes(output)
 result={
  'format':'VRM 1.0 / glTF 2.0',
  'sourceSha256':source_hash,'outputSha256':hashlib.sha256(output).hexdigest(),
  'originalGlbPayloadPreserved':True,
  'skinCount':len(doc['skins']),'meshCount':len(meshes),
  'humanoidBoneCount':len(humanoid),
  'presetExpressions':sorted(preset),'customExpressions':sorted(custom),
  'identityVerifiedAgainstReference':False,
  'browserAnimationVerified':False,
  'approvedCanonical':False}
 report.write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
 print(json.dumps(result,indent=2))

def main():
 p=argparse.ArgumentParser()
 p.add_argument('source',type=Path)
 p.add_argument('output',type=Path)
 p.add_argument('--report',type=Path,required=True)
 p.add_argument('--expected-sha256')
 args=p.parse_args()
 try:
  convert(args.source,args.output,args.report,args.expected_sha256)
 except (OSError,ValueError) as exc:
  print('ALICE VRM conversion blocked:',exc,file=sys.stderr)
  return 1
 return 0

if __name__=='__main__':
 sys.exit(main())
