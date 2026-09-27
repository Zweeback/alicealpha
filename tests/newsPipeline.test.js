import { describe, expect, it } from 'vitest';
import { buildScenePlan, normalizeArticle, parseStudioInput, segmentArticle } from '../src/news/newsPipeline.js';

describe('news pipeline', () => {
  it('accepts plain text as one article', () => {
    const items = parseStudioInput('Erster Satz. Zweiter Satz.');
    expect(items).toEqual(['Erster Satz. Zweiter Satz.']);
  });

  it('accepts article json arrays', () => {
    const items = parseStudioInput('[{"title":"A","body":"B"}]');
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('A');
  });

  it('normalizes evidence metadata', () => {
    expect(normalizeArticle({ body: 'Text.', evidence: 'verified' }).evidence).toBe('VERIFIED');
  });

  it('splits long stories into separate presenter segments', () => {
    const story = { title: 'Test', body: 'Satz eins ist hier. Satz zwei ist ebenfalls hier. Satz drei endet den Beitrag.' };
    const parts = segmentArticle(story, { targetChars: 30 });
    expect(parts.length).toBeGreaterThan(1);
    expect(parts[0].kind).toBe('lead');
  });

  it('builds an Alice scene per segment', () => {
    const plan = buildScenePlan([{ title: 'Test', body: 'Hallo Welt. Noch ein Satz.' }], { targetChars: 20 });
    expect(plan.presenter).toBe('alice');
    expect(plan.scenes.length).toBe(plan.segments.length);
    expect(plan.scenes[0].type).toBe('alice-talking-head');
  });
});
