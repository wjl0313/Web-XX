export type LegacyCharacterSave = Record<string, unknown>
export type LegacySlot = LegacyCharacterSave | null
export type LegacySlots = LegacySlot[]

export type LegacySaveIssueCode =
  | 'invalid-json'
  | 'invalid-root'
  | 'invalid-slot'
  | 'slots-truncated'

export interface LegacySaveIssue {
  code: LegacySaveIssueCode
  slot?: number
}

export interface LegacySaveParseResult {
  slots: LegacySlots
  issues: LegacySaveIssue[]
  corruptRaw: string | null
}

export interface LegacyCharacterSummary {
  slot: number
  empty?: true
  name?: string
  level?: number
  class?: string
}

export interface LegacySaveHealthStamp {
  game: 'EmberQuest'
  version: string
  saveSchema: number
  savedAt: string
  hash: string
  bytes: number
  activeSlot: number
  summary: LegacyCharacterSummary[]
}

export type SaveIntegrityStatus = 'ok' | 'missing-stamp' | 'hash-mismatch'

export interface SaveIntegrityResult {
  ok: boolean
  status: SaveIntegrityStatus
  stamp: LegacySaveHealthStamp | null
  currentHash: string
  currentBytes: number
}

export interface LegacySaveLoadResult extends LegacySaveParseResult {
  raw: string | null
  health: LegacySaveHealthStamp | null
  corruptCopyKey: string | null
}

export interface LegacySaveWriteResult {
  raw: string
  slots: LegacySlots
  health: LegacySaveHealthStamp
}

export interface NativeSaveEnvelopeSource {
  kind: 'legacy-local'
  hash: string
}

export interface NativeSaveEnvelope {
  format: 'fanxiulu-native-save'
  envelopeVersion: 2
  gameVersion: string
  saveSchema: number
  createdAt: string
  activeSlot: number
  source: NativeSaveEnvelopeSource
  slots: LegacySlots
  payloadHash: string
}

export interface LegacySaveBackup {
  timestamp?: number
  version?: string
  saveSchema?: number
  hash?: string
  kind?: string
  label?: string
  summary?: LegacyCharacterSummary[]
  slots: LegacySlots
}

export type LegacyBackupSkipReason = 'recent' | 'unchanged'

export interface LegacyBackupCreateResult {
  created: boolean
  reason: LegacyBackupSkipReason | null
  backup: LegacySaveBackup | null
  backups: LegacySaveBackup[]
}

export interface LegacySaveExportMeta extends Record<string, unknown> {
  game: 'EmberQuest'
  version: string
  saveSchema: number
  exportedAt: string
}

export interface LegacySaveExportPayload {
  meta: LegacySaveExportMeta
  slots: LegacySlots
}

export type LegacyCharacterTransform = (
  character: LegacyCharacterSave,
) => LegacyCharacterSave | void

export interface LegacyImportOptions {
  migrateCharacter?: LegacyCharacterTransform
  sanitizeCharacter?: LegacyCharacterTransform
}
