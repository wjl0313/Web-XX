import {
  GOLD_DROP_MULT,
  LOOT,
  LOOT_MISC_BASES,
  LOOT_TIER_ADVANCED,
  LOOT_TIER_EPIC,
  LOOT_TIER_MID,
  LOOT_TIER_MYTHIC,
  LOOT_TIER_STARTER,
  NAMED_BY_ZONE,
  NAMED_MECHANICS,
  PHASE1,
  PHASE4,
  PHASE6,
  ZONES,
} from '../../data'
import type { RandomSource } from '../../rng'
import type {
  LegacyAttackResult,
  LegacyKillRewardModifiers,
  LegacyKillRewards,
  LegacyMobCombatant,
  LegacyMobStrikeModifiers,
  LegacyMobStrikeResult,
  LegacyPlayerAttackModifiers,
  LegacyPlayerCombatant,
} from './types'

export interface CreateLegacyMobOptions {
  zoneIndex: number
  playerLevel: number
  random: RandomSource
  now?: () => number
  forceNormal?: boolean
  packMember?: boolean
  forcedTarget?: string
  minimumLevel?: number
  encounterId?: string
  encounterIndex?: number
}

function clampZoneIndex(zoneIndex: number): number {
  return Math.max(0, Math.min(ZONES.length - 1, Math.floor(Number(zoneIndex) || 0)))
}

function pick<T>(values: readonly T[], random: RandomSource): T {
  return values[Math.floor(random.next() * values.length)]
}

export function legacySkillLevelFloor(level: number): number {
  const normalized = Math.max(1, Math.floor(Number(level) || 1))
  return Math.floor(normalized * 1.2 + Math.sqrt(normalized) * 5)
}

export function getLegacyZoneMobLevel(
  zone: (typeof ZONES)[number],
  playerLevel: number,
  random: RandomSource,
): number {
  const minimum = Number.isFinite(Number(zone?.minLvl)) ? Number(zone.minLvl) : 1
  const maximum = Number.isFinite(Number(zone?.maxLvl)) ? Number(zone.maxLvl) : minimum + 4
  const player = Math.max(1, Math.floor(Number(playerLevel) || 1))

  if (player > maximum) return Math.max(minimum, player + Math.floor(random.next() * 3) - 1)
  return minimum + Math.floor(random.next() * (maximum - minimum + 1))
}

export function scaleLegacyMobHp(rawHp: number, level: number): number {
  if (level <= 30) return Math.max(1, Math.floor(rawHp))
  const bonus = Math.min(2.4, (level - 30) * PHASE6.highLevelHpScale)
  return Math.max(1, Math.floor(rawHp * (1 + bonus)))
}

export function createLegacyMob(options: CreateLegacyMobOptions): LegacyMobCombatant {
  const zoneIndex = clampZoneIndex(options.zoneIndex)
  const zone = ZONES[zoneIndex]
  const namedPool = NAMED_BY_ZONE[zoneIndex as keyof typeof NAMED_BY_ZONE] ?? []
  const forcedTarget =
    options.forcedTarget && zone.mobs.includes(options.forcedTarget as never)
      ? options.forcedTarget
      : ''
  const named =
    !options.forceNormal &&
    !forcedTarget &&
    namedPool.length > 0 &&
    options.random.next() < 0.08
  const baseName = forcedTarget || (named ? pick(namedPool, options.random) : pick(zone.mobs, options.random))
  const level = Math.max(
    options.minimumLevel || 0,
    getLegacyZoneMobLevel(zone, options.playerLevel, options.random),
  )
  const elite = !options.forceNormal && options.random.next() < 0.1
  const namedMultiplier = named ? 2.4 : 1
  const rawHp =
    (80 + level * 38) *
    (elite ? 2.4 : 1) *
    namedMultiplier *
    (options.packMember ? 0.82 : 1)
  const hp = scaleLegacyMobHp(rawHp, level)
  const namedMechanic = named ? pick(NAMED_MECHANICS, options.random) : null
  const attackMultiplier = named ? 1.75 : elite ? 1.35 : 1
  const packAttackMultiplier = options.packMember ? 0.88 : 1
  const attack = Math.floor(
    (8 + level * 2.2 + Math.pow(level, 1.45) * 0.55) *
      attackMultiplier *
      packAttackMultiplier,
  )
  const now = options.now?.() ?? Date.now()
  const encounterId =
    options.encounterId || `mob-${now}-${Math.floor(options.random.next() * 99_999)}`

  return {
    name: `${named ? '[Named] ' : elite ? '[Elite] ' : ''}${baseName}`,
    baseName,
    level,
    hp,
    maxHp: hp,
    atk: Math.max(1, attack),
    def: Math.floor((2 + level) * (named ? 1.4 : 1)),
    elite,
    named,
    namedMechanic,
    enrageTriggered: false,
    wardReady: false,
    turnCount: 0,
    encounterId,
    encounterIndex: Number(options.encounterIndex || 0),
  }
}

