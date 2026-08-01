import type {
  LegacyBackupCreateResult,
  LegacySaveBackup,
  LegacySaveHealthStamp,
  LegacySaveLoadResult,
  LegacySaveWriteResult,
  LegacySlot,
  SaveIntegrityResult,
} from '../game-core/save'

export interface SaveWriteOptions {
  activeSlot: number
}

export interface SaveBackupOptions {
  force?: boolean
  kind?: string
  label?: string
}

export interface SaveRepository {
  load(): Promise<LegacySaveLoadResult>
  save(slots: readonly LegacySlot[], options: SaveWriteOptions): Promise<LegacySaveWriteResult>
  getHealthStamp(): Promise<LegacySaveHealthStamp | null>
  verifyIntegrity(): Promise<SaveIntegrityResult>
  listBackups(): Promise<LegacySaveBackup[]>
  createBackup(
    slots: readonly LegacySlot[],
    options?: SaveBackupOptions,
  ): Promise<LegacyBackupCreateResult>
  deleteBackup(index: number): Promise<boolean>
  clearBackups(): Promise<void>
}
