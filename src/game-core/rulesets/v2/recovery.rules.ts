import type { LegacyCharacterSave } from '../../save/types'
import { resolveV2Healing } from './battle.rules'
import { createV2PlayerActor, getV2CharacterTechniqueIds } from './character.adapter'
import { V2_TECHNIQUES } from './content'
import { resolveV2HealingPillAmount } from './healing.rules'
import { getV2BalanceConfig } from './balance.config'
import { getV2TechniqueCatalog } from './balance.config'

export const V2_REST_TICK_MS = 1_000

export interface V2RestActionState {
  type: 'resting'
  reason: 'post_battle' | 'auto_threshold' | 'manual'
  startedAt: number
  lastRecoveredAt: number
}

export interface V2RestAdvanceResult {
  character: LegacyCharacterSave
  recovered: number
  elapsedTicks: number
  completed: boolean
}

export interface V2RestAccelerateResult {
  character: LegacyCharacterSave
  recovered: number
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function countRecord(value: unknown): Record<string, number> {
  return Object.fromEntries(Object.entries(record(value)).map(([key, count]) => [
    key,
    Math.max(0, Math.floor(Number(count) || 0)),
  ]))
}

export function getV2RestActionState(character: LegacyCharacterSave | null | undefined): V2RestActionState | null {
  const source = record(character?.v2ActionState)
  if (source.type !== 'resting') return null
  const startedAt = Math.max(0, Math.floor(Number(source.startedAt) || 0))
  const lastRecoveredAt = Math.max(startedAt, Math.floor(Number(source.lastRecoveredAt) || startedAt))
  return {
    type: 'resting',
    reason: source.reason === 'manual'
      ? 'manual'
      : source.reason === 'auto_threshold'
        ? 'auto_threshold'
        : 'post_battle',
    startedAt,
    lastRecoveredAt,
  }
}

export function isV2Resting(character: LegacyCharacterSave | null | undefined): boolean {
  return Boolean(getV2RestActionState(character))
}

export function getV2Physique(character: LegacyCharacterSave): number {
  return Math.max(1, Math.floor(Number(record(character.abilities).str || 10)))
}

export function getV2RestRecoveryPerSecond(character: LegacyCharacterSave): number {
  const configuration = getV2BalanceConfig(character)
  return Math.max(
    configuration.restMinimumPerSecond,
    Math.floor(getV2Physique(character) / configuration.restPhysiqueDivisor),
  )
}

export function getV2RestThreshold(character: LegacyCharacterSave): number {
  const configuration = record(character.v2AutoConfiguration)
  return Math.max(0.05, Math.min(0.8, Number(configuration.meditationThreshold ?? 0.2)))
}

export function getV2RestRemainingMs(character: LegacyCharacterSave): number {
  if (!isV2Resting(character)) return 0
  const missingHp = Math.max(0, Math.floor(Number(character.maxHp || 1)) - Math.floor(Number(character.hp || 0)))
  return Math.ceil(missingHp / getV2RestRecoveryPerSecond(character)) * V2_REST_TICK_MS
}

export function startV2Rest(
  source: LegacyCharacterSave,
  reason: V2RestActionState['reason'] = 'manual',
  now = Date.now(),
): LegacyCharacterSave {
  const next = clone(source)
  const maxHp = Math.max(1, Math.floor(Number(next.maxHp || 1)))
  const hp = Math.max(0, Math.min(maxHp, Math.floor(Number(next.hp || 0))))
  next.hp = hp
  if (hp >= maxHp) {
    delete next.v2ActionState
    return next
  }
  const existing = getV2RestActionState(next)
  if (existing) return next
  const timestamp = Math.max(0, Math.floor(now))
  next.v2ActionState = { type: 'resting', reason, startedAt: timestamp, lastRecoveredAt: timestamp }
  return next
}

export function startV2RestBelowThreshold(
  source: LegacyCharacterSave,
  threshold = getV2RestThreshold(source),
  reason: V2RestActionState['reason'] = 'post_battle',
  now = Date.now(),
): LegacyCharacterSave {
  const maxHp = Math.max(1, Number(source.maxHp || 1))
  const hp = Math.max(0, Math.min(maxHp, Number(source.hp || 0)))
  if (hp >= maxHp || hp / maxHp > Math.max(0.05, Math.min(0.8, threshold))) return clone(source)
  return startV2Rest(source, reason, now)
}

export function advanceV2Rest(source: LegacyCharacterSave, now = Date.now()): V2RestAdvanceResult {
  const state = getV2RestActionState(source)
  if (!state) return { character: clone(source), recovered: 0, elapsedTicks: 0, completed: false }
  const next = clone(source)
  const maxHp = Math.max(1, Math.floor(Number(next.maxHp || 1)))
  const hpBefore = Math.max(0, Math.min(maxHp, Math.floor(Number(next.hp || 0))))
  const elapsedTicks = Math.max(0, Math.floor((Math.floor(now) - state.lastRecoveredAt) / V2_REST_TICK_MS))
  const recovered = Math.min(maxHp - hpBefore, elapsedTicks * getV2RestRecoveryPerSecond(next))
  next.hp = hpBefore + recovered
  const completed = Number(next.hp) >= maxHp
  if (completed) delete next.v2ActionState
  else if (elapsedTicks > 0) {
    next.v2ActionState = {
      ...state,
      lastRecoveredAt: state.lastRecoveredAt + elapsedTicks * V2_REST_TICK_MS,
    }
  }
  return { character: next, recovered, elapsedTicks, completed }
}

export function getV2RestHealingTechniques(character: LegacyCharacterSave) {
  const techniques = getV2TechniqueCatalog(character)
  return getV2CharacterTechniqueIds(character)
    .map((id) => techniques[id])
    .filter((technique) => technique?.effectType === 'healing')
}

export function useV2RestHealingTechnique(
  source: LegacyCharacterSave,
  techniqueId: string,
): V2RestAccelerateResult | null {
  if (!isV2Resting(source)) return null
  const technique = getV2TechniqueCatalog(source)[techniqueId]
  if (!technique || technique.effectType !== 'healing' || !getV2CharacterTechniqueIds(source).includes(techniqueId)) return null
  const mpBefore = Math.max(0, Math.floor(Number(source.mp || 0)))
  if (mpBefore < technique.manaCost) return null
  const next = clone(source)
  const maxHp = Math.max(1, Math.floor(Number(next.maxHp || 1)))
  const hpBefore = Math.max(0, Math.min(maxHp, Math.floor(Number(next.hp || 0))))
  const recovered = Math.min(maxHp - hpBefore, resolveV2Healing(createV2PlayerActor(next), technique))
  if (recovered <= 0) return null
  next.hp = hpBefore + recovered
  next.mp = mpBefore - technique.manaCost
  if (Number(next.hp) >= maxHp) delete next.v2ActionState
  return { character: next, recovered }
}

export function useV2RestHealingPill(source: LegacyCharacterSave): V2RestAccelerateResult | null {
  if (!isV2Resting(source)) return null
  const pills = countRecord(source.v2Pills)
  if (Number(pills.回春丹 || 0) <= 0) return null
  const next = clone(source)
  const maxHp = Math.max(1, Math.floor(Number(next.maxHp || 1)))
  const hpBefore = Math.max(0, Math.min(maxHp, Math.floor(Number(next.hp || 0))))
  const recovered = Math.min(maxHp - hpBefore, resolveV2HealingPillAmount(getV2Physique(next), getV2BalanceConfig(next)))
  if (recovered <= 0) return null
  pills.回春丹 -= 1
  next.v2Pills = pills
  next.hp = hpBefore + recovered
  if (Number(next.hp) >= maxHp) delete next.v2ActionState
  return { character: next, recovered }
}