export function resolveLegacyPlayerAttack(
  player: LegacyPlayerCombatant,
  mob: LegacyMobCombatant,
  random: RandomSource,
  modifiers: LegacyPlayerAttackModifiers = {},
): LegacyAttackResult {
  const playerAttack = player.atk + Number(modifiers.atkBonus || 0)
  const levelFloor = legacySkillLevelFloor(player.level)
  let damage = Math.max(
    1,
    playerAttack -
      Math.floor((mob.def || 0) * 0.65) +
      levelFloor +
      Math.floor(random.next() * 10) -
      3,
  )
  damage = Math.max(1, Math.floor(damage * Number(modifiers.playerDamageMultiplier || 1)))

  const levelDifference = player.level - mob.level
  const levelMultiplier =
    levelDifference >= 0
      ? Math.min(6, 1 + levelDifference * 0.05)
      : Math.max(0.4, 1 + levelDifference * 0.04)
  damage = Math.max(1, Math.floor(damage * levelMultiplier))

  const dodgeChance =
    PHASE1.mobDodgeBase +
    (mob.elite ? 0.02 : 0) +
    (mob.named ? 0.03 : 0) +
    Number(modifiers.mobDodgeBonus || 0)
  if (random.next() < dodgeChance) {
    return { damage: 0, hit: false, critical: false, stunned: false, wardConsumed: false }
  }

  const criticalChance = PHASE1.playerCrit + Number(modifiers.critChanceBonus || 0)
  const critical = random.next() < criticalChance
  if (critical) {
    damage = Math.max(
      1,
      Math.floor(
        damage * (PHASE1.playerCritMult + Number(modifiers.critMultiplierBonus || 0)),
      ),
    )
  }

  let wardConsumed = false
  if (mob.namedMechanic?.id === 'ward' && mob.wardReady) {
    damage = Math.max(1, Math.floor(damage * 0.55))
    wardConsumed = true
  }

  return {
    damage,
    hit: true,
    critical,
    stunned: critical && random.next() < PHASE1.stunOnCritChance,
    wardConsumed,
  }
}

export function resolveLegacyMobStrike(
  mob: LegacyMobCombatant,
  player: LegacyPlayerCombatant,
  random: RandomSource,
  modifiers: LegacyMobStrikeModifiers = {},
): LegacyMobStrikeResult {
  const dodgeChance = PHASE1.playerDodge + Number(modifiers.playerDodgeChance || 0)
  if (random.next() < dodgeChance) {
    return { damage: 0, hit: false, critical: false, dodged: true }
  }

  const attackValue = Math.max(1, Math.floor(mob.atk * Number(modifiers.attackScale || 1)))
  const targetDefense = Math.max(1, Math.floor(player.def || 1))
  const defenseMitigationFraction = attackValue / (attackValue + targetDefense)
  const variance = Math.floor(random.next() * (modifiers.assist ? 3 : 4)) - (modifiers.assist ? 0 : 1)
  let damage = Math.max(1, Math.round(attackValue * defenseMitigationFraction) + variance)
  damage = Math.max(
    1,
    Math.floor(damage * Math.max(0.35, Number(modifiers.mobDamageMultiplier || 1))),
  )

  const levelDifference = player.level - mob.level
  const levelMultiplier =
    levelDifference >= 0
      ? Math.max(0.2, 1 - levelDifference * 0.04)
      : Math.min(2.5, 1 + -levelDifference * 0.05)
  damage = Math.max(1, Math.floor(damage * levelMultiplier))

  const criticalChance =
    PHASE1.mobCrit +
    (mob.elite ? PHASE1.eliteCritBonus : 0) +
    (mob.named ? PHASE1.namedCritBonus : 0)
  const critical = random.next() < criticalChance
  if (critical) damage = Math.max(1, Math.floor(damage * PHASE1.mobCritMult))

  if (Number(modifiers.mitigation || 0) > 0) {
    damage = Math.max(1, damage - Number(modifiers.mitigation || 0))
  }
  if (modifiers.maxHpCapPercent) {
    damage = Math.min(
      damage,
      Math.max(1, Math.floor(player.maxHp * modifiers.maxHpCapPercent)),
    )
  }

  return { damage, hit: true, critical, dodged: false }
}

