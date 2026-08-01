import type { RandomSource } from '../../rng'
import {
  calculateLegacyKillRewards,
  resolveLegacyMobStrike,
  resolveLegacyPlayerAttack,
} from './legacy-combat.formulas'
import type {
  LegacyBattleEvent,
  LegacyBattleResult,
  LegacyKillRewardModifiers,
  LegacyMobCombatant,
  LegacyMobStrikeModifiers,
  LegacyPlayerAttackModifiers,
  LegacyPlayerCombatant,
} from './types'

export interface SimulateLegacyBattleInput {
  player: LegacyPlayerCombatant & { zone: number; hardcore?: boolean }
  mob: LegacyMobCombatant
  random: RandomSource
  maxTurns?: number
  playerModifiers?: LegacyPlayerAttackModifiers
  mobModifiers?: LegacyMobStrikeModifiers
  rewardModifiers?: LegacyKillRewardModifiers
}

export interface SimulateLegacyBattleResult extends LegacyBattleResult {
  rewards: { xp: number; gold: number } | null
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export function simulateLegacyBattle(
  input: SimulateLegacyBattleInput,
): SimulateLegacyBattleResult {
  const player = clone(input.player)
  const mob = clone(input.mob)
  const events: LegacyBattleEvent[] = []
  const maximumTurns = Math.max(1, Math.floor(input.maxTurns ?? 10_000))

  for (let turn = 1; turn <= maximumTurns; turn += 1) {
    const attack = resolveLegacyPlayerAttack(
      player,
      mob,
      input.random,
      input.playerModifiers,
    )
    if (attack.hit) {
      mob.hp = Math.max(0, mob.hp - attack.damage)
      if (attack.wardConsumed) mob.wardReady = false
      events.push({ turn, type: 'player-hit', damage: attack.damage, critical: attack.critical })
    } else {
      events.push({ turn, type: 'player-miss' })
    }

    if (mob.hp <= 0) {
      events.push({ turn, type: 'victory' })
      return {
        winner: 'player',
        turns: turn,
        player,
        mob,
        events,
        rewards: calculateLegacyKillRewards(
          player,
          mob,
          input.random,
          input.rewardModifiers,
        ),
      }
    }

    if (attack.stunned) {
      events.push({ turn, type: 'mob-stunned' })
      continue
    }

    const strike = resolveLegacyMobStrike(mob, player, input.random, input.mobModifiers)
    if (strike.hit) {
      player.hp = Math.max(0, player.hp - strike.damage)
      events.push({ turn, type: 'mob-hit', damage: strike.damage, critical: strike.critical })
    } else {
      events.push({ turn, type: 'mob-miss' })
    }

    if (player.hp <= 0) {
      events.push({ turn, type: 'defeat' })
      return { winner: 'mob', turns: turn, player, mob, events, rewards: null }
    }
  }

  return {
    winner: 'timeout',
    turns: maximumTurns,
    player,
    mob,
    events,
    rewards: null,
  }
}
