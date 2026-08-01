import {
  ABILITIES,
  ALL_ITEM_DATA,
  ITEM_AFFIX_POOL,
  RUNE_DATA,
  RUNEWORD_RECIPES_BY_SLOT,
  SHOP_BASE_PRICES,
} from '../../data'
import type { RandomSource } from '../../rng'
import type { LegacyCharacterSave } from '../../save'
import {
  getLegacyItemBaseName,
  getLegacySocketCapacity,
  type LegacyEquipmentSlot,
} from './item-normalizer'
import {
  getItemLevel,
  getLegacyItemEffectiveStats,
  getLegacyItemQuality,
  getLegacyItemSellValue,
} from './item-stats'

export type LegacyGearTarget =
  | { kind: 'inventory'; index: number }
  | { kind: 'equipment'; slot: LegacyEquipmentSlot }

export type LegacyEquipmentCustomizationFailure =
  | 'invalid-target'
  | 'not-equipment'
  | 'locked'
  | 'sealed-runeword'
  | 'no-socket-capacity'
  | 'socket-cap-reached'
  | 'no-empty-socket'
  | 'unknown-rune'
  | 'rune-unavailable'
  | 'empty-socket'
  | 'not-reforgeable'
  | 'invalid-stat'
  | 'insufficient-gold'

export interface LegacyEquipmentCustomizationResult {
  applied: boolean
  character: LegacyCharacterSave
  item: unknown | null
  displaced: unknown | null
  cost: number
  discoveredRuneword: string | null
  failure: LegacyEquipmentCustomizationFailure | null
}

export type LegacyAutoEquipMetric = 'score' | 'quality' | 'atk' | 'def' | 'hp' | 'mp'

export interface LegacyAutoEquipOptions {
  emptySlots?: boolean
  upgrades?: boolean
  metric?: LegacyAutoEquipMetric
  threshold?: number
  sellDisplaced?: boolean
  sellValue?: number
  random?: Pick<RandomSource, 'next'>
}

const REFORGE_CONFIG = {
  base: 250,
  growth: 1.5,
  maxPriceSteps: 12,
  levelPerPoint: 40,
} as const

