import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const project = JSON.parse(readFileSync(new URL('../ALICE/ALICE.uproject', import.meta.url), 'utf8'));
const engineConfig = readFileSync(new URL('../ALICE/Config/DefaultEngine.ini', import.meta.url), 'utf8');
const enabled = new Set(project.Plugins.filter((plugin) => plugin.Enabled).map((plugin) => plugin.Name));

assert.equal(project.EngineAssociation, '5.8', 'ALICE Unreal scaffold must target UE 5.8');
for (const name of ['MetaHumanCreator', 'MetaHumanAnimator', 'MetaHumanLiveLink', 'ControlRig', 'LiveLink', 'Niagara', 'MovieRenderPipeline', 'OpenXR']) {
  assert.ok(enabled.has(name), `Missing required Unreal plugin: ${name}`);
}
assert.match(engineConfig, /r\.DynamicGlobalIlluminationMethod=1/, 'Lumen GI baseline missing');
assert.match(engineConfig, /r\.ReflectionMethod=1/, 'Lumen reflections baseline missing');
assert.match(engineConfig, /r\.SkinCache\.CompileShaders=True/, 'Skin Cache baseline missing');
console.log('ALICE Unreal scaffold contract: PASS (configuration only; no Unreal build performed)');
