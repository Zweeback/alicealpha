import { test, expect, chromium } from '@playwright/test';

const APP_URL = 'https://alicealpha.onrender.com/';
const LOCAL_APP_URL = 'http://127.0.0.1:8790/';

test('public Alice opens a real WebRTC session and returns a live response', async () => {
  test.setTimeout(150_000);

  const browser = await chromium.launch({ headless: true, args: ['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--autoplay-policy=no-user-gesture-required'] });
  const context = await browser.newContext({ permissions: ['microphone', 'camera'] });
  const page = await context.newPage();

  await page.addInitScript(() => {
    window.__aliceProbe = { peerCreated:false,dataChannelCreated:false,dataChannelOpen:false,microphoneGranted:false,remoteAudioTrack:false,mediaPlayCalled:false,sessionStatus:null };
    const NativePC = window.RTCPeerConnection;
    class ProbedRTCPeerConnection extends NativePC {
      constructor(...args) { super(...args); window.__aliceProbe.peerCreated=true; this.addEventListener('track',e=>{if(e.track?.kind==='audio')window.__aliceProbe.remoteAudioTrack=true;}); }
      createDataChannel(label,options) { window.__aliceProbe.dataChannelCreated=true; const channel=super.createDataChannel(label,options); channel.addEventListener('open',()=>{window.__aliceProbe.dataChannelOpen=true;}); return channel; }
    }
    window.RTCPeerConnection=ProbedRTCPeerConnection;
    const originalGetUserMedia=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia=async(...args)=>{const stream=await originalGetUserMedia(...args);if(stream.getAudioTracks().length>0)window.__aliceProbe.microphoneGranted=true;return stream;};
    const originalPlay=HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play=function(...args){window.__aliceProbe.mediaPlayCalled=true;return originalPlay.apply(this,args);};
  });
  page.on('response',response=>{if(response.url().includes('/api/realtime/session'))page.evaluate(status=>{window.__aliceProbe.sessionStatus=status;},response.status()).catch(()=>undefined);});
  await page.goto(APP_URL,{waitUntil:'networkidle',timeout:90_000});
  await expect(page.locator('.live-state')).toContainText('Bereit',{timeout:30_000});
  await page.getByRole('button',{name:'Texteingabe öffnen'}).click({force:true});
  await page.locator('#alice-text').fill('Antworte bitte nur mit dem Wort TEST.');
  await page.locator('form.text-fallback').evaluate(form=>form.requestSubmit());
  await expect.poll(async()=>page.evaluate(()=>window.__aliceProbe.sessionStatus),{timeout:45_000}).not.toBeNull();
  const probeBeforeBranch=await page.evaluate(()=>window.__aliceProbe); expect([200,429]).toContain(probeBeforeBranch.sessionStatus);
  if(probeBeforeBranch.sessionStatus===200){
    await expect.poll(async()=>page.evaluate(()=>window.__aliceProbe.dataChannelOpen),{timeout:45_000}).toBe(true);
    await expect.poll(async()=>page.evaluate(()=>window.__aliceProbe.remoteAudioTrack),{timeout:45_000}).toBe(true);
    await expect.poll(async()=>((await page.locator('.alice-caption').textContent().catch(()=>''))||'').trim().length>0,{timeout:60_000}).toBe(true);
    const probe=await page.evaluate(()=>window.__aliceProbe); console.log('ALICE_WEBRTC_PROBE',JSON.stringify(probe)); expect(probe.peerCreated).toBe(true); expect(probe.dataChannelCreated).toBe(true); expect(probe.dataChannelOpen).toBe(true); expect(probe.microphoneGranted).toBe(true); expect(probe.remoteAudioTrack).toBe(true); expect(probe.sessionStatus).toBe(200);
  }else{
    console.log('ALICE_REALTIME_QUOTA_BLOCKED',JSON.stringify(probeBeforeBranch));
    await expect(page.locator('.live-state')).toContainText('Basismodus',{timeout:30_000});
    await expect.poll(async()=>((await page.locator('.alice-caption').textContent().catch(()=>''))||'').trim().length>0,{timeout:30_000}).toBe(true);
    expect(probeBeforeBranch.peerCreated).toBe(true);expect(probeBeforeBranch.dataChannelCreated).toBe(true);expect(probeBeforeBranch.microphoneGranted).toBe(true);expect(probeBeforeBranch.sessionStatus).toBe(429);
  }
  await context.close();await browser.close();
});

