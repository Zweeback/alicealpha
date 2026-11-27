// Private GitHub Codespaces MCP bridge. No execution/SSH or secrets endpoints.
import http from 'node:http';
import crypto from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';

const PORT=Number(process.env.PORT||3080);
const KEY=process.env.GATEWAY_KEY||'';
const PAT=process.env.GITHUB_CODESPACES_TOKEN||'';
const APPROVED=(process.env.GITHUB_ALLOWED_REPOS||'Zweeback/alicealpha').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
const allow=(repo)=>APPROVED.includes(String(repo||'').toLowerCase());
const err=(code,message)=>{const e=new Error(message);e.code=code;throw e};
const nameOk=n=>{if(!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/.test(n||''))err('INVALID_NAME','Invalid Codespace name');return n};
const repoOk=r=>{if(!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(r||'')||r.includes('..'))err('INVALID_REPO','Invalid repository name');if(!allow(r))err('REPO_DENIED','Repository is not on GITHUB_ALLOWED_REPOS');return r};
const on=()=>{if(process.env.MUTATIONS_ENABLED!=='true')err('MUTATIONS_DISABLED','Mutations disabled in Render environment')};
const confirm=(got,want)=>{if(got!==want)err('APPROVAL_REQUIRED','Requires exact explicit user-authorized phrase: '+want)};
const selected=c=>({name:c?.name,state:c?.state,repository:c?.repository?.full_name,display_name:c?.display_name,machine:c?.machine?.name,created_at:c?.created_at,updated_at:c?.updated_at,web_url:c?.web_url});
async function gh(method,path,body){
  if(!PAT||PAT.length<20)err('NOT_CONNECTED','Codespaces token has not been connected; configure GITHUB_CODESPACES_TOKEN securely in Render settings, not in chat.');
  if(!/^\/(?:user\/codespaces(?:\?per_page=100)?|user\/codespaces\/[A-Za-z0-9_-]+(?:\/(?:machines|start|stop))?|repos\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/(?:codespaces|pulls\/[1-9][0-9]*\/codespaces))$/.test(path)||path.includes('..'))err('API_DENIED','GitHub route not allowlisted');
  const response=await fetch('https://api.github.com'+path,{method,headers:{
    'Accept':'application/vnd.github+json',
    'Authorization':'Bearer '+PAT,
    'X-GitHub-Api-Version':'2022-11-28',
    'User-Agent':'alice-codespaces-bridge/0.1',
    ...(body?{'Content-Type':'application/json'}:{})
  },body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});
  const raw=await response.text();let data;try{data=JSON.parse(raw)}catch{data=null}
  if(!response.ok)err('GITHUB_'+response.status,('GitHub '+response.status+': '+(data?.message||'request failed')).slice(0,270));
  return data;
}
async function existing(name){nameOk(name);const x=await gh('GET','/user/codespaces/'+name);if(!allow(x?.repository?.full_name))err('REPO_DENIED','Codespace belongs to a repository outside the allowlist');return x}
function out(x){return {content:[{type:'text',text:JSON.stringify(x,null,2)}]}}
function add(m,name,desc,shape,fun){m.registerTool(name,{description:desc,inputSchema:shape},async args=>{try{return out(await fun(args))}catch(e){return{isError:true,content:[{type:'text',text:(e.code||'ERROR')+': '+e.message}]}}})}
function makeMcp(){
 const m=new McpServer({name:'alice-codespaces-bridge',version:'0.1.0'});
 add(m,'codespace_capabilities','Read setup requirements, read/write restrictions and current token readiness.',{},async()=>({
  connected:Boolean(PAT),allowed_repositories:APPROVED,mutations_enabled:process.env.MUTATIONS_ENABLED==='true',
  deletion_enabled:process.env.DELETE_ENABLED==='true',
  commands_enabled:false,
  command_explanation:'GitHub Codespaces REST does not expose arbitrary command execution. A separately gated SSH/agent bridge is required.',
  required_permissions:['Codespaces repository read or write','Codespaces lifecycle admin write to start/stop','Codespaces metadata read for machines'],
  note:'A separate fine-grained GitHub token must be authorized by the user. The native GitHub plugin credential is inaccessible.'
 }));
 add(m,'codespace_list','List account Codespaces, filtered to approved repositories; read-only.',{},async()=>{
  const r=await gh('GET','/user/codespaces?per_page=100');
  return{total_count:r.total_count,visible:(r.codespaces||[]).filter(x=>allow(x.repository?.full_name)).map(selected),truncated:r.total_count>100}
 });
 add(m,'codespace_view','Inspect an existing Codespace; read-only.',{name:z.string()},async({name})=>selected(await existing(name)));
 add(m,'codespace_machines','Read available machine types for a Codespace.',{name:z.string()},async({name})=>{
  await existing(name);const r=await gh('GET','/user/codespaces/'+name+'/machines');
  return (r.machines||[]).map(x=>({name:x.name,display_name:x.display_name,cpus:x.cpus,memory_in_bytes:x.memory_in_bytes,availability:x.availability}))
 });
 add(m,'codespace_create','BILLABLE. Requires user permission, exact approval phrase and mutations enabled.',{
  repository:z.string(),ref:z.string().optional(),machine:z.string().optional(),display_name:z.string().optional(),approval:z.string(),approve_billing:z.boolean()
 },async({repository,ref,machine,display_name,approval,approve_billing})=>{
  on();repoOk(repository);confirm(approval,'CREATE '+repository);
  if(approve_billing!==true)err('APPROVAL_REQUIRED','Codespaces may incur charges; approve_billing must be true');
  const body={};if(ref)body.ref=ref;if(machine)body.machine=machine;if(display_name)body.display_name=display_name;
  return selected(await gh('POST','/repos/'+repository+'/codespaces',body));
 });
 add(m,'codespace_create_from_pr','BILLABLE. Create from allowed PR only after explicit user approval.',{
  repository:z.string(),pull_number:z.number().int().positive(),approval:z.string(),approve_billing:z.boolean()
 },async({repository,pull_number,approval,approve_billing})=>{
  on();repoOk(repository);confirm(approval,'CREATE '+repository+'#'+pull_number);
  if(approve_billing!==true)err('APPROVAL_REQUIRED','Must accept Codespaces compute charges');
  return selected(await gh('POST','/repos/'+repository+'/pulls/'+pull_number+'/codespaces',{}));
 });
 add(m,'codespace_start','BILLABLE. Start only after user explicitly authorizes exact Codespace.',{name:z.string(),approval:z.string()},async({name,approval})=>{
  on();nameOk(name);confirm(approval,'START '+name);await existing(name);return selected(await gh('POST','/user/codespaces/'+name+'/start'))
 });
 add(m,'codespace_stop','Stop only after user explicitly authorizes exact Codespace.',{name:z.string(),approval:z.string()},async({name,approval})=>{
  on();nameOk(name);confirm(approval,'STOP '+name);await existing(name);return selected(await gh('POST','/user/codespaces/'+name+'/stop'))
 });
 add(m,'codespace_delete','DESTRUCTIVE. Disabled unless DELETE_ENABLED separately true, plus explicit approval.',{name:z.string(),approval:z.string()},async({name,approval})=>{
  on();if(process.env.DELETE_ENABLED!=='true')err('DELETIONS_DISABLED','Destructive operations are disabled');
  nameOk(name);confirm(approval,'DELETE '+name);await existing(name);
  await gh('DELETE','/user/codespaces/'+name);return{name,deleted:true}
 });
 return m;
}
const server=http.createServer(async(req,res)=>{
  if(req.url==='/health'&&req.method==='GET'){
    res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});
    res.end(JSON.stringify({service:'alice-codespaces-bridge',status:'up',github_configured:!!PAT,mutations_enabled:process.env.MUTATIONS_ENABLED==='true'}));
    return;
  }
  if(req.url!=='/mcp'||req.method!=='POST'){res.writeHead(404);res.end();return}
  const given=req.headers['x-gateway-key']||'';
  if(KEY.length<32||typeof given!=='string'||KEY.length!==given.length||
     !crypto.timingSafeEqual(Buffer.from(KEY),Buffer.from(given))){
    res.writeHead(401,{'content-type':'application/json'});res.end('{"error":"Unauthorized"}');return;
  }
  let body='';
  for await(const chunk of req){
    body+=chunk.toString();if(body.length>30000){res.writeHead(413);res.end();return}
  }
  let parsed;try{parsed=JSON.parse(body)}catch{res.writeHead(400);res.end();return}
  const m=makeMcp();const transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
  try{await m.connect(transport);await transport.handleRequest(req,res,parsed)}
  catch(e){console.error('MCP request failed',e?.message);if(!res.headersSent){res.writeHead(500);res.end('Internal error')}}
  finally{await transport.close();await m.close()}
});
server.listen(PORT,'0.0.0.0',()=>console.log('Private Codespaces MCP ready on port '+PORT+', tokenConfigured='+Boolean(PAT)));
