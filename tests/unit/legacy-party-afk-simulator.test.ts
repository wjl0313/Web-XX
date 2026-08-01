import { describe, expect, it } from 'vitest'

import type { RandomSource } from '../../src/game-core/rng'
import { simulateLegacyPartyAfkReturn } from '../../src/game-core/systems/afk'

const fixedRandom: RandomSource = {
  next: () => 0,
  integer: (minimum) => minimum,
  pick: <T>(items: readonly T[]) => items[0],
}

function hero(name: string, overrides: Record<string, unknown> = {}) {
  return {
    name, cls: 'Warrior', race: 'Human', level: 1, xp: 0, xpNext: 100,
    hp: 120, maxHp: 120, mp: 40, maxMp: 40, atk: 12, def: 10,
    gold: 0, faction: 0, zone: 0, inventory: [], runeStash: [], equipment: {},
    abilities: {}, stats: {}, aa: { points: 0, spent: 0, xpProgress: 0, xpAllocPct: 0, nodes: {} },
    quests: [], group: [], partyLineup: [], groupSplitGold: true, hardcore: false,
    ...overrides,
  }
}

describe('legacy party AFK simulation', () => {
  it('uses the frozen party share and grants equal XP to local grouped characters', () => {
    const slots = [hero('队长', { group: [1] }), hero('队友')]
    const result = simulateLegacyPartyAfkReturn(slots, 0, {
      elapsedMs: 3_600,
      random: fixedRandom,
      now: 10_000,
    })

    expect(result.partySize).toBe(2)
    expect(result.summary.applied).toBe(true)
    expect(result.summary.xp).toBeGreaterThan(0)
    expect(result.localMemberAwards).toEqual([
      { slot: 1, xp: result.summary.xp, levelsGained: expect.any(Number) },
    ])
    expect(Number(result.slots[0]!.stats && (result.slots[0]!.stats as Record<string, number>).xpEarned)).toBe(result.summary.xp)
    expect(Number(result.slots[1]!.stats && (result.slots[1]!.stats as Record<string, number>).xpEarned)).toBe(result.summary.xp)
  })

  it('keeps offline gold on the active character even when online split gold is enabled', () => {
    const result = simulateLegacyPartyAfkReturn([
      hero('队长', { group: [1], groupSplitGold: true }),
      hero('队友', { gold: 7 }),
    ], 0, { elapsedMs: 3_600, random: fixedRandom, now: 10_000 })

    expect(result.summary.gold).toBeGreaterThan(0)
    expect(result.slots[0]!.gold).toBe(result.summary.gold)
    expect(result.slots[1]!.gold).toBe(7)
  })

  it('excludes opposite-hardcore and unavailable members without mutating source slots', () => {
    const slots = [
      hero('队长', { group: [1, 2, 99] }),
      hero('生死道队友', { hardcore: true }),
      null,
    ]
    const snapshot = structuredClone(slots)
    const result = simulateLegacyPartyAfkReturn(slots, 0, {
      elapsedMs: 3_600,
      random: fixedRandom,
      now: 10_000,
    })

    expect(result.partySize).toBe(1)
    expect(result.localMemberAwards).toEqual([])
    expect(slots).toEqual(snapshot)
  })

  it('rejects an invalid active slot instead of settling rewards into the wrong character', () => {
    expect(() => simulateLegacyPartyAfkReturn([hero('唯一角色')], 2, {
      elapsedMs: 3_600,
      random: fixedRandom,
    })).toThrow('离线队伍结算缺少有效的当前角色槽位')
  })
})
