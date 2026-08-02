import type { CharacterClassId } from '../../domain'
import { P2_ROOT_PROFILES } from '../../domain/progression'
import type {
  Element,
  ElementResistances,
  TechniqueDefinition,
  TechniqueLoadout,
} from './types'
import { createEmptyElementResistances, normalizeElementResistances } from './resistance.rules'

export interface V2ZoneDefinition {
  id: string
  legacyZoneIndex: number
  displayName: string
  description: string
  minimumLevel: number
  maximumLevel: number
  mobIds: readonly string[]
  eliteId: string
  bossId?: string
}

export interface V2EnemyDefinition {
  id: string
  displayName: string
  zoneId: string
  rank: 'normal' | 'elite' | 'boss'
  level: number
  element: Element
  hp: number
  mp: number
  attack: number
  defense: number
  spirit: number
  physique: number
  agility: number
  criticalChance: number
  resistances: Partial<ElementResistances>
  techniqueLoadout: TechniqueLoadout
  rewards: { xp: number; gold: number; itemId?: string | null }
}

export interface V2EquipmentProfile {
  id: string
  resistances?: Partial<ElementResistances>
  fixedDamageMultiplier?: number
}

export const V2_ROOT_PROFILES = P2_ROOT_PROFILES

export const V2_TECHNIQUES: Readonly<Record<string, TechniqueDefinition>> = Object.freeze({
  mountain_breaking_fist: {
    id: 'mountain_breaking_fist', displayName: '裂山拳', description: '凝聚肉身之力轰击单一目标。',
    classIds: ['炼体士'], element: 'neutral', effectType: 'direct_damage', target: 'enemy',
    manaCost: 8, cooldown: 1, basePower: 8, attackScale: 1.25, physiqueScale: 0.35,
  },
  golden_bell_guard: {
    id: 'golden_bell_guard', displayName: '金钟护体', description: '以真气凝成护盾吸收伤害。',
    classIds: ['炼体士'], element: 'neutral', effectType: 'shield', target: 'self',
    manaCost: 14, cooldown: 3, basePower: 18, physiqueScale: 1.2,
  },
  earth_guardian_aegis: {
    id: 'earth_guardian_aegis', displayName: '厚土护元', description: '借厚土之力形成更坚固的护盾。',
    classIds: ['炼体士'], element: 'earth', effectType: 'shield', target: 'self',
    manaCost: 18, cooldown: 3, basePower: 22, physiqueScale: 1.35,
  },
  verdant_rejuvenation: {
    id: 'verdant_rejuvenation', displayName: '青木回春', description: '以木灵之气恢复自身气血，受神识与根骨影响。',
    classIds: ['丹医'], element: 'wood', effectType: 'healing', target: 'self',
    manaCost: 18, cooldown: 2, basePower: 20, abilityScales: { wis: 1.2, con: 0.35 },
  },
  metal_severing_needle: {
    id: 'metal_severing_needle', displayName: '断脉金针', description: '金针伤敌并降低其攻击。',
    classIds: ['丹医'], element: 'metal', effectType: 'attack_down', target: 'enemy',
    manaCost: 14, cooldown: 2, basePower: 6, spiritScale: 1.05, duration: 2, magnitude: 4,
  },
  cold_spring_breath: {
    id: 'cold_spring_breath', displayName: '寒泉吐纳', description: '引寒泉灵气恢复法力。',
    classIds: ['丹医'], element: 'water', effectType: 'mana_restore', target: 'self',
    manaCost: 0, cooldown: 3, basePower: 18, spiritScale: 0.8,
  },
  gengjin_sword_art: {
    id: 'gengjin_sword_art', displayName: '庚金剑诀', description: '庚金剑气直取敌身。',
    classIds: ['五行法修'], element: 'metal', effectType: 'direct_damage', target: 'enemy',
    manaCost: 16, cooldown: 1, basePower: 10, spiritScale: 1.55,
  },
  thorn_decay: {
    id: 'thorn_decay', displayName: '青藤蚀骨', description: '木毒侵入目标并持续造成伤害。',
    classIds: ['五行法修'], element: 'wood', effectType: 'poison', target: 'enemy',
    manaCost: 18, cooldown: 2, basePower: 6, spiritScale: 1.05, duration: 3, magnitude: 7,
  },
  scarlet_flame_art: {
    id: 'scarlet_flame_art', displayName: '赤炎术', description: '以烈火正面轰击目标。',
    classIds: ['五行法修'], element: 'fire', effectType: 'direct_damage', target: 'enemy',
    manaCost: 20, cooldown: 2, basePower: 13, spiritScale: 1.7,
  },
  shadow_assault: {
    id: 'shadow_assault', displayName: '无影袭', description: '以身法与兵刃发动迅捷突袭。',
    classIds: ['影修'], element: 'neutral', effectType: 'direct_damage', target: 'enemy',
    manaCost: 10, cooldown: 1, basePower: 9, attackScale: 1.35,
  },
  mystic_water_bind: {
    id: 'mystic_water_bind', displayName: '玄水缚影', description: '玄水缠身，伤敌并降低身法。',
    classIds: ['影修'], element: 'water', effectType: 'agility_down', target: 'enemy',
    manaCost: 16, cooldown: 2, basePower: 7, attackScale: 0.8, spiritScale: 0.6, duration: 2, magnitude: 4,
  },
  heartburn_venom: {
    id: 'heartburn_venom', displayName: '焚心火毒', description: '火毒入体并持续灼伤目标。',
    classIds: ['影修'], element: 'fire', effectType: 'poison', target: 'enemy',
    manaCost: 18, cooldown: 2, basePower: 7, attackScale: 0.9, duration: 3, magnitude: 8,
  },
})

