# BEN & ALICE · News Studio Pipeline

Open the studio with:

```
/?studio=news
```

The talking-head renderer remains independently embeddable:

```
/?embed=talking-head&visual=3d&avatar=glb
```

## Pipeline

```
ARTICLE INPUT
  -> normalizeArticle
  -> segmentArticle
  -> buildScenePlan
  -> createRenderQueue
  -> voice provider
  -> lip-sync provider
  -> compositor
  -> output / stream
```

The important boundary is deliberate: editorial input and scene planning do not depend on a
specific TTS, lip-sync, video-generation, OBS, or streaming provider.

## Input contract

Plain text is accepted as one story. Structured input may be a single object or an `articles`
array. Useful fields:

- `title`
- `body` / `text` / `content`
- `source`
- `sourceUrl`
- `publishedAt`
- `evidence` such as `VERIFIED`, `REPORTED`, `ANALYSIS`
- `notes`

## Scene contract

Every generated scene contains:

- presenter: Alice
- isolated moderation script
- camera hint
- lower-third data
- evidence/source metadata
- duration hint
- render contract for avatar, voice, lip-sync, and background

## Server API

`POST /api/news/prepare`

Example:

```json
{
  "articles": [
    {
      "title": "Titel",
      "body": "Artikeltext",
      "source": "Quelle",
      "evidence": "VERIFIED"
    }
  ],
  "targetChars": 420
}
```

This endpoint is deterministic and does not require an LLM. An editorial/research model can be
inserted before or after segmentation later without coupling it to the Alice renderer.

## GitHub-resource direction

The user's resource inventory contains several relevant families: talking-avatar/digital-human
projects, LiveTalking, Duix Avatar/Mobile, LiveKit, voice/TTS projects, and workflow orchestration
projects. The studio therefore keeps those concerns behind replaceable provider adapters instead
of hard-wiring one external service.
