import { describe, expect, it } from 'vitest'

import type { RandomSource } from '../../src/game-core/rng'
import {
  executeLegacyAutoCast,
  planLegacyAutoCast,
} from '../../src/game-core/systems/spells'

const random: RandomSource = {
  next: () => 0,
  integer: (minimum) => minimum,
  pick: <T>(values: readonly T[]) => values[0],
}

const caster = {
  name: '青岚', level: 20, hp: 100, maxHp: 100, mp: 100, maxMp: 100,
  atk: 20, def: 10, spellCooldowns: {},
}
const target = {
  name: '妖兽', baseName: '妖兽', level: 20, hp: 200, maxHp: 200,
  atk: 20, def: 10, elite: false, named: false,
}

describe('legacy automatic spell planner', () => {
  it('selects the first enabled, ready, affordable memorized spell', () => {
    const plan = planLegacyAutoCast({
      classId: 'Wizard',
      memorizedSpells: ['fireball', 'ice_comet', 'clarity'],
      autoSkillSlots: [false, true, true],
      maxSlots: 3,
      caster: { ...caster, spellCooldowns: { ice_comet: 5_000 } },
      target,
      now: 1_000,
    })

    expect(plan.selectedSlot).toBe(2)
    expect(plan.spell?.id).toBe('clarity')
    expect(plan.attempts).toEqual([
      { slotIndex: 0, spellId: 'fireball', reason: 'slot-disabled' },
      { slotIndex: 1, spellId: 'ice_comet', reason: 'cooldown' },
      { slotIndex: 2, spellId: 'clarity', reason: null },
    ])
  })

  it('reports every skip reason without consuming random values or mutating the caster', () => {
    let randomCalls = 0
    const source = { ...caster, mp: 0 }
    const result = executeLegacyAutoCast({
      classId: 'Wizard',
      memorizedSpells: [null, 'missing', 'fireball'],
      maxSlots: 3,
      caster: source,
      target,
      random: { ...random, next: () => { randomCalls += 1; return 0 } },
      now: 1_000,
    })

    expect(result.cast).toBeNull()
    expect(result.plan.attempts.map((attempt) => attempt.reason)).toEqual([
      'empty-slot', 'unknown-spell', 'insufficient-mana',
    ])
    expect(randomCalls).toBe(0)
    expect(source.mp).toBe(0)
  })

  it('requires an enemy target but allows self restoration spells without one', () => {
    const plan = planLegacyAutoCast({
      classId: 'Wizard',
      memorizedSpells: ['fireball', 'clarity'],
      caster,
      target: null,
      now: 1_000,
    })
    expect(plan.selectedSlot).toBe(1)
    expect(plan.attempts[0].reason).toBe('missing-target')
  })

  it('executes only the selected spell and returns its updated snapshots', () => {
    const result = executeLegacyAutoCast({
      classId: 'Wizard',
      memorizedSpells: ['fireball', 'ice_comet'],
      caster,
      target,
      random,
      now: 1_000,
    })

    expect(result.plan.selectedSlot).toBe(0)
    expect(result.cast).toMatchObject({ success: true, spell: { id: 'fireball' } })
    expect(result.cast!.caster.mp).toBeLessThan(caster.mp)
    expect(result.cast!.target!.hp).toBeLessThan(target.hp)
    expect(caster.mp).toBe(100)
    expect(target.hp).toBe(200)
  })

  it('honors the master automatic-skill toggle', () => {
    expect(planLegacyAutoCast({
      classId: 'Wizard',
      memorizedSpells: ['fireball'],
      autoUseSkills: false,
      caster,
      target,
    })).toEqual({
      selectedSlot: null,
      spell: null,
      attempts: [{ slotIndex: -1, spellId: null, reason: 'auto-disabled' }],
    })
  })
})