function cloneCharacter(character: LegacyCharacterSave): Record<string, any> {
  return JSON.parse(JSON.stringify(character)) as Record<string, any>
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function failed(
  character: LegacyCharacterSave,
  failure: LegacyEquipmentCustomizationFailure,
  cost = 0,
): LegacyEquipmentCustomizationResult {
  return {
    applied: false,
    character,
    item: null,
    displaced: null,
    cost,
    discoveredRuneword: null,
    failure,
  }
}

function itemData(item: unknown): Record<string, any> | null {
  const base = getLegacyItemBaseName(item)
  return (ALL_ITEM_DATA as unknown as Record<string, Record<string, any>>)[base] || null
}

function applyItemStats(character: Record<string, any>, item: unknown, direction: 1 | -1): void {
  const stats = getLegacyItemEffectiveStats(item)
  if (!stats) return
  character.atk = Number(character.atk || 0) + stats.atk * direction
  character.def = Number(character.def || 0) + stats.def * direction
  character.maxHp = Number(character.maxHp || 0) + stats.hp * direction
  character.maxMp = Number(character.maxMp || 0) + stats.mp * direction
}

function resolveTarget(character: Record<string, any>, target: LegacyGearTarget): {
  item: unknown
  equipped: boolean
  set(item: unknown): void
} | null {
  if (target.kind === 'inventory') {
    const index = Math.floor(Number(target.index))
    if (!Array.isArray(character.inventory) || index < 0 || index >= character.inventory.length) return null
    return {
      item: character.inventory[index],
      equipped: false,
      set(item) { character.inventory[index] = item },
    }
  }
  if (!character.equipment || typeof character.equipment !== 'object') return null
  const item = character.equipment[target.slot]
  if (!item) return null
  return {
    item,
    equipped: true,
    set(item) { character.equipment[target.slot] = item },
  }
}

function replaceTarget(
  character: Record<string, any>,
  target: ReturnType<typeof resolveTarget>,
  item: unknown,
): void {
  if (!target) return
  if (target.equipped) applyItemStats(character, target.item, -1)
  target.set(item)
  if (target.equipped) applyItemStats(character, item, 1)
}

function merchantPrice(base: number, multiplier = 1): number {
  return Math.max(0, Math.floor(Math.max(0, base) * Math.max(0, Number(multiplier) || 0)))
}

export function toLegacySocketableItem(entry: unknown): Record<string, any> | null {
  const base = getLegacyItemBaseName(entry)
  if (!itemData(entry)) return null
  const capacity = getLegacySocketCapacity(base)
  if (capacity <= 0) return null
  const source = isRecord(entry) ? entry : {}
  const item: Record<string, any> = {
    ...source,
    base,
    name: typeof source.name === 'string' && source.name.trim() ? source.name.trim() : base,
    rolls: isRecord(source.rolls) ? { ...source.rolls } : {},
    quality: getLegacyItemQuality(entry),
    maxSockets: Math.max(0, Math.min(capacity, Math.floor(Number(source.maxSockets || 0)))),
    sockets: [],
    runeword: null,
  }
  const sockets = Array.isArray(source.sockets)
    ? source.sockets.slice(0, item.maxSockets).map((rune) => (
        typeof rune === 'string' && rune in RUNE_DATA ? rune : null
      ))
    : []
  while (sockets.length < item.maxSockets) sockets.push(null)
  item.sockets = sockets
  if (isRecord(source.runeword) && typeof source.runeword.name === 'string') {
    item.runeword = {
      name: source.runeword.name,
      bonus: isRecord(source.runeword.bonus) ? { ...source.runeword.bonus } : {},
      xp: Math.max(0, Math.floor(Number(source.runeword.xp || 0))),
    }
    item.quality = 'Runeword'
  }
  return item
}

export function getLegacySocketCost(entry: unknown, characterLevel: number, priceMultiplier = 1): number {
  let base = Number(SHOP_BASE_PRICES.occultistSocket) + Math.floor(Math.max(1, Number(characterLevel) || 1) * 4)
  const quality = getLegacyItemQuality(entry)
  if (quality === 'Magic') base += 20
  if (quality === 'Rare') base += 40
  if (quality === 'Runeword') base += 120
  return merchantPrice(base, priceMultiplier)
}

export function addLegacyItemSocket(
  source: LegacyCharacterSave,
  targetRef: LegacyGearTarget,
  priceMultiplier = 1,
): LegacyEquipmentCustomizationResult {
  const character = cloneCharacter(source)
  const target = resolveTarget(character, targetRef)
  if (!target) return failed(source, 'invalid-target')
  if (!itemData(target.item)) return failed(source, 'not-equipment')
  if (getLegacyItemQuality(target.item) === 'Runeword') return failed(source, 'sealed-runeword')
  const item = toLegacySocketableItem(target.item)
  if (!item) return failed(source, 'no-socket-capacity')
  const capacity = getLegacySocketCapacity(item.base)
  if (item.maxSockets >= capacity) return failed(source, 'socket-cap-reached')
  const cost = getLegacySocketCost(target.item, Number(character.level || 1), priceMultiplier)
  if (Number(character.gold || 0) < cost) return failed(source, 'insufficient-gold', cost)
  item.maxSockets += 1
  while (item.sockets.length < item.maxSockets) item.sockets.push(null)
  character.gold = Number(character.gold || 0) - cost
  replaceTarget(character, target, item)
  return { applied: true, character, item, displaced: null, cost, discoveredRuneword: null, failure: null }
}

function consumeRune(character: Record<string, any>, runeName: string): boolean {
  const stash = Array.isArray(character.runeStash) ? character.runeStash : []
  const stashIndex = stash.findIndex((entry: unknown) => entry === runeName)
  if (stashIndex >= 0) {
    stash.splice(stashIndex, 1)
    character.runeStash = stash
    return true
  }
  const inventory = Array.isArray(character.inventory) ? character.inventory : []
  const inventoryIndex = inventory.findIndex((entry: unknown) => getLegacyItemBaseName(entry) === runeName)
  if (inventoryIndex < 0) return false
  inventory.splice(inventoryIndex, 1)
  character.inventory = inventory
  return true
}

export function applyLegacyRuneword(item: Record<string, any>): { item: Record<string, any>; discovered: string | null } {
  const output = JSON.parse(JSON.stringify(item)) as Record<string, any>
  const slot = itemData(output)?.slot as keyof typeof RUNEWORD_RECIPES_BY_SLOT | undefined
  const recipes = slot ? RUNEWORD_RECIPES_BY_SLOT[slot] : undefined
  if (!recipes || !Array.isArray(output.sockets)) return { item: output, discovered: null }
  const socketed = output.sockets.filter(Boolean).slice().sort().join('|')
  const recipe = recipes.find((candidate) => (
    candidate.runes.length <= output.sockets.length &&
    candidate.runes.slice().sort().join('|') === socketed
  ))
  if (!recipe) return { item: output, discovered: null }
  output.runeword = { name: recipe.name, bonus: { ...recipe.bonus }, xp: 0 }
  output.name = recipe.name
  output.quality = 'Runeword'
  return { item: output, discovered: recipe.name }
}

export function insertLegacyRune(
  source: LegacyCharacterSave,
  targetRef: LegacyGearTarget,
  runeName: string,
): LegacyEquipmentCustomizationResult {
  if (!(runeName in RUNE_DATA)) return failed(source, 'unknown-rune')
  const character = cloneCharacter(source)
  const target = resolveTarget(character, targetRef)
  if (!target) return failed(source, 'invalid-target')
  if (getLegacyItemQuality(target.item) === 'Runeword') return failed(source, 'sealed-runeword')
  const item = toLegacySocketableItem(target.item)
  if (!item || item.maxSockets <= 0) return failed(source, 'no-socket-capacity')
  const socketIndex = item.sockets.findIndex((entry: unknown) => !entry)
  if (socketIndex < 0) return failed(source, 'no-empty-socket')
  if (!consumeRune(character, runeName)) return failed(source, 'rune-unavailable')
  item.sockets[socketIndex] = runeName
  const applied = applyLegacyRuneword(item)
  const known = Array.isArray(character.discoveredRunewords) ? character.discoveredRunewords : []
  let discoveredRuneword: string | null = null
  if (applied.discovered && !known.includes(applied.discovered)) {
    known.push(applied.discovered)
    character.discoveredRunewords = known
    discoveredRuneword = applied.discovered
  }
  replaceTarget(character, target, applied.item)
  return {
    applied: true,
    character,
    item: applied.item,
    displaced: null,
    cost: 0,
    discoveredRuneword,
    failure: null,
  }
}

export function destroyLegacySocketedRune(
  source: LegacyCharacterSave,
  targetRef: LegacyGearTarget,
  socketIndex: number,
): LegacyEquipmentCustomizationResult {
  const character = cloneCharacter(source)
  const target = resolveTarget(character, targetRef)
  if (!target) return failed(source, 'invalid-target')
  if (isRecord(target.item) && target.item.locked) return failed(source, 'locked')
  if (getLegacyItemQuality(target.item) === 'Runeword') return failed(source, 'sealed-runeword')
  const item = toLegacySocketableItem(target.item)
  const index = Math.floor(Number(socketIndex))
  if (!item || index < 0 || index >= item.sockets.length || !item.sockets[index]) return failed(source, 'empty-socket')
  item.sockets[index] = null
  replaceTarget(character, target, item)
  return { applied: true, character, item, displaced: null, cost: 0, discoveredRuneword: null, failure: null }
}

export function getLegacyEquipmentQualityRank(item: unknown): number {
  const quality = getLegacyItemQuality(item)
  if (quality === 'Mythic') return 7
  if (quality === 'Legendary') return 6
  if (quality === 'Runeword') return 5
  if (quality === 'Epic') return 4
  if (quality === 'Rare') return 3
  if (quality === 'Magic') return 2
  return 1
}

export function getLegacyLootItemScore(item: unknown): number {
  const stats = getLegacyItemEffectiveStats(item)
  if (!stats) return 0
  return stats.atk * 3 + stats.def * 2 + stats.hp * 0.25 + stats.mp * 0.2
}

export function isLegacyEquipmentUpgrade(
  candidate: unknown,
  current: unknown,
  metric: LegacyAutoEquipMetric = 'score',
  threshold = 1,
): boolean {
  const minimum = Number.isFinite(Number(threshold)) ? Number(threshold) : 1
  const candidateStats = getLegacyItemEffectiveStats(candidate)
  const currentStats = getLegacyItemEffectiveStats(current)
  if (!candidateStats || !currentStats) return false
  const candidateScore = getLegacyLootItemScore(candidate)
  const currentScore = getLegacyLootItemScore(current)
  if (metric === 'quality') {
    const nextRank = getLegacyEquipmentQualityRank(candidate)
    const oldRank = getLegacyEquipmentQualityRank(current)
    return nextRank > oldRank || (nextRank === oldRank && candidateScore >= currentScore + minimum)
  }
  if (metric === 'atk' || metric === 'def' || metric === 'hp' || metric === 'mp') {
    return candidateStats[metric] >= currentStats[metric] + minimum
  }
  return candidateScore >= currentScore + minimum
}

export function autoEquipLegacyLootItem(
  source: LegacyCharacterSave,
  item: unknown,
  options: LegacyAutoEquipOptions = {},
): LegacyEquipmentCustomizationResult {
  const data = itemData(item)
  if (!data?.slot) return failed(source, 'not-equipment')
  const character = cloneCharacter(source)
  if (!character.equipment || typeof character.equipment !== 'object') character.equipment = {}
  if (!Array.isArray(character.inventory)) character.inventory = []
  const slot = data.slot as LegacyEquipmentSlot
  const current = character.equipment[slot] || null
  const allowed = !current
    ? options.emptySlots === true
    : options.upgrades === true && isLegacyEquipmentUpgrade(item, current, options.metric, options.threshold)
  if (!allowed) return failed(source, 'not-reforgeable')
  if (current) applyItemStats(character, current, -1)
  character.equipment[slot] = item
  applyItemStats(character, item, 1)
  if (current) {
    if (options.sellDisplaced && !(isRecord(current) && (current.locked || current.favorite))) {
      const value = Number.isFinite(Number(options.sellValue))
        ? Math.max(0, Math.floor(Number(options.sellValue)))
        : getLegacyItemSellValue(current, options.random)
      character.gold = Number(character.gold || 0) + value
    } else character.inventory.push(current)
  }
  return { applied: true, character, item, displaced: current, cost: 0, discoveredRuneword: null, failure: null }
}

export function getLegacyReforgeCost(entry: unknown, characterLevel: number, priceMultiplier = 1): number {
  const count = Math.max(0, Math.floor(Number(isRecord(entry) ? entry.reforgeCount : 0) || 0))
  const steps = Math.min(count, REFORGE_CONFIG.maxPriceSteps)
  const base = REFORGE_CONFIG.base + Math.floor(Math.max(1, Number(characterLevel) || 1) * REFORGE_CONFIG.levelPerPoint)
  return merchantPrice(Math.floor(base * Math.pow(REFORGE_CONFIG.growth, steps)), priceMultiplier)
}

export function getLegacyReforgeableStats(entry: unknown): string[] {
  if (!isRecord(entry) || !isRecord(entry.rolls)) return []
  return ['atk', 'def', 'hp', 'mp', ...ABILITIES].filter((stat) => Number(entry.rolls[stat]) > 0)
}

export function isLegacyReforgeableItem(entry: unknown): boolean {
  if (!isRecord(entry) || !itemData(entry) || entry.locked) return false
  const quality = getLegacyItemQuality(entry)
  if (quality === 'Epic' || quality === 'Legendary' || quality === 'Mythic' || quality === 'Runeword') return false
  return getLegacyReforgeableStats(entry).length > 0
}

export function getLegacyReforgeStatRange(entry: unknown, stat: string): { min: number; max: number } {
  if (ABILITIES.includes(stat as (typeof ABILITIES)[number])) {
    const level = Math.max(1, getItemLevel(entry))
    const min = 1 + Math.floor(level / 60)
    const max = 3 + Math.floor(level / 22)
    return { min, max: Math.max(min + 1, max) }
  }
  const slot = itemData(entry)?.slot as keyof typeof ITEM_AFFIX_POOL | undefined
  const pool = slot ? ITEM_AFFIX_POOL[slot] : undefined
  const matches = (pool || []).filter((affix) => affix.stat === stat)
  if (matches.length) {
    return {
      min: Math.min(...matches.map((affix) => Number(affix.min))),
      max: Math.max(...matches.map((affix) => Number(affix.max))),
    }
  }
  const current = Number(isRecord(entry) && isRecord(entry.rolls) ? entry.rolls[stat] : 1) || 1
  return { min: Math.max(1, Math.floor(current * 0.5)), max: Math.max(2, Math.ceil(current * 1.5)) }
}

export function reforgeLegacyItemStat(
  source: LegacyCharacterSave,
  targetRef: LegacyGearTarget,
  stat: string,
  random: RandomSource,
  priceMultiplier = 1,
): LegacyEquipmentCustomizationResult {
  const character = cloneCharacter(source)
  const target = resolveTarget(character, targetRef)
  if (!target) return failed(source, 'invalid-target')
  if (isRecord(target.item) && target.item.locked) return failed(source, 'locked')
  if (!isLegacyReforgeableItem(target.item)) return failed(source, 'not-reforgeable')
  if (!getLegacyReforgeableStats(target.item).includes(stat)) return failed(source, 'invalid-stat')
  const cost = getLegacyReforgeCost(target.item, Number(character.level || 1), priceMultiplier)
  if (Number(character.gold || 0) < cost) return failed(source, 'insufficient-gold', cost)
  const item = JSON.parse(JSON.stringify(target.item)) as Record<string, any>
  const range = getLegacyReforgeStatRange(item, stat)
  item.rolls[stat] = random.integer(range.min, range.max)
  item.reforgeCount = Math.max(0, Math.floor(Number(item.reforgeCount || 0))) + 1
  character.gold = Number(character.gold || 0) - cost
  replaceTarget(character, target, item)
  return { applied: true, character, item, displaced: null, cost, discoveredRuneword: null, failure: null }
}
