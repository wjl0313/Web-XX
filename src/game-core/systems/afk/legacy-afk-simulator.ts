import { GOLD_DROP_MULT, ZONES } from '../../data'
import type { RandomSource } from '../../rng'
import {
  getLegacyLowLevelGoldMultiplier,
  getLegacyZoneMobLevel,
  pickLegacyLootBase,
  rollLegacyRuneDrop,
} from '../combat'
import {
  getLegacyEquippedRunewordEffects,
  getLegacyItemSellValue,
  rollLegacyItemVariant,
} from '../equipment'
import { applyLegacyExperience } from '../progression'
import { applyLegacyAfkProvisioning, planLegacyAfkGoal } from './legacy-afk-planner'
import { simulateLegacyDungeonAfkReturn } from './legacy-dungeon-afk-simulator'

export interface LegacyAfkModifiers {
  xpMultiplier?: number
  aaGoldMultiplier?: number
  aaLootMultiplier?: number
  abilityGoldBonus?: number
  groupSize?: number
  groupShareSize?: number
}

export interface LegacyAfkOptions {
  elapsedMs: number
  random: RandomSource
  now?: number
  tickMs?: number
  maxTicks?: number
  fightRate?: number
  modifiers?: LegacyAfkModifiers
  shouldAutoSell?: (item: unknown, character: Record<string, any>) => boolean
}

export interface LegacyAfkTimelinePoint {
  fight: number
  xp: number
  gold: number
}

export interface LegacyAfkSummary {
  applied: boolean
  elapsedMs: number
  elapsedTicks: number
  simulatedTicks: number
  capped: boolean
  fights: number
  xp: number
  regularXp: number
  aaXp: number
  gold: number
  loot: number
  sold: number
  runes: number
  faction: number
  questCompletions: number
  levelsGained: number
  zone: number
  timeline: LegacyAfkTimelinePoint[]
  goal: string
  goalActions: string[]
  potionPurchases: number
  potionGoldSpent: number
  requiresDungeonSimulation: boolean
}

