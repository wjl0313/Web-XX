import type { LegacyCharacterSave } from '../../save/types'
import { ALL_ITEM_DATA } from '../../data'
import { GROWTH_STRATEGIES } from '../../domain/progression/growth-strategy'
import { V2_ENABLED_EQUIPMENT_IDS } from './content.flags'
import { V2_ENEMIES, V2_EQUIPMENT_PROFILES, V2_TECHNIQUES } from './content'
import type { AbilityKey, Element, ElementResistances, TechniqueDefinition } from './types'

export const V2_BALANCE_CONFIG_VERSION = 1

export interface V2BalanceConfig {
  postBattleHpBaseRatio: number
  postBattleMpBaseRatio: number
  postBattleHpAttributeLevelScale: number
  postBattleMpAttributeLevelScale: number
  postBattleHpGrowthSoftCapRatio: number
  postBattleMpGrowthSoftCapRatio: number
  postBattleHpMaximumRatio: number
  postBattleMpMaximumRatio: number
  restPhysiqueDivisor: number
  restMinimumPerSecond: number
  healingPillBase: number
  healingPillPhysiqueScale: number
  manaPillMaximumRatio: number
}

export const V2_BALANCE_CLASS_IDS = ['炼体士', '丹医', '五行法修', '影修'] as const
export type V2BalanceClassId = (typeof V2_BALANCE_CLASS_IDS)[number]

export type V2GrowthStatKey = 'maxHp' | 'maxMp' | 'atk' | 'def' | 'str' | 'dex' | 'con' | 'wis'

export interface V2ClassBalanceProfile {
  initial: {
    maxHp: number
    maxMp: number
    atk: number
    def: number
    abilities: Record<AbilityKey, number>
  }
  growthMultipliers: Record<V2GrowthStatKey, number>
}

export interface V2CombatBalanceConfig {
  baseCriticalChance: number
  agilityCriticalChanceScale: number
  maximumCriticalChance: number
  criticalDamageMultiplier: number
  baseHitChance: number
  agilityHitChanceScale: number
  baseDodgeChance: number
  agilityDodgeChanceScale: number
  minimumHitChance: number
  maximumHitChance: number
  defenseConstant: number
  minimumDefenseMultiplier: number
  damageVarianceMinimum: number
  damageVarianceMaximum: number
  escapeBaseChance: number
  escapeAgilityScale: number
  escapeMinimumChance: number
  escapeMaximumChance: number
}

export interface V2ElementBalanceConfig {
  overcomes: Record<'metal' | 'wood' | 'water' | 'fire' | 'earth', Element>
  advantageMultiplier: number
  disadvantageMultiplier: number
  neutralMultiplier: number
  sameElementMultiplier: number
}

export interface V2EquipmentBalanceProfile {
  atk: number
  def: number
  hp: number
  mp: number
  str: number
  dex: number
  con: number
  int: number
  wis: number
  cha: number
  fixedDamageMultiplier: number
  resistances: Partial<ElementResistances>
}

export interface V2EnemyDropBalance {
  guaranteedEquipmentId: string
  guaranteedEquipmentChance: number
  equipmentPool: string[]
  equipmentChance: number
  firstClearEquipmentCount: number
  herbPool: string[]
  herbDropChance: number
  herbDropCount: number
  herbAmountMultiplier: number
  techniquePool: string[]
  techniqueChance: number
  demonCoreCount: number
  bossEssenceCount: number
  firstClearBossEssenceCount: number
}

export interface V2EnemyBalanceProfile {
  level: number
  hp: number
  mp: number
  attack: number
  defense: number
  spirit: number
  physique: number
  agility: number
  criticalChance: number
  xp: number
  gold: number
  resistances: Partial<ElementResistances>
  drops: V2EnemyDropBalance
}

export interface V2GameBalanceConfig extends V2BalanceConfig {
  version: number
  classes: Record<V2BalanceClassId, V2ClassBalanceProfile>
  growthStrategies: Record<string, { gains: Record<V2GrowthStatKey, number> }>
  techniques: Record<string, TechniqueDefinition>
  elements: V2ElementBalanceConfig
  combat: V2CombatBalanceConfig
  equipment: Record<string, V2EquipmentBalanceProfile>
  enemies: Record<string, V2EnemyBalanceProfile>
}

