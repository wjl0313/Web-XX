import { describe, expect, it } from 'vitest'

import { LEGACY_MAX_SLOTS, LEGACY_STORAGE_KEYS } from '../../src/game-core/save'
import {
  LocalSaveRepository,
  type KeyValueStorage,
} from '../../src/services/local/local-save.repository'

class MemoryStorage implements KeyValueStorage {
  readonly values = new Map<string, string>()

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }

  removeItem(key: string): void {
    this.values.delete(key)
  }
}

const fixedNow = new Date('2026-01-02T03:04:05.000Z')

describe('LocalSaveRepository', () => {
  it('loads an empty slot set when no local save exists', async () => {
    const repository = new LocalSaveRepository(new MemoryStorage())

    const result = await repository.load()

    expect(result.raw).toBeNull()
    expect(result.slots).toHaveLength(LEGACY_MAX_SLOTS)
    expect(result.slots.every((slot) => slot === null)).toBe(true)
    expect(result.health).toBeNull()
    expect(result.corruptCopyKey).toBeNull()
  })

  it('saves and loads a normalized legacy slot array with a health stamp', async () => {
    const storage = new MemoryStorage()
    const repository = new LocalSaveRepository(storage, { now: () => fixedNow })

    const written = await repository.save([{ name: 'Round Trip', level: 7 }], { activeSlot: 0 })
    const loaded = await repository.load()

    expect(written.slots).toHaveLength(LEGACY_MAX_SLOTS)
    expect(JSON.parse(written.raw)).toEqual(written.slots)
    expect(written.health).toMatchObject({
      game: 'EmberQuest',
      savedAt: fixedNow.toISOString(),
      activeSlot: 0,
    })
    expect(storage.getItem(LEGACY_STORAGE_KEYS.slots)).toBe(written.raw)
    expect(loaded.slots).toEqual(written.slots)
    expect(loaded.health).toEqual(written.health)
    expect(await repository.verifyIntegrity()).toMatchObject({ ok: true, status: 'ok' })
  })

  it('preserves malformed save text under the legacy corrupt-copy key', async () => {
    const storage = new MemoryStorage()
    const repository = new LocalSaveRepository(storage, { now: () => fixedNow })
    const malformed = '[{"name":"Broken"}'
    storage.setItem(LEGACY_STORAGE_KEYS.slots, malformed)

    const result = await repository.load()
    const expectedKey = `${LEGACY_STORAGE_KEYS.slots}.corrupt.${fixedNow.getTime()}`

    expect(result.issues).toEqual([{ code: 'invalid-json' }])
    expect(result.corruptCopyKey).toBe(expectedKey)
    expect(storage.getItem(expectedKey)).toBe(malformed)
  })

  it('does not create a corrupt copy for a valid JSON value with an invalid root', async () => {
    const storage = new MemoryStorage()
    const repository = new LocalSaveRepository(storage, { now: () => fixedNow })
    storage.setItem(LEGACY_STORAGE_KEYS.slots, '{"slots":[]}')

    const result = await repository.load()

    expect(result.issues).toEqual([{ code: 'invalid-root' }])
    expect(result.corruptCopyKey).toBeNull()
    expect([...storage.values.keys()]).toEqual([LEGACY_STORAGE_KEYS.slots])
  })

  it('reports missing and mismatched health stamps', async () => {
    const storage = new MemoryStorage()
    const repository = new LocalSaveRepository(storage)
    storage.setItem(LEGACY_STORAGE_KEYS.slots, '[]')

    expect(await repository.verifyIntegrity()).toMatchObject({
      ok: false,
      status: 'missing-stamp',
    })

    storage.setItem(
      LEGACY_STORAGE_KEYS.health,
      JSON.stringify({ game: 'EmberQuest', hash: 'outdated' }),
    )
    expect(await repository.getHealthStamp()).toMatchObject({ hash: 'outdated' })
    expect(await repository.verifyIntegrity()).toMatchObject({
      ok: false,
      status: 'hash-mismatch',
    })

    storage.setItem(LEGACY_STORAGE_KEYS.health, '{')
    expect(await repository.getHealthStamp()).toBeNull()
  })

  it('creates, lists, skips, and force-creates local backups', async () => {
    const storage = new MemoryStorage()
    let now = fixedNow
    const repository = new LocalSaveRepository(storage, { now: () => now })
    const slots = [{ name: 'Backup Character' }]

    const created = await repository.createBackup(slots, { kind: 'auto' })
    expect(created).toMatchObject({ created: true, reason: null })
    expect(await repository.listBackups()).toHaveLength(1)

    now = new Date(fixedNow.getTime() + 1000)
    expect(await repository.createBackup(slots)).toMatchObject({
      created: false,
      reason: 'recent',
    })

    const forced = await repository.createBackup(slots, {
      force: true,
      kind: 'manual',
      label: 'Named backup',
    })
    expect(forced).toMatchObject({
      created: true,
      backup: { kind: 'manual', label: 'Named backup' },
    })
    expect(await repository.listBackups()).toHaveLength(2)
  })

  it('deletes and clears backups while ignoring invalid indexes', async () => {
    const storage = new MemoryStorage()
    let now = fixedNow
    const repository = new LocalSaveRepository(storage, { now: () => now })

    await repository.createBackup([{ name: 'First' }], { force: true })
    now = new Date(now.getTime() + 1000)
    await repository.createBackup([{ name: 'Second' }], { force: true })

    expect(await repository.deleteBackup(-1)).toBe(false)
    expect(await repository.deleteBackup(0.5)).toBe(false)
    expect(await repository.deleteBackup(5)).toBe(false)
    expect(await repository.deleteBackup(0)).toBe(true)
    expect((await repository.listBackups())[0].slots[0]).toMatchObject({ name: 'First' })

    await repository.clearBackups()
    expect(storage.getItem(LEGACY_STORAGE_KEYS.backups)).toBe('[]')
    expect(await repository.listBackups()).toEqual([])
  })

  it('treats malformed backup storage as an empty list', async () => {
    const storage = new MemoryStorage()
    const repository = new LocalSaveRepository(storage)
    storage.setItem(LEGACY_STORAGE_KEYS.backups, '{')

    expect(await repository.listBackups()).toEqual([])
  })
})
