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
import {
  createV2ProgressionState,
  isP2RootId,
  migrateV2Progression,
  P2_PROGRESSION_VERSION,
  type GrowthStrategyId,
  type P2RootId,
  type P2TalentId,
} from '../domain/progression'
import { GAME_RACES, RACE_CLASS_RULES } from '../data'
import { isV2ClassEnabled } from '../rulesets/v2/content.flags'
import { getV2InitialTechniqueIds } from '../rulesets/v2/root-technique.rules'
import { normalizeTechniqueLoadout } from '../rulesets/v2/technique.rules'
import { getV2GameBalanceConfig, type V2BalanceClassId } from '../rulesets/v2/balance.config'
import type { GameRuleset } from '../rulesets/v2/types'
import { createLegacyCharacter, type CreateLegacyCharacterInput } from './legacy-character.factory'
import type { LegacyCharacterSave, LegacySlot, LegacySlots } from './types'

export const NATIVE_CHARACTER_ID_SCHEMA = 1

export interface NativeCharacterAppearance {
  sex: 'male' | 'female'
  hairstyle: string
  tone: string
  robe: string
}

export interface CreateNativeCharacterInput extends Omit<CreateLegacyCharacterInput, 'race' | 'classId'> {
  race: CharacterRaceId | string
  classId: CharacterClassId | string
  ruleset?: GameRuleset
  appearance?: NativeCharacterAppearance
  rootId?: P2RootId | string
  mainTalentId?: P2TalentId | string
  secondaryTalentId?: P2TalentId | string
  talentSeed?: string
  growthStrategyId?: GrowthStrategyId
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
  character.ruleset = character.ruleset === 'v2' ? 'v2' : 'legacy'
  character.characterIdSchema = NATIVE_CHARACTER_ID_SCHEMA
  return character.ruleset === 'v2' ? migrateV2Progression(character) : character
}

/** 将新核心角色导出为冻结版可以继续读取的旧存档。 */
export function exportNativeCharacterIdentityToLegacy(
  source: LegacyCharacterSave,
): LegacyCharacterSave {
  const character = clone(source)
  const ruleset = character.ruleset === 'v2' ? 'v2' : 'legacy'
  character.race = toLegacyRaceId(character.race) ?? 'Human'
  character.cls = toLegacyClassId(character.cls) ?? 'Warrior'
  delete character.characterIdSchema
  if (ruleset === 'legacy') delete character.ruleset
  return character
}

export function importLegacySlotsToNative(slots: readonly LegacySlot[]): LegacySlots {
  return slots.map((slot) => {
    if (!slot) return null
    if (slot.ruleset === 'v2') {
      const progression = slot.v2Progression
      const rootId = progression && typeof progression === 'object' && !Array.isArray(progression)
        ? (progression as Record<string, unknown>).rootId
        : null
      if (!isP2RootId(rootId)) return null
    }
    return importLegacyCharacterIdentity(slot)
  })
}

export function exportNativeSlotsToLegacy(slots: readonly LegacySlot[]): LegacySlots {
  return slots.map((slot) => slot ? exportNativeCharacterIdentityToLegacy(slot) : null)
}

export function createNativeCharacter(input: CreateNativeCharacterInput): LegacyCharacterSave {
  const ruleset: GameRuleset = input.ruleset ?? 'v2'
  const normalizedClass = normalizeCharacterClassId(input.classId)
  if (ruleset === 'v2' && !isP2RootId(input.rootId)) throw new TypeError('请选择有效的灵根资质')
  if (ruleset === 'v2' && (!normalizedClass || !isV2ClassEnabled(normalizedClass))) throw new TypeError('当前仅开放炼体士、丹医、五行法修与影修')
  const p2RootId = isP2RootId(input.rootId) ? input.rootId : '五行伪灵根'
  const race = toLegacyRaceId(input.race)
  const classId = toLegacyClassId(input.classId)
  if (ruleset === 'legacy' && !race) throw new TypeError('无效灵根')
  if (!classId) throw new TypeError('无效传承')
  const {
    appearance, ruleset: _ruleset, rootId, mainTalentId, secondaryTalentId,
    talentSeed, growthStrategyId, ...identity
  } = input
  const factoryRace = ruleset === 'v2'
    ? GAME_RACES.find((candidate) => (RACE_CLASS_RULES[candidate] as readonly string[]).includes(classId)) || 'Human'
    : race!
  const character = importLegacyCharacterIdentity(createLegacyCharacter({
    ...identity,
    hardcore: ruleset === 'legacy' ? identity.hardcore : false,
    race: factoryRace,
    classId,
  }))
  character.ruleset = ruleset
  if (ruleset === 'v2') {
    character.race = p2RootId
    character.cls = normalizeCharacterClassId(input.classId) ?? DEFAULT_CHARACTER_CLASS_ID
  }
  character.appearance = appearance
    ? JSON.parse(JSON.stringify(appearance))
    : { sex: 'male', hairstyle: '束发', tone: '自然', robe: '青衫' }
  if (ruleset === 'v2') {
    const className = normalizeCharacterClassId(input.classId) ?? DEFAULT_CHARACTER_CLASS_ID
    const classBalance = getV2GameBalanceConfig().classes[className as V2BalanceClassId]
    if (classBalance) {
      character.maxHp = classBalance.initial.maxHp
      character.hp = classBalance.initial.maxHp
      character.maxMp = classBalance.initial.maxMp
      character.mp = classBalance.initial.maxMp
      character.atk = classBalance.initial.atk
      character.def = classBalance.initial.def
      character.abilities = clone(classBalance.initial.abilities)
    }
    const techniques = getV2InitialTechniqueIds(p2RootId, className)
    character.v2ContentVersion = 2
    character.v2KnownTechniques = techniques
    character.v2TechniqueLoadout = normalizeTechniqueLoadout({ slots: techniques }, techniques)
    character.v2AutoTechniqueSlots = [true, true, true]
    character.v2BonusResistances = {}
    character.inventory = ['Worn Shortsword', 'Tattered Robe', 'Patchwork Leggings', 'Rawhide Boots']
    character.hardcore = false
    character.zone = 0
    character.bindZone = 0
    character.v2TalentSeed = talentSeed || `${character.name || '修士'}:${character.createdAt || character.created || Date.now()}`
    character.v2Progression = createV2ProgressionState({
      rootId: p2RootId,
      mainTalentId,
      secondaryTalentId,
      talentSeed: String(character.v2TalentSeed),
      legacyLevel: character.level,
      legacyXp: character.xp,
      growthStrategyId,
    })
    character.v2ProgressionVersion = P2_PROGRESSION_VERSION
  }
  return character
}
