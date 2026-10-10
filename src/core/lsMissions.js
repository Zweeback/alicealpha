// LS bounded mission journal. Browser-local journal only; no hidden background agent.
// A mission is never "done" merely because a provider says it is.
export const LS_MISSION_KEY = 'alice.ls.missions.v1';
export const LS_STAGES = Object.freeze(['discovery','design','implementation','verification','review','release']);
const stageSet = new Set(LS_STAGES);
const statusSet = new Set(['queued','running','blocked','verified','rejected']);
const MAX_MISSIONS = 24;
function clean(value, n=200) { return String(value??'').trim().slice(0,n); }
export function normalizeMission(raw) {
  if (!raw || !clean(raw.id,96) || !clean(raw.title)) return null;
  const stage=stageSet.has(raw.stage)?raw.stage:'discovery';
  const status=statusSet.has(raw.status)?raw.status:'queued';
  const evidence=Array.isArray(raw.evidence)?raw.evidence.filter(x=>x&&typeof x.url==='string'&&/^https:\/\//.test(x.url)&&x.url.length<=600).slice(-20).map(x=>({url:x.url,sha:clean(x.sha,128),kind:clean(x.kind,40)})):[];
  return {id:clean(raw.id,96),title:clean(raw.title),stage,status,
    provider:clean(raw.provider,50), attempts:Math.max(0,Math.min(3,Math.trunc(Number(raw.attempts)||0))),
    evidence};
}
export function canAdvance(mission, nextStage) {
  const m=normalizeMission(mission);
  if(!m||!stageSet.has(nextStage))return false;
  if(LS_STAGES.indexOf(nextStage)!==LS_STAGES.indexOf(m.stage)+1)return false;
  // No stage progression without machine-checkable, attributed evidence.
  return m.status==='verified' && m.evidence.some(x=>x.sha||x.kind==='source');
}
export function applyMissionEvent(mission, event) {
  const m=normalizeMission(mission);
  if(!m || !event || !clean(event.id)) return m;
  const evidence=event.evidence;
  if(event.type==='evidence' && evidence?.url && /^https:\/\//.test(evidence.url)){
    const ref={url:clean(evidence.url,600),sha:clean(evidence.sha,128),kind:clean(evidence.kind,40)};
    if (!ref.sha && ref.kind!=='source') return m;
    if(m.evidence.some(x=>x.url===ref.url&&x.sha===ref.sha))return m;
    return {...m,evidence:[...m.evidence,ref].slice(-20)};
  }
  if(event.type==='status' && statusSet.has(event.status)) {
    if (event.status==='verified' && !m.evidence.some(x=>x.sha||x.kind==='source'))return m;
    return {...m,status:event.status};
  }
  if(event.type==='advance' && canAdvance(m,event.stage)){
    return {...m,stage:event.stage,status:'queued'};
  }
  if(event.type==='retry' && m.attempts<3 && ['blocked','rejected'].includes(m.status)) {
    return {...m,attempts:m.attempts+1,status:'queued'};
  }
  return m;
}
export class LSMissionJournal {
  constructor(storage=globalThis.localStorage){this.storage=storage;}
  list(){
    try{const raw=JSON.parse(this.storage?.getItem(LS_MISSION_KEY)||'[]');return(Array.isArray(raw)?raw:[]).map(normalizeMission).filter(Boolean).slice(-MAX_MISSIONS);}
    catch{return[];}
  }
  #save(missions){try{this.storage?.setItem(LS_MISSION_KEY,JSON.stringify(missions.slice(-MAX_MISSIONS)));return true;}catch{return false;}}
  enqueue({id,title,provider=''}){
    const cleanMission=normalizeMission({id,title,provider});
    if(!cleanMission)return null;
    const missions=this.list();
    if(missions.some(m=>m.id===cleanMission.id))return missions.find(m=>m.id===cleanMission.id);
    this.#save([...missions,cleanMission]);return cleanMission;
  }
  record(id,event){
    const missions=this.list();const index=missions.findIndex(m=>m.id===id);
    if(index<0)return null;
    missions[index]=applyMissionEvent(missions[index],event);
    this.#save(missions);return missions[index];
  }
}
