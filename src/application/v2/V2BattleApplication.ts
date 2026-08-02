import {
  V2_ENEMIES,
  V2_TECHNIQUES,
  V2_ZONES,
  applyV2PostBattleRecovery,
  applyV2RewardBundle,
  createV2RewardBundle,
  createV2BattleState,
  createV2EnemyActor,
  createV2PlayerActor,
  dispatchV2BattleCommand,
  runV2StrategyUntilComplete,
  getV2RestRecoveryPerSecond,
  getV2BalanceConfig,
  getV2EnemyCatalog,
  getV2TechniqueCatalog,
  getV2RestThreshold,
  isV2Resting,
  startV2RestBelowThreshold,
  startV2Battle,
  type BattleCommand,
  type BattleEvent,
  type BattleState,
  type BattleStrategy,
} from '../../game-core/rulesets/v2'
import { createSeededRandom } from '../../game-core/rng'
import { type LegacyCharacterSave } from '../../game-core/save'

export type V2BattleNoticeKind = 'info' | 'damage' | 'heal' | 'loot' | 'danger'

export interface V2BattleNotice {
  text: string
  kind: V2BattleNoticeKind
  event: BattleEvent
}

export interface V2BattleApplicationTransition {
  applied: boolean
  character: LegacyCharacterSave
  state: BattleState | null
  completedState: BattleState | null
  notices: V2BattleNotice[]
  validationReason?: string
  inventoryFull?: boolean
  persist: boolean
}

