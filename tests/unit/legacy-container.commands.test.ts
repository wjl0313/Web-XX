import { describe, expect, it } from 'vitest'

import { createLegacyCharacter } from '../../src/game-core/save'
import {
  getLegacyBagLayout,
  getLegacyInventoryCapacity,
  installLegacyContainer,
  normalizeLegacyBags,
  purchaseLegacyContainer,
} from '../../src/game-core/systems/equipment'

function character() {
  const value = createLegacyCharacter({ name: '青岚', race: 'Human', classId: 'Warrior', now: 1 })
  value.gold = 10_000
  return value
}

describe('legacy container commands', () => {
  it('normalizes exactly four real bags and exposes overflow without discarding items', () => {
    const source = character()
    source.bags = ['Unknown']
    source.inventory = Array.from({ length: 42 }, (_, index) => `item-${index}`)
    expect(normalizeLegacyBags(source.bags)).toEqual(['Worn Pouch', 'Worn Pouch', 'Worn Pouch', 'Worn Pouch'])
    expect(getLegacyInventoryCapacity(source)).toBe(40)
    expect(getLegacyBagLayout(source).at(-1)).toMatchObject({ name: 'Overflow', slots: 2, overflow: true })
  })

  it('purchases non-starter containers with merchant price scaling', () => {
    const source = character()
    const result = purchaseLegacyContainer(source, 'Small Bag', 1.2)
    expect(result.applied).toBe(true)
    expect(result.cost).toBe(300)
    expect(result.character.inventory).toContain('Small Bag')
    expect(purchaseLegacyContainer(source, 'Worn Pouch').failure).toBe('starter-only')
  })

  it('installs a container and returns a displaced non-starter bag', () => {
    const source = character()
    source.bags = ['Small Bag', 'Worn Pouch', 'Worn Pouch', 'Worn Pouch']
    source.inventory = ["Traveler's Pack"]
    const result = installLegacyContainer(source, 0, 0)
    expect(result.applied).toBe(true)
    expect(result.character.bags?.[0]).toBe("Traveler's Pack")
    expect(result.character.inventory).toEqual(['Small Bag'])
    expect(source.inventory).toEqual(["Traveler's Pack"])
  })

  it('blocks capacity-reducing replacement when current contents would no longer fit', () => {
    const source = character()
    source.bags = ["Traveler's Pack", 'Worn Pouch', 'Worn Pouch', 'Worn Pouch']
    source.inventory = ['Small Bag', ...Array.from({ length: 59 }, (_, index) => `item-${index}`)]
    const result = installLegacyContainer(source, 0, 0)
    expect(result.failure).toBe('insufficient-capacity')
    expect(result.character).toBe(source)
  })
})
