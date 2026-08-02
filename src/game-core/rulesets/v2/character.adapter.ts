import { ALL_ITEM_DATA } from '../../data'
import { normalizeCharacterClassId, normalizeCharacterRaceId } from '../../domain'
import { getP2RootProfile, getV2ProgressionState, mergeTalentEffects } from '../../domain/progression'
import type { LegacyCharacterSave } from '../../save'
import { getLegacyItemBaseName } from '../../systems/equipment'
import { normalizeAffinities } from './affinity.rules'
import {
  V2_CLASS_TECHNIQUES,
  V2_ENEMIES,
  V2_EQUIPMENT_PROFILES,
  V2_TECHNIQUES,
  type V2EnemyDefinition,
} from './content'
import { isV2EquipmentEnabled } from './content.flags'
import { canV2RootLearnTechnique, getV2InitialTechniqueIds } from './root-technique.rules'
import { mergeElementResistances, normalizeElementResistances } from './resistance.rules'
import { normalizeTechniqueLoadout } from './technique.rules'
import { getTechniqueMasteryRank } from './technique-mastery'
import type { AbilityKey, BattleActorState, Element, ElementResistances, TechniqueLoadout } from './types'
import { getV2GameBalanceConfig } from './balance.config'

const ABILITY_KEYS: readonly AbilityKey[] = ['str', 'dex', 'con', 'int', 'wis', 'cha']

function record(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {}
}

function dominantElement(affinities: Partial<Record<Element, number>>): Element {
  const entries = Object.entries(affinities)
    .filter(([element]) => element !== 'neutral')
    .sort((left, right) => Number(right[1] || 0) - Number(left[1] || 0))
  if (!entries.length || Number(entries[0][1] || 0) <= 0) return 'neutral'
  if (entries[1] && Number(entries[0][1]) === Number(entries[1][1])) return 'neutral'
  return entries[0][0] as Element
}

export function getV2EquipmentResistances(character: LegacyCharacterSave): ElementResistances {
  const equipment = record(character.equipment)
  const profiles = getV2GameBalanceConfig(character).equipment
  const sources = Object.values(equipment).map((item) => {
    const baseName = getLegacyItemBaseName(item)
    if (!isV2EquipmentEnabled(baseName)) return null
    return profiles[baseName]?.resistances || V2_EQUIPMENT_PROFILES[baseName]?.resistances || null
  })
  return mergeElementResistances(...sources)
}

export function getV2CharacterRoot(character: LegacyCharacterSave) {
  const progression = getV2ProgressionState(character)
  return getP2RootProfile(progression.rootId)
}

export function getV2CharacterTechniqueIds(character: LegacyCharacterSave): string[] {
  const classId = normalizeCharacterClassId(character.cls) || '炼体士'
  const rootId = getV2ProgressionState(character).rootId
  const defaults = getV2InitialTechniqueIds(rootId, classId)
  if (!Array.isArray(character.v2KnownTechniques)) return defaults
  const known = character.v2KnownTechniques
    .map(String)
    .filter((id) => Boolean(V2_TECHNIQUES[id]) && canV2RootLearnTechnique(rootId, id))
  return known.length > 0 ? Array.from(new Set(known)) : defaults
}

export function getV2CharacterLoadout(character: LegacyCharacterSave): TechniqueLoadout {
  const known = getV2CharacterTechniqueIds(character)
  return normalizeTechniqueLoadout(character.v2TechniqueLoadout, known)
}

