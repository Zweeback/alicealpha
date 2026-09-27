const VALID_STATES = new Set(['queued', 'voice', 'lipsync', 'composite', 'ready', 'failed']);

export function createRenderQueue(scenePlan) {
  const scenes = Array.isArray(scenePlan?.scenes) ? scenePlan.scenes : [];
  return {
    runId: `news-run-${Date.now()}`,
    createdAt: new Date().toISOString(),
    presenter: scenePlan?.presenter || 'alice',
    state: scenes.length ? 'queued' : 'ready',
    jobs: scenes.map((scene, index) => ({
      jobId: `render-${index + 1}`,
      sceneId: scene.sceneId,
      order: scene.order ?? index,
      state: 'queued',
      script: scene.script,
      voice: scene.render?.voice || 'alice-default',
      avatar: scene.render?.avatar || 'alice',
      stages: {
        voice: { state: 'queued', output: null },
        lipsync: { state: 'queued', output: null },
        composite: { state: 'queued', output: null },
      },
      output: null,
      error: null,
    })),
  };
}

export function updateRenderJob(queue, jobId, patch = {}) {
  const jobs = queue?.jobs || [];
  const index = jobs.findIndex((job) => job.jobId === jobId);
  if (index < 0) return queue;

  const requestedState = patch.state || jobs[index].state;
  const state = VALID_STATES.has(requestedState) ? requestedState : jobs[index].state;

  const nextJob = {
    ...jobs[index],
    ...patch,
    state,
    stages: {
      ...jobs[index].stages,
      ...(patch.stages || {}),
    },
  };

  const nextJobs = jobs.map((job, jobIndex) => jobIndex === index ? nextJob : job);
  const hasFailure = nextJobs.some((job) => job.state === 'failed');
  const allReady = nextJobs.every((job) => job.state === 'ready');

  return {
    ...queue,
    jobs: nextJobs,
    state: hasFailure ? 'failed' : allReady ? 'ready' : 'queued',
  };
}

export function nextRenderJob(queue) {
  return (queue?.jobs || []).find((job) => job.state !== 'ready' && job.state !== 'failed') || null;
}
