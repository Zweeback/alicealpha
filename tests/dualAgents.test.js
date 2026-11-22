import { describe, expect, it, vi } from 'vitest';
import { DUAL_AGENT_ROLES, runDualTurn } from '../server/dualAgents.js';

describe('Alice dual-agent contract', () => {
  it('runs separate requests with distinct private system instructions', async () => {
    const calls = [];
    const invoke = vi.fn(async (input, options) => {
      calls.push({ input, options });
      return { reply: options.systemInstructions.includes('Sami') ? 'Sami prueft.' : 'Elisa erkundet.', provider: 'fake', model: 'unit-test' };
    });
    const result = await runDualTurn('Pruefe Alice', { invoke, env: {} });
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(calls.map((x) => x.input.text)).toEqual(['Pruefe Alice', 'Pruefe Alice']);
    expect(calls[0].options.systemInstructions).toBe(DUAL_AGENT_ROLES.sami);
    expect(calls[1].options.systemInstructions).toBe(DUAL_AGENT_ROLES.elisa);
    expect(result).toMatchObject({ fullyOperational: true, mode: 'two-independent-model-calls' });
    expect(result.agents.map((x) => x.id)).toEqual(['sami', 'elisa']);
  });

  it('starts both requests before waiting for either result', async () => {
    const resolvers = [];
    const invoke = vi.fn(() => new Promise((resolve) => resolvers.push(resolve)));
    const pending = runDualTurn('Hallo', { invoke, env: {} });
    expect(invoke).toHaveBeenCalledTimes(2);
    resolvers.forEach((resolve, i) => resolve({ reply: 'Antwort ' + i, provider: 'fake', model: 'test' }));
    const result = await pending;
    expect(result.agents).toHaveLength(2);
  });

  it('reports a partial failure without inventing an answer', async () => {
    const result = await runDualTurn('Hallo', {
      env: {},
      invoke: async (_input, options) => {
        if (options.systemInstructions === DUAL_AGENT_ROLES.sami) throw new Error('provider unavailable');
        return { reply: 'Test', provider: 'fake', model: 'test' };
      },
    });
    expect(result.fullyOperational).toBe(false);
    expect(result.agents[0]).toEqual({
      id: 'sami', status: 'unavailable', reply: null, provider: null, model: null,
    });
    expect(result.agents[1].reply).toBe('Test');
  });

  it('rejects empty or oversized inputs', async () => {
    await expect(runDualTurn('', { invoke: vi.fn() })).rejects.toThrow('dual-input-invalid');
    await expect(runDualTurn('a'.repeat(6001), { invoke: vi.fn() })).rejects.toThrow('dual-input-invalid');
  });

  it('passes agent-labelled attempt telemetry without secrets or prompt material', async () => {
    const events = [];
    await runDualTurn('PRIVAT', {
      env: {},
      onAttempt: (event) => events.push(event),
      invoke: async (_input, options) => {
        options.onAttempt({ outcome: 'success', provider: 'fake' });
        return { reply: 'ok', provider: 'fake', model: 'test' };
      },
    });
    expect(events.map((event) => event.agent)).toEqual(['sami', 'elisa']);
    expect(JSON.stringify(events)).not.toContain('PRIVAT');
  });
});
