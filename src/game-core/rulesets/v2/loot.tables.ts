import type { RandomSource } from '../../rng'
import { V2_ENABLED_EQUIPMENT_IDS, V2_ENABLED_TECHNIQUE_IDS } from './content.flags'
import type { V2EnemyDefinition } from './content'
import type { V2EnemyDropBalance } from './balance.config'

export const P2_HERB_IDS = ['凝露草', '赤炎根', '清心花', '玄水叶', '厚土芝'] as const
export type P2HerbId = (typeof P2_HERB_IDS)[number]

export const P2_MATERIAL_IDS = ['妖丹', '首领精魄', '秘境玄晶'] as const
export type P2MaterialId = (typeof P2_MATERIAL_IDS)[number]

export interface P2LootRoll {
  equipment: string[]
  techniques: string[]
  herbs: Partial<Record<P2HerbId, number>>
  materials: Partial<Record<P2MaterialId, number>>
}

function emptyLoot(): P2LootRoll {
  return { equipment: [], techniques: [], herbs: {}, materials: {} }
}

function addCount<T extends string>(target: Partial<Record<T, number>>, key: T, count = 1): void {
  target[key] = Number(target[key] || 0) + Math.max(0, Math.floor(count))
}

export function rollP2Loot(
  enemy: V2EnemyDefinition,
  random: RandomSource,
  knownTechniques: readonly string[] = [],
  firstClear = false,
  learnableTechniqueIds: readonly string[] = V2_ENABLED_TECHNIQUE_IDS,
  configuredDrops?: V2EnemyDropBalance,
): P2LootRoll {
  const loot = emptyLoot()
  const equipmentPool = (configuredDrops?.equipmentPool || []).filter((id) => (V2_ENABLED_EQUIPMENT_IDS as readonly string[]).includes(id))
  const availableEquipment = equipmentPool.length ? equipmentPool : V2_ENABLED_EQUIPMENT_IDS
  const guaranteedId = String(configuredDrops?.guaranteedEquipmentId || '')
  if (guaranteedId && (V2_ENABLED_EQUIPMENT_IDS as readonly string[]).includes(guaranteedId)
    && random.chance(configuredDrops?.guaranteedEquipmentChance ?? 1)) {
    loot.equipment.push(guaranteedId)
  }
  const rankMultiplier = configuredDrops?.herbAmountMultiplier ?? (enemy.rank === 'boss' ? 3 : enemy.rank === 'elite' ? 2 : 1)
  const equipmentChance = configuredDrops?.equipmentChance ?? (enemy.rank === 'boss' ? 1 : enemy.rank === 'elite' ? 0.48 : 0.16)
  if (random.chance(equipmentChance)) {
    loot.equipment.push(random.pick(availableEquipment))
  }
  const firstClearEquipmentCount = firstClear ? Math.max(0, Math.floor(configuredDrops?.firstClearEquipmentCount ?? (enemy.rank === 'boss' ? 1 : 0))) : 0
  for (let index = 0; index < firstClearEquipmentCount; index += 1) {
    loot.equipment.push(random.pick(availableEquipment))
  }

  const herbChance = configuredDrops?.herbDropChance ?? (enemy.rank === 'normal' ? 0.68 : 1)
  const herbDrops = random.chance(herbChance)
    ? Math.max(0, Math.floor(configuredDrops?.herbDropCount ?? (enemy.rank === 'boss' ? 3 : enemy.rank === 'elite' ? 2 : 1)))
    : 0
  const herbPool = (configuredDrops?.herbPool || []).filter((id): id is P2HerbId => (P2_HERB_IDS as readonly string[]).includes(id))
  const availableHerbs = herbPool.length ? herbPool : P2_HERB_IDS
  for (let index = 0; index < herbDrops; index += 1) {
    addCount(loot.herbs, random.pick(availableHerbs), rankMultiplier)
  }

  const techniqueChance = configuredDrops?.techniqueChance ?? (enemy.rank === 'boss' ? 0.45 : enemy.rank === 'elite' ? 0.2 : 0.035)
  const configuredTechniquePool = new Set((configuredDrops?.techniquePool || V2_ENABLED_TECHNIQUE_IDS).map(String))
  const learnable = new Set(learnableTechniqueIds)
  const availableTechniques = V2_ENABLED_TECHNIQUE_IDS.filter((id) => learnable.has(id) && !knownTechniques.includes(id))
    .filter((id) => configuredTechniquePool.has(id))
  if (availableTechniques.length && random.chance(techniqueChance)) {
    loot.techniques.push(random.pick(availableTechniques))
  }

  const demonCoreCount = configuredDrops?.demonCoreCount ?? (enemy.rank === 'boss' ? 2 : enemy.rank === 'elite' ? 1 : 0)
  const bossEssenceCount = firstClear
    ? configuredDrops?.firstClearBossEssenceCount ?? (enemy.rank === 'boss' ? 2 : 0)
    : configuredDrops?.bossEssenceCount ?? (enemy.rank === 'boss' ? 1 : 0)
  if (demonCoreCount > 0) addCount(loot.materials, '妖丹', demonCoreCount)
  if (bossEssenceCount > 0) addCount(loot.materials, '首领精魄', bossEssenceCount)
  return loot
}
