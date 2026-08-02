import { getP2RootProfile, getV2ProgressionState } from '../../domain/progression'
import type { LegacyCharacterSave } from '../../save/types'
import { V2_TECHNIQUES } from './content'
import { canV2RootLearnTechnique } from './root-technique.rules'
import { getTechniqueMasteryName, getTechniqueMasteryPoints } from './technique-mastery'

export const CAVE_TRAINING_DURATIONS = [15, 60, 240] as const

export interface CaveTrainingTask {
  techniqueId: string
  startedAt: number
  completesAt: number
  durationMinutes: number
  trainingRate: number
  masteryPoints: number
}

export interface CaveTrainingClaim {
  character: LegacyCharacterSave
  techniqueId: string
  points: number
  masteryName: string
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export function getCaveTrainingTask(character: LegacyCharacterSave): CaveTrainingTask | null {
  const value = character.v2CaveTraining
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const source = value as Record<string, unknown>
  const techniqueId = String(source.techniqueId || '')
  if (!V2_TECHNIQUES[techniqueId]) return null
  return {
    techniqueId,
    startedAt: Math.max(0, Math.floor(Number(source.startedAt) || 0)),
    completesAt: Math.max(0, Math.floor(Number(source.completesAt) || 0)),
    durationMinutes: Math.max(1, Math.floor(Number(source.durationMinutes) || 1)),
    trainingRate: Math.max(0.1, Number(source.trainingRate) || 1),
    masteryPoints: Math.max(1, Math.floor(Number(source.masteryPoints) || 1)),
  }
}

export function startCaveTraining(
  source: LegacyCharacterSave,
  techniqueId: string,
  durationMinutes: number,
  now = Date.now(),
): LegacyCharacterSave | null {
  if (getCaveTrainingTask(source)) return null
  const known = Array.isArray(source.v2KnownTechniques) ? source.v2KnownTechniques.map(String) : []
  const technique = V2_TECHNIQUES[techniqueId]
  if (!technique || !known.includes(techniqueId)) return null
  const progression = getV2ProgressionState(source)
  if (!canV2RootLearnTechnique(progression.rootId, technique)) return null
  const duration = CAVE_TRAINING_DURATIONS.includes(durationMinutes as any) ? durationMinutes : 15
  const root = getP2RootProfile(progression.rootId)
  const affinity = Number(root.affinities[technique.element] || 0)
  const rate = root.caveTrainingRate * (1 + affinity / 500)
  const next = clone(source)
  next.v2CaveTraining = {
    techniqueId,
    startedAt: now,
    completesAt: now + duration * 60_000,
    durationMinutes: duration,
    trainingRate: rate,
    masteryPoints: Math.max(1, Math.floor(duration * rate)),
  } satisfies CaveTrainingTask
  return next
}

export function claimCaveTraining(source: LegacyCharacterSave, now = Date.now()): CaveTrainingClaim | null {
  const task = getCaveTrainingTask(source)
  if (!task || now < task.completesAt) return null
  const next = clone(source)
  const mastery = next.v2TechniqueMastery && typeof next.v2TechniqueMastery === 'object'
    ? next.v2TechniqueMastery as Record<string, unknown>
    : {}
  mastery[task.techniqueId] = Math.max(0, Math.floor(Number(mastery[task.techniqueId] || 0))) + task.masteryPoints
  next.v2TechniqueMastery = mastery
  delete next.v2CaveTraining
  const total = getTechniqueMasteryPoints(next, task.techniqueId)
  return { character: next, techniqueId: task.techniqueId, points: task.masteryPoints, masteryName: getTechniqueMasteryName(total) }
}
