import { createSeededRandom } from '../../rng'
import type { LegacyCharacterSave } from '../../save/types'
import { createV2EnemyActor, createV2PlayerActor } from './character.adapter'
import { V2_ENEMIES, V2_TECHNIQUES, V2_ZONES, type V2EnemyDefinition } from './content'
import { createV2BattleState, runV2StrategyUntilComplete, startV2Battle } from './state-machine'
import { PlayerAutoStrategy } from './strategies'
import { applyV2RewardBundle, createV2RewardBundle, type V2RewardBundle } from './reward.rules'
import { isV2Resting, startV2RestBelowThreshold } from './recovery.rules'
import type { BattleResult, BattleState } from './types'
import { getV2BalanceConfig, getV2EnemyCatalog, getV2TechniqueCatalog } from './balance.config'
import { applyV2PostBattleRecovery } from './post-battle-recovery.rules'

export const V2_AUTO_GOALS = ['realm', 'gold', 'technique', 'herb'] as const
export type V2AutoGoal = (typeof V2_AUTO_GOALS)[number]
export type V2AutoStopReason = '手动停止' | '角色死亡' | '背包已满' | '补给不足' | '首领战停止' | '达到场次上限' | null

export interface V2AutoConfiguration {
  goal: V2AutoGoal
  healingThreshold: number
  meditationThreshold: number
  hpPillThreshold: number
  mpPillThreshold: number
  stopAtBoss: boolean
  stopWhenInventoryFull: boolean
  zoneIndex: number
}

