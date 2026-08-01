import type { RandomSource } from '../../rng'
import type { LegacyMobCombatant, LegacyPartyUnit } from '../combat'
import {
  castLegacySpell,
  getLegacyScaledSpellMpCost,
  getLegacySpellById,
  getLegacySpellCooldownRemaining,
  type LegacySpellCastResult,
  type LegacySpellCaster,
  type LegacySpellDefinition,
  type LegacySpellModifiers,
} from './legacy-spell-engine'

export type LegacyAutoCastSkipReason =
  | 'auto-disabled'
  | 'slot-disabled'
  | 'empty-slot'
  | 'unknown-spell'
  | 'cooldown'
  | 'insufficient-mana'
  | 'missing-target'

export interface LegacyAutoCastAttempt {
  slotIndex: number
  spellId: string | null
  reason: LegacyAutoCastSkipReason | null
}

export interface LegacyAutoCastPlan {
  selectedSlot: number | null
  spell: LegacySpellDefinition | null
  attempts: LegacyAutoCastAttempt[]
}

export interface PlanLegacyAutoCastInput {
  classId: string
  memorizedSpells: readonly unknown[] | null | undefined
  autoUseSkills?: boolean
  autoSkillSlots?: readonly unknown[] | null
  maxSlots?: number
  caster: LegacySpellCaster
  target?: LegacyMobCombatant | null
  now?: number
}

export interface ExecuteLegacyAutoCastInput extends PlanLegacyAutoCastInput {
  partyUnits?: readonly LegacyPartyUnit[]
  healTargetThreshold?: number
  random: RandomSource
  modifiers?: LegacySpellModifiers
}

export interface LegacyAutoCastResult {
  cast: LegacySpellCastResult | null
  plan: LegacyAutoCastPlan
}

function normalizedSlotCount(input: PlanLegacyAutoCastInput): number {
  const fallback = Math.max(2, Math.min(6, input.memorizedSpells?.length || 2))
  return Math.max(2, Math.min(6, Math.floor(Number(input.maxSlots ?? fallback) || fallback)))
}

export function planLegacyAutoCast(input: PlanLegacyAutoCastInput): LegacyAutoCastPlan {
  const attempts: LegacyAutoCastAttempt[] = []
  if (input.autoUseSkills === false) {
    attempts.push({ slotIndex: -1, spellId: null, reason: 'auto-disabled' })
    return { selectedSlot: null, spell: null, attempts }
  }

  const now = Math.floor(input.now ?? Date.now())
  const slots = Array.isArray(input.memorizedSpells) ? input.memorizedSpells : []
  const enabled = Array.isArray(input.autoSkillSlots) ? input.autoSkillSlots : []
  const maxSlots = normalizedSlotCount(input)

  for (let slotIndex = 0; slotIndex < maxSlots; slotIndex += 1) {
    const rawId = slots[slotIndex]
    const spellId = typeof rawId === 'string' && rawId ? rawId : null
    if (enabled[slotIndex] === false) {
      attempts.push({ slotIndex, spellId, reason: 'slot-disabled' })
      continue
    }
    if (!spellId) {
      attempts.push({ slotIndex, spellId: null, reason: 'empty-slot' })
      continue
    }
    const spell = getLegacySpellById(input.classId, spellId)
    if (!spell) {
      attempts.push({ slotIndex, spellId, reason: 'unknown-spell' })
      continue
    }
    if (getLegacySpellCooldownRemaining(spell.id, input.caster.spellCooldowns, now) > 0) {
      attempts.push({ slotIndex, spellId, reason: 'cooldown' })
      continue
    }
    if (Number(input.caster.mp || 0) < getLegacyScaledSpellMpCost(spell, input.caster.level)) {
      attempts.push({ slotIndex, spellId, reason: 'insufficient-mana' })
      continue
    }
    if (spell.target === 'enemy' && !input.target) {
      attempts.push({ slotIndex, spellId, reason: 'missing-target' })
      continue
    }

    attempts.push({ slotIndex, spellId, reason: null })
    return { selectedSlot: slotIndex, spell, attempts }
  }

  return { selectedSlot: null, spell: null, attempts }
}

export function executeLegacyAutoCast(input: ExecuteLegacyAutoCastInput): LegacyAutoCastResult {
  const plan = planLegacyAutoCast(input)
  if (!plan.spell) return { plan, cast: null }

  const cast = castLegacySpell({
    classId: input.classId,
    spellId: plan.spell.id,
    caster: input.caster,
    target: input.target,
    partyUnits: input.partyUnits,
    healTargetThreshold: input.healTargetThreshold,
    random: input.random,
    now: input.now,
    modifiers: input.modifiers,
  })
  return { plan, cast }
}
