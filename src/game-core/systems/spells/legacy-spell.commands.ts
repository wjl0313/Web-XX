import type { LegacyCharacterSave } from '../../save'
import {
  getLegacyClassSpellbook,
  getLegacySpellById,
  type LegacySpellDefinition,
} from './legacy-spell-engine'

export type LegacySpellCommandFailure =
  | 'unknown-spell'
  | 'epic-only'
  | 'already-known'
  | 'level-required'
  | 'faction-required'
  | 'insufficient-gold'
  | 'invalid-slot'
  | 'not-known'

export interface LegacySpellCommandResult {
  applied: boolean
  character: LegacyCharacterSave
  spell: LegacySpellDefinition | null
  cost: number
  failure: LegacySpellCommandFailure | null
}

function cloneCharacter(character: LegacyCharacterSave): Record<string, any> {
  return JSON.parse(JSON.stringify(character)) as Record<string, any>
}

function failed(
  character: LegacyCharacterSave,
  failure: LegacySpellCommandFailure,
  spell: LegacySpellDefinition | null = null,
  cost = 0,
): LegacySpellCommandResult {
  return { applied: false, character, spell, cost, failure }
}

export function getLegacySpellFactionRequirement(spell: LegacySpellDefinition | null | undefined): number {
  if (!spell) return 0
  if (typeof spell.factionReq === 'number') return Math.max(0, spell.factionReq)
  return Number(spell.levelReq || 1) >= 9 ? 30 : 0
}

export function getLegacyMaxMemorizedSpellSlots(extraSpellSlots = 0): number {
  const bonus = Math.max(0, Math.floor(Number(extraSpellSlots) || 0))
  return Math.max(2, Math.min(6, 2 + bonus))
}

export function normalizeLegacySpellState(
  source: LegacyCharacterSave,
  extraSpellSlots?: number,
): LegacyCharacterSave {
  const character = cloneCharacter(source)
  const classId = String(character.cls || '')
  const spellbook = getLegacyClassSpellbook(classId)
  const starterSpell = spellbook[0]?.id || null
  const valid = new Set(spellbook.map((spell) => spell.id))
  if (!Array.isArray(character.knownSpells) || !character.knownSpells.length) {
    character.knownSpells = starterSpell ? [starterSpell] : []
  } else {
    character.knownSpells = character.knownSpells.filter((id: unknown) => valid.has(String(id)))
  }
  if (!character.spellShopInitialized) {
    character.knownSpells = starterSpell ? [starterSpell] : []
    character.spellShopInitialized = true
  }
  const bonus = extraSpellSlots ?? Number(character.aa?.extraSpellSlots || 0)
  const maxSlots = getLegacyMaxMemorizedSpellSlots(bonus)
  const existing = Array.isArray(character.memorizedSpells) ? character.memorizedSpells : []
  const known = new Set(character.knownSpells)
  character.memorizedSpells = Array.from({ length: maxSlots }, (_, index) => {
    const current = existing[index]
    return current && known.has(current) ? current : character.knownSpells[index] || null
  })
  if (!character.spellCooldowns || typeof character.spellCooldowns !== 'object' || Array.isArray(character.spellCooldowns)) {
    character.spellCooldowns = {}
  }
  return character as LegacyCharacterSave
}

export function purchaseLegacySpell(
  source: LegacyCharacterSave,
  spellId: string,
  priceMultiplier = 1,
  extraSpellSlots?: number,
): LegacySpellCommandResult {
  const spell = getLegacySpellById(String(source.cls || ''), spellId)
  if (!spell) return failed(source, 'unknown-spell')
  if (spell.epic) return failed(source, 'epic-only', spell)
  const character = normalizeLegacySpellState(source, extraSpellSlots) as Record<string, any>
  if (character.knownSpells.includes(spell.id)) return failed(source, 'already-known', spell)
  if (Number(character.level || 1) < Number(spell.levelReq || 1)) return failed(source, 'level-required', spell)
  if (Number(character.faction || 0) < getLegacySpellFactionRequirement(spell)) return failed(source, 'faction-required', spell)
  const cost = Math.max(0, Math.floor(Number(spell.cost || 0) * Math.max(0, Number(priceMultiplier) || 0)))
  if (Number(character.gold || 0) < cost) return failed(source, 'insufficient-gold', spell, cost)
  character.gold = Number(character.gold || 0) - cost
  character.knownSpells.push(spell.id)
  for (let index = 0; index < character.memorizedSpells.length; index += 1) {
    if (!character.memorizedSpells[index]) {
      character.memorizedSpells[index] = spell.id
      break
    }
  }
  return { applied: true, character, spell, cost, failure: null }
}

export function memorizeLegacySpell(
  source: LegacyCharacterSave,
  slotIndex: number,
  spellId: string | null,
  extraSpellSlots?: number,
): LegacySpellCommandResult {
  const character = normalizeLegacySpellState(source, extraSpellSlots) as Record<string, any>
  const index = Math.floor(Number(slotIndex))
  if (index < 0 || index >= character.memorizedSpells.length) return failed(source, 'invalid-slot')
  if (spellId === null) {
    character.memorizedSpells[index] = null
    return { applied: true, character, spell: null, cost: 0, failure: null }
  }
  const spell = getLegacySpellById(String(character.cls || ''), spellId)
  if (!spell) return failed(source, 'unknown-spell')
  if (!character.knownSpells.includes(spell.id)) return failed(source, 'not-known', spell)
  character.memorizedSpells[index] = spell.id
  return { applied: true, character, spell, cost: 0, failure: null }
}
