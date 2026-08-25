const gestures = {
  greeting: 'welcome',
  support: 'hand_to_core',
  question: 'consider',
  explain: 'open_hands',
  memory: 'hand_to_core',
  boundary: 'settle',
  neutral: 'attentive',
};

function utteranceId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `utt-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createPerformancePlan(text, state = {}, dialogueAct = 'neutral') {
  const words = String(text).trim().split(/\s+/).filter(Boolean);
  const estimatedDurationMs = Math.max(900, words.length * 315 + 420);
  const wordSpan = estimatedDurationMs / Math.max(words.length, 1);
  const timeline = words.map((word, index) => ({
    t_ms: Math.round(index * wordSpan),
    type: 'speech_beat',
    strength: Math.min(1, 0.35 + Math.max(2, word.length) / 12),
  }));

  timeline.unshift({ t_ms: 0, type: 'gesture', name: gestures[dialogueAct] || gestures.neutral });
  timeline.push({ t_ms: estimatedDurationMs - 260, type: 'gesture', name: 'settle' });

  return {
    schema_version: '1.0.0',
    utterance_id: utteranceId(),
    spoken_text: text,
    dialogue_act: dialogueAct,
    interruptible: true,
    state: {
      warmth: state.warmth ?? 0.58,
      curiosity: state.curiosity ?? 0.48,
      concern: state.concern ?? 0.08,
      playfulness: state.playfulness ?? 0.18,
    },
    voice: {
      language: 'de-DE',
      rate: dialogueAct === 'support' ? 0.87 : 0.93,
      pitch: 1.06,
      volume: 0.9,
    },
    timeline,
    duration_ms: estimatedDurationMs,
    safety: {
      motion_profile: 'close_proximity',
      max_velocity_scale: 0.48,
    },
  };
}

export function validatePerformancePlan(plan) {
  if (!plan || plan.schema_version !== '1.0.0') return false;
  if (!plan.utterance_id || typeof plan.spoken_text !== 'string') return false;
  if (!Array.isArray(plan.timeline)) return false;
  return plan.timeline.every((cue) => Number.isFinite(cue.t_ms) && cue.t_ms >= 0 && typeof cue.type === 'string');
}
