# Alice realtime communication architecture

## Where the AI is

The model runs in the provider cloud. Alice's browser is the sensory, rendering and interaction client. The Node server owns the secret and creates the WebRTC session; it does not stream the API key to the browser.

## Session sequence

1. A user gesture starts microphone permission.
2. The browser creates an `RTCPeerConnection`, adds one microphone track and opens the `oai-events` data channel.
3. The browser sends its SDP offer to `POST /api/realtime/session`.
4. The Node server combines SDP with Alice's model, voice, prompt and tool schemas, then authenticates the request to `/v1/realtime/calls`.
5. The SDP answer returns to the browser. Audio now flows over WebRTC; control and transcript events flow over the data channel.
6. Voice activity detection opens and closes turns. A new user turn can interrupt an active model response.
7. The model calls `drive_avatar`. The client validates and maps the cue to a local animation state.
8. Remote audio energy drives Alice's mouth while `AliceWorld` interpolates the body at the device frame rate.

## Performance tool contract

```json
{
  "dialogue_act": "support",
  "emotion": "concerned",
  "gesture": "hand_to_core",
  "gaze": "direct_soft",
  "intensity": 0.62,
  "duration_ms": 4800
}
```

Allowed gestures are deliberately finite. This prevents the model from inventing bone names or commanding unsafe physical motion.

## Perception boundary

`CameraPresence` performs face landmarks locally and emits only:

- presence/no presence
- normalized horizontal and vertical position
- approximate relative distance
- visible smile/curiosity cue
- blink amount and confidence

The raw video track is attached only to a hidden local video element. It is not added to the Realtime peer connection.

In AR and VR, the XR camera/head pose becomes the primary gaze target, so face camera access is unnecessary during the immersive session.

## Memory Tribunal

`propose_memory` creates a hashed candidate. The tool result tells the model to ask for confirmation. Only after a clear decision may `resolve_memory` transition it to `confirmed` or `rejected`. Only confirmed memories are eligible for future context.

## Failure behavior

- Realtime unavailable: browser speech recognition → local rule persona → browser speech synthesis.
- Camera declined: pointer or headset pose remains the gaze target.
- Web Audio restricted: timed mouth motion remains available.
- Serial body disconnected: the digital avatar continues; no commands are buffered into an unknown physical state.
- Network interruption: the UI exposes the interruption and allows a new user-initiated connection.