export function createV2PlayerActor(character: LegacyCharacterSave): BattleActorState {
  const balance = getV2GameBalanceConfig(character)
  const root = getV2CharacterRoot(character)
  const progression = getV2ProgressionState(character)
  const talentEffects = mergeTalentEffects([progression.mainTalentId, progression.secondaryTalentId])
  const abilities = record(character.abilities)
  const knownTechniqueIds = getV2CharacterTechniqueIds(character)
  const loadout = getV2CharacterLoadout(character)
  const rootResistances = normalizeElementResistances(root.resistances)
  const equipmentResistances = getV2EquipmentResistances(character)
  const affinities = normalizeAffinities({
    ...root.affinities,
    ...Object.fromEntries(Object.entries(talentEffects.affinities || {}).map(([element, amount]) => [
      element,
      Number(root.affinities[element as Element] || 0) + Number(amount || 0),
    ])),
  })
  const maxHp = Math.max(1, Math.floor(Number(character.maxHp || 1) * Number(talentEffects.maxHpMultiplier || 1)))
  const maxMp = Math.max(0, Math.floor(Number(character.maxMp || 0)))
  const normalizedAbilities = Object.fromEntries(ABILITY_KEYS.map((key) => [
    key,
    Math.max(1, Math.floor(Number(abilities[key] || 10))),
  ])) as Record<AbilityKey, number>
  return {
    id: 'player', side: 'player', name: String(character.name || '修士'),
    level: Math.max(1, Math.floor(Number(character.level || 1))),
    element: dominantElement(affinities),
    hp: Math.min(maxHp, Math.max(0, Math.floor(Number(character.hp || 0)))),
    maxHp,
    mp: Math.min(maxMp, Math.max(0, Math.floor(Number(character.mp || 0)))),
    maxMp,
    shield: 0,
    attack: Math.max(1, Math.floor(Number(character.atk || 1))),
    defense: Math.max(0, Math.floor(Number(character.def || 0) * Number(talentEffects.defenseMultiplier || 1))),
    spirit: Math.max(1, Math.floor(Number(abilities.wis || 10) + Number(talentEffects.spirit || 0))),
    physique: Math.max(1, Math.floor(Number(abilities.str || 10))),
    agility: Math.max(0, Math.floor(Number(abilities.dex || 10) + Number(talentEffects.agility || 0))),
    abilities: normalizedAbilities,
    criticalChance: Math.max(0, Math.min(balance.combat.maximumCriticalChance, balance.combat.baseCriticalChance + Number(abilities.dex || 10) * balance.combat.agilityCriticalChanceScale)),
    criticalMultiplier: balance.combat.criticalDamageMultiplier,
    damageMultiplier: Number(talentEffects.attackMultiplier || 1) * Object.values(record(character.equipment)).reduce((product, item) => {
      const baseName = getLegacyItemBaseName(item)
      return product * Number(balance.equipment[baseName]?.fixedDamageMultiplier || 1)
    }, 1),
    healingMultiplier: Number(talentEffects.healingMultiplier || 1),
    statusResistances: {
      control: Math.max(0, Number(talentEffects.statusResistances?.control || 0)),
      poison: Math.max(0, Number(talentEffects.statusResistances?.poison || 0)),
    },
    techniqueMastery: Object.fromEntries(knownTechniqueIds.map((id) => [
      id,
      getTechniqueMasteryRank(Number(record(character.v2TechniqueMastery)[id] || 0)),
    ])),
    affinities,
    resistances: mergeElementResistances(rootResistances, equipmentResistances, talentEffects.resistances, record(character.v2BonusResistances)),
    knownTechniqueIds,
    techniqueLoadout: loadout,
    pills: {
      回春丹: Math.max(0, Math.floor(Number(record(character.v2Pills).回春丹 || 0))),
      回灵丹: Math.max(0, Math.floor(Number(record(character.v2Pills).回灵丹 || 0))),
    },
  }
}

export function createV2EnemyActor(definition: V2EnemyDefinition): BattleActorState {
  const balance = getV2GameBalanceConfig()
  const techniques = definition.techniqueLoadout.slots.filter((id): id is string => Boolean(id))
  return {
    id: 'enemy', side: 'enemy', name: definition.displayName, level: definition.level,
    element: definition.element, hp: definition.hp, maxHp: definition.hp,
    mp: definition.mp, maxMp: definition.mp, shield: 0,
    attack: definition.attack, defense: definition.defense, spirit: definition.spirit,
    physique: definition.physique, agility: definition.agility,
    abilities: {
      str: definition.physique, dex: definition.agility, con: definition.physique,
      int: definition.spirit, wis: definition.spirit, cha: 10,
    },
    criticalChance: definition.criticalChance, criticalMultiplier: balance.combat.criticalDamageMultiplier,
    damageMultiplier: 1, healingMultiplier: 1, statusResistances: { control: 0, poison: 0 }, techniqueMastery: {},
    affinities: { [definition.element]: definition.rank === 'boss' ? 70 : definition.rank === 'elite' ? 50 : 25 },
    resistances: normalizeElementResistances(definition.resistances),
    knownTechniqueIds: techniques,
    techniqueLoadout: normalizeTechniqueLoadout(definition.techniqueLoadout, techniques),
    pills: { 回春丹: 0, 回灵丹: 0 },
  }
}

export function getV2EnemyDefinition(id: string): V2EnemyDefinition | null {
  return V2_ENEMIES[id] || null
}

export function getV2SimpleItemStats(item: unknown, character?: LegacyCharacterSave | null): Record<string, number> | null {
  const baseName = getLegacyItemBaseName(item)
  if (!isV2EquipmentEnabled(baseName)) return null
  const base = ALL_ITEM_DATA[baseName as keyof typeof ALL_ITEM_DATA] as Record<string, unknown> | undefined
  if (!base) return null
  const configured = getV2GameBalanceConfig(character).equipment[baseName]
  const source = record(item)
  const rolls = record(source.rolls)
  const result: Record<string, number> = {}
  for (const stat of ['atk', 'def', 'hp', 'mp', 'str', 'dex', 'con', 'int', 'wis', 'cha']) {
    result[stat] = Math.max(0, Math.floor(Number(configured?.[stat as keyof typeof configured] ?? base[stat] ?? 0) + Number(rolls[stat] || 0)))
  }
  return result
}
