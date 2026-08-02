import { createSeededRandom } from '../../rng'
import type { LegacyCharacterSave } from '../../save/types'
import { V2_ENEMIES, V2_ZONES } from './content'
import { normalizeV2AutoConfiguration, prepareV2AutoEncounter, simulateV2AutoEncounter, type V2AutoStopReason } from './auto-battle'
import { applyV2RewardBundle, createV2RewardBundle } from './reward.rules'
import {
  advanceV2PassiveMana,
  advanceV2Rest,
  getV2RestActionState,
  getV2RestRemainingMs,
  isV2Resting,
} from './recovery.rules'

export const V2_OFFLINE_EXACT_LIMIT_MS = 15 * 60_000
export const V2_OFFLINE_MAX_MS = 8 * 60 * 60_000

export interface V2OfflineSummary {
  mode: 'exact' | 'aggregate'
  elapsedMs: number
  simulatedMs: number
  fights: number
  victories: number
  defeats: number
  cultivation: number
  gold: number
  equipment: number
  techniques: number
  herbs: number
  pillsUsed: number
  stopReason: V2AutoStopReason | '离线时间耗尽'
}

export interface V2OfflineResult {
  character: LegacyCharacterSave
  summary: V2OfflineSummary
}

function totalCount(value: unknown): number {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 0
  return Object.values(value).reduce((sum, count) => sum + Math.max(0, Math.floor(Number(count) || 0)), 0)
}

function snapshot(character: LegacyCharacterSave) {
  return {
    cultivation: Number((character.v2Progression as any)?.realm?.cultivation || 0),
    gold: Number(character.gold || 0),
    equipment: Array.isArray(character.inventory) ? character.inventory.length : 0,
    techniques: Array.isArray(character.v2KnownTechniques) ? character.v2KnownTechniques.length : 0,
    herbs: totalCount(character.v2Herbs),
    pills: totalCount(character.v2Pills),
  }
}

export function simulateV2Offline(
  source: LegacyCharacterSave,
  options: { elapsedMs: number; seed: string; configuration?: unknown },
): V2OfflineResult {
  const elapsedMs = Math.max(0, Math.min(V2_OFFLINE_MAX_MS, Math.floor(options.elapsedMs)))
  const mode = elapsedMs <= V2_OFFLINE_EXACT_LIMIT_MS ? 'exact' : 'aggregate'
  const config = normalizeV2AutoConfiguration(options.configuration, Number(source.zone || 0))
  const before = snapshot(source)
  let character = prepareV2AutoEncounter(source, config, 1_000_000).character
  let fights = 0
  let victories = 0
  let defeats = 0
  let stopReason: V2OfflineSummary['stopReason'] = '离线时间耗尽'
  let simulatedMs = 0
  const simulationEpoch = 1_000_000
  character = advanceV2PassiveMana(character, simulationEpoch).character

  const exactBudget = mode === 'exact' ? Math.max(0, Math.floor(elapsedMs / 20_000)) : 12
  let roundsTotal = 0
  for (let index = 0; index < exactBudget && simulatedMs < elapsedMs; index += 1) {
    character = advanceV2PassiveMana(character, simulationEpoch + simulatedMs).character
    if (isV2Resting(character)) {
      const state = getV2RestActionState(character)!
      const recoveryDuration = Math.min(elapsedMs - simulatedMs, getV2RestRemainingMs(character))
      character = advanceV2Rest(character, state.lastRecoveredAt + recoveryDuration).character
      simulatedMs += recoveryDuration
      character = advanceV2PassiveMana(character, simulationEpoch + simulatedMs).character
      if (isV2Resting(character) || simulatedMs >= elapsedMs) break
    }
    const encounter = simulateV2AutoEncounter(character, {
      seed: `${options.seed}:sample:${index}`,
      configuration: config,
      now: simulationEpoch + simulatedMs,
    })
    character = encounter.character
    fights += 1
    roundsTotal += encounter.state.round
    simulatedMs += Math.max(8_000, encounter.state.round * 1_500)
    character = advanceV2PassiveMana(character, simulationEpoch + simulatedMs).character
    if (encounter.result.outcome === 'victory') victories += 1
    else defeats += 1
    if (encounter.stopReason) {
      stopReason = encounter.stopReason
      break
    }
  }

  if (mode === 'aggregate' && !stopReason.startsWith('角色') && stopReason !== '背包已满' && simulatedMs < elapsedMs && fights > 0) {
    const random = createSeededRandom(`${options.seed}:aggregate`)
    const averageDuration = Math.max(8_000, Math.floor((roundsTotal / fights) * 1_500))
    const remainingFights = Math.max(0, Math.floor((elapsedMs - simulatedMs) / averageDuration))
    const winRate = victories / Math.max(1, fights)
    for (let index = 0; index < remainingFights; index += 1) {
      fights += 1
      simulatedMs += averageDuration
      if (!random.chance(winRate)) {
        defeats += 1
        character.hp = 1
        continue
      }
      victories += 1
      const zone = config.zoneIndex
      const candidates = Object.values(V2_ENEMIES).filter((enemy) => enemy.zoneId === V2_ZONES[zone]?.id && enemy.rank !== 'boss')
      const enemy = random.pick(candidates)
      const reward = createV2RewardBundle(enemy, character, random, false)
      const applied = applyV2RewardBundle(character, reward, `${options.seed}:aggregate:${index}`, 'offline')
      character = applied.character
      if (applied.inventoryFull && config.stopWhenInventoryFull) {
        stopReason = '背包已满'
        break
      }
    }
  }

  character = advanceV2PassiveMana(character, simulationEpoch + elapsedMs).character

  const after = snapshot(character)
  character.v2LastOfflineAt = Date.now()
  return {
    character,
    summary: {
      mode,
      elapsedMs: options.elapsedMs,
      simulatedMs: Math.min(elapsedMs, simulatedMs),
      fights,
      victories,
      defeats,
      cultivation: Math.max(0, after.cultivation - before.cultivation),
      gold: Math.max(0, after.gold - before.gold),
      equipment: Math.max(0, after.equipment - before.equipment),
      techniques: Math.max(0, after.techniques - before.techniques),
      herbs: Math.max(0, after.herbs - before.herbs),
      pillsUsed: Math.max(0, before.pills - after.pills),
      stopReason,
    },
  }
}
