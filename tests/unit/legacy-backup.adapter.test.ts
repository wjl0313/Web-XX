import { describe, expect, it } from 'vitest'

import {
  LEGACY_BACKUP_MIN_INTERVAL_MS,
  LEGACY_GAME_VERSION,
  LEGACY_MAX_BACKUPS,
  LEGACY_SAVE_SCHEMA,
  createLegacyBackup,
  isLegacyBackupHashValid,
  legacyBackupPayloadHash,
  legacyStableSaveHash,
  normalizeLegacyBackups,
  parseLegacyBackups,
  sanitizeLegacySaveString,
  type LegacySaveBackup,
  type LegacySlots,
} from '../../src/game-core/save'

const slots: LegacySlots = [{ name: 'Backup Fixture', level: 8 }, null]

function backup(timestamp: number, overrides: Partial<LegacySaveBackup> = {}): LegacySaveBackup {
  return { timestamp, slots: [], ...overrides }
}

describe('legacy backup adapter', () => {
  it('parses, filters, sorts, and caps legacy backup records', () => {
    const records = [
      null,
      { timestamp: 12, slots: 'invalid' },
      ...Array.from({ length: 7 }, (_, index) => backup(index + 1)),
    ]

    expect(normalizeLegacyBackups({})).toEqual([])
    expect(normalizeLegacyBackups(records).map((entry) => entry.timestamp)).toEqual([7, 6, 5, 4, 3])
    expect(parseLegacyBackups(JSON.stringify(records)).map((entry) => entry.timestamp)).toEqual([
      7, 6, 5, 4, 3,
    ])
  })

  it.each([null, '', '{', '{"slots":[]}'] as const)(
    'treats %s as an empty backup list',
    (raw) => {
      expect(parseLegacyBackups(raw)).toEqual([])
    },
  )

  it('matches the legacy backup hash policy', () => {
    const withoutHash = backup(1, { slots })
    const withHash = backup(1, { slots, hash: legacyStableSaveHash(slots) })

    expect(legacyBackupPayloadHash(withHash)).toBe(legacyStableSaveHash(slots))
    expect(legacyBackupPayloadHash(null)).toBe(legacyStableSaveHash([]))
    expect(isLegacyBackupHashValid(null)).toBe(false)
    expect(isLegacyBackupHashValid(withoutHash)).toBe(true)
    expect(isLegacyBackupHashValid(withHash)).toBe(true)
    expect(isLegacyBackupHashValid({ ...withHash, hash: 'outdated' })).toBe(false)
  })

  it('sanitizes backup metadata using legacy limits and fallbacks', () => {
    expect(sanitizeLegacySaveString(null, 'fallback', 20)).toBe('fallback')
    expect(sanitizeLegacySaveString('\u0000 \n', 'fallback', 20)).toBe('fallback')
    expect(sanitizeLegacySaveString('  manual\u0007-backup  ', '', 8)).toBe('manual-b')
  })

  it('creates a deeply cloned backup with complete metadata', () => {
    const source: LegacySlots = [{ name: 'Original', inventory: [{ name: 'Sword' }] }]
    const now = 1_800_000
    const result = createLegacyBackup([], source, {
      force: true,
      kind: ' pre\u0000-import ',
      label: 'Before import',
      now,
    })

    expect(result.created).toBe(true)
    expect(result.reason).toBeNull()
    expect(result.backup).toMatchObject({
      timestamp: now,
      version: LEGACY_GAME_VERSION,
      saveSchema: LEGACY_SAVE_SCHEMA,
      kind: 'pre-import',
      label: 'Before import',
    })
    expect(result.backup?.hash).toBe(legacyStableSaveHash(source))
    expect(result.backup?.summary?.[0]).toMatchObject({ name: 'Original' })

    ;(source[0]?.inventory as Array<{ name: string }>)[0].name = 'Changed'
    expect((result.backup?.slots[0]?.inventory as Array<{ name: string }>)[0].name).toBe('Sword')
  })

  it('skips recent and unchanged automatic backups in legacy order', () => {
    const now = 2_000_000
    const recent = backup(now - 1000, { hash: 'different', slots })
    const olderSame = backup(now - LEGACY_BACKUP_MIN_INTERVAL_MS - 1, {
      hash: legacyStableSaveHash(slots),
      slots,
    })

    expect(createLegacyBackup([recent], slots, { now })).toMatchObject({
      created: false,
      reason: 'recent',
      backup: null,
    })
    expect(createLegacyBackup([olderSame], slots, { now })).toMatchObject({
      created: false,
      reason: 'unchanged',
      backup: null,
    })
  })

  it('forced backups bypass skip rules and retain only the newest five', () => {
    const existing = Array.from({ length: LEGACY_MAX_BACKUPS }, (_, index) =>
      backup(100 + index, { hash: legacyStableSaveHash(slots), slots }),
    )
    const result = createLegacyBackup(existing, slots, { force: true, now: 1000 })

    expect(result.created).toBe(true)
    expect(result.backup?.kind).toBe('manual')
    expect(result.backups).toHaveLength(LEGACY_MAX_BACKUPS)
    expect(result.backups[0].timestamp).toBe(1000)
  })
})
