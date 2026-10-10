// Read-only live status from PUBLIC GitHub repository metadata.
// It never executes agent tasks or sends private storage to external services.
const BASE = 'https://api.github.com/repos/Zweeback/alicealpha';
const TIMEOUT_MS = 6500;
async function json(url, fetcher) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetcher(url,{headers:{accept:'application/vnd.github+json'},signal:controller.signal});
    if(!response.ok) throw new Error('GitHub HTTP '+response.status);
    return response.json();
  } finally { clearTimeout(timeout); }
}
export async function readLsLiveFeed(fetcher=globalThis.fetch, capturedAt=()=>new Date().toISOString()) {
  const targets=[
    {id:'avatar-pr',label:'Alice Avatar · PR #112',path:'/pulls/112',url:'https://github.com/Zweeback/alicealpha/pull/112'},
    {id:'copilot-rig',label:'Copilot Rigging · Issue #113',path:'/issues/113',url:'https://github.com/Zweeback/alicealpha/issues/113'},
    {id:'forensics',label:'Webforensik · Issue #114',path:'/issues/114',url:'https://github.com/Zweeback/alicealpha/issues/114'},
  ];
  const entries=await Promise.all(targets.map(async target=>{
    try {
      const data=await json(BASE+target.path,fetcher);
      const names=(data.assignees||[]).map(x=>x.login).filter(Boolean).slice(0,6);
      return {
        id:target.id,label:target.label,url:target.url,
        state:data.state==='closed'?(data.merged_at?'merged':'closed'):'open',
        draft:typeof data.draft==='boolean'?data.draft:null,
        headSha:data.head?.sha||null,
        assignees:names,
        checked:true,
      };
    } catch(error) {
      return {id:target.id,label:target.label,url:target.url,state:'unavailable',checked:false,error:String(error.message||error).slice(0,100)};
    }
  }));
  return {schema:1,capturedAt:capturedAt(),source:'github-public-rest',entries};
}
