import {
  ABILITIES,
  ALL_ITEM_DATA,
  ITEM_SETS,
  RUNE_DATA,
  RUNEWORD_EVOLUTION_MULT_PER_TIER,
  RUNEWORD_EVOLUTION_THRESHOLDS,
  ALL_WEAPON_PROCS,
} from '../../data'
import { getLegacyItemBaseName } from './item-normalizer'

export type LegacyItemValue = string | Record<string, any>
export type LegacyItemQuality = 'Normal' | 'Magic' | 'Rare' | 'Epic' | 'Runeword' | 'Legendary' | 'Mythic'
export type LegacyItemStat = 'atk' | 'def' | 'hp' | 'mp' | (typeof ABILITIES)[number]

export interface LegacyItemStats extends Record<LegacyItemStat, number> {}

const QUALITY_SET = new Set<LegacyItemQuality>(['Magic', 'Rare', 'Epic', 'Runeword', 'Legendary', 'Mythic'])

export function getLegacyItemQuality(entry: unknown): LegacyItemQuality {
  const value = entry && typeof entry === 'object' ? (entry as Record<string, unknown>).quality : null
  return typeof value === 'string' && QUALITY_SET.has(value as LegacyItemQuality)
    ? (value as LegacyItemQuality)
    : 'Normal'
}

export function getLegacyItemLevelStatFactor(entry: unknown): number {
  const ilvl = getItemLevel(entry)
  const offset = ilvl - 1
  return 1 + offset * 0.07 + offset * offset * 0.00015
}

export function getLegacyItemDefensiveStatFactor(entry: unknown): number {
  return 1 + (getItemLevel(entry) - 1) * 0.045
}

export function getLegacyItemRollScaleFactor(entry: unknown): number {
  return 1 + (getItemLevel(entry) - 1) * 0.046
}

export function getItemLevel(entry: unknown): number {
  if (!entry || typeof entry !== 'object') return 1
  const value = Number((entry as Record<string, unknown>).ilvl)
  return Number.isFinite(value) ? Math.max(1, Math.floor(value)) : 1
}

function emptyStats(): LegacyItemStats {
  return { atk: 0, def: 0, hp: 0, mp: 0, str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 }
}

export function getLegacyRunewordTier(xpRaw: unknown): number {
  const xp = Math.max(0, Math.floor(Number(xpRaw) || 0))
  let tier = 1
  for (let index = 1; index < RUNEWORD_EVOLUTION_THRESHOLDS.length; index += 1) {
    if (xp >= RUNEWORD_EVOLUTION_THRESHOLDS[index]) tier = index + 1
  }
  return Math.max(1, Math.min(RUNEWORD_EVOLUTION_THRESHOLDS.length, tier))
}

export function getLegacyRunewordBonusStats(runeword: unknown): Partial<LegacyItemStats> {
  if (!runeword || typeof runeword !== 'object') return {}
  const value = runeword as Record<string, any>
  const bonus = value.bonus && typeof value.bonus === 'object' ? value.bonus : {}
  const multiplier = 1 + (getLegacyRunewordTier(value.xp) - 1) * RUNEWORD_EVOLUTION_MULT_PER_TIER
  return {
    atk: Math.floor(Number(bonus.atk || 0) * multiplier),
    def: Math.floor(Number(bonus.def || 0) * multiplier),
    hp: Math.floor(Number(bonus.hp || 0) * multiplier),
    mp: Math.floor(Number(bonus.mp || 0) * multiplier),
  }
}