export interface V2BattleRuntimeConfig {
  combat: V2CombatBalanceConfig
  elements: V2ElementBalanceConfig
  healingPillBase: number
  healingPillPhysiqueScale: number
  manaPillMaximumRatio: number
}

export type V2BalanceConfigKey = keyof V2BalanceConfig
export type V2BalanceConfigGroup = 'postBattle' | 'rest' | 'pill'

export interface V2BalanceParameterDefinition {
  key: V2BalanceConfigKey
  group: V2BalanceConfigGroup
  label: string
  description: string
  min: number
  max: number
  step: number
  unit: '%' | '倍率' | '点' | '属性点'
}

export const DEFAULT_V2_BALANCE_CONFIG: Readonly<V2BalanceConfig> = Object.freeze({
  postBattleHpBaseRatio: 0.10,
  postBattleMpBaseRatio: 0.10,
  postBattleHpAttributeLevelScale: 0.10,
  postBattleMpAttributeLevelScale: 0.10,
  postBattleHpGrowthSoftCapRatio: 0.25,
  postBattleMpGrowthSoftCapRatio: 0.25,
  postBattleHpMaximumRatio: 0.35,
  postBattleMpMaximumRatio: 0.35,
  restPhysiqueDivisor: 3,
  restMinimumPerSecond: 1,
  healingPillBase: 20,
  healingPillPhysiqueScale: 3,
  manaPillMaximumRatio: 0.40,
})

