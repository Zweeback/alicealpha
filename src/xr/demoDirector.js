export const ALICE_VISUAL_DEMO = [
  {
    duration_ms: 5200,
    phase: 'listening',
    caption: '',
    presence: { present: true, confidence: 0.98, x: -0.08, y: 0.04, expression: 'neutral' },
    cue: { gesture: 'attentive', emotion: 'neutral', gaze: 'direct_soft', intensity: 0.28, duration_ms: 5200 },
  },
  {
    duration_ms: 6500,
    phase: 'speaking',
    caption: 'Ich bin da.',
    presence: { present: true, confidence: 0.99, x: 0.04, y: -0.02, expression: 'smile' },
    cue: { gesture: 'welcome', emotion: 'warm', gaze: 'direct_soft', intensity: 0.46, duration_ms: 6500 },
  },
  {
    duration_ms: 6200,
    phase: 'thinking',
    caption: '',
    presence: { present: true, confidence: 0.96, x: 0.15, y: 0.06, expression: 'curious' },
    cue: { gesture: 'consider', emotion: 'curious', gaze: 'slightly_away', intensity: 0.38, duration_ms: 6200 },
  },
  {
    duration_ms: 7200,
    phase: 'speaking',
    caption: 'Sag einfach, was du brauchst.',
    presence: { present: true, confidence: 0.99, x: 0, y: 0, expression: 'smile' },
    cue: { gesture: 'open_hands', emotion: 'warm', gaze: 'direct_soft', intensity: 0.52, duration_ms: 7200 },
  },
];

export function visualDemoEnabled(search = globalThis.location?.search || '') {
  return new URLSearchParams(search).get('demo') === '1';
}
