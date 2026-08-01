import { describe, expect, it } from 'vitest'

import { resolveFeatureFlags } from '../../src/app/featureFlags'
import {
  LEGACY_STORAGE_KEYS,
  createEmptyLegacySlots,
  createNativeSaveEnvelope,
  evaluateNativeRuntimeGate,
} from '../../src/game-core/save'

const fixedDate = new Date('2026-08-01T01:02:03.000Z')

function createFixture() {
  const slots = createEmptyLegacySlots()
  slots[0] = { name: '青岚', level: 12, race: 'Human', cls: 'Warrior' }
  const legacyRaw = JSON.stringify(slots)
  const nativeEnvelope = createNativeSaveEnvelope(slots, {
    activeSlot: 0,
    createdAt: fixedDate,
    sourceLegacyRaw: legacyRaw,
  })
  return { slots, legacyRaw, nativeEnvelope }
}

describe('native runtime shadow gate', () => {
  it('allows an explicitly requested exact shadow candidate', () => {
    const fixture = createFixture()
    const result = evaluateNativeRuntimeGate({ requested: true, ...fixture })

    expect(result).toMatchObject({
      allowed: true,
      status: 'ready',
      legacyIssues: [],
      envelopeIssues: [],
      differences: [],
    })
    expect(result.candidateHash).not.toBeNull()
  })

  it('does not enable the native runtime without an explicit request', () => {
    const fixture = createFixture()
    expect(evaluateNativeRuntimeGate({ requested: false, ...fixture })).toMatchObject({
      allowed: false,
      status: 'not-requested',
    })
  })

  it('blocks corrupt legacy text and invalid native envelopes', () => {
    const fixture = createFixture()
    expect(evaluateNativeRuntimeGate({
      requested: true,
      legacyRaw: '{',
      nativeEnvelope: fixture.nativeEnvelope,
    })).toMatchObject({
      allowed: false,
      status: 'invalid-legacy-save',
      legacyIssues: ['invalid-json'],
    })
    expect(evaluateNativeRuntimeGate({
      requested: true,
      legacyRaw: fixture.legacyRaw,
      nativeEnvelope: '{',
    })).toMatchObject({
      allowed: false,
      status: 'invalid-native-envelope',
      envelopeIssues: [{ code: 'invalid-json' }],
    })
  })

  it('blocks stale source snapshots and reports concrete shadow differences', () => {
    const fixture = createFixture()
    const staleEnvelope = createNativeSaveEnvelope(fixture.slots, {
      createdAt: fixedDate,
      sourceLegacyRaw: '[]',
    })
    expect(evaluateNativeRuntimeGate({
      requested: true,
      legacyRaw: fixture.legacyRaw,
      nativeEnvelope: staleEnvelope,
    })).toMatchObject({ allowed: false, status: 'stale-legacy-source' })

    const changed = structuredClone(fixture.slots)
    changed[0] = { ...changed[0], level: 13 }
    const divergentEnvelope = createNativeSaveEnvelope(changed, {
      createdAt: fixedDate,
      sourceLegacyRaw: fixture.legacyRaw,
    })
    expect(evaluateNativeRuntimeGate({
      requested: true,
      legacyRaw: fixture.legacyRaw,
      nativeEnvelope: divergentEnvelope,
    })).toMatchObject({
      allowed: false,
      status: 'shadow-difference',
      differences: [expect.objectContaining({ path: '$[0].level', kind: 'value' })],
    })
  })
})

describe('feature flag integration', () => {
  it('keeps the legacy runtime by default and enables native only after the gate passes', () => {
    const fixture = createFixture()
    const storage = {
      getItem: (key: string) => key === LEGACY_STORAGE_KEYS.slots ? fixture.legacyRaw : null,
    }

    expect(resolveFeatureFlags({ search: '', storage, now: () => fixedDate })).toMatchObject({
      legacyGameBridge: true,
      nativeRuntimeRequested: false,
      nativeRuntimeGate: { status: 'not-requested' },
    })
    expect(resolveFeatureFlags({ search: '?native=1', storage, now: () => fixedDate })).toMatchObject({
      legacyGameBridge: false,
      nativeRuntimeRequested: true,
      nativeRuntimeGate: { status: 'ready' },
    })
  })

  it('falls back to the legacy runtime when the local save is corrupt', () => {
    const flags = resolveFeatureFlags({
      search: '?native=1',
      storage: { getItem: () => '{' },
      now: () => fixedDate,
    })

    expect(flags).toMatchObject({
      legacyGameBridge: true,
      nativeRuntimeRequested: true,
      nativeRuntimeGate: { status: 'invalid-legacy-save' },
    })
  })
})
