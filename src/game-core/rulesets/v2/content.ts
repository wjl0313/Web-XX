import type { CharacterClassId } from '../../domain'
import { P2_ROOT_PROFILES } from '../../domain/progression'
import {
  ALL_ITEM_DATA,
  BOSS_BY_ZONE,
  NAMED_BY_ZONE,
  ZONES,
  translateLegacyText,
} from '../../data'
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
  spiritualAbundance: number
  mobIds: readonly string[]
  eliteId: string
  eliteIds?: readonly string[]
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

interface LegacyZoneRow {
  name: string
  desc: string
  minLvl: number
  maxLvl: number
  mobs: readonly string[]
  xpMult: number
  goldMult: number
  rare: string
}

const LEGACY_ZONES = ZONES as readonly LegacyZoneRow[]
const LEGACY_NAMED_BY_ZONE = NAMED_BY_ZONE as Readonly<Record<number, readonly string[]>>
const LEGACY_BOSS_BY_ZONE = BOSS_BY_ZONE as Readonly<Record<number, { name: string; mob: string; mechanic: string }>>

const LEGACY_MOB_ID_OVERRIDES: Readonly<Record<string, string>> = Object.freeze({
  'Field Rat': 'spirit_field_rat',
  'Rabid Bat': 'crimson_eye_bat',
  'Skeleton Pup': 'bone_whelp',
  'Gnoll Pup': 'young_wolf_demon',
  'Gnoll Warrior': 'wolf_demon_warrior',
  'Gnoll Shaman': 'wolf_demon_shaman',
  'Restless Zombie': 'wandering_corpse',
  'Decaying Spectre': 'decaying_soul',
  'Wraith': 'yin_wraith',
  'Bullywug Slave': 'marsh_frog_slave',
  'Fear Elemental': 'dread_spirit',
  'Dread Stalker': 'ancient_stalker',
  'Asmodean Servant': 'asura_servant',
  'Ebon Mace Wielder': 'black_iron_cultivator',
  'Demi-Lich': 'half_lich',
  'a rabid rat king': 'rabid_rat_king',
  'a howlfang bloodshaman': 'howlfang_blood_shaman',
  'a manor revenant': 'manor_revenant',
  'a dread warbringer': 'dread_warbringer',
  'an ebon oathkeeper': 'ebon_oathkeeper',
  'Vermin Tyrant': 'vermin_tyrant',
})

const LEGACY_REWARD_ITEM_OVERRIDES: Readonly<Record<string, string>> = Object.freeze({
  spirit_field_rat: 'Rusty Dagger',
  crimson_eye_bat: 'Rawhide Boots',
  bone_whelp: 'Tattered Robe',
  young_wolf_demon: 'Worn Shortsword',
  wolf_demon_warrior: 'Studded Jerkin',
  wolf_demon_shaman: 'Gnoll Fang Earring',
  wandering_corpse: 'Chain Legguards',
  decaying_soul: 'Dread Quill',
  yin_wraith: 'Frostwoven Mantle',
  marsh_frog_slave: 'Bone Ward Totem',
  dread_spirit: 'Storm Orb',
  ancient_stalker: 'Iron Sabatons',
  asura_servant: 'Hate Infused Plate',
  black_iron_cultivator: 'Glacite Spear',
  half_lich: 'Knight Chestplate',
})

function slug(value: string): string {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  return normalized || 'enemy'
}

function legacyMobId(name: string): string {
  return LEGACY_MOB_ID_OVERRIDES[name] || slug(name)
}

const ELEMENT_CYCLE: readonly Element[] = ['metal', 'wood', 'water', 'fire', 'earth'] as const

function enemyElement(name: string, zoneIndex: number, rank: V2EnemyDefinition['rank']): Element {
  const lower = name.toLowerCase()
  if (/(fire|flame|ember|inferno|pyre|ash|forge|molten|lava|magma|cinder|sun|star)/.test(lower)) return 'fire'
  if (/(frost|ice|glac|frozen|cold|crystal|snow)/.test(lower)) return 'ice'
  if (/(thunder|lightning|storm|tempest|sky|cyclone|wind|cloud|gale)/.test(lower)) return rank === 'boss' ? 'thunder' : 'wind'
  if (/(shadow|dark|void|night|umbra|shade|wraith|ghost|spirit|undead|lich|bone|skeleton|corpse|zombie)/.test(lower)) return 'dark'
  if (/(wood|forest|tree|thicket|plant|vine|spore|moss|nature)/.test(lower)) return 'wood'
  if (/(water|sea|tide|lake|bog|marsh|swamp|frog|snake|serpent|fish|coral|river)/.test(lower)) return 'water'
  if (/(stone|rock|earth|mountain|cliff|sand|dune|golem|slime|ooze)/.test(lower)) return 'earth'
  if (/(metal|iron|steel|blade|sword|axe|hammer|knight|plate|sentinel)/.test(lower)) return 'metal'
  return ELEMENT_CYCLE[zoneIndex % ELEMENT_CYCLE.length]
}

