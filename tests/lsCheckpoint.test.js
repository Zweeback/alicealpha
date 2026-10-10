import { describe, it, expect } from 'vitest';
import { AliceCheckpoint, parseCheckpoint, CHECKPOINT_KEY, CHECKPOINT_TTL_MS } from '../src/core/lsCheckpoint.js';
describe('non-sensitive LS runtime checkpoint', () => {
  const now = 1791590400000;
  it('saves only allowlisted fields and survives a reopened store', () => {
    const kv = new Map();
    const storage = { getItem:k=>kv.get(k)||null, setItem:(k,v)=>kv.set(k,v), removeItem:k=>kv.delete(k) };
    const one = new AliceCheckpoint(storage, ()=>now);
    one.save({ stage:'speaking', voice:'whisper', view:'trellis', transcript:'secret', password:'secret' });
    const two = new AliceCheckpoint(storage, ()=>now);
    expect(two.restore()).toMatchObject({ stage:'speaking',voice:'whisper',view:'trellis' });
    expect(kv.get(CHECKPOINT_KEY)).not.toContain('secret');
    one.clear();
    expect(two.restore()).toBeNull();
  });
  it('rejects invalid, stale, and future checkpoints', () => {
    const item = { schema:1, updatedAt:now, view:'portrait', voice:'french', stage:'ready' };
    expect(parseCheckpoint(item,now).view).toBe('portrait');
    expect(parseCheckpoint({...item,updatedAt:now-CHECKPOINT_TTL_MS-1},now)).toBeNull();
    expect(parseCheckpoint({...item,updatedAt:now+11000},now)).toBeNull();
    expect(parseCheckpoint('{invalid',now)).toBeNull();
  });
  it('fails closed to allowlisted values', () => {
    const x = parseCheckpoint({ schema:1, updatedAt:now, stage:'exfiltrate', view:'remote', voice:'not-here', completedTurns:-8 },now);
    expect(x).toMatchObject({stage:'idle',view:'procedural',voice:'french',completedTurns:0});
  });
});
