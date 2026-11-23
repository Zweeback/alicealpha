// Browser text-to-speech for the twin stage.
// Honest limits: the browser offers system voices only. A real whisper or a real giggle needs a
// TTS runtime that accepts the logical voice keys (alice_alpha / alice_omega). Until then the
// whisper is a quieter, slower voice and the giggle is a short high "hihi".

import { visemeFor } from './twinScript.js';

const FEMALE = /(katja|amala|anna|petra|vicki|marlene|hedda|seraphina|elke|female|weiblich|google deutsch)/i;
const MALE = /(stefan|conrad|florian|killian|markus|hans|jonas|lukas|yannick|\bmale\b|männlich)/i;

export function pickVoices(list = []) {
  const german = list.filter((voice) => /^de/i.test(voice?.lang || ''));
  if (!german.length) return { sami: null, elisa: null, distinct: false, count: 0 };
  const isFemale = (voice) => FEMALE.test(voice.name || '');
  const isMale = (voice) => MALE.test(voice.name || '') && !isFemale(voice);
  const sami = german.find(isMale) || german.find((voice) => !isFemale(voice)) || german[0];
  const elisa = german.find((voice) => isFemale(voice) && voice !== sami) || german.find((voice) => voice !== sami) || sami;
  return { sami, elisa, distinct: sami !== elisa, count: german.length };
}

export function speechProfile(twin, line) {
  const whisper = line.cues.includes('whisper');
  return {
    pitch: twin.pitch * (whisper ? 0.96 : 1),
    rate: twin.rate * (whisper ? 0.88 : 1),
    volume: whisper ? 0.45 : 1,
  };
}

export function createVoiceDirector({
  synth = globalThis.speechSynthesis,
  Utterance = globalThis.SpeechSynthesisUtterance,
  setTimer = (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimer = (id) => globalThis.clearTimeout(id),
} = {}) {
  let picked = { sami: null, elisa: null, distinct: false, count: 0 };
  let cancelActive = null;

  const refresh = () => {
    picked = pickVoices(synth?.getVoices?.() || []);
    return picked;
  };
  refresh();
  synth?.addEventListener?.('voiceschanged', refresh);

  const audioAvailable = () => Boolean(synth && Utterance && picked.count > 0);

  function cancel() {
    cancelActive?.();
    cancelActive = null;
    try { synth?.cancel?.(); } catch { /* ignore */ }
  }

  // Resolves when the line is finished, cancelled or timed out. Never rejects.
  function speak(line, twin, { muted = false, onViseme = () => {}, onGiggle = () => {} } = {}) {
    cancel();
    return new Promise((resolve) => {
      const timers = new Set();
      let settled = false;
      let boundaryIndex = -1;
      const spoken = line.spoken || '';
      const startedAt = Date.now();

      const finish = () => {
        if (settled) return;
        settled = true;
        timers.forEach(clearTimer);
        timers.clear();
        onViseme('rest');
        cancelActive = null;
        resolve();
      };
      cancelActive = finish;

      const useAudio = !muted && audioAvailable() && spoken.length > 0;
      const later = (fn, ms) => {
        const id = setTimer(fn, ms);
        timers.add(id);
        return id;
      };

      const tick = () => {
        if (settled) return;
        const elapsed = Date.now() - startedAt;
        const guess = Math.min(spoken.length - 1, Math.floor((elapsed / line.durationMs) * spoken.length));
        const index = boundaryIndex >= 0 ? boundaryIndex : guess;
        onViseme(visemeFor(spoken[Math.max(0, index)]));
        if (!useAudio && elapsed >= line.durationMs) { endLine(); return; }
        later(tick, 75);
      };

      const endLine = () => {
        if (settled) return;
        onViseme('rest');
        if (line.cues.includes('giggle')) {
          onGiggle();
          if (useAudio) {
            const extra = new Utterance('hihi');
            extra.lang = 'de-DE';
            extra.pitch = 1.9;
            extra.rate = 1.25;
            extra.volume = 0.6;
            if (twin.voiceId && picked.elisa) extra.voice = picked.elisa;
            extra.onend = extra.onerror = finish;
            try { synth.speak(extra); } catch { finish(); return; }
            later(finish, 1800);
            return;
          }
          later(finish, 700);
          return;
        }
        finish();
      };

      if (useAudio) {
        const profile = speechProfile(twin, line);
        const utterance = new Utterance(spoken);
        utterance.lang = 'de-DE';
        utterance.pitch = profile.pitch;
        utterance.rate = profile.rate;
        utterance.volume = profile.volume;
        const voice = twin.id === 'sami' ? picked.sami : picked.elisa;
        if (voice) utterance.voice = voice;
        utterance.onboundary = (event) => { if (Number.isFinite(event.charIndex)) boundaryIndex = event.charIndex; };
        utterance.onend = utterance.onerror = () => endLine();
        try { synth.speak(utterance); } catch { endLine(); return; }
        later(endLine, line.durationMs * 2 + 2500); // some engines never fire onend
      }
      tick();
    });
  }

  return {
    speak,
    cancel,
    refresh,
    get voices() { return picked; },
    get audio() { return audioAvailable(); },
  };
}
