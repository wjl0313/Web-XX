import { describe, expect, it, vi } from 'vitest'

import {
  LEGACY_GAME_VERSION,
  LEGACY_MAX_SLOTS,
  LEGACY_SAVE_SCHEMA,
  createLegacySaveExportPayload,
  mergeLegacyImportedSlots,
  validateLegacyImportedSlots,
  type LegacyCharacterSave,
  type LegacySlots,
} from '../../src/game-core/save'

describe('legacy import adapter', () => {
  it('clones, transforms, and pads imported characters to 24 slots', () => {
    const source = [{ name: 'Before', nested: { value: 1 } }]
    const migrate = vi.fn((character: LegacyCharacterSave) => {
      character.name = 'Migrated'
    })
    const sanitize = vi.fn((character: LegacyCharacterSave) => ({
      ...character,
      name: 'Sanitized',
    }))

    const result = validateLegacyImportedSlots(source, {
      migrateCharacter: migrate,
      sanitizeCharacter: sanitize,
    })

    expect(result).toHaveLength(LEGACY_MAX_SLOTS)
    expect(result[0]).toEqual({ name: 'Sanitized', nested: { value: 1 } })
    expect(result.slice(1).every((slot) => slot === null)).toBe(true)
    expect(source[0].name).toBe('Before')
    expect(migrate).toHaveBeenCalledOnce()
    expect(sanitize).toHaveBeenCalledOnce()
  })

  it('rejects invalid roots, oversized arrays, and invalid slot values', () => {
    expect(() => validateLegacyImportedSlots({})).toThrow(TypeError)
    expect(() => validateLegacyImportedSlots(Array(LEGACY_MAX_SLOTS + 1).fill(null))).toThrow(
      RangeError,
    )
    expect(() => validateLegacyImportedSlots(['invalid'])).toThrow('索引 0')
    expect(() => validateLegacyImportedSlots([[]])).toThrow('索引 0')
  })

  it('rejects a transform that returns a non-character value', () => {
    expect(() =>
      validateLegacyImportedSlots([{ name: 'Fixture' }], {
        migrateCharacter: (() => []) as unknown as (
          character: LegacyCharacterSave,
        ) => LegacyCharacterSave,
      }),
    ).toThrow('存档角色转换结果无效')
  })

  it('merges occupied imported slots into the first local empty slots', () => {
    const current: LegacySlots = [{ name: 'Local 1' }, null, { name: 'Local 3' }]
    const imported: LegacySlots = [null, { name: 'Imported 1' }, { name: 'Imported 2' }]

    const result = mergeLegacyImportedSlots(current, imported)

    expect(result.slice(0, 5)).toEqual([
      { name: 'Local 1' },
      { name: 'Imported 1' },
      { name: 'Local 3' },
      { name: 'Imported 2' },
      null,
    ])
    expect(current[1]).toBeNull()
  })

  it('rejects merge imports when no empty slot remains', () => {
    const full = Array.from({ length: LEGACY_MAX_SLOTS }, (_, index) => ({ name: String(index) }))

    expect(() => mergeLegacyImportedSlots(full, [{ name: 'Overflow' }])).toThrow(RangeError)
  })

  it('creates the legacy export payload without allowing core metadata overrides', () => {
    const payload = createLegacySaveExportPayload(
      [{ name: 'Exported' }],
      new Date('2026-02-03T04:05:06.000Z'),
      { game: 'Other', version: 'wrong', kind: 'single-character-export' },
    )

    expect(payload.meta).toEqual({
      game: 'EmberQuest',
      version: LEGACY_GAME_VERSION,
      kind: 'single-character-export',
      saveSchema: LEGACY_SAVE_SCHEMA,
      exportedAt: '2026-02-03T04:05:06.000Z',
    })
    expect(payload.slots).toHaveLength(LEGACY_MAX_SLOTS)
    expect(payload.slots[0]).toEqual({ name: 'Exported' })
  })
})
