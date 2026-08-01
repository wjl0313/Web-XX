import {
  LEGACY_GAME_VERSION,
  LEGACY_MAX_SLOTS,
  LEGACY_SAVE_SCHEMA,
} from './constants'
import type {
  LegacyCharacterSave,
  LegacyImportOptions,
  LegacySaveExportPayload,
  LegacySlot,
  LegacySlots,
} from './types'

function isCharacter(value: unknown): value is LegacyCharacterSave {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function cloneCharacter(value: LegacyCharacterSave): LegacyCharacterSave {
  return JSON.parse(JSON.stringify(value)) as LegacyCharacterSave
}

function applyTransform(
  character: LegacyCharacterSave,
  transform: LegacyImportOptions['migrateCharacter'],
): LegacyCharacterSave {
  if (!transform) return character
  const transformed = transform(character)
  if (transformed === undefined) return character
  if (!isCharacter(transformed)) throw new TypeError('存档角色转换结果无效')
  return transformed
}

export function validateLegacyImportedSlots(
  rawSlots: unknown,
  options: LegacyImportOptions = {},
): LegacySlots {
  if (!Array.isArray(rawSlots)) throw new TypeError('无效存档：角色槽必须是数组')
  if (rawSlots.length > LEGACY_MAX_SLOTS) throw new RangeError('导入存档的角色槽数量超过上限')

  const normalized: LegacySlots = []
  for (let index = 0; index < rawSlots.length; index += 1) {
    const entry = rawSlots[index]
    if (entry === null) {
      normalized.push(null)
      continue
    }

    if (!isCharacter(entry)) throw new TypeError(`索引 ${index} 的角色槽无效`)

    let character = cloneCharacter(entry)
    character = applyTransform(character, options.migrateCharacter)
    character = applyTransform(character, options.sanitizeCharacter)
    normalized.push(character)
  }

  while (normalized.length < LEGACY_MAX_SLOTS) normalized.push(null)
  return normalized
}

export function mergeLegacyImportedSlots(
  currentSlots: readonly LegacySlot[],
  importedSlots: readonly LegacySlot[],
  options: LegacyImportOptions = {},
): LegacySlots {
  const incoming = importedSlots
    .filter((slot): slot is LegacyCharacterSave => slot !== null)
    .map(cloneCharacter)
  const merged: LegacySlot[] = currentSlots
    .slice(0, LEGACY_MAX_SLOTS)
    .map((slot) => (slot ? cloneCharacter(slot) : null))

  while (merged.length < LEGACY_MAX_SLOTS) merged.push(null)

  let placed = 0
  for (let index = 0; index < LEGACY_MAX_SLOTS && placed < incoming.length; index += 1) {
    if (merged[index] === null) {
      merged[index] = incoming[placed]
      placed += 1
    }
  }

  if (placed < incoming.length) throw new RangeError('没有足够的空角色槽用于合并导入')
  return validateLegacyImportedSlots(merged, options)
}

export function createLegacySaveExportPayload(
  slots: readonly LegacySlot[],
  exportedAt: Date,
  extraMeta: Record<string, unknown> = {},
): LegacySaveExportPayload {
  return {
    meta: {
      ...extraMeta,
      game: 'EmberQuest',
      version: LEGACY_GAME_VERSION,
      saveSchema: LEGACY_SAVE_SCHEMA,
      exportedAt: exportedAt.toISOString(),
    },
    slots: validateLegacyImportedSlots(slots),
  }
}
