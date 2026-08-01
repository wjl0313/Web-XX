import type { RandomSource } from '../../rng'
import {
  refreshLegacyNamedWard,
  rollLegacyNamedVenomDamage,
  triggerLegacyNamedEnrage,
} from './legacy-combat-effects'
import { resolveLegacyMobStrike } from './legacy-combat.formulas'
import type {
  LegacyMobCombatant,
  LegacyMobStrikeModifiers,
  LegacyMobStrikeResult,
  LegacyPlayerCombatant,
} from './types'

export interface ResolveLegacySoloMobTurnInput {
  player: LegacyPlayerCombatant
  mob: LegacyMobCombatant
  random: RandomSource
  stunned?: boolean
  strikeModifiers?: LegacyMobStrikeModifiers
}

export interface LegacySoloMobTurnResult {
  player: LegacyPlayerCombatant
  mob: LegacyMobCombatant
  strike: LegacyMobStrikeResult | null
  stunned: boolean
  enrageTriggered: boolean
  venomDamage: number
  wardRefreshed: boolean
  playerDied: boolean
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export function resolveLegacySoloMobTurn(
  input: ResolveLegacySoloMobTurnInput,
): LegacySoloMobTurnResult {
  let player = clone(input.player)
  let mob = clone(input.mob)
  const enraged = triggerLegacyNamedEnrage(mob)
  mob = enraged.mob
  mob.turnCount = Math.max(0, Math.floor(Number(mob.turnCount || 0))) + 1

  if (input.stunned) {
    return {
      player,
      mob,
      strike: null,
      stunned: true,
      enrageTriggered: enraged.triggered,
      venomDamage: 0,
      wardRefreshed: false,
      playerDied: false,
    }
  }

  const strike = resolveLegacyMobStrike(mob, player, input.random, input.strikeModifiers)
  if (strike.hit) player.hp = Math.max(0, player.hp - strike.damage)
  if (player.hp <= 0) {
    return {
      player,
      mob,
      strike,
      stunned: false,
      enrageTriggered: enraged.triggered,
      venomDamage: 0,
      wardRefreshed: false,
      playerDied: true,
    }
  }

  const rolledVenom = rollLegacyNamedVenomDamage(mob, input.random)
  const venomDamage = Math.min(player.hp, rolledVenom)
  player.hp = Math.max(0, player.hp - venomDamage)
  if (player.hp <= 0) {
    return {
      player,
      mob,
      strike,
      stunned: false,
      enrageTriggered: enraged.triggered,
      venomDamage,
      wardRefreshed: false,
      playerDied: true,
    }
  }

  const ward = refreshLegacyNamedWard(mob)
  mob = ward.mob
  return {
    player,
    mob,
    strike,
    stunned: false,
    enrageTriggered: enraged.triggered,
    venomDamage,
    wardRefreshed: ward.refreshed,
    playerDied: false,
  }
}
