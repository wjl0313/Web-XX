import {
  ABILITIES,
  ALL_ITEM_DATA,
  EPIC_ITEM_BY_BASE,
  ITEM_AFFIX_POOL,
  LOOT,
  LOOT_MISC_BASES,
  LOOT_TIER_ADVANCED,
  LOOT_TIER_EPIC,
  LOOT_TIER_MID,
  LOOT_TIER_MYTHIC,
  LOOT_TIER_STARTER,
  PHASE2,
  ZONES,
} from '../../data'
import type { RandomSource } from '../../rng'
import { getLegacyItemBaseName } from './item-normalizer'
import type { LegacyItemValue } from './item-stats'

export type LegacyItemVariantSource = 'loot' | 'loot_named' | 'afk' | 'mystic' | 'shop' | 'reroll' | 'drop'
export interface LegacyItemVariantOptions {
  random: RandomSource
  forceRarity?: string
  forceLevel?: number
}

type Affix = { stat: string; min: number; max: number; prefix: string; suffix: string }
type ItemRecord = Record<string, any>
type EpicVariant = { id: string; name: string; rolls: ItemRecord }

function pick<T>(items: readonly T[], random: RandomSource): T {
  return items[random.integer(0, items.length - 1)]
}

function getZoneIndex(zoneIndex: number): number {
  return Math.max(0, Math.min(ZONES.length - 1, Math.floor(Number(zoneIndex) || 0)))
}

function validPool(items: readonly string[]): string[] {
  return items.filter((name) => LOOT.includes(name as (typeof LOOT)[number]))
}

function pickLegacyLootBase(
  zoneIndex: number,
  source: LegacyItemVariantSource,
  random: RandomSource,
): string {
  const zoneLevel = Number(ZONES[getZoneIndex(zoneIndex)]?.minLvl || 1)
  let weights: number[]
  let miscWeight: number
  if (zoneLevel >= 160) { weights = [0, 0, 0.1, 0.45, 0.45]; miscWeight = 0.02 }
  else if (zoneLevel >= 130) { weights = [0, 0, 0.22, 0.5, 0.28]; miscWeight = 0.02 }
  else if (zoneLevel >= 100) { weights = [0, 0.08, 0.42, 0.4, 0.1]; miscWeight = 0.03 }
  else if (zoneLevel >= 80) { weights = [0, 0.16, 0.46, 0.33, 0.05]; miscWeight = 0.04 }
  else if (zoneLevel >= 60) { weights = [0.05, 0.26, 0.49, 0.2, 0]; miscWeight = 0.05 }
  else if (zoneLevel >= 45) { weights = [0.14, 0.4, 0.38, 0.08, 0]; miscWeight = 0.07 }
  else if (zoneLevel >= 25) { weights = [0.3, 0.44, 0.24, 0.02, 0]; miscWeight = 0.1 }
  else if (zoneLevel >= 12) { weights = [0.5, 0.34, 0.16, 0, 0]; miscWeight = 0.12 }
  else { weights = [0.7, 0.22, 0.08, 0, 0]; miscWeight = 0.15 }

  if (source === 'mystic') {
    weights = [weights[0] * 0.4, weights[1] * 0.9, weights[2] * 1.3, weights[3] * 1.6, weights[4] * 1.8]
    miscWeight *= 0.5
  }
  const pools = [LOOT_TIER_STARTER, LOOT_TIER_MID, LOOT_TIER_ADVANCED, LOOT_TIER_EPIC, LOOT_TIER_MYTHIC]
  let roll = random.next() * (weights.reduce((sum, value) => sum + value, 0) || 1)
  for (let index = 0; index < pools.length; index += 1) {
    roll -= weights[index]
    if (roll <= 0) {
      const valid = validPool(pools[index])
      if (valid.length) return pick(valid, random)
      break
    }
  }
  if (zoneLevel >= 60) {
    for (const pool of [LOOT_TIER_MYTHIC, LOOT_TIER_EPIC, LOOT_TIER_ADVANCED, LOOT_TIER_MID, LOOT_TIER_STARTER]) {
      const valid = validPool(pool)
      if (valid.length) return pick(valid, random)
    }
  }
  if (random.next() < miscWeight) {
    const misc = validPool(LOOT_MISC_BASES)
    if (misc.length) return pick(misc, random)
  }
  return pick(LOOT, random)
}

export function getLegacyLevelScaledAffixCount(ilvl: number, rare: boolean, random: RandomSource): number {
  const level = Math.max(1, Number(ilvl) || 1)
  let count = 1 + Math.floor(level / 45)
  if (rare) count += 1
  if (random.next() < 0.35) count += 1
  return Math.max(rare ? 2 : 1, Math.min(count, 7))
}

