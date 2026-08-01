import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  LEGACY_GAME_VERSION,
  LEGACY_MAX_SLOTS,
  LEGACY_SAVE_SCHEMA,
  createEmptyLegacySlots,
  createLegacySaveHealthStamp,
  extractLegacySlotsFromPayload,
  legacyStableSaveHash,
  normalizeLegacySlots,
  parseLegacySaveHealthStamp,
  parseLegacySlots,
  summarizeLegacySlots,
  verifyLegacySaveIntegrity,
  type LegacySaveHealthStamp,
  type LegacySlots,
} from '../../src/game-core/save'

const fixtureUrl = new URL('../fixtures/saves/legacy-character-v2.json', import.meta.url)

function readFixture(): LegacySlots {
  return JSON.parse(readFileSync(fixtureUrl, 'utf8')) as LegacySlots
}

function createStamp(overrides: Partial<LegacySaveHealthStamp> = {}): LegacySaveHealthStamp {
  return {
    game: 'EmberQuest',
    version: LEGACY_GAME_VERSION,
    saveSchema: LEGACY_SAVE_SCHEMA,
    savedAt: '2026-01-02T03:04:05.000Z',
    hash: '9edd2fe5',
    bytes: 2,
    activeSlot: 0,
    summary: [],
    ...overrides,
  }
}

describe('legacy save slot adapter', () => {
  it('creates the legacy 24-slot empty state', () => {
    const slots = createEmptyLegacySlots()

    expect(slots).toHaveLength(LEGACY_MAX_SLOTS)
    expect(slots.every((slot) => slot === null)).toBe(true)
  })

  it.each([null, ''] as const)('treats %s as an empty save', (raw) => {
    expect(parseLegacySlots(raw)).toEqual({
      slots: createEmptyLegacySlots(),
      issues: [],
      corruptRaw: null,
    })
  })

  it('loads the sanitized legacy fixture without changing its slot contract', () => {
    const fixture = readFixture()
    const result = parseLegacySlots(JSON.stringify(fixture))

    expect(result.issues).toEqual([])
    expect(result.slots).toHaveLength(LEGACY_MAX_SLOTS)
    expect(result.slots[0]).toMatchObject({
      version: LEGACY_GAME_VERSION,
      name: 'Fixture Cultivator',
      cls: 'Warrior',
      level: 12,
    })
  })

  it('pads short arrays and truncates arrays beyond the legacy limit', () => {
    const short = normalizeLegacySlots([{ name: 'First' }])
    const long = normalizeLegacySlots(
      Array.from({ length: LEGACY_MAX_SLOTS + 2 }, (_, index) => ({ name: String(index) })),
    )

    expect(short.slots).toHaveLength(LEGACY_MAX_SLOTS)
    expect(short.slots[0]).toEqual({ name: 'First' })
    expect(short.slots.slice(1).every((slot) => slot === null)).toBe(true)
    expect(short.issues).toEqual([])
    expect(long.slots).toHaveLength(LEGACY_MAX_SLOTS)
    expect(long.slots.at(-1)).toEqual({ name: '23' })
    expect(long.issues).toEqual([{ code: 'slots-truncated' }])
  })

  it('preserves malformed JSON for recovery and starts with empty slots', () => {
    const result = parseLegacySlots('[{"name":"Broken"}')

    expect(result.slots).toEqual(createEmptyLegacySlots())
    expect(result.issues).toEqual([{ code: 'invalid-json' }])
    expect(result.corruptRaw).toBe('[{"name":"Broken"}')
  })

  it('rejects a non-array root without treating valid JSON as a corrupt copy', () => {
    const result = parseLegacySlots('{"slots":[]}')

    expect(result.slots).toEqual(createEmptyLegacySlots())
    expect(result.issues).toEqual([{ code: 'invalid-root' }])
    expect(result.corruptRaw).toBeNull()
  })

  it('normalizes invalid primitive and nested-array slots to empty slots', () => {
    const result = normalizeLegacySlots(['invalid', 3, false, [], null])

    expect(result.slots.every((slot) => slot === null)).toBe(true)
    expect(result.issues).toEqual([
      { code: 'invalid-slot', slot: 0 },
      { code: 'invalid-slot', slot: 1 },
      { code: 'invalid-slot', slot: 2 },
      { code: 'invalid-slot', slot: 3 },
    ])
  })

  it('extracts all import payload shapes supported by the monolith', () => {
    const slots = [{ name: 'Imported' }, null]

    expect(extractLegacySlotsFromPayload(slots)).toBe(slots)
    expect(extractLegacySlotsFromPayload({ slots })).toBe(slots)
    expect(extractLegacySlotsFromPayload({ currentSave: { slots } })).toBe(slots)
  })

  it('rejects import payloads without a slot array', () => {
    expect(() => extractLegacySlotsFromPayload('invalid')).toThrow(TypeError)
    expect(() => extractLegacySlotsFromPayload({})).toThrow(TypeError)
    expect(() => extractLegacySlotsFromPayload({ slots: {} })).toThrow(TypeError)
  })
})

