export {
  LEGACY_BACKUP_MIN_INTERVAL_MS,
  LEGACY_GAME_VERSION,
  LEGACY_MAX_BACKUPS,
  LEGACY_MAX_SLOTS,
  LEGACY_SAVE_CODEC,
  LEGACY_SAVE_SCHEMA,
  LEGACY_STORAGE_KEYS,
  NATIVE_SAVE_ENVELOPE_FORMAT,
  NATIVE_SAVE_ENVELOPE_VERSION,
  NATIVE_SAVE_SCHEMA,
} from './constants'
export {
  createLegacyBackup,
  isLegacyBackupHashValid,
  legacyBackupPayloadHash,
  normalizeLegacyBackups,
  parseLegacyBackups,
  sanitizeLegacySaveString,
} from './legacy-backup.adapter'
export type { CreateLegacyBackupOptions } from './legacy-backup.adapter'
export {
  createFreshLegacyQuests,
  createLegacyCharacterImportOptions,
  legacyXpToNextLevel,
  migrateLegacyCharacter,
  migrateLegacyCharacterInPlace,
  migrateLegacyRenamedReferences,
  prepareLegacyImportedCharacter,
  rollLegacyClassAbilities,
  sanitizeLegacyImportedCharacter,
} from './legacy-character.migration'
export type {
  LegacyCharacterMigrationOptions,
  LegacyCharacterMigrationResult,
} from './legacy-character.migration'
export { createLegacyCharacter } from './legacy-character.factory'
export type { CreateLegacyCharacterInput } from './legacy-character.factory'
export {
  NATIVE_CHARACTER_ID_SCHEMA,
  createNativeCharacter,
  exportNativeCharacterIdentityToLegacy,
  exportNativeSlotsToLegacy,
  importLegacyCharacterIdentity,
  importLegacySlotsToNative,
} from './native-character-identity.adapter'
export type { CreateNativeCharacterInput } from './native-character-identity.adapter'
export {
  createLegacySaveExportPayload,
  mergeLegacyImportedSlots,
  validateLegacyImportedSlots,
} from './legacy-import.adapter'
export {
  createEmptyLegacySlots,
  createLegacySaveHealthStamp,
  extractLegacySlotsFromPayload,
  legacyStableSaveHash,
  normalizeLegacySlots,
  parseLegacySaveHealthStamp,
  parseLegacySlots,
  summarizeLegacySlots,
  verifyLegacySaveIntegrity,
} from './legacy-save.adapter'
export * from './legacy-save.shadow'
export * from './native-runtime.gate'
export * from './native-save.envelope'
export {
  decodeLegacySavePayload,
  decodeLegacySaveV1,
  decodeLegacySaveV2,
  decodeLegacySaveV3,
  encodeLegacySavePayload,
  encodeLegacySaveV1,
  encodeLegacySaveV2,
  encodeLegacySaveV3,
} from './portable-save.codec'
export type {
  DecodeLegacySavePayloadOptions,
  LegacySaveCryptoContext,
} from './portable-save.codec'
export type {
  LegacyBackupCreateResult,
  LegacyBackupSkipReason,
  LegacyCharacterTransform,
  LegacyCharacterSave,
  LegacyCharacterSummary,
  LegacyImportOptions,
  LegacySaveBackup,
  LegacySaveExportMeta,
  LegacySaveExportPayload,
  LegacySaveHealthStamp,
  LegacySaveIssue,
  LegacySaveIssueCode,
  LegacySaveLoadResult,
  LegacySaveParseResult,
  LegacySaveWriteResult,
  LegacySlot,
  LegacySlots,
  NativeSaveEnvelope,
  NativeSaveEnvelopeSource,
  SaveIntegrityResult,
  SaveIntegrityStatus,
} from './types'