export function getLegacyLowLevelGoldMultiplier(level: number): number {
  const normalized = Math.max(1, Math.floor(Number(level) || 1))
  return normalized >= 40 ? 1 : 0.28 + ((normalized - 1) / 39) * 0.72
}

export function getLegacyZoneProgressGoldMultiplier(zoneIndex: number): number {
  const maximum = Math.max(1, ZONES.length - 1)
  const index = Math.max(0, Math.min(maximum, Math.floor(Number(zoneIndex) || 0)))
  return 0.72 + (index / maximum) * 0.88
}

export function calculateLegacyKillRewards(
  player: LegacyPlayerCombatant & { zone: number; hardcore?: boolean },
  mob: LegacyMobCombatant,
  random: RandomSource,
  modifiers: LegacyKillRewardModifiers = {},
): LegacyKillRewards {
  const zoneIndex = clampZoneIndex(player.zone)
  const zone = ZONES[zoneIndex]
  const namedXpMultiplier = mob.named ? 2.5 : 1
  const namedGoldMultiplier = mob.named ? 1.85 : 1
  const eliteGoldMultiplier = mob.elite ? 1.6 : 1
  const hardcoreXpMultiplier = player.hardcore ? 1 + PHASE4.hardcoreXpBonus : 1
  const hardcoreGoldMultiplier = player.hardcore ? 1 + PHASE4.hardcoreGoldBonus : 1

  const xp = Math.floor(
    (20 + mob.level * 15) *
      zone.xpMult *
      (mob.elite ? 3 : 1) *
      namedXpMultiplier *
      (mob.boss ? PHASE4.bossXpMult : 1) *
      hardcoreXpMultiplier *
      Number(modifiers.eventXpMultiplier || 1) *
      Number(modifiers.dungeonFloorMultiplier || 1) *
      Number(modifiers.dungeonXpMultiplier || 1) *
      (1 + Number(modifiers.runewordXpFind || 0)),
  )
  const gold = Math.max(
    1,
    Math.floor(
      (random.next() * 5 + mob.level * 2) *
        zone.goldMult *
        eliteGoldMultiplier *
        namedGoldMultiplier *
        (mob.boss ? PHASE4.bossGoldMult : 1) *
        hardcoreGoldMultiplier *
        Number(modifiers.eventGoldMultiplier || 1) *
        Number(modifiers.dungeonFloorMultiplier || 1) *
        Number(modifiers.dungeonGoldMultiplier || 1) *
        Number(modifiers.prestigeGoldMultiplier || 1) *
        Number(modifiers.aaGoldMultiplier || 1) *
        Number(modifiers.relicGoldMultiplier || 1) *
        getLegacyLowLevelGoldMultiplier(player.level) *
        getLegacyZoneProgressGoldMultiplier(zoneIndex) *
        Number(modifiers.petGoldMultiplier || 1) *
        GOLD_DROP_MULT *
        (1 + Number(modifiers.runewordGoldFind || 0)) *
        (1 + Number(modifiers.abilityGoldBonus || 0)),
    ),
  )

  return { xp, gold }
}