test('touching Alice degrades to free local input when Realtime quota is unavailable', async () => {
  test.setTimeout(120_000);
  const browser=await chromium.launch({headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--autoplay-policy=no-user-gesture-required']});
  const context=await browser.newContext({permissions:['microphone','camera']});const page=await context.newPage();
  await page.addInitScript(()=>{window.SpeechRecognition=undefined;window.webkitSpeechRecognition=undefined;window.__aliceVoiceFallbackProbe={peerCreated:false,dataChannelCreated:false,microphoneGranted:false,sessionStatus:null};const NativePC=window.RTCPeerConnection;class ProbedRTCPeerConnection extends NativePC{constructor(...args){super(...args);window.__aliceVoiceFallbackProbe.peerCreated=true;}createDataChannel(label,options){window.__aliceVoiceFallbackProbe.dataChannelCreated=true;return super.createDataChannel(label,options);}}window.RTCPeerConnection=ProbedRTCPeerConnection;const originalGetUserMedia=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=async(...args)=>{const stream=await originalGetUserMedia(...args);if(stream.getAudioTracks().length>0)window.__aliceVoiceFallbackProbe.microphoneGranted=true;return stream;};});
  page.on('response',response=>{if(response.url().includes('/api/realtime/session'))page.evaluate(status=>{window.__aliceVoiceFallbackProbe.sessionStatus=status;},response.status()).catch(()=>undefined);});
  await page.goto(APP_URL,{waitUntil:'networkidle',timeout:90_000});await expect(page.locator('.live-state')).toContainText('Bereit',{timeout:30_000});
  await page.keyboard.press('Space');
  await expect.poll(async()=>page.evaluate(()=>window.__aliceVoiceFallbackProbe.sessionStatus),{timeout:45_000}).not.toBeNull();
  const probe=await page.evaluate(()=>window.__aliceVoiceFallbackProbe);expect(probe.sessionStatus).toBe(429);expect(probe.peerCreated).toBe(true);expect(probe.dataChannelCreated).toBe(true);expect(probe.microphoneGranted).toBe(true);
  await expect(page.locator('#alice-text')).toBeVisible({timeout:30_000});await expect(page.locator('.live-state')).toContainText('Basismodus',{timeout:30_000});console.log('ALICE_FREE_FALLBACK_PROBE',JSON.stringify(probe));await context.close();await browser.close();
});

test('quota failure exposes the zero-cost browser AI entry and WebLLM can produce local output', async () => {
  test.setTimeout(600_000);const browser=await chromium.launch({headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--autoplay-policy=no-user-gesture-required']});const context=await browser.newContext({permissions:['microphone','camera']});const page=await context.newPage();
  await page.addInitScript(()=>{window.__aliceQuotaProbe={sessionStatus:null};});page.on('response',response=>{if(response.url().includes('/api/realtime/session'))page.evaluate(status=>{window.__aliceQuotaProbe.sessionStatus=status;},response.status()).catch(()=>undefined);});
  await page.route('**/api/health',async route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,realtime:true,model:'test-realtime'})}));await page.route('**/api/realtime/session',async route=>route.fulfill({status:429,contentType:'application/json',body:JSON.stringify({error:'test-quota-exhausted'})}));
  await page.goto(LOCAL_APP_URL,{waitUntil:'networkidle',timeout:90_000});await expect(page.locator('.live-state')).toContainText('Bereit',{timeout:30_000});await page.getByRole('button',{name:'Texteingabe öffnen'}).click({force:true});await page.locator('#alice-text').fill('Hallo Alice');await page.locator('form.text-fallback').evaluate(form=>form.requestSubmit());await expect.poll(async()=>page.evaluate(()=>window.__aliceQuotaProbe.sessionStatus),{timeout:45_000}).toBe(429);const localAIButton=page.getByRole('button',{name:/Lokale KI/});await expect(localAIButton).toBeVisible({timeout:30_000});
  const webgpu=await page.evaluate(async()=>{if(!navigator.gpu)return {available:false,adapter:false};const adapter=await navigator.gpu.requestAdapter().catch(()=>null);return {available:true,adapter:Boolean(adapter)};});
  if(!webgpu.available||!webgpu.adapter){console.log('ALICE_WEBGPU_UNAVAILABLE',JSON.stringify(webgpu));test.skip(true,'WebGPU adapter unavailable in this runner');}
  const inference=await page.evaluate(async()=>{const module=await import('https://esm.run/@mlc-ai/web-llm');const engine=await module.CreateMLCEngine('Qwen2.5-0.5B-Instruct-q4f16_1-MLC');const response=await engine.chat.completions.create({messages:[{role:'user',content:'Reply with exactly OK'}],temperature:0,max_tokens:2});return String(response?.choices?.[0]?.message?.content||'').trim();});
  expect(inference.length).toBeGreaterThan(0);console.log('ALICE_BROWSER_AI_INFERENCE_OK',JSON.stringify({output:inference}));await context.close();await browser.close();
});
