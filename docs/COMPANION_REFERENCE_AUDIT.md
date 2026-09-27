# Companion reference audit for Alice v0.3

This document records architectural references reviewed for Alice. It is not a vendoring list.
Alice keeps its own safety, provenance, memory and WebXR boundaries.

## Highest-value reference: SpindL

Source: https://github.com/JChan2787/spindl  
License: MIT.

Why it matters for Alice:
- standalone Tauri 2 + Three.js + `@pixiv/three-vrm` avatar surface
- procedural idle separated from the main renderer
- irregular blink, breathing, saccades, weight shifts and micro-fidgets
- amplitude-driven lipsync and expression composites
- Mixamo FBX -> VRM retargeting with crossfades
- spring-damped cursor/head gaze
- post-processing and transparent desktop overlay

Adoption decision:
- reimplement the architectural ideas inside Alice's existing WebXR runtime
- do not import SpindL's full desktop stack into the browser runtime
- keep Alice's semantic `drive_avatar` contract; local rendering owns physical interpolation
- first adopted slice: standalone micro-motion sampler feeding blink, gaze, breath and speech motion

## Open-LLM-VTuber

Sources:
- https://github.com/Open-LLM-VTuber/Open-LLM-VTuber
- https://github.com/Open-LLM-VTuber/Open-LLM-VTuber-Web

License:
- core code is MIT
- bundled/sample Live2D assets have separate licensing

Useful concepts:
- hands-free interruption
- desktop-pet mode with transparent background and click-through behavior
- Live2D expression mapping
- multiple local/cloud ASR and TTS adapters
- screen/camera perception separated from conversation logic
- TTS language translation / voice-language decoupling

Adoption decision:
- use as reference for future desktop shell and audio interruption regression tests
- do not make Live2D Alice's canonical visual path; Alice remains 3D/WebXR-first
- never import sample character assets without separately checking their asset license

## WaifuOS

Source: https://github.com/uezo/WaifuOS

Useful concept:
- one character identity exposed across multiple channels through shared APIs/state
- day/schedule/context separated from individual client surfaces

Adoption decision:
- useful later for account/device continuity
- not a reason to replace Alice's current browser-local Tribunal memory model before encrypted sync exists

## AGI-DPA

Source: https://github.com/ydsgangge-ux/AGI-DPA  
License: MIT.

Useful concepts:
- layered memory retrieval
- desktop floating-window presence
- VRM avatar surface
- explicit separation between agent reasoning and tool execution

Adoption decision:
- reference only for future memory retrieval and native shell work
- no immediate migration from Alice's simpler confirmed-memory model

## VRC_Daemon

Source: https://github.com/veilaris/VRC_Daemon

License note:
- repository license text includes a commercial-use restriction despite being titled "MIT License"
- treat it as source-available reference, not drop-in MIT code

Useful concepts:
- embodied companion in a persistent VR environment
- OSC / world-state bridge patterns
- vision, movement and conversational state across VR sessions

Adoption decision:
- architecture inspiration only unless permissions are clarified
- potentially useful for a future VRChat/OSC bridge, not for Alice core

## OpenHer

Source: https://github.com/adinwe/OpenHer

Useful concepts:
- explicit dynamic internal state
- long-term style/memory separation
- response style can emerge from state rather than only a static persona prompt

Do not adopt:
- dependency pressure, jealousy, possessiveness, punishment for absence
- deceptive claims that the system literally feels or is human
- engagement loops that optimize attachment at the expense of user agency

Alice's existing contributor rules remain authoritative here.

## Memobase / identity-continuity / related memory projects

Use as research references for:
- profile compression
- episodic vs semantic memory
- decay / recency weighting
- provenance-aware retrieval

Do not bypass Alice's invariant:
- model output may propose memory
- durable memory requires explicit confirmation and provenance

## Visual implementation direction

The next Alice visual architecture should converge on:

1. **Asset layer**
   - licensed VRM/GLB
   - validated humanoid bones, expressions and visemes
   - no candidate silently promoted to canonical

2. **Motion layer**
   - micro-motion sampler
   - gaze / saccades
   - irregular blinking
   - breath and weight shift
   - speech beats
   - expression composites
   - optional authored animation clips with retargeting

3. **Render layer**
   - cinematic lighting
   - restrained color grade
   - physically plausible material response
   - optional post-processing that degrades gracefully on mobile/WebXR

4. **Surface layer**
   - web / PWA
   - immersive AR / VR
   - later: transparent desktop shell

5. **Semantic control**
   - model emits intent, emotion, gaze and gesture
   - local runtime maps those semantic cues to bounded motion
   - model never drives bones frame-by-frame

## Current adoption status

Implemented on `alice-v03-voice-refinement`:
- cinematic UI/stage pass
- canonical desktop visual default until a 3D candidate passes its promotion gate
- whispered German / French-accent voice intent
- organic micro-motion sampler
- irregular blink and saccade injection
- subtle breathing / sway
- multi-viseme VRM speech motion
- tests for the new motion and voice contracts
