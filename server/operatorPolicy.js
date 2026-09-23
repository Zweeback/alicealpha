const SECRET_KEY = /(token|secret|password|cookie|authorization|api[_-]?key|credential|private[_-]?key)/i;
const PRODUCTION_VALUE = /^(prod|production|live)$/i;
const UNTRUSTED_VALUE = /^(untrusted|external|web|issue|comment)$/i;
const SENSITIVE_PATH = /(^|\/)(\.github\/workflows|migrations?|prisma|schema)(\/|$)/i;

const BASE_RISK = Object.freeze({
  'branch.create': 'low',
  'ci.verify': 'low',
  'pr.create': 'elevated',
  'file.create': 'elevated',
  'file.update': 'elevated',
  'pr.merge': 'high',
});

const RISK_ORDER = Object.freeze({ low: 0, elevated: 1, high: 2, critical: 3 });

function maxRisk(left, right) {
  return RISK_ORDER[right] > RISK_ORDER[left] ? right : left;
}

function inspectPayload(value, path = [], signals = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => inspectPayload(item, [...path, String(index)], signals));
    return signals;
  }
  if (!value || typeof value !== 'object') return signals;

  for (const [key, item] of Object.entries(value)) {
    const nextPath = [...path, key];
    const pathText = nextPath.join('.');

    if (SECRET_KEY.test(key)) {
      signals.push({ type: 'credential-boundary', path: pathText });
    }

    if (typeof item === 'string') {
      if (/(environment|target|stage|deployment)/i.test(key) && PRODUCTION_VALUE.test(item)) {
        signals.push({ type: 'production-target', path: pathText });
      }
      if (/(source[_-]?trust|trust|source)/i.test(key) && UNTRUSTED_VALUE.test(item)) {
        signals.push({ type: 'untrusted-input', path: pathText });
      }
      if (/(path|file|filename)/i.test(key) && SENSITIVE_PATH.test(item)) {
        signals.push({ type: 'sensitive-code-path', path: pathText });
      }
    }

    if (key === 'destructive' && item === true) {
      signals.push({ type: 'destructive-intent', path: pathText });
    }

    inspectPayload(item, nextPath, signals);
  }

  return signals;
}

export function classifyOperatorRisk(envelope) {
  if (!envelope || typeof envelope !== 'object') throw new TypeError('operator-envelope-required');
  if (!BASE_RISK[envelope.operation]) throw new Error('operator-risk-operation-unknown');

  let level = BASE_RISK[envelope.operation];
  const reasons = [];
  const incidentPatterns = [];
  const signals = inspectPayload(envelope.payload ?? {});

  if (envelope.operation === 'pr.merge') {
    reasons.push('repository-history-write');
    incidentPatterns.push('AIID-1680:supply-chain-write');
  }

  for (const signal of signals) {
    if (signal.type === 'credential-boundary') {
      level = maxRisk(level, 'high');
      reasons.push(`credential-boundary:${signal.path}`);
      incidentPatterns.push('AIID-1685:credential-propagation');
    } else if (signal.type === 'production-target') {
      level = maxRisk(level, 'high');
      reasons.push(`production-target:${signal.path}`);
      incidentPatterns.push('AIID-1672:production-target-confusion', 'AIID-1676:production-database-reset');
    } else if (signal.type === 'untrusted-input') {
      level = maxRisk(level, 'elevated');
      reasons.push(`untrusted-input:${signal.path}`);
      incidentPatterns.push('AIID-1680:prompt-injection-supply-chain');
    } else if (signal.type === 'sensitive-code-path') {
      level = maxRisk(level, 'high');
      reasons.push(`sensitive-code-path:${signal.path}`);
      incidentPatterns.push('AIID-1680:supply-chain-write');
    } else if (signal.type === 'destructive-intent') {
      level = 'critical';
      reasons.push(`destructive-intent:${signal.path}`);
    }
  }

  return Object.freeze({
    level,
    approval_required: level === 'high' || level === 'critical',
    reasons: Object.freeze([...new Set(reasons)]),
    incident_patterns: Object.freeze([...new Set(incidentPatterns)]),
  });
}

export function enforceOperatorPolicy(envelope, options = {}) {
  const risk = classifyOperatorRisk(envelope);
  const traceId = options.traceId || envelope.trace_id || `alice.operator.${envelope.id}`;

  if (risk.approval_required) {
    const approval = options.approval;
    const actor = approval?.actor;
    if (approval?.granted !== true || typeof actor !== 'string' || !actor.startsWith('human:')) {
      const error = new Error('operator-approval-required');
      error.risk = risk;
      throw error;
    }
  }

  return Object.freeze({
    trace_id: traceId,
    risk,
    approval: risk.approval_required
      ? Object.freeze({ granted: true, actor: options.approval.actor })
      : Object.freeze({ granted: false, actor: null }),
  });
}
