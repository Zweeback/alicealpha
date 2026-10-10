import {describe,it,expect,vi} from 'vitest';
import {readLsLiveFeed} from '../src/core/lsLiveFeed.js';
describe('LS read-only live GitHub feed',()=>{
 it('captures agent/PR state from actual provider-shaped responses',async()=>{
  const fetcher=vi.fn(async url=>({
   ok:true,json:async()=>url.endsWith('112')?{state:'open',draft:true,head:{sha:'abc123'}}:
      url.endsWith('113')?{state:'open',assignees:[{login:'Copilot'}]}:{state:'open',assignees:[]},
  }));
  const frame=await readLsLiveFeed(fetcher,()=> '2026-10-10T00:00:00Z');
  expect(frame.entries).toHaveLength(3);
  expect(frame.entries.find(x=>x.id==='copilot-rig').assignees).toContain('Copilot');
  expect(frame.entries.find(x=>x.id==='avatar-pr').headSha).toBe('abc123');
  expect(fetcher).toHaveBeenCalledTimes(3);
  expect(fetcher.mock.calls.every(c=>c[0].startsWith('https://api.github.com/repos/Zweeback/alicealpha/'))).toBe(true);
 });
 it('does not fabricate agent status when provider fails',async()=>{
  const frame=await readLsLiveFeed(async()=>{throw Error('offline');});
  expect(frame.entries.every(x=>x.state==='unavailable'&&!x.checked)).toBe(true);
 });
});
