import { describe, expect, it } from 'vitest'

import {
  calculateLegacyKillRewards,
  createLegacyMob,
  getLegacyLowLevelGoldMultiplier,
  getLegacyZoneMobLevel,
  legacySkillLevelFloor,
  pickLegacyLootBase,
  resolveLegacyMobStrike,
  resolveLegacyPlayerAttack,
  rollLegacyRuneDrop,
  scaleLegacyMobHp,
} from '../../src/game-core/systems/combat'
import { ZONES } from '../../src/game-core/data'
import type { RandomSource } from '../../src/game-core/rng'
import type { LegacyMobCombatant, LegacyPlayerCombatant } from '../../src/game-core/systems/combat'

class SequenceRandom implements RandomSource {
  private index = 0

  constructor(private readonly values: readonly number[]) {}

  next(): number {
    const value = this.values[Math.min(this.index++, this.values.length - 1)] ?? 0.5
    return Math.max(0, Math.min(0.999999, value))
  }

  integer(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1))
  }

  chance(probability: number): boolean {
    return this.next() < probability
  }

  pick<T>(items: readonly T[]): T {
    return items[this.integer(0, items.length - 1)]
  }
}

function player(overrides: Partial<LegacyPlayerCombatant> = {}): LegacyPlayerCombatant {
  return {
    name: '测试道友',
    level: 10,
    hp: 200,
    maxHp: 200,
    atk: 40,
    def: 25,
    ...overrides,
  }
}

function mob(overrides: Partial<LegacyMobCombatant> = {}): LegacyMobCombatant {
  return {
    name: '测试妖兽',
    baseName: '测试妖兽',
    level: 10,
    hp: 100,
    maxHp: 100,
    atk: 30,
    def: 18,
    elite: false,
    named: false,
    ...overrides,
  }
}

describe('legacy combat formulas', () => {
  it('keeps level floor and high-level HP scaling boundaries', () => {
    expect(legacySkillLevelFloor(1)).toBe(6)
    expect(legacySkillLevelFloor(10)).toBe(27)
    expect(scaleLegacyMobHp(100, 30)).toBe(100)
    expect(scaleLegacyMobHp(100, 31)).toBe(101)
    expect(scaleLegacyMobHp(100, 300)).toBe(340)
  })

  it('uses the legacy zone range and above-zone player rule', () => {
    expect(getLegacyZoneMobLevel(ZONES[0], 2, new SequenceRandom([0.5]))).toBe(3)
    expect(getLegacyZoneMobLevel(ZONES[0], 10, new SequenceRandom([0.9]))).toBe(11)
  })

  it('consumes mob-generation random values in legacy order', () => {
    const generated = createLegacyMob({
      zoneIndex: 0,
      playerLevel: 2,
      random: new SequenceRandom([0.01, 0.5, 0.9, 0.01, 0.5, 0.12]),
      now: () => 123,
    })

    expect(generated.named).toBe(true)
    expect(generated.elite).toBe(true)
    expect(generated.baseName).toBe('a bat matriarch')
    expect(generated.level).toBe(4)
    expect(generated.namedMechanic?.id).toBe('venom')
    expect(generated.encounterId).toBe('mob-123-11999')
  })

  it('resolves player miss, critical stun and ward consumption', () => {
    const missed = resolveLegacyPlayerAttack(player(), mob(), new SequenceRandom([0.5, 0.01]))
    expect(missed).toMatchObject({ hit: false, damage: 0, critical: false })

    const critical = resolveLegacyPlayerAttack(
      player(),
      mob({ namedMechanic: { id: 'ward' }, wardReady: true }),
      new SequenceRandom([0.5, 0.99, 0.01, 0.01]),
    )
    expect(critical.hit).toBe(true)
    expect(critical.critical).toBe(true)
    expect(critical.stunned).toBe(true)
    expect(critical.wardConsumed).toBe(true)
    expect(critical.damage).toBeGreaterThan(0)
  })

  it('resolves mob dodge, mitigation and damage cap', () => {
    const dodged = resolveLegacyMobStrike(mob(), player(), new SequenceRandom([0.01]))
    expect(dodged).toMatchObject({ hit: false, dodged: true, damage: 0 })

    const hit = resolveLegacyMobStrike(
      mob({ atk: 200, elite: true }),
      player({ maxHp: 100 }),
      new SequenceRandom([0.99, 0.5, 0.99]),
      { maxHpCapPercent: 0.08 },
    )
    expect(hit.hit).toBe(true)
    expect(hit.damage).toBe(8)
  })

  it('preserves reward multipliers and rune/loot bands', () => {
    const rewards = calculateLegacyKillRewards(
      { ...player({ level: 1 }), zone: 0 },
      mob({ level: 2, named: true, elite: true }),
      new SequenceRandom([0.5]),
    )
    expect(rewards.xp).toBe(375)
    expect(rewards.gold).toBe(1)
    expect(getLegacyLowLevelGoldMultiplier(40)).toBe(1)
    expect(getLegacyLowLevelGoldMultiplier(1)).toBeCloseTo(0.28)

    expect(rollLegacyRuneDrop(0, false, 'loot', new SequenceRandom([0.01, 0.99]))).toBe('Rune: Tir')
    expect(rollLegacyRuneDrop(0, false, 'loot', new SequenceRandom([0.99]))).toBeNull()
    expect(pickLegacyLootBase(0, 'loot', new SequenceRandom([0, 0]))).toBe('Rusty Dagger')
  })
})
