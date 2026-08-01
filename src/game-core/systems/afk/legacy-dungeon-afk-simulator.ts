import { GOLD_DROP_MULT, ZONES } from '../../data'
import {
  getLegacyLowLevelGoldMultiplier,
  pickLegacyLootBase,
  rollLegacyRuneDrop,
} from '../combat'
import {
  getLegacyEquippedRunewordEffects,
  getLegacyItemSellValue,
  rollLegacyItemVariant,
} from '../equipment'
import { applyLegacyExperience } from '../progression'
import {
  applyLegacyAfkProvisioning,
  planLegacyAfkGoal,
} from './legacy-afk-planner'
import type {
  LegacyAfkOptions,
  LegacyAfkResult,
  LegacyAfkSummary,
} from './legacy-afk-simulator'

const DUNGEON_THEMES = {
  abyssal: { essenceMult: 1, lootMult: 1, mobDamageMult: 1 },
  ember: { essenceMult: 1.2, lootMult: 1, mobDamageMult: 1.08 },
  moon: { essenceMult: 1.1, lootMult: 1.12, mobDamageMult: 1 },
} as const

const DUNGEON_MODIFIERS = {
  balanced: { xpMult: 1, goldMult: 1, lootMult: 1, markMult: 1, eliteChanceBonus: 0 },
  glass: { xpMult: 1.18, goldMult: 1.18, lootMult: 1.08, markMult: 1.15, eliteChanceBonus: 0.05 },
  attrition: { xpMult: 1.28, goldMult: 1.2, lootMult: 1.12, markMult: 1.25, eliteChanceBonus: 0.08 },
  treasure: { xpMult: 1.08, goldMult: 1.45, lootMult: 1.32, markMult: 1.1, eliteChanceBonus: 0.03 },
  elites: { xpMult: 1.32, goldMult: 1.24, lootMult: 1.16, markMult: 1.35, eliteChanceBonus: 0.2 },
} as const

const DUNGEON_SEASON_AFFIXES = [
  { id: 'bloodmoon', xpMult: 1.25, goldMult: 1, lootMult: 1, markMult: 1.15, eliteChanceBonus: 0 },
  { id: 'gilded', xpMult: 1, goldMult: 1.4, lootMult: 1.2, markMult: 1, eliteChanceBonus: 0 },
  { id: 'mana_drought', xpMult: 1.15, goldMult: 1, lootMult: 1, markMult: 1.2, eliteChanceBonus: 0 },
  { id: 'shattered', xpMult: 1, goldMult: 1, lootMult: 1, markMult: 1.3, eliteChanceBonus: 0 },
  { id: 'cursed', xpMult: 1, goldMult: 1, lootMult: 1.35, markMult: 1, eliteChanceBonus: 0 },
  { id: 'elite_tide', xpMult: 1.2, goldMult: 1, lootMult: 1, markMult: 1.2, eliteChanceBonus: 0.15 },
] as const

export interface LegacyDungeonAfkSummary extends LegacyAfkSummary {
  dungeonFloors: number
  dungeonStartFloor: number
  dungeonEndFloor: number
  dungeonBosses: number
  dungeonMarks: number
  dungeonEssence: number
}

export interface LegacyDungeonAfkResult extends LegacyAfkResult {
  summary: LegacyDungeonAfkSummary
}

function hash(value: string): number {
  let output = 2_166_136_261
  for (const character of value) {
    output ^= character.charCodeAt(0)
    output = Math.imul(output, 16_777_619)
  }
  return output >>> 0
}

