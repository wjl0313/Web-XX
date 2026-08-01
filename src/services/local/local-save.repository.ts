import {
  LEGACY_STORAGE_KEYS,
  createLegacyBackup,
  createLegacySaveHealthStamp,
  normalizeLegacySlots,
  parseLegacyBackups,
  parseLegacySaveHealthStamp,
  parseLegacySlots,
  verifyLegacySaveIntegrity,
  type LegacyBackupCreateResult,
  type LegacySaveBackup,
  type LegacySaveHealthStamp,
  type LegacySaveLoadResult,
  type LegacySaveWriteResult,
  type LegacySlot,
  type SaveIntegrityResult,
} from '../../game-core/save'
import type {
  SaveBackupOptions,
  SaveRepository,
  SaveWriteOptions,
} from '../../repositories/save.repository'

export interface KeyValueStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface LocalSaveRepositoryOptions {
  now?: () => Date
}

export class LocalSaveRepository implements SaveRepository {
  readonly #storage: KeyValueStorage
  readonly #now: () => Date

  constructor(storage: KeyValueStorage, options: LocalSaveRepositoryOptions = {}) {
    this.#storage = storage
    this.#now = options.now ?? (() => new Date())
  }

  async load(): Promise<LegacySaveLoadResult> {
    const raw = this.#storage.getItem(LEGACY_STORAGE_KEYS.slots)
    const parsed = parseLegacySlots(raw)
    let corruptCopyKey: string | null = null

    if (parsed.corruptRaw) {
      corruptCopyKey = `${LEGACY_STORAGE_KEYS.slots}.corrupt.${this.#now().getTime()}`
      this.#storage.setItem(corruptCopyKey, parsed.corruptRaw)
    }

    return {
      ...parsed,
      raw,
      health: await this.getHealthStamp(),
      corruptCopyKey,
    }
  }

  async save(
    slots: readonly LegacySlot[],
    options: SaveWriteOptions,
  ): Promise<LegacySaveWriteResult> {
    const normalized = normalizeLegacySlots(slots)
    const raw = JSON.stringify(normalized.slots)
    const health = createLegacySaveHealthStamp(
      raw,
      normalized.slots,
      options.activeSlot,
      this.#now(),
    )

    this.#storage.setItem(LEGACY_STORAGE_KEYS.slots, raw)
    this.#storage.setItem(LEGACY_STORAGE_KEYS.health, JSON.stringify(health))

    return { raw, slots: normalized.slots, health }
  }

  async getHealthStamp(): Promise<LegacySaveHealthStamp | null> {
    return parseLegacySaveHealthStamp(this.#storage.getItem(LEGACY_STORAGE_KEYS.health))
  }

  async verifyIntegrity(): Promise<SaveIntegrityResult> {
    return verifyLegacySaveIntegrity(
      this.#storage.getItem(LEGACY_STORAGE_KEYS.slots),
      await this.getHealthStamp(),
    )
  }

  async listBackups(): Promise<LegacySaveBackup[]> {
    return parseLegacyBackups(this.#storage.getItem(LEGACY_STORAGE_KEYS.backups))
  }

  async createBackup(
    slots: readonly LegacySlot[],
    options: SaveBackupOptions = {},
  ): Promise<LegacyBackupCreateResult> {
    const result = createLegacyBackup(await this.listBackups(), slots, {
      ...options,
      now: this.#now().getTime(),
    })

    if (result.created) {
      this.#storage.setItem(LEGACY_STORAGE_KEYS.backups, JSON.stringify(result.backups))
    }

    return result
  }

  async deleteBackup(index: number): Promise<boolean> {
    const backups = await this.listBackups()
    if (!Number.isInteger(index) || index < 0 || index >= backups.length) return false

    backups.splice(index, 1)
    this.#storage.setItem(LEGACY_STORAGE_KEYS.backups, JSON.stringify(backups))
    return true
  }

  async clearBackups(): Promise<void> {
    this.#storage.setItem(LEGACY_STORAGE_KEYS.backups, '[]')
  }
}
