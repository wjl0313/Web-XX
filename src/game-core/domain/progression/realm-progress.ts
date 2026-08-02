import type { GrowthStrategyId } from './growth-strategy'
import { GROWTH_STRATEGIES, normalizeGrowthStrategy } from './growth-strategy'

export interface RealmDefinition {
  id: string
  displayName: string
  stage: '炼气' | '筑基' | '结丹' | '元婴'
  cultivationRequired: number
  minimumLegacyLevel: number
  available: boolean
}

const qi = Array.from({ length: 13 }, (_, index): RealmDefinition => ({
  id: `qi-${index + 1}`,
  displayName: `炼气${['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三'][index]}层`,
  stage: '炼气',
  cultivationRequired: 120 + index * 45,
  minimumLegacyLevel: index + 1,
  available: true,
}))

export const P2_REALMS: readonly RealmDefinition[] = Object.freeze([
  ...qi,
  { id: 'foundation-early', displayName: '筑基初期', stage: '筑基', cultivationRequired: 1_100, minimumLegacyLevel: 14, available: true },
  { id: 'foundation-middle', displayName: '筑基中期', stage: '筑基', cultivationRequired: 1_600, minimumLegacyLevel: 20, available: true },
  { id: 'foundation-late', displayName: '筑基后期', stage: '筑基', cultivationRequired: 2_300, minimumLegacyLevel: 27, available: true },
  { id: 'core-early', displayName: '结丹初期', stage: '结丹', cultivationRequired: 3_400, minimumLegacyLevel: 35, available: true },
  { id: 'core-middle', displayName: '结丹中期', stage: '结丹', cultivationRequired: 4_800, minimumLegacyLevel: 44, available: true },
  { id: 'core-late', displayName: '结丹后期', stage: '结丹', cultivationRequired: 6_500, minimumLegacyLevel: 54, available: true },
  { id: 'nascent-early', displayName: '元婴初期', stage: '元婴', cultivationRequired: 9_000, minimumLegacyLevel: 65, available: false },
])

export const P2_PUBLIC_REALM_CAP_ID = 'core-late'

export interface RealmProgress {
  realmId: string
  cultivation: number
  cultivationRequired: number
  breakthroughs: number
}

export function getRealmDefinition(realmId: unknown): RealmDefinition {
  return P2_REALMS.find((entry) => entry.id === realmId) || P2_REALMS[0]
}

export function createRealmProgressFromLegacy(level: unknown, xp: unknown): RealmProgress {
  const normalizedLevel = Math.max(1, Math.floor(Number(level) || 1))
  const index = Math.max(0, Math.min(P2_REALMS.findIndex((realm, realmIndex) => {
    const next = P2_REALMS[realmIndex + 1]
    return normalizedLevel >= realm.minimumLegacyLevel && (!next || normalizedLevel < next.minimumLegacyLevel)
  }), P2_REALMS.findIndex((entry) => entry.id === P2_PUBLIC_REALM_CAP_ID)))
  const realm = P2_REALMS[index >= 0 ? index : 0]
  return {
    realmId: realm.id,
    cultivation: Math.max(0, Math.min(realm.cultivationRequired, Math.floor(Number(xp) || 0))),
    cultivationRequired: realm.cultivationRequired,
    breakthroughs: index,
  }
}

export function normalizeRealmProgress(value: unknown, legacyLevel = 1, legacyXp = 0): RealmProgress {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return createRealmProgressFromLegacy(legacyLevel, legacyXp)
  const source = value as Record<string, unknown>
  const realm = getRealmDefinition(source.realmId)
  const capIndex = P2_REALMS.findIndex((entry) => entry.id === P2_PUBLIC_REALM_CAP_ID)
  const realmIndex = Math.max(0, Math.min(P2_REALMS.indexOf(realm), capIndex))
  const allowed = P2_REALMS[realmIndex]
  return {
    realmId: allowed.id,
    cultivation: Math.max(0, Math.min(allowed.cultivationRequired, Math.floor(Number(source.cultivation) || 0))),
    cultivationRequired: allowed.cultivationRequired,
    breakthroughs: Math.max(realmIndex, Math.floor(Number(source.breakthroughs) || 0)),
  }
}

export function addRealmCultivation(progress: RealmProgress, amount: number): RealmProgress {
  const realm = getRealmDefinition(progress.realmId)
  return {
    ...progress,
    cultivation: Math.min(realm.cultivationRequired, progress.cultivation + Math.max(0, Math.floor(amount))),
    cultivationRequired: realm.cultivationRequired,
  }
}

export function canBreakthroughRealm(progress: RealmProgress): boolean {
  const currentIndex = P2_REALMS.findIndex((entry) => entry.id === progress.realmId)
  const capIndex = P2_REALMS.findIndex((entry) => entry.id === P2_PUBLIC_REALM_CAP_ID)
  return currentIndex >= 0 && currentIndex < capIndex && progress.cultivation >= progress.cultivationRequired
}

export interface BreakthroughResult {
  progress: RealmProgress
  strategyId: GrowthStrategyId
  gains: ReturnType<typeof getBreakthroughGains>
}

export function getBreakthroughGains(strategyId: unknown) {
  return { ...GROWTH_STRATEGIES[normalizeGrowthStrategy(strategyId)].gains }
}

export function breakthroughRealm(progress: RealmProgress, strategyId: unknown): BreakthroughResult | null {
  if (!canBreakthroughRealm(progress)) return null
  const currentIndex = P2_REALMS.findIndex((entry) => entry.id === progress.realmId)
  const next = P2_REALMS[currentIndex + 1]
  const strategy = normalizeGrowthStrategy(strategyId)
  return {
    progress: {
      realmId: next.id,
      cultivation: 0,
      cultivationRequired: next.cultivationRequired,
      breakthroughs: progress.breakthroughs + 1,
    },
    strategyId: strategy,
    gains: getBreakthroughGains(strategy),
  }
}

