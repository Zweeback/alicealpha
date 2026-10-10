#!/usr/bin/env node
// Official Jules REST API safe launcher. Without --execute it ONLY prints
// a redacted plan. Never write credentials to repo or logs.
const args=process.argv.slice(2);
const execute=args.includes('--execute');
const promptFile=args.find(v=>v.startsWith('--prompt-file='))?.slice('--prompt-file='.length)||'docs/LS_JULES_MISSION.md';
const repo='Zweeback/alicealpha';
const branch='feat/alice-live-3d-switch-20261010';
const issue='https://github.com/Zweeback/alicealpha/issues/113';
const description='Inspect existing Alice GLB/VRM facial rigs, bones and morph targets. Implement an auditable, source-preserving rig inspector with tests; do not ship as canonical and do not upload user reference media. See '+issue+'.';
const payload={
  title:'Alice hyperreal rig audit / LS mission',
  prompt:description,
  requirePlanApproval:true,
  automationMode:'AUTO_CREATE_PR',
};
const plan={repository:repo,branch,issue,promptFile,auth:'X-Goog-Api-Key from JULES_API_KEY runtime environment (never logged)',...payload};
if(!execute){
  process.stdout.write(JSON.stringify({mode:'dry-run',status:'NOT_LAUNCHED',plan},null,2)+'\n');
  process.exit(0);
}
const key=process.env.JULES_API_KEY;
if(!key){console.error('Blocked: JULES_API_KEY is not configured');process.exit(2);}
const sourceName=process.env.JULES_SOURCE;
if(!sourceName){console.error('Blocked: set JULES_SOURCE to the exact Jules connected source name from GET /v1alpha/sources');process.exit(2);}
if(!/^sources\/[a-zA-Z0-9/._-]+$/.test(sourceName)){console.error('Blocked: malformed JULES_SOURCE');process.exit(2);}
const fetchApi=async (path,init={})=>{
 const response=await fetch('https://jules.googleapis.com/v1alpha/'+path,{
  ...init,
  headers:{'x-goog-api-key':key,'content-type':'application/json'},
  signal:AbortSignal.timeout(15000),
 });
 if(!response.ok){throw Error('Jules '+path+' responded HTTP '+response.status);}
 return response.json();
};
try{
 // Verify that the source belongs to the authenticated user's Jules account.
 const list=await fetchApi('sources');
 const sources=list.sources||[];
 if(!sources.some(s=>s.name===sourceName&&s.githubRepo?.owner==='Zweeback'&&s.githubRepo?.repo==='alicealpha')){
   throw Error('Selected repo not found in the first page of authorized Jules sources; list sources explicitly before retrying');
 }
 const created=await fetchApi('sessions',{method:'POST',body:JSON.stringify({
   ...payload,
   sourceContext:{source:sourceName,githubRepoContext:{startingBranch:branch}},
 })});
 process.stdout.write(JSON.stringify({status:'STARTED_AWAITING_PLAN_APPROVAL',session:created.name,url:created.url,approvalRequired:true},null,2)+'\n');
}catch(error){
 console.error('Blocked:',error.message);
 process.exit(1);
}