export const V2_CLASS_TECHNIQUES: Readonly<Record<CharacterClassId, readonly string[]>> = Object.freeze({
  炼体士: ['mountain_breaking_fist', 'golden_bell_guard', 'earth_guardian_aegis'],
  丹医: ['verdant_rejuvenation', 'metal_severing_needle', 'cold_spring_breath'],
  五行法修: ['gengjin_sword_art', 'thorn_decay', 'scarlet_flame_art'],
  影修: ['shadow_assault', 'mystic_water_bind', 'heartburn_venom'],
} as Partial<Record<CharacterClassId, readonly string[]>> as Record<CharacterClassId, readonly string[]>)

export const V2_ZONES: readonly V2ZoneDefinition[] = Object.freeze([
  { id: 'green_bamboo_grove', legacyZoneIndex: 0, displayName: '青竹林', description: '灵气稀薄的入门历练地。', minimumLevel: 1, maximumLevel: 4, mobIds: ['spirit_field_rat', 'crimson_eye_bat', 'bone_whelp'], eliteId: 'rabid_rat_king', bossId: 'vermin_tyrant' },
  { id: 'howlfang_cavern', legacyZoneIndex: 1, displayName: '啸月妖穴', description: '狼妖盘踞的阴暗洞窟。', minimumLevel: 3, maximumLevel: 6, mobIds: ['young_wolf_demon', 'wolf_demon_warrior', 'wolf_demon_shaman'], eliteId: 'howlfang_blood_shaman' },
  { id: 'withered_spring_manor', legacyZoneIndex: 2, displayName: '荒泉废府', description: '游尸与残魂出没的废弃府邸。', minimumLevel: 7, maximumLevel: 12, mobIds: ['wandering_corpse', 'decaying_soul', 'yin_wraith'], eliteId: 'manor_revenant' },
  { id: 'dread_ancient_hall', legacyZoneIndex: 3, displayName: '惊魂古殿', description: '惊惧魔灵栖居的破败古殿。', minimumLevel: 15, maximumLevel: 21, mobIds: ['marsh_frog_slave', 'dread_spirit', 'ancient_stalker'], eliteId: 'dread_warbringer' },
  { id: 'asura_abyss', legacyZoneIndex: 4, displayName: '修罗魔渊', description: '魔气深重的高危历练地。', minimumLevel: 30, maximumLevel: 37, mobIds: ['asura_servant', 'black_iron_cultivator', 'half_lich'], eliteId: 'ebon_oathkeeper', bossId: 'abyss_lord' },
])

function resistances(values: Partial<ElementResistances>): ElementResistances {
  return normalizeElementResistances(values)
}

