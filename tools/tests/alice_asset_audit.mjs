import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGlb, inspectGlbBytes } from '../audit_alice_asset.mjs';

function glb(doc) {
  const json = Buffer.from(JSON.stringify(doc));
  const chunk = Buffer.alloc(Math.ceil(json.length/4)*4, 0x20);
  json.copy(chunk);
  const b = Buffer.alloc(20+chunk.length);
  b.writeUInt32LE(0x46546c67,0);
  b.writeUInt32LE(2,4);
  b.writeUInt32LE(b.length,8);
  b.writeUInt32LE(chunk.length,12);
  b.writeUInt32LE(0x4e4f534a,16);
  chunk.copy(b,20);
  return b;
}
const minimal={asset:{version:'2.0'},meshes:[{primitives:[{attributes:{POSITION:0},indices:1}]}],accessors:[{count:9},{count:9}]};

test('static GLB cannot auto-promote or masquerade as an animated human',()=>{
  const r=inspectGlbBytes(glb(minimal),'alice.glb');
  assert.equal(r.triangleCount,3);
  assert.equal(r.status,'unapproved_candidate');
  assert.equal(r.readyForAnimationReview,false);
  assert.match(r.warnings.join(' '),/Missing skin binding/);
});
test('VRM1/skinned/morph candidate qualifies for animation review only',()=>{
  const d=structuredClone(minimal);
  d.meshes[0].primitives[0].targets=[{POSITION:2}];
  d.meshes[0].extras={targetNames:['jawOpen','blink']};
  d.nodes=[{name:'Head',mesh:0,skin:0}];
  d.skins=[{joints:[0]}];
  d.textures=[{}];
  d.extensions={VRMC_vrm:{humanoid:{humanBones:{head:{node:0}}},expressions:{preset:{aa:{},blink:{}}}}};
  const r=inspectGlbBytes(glb(d));
  assert.equal(r.readyForAnimationReview,true);
  assert.equal(r.vrmVersion,'1.0');
  assert.equal(r.status,'unapproved_candidate');
});
test('truncated, forged-size and non-GLB input are rejected',()=>{
  assert.throws(()=>parseGlb(Buffer.alloc(4)),/smaller/);
  const b=glb(minimal);
  b.writeUInt32LE(15,8);
  assert.throws(()=>parseGlb(b),/declared length/);
  const c=glb(minimal);
  c.writeUInt32LE(0,0);
  assert.throws(()=>parseGlb(c),/invalid glTF magic/);
});
