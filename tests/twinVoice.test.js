import { describe, expect, it } from 'vitest';
import { TWINS, createLine } from '../src/twins/twinScript.js';
import { createVoiceDirector, pickVoices, speechProfile } from '../src/twins/twinVoice.js';

const voice = (name, lang = 'de-DE') => ({ name, lang });

describe('voice picking', () => {
  it('returns no voices when no German voice exists', () => {
    const picked = pickVoices([voice('Samantha', 'en-US')]);
    expect(picked).toMatchObject({ sami: null, elisa: null, distinct: false, count: 0 });
  });

  it('gives SAMI a male-sounding and ELISA a female-sounding German voice', () => {
    const picked = pickVoices([voice('Microsoft Katja'), voice('Microsoft Stefan'), voice('Daniel', 'en-GB')]);
    expect(picked.sami.name).toBe('Microsoft Stefan');
    expect(picked.elisa.name).toBe('Microsoft Katja');
    expect(picked.distinct).toBe(true);
  });

  it('does not treat "female" as male and falls back to one shared voice honestly', () => {
    const picked = pickVoices([voice('Deutsch female')]);
    expect(picked.sami).toBe(picked.elisa);
    expect(picked.distinct).toBe(false);
  });
});

describe('speech profile', () => {
  it('makes whisper lines quieter and slower and keeps SAMI lower than ELISA', () => {
    const whisper = speechProfile(TWINS.elisa, createLine('elisa', '*flüstert* ...hallo'));
    const plain = speechProfile(TWINS.elisa, createLine('elisa', 'Hallo'));
    expect(whisper.volume).toBeLessThan(plain.volume);
    expect(whisper.rate).toBeLessThan(plain.rate);
    expect(speechProfile(TWINS.sami, createLine('sami', 'Hallo')).pitch).toBeLessThan(plain.pitch);
  });
});

describe('voice director without audio', () => {
  function fakeTimers() {
    let now = 0;
    const pending = [];
    return {
      setTimer: (fn, ms) => { const id = pending.length; pending.push({ fn, at: now + ms, id }); return id; },
      clearTimer: (id) => { const item = pending[id]; if (item) item.fn = null; },
      advance(ms) {
        const end = now + ms;
        for (;;) {
          const next = pending.filter((item) => item.fn && item.at <= end).sort((a, b) => a.at - b.at)[0];
          if (!next) break;
          now = next.at;
          const fn = next.fn;
          next.fn = null;
          fn();
        }
        now = end;
      },
    };
  }

  it('resolves after the estimated duration, reports visemes and a final rest', async () => {
    const realNow = Date.now;
    let clock = 1_000;
    Date.now = () => clock;
    const timers = fakeTimers();
    const director = createVoiceDirector({ synth: null, Utterance: null, ...timers });
    const visemes = [];
    const line = createLine('sami', 'Die Architektur steht.');
    let done = false;
    const promise = director.speak(line, TWINS.sami, { onViseme: (v) => visemes.push(v) }).then(() => { done = true; });

    for (let i = 0; i < 200 && !done; i += 1) {
      clock += 75;
      timers.advance(75);
      await Promise.resolve();
    }
    await promise;
    Date.now = realNow;

    expect(done).toBe(true);
    expect(visemes.at(-1)).toBe('rest');
    expect(visemes.some((v) => v !== 'rest')).toBe(true);
    expect(director.audio).toBe(false);
  });

  it('fires the giggle callback for lines with a giggle cue', async () => {
    const realNow = Date.now;
    let clock = 5_000;
    Date.now = () => clock;
    const timers = fakeTimers();
    const director = createVoiceDirector({ synth: null, Utterance: null, ...timers });
    let giggles = 0;
    let done = false;
    const line = createLine('elisa', '*flüstert* ...hallo... *kichert leise*');
    const promise = director.speak(line, TWINS.elisa, { onGiggle: () => { giggles += 1; } }).then(() => { done = true; });
    for (let i = 0; i < 300 && !done; i += 1) {
      clock += 75;
      timers.advance(75);
      await Promise.resolve();
    }
    await promise;
    Date.now = realNow;
    expect(giggles).toBe(1);
  });
});
