import type {
  BattleActorState,
  BattleState,
  TechniqueDefinition,
  TechniqueLoadout,
} from './types'

export const EMPTY_TECHNIQUE_LOADOUT: TechniqueLoadout = Object.freeze({
  slots: [null, null, null],
}) as TechniqueLoadout

export function normalizeTechniqueLoadout(
  source: unknown,
  knownTechniqueIds: readonly string[],
): TechniqueLoadout {
  const known = new Set(knownTechniqueIds)
  const input = source && typeof source === 'object' && Array.isArray((source as TechniqueLoadout).slots)
    ? (source as TechniqueLoadout).slots
    : Array.isArray(source)
      ? source
      : []
  const slots = Array.from({ length: 3 }, (_, index) => {
    const value = input[index]
    return typeof value === 'string' && known.has(value) ? value : null
  }) as TechniqueLoadout['slots']
  return { slots }
}

export function validateTechniqueLoadout(
  loadout: TechniqueLoadout,
  knownTechniqueIds: readonly string[],
): { valid: boolean; reason?: 'too-many' | 'unknown-technique' | 'duplicate-technique' } {
  if (loadout.slots.length !== 3) return { valid: false, reason: 'too-many' }
  const known = new Set(knownTechniqueIds)
  const equipped = loadout.slots.filter((id): id is string => Boolean(id))
  if (equipped.some((id) => !known.has(id))) return { valid: false, reason: 'unknown-technique' }
  if (new Set(equipped).size !== equipped.length) return { valid: false, reason: 'duplicate-technique' }
  return { valid: true }
}

export function replaceTechniqueSlot(
  actor: BattleActorState,
  slot: number,
  techniqueId: string | null,
  battleState: BattleState | null,
): TechniqueLoadout {
  if (battleState && battleState.phase !== 'COMPLETED' && battleState.phase !== 'IDLE') {
    throw new Error('战斗中不能更换功法')
  }
  const normalizedSlot = Math.floor(slot)
  if (normalizedSlot < 0 || normalizedSlot >= 3) throw new RangeError('功法槽位无效')
  if (techniqueId && !actor.knownTechniqueIds.includes(techniqueId)) throw new Error('尚未参悟该功法')
  const slots = [...actor.techniqueLoadout.slots] as TechniqueLoadout['slots']
  slots[normalizedSlot] = techniqueId
  const result = { slots }
  const validation = validateTechniqueLoadout(result, actor.knownTechniqueIds)
  if (!validation.valid) throw new Error(validation.reason === 'duplicate-technique' ? '不能重复佩戴同一门功法' : '功法配置无效')
  return result
}

export function isTechniqueReady(
  state: BattleState,
  actor: BattleActorState,
  technique: TechniqueDefinition,
): boolean {
  const key = `${actor.id}:${technique.id}`
  return actor.techniqueLoadout.slots.includes(technique.id)
    && actor.mp >= technique.manaCost
    && Number(state.cooldowns[key] || 0) <= 0
}