const DEFAULT_CLASS_BALANCE: Record<V2BalanceClassId, V2ClassBalanceProfile> = {
  炼体士: { initial: { maxHp: 160, maxMp: 40, atk: 18, def: 12, abilities: { str: 15, dex: 12, con: 14, int: 8, wis: 10, cha: 9 } }, growthMultipliers: { maxHp: 1, maxMp: 1, atk: 1, def: 1, str: 1, dex: 1, con: 1, wis: 1 } },
  丹医: { initial: { maxHp: 100, maxMp: 120, atk: 10, def: 8, abilities: { str: 11, dex: 9, con: 12, int: 10, wis: 15, cha: 12 } }, growthMultipliers: { maxHp: 1, maxMp: 1, atk: 1, def: 1, str: 1, dex: 1, con: 1, wis: 1 } },
  五行法修: { initial: { maxHp: 80, maxMp: 160, atk: 8, def: 4, abilities: { str: 8, dex: 11, con: 10, int: 15, wis: 13, cha: 10 } }, growthMultipliers: { maxHp: 1, maxMp: 1, atk: 1, def: 1, str: 1, dex: 1, con: 1, wis: 1 } },
  影修: { initial: { maxHp: 110, maxMp: 80, atk: 22, def: 6, abilities: { str: 11, dex: 15, con: 11, int: 12, wis: 9, cha: 12 } }, growthMultipliers: { maxHp: 1, maxMp: 1, atk: 1, def: 1, str: 1, dex: 1, con: 1, wis: 1 } },
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function defaultDropBalance(enemy: typeof V2_ENEMIES[string]): V2EnemyDropBalance {
  const rank = enemy.rank
  return {
    guaranteedEquipmentId: String(enemy.rewards.itemId || ''), guaranteedEquipmentChance: enemy.rewards.itemId ? 1 : 0,
    equipmentPool: [...V2_ENABLED_EQUIPMENT_IDS],
    equipmentChance: rank === 'boss' ? 1 : rank === 'elite' ? 0.48 : 0.16,
    firstClearEquipmentCount: rank === 'boss' ? 1 : 0,
    herbPool: ['凝露草', '赤炎根', '清心花', '玄水叶', '厚土芝'],
    herbDropChance: rank === 'normal' ? 0.68 : 1,
    herbDropCount: rank === 'boss' ? 3 : rank === 'elite' ? 2 : 1,
    herbAmountMultiplier: rank === 'boss' ? 3 : rank === 'elite' ? 2 : 1,
    techniquePool: Object.keys(V2_TECHNIQUES),
    techniqueChance: rank === 'boss' ? 0.45 : rank === 'elite' ? 0.2 : 0.035,
    demonCoreCount: rank === 'boss' ? 2 : rank === 'elite' ? 1 : 0,
    bossEssenceCount: rank === 'boss' ? 1 : 0,
    firstClearBossEssenceCount: rank === 'boss' ? 2 : 0,
  }
}

function createDefaultEquipmentBalance(): Record<string, V2EquipmentBalanceProfile> {
  return Object.fromEntries(V2_ENABLED_EQUIPMENT_IDS.map((id) => {
    const data = ALL_ITEM_DATA[id as keyof typeof ALL_ITEM_DATA] as Record<string, unknown> | undefined
    const profile = V2_EQUIPMENT_PROFILES[id]
    return [id, {
      atk: Math.max(0, Number(data?.atk || 0)), def: Math.max(0, Number(data?.def || 0)),
      hp: Math.max(0, Number(data?.hp || 0)), mp: Math.max(0, Number(data?.mp || 0)),
      str: Math.max(0, Number(data?.str || 0)), dex: Math.max(0, Number(data?.dex || 0)),
      con: Math.max(0, Number(data?.con || 0)), int: Math.max(0, Number(data?.int || 0)),
      wis: Math.max(0, Number(data?.wis || 0)), cha: Math.max(0, Number(data?.cha || 0)),
      fixedDamageMultiplier: Math.max(0, Number(profile?.fixedDamageMultiplier || 1)),
      resistances: clone(profile?.resistances || {}),
    }]
  }))
}

function createDefaultEnemyBalance(): Record<string, V2EnemyBalanceProfile> {
  return Object.fromEntries(Object.values(V2_ENEMIES).map((enemy) => [enemy.id, {
    level: enemy.level, hp: enemy.hp, mp: enemy.mp, attack: enemy.attack, defense: enemy.defense,
    spirit: enemy.spirit, physique: enemy.physique, agility: enemy.agility,
    criticalChance: enemy.criticalChance, xp: enemy.rewards.xp, gold: enemy.rewards.gold,
    resistances: clone(enemy.resistances), drops: defaultDropBalance(enemy),
  }]))
}

export const DEFAULT_V2_GAME_BALANCE_CONFIG: Readonly<V2GameBalanceConfig> = Object.freeze({
  version: V2_BALANCE_CONFIG_VERSION,
  ...DEFAULT_V2_BALANCE_CONFIG,
  classes: clone(DEFAULT_CLASS_BALANCE),
  growthStrategies: Object.fromEntries(Object.entries(GROWTH_STRATEGIES).map(([id, profile]) => [id, { gains: clone(profile.gains) }])),
  techniques: clone(V2_TECHNIQUES),
  elements: {
    overcomes: { metal: 'wood', wood: 'earth', earth: 'water', water: 'fire', fire: 'metal' },
    advantageMultiplier: 1.2, disadvantageMultiplier: 0.85, neutralMultiplier: 1, sameElementMultiplier: 1,
  },
  combat: {
    baseCriticalChance: 0.05, agilityCriticalChanceScale: 0.002, maximumCriticalChance: 0.5,
    criticalDamageMultiplier: 1.5,
    baseHitChance: 1, agilityHitChanceScale: 0, baseDodgeChance: 0, agilityDodgeChanceScale: 0,
    minimumHitChance: 0.05, maximumHitChance: 1,
    defenseConstant: 100, minimumDefenseMultiplier: 0.25,
    damageVarianceMinimum: 0.95, damageVarianceMaximum: 1.05,
    escapeBaseChance: 0.35, escapeAgilityScale: 0.02, escapeMinimumChance: 0.1, escapeMaximumChance: 0.9,
  },
  equipment: createDefaultEquipmentBalance(),
  enemies: createDefaultEnemyBalance(),
})

export const V2_BALANCE_PARAMETERS: readonly V2BalanceParameterDefinition[] = Object.freeze([
  { key: 'postBattleHpBaseRatio', group: 'postBattle', label: '气血基础恢复', description: '按最大气血计算的战胜后基础恢复。', min: 0, max: 0.5, step: 0.01, unit: '%' },
  { key: 'postBattleMpBaseRatio', group: 'postBattle', label: '法力基础恢复', description: '按最大法力计算的战胜后基础恢复。', min: 0, max: 0.5, step: 0.01, unit: '%' },
  { key: 'postBattleHpAttributeLevelScale', group: 'postBattle', label: '体魄等级系数', description: '体魄乘修为等级后使用的点数系数。', min: 0, max: 2, step: 0.01, unit: '倍率' },
  { key: 'postBattleMpAttributeLevelScale', group: 'postBattle', label: '神识等级系数', description: '神识乘修为等级后使用的点数系数。', min: 0, max: 2, step: 0.01, unit: '倍率' },
  { key: 'postBattleHpGrowthSoftCapRatio', group: 'postBattle', label: '气血成长软上限', description: '属性等级成长项接近此占比后逐步衰减。', min: 0.05, max: 1, step: 0.01, unit: '%' },
  { key: 'postBattleMpGrowthSoftCapRatio', group: 'postBattle', label: '法力成长软上限', description: '属性等级成长项接近此占比后逐步衰减。', min: 0.05, max: 1, step: 0.01, unit: '%' },
  { key: 'postBattleHpMaximumRatio', group: 'postBattle', label: '气血单次硬上限', description: '单场胜利最多恢复的最大气血占比。', min: 0, max: 1, step: 0.01, unit: '%' },
  { key: 'postBattleMpMaximumRatio', group: 'postBattle', label: '法力单次硬上限', description: '单场胜利最多恢复的最大法力占比。', min: 0, max: 1, step: 0.01, unit: '%' },
  { key: 'restPhysiqueDivisor', group: 'rest', label: '调息体魄除数', description: '每秒自然恢复为体魄除以此数并向下取整。', min: 0.25, max: 100, step: 0.25, unit: '属性点' },
  { key: 'restMinimumPerSecond', group: 'rest', label: '调息每秒保底', description: '自然调息每秒至少恢复的固定气血。', min: 0, max: 100, step: 1, unit: '点' },
  { key: 'healingPillBase', group: 'pill', label: '回春丹基础药力', description: '回春丹不受属性影响的固定恢复点数。', min: 0, max: 10_000, step: 1, unit: '点' },
  { key: 'healingPillPhysiqueScale', group: 'pill', label: '回春丹体魄系数', description: '每点体魄为回春丹增加的恢复点数。', min: 0, max: 100, step: 0.1, unit: '倍率' },
  { key: 'manaPillMaximumRatio', group: 'pill', label: '回灵丹恢复比例', description: '回灵丹按最大法力恢复的比例。', min: 0, max: 1, step: 0.01, unit: '%' },
])

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function decimals(step: number): number {
  const source = String(step)
  return source.includes('.') ? source.length - source.indexOf('.') - 1 : 0
}

export function normalizeV2BalanceConfig(value: unknown): V2BalanceConfig {
  const source = record(value)
  const normalized = { ...DEFAULT_V2_BALANCE_CONFIG } as V2BalanceConfig
  for (const definition of V2_BALANCE_PARAMETERS) {
    const candidate = Number(source[definition.key])
    if (!Number.isFinite(candidate)) continue
    const clamped = Math.max(definition.min, Math.min(definition.max, candidate))
    normalized[definition.key] = Number(clamped.toFixed(decimals(definition.step)))
  }
  return normalized
}

function mergeKnownShape<T>(defaults: T, value: unknown): T {
  if (Array.isArray(defaults)) return (Array.isArray(value) ? clone(value) : clone(defaults)) as T
  if (typeof defaults === 'number') {
    const candidate = Number(value)
    return (Number.isFinite(candidate) ? Math.max(-1_000_000_000, Math.min(1_000_000_000, candidate)) : defaults) as T
  }
  if (typeof defaults === 'string') return (typeof value === 'string' ? value : defaults) as T
  if (typeof defaults === 'boolean') return (typeof value === 'boolean' ? value : defaults) as T
  if (!defaults || typeof defaults !== 'object') return clone(defaults)
  const source = record(value)
  const result: Record<string, unknown> = {}
  for (const [key, fallback] of Object.entries(defaults as Record<string, unknown>)) {
    result[key] = mergeKnownShape(fallback, source[key])
  }
  return result as T
}

export function normalizeV2GameBalanceConfig(value: unknown): V2GameBalanceConfig {
  const normalized = mergeKnownShape(DEFAULT_V2_GAME_BALANCE_CONFIG, value)
  const simple = normalizeV2BalanceConfig(normalized)
  Object.assign(normalized, simple)
  normalized.version = V2_BALANCE_CONFIG_VERSION
  normalized.combat.minimumHitChance = Math.max(0, Math.min(1, normalized.combat.minimumHitChance))
  normalized.combat.maximumHitChance = Math.max(normalized.combat.minimumHitChance, Math.min(1, normalized.combat.maximumHitChance))
  normalized.combat.maximumCriticalChance = Math.max(0, Math.min(1, normalized.combat.maximumCriticalChance))
  for (const enemy of Object.values(normalized.enemies)) {
    enemy.criticalChance = Math.max(0, Math.min(1, enemy.criticalChance))
    enemy.drops.equipmentChance = Math.max(0, Math.min(1, enemy.drops.equipmentChance))
    enemy.drops.guaranteedEquipmentChance = Math.max(0, Math.min(1, enemy.drops.guaranteedEquipmentChance))
    enemy.drops.herbDropChance = Math.max(0, Math.min(1, enemy.drops.herbDropChance))
    enemy.drops.techniqueChance = Math.max(0, Math.min(1, enemy.drops.techniqueChance))
  }
  return normalized
}

let runtimeV2GameBalanceConfig = normalizeV2GameBalanceConfig(DEFAULT_V2_GAME_BALANCE_CONFIG)

export function getRuntimeV2GameBalanceConfig(): V2GameBalanceConfig {
  return runtimeV2GameBalanceConfig
}

export function setRuntimeV2GameBalanceConfig(value: unknown): V2GameBalanceConfig {
  runtimeV2GameBalanceConfig = normalizeV2GameBalanceConfig(value)
  return runtimeV2GameBalanceConfig
}

export function resetRuntimeV2GameBalanceConfig(): V2GameBalanceConfig {
  runtimeV2GameBalanceConfig = normalizeV2GameBalanceConfig(DEFAULT_V2_GAME_BALANCE_CONFIG)
  return runtimeV2GameBalanceConfig
}

export function getV2GameBalanceConfig(character?: LegacyCharacterSave | null): V2GameBalanceConfig {
  const overrides = character?.v2GameBalanceOverrides
  return overrides ? normalizeV2GameBalanceConfig(mergeKnownShape(runtimeV2GameBalanceConfig, overrides)) : runtimeV2GameBalanceConfig
}

export function normalizeV2BattleRuntimeConfig(value: unknown): V2BattleRuntimeConfig {
  const source = record(value)
  const fallback = DEFAULT_V2_GAME_BALANCE_CONFIG
  return {
    combat: mergeKnownShape(fallback.combat, source.combat),
    elements: mergeKnownShape(fallback.elements, source.elements),
    healingPillBase: normalizeV2BalanceConfig(source).healingPillBase,
    healingPillPhysiqueScale: normalizeV2BalanceConfig(source).healingPillPhysiqueScale,
    manaPillMaximumRatio: normalizeV2BalanceConfig(source).manaPillMaximumRatio,
  }
}

export function getV2BattleRuntimeConfig(character?: LegacyCharacterSave | null): V2BattleRuntimeConfig {
  return normalizeV2BattleRuntimeConfig(getV2GameBalanceConfig(character))
}

export function getV2BalanceConfig(character: LegacyCharacterSave | null | undefined): V2GameBalanceConfig {
  return getV2GameBalanceConfig(character)
}

export function createV2BalanceOverrides(value: unknown): V2BalanceConfig {
  return normalizeV2BalanceConfig(value)
}

export function getV2TechniqueCatalog(character?: LegacyCharacterSave | null): Readonly<Record<string, TechniqueDefinition>> {
  return getV2GameBalanceConfig(character).techniques
}

export function getV2EnemyCatalog(character?: LegacyCharacterSave | null): Readonly<Record<string, typeof V2_ENEMIES[string]>> {
  const configuration = getV2GameBalanceConfig(character)
  return Object.fromEntries(Object.entries(V2_ENEMIES).map(([id, definition]) => {
    const profile = configuration.enemies[id]
    if (!profile) return [id, definition]
    return [id, {
      ...definition,
      level: Math.max(1, Math.floor(profile.level)), hp: Math.max(1, Math.floor(profile.hp)),
      mp: Math.max(0, Math.floor(profile.mp)), attack: Math.max(1, Math.floor(profile.attack)),
      defense: Math.max(0, Math.floor(profile.defense)), spirit: Math.max(1, Math.floor(profile.spirit)),
      physique: Math.max(1, Math.floor(profile.physique)), agility: Math.max(0, Math.floor(profile.agility)),
      criticalChance: profile.criticalChance, resistances: clone(profile.resistances),
      rewards: { ...definition.rewards, xp: Math.max(0, Math.floor(profile.xp)), gold: Math.max(0, Math.floor(profile.gold)) },
    }]
  }))
}
