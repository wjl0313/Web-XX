import { describe, expect, it, vi } from 'vitest'

import {
  LEGACY_GAME_VERSION,
  LEGACY_MAX_SLOTS,
  LEGACY_SAVE_SCHEMA,
  createFreshLegacyQuests,
  createLegacyCharacterImportOptions,
  legacyXpToNextLevel,
  migrateLegacyCharacter,
  prepareLegacyImportedCharacter,
  rollLegacyClassAbilities,
  sanitizeLegacyImportedCharacter,
  validateLegacyImportedSlots,
  type LegacyCharacterSave,
} from '../../src/game-core/save'

describe('legacy character migration', () => {
  it('locks the legacy level curve and class ability growth', () => {
    expect([1, 14, 15, 50, 100].map(legacyXpToNextLevel)).toEqual([
      100, 16345, 24191, 303186, 4549256,
    ])
    expect(rollLegacyClassAbilities('Warrior', 8)).toEqual({
      str: 17,
      dex: 12,
      con: 16,
      int: 8,
      wis: 10,
      cha: 9,
    })
    expect(rollLegacyClassAbilities('Missing')).toEqual({
      str: 10,
      dex: 10,
      con: 10,
      int: 10,
      wis: 10,
      cha: 10,
    })
  })

  it('returns independent fresh quest lists', () => {
    const first = createFreshLegacyQuests()
    const second = createFreshLegacyQuests()

    expect(first).toHaveLength(26)
    first[0].name = 'Changed'
    expect(second[0].name).toBe('Rat Problem')
  })

  it('repairs malformed core fields and initializes required state', () => {
    const character: LegacyCharacterSave = {
      version: '1.0.3',
      name: '  ',
      cls: 'Missing',
      race: 'Missing',
      level: -4,
      xp: -1,
      maxHp: 'bad',
      maxMp: -5,
      hp: 999,
      mp: -1,
      atk: 0,
      def: -2,
      faction: 999,
      zone: 999,
      bindZone: -1,
      corpse: { zone: 999 },
      inventory: [null, { name: 'bad' }],
      equipment: { weapon: 'Rawhide Boots' },
      runeStash: ['Rune: El', 'Invalid'],
      discoveredRunewords: ['Runeword: Steel', 'Invalid'],
      quests: 'invalid',
      bags: ['Missing Bag'],
      knownSpells: ['invalid'],
      memorizedSpells: ['invalid'],
      manapotions_lhp: 3,
      lastAfkAt: 'bad',
    }

    const result = migrateLegacyCharacter(character)

    expect(result).toMatchObject({ repaired: true, fromVersion: '1.0.3', toVersion: '1.6.19' })
    expect(character).toMatchObject({
      version: LEGACY_GAME_VERSION,
      name: 'Adventurer',
      cls: 'Warrior',
      race: 'Human',
      level: 1,
      xp: 0,
      xpNext: 100,
      maxHp: 160,
      maxMp: 0,
      hp: 160,
      mp: 0,
      atk: 1,
      def: 0,
      faction: 500,
      zone: 0,
      bindZone: 0,
      corpse: null,
      inventory: [],
      runeStash: ['Rune: El'],
      discoveredRunewords: ['Runeword: Steel'],
      healpotions_lhp: 3,
      manapotions_lmp: 0,
      lastAfkAt: null,
      spellShopInitialized: true,
      knownSpells: ['shield_slam'],
      memorizedSpells: ['shield_slam', null],
      bags: ['Worn Pouch', 'Worn Pouch', 'Worn Pouch', 'Worn Pouch'],
      hardcore: false,
    })
    expect(character.equipment).toEqual({
      weapon: null,
      chest: null,
      legs: null,
      feet: null,
      offhand: null,
      charm: null,
    })
    expect(character.quests).toHaveLength(26)
    expect(character.stats).toMatchObject({ kills: 0, deaths: 0 })
    expect(character.pets).toMatchObject({ active: 'none', owned: [] })
    expect(character).toMatchObject({
      group: [],
      lfg: false,
      lfgParty: [],
      partyLineup: [],
      partyHp: { units: {} },
      groupSplitGold: false,
      groupMercs: [],
      groupMercNames: [],
      groupMercGear: [],
    })
  })

  it('migrates renamed item and monster references and preserves valid corpse data', () => {
    const character: LegacyCharacterSave = {
      version: '1.5.18',
      name: 'Fixture',
      cls: 'Wizard',
      race: 'High Elf',
      level: 20,
      maxHp: 80,
      maxMp: 160,
      hp: 70,
      mp: 120,
      atk: 8,
      def: 4,
      zone: 2,
      corpse: { zone: 1, gold: 8, ts: 100 },
      inventory: [{ base: 'Velium Spear', name: 'Velium Spear' }],
      equipment: { weapon: 'Velium Spear' },
      quests: [{ name: 'Old', mob: 'Velium Stalker' }],
      dailyQuests: [{ target: 'Highpass Bandit' }],
      eliteContract: { target: 'Innoruuk Servant' },
      eliteContracts: [{ target: 'Ssra Acolyte' }],
      classQuest: { target: 'Anguish Torturer' },
      knownSpells: ['fireball'],
      spellShopInitialized: true,
      memorizedSpells: ['fireball', null, null],
    }

    migrateLegacyCharacter(character, { now: () => 999 })

    expect(character.inventory).toContain('Glacite Spear')
    expect(character.equipment).toMatchObject({ weapon: 'Glacite Spear' })
    expect((character.quests as Array<Record<string, unknown>>)[0].mob).toBe('Glacite Stalker')
    expect((character.dailyQuests as Array<Record<string, unknown>>)[0].target).toBe(
      'Cragpass Bandit',
    )
    expect((character.eliteContract as Record<string, unknown>).target).toBe('Asmodean Servant')
    expect((character.eliteContracts as Array<Record<string, unknown>>)[0].target).toBe(
      'Sythara Acolyte',
    )
    expect((character.classQuest as Record<string, unknown>).target).toBe('Wretchmaw Torturer')
    expect(character.corpse).toEqual({ zone: 1, gold: 8, ts: 100 })
    expect(character.memorizedSpells).toHaveLength(3)
  })

  it('supports deterministic extended migration and spell-slot hooks', () => {
    const extended = vi.fn((character: LegacyCharacterSave) => {
      character.extendedFixture = true
    })
    const character: LegacyCharacterSave = { name: 'Hook', cls: 'Cleric', race: 'Human' }

    migrateLegacyCharacter(character, {
      getMaxMemorizedSpellSlots: () => 6,
      migrateExtendedState: extended,
    })

    expect(character.memorizedSpells).toHaveLength(6)
    expect(character.extendedFixture).toBe(true)
    expect(extended).toHaveBeenCalledOnce()
  })

  it('sanitizes imported limits and marks the current schema', () => {
    const inventory = Array.from({ length: 305 }, () => 'Rusty Dagger')
    const character: LegacyCharacterSave = {
      name: '\u0000  A very long imported cultivator name  ',
      cls: 'Missing',
      race: 'Missing',
      level: Number.POSITIVE_INFINITY,
      xp: -1,
      hp: 999,
      maxHp: 10,
      mp: 999,
      maxMp: 5,
      zone: 999,
      inventory,
      equipment: { weapon: 'Rusty Dagger', extra: 'Rusty Dagger' },
      runeStash: ['Rune: El', 'Invalid'],
      knownSpells: [' fireball ', '\u0000'],
      spellQueue: Array(20).fill(' fireball '),
    }

    sanitizeLegacyImportedCharacter(character)

    expect(character.name).toBe('A very long imported cul')
    expect(character).toMatchObject({
      cls: 'Warrior',
      race: 'Human',
      level: 1,
      xp: 0,
      hp: 10,
      mp: 5,
      zone: 40,
      version: LEGACY_GAME_VERSION,
      saveSchema: LEGACY_SAVE_SCHEMA,
    })
    expect(character.inventory).toHaveLength(300)
    expect(Object.keys(character.equipment as object)).toEqual([
      'weapon',
      'chest',
      'legs',
      'feet',
      'offhand',
      'charm',
    ])
    expect(character.runeStash).toEqual(['Rune: El'])
    expect(character.knownSpells).toEqual(['fireball'])
    expect(character.spellQueue).toHaveLength(12)
  })

  it('composes migration and sanitization into the import validator', () => {
    const prepared = prepareLegacyImportedCharacter({ name: '', cls: 'Missing', race: 'Missing' })
    expect(prepared).toMatchObject({
      name: 'Adventurer',
      cls: 'Warrior',
      race: 'Human',
      version: LEGACY_GAME_VERSION,
      saveSchema: LEGACY_SAVE_SCHEMA,
    })

    const slots = validateLegacyImportedSlots(
      [{ name: '', cls: 'Missing', race: 'Missing' }],
      createLegacyCharacterImportOptions(),
    )
    expect(slots).toHaveLength(LEGACY_MAX_SLOTS)
    expect(slots[0]).toMatchObject({ name: 'Adventurer', cls: 'Warrior', race: 'Human' })
  })
})
