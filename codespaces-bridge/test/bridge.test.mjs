import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
process.env.CODESPACES_BRIDGE_KEY='test-secret-that-is-at-least-thirty-two-bytes-long';
process.env.GITHUB_CODESPACES_TOKEN='fake-local-token';
process.env.CODESPACES_ALLOWED_REPOS='Zweeback/alicealpha';
const requestLog=[];
const mock=http.createServer(async(req,res)=>{
 let body='';for await(const chunk of req)body+=chunk.toString();
 requestLog.push({method:req.method,url:req.url,body,auth:req.headers.authorization});
 res.setHeader('content-type','application/json');
 if(req.method==='GET' && req.url.startsWith('/user/codespaces?'))res.end(JSON.stringify({total_count:1,codespaces:[{name:'my-cs',state:'Available'}]}));
 else if(req.method==='POST' && req.url==='/user/codespaces/my-cs/start')res.end(JSON.stringify({name:'my-cs',state:'Starting'}));
 else if(req.method==='POST' && req.url==='/repos/Zweeback/alicealpha/codespaces')res.end(JSON.stringify({name:'new-cs',state:'Creating'}));
 else if(req.method==='DELETE' && req.url==='/user/codespaces/my-cs'){res.statusCode=202;res.end()}
 else{res.statusCode=404;res.end('{"message":"unknown"}')}
});
await new Promise(r=>mock.listen(0,'127.0.0.1',r));
process.env.GITHUB_API_URL='http://127.0.0.1:'+mock.address().port;
const {makeServer}=await import('../server.mjs');
const server=makeServer();
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url='http://127.0.0.1:'+server.address().port;
let seq=0;
async function mc(name,args,headers={}){
 const id=++seq;
 const r=await fetch(url+'/mcp',{method:'POST',
  headers:{'content-type':'application/json','x-bridge-key':process.env.CODESPACES_BRIDGE_KEY,...headers},
  body:JSON.stringify({jsonrpc:'2.0',id,method:'tools/call',params:{name,arguments:args||{}}})});
 return {status:r.status,body:await r.json()};
}
test('health exposes no secrets',async()=>{
 const r=await fetch(url+'/health'),body=await r.text();
 assert.equal(r.status,200);assert.equal(body.includes('fake-local-token'),false);assert.equal(body.includes('test-secret'),false);
});
test('private endpoint rejects missing and malformed credentials',async()=>{
 for(const x of ['','fake','test-secret-that-is-at-least-thirty-two-bytes-long-X']){
  const r=await fetch(url+'/mcp',{method:'POST',headers:{'x-bridge-key':x},body:'{}'});
  assert.equal(r.status,401);
 }
});
test('MCP handshake, list and diagnostic',async()=>{
 const r=await fetch(url+'/mcp',{method:'POST',headers:{'content-type':'application/json','x-bridge-key':process.env.CODESPACES_BRIDGE_KEY},
 body:JSON.stringify({jsonrpc:'2.0',id:3,method:'initialize',params:{protocolVersion:'2025-06-18'}})});
 const payload=await r.json();
 assert.equal(payload.result.protocolVersion,'2025-06-18');
 assert.equal(payload.result.serverInfo.name,'alice-codespaces-bridge');
 const list=await fetch(url+'/mcp',{method:'POST',headers:{'content-type':'application/json','x-bridge-key':process.env.CODESPACES_BRIDGE_KEY},body:JSON.stringify({jsonrpc:'2.0',id:4,method:'tools/list'})});
 const info=await list.json();assert(info.result.tools.length>=10);
 const result=await mc('codespaces_status');
 assert.match(result.body.result.content[0].text,/'connected": true/);
});
test('list passes Github OAuth token only to Github mocked upstream',async()=>{
 const r=await mc('codespaces_list',{per_page:1});assert.equal(r.body.result.isError,undefined);
 const data=JSON.parse(r.body.result.content[0].text);
 assert.equal(data.total_count,1);
 assert.equal(requestLog.at(-1).auth,'Bearer fake-local-token');
});
test('mutation requires explicit action+target confirmation',async()=>{
 let n=requestLog.length;const x=await mc('codespaces_start',{name:'my-cs',confirmation:'yes'});
 assert.equal(x.body.result.isError,true);assert.equal(n,requestLog.length);
 const y=await mc('codespaces_start',{name:'my-cs',confirmation:'START my-cs'});
 assert.equal(y.body.result.isError,undefined);assert.equal(requestLog.at(-1).method,'POST');
});
test('repository allowlist blocks creation outside configured repo',async()=>{
 const n=requestLog.length;
 const x=await mc('codespaces_create',{repository:'evil/steal',confirmation:'CREATE evil/steal'});
 assert.equal(x.body.result.isError,true);assert.equal(requestLog.length,n);
 const y=await mc('codespaces_create',{repository:'Zweeback/alicealpha',confirmation:'CREATE Zweeback/alicealpha'});
 assert.equal(y.body.result.isError,undefined);assert.equal(requestLog.at(-1).method,'POST');
});
test('destructive mutation blocked without exact DELETE acknowledgement',async()=>{
 const n=requestLog.length;const a=await mc('codespaces_delete',{name:'my-cs',confirmation:'DELETE another-cs'});
 assert.equal(a.body.result.isError,true);assert.equal(n,requestLog.length);
 const b=await mc('codespaces_delete',{name:'my-cs',confirmation:'DELETE my-cs'});
 assert.equal(b.body.result.isError,undefined);assert.equal(requestLog.at(-1).method,'DELETE');
});
test('remote execution disabled by default even when approved',async()=>{
 const r=await mc('codespaces_exec',{name:'my-cs',operation:'pwd',confirmation:'EXEC my-cs pwd'});
 assert.equal(r.body.result.isError,true);assert.match(r.body.result.content[0].text,/deaktiviert/);
});
test('unknown methods fail cleanly, no command injection',async()=>{
 const a=await mc('codespaces_get',{name:'x/../../etc'});
 assert.equal(a.body.result.isError,true);
 const b=await mc('codespaces_exec',{name:'my-cs',operation:'rm -rf',confirmation:'EXEC my-cs rm -rf'});
 assert.equal(b.body.result.isError,true);
});
test.after(async()=>{await new Promise(r=>server.close(r));await new Promise(r=>mock.close(r))});
