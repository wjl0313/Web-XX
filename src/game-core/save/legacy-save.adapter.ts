import { LEGACY_GAME_VERSION, LEGACY_MAX_SLOTS, LEGACY_SAVE_SCHEMA } from './constants'
import type {
  LegacyCharacterSave,
  LegacyCharacterSummary,
  LegacySaveHealthStamp,
  LegacySaveIssue,
  LegacySaveParseResult,
  LegacySlot,
  LegacySlots,
  SaveIntegrityResult,
} from './types'

function isCharacterSave(value: unknown): value is LegacyCharacterSave {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeSlot(value: unknown, slot: number, issues: LegacySaveIssue[]): LegacySlot {
  if (value === null) return null
  if (isCharacterSave(value)) return value

  issues.push({ code: 'invalid-slot', slot })
  return null
}

export function createEmptyLegacySlots(): LegacySlots {
  return Array.from({ length: LEGACY_MAX_SLOTS }, () => null)
}

export function normalizeLegacySlots(values: readonly unknown[]): {
  slots: LegacySlots
  issues: LegacySaveIssue[]
} {
  const issues: LegacySaveIssue[] = []
  const limited = values.slice(0, LEGACY_MAX_SLOTS)

  if (values.length > LEGACY_MAX_SLOTS) issues.push({ code: 'slots-truncated' })

  const slots = limited.map((value, index) => normalizeSlot(value, index, issues))
  while (slots.length < LEGACY_MAX_SLOTS) slots.push(null)

  return { slots, issues }
}

export function parseLegacySlots(raw: string | null): LegacySaveParseResult {
  if (raw === null || raw === '') {
    return { slots: createEmptyLegacySlots(), issues: [], corruptRaw: null }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return {
      slots: createEmptyLegacySlots(),
      issues: [{ code: 'invalid-json' }],
      corruptRaw: raw,
    }
  }

  if (!Array.isArray(parsed)) {
    return {
      slots: createEmptyLegacySlots(),
      issues: [{ code: 'invalid-root' }],
      corruptRaw: null,
    }
  }

  const normalized = normalizeLegacySlots(parsed)
  return { ...normalized, corruptRaw: null }
}

export function extractLegacySlotsFromPayload(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload
  if (!isCharacterSave(payload)) throw new TypeError('存档载荷必须是对象或数组')

  if (Array.isArray(payload.slots)) return payload.slots
  if (isCharacterSave(payload.currentSave) && Array.isArray(payload.currentSave.slots)) {
    return payload.currentSave.slots
  }

  throw new TypeError('存档载荷中缺少角色槽数组')
}

export function legacyStableSaveHash(value: unknown): string {
  const text = JSON.stringify(value || null)
  let hash = 2_166_136_261

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16_777_619)
  }

  return (hash >>> 0).toString(16)
}

export function summarizeLegacySlots(slots: readonly LegacySlot[]): LegacyCharacterSummary[] {
  return slots.slice(0, LEGACY_MAX_SLOTS).map((slot, index) => {
    if (!slot) return { slot: index + 1, empty: true }

    return {
      slot: index + 1,
      name: String(slot.name || 'Unknown'),
      level: Number(slot.level || 1),
      class: String(slot.cls || 'Unknown'),
    }
  })
}

export function createLegacySaveHealthStamp(
  raw: string,
  slots: readonly LegacySlot[],
  activeSlot: number,
  savedAt: Date,
): LegacySaveHealthStamp {
  return {
    game: 'EmberQuest',
    version: LEGACY_GAME_VERSION,
    saveSchema: LEGACY_SAVE_SCHEMA,
    savedAt: savedAt.toISOString(),
    hash: legacyStableSaveHash(raw),
    bytes: raw.length,
    activeSlot,
    summary: summarizeLegacySlots(slots),
  }
}

export function parseLegacySaveHealthStamp(raw: string | null): LegacySaveHealthStamp | null {
  if (!raw) return null

  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isCharacterSave(parsed)) return null
    if (parsed.game !== 'EmberQuest' || typeof parsed.hash !== 'string') return null

    return parsed as unknown as LegacySaveHealthStamp
  } catch {
    return null
  }
}

export function verifyLegacySaveIntegrity(
  raw: string | null,
  stamp: LegacySaveHealthStamp | null,
): SaveIntegrityResult {
  const currentRaw = raw || ''
  const currentHash = legacyStableSaveHash(currentRaw)
  const currentBytes = currentRaw.length

  if (!stamp) {
    return {
      ok: false,
      status: 'missing-stamp',
      stamp: null,
      currentHash,
      currentBytes,
    }
  }

  if (stamp.hash !== currentHash) {
    return {
      ok: false,
      status: 'hash-mismatch',
      stamp,
      currentHash,
      currentBytes,
    }
  }

  return {
    ok: true,
    status: 'ok',
    stamp,
    currentHash,
    currentBytes,
  }
}
