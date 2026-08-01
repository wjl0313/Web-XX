import { describe, expect, it } from 'vitest'

import { createSeededRandom } from '../../src/game-core/rng'
import { simulateLegacyAfkReturn } from '../../src/game-core/systems/afk'
import type { RandomSource } from '../../src/game-core/rng'

const fixedRandom = (value: number): RandomSource => ({
  next: () => value,
  integer: (min, max) => min + Math.floor(value * (max - min + 1)),
  chance: (probability) => value < probability,
  pick: <T>(items: readonly T[]) => items[Math.floor(value * items.length)],
})

function character() {
  return {
    name: '测试道友', cls: 'Warrior', race: 'Human', level: 1, xp: 0, xpNext: 100,
    hp: 120, maxHp: 120, mp: 40, maxMp: 40, atk: 12, def: 10,
    gold: 0, faction: 0, zone: 0, inventory: [], runeStash: [], equipment: {},
    abilities: {}, stats: {}, aa: { points: 0, spent: 0, xpProgress: 0, xpAllocPct: 0, nodes: {} },
    quests: [{ name: '鼠患', mob: 'Field Rat', count: 1, prog: 0, done: false, xp: 10, gold: 5 }],
  }
}

describe('legacy AFK simulator', () => {
  it('ignores returns shorter than three ticks', () => {
    const source = character()
    const result = simulateLegacyAfkReturn(source, { elapsedMs: 2_000, random: fixedRandom(0), now: 10_000 })
    expect(result.summary.applied).toBe(false)
    expect(result.character).toEqual(source)
  })

  it('simulates fights, quest progress, loot, runes, faction and level-up', () => {
    const result = simulateLegacyAfkReturn(character(), { elapsedMs: 3_600, random: fixedRandom(0), now: 10_000 })
    expect(result.summary).toMatchObject({ applied: true, fights: 1, questCompletions: 1, loot: 1, runes: 1, faction: 1 })
    expect(result.character.quests[0].done).toBe(true)
    expect(result.character.inventory).toHaveLength(1)
    expect(result.character.runeStash).toEqual(['Rune: El'])
    expect(result.character.level).toBe(2)
    expect(result.character.lastAfkAt).toBe(10_000)
  })

  it('supports deterministic auto-sell and caps long absences', () => {
    const first = simulateLegacyAfkReturn(character(), {
      elapsedMs: 10_000_000,
      random: createSeededRandom('afk-cap'),
      now: 20_000,
      shouldAutoSell: () => true,
    })
    const second = simulateLegacyAfkReturn(character(), {
      elapsedMs: 10_000_000,
      random: createSeededRandom('afk-cap'),
      now: 20_000,
      shouldAutoSell: () => true,
    })
    expect(first).toEqual(second)
    expect(first.summary.capped).toBe(true)
    expect(first.summary.simulatedTicks).toBe(1800)
    expect(first.summary.fights).toBe(504)
    expect(first.summary.sold).toBeGreaterThan(0)
    expect(first.character.inventory).toHaveLength(0)
  })
})