function getSeasonKey(now: number): string {
  const date = new Date(now)
  const day = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  const week = Math.ceil((((date.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7)
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

function getSeasonEffects(key: string) {
  const first = hash(key) % DUNGEON_SEASON_AFFIXES.length
  const second = (first + 1 + (hash(`${key}:second`) % (DUNGEON_SEASON_AFFIXES.length - 1))) % DUNGEON_SEASON_AFFIXES.length
  const output = { xpMult: 1, goldMult: 1, lootMult: 1, markMult: 1, eliteChanceBonus: 0 }
  for (const affix of [DUNGEON_SEASON_AFFIXES[first], DUNGEON_SEASON_AFFIXES[second]]) {
    output.xpMult *= affix.xpMult
    output.goldMult *= affix.goldMult
    output.lootMult *= affix.lootMult
    output.markMult *= affix.markMult
    output.eliteChanceBonus += affix.eliteChanceBonus
  }
  return output
}

export function getLegacyDungeonFloorMultiplier(floor: number): number {
  const normalized = Math.max(1, Math.floor(Number(floor) || 1))
  return 1 + Math.max(0, Math.log((normalized + 1) / 2) * 0.55)
}

function getRelicModifiers(character: Record<string, any>) {
  const ranks = character.dungeon?.relicRanks || {}
  const emberEye = Math.max(0, Math.min(10, Math.floor(Number(ranks.ember_eye || 0))))
  const hoarderLens = Math.max(0, Math.min(10, Math.floor(Number(ranks.hoarder_lens || 0))))
  return {
    xpMult: 1 + emberEye * 0.03,
    goldMult: 1 + hoarderLens * 0.03,
    lootMult: 1 + hoarderLens * 0.03,
  }
}

function createEmptySummary(
  elapsedMs: number,
  elapsedTicks: number,
  character: Record<string, any>,
  startFloor: number,
  potionPurchases: number,
  potionGoldSpent: number,
): LegacyDungeonAfkSummary {
  return {
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
    zone: Math.max(0, Math.min(ZONES.length - 1, Number(character.zone || 0))),
    timeline: [],
    goal: 'dungeon',
    goalActions: [],
    potionPurchases,
    potionGoldSpent,
    requiresDungeonSimulation: false,
    dungeonFloors: 0,
    dungeonStartFloor: startFloor,
    dungeonEndFloor: startFloor,
    dungeonBosses: 0,
    dungeonMarks: 0,
    dungeonEssence: 0,
  }
}

export function simulateLegacyDungeonAfkReturn(
  sourceCharacter: Record<string, any>,
  options: LegacyAfkOptions,
): LegacyDungeonAfkResult {
  let character = planLegacyAfkGoal(sourceCharacter).character as Record<string, any>
  const provisioning = applyLegacyAfkProvisioning(character)
  character = provisioning.character as Record<string, any>
  if (!character.dungeon || typeof character.dungeon !== 'object') character.dungeon = {}
  character.dungeon.active = true

  const elapsedMs = Math.max(0, Math.floor(Number(options.elapsedMs) || 0))
  const tickMs = Math.max(100, Math.floor(Number(options.tickMs || 1_200)))
  const maxTicks = Math.max(1, Math.floor(Number(options.maxTicks || 1_800)))
  const fightRate = Math.max(0.01, Math.min(1, Number(options.fightRate || 0.28)))
  const elapsedTicks = Math.floor(elapsedMs / tickMs)
  const startFloor = Math.max(1, Math.floor(Number(character.dungeon.floor || character.dungeon.checkpoint || 1)))
  const emptySummary = createEmptySummary(
    elapsedMs,
    elapsedTicks,
    character,
    startFloor,
    provisioning.purchased,
    provisioning.goldSpent,
  )
  if (elapsedTicks < 3) return { character, summary: emptySummary }

  const simulatedTicks = Math.min(elapsedTicks, maxTicks)
  const fights = Math.max(1, Math.floor(simulatedTicks * fightRate))
  const limit = Math.max(startFloor, Math.floor(Number(character.dungeon.autoDescendLimit || 50)))
  const zoneIndex = Math.max(0, Math.min(ZONES.length - 1, Number(character.zone || 0)))
  const zone = ZONES[zoneIndex]
  const modifier = DUNGEON_MODIFIERS[character.dungeon.modifier as keyof typeof DUNGEON_MODIFIERS] || DUNGEON_MODIFIERS.balanced
  const theme = DUNGEON_THEMES[character.dungeon.theme as keyof typeof DUNGEON_THEMES] || DUNGEON_THEMES.abyssal
  const season = getSeasonEffects(getSeasonKey(Math.floor(options.now ?? Date.now())))
  const relic = getRelicModifiers(character)
  const runeword = getLegacyEquippedRunewordEffects(character.equipment)
  const modifiers = options.modifiers || {}
  if (!Array.isArray(character.inventory)) character.inventory = []
  if (!Array.isArray(character.runeStash)) character.runeStash = []
  if (!character.stats || typeof character.stats !== 'object') character.stats = {}

  let floor = startFloor
  let totalXp = 0
  let totalGold = 0
  let totalLoot = 0
  let totalSold = 0
  let totalRunes = 0
  let totalMarks = 0
  let totalEssence = 0
  let floorsCleared = 0
  let bosses = 0
  const timeline: Array<{ fight: number; xp: number; gold: number }> = []

  for (let index = 0; index < fights && floor <= limit; index += 1) {
    const boss = floor % 5 === 0
    const elite = boss || options.random.next() < 0.2 + modifier.eliteChanceBonus + season.eliteChanceBonus
    const level = Math.max(1, Number(character.level || 1) + Math.floor(Math.log1p(floor) * 12))
    const floorMultiplier = getLegacyDungeonFloorMultiplier(floor)
    const xp = Math.floor(
      (20 + level * 15)
      * zone.xpMult
      * (elite ? 3 : 1)
      * (boss ? 2.5 : 1)
      * floorMultiplier
      * modifier.xpMult
      * season.xpMult
      * relic.xpMult
      * (1 + runeword.xpFind),
    )
    const gold = Math.max(1, Math.floor(
      (options.random.next() * 5 + level * 2)
      * zone.goldMult
      * (elite ? 1.6 : 1)
      * (boss ? 1.85 : 1)
      * floorMultiplier
      * modifier.goldMult
      * season.goldMult
      * relic.goldMult
      * Number(modifiers.aaGoldMultiplier || 1)
      * getLegacyLowLevelGoldMultiplier(Number(character.level || 1))
      * GOLD_DROP_MULT
      * (1 + runeword.goldFind)
      * (1 + Number(modifiers.abilityGoldBonus || 0)),
    ))
    totalXp += xp
    totalGold += gold

    const lootChance = Math.min(
      0.95,
      (boss ? 0.9 : 0.45)
      * modifier.lootMult
      * season.lootMult
      * theme.lootMult
      * relic.lootMult
      * Number(modifiers.aaLootMultiplier || 1),
    )
    if (options.random.next() < lootChance) {
      const base = options.random.next() < 0.08
        ? zone.rare
        : pickLegacyLootBase(zoneIndex, boss ? 'loot_named' : 'afk', options.random)
      const item = rollLegacyItemVariant(
        base,
        boss ? 'loot_named' : 'afk',
        { random: options.random, forceLevel: level },
        zoneIndex,
      )
      if (options.shouldAutoSell?.(item, character)) {
        totalGold += getLegacyItemSellValue(item, options.random)
        totalSold += 1
      } else character.inventory.push(item)
      totalLoot += 1
    }
    const rune = rollLegacyRuneDrop(zoneIndex, elite, 'afk', options.random)
    if (rune) {
      character.runeStash.push(rune)
      totalRunes += 1
    }

    const baseMarks = 1 + Math.floor(floor / 10) + (boss ? 4 : 0)
    const marks = Math.max(1, Math.floor(baseMarks * modifier.markMult * season.markMult))
    const essence = Math.max(1, Math.floor(
      (2 + Math.floor(Math.sqrt(floor)) + (boss ? 12 : 0)) * theme.essenceMult,
    ))
    totalMarks += marks
    totalEssence += essence
    if (boss) {
      bosses += 1
      character.dungeon.checkpoint = Math.max(Number(character.dungeon.checkpoint || 1), floor + 1)
      const cacheGold = Math.floor((Math.max(1, Number(character.level || 1)) * 35 + floor * 55) * modifier.goldMult * season.goldMult)
      totalGold += cacheGold
      const rarity = floor >= 50 ? 'Legendary' : floor >= 20 ? 'Epic' : 'Rare'
      const cacheItem = rollLegacyItemVariant(
        null,
        'drop',
        { random: options.random, forceRarity: rarity, forceLevel: Math.max(Number(character.level || 1), Number(character.level || 1) + Math.floor(floor / 10)) },
        zoneIndex,
      )
      character.inventory.push(cacheItem)
      totalLoot += 1
    }

    floorsCleared += 1
    floor += 1
    if (floorsCleared % 10 === 0 || index === fights - 1 || floor > limit) {
      timeline.push({ fight: floorsCleared, xp: totalXp, gold: totalGold })
    }
  }

  const experience = applyLegacyExperience(character, totalXp, {
    xpMultiplier: modifiers.xpMultiplier,
    groupSize: modifiers.groupSize,
    groupShareSize: modifiers.groupShareSize,
  })
  character = experience.character as Record<string, any>
  character.gold = Math.max(0, Number(character.gold || 0)) + totalGold
  character.faction = Math.max(-500, Math.min(500, Number(character.faction || 0) + Math.max(1, Math.floor(floorsCleared / 6))))
  character.dungeon.floor = floor
  character.dungeon.best = Math.max(Number(character.dungeon.best || 1), floor)
  character.dungeon.marks = Math.max(0, Number(character.dungeon.marks || 0)) + totalMarks
  character.dungeon.essence = Math.max(0, Number(character.dungeon.essence || 0)) + totalEssence
  character.dungeon.bossesCleared = Math.max(0, Number(character.dungeon.bossesCleared || 0)) + bosses
  character.dungeonsCleared = Math.max(0, Number(character.dungeonsCleared || 0)) + bosses
  character.stats.goldEarned = Math.max(0, Number(character.stats.goldEarned || 0)) + totalGold
  character.lastAfkAt = Math.floor(options.now ?? Date.now())

  return {
    character,
    summary: {
      ...emptySummary,
      applied: true,
      simulatedTicks,
      capped: elapsedTicks > simulatedTicks,
      fights: floorsCleared,
      xp: experience.totalXp,
      regularXp: experience.regularXp,
      aaXp: experience.aaXp,
      gold: totalGold,
      loot: totalLoot,
      sold: totalSold,
      runes: totalRunes,
      faction: Math.max(1, Math.floor(floorsCleared / 6)),
      levelsGained: experience.levelsGained,
      zone: zoneIndex,
      timeline,
      dungeonFloors: floorsCleared,
      dungeonEndFloor: floor,
      dungeonBosses: bosses,
      dungeonMarks: totalMarks,
      dungeonEssence: totalEssence,
    },
  }
}
