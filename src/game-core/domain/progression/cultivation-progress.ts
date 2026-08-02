import type { LegacyCharacterSave } from '../../save/types'
import { addRealmCultivation, breakthroughRealm, canBreakthroughRealm, normalizeRealmProgress, type RealmProgress } from './realm-progress'
import { normalizeP2RootId, type P2RootId } from './root-profile'
import { createTalentChoices, isP2TalentId, type P2TalentId } from './talent-profile'
import { normalizeGrowthStrategy, type GrowthStrategyId } from './growth-strategy'
import type { ProgressionEvent } from './progression-events'

export const P2_PROGRESSION_VERSION = 2

export interface V2ProgressionState {
  version: typeof P2_PROGRESSION_VERSION
  rootId: P2RootId
  mainTalentId: P2TalentId
  secondaryTalentId: P2TalentId
  talentChoices: P2TalentId[]
  realm: RealmProgress
  growthStrategyId: GrowthStrategyId
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export function createV2ProgressionState(input: {
  rootId?: unknown
  mainTalentId?: unknown
  secondaryTalentId?: unknown
  talentSeed: string
  legacyLevel?: unknown
  legacyXp?: unknown
  growthStrategyId?: unknown
}): V2ProgressionState {
  const choices = createTalentChoices(input.talentSeed, 3)
  const main = isP2TalentId(input.mainTalentId) && choices.includes(input.mainTalentId) ? input.mainTalentId : choices[0]
  const secondary = isP2TalentId(input.secondaryTalentId) && input.secondaryTalentId !== main
    ? input.secondaryTalentId
    : choices.find((entry) => entry !== main) || P2_TALENT_IDS_FALLBACK(main)
  return {
    version: P2_PROGRESSION_VERSION,
    rootId: normalizeP2RootId(input.rootId),
    mainTalentId: main,
    secondaryTalentId: secondary,
    talentChoices: choices,
    realm: normalizeRealmProgress(null, Number(input.legacyLevel || 1), Number(input.legacyXp || 0)),
    growthStrategyId: normalizeGrowthStrategy(input.growthStrategyId),
  }
}

function P2_TALENT_IDS_FALLBACK(excluded: P2TalentId): P2TalentId {
  return createTalentChoices(`fallback:${excluded}`, 2).find((entry) => entry !== excluded) || '身轻如燕'
}

export function getV2ProgressionState(character: LegacyCharacterSave): V2ProgressionState {
  const source = character.v2Progression && typeof character.v2Progression === 'object'
    ? character.v2Progression as Record<string, unknown>
    : {}
  const seed = String(character.v2TalentSeed || `${character.name || '修士'}:${character.createdAt || character.created || 0}`)
  const created = createV2ProgressionState({
    rootId: source.rootId,
    mainTalentId: source.mainTalentId,
    secondaryTalentId: source.secondaryTalentId,
    talentSeed: seed,
    legacyLevel: character.level,
    legacyXp: character.xp,
    growthStrategyId: source.growthStrategyId,
  })
  const choices = Array.isArray(source.talentChoices)
    ? source.talentChoices.filter(isP2TalentId).slice(0, 3)
    : created.talentChoices
  return {
    ...created,
    talentChoices: choices.length === 3 ? choices : created.talentChoices,
    realm: normalizeRealmProgress(source.realm, Number(character.level || 1), Number(character.xp || 0)),
  }
}

export function migrateV2Progression(character: LegacyCharacterSave): LegacyCharacterSave {
  const next = clone(character)
  if (next.ruleset !== 'v2') return next
  next.v2Progression = getV2ProgressionState(next)
  next.v2ProgressionVersion = P2_PROGRESSION_VERSION
  next.v2TalentSeed = String(next.v2TalentSeed || `${next.name || '修士'}:${next.createdAt || next.created || 0}`)
  return next
}

export function addV2Cultivation(
  character: LegacyCharacterSave,
  rawAmount: number,
  source: 'battle' | 'offline' | 'pill' | 'dungeon',
): { character: LegacyCharacterSave; events: ProgressionEvent[]; applied: number } {
  const next = migrateV2Progression(character)
  const progression = getV2ProgressionState(next)
  const amount = Math.max(0, Math.floor(rawAmount))
  const before = progression.realm.cultivation
  progression.realm = addRealmCultivation(progression.realm, amount)
  const applied = progression.realm.cultivation - before
  next.v2Progression = progression
  next.xp = progression.realm.cultivation
  next.xpNext = progression.realm.cultivationRequired
  const events: ProgressionEvent[] = [{ type: 'cultivation-gained', amount: applied, source }]
  if (canBreakthroughRealm(progression.realm)) events.push({ type: 'breakthrough-ready', realmId: progression.realm.realmId })
  return { character: next, events, applied }
}

export function setV2GrowthStrategy(character: LegacyCharacterSave, strategyId: unknown): { character: LegacyCharacterSave; event: ProgressionEvent } {
  const next = migrateV2Progression(character)
  const progression = getV2ProgressionState(next)
  progression.growthStrategyId = normalizeGrowthStrategy(strategyId)
  next.v2Progression = progression
  return { character: next, event: { type: 'growth-strategy-changed', strategyId: progression.growthStrategyId } }
}

export function performV2Breakthrough(
  character: LegacyCharacterSave,
  configuredGains?: Partial<Record<'maxHp' | 'maxMp' | 'atk' | 'def' | 'str' | 'dex' | 'con' | 'wis', number>>,
): { character: LegacyCharacterSave; event: ProgressionEvent } | null {
  const next = migrateV2Progression(character)
  const progression = getV2ProgressionState(next)
  const previousRealmId = progression.realm.realmId
  const result = breakthroughRealm(progression.realm, progression.growthStrategyId)
  if (!result) return null
  const gains = { ...result.gains, ...configuredGains }
  progression.realm = result.progress
  next.v2Progression = progression
  next.level = Math.max(1, Math.floor(Number(next.level || 1))) + 1
  next.maxHp = Math.max(1, Math.floor(Number(next.maxHp || 1)) + gains.maxHp)
  next.hp = next.maxHp
  next.maxMp = Math.max(0, Math.floor(Number(next.maxMp || 0)) + gains.maxMp)
  next.mp = next.maxMp
  next.atk = Math.max(1, Math.floor(Number(next.atk || 1)) + gains.atk)
  next.def = Math.max(0, Math.floor(Number(next.def || 0)) + gains.def)
  const abilities = next.abilities && typeof next.abilities === 'object' ? next.abilities as Record<string, unknown> : {}
  abilities.str = Math.max(1, Math.floor(Number(abilities.str || 10)) + gains.str)
  abilities.dex = Math.max(1, Math.floor(Number(abilities.dex || 10)) + gains.dex)
  abilities.con = Math.max(1, Math.floor(Number(abilities.con || 10)) + gains.con)
  abilities.wis = Math.max(1, Math.floor(Number(abilities.wis || 10)) + gains.wis)
  next.abilities = abilities
  next.xp = 0
  next.xpNext = progression.realm.cultivationRequired
  return {
    character: next,
    event: { type: 'realm-breakthrough', previousRealmId, realmId: progression.realm.realmId, strategyId: result.strategyId },
  }
}
