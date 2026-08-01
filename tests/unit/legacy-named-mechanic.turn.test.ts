import { describe, expect, it } from 'vitest'

import type { RandomSource } from '../../src/game-core/rng'
import {
  resolveLegacySoloMobTurn,
  type LegacyMobCombatant,
} from '../../src/game-core/systems/combat'

function random(values: number[]): RandomSource {
  let index = 0
  const next = () => values[Math.min(index++, values.length - 1)] ?? 0
  return {
    next,
    integer: (minimum, maximum) => minimum + Math.floor(next() * (maximum - minimum + 1)),
    pick: <T>(items: readonly T[]) => items[Math.floor(next() * items.length)],
  }
}

const player = { name: '青岚', level: 10, hp: 100, maxHp: 100, atk: 20, def: 10 }
function mob(mechanic: 'enrage' | 'venom' | 'ward', overrides: Partial<LegacyMobCombatant> = {}): LegacyMobCombatant {
  return {
    name: '强敌', baseName: '强敌', level: 10, hp: 100, maxHp: 100,
    atk: 20, def: 10, elite: true, named: true,
    namedMechanic: { id: mechanic }, turnCount: 0, wardReady: false,
    enrageTriggered: false, ...overrides,
  }
}

describe('legacy named mechanic turn orchestration', () => {
  it('enrages before the retaliation and only once', () => {
    const result = resolveLegacySoloMobTurn({
      player,
      mob: mob('enrage', { hp: 40 }),
      random: random([0.9, 0, 0.9]),
    })
    expect(result.enrageTriggered).toBe(true)
    expect(result.mob.atk).toBe(29)
    expect(result.mob.enrageTriggered).toBe(true)
    expect(result.mob.turnCount).toBe(1)
    expect(result.strike).not.toBeNull()
  })

  it('can apply venom after a dodged retaliation, matching the frozen order', () => {
    const result = resolveLegacySoloMobTurn({
      player,
      mob: mob('venom'),
      random: random([0, 0.34, 0.5]),
    })
    expect(result.strike).toMatchObject({ hit: false, dodged: true })
    expect(result.venomDamage).toBe(11)
    expect(result.player.hp).toBe(89)
  })

  it('refreshes a ward after every third completed enemy turn', () => {
    const result = resolveLegacySoloMobTurn({
      player,
      mob: mob('ward', { turnCount: 2 }),
      random: random([0.9, 0, 0.9]),
    })
    expect(result.mob.turnCount).toBe(3)
    expect(result.wardRefreshed).toBe(true)
    expect(result.mob.wardReady).toBe(true)
  })

  it('increments the turn but skips retaliation, venom and ward refresh while stunned', () => {
    const source = mob('ward', { turnCount: 2 })
    const result = resolveLegacySoloMobTurn({ player, mob: source, random: random([0]), stunned: true })
    expect(result).toMatchObject({
      strike: null,
      stunned: true,
      venomDamage: 0,
      wardRefreshed: false,
      playerDied: false,
    })
    expect(result.mob.turnCount).toBe(3)
    expect(result.mob.wardReady).toBe(false)
    expect(source.turnCount).toBe(2)
    expect(player.hp).toBe(100)
  })
})