function enemy(
  id: string,
  displayName: string,
  zoneId: string,
  rank: V2EnemyDefinition['rank'],
  level: number,
  element: Element,
  stats: [number, number, number, number, number, number],
  loadout: TechniqueLoadout,
  reward: [number, number, string?],
  resistanceValues: Partial<ElementResistances> = {},
): V2EnemyDefinition {
  const [hp, mp, attack, defense, spirit, agility] = stats
  return {
    id, displayName, zoneId, rank, level, element, hp, mp, attack, defense, spirit,
    physique: Math.max(8, Math.floor(hp / 10)), agility, criticalChance: rank === 'boss' ? 0.12 : 0.06,
    resistances: resistances(resistanceValues), techniqueLoadout: loadout,
    rewards: { xp: reward[0], gold: reward[1], itemId: reward[2] || null },
  }
}

const loadout = (...ids: Array<string | null>): TechniqueLoadout => ({
  slots: [ids[0] || null, ids[1] || null, ids[2] || null],
})

export const V2_ENEMIES: Readonly<Record<string, V2EnemyDefinition>> = Object.freeze(Object.fromEntries([
  enemy('spirit_field_rat', '灵田鼠', 'green_bamboo_grove', 'normal', 1, 'earth', [64, 20, 10, 4, 6, 8], loadout('mountain_breaking_fist'), [24, 10, 'Rusty Dagger'], { earth: 8 }),
  enemy('crimson_eye_bat', '赤目蝠', 'green_bamboo_grove', 'normal', 2, 'wind', [58, 24, 11, 3, 8, 13], loadout('shadow_assault'), [27, 11, 'Rawhide Boots'], { wind: 12 }),
  enemy('bone_whelp', '白骨幼妖', 'green_bamboo_grove', 'normal', 3, 'dark', [78, 18, 12, 7, 5, 7], loadout('mountain_breaking_fist'), [31, 13, 'Tattered Robe'], { dark: 12 }),
  enemy('young_wolf_demon', '幼年狼妖', 'howlfang_cavern', 'normal', 4, 'wind', [92, 28, 15, 7, 7, 14], loadout('shadow_assault'), [38, 17, 'Worn Shortsword'], { wind: 10 }),
  enemy('wolf_demon_warrior', '狼妖战士', 'howlfang_cavern', 'normal', 5, 'metal', [112, 26, 18, 11, 6, 10], loadout('metal_severing_needle'), [43, 19, 'Studded Jerkin'], { metal: 12 }),
  enemy('wolf_demon_shaman', '狼妖祭司', 'howlfang_cavern', 'normal', 6, 'wood', [90, 48, 12, 7, 18, 9], loadout('thorn_decay', 'verdant_rejuvenation'), [47, 22, 'Gnoll Fang Earring'], { wood: 14 }),
  enemy('wandering_corpse', '游尸', 'withered_spring_manor', 'normal', 8, 'earth', [145, 20, 21, 15, 6, 5], loadout('mountain_breaking_fist'), [64, 30, 'Chain Legguards'], { earth: 16 }),
  enemy('decaying_soul', '朽魂', 'withered_spring_manor', 'normal', 9, 'dark', [118, 58, 18, 9, 24, 12], loadout('heartburn_venom'), [70, 34, 'Dread Quill'], { dark: 18 }),
  enemy('yin_wraith', '阴灵', 'withered_spring_manor', 'normal', 11, 'ice', [128, 62, 20, 10, 26, 16], loadout('mystic_water_bind'), [78, 39, 'Frostwoven Mantle'], { ice: 18 }),
  enemy('marsh_frog_slave', '沼泽蛙奴', 'dread_ancient_hall', 'normal', 16, 'water', [205, 50, 29, 20, 14, 12], loadout('thorn_decay'), [110, 52, 'Bone Ward Totem'], { water: 20 }),
  enemy('dread_spirit', '惊惧魔灵', 'dread_ancient_hall', 'normal', 18, 'dark', [178, 82, 25, 15, 36, 17], loadout('heartburn_venom', 'mystic_water_bind'), [122, 58, 'Storm Orb'], { dark: 22 }),
  enemy('ancient_stalker', '古殿伏妖', 'dread_ancient_hall', 'normal', 20, 'wind', [220, 55, 34, 18, 18, 24], loadout('shadow_assault'), [138, 65, 'Iron Sabatons'], { wind: 22 }),
  enemy('asura_servant', '修罗奴仆', 'asura_abyss', 'normal', 31, 'fire', [360, 90, 48, 30, 28, 20], loadout('scarlet_flame_art'), [220, 108, 'Hate Infused Plate'], { fire: 25 }),
  enemy('black_iron_cultivator', '黑铁魔修', 'asura_abyss', 'normal', 34, 'metal', [420, 75, 56, 40, 22, 18], loadout('gengjin_sword_art', 'metal_severing_needle'), [245, 122, 'Glacite Spear'], { metal: 28 }),
  enemy('half_lich', '半步尸王', 'asura_abyss', 'normal', 37, 'dark', [390, 125, 45, 31, 58, 22], loadout('heartburn_venom', 'cold_spring_breath'), [280, 140, 'Knight Chestplate'], { dark: 30 }),
  enemy('rabid_rat_king', '狂疫鼠王', 'green_bamboo_grove', 'elite', 4, 'earth', [145, 36, 19, 11, 9, 11], loadout('mountain_breaking_fist', 'earth_guardian_aegis'), [75, 34, 'Scaled Cuirass'], { earth: 20 }),
  enemy('howlfang_blood_shaman', '啸月血祭师', 'howlfang_cavern', 'elite', 7, 'wood', [175, 76, 22, 13, 28, 14], loadout('thorn_decay', 'verdant_rejuvenation'), [96, 45, 'Runed Mace'], { wood: 24 }),
  enemy('manor_revenant', '废府怨主', 'withered_spring_manor', 'elite', 12, 'dark', [245, 95, 31, 20, 38, 15], loadout('heartburn_venom', 'mystic_water_bind'), [140, 68, 'Ghoul-Touched Cloak'], { dark: 28 }),
  enemy('dread_warbringer', '惊魂战将', 'dread_ancient_hall', 'elite', 21, 'metal', [365, 95, 47, 31, 28, 21], loadout('gengjin_sword_art', 'metal_severing_needle'), [210, 102, 'Mirror Shield'], { metal: 30 }),
  enemy('ebon_oathkeeper', '玄铁执印者', 'asura_abyss', 'elite', 38, 'fire', [620, 150, 68, 48, 46, 25], loadout('scarlet_flame_art', 'heartburn_venom'), [360, 180, 'Runed Greaves'], { fire: 34 }),
  enemy('vermin_tyrant', '赤目妖王', 'green_bamboo_grove', 'boss', 5, 'earth', [260, 70, 27, 18, 16, 13], loadout('mountain_breaking_fist', 'earth_guardian_aegis', 'metal_severing_needle'), [165, 82, 'Warden Idol'], { earth: 28, wood: -10 }),
  enemy('abyss_lord', '魔渊君主', 'asura_abyss', 'boss', 40, 'fire', [980, 240, 82, 62, 70, 29], loadout('scarlet_flame_art', 'heartburn_venom', 'golden_bell_guard'), [680, 340, 'Astral Loop'], { fire: 45, water: -18, dark: 35 }),
].map((entry) => [entry.id, entry])))

