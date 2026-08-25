import { createHash } from 'node:crypto'

const KINDS = new Set([
  'asset_spec',
  'code_review',
  'library_form',
  'library_record',
  'research_brief',
])

const PROVIDERS = new Set([
  'city_state_library',
  'digibib',
  'gemini',
  'github',
  'jules',
  'notebooklm',
  'scriptdb',
  'supergrok',
])

const APPROVALS = new Set(['pending', 'accepted', 'rejected'])
const SECRET_FIELD = /(?:password|passwort|secret|token|api[_-]?key|library[_-]?card|ausweis(?:nummer)?)/i

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function containsSecretField(value) {
  if (Array.isArray(value)) return value.some(containsSecretField)
  if (!value || typeof value !== 'object') return false
  return Object.entries(value).some(([key, child]) => SECRET_FIELD.test(key) || containsSecretField(child))
}

export function createSourceArtifact(input) {
  if (!input?.artifact_id) throw new Error('artifact_id is required')
  if (!KINDS.has(input.kind)) throw new Error(`unsupported artifact kind: ${input.kind}`)
  if (!PROVIDERS.has(input.provider)) throw new Error(`unsupported provider: ${input.provider}`)
  if (!APPROVALS.has(input.approval ?? 'pending')) throw new Error('unsupported approval state')
  if (!input.purpose?.trim()) throw new Error('purpose is required')
  if (!Array.isArray(input.sources) || input.sources.length === 0) throw new Error('at least one source is required')
  if (!input.license?.trim()) throw new Error('license/access note is required')
  if (containsSecretField(input.payload)) throw new Error('credentials and library-card data are forbidden in artifacts')

  const payload = input.payload ?? null
  return Object.freeze({
    artifact_id: input.artifact_id,
    kind: input.kind,
    provider: input.provider,
    model_or_collection: input.model_or_collection ?? null,
    created_at: input.created_at ?? new Date().toISOString(),
    purpose: input.purpose.trim(),
    sources: [...input.sources],
    license: input.license.trim(),
    sha256: createHash('sha256').update(stableJson(payload)).digest('hex'),
    approval: input.approval ?? 'pending',
    payload,
  })
}

export function mayEnterAliceContext(artifact) {
  return artifact?.approval === 'accepted' && /^[a-f0-9]{64}$/.test(artifact?.sha256 ?? '')
}
