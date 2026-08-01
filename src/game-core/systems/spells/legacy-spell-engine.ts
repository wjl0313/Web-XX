import { CLASS_EPIC_CONTENT, PHASE1, SPELLBOOK_BY_CLASS } from '../../data'
import { toLegacyClassId } from '../../domain'
import type { RandomSource } from '../../rng'
import {
  applyLegacyPartyHeal,
  getLegacyBestPartyHealTarget,
  type LegacyMobCombatant,
  type LegacyPartyUnit,
  type LegacyPlayerCombatant,
} from '../combat'

export type LegacySpellDefinition = Record<string, any>
export type LegacySpellFailureReason = 'unknown-spell' | 'cooldown' | 'insufficient-mana' | 'missing-target'

export interface LegacySpellModifiers {
  spellBonus?: number
  spellPowerMultiplier?: number
  playerDamageMultiplier?: number
  eventSpellDamageMultiplier?: number
  statusDamageMultiplier?: number
  dungeonDamageMultiplier?: number
  healMultiplier?: number
  eventHealMultiplier?: number
  statusHealMultiplier?: number
  dungeonHealMultiplier?: number
  manaMultiplier?: number
  eventManaMultiplier?: number
  statusManaMultiplier?: number
  dungeonManaMultiplier?: number
}

export interface LegacySpellCaster extends LegacyPlayerCombatant {
  spellCooldowns?: Record<string, number>
}

export interface LegacySpellStatusEffect {
  id: string
  name: string
  kind: 'dot'
  dps: number
  expiresAt: number
}

