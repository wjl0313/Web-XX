import { describe, expect, it } from 'vitest'

import {
  applyLegacyExperience,
  getLegacyAaXpPerPoint,
  getLegacyHpPerLevel,
} from '../../src/game-core/systems/progression'

const character = {
  name: '测试道友', cls: 'Warrior', level: 1, xp: 90, xpNext: 100,
  hp: 120, maxHp: 120, mp: 40, maxMp: 40, atk: 12, def: 10,
  abilities: {}, stats: {}, aa: { points: 0, spent: 0, xpProgress: 0, xpAllocPct: 0, nodes: {} },
}

describe('legacy progression', () => {
  it('applies exact level gains and refreshes resources', () => {
    const result = applyLegacyExperience(character, 20)
    expect(result.levelsGained).toBe(1)
    expect(result.character.level).toBe(2)
    expect(result.character.xp).toBe(10)
    expect(result.character.hp).toBe(result.character.maxHp)
    expect(result.character.maxHp).toBe(120 + getLegacyHpPerLevel('Warrior', 2))
  })

  it('keeps group sharing and AA allocation rules', () => {
    const grouped = applyLegacyExperience(character, 100, { groupSize: 2, groupShareSize: 2 })
    expect(grouped.totalXp).toBe(85)

    const highLevel = { ...character, level: 51, xp: 0, xpNext: 999_999_999, aa: { points: 0, spent: 0, xpProgress: 0, xpAllocPct: 50, nodes: {} } }
    const result = applyLegacyExperience(highLevel, 1000)
    expect(result.regularXp).toBe(500)
    expect(result.aaXp).toBe(500)
    expect(getLegacyAaXpPerPoint(result.character)).toBeGreaterThan(0)
  })
})
