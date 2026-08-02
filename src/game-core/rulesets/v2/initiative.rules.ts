import { getEffectiveAgility } from './status.rules'
import type { BattleActorState, BattleState } from './types'

export function buildInitiativeOrder(
  state: BattleState,
  actors: readonly BattleActorState[],
  tieBreaker: () => number,
): string[] {
  return [...actors]
    .filter((actor) => actor.hp > 0)
    .sort((left, right) => {
      const difference = getEffectiveAgility(state, right) - getEffectiveAgility(state, left)
      if (difference !== 0) return difference
      return tieBreaker() < 0.5 ? -1 : 1
    })
    .map((actor) => actor.id)
}
