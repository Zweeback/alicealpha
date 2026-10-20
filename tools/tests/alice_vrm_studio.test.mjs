import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auditVrmBytes, parseGlb } from '../validate_alice_vrm.mjs';

function glb(doc) {
  const json = Buffer.from(JSON.stringify(doc));
  const padded = Buffer.alloc(Math.ceil(json.length / 4) * 4, 0x20);
  json.copy(padded);
  const b = Buffer.alloc(20 + padded.length);
  b.writeUInt32LE(0x46546c67, 0); b.writeUInt32LE(2, 4);
  b.writeUInt32LE(b.length, 8);
  b.writeUInt32LE(padded.length, 12); b.writeUInt32LE(0x4e4f534a, 16);
  padded.copy(b, 20);
  return b;
}

const names = [
  'hips','spine','chest','neck','head','leftUpperArm','leftLowerArm','leftHand',
  'rightUpperArm','rightLowerArm','rightHand','leftUpperLeg','leftLowerLeg','leftFoot',
  'rightUpperLeg','rightLowerLeg','rightFoot'
];
const expressions = ['blink','blinkLeft','blinkRight','aa','ih','ou','ee','oh'];
function fixture() {
  return {
    asset:{version:'2.0'},
    nodes:names.map((name,i)=>i===0?{name,skin:0,mesh:0}:{name}),
    skins:[{joints:[0,1]}],
    accessors:[{count:300}],
    meshes:[{primitives:[{attributes:{POSITION:0,JOINTS_0:0,WEIGHTS_0:0},indices:0,targets:[{POSITION:0}]}]}],
    extensions:{VRMC_vrm:{
      specVersion:'1.0',
      humanoid:{humanBones:Object.fromEntries(names.map((name,i)=>[name,{node:i}]))},
      expressions:{preset:Object.fromEntries(expressions.map(name=>[name,{}]))},
      meta:{avatarPermission:'onlyAuthor',allowRedistribution:false}
    }}
  };
}
test('rigged VRM passes intake only, never auto-approved',()=>{
  const result = auditVrmBytes(glb(fixture()));
  assert.equal(result.validForRigReview,true);
  assert.equal(result.status,'unapproved_candidate');
  assert.equal(result.promotion,'manual_gate_only');
  assert.equal(result.metrics.triangles,100);
  assert.equal(result.distribution,'private_only_unless_permission_changes');
});
test('reject absent humanoid bones',()=>{
  const d = fixture();
  delete d.extensions.VRMC_vrm.humanoid.humanBones.head;
  assert.match(auditVrmBytes(glb(d)).failures.join(' '),/head/);
});
test('reject absent face viseme',()=>{
  const d = fixture();
  delete d.extensions.VRMC_vrm.expressions.preset.aa;
  assert.match(auditVrmBytes(glb(d)).failures.join(' '),/aa/);
});
test('reject malformed GLB rather than accepting fabricated success',()=>{
  assert.throws(()=>parseGlb(Buffer.from('not a glb')), /Invalid GLB/);
});
