import express from 'express';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const app=express();
app.disable('x-powered-by');
app.use((req,res,next)=>{res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Cache-Control','no-store');next();});
app.use(express.json({limit:'48kb'}));
app.use(express.urlencoded({extended:false,limit:'4kb'}));

const REQUIRED_USER='Zweeback';
const REPOS=new Set((process.env.GITHUB_ALLOWED_REPOS||'Zweeback/alicealpha').split(',').map(x=>x.trim()).filter(Boolean));
const PUBLIC_URL=process.env.PUBLIC_BASE_URL||'https://alice-codespaces-bridge.onrender.com';
const AUTH=process.env.BRIDGE_ACCESS_TOKEN||'';
const GITHUB_TOKEN=process.env.GITHUB_TOKEN||'';
const ADMIN_PIN=process.env.ADMIN_PIN||'';
const API='https://api.github.com';
const TTL=12*60*1000;
const actions=new Map();
const attempts=new Map();
const schema=(properties,required=[])=>({type:'object',properties,required,additionalProperties:false});
const field=(description)=>({type:'string',description});
const LIMIT_MESSAGE='GitHub Codespaces access not authorized: set a dedicated GitHub fine-grained token in the Render service GITHUB_TOKEN environment variable. Never put GitHub tokens in chat or Git.';
const tool=(name,description,inputSchema)=>({name,description,inputSchema});
const defs=[
 tool('connection_status','Read bridge configuration and GitHub scope status; never exposes secrets.',schema({})),
 tool('codespaces_list','List allowed GitHub Codespaces (read-only).',schema({})),
 tool('codespace_view','Get one Codespace and its machine/state (read-only).',schema({name:field('Exact Codespace name.')},['name'])),
 tool('codespace_machines','List permitted available machine sizes for a repository (read-only).',schema({repository:field('Owner/repository name, default Zweeback/alicealpha.')})),
 tool('codespace_propose_create','Propose new Codespace; requires separate browser confirmation before billable creation.',schema({repository:field('Allowed owner/repository.'),ref:field('Existing branch or SHA to use.'),machine:field('Available GitHub machine type, optional.'),idle_timeout_minutes:{type:'integer',minimum:5,maximum:240}} ,['repository','ref'])),
 tool('codespace_propose_start','Propose start; requires external browser approval.',schema({name:field('Exact Codespace name.')},['name'])),
 tool('codespace_propose_stop','Propose stop; requires external browser approval.',schema({name:field('Exact Codespace name.')},['name'])),
 tool('codespace_propose_delete','Propose irreversible Codespace deletion; requires external browser approval.',schema({name:field('Exact Codespace name.')},['name'])),
 tool('codespace_propose_command','Propose a bounded remote shell command; requires browser approval and a separately configured admin PIN.',schema({name:field('Exact Codespace name.'),command:field('Exact shell command shown to user. Max 500 chars; no newlines.'),timeout_seconds:{type:'integer',minimum:3,maximum:90}},['name','command'])),
 tool('approval_status','Read whether a proposal was approved in the browser.',schema({id:field('Proposal ID returned by propose_*.')},['id'])),
 tool('execute_approved','Execute one proposal only after external manual approval. Consent cannot be granted by an MCP tool.',schema({id:field('Approved proposal ID.')},['id']))
];

function safeError(e){return {error:e.message?.slice(0,450)||'Unknown error'};}
function jsonResult(value,error=false){return {content:[{type:'text',text:JSON.stringify(value)}],isError:error};}
function matchSecret(got,want){if(!want)return false;const a=Buffer.from(got||'');const b=Buffer.from(want);return a.length===b.length&&crypto.timingSafeEqual(a,b);}
function requireBridge(req,res,next){
 const auth=req.get('Authorization')||'';
 if(!AUTH||!matchSecret(auth,'Bearer '+AUTH)){res.status(401).json({error:'Unauthorized bridge request'});return;}
 next();
}
function fail(message,status=400){const e=new Error(message);e.status=status;throw e;}
function allowedRepo(name){if(!REPOS.has(name))fail('Repository denied by GITHUB_ALLOWED_REPOS allowlist',403);return name;}
function validCs(name){if(typeof name!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9-]{2,127}$/.test(name))fail('Invalid Codespace name');return name;}
async function github(method,path,body){
 if(!GITHUB_TOKEN)fail(LIMIT_MESSAGE,403);
 const abort=new AbortController();
 const t=setTimeout(()=>abort.abort(),18000);
 try {
  const res=await fetch(API+path,{method,
   headers:{'Authorization':'Bearer '+GITHUB_TOKEN,'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'alice-codespaces-private-bridge','Content-Type':'application/json'},
   ...(body===undefined?{}:{body:JSON.stringify(body)}),signal:abort.signal});
  const raw=await res.text();
  const parsed=raw?JSON.parse(raw):{};
  if(!res.ok)fail('GitHub '+res.status+': '+String(parsed.message||res.statusText).slice(0,240),res.status);
  return parsed;
 } finally{clearTimeout(t);}
}
let identityUntil=0;
async function verifyIdentity(){
 if(Date.now()<identityUntil)return;
 const profile=await github('GET','/user');
 if(profile.login!==REQUIRED_USER)fail('Token belongs to unexpected GitHub account. Expected '+REQUIRED_USER+'.',403);
 identityUntil=Date.now()+2*60*1000;
}
async function getCodespace(name){
 await verifyIdentity();
 const cs=await github('GET','/user/codespaces/'+encodeURIComponent(validCs(name)));
 allowedRepo(cs.repository?.full_name);
 return cs;
}
async function propose(kind,args){
 await verifyIdentity();
 if(kind==='create'){
  const repository=allowedRepo(args.repository);
  if(typeof args.ref!=='string'||args.ref.length>150||!/^[-a-zA-Z0-9_./]+$/.test(args.ref)||args.ref.includes('..'))fail('Invalid Git ref');
  if(args.machine!==undefined&&!/^[a-zA-Z0-9][a-zA-Z0-9.-]{1,80}$/.test(args.machine))fail('Invalid machine type');
  if(args.idle_timeout_minutes!==undefined&&(!Number.isInteger(args.idle_timeout_minutes)||args.idle_timeout_minutes<5||args.idle_timeout_minutes>240))fail('Idle timeout must be 5-240 minutes');
  // Verify user has read permission for the repo without triggering a paid operation.
  await github('GET','/repos/'+repository);
 } else {
  await getCodespace(args.name);
  if(kind==='command'){
   if(ADMIN_PIN.length<8)fail('Remote commands locked: set an 8+ character ADMIN_PIN privately in Render environment.',403);
   if(typeof args.command!=='string'||args.command.length<1||args.command.length>500||/[\r\n\x00]/.test(args.command))fail('Command must be 1-500 characters without newlines.');
   if(args.timeout_seconds!==undefined&&(!Number.isInteger(args.timeout_seconds)||args.timeout_seconds<3||args.timeout_seconds>90))fail('Timeout must be 3-90 seconds');
  }
 }
 for(const [id,p] of actions)if(p.expires<Date.now())actions.delete(id);
 if(actions.size>=120)fail('Pending-approval queue full. Try after prior requests expire.',429);
 const id=crypto.randomBytes(18).toString('hex');
 actions.set(id,{kind,args,created:Date.now(),expires:Date.now()+TTL,status:'pending'});
 return {action:kind,status:'AWAITING_USER_BROWSER_APPROVAL',expires_minutes:12,approval_url:PUBLIC_URL+'/approve/'+id,id,note:'DO NOT call execute_approved until user personally approves in a browser.'};
}
function minimal(cs){return {name:cs.name,state:cs.state,repository:cs.repository?.full_name,git_ref:cs.git_status?.ref,machine:cs.machine?.name,web_url:cs.web_url,created_at:cs.created_at,updated_at:cs.updated_at,idle_timeout_minutes:cs.idle_timeout_minutes};}
async function execRemote(cs,command,seconds){
 const args=['codespace','ssh','-c',cs,'--','bash','-lc',command];
 return await new Promise((resolve,reject)=>{
  const child=spawn('gh',args,{shell:false,env:{...process.env,GH_TOKEN:GITHUB_TOKEN},stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='',truncated=false,settled=false;
  const append=(prev,buf)=>{const s=buf.toString('utf8');if(prev.length+s.length>65000){truncated=true;return (prev+s).slice(0,65000)}return prev+s};
  child.stdout.on('data',x=>{stdout=append(stdout,x)});
  child.stderr.on('data',x=>{stderr=append(stderr,x)});
  const timer=setTimeout(()=>{child.kill('SIGKILL');},seconds*1000);
  child.once('error',e=>{if(settled)return;settled=true;clearTimeout(timer);reject(Error('Remote SSH invocation failed: '+e.message));});
  child.once('close',(code,signal)=>{if(settled)return;settled=true;clearTimeout(timer);resolve({exit_code:code,signal,stdout,stderr,truncated});});
 });
}
async function dispatch(name,args={}){
 switch(name){
 case 'connection_status':
  return {bridge:'ready',github_token_configured:!!GITHUB_TOKEN,pin_configured:!!ADMIN_PIN,
   allowed_repositories:[...REPOS],github_user_expected:REQUIRED_USER,
   github_identity_verified:GITHUB_TOKEN?await verifyIdentity().then(()=>true):false,
   capabilities:{read:true,lifecycle:'manual_browser_approval',remote_command:ADMIN_PIN.length>=8?'manual_browser_approval':'locked'},
   ...(GITHUB_TOKEN?{}:{blocker:LIMIT_MESSAGE})};
 case 'codespaces_list':{
  await verifyIdentity();
  const out=[];let total=0;
  for(let p=1;p<=5;p++){
   const result=await github('GET','/user/codespaces?per_page=100&page='+p);
   const page=result.codespaces||[];
   total+=page.length;
   for(const cs of page)if(REPOS.has(cs.repository?.full_name))out.push(minimal(cs));
   if(page.length<100)break;
  }
  return {codespaces:out,allowed_repo_count:REPOS.size,api_results_scanned:total};
 }
 case 'codespace_view':return minimal(await getCodespace(args.name));
 case 'codespace_machines':{
  await verifyIdentity();const repo=allowedRepo(args.repository||'Zweeback/alicealpha');
  const m=await github('GET','/repos/'+repo+'/codespaces/machines');
  return {repository:repo,machines:m.machines?.map(x=>({name:x.name,display_name:x.display_name,cpus:x.cpus,memory_in_bytes:x.memory_in_bytes,storage_in_bytes:x.storage_in_bytes,availability:x.availability}))||[]};
 }
 case 'codespace_propose_create':return propose('create',args);
 case 'codespace_propose_start':return propose('start',args);
 case 'codespace_propose_stop':return propose('stop',args);
 case 'codespace_propose_delete':return propose('delete',args);
 case 'codespace_propose_command':return propose('command',args);
 case 'approval_status':{
  const p=actions.get(args.id);if(!p)return {status:'not_found_or_expired'};
  if(p.expires<Date.now()){actions.delete(args.id);return {status:'expired'};}
  return {status:p.status,action:p.kind,expires_at:new Date(p.expires).toISOString()};
 }
 case 'execute_approved':{
  const p=actions.get(args.id);
  if(!p||p.expires<Date.now())fail('Approval missing or expired.',403);
  if(p.status!=='approved')fail('Must obtain real user confirmation in the browser.',403);
  p.status='consumed'; // Prevent double run if tool called concurrently.
  try {
   await verifyIdentity();
   let result;
   if(p.kind==='create'){
    const [owner,repo]=p.args.repository.split('/');
    const body={ref:p.args.ref};
    if(p.args.machine)body.machine=p.args.machine;
    if(p.args.idle_timeout_minutes)body.idle_timeout_minutes=p.args.idle_timeout_minutes;
    result=minimal(await github('POST','/repos/'+owner+'/'+repo+'/codespaces',body));
   } else{
    const cs=await getCodespace(p.args.name);
    if(p.kind==='start')result=minimal(await github('POST','/user/codespaces/'+encodeURIComponent(cs.name)+'/start'));
    else if(p.kind==='stop')result=minimal(await github('POST','/user/codespaces/'+encodeURIComponent(cs.name)+'/stop'));
    else if(p.kind==='delete'){
     await github('DELETE','/user/codespaces/'+encodeURIComponent(cs.name));
     result={deleted:true,name:cs.name};
    }else if(p.kind==='command'){
     result={codespace:cs.name,...await execRemote(cs.name,p.args.command,p.args.timeout_seconds||45)};
    }else fail('Unsupported pending action');
   }
   p.status='completed';p.result={executed:true,action:p.kind,...result};
   console.log(JSON.stringify({at:new Date().toISOString(),audit:'codespace_action',action:p.kind,status:'completed',id:args.id.slice(0,12)}));
   return p.result;
  }catch(e){p.status='error';p.result=safeError(e);console.error(JSON.stringify({at:new Date().toISOString(),audit:'codespace_action',action:p.kind,status:'error',id:args.id.slice(0,12)}));throw e;}
 }
 default:fail('Unknown tool '+name);
 }
}
app.get('/health',(req,res)=>res.json({service:'alice-codespaces-private-connector',alive:true,github_configured:!!GITHUB_TOKEN,code_execution_locked:!ADMIN_PIN}));
app.get('/approve/:id',(req,res)=>{
 const p=actions.get(req.params.id);
 if(!p||p.expires<Date.now()){res.status(404).send('Approval missing or expired.');return;}
 const label={create:'Create Codespace (billable)',start:'Start Codespace (may bill)',stop:'Stop Codespace',delete:'Delete Codespace permanently',command:'Run remote command'}[p.kind]||p.kind;
 const param=JSON.stringify(p.args,null,2).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
 res.type('html').send('<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><meta charset="utf-8"><title>Codespaces: explicit authorization</title><main style="font:16px system-ui;max-width:650px;margin:30px auto;padding:20px"><h1>Approve GitHub Codespaces action?</h1><p><b>'+label+'</b></p><pre style="white-space:pre-wrap;overflow-wrap:anywhere;background:#f2f3fa;padding:16px">'+param+'</pre><p>This action is NOT executed until you enter the administrator PIN and confirm below. Never type the PIN in the chat.</p><form method="post"><input type="password" name="pin" minlength="8" placeholder="Administrator PIN" required autocomplete="off" style="padding:12px"><button style="padding:12px" type="submit">Approve this one action</button></form><p>Expires in 12 minutes. Close this page to deny.</p></main></html>');
});
app.post('/approve/:id',(req,res)=>{
 const p=actions.get(req.params.id);
 if(!p||p.expires<Date.now()||p.status!=='pending'){res.status(404).send('No pending approval.');return;}
 const origin=req.get('Origin');
 if(origin&&origin!==PUBLIC_URL){res.status(403).send('Origin mismatch.');return;}
 const ip=req.ip;const state=attempts.get(ip)||{n:0,until:Date.now()+600000};
 if(state.until<Date.now()){state.n=0;state.until=Date.now()+600000;}
 if(state.n>=8){res.status(429).send('Too many attempts.');return;}
 if(ADMIN_PIN.length<8||!matchSecret(req.body.pin,ADMIN_PIN)){state.n++;attempts.set(ip,state);res.status(403).send('Incorrect or unconfigured administrator PIN. No action performed.');return;}
 p.status='approved';p.approved_at=Date.now();
 console.log(JSON.stringify({at:new Date().toISOString(),audit:'external_approval',action:p.kind,id:req.params.id.slice(0,12)}));
 res.type('html').send('<h1>Approved</h1><p>Return to ChatGPT to execute the approved proposal. Approval expires automatically.</p>');
});
app.post('/mcp',requireBridge,async(req,res)=>{
 const server=new Server({name:'alice-codespaces-private',version:'1.0.0'},{capabilities:{tools:{}}});
 server.setRequestHandler(ListToolsRequestSchema,async()=>({tools:defs}));
 server.setRequestHandler(CallToolRequestSchema,async({params})=>{
  try{const value=await dispatch(params.name,params.arguments||{});return jsonResult(value);}
  catch(e){return jsonResult(safeError(e),true);}
 });
 const transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined});
 res.on('close',()=>{transport.close().catch(()=>{});server.close().catch(()=>{});});
 await server.connect(transport);
 await transport.handleRequest(req,res,req.body);
});
app.get('/mcp',requireBridge,(_req,res)=>res.status(405).json({error:'stateless MCP: use POST'}));
app.delete('/mcp',requireBridge,(_req,res)=>res.status(405).end());
const port=Number(process.env.PORT)||3000;
app.listen(port,'0.0.0.0',()=>console.log('ALICE Codespaces bridge listening on port '+port+'. Auth '+(AUTH?'enabled':'MISSING')+', Github '+(GITHUB_TOKEN?'set':'unconfigured')+'.'));
