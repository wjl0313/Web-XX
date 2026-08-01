import { getCharacterClassData, toLegacyClassId } from '../../domain'
import { legacyXpToNextLevel, rollLegacyClassAbilities } from '../../save'

export const LEGACY_AA_UNLOCK_LEVEL = 51
export const LEGACY_GROUP_XP_BONUS = [1, 1, 1.7, 2.6, 3.6, 4.9, 7.2] as const

export interface LegacyExperienceOptions {
  xpMultiplier?: number
  groupSize?: number
  groupShareSize?: number
}

export interface LegacyExperienceResult {
  character: Record<string, any>
  totalXp: number
  regularXp: number
  aaXp: number
  aaPoints: number
  levelsGained: number
}

function classStats(classId: string): Record<string, number> {
  return getCharacterClassData(classId) as unknown as Record<string, number>
}

export function getLegacyHpPerLevel(classId: string, level: number): number {
  const base = classStats(classId)
  const current = Math.max(2, Math.floor(Number(level) || 2))
  return Math.max(1, Math.floor(base.hp * 0.14 + current * 0.35 + Math.max(0, current - 80) * 0.25))
}

export function getLegacyMpPerLevel(classId: string, level: number): number {
  const base = classStats(classId)
  const current = Math.max(2, Math.floor(Number(level) || 2))
  return Math.max(1, Math.floor(base.mp * 0.12 + current * 0.25 + Math.max(0, current - 80) * 0.15))
}

export function getLegacyAtkPerLevel(classId: string, level: number): number {
  const base = classStats(classId)
  const current = Math.max(2, Math.floor(Number(level) || 2))
  return Math.max(1, Math.floor(base.atk * 0.16 + Math.max(0, current - 60) / 80))
}

export function getLegacyDefPerLevel(classId: string, level: number): number {
  const base = classStats(classId)
  const current = Math.max(2, Math.floor(Number(level) || 2))
  return Math.max(1, Math.floor(base.def * 0.16 + Math.max(0, current - 70) / 90))
}

export function applyLegacyLevelStatGains(character: Record<string, any>, newLevel: number): void {
  const level = Math.max(2, Math.floor(Number(newLevel || character.level || 2)))
  character.maxHp = Math.max(1, Math.floor(Number(character.maxHp || 1)) + getLegacyHpPerLevel(character.cls, level))
  character.maxMp = Math.max(0, Math.floor(Number(character.maxMp || 0)) + getLegacyMpPerLevel(character.cls, level))
  character.hp = character.maxHp
  character.mp = character.maxMp
  character.atk = Math.max(1, Math.floor(Number(character.atk || 0)) + getLegacyAtkPerLevel(character.cls, level))
  character.def = Math.max(1, Math.floor(Number(character.def || 0)) + getLegacyDefPerLevel(character.cls, level))
  character.abilities = rollLegacyClassAbilities(toLegacyClassId(character.cls) ?? 'Warrior', level)
}

export function getLegacyAaXpPerPoint(character: Record<string, any>): number {
  const base = legacyXpToNextLevel(50) + legacyXpToNextLevel(51)
  const lifetime = Math.max(0, Math.floor(Number(character.aa?.points || 0))) + Math.max(0, Math.floor(Number(character.aa?.spent || 0)))
  return Math.max(base, Math.floor(base * (1 + Math.pow(lifetime, 0.55) * 0.035)))
}

export function applyLegacyExperience(
  sourceCharacter: Record<string, any>,
  rawXp: number,
  options: LegacyExperienceOptions = {},
): LegacyExperienceResult {
  const character = JSON.parse(JSON.stringify(sourceCharacter)) as Record<string, any>
  const rawTotal = Math.max(0, Math.floor(Number(rawXp || 0) * Number(options.xpMultiplier || 1)))
  const shareSize = Math.max(1, Math.floor(Number(options.groupShareSize || options.groupSize || 1)))
  const groupSize = Math.max(1, Math.min(6, Math.floor(Number(options.groupSize || shareSize))))
  const totalXp = Math.max(0, Math.floor(rawTotal * LEGACY_GROUP_XP_BONUS[groupSize] / shareSize))
  let aaXp = 0
  let regularXp = totalXp
  let aaPoints = 0

  if (!character.aa || typeof character.aa !== 'object') character.aa = { points: 0, spent: 0, xpProgress: 0, xpAllocPct: 0, nodes: {} }
  if (Number(character.level || 1) >= LEGACY_AA_UNLOCK_LEVEL) {
    const allocation = Math.max(0, Math.min(100, Math.floor(Number(character.aa.xpAllocPct || 0))))
    aaXp = Math.floor(totalXp * allocation / 100)
    regularXp = totalXp - aaXp
    character.aa.xpProgress = Math.max(0, Math.floor(Number(character.aa.xpProgress || 0))) + aaXp
    while (character.aa.xpProgress >= getLegacyAaXpPerPoint(character)) {
      character.aa.xpProgress -= getLegacyAaXpPerPoint(character)
      character.aa.points = Math.max(0, Math.floor(Number(character.aa.points || 0))) + 1
      aaPoints += 1
    }
  }

  if (!character.stats || typeof character.stats !== 'object') character.stats = {}
  character.stats.xpEarned = Math.max(0, Math.floor(Number(character.stats.xpEarned || 0))) + totalXp
  character.xp = Math.max(0, Math.floor(Number(character.xp || 0))) + regularXp
  character.level = Math.max(1, Math.floor(Number(character.level || 1)))
  character.xpNext = Math.max(1, Math.floor(Number(character.xpNext || legacyXpToNextLevel(character.level))))
  let levelsGained = 0
  while (character.xp >= character.xpNext) {
    character.xp -= character.xpNext
    character.level += 1
    character.xpNext = legacyXpToNextLevel(character.level)
    applyLegacyLevelStatGains(character, character.level)
    levelsGained += 1
  }

  return { character, totalXp, regularXp, aaXp, aaPoints, levelsGained }
}