export function rollLegacyRuneDrop(
  zoneIndex: number,
  named: boolean,
  source: 'loot' | 'afk',
  random: RandomSource,
): string | null {
  const baseChance = source === 'afk' ? 0.08 : 0.12
  const chance = named ? Math.max(baseChance, 0.28) : baseChance
  if (random.next() > chance) return null

  const level = ZONES[clampZoneIndex(zoneIndex)].minLvl
  const pool =
    level < 5
      ? ['Rune: El', 'Rune: Tir']
      : level < 13
        ? ['Rune: El', 'Rune: Tir', 'Rune: Tal']
        : level < 22
          ? ['Rune: Tir', 'Rune: Tal', 'Rune: Ort']
          : level < 30
            ? ['Rune: Tal', 'Rune: Ort', 'Rune: Sol']
            : level < 38
              ? ['Rune: Ort', 'Rune: Sol', 'Rune: Dol']
              : level < 46
                ? ['Rune: Sol', 'Rune: Dol', 'Rune: Kor', 'Rune: Bron']
                : level < 54
                  ? ['Rune: Dol', 'Rune: Kor', 'Rune: Bron', 'Rune: Lyr']
                  : level < 66
                    ? ['Rune: Kor', 'Rune: Bron', 'Rune: Lyr', 'Rune: Vald']
                    : level < 78
                      ? ['Rune: Lyr', 'Rune: Vald', 'Rune: Zhar']
                      : ['Rune: Vald', 'Rune: Zhar', 'Rune: Morr']

  return pick(pool, random)
}

export function pickLegacyLootBase(
  zoneIndex: number,
  source: 'loot' | 'loot_named' | 'afk' | 'mystic',
  random: RandomSource,
): string {
  const zoneLevel = ZONES[clampZoneIndex(zoneIndex)].minLvl
  let weights: number[]
  let miscWeight: number

  if (zoneLevel >= 160) {
    weights = [0, 0, 0.1, 0.45, 0.45]
    miscWeight = 0.02
  } else if (zoneLevel >= 130) {
    weights = [0, 0, 0.22, 0.5, 0.28]
    miscWeight = 0.02
  } else if (zoneLevel >= 100) {
    weights = [0, 0.08, 0.42, 0.4, 0.1]
    miscWeight = 0.03
  } else if (zoneLevel >= 80) {
    weights = [0, 0.16, 0.46, 0.33, 0.05]
    miscWeight = 0.04
  } else if (zoneLevel >= 60) {
    weights = [0.05, 0.26, 0.49, 0.2, 0]
    miscWeight = 0.05
  } else if (zoneLevel >= 45) {
    weights = [0.14, 0.4, 0.38, 0.08, 0]
    miscWeight = 0.07
  } else if (zoneLevel >= 25) {
    weights = [0.3, 0.44, 0.24, 0.02, 0]
    miscWeight = 0.1
  } else if (zoneLevel >= 12) {
    weights = [0.5, 0.34, 0.16, 0, 0]
    miscWeight = 0.12
  } else {
    weights = [0.7, 0.22, 0.08, 0, 0]
    miscWeight = 0.15
  }

  if (source === 'mystic') {
    weights = [
      weights[0] * 0.4,
      weights[1] * 0.9,
      weights[2] * 1.3,
      weights[3] * 1.6,
      weights[4] * 1.8,
    ]
    miscWeight *= 0.5
  }

  const pools = [
    LOOT_TIER_STARTER,
    LOOT_TIER_MID,
    LOOT_TIER_ADVANCED,
    LOOT_TIER_EPIC,
    LOOT_TIER_MYTHIC,
  ]
  const total = weights.reduce((sum, weight) => sum + weight, 0) || 1
  let roll = random.next() * total

  for (let index = 0; index < pools.length; index += 1) {
    roll -= weights[index]
    if (roll <= 0) {
      const valid = pools[index].filter((name) => LOOT.includes(name))
      if (valid.length) return pick(valid, random)
      break
    }
  }

  if (zoneLevel >= 60) {
    for (const pool of [
      LOOT_TIER_MYTHIC,
      LOOT_TIER_EPIC,
      LOOT_TIER_ADVANCED,
      LOOT_TIER_MID,
      LOOT_TIER_STARTER,
    ]) {
      const valid = pool.filter((name) => LOOT.includes(name))
      if (valid.length) return pick(valid, random)
    }
  }

  if (random.next() < miscWeight) {
    const misc = LOOT_MISC_BASES.filter((name) => LOOT.includes(name))
    if (misc.length) return pick(misc, random)
  }
  return pick(LOOT, random)
}
