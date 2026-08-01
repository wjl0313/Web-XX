import { describe, expect, it } from 'vitest'

import type { RandomSource } from '../../src/game-core/rng'
import {
  applyLegacyPackCleave,
  applyLegacyPackSweep,
  getLegacyMobPackThreat,
  rollLegacyMobPackSize,
  selectLegacyMobPackTarget,
} from '../../src/game-core/systems/combat'
import type {
  LegacyMobCombatant,
  LegacyPlayerCombatant,
} from '../../src/game-core/systems/combat'

class SequenceRandom implements RandomSource {
  private index = 0

  constructor(private readonly values: readonly number[]) {}

  next(): number {
    return this.values[Math.min(this.index++, this.values.length - 1)] ?? 0.99
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

function enemy(id: string, hp: number, atk: number, flags: Partial<LegacyMobCombatant> = {}): LegacyMobCombatant {
  return {
    name: id,
    baseName: id,
    encounterId: id,
    level: 20,
    hp,
    maxHp: 100,
    atk,
    def: 10,
    elite: false,
    named: false,
    ...flags,
  }
}

describe('legacy monster pack orchestration', () => {
  it('keeps the old outdoor/dungeon tier thresholds and boss exclusions', () => {
    expect(rollLegacyMobPackSize(1, new SequenceRandom([0.64]))).toBe(1)
    expect(rollLegacyMobPackSize(1, new SequenceRandom([0.65]))).toBe(2)
    expect(rollLegacyMobPackSize(180, new SequenceRandom([0.05]))).toBe(2)
    expect(rollLegacyMobPackSize(180, new SequenceRandom([0.05]), { inDungeon: true })).toBe(1)
    expect(rollLegacyMobPackSize(180, new SequenceRandom([0.99]), { bossLike: true })).toBe(1)
  })

  it('selects weakest/strongest targets and computes pack pressure', () => {
    const pack = [enemy('first', 100, 20), enemy('weak', 10, 8), enemy('elite', 80, 18, { elite: true })]

    expect(selectLegacyMobPackTarget(pack, 'weakest')[0].name).toBe('weak')
    expect(selectLegacyMobPackTarget(pack, 'strongest')[0].name).toBe('elite')
    expect(getLegacyMobPackThreat(pack)).toBe('moderate')
    expect(pack[0].name).toBe('first')
  })

  it('applies deterministic cleave and removes defeated secondary enemies only', () => {
    const pack = [enemy('first', 100, 20), enemy('second', 10, 10), enemy('third', 100, 10)]
    const result = applyLegacyPackCleave(pack, 100, new SequenceRandom([0, 0, 0.5]))

    expect(result).toMatchObject({ hitCount: 2, damage: 36, killedIds: ['second'] })
    expect(result.pack.map((entry) => entry.name)).toEqual(['first', 'third'])
    expect(result.pack[1].hp).toBe(80)
    expect(pack[1].hp).toBe(10)
  })

  it('charges sweep mana and attacks only secondary enemies', () => {
    const pack = [enemy('first', 100, 20), enemy('second', 100, 10), enemy('third', 100, 10)]
    const player: LegacyPlayerCombatant = {
      name: '青岚',
      level: 20,
      hp: 100,
      maxHp: 100,
      mp: 50,
      maxMp: 100,
      atk: 50,
      def: 20,
    }
    const result = applyLegacyPackSweep(pack, player, new SequenceRandom([0, 0]))

    expect(result).toMatchObject({ applied: true, manaCost: 8, hitCount: 2, damage: 52 })
    expect(result.player.mp).toBe(42)
    expect(result.pack[0].hp).toBe(100)
    expect(player.mp).toBe(50)
  })
})
