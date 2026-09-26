const VOWEL_TO_VISEME = Object.freeze({
  a: 'A',
  ä: 'A',
  i: 'I',
  y: 'I',
  u: 'U',
  ü: 'U',
  e: 'E',
  o: 'O',
  ö: 'O',
});

export const VRM_VISEME_EXPRESSIONS = Object.freeze({
  A: 'aa',
  I: 'ih',
  U: 'ou',
  E: 'ee',
  O: 'oh',
});

export function visemeForTextBoundary(text, charIndex = 0) {
  const source = String(text || '');
  if (!source) return null;

  const start = Math.max(0, Math.min(source.length, Number(charIndex) || 0));
  const tail = source.slice(start);
  const word = tail.match(/^\s*([^\s.,!?;:()[\]{}"'“”‘’—-]+)/u)?.[1] || '';

  for (const character of word.toLowerCase()) {
    const viseme = VOWEL_TO_VISEME[character];
    if (viseme) return viseme;
  }

  return null;
}
