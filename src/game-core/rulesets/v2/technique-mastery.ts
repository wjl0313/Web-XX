import type { LegacyCharacterSave } from '../../save/types'
import type { BattleActorState, TechniqueDefinition } from './types'

export const TECHNIQUE_MASTERY_RANKS = [
  { rank: 0, name: '初窥', minimum: 0 },
  { rank: 1, name: '熟练', minimum: 100 },
  { rank: 2, name: '精通', minimum: 300 },
  { rank: 3, name: '大成', minimum: 700 },
] as const

export function getTechniqueMasteryPoints(character: LegacyCharacterSave, techniqueId: string): number {
  const source = character.v2TechniqueMastery && typeof character.v2TechniqueMastery === 'object'
    ? character.v2TechniqueMastery as Record<string, unknown>
    : {}
  return Math.max(0, Math.floor(Number(source[techniqueId] || 0)))
}

export function getTechniqueMasteryRank(points: number): number {
  let rank = 0
  for (const entry of TECHNIQUE_MASTERY_RANKS) {
    if (points >= entry.minimum) rank = entry.rank
  }
  return rank
}

export function getTechniqueMasteryName(points: number): string {
  return TECHNIQUE_MASTERY_RANKS[getTechniqueMasteryRank(points)].name
}

export function applyTechniqueMastery(
  actor: BattleActorState,
  technique: TechniqueDefinition,
): TechniqueDefinition {
  const rank = Math.max(0, Math.min(3, Math.floor(Number(actor.techniqueMastery?.[technique.id] || 0))))
  if (rank <= 0) return technique
  return {
    ...technique,
    basePower: Math.max(1, Math.floor(technique.basePower * (1 + rank * 0.035))),
    manaCost: Math.max(0, technique.manaCost - rank),
    cooldown: Math.max(0, technique.cooldown - (rank >= 3 ? 1 : 0)),
  }
}

