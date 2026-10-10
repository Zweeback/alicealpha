import { describe,it,expect } from 'vitest';
import {LSMissionJournal,canAdvance,applyMissionEvent,normalizeMission} from '../src/core/lsMissions.js';
describe('LS finite feedback loop',()=>{
  const m={id:'alice-face',title:'Alice face rig',stage:'discovery',status:'queued',provider:'jules'};
  it('is idempotent across restarts',()=>{
    const db=new Map();const storage={getItem:k=>db.get(k),setItem:(k,v)=>db.set(k,v)};
    const a=new LSMissionJournal(storage);a.enqueue(m);a.enqueue(m);
    expect(new LSMissionJournal(storage).list()).toHaveLength(1);
  });
  it('prevents overclaim without provenance and refuses skipped stages',()=>{
    expect(canAdvance({...m,status:'verified'},'design')).toBe(false);
    expect(canAdvance({...m,status:'verified',evidence:[{url:'https://github.com/Zweeback/alicealpha/pull/112',sha:'abc'}]},'release')).toBe(false);
    expect(applyMissionEvent(m,{type:'status',status:'verified'}).status).toBe('queued');
  });
  it('advances exactly one stage after evidenced verification',()=>{
    const evidence={url:'https://github.com/Zweeback/alicealpha/commit/abc',sha:'abc',kind:'commit'};
    const withEvidence=applyMissionEvent(m,{id:'e1',type:'evidence',evidence});
    expect(withEvidence.evidence).toHaveLength(1);
    const verified=applyMissionEvent(withEvidence,{id:'e2',type:'status',status:'verified'});
    const next=applyMissionEvent(verified,{id:'e3',type:'advance',stage:'design'});
    expect(next).toMatchObject({stage:'design',status:'queued'});
  });
  it('bounds retries and ignores unsafe URLs',()=>{
    expect(normalizeMission({...m,evidence:[{url:'javascript:alert(1)',sha:'bad'}]}).evidence).toHaveLength(0);
    let now={...m,status:'blocked'};
    for(let i=0;i<5;i++) {now=applyMissionEvent(now,{id:'r',type:'retry'});now={...now,status:'blocked'};}
    expect(now.attempts).toBe(3);
  });
});
