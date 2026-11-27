import { describe, expect, it } from 'vitest';
import { encodeWav, gladosPiperDir } from '../server/gladosPiper.js';

describe('German GLaDOS Piper voice', () => {
  it('encodes PCM16 mono WAV', () => {
    const wav = encodeWav(new Float32Array([0, 0.5, -1, 1]), 22050);
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
    expect(wav.readUInt32LE(24)).toBe(22050);
    expect(wav.length).toBe(44 + 8);
  });
  it('stays disabled without an installed model', () => {
    const prev = process.env.ALICE_GLADOS_PIPER_DIR;
    process.env.ALICE_GLADOS_PIPER_DIR = '/nonexistent';
    expect(gladosPiperDir()).toBeNull();
    if (prev === undefined) delete process.env.ALICE_GLADOS_PIPER_DIR; else process.env.ALICE_GLADOS_PIPER_DIR = prev;
  });
});
