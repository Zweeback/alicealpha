import { describe, expect, it } from 'vitest'
import { createSourceArtifact, mayEnterAliceContext } from '../server/sourceArtifact.js'

describe('external source artifact boundary', () => {
  it('accepts a provenance-rich ScriptDB library record without treating it as dialogue', () => {
    const artifact = createSourceArtifact({
      artifact_id: 'scriptdb:record:42',
      kind: 'library_record',
      provider: 'scriptdb',
      model_or_collection: 'connected-library-portal',
      purpose: 'Retrieve bibliographic metadata for a cited research answer',
      sources: ['scriptdb:record:42'],
      license: 'Authenticated access; metadata only until reuse rights are confirmed',
      approval: 'accepted',
      payload: { title: 'Example record', record_id: '42' },
    })

    expect(artifact.kind).toBe('library_record')
    expect(artifact.sha256).toMatch(/^[a-f0-9]{64}$/)
    expect(mayEnterAliceContext(artifact)).toBe(true)
  })

  it('rejects credentials or library-card data inside an artifact payload', () => {
    expect(() =>
      createSourceArtifact({
        artifact_id: 'digibib:query:1',
        kind: 'library_form',
        provider: 'digibib',
        purpose: 'Submit a library query form',
        sources: ['digibib:form:search'],
        license: 'Personal authenticated access',
        payload: { library_card_number: 'must-not-enter-context' },
      }),
    ).toThrow(/forbidden/)
  })

  it('keeps unapproved research out of Alice context', () => {
    const artifact = createSourceArtifact({
      artifact_id: 'library:record:7',
      kind: 'library_record',
      provider: 'city_state_library',
      purpose: 'Collect candidate sources',
      sources: ['catalogue:record:7'],
      license: 'Catalogue metadata',
      payload: { title: 'Candidate source' },
    })

    expect(mayEnterAliceContext(artifact)).toBe(false)
  })
})
