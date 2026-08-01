import { describe, expect, it } from 'vitest'

import {
  ALL_ITEM_DATA,
  ALL_WEAPON_PROCS,
  CLASSES,
  EPIC_ITEM_BY_BASE,
  FRESH_QUESTS,
  GAME_RACES,
  ITEM_AFFIX_POOL,
  ITEM_SETS,
  LEGACY_ZH_CN_EXACT,
  LOOT,
  LOOT_MISC_BASES,
  LOOT_TIER_ADVANCED,
  LOOT_TIER_EPIC,
  LOOT_TIER_MID,
  LOOT_TIER_MYTHIC,
  LOOT_TIER_STARTER,
  RACE_CLASS_RULES,
  RUNEWORD_RECIPES_BY_SLOT,
  RUNE_DATA,
  RUNE_TRANSMUTE_CHAIN,
  SPELLBOOK_BY_CLASS,
  ZONES,
  getLegacyClass,
  getLegacyClassSpells,
  getLegacyItem,
  getLegacyRaceClasses,
  getLegacyZone,
  isLegacyClassId,
  isLegacyRaceId,
  translateLegacyText,
} from '../../src/game-core/data'

describe('generated legacy static data', () => {
  it('locks character and race catalog sizes and representative values', () => {
    expect(Object.keys(CLASSES)).toHaveLength(16)
    expect(GAME_RACES).toHaveLength(16)
    expect(Object.keys(RACE_CLASS_RULES)).toHaveLength(16)
    expect(getLegacyClass('Warrior')).toMatchObject({ hp: 160, atk: 18, skill: 'Taunt' })
    expect(getLegacyRaceClasses('Dragonborn')).toContain('Wizard')
  })

  it('exposes guarded character catalog lookups', () => {
    expect(isLegacyClassId('Cleric')).toBe(true)
    expect(isLegacyClassId('Unknown')).toBe(false)
    expect(isLegacyClassId(1)).toBe(false)
    expect(isLegacyRaceId('Human')).toBe(true)
    expect(isLegacyRaceId('Unknown')).toBe(false)
    expect(isLegacyRaceId(null)).toBe(false)
  })

  it('locks the 41-zone world progression table', () => {
    expect(ZONES).toHaveLength(41)
    expect(getLegacyZone(0)).toMatchObject({ name: 'Newbie Yard', minLvl: 1 })
    expect(getLegacyZone(40)).toMatchObject({ name: 'The Final Veil', maxLvl: 250 })
    expect(getLegacyZone(-1)).toBeNull()
    expect(getLegacyZone(41)).toBeNull()
  })

  it('locks item, proc, set, and loot catalog sizes', () => {
    expect(Object.keys(ALL_ITEM_DATA)).toHaveLength(69)
    expect(Object.keys(ALL_WEAPON_PROCS)).toHaveLength(21)
    expect(Object.keys(ITEM_SETS)).toHaveLength(9)
    expect(LOOT).toHaveLength(75)
    expect(LOOT_TIER_STARTER).toHaveLength(12)
    expect(LOOT_TIER_MID).toHaveLength(19)
    expect(LOOT_TIER_ADVANCED).toHaveLength(17)
    expect(LOOT_TIER_EPIC).toHaveLength(13)
    expect(LOOT_TIER_MYTHIC).toHaveLength(8)
    expect(LOOT_MISC_BASES).toHaveLength(6)
    expect(Object.keys(ITEM_AFFIX_POOL)).toHaveLength(6)
    expect(Object.keys(EPIC_ITEM_BY_BASE)).toHaveLength(67)
    expect(FRESH_QUESTS).toHaveLength(26)
    expect(getLegacyItem('Rusty Dagger')).toMatchObject({ slot: 'weapon', atk: 4 })
    expect(getLegacyItem('Veilrender Scythe')).toMatchObject({ slot: 'weapon', atk: 30 })
    expect(getLegacyItem('Missing')).toBeNull()
  })

  it('locks rune and spell catalogs', () => {
    expect(Object.keys(RUNE_DATA)).toHaveLength(12)
    expect(RUNE_TRANSMUTE_CHAIN).toHaveLength(12)
    expect(Object.keys(RUNEWORD_RECIPES_BY_SLOT)).toHaveLength(5)
    expect(Object.keys(SPELLBOOK_BY_CLASS)).toHaveLength(16)
    expect(getLegacyClassSpells('Wizard').map((spell) => spell.name)).toContain('Fireball')
  })

  it('uses the generated map plus cultivation display overrides with fallback', () => {
    expect(Object.keys(LEGACY_ZH_CN_EXACT)).toHaveLength(569)
    expect(translateLegacyText('Warrior')).toBe('炼体士')
    expect(translateLegacyText('Human')).toBe('五行杂灵根')
    expect(translateLegacyText('Newbie Yard')).toBe('青竹林')
    expect(translateLegacyText('Unmapped internal text')).toBe('Unmapped internal text')
  })
})
