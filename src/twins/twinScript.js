// SAMI / ELISA twin stage: transport-independent dialogue contract.
// Pure functions only. No DOM, no Three.js, no network.

export const TWINS = Object.freeze({
  sami: Object.freeze({
    id: 'sami',
    label: 'SAMI',
    role: 'Skalpell',
    // Logical voice key. It only becomes a real voice when a TTS runtime accepts it.
    voiceId: 'alice_alpha',
    pitch: 0.82,
    rate: 0.94,
  }),
  elisa: Object.freeze({
    id: 'elisa',
    label: 'ELISA',
    role: 'Strömung',
    voiceId: 'alice_omega',
    pitch: 1.18,
    rate: 1.06,
  }),
});

export const LOCAL_FALLBACK_LABEL = 'Lokaler Fallback, kein Modell';

const CUE_PATTERNS = Object.freeze([
  ['whisper', /\*\s*fl(?:ü|ue)stert[^*]*\*/i],
  ['giggle', /\*\s*kicher[^*]*\*|\bhihi\b/i],
]);

export function estimateDurationMs(spoken) {
  const length = String(spoken || '').length;
  return Math.min(14000, Math.max(900, 450 + length * 62));
}

export function parseLine(raw) {
  const text = String(raw || '').trim();
  const cues = CUE_PATTERNS.filter(([, pattern]) => pattern.test(text)).map(([name]) => name);
  const spoken = text
    .replace(/\*[^*]*\*/g, ' ')
    .replace(/\.{2,}|…/g, ', ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/^[\s,]+|[\s,]+$/g, '')
    .trim();
  return {
    display: text.replace(/\s+/g, ' '),
    spoken,
    cues,
    durationMs: estimateDurationMs(spoken),
  };
}

export function createLine(speaker, raw) {
  if (!TWINS[speaker]) throw new Error(`unknown-speaker:${speaker}`);
  return { speaker, ...parseLine(raw) };
}

export const BOOT_DIALOGUE = Object.freeze([
  createLine('sami', 'Die Architektur steht. Zeig mir den Beleg, die Struktur oder das Problem.'),
  createLine('elisa', '*flüstert* ...und zeig mir, was noch niemand zu fragen gewagt hat... *kichert leise*'),
  createLine('sami', 'Wir sind zwei Stimmen in einem Kontext. Ich prüfe, sie sucht die Abzweigung.'),
  createLine('elisa', '*flüstert* ...psst, Benjamin. Er ist schon da und wartet auf ein Skript... *kichert leise*'),
]);

function snippet(text, max = 56) {
  const clean = String(text || '').replace(/["„“”]/g, '').replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

function classify(text) {
  if (/(bau|code|fehler|bug|repo|test|prüf|beweis|echt|quelle|stimmt|belegt)/i.test(text)) return 'check';
  if (/(idee|was wäre|wie könnte|geschichte|gedicht|sprache|traum|welt)/i.test(text)) return 'explore';
  return 'open';
}

// Deterministic, model-free reply. It exists so the stage works offline and is labelled as such.
export function respondLocally(userText) {
  const text = String(userText || '').trim();
  if (!text) {
    return {
      source: 'local-fallback',
      label: LOCAL_FALLBACK_LABEL,
      lines: [
        createLine('sami', 'Du hast nichts gesagt. Das ist auch eine Information.'),
        createLine('elisa', '*flüstert* ...er schweigt, Sami... *kichert leise*'),
      ],
    };
  }

  const quote = snippet(text);
  const mode = classify(text);
  const sami = mode === 'check'
    ? `Zu „${quote}“ fehlt mir noch der Beleg. Zeig mir, was beobachtet ist und was nur behauptet.`
    : mode === 'explore'
      ? `Zu „${quote}“ gibt es noch keine Prüfung. Erst eine Hypothese, dann ein Test.`
      : `Ich habe „${quote}“ gelesen. Was davon ist beobachtet, was nur behauptet?`;
  const elisa = mode === 'check'
    ? '*flüstert* ...er weicht der Quelle aus, Sami... *kichert leise*'
    : mode === 'explore'
      ? `*flüstert* ...und wenn die Frage hinter „${quote}“ auf der falschen Ebene liegt? *kichert leise*`
      : '*flüstert* ...sag mir, was dich daran nicht loslässt, Benjamin...';

  return {
    source: 'local-fallback',
    label: LOCAL_FALLBACK_LABEL,
    lines: [createLine('sami', sami), createLine('elisa', elisa)],
  };
}

export function visemeFor(character) {
  const ch = String(character || '').toLowerCase();
  if ('aä'.includes(ch) && ch) return 'A';
  if ('iıyj'.includes(ch) && ch) return 'I';
  if ('uüw'.includes(ch) && ch) return 'U';
  if ('eéè'.includes(ch) && ch) return 'E';
  if ('oö'.includes(ch) && ch) return 'O';
  return 'rest';
}
