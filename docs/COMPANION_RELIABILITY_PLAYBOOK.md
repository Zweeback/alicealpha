# Companion Reliability / Recovery Playbook

## Core contract

Every subsystem is treated as:

`INPUT -> PRECONDITION -> STATE -> OPERATION -> OUTPUT -> TIMEOUT -> ERROR_CLASS -> FALLBACK -> RECOVERY -> VERIFY`

The runtime must attribute failure to the narrowest observed boundary instead of collapsing everything into "Alice is broken".

## Liveness rule

"Alice is running" means:

1. Alice has a valid identity and persistent state.
2. At least one interaction input is available.
3. At least one output path is available.

Camera, cloud connectivity, neural TTS, lip-sync and the 3D avatar are optional capabilities. Their failure degrades Alice; it does not erase Alice.

## Recovery ladder

1. RETRY
2. RESET
3. RECONNECT
4. RESTART_WORKER
5. SUBSTITUTE
6. DEGRADE
7. RESTORE
8. ESCALATE

The per-failure sequence is declared in `data/failure-registry.yaml`.

## Known-good vertical slice

The permanent smoke path is:

`mic -> STT -> agent -> TTS -> avatar`

Additional capabilities (memory, vision, tools, emotion, motion, home automation, world model) must not be allowed to destroy this slice.

## Runtime states

- OFFLINE
- BOOTING
- SELF_TEST
- READY
- LISTENING
- TRANSCRIBING
- THINKING
- SPEAKING
- INTERRUPTED
- DEGRADED_AUDIO
- DEGRADED_VISION
- DEGRADED_MEMORY
- DEGRADED_AVATAR
- DEGRADED_NETWORK
- RECOVERING
- FAILED_COMPONENT
- SAFE_MODE

## Attribution example

Given:

- mic: ok
- VAD: ok
- STT: ok
- agent: ok
- TTS: ok, 83 chunks
- playback: timeout
- avatar: ok

the attribution engine returns `PLAYBACK_TIMEOUT`, domain `playback`, owner `audio_output`, and the declared recovery path. It does not blame TTS, the avatar, the LLM, or "Alice".

## Runtime surfaces

- `GET /api/reliability` returns the machine-readable contract metadata and known-good slice status.
- `POST /api/reliability/diagnose` accepts a turn trace and returns the attributed component, failure code, fallback, degradation state, recovery sequence and regression test.
- `GET /api/health` advertises the reliability schema and degraded text safe-mode.

## Example trace

```json
{
  "trace_id": "turn-42",
  "stages": [
    {"stage":"mic","status":"ok","latency_ms":20},
    {"stage":"vad","status":"ok","latency_ms":80},
    {"stage":"stt","status":"ok","latency_ms":812},
    {"stage":"agent","status":"ok","latency_ms":436},
    {"stage":"tts","status":"ok","latency_ms":194,"detail":{"chunks":83}},
    {"stage":"playback","status":"timeout"},
    {"stage":"avatar","status":"ok"}
  ]
}
```

## Rule for new failures

A new failure class is not complete until it has:

- stable error code
- responsible domain and owner
- probe
- timeout
- retry policy
- fallback
- recovery sequence
- degraded state
- regression test

Unknown failures become `ATTRIBUTION_GAP` rather than being silently guessed.