export function getLegacyItemEffectiveStats(entry: unknown): LegacyItemStats | null {
  const baseName = getLegacyItemBaseName(entry)
  const base = ALL_ITEM_DATA[baseName as keyof typeof ALL_ITEM_DATA]
  if (!base) return null
  const baseStats = base as Record<string, unknown>

  const quality = getLegacyItemQuality(entry)
  const rollMultiplier = quality === 'Mythic' ? 2.1 : quality === 'Epic' ? 1.75 : quality === 'Legendary' ? 1.4 : 1
  const stats = emptyStats()
  const levelFactor = getLegacyItemLevelStatFactor(entry)
  const defensiveFactor = getLegacyItemDefensiveStatFactor(entry)
  const rollScale = getLegacyItemRollScaleFactor(entry)

  stats.atk = Math.floor(Number(baseStats.atk || 0) * levelFactor)
  stats.def = Math.floor(Number(baseStats.def || 0) * defensiveFactor)
  stats.hp = Math.floor(Number(baseStats.hp || 0) * defensiveFactor)
  stats.mp = Math.floor(Number(baseStats.mp || 0) * defensiveFactor)

  const value = entry && typeof entry === 'object' ? entry as Record<string, any> : null
  const rolls = value?.rolls && typeof value.rolls === 'object' ? value.rolls : {}
  for (const stat of ['atk', 'def', 'hp', 'mp'] as const) {
    const rolled = Number(rolls[stat] || 0)
    if (Number.isFinite(rolled) && rolled > 0) stats[stat] += Math.floor(rolled * rollMultiplier * rollScale)
  }
  for (const stat of ABILITIES) {
    const rolled = Number(rolls[stat] || 0)
    if (Number.isFinite(rolled) && rolled > 0) stats[stat] += Math.floor(rolled * rollMultiplier)
  }

  const qualityBoost = quality === 'Epic'
    ? { atk: 2, def: 2, hp: 12, mp: 12 }
    : quality === 'Legendary'
      ? { atk: 3, def: 3, hp: 16, mp: 16 }
      : quality === 'Mythic'
        ? { atk: 6, def: 6, hp: 30, mp: 30 }
        : { atk: 0, def: 0, hp: 0, mp: 0 }
  for (const stat of ['atk', 'def', 'hp', 'mp'] as const) {
    stats[stat] += Math.floor(qualityBoost[stat] * rollScale)
  }

  for (const runeName of Array.isArray(value?.sockets) ? value.sockets : []) {
    const rune = RUNE_DATA[runeName as keyof typeof RUNE_DATA]
    if (rune && rune.stat in stats) stats[rune.stat as LegacyItemStat] += Number(rune.value || 0)
  }
  const runewordStats = getLegacyRunewordBonusStats(value?.runeword)
  for (const stat of ['atk', 'def', 'hp', 'mp'] as const) stats[stat] += Number(runewordStats[stat] || 0)
  return stats
}

export function getLegacyEquippedRunewordEffects(equipment: Record<string, unknown> | null | undefined) {
  const effects = { crit: 0, lifesteal: 0, goldFind: 0, xpFind: 0 }
  if (!equipment) return effects
  for (const item of Object.values(equipment)) {
    if (!item || typeof item !== 'object') continue
    const runeword = (item as Record<string, any>).runeword
    if (!runeword || typeof runeword !== 'object') continue
    const bonus = runeword.bonus && typeof runeword.bonus === 'object' ? runeword.bonus : {}
    const multiplier = 1 + (getLegacyRunewordTier(runeword.xp) - 1) * RUNEWORD_EVOLUTION_MULT_PER_TIER
    for (const key of ['crit', 'lifesteal', 'goldFind', 'xpFind'] as const) {
      const value = Number(bonus[key] || 0)
      if (Number.isFinite(value) && value > 0) effects[key] += value * multiplier
    }
  }
  return effects
}

export function getLegacyActiveSetBonusStats(equipment: Record<string, unknown> | null | undefined) {
  const result = { atk: 0, def: 0, procChance: 0, names: [] as string[] }
  if (!equipment) return result
  const equipped = Object.values(equipment).map(getLegacyItemBaseName).filter(Boolean)
  for (const [name, set] of Object.entries(ITEM_SETS)) {
    const count = set.pieces.filter((piece) => equipped.includes(piece)).length
    if (count < 2) continue
    const bonus = count >= 3 && 'bonus3' in set ? set.bonus3 : set.bonus2
    result.atk += Number(bonus.atk || 0)
    result.def += Number(bonus.def || 0)
    result.procChance += Number(bonus.procChance || 0)
    result.names.push(name)
  }
  return result
}

export function getLegacyWeaponProc(baseName: string) {
  return ALL_WEAPON_PROCS[baseName as keyof typeof ALL_WEAPON_PROCS] ?? null
}

export function getLegacyItemSellValue(entry: unknown, random?: { next(): number }): number {
  const baseName = getLegacyItemBaseName(entry)
  const base = ALL_ITEM_DATA[baseName as keyof typeof ALL_ITEM_DATA]
  if (!base) return Math.floor((random?.next() ?? 0.5) * 6) + 3
  const stats = getLegacyItemEffectiveStats(entry) ?? emptyStats()
  let value = 6 + stats.atk * 2 + stats.def * 2 + Math.floor(stats.hp / 16) + Math.floor(stats.mp / 16)
  const quality = getLegacyItemQuality(entry)
  value += quality === 'Rare' ? 12 : quality === 'Epic' ? 30 : quality === 'Runeword' ? 40 : quality === 'Legendary' ? 75 : quality === 'Mythic' ? 130 : entry && typeof entry === 'object' ? 6 : 0
  value += Math.floor((random?.next() ?? 0.5) * 4)
  return Math.max(1, Math.floor(Math.max(4, value) * 0.5))
}
