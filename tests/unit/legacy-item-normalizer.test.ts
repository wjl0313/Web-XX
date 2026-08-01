import { describe, expect, it } from 'vitest'

import {
  getLegacyItemBaseName,
  getLegacySocketCapacity,
  normalizeLegacyEquipmentEntry,
  normalizeLegacyInventoryEntry,
} from '../../src/game-core/systems/equipment'

describe('legacy item normalizer', () => {
  it('reads base names and socket capacities from generated item data', () => {
    expect(getLegacyItemBaseName('Rusty Dagger')).toBe('Rusty Dagger')
    expect(getLegacyItemBaseName({ base: 'Knight Chestplate' })).toBe('Knight Chestplate')
    expect(getLegacyItemBaseName({})).toBe('')
    expect(getLegacyItemBaseName(null)).toBe('')
    expect(getLegacySocketCapacity('Rusty Dagger')).toBe(2)
    expect(getLegacySocketCapacity('Rawhide Boots')).toBe(1)
    expect(getLegacySocketCapacity('Missing')).toBe(0)
  })

  it('preserves legacy string entries and rejects invalid objects', () => {
    expect(normalizeLegacyInventoryEntry('Unknown Material')).toBe('Unknown Material')
    expect(normalizeLegacyInventoryEntry(null)).toBeNull()
    expect(normalizeLegacyInventoryEntry([])).toBeNull()
    expect(normalizeLegacyInventoryEntry({ name: 'No base' })).toBeNull()
  })

  it('keeps flagged unknown entries but collapses plain unknown objects', () => {
    expect(normalizeLegacyInventoryEntry({ base: 'Quest Token' })).toBe('Quest Token')
    expect(
      normalizeLegacyInventoryEntry({ base: 'Quest Token', name: ' Kept ', favorite: true }),
    ).toEqual({
      base: 'Quest Token',
      name: 'Kept',
      quality: 'Normal',
      rolls: {},
      locked: false,
      favorite: true,
    })
  })

  it('normalizes rolls, metadata, sockets, flags, and runewords', () => {
    const result = normalizeLegacyInventoryEntry({
      base: 'Rusty Dagger',
      name: ' Etched Dagger ',
      quality: 'Epic',
      epicId: 'epic-fixture',
      ilvl: 9.8,
      levelReq: 4.7,
      locked: true,
      rolls: { atk: 3.9, str: 2.8, def: -1, bad: 99 },
      maxSockets: 5,
      sockets: ['Rune: El', 'Invalid'],
      runeword: { name: 'Runeword: Steel', bonus: { atk: 12 }, xp: 9.9 },
    })

    expect(result).toEqual({
      base: 'Rusty Dagger',
      name: 'Etched Dagger',
      quality: 'Runeword',
      epicId: 'epic-fixture',
      ilvl: 9,
      levelReq: 4,
      locked: true,
      rolls: { atk: 3, str: 2 },
      maxSockets: 2,
      sockets: ['Rune: El', null],
      runeword: { name: 'Runeword: Steel', bonus: { atk: 12 }, xp: 9 },
    })
  })

  it('collapses unmodified known entries and infers Magic from positive rolls', () => {
    expect(normalizeLegacyInventoryEntry({ base: 'Worn Pouch' })).toBe('Worn Pouch')
    expect(normalizeLegacyInventoryEntry({ base: 'Rune: El' })).toBe('Rune: El')
    expect(normalizeLegacyInventoryEntry({ base: 'Rusty Dagger' })).toBe('Rusty Dagger')
    expect(normalizeLegacyInventoryEntry({ base: 'Rusty Dagger', rolls: { dex: 2 } })).toMatchObject(
      { quality: 'Magic', rolls: { dex: 2 } },
    )
  })

  it('enforces the six legacy equipment slot relationships', () => {
    expect(normalizeLegacyEquipmentEntry('Rusty Dagger', 'weapon')).toBe('Rusty Dagger')
    expect(normalizeLegacyEquipmentEntry('Rusty Dagger', 'chest')).toBeNull()
    expect(normalizeLegacyEquipmentEntry('Unknown', 'weapon')).toBeNull()
    expect(normalizeLegacyEquipmentEntry(null, 'weapon')).toBeNull()
  })
})
