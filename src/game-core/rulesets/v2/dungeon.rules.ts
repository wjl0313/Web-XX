import { createSeededRandom } from '../../rng'
import type { LegacyCharacterSave } from '../../save/types'
import { createV2EnemyActor, createV2PlayerActor } from './character.adapter'
import { V2_ENEMIES, V2_TECHNIQUES, type V2EnemyDefinition } from './content'
import { applyV2RewardBundle, createV2RewardBundle } from './reward.rules'
import { PlayerAutoStrategy } from './strategies'
import { createV2BattleState, runV2StrategyUntilComplete, startV2Battle } from './state-machine'
import { getV2RestThreshold, isV2Resting, startV2RestBelowThreshold } from './recovery.rules'
import type { BattleActorState, BattleState } from './types'
import { getV2BalanceConfig, getV2EnemyCatalog, getV2TechniqueCatalog } from './balance.config'
import { applyV2PostBattleRecovery } from './post-battle-recovery.rules'

export const P2_DUNGEON_MODIFIERS = {
  spirit_pressure: { id: 'spirit_pressure', name: '灵压加重', enemyHp: 1.12, enemyAttack: 1.05, enemyDefense: 1.08, reward: 1.15 },
  five_phase_turbulence: { id: 'five_phase_turbulence', name: '五行紊乱', enemyHp: 1.05, enemyAttack: 1.08, enemyDefense: 1.12, reward: 1.2 },
  blood_trial: { id: 'blood_trial', name: '血战试炼', enemyHp: 0.95, enemyAttack: 1.18, enemyDefense: 1, reward: 1.2 },
} as const

export type P2DungeonModifierId = keyof typeof P2_DUNGEON_MODIFIERS

export interface P2DungeonState {
  active: boolean
  floor: number
  checkpoint: number
  best: number
  modifierId: P2DungeonModifierId
  autoDive: boolean
  firstClearFloors: number[]
}

