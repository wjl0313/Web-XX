import {
  getV2ProgressionState,
  migrateV2Progression,
  performV2Breakthrough,
  setV2GrowthStrategy,
  type GrowthStrategyId,
  type V2ProgressionState,
} from '../../game-core/domain/progression'
import type { LegacyCharacterSave } from '../../game-core/save/types'
import { getV2GameBalanceConfig, type V2BalanceClassId, type V2GrowthStatKey } from '../../game-core/rulesets/v2'
import { normalizeCharacterClassId } from '../../game-core/domain'

export class V2ProgressionApplication {
  migrate(character: LegacyCharacterSave): LegacyCharacterSave {
    return migrateV2Progression(character)
  }

  getState(character: LegacyCharacterSave): V2ProgressionState {
    return getV2ProgressionState(character)
  }

  setGrowthStrategy(character: LegacyCharacterSave, strategyId: GrowthStrategyId): LegacyCharacterSave {
    return setV2GrowthStrategy(character, strategyId).character
  }

  breakthrough(character: LegacyCharacterSave, battleActive = false): LegacyCharacterSave | null {
    if (battleActive) return null
    const configuration = getV2GameBalanceConfig(character)
    const progression = getV2ProgressionState(character)
    const base = configuration.growthStrategies[progression.growthStrategyId]?.gains
    const classId = normalizeCharacterClassId(character.cls) as V2BalanceClassId | null
    const multipliers = classId ? configuration.classes[classId]?.growthMultipliers : null
    const gains = base && multipliers ? Object.fromEntries(Object.entries(base).map(([key, value]) => [
      key, Math.max(0, Math.floor(Number(value) * Number(multipliers[key as V2GrowthStatKey] || 0))),
    ])) : undefined
    return performV2Breakthrough(character, gains)?.character || null
  }
}
