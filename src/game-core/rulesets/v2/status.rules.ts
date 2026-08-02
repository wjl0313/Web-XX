import type { BattleActorState, BattleEffectInstance, BattleState } from './types'

export function isControlEffect(effect: BattleEffectInstance): boolean {
  return effect.type === 'stun' || effect.type === 'freeze'
}

export function getActorEffects(state: BattleState, actorId: string): BattleEffectInstance[] {
  return state.effects.filter((effect) => effect.targetActorId === actorId && effect.remainingRounds > 0)
}

export function isActorControlled(state: BattleState, actorId: string): boolean {
  return getActorEffects(state, actorId).some(isControlEffect)
}

export function getEffectiveAttack(state: BattleState, actor: BattleActorState): number {
  const modifier = getActorEffects(state, actor.id).reduce((sum, effect) => {
    if (effect.type === 'attack_down') return sum - effect.magnitude
    if (effect.type === 'attack_up') return sum + effect.magnitude
    return sum
  }, 0)
  return Math.max(1, actor.attack + modifier)
}

export function getEffectiveAgility(state: BattleState, actor: BattleActorState): number {
  const modifier = getActorEffects(state, actor.id).reduce((sum, effect) => {
    if (effect.type === 'agility_down') return sum - effect.magnitude
    if (effect.type === 'agility_up') return sum + effect.magnitude
    return sum
  }, 0)
  return Math.max(0, actor.agility + modifier)
}

export function addOrRefreshEffect(state: BattleState, effect: BattleEffectInstance): BattleEffectInstance {
  const existing = state.effects.find((entry) =>
    entry.targetActorId === effect.targetActorId && entry.type === effect.type,
  )
  if (!existing) {
    state.effects.push(effect)
    return effect
  }
  existing.sourceActorId = effect.sourceActorId
  existing.magnitude = Math.max(existing.magnitude, effect.magnitude)
  existing.remainingRounds = Math.max(existing.remainingRounds, effect.remainingRounds)
  existing.appliedRound = state.round
  existing.element = effect.element
  return existing
}

export function applyRoundStartEffects(state: BattleState): Array<{
  effect: BattleEffectInstance
  amount: number
  kind: 'damage' | 'healing'
}> {
  const results: Array<{ effect: BattleEffectInstance; amount: number; kind: 'damage' | 'healing' }> = []
  for (const effect of state.effects) {
    if (effect.remainingRounds <= 0) continue
    const target = state.actors[effect.targetActorId]
    if (!target || target.hp <= 0) continue
    if (effect.type === 'poison') {
      const resistance = Math.max(0, Math.min(80, Number(target.statusResistances?.poison || 0)))
      const amount = Math.max(1, Math.floor(effect.magnitude * (1 - resistance / 100)))
      target.hp = Math.max(0, target.hp - amount)
      results.push({ effect, amount, kind: 'damage' })
    }
    if (effect.type === 'regeneration') {
      const amount = Math.max(1, Math.min(target.maxHp - target.hp, Math.floor(effect.magnitude)))
      target.hp += amount
      results.push({ effect, amount, kind: 'healing' })
    }
  }
  return results
}

export function decrementRoundDurations(state: BattleState): BattleEffectInstance[] {
  const expired: BattleEffectInstance[] = []
  for (const effect of state.effects) {
    if (effect.appliedRound >= state.round) continue
    effect.remainingRounds -= 1
    if (effect.remainingRounds <= 0) expired.push(effect)
  }
  state.effects = state.effects.filter((effect) => effect.remainingRounds > 0)
  return expired
}
