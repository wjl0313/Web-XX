import { PHASE1 } from '../../data'
import type { RandomSource } from '../../rng'
import { getLegacyWeaponProc } from '../equipment'
import type { LegacyMobCombatant, LegacyPlayerCombatant } from './types'

export interface LegacyCharacterStatusEffect {
  id: string
  name: string
  type?: 'buff' | 'debuff'
  expiresAt: number
  atkBonus?: number
  defBonus?: number
  playerDamageMult?: number
  mobDamageMult?: number
  healMult?: number
  manaMult?: number
}

export interface LegacyMobStatusEffect {
  id: string
  name: string
  kind: 'dot' | 'stun'
  expiresAt: number
  dps?: number
}

export interface LegacyStatusEffectModifiers {
  atkBonus: number
  defBonus: number
  playerDamageMult: number
  mobDamageMult: number
  healMult: number
  manaMult: number
}

export interface LegacyMobStatusTickResult {
  mob: LegacyMobCombatant & { statusEffects: LegacyMobStatusEffect[] }
  damage: number
  ticks: Array<{ id: string; name: string; damage: number }>
  expired: LegacyMobStatusEffect[]
  died: boolean
}

export interface LegacyWeaponProcResult {
  triggered: boolean
  procName: string | null
  kind: 'none' | 'mana' | 'damage'
  player: LegacyPlayerCombatant
  mob: LegacyMobCombatant
  damage: number
  poisonDamage: number
  manaRestored: number
  atkDebuff: number
  killedMob: boolean
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export function cleanupLegacyStatusEffects(
  effects: readonly LegacyCharacterStatusEffect[] | null | undefined,
  now: number,
): { active: LegacyCharacterStatusEffect[]; expired: LegacyCharacterStatusEffect[] } {
  const active: LegacyCharacterStatusEffect[] = []
  const expired: LegacyCharacterStatusEffect[] = []
  for (const effect of Array.isArray(effects) ? effects : []) {
    if (Number(effect.expiresAt) > now) active.push(clone(effect))
    else expired.push(clone(effect))
  }
  return { active, expired }
}

export function applyLegacyStatusEffect(
  effects: readonly LegacyCharacterStatusEffect[] | null | undefined,
  effect: LegacyCharacterStatusEffect,
  now: number,
): LegacyCharacterStatusEffect[] {
  const { active } = cleanupLegacyStatusEffects(effects, now)
  return [...active.filter((entry) => entry.id !== effect.id), clone(effect)]
}

export function getLegacyStatusEffectModifiers(
  effects: readonly LegacyCharacterStatusEffect[] | null | undefined,
): LegacyStatusEffectModifiers {
  const output: LegacyStatusEffectModifiers = {
    atkBonus: 0,
    defBonus: 0,
    playerDamageMult: 1,
    mobDamageMult: 1,
    healMult: 1,
    manaMult: 1,
  }
  for (const effect of Array.isArray(effects) ? effects : []) {
    output.atkBonus += Number(effect.atkBonus || 0)
    output.defBonus += Number(effect.defBonus || 0)
    output.playerDamageMult *= Number(effect.playerDamageMult || 1)
    output.mobDamageMult *= Number(effect.mobDamageMult || 1)
    output.healMult *= Number(effect.healMult || 1)
    output.manaMult *= Number(effect.manaMult || 1)
  }
  return output
}

export function applyLegacyMobStatusEffect(
  mob: LegacyMobCombatant & { statusEffects?: LegacyMobStatusEffect[] },
  effect: LegacyMobStatusEffect,
): LegacyMobCombatant & { statusEffects: LegacyMobStatusEffect[] } {
  const output = clone(mob) as LegacyMobCombatant & { statusEffects: LegacyMobStatusEffect[] }
  const existing = Array.isArray(output.statusEffects) ? output.statusEffects : []
  output.statusEffects = [...existing.filter((entry) => entry.id !== effect.id), clone(effect)]
  return output
}

export function isLegacyMobStunned(
  mob: LegacyMobCombatant & { statusEffects?: LegacyMobStatusEffect[] },
  now: number,
): boolean {
  return Array.isArray(mob.statusEffects) && mob.statusEffects.some((effect) => (
    effect.kind === 'stun' && Number(effect.expiresAt) > now
  ))
}

export function tickLegacyMobStatusEffects(
  mob: LegacyMobCombatant & { statusEffects?: LegacyMobStatusEffect[] },
  now: number,
): LegacyMobStatusTickResult {
  const output = clone(mob) as LegacyMobCombatant & { statusEffects: LegacyMobStatusEffect[] }
  const remaining: LegacyMobStatusEffect[] = []
  const expired: LegacyMobStatusEffect[] = []
  const ticks: Array<{ id: string; name: string; damage: number }> = []
  let damage = 0
  for (const effect of Array.isArray(output.statusEffects) ? output.statusEffects : []) {
    if (Number(effect.expiresAt) <= now) {
      expired.push(clone(effect))
      continue
    }
    if (effect.kind === 'dot' && Number(effect.dps) > 0) {
      const amount = Math.max(1, Math.floor(Number(effect.dps)))
      output.hp -= amount
      damage += amount
      ticks.push({ id: effect.id, name: effect.name, damage: amount })
    }
    remaining.push(effect)
  }
  output.statusEffects = remaining
  return { mob: output, damage, ticks, expired, died: output.hp <= 0 }
}

export function consumeLegacyGlobalCooldown(
  readyAt: number,
  now: number,
  durationMs = PHASE1.gcdMs,
): { consumed: boolean; readyAt: number } {
  const normalizedNow = Math.floor(Number(now) || 0)
  if (normalizedNow < Math.floor(Number(readyAt) || 0)) {
    return { consumed: false, readyAt: Math.floor(Number(readyAt) || 0) }
  }
  return { consumed: true, readyAt: normalizedNow + Math.max(0, Math.floor(Number(durationMs) || 0)) }
}

export function applyLegacyLifesteal(
  player: LegacyPlayerCombatant,
  damage: number,
  lifestealPercent: number,
): { player: LegacyPlayerCombatant; healed: number } {
  const output = clone(player)
  if (damage <= 0 || lifestealPercent <= 0 || output.hp >= output.maxHp) return { player: output, healed: 0 }
  const requested = Math.max(1, Math.floor(Number(damage) * Number(lifestealPercent)))
  const before = output.hp
  output.hp = Math.min(output.maxHp, output.hp + requested)
  return { player: output, healed: output.hp - before }
}

export function resolveLegacyWeaponProc(input: {
  player: LegacyPlayerCombatant
  mob: LegacyMobCombatant
  weaponBase: string
  random: RandomSource
  setProcChance?: number
  playerDamageMultiplier?: number
  manaMultiplier?: number
}): LegacyWeaponProcResult {
  const player = clone(input.player)
  const mob = clone(input.mob)
  const proc = getLegacyWeaponProc(input.weaponBase) as Record<string, any> | null
  const idle = (): LegacyWeaponProcResult => ({
    triggered: false,
    procName: null,
    kind: 'none',
    player,
    mob,
    damage: 0,
    poisonDamage: 0,
    manaRestored: 0,
    atkDebuff: 0,
    killedMob: false,
  })
  if (!proc) return idle()
  const chance = Math.min(0.45, Number(proc.chance || 0) + Number(input.setProcChance || 0))
  if (input.random.next() > chance) return idle()
  if (proc.type === 'mana') {
    const rolled = input.random.integer(Number(proc.min || 8), Number(proc.max || 14))
    const requested = Math.floor(rolled * Number(input.manaMultiplier || 1))
    const before = Number(player.mp || 0)
    player.mp = Math.min(Number(player.maxMp || 0), before + requested)
    return {
      ...idle(),
      triggered: true,
      procName: String(proc.name || input.weaponBase),
      kind: 'mana',
      player,
      manaRestored: Number(player.mp || 0) - before,
    }
  }
  const rolled = input.random.integer(Number(proc.min || 6), Number(proc.max || 12))
  const damage = Math.max(1, Math.floor(rolled * Number(input.playerDamageMultiplier || 1)))
  mob.hp -= damage
  const atkBefore = mob.atk
  if (proc.weaken && mob.hp > 0) mob.atk = Math.max(1, mob.atk - Number(proc.weaken))
  let poisonDamage = 0
  if (proc.type === 'poison' && mob.hp > 0) {
    poisonDamage = Math.max(1, Math.floor(damage * 0.5))
    mob.hp -= poisonDamage
  }
  return {
    triggered: true,
    procName: String(proc.name || input.weaponBase),
    kind: 'damage',
    player,
    mob,
    damage,
    poisonDamage,
    manaRestored: 0,
    atkDebuff: atkBefore - mob.atk,
    killedMob: mob.hp <= 0,
  }
}

export function triggerLegacyNamedEnrage(mob: LegacyMobCombatant): {
  mob: LegacyMobCombatant
  triggered: boolean
} {
  const output = clone(mob)
  if (
    output.namedMechanic?.id !== 'enrage' ||
    output.enrageTriggered ||
    output.hp <= 0 ||
    output.hp > Math.floor(output.maxHp * 0.4)
  ) return { mob: output, triggered: false }
  output.enrageTriggered = true
  output.atk = Math.floor(output.atk * 1.45)
  return { mob: output, triggered: true }
}

export function refreshLegacyNamedWard(mob: LegacyMobCombatant): {
  mob: LegacyMobCombatant
  refreshed: boolean
} {
  const output = clone(mob)
  if (output.namedMechanic?.id !== 'ward' || output.hp <= 0 || Number(output.turnCount || 0) % 3 !== 0) {
    return { mob: output, refreshed: false }
  }
  output.wardReady = true
  return { mob: output, refreshed: true }
}

export function rollLegacyNamedVenomDamage(mob: LegacyMobCombatant, random: RandomSource): number {
  if (mob.namedMechanic?.id !== 'venom' || random.next() >= 0.35) return 0
  return Math.max(1, Math.floor(mob.level * 0.8 + random.next() * 6))
}
