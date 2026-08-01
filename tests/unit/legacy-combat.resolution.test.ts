import { describe, expect, it } from 'vitest'

import type { RandomSource } from '../../src/game-core/rng'
import { createLegacyCharacter } from '../../src/game-core/save'
import {
  resolveLegacyDefeat,
  resolveLegacyFlee,
  resolveLegacySoloVictory,
  type LegacyMobCombatant,
} from '../../src/game-core/systems/combat'

class SequenceRandom implements RandomSource {
  private index = 0

  constructor(private readonly values: readonly number[]) {}

  next(): number {
    const value = this.values[Math.min(this.index++, this.values.length - 1)] ?? 0.99
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

function mob(overrides: Partial<LegacyMobCombatant> = {}): LegacyMobCombatant {
  return {
    name: '田野鼠妖',
    baseName: 'Field Rat',
    level: 2,
    hp: 0,
    maxHp: 20,
    atk: 8,
    def: 2,
    elite: false,
    named: false,
    ...overrides,
  }
}

describe('legacy combat resolution', () => {
  it('settles a solo victory through a pure boundary', () => {
    const source = createLegacyCharacter({
      name: '青岚',
      race: 'Human',
      classId: 'Warrior',
      now: 1,
    })
    const firstQuest = (source.quests as Array<Record<string, any>>)[0]
    firstQuest.prog = firstQuest.count - 1
    const sourceSnapshot = structuredClone(source)

    const result = resolveLegacySoloVictory(
      source,
      mob(),
      { random: new SequenceRandom([0.5, 0.99, 0.99]) },
    )

    expect(result.questCompletions).toEqual(['Rat Problem'])
    expect(result.questXp).toBe(150)
    expect(result.questGold).toBe(20)
    expect(result.loot).toBeNull()
    expect(result.rune).toBeNull()
    expect((result.character.stats as Record<string, number>).kills).toBe(1)
    expect(Number(result.character.gold)).toBeGreaterThanOrEqual(21)
    expect(source).toEqual(sourceSnapshot)
  })

  it('leaves a corpse and returns a normal character to its bind point', () => {
    const source = createLegacyCharacter({
      name: '青岚',
      race: 'Human',
      classId: 'Warrior',
      now: 1,
    })
    source.gold = 100
    source.zone = 4
    source.bindZone = 1
    source.hp = 0
    source.xp = 80
    source.xpNext = 100
    source.dungeon = { active: true, autoLeaveOnDeath: true, checkpoint: 7, floor: 9 }

    const result = resolveLegacyDefeat(source, mob({ name: '赤焰妖将' }), 1234)

    expect(result.hardcore).toBe(false)
    expect(result.lostGold).toBe(15)
    expect(result.character).toMatchObject({
      gold: 85,
      zone: 1,
      hp: source.maxHp,
      mp: source.maxMp,
      xp: 70,
      corpse: { zone: 4, gold: 15, ts: 1234 },
      dungeon: { active: false, floor: 7 },
    })
  })

  it('signals permanent deletion for a hardcore death', () => {
    const source = createLegacyCharacter({
      name: '孤鸿',
      race: 'Human',
      classId: 'Warrior',
      hardcore: true,
      now: 1,
    })
    source.gold = 88
    source.zone = 3

    const result = resolveLegacyDefeat(source, mob({ name: '玄铁妖王' }), 5678)

    expect(result.hardcore).toBe(true)
    expect(result.character).toBeNull()
    expect(result.deathRecord).toMatchObject({
      name: '孤鸿',
      killer: '玄铁妖王',
      zone: 3,
      gold: 88,
      ts: 5678,
    })
  })

  it('preserves the frozen 60 percent flee threshold', () => {
    const source = createLegacyCharacter({
      name: '青岚',
      race: 'Human',
      classId: 'Warrior',
      now: 1,
    })
    const target = mob({ hp: 20 })

    expect(resolveLegacyFlee(source, target, new SequenceRandom([0.599])).escaped).toBe(true)
    const failed = resolveLegacyFlee(source, target, new SequenceRandom([0.6, 0.01]))
    expect(failed.escaped).toBe(false)
    expect(failed.strike).not.toBeNull()
  })
})
