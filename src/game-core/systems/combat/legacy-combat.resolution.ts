import { ZONES } from '../../data'
import type { RandomSource } from '../../rng'
import type { LegacyCharacterSave } from '../../save'
import {
  getLegacyEquippedRunewordEffects,
  rollLegacyItemVariant,
} from '../equipment'
import { applyLegacyExperience } from '../progression'
import {
  calculateLegacyKillRewards,
  pickLegacyLootBase,
  resolveLegacyMobStrike,
  rollLegacyRuneDrop,
} from './legacy-combat.formulas'
import type {
  LegacyKillRewardModifiers,
  LegacyMobCombatant,
  LegacyMobStrikeModifiers,
  LegacyMobStrikeResult,
} from './types'
import { resolveLegacyBossVictoryBonus } from './legacy-boss'

export interface LegacyVictoryResolutionOptions {
  random: RandomSource
  rewardModifiers?: LegacyKillRewardModifiers
  lootMultiplier?: number
  questGoldMultiplier?: number
  now?: number
}

export interface LegacyVictoryResolution {
  character: LegacyCharacterSave
  combatXp: number
  combatGold: number
  questXp: number
  questGold: number
  questCompletions: string[]
  contractCompleted: boolean
  classQuestCompleted: boolean
  loot: unknown | null
  rune: string | null
  bossLoot: unknown[]
  bossCooldownUntil: number | null
}

export interface LegacyDeathRecord {
  name: string
  cls: string
  race: string
  level: number
  zone: number
  killer: string
  kills: number
  gold: number
  ts: number
}

export interface LegacyDefeatResolution {
  hardcore: boolean
  character: LegacyCharacterSave | null
  lostGold: number
  deathRecord: LegacyDeathRecord | null
}

