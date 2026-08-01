import { describe, expect, it } from 'vitest'

import type { RandomSource } from '../../src/game-core/rng'
import { createLegacyCharacter } from '../../src/game-core/save'
import {
  addLegacyItemSocket,
  autoEquipLegacyLootItem,
  destroyLegacySocketedRune,
  getLegacyItemEffectiveStats,
  getLegacyReforgeCost,
  insertLegacyRune,
  reforgeLegacyItemStat,
} from '../../src/game-core/systems/equipment'

const random = (value: number): RandomSource => ({
  next: () => value,
  integer: (min, max) => min + Math.floor(value * (max - min + 1)),
  chance: (probability) => value < probability,
  pick: <T>(items: readonly T[]) => items[Math.floor(value * items.length)],
})

function character() {
  const value = createLegacyCharacter({ name: '青岚', race: 'Human', classId: 'Warrior', now: 1 })
  value.gold = 100_000
  return value
}

describe('legacy equipment customization', () => {
  it('adds sockets using the frozen cost and keeps equipped stats synchronized', () => {
    const source = character()
    const weapon = { base: 'Worn Shortsword', name: 'Worn Shortsword', rolls: { atk: 3 }, quality: 'Magic' }
    source.equipment = { ...(source.equipment as object), weapon }
    source.atk = Number(source.atk) + getLegacyItemEffectiveStats(weapon)!.atk

    const result = addLegacyItemSocket(source, { kind: 'equipment', slot: 'weapon' })

    expect(result.applied).toBe(true)
    expect(result.cost).toBe(65 + Number(source.level) * 4 + 20)
    expect(result.item).toMatchObject({ maxSockets: 1, sockets: [null] })
    expect(result.character.atk).toBe(source.atk)
    expect((source.equipment as Record<string, unknown>).weapon).toBe(weapon)
  })

  it('consumes stash runes first and seals a matching runeword', () => {
    const source = character()
    source.inventory = [{ base: 'Worn Shortsword', maxSockets: 2, sockets: ['Rune: El', null], quality: 'Magic', rolls: {} }, 'Rune: Tir']
    source.runeStash = ['Rune: Tir']

    const result = insertLegacyRune(source, { kind: 'inventory', index: 0 }, 'Rune: Tir')

    expect(result.applied).toBe(true)
    expect(result.discoveredRuneword).toBe('Runeword: Steel')
    expect(result.item).toMatchObject({ quality: 'Runeword', name: 'Runeword: Steel' })
    expect(result.character.runeStash).toEqual([])
    expect(result.character.inventory).toHaveLength(2)
    expect(source.runeStash).toEqual(['Rune: Tir'])
  })

  it('destroys ordinary socketed runes but protects locked and runeword items', () => {
    const source = character()
    source.inventory = [{ base: 'Worn Shortsword', maxSockets: 1, sockets: ['Rune: El'], quality: 'Magic', rolls: {} }]
    const removed = destroyLegacySocketedRune(source, { kind: 'inventory', index: 0 }, 0)
    expect(removed.applied).toBe(true)
    expect(removed.item).toMatchObject({ sockets: [null] })

    source.inventory = [{ base: 'Worn Shortsword', maxSockets: 1, sockets: ['Rune: El'], quality: 'Magic', rolls: {}, locked: true }]
    expect(destroyLegacySocketedRune(source, { kind: 'inventory', index: 0 }, 0).failure).toBe('locked')
  })

  it('uses the old weighted score and quality tie-break for auto equip', () => {
    const source = character()
    const oldItem = { base: 'Worn Shortsword', quality: 'Magic', rolls: { atk: 1 } }
    const nextItem = { base: 'Worn Shortsword', quality: 'Rare', rolls: { def: 1 } }
    source.equipment = { ...(source.equipment as object), weapon: oldItem }
    source.atk = Number(source.atk) + getLegacyItemEffectiveStats(oldItem)!.atk

    const result = autoEquipLegacyLootItem(source, nextItem, { upgrades: true, metric: 'quality', sellDisplaced: false })

    expect(result.applied).toBe(true)
    expect(result.displaced).toEqual(oldItem)
    expect(result.character.inventory).toContainEqual(oldItem)
    expect(result.character.equipment).toMatchObject({ weapon: nextItem })
  })

  it('does not auto equip into an empty slot unless that rule is enabled', () => {
    const source = character()
    expect(autoEquipLegacyLootItem(source, 'Worn Shortsword').applied).toBe(false)
    expect(autoEquipLegacyLootItem(source, 'Worn Shortsword', { emptySlots: true }).applied).toBe(true)
  })

  it('reforges one existing roll with capped price growth and updates equipped stats', () => {
    const source = character()
    const weapon = { base: 'Worn Shortsword', quality: 'Rare', rolls: { atk: 2 }, reforgeCount: 0 }
    source.equipment = { ...(source.equipment as object), weapon }
    source.atk = Number(source.atk) + getLegacyItemEffectiveStats(weapon)!.atk
    const cost = getLegacyReforgeCost(weapon, Number(source.level))

    const result = reforgeLegacyItemStat(source, { kind: 'equipment', slot: 'weapon' }, 'atk', random(1), 1)

    expect(result.applied).toBe(true)
    expect(result.cost).toBe(cost)
    expect((result.item as Record<string, any>).rolls.atk).toBeGreaterThanOrEqual(2)
    expect((result.item as Record<string, any>).reforgeCount).toBe(1)
    expect(result.character.gold).toBe(Number(source.gold) - cost)
    expect(result.character.atk).toBeGreaterThanOrEqual(source.atk)
  })
})
