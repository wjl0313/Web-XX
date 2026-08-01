import { describe, expect, it } from 'vitest'

import type { RandomSource } from '../../src/game-core/rng'
import {
  applyLegacyPartyHeal,
  buildLegacyPartyCombatants,
  getLegacyBestPartyHealTarget,
  getLegacyMercenaryHireCost,
  getLegacyMercenaryUpkeepCost,
  getLegacyPetModifiers,
  isLegacyPartyUnitFrontLine,
  normalizeLegacyPartyLineup,
  pickLegacyEnemyPartyTarget,
  resolveLegacyGroupMercenarySupport,
  resolveLegacyMainMercenarySupport,
  resolveLegacyPartyAllyActions,
  resolveLegacyMercTankRedirect,
  resolveLegacyPetAction,
  settleLegacyMercenaryUpkeep,
  settleLegacyPartyExperience,
  splitLegacyPartyGold,
} from '../../src/game-core/systems/combat'
import type {
  LegacyMobCombatant,
  LegacyPartyUnit,
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

function party(): LegacyPartyUnit[] {
  return [
    { unitId: 'player', type: 'player', isPlayer: true, name: '青岚', level: 20, hp: 100, maxHp: 100, atk: 50, def: 20 },
    { unitId: 'merc-main', type: 'merc-main', name: 'Caeryn', level: 20, hp: 80, maxHp: 80, def: 15 },
    { unitId: 'group-2', type: 'group', name: '丹霞', level: 18, hp: 50, maxHp: 70, def: 12 },
    { unitId: 'lfg-0', type: 'lfg', name: '远客', level: 21, hp: 60, maxHp: 60, def: 13 },
  ]
}

function mob(): LegacyMobCombatant {
  return {
    name: '狼妖',
    baseName: 'Gnoll Warrior',
    level: 20,
    hp: 500,
    maxHp: 500,
    atk: 40,
    def: 10,
    elite: false,
    named: false,
  }
}

function character(type = 'sellsword') {
  return {
    level: 20,
    hp: 100,
    maxHp: 100,
    mp: 20,
    maxMp: 100,
    mpRegen: 4,
    atk: 50,
    def: 20,
    faction: 0,
    gold: 1_000,
    mercenary: { type, gear: {}, actionReadyAt: 0, nextUpkeepAt: 0 },
    groupMercs: [],
    groupMercGear: [],
    pets: { active: 'none', owned: [] },
  }
}

describe('legacy party combat orchestration', () => {
  it('keeps the saved order, removes unavailable duplicates and caps the party at six', () => {
    const available = ['player', 'merc-main', 'merc-0', 'group-2', 'lfg-0', 'lfg-1', 'lfg-2']
    const lineup = normalizeLegacyPartyLineup(available, ['group-2', 'player', 'group-2', 'missing'])

    expect(lineup).toEqual(['group-2', 'player', 'merc-main', 'merc-0', 'lfg-0', 'lfg-1'])
    expect(isLegacyPartyUnitFrontLine(lineup, 'merc-main')).toBe(true)
    expect(isLegacyPartyUnitFrontLine(lineup, 'merc-0')).toBe(false)
  })

  it('builds a six-unit combat snapshot and preserves persistent companion HP ratios', () => {
    const leader = character('sellsword')
    Object.assign(leader, {
      name: '青岚',
      hardcore: false,
      group: [1],
      groupMercs: ['templar'],
      groupMercNames: ['丹医'],
      lfgParty: [{ name: '远客', level: 22, maxHp: 120, atk: 35, def: 15, hardcore: false }],
      partyLineup: ['group-1', 'player', 'merc-main', 'merc-0', 'lfg-0'],
      partyHp: { units: { 'merc-main': { hp: 40, maxHp: 80 } } },
    })
    const local = { ...character('none'), name: '丹霞', hardcore: false, hp: 75, maxHp: 90 }
    const built = buildLegacyPartyCombatants({ character: leader, slots: [leader, local], activeSlot: 0 })

    expect(built.lineup).toEqual(['group-1', 'player', 'merc-main', 'merc-0', 'lfg-0'])
    expect(built.units.map((unit) => unit.unitId)).toEqual(built.lineup)
    expect(built.units.find((unit) => unit.unitId === 'group-1')).toMatchObject({ name: '丹霞', hp: 75 })
    const main = built.units.find((unit) => unit.unitId === 'merc-main')!
    expect(main.hp / main.maxHp).toBeCloseTo(0.5, 1)
    expect(built.localGroupSlots).toEqual([1])
  })

  it('prefers the back line on a successful sneak and otherwise weights the front line', () => {
    const sneaked = pickLegacyEnemyPartyTarget(party(), new SequenceRandom([0, 0]))
    const front = pickLegacyEnemyPartyTarget(party(), new SequenceRandom([0.99, 0]))

    expect(sneaked?.unitId).toBe('group-2')
    expect(front?.unitId).toBe('player')
  })

  it('preserves front-line mercenary interception and party-aware revival healing', () => {
    const redirect = resolveLegacyMercTankRedirect(100, party(), new SequenceRandom([0, 0]))
    const wounded = party()
    wounded[2].hp = 0
    const target = getLegacyBestPartyHealTarget(wounded, 0.92, true)
    const healed = applyLegacyPartyHeal(wounded, target!.unitId, 14)

    expect(redirect).toEqual({ damage: 70, absorbed: 30 })
    expect(target?.unitId).toBe('group-2')
    expect(healed.healed).toBe(14)
    expect(healed.units[2].hp).toBe(14)
    expect(wounded[2].hp).toBe(0)
  })

  it('splits only with local grouped characters and keeps the remainder on the leader', () => {
    expect(splitLegacyPartyGold(101, ['group-2', 'group-4'], true)).toEqual({
      leader: 35,
      members: { 'group-2': 33, 'group-4': 33 },
    })
    expect(splitLegacyPartyGold(101, ['lfg-0'], false)).toEqual({ leader: 101, members: {} })
  })

  it('shares the same post-bonus XP with local alts while mercenaries still count in the divisor', () => {
    const leader = { ...character('none'), xp: 0, xpNext: 10_000, stats: { xpEarned: 0 }, aa: { points: 0, spent: 0, xpProgress: 0, xpAllocPct: 0 } }
    const alt = { ...character('none'), level: 51, xp: 0, xpNext: 10_000, stats: { xpEarned: 0 }, aa: { points: 0, spent: 0, xpProgress: 0, xpAllocPct: 100 } }
    const settled = settleLegacyPartyExperience(leader, [{ slot: 2, character: alt }], 100, 2)

    expect(settled.totalXpPerMember).toBe(85)
    expect(settled.leader.xp).toBe(85)
    expect(settled.localMembers[0].character.xp).toBe(85)
    expect(settled.localMembers[0].character.aa.xpProgress).toBe(0)
  })

  it('lets local and LFG allies use known healing or damage spells against party-aware targets', () => {
    const units = party()
    units[0].hp = 20
    const cleric = { cls: 'Cleric', name: '丹霞', level: 5, atk: 50, knownSpells: ['greater_heal'] }
    const healed = resolveLegacyPartyAllyActions(mob(), units, [{ unitId: 'group-2', character: cleric }], new SequenceRandom([0, 0]))

    expect(healed.actions[0]).toMatchObject({ unitId: 'group-2', kind: 'heal', spellId: 'greater_heal', targetId: 'player', healed: 45 })
    expect(healed.units[0].hp).toBe(65)

    const attacker = { ...cleric, knownSpells: ['holy_bolt'] }
    const damaged = resolveLegacyPartyAllyActions(mob(), party(), [{ unitId: 'group-2', character: attacker }], new SequenceRandom([0, 0, 0]))
    expect(damaged.actions[0]).toMatchObject({ kind: 'damage', spellId: 'holy_bolt', damage: 27 })
    expect(damaged.mob.hp).toBe(473)
  })
})

describe('legacy mercenary and pet rules', () => {
  it('keeps faction pricing and dismisses contracts after partially affordable overdue wages', () => {
    const source = character()
    source.mercenary.nextUpkeepAt = 1_000
    source.gold = 100

    expect(getLegacyMercenaryHireCost('sellsword', source)).toBe(540)
    expect(getLegacyMercenaryUpkeepCost('sellsword', source)).toBe(96)
    const settled = settleLegacyMercenaryUpkeep(source, 361_000)

    expect(settled).toMatchObject({ cyclesDue: 3, cyclesPaid: 1, goldPaid: 96, dismissedMain: true })
    expect(settled.character.gold).toBe(4)
    expect(settled.character.mercenary.type).toBe('none')
    expect(source.mercenary.type).toBe('sellsword')
  })

  it('runs main and group mercenary behavior without DOM or global combat state', () => {
    const main = resolveLegacyMainMercenarySupport(
      character('sellsword'),
      mob(),
      party(),
      new SequenceRandom([0, 0]),
      5_000,
    )
    expect(main).toMatchObject({ actorId: 'merc-main', kind: 'damage', damage: 56, acted: true })
    expect(main.mob.hp).toBe(444)
    expect(main.character.mercenary.actionReadyAt).toBe(7_200)

    const groupSource = character('none')
    groupSource.groupMercs = ['hexer']
    const grouped = resolveLegacyGroupMercenarySupport(
      groupSource,
      mob(),
      party().map((unit, index) => index === 1 ? { ...unit, unitId: 'merc-0', type: 'merc' as const } : unit),
      new SequenceRandom([0, 0]),
    )
    expect(grouped.actions[0]).toMatchObject({ actorId: 'merc-0', kind: 'debuff', damage: 43, atkDebuff: 1, defDebuff: 1 })
    expect(grouped.mob).toMatchObject({ hp: 457, atk: 39, def: 9 })
  })

  it('restores the hawk reward modifiers and wolf/spirit actions', () => {
    const hawk = character('none')
    hawk.pets = { active: 'hawk', owned: ['hawk'] }
    expect(getLegacyPetModifiers(hawk)).toEqual({ lootMult: 1.1, goldMult: 1.05, healMult: 1 })

    const wolf = character('none')
    wolf.pets = { active: 'wolf', owned: ['wolf'] }
    const attack = resolveLegacyPetAction(wolf, mob(), party(), new SequenceRandom([0]))
    expect(attack).toMatchObject({ kind: 'damage', damage: 30, acted: true })

    const spirit = character('none')
    spirit.pets = { active: 'spirit', owned: ['spirit'] }
    const wounded = party()
    wounded[0].hp = 20
    const heal = resolveLegacyPetAction(spirit, mob(), wounded, new SequenceRandom([0]))
    expect(heal).toMatchObject({ kind: 'heal', targetId: 'player', healed: 4, acted: true })
    expect(heal.character.hp).toBe(24)
  })
})