describe('legacy save health adapter', () => {
  it('locks the monolith FNV-1a hash behavior', () => {
    expect(legacyStableSaveHash('[]')).toBe('9edd2fe5')
    expect(legacyStableSaveHash([{ name: 'Lin', level: 12 }, null])).toBe('5a1f346b')
    expect(legacyStableSaveHash(null)).toBe('77074ba4')
  })

  it('summarizes occupied and empty slots using legacy defaults', () => {
    expect(summarizeLegacySlots([{ name: '', level: 0, cls: '' }, null])).toEqual([
      { slot: 1, name: 'Unknown', level: 1, class: 'Unknown' },
      { slot: 2, empty: true },
    ])
  })

  it('creates a deterministic legacy health stamp', () => {
    const slots = readFixture()
    const raw = JSON.stringify(slots)
    const stamp = createLegacySaveHealthStamp(
      raw,
      slots,
      0,
      new Date('2026-01-02T03:04:05.000Z'),
    )

    expect(stamp).toMatchObject({
      game: 'EmberQuest',
      version: LEGACY_GAME_VERSION,
      saveSchema: LEGACY_SAVE_SCHEMA,
      savedAt: '2026-01-02T03:04:05.000Z',
      hash: legacyStableSaveHash(raw),
      bytes: raw.length,
      activeSlot: 0,
    })
    expect(stamp.summary).toHaveLength(LEGACY_MAX_SLOTS)
    expect(stamp.summary[0]).toEqual({
      slot: 1,
      name: 'Fixture Cultivator',
      level: 12,
      class: 'Warrior',
    })
  })

  it('parses only recognizable health stamps', () => {
    const stamp = createStamp()

    expect(parseLegacySaveHealthStamp(JSON.stringify(stamp))).toEqual(stamp)
    expect(parseLegacySaveHealthStamp(null)).toBeNull()
    expect(parseLegacySaveHealthStamp('')).toBeNull()
    expect(parseLegacySaveHealthStamp('{')).toBeNull()
    expect(parseLegacySaveHealthStamp('[]')).toBeNull()
    expect(parseLegacySaveHealthStamp('{"game":"Other","hash":"abc"}')).toBeNull()
    expect(parseLegacySaveHealthStamp('{"game":"EmberQuest"}')).toBeNull()
  })

  it('reports missing, mismatched, and matching health stamps', () => {
    const raw = '[]'
    const matching = createStamp({ hash: legacyStableSaveHash(raw) })

    expect(verifyLegacySaveIntegrity(raw, null)).toMatchObject({
      ok: false,
      status: 'missing-stamp',
      stamp: null,
      currentHash: '9edd2fe5',
      currentBytes: 2,
    })
    expect(verifyLegacySaveIntegrity(raw, createStamp({ hash: 'wrong' }))).toMatchObject({
      ok: false,
      status: 'hash-mismatch',
    })
    expect(verifyLegacySaveIntegrity(raw, matching)).toEqual({
      ok: true,
      status: 'ok',
      stamp: matching,
      currentHash: '9edd2fe5',
      currentBytes: 2,
    })
    expect(verifyLegacySaveIntegrity(null, null).currentBytes).toBe(0)
  })
})