const ENEMY_TECHNIQUES: Readonly<Record<Element, readonly string[]>> = Object.freeze({
  neutral: ['mountain_breaking_fist'],
  metal: ['gengjin_sword_art', 'metal_severing_needle'],
  wood: ['thorn_decay', 'verdant_rejuvenation'],
  water: ['mystic_water_bind', 'cold_spring_breath'],
  fire: ['scarlet_flame_art', 'heartburn_venom'],
  earth: ['earth_guardian_aegis', 'mountain_breaking_fist'],
  thunder: ['scarlet_flame_art', 'mystic_water_bind'],
  ice: ['mystic_water_bind', 'cold_spring_breath'],
  wind: ['shadow_assault', 'mystic_water_bind'],
  dark: ['heartburn_venom', 'metal_severing_needle'],
})

function enemyLoadout(element: Element, rank: V2EnemyDefinition['rank']): TechniqueLoadout {
  const pool = ENEMY_TECHNIQUES[element] || ENEMY_TECHNIQUES.neutral
  const slots: [string | null, string | null, string | null] = [pool[0] || null, pool[1] || null, null]
  if (rank === 'boss') slots[2] = pool[0] || null
  return { slots }
}

function enemyResistances(element: Element, rank: V2EnemyDefinition['rank']): Partial<ElementResistances> {
  if (element === 'neutral') return {}
  return { [element]: rank === 'boss' ? 42 : rank === 'elite' ? 28 : 16 }
}

function scaleLegacyMobHp(rawHp: number, level: number): number {
  if (level <= 30) return Math.max(1, Math.floor(rawHp))
  const bonus = Math.min(2.4, (level - 30) * 0.012)
  return Math.max(1, Math.floor(rawHp * (1 + bonus)))
}

function enemyStats(level: number, rank: V2EnemyDefinition['rank']): [number, number, number, number, number, number] {
  const hpMultiplier = rank === 'boss' ? 4.8 : rank === 'elite' ? 2.4 : 1
  const attackMultiplier = rank === 'boss' ? 1.75 : rank === 'elite' ? 1.35 : 1
  const defenseMultiplier = rank === 'boss' ? 1.5 : rank === 'elite' ? 1.25 : 1
  const hp = scaleLegacyMobHp((80 + level * 38) * hpMultiplier, level)
  const attack = Math.max(1, Math.floor((8 + level * 2.2 + Math.pow(level, 1.45) * 0.55) * attackMultiplier))
  const defense = Math.max(0, Math.floor((2 + level) * defenseMultiplier))
  const mp = Math.max(10, Math.floor((8 + level * 2) * (rank === 'boss' ? 1.8 : rank === 'elite' ? 1.4 : 1)))
  const spirit = Math.max(4, Math.floor((3 + level * 0.8) * (rank === 'boss' ? 1.6 : rank === 'elite' ? 1.3 : 1)))
  const agility = Math.max(4, Math.floor((4 + level * 0.7) * (rank === 'boss' ? 1.2 : rank === 'elite' ? 1.15 : 1)))
  return [hp, mp, attack, defense, spirit, agility]
}

function enemyLevel(zone: LegacyZoneRow, index: number, rank: V2EnemyDefinition['rank']): number {
  if (rank === 'boss') return zone.maxLvl + 2
  if (rank === 'elite') return Math.min(zone.maxLvl, zone.minLvl + 2 + Math.floor((zone.maxLvl - zone.minLvl) * 0.55))
  return zone.minLvl + Math.floor((zone.maxLvl - zone.minLvl) * (index + 1) / 4)
}

function zoneSpiritualAbundance(zone: LegacyZoneRow): number {
  const levelAnchor = Math.max(2, (zone.minLvl + zone.maxLvl) / 2)
  const value = 0.6 + Math.log2(levelAnchor + 2) * 0.35
  return Math.max(0.5, Math.min(6, Math.round(value * 100) / 100))
}

