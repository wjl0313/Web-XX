export const LEGACY_MAX_SLOTS = 24
export const LEGACY_MAX_BACKUPS = 5
export const LEGACY_BACKUP_MIN_INTERVAL_MS = 5 * 60 * 1000
export const LEGACY_GAME_VERSION = '1.6.19'
export const LEGACY_SAVE_SCHEMA = 2

export const NATIVE_SAVE_ENVELOPE_FORMAT = 'fanxiulu-native-save'
export const NATIVE_SAVE_ENVELOPE_VERSION = 2
export const NATIVE_SAVE_SCHEMA = 1

export const LEGACY_SAVE_CODEC = Object.freeze({
  v1Prefix: 'EQSAVE1:',
  v2Prefix: 'EQSAVE2:',
  v3Prefix: 'EQSAVE3:',
  v1XorKey: 'EmberQuest_Save_v1391',
  passwordKdfIterations: 250_000,
})

export const LEGACY_STORAGE_KEYS = Object.freeze({
  slots: 'EmberQuest_slots',
  backups: 'EmberQuest_backups',
  health: 'EmberQuest_slots.health',
})
