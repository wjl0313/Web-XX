import { ZONES } from '../../data'
import type { RandomSource } from '../../rng'
import { createLegacyMob } from './legacy-combat.formulas'
import { resolveLegacyPartyMobStrike } from './legacy-party-combat'
import type {
  LegacyPartyStrikeOptions,
  LegacyPartyUnit,
} from './legacy-party-combat'
import type {
  LegacyMobCombatant,
  LegacyPlayerCombatant,
} from './types'

export type LegacyPackThreat = '' | 'low' | 'moderate' | 'high'

export interface CreateLegacyMobPackOptions {
  zoneIndex: number
  playerLevel: number
  random: RandomSource
  now?: () => number
  inDungeon?: boolean
  bossLike?: boolean
  forcedTarget?: string
  minimumLevel?: number
}

export interface LegacyPackDamageResult {
  pack: LegacyMobCombatant[]
  hitCount: number
  damage: number
  killedIds: string[]
}

export interface LegacyPackSweepResult extends LegacyPackDamageResult {
  player: LegacyPlayerCombatant
  manaCost: number
  applied: boolean
  reason: 'applied' | 'no-pack' | 'insufficient-mana'
}

export interface LegacyPackAssistResult {
  party: LegacyPartyUnit[]
  totalDamage: number
  swings: number
  targetIds: string[]
  killedPlayer: boolean
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function tierForZone(minimumLevel: number): 'early' | 'mid' | 'high' | 'end' {
  if (minimumLevel < 18) return 'early'
  if (minimumLevel < 95) return 'mid'
  if (minimumLevel < 170) return 'high'
  return 'end'
}

const OUTDOOR_PACK_THRESHOLDS = {
  early: [[1, 0.65], [2, 0.9], [3, 1]],
  mid: [[1, 0.45], [2, 0.75], [3, 0.93], [4, 1]],
  high: [[1, 0.2], [2, 0.5], [3, 0.8], [4, 0.95], [5, 1]],
  end: [[2, 0.1], [3, 0.35], [4, 0.75], [5, 0.95], [6, 1]],
} as const

const DUNGEON_PACK_THRESHOLDS = {
  early: [[1, 0.8], [2, 0.94], [3, 1]],
  mid: [[1, 0.65], [2, 0.85], [3, 0.97], [4, 1]],
  high: [[1, 0.45], [2, 0.7], [3, 0.9], [4, 0.98], [5, 1]],
  end: [[1, 0.2], [2, 0.45], [3, 0.7], [4, 0.9], [5, 0.98], [6, 1]],
} as const

export function rollLegacyMobPackSize(
  minimumLevel: number,
  random: RandomSource,
  options: { inDungeon?: boolean; bossLike?: boolean; forcedTarget?: boolean } = {},
): number {
  if (options.bossLike || options.forcedTarget) return 1
  const tier = tierForZone(Math.max(1, Number(minimumLevel) || 1))
  const thresholds = options.inDungeon ? DUNGEON_PACK_THRESHOLDS[tier] : OUTDOOR_PACK_THRESHOLDS[tier]
  const roll = random.next()
  return (thresholds.find((entry) => roll < entry[1]) || thresholds[thresholds.length - 1])[0]
}

export function createLegacyMobPack(options: CreateLegacyMobPackOptions): LegacyMobCombatant[] {
  const zoneIndex = Math.max(0, Math.min(ZONES.length - 1, Math.floor(Number(options.zoneIndex) || 0)))
  const first = createLegacyMob({
    zoneIndex,
    playerLevel: options.playerLevel,
    random: options.random,
    now: options.now,
    forcedTarget: options.forcedTarget,
    minimumLevel: options.minimumLevel,
    encounterIndex: 0,
  })
  const packSize = rollLegacyMobPackSize(ZONES[zoneIndex].minLvl, options.random, {
    inDungeon: options.inDungeon,
    bossLike: options.bossLike || first.named || first.boss,
    forcedTarget: Boolean(options.forcedTarget),
  })
  const output = [first]
  for (let index = 1; index < packSize; index += 1) {
    output.push(createLegacyMob({
      zoneIndex,
      playerLevel: options.playerLevel,
      random: options.random,
      now: options.now,
      forceNormal: true,
      packMember: true,
      minimumLevel: options.minimumLevel,
      encounterIndex: index,
    }))
  }
  return output
}

export function selectLegacyMobPackTarget(
  sourcePack: readonly LegacyMobCombatant[],
  selection: number | 'weakest' | 'strongest' | 'next',
): LegacyMobCombatant[] {
  const pack = (clone(sourcePack) as LegacyMobCombatant[]).filter((mob) => mob && mob.hp > 0)
  if (pack.length <= 1) return pack
  let index = 0
  if (selection === 'next') index = 1
  else if (selection === 'weakest') {
    let score = Infinity
    pack.forEach((mob, candidate) => {
      const percent = mob.hp / Math.max(1, mob.maxHp)
      if (percent < score) {
        score = percent
        index = candidate
      }
    })
  } else if (selection === 'strongest') {
    let score = -Infinity
    pack.forEach((mob, candidate) => {
      const value = mob.hp + mob.atk * 12 + (mob.elite ? 100_000 : 0) + (mob.named ? 200_000 : 0)
      if (value > score) {
        score = value
        index = candidate
      }
    })
  } else index = Math.max(0, Math.min(pack.length - 1, Math.floor(Number(selection) || 0)))
  if (index > 0) pack.unshift(pack.splice(index, 1)[0])
  return pack
}

export function getLegacyMobPackThreat(sourcePack: readonly LegacyMobCombatant[]): LegacyPackThreat {
  const pack = sourcePack.filter((mob) => mob && mob.hp > 0)
  if (pack.length <= 1) return ''
  const assistAttack = pack.slice(1).reduce((sum, mob) => sum + Math.max(0, Number(mob.atk || 0)), 0)
  const pressure = assistAttack / Math.max(1, Number(pack[0].atk || 1))
  if (pressure >= 1.8) return 'high'
  if (pressure >= 1) return 'moderate'
  return 'low'
}

export function applyLegacyPackCleave(
  sourcePack: readonly LegacyMobCombatant[],
  sourceDamage: number,
  random: RandomSource,
  cleaveChanceBonus = 0,
): LegacyPackDamageResult {
  const pack = clone(sourcePack) as LegacyMobCombatant[]
  if (pack.length <= 1 || sourceDamage <= 0) return { pack, hitCount: 0, damage: 0, killedIds: [] }
  const chance = Math.min(0.55, 0.18 + Math.max(0, Number(cleaveChanceBonus) || 0))
  if (random.next() > chance) return { pack, hitCount: 0, damage: 0, killedIds: [] }
  let damage = 0
  let hitCount = 0
  const killedIds: string[] = []
  for (const target of pack.slice(1)) {
    if (!target || target.hp <= 0) continue
    const splash = Math.max(1, Math.floor(sourceDamage * (0.16 + random.next() * 0.08)))
    target.hp = Math.max(0, target.hp - splash)
    damage += splash
    hitCount += 1
    if (target.hp <= 0) killedIds.push(target.encounterId || target.name)
  }
  return {
    pack: pack.filter((mob, index) => index === 0 || mob.hp > 0),
    hitCount,
    damage,
    killedIds,
  }
}

export function applyLegacyPackSweep(
  sourcePack: readonly LegacyMobCombatant[],
  sourcePlayer: LegacyPlayerCombatant,
  random: RandomSource,
  modifiers: { atkBonus?: number; playerDamageMultiplier?: number } = {},
): LegacyPackSweepResult {
  const pack = clone(sourcePack) as LegacyMobCombatant[]
  const player = clone(sourcePlayer)
  const manaCost = Math.max(8, Math.floor(Number(player.maxMp || 0) * 0.035))
  if (pack.length <= 1) {
    return { pack, player, manaCost, applied: false, reason: 'no-pack', hitCount: 0, damage: 0, killedIds: [] }
  }
  if (Number(player.mp || 0) < manaCost) {
    return { pack, player, manaCost, applied: false, reason: 'insufficient-mana', hitCount: 0, damage: 0, killedIds: [] }
  }
  player.mp = Math.max(0, Number(player.mp || 0) - manaCost)
  const attack = Number(player.atk || 0) + Number(modifiers.atkBonus || 0)
  const damageMultiplier = Number(modifiers.playerDamageMultiplier || 1)
  let damage = 0
  let hitCount = 0
  const killedIds: string[] = []
  for (const target of pack.slice(1)) {
    if (!target || target.hp <= 0) continue
    let amount = Math.max(1, Math.floor((attack - target.def + player.level * 1.2 + random.next() * 8) * 0.42))
    amount = Math.max(1, Math.floor(amount * damageMultiplier))
    target.hp = Math.max(0, target.hp - amount)
    damage += amount
    hitCount += 1
    if (target.hp <= 0) killedIds.push(target.encounterId || target.name)
  }
  return {
    pack: pack.filter((mob, index) => index === 0 || mob.hp > 0),
    player,
    manaCost,
    applied: hitCount > 0,
    reason: 'applied',
    hitCount,
    damage,
    killedIds,
  }
}

export function resolveLegacyPackAssistAttacks(
  sourcePack: readonly LegacyMobCombatant[],
  sourceParty: readonly LegacyPartyUnit[],
  random: RandomSource,
  modifiers: Omit<LegacyPartyStrikeOptions, 'assist' | 'attackScale' | 'maxHpCapPercent'> = {},
): LegacyPackAssistResult {
  let party = clone(sourceParty) as LegacyPartyUnit[]
  let totalDamage = 0
  let swings = 0
  const targetIds: string[] = []
  for (const attacker of sourcePack.slice(1)) {
    const player = party.find((unit) => unit.isPlayer || unit.type === 'player')
    if (!attacker || attacker.hp <= 0 || !player || player.hp <= 0) break
    if (random.next() > 0.42) continue
    const strike = resolveLegacyPartyMobStrike(attacker, party, random, {
      ...modifiers,
      assist: true,
      attackScale: 0.34,
      maxHpCapPercent: 0.08,
      allowTankRedirect: true,
    })
    party = strike.units
    if (strike.hit) {
      totalDamage += strike.damage
      swings += 1
      if (strike.targetId) targetIds.push(strike.targetId)
    }
  }
  const player = party.find((unit) => unit.isPlayer || unit.type === 'player')
  return { party, totalDamage, swings, targetIds, killedPlayer: Boolean(player && player.hp <= 0) }
}