export function getLegacyLevelScaledAbilityCount(ilvl: number, quality: string, random: RandomSource): number {
  const level = Math.max(1, Number(ilvl) || 1)
  const base = Math.floor(level / 55)
  const qualityBonus = quality === 'Mythic' ? 2 : quality === 'Legendary' || quality === 'Epic' ? 1 : 0
  const jitter = random.next() < 0.35 ? 1 : 0
  return Math.max(0, Math.min(base + qualityBonus + jitter, 6))
}

export function getLegacyAbilityValueRange(ilvl: number): { min: number; max: number } {
  const level = Math.max(1, Number(ilvl) || 1)
  const min = 1 + Math.floor(level / 60)
  return { min, max: Math.max(min + 1, 3 + Math.floor(level / 22)) }
}

function addScaledAbilityBonuses(rolls: ItemRecord, count: number, ilvl: number, random: RandomSource): void {
  const range = getLegacyAbilityValueRange(ilvl)
  const pool = [...ABILITIES]
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swap = random.integer(0, index)
    ;[pool[index], pool[swap]] = [pool[swap], pool[index]]
  }
  pool.sort((left, right) => (rolls[left] ? 1 : 0) - (rolls[right] ? 1 : 0))
  for (const stat of pool.slice(0, Math.max(0, Math.min(count, pool.length)))) {
    const value = range.min + random.integer(0, Math.max(1, range.max - range.min + 1) - 1)
    rolls[stat] = (rolls[stat] || 0) + value
  }
}

function chooseAffixes(pool: readonly Affix[], count: number, random: RandomSource): Affix[] {
  const picked: Affix[] = []
  const used = new Set<number>()
  let attempts = 0
  while (picked.length < count && used.size < pool.length && attempts < pool.length * 8) {
    attempts += 1
    const index = random.integer(0, pool.length - 1)
    if (used.has(index)) continue
    used.add(index)
    picked.push(pool[index])
  }
  for (let index = 0; picked.length < count && index < pool.length; index += 1) {
    if (!used.has(index)) picked.push(pool[index])
  }
  return picked
}

function rollHighQuality(baseName: string, slot: string, ilvl: number, quality: 'Legendary' | 'Mythic', random: RandomSource): ItemRecord {
  const pool = (ITEM_AFFIX_POOL[slot as keyof typeof ITEM_AFFIX_POOL] || []) as readonly Affix[]
  const count = Math.min((quality === 'Legendary' ? PHASE2.legendaryAffixCount : PHASE2.mythicAffixCount) + Math.floor(ilvl / (quality === 'Legendary' ? 50 : 45)), pool.length)
  const picks = chooseAffixes(pool, count, random)
  const rolls: ItemRecord = {}
  for (const affix of picks) {
    const value = quality === 'Mythic'
      ? affix.max
      : affix.min + Math.ceil((affix.max - affix.min) / 2) + random.integer(0, Math.max(0, affix.max - (affix.min + Math.ceil((affix.max - affix.min) / 2))))
    rolls[affix.stat] = (rolls[affix.stat] || 0) + Math.floor(value * (quality === 'Mythic' ? 1.85 : 1.3))
  }
  addScaledAbilityBonuses(rolls, Math.max(quality === 'Mythic' ? 3 : 2, getLegacyLevelScaledAbilityCount(ilvl, quality, random)), ilvl, random)
  const prefix = picks[0]?.prefix || (quality === 'Mythic' ? 'Mythic' : 'Exalted')
  const suffix = picks[1]?.suffix || (quality === 'Mythic' ? 'the Ancients' : 'Legends')
  return { base: baseName, name: `${prefix} ${baseName} of ${suffix}`, rolls, quality }
}

function rollAffixVariant(baseName: string, slot: string, ilvl: number, quality: 'Magic' | 'Rare', random: RandomSource): ItemRecord | string {
  const pool = (ITEM_AFFIX_POOL[slot as keyof typeof ITEM_AFFIX_POOL] || []) as readonly Affix[]
  if (!pool.length) return baseName
  const picks = chooseAffixes(pool, getLegacyLevelScaledAffixCount(ilvl, quality === 'Rare', random), random)
  if (!picks.length) return baseName
  const rolls: ItemRecord = {}
  for (const affix of picks) rolls[affix.stat] = (rolls[affix.stat] || 0) + random.integer(affix.min, affix.max)
  const abilityCount = getLegacyLevelScaledAbilityCount(ilvl, quality, random)
  if (abilityCount > 0) addScaledAbilityBonuses(rolls, abilityCount, ilvl, random)
  const prefix = picks[0]?.prefix || ''
  const suffix = picks[1]?.suffix || ''
  return { base: baseName, name: `${prefix ? `${prefix} ` : ''}${baseName}${suffix ? ` of ${suffix}` : ''}`, rolls, quality }
}

