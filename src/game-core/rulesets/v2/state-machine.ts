import { translateLegacyText } from '../../data'
import { ELEMENT_LABELS } from './element.rules'
import { buildInitiativeOrder } from './initiative.rules'
import {
  createV2RandomState,
  getEscapeChance,
  resolveTechniqueDamage,
  resolveV2Damage,
  resolveV2Healing,
  takeV2Random,
} from './battle.rules'
import {
  addOrRefreshEffect,
  applyRoundStartEffects,
  decrementRoundDurations,
  isActorControlled,
} from './status.rules'
import { isTechniqueReady } from './technique.rules'
import { applyTechniqueMastery } from './technique-mastery'
import { resolveV2HealingPillAmount, resolveV2ManaPillAmount } from './healing.rules'
import { normalizeV2BattleRuntimeConfig, type V2BattleRuntimeConfig } from './balance.config'
import { MonsterStrategy } from './strategies'
import type {
  BattleActorState,
  BattleCommand,
  BattleCommandValidation,
  BattleDecisionContext,
  BattleEffectInstance,
  BattleEvent,
  BattleResult,
  BattleState,
  BattleStrategy,
  BattleTransition,
  Element,
  TechniqueDefinition,
} from './types'

export interface CreateV2BattleInput {
  id?: string
  seed: string
  player: BattleActorState
  enemy: BattleActorState
  zoneId: string
  enemyContentId: string
  boss?: boolean
  rewards: { xp: number; gold: number; itemId?: string | null }
  balanceConfig?: Partial<V2BattleRuntimeConfig>
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function emit(
  state: BattleState,
  events: BattleEvent[],
  event: Omit<BattleEvent, 'sequence' | 'round'> & Partial<Pick<BattleEvent, 'round'>>,
): BattleEvent {
  const created = {
    ...event,
    sequence: ++state.eventSequence,
    round: event.round ?? state.round,
  } as BattleEvent
  state.events.push(created)
  events.push(created)
  return created
}

function actorPair(state: BattleState, actorId: string): {
  actor: BattleActorState
  opponent: BattleActorState
} | null {
  const actor = state.actors[actorId]
  if (!actor) return null
  const opponent = Object.values(state.actors).find((entry) => entry.side !== actor.side)
  return opponent ? { actor, opponent } : null
}

function createEffect(
  state: BattleState,
  type: BattleEffectInstance['type'],
  actorId: string,
  targetId: string,
  magnitude: number,
  duration: number,
  element?: BattleEffectInstance['element'],
): BattleEffectInstance {
  return {
    id: `${state.id}:effect:${state.eventSequence + 1}:${type}:${targetId}`,
    type,
    sourceActorId: actorId,
    targetActorId: targetId,
    magnitude,
    remainingRounds: Math.max(1, Math.floor(duration)),
    appliedRound: state.round,
    element,
  }
}

function applyDamage(
  state: BattleState,
  events: BattleEvent[],
  attacker: BattleActorState,
  target: BattleActorState,
  damage: ReturnType<typeof resolveV2Damage>,
  element: Element,
  techniqueId?: string,
): void {
  const incoming = damage.breakdown.finalAmount
  if (!damage.hit) {
    emit(state, events, {
      type: 'DamageDealt', actorId: attacker.id, targetId: target.id, techniqueId,
      element, amount: 0, valueBefore: target.hp, valueAfter: target.hp, critical: false,
      advantage: damage.advantage, breakdown: damage.breakdown,
      message: `${attacker.name}的攻击被${target.name}闪避。`,
    })
    return
  }
  const absorbed = Math.min(target.shield, incoming)
  target.shield -= absorbed
  const hpDamage = Math.max(0, incoming - absorbed)
  const before = target.hp
  target.hp = Math.max(0, target.hp - hpDamage)
  const marker = damage.advantage === '无关系' ? '' : `【${damage.advantage}】`
  const shieldText = absorbed > 0 ? `，其中 ${absorbed} 点被护盾吸收` : ''
  emit(state, events, {
    type: 'DamageDealt', actorId: attacker.id, targetId: target.id, techniqueId,
    element,
    amount: incoming, valueBefore: before, valueAfter: target.hp, critical: damage.critical,
    advantage: damage.advantage, breakdown: damage.breakdown,
    message: `${attacker.name}对${target.name}造成 ${incoming} 点伤害${shieldText}${damage.critical ? '【会心】' : ''}${marker}。`,
  })
  if (target.hp <= 0) {
    emit(state, events, { type: 'UnitDefeated', actorId: attacker.id, targetId: target.id, message: `${target.name}已无法继续战斗。` })
  }
}

function validateCommand(
  state: BattleState,
  command: BattleCommand,
  techniques: Readonly<Record<string, TechniqueDefinition>>,
): BattleCommandValidation {
  if (state.phase === 'COMPLETED' || state.result) return { valid: false, reason: 'battle-complete' }
  if (state.phase !== 'WAITING_FOR_COMMAND') return { valid: false, reason: 'wrong-phase' }
  if (state.activeActorId !== command.actorId) return { valid: false, reason: 'not-active-actor' }
  const actor = state.actors[command.actorId]
  if (!actor || actor.hp <= 0) return { valid: false, reason: 'actor-defeated' }
  if (isActorControlled(state, actor.id)) return { valid: false, reason: 'actor-controlled' }
  const pair = actorPair(state, actor.id)
  if (!pair) return { valid: false, reason: 'invalid-target' }
  if (command.type === 'basic_attack' && command.targetId !== pair.opponent.id) {
    return { valid: false, reason: 'invalid-target' }
  }
  if (command.type === 'use_technique') {
    const baseTechnique = techniques[command.techniqueId]
    if (!baseTechnique) return { valid: false, reason: 'unknown-technique' }
    const technique = applyTechniqueMastery(actor, baseTechnique)
    if (!actor.knownTechniqueIds.includes(technique.id)) return { valid: false, reason: 'technique-not-known' }
    if (!actor.techniqueLoadout.slots.includes(technique.id)) return { valid: false, reason: 'technique-not-equipped' }
    if (technique.target === 'enemy' && command.targetId !== pair.opponent.id) return { valid: false, reason: 'invalid-target' }
    if (technique.target === 'self' && command.targetId !== actor.id) return { valid: false, reason: 'invalid-target' }
    if (actor.mp < technique.manaCost) return { valid: false, reason: 'insufficient-mana' }
    if (Number(state.cooldowns[`${actor.id}:${technique.id}`] || 0) > 0) return { valid: false, reason: 'technique-on-cooldown' }
  }
  if (command.type === 'use_pill' && Number(actor.pills?.[command.pillId] || 0) <= 0) {
    return { valid: false, reason: 'pill-not-available' }
  }
  if (command.type === 'use_pill') {
    if (command.pillId === '回春丹' && actor.hp >= actor.maxHp) return { valid: false, reason: 'resource-full' }
    if (command.pillId === '回灵丹' && actor.mp >= actor.maxMp) return { valid: false, reason: 'resource-full' }
  }
  return { valid: true }
}

function resolveTechnique(
  state: BattleState,
  events: BattleEvent[],
  actor: BattleActorState,
  opponent: BattleActorState,
  technique: TechniqueDefinition,
): void {
  const target = technique.target === 'self' ? actor : opponent
  const beforeMp = actor.mp
  actor.mp = Math.max(0, actor.mp - technique.manaCost)
  emit(state, events, {
    type: 'ResourceChanged', actorId: actor.id, amount: -technique.manaCost,
    valueBefore: beforeMp, valueAfter: actor.mp,
    message: `${actor.name}消耗 ${technique.manaCost} 点法力。`,
  })
  state.cooldowns[`${actor.id}:${technique.id}`] = technique.cooldown
  emit(state, events, {
    type: 'TechniqueCooldownChanged', actorId: actor.id, techniqueId: technique.id,
    amount: technique.cooldown, message: `${technique.displayName}进入 ${technique.cooldown} 回合冷却。`,
  })

  if (['direct_damage', 'poison', 'attack_down', 'agility_down'].includes(technique.effectType)) {
    const damage = resolveTechniqueDamage(state, actor, opponent, technique)
    applyDamage(state, events, actor, opponent, damage, technique.element, technique.id)
  }

  if (technique.effectType === 'healing') {
    const before = actor.hp
    const amount = Math.min(actor.maxHp - actor.hp, resolveV2Healing(actor, technique))
    actor.hp += amount
    emit(state, events, {
      type: 'HealingApplied', actorId: actor.id, targetId: actor.id, techniqueId: technique.id,
      element: technique.element, amount, valueBefore: before, valueAfter: actor.hp,
      message: `${actor.name}施展${technique.displayName}，恢复 ${amount} 点气血。`,
    })
  }

  if (technique.effectType === 'shield') {
    const amount = resolveV2Healing(actor, technique)
    const before = actor.shield
    actor.shield += amount
    emit(state, events, {
      type: 'ShieldApplied', actorId: actor.id, targetId: actor.id, techniqueId: technique.id,
      element: technique.element, amount, valueBefore: before, valueAfter: actor.shield,
      message: `${actor.name}施展${technique.displayName}，获得 ${amount} 点护盾。`,
    })
  }

  if (technique.effectType === 'mana_restore') {
    const before = actor.mp
    const amount = Math.min(actor.maxMp - actor.mp, Math.max(1, Math.floor(technique.basePower + actor.spirit * Number(technique.spiritScale || 0))))
    actor.mp += amount
    emit(state, events, {
      type: 'ResourceChanged', actorId: actor.id, techniqueId: technique.id,
      amount, valueBefore: before, valueAfter: actor.mp,
      message: `${actor.name}施展${technique.displayName}，恢复 ${amount} 点法力。`,
    })
  }

  const effectType = technique.effectType === 'poison'
    ? 'poison'
    : technique.effectType === 'attack_down'
      ? 'attack_down'
      : technique.effectType === 'agility_down'
        ? 'agility_down'
        : null
  if (effectType && opponent.hp > 0) {
    const effect = addOrRefreshEffect(state, createEffect(
      state, effectType, actor.id, opponent.id,
      Number(technique.magnitude || 1), Number(technique.duration || 1), technique.element,
    ))
    emit(state, events, {
      type: 'StatusApplied', actorId: actor.id, targetId: opponent.id, techniqueId: technique.id,
      effect, message: `${opponent.name}受到“${technique.displayName}”状态影响，持续 ${effect.remainingRounds} 回合。`,
    })
  }
}

function resolveCommand(
  state: BattleState,
  command: BattleCommand,
  techniques: Readonly<Record<string, TechniqueDefinition>>,
  events: BattleEvent[],
): void {
  const pair = actorPair(state, command.actorId)!
  const { actor, opponent } = pair
  const actionName = command.type === 'basic_attack'
    ? '普通攻击'
    : command.type === 'use_pill'
      ? `服用${command.pillId}`
      : command.type === 'escape'
        ? '遁走'
        : techniques[command.techniqueId]?.displayName || '功法'
  state.pendingCommand = command
  state.phase = 'RESOLVING_ACTION'
  emit(state, events, {
    type: 'ActionDeclared', actorId: actor.id,
    targetId: 'targetId' in command ? command.targetId : undefined,
    techniqueId: command.type === 'use_technique' ? command.techniqueId : undefined,
    command, message: `${actor.name}声明行动：${actionName}。`,
  })

  if (command.type === 'basic_attack') {
    applyDamage(state, events, actor, opponent, resolveV2Damage({
      state, attacker: actor, target: opponent, element: 'neutral', basePower: 0, attackScale: 1,
    }), 'neutral')
  }
  if (command.type === 'use_technique') resolveTechnique(state, events, actor, opponent, applyTechniqueMastery(actor, techniques[command.techniqueId]))
  if (command.type === 'use_pill') {
    if (!actor.pills) actor.pills = {}
    actor.pills[command.pillId] = Math.max(0, Number(actor.pills[command.pillId] || 0) - 1)
    if (command.pillId === '回春丹') {
      const before = actor.hp
      const amount = Math.min(actor.maxHp - actor.hp, resolveV2HealingPillAmount(actor.physique, state.balanceConfig))
      actor.hp += amount
      emit(state, events, {
        type: 'HealingApplied', actorId: actor.id, targetId: actor.id,
        amount, valueBefore: before, valueAfter: actor.hp,
        message: `${actor.name}服用回春丹，恢复 ${amount} 点气血。`,
      })
    } else {
      const before = actor.mp
      const amount = Math.min(actor.maxMp - actor.mp, resolveV2ManaPillAmount(actor.maxMp, state.balanceConfig))
      actor.mp += amount
      emit(state, events, {
        type: 'ResourceChanged', actorId: actor.id,
        amount, valueBefore: before, valueAfter: actor.mp,
        message: `${actor.name}服用回灵丹，恢复 ${amount} 点法力。`,
      })
    }
  }
  if (command.type === 'escape') {
    const chance = getEscapeChance(actor, opponent, state)
    if (takeV2Random(state) < chance) {
      state.result = { outcome: 'escaped', winnerActorId: null, loserActorId: null, rounds: state.round }
      state.phase = 'ESCAPED'
      emit(state, events, { type: 'BattleEscaped', actorId: actor.id, message: `${actor.name}成功遁走。` })
    } else {
      emit(state, events, { type: 'BattleEscaped', actorId: actor.id, amount: 0, message: `${actor.name}遁走失败。` })
    }
  }
  state.phase = state.result ? state.phase : 'APPLYING_EFFECTS'
  state.pendingCommand = null
  if (!state.actedActorIds.includes(actor.id)) state.actedActorIds.push(actor.id)
}

function checkResult(state: BattleState, events: BattleEvent[]): boolean {
  if (state.result) return true
  const player = Object.values(state.actors).find((actor) => actor.side === 'player')!
  const enemy = Object.values(state.actors).find((actor) => actor.side === 'enemy')!
  if (enemy.hp <= 0) {
    state.result = { outcome: 'victory', winnerActorId: player.id, loserActorId: enemy.id, rounds: state.round }
    state.phase = 'VICTORY'
    return true
  }
  if (player.hp <= 0) {
    state.result = { outcome: 'defeat', winnerActorId: enemy.id, loserActorId: player.id, rounds: state.round }
    state.phase = 'DEFEAT'
    return true
  }
  state.phase = 'CHECKING_RESULT'
  return false
}

function settle(state: BattleState, events: BattleEvent[]): void {
  state.phase = 'SETTLEMENT'
  if (state.result?.outcome === 'victory') {
    emit(state, events, {
      type: 'RewardsGranted', actorId: state.result.winnerActorId || undefined,
      rewards: clone(state.encounter.rewards),
      message: `获得 ${state.encounter.rewards.xp} 点修为与 ${state.encounter.rewards.gold} 枚灵石${state.encounter.rewards.itemId ? `，并获得装备 ${translateLegacyText(state.encounter.rewards.itemId)}` : ''}。`,
    })
  }
  emit(state, events, {
    type: 'BattleEnded', result: clone(state.result!),
    message: state.result?.outcome === 'victory' ? '战斗胜利。' : state.result?.outcome === 'defeat' ? '战斗失败。' : '战斗已脱离。',
  })
  state.phase = 'COMPLETED'
  state.activeActorId = null
}

function activeContext(
  state: BattleState,
  techniques: Readonly<Record<string, TechniqueDefinition>>,
): BattleDecisionContext | null {
  if (!state.activeActorId) return null
  const pair = actorPair(state, state.activeActorId)
  return pair ? { state, actor: pair.actor, opponent: pair.opponent, techniques } : null
}

function advance(
  state: BattleState,
  techniques: Readonly<Record<string, TechniqueDefinition>>,
  events: BattleEvent[],
  monsterStrategy: BattleStrategy,
): void {
  for (let guard = 0; guard < 500; guard += 1) {
    if (['VICTORY', 'DEFEAT', 'ESCAPED'].includes(state.phase)) {
      settle(state, events)
      return
    }
    if (state.phase === 'COMPLETED' || state.phase === 'WAITING_FOR_COMMAND') return
    if (state.phase === 'INITIALIZING') {
      emit(state, events, { type: 'BattleStarted', round: 0, message: `战斗开始：${Object.values(state.actors).map((actor) => actor.name).join(' 对阵 ')}。` })
      state.phase = 'ROUND_START'
      continue
    }
    if (state.phase === 'ROUND_START') {
      state.round += 1
      state.actedActorIds = []
      emit(state, events, { type: 'RoundStarted', message: `第 ${state.round} 回合开始。` })
      for (const tick of applyRoundStartEffects(state)) {
        emit(state, events, {
          type: tick.kind === 'damage' ? 'DamageDealt' : 'HealingApplied',
          actorId: tick.effect.sourceActorId, targetId: tick.effect.targetActorId,
          element: tick.effect.element, amount: tick.amount,
          message: tick.kind === 'damage' ? `${state.actors[tick.effect.targetActorId].name}受到 ${tick.amount} 点持续伤害。` : `${state.actors[tick.effect.targetActorId].name}恢复 ${tick.amount} 点气血。`,
        })
      }
      if (checkResult(state, events)) continue
      state.phase = 'BUILD_TURN_ORDER'
      continue
    }
    if (state.phase === 'BUILD_TURN_ORDER') {
      state.turnOrder = buildInitiativeOrder(state, Object.values(state.actors), () => takeV2Random(state))
      emit(state, events, { type: 'TurnOrderBuilt', turnOrder: [...state.turnOrder], message: `本回合先攻顺序：${state.turnOrder.map((id) => state.actors[id].name).join(' → ')}。` })
      state.activeActorId = state.turnOrder[0] || null
      state.phase = 'CHECKING_RESULT'
      continue
    }
    if (state.phase === 'APPLYING_EFFECTS') {
      if (checkResult(state, events)) continue
      state.phase = 'CHECKING_RESULT'
      continue
    }
    if (state.phase === 'CHECKING_RESULT') {
      if (checkResult(state, events)) continue
      const nextId = state.turnOrder.find((id) => !state.actedActorIds.includes(id) && state.actors[id]?.hp > 0) || null
      if (!nextId) {
        state.phase = 'ROUND_END'
        continue
      }
      state.activeActorId = nextId
      const actor = state.actors[nextId]
      const controlled = isActorControlled(state, nextId)
      emit(state, events, {
        type: 'TurnStarted', actorId: nextId, controlled,
        message: controlled ? `${actor.name}受到控制，本回合无法行动。` : `轮到${actor.name}行动。`,
      })
      if (controlled) {
        state.actedActorIds.push(nextId)
        continue
      }
      if (actor.side === 'player') {
        state.phase = 'WAITING_FOR_COMMAND'
        return
      }
      const context = activeContext(state, techniques)!
      const command = monsterStrategy.selectCommand(context)
      state.phase = 'WAITING_FOR_COMMAND'
      const validation = validateCommand(state, command, techniques)
      if (!validation.valid) {
        const fallback: BattleCommand = { type: 'basic_attack', actorId: actor.id, targetId: context.opponent.id }
        resolveCommand(state, fallback, techniques, events)
      } else {
        resolveCommand(state, command, techniques, events)
      }
      continue
    }
    if (state.phase === 'ROUND_END') {
      for (const [key, value] of Object.entries(state.cooldowns)) {
        if (value <= 0) continue
        state.cooldowns[key] = Math.max(0, value - 1)
        const [actorId, techniqueId] = key.split(':')
        emit(state, events, { type: 'TechniqueCooldownChanged', actorId, techniqueId, amount: state.cooldowns[key], message: `${techniques[techniqueId]?.displayName || techniqueId}剩余冷却 ${state.cooldowns[key]} 回合。` })
      }
      for (const effect of decrementRoundDurations(state)) {
        emit(state, events, { type: 'StatusExpired', actorId: effect.sourceActorId, targetId: effect.targetActorId, effect, message: `${state.actors[effect.targetActorId]?.name || '目标'}的状态效果已经结束。` })
      }
      state.phase = 'ROUND_START'
      continue
    }
  }
  throw new Error('战斗状态机超过安全步数')
}

export function createV2BattleState(input: CreateV2BattleInput): BattleState {
  const player = clone(input.player)
  const enemy = clone(input.enemy)
  return {
    id: input.id || `v2-${input.seed.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24) || 'battle'}`,
    ruleset: 'v2', phase: 'INITIALIZING', round: 0,
    actors: { [player.id]: player, [enemy.id]: enemy }, turnOrder: [], activeActorId: null,
    pendingCommand: null, cooldowns: {}, effects: [], result: null,
    randomState: createV2RandomState(input.seed), actedActorIds: [], eventSequence: 0, events: [],
    balanceConfig: normalizeV2BattleRuntimeConfig(input.balanceConfig),
    encounter: { zoneId: input.zoneId, enemyContentId: input.enemyContentId, boss: Boolean(input.boss), rewards: clone(input.rewards) },
  }
}

export function startV2Battle(
  state: BattleState,
  techniques: Readonly<Record<string, TechniqueDefinition>>,
  monsterStrategy: BattleStrategy = new MonsterStrategy(),
): BattleTransition {
  const events: BattleEvent[] = []
  advance(state, techniques, events, monsterStrategy)
  return { state, events, validation: { valid: true } }
}

export function dispatchV2BattleCommand(
  source: BattleState,
  command: BattleCommand,
  techniques: Readonly<Record<string, TechniqueDefinition>>,
  monsterStrategy: BattleStrategy = new MonsterStrategy(),
): BattleTransition {
  const state = clone(source)
  const events: BattleEvent[] = []
  const validation = validateCommand(state, command, techniques)
  if (!validation.valid) return { state, events, validation }
  resolveCommand(state, command, techniques, events)
  advance(state, techniques, events, monsterStrategy)
  return { state, events, validation }
}

export function runV2StrategyUntilComplete(
  source: BattleState,
  strategy: BattleStrategy,
  techniques: Readonly<Record<string, TechniqueDefinition>>,
  maximumCommands = 500,
): BattleTransition {
  let state = clone(source)
  const allEvents: BattleEvent[] = []
  let lastValidation: BattleCommandValidation = { valid: true }
  for (let index = 0; index < maximumCommands && state.phase !== 'COMPLETED'; index += 1) {
    if (state.phase !== 'WAITING_FOR_COMMAND') {
      const started = startV2Battle(state, techniques)
      state = started.state
      allEvents.push(...started.events)
      if (state.phase === 'COMPLETED') break
    }
    const context = activeContext(state, techniques)
    if (!context) break
    const command = strategy.selectCommand(context)
    const transition = dispatchV2BattleCommand(state, command, techniques)
    state = transition.state
    allEvents.push(...transition.events)
    lastValidation = transition.validation
    if (!transition.validation.valid) break
  }
  return { state, events: allEvents, validation: lastValidation }
}

export function explainDamage(event: BattleEvent): string | null {
  if (!event.breakdown) return null
  const value = event.breakdown
  return [
    `基础 ${value.base.toFixed(2)}`,
    `缩放 ${value.scaling.toFixed(2)}`,
    `亲和 ×${value.affinityMultiplier.toFixed(2)}`,
    `五行 ×${value.elementMultiplier.toFixed(2)}`,
    `抗性 ×${value.resistanceMultiplier.toFixed(2)}`,
    `防御 ×${value.defenseMultiplier.toFixed(2)}`,
    `会心 ×${value.criticalMultiplier.toFixed(2)}`,
    `状态 ×${value.statusMultiplier.toFixed(2)}`,
    `装备 ×${value.equipmentMultiplier.toFixed(2)}`,
    `最终 ${value.finalAmount}`,
  ].join(' → ')
}

export function getActorElementLabel(actor: BattleActorState): string {
  return ELEMENT_LABELS[actor.element]
}

export function canActorUseTechnique(
  state: BattleState,
  actor: BattleActorState,
  technique: TechniqueDefinition,
): boolean {
  return isTechniqueReady(state, actor, technique) && !isActorControlled(state, actor.id)
}
