import { describe, expect, it } from 'vitest'

import { createLegacyCharacter } from '../../src/game-core/save'
import {
  getLegacyMaxMemorizedSpellSlots,
  getLegacySpellFactionRequirement,
  memorizeLegacySpell,
  normalizeLegacySpellState,
  purchaseLegacySpell,
} from '../../src/game-core/systems/spells'

function character() {
  const value = createLegacyCharacter({ name: '云岫', race: 'Human', classId: 'Wizard', now: 1 })
  value.level = 20
  value.gold = 1_000
  value.faction = 100
  return value
}

describe('legacy spell commands', () => {
  it('normalizes known spells, cooldowns and the two-to-six gem boundary', () => {
    const source = character()
    source.knownSpells = ['fireball', 'missing']
    source.memorizedSpells = ['missing', 'fireball', 'clarity']
    source.spellCooldowns = null as any
    const normalized = normalizeLegacySpellState(source, 2)
    expect(normalized.knownSpells).toEqual(['fireball'])
    expect(normalized.memorizedSpells).toEqual(['fireball', 'fireball', null, null])
    expect(normalized.spellCooldowns).toEqual({})
    expect(getLegacyMaxMemorizedSpellSlots(99)).toBe(6)
    expect(source.knownSpells).toEqual(['fireball', 'missing'])
  })

  it('keeps the frozen default faction requirement for level-nine spells', () => {
    expect(getLegacySpellFactionRequirement({ levelReq: 8 })).toBe(0)
    expect(getLegacySpellFactionRequirement({ levelReq: 9 })).toBe(30)
    expect(getLegacySpellFactionRequirement({ levelReq: 20, factionReq: 12 })).toBe(12)
  })

  it('purchases a spell through level, faction, price and auto-memorize rules', () => {
    const source = character()
    const result = purchaseLegacySpell(source, 'ice_comet', 1.5)
    expect(result.applied).toBe(true)
    expect(result.cost).toBe(Math.floor(Number(result.spell?.cost) * 1.5))
    expect(result.character.knownSpells).toContain('ice_comet')
    expect(result.character.memorizedSpells).toContain('ice_comet')
    expect(source.knownSpells).not.toContain('ice_comet')
  })

  it('rejects faction and funds failures without mutating the source', () => {
    const source = character()
    source.faction = 0
    expect(purchaseLegacySpell(source, 'wiz_chain_lightning').failure).toBe('faction-required')
    source.faction = 100
    source.gold = 0
    expect(purchaseLegacySpell(source, 'wiz_chain_lightning').failure).toBe('insufficient-gold')
    expect(source.knownSpells).toEqual(['fireball'])
  })

  it('only memorizes known spells in unlocked slots and supports clearing', () => {
    const source = character()
    source.knownSpells = ['fireball', 'ice_comet']
    const memorized = memorizeLegacySpell(source, 1, 'ice_comet')
    expect(memorized.applied).toBe(true)
    expect(memorized.character.memorizedSpells?.[1]).toBe('ice_comet')
    expect(memorizeLegacySpell(source, 2, 'ice_comet').failure).toBe('invalid-slot')
    expect(memorizeLegacySpell(source, 1, 'clarity').failure).toBe('not-known')
    expect(memorizeLegacySpell(memorized.character, 1, null).character.memorizedSpells?.[1]).toBeNull()
  })
})
