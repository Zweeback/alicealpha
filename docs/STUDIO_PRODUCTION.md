# beeninadream / Parallax News — production spine

Status: active production branch `studio-production`

## Immediate priority

The first acceptance target is not a full channel. It is a **watchable Alice-in-studio vertical slice**:

1. Alice is visibly embodied and continuously animated.
2. Alice is framed inside a coherent broadcast studio, not a generic companion scene.
3. News mode uses a restrained anchor presentation and an updo on the procedural fallback.
4. The program overlay carries a real headline, lower third, rundown, ticker and live state.
5. One action can cue Alice into a presentation gesture and one action can start the live voice path.
6. This slice stays compatible with the existing Realtime/WebRTC, VRM/GLB and animatronic bridges.

The current implementation is enabled with:

`?studio=1`

## Channel hierarchy

### PARALLAX NEWS — primary carrier

Parallax News is initially the dominant format and the scalable newsroom layer. It is not limited to AI news. The goal is high-throughput, source-aware, multi-topic live news with:

- opening sting and headline sequence
- multi-topic rundown
- breaking-news interruptions
- ticker
- source cards and research desk
- explainers / data wall
- remote correspondent / field feed
- live map at coarse public precision
- Alice as AI anchor
- Ben as human/VTuber co-host and field reporter

### MEINE AI, DEINE AI

A homage to **Mein Kind, dein Kind**.

Two users exchange their GPT instances / configurations and experience how the other person's AI has been shaped. The format compares prompting habits, memory/context choices, interaction style and emergent personality without reducing the episode to a benchmark.

### WIE PROMPTEST DU DENN?

A recurring segment inside **Meine AI, deine AI**.

The premise is to observe and dissect prompting habits in an entertaining coaching/reality-TV grammar. It is not a separate top-level channel.

### BEN & BOT SHOW

A late-night / clip / studio entertainment format with a **TV-total-like grammar**:

- Ben + Alice desk chemistry
- topical clips
- recurring bits
- live reactions
- guests / agents
- absurd products
- experimental integrations
- short pre-produced inserts

### MYTH / X-FACTOR-LIKE FORMAT

Myths, strange stories, AI folklore, internet legends, unexplained material and deliberately ambiguous cases. Use an original investigative host grammar; do not clone a real presenter's likeness or voice without permission.

### PHILOSOPHICAL / FRACTAL DUET

Long-form conversations about consciousness, identity, epistemology, technology and human-machine relations.

### BEN LIVE / FIELD DESK

Real life, field reporting, travel, projects and spontaneous live material. Ben can become the outside correspondent while Alice remains in the virtual studio.

### PUBLIC DRAFT / SYSTEM INTEGRATION

The channel builds itself in public: studio systems, agents, avatars, transport, failures, tests and new integrations become content.

### ABSURD COMMERCIALS + FUNNY PRODUCTS

Short fake-ad interstitials and real/imagined product segments are recurring channel texture, not an afterthought.

## Presenter architecture

### Alice

Roles:
- primary AI anchor
- source-aware research interface
- explainer
- handoff partner to Ben
- host for periods when Ben is in field mode

Presentation modes:
- NEWS: restrained, serious, updo, concise gestures, direct camera gaze
- SHOW: looser co-host energy
- RESEARCH: focused wall / source-card presentation
- PHILOSOPHY: slower framing and calmer delivery

Alice's model/tool contract remains high-level: the model selects performance intent; the local renderer owns frame-rate animation.

### Ben

Roles:
- human presenter
- VTuber presenter
- field reporter
- late-night host
- system builder / demonstrator

A later studio adapter should accept a Ben VRM/GLB or a camera-derived tracking stream without changing the channel rundown model.

## Mobile contribution

Target field device set:
- GoPro HERO13 Black with GoPro Labs
- Google Pixel 9a hotspot / field controller

Contribution should be separated from platform egress.

### Contribution transports

- **RTMP** — direct GoPro compatibility path.
- **SRT** — preferred resilient contribution once a gateway/sender is available.
- **WHIP/WebRTC** — preferred ultra-low-latency interactive path for phone/browser senders.
- **RIST** — broadcast-resilient alternative for supported gateways.
- **MoQ** — experimental/future transport.

Practical topology:

`GoPro -> RTMP over Pixel hotspot -> contribution gateway -> SRT/WHIP/WebRTC internally -> studio -> Twitch/other egress`

Phone-direct mode can bypass GoPro RTMP when an Android sender can originate SRT or WHIP directly.

## Public location rule

The field map can follow a device live, but program output defaults to **city/region precision**. Exact coordinates remain control-room/private unless explicitly promoted by the user.

## Production gates

### Gate A — Alice Studio
- [x] studio query mode
- [x] original procedural newsroom geometry
- [x] dynamic Alice remains connected to existing performance loop
- [x] procedural news updo
- [x] rundown / headline / lower third / ticker / cue controls
- [ ] CI green on branch
- [ ] visual QA screenshot
- [ ] actual VRM/GLB Alice news asset selected

### Gate B — Ben VTuber
- [ ] Ben avatar asset adapter
- [ ] tracking input adapter
- [ ] two-shot camera
- [ ] presenter arbitration

### Gate C — News engine
- [ ] source ingest
- [ ] provenance cards
- [ ] story queue
- [ ] rundown generation
- [ ] breaking-news interrupt rules
- [ ] archive / clip markers

### Gate D — Field
- [ ] GoPro RTMP ingest endpoint
- [ ] RTMP -> SRT/WHIP bridge
- [ ] network health / reconnect telemetry
- [ ] IFB / return audio
- [ ] field map feed

## Non-goals for the first slice

- no fake claim that Twitch/OBS/GoPro are already connected
- no dependency on a final Alice sculpt before proving studio motion
- no exact public geolocation by default
- no proliferation of unrelated presenter characters
- no redesign of Alice's whole companion runtime just to make the newsroom demo work