export interface V2AutoEncounterResult {
  character: LegacyCharacterSave
  state: BattleState
  result: BattleResult
  enemy: V2EnemyDefinition
  reward: V2RewardBundle | null
  stopReason: V2AutoStopReason
  pillsUsed: Record<'回春丹' | '回灵丹', number>
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export function normalizeV2AutoConfiguration(value: unknown, fallbackZone = 0): V2AutoConfiguration {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
  const goal = typeof source.goal === 'string' && (V2_AUTO_GOALS as readonly string[]).includes(source.goal)
    ? source.goal as V2AutoGoal
    : 'realm'
  return {
    goal,
    healingThreshold: Math.max(0.1, Math.min(0.9, Number(source.healingThreshold ?? 0.4))),
    meditationThreshold: Math.max(0.05, Math.min(0.8, Number(source.meditationThreshold ?? 0.2))),
    hpPillThreshold: Math.max(0.05, Math.min(0.95, Number(source.hpPillThreshold ?? 0.3))),
    mpPillThreshold: Math.max(0.05, Math.min(0.95, Number(source.mpPillThreshold ?? 0.2))),
    stopAtBoss: source.stopAtBoss !== false,
    stopWhenInventoryFull: source.stopWhenInventoryFull !== false,
    zoneIndex: Math.max(0, Math.min(V2_ZONES.length - 1, Math.floor(Number(source.zoneIndex ?? fallbackZone)))),
  }
}

function chooseEnemy(zoneIndex: number, seed: string, forceBoss = false, character?: LegacyCharacterSave): V2EnemyDefinition {
  const zone = V2_ZONES[Math.max(0, Math.min(V2_ZONES.length - 1, zoneIndex))]
  const random = createSeededRandom(`${seed}:enemy`)
  const elitePool = zone.eliteIds && zone.eliteIds.length
    ? zone.eliteIds
    : zone.eliteId
      ? [zone.eliteId]
      : []
  const enemyId = forceBoss && zone.bossId
    ? zone.bossId
    : random.chance(0.12) && elitePool.length
      ? random.pick(elitePool)
      : random.pick(zone.mobIds)
  return getV2EnemyCatalog(character)[enemyId]
}

export function prepareV2AutoEncounter(
  character: LegacyCharacterSave,
  config: V2AutoConfiguration,
  now = Date.now(),
): { character: LegacyCharacterSave; pillsUsed: Record<'回春丹' | '回灵丹', number> } {
  return {
    character: startV2RestBelowThreshold(character, config.meditationThreshold, 'auto_threshold', now),
    pillsUsed: { 回春丹: 0, 回灵丹: 0 },
  }
}

export function simulateV2AutoEncounter(
  source: LegacyCharacterSave,
  options: { seed: string; configuration?: unknown; forceEnemyId?: string; forceBoss?: boolean; now?: number },
): V2AutoEncounterResult {
  if (isV2Resting(source)) throw new Error('角色正在调息，不能开始自动战斗')
  const config = normalizeV2AutoConfiguration(options.configuration, Number(source.zone || 0))
  const supplied = prepareV2AutoEncounter(source, config, options.now)
  if (isV2Resting(supplied.character)) throw new Error('角色当前气血达到或低于调息阈值，不能开始自动战斗')
  let character = supplied.character
  const sourcePills = character.v2Pills && typeof character.v2Pills === 'object'
    ? character.v2Pills as Record<string, unknown>
    : {}
  const enemy = options.forceEnemyId ? getV2EnemyCatalog(character)[options.forceEnemyId] : chooseEnemy(config.zoneIndex, options.seed, options.forceBoss, character)
  if (!enemy) throw new Error('自动历练没有可用敌人')
  const initial = createV2BattleState({
    seed: options.seed,
    player: createV2PlayerActor(character),
    enemy: createV2EnemyActor(enemy),
    zoneId: enemy.zoneId,
    enemyContentId: enemy.id,
    boss: enemy.rank === 'boss',
    rewards: { ...enemy.rewards, itemId: null },
    balanceConfig: getV2BalanceConfig(character),
  })
  const techniques = getV2TechniqueCatalog(character)
  const started = startV2Battle(initial, techniques)
  const transition = runV2StrategyUntilComplete(
    started.state,
    new PlayerAutoStrategy(config.healingThreshold, config.hpPillThreshold, config.mpPillThreshold),
    techniques,
    500,
  )
  if (!transition.state.result) throw new Error('自动历练未产生战斗结果')
  const player = transition.state.actors.player
  character = clone(character)
  character.hp = Math.max(0, Math.min(Number(character.maxHp || player.maxHp), player.hp))
  character.mp = Math.max(0, Math.min(Number(character.maxMp || player.maxMp), player.mp))
  const pills = character.v2Pills && typeof character.v2Pills === 'object'
    ? character.v2Pills as Record<string, unknown>
    : {}
  pills.回春丹 = Math.max(0, Math.floor(Number(player.pills?.回春丹 || 0)))
  pills.回灵丹 = Math.max(0, Math.floor(Number(player.pills?.回灵丹 || 0)))
  character.v2Pills = pills
  let reward: V2RewardBundle | null = null
  let stopReason: V2AutoStopReason = null
  if (transition.state.result.outcome === 'victory') {
    const wins = character.v2BossWins && typeof character.v2BossWins === 'object' ? character.v2BossWins as Record<string, unknown> : {}
    const firstClear = enemy.rank === 'boss' && Number(wins[enemy.id] || 0) === 0
    reward = createV2RewardBundle(enemy, character, createSeededRandom(`${options.seed}:loot`), firstClear)
    const applied = applyV2RewardBundle(character, reward, `${transition.state.id}:reward`, 'battle')
    character = applied.character
    character = applyV2PostBattleRecovery(character).character
    if (applied.inventoryFull && config.stopWhenInventoryFull) stopReason = '背包已满'
    if (enemy.rank === 'boss' && config.stopAtBoss) stopReason = '首领战停止'
  } else if (transition.state.result.outcome === 'defeat') {
    character.hp = 1
  }
  character = startV2RestBelowThreshold(character, config.meditationThreshold, 'post_battle', options.now)
  character.v2LastBattle = {
    id: transition.state.id,
    round: transition.state.round,
    outcome: transition.state.result.outcome,
    enemyContentId: enemy.id,
    randomState: transition.state.randomState,
  }
  const pillsUsed = {
    回春丹: Math.max(0, Math.floor(Number(sourcePills.回春丹 || 0)) - Math.floor(Number(pills.回春丹 || 0))),
    回灵丹: Math.max(0, Math.floor(Number(sourcePills.回灵丹 || 0)) - Math.floor(Number(pills.回灵丹 || 0))),
  }
  return { character, state: transition.state, result: transition.state.result, enemy, reward, stopReason, pillsUsed }
}
