import { getV2ProgressionState, mergeTalentEffects } from '../../domain/progression'
import { addV2Cultivation } from '../../domain/progression'
import type { LegacyCharacterSave } from '../../save/types'
import type { P2HerbId } from './loot.tables'
import { resolveV2HealingPillAmount, resolveV2ManaPillAmount } from './healing.rules'
import { getV2BalanceConfig } from './balance.config'

export const P2_PILL_IDS = ['回春丹', '回灵丹', '养气丹', '护脉丹'] as const
export type P2PillId = (typeof P2_PILL_IDS)[number]

export interface AlchemyV2Recipe {
  id: P2PillId
  materials: Partial<Record<P2HerbId, number>>
  durationMs: number
  output: number
  description: string
}

export interface AlchemyV2Job {
  id: string
  recipeId: P2PillId
  startedAt: number
  completesAt: number
  output: number
}

export const ALCHEMY_V2_RECIPES: Readonly<Record<P2PillId, AlchemyV2Recipe>> = Object.freeze({
  回春丹: { id: '回春丹', materials: { 凝露草: 2, 清心花: 1 }, durationMs: 2 * 60_000, output: 1, description: '按基础药力与体魄恢复固定气血。' },
  回灵丹: { id: '回灵丹', materials: { 玄水叶: 2, 清心花: 1 }, durationMs: 2 * 60_000, output: 1, description: '恢复四成法力。' },
  养气丹: { id: '养气丹', materials: { 凝露草: 1, 厚土芝: 2 }, durationMs: 4 * 60_000, output: 1, description: '获得一百二十点修为。' },
  护脉丹: { id: '护脉丹', materials: { 赤炎根: 1, 清心花: 1, 厚土芝: 1 }, durationMs: 5 * 60_000, output: 1, description: '突破后额外恢复气血与法力。' },
})

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function countRecord(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value).map(([key, count]) => [key, Math.max(0, Math.floor(Number(count) || 0))]))
}

export function getAlchemyV2Queue(character: LegacyCharacterSave): AlchemyV2Job[] {
  if (!Array.isArray(character.v2AlchemyQueue)) return []
  return character.v2AlchemyQueue.flatMap((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return []
    const source = entry as Record<string, unknown>
    const recipeId = String(source.recipeId || '') as P2PillId
    if (!ALCHEMY_V2_RECIPES[recipeId]) return []
    return [{
      id: String(source.id || ''), recipeId,
      startedAt: Math.max(0, Math.floor(Number(source.startedAt) || 0)),
      completesAt: Math.max(0, Math.floor(Number(source.completesAt) || 0)),
      output: Math.max(1, Math.floor(Number(source.output) || 1)),
    }]
  }).slice(0, 5)
}

export function queueAlchemyV2(
  source: LegacyCharacterSave,
  recipeId: P2PillId,
  count = 1,
  now = Date.now(),
): LegacyCharacterSave | null {
  const recipe = ALCHEMY_V2_RECIPES[recipeId]
  if (!recipe) return null
  const queue = getAlchemyV2Queue(source)
  const availableSlots = Math.max(0, 5 - queue.length)
  if (availableSlots <= 0) return null
  const amount = Math.max(1, Math.min(availableSlots, Math.floor(count)))
  const herbs = countRecord(source.v2Herbs)
  for (const [herbId, needed] of Object.entries(recipe.materials)) {
    if (Number(herbs[herbId] || 0) < Number(needed || 0) * amount) return null
  }
  for (const [herbId, needed] of Object.entries(recipe.materials)) {
    herbs[herbId] = Number(herbs[herbId] || 0) - Number(needed || 0) * amount
  }
  const progression = getV2ProgressionState(source)
  const talents = mergeTalentEffects([progression.mainTalentId, progression.secondaryTalentId])
  const duration = Math.max(1_000, Math.floor(recipe.durationMs / Number(talents.alchemyRate || 1)))
  let start = queue.length ? queue[queue.length - 1].completesAt : now
  for (let index = 0; index < amount; index += 1) {
    const completesAt = start + duration
    queue.push({ id: `alchemy:${now}:${queue.length}:${recipeId}`, recipeId, startedAt: start, completesAt, output: recipe.output })
    start = completesAt
  }
  const next = clone(source)
  next.v2Herbs = herbs
  next.v2AlchemyQueue = queue
  return next
}

export function claimAlchemyV2(source: LegacyCharacterSave, now = Date.now()): { character: LegacyCharacterSave; claimed: Partial<Record<P2PillId, number>> } | null {
  const queue = getAlchemyV2Queue(source)
  const ready = queue.filter((job) => job.completesAt <= now)
  if (!ready.length) return null
  const pending = queue.filter((job) => job.completesAt > now)
  const pills = countRecord(source.v2Pills)
  const claimed: Partial<Record<P2PillId, number>> = {}
  for (const job of ready) {
    pills[job.recipeId] = Number(pills[job.recipeId] || 0) + job.output
    claimed[job.recipeId] = Number(claimed[job.recipeId] || 0) + job.output
  }
  const next = clone(source)
  next.v2Pills = pills
  next.v2AlchemyQueue = pending
  return { character: next, claimed }
}

export function useP2Pill(source: LegacyCharacterSave, pillId: P2PillId): LegacyCharacterSave | null {
  const pills = countRecord(source.v2Pills)
  if (Number(pills[pillId] || 0) <= 0) return null
  let next = clone(source)
  pills[pillId] -= 1
  next.v2Pills = pills
  if (pillId === '回春丹') {
    const abilities = next.abilities && typeof next.abilities === 'object' ? next.abilities as Record<string, unknown> : {}
    next.hp = Math.min(Number(next.maxHp || 1), Number(next.hp || 0) + resolveV2HealingPillAmount(Number(abilities.str || 10), getV2BalanceConfig(next)))
  }
  if (pillId === '回灵丹') next.mp = Math.min(Number(next.maxMp || 0), Number(next.mp || 0) + resolveV2ManaPillAmount(Number(next.maxMp || 0), getV2BalanceConfig(next)))
  if (pillId === '养气丹') next = addV2Cultivation(next, 120, 'pill').character
  if (pillId === '护脉丹') {
    const buffs = next.v2Buffs && typeof next.v2Buffs === 'object' ? next.v2Buffs as Record<string, unknown> : {}
    buffs.meridianProtection = Math.max(0, Math.floor(Number(buffs.meridianProtection || 0))) + 1
    next.v2Buffs = buffs
  }
  return next
}