function buildGeneratedEnemies(): Readonly<Record<string, V2EnemyDefinition>> {
  const result: Record<string, V2EnemyDefinition> = {}
  const used = new Set<string>()

  function addEnemy(
    id: string,
    displayName: string,
    zoneId: string,
    zoneIndex: number,
    rank: V2EnemyDefinition['rank'],
    level: number,
    element: Element,
    rareItem: string | null,
  ): void {
    const uniqueId = used.has(id) ? `${id}_${zoneIndex}` : id
    used.add(uniqueId)
    const [hp, mp, attack, defense, spirit, agility] = enemyStats(level, rank)
    const zone = LEGACY_ZONES[zoneIndex]
    const xpMultiplier = rank === 'boss' ? 5 : rank === 'elite' ? 3 : 1
    const goldMultiplier = rank === 'boss' ? 4 : rank === 'elite' ? 1.6 : 1
    result[uniqueId] = {
      id: uniqueId,
      displayName,
      zoneId,
      rank,
      level,
      element,
      hp,
      mp,
      attack,
      defense,
      spirit,
      physique: Math.max(8, Math.floor(hp / 10)),
      agility,
      criticalChance: rank === 'boss' ? 0.12 : rank === 'elite' ? 0.07 : 0.05,
      resistances: normalizeElementResistances(enemyResistances(element, rank)),
      techniqueLoadout: enemyLoadout(element, rank),
      rewards: {
        xp: Math.max(1, Math.floor((20 + level * 15) * zone.xpMult * xpMultiplier)),
        gold: Math.max(1, Math.floor((level * 2 + 3) * zone.goldMult * goldMultiplier)),
        itemId: rareItem,
      },
    }
  }

  LEGACY_ZONES.forEach((zone, zoneIndex) => {
    const zoneId = slug(zone.name)
    zone.mobs.forEach((mobName, index) => {
      const level = enemyLevel(zone, index, 'normal')
      const enemyId = legacyMobId(mobName)
      addEnemy(
        enemyId,
        translateLegacyText(mobName),
        zoneId,
        zoneIndex,
        'normal',
        level,
        enemyElement(mobName, zoneIndex, 'normal'),
        LEGACY_REWARD_ITEM_OVERRIDES[enemyId] || null,
      )
    })
    const named = LEGACY_NAMED_BY_ZONE[zoneIndex] || []
    named.forEach((name, index) => {
      const level = enemyLevel(zone, index, 'elite')
      const rareItem = zone.rare && (ALL_ITEM_DATA as Record<string, { slot?: string }>)[zone.rare]?.slot ? zone.rare : null
      addEnemy(
        legacyMobId(name),
        translateLegacyText(name),
        zoneId,
        zoneIndex,
        'elite',
        level,
        enemyElement(name, zoneIndex, 'elite'),
        rareItem,
      )
    })
    const boss = LEGACY_BOSS_BY_ZONE[zoneIndex]
    if (boss) {
      const rareItem = zone.rare && (ALL_ITEM_DATA as Record<string, { slot?: string }>)[zone.rare]?.slot ? zone.rare : null
      addEnemy(
        legacyMobId(boss.name),
        translateLegacyText(boss.name),
        zoneId,
        zoneIndex,
        'boss',
        enemyLevel(zone, 0, 'boss'),
        enemyElement(boss.name, zoneIndex, 'boss'),
        rareItem,
      )
    }
  })
  return Object.freeze(result)
}

const GENERATED_V2_ENEMIES = buildGeneratedEnemies()

export const V2_ENEMIES: Readonly<Record<string, V2EnemyDefinition>> = GENERATED_V2_ENEMIES

export const V2_ZONES: readonly V2ZoneDefinition[] = Object.freeze(LEGACY_ZONES.map((zone, index) => {
  const zoneId = slug(zone.name)
  const namedIds = (LEGACY_NAMED_BY_ZONE[index] || []).map(legacyMobId)
  const boss = LEGACY_BOSS_BY_ZONE[index]
  const translatedDescription = translateLegacyText(zone.desc)
  return {
    id: zoneId,
    legacyZoneIndex: index,
    displayName: translateLegacyText(zone.name),
    description: translatedDescription === zone.desc ? `${translateLegacyText(zone.name)}的历练之地。` : translatedDescription,
    minimumLevel: zone.minLvl,
    maximumLevel: zone.maxLvl,
    spiritualAbundance: zoneSpiritualAbundance(zone),
    mobIds: zone.mobs.map(legacyMobId),
    eliteId: namedIds[0] || '',
    eliteIds: namedIds,
    bossId: boss ? legacyMobId(boss.name) : undefined,
  }
}))

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
