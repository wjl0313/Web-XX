import { addV2Cultivation, getP2RootProfile, getV2ProgressionState } from '../../domain/progression'
import type { RandomSource } from '../../rng'
import type { LegacyCharacterSave } from '../../save/types'
import { V2_EQUIPMENT_PROFILES, type V2EnemyDefinition } from './content'
import { rollP2Loot, type P2HerbId, type P2LootRoll, type P2MaterialId } from './loot.tables'
import { canV2RootLearnTechnique, getV2LearnableTechniqueIds } from './root-technique.rules'
import { getV2GameBalanceConfig } from './balance.config'

export interface V2RewardBundle extends P2LootRoll {
  cultivation: number
  gold: number
  enemyId: string
  enemyName: string
  boss: boolean
  firstClear: boolean
}

export interface V2RewardApplication {
  character: LegacyCharacterSave
  cultivationApplied: number
  equipmentAdded: number
  inventoryFull: boolean
  techniquesAdded: string[]
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function countRecord(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value).map(([key, count]) => [key, Math.max(0, Math.floor(Number(count) || 0))]))
}

export function getV2InventoryCapacity(character: LegacyCharacterSave): number {
  const explicit = Math.floor(Number(character.inventoryCapacity || 0))
  if (explicit > 0) return explicit
  const bags = Array.isArray(character.bags) ? character.bags.length : 0
  return Math.max(24, bags * 8)
}

export function createV2RewardBundle(
  enemy: V2EnemyDefinition,
  character: LegacyCharacterSave,
  random: RandomSource,
  firstClear = false,
): V2RewardBundle {
  const known = Array.isArray(character.v2KnownTechniques) ? character.v2KnownTechniques.map(String) : []
  const configuration = getV2GameBalanceConfig(character)
  return {
    cultivation: Math.max(0, Math.floor(enemy.rewards.xp)),
    gold: Math.max(0, Math.floor(enemy.rewards.gold)),
    enemyId: enemy.id,
    enemyName: enemy.displayName,
    boss: enemy.rank === 'boss',
    firstClear,
    ...rollP2Loot(enemy, random, known, firstClear, getV2LearnableTechniqueIds(getP2RootProfile(getV2ProgressionState(character).rootId)), configuration.enemies[enemy.id]?.drops),
  }
}

export function applyV2RewardBundle(
  source: LegacyCharacterSave,
  bundle: V2RewardBundle,
  idempotencyKey?: string,
  cultivationSource: 'battle' | 'offline' | 'dungeon' = 'battle',
): V2RewardApplication {
  let character = clone(source)
  const settled = Array.isArray(character.v2SettledRewards) ? character.v2SettledRewards.map(String) : []
  if (idempotencyKey && settled.includes(idempotencyKey)) {
    return { character, cultivationApplied: 0, equipmentAdded: 0, inventoryFull: false, techniquesAdded: [] }
  }

  const progression = getV2ProgressionState(character)
  const root = getP2RootProfile(progression.rootId)
  const cultivation = Math.floor(bundle.cultivation * root.cultivationRate)
  const cultivationResult = addV2Cultivation(character, cultivation, cultivationSource)
  character = cultivationResult.character
  character.gold = Math.max(0, Math.floor(Number(character.gold || 0))) + bundle.gold

  const inventory = Array.isArray(character.inventory) ? [...character.inventory] : []
  const capacity = getV2InventoryCapacity(character)
  let equipmentAdded = 0
  let inventoryFull = false
  for (const equipmentId of bundle.equipment) {
    if (!getV2GameBalanceConfig(character).equipment[equipmentId] && !V2_EQUIPMENT_PROFILES[equipmentId]) continue
    if (inventory.length >= capacity) {
      inventoryFull = true
      break
    }
    inventory.push(equipmentId)
    equipmentAdded += 1
  }
  character.inventory = inventory

  const known = new Set(Array.isArray(character.v2KnownTechniques) ? character.v2KnownTechniques.map(String) : [])
  const techniquesAdded: string[] = []
  for (const techniqueId of bundle.techniques) {
    if (known.has(techniqueId) || !canV2RootLearnTechnique(progression.rootId, techniqueId)) continue
    known.add(techniqueId)
    techniquesAdded.push(techniqueId)
  }
  character.v2KnownTechniques = [...known]

  const herbs = countRecord(character.v2Herbs)
  for (const [herbId, count] of Object.entries(bundle.herbs)) {
    herbs[herbId as P2HerbId] = Number(herbs[herbId] || 0) + Math.max(0, Math.floor(Number(count) || 0))
  }
  character.v2Herbs = herbs
  const materials = countRecord(character.v2Materials)
  for (const [materialId, count] of Object.entries(bundle.materials)) {
    materials[materialId as P2MaterialId] = Number(materials[materialId] || 0) + Math.max(0, Math.floor(Number(count) || 0))
  }
  character.v2Materials = materials

  const codex = countRecord(character.v2Codex)
  codex[bundle.enemyId] = Number(codex[bundle.enemyId] || 0) + 1
  character.v2Codex = codex
  const tasks = countRecord(character.v2TaskProgress)
  tasks.zoneKills = Number(tasks.zoneKills || 0) + 1
  if (bundle.boss) tasks.bossKills = Number(tasks.bossKills || 0) + 1
  character.v2TaskProgress = tasks

  if (bundle.boss) {
    const wins = countRecord(character.v2BossWins)
    wins[bundle.enemyId] = Number(wins[bundle.enemyId] || 0) + 1
    character.v2BossWins = wins
  }
  if (!character.stats || typeof character.stats !== 'object') character.stats = {}
  const stats = character.stats as Record<string, unknown>
  stats.kills = Math.max(0, Math.floor(Number(stats.kills || 0))) + 1
  stats.goldEarned = Math.max(0, Math.floor(Number(stats.goldEarned || 0))) + bundle.gold
  if (bundle.boss) stats.bossKills = Math.max(0, Math.floor(Number(stats.bossKills || 0))) + 1

  if (idempotencyKey) character.v2SettledRewards = [...settled, idempotencyKey].slice(-100)
  return { character, cultivationApplied: cultivationResult.applied, equipmentAdded, inventoryFull, techniquesAdded }
}
