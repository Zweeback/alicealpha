const DEFAULT_SEGMENT_TARGET = 420;

function clean(value = '') {
  return String(value).replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim();
}

function sentenceSplit(text) {
  const normalized = clean(text);
  if (!normalized) return [];
  return normalized
    .split(/(?<=[.!?])\s+(?=[A-ZÄÖÜ0-9„“"'(])/u)
    .map((part) => part.trim())
    .filter(Boolean);
}

function inferTitle(text) {
  const first = sentenceSplit(text)[0] || clean(text);
  if (!first) return 'Unbenannter Beitrag';
  return first.length <= 86 ? first : `${first.slice(0, 83).trim()}…`;
}

function segmentKind(index, count) {
  if (index === 0) return 'lead';
  if (index === count - 1 && count > 2) return 'outro';
  return index === 1 ? 'body' : 'context';
}

export function normalizeArticle(input, index = 0) {
  if (typeof input === 'string') {
    const body = clean(input);
    return {
      id: `story-${index + 1}`,
      title: inferTitle(body),
      body,
      source: null,
      sourceUrl: null,
      publishedAt: null,
      evidence: 'UNSET',
      notes: '',
    };
  }

  const body = clean(input?.body || input?.text || input?.content || '');
  return {
    id: clean(input?.id) || `story-${index + 1}`,
    title: clean(input?.title) || inferTitle(body),
    body,
    source: clean(input?.source) || null,
    sourceUrl: clean(input?.sourceUrl || input?.url) || null,
    publishedAt: clean(input?.publishedAt || input?.date) || null,
    evidence: clean(input?.evidence || input?.status || 'UNSET').toUpperCase(),
    notes: clean(input?.notes || ''),
  };
}

export function segmentArticle(article, { targetChars = DEFAULT_SEGMENT_TARGET } = {}) {
  const normalized = normalizeArticle(article);
  const sentences = sentenceSplit(normalized.body);

  if (!sentences.length) {
    return [{
      id: `${normalized.id}-segment-1`,
      kind: 'lead',
      text: normalized.title,
      title: normalized.title,
      evidence: normalized.evidence,
      source: normalized.source,
      sourceUrl: normalized.sourceUrl,
      estimatedSeconds: Math.max(2, Math.round(normalized.title.length / 14)),
    }];
  }

  const chunks = [];
  let current = '';

  for (const sentence of sentences) {
    const candidate = current ? `${current} ${sentence}` : sentence;
    if (current && candidate.length > targetChars) {
      chunks.push(current);
      current = sentence;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);

  return chunks.map((text, index) => ({
    id: `${normalized.id}-segment-${index + 1}`,
    kind: segmentKind(index, chunks.length),
    text,
    title: normalized.title,
    evidence: normalized.evidence,
    source: normalized.source,
    sourceUrl: normalized.sourceUrl,
    estimatedSeconds: Math.max(3, Math.round(text.length / 14)),
  }));
}

export function buildScenePlan(articles, options = {}) {
  const stories = (Array.isArray(articles) ? articles : [articles])
    .map((item, index) => normalizeArticle(item, index))
    .filter((item) => item.body || item.title);

  const segments = stories.flatMap((story) => segmentArticle(story, options));

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    format: 'PARALLAX NEWS',
    presenter: 'alice',
    stories,
    segments,
    scenes: segments.map((segment, index) => ({
      sceneId: `scene-${index + 1}`,
      order: index,
      type: 'alice-talking-head',
      segmentId: segment.id,
      script: segment.text,
      camera: index === 0 ? 'medium-close' : 'close',
      lowerThird: {
        headline: segment.title,
        source: segment.source,
        evidence: segment.evidence,
      },
      graphics: {
        sourceUrl: segment.sourceUrl,
        showTicker: true,
        showEvidenceBadge: true,
      },
      durationHintSeconds: segment.estimatedSeconds,
      render: {
        avatar: 'alice',
        voice: 'alice-default',
        lipSync: 'A/I/U/E/O',
        background: 'parallax-newsroom',
      },
    })),
  };
}

export function parseStudioInput(raw) {
  const text = clean(raw);
  if (!text) return [];

  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed?.articles)) return parsed.articles;
    if (parsed && typeof parsed === 'object') return [parsed];
  } catch {
    // Plain text is a valid single-article input.
  }

  return [text];
}