export interface LegacyFleeResolution {
  escaped: boolean
  player: LegacyCharacterSave
  mob: LegacyMobCombatant
  strike: LegacyMobStrikeResult | null
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function clampZone(index: unknown): number {
  return Math.max(0, Math.min(ZONES.length - 1, Math.floor(Number(index) || 0)))
}

function processQuestKill(
  character: Record<string, any>,
  mob: LegacyMobCombatant,
  questGoldMultiplier: number,
): { xp: number; gold: number; completed: string[] } {
  let xp = 0
  let gold = 0
  const completed: string[] = []
  for (const quest of Array.isArray(character.quests) ? character.quests : []) {
    if (!quest || quest.done || quest.mob !== mob.baseName) continue
    quest.prog = Math.min(Number(quest.count || 0), Number(quest.prog || 0) + 1)
    if (quest.prog < Number(quest.count || 0)) continue
    quest.done = true
    xp += Math.max(0, Math.floor(Number(quest.xp || 0)))
    gold += Math.max(0, Math.floor(Number(quest.gold || 0) * questGoldMultiplier))
    completed.push(String(quest.name || ''))
  }
  return { xp, gold, completed }
}

function processContractKill(character: Record<string, any>, mob: LegacyMobCombatant): boolean {
  const contracts = Array.isArray(character.eliteContracts) ? character.eliteContracts : []
  const primaryIndex = Math.max(0, Math.floor(Number(character.contractPrimaryIdx || 0)))
  const contract = contracts[primaryIndex] || character.eliteContract
  if (!contract || !contract.active || contract.complete || Number(contract.zone) !== Number(character.zone)) return false
  const matches = contract.bossStep ? mob.named || mob.elite : mob.baseName === contract.target
  if (!matches) return false
  contract.progress = Math.min(Number(contract.count || 0), Number(contract.progress || 0) + 1)
  if (contract.progress < Number(contract.count || 0)) return false
  contract.complete = true
  const streak = character.huntStreak || {}
  contract.streakAtComplete = streak.zone === character.zone && streak.target === contract.target
    ? Number(streak.count || 0)
    : 0
  return true
}

function processClassQuestKill(character: Record<string, any>, mob: LegacyMobCombatant): boolean {
  const quest = character.classQuest
  if (!quest || quest.completed || quest.target !== mob.baseName) return false
  quest.progress = Math.min(Number(quest.count || 0), Number(quest.progress || 0) + 1)
  if (quest.progress < Number(quest.count || 0)) return false
  quest.completed = true
  return true
}

function updateHuntStreak(character: Record<string, any>, mob: LegacyMobCombatant): number {
  const zoneKey = String(character.zone)
  const target = character.huntTargets && typeof character.huntTargets === 'object'
    ? String(character.huntTargets[zoneKey] || '')
    : ''
  if (!target) return 0
  const streak = character.huntStreak && typeof character.huntStreak === 'object'
    ? character.huntStreak
    : { zone: null, target: '', count: 0 }
  if (mob.baseName === target) {
    if (streak.zone !== character.zone || streak.target !== target) {
      character.huntStreak = { zone: character.zone, target, count: 1 }
    } else {
      streak.count = Number(streak.count || 0) + 1
      character.huntStreak = streak
    }
  } else if (streak.zone === character.zone && streak.target === target) {
    streak.count = 0
    character.huntStreak = streak
  }
  return Number(character.huntStreak?.count || 0)
}

export function resolveLegacySoloVictory(
  source: LegacyCharacterSave,
  defeated: LegacyMobCombatant,
  options: LegacyVictoryResolutionOptions,
): LegacyVictoryResolution {
  let character = clone(source) as Record<string, any>
  const runeword = getLegacyEquippedRunewordEffects(character.equipment)
  const rewards = calculateLegacyKillRewards(
    character as any,
    defeated,
    options.random,
    {
      ...options.rewardModifiers,
      runewordXpFind: options.rewardModifiers?.runewordXpFind ?? runeword.xpFind,
      runewordGoldFind: options.rewardModifiers?.runewordGoldFind ?? runeword.goldFind,
    },
  )
  const quests = processQuestKill(
    character,
    defeated,
    Math.max(0, Number(options.questGoldMultiplier ?? 1)),
  )
  const contractCompleted = processContractKill(character, defeated)
  const classQuestCompleted = processClassQuestKill(character, defeated)
  const huntStreak = updateHuntStreak(character, defeated)

  const experience = applyLegacyExperience(character, rewards.xp + quests.xp)
  character = experience.character
  character.gold = Math.max(0, Number(character.gold || 0)) + rewards.gold + quests.gold
  character.faction = Math.max(
    -500,
    Math.min(500, Number(character.faction || 0) + (defeated.named ? 4 : defeated.elite ? 2 : 1)),
  )
  if (!character.stats || typeof character.stats !== 'object') character.stats = {}
  character.stats.kills = Number(character.stats.kills || 0) + 1
  if (defeated.named) character.stats.namedKills = Number(character.stats.namedKills || 0) + 1
  if (defeated.elite) character.stats.eliteKills = Number(character.stats.eliteKills || 0) + 1
  if (defeated.boss) character.stats.bossKills = Number(character.stats.bossKills || 0) + 1
  character.stats.goldEarned = Number(character.stats.goldEarned || 0) + rewards.gold + quests.gold
  if (!Array.isArray(character.inventory)) character.inventory = []
  if (!Array.isArray(character.runeStash)) character.runeStash = []

  const zoneIndex = clampZone(character.zone)
  const zone = ZONES[zoneIndex]
  const streakMultiplier = huntStreak > 0 ? 1 + Math.min(0.35, huntStreak * 0.03) : 1
  const lootChance = (defeated.named ? 0.8 : 0.4) * Math.max(0, Number(options.lootMultiplier ?? 1)) * streakMultiplier
  let loot: unknown | null = null
  if (options.random.next() < lootChance) {
    const base = options.random.next() < 0.05
      ? zone.rare
      : pickLegacyLootBase(zoneIndex, defeated.named ? 'loot_named' : 'loot', options.random)
    loot = rollLegacyItemVariant(
      base,
      defeated.named ? 'loot_named' : 'loot',
      { random: options.random, forceLevel: defeated.level },
      zoneIndex,
    )
    character.inventory.push(loot)
  }

  const rune = rollLegacyRuneDrop(zoneIndex, defeated.named, 'loot', options.random)
  if (rune) character.runeStash.push(rune)
  const bossBonus = resolveLegacyBossVictoryBonus(character, defeated, options.random, options.now)
  character = bossBonus.character as Record<string, any>

  return {
    character,
    combatXp: rewards.xp,
    combatGold: rewards.gold,
    questXp: quests.xp,
    questGold: quests.gold,
    questCompletions: quests.completed,
    contractCompleted,
    classQuestCompleted,
    loot,
    rune,
    bossLoot: bossBonus.loot,
    bossCooldownUntil: bossBonus.cooldownUntil,
  }
}

export function resolveLegacyDefeat(
  source: LegacyCharacterSave,
  defeatedBy: LegacyMobCombatant,
  now = Date.now(),
): LegacyDefeatResolution {
  const character = clone(source) as Record<string, any>
  if (!character.stats || typeof character.stats !== 'object') character.stats = {}
  character.stats.deaths = Number(character.stats.deaths || 0) + 1

  if (character.hardcore) {
    return {
      hardcore: true,
      character: null,
      lostGold: Number(character.gold || 0),
      deathRecord: {
        name: String(character.name || ''),
        cls: String(character.cls || ''),
        race: String(character.race || ''),
        level: Math.max(1, Math.floor(Number(character.level || 1))),
        zone: clampZone(character.zone),
        killer: defeatedBy.name,
        kills: Math.max(0, Math.floor(Number(character.stats.kills || 0))),
        gold: Math.max(0, Math.floor(Number(character.gold || 0))),
        ts: Math.floor(now),
      },
    }
  }

  const lostGold = Math.floor(Number(character.gold || 0) * 0.15)
  character.gold = Math.max(0, Number(character.gold || 0) - lostGold)
  character.corpse = { zone: Number(character.zone || 0), gold: lostGold, ts: Math.floor(now) }
  character.xp = Math.max(0, Number(character.xp || 0) - Math.floor(Number(character.xpNext || 0) * 0.1))
  character.faction = Math.max(-500, Number(character.faction || 0) - 5)
  character.hp = character.maxHp
  character.mp = character.maxMp
  character.zone = Number(character.bindZone ?? character.zone ?? 0)
  if (character.dungeon?.active && character.dungeon.autoLeaveOnDeath) {
    character.dungeon.active = false
    character.dungeon.floor = Math.max(1, Number(character.dungeon.checkpoint || 1))
  }

  return { hardcore: false, character, lostGold, deathRecord: null }
}

export function resolveLegacyFlee(
  source: LegacyCharacterSave,
  mobSource: LegacyMobCombatant,
  random: RandomSource,
  strikeModifiers: LegacyMobStrikeModifiers = {},
): LegacyFleeResolution {
  const player = clone(source)
  const mob = clone(mobSource)
  if (random.next() < 0.6) return { escaped: true, player, mob, strike: null }
  const strike = resolveLegacyMobStrike(mob, player as any, random, {
    ...strikeModifiers,
    attackScale: 0.7,
  })
  if (strike.hit) player.hp = Math.max(0, Number(player.hp || 0) - strike.damage)
  return { escaped: false, player, mob, strike }
}