export function rollLegacyItemVariant(
  baseName: string | null | undefined,
  source: LegacyItemVariantSource,
  options: LegacyItemVariantOptions,
  zoneIndex = 0,
): LegacyItemValue {
  const random = options.random
  const requestedQuality = options.forceRarity ? String(options.forceRarity).toLowerCase() : ''
  let resolvedBase = baseName || ''
  if (!resolvedBase && requestedQuality === 'mythic') resolvedBase = pick(validPool(LOOT_TIER_MYTHIC), random)
  if (!resolvedBase) resolvedBase = pickLegacyLootBase(zoneIndex, source === 'drop' ? 'loot' : source, random)
  const data = ALL_ITEM_DATA[resolvedBase as keyof typeof ALL_ITEM_DATA]
  if (!data) return resolvedBase

  const forceLevel = Number(options.forceLevel)
  const mobLevel = Number.isFinite(forceLevel) ? Math.max(1, Math.floor(forceLevel)) : 1
  const ilvl = Math.max(1, Math.floor(mobLevel + random.integer(-1, 1)))
  const levelReq = Math.max(1, ilvl - PHASE2.levelReqOffset)
  const finish = (item: ItemRecord | string): LegacyItemValue => {
    if (typeof item === 'string') return item
    return { ...item, ilvl, levelReq }
  }

  if (requestedQuality === 'mythic' || requestedQuality === 'legendary') {
    return finish(rollHighQuality(resolvedBase, data.slot, ilvl, requestedQuality === 'mythic' ? 'Mythic' : 'Legendary', random))
  }
  if (requestedQuality === 'epic') {
    const pool = (EPIC_ITEM_BY_BASE[resolvedBase as keyof typeof EPIC_ITEM_BY_BASE] || []) as readonly EpicVariant[]
    if (pool.length) {
      const chosen = pick(pool, random)
      const rolls = { ...chosen.rolls }
      addScaledAbilityBonuses(rolls, Math.max(1, getLegacyLevelScaledAbilityCount(ilvl, 'Epic', random)), ilvl, random)
      return { base: resolvedBase, name: chosen.name, rolls, quality: 'Epic', epicId: chosen.id, ilvl, levelReq }
    }
    return finish(rollHighQuality(resolvedBase, data.slot, ilvl, 'Legendary', random))
  }
  if (requestedQuality === 'rare' || requestedQuality === 'magic') return finish(rollAffixVariant(resolvedBase, data.slot, ilvl, requestedQuality === 'rare' ? 'Rare' : 'Magic', random))

  const epicPool = (EPIC_ITEM_BY_BASE[resolvedBase as keyof typeof EPIC_ITEM_BY_BASE] || []) as readonly EpicVariant[]
  const mythicChance = source === 'loot_named' ? PHASE2.mythicChanceNamed : source === 'loot' ? PHASE2.mythicChanceRegular : 0
  if (mythicChance > 0 && random.next() < mythicChance) return finish(rollHighQuality(resolvedBase, data.slot, ilvl, 'Mythic', random))
  const legendaryChance = source === 'loot_named' ? PHASE2.legendaryChanceNamed : source === 'loot' ? PHASE2.legendaryChanceRegular : 0
  if (legendaryChance > 0 && random.next() < legendaryChance) return finish(rollHighQuality(resolvedBase, data.slot, ilvl, 'Legendary', random))
  const epicChance = source === 'loot_named' ? 0.015 : source === 'loot' ? 0.0035 : source === 'afk' ? 0.0015 : 0
  if (epicPool.length && epicChance > 0 && random.next() < epicChance) {
    const chosen = pick(epicPool, random)
    const rolls = { ...chosen.rolls }
    addScaledAbilityBonuses(rolls, Math.max(1, getLegacyLevelScaledAbilityCount(ilvl, 'Epic', random)), ilvl, random)
    return { base: resolvedBase, name: chosen.name, rolls, quality: 'Epic', epicId: chosen.id, ilvl, levelReq }
  }
  const magicChance = source === 'reroll' ? 1 : source === 'shop' ? 0.55 : source === 'afk' ? 0.35 : 0.42
  if (random.next() > magicChance) return resolvedBase
  const rareChance = (source === 'reroll' ? 0.35 : source === 'shop' ? 0.3 : 0.18) + Math.min(0.4, ilvl / 300)
  const quality = random.next() < rareChance ? 'Rare' : 'Magic'
  return finish(rollAffixVariant(resolvedBase, data.slot, ilvl, quality, random))
}

export function getLegacyItemDisplayName(entry: unknown): string {
  if (entry && typeof entry === 'object' && typeof (entry as ItemRecord).name === 'string' && (entry as ItemRecord).name.trim()) return (entry as ItemRecord).name.trim()
  return getLegacyItemBaseName(entry) || 'Unknown Item'
}
