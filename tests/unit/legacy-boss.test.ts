import { describe, expect, it } from 'vitest'

import type { RandomSource } from '../../src/game-core/rng'
import {
  createLegacyBossEncounter,
  getLegacyBossForZone,
  getLegacyBossReadyAt,
  resolveLegacyBossVictoryBonus,
  type LegacyMobCombatant,
} from '../../src/game-core/systems/combat'

const zeroRandom: RandomSource = {
  next: () => 0,
  integer: (minimum) => minimum,
  pick: <T>(items: readonly T[]) => items[0],
}

describe('legacy zone bosses', () => {
  it('uses the frozen zone table and the frozen ward fallback for later zones', () => {
    expect(getLegacyBossForZone(0)).toEqual({
      name: 'Vermin Tyrant',
      mob: 'Field Rat',
      mechanic: 'enrage',
    })
    expect(getLegacyBossForZone(20)).toMatchObject({
      name: 'Champion of Ironskull Keep',
      mob: 'Ironskull Legionnaire',
      mechanic: 'ward',
    })
  })

  it('enforces current encounter, dungeon and per-zone cooldown gates', () => {
    expect(createLegacyBossEncounter({ zoneIndex: 0, playerLevel: 10, hasActiveEncounter: true }).failure).toBe('active-encounter')
    expect(createLegacyBossEncounter({ zoneIndex: 0, playerLevel: 10, dungeonActive: true }).failure).toBe('dungeon-active')
    expect(getLegacyBossReadyAt(0, { 0: 5_000 })).toBe(5_000)
    expect(createLegacyBossEncounter({
      zoneIndex: 0,
      playerLevel: 10,
      bossCooldowns: { 0: 5_000 },
      now: 4_999,
    })).toMatchObject({ spawned: false, failure: 'cooldown', readyAt: 5_000 })
  })

  it('creates the exact frozen boss stat formula and named mechanic state', () => {
    const result = createLegacyBossEncounter({ zoneIndex: 0, playerLevel: 10, now: 5_000 })
    expect(result).toMatchObject({
      spawned: true,
      failure: null,
      mob: {
        name: '[Boss] Vermin Tyrant',
        baseName: 'Field Rat',
        level: 12,
        hp: 2160,
        maxHp: 2160,
        atk: 63,
        def: 25,
        boss: true,
        elite: true,
        named: true,
        namedMechanic: { id: 'enrage' },
        turnCount: 0,
        wardReady: false,
      },
    })
  })

  it('sets the 30-minute cooldown and grants guaranteed plus rolled legendary loot', () => {
    const defeated: LegacyMobCombatant = {
      name: '[Boss] Vermin Tyrant', baseName: 'Field Rat', level: 12,
      hp: 0, maxHp: 2160, atk: 63, def: 25, elite: true, named: true, boss: true,
    }
    const source = { zone: 0, inventory: [], bossCooldowns: {} }
    const result = resolveLegacyBossVictoryBonus(source, defeated, zeroRandom, 10_000)

    expect(result.cooldownUntil).toBe(1_810_000)
    expect(result.loot).toHaveLength(2)
    expect(result.character.bossCooldowns).toEqual({ 0: 1_810_000 })
    expect(result.character.inventory).toHaveLength(2)
    expect((result.loot[0] as Record<string, unknown>).quality).toBe('Legendary')
    expect(source.inventory).toEqual([])
  })
})