export interface P2DungeonFloorResult {
  character: LegacyCharacterSave
  dungeon: P2DungeonState
  battle: BattleState
  victory: boolean
  stopReason: '死亡退出' | '抵达二十层' | null
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export function getP2DungeonState(character: LegacyCharacterSave): P2DungeonState {
  const source = character.v2Dungeon && typeof character.v2Dungeon === 'object' ? character.v2Dungeon as Record<string, unknown> : {}
  const modifierId = typeof source.modifierId === 'string' && source.modifierId in P2_DUNGEON_MODIFIERS
    ? source.modifierId as P2DungeonModifierId
    : 'spirit_pressure'
  return {
    active: source.active === true,
    floor: Math.max(1, Math.min(20, Math.floor(Number(source.floor) || 1))),
    checkpoint: Math.max(1, Math.min(20, Math.floor(Number(source.checkpoint) || 1))),
    best: Math.max(0, Math.min(20, Math.floor(Number(source.best) || 0))),
    modifierId,
    autoDive: source.autoDive === true,
    firstClearFloors: Array.isArray(source.firstClearFloors) ? source.firstClearFloors.map(Number).filter((floor) => floor >= 1 && floor <= 20) : [],
  }
}

export function enterP2Dungeon(source: LegacyCharacterSave, modifierId: P2DungeonModifierId, autoDive = false): LegacyCharacterSave {
  const next = clone(source)
  const dungeon = getP2DungeonState(next)
  dungeon.active = true
  dungeon.floor = dungeon.checkpoint
  dungeon.modifierId = modifierId in P2_DUNGEON_MODIFIERS ? modifierId : 'spirit_pressure'
  dungeon.autoDive = autoDive
  next.v2Dungeon = dungeon
  return next
}

function dungeonEnemyDefinition(floor: number, seed: string, character: LegacyCharacterSave): V2EnemyDefinition {
  const random = createSeededRandom(`${seed}:dungeon-enemy`)
  const rank = floor % 5 === 0 ? 'boss' : floor % 5 === 3 ? 'elite' : 'normal'
  const pool = Object.values(getV2EnemyCatalog(character)).filter((enemy) => enemy.rank === rank)
  return random.pick(pool)
}

function scaleDungeonActor(actor: BattleActorState, floor: number, modifierId: P2DungeonModifierId): BattleActorState {
  const modifier = P2_DUNGEON_MODIFIERS[modifierId]
  const floorScale = 1 + (floor - 1) * 0.055
  const next = clone(actor)
  next.level = Math.max(next.level, floor)
  next.maxHp = Math.max(1, Math.floor(next.maxHp * floorScale * modifier.enemyHp))
  next.hp = next.maxHp
  next.attack = Math.max(1, Math.floor(next.attack * floorScale * modifier.enemyAttack))
  next.defense = Math.max(0, Math.floor(next.defense * floorScale * modifier.enemyDefense))
  next.agility = Math.max(0, Math.floor(next.agility * (1 + (floor - 1) * 0.018)))
  return next
}

export function challengeP2DungeonFloor(source: LegacyCharacterSave, seed: string): P2DungeonFloorResult | null {
  let character = clone(source)
  const dungeon = getP2DungeonState(character)
  if (!dungeon.active) return null
  const floor = dungeon.floor
  const definition = dungeonEnemyDefinition(floor, seed, character)
  const enemy = scaleDungeonActor(createV2EnemyActor(definition), floor, dungeon.modifierId)
  const rewardMultiplier = P2_DUNGEON_MODIFIERS[dungeon.modifierId].reward * (1 + (floor - 1) * 0.04)
  const state = createV2BattleState({
    seed,
    player: createV2PlayerActor(character),
    enemy,
    zoneId: 'mystic_bamboo_dungeon',
    enemyContentId: `dungeon-floor-${floor}:${definition.id}`,
    boss: floor % 5 === 0,
    rewards: { xp: Math.floor(definition.rewards.xp * rewardMultiplier), gold: Math.floor(definition.rewards.gold * rewardMultiplier), itemId: null },
    balanceConfig: getV2BalanceConfig(character),
  })
  const techniques = getV2TechniqueCatalog(character)
  const started = startV2Battle(state, techniques)
  const transition = runV2StrategyUntilComplete(started.state, new PlayerAutoStrategy(), techniques, 500)
  const player = transition.state.actors.player
  character.hp = Math.max(0, Math.min(Number(character.maxHp || player.maxHp), player.hp))
  character.mp = Math.max(0, Math.min(Number(character.maxMp || player.maxMp), player.mp))
  const pills = character.v2Pills && typeof character.v2Pills === 'object'
    ? character.v2Pills as Record<string, unknown>
    : {}
  pills.回春丹 = Math.max(0, Math.floor(Number(player.pills?.回春丹 || 0)))
  pills.回灵丹 = Math.max(0, Math.floor(Number(player.pills?.回灵丹 || 0)))
  character.v2Pills = pills
  const victory = transition.state.result?.outcome === 'victory'
  let stopReason: P2DungeonFloorResult['stopReason'] = null
  if (victory) {
    const firstClear = !dungeon.firstClearFloors.includes(floor)
    const reward = createV2RewardBundle({ ...definition, rewards: transition.state.encounter.rewards }, character, createSeededRandom(`${seed}:loot`), firstClear)
    reward.materials.秘境玄晶 = Number(reward.materials.秘境玄晶 || 0) + (floor % 5 === 0 ? 2 : 1)
    const applied = applyV2RewardBundle(character, reward, `dungeon:${floor}:${seed}`, 'dungeon')
    character = applied.character
    character = applyV2PostBattleRecovery(character).character
    if (firstClear) dungeon.firstClearFloors.push(floor)
    dungeon.best = Math.max(dungeon.best, floor)
    if (floor % 5 === 0) dungeon.checkpoint = Math.min(20, floor + 1)
    if (floor >= 20) {
      dungeon.active = false
      stopReason = '抵达二十层'
    } else dungeon.floor = floor + 1
  } else {
    dungeon.active = false
    dungeon.floor = dungeon.checkpoint
    character.hp = 1
    stopReason = '死亡退出'
  }
  character.v2Dungeon = dungeon
  character = startV2RestBelowThreshold(character, getV2RestThreshold(character), 'post_battle')
  return { character, dungeon, battle: transition.state, victory, stopReason }
}

export function autoDiveP2Dungeon(source: LegacyCharacterSave, seed: string, maximumFloors = 20): { character: LegacyCharacterSave; results: P2DungeonFloorResult[] } {
  let character = clone(source)
  const results: P2DungeonFloorResult[] = []
  for (let index = 0; index < maximumFloors; index += 1) {
    const result = challengeP2DungeonFloor(character, `${seed}:${index}`)
    if (!result) break
    results.push(result)
    character = result.character
    if (result.stopReason || !result.dungeon.active || isV2Resting(character)) break
  }
  return { character, results }
}
