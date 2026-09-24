import { describe, expect, it } from 'vitest';
import { buildAliceKernelSnapshot, buildExternalCapabilityBus } from '../server/capabilityRegistry.js';

describe('Alice external capability bus', () => {
  it('separates workflow skills from executable tool surfaces', () => {
    const bus = buildExternalCapabilityBus();

    expect(bus.schema).toBe('alice.external-capability-bus.v1');
    expect(bus.summary).toEqual({ total: 49, skill: 18, tool: 31, unresolved: 0 });
    expect(bus.entries.some((entry) => entry.name === 'Product Design' && entry.kind === 'skill')).toBe(true);
    expect(bus.entries.some((entry) => entry.name === 'Slack' && entry.kind === 'tool')).toBe(true);
  });

  it('resolves the user-facing aliases without inventing a second capability', () => {
    const bus = buildExternalCapabilityBus();
    const unity = bus.entries.find((entry) => entry.name === 'Unity Essentials');
    const flightDeck = bus.entries.find((entry) => entry.name === 'FlightDeck');
    const fallow = bus.entries.find((entry) => entry.name === 'Fallow Code Analysis');

    expect(unity.route).toBe('skills://plugins/unity-workbench');
    expect(flightDeck.route).toBe('skills://plugins/flightdeck-review');
    expect(fallow.route).toBe('skills://plugins/fallow');
  });

  it('publishes the bus through the canonical Alice kernel snapshot', () => {
    const snapshot = buildAliceKernelSnapshot({}, () => '2026-09-25T00:40:00.000Z');

    expect(snapshot.kernel).toBe('0.3.1');
    expect(snapshot.external_capability_bus.summary.total).toBe(49);
    expect(snapshot.invariants.skills_are_not_external_authority).toBe(true);
    expect(snapshot.invariants.tool_presence_is_not_connection_proof).toBe(true);
  });
});
