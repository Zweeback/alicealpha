import { describe, it, expect } from 'vitest';
import {
  resolveRuntimeMode,
  adjudicateDualProposals,
  validateDualOperator,
  createDualEvidenceEnvelope,
  prioritizeDualInput,
} from '../src/core/dualAgencyContract.js';

describe('Alice Genesis v12 execution contract', () => {
  it('does not present simulated voices as independent models', () => {
    expect(resolveRuntimeMode('dual', { independentAgents: false }).mode).toBe('chat');
    expect(resolveRuntimeMode('dual', { independentAgents: true }).mode).toBe('dual');
    expect(resolveRuntimeMode('live', { independentAgents: true, realtimeAvatar: false }).mode).toBe('dual');
    expect(resolveRuntimeMode('live', { independentAgents: true, realtimeAvatar: true }).mode).toBe('live');
  });

  it('treats opposite direction as contradiction even for identical words', () => {
    expect(adjudicateDualProposals(
      {target: 'commit', action: 'merge', polarity: 1},
      {target: 'commit', action: 'merge', polarity: -1}
    ).state).toBe('contradiction');
  });

  it('does not treat different methods as agreement on an action', () => {
    expect(adjudicateDualProposals(
      {target: 'commit', action: 'review', polarity: 1},
      {target: 'commit', action: 'merge', polarity: 1}
    ).state).toBe('same-direction-different-method');
  });

  it('requires verification even when proposed actions match', () => {
    expect(adjudicateDualProposals(
      {target: 'commit', action: 'review', polarity: 1},
      {target: 'commit', action: 'review', polarity: 1}
    ).verify).toBe(true);
  });

  it('denies operator writes without authorization', () => {
    expect(validateDualOperator({type: 'write', authorized: false, providerAvailable: true}).allowed).toBe(false);
    expect(validateDualOperator({type: 'read', authorized: true, providerAvailable: false}).allowed).toBe(false);
    expect(validateDualOperator({type: 'read', providerAvailable: true}).allowed).toBe(true);
  });

  it('denies unverified claims of completed work', () => {
    expect(() => createDualEvidenceEnvelope({kind: 'VRM',source:'prompt',observed:false,artifact:'alice.vrm'})).toThrow();
    expect(() => createDualEvidenceEnvelope({kind: 'VRM',source:'repo',observed:true})).toThrow();
    expect(createDualEvidenceEnvelope({kind:'test',source:'node',observed:true,artifact:'output'}).observed).toBe(true);
  });

  it('prioritizes the stop word in either conversation mode', () => {
    expect(prioritizeDualInput('stopp', {mode: 'live', speaker: 'elisa'})).toEqual({mode:'chat',speaker:'alice',halt:true});
    expect(prioritizeDualInput('Alice, stopp jetzt.', {mode: 'dual', speaker: 'sami'})).toEqual({mode:'chat',speaker:'alice',halt:true});
    expect(prioritizeDualInput('Neuer Versuch', {mode: 'dual', speaker: 'sami'})).toEqual({mode:'dual',speaker:'sami',halt:false});
  });
});
