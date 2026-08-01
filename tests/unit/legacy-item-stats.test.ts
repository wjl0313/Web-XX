import { describe, expect, it } from 'vitest'

import {
  getLegacyActiveSetBonusStats,
  getLegacyEquippedRunewordEffects,
  getLegacyItemEffectiveStats,
  getLegacyItemSellValue,
  getLegacyRunewordBonusStats,
  getLegacyRunewordTier,
  getLegacyWeaponProc,
  rollLegacyItemVariant,
} from '../../src/game-core/systems/equipment'
import type { RandomSource } from '../../src/game-core/rng'

class FixedRandom implements RandomSource {
  constructor(private readonly value = 0.5) {}
  next(): number { return this.value }
  integer(min: number, max: number): number { return min + Math.floor(this.value * (max - min + 1)) }
  chance(probability: number): boolean { return this.value < probability }
  pick<T>(items: readonly T[]): T { return items[this.integer(0, items.length - 1)] }
}

describe('legacy equipment stats and item variants', () => {
  it('scales base, rolled, quality, rune and runeword stats together', () => {
    const stats = getLegacyItemEffectiveStats({
      base: 'Worn Shortsword',
      quality: 'Epic',
      ilvl: 10,
      rolls: { atk: 4, str: 2 },
      sockets: ['Rune: El'],
      runeword: { bonus: { atk: 12, hp: 20 }, xp: 560 },
    })

    expect(stats).not.toBeNull()
    expect(stats?.atk).toBeGreaterThan(7)
    expect(stats?.str).toBe(3)
    expect(stats?.hp).toBeGreaterThan(12)
    expect(stats?.atk).toBeGreaterThan(stats?.def ?? 0)
  })

  it('keeps runeword evolution thresholds and equipped effects', () => {
    expect(getLegacyRunewordTier(0)).toBe(1)
    expect(getLegacyRunewordTier(560)).toBe(3)
    expect(getLegacyRunewordBonusStats({ bonus: { atk: 10 }, xp: 560 }).atk).toBe(14)

    const effects = getLegacyEquippedRunewordEffects({
      weapon: { runeword: { bonus: { crit: 0.05, goldFind: 0.2 }, xp: 560 } },
    })
    expect(effects.crit).toBeCloseTo(0.07)
    expect(effects.goldFind).toBeCloseTo(0.28)
  })

  it('calculates set bonuses and weapon proc definitions without DOM state', () => {
    const set = getLegacyActiveSetBonusStats({
      weapon: 'Worn Shortsword',
      feet: 'Rawhide Boots',
      charm: 'Gnoll Fang Earring',
    })
    expect(set.names).toContain('Crypt Stalker')
    expect(set.atk).toBe(3)
    expect(getLegacyWeaponProc('Worn Shortsword')?.type).toBe('damage')
  })

  it('creates deterministic forced-quality variants', () => {
    const epic = rollLegacyItemVariant('Worn Shortsword', 'loot', {
      random: new FixedRandom(0.5),
      forceLevel: 20,
      forceRarity: 'epic',
    })
    expect(typeof epic).toBe('object')
    expect(epic).toMatchObject({ base: 'Worn Shortsword', quality: 'Epic', ilvl: 20, levelReq: 18 })

    const rare = rollLegacyItemVariant('Worn Shortsword', 'loot', {
      random: new FixedRandom(0.5),
      forceLevel: 20,
      forceRarity: 'rare',
    })
    expect(rare).toMatchObject({ quality: 'Rare', ilvl: 20 })
  })

  it('keeps normal loot as a base string when magic does not roll', () => {
    const item = rollLegacyItemVariant('Worn Shortsword', 'loot', {
      random: new FixedRandom(0.99),
      forceLevel: 10,
    })
    expect(item).toBe('Worn Shortsword')
  })

  it('uses effective stats and quality in sell values', () => {
    const normal = getLegacyItemSellValue('Worn Shortsword', new FixedRandom(0))
    const epic = getLegacyItemSellValue({ base: 'Worn Shortsword', quality: 'Epic', ilvl: 10, rolls: { atk: 4 } }, new FixedRandom(0))
    expect(normal).toBeGreaterThan(0)
    expect(epic).toBeGreaterThan(normal)
  })
})
