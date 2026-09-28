# PARALLAX NEWS · Alice Engine

Open the studio with:

```
/?studio=news
```

## Runtime pipeline

```
ARTICLE / RAW TEXT
  -> parseStudioInput
  -> normalizeArticle
  -> segmentArticle
  -> buildScenePlan
  -> createRenderQueue
  -> voice adapter
  -> A/I/U/E/O viseme layer
  -> Alice NewsWorld
  -> compositor / stream / file
```

The editorial input, segmentation, scene plan, and render queue are independent from any single TTS,
lip-sync, video-generation, OBS, or streaming provider.

## Input

Plain text is accepted as one article. JSON can be one object, an array, or an `articles` array.

Supported fields:

- `title`
- `body`, `text`, or `content`
- `source`
- `sourceUrl` / `url`
- `publishedAt` / `date`
- `evidence`
- `notes`

## Scene contract

Each segment becomes a scene containing:

- isolated presenter script
- camera hint
- headline/source/evidence lower-third data
- duration hint
- avatar/voice/lip-sync/background render contract

The browser studio can run one scene or the full scene sequence.

## API

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

The endpoint is deterministic and works without an LLM.
