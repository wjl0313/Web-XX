import { describe, expect, it } from 'vitest'

import {
  LEGACY_MAX_SLOTS,
  NATIVE_SAVE_ENVELOPE_FORMAT,
  NATIVE_SAVE_ENVELOPE_VERSION,
  createEmptyLegacySlots,
  createNativeSaveEnvelope,
  parseNativeSaveEnvelope,
  serializeNativeSaveEnvelope,
} from '../../src/game-core/save'

const fixedDate = new Date('2026-08-01T01:02:03.000Z')

describe('native save envelope', () => {
  it('round-trips a versioned 24-slot payload with Chinese domain identifiers', () => {
    const slots = createEmptyLegacySlots()
    slots[0] = { name: '青岚', cls: 'Warrior', equipment: { weapon: 'Rusty Dagger' } }
    const envelope = createNativeSaveEnvelope(slots, {
      activeSlot: 0,
      createdAt: fixedDate,
      sourceLegacyRaw: JSON.stringify(slots),
    })
    const parsed = parseNativeSaveEnvelope(serializeNativeSaveEnvelope(envelope))

    expect(envelope).toMatchObject({
      format: NATIVE_SAVE_ENVELOPE_FORMAT,
      envelopeVersion: NATIVE_SAVE_ENVELOPE_VERSION,
      createdAt: fixedDate.toISOString(),
      activeSlot: 0,
    })
    expect(envelope.slots).toHaveLength(LEGACY_MAX_SLOTS)
    expect(parsed).toEqual({ envelope, issues: [] })
    expect(parsed.envelope?.slots[0]).toMatchObject({
      cls: '炼体士',
      characterIdSchema: 1,
      equipment: { weapon: 'Rusty Dagger' },
    })
  })

  it('normalizes an empty or unavailable active slot to no selection', () => {
    const slots = createEmptyLegacySlots()
    expect(createNativeSaveEnvelope(slots, {
      activeSlot: 0,
      createdAt: fixedDate,
      sourceLegacyRaw: null,
    }).activeSlot).toBe(-1)
  })

  it('rejects malformed, unsupported, and tampered envelopes', () => {
    const envelope = createNativeSaveEnvelope(createEmptyLegacySlots(), {
      createdAt: fixedDate,
      sourceLegacyRaw: null,
    })

    expect(parseNativeSaveEnvelope(null).issues).toEqual([{ code: 'missing-envelope' }])
    expect(parseNativeSaveEnvelope('{').issues).toEqual([{ code: 'invalid-json' }])
    expect(parseNativeSaveEnvelope([]).issues).toEqual([{ code: 'invalid-root' }])
    expect(parseNativeSaveEnvelope({ ...envelope, envelopeVersion: 99 }).issues).toContainEqual({
      code: 'unsupported-version',
    })
    expect(parseNativeSaveEnvelope({
      ...envelope,
      slots: envelope.slots.map((slot, index) => index === 0 ? { name: '篡改' } : slot),
    }).issues).toEqual([{ code: 'payload-hash-mismatch' }])
  })

  it('refuses to create an envelope from invalid slot values', () => {
    expect(() => createNativeSaveEnvelope(['invalid'], {
      createdAt: fixedDate,
      sourceLegacyRaw: null,
    })).toThrow('原生存档包含无效角色槽位')
  })
})
