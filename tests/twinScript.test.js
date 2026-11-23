import { describe, expect, it } from 'vitest';
import {
  BOOT_DIALOGUE,
  LOCAL_FALLBACK_LABEL,
  TWINS,
  createLine,
  parseLine,
  respondLocally,
  visemeFor,
} from '../src/twins/twinScript.js';

describe('twin line parsing', () => {
  it('strips stage markers from the spoken text but keeps them for display', () => {
    const line = parseLine('*flüstert* ...und dann schauen wir... *kichert leise*');
    expect(line.display).toContain('*flüstert*');
    expect(line.spoken).not.toMatch(/[*]/);
    expect(line.spoken).not.toMatch(/\.\.\./);
    expect(line.spoken).toBe('und dann schauen wir');
    expect(line.cues).toEqual(['whisper', 'giggle']);
  });

  it('gives plain lines no cues and a bounded duration', () => {
    const line = parseLine('Die Architektur steht.');
    expect(line.cues).toEqual([]);
    expect(line.durationMs).toBeGreaterThanOrEqual(900);
    expect(line.durationMs).toBeLessThanOrEqual(14000);
  });

  it('rejects unknown speakers', () => {
    expect(() => createLine('nobody', 'Hallo')).toThrow('unknown-speaker:nobody');
  });
});

describe('twin voice routing', () => {
  it('maps each twin to its own logical voice key and a distinct pitch profile', () => {
    expect(TWINS.sami.voiceId).toBe('alice_alpha');
    expect(TWINS.elisa.voiceId).toBe('alice_omega');
    expect(TWINS.sami.pitch).toBeLessThan(TWINS.elisa.pitch);
  });

  it('boot dialogue alternates SAMI and ELISA starting with SAMI', () => {
    expect(BOOT_DIALOGUE.length).toBeGreaterThanOrEqual(2);
    BOOT_DIALOGUE.forEach((line, index) => {
      expect(line.speaker).toBe(index % 2 === 0 ? 'sami' : 'elisa');
    });
  });

  it('keeps SAMI cold: she never whispers or giggles, ELISA always whispers', () => {
    BOOT_DIALOGUE.filter((line) => line.speaker === 'sami').forEach((line) => expect(line.cues).toEqual([]));
    BOOT_DIALOGUE.filter((line) => line.speaker === 'elisa').forEach((line) => expect(line.cues).toContain('whisper'));
  });
});

describe('local fallback reply', () => {
  it('answers with exactly SAMI then ELISA and labels itself as non-model behaviour', () => {
    const reply = respondLocally('Prüf bitte, ob die Quelle echt ist');
    expect(reply.source).toBe('local-fallback');
    expect(reply.label).toBe(LOCAL_FALLBACK_LABEL);
    expect(reply.lines.map((line) => line.speaker)).toEqual(['sami', 'elisa']);
    expect(reply.lines[0].cues).toEqual([]);
    expect(reply.lines[1].cues).toContain('whisper');
  });

  it('handles empty input and truncates very long input', () => {
    expect(respondLocally('   ').lines).toHaveLength(2);
    const long = respondLocally(`Idee ${'x'.repeat(400)}`);
    expect(long.lines[0].display.length).toBeLessThan(200);
  });
});

describe('viseme mapping', () => {
  it('maps vowels and falls back to rest', () => {
    expect(visemeFor('a')).toBe('A');
    expect(visemeFor('Ö')).toBe('O');
    expect(visemeFor('k')).toBe('rest');
    expect(visemeFor('')).toBe('rest');
  });
});
