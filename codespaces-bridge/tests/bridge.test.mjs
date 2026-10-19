import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';

const port=30197;
let processServer;
async function startService(token){
 processServer=spawn(process.execPath,['server.mjs'],{
  cwd:new URL('../',import.meta.url).pathname,
  env:{...process.env,PORT:String(port),BRIDGE_ACCESS_TOKEN:token,GITHUB_TOKEN:'',ADMIN_PIN:'',PUBLIC_BASE_URL:'http://127.0.0.1:'+port},stdio:['ignore','pipe','pipe']});
 for(let i=0;i<60;i++){
  if(processServer.exitCode!==null)throw Error('Server unexpectedly quit');
  try{const r=await fetch('http://127.0.0.1:'+port+'/health');if(r.ok)return;}
  catch{}
  await sleep(120);
 }
 throw Error('Health check timeout');
}
test('private connector denies missing, invalid, and empty bearer tokens even when GitHub unauthenticated',async()=>{
 await startService('local-test-very-long-secret-key');
 try{
  const health=await (await fetch('http://127.0.0.1:'+port+'/health')).json();
  assert.equal(health.github_configured,false);
  assert.equal(health.code_execution_locked,true);
  for(const token of ['','Bearer ','Bearer totally-wrong']){
   const res=await fetch('http://127.0.0.1:'+port+'/mcp',{
    method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json, text/event-stream',...(token?{'Authorization':token}:{})},
    body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list',params:{}})});
   assert.equal(res.status,401,token);
  }
  const res=await fetch('http://127.0.0.1:'+port+'/mcp',{
   method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json, text/event-stream',
     'Authorization':'Bearer local-test-very-long-secret-key'},
   body:JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/list',params:{}})});
  const body=await res.text();
  assert.equal(res.status,200,body.slice(0,300));
  assert.match(body,/codespaces_list/);
  assert.match(body,/codespace_propose_command/);
  assert.match(body,/execute_approved/);
  const approve=await fetch('http://127.0.0.1:'+port+'/approve/missing-id');
  assert.equal(approve.status,404);
 }finally{processServer.kill('SIGTERM');}
});