export interface LegacySpellCastResult {
  success: boolean
  reason: LegacySpellFailureReason | null
  spell: LegacySpellDefinition | null
  caster: LegacySpellCaster
  target: LegacyMobCombatant | null
  partyUnits: LegacyPartyUnit[]
  healTargetId: string | null
  amount: number
  poisonDamage: number
  statusEffect: LegacySpellStatusEffect | null
  cooldownUntil: number | null
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export function getLegacyClassSpellbook(classId: string): readonly LegacySpellDefinition[] {
  const legacyClassId = toLegacyClassId(classId)
  if (!legacyClassId) return []
  const base = SPELLBOOK_BY_CLASS[legacyClassId] || []
  const epic = CLASS_EPIC_CONTENT[legacyClassId]?.spell
  return epic ? [...base, epic] : base
}

export function getLegacySpellById(classId: string, spellId: string | null | undefined): LegacySpellDefinition | null {
  if (!spellId) return null
  return getLegacyClassSpellbook(classId).find((spell) => spell.id === spellId) || null
}

export function getLegacyScaledSpellMpCost(spell: LegacySpellDefinition | null | undefined, casterLevel: number): number {
  const base = Math.max(0, Math.floor(Number(spell?.mp || 0)))
  const level = Math.max(1, Math.floor(Number(casterLevel) || 1))
  const required = Math.max(1, Math.floor(Number(spell?.levelReq || 1)))
  return Math.max(0, Math.floor(base * (1 + Math.max(0, level - required) * 0.018)))
}

export function getLegacyCappedSpellHealPercent(spell: LegacySpellDefinition | null | undefined): number {
  const raw = Number(spell?.healPct || 0.25)
  return Math.min(spell?.epic ? 0.55 : 0.35, Math.max(0.05, raw))
}

export function getLegacyCappedSpellManaPercent(spell: LegacySpellDefinition | null | undefined): number {
  const raw = Number(spell?.manaPct || 0.2)
  return Math.min(spell?.epic ? 0.45 : 0.3, Math.max(0.05, raw))
}

export function getLegacySpellCooldownRemaining(
  spellId: string,
  cooldowns: Record<string, number> | null | undefined,
  now: number,
): number {
  return Math.max(0, Math.ceil((Number(cooldowns?.[spellId] || 0) - now) / 1000))
}

export function castLegacySpell(input: {
  classId: string
  spellId: string
  caster: LegacySpellCaster
  target?: LegacyMobCombatant | null
  partyUnits?: readonly LegacyPartyUnit[]
  healTargetThreshold?: number
  random: RandomSource
  now?: number
  modifiers?: LegacySpellModifiers
}): LegacySpellCastResult {
  const spell = getLegacySpellById(input.classId, input.spellId)
  const caster = clone(input.caster)
  const target = input.target ? clone(input.target) : null
  let partyUnits: LegacyPartyUnit[] = input.partyUnits
    ? clone(input.partyUnits) as LegacyPartyUnit[]
    : []
  const now = Math.floor(input.now ?? Date.now())
  const failure = (reason: LegacySpellFailureReason): LegacySpellCastResult => ({
    success: false,
    reason,
    spell,
    caster,
    target,
    partyUnits,
    healTargetId: null,
    amount: 0,
    poisonDamage: 0,
    statusEffect: null,
    cooldownUntil: null,
  })
  if (!spell) return failure('unknown-spell')
  if (getLegacySpellCooldownRemaining(spell.id, caster.spellCooldowns, now) > 0) return failure('cooldown')
  const manaCost = getLegacyScaledSpellMpCost(spell, caster.level)
  if (Number(caster.mp || 0) < manaCost) return failure('insufficient-mana')
  if (spell.target === 'enemy' && !target) return failure('missing-target')

  caster.mp = Math.max(0, Number(caster.mp || 0) - manaCost)
  const modifiers = input.modifiers || {}
  let amount = 0
  let poisonDamage = 0
  let statusEffect: LegacySpellStatusEffect | null = null
  let healTargetId: string | null = null
  if (spell.kind === 'damage' || spell.kind === 'damage_weaken' || spell.kind === 'damage_poison') {
    amount = Math.max(1, Math.floor(
      (caster.atk * Number(spell.power || 0) + input.random.next() * Number(spell.variance || 0) + Number(modifiers.spellBonus || 0)) *
      Number(modifiers.spellPowerMultiplier || 1) *
      Number(modifiers.playerDamageMultiplier || 1) *
      Number(modifiers.eventSpellDamageMultiplier || 1) *
      Number(modifiers.statusDamageMultiplier || 1) *
      Number(modifiers.dungeonDamageMultiplier || 1),
    ))
    if (target) {
      target.hp = Math.max(0, target.hp - amount)
      if (spell.kind === 'damage_weaken') target.atk = Math.max(1, target.atk - Number(spell.weaken || 1))
      if (spell.kind === 'damage_poison' && target.hp > 0 && input.random.next() < 0.55) {
        poisonDamage = input.random.integer(Number(spell.poisonMin || 6), Number(spell.poisonMax || 16))
        target.hp = Math.max(0, target.hp - poisonDamage)
      }
      if (spell.kind === 'damage_poison' && target.hp > 0) {
        statusEffect = {
          id: `poison_${spell.id}`,
          name: `${spell.name} Poison`,
          kind: 'dot',
          dps: Math.max(2, Math.floor(PHASE1.poisonDotDps + caster.level * 0.4)),
          expiresAt: now + PHASE1.poisonDotDurationMs,
        }
      }
    }
  } else if (spell.kind === 'heal') {
    const healTarget = partyUnits.length
      ? getLegacyBestPartyHealTarget(partyUnits, input.healTargetThreshold ?? 0.999, true) ||
        partyUnits.find((unit) => unit.isPlayer || unit.type === 'player') || null
      : null
    const healBaseHp = healTarget ? healTarget.maxHp : caster.maxHp
    amount = Math.floor(
      (healBaseHp * getLegacyCappedSpellHealPercent(spell) + input.random.next() * Number(spell.variance || 8)) *
      Number(modifiers.healMultiplier || 1) *
      Number(modifiers.eventHealMultiplier || 1) *
      Number(modifiers.statusHealMultiplier || 1) *
      Number(modifiers.dungeonHealMultiplier || 1),
    )
    if (healTarget) {
      const applied = applyLegacyPartyHeal(partyUnits, healTarget.unitId, amount)
      partyUnits = applied.units
      amount = applied.healed
      healTargetId = healTarget.unitId
      const player = partyUnits.find((unit) => unit.isPlayer || unit.type === 'player')
      if (player) caster.hp = player.hp
    } else {
      const missing = Math.max(0, caster.maxHp - caster.hp)
      amount = Math.min(missing, Math.max(0, amount))
      caster.hp += amount
      healTargetId = 'player'
    }
  } else if (spell.kind === 'mana') {
    amount = Math.floor(
      (caster.maxMp! * getLegacyCappedSpellManaPercent(spell) + input.random.next() * Number(spell.variance || 6)) *
      Number(modifiers.manaMultiplier || 1) *
      Number(modifiers.eventManaMultiplier || 1) *
      Number(modifiers.statusManaMultiplier || 1) *
      Number(modifiers.dungeonManaMultiplier || 1),
    )
    const missing = Math.max(0, Number(caster.maxMp || 0) - Number(caster.mp || 0))
    amount = Math.min(missing, Math.max(0, amount))
    caster.mp = Number(caster.mp || 0) + amount
  }

  const cooldownUntil = now + Number(spell.cooldown || 0) * 1000
  caster.spellCooldowns = { ...(caster.spellCooldowns || {}), [spell.id]: cooldownUntil }
  return { success: true, reason: null, spell, caster, target, partyUnits, healTargetId, amount, poisonDamage, statusEffect, cooldownUntil }
}
