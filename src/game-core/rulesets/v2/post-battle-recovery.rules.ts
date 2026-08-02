import type { LegacyCharacterSave } from '../../save/types'
import { getV2BalanceConfig, type V2BalanceConfig } from './balance.config'

export interface V2PostBattleResourceRecovery {
  resource: 'hp' | 'mp'
  maximum: number
  before: number
  missing: number
  attribute: number
  level: number
  baseAmount: number
  rawGrowthAmount: number
  growthSoftCapAmount: number
  effectiveGrowthAmount: number
  maximumRecoveryAmount: number
  calculatedAmount: number
  recovered: number
  after: number
  recoveredRatio: number
}

export interface V2PostBattleRecoveryBreakdown {
  hp: V2PostBattleResourceRecovery
  mp: V2PostBattleResourceRecovery
}

export interface V2PostBattleRecoveryResult extends V2PostBattleRecoveryBreakdown {
  character: LegacyCharacterSave
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function calculateResourceRecovery(input: {
  resource: 'hp' | 'mp'
  maximum: number
  current: number
  attribute: number
  level: number
  baseRatio: number
  attributeLevelScale: number
  growthSoftCapRatio: number
  maximumRatio: number
}): V2PostBattleResourceRecovery {
  const maximum = Math.max(input.resource === 'hp' ? 1 : 0, Math.floor(Number(input.maximum) || 0))
  const before = Math.max(0, Math.min(maximum, Math.floor(Number(input.current) || 0)))
  const missing = maximum - before
  const attribute = Math.max(1, Math.floor(Number(input.attribute) || 1))
  const level = Math.max(1, Math.floor(Number(input.level) || 1))
  const baseAmount = maximum * Math.max(0, input.baseRatio)
  const rawGrowthAmount = attribute * level * Math.max(0, input.attributeLevelScale)
  const growthSoftCapAmount = Math.max(1, maximum * Math.max(0.0001, input.growthSoftCapRatio))
  const effectiveGrowthAmount = rawGrowthAmount / (1 + rawGrowthAmount / growthSoftCapAmount)
  const maximumRecoveryAmount = maximum * Math.max(0, input.maximumRatio)
  const calculatedAmount = Math.max(0, Math.floor(Math.min(baseAmount + effectiveGrowthAmount, maximumRecoveryAmount)))
  const recovered = Math.min(missing, calculatedAmount)
  return {
    resource: input.resource,
    maximum,
    before,
    missing,
    attribute,
    level,
    baseAmount,
    rawGrowthAmount,
    growthSoftCapAmount,
    effectiveGrowthAmount,
    maximumRecoveryAmount,
    calculatedAmount,
    recovered,
    after: before + recovered,
    recoveredRatio: maximum > 0 ? recovered / maximum : 0,
  }
}

export function calculateV2PostBattleRecovery(
  character: LegacyCharacterSave,
  configuration: V2BalanceConfig = getV2BalanceConfig(character),
): V2PostBattleRecoveryBreakdown {
  const abilities = record(character.abilities)
  const level = Math.max(1, Math.floor(Number(character.level || 1)))
  return {
    hp: calculateResourceRecovery({
      resource: 'hp', maximum: Number(character.maxHp || 1), current: Number(character.hp || 0),
      attribute: Number(abilities.str || 10), level,
      baseRatio: configuration.postBattleHpBaseRatio,
      attributeLevelScale: configuration.postBattleHpAttributeLevelScale,
      growthSoftCapRatio: configuration.postBattleHpGrowthSoftCapRatio,
      maximumRatio: configuration.postBattleHpMaximumRatio,
    }),
    mp: calculateResourceRecovery({
      resource: 'mp', maximum: Number(character.maxMp || 0), current: Number(character.mp || 0),
      attribute: Number(abilities.wis || 10), level,
      baseRatio: configuration.postBattleMpBaseRatio,
      attributeLevelScale: configuration.postBattleMpAttributeLevelScale,
      growthSoftCapRatio: configuration.postBattleMpGrowthSoftCapRatio,
      maximumRatio: configuration.postBattleMpMaximumRatio,
    }),
  }
}

export function applyV2PostBattleRecovery(
  source: LegacyCharacterSave,
  configuration: V2BalanceConfig = getV2BalanceConfig(source),
): V2PostBattleRecoveryResult {
  const character = clone(source)
  const breakdown = calculateV2PostBattleRecovery(character, configuration)
  character.hp = breakdown.hp.after
  character.mp = breakdown.mp.after
  return { character, ...breakdown }
}