export interface StartV2EncounterOptions {
  seed?: string
  boss?: boolean
  forceEnemyId?: string
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function noticeKind(event: BattleEvent): V2BattleNoticeKind {
  if (event.type === 'DamageDealt' || event.type === 'UnitDefeated') return event.targetId === 'player' ? 'danger' : 'damage'
  if (event.type === 'HealingApplied' || event.type === 'ShieldApplied' || (event.type === 'ResourceChanged' && Number(event.amount || 0) > 0)) return 'heal'
  if (event.type === 'RewardsGranted' || (event.type === 'BattleEnded' && event.result?.outcome === 'victory')) return 'loot'
  if (event.type === 'BattleEnded' && event.result?.outcome === 'defeat') return 'danger'
  return 'info'
}

function toNotices(events: readonly BattleEvent[]): V2BattleNotice[] {
  return events.map((event) => ({ text: event.message, kind: noticeKind(event), event }))
}

function seedNumber(seed: string): number {
  let value = 0
  for (let index = 0; index < seed.length; index += 1) value = Math.imul(value ^ seed.charCodeAt(index), 16_777_619) >>> 0
  return value >>> 0
}

function selectEnemyId(zoneIndex: number, seed: string, boss: boolean): string | null {
  const zone = V2_ZONES.find((entry) => entry.legacyZoneIndex === zoneIndex)
  if (!zone) return null
  if (boss) return zone.bossId || null
  const value = seedNumber(seed)
  if (value % 5 === 0) return zone.eliteId
  return zone.mobIds[value % zone.mobIds.length] || null
}

function applyBattleStateToCharacter(
  source: LegacyCharacterSave,
  state: BattleState,
): { character: LegacyCharacterSave; settlementEvents: BattleEvent[]; inventoryFull: boolean } {
  const character = clone(source) as Record<string, any>
  const settlementEvents: BattleEvent[] = []
  let inventoryFull = false
  const player = state.actors.player
  character.hp = Math.max(0, Math.min(Number(character.maxHp || player.maxHp), player.hp))
  character.mp = Math.max(0, Math.min(Number(character.maxMp || player.maxMp), player.mp))
  if (player.pills) {
    const pills = character.v2Pills && typeof character.v2Pills === 'object'
      ? character.v2Pills as Record<string, unknown>
      : {}
    pills.回春丹 = Math.max(0, Math.floor(Number(player.pills.回春丹 || 0)))
    pills.回灵丹 = Math.max(0, Math.floor(Number(player.pills.回灵丹 || 0)))
    character.v2Pills = pills
  }
  character.v2LastBattle = {
    id: state.id,
    round: state.round,
    outcome: state.result?.outcome || null,
    enemyContentId: state.encounter.enemyContentId,
    randomState: state.randomState,
  }
  if (!state.result) return { character, settlementEvents, inventoryFull }
  const settled = Array.isArray(character.v2SettledBattles) ? character.v2SettledBattles.map(String) : []
  if (settled.includes(state.id)) return { character, settlementEvents, inventoryFull }
  if (state.result.outcome === 'victory') {
    const enemy = getV2EnemyCatalog(character)[state.encounter.enemyContentId] || V2_ENEMIES[state.encounter.enemyContentId]
    if (enemy) {
      const wins = character.v2BossWins && typeof character.v2BossWins === 'object' ? character.v2BossWins as Record<string, unknown> : {}
      const firstClear = enemy.rank === 'boss' && Number(wins[enemy.id] || 0) === 0
      const reward = createV2RewardBundle(enemy, character, createSeededRandom(`${state.id}:${state.randomState}:loot`), firstClear)
      reward.cultivation = state.encounter.rewards.xp
      reward.gold = state.encounter.rewards.gold
      const applied = applyV2RewardBundle(character, reward, `${state.id}:reward`, 'battle')
      Object.assign(character, applied.character)
      inventoryFull = applied.inventoryFull
      character.v2LastReward = reward
    }
    const recovery = applyV2PostBattleRecovery(character)
    Object.assign(character, recovery.character)
    settlementEvents.push({
      sequence: state.eventSequence + settlementEvents.length + 1,
      type: 'HealingApplied', round: state.round, actorId: 'player', targetId: 'player',
      amount: recovery.hp.recovered, valueBefore: recovery.hp.before, valueAfter: recovery.hp.after,
      message: `战胜后恢复 ${recovery.hp.recovered} 点气血（基础 ${Math.floor(recovery.hp.baseAmount)} + 体魄成长 ${Math.floor(recovery.hp.effectiveGrowthAmount)}）。`,
    })
    settlementEvents.push({
      sequence: state.eventSequence + settlementEvents.length + 1,
      type: 'ResourceChanged', round: state.round, actorId: 'player', targetId: 'player',
      amount: recovery.mp.recovered, valueBefore: recovery.mp.before, valueAfter: recovery.mp.after,
      message: `战胜后恢复 ${recovery.mp.recovered} 点法力（基础 ${Math.floor(recovery.mp.baseAmount)} + 神识成长 ${Math.floor(recovery.mp.effectiveGrowthAmount)}）。`,
    })
  } else if (state.result.outcome === 'defeat') {
    if (!character.stats || typeof character.stats !== 'object') character.stats = {}
    character.stats.deaths = Math.max(0, Math.floor(Number(character.stats.deaths || 0))) + 1
    character.hp = 1
  }
  const restingCharacter = startV2RestBelowThreshold(character, getV2RestThreshold(character), 'post_battle')
  Object.assign(character, restingCharacter)
  if (isV2Resting(character)) {
    settlementEvents.push({
      sequence: state.eventSequence + settlementEvents.length + 1,
      type: 'RestStarted',
      round: state.round,
      actorId: 'player',
      targetId: 'player',
      message: `战后气血达到或低于调息阈值，开始调息，每秒恢复 ${getV2RestRecoveryPerSecond(character)} 点气血。`,
    })
  }
  character.v2SettledBattles = [...settled, state.id].slice(-100)
  return { character, settlementEvents, inventoryFull }
}

function appendSettlementEvents(state: BattleState, events: readonly BattleEvent[]): BattleState {
  if (!events.length) return state
  return {
    ...state,
    eventSequence: events[events.length - 1].sequence,
    events: [...state.events, ...events],
  }
}

export class V2BattleApplication {
  private sequence = 0

