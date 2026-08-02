import { describe, expect, it } from 'vitest'

import {
  CHARACTER_CLASS_IDS,
  CHARACTER_CLASS_TO_LEGACY,
  CHARACTER_RACE_CLASS_RULES,
  CHARACTER_RACE_IDS,
  CHARACTER_RACE_TO_LEGACY,
  LEGACY_CLASS_TO_CHARACTER,
  LEGACY_RACE_TO_CHARACTER,
  assertCompleteCharacterIdentityMappings,
  normalizeCharacterClassId,
  normalizeCharacterRaceId,
  toLegacyClassId,
  toLegacyRaceId,
} from '../../src/game-core/domain'
import { RACE_CLASS_RULES } from '../../src/game-core/data'
import {
  createNativeCharacter,
  exportNativeCharacterIdentityToLegacy,
  importLegacyCharacterIdentity,
} from '../../src/game-core/save'
import { getLegacyClassSpellbook } from '../../src/game-core/systems/spells'
import { getLegacyHpPerLevel } from '../../src/game-core/systems/progression'

describe('Chinese character identity domain', () => {
  it('defines complete bijections for all 16 classes and races', () => {
    expect(assertCompleteCharacterIdentityMappings).not.toThrow()
    expect(CHARACTER_CLASS_IDS).toHaveLength(16)
    expect(CHARACTER_RACE_IDS).toHaveLength(16)

    for (const classId of CHARACTER_CLASS_IDS) {
      const legacyId = CHARACTER_CLASS_TO_LEGACY[classId]
      expect(LEGACY_CLASS_TO_CHARACTER[legacyId]).toBe(classId)
      expect(normalizeCharacterClassId(legacyId)).toBe(classId)
      expect(toLegacyClassId(classId)).toBe(legacyId)
    }
    for (const raceId of CHARACTER_RACE_IDS) {
      const legacyId = CHARACTER_RACE_TO_LEGACY[raceId]
      expect(LEGACY_RACE_TO_CHARACTER[legacyId]).toBe(raceId)
      expect(normalizeCharacterRaceId(legacyId)).toBe(raceId)
      expect(toLegacyRaceId(raceId)).toBe(legacyId)
    }
  })

  it('preserves every frozen race/class restriction after switching to Chinese IDs', () => {
    for (const raceId of CHARACTER_RACE_IDS) {
      const legacyRace = CHARACTER_RACE_TO_LEGACY[raceId]
      expect(CHARACTER_RACE_CLASS_RULES[raceId].map(toLegacyClassId)).toEqual(
        RACE_CLASS_RULES[legacyRace],
      )
    }
  })

  it('creates Chinese-domain characters and exports old-save-compatible IDs', () => {
    const native = createNativeCharacter({
      name: '青岚',
      race: '五行杂灵根',
      classId: '五行法修',
      ruleset: 'legacy',
      now: 1,
    })
    expect(native).toMatchObject({
      race: '五行杂灵根',
      cls: '五行法修',
      characterIdSchema: 1,
      knownSpells: ['fireball'],
    })

    const legacy = exportNativeCharacterIdentityToLegacy(native)
    expect(legacy).toMatchObject({ race: 'Human', cls: 'Wizard' })
    expect(legacy).not.toHaveProperty('characterIdSchema')

    expect(importLegacyCharacterIdentity(legacy)).toMatchObject({
      race: '五行杂灵根',
      cls: '五行法修',
      characterIdSchema: 1,
    })
  })

  it('keeps spell and progression rules equivalent for Chinese and old English IDs', () => {
    expect(getLegacyClassSpellbook('五行法修')).toEqual(getLegacyClassSpellbook('Wizard'))
    expect(getLegacyHpPerLevel('炼体士', 20)).toBe(getLegacyHpPerLevel('Warrior', 20))
  })
})
