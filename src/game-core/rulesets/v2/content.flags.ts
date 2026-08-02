export const V2_ENABLED_CLASS_IDS = ['炼体士', '丹医', '五行法修', '影修'] as const

import { P2_ROOT_IDS } from '../../domain/progression'

export const V2_ENABLED_ROOT_IDS = P2_ROOT_IDS

export const V2_ENABLED_ZONE_INDEXES = [0, 1, 2, 3, 4] as const

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

export const V2_ENABLED_MOB_IDS = [
  'spirit_field_rat', 'crimson_eye_bat', 'bone_whelp',
  'young_wolf_demon', 'wolf_demon_warrior', 'wolf_demon_shaman',
  'wandering_corpse', 'decaying_soul', 'yin_wraith',
  'marsh_frog_slave', 'dread_spirit', 'ancient_stalker',
  'asura_servant', 'black_iron_cultivator', 'half_lich',
] as const

export const V2_ENABLED_ELITE_IDS = [
  'rabid_rat_king',
  'howlfang_blood_shaman',
  'manor_revenant',
  'dread_warbringer',
  'ebon_oathkeeper',
] as const

export const V2_ENABLED_BOSS_IDS = ['vermin_tyrant', 'abyss_lord'] as const

export const V2_ENABLED_EQUIPMENT_IDS = [
  'Rusty Dagger', 'Worn Shortsword', 'Cracked Staff', 'Bronze Hatchet', 'Ashen Longbow', 'Runed Mace', 'Glacite Spear',
  'Tattered Robe', 'Studded Jerkin', 'Scaled Cuirass', 'Frostwoven Mantle', 'Ghoul-Touched Cloak', 'Hate Infused Plate', 'Knight Chestplate',
  'Patchwork Leggings', 'Chain Legguards', 'Runed Greaves',
  'Rawhide Boots', 'Traveler Sandals', 'Iron Sabatons', 'Glacier Treads',
  'Dread Quill', 'Bone Ward Totem', 'Mirror Shield', 'Storm Orb',
  'Gnoll Fang Earring', 'Ember Sigil', 'Warden Idol', 'Astral Loop',
] as const

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