export const V2_EQUIPMENT_PROFILES: Readonly<Record<string, V2EquipmentProfile>> = Object.freeze({
  'Glacite Spear': { id: 'Glacite Spear', resistances: { ice: 12 } },
  'Frostwoven Mantle': { id: 'Frostwoven Mantle', resistances: { ice: 18, fire: -5 } },
  'Ghoul-Touched Cloak': { id: 'Ghoul-Touched Cloak', resistances: { dark: 16 } },
  'Hate Infused Plate': { id: 'Hate Infused Plate', resistances: { fire: 20, dark: 10 } },
  'Glacier Treads': { id: 'Glacier Treads', resistances: { ice: 14 } },
  'Dread Quill': { id: 'Dread Quill', resistances: { dark: 10 } },
  'Bone Ward Totem': { id: 'Bone Ward Totem', resistances: { earth: 12, dark: 8 } },
  'Mirror Shield': { id: 'Mirror Shield', resistances: { metal: 10, thunder: 8 } },
  'Storm Orb': { id: 'Storm Orb', resistances: { thunder: 16 } },
  'Ember Sigil': { id: 'Ember Sigil', resistances: { fire: 12 } },
  'Warden Idol': { id: 'Warden Idol', resistances: { earth: 14 } },
  'Astral Loop': { id: 'Astral Loop', resistances: { wind: 8, thunder: 8, dark: 8 } },
})

export const V2_DEFAULT_RESISTANCES = Object.freeze(createEmptyElementResistances())
