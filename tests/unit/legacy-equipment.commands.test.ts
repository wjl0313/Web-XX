import { describe, expect, it } from 'vitest'

import { createLegacyCharacter } from '../../src/game-core/save'
import {
  equipLegacyInventoryItem,
  getLegacyItemEffectiveStats,
  unequipLegacyItem,
} from '../../src/game-core/systems/equipment'

describe('legacy equipment commands', () => {
  it('equips through a pure boundary without inventing a level requirement rule', () => {
    const source = createLegacyCharacter({
      name: '青岚',
      race: 'Human',
      classId: 'Warrior',
      now: 1,
    })
    const item = { base: 'Worn Shortsword', levelReq: 99 }
    source.inventory = [item]
    const attackBefore = Number(source.atk)
    const abilitiesBefore = structuredClone(source.abilities)
    const itemAttack = getLegacyItemEffectiveStats(item)!.atk

    const result = equipLegacyInventoryItem(source, 0)

    expect(result.applied).toBe(true)
    expect(result.failure).toBeNull()
    expect(result.character.equipment).toMatchObject({ weapon: item })
    expect(result.character.inventory).toEqual([])
    expect(Number(result.character.atk)).toBe(attackBefore + itemAttack)
    expect(result.character.abilities).toEqual(abilitiesBefore)
    expect(source.inventory).toEqual([item])
  })

  it('returns displaced equipment to the inventory using the frozen ordering', () => {
    const source = createLegacyCharacter({
      name: '青岚',
      race: 'Human',
      classId: 'Warrior',
      now: 1,
    })
    const oldItem = 'Rusty Dagger'
    const nextItem = 'Worn Shortsword'
    const oldAttack = getLegacyItemEffectiveStats(oldItem)!.atk
    const nextAttack = getLegacyItemEffectiveStats(nextItem)!.atk
    source.equipment = { ...(source.equipment as object), weapon: oldItem }
    source.inventory = [nextItem]
    source.atk = Number(source.atk) + oldAttack

    const result = equipLegacyInventoryItem(source, 0)

    expect(result.displaced).toBe(oldItem)
    expect(result.character.inventory).toEqual([oldItem])
    expect(result.character.equipment).toMatchObject({ weapon: nextItem })
    expect(Number(result.character.atk)).toBe(Number(source.atk) - oldAttack + nextAttack)
  })

  it('unequips into the inventory without mutating the input save', () => {
    const source = createLegacyCharacter({
      name: '青岚',
      race: 'Human',
      classId: 'Warrior',
      now: 1,
    })
    const item = 'Worn Shortsword'
    const itemAttack = getLegacyItemEffectiveStats(item)!.atk
    source.equipment = { ...(source.equipment as object), weapon: item }
    source.atk = Number(source.atk) + itemAttack

    const result = unequipLegacyItem(source, 'weapon')

    expect(result.applied).toBe(true)
    expect(result.character.equipment).toMatchObject({ weapon: null })
    expect(result.character.inventory).toEqual([item])
    expect(Number(result.character.atk)).toBe(Number(source.atk) - itemAttack)
    expect((source.equipment as Record<string, unknown>).weapon).toBe(item)
  })
})
