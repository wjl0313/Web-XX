export const GROWTH_STRATEGY_IDS = ['balanced', 'body', 'agility', 'spirit', 'defense'] as const
export type GrowthStrategyId = (typeof GROWTH_STRATEGY_IDS)[number]

export interface GrowthStrategyProfile {
  id: GrowthStrategyId
  displayName: string
  description: string
  gains: Record<'maxHp' | 'maxMp' | 'atk' | 'def' | 'str' | 'dex' | 'con' | 'wis', number>
}

export const GROWTH_STRATEGIES: Readonly<Record<GrowthStrategyId, GrowthStrategyProfile>> = Object.freeze({
  balanced: { id: 'balanced', displayName: '均衡修行', description: '各项基础属性平均成长。', gains: { maxHp: 8, maxMp: 6, atk: 2, def: 2, str: 1, dex: 1, con: 1, wis: 1 } },
  body: { id: 'body', displayName: '炼体', description: '偏向气血、攻击与体魄。', gains: { maxHp: 14, maxMp: 2, atk: 3, def: 1, str: 2, dex: 0, con: 2, wis: 0 } },
  agility: { id: 'agility', displayName: '身法', description: '偏向身法、会心与闪避。', gains: { maxHp: 6, maxMp: 4, atk: 2, def: 1, str: 0, dex: 3, con: 1, wis: 0 } },
  spirit: { id: 'spirit', displayName: '神识', description: '偏向法力、功法威力与神识。', gains: { maxHp: 4, maxMp: 14, atk: 1, def: 1, str: 0, dex: 0, con: 1, wis: 3 } },
  defense: { id: 'defense', displayName: '固守', description: '偏向防御、根骨与抗性。', gains: { maxHp: 10, maxMp: 3, atk: 1, def: 4, str: 0, dex: 0, con: 3, wis: 0 } },
})

export function normalizeGrowthStrategy(value: unknown): GrowthStrategyId {
  return typeof value === 'string' && (GROWTH_STRATEGY_IDS as readonly string[]).includes(value)
    ? value as GrowthStrategyId
    : 'balanced'
}