  startEncounter(
    character: LegacyCharacterSave,
    currentState: BattleState | null,
    options: StartV2EncounterOptions = {},
  ): V2BattleApplicationTransition {
    if (isV2Resting(character)) {
      return {
        applied: false, character, state: currentState, completedState: null,
        notices: [], validationReason: '角色正在调息，气血回满前不能寻敌。', persist: false,
      }
    }
    if (currentState && currentState.phase !== 'COMPLETED') {
      return { applied: false, character, state: currentState, completedState: null, notices: [], persist: false }
    }
    const zoneIndex = Number(character.zone || 0)
    const seed = options.seed || `v2-runtime-${Date.now()}-${++this.sequence}`
    const enemyId = options.forceEnemyId || selectEnemyId(zoneIndex, seed, Boolean(options.boss))
    const enemy = enemyId ? getV2EnemyCatalog(character)[enemyId] : null
    if (!enemy) {
      return {
        applied: false, character, state: null, completedState: null, persist: false,
        validationReason: options.boss ? '当前区域没有可挑战的首领。' : '当前区域尚未开放斗法。', notices: [],
      }
    }
    const state = createV2BattleState({
      seed,
      player: createV2PlayerActor(character),
      enemy: createV2EnemyActor(enemy),
      zoneId: enemy.zoneId,
      enemyContentId: enemy.id,
      boss: enemy.rank === 'boss',
      rewards: { ...enemy.rewards, itemId: null },
      balanceConfig: getV2BalanceConfig(character),
    })
    const started = startV2Battle(state, getV2TechniqueCatalog(character))
    const completed = started.state.phase === 'COMPLETED'
    const settlement = applyBattleStateToCharacter(character, started.state)
    const completedState = completed ? appendSettlementEvents(started.state, settlement.settlementEvents) : null
    return {
      applied: true,
      character: settlement.character,
      state: completed ? null : started.state,
      completedState,
      notices: toNotices([...started.events, ...settlement.settlementEvents]),
      inventoryFull: settlement.inventoryFull,
      persist: completed || settlement.character.hp !== character.hp || settlement.character.mp !== character.mp,
    }
  }

  executeCommand(
    character: LegacyCharacterSave,
    currentState: BattleState | null,
    command: BattleCommand,
  ): V2BattleApplicationTransition {
    if (!currentState) return { applied: false, character, state: null, completedState: null, notices: [], validationReason: '当前没有战斗。', persist: false }
    const transition = dispatchV2BattleCommand(currentState, command, getV2TechniqueCatalog(character))
    if (!transition.validation.valid) {
      return { applied: false, character, state: currentState, completedState: null, notices: [], validationReason: transition.validation.reason, persist: false }
    }
    const settlement = applyBattleStateToCharacter(character, transition.state)
    const completed = transition.state.phase === 'COMPLETED'
    const completedState = completed ? appendSettlementEvents(transition.state, settlement.settlementEvents) : null
    return {
      applied: true,
      character: settlement.character,
      state: completed ? null : transition.state,
      completedState,
      notices: toNotices([...transition.events, ...settlement.settlementEvents]),
      inventoryFull: settlement.inventoryFull,
      persist: true,
    }
  }

  executeStrategy(
    character: LegacyCharacterSave,
    currentState: BattleState | null,
    strategy: BattleStrategy,
    maximumCommands = 500,
  ): V2BattleApplicationTransition {
    if (!currentState) return { applied: false, character, state: null, completedState: null, notices: [], validationReason: '当前没有战斗。', persist: false }
    const transition = runV2StrategyUntilComplete(currentState, strategy, getV2TechniqueCatalog(character), maximumCommands)
    const settlement = applyBattleStateToCharacter(character, transition.state)
    const completed = transition.state.phase === 'COMPLETED'
    const completedState = completed ? appendSettlementEvents(transition.state, settlement.settlementEvents) : null
    return {
      applied: transition.events.length > 0,
      character: settlement.character,
      state: completed ? null : transition.state,
      completedState,
      notices: toNotices([...transition.events, ...settlement.settlementEvents]),
      validationReason: transition.validation.valid ? undefined : transition.validation.reason,
      inventoryFull: settlement.inventoryFull,
      persist: transition.events.length > 0,
    }
  }
}