export interface LegacyAfkResult {
  character: Record<string, any>
  summary: LegacyAfkSummary
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function clampZone(index: number): number {
  return Math.max(0, Math.min(ZONES.length - 1, Math.floor(Number(index) || 0)))
}

function getContract(character: Record<string, any>): Record<string, any> | null {
  const board = Array.isArray(character.eliteContracts) ? character.eliteContracts : []
  const index = Math.max(0, Math.min(Math.max(0, board.length - 1), Math.floor(Number(character.afkPinnedContractIdx || 0))))
  return (character.afkGoal === 'contract' ? board[index] : null) || character.eliteContract || null
}

export function simulateLegacyAfkReturn(
  sourceCharacter: Record<string, any>,
  options: LegacyAfkOptions,
): LegacyAfkResult {
  let character = clone(sourceCharacter)
  const goalPlan = planLegacyAfkGoal(character)
  if (goalPlan.requiresDungeonSimulation) {
    return simulateLegacyDungeonAfkReturn(sourceCharacter, options)
  }
  character = goalPlan.character
  const provisioning = applyLegacyAfkProvisioning(character)
  character = provisioning.character
  const elapsedMs = Math.max(0, Math.floor(Number(options.elapsedMs) || 0))
  const tickMs = Math.max(100, Math.floor(Number(options.tickMs || 1200)))
  const maxTicks = Math.max(1, Math.floor(Number(options.maxTicks || 1800)))
  const fightRate = Math.max(0.01, Math.min(1, Number(options.fightRate || 0.28)))
  const elapsedTicks = Math.floor(elapsedMs / tickMs)
  const emptySummary: LegacyAfkSummary = {
    applied: false,
    elapsedMs,
    elapsedTicks,
    simulatedTicks: 0,
    capped: false,
    fights: 0,
    xp: 0,
    regularXp: 0,
    aaXp: 0,
    gold: 0,
    loot: 0,
    sold: 0,
    runes: 0,
    faction: 0,
    questCompletions: 0,
    levelsGained: 0,
    zone: clampZone(character.zone),
    timeline: [],
    goal: goalPlan.goal,
    goalActions: goalPlan.actions,
    potionPurchases: provisioning.purchased,
    potionGoldSpent: provisioning.goldSpent,
    requiresDungeonSimulation: goalPlan.requiresDungeonSimulation,
  }
  if (elapsedTicks < 3) return { character, summary: emptySummary }

  const simulatedTicks = Math.min(elapsedTicks, maxTicks)
  const fights = Math.max(1, Math.floor(simulatedTicks * fightRate))
  const contract = getContract(character)
  const requestedZone = character.afkGoal === 'contract' && contract?.active && ZONES[Number(contract.zone)] && Number(character.level || 1) >= ZONES[Number(contract.zone)].minLvl
    ? Number(contract.zone)
    : Number(character.zone || 0)
  const zoneIndex = clampZone(requestedZone)
  const zone = ZONES[zoneIndex]
  character.zone = zoneIndex
  if (!Array.isArray(character.inventory)) character.inventory = []
  if (!Array.isArray(character.runeStash)) character.runeStash = []
  if (!Array.isArray(character.quests)) character.quests = []

  const modifiers = options.modifiers || {}
  const runeword = getLegacyEquippedRunewordEffects(character.equipment)
  let totalXp = 0
  let totalGold = 0
  let totalLoot = 0
  let totalSold = 0
  let totalRunes = 0
  let questCompletions = 0
  const buckets = Math.max(2, Math.min(24, fights))
  const fightsPerBucket = fights / buckets
  let nextBucket = fightsPerBucket
  const timeline: LegacyAfkTimelinePoint[] = []

  for (let index = 0; index < fights; index += 1) {
    let mobName = zone.mobs[options.random.integer(0, zone.mobs.length - 1)]
    if (character.afkGoal === 'contract' && contract?.active && !contract.complete && !contract.bossStep && Number(contract.zone) === zoneIndex && options.random.next() < 0.65) {
      mobName = contract.target
    }
    const level = getLegacyZoneMobLevel(zone, Number(character.level || 1), options.random)
    const eliteChance = character.afkGoal === 'contract' && contract?.bossStep ? 0.28 : 0.1
    const elite = options.random.next() < eliteChance
    const xp = Math.floor((20 + level * 15) * zone.xpMult * (elite ? 3 : 1) * (1 + runeword.xpFind))
    const gold = Math.max(1, Math.floor(
      (options.random.next() * 8 + level * 3) *
      zone.goldMult *
      (elite ? 2 : 1) *
      Number(modifiers.aaGoldMultiplier || 1) *
      getLegacyLowLevelGoldMultiplier(Number(character.level || 1)) *
      GOLD_DROP_MULT *
      (1 + runeword.goldFind) *
      (1 + Number(modifiers.abilityGoldBonus || 0)),
    ))
    totalXp += xp
    totalGold += gold

    for (const quest of character.quests) {
      if (!quest || quest.done || mobName !== quest.mob) continue
      quest.prog = Math.min(Number(quest.count || 0), Math.max(0, Number(quest.prog || 0)) + 1)
      if (quest.prog >= Number(quest.count || 0)) {
        quest.done = true
        totalXp += Math.max(0, Math.floor(Number(quest.xp || 0)))
        totalGold += Math.max(0, Math.floor(Number(quest.gold || 0)))
        questCompletions += 1
      }
    }
    if (contract?.active && !contract.complete && Number(contract.zone) === zoneIndex) {
      const matches = contract.bossStep ? elite : mobName === contract.target
      if (matches) {
        contract.progress = Math.max(0, Number(contract.progress || 0)) + 1
        if (contract.progress >= Number(contract.count || 0)) {
          contract.progress = Number(contract.count || 0)
          contract.complete = true
          contract.streakAtComplete = 0
        }
      }
    }

    if (options.random.next() < Math.min(0.95, 0.4 * Number(modifiers.aaLootMultiplier || 1))) {
      const base = options.random.next() < 0.05
        ? zone.rare
        : pickLegacyLootBase(zoneIndex, 'afk', options.random)
      const item = rollLegacyItemVariant(base, 'afk', { random: options.random, forceLevel: level }, zoneIndex)
      if (options.shouldAutoSell?.(item, character)) {
        totalGold += getLegacyItemSellValue(item, options.random)
        totalSold += 1
      } else {
        character.inventory.push(item)
      }
      totalLoot += 1
    }
    const rune = rollLegacyRuneDrop(zoneIndex, elite, 'afk', options.random)
    if (rune) {
      character.runeStash.push(rune)
      totalRunes += 1
    }
    if (index + 1 >= nextBucket || index === fights - 1) {
      timeline.push({ fight: index + 1, xp: totalXp, gold: totalGold })
      nextBucket += fightsPerBucket
    }
  }

  const experience = applyLegacyExperience(character, totalXp, {
    xpMultiplier: modifiers.xpMultiplier,
    groupSize: modifiers.groupSize,
    groupShareSize: modifiers.groupShareSize,
  })
  character = experience.character
  character.gold = Math.max(0, Math.floor(Number(character.gold || 0))) + totalGold
  character.faction = Math.max(-500, Math.min(500, Math.floor(Number(character.faction || 0)) + Math.max(1, Math.floor(fights / 6))))
  if (!character.stats || typeof character.stats !== 'object') character.stats = {}
  character.stats.goldEarned = Math.max(0, Math.floor(Number(character.stats.goldEarned || 0))) + totalGold
  character.lastAfkAt = Math.floor(options.now ?? Date.now())

  return {
    character,
    summary: {
      applied: true,
      elapsedMs,
      elapsedTicks,
      simulatedTicks,
      capped: elapsedTicks > simulatedTicks,
      fights,
      xp: experience.totalXp,
      regularXp: experience.regularXp,
      aaXp: experience.aaXp,
      gold: totalGold,
      loot: totalLoot,
      sold: totalSold,
      runes: totalRunes,
      faction: Math.max(1, Math.floor(fights / 6)),
      questCompletions,
      levelsGained: experience.levelsGained,
      zone: zoneIndex,
      timeline,
      goal: goalPlan.goal,
      goalActions: goalPlan.actions,
      potionPurchases: provisioning.purchased,
      potionGoldSpent: provisioning.goldSpent,
      requiresDungeonSimulation: false,
    },
  }
}
