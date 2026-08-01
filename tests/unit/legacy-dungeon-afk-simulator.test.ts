import { describe, expect, it } from 'vitest'

import type { RandomSource } from '../../src/game-core/rng'
import { createLegacyCharacter } from '../../src/game-core/save'
import {
  getLegacyDungeonFloorMultiplier,
  simulateLegacyAfkReturn,
} from '../../src/game-core/systems/afk'

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

function dungeonCharacter() {
  const character = createLegacyCharacter({
    name: '青岚',
    race: 'Human',
    classId: 'Warrior',
    now: 1,
  })
  character.level = 30
  character.afkGoal = 'dungeon'
  character.afkEnabled = true
  character.dungeon = {
    active: true,
    floor: 1,
    best: 1,
    checkpoint: 1,
    marks: 0,
    essence: 0,
    bossesCleared: 0,
    relicRanks: {},
    theme: 'abyssal',
    modifier: 'balanced',
    autoDescendLimit: 6,
  }
  return character
}

describe('legacy dungeon AFK simulator', () => {
  it('keeps the logarithmic floor multiplier boundary', () => {
    expect(getLegacyDungeonFloorMultiplier(1)).toBe(1)
    expect(getLegacyDungeonFloorMultiplier(10)).toBeGreaterThan(1)
    expect(getLegacyDungeonFloorMultiplier(100)).toBeGreaterThan(getLegacyDungeonFloorMultiplier(10))
  })

  it('settles floors, fifth-floor boss rewards and checkpoint deterministically', () => {
    const source = dungeonCharacter()
    const snapshot = structuredClone(source)
    const run = () => simulateLegacyAfkReturn(source, {
      elapsedMs: 120_000,
      random: new SequenceRandom([0.99]),
      now: Date.parse('2026-08-01T00:00:00Z'),
    })

    const first = run()
    const second = run()

    expect(first).toEqual(second)
    expect(first.summary).toMatchObject({
      applied: true,
      goal: 'dungeon',
      dungeonFloors: 6,
      dungeonStartFloor: 1,
      dungeonEndFloor: 7,
      dungeonBosses: 1,
      requiresDungeonSimulation: false,
    })
    expect(first.summary.dungeonMarks).toBeGreaterThanOrEqual(6)
    expect(first.summary.dungeonEssence).toBeGreaterThan(0)
    expect(first.character.dungeon).toMatchObject({
      floor: 7,
      checkpoint: 6,
      bossesCleared: 1,
    })
    expect((first.character.inventory as unknown[]).length).toBeGreaterThanOrEqual(1)
    expect(source).toEqual(snapshot)
  })

  it('applies the shared experience multiplier exactly once', () => {
    const source = dungeonCharacter()
    const options = {
      elapsedMs: 120_000,
      now: Date.parse('2026-08-01T00:00:00Z'),
    }
    const normal = simulateLegacyAfkReturn(source, {
      ...options,
      random: new SequenceRandom([0.99]),
    })
    const doubled = simulateLegacyAfkReturn(source, {
      ...options,
      modifiers: { xpMultiplier: 2 },
      random: new SequenceRandom([0.99]),
    })

    expect(doubled.summary.xp).toBe(normal.summary.xp * 2)
    expect(doubled.character.stats.xpEarned).toBe(normal.character.stats.xpEarned * 2)
  })
})
