// Private GitHub Codespaces MCP bridge. No GitHub token is committed.
// Standalone Node.js 20+ service; no third-party runtime dependencies.
import http from 'node:http';
import { timingSafeEqual, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';

const MAX_REQUEST=64*1024, MAX_OUTPUT=24*1024, JOB_TTL=60*60*1000;
const allowed=new Set((process.env.CODESPACES_ALLOWED_REPOS || 'Zweeback/alicealpha')
  .split(',').map(x=>x.trim()).filter(Boolean));
const executions=new Map();
const slug=/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/;
const repositoryPattern=/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const GITHUB_API=(process.env.GITHUB_API_URL || 'https://api.github.com').replace(/\/+$/,'');
const ghToken=()=>process.env.GITHUB_CODESPACES_TOKEN||'';

function authorized(request){
 const secret=process.env.CODESPACES_BRIDGE_KEY || '';
 const value=request.headers['x-bridge-key']||'';
 if(secret.length<32 || typeof value!=='string') return false;
 const a=Buffer.from(secret),b=Buffer.from(value);
 return a.length===b.length && timingSafeEqual(a,b);
}
function json(res,status,data){
 const body=JSON.stringify(data);
 res.writeHead(status,{'content-type':'application/json; charset=utf-8',
   'cache-control':'no-store','x-content-type-options':'nosniff'});
 res.end(body);
}
const fail=(message,code=-32000)=>({jsonrpc:'2.0',error:{code,message}});
const reply=(id,result)=>({jsonrpc:'2.0',id,result});
const good=(obj)=>({content:[{type:'text',text:JSON.stringify(obj,null,2)}]});
const err=(message)=>({isError:true,content:[{type:'text',text:message}]});
function requireSlug(name){if(!slug.test(name||''))throw Error('Ungültiger Codespace-Name');return name;}
function requireRepo(name){
 if(!repositoryPattern.test(name||'')||!allowed.has(name))throw Error('Repository nicht freigegeben: '+name);
 return name;
}
function confirm(action,value,actual){
 if(value!==action+' '+actual)throw Error('Bestätigung erforderlich: '+action+' '+actual);
}
async function github(method,path,body){
 if(!ghToken())throw Error('GITHUB_CODESPACES_TOKEN nicht hinterlegt. Nur per Render Environment setzen.');
 if(!/^\/(user\/codespaces(?:\?per_page=[0-9]{1,3}|\/[A-Za-z0-9_.-]+(?:\/(?:start|stop|machines))?)?|repos\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/codespaces)$/.test(path))
    throw Error('API-Pfad nicht freigegeben');
 const ctl=new AbortController(), timeout=setTimeout(()=>ctl.abort(),20000);
 try{
  const r=await fetch(GITHUB_API+path,{
   method,signal:ctl.signal,headers:{
    accept:'application/vnd.github+json',authorization:'Bearer '+ghToken(),
    'x-github-api-version':'2022-11-28','content-type':'application/json',
    'user-agent':'ALICE-Codespaces-Bridge/0.1'
   }, ...(body?{body:JSON.stringify(body)}:{})
  });
  const content=await r.text();
  let data;try{data=JSON.parse(content)}catch{data={detail:content.slice(0,1600)}}
  if(!r.ok)throw Error('GitHub HTTP '+r.status+': '+String(data.message||data.detail||'Anfrage abgelehnt').slice(0,700));
  return data;
 }finally{clearTimeout(timeout)}
}
const desc=(name,description,properties,required=[])=>({
 name,description,inputSchema:{type:'object',properties,required,additionalProperties:false}
});
const s={type:'string'}, pos={type:'integer',minimum:1,maximum:100};
const tools=[
 desc('codespaces_status','Bridge-Status und sichere Verbindungsprüfung. Keine Geheimnisse.',{}),
 desc('codespaces_list','Codespaces des authentifizierten GitHub-Nutzers anzeigen.',
  {per_page:pos}),
 desc('codespaces_get','Ein Codespace mit Status, Branch, Maschine und Repository lesen.',{name:s},['name']),
 desc('codespaces_machines','Verfügbare Maschinen für einen existierenden Codespace lesen.',{name:s},['name']),
 desc('codespaces_create','Kostenpflichtigen Codespace erstellen, nur nach ausdrücklich erteilter Benutzerfreigabe. Repository muss auf Allowlist stehen.',
  {repository:s,ref:s,machine:s,confirmation:s},['repository','confirmation']),
 desc('codespaces_start','Codespace starten; GitHub kann Nutzungsgebühren berechnen.',
  {name:s,confirmation:s},['name','confirmation']),
 desc('codespaces_stop','Codespace anhalten.',{name:s,confirmation:s},['name','confirmation']),
 desc('codespaces_delete','Codespace unwiderruflich löschen; nur nach ausdrücklicher Freigabe.',
  {name:s,confirmation:s},['name','confirmation']),
 desc('codespaces_exec','Separat freigeschaltete, begrenzte Diagnose/Tests im Codespace starten. Sofortige Auftrags-ID statt langem Warten.',
  {name:s,operation:{type:'string',enum:['pwd','git_status','npm_test','npm_build','pytest']},confirmation:s},
  ['name','operation','confirmation']),
 desc('codespaces_exec_status','Status und begrenzte Protokollausgabe einer Befehl-Ausführung lesen.',{job_id:s},['job_id']),
 desc('codespaces_exec_cancel','Laufenden SSH-Prozess beenden (best effort).', {job_id:s,confirmation:s},['job_id','confirmation'])
];
const allowedOps={
 pwd:['pwd'],git_status:['git','status','--short'],npm_test:['npm','test','--','--runInBand'],
 npm_build:['npm','run','build'],pytest:['python','-m','pytest','-q']
};
function execStart(name,operation){
 if(process.env.ENABLE_REMOTE_EXEC!=='true')throw Error('Remoteausführung deaktiviert. Separates Opt-in ENABLE_REMOTE_EXEC erforderlich.');
 if(!ghToken())throw Error('GitHub-Codespaces-Token fehlt');
 const cmd=allowedOps[operation];if(!cmd)throw Error('Befehl nicht erlaubt');
 const id=randomUUID(), spawned=spawn('gh',['codespace','ssh','-c',name,'--',...cmd],{
  shell:false,env:{...process.env, GH_TOKEN:ghToken()},stdio:['ignore','pipe','pipe']
 });
 const job={id,name,operation,state:'running',stdout:'',stderr:'',exit_code:null,started_at:new Date().toISOString(),pid:spawned.pid||null};
 executions.set(id,{job,process:spawned});
 const add=(k,d)=>{job[k]=(job[k]+d.toString('utf8')).slice(-MAX_OUTPUT)};
 spawned.stdout?.on('data',d=>add('stdout',d));
 spawned.stderr?.on('data',d=>add('stderr',d));
 spawned.on('error',e=>{job.state='failed';add('stderr',e.message)});
 spawned.on('close',(code,signal)=>{
  job.exit_code=code;job.state=job.state==='cancelled'?'cancelled':code===0?'completed':'failed';
  job.finished_at=new Date().toISOString(); job.signal=signal||null;
 });
 const cutoff=setTimeout(()=>{
  if(job.state==='running'){job.state='timed_out';spawned.kill('SIGTERM')}
 },120000);
 spawned.once('close',()=>clearTimeout(cutoff));
 setTimeout(()=>executions.delete(id),JOB_TTL).unref();
 return {id,state:job.state,operation,name,note:'Remote shell is limited to preapproved commands; cancellation may not terminate all remote child processes.'};
}
async function call(name,args={}){
 switch(name){
 case 'codespaces_status':return {bridge:'online',connected:!!ghToken(),allowed_repositories:[...allowed],remote_execution_enabled:process.env.ENABLE_REMOTE_EXEC==='true',credentials_present:!!ghToken()};
 case 'codespaces_list':{
  const n=Number(args.per_page||30);if(n<1||n>100)throw Error('per_page 1–100');
  return await github('GET','/user/codespaces?per_page='+n);
 }
 case 'codespaces_get':return await github('GET','/user/codespaces/'+requireSlug(args.name));
 case 'codespaces_machines':return await github('GET','/user/codespaces/'+requireSlug(args.name)+'/machines');
 case 'codespaces_create':{
  const repo=requireRepo(args.repository);confirm('CREATE',args.confirmation,repo);
  const body={};if(args.ref)body.ref=String(args.ref).slice(0,128);
  if(args.machine)body.machine=String(args.machine).slice(0,100);
  return await github('POST','/repos/'+repo+'/codespaces',body);
 }
 case 'codespaces_start':{
  const cs=requireSlug(args.name);confirm('START',args.confirmation,cs);
  return await github('POST','/user/codespaces/'+cs+'/start');
 }
 case 'codespaces_stop':{
  const cs=requireSlug(args.name);confirm('STOP',args.confirmation,cs);
  return await github('POST','/user/codespaces/'+cs+'/stop');
 }
 case 'codespaces_delete':{
  const cs=requireSlug(args.name);confirm('DELETE',args.confirmation,cs);
  return await github('DELETE','/user/codespaces/'+cs);
 }
 case 'codespaces_exec':{
  const cs=requireSlug(args.name);confirm('EXEC',args.confirmation,cs+' '+args.operation);
  return execStart(cs,args.operation);
 }
 case 'codespaces_exec_status':{
  const item=executions.get(args.job_id);if(!item)throw Error('Keine passende laufende/gespeicherte Ausführung');
  return item.job;
 }
 case 'codespaces_exec_cancel':{
  const item=executions.get(args.job_id);if(!item)throw Error('Auftrag nicht gefunden');
  confirm('CANCEL',args.confirmation,args.job_id);
  if(item.job.state==='running'){
   item.job.state='cancelled';
   item.process.kill('SIGTERM');
  }
  return item.job;
 }
 default:throw Error('Unbekanntes Werkzeug: '+name)
 }
}
function rpc(data){
 if(!data||typeof data!=='object'||Array.isArray(data))return {...fail('Ungültige JSON-RPC-Nachricht',-32600),id:null};
 const {id,method,params={}}=data;
 if(method==='notifications/initialized')return null;
 if(method==='initialize')return reply(id,{protocolVersion:'2025-06-18',
  capabilities:{tools:{listChanged:false}},serverInfo:{name:'alice-codespaces-bridge',version:'0.1.0'}});
 if(method==='ping')return reply(id,{});
 if(method==='tools/list')return reply(id,{tools});
 if(method==='tools/call')return Promise.resolve().then(()=>call(params.name,params.arguments||{}))
   .then(x=>reply(id,good(x)),e=>reply(id,err(e.message)));
 return {...fail('Unbekannte MCP-Methode',-32601),id:id??null};
}
export function makeServer(){
 return http.createServer(async(req,res)=>{
  const pathname=(req.url||'').split('?')[0];
  if(pathname==='/health'&&req.method==='GET')return json(res,200,{status:'ok',mcp:'ready',gitHubTokenConfigured:!!ghToken(),version:'0.1.0'});
  if(pathname!=='/mcp')return json(res,404,{error:'not found'});
  if(!authorized(req))return json(res,401,{error:'private MCP bridge; authorization required'});
  if(req.method==='GET')return json(res,405,{error:'SSE subscription not supported in stateless mode'});
  if(req.method==='DELETE')return json(res,200,{ok:true});
  if(req.method!=='POST')return json(res,405,{error:'method not allowed'});
  let body='',bytes=0;
  try{
   for await(const chunk of req){
    bytes+=chunk.length;
    if(bytes>MAX_REQUEST){res.writeHead(413);res.end();return}
    body+=chunk.toString('utf8');
   }
   const data=JSON.parse(body);
   const result=await rpc(data);
   if(result===null){res.writeHead(202);res.end();return}
   json(res,200,result);
  }catch(e){json(res,400,{jsonrpc:'2.0',id:null,error:{code:-32700,message:'Ungültige Anfrage'}})}
 });
}
if(process.argv[1] && import.meta.url.endsWith(process.argv[1].replaceAll('\\','/'))){
 const port=Number(process.env.PORT||8080);
 makeServer().listen(port,'0.0.0.0',()=>console.log('ALICE Codespaces MCP bridge listening on port '+port));
}
