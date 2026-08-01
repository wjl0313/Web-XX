import {
  ABILITIES,
  ALL_ITEM_DATA,
  CONTAINER_ITEMS,
  RUNE_DATA,
} from '../../data'

export const LEGACY_EQUIPMENT_SLOTS = [
  'weapon',
  'chest',
  'legs',
  'feet',
  'offhand',
  'charm',
] as const

export type LegacyEquipmentSlot = (typeof LEGACY_EQUIPMENT_SLOTS)[number]
export type LegacyItemRecord = Record<string, unknown>
export type LegacyItemEntry = string | LegacyItemRecord

function isRecord(value: unknown): value is LegacyItemRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key)
}

export function getLegacyItemBaseName(entry: unknown): string {
  if (typeof entry === 'string') return entry
  if (isRecord(entry) && typeof entry.base === 'string') return entry.base
  return ''
}

export function getLegacySocketCapacity(baseName: string): number {
  const data = ALL_ITEM_DATA[baseName as keyof typeof ALL_ITEM_DATA]
  if (!data) return 0
  if (data.slot === 'weapon' || data.slot === 'chest' || data.slot === 'offhand') return 2
  if (data.slot === 'legs' || data.slot === 'feet' || data.slot === 'charm') return 1
  return 0
}

export function normalizeLegacyInventoryEntry(entry: unknown): LegacyItemEntry | null {
  if (typeof entry === 'string') return entry
  if (!isRecord(entry)) return null

  const baseName = getLegacyItemBaseName(entry)
  if (!baseName) return null

  const isContainer = hasOwn(CONTAINER_ITEMS, baseName)
  const isRune = hasOwn(RUNE_DATA, baseName)
  const isEquipment = hasOwn(ALL_ITEM_DATA, baseName)

  if (!isContainer && !isRune && !isEquipment) {
    if (entry.locked || entry.favorite) {
      return {
        base: baseName,
        name: typeof entry.name === 'string' && entry.name.trim() ? entry.name.trim() : baseName,
        quality: 'Normal',
        rolls: {},
        locked: Boolean(entry.locked),
        favorite: Boolean(entry.favorite),
      }
    }
    return baseName
  }

  const sourceRolls = isRecord(entry.rolls) ? entry.rolls : {}
  const cleanRolls: Record<string, number> = {}
  for (const stat of ['atk', 'def', 'hp', 'mp', ...ABILITIES]) {
    const raw = Number(sourceRolls[stat])
    if (Number.isFinite(raw) && raw > 0) cleanRolls[stat] = Math.floor(raw)
  }

  const rawQuality = entry.quality
  const validQualities = new Set(['Magic', 'Rare', 'Epic', 'Runeword', 'Legendary', 'Mythic'])
  const quality =
    typeof rawQuality === 'string' && validQualities.has(rawQuality)
      ? rawQuality
      : Object.keys(cleanRolls).length
        ? 'Magic'
        : 'Normal'
  const normalized: LegacyItemRecord = {
    base: baseName,
    name: typeof entry.name === 'string' && entry.name.trim() ? entry.name.trim() : baseName,
    rolls: cleanRolls,
    quality,
  }

  if (quality === 'Epic' && typeof entry.epicId === 'string') normalized.epicId = entry.epicId

  const itemLevel = Number(entry.ilvl)
  if (Number.isFinite(itemLevel) && itemLevel > 0) normalized.ilvl = Math.max(1, Math.floor(itemLevel))

  const levelRequirement = Number(entry.levelReq)
  if (Number.isFinite(levelRequirement) && levelRequirement > 0) {
    normalized.levelReq = Math.max(1, Math.floor(levelRequirement))
  }

  if (entry.locked) normalized.locked = true
  if (entry.favorite) normalized.favorite = true

  const capacity = getLegacySocketCapacity(baseName)
  const maxSockets = Math.max(0, Math.min(capacity, Math.floor(Number(entry.maxSockets || 0))))
  if (maxSockets > 0) {
    const sockets = Array.isArray(entry.sockets)
      ? entry.sockets
          .slice(0, maxSockets)
          .map((rune) => (typeof rune === 'string' && hasOwn(RUNE_DATA, rune) ? rune : null))
      : []
    while (sockets.length < maxSockets) sockets.push(null)
    normalized.maxSockets = maxSockets
    normalized.sockets = sockets
  }

  if (isRecord(entry.runeword) && typeof entry.runeword.name === 'string') {
    normalized.runeword = {
      name: entry.runeword.name,
      bonus: isRecord(entry.runeword.bonus) ? { ...entry.runeword.bonus } : {},
      xp: Math.max(0, Math.floor(Number(entry.runeword.xp || 0))),
    }
    normalized.quality = 'Runeword'
  }

  const hasEnhancements =
    Object.keys(cleanRolls).length > 0 ||
    Number(normalized.maxSockets || 0) > 0 ||
    Boolean(normalized.runeword) ||
    normalized.quality !== 'Normal'
  const hasFlags = Boolean(normalized.locked) || Boolean(normalized.favorite)

  return hasEnhancements || hasFlags ? normalized : baseName
}

export function normalizeLegacyEquipmentEntry(
  entry: unknown,
  slot: LegacyEquipmentSlot,
): LegacyItemEntry | null {
  const normalized = normalizeLegacyInventoryEntry(entry)
  if (!normalized) return null

  const baseName = getLegacyItemBaseName(normalized)
  const data = ALL_ITEM_DATA[baseName as keyof typeof ALL_ITEM_DATA]
  return data?.slot === slot ? normalized : null
}
