import { describe, expect, it, vi } from 'vitest';
import { runDualTurn } from '../server/dualAgents.js';

describe('Alice dual turn: independent model requests', () => {
  it('launches two independent agents before awaiting either one', async () => {
    let release;
    const barrier = new Promise((resolve) => { release = resolve; });
    const invoked = [];
    const complete = vi.fn(async ({ text }, { systemPrompt }) => {
      invoked.push({ text, systemPrompt });
      await barrier;
      return { reply: systemPrompt.includes('SAMI') ? 'Analyse' : 'Hypothese', provider: 'test', model: 'fake' };
    });
    const pending = runDualTurn({ text: 'Untersuche Code' , complete, synthesize: false });
    await Promise.resolve();
    expect(invoked).toHaveLength(2);
    expect(invoked[0].systemPrompt).not.toEqual(invoked[1].systemPrompt);
    expect(invoked.map((x) => x.text)).toEqual(['Untersuche Code', 'Untersuche Code']);
    release();
    const result = await pending;
    expect(result.status).toBe('ok');
    expect(result.agents.map((x) => x.id)).toEqual(['sami', 'elisa']);
    expect(result.synthesis.status).toBe('skipped');
  });

  it('runs Alice synthesis only after two responses', async () => {
    const calls = [];
    const result = await runDualTurn({
      text: 'Prüfe Eintrag',
      complete: async ({ text }, { systemPrompt }) => {
        calls.push({ text, systemPrompt });
        return { reply: systemPrompt.includes('SAMI') ? 'Sami prüft' : systemPrompt.includes('ELISA') ? 'Elisa erkundet' : 'Alice integriert', provider: 'test', model: 'fake' };
      },
    });
    expect(calls).toHaveLength(3);
    expect(calls[2].text).toContain('Sami prüft');
    expect(calls[2].text).toContain('Elisa erkundet');
    expect(result.synthesis.reply).toEqual('Alice integriert');
    expect(result.synthesis.id).toEqual('alice');
  });

  it('does not counterfeit a successful second agent when provider fails', async () => {
    const result = await runDualTurn({
      text: 'Prüfe Eintrag',
      complete: async (_input, { systemPrompt }) => {
        if (systemPrompt.includes('SAM I'.replace(' ', ''))) throw Error('hidden-key');
        return { reply: 'Elisa prüft', provider: 'test', model: 'fake' };
      },
    });
    expect(result.status).toBe('partial');
    expect(result.agents[0].status).toBe('error');
    expect(result.synthesis.status).toBe('skipped');
    expect(JSON.stringify(result)).not.toContain('hidden-key');
  });

  it('rejects empty and oversized inputs', async () => {
    await expect(runDualTurn({text:' ',complete:async()=>({reply:'a'})})).rejects.toThrow('dual-input-required');
    await expect(runDualTurn({text:'x'.repeat(4097),complete:async()=>({reply:'a'})})).rejects.toThrow('dual-input-too-long');
  });
});