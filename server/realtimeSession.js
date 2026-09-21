import { ALICE_REALTIME_INSTRUCTIONS, ALICE_TOOLS } from './alicePrompt.js';

export function buildRealtimeSession(env = process.env) {
  return {
    type: 'realtime',
    model: env.OPENAI_REALTIME_MODEL || 'gpt-realtime-2.1',
    instructions: ALICE_REALTIME_INSTRUCTIONS,
    tools: ALICE_TOOLS,
    tool_choice: 'auto',
    audio: {
      input: {
        transcription: {
          model: env.OPENAI_TRANSCRIPTION_MODEL || 'gpt-4o-mini-transcribe',
          language: 'de',
        },
        turn_detection: {
          type: 'semantic_vad',
          eagerness: 'medium',
          create_response: true,
          interrupt_response: true,
        },
      },
      output: {
        voice: env.OPENAI_REALTIME_VOICE || 'marin',
      },
    },
  };
}
