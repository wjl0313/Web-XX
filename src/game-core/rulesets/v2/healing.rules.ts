import { DEFAULT_V2_BALANCE_CONFIG, type V2BattleRuntimeConfig, type V2BalanceConfig } from './balance.config'

type V2PillBalanceConfig = Pick<V2BalanceConfig, 'healingPillBase' | 'healingPillPhysiqueScale' | 'manaPillMaximumRatio'>

export const V2_HEALING_PILL_BASE_POWER = DEFAULT_V2_BALANCE_CONFIG.healingPillBase
export const V2_HEALING_PILL_PHYSIQUE_SCALE = DEFAULT_V2_BALANCE_CONFIG.healingPillPhysiqueScale

export function resolveV2HealingPillAmount(
  physique: number,
  configuration: V2PillBalanceConfig | V2BattleRuntimeConfig = DEFAULT_V2_BALANCE_CONFIG,
): number {
  return Math.max(1, Math.floor(
    configuration.healingPillBase
    + Math.max(1, Number(physique) || 1) * configuration.healingPillPhysiqueScale,
  ))
}

export function resolveV2ManaPillAmount(
  maximumMana: number,
  configuration: V2PillBalanceConfig | V2BattleRuntimeConfig = DEFAULT_V2_BALANCE_CONFIG,
): number {
  return Math.max(0, Math.ceil(
    Math.max(0, Number(maximumMana) || 0) * configuration.manaPillMaximumRatio,
  ))
}
