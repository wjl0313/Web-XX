import {
  LEGACY_BACKUP_MIN_INTERVAL_MS,
  LEGACY_GAME_VERSION,
  LEGACY_MAX_BACKUPS,
  LEGACY_SAVE_SCHEMA,
} from './constants'
import { legacyStableSaveHash, summarizeLegacySlots } from './legacy-save.adapter'
import type {
  LegacyBackupCreateResult,
  LegacySaveBackup,
  LegacySlot,
  LegacySlots,
} from './types'

export interface CreateLegacyBackupOptions {
  force?: boolean
  kind?: unknown
  label?: unknown
  now: number
}

function isLegacyBackup(value: unknown): value is LegacySaveBackup {
  return typeof value === 'object' && value !== null && Array.isArray((value as LegacySaveBackup).slots)
}

function cloneSlots(slots: readonly LegacySlot[]): LegacySlots {
  return JSON.parse(JSON.stringify(slots)) as LegacySlots
}

export function sanitizeLegacySaveString(
  value: unknown,
  fallback: string,
  maxLength: number,
): string {
  const sanitized = String(value == null ? fallback : value)
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()

  return (sanitized || fallback).slice(0, maxLength)
}

export function normalizeLegacyBackups(value: unknown): LegacySaveBackup[] {
  if (!Array.isArray(value)) return []

  return value
    .filter(isLegacyBackup)
    .sort((left, right) => Number(right.timestamp || 0) - Number(left.timestamp || 0))
    .slice(0, LEGACY_MAX_BACKUPS)
}

export function parseLegacyBackups(raw: string | null): LegacySaveBackup[] {
  if (!raw) return []

  try {
    return normalizeLegacyBackups(JSON.parse(raw))
  } catch {
    return []
  }
}

export function legacyBackupPayloadHash(backup: LegacySaveBackup | null): string {
  return legacyStableSaveHash(backup && Array.isArray(backup.slots) ? backup.slots : [])
}

export function isLegacyBackupHashValid(backup: LegacySaveBackup | null): boolean {
  if (!backup || !Array.isArray(backup.slots)) return false
  if (!backup.hash) return true
  return backup.hash === legacyBackupPayloadHash(backup)
}

export function createLegacyBackup(
  existingBackups: readonly LegacySaveBackup[],
  slots: readonly LegacySlot[],
  options: CreateLegacyBackupOptions,
): LegacyBackupCreateResult {
  const backups = normalizeLegacyBackups([...existingBackups])
  const latest = backups[0] ?? null
  const force = options.force ?? false

  if (
    !force &&
    latest?.timestamp &&
    options.now - latest.timestamp < LEGACY_BACKUP_MIN_INTERVAL_MS
  ) {
    return { created: false, reason: 'recent', backup: null, backups }
  }

  const snapshot = cloneSlots(slots)
  const hash = legacyStableSaveHash(snapshot)

  if (!force && latest?.hash && latest.hash === hash) {
    return { created: false, reason: 'unchanged', backup: null, backups }
  }

  const backup: LegacySaveBackup = {
    timestamp: options.now,
    version: LEGACY_GAME_VERSION,
    saveSchema: LEGACY_SAVE_SCHEMA,
    hash,
    kind: sanitizeLegacySaveString(options.kind, force ? 'manual' : 'auto', 24),
    label: sanitizeLegacySaveString(options.label, '', 48),
    summary: summarizeLegacySlots(snapshot),
    slots: snapshot,
  }

  const nextBackups = normalizeLegacyBackups([backup, ...backups])
  return { created: true, reason: null, backup, backups: nextBackups }
}
