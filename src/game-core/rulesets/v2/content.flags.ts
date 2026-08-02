export const V2_ENABLED_CLASS_IDS = ['炼体士', '丹医', '五行法修', '影修'] as const

import { P2_ROOT_IDS } from '../../domain/progression'
import { ALL_ITEM_DATA, ZONES } from '../../data'
import { V2_ENEMIES } from './content'

export const V2_ENABLED_ROOT_IDS = P2_ROOT_IDS

export const V2_ENABLED_ZONE_INDEXES: readonly number[] = ZONES.map((_, index) => index)

export const V2_ENABLED_TECHNIQUE_IDS = [
  'mountain_breaking_fist',
  'golden_bell_guard',
  'earth_guardian_aegis',
  'verdant_rejuvenation',
  'metal_severing_needle',
  'cold_spring_breath',
  'gengjin_sword_art',
  'thorn_decay',
  'scarlet_flame_art',
  'shadow_assault',
  'mystic_water_bind',
  'heartburn_venom',
] as const

export const V2_ENABLED_MOB_IDS: readonly string[] = Object.values(V2_ENEMIES)
  .filter((enemy) => enemy.rank === 'normal')
  .map((enemy) => enemy.id)

export const V2_ENABLED_ELITE_IDS: readonly string[] = Object.values(V2_ENEMIES)
  .filter((enemy) => enemy.rank === 'elite')
  .map((enemy) => enemy.id)

export const V2_ENABLED_BOSS_IDS: readonly string[] = Object.values(V2_ENEMIES)
  .filter((enemy) => enemy.rank === 'boss')
  .map((enemy) => enemy.id)

export const V2_ENABLED_EQUIPMENT_IDS: readonly string[] = Object.keys(ALL_ITEM_DATA)
  .filter((id) => Boolean((ALL_ITEM_DATA as Record<string, { slot?: string }>)[id]?.slot))

const classSet = new Set<string>(V2_ENABLED_CLASS_IDS)
const rootSet = new Set<string>(V2_ENABLED_ROOT_IDS)
const zoneSet = new Set<number>(V2_ENABLED_ZONE_INDEXES)
const techniqueSet = new Set<string>(V2_ENABLED_TECHNIQUE_IDS)
const equipmentSet = new Set<string>(V2_ENABLED_EQUIPMENT_IDS)

export function isV2ClassEnabled(value: unknown): boolean {
  return typeof value === 'string' && classSet.has(value)
}

export function isV2RootEnabled(value: unknown): boolean {
  return typeof value === 'string' && rootSet.has(value)
}

export function isV2ZoneEnabled(value: unknown): boolean {
  return Number.isInteger(Number(value)) && zoneSet.has(Number(value))
}

export function isV2TechniqueEnabled(value: unknown): boolean {
  return typeof value === 'string' && techniqueSet.has(value)
}

export function isV2EquipmentEnabled(value: unknown): boolean {
  return typeof value === 'string' && equipmentSet.has(value)
}
