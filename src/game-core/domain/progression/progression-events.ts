import type { GrowthStrategyId } from './growth-strategy'
import type { P2TalentId } from './talent-profile'

export type ProgressionEvent =
  | { type: 'cultivation-gained'; amount: number; source: 'battle' | 'offline' | 'pill' | 'dungeon' }
  | { type: 'breakthrough-ready'; realmId: string }
  | { type: 'realm-breakthrough'; previousRealmId: string; realmId: string; strategyId: GrowthStrategyId }
  | { type: 'growth-strategy-changed'; strategyId: GrowthStrategyId }
  | { type: 'talents-confirmed'; mainTalentId: P2TalentId; secondaryTalentId: P2TalentId }

