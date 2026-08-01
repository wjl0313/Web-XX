import {
  DEFAULT_CHARACTER_CLASS_ID,
  DEFAULT_CHARACTER_RACE_ID,
  normalizeCharacterClassId,
  normalizeCharacterRaceId,
  toLegacyClassId,
  toLegacyRaceId,
  type CharacterClassId,
  type CharacterRaceId,
} from '../domain'
import { createLegacyCharacter, type CreateLegacyCharacterInput } from './legacy-character.factory'
import type { LegacyCharacterSave, LegacySlot, LegacySlots } from './types'

export const NATIVE_CHARACTER_ID_SCHEMA = 1

export interface CreateNativeCharacterInput extends Omit<CreateLegacyCharacterInput, 'race' | 'classId'> {
  race: CharacterRaceId | string
  classId: CharacterClassId | string
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

/** 将旧存档角色导入为新核心的中文领域状态。 */
export function importLegacyCharacterIdentity(
  source: LegacyCharacterSave,
): LegacyCharacterSave {
  const character = clone(source)
  character.race = normalizeCharacterRaceId(character.race) ?? DEFAULT_CHARACTER_RACE_ID
  character.cls = normalizeCharacterClassId(character.cls) ?? DEFAULT_CHARACTER_CLASS_ID
  character.characterIdSchema = NATIVE_CHARACTER_ID_SCHEMA
  return character
}

/** 将新核心角色导出为冻结版可以继续读取的旧存档。 */
export function exportNativeCharacterIdentityToLegacy(
  source: LegacyCharacterSave,
): LegacyCharacterSave {
  const character = clone(source)
  character.race = toLegacyRaceId(character.race) ?? 'Human'
  character.cls = toLegacyClassId(character.cls) ?? 'Warrior'
  delete character.characterIdSchema
  return character
}

export function importLegacySlotsToNative(slots: readonly LegacySlot[]): LegacySlots {
  return slots.map((slot) => slot ? importLegacyCharacterIdentity(slot) : null)
}

export function exportNativeSlotsToLegacy(slots: readonly LegacySlot[]): LegacySlots {
  return slots.map((slot) => slot ? exportNativeCharacterIdentityToLegacy(slot) : null)
}

export function createNativeCharacter(input: CreateNativeCharacterInput): LegacyCharacterSave {
  const race = toLegacyRaceId(input.race)
  const classId = toLegacyClassId(input.classId)
  if (!race) throw new TypeError('无效灵根')
  if (!classId) throw new TypeError('无效传承')
  return importLegacyCharacterIdentity(createLegacyCharacter({ ...input, race, classId }))
}

