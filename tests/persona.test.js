import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../src/core/memory.js';
import { AlicePersona } from '../src/core/persona.js';

const storage = () => ({ getItem: () => null, setItem: () => undefined });

describe('AlicePersona fallback', () => {
  it('requires explicit confirmation before permanent memory', async () => {
    const memory = new MemoryStore(storage());
    const alice = new AlicePersona(memory);

    const proposal = await alice.respond('Merk dir: Mein Hund heißt Lotte');
    expect(proposal.candidate.status).toBe('candidate');
    expect(memory.confirmed()).toHaveLength(0);

    await alice.respond('Ja, bitte bestätigen');
    expect(memory.confirmed()[0].value).toBe('Mein Hund heißt Lotte');
  });

  it('responds to distress without dependency pressure', async () => {
    const alice = new AlicePersona(new MemoryStore(storage()));
    const response = await alice.respond('Ich bin gerade völlig überfordert');

    expect(response.dialogueAct).toBe('support');
    expect(response.reply).not.toMatch(/nur mich|verlass mich nicht|brauchst nur mich/i);
  });

  it('labels question answers as local fallback instead of faking model reasoning', async () => {
    const alice = new AlicePersona(new MemoryStore(storage()));
    const response = await alice.respond('Wie funktioniert die Live-Anbindung?');

    expect(response.dialogueAct).toBe('question');
    expect(response.reply).toMatch(/Live-KI-Kanal.*nicht verbunden/i);
    expect(response.reply).not.toMatch(/mehr Kontext|eigentliche Kern|technische Seite/i);
  });
});
