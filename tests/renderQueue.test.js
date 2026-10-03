import { describe, expect, it } from 'vitest';
import { createRenderQueue, nextRenderJob, updateRenderJob } from '../src/news/renderQueue.js';

describe('render queue', () => {
  const plan = {
    presenter: 'alice',
    scenes: [
      { sceneId: 'scene-1', order: 0, script: 'Hallo.', render: { voice: 'alice-default', avatar: 'alice' } },
      { sceneId: 'scene-2', order: 1, script: 'Weiter.' },
    ],
  };

  it('creates one render job per scene', () => {
    const queue = createRenderQueue(plan);
    expect(queue.jobs).toHaveLength(2);
    expect(queue.jobs[0].state).toBe('queued');
  });

  it('returns the next incomplete render job', () => {
    const queue = createRenderQueue(plan);
    expect(nextRenderJob(queue).sceneId).toBe('scene-1');
  });

  it('becomes ready when all jobs are ready', () => {
    let queue = createRenderQueue(plan);
    queue = updateRenderJob(queue, 'render-1', { state: 'ready' });
    queue = updateRenderJob(queue, 'render-2', { state: 'ready' });
    expect(queue.state).toBe('ready');
  });
});
