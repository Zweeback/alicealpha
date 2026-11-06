// In-process German GLaDOS voice (Piper de_DE-glados-medium, Thorsten-based finetune
// by systemofapwne, https://huggingface.co/systemofapwne/piper-de-glados) via sherpa-onnx.
// Model package: https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-de_DE-glados-medium.tar.bz2
// Free and keyless. Enabled when ALICE_GLADOS_PIPER_DIR points at the extracted package.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let tts = null;

export function gladosPiperDir() {
  const dir = process.env.ALICE_GLADOS_PIPER_DIR;
  if (!dir) return null;
  return fs.existsSync(path.join(dir, 'de_DE-glados-medium.onnx')) ? dir : null;
}

function engine(dir) {
  if (tts) return tts;
  const sherpa = require('sherpa-onnx-node');
  tts = new sherpa.OfflineTts({
    model: {
      vits: {
        model: path.join(dir, 'de_DE-glados-medium.onnx'),
        tokens: path.join(dir, 'tokens.txt'),
        dataDir: path.join(dir, 'espeak-ng-data'),
      },
      numThreads: Number(process.env.ALICE_GLADOS_PIPER_THREADS || 1),
      provider: 'cpu',
    },
    maxNumSentences: 1,
  });
  return tts;
}

export function encodeWav(samples, sampleRate) {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i += 1) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    data.writeInt16LE(Math.round(s * 32767), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + data.length, 4); header.write('WAVE', 8);
  header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24); header.writeUInt32LE(sampleRate * 2, 28); header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

export function synthesizeGladosDe(text) {
  const dir = gladosPiperDir();
  if (!dir) throw new Error('glados-piper-not-installed');
  const audio = engine(dir).generate({ text, sid: 0, speed: Number(process.env.ALICE_GLADOS_PIPER_SPEED || 1) });
  return encodeWav(audio.samples, audio.sampleRate);
}
