// Alice Genesis v12: deterministic boundary helpers, no LLM or side effects.
// Independent model calls and VRM rendering are implemented by separate adapters.
export function resolveRuntimeMode(requested, runtime = {}) {
  const independentAgents = runtime.independentAgents === true;
  const realtimeAvatar = runtime.realtimeAvatar === true;
  if (requested === 'dual' && !independentAgents)
    return { mode: 'chat', label: 'simulierte Perspektiven', downgraded: true };
  if (requested === 'live' && !(independentAgents && realtimeAvatar))
    return { mode: independentAgents ? 'dual' : 'chat', label: 'Live-Voraussetzungen fehlen', downgraded: true };
  if (requested === 'dual')
    return { mode: 'dual', label: 'getrennte Agentenaufrufe', downgraded: false };
  if (requested === 'live')
    return { mode: 'live', label: 'bestätigte Agenten- und Avatar-Laufzeit', downgraded: false };
  return { mode: 'chat', label: 'ein Modell mit erkennbaren Perspektiven', downgraded: false };
}

export function adjudicateDualProposals(sami, elisa) {
  const valid = (x) => Boolean(
    x && typeof x.target === 'string' && x.target.trim()
    && typeof x.action === 'string' && x.action.trim()
    && [-1, 0, 1].includes(x.polarity)
  );
  if (!valid(sami) || !valid(elisa))
    throw new Error('Beide Vorschläge benötigen target, action und polarity (-1/0/1).');
  if (sami.target !== elisa.target) return { state: 'different-targets', verify: true };
  if (sami.polarity === 0 || elisa.polarity === 0) return { state: 'undecided', verify: true };
  if (sami.polarity !== elisa.polarity) return { state: 'contradiction', verify: true };
  if (sami.action !== elisa.action) return { state: 'same-direction-different-method', verify: true };
  return { state: 'agreement-on-proposal', verify: true };
}

export function validateDualOperator({ type = 'read', authorized = false, providerAvailable = false } = {}) {
  if (!providerAvailable) return { allowed: false, reason: 'operator-unavailable' };
  if (type !== 'read' && !authorized) return { allowed: false, reason: 'authorization-required' };
  return { allowed: true, reason: 'bounded-operation' };
}

export function createDualEvidenceEnvelope({ kind, source, observed, artifact } = {}) {
  if (!kind || !source || observed !== true || !artifact)
    throw new Error('Kein nachgewiesener Zustand ohne Quelle und Artefakt.');
  return Object.freeze({ kind, source, observed: true, artifact });
}

export function prioritizeDualInput(text, state = {}) {
  const stop = /(?:^|[^\p{L}])stopp(?:$|[^\p{L}])/iu.test(String(text ?? ''));
  if (stop) return { mode: 'chat', speaker: 'alice', halt: true };
  return { mode: state.mode || 'chat', speaker: state.speaker || 'alice', halt: false };
}
