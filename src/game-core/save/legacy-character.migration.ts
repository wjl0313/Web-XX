import {
  ABILITIES,
  CLASS_ABILITIES,
  CLASS_EPIC_CONTENT,
  CLASSES,
  CONTAINER_ITEMS,
  FRESH_QUESTS,
  MERCENARY_TYPES,
  RENAMED_ITEMS,
  RENAMED_MOBS,
  RUNEWORD_RECIPES_BY_SLOT,
  RUNE_DATA,
  SPELLBOOK_BY_CLASS,
  ZONES,
  isLegacyClassId,
  isLegacyRaceId,
} from '../data'
import {
  LEGACY_EQUIPMENT_SLOTS,
  normalizeLegacyEquipmentEntry,
  normalizeLegacyInventoryEntry,
} from '../systems/equipment'
import { LEGACY_GAME_VERSION, LEGACY_SAVE_SCHEMA } from './constants'
import type { LegacyCharacterSave, LegacyImportOptions } from './types'

type MutableCharacter = Record<string, any>

export interface LegacyCharacterMigrationOptions {
  now?: () => number
  getMaxMemorizedSpellSlots?: (character: LegacyCharacterSave) => number
  migrateExtendedState?: (character: LegacyCharacterSave) => void
}

export interface LegacyCharacterMigrationResult {
  character: LegacyCharacterSave
  repaired: boolean
  fromVersion: string | null
  toVersion: string
}

function isRecord(value: unknown): value is MutableCharacter {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key)
}

function toInteger(value: unknown, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.floor(parsed) : fallback
}

function toNonNegativeInteger(value: unknown, fallback: number): number {
  return Math.max(0, toInteger(value, fallback))
}

function sanitizeString(value: unknown, fallback: string, maxLength: number): string {
  const sanitized = String(value == null ? fallback : value)
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
  return (sanitized || fallback).slice(0, maxLength)
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export function legacyXpToNextLevel(level: number): number {
  const normalizedLevel = Math.max(1, Math.floor(level))
  if (normalizedLevel < 15) return Math.floor(100 * Math.pow(1.48, normalizedLevel - 1))

  const scaleAtBoundary = (100 * Math.pow(1.48, 14)) / (100 * Math.pow(15, 2.1))
  let xp = 100 * Math.pow(normalizedLevel, 2.1) * scaleAtBoundary
  if (normalizedLevel >= 50) xp *= 1 + (normalizedLevel - 50) * 0.05
  return Math.floor(xp)
}

export function rollLegacyClassAbilities(classId: string, level = 1): Record<string, number> {
  const base = isLegacyClassId(classId)
    ? CLASS_ABILITIES[classId]
    : { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }
  const scores: Record<string, number> = {}

  for (const ability of ABILITIES) {
    scores[ability] = Math.max(1, Math.floor(Number(base[ability] || 10)))
  }

  const growths = Math.floor(Math.max(1, level) / 4)
  if (growths > 0) {
    const primary = [...ABILITIES]
      .sort((left, right) => Number(base[right] || 0) - Number(base[left] || 0))
      .slice(0, 2)
    for (const ability of primary) scores[ability] += growths
  }

  return scores
}

export function createFreshLegacyQuests(): Array<Record<string, unknown>> {
  return deepClone(FRESH_QUESTS) as unknown as Array<Record<string, unknown>>
}

function applyItemRenames(value: unknown): void {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const entry = value[index]
      if (typeof entry === 'string') {
        if (hasOwn(RENAMED_ITEMS, entry)) {
          value[index] = RENAMED_ITEMS[entry as keyof typeof RENAMED_ITEMS]
        }
      } else if (isRecord(entry)) {
        applyItemRenames(entry)
      }
    }
    return
  }

  if (!isRecord(value)) return
  if (typeof value.base === 'string' && hasOwn(RENAMED_ITEMS, value.base)) {
    const oldBase = value.base
    value.base = RENAMED_ITEMS[oldBase as keyof typeof RENAMED_ITEMS]
    if (value.name === oldBase) value.name = value.base
  }

  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'string') {
      if (
        (LEGACY_EQUIPMENT_SLOTS as readonly string[]).includes(key) &&
        hasOwn(RENAMED_ITEMS, entry)
      ) {
        value[key] = RENAMED_ITEMS[entry as keyof typeof RENAMED_ITEMS]
      }
    } else if (isRecord(entry) || Array.isArray(entry)) {
      applyItemRenames(entry)
    }
  }
}

function renameMob(value: unknown): unknown {
  return typeof value === 'string' && hasOwn(RENAMED_MOBS, value)
    ? RENAMED_MOBS[value as keyof typeof RENAMED_MOBS]
    : value
}

function applyQuestMobRenames(quests: unknown): void {
  if (!Array.isArray(quests)) return
  for (const quest of quests) {
    if (!isRecord(quest)) continue
    quest.mob = renameMob(quest.mob)
    quest.target = renameMob(quest.target)
  }
}

export function migrateLegacyRenamedReferences(character: LegacyCharacterSave): void {
  const mutable = character as MutableCharacter
  for (const field of ['inventory', 'equipment', 'mercenary', 'pet', 'corpseLoot']) {
    applyItemRenames(mutable[field])
  }
  applyQuestMobRenames(mutable.quests)
  applyQuestMobRenames(mutable.dailyQuests)

  if (isRecord(mutable.classQuest)) mutable.classQuest.target = renameMob(mutable.classQuest.target)
  if (Array.isArray(mutable.eliteContracts)) {
    for (const contract of mutable.eliteContracts) {
      if (isRecord(contract)) contract.target = renameMob(contract.target)
    }
  }
  if (isRecord(mutable.eliteContract)) {
    mutable.eliteContract.target = renameMob(mutable.eliteContract.target)
  }
}

function getClassSpellbook(classId: keyof typeof CLASSES): Array<Record<string, any>> {
  const spells = [...SPELLBOOK_BY_CLASS[classId]] as Array<Record<string, any>>
  const epic = CLASS_EPIC_CONTENT[classId]
  if (epic?.spell) spells.push(epic.spell as Record<string, any>)
  return spells
}

function ensureSpellState(
  character: MutableCharacter,
  getMaxSlots?: LegacyCharacterMigrationOptions['getMaxMemorizedSpellSlots'],
): void {
  const spellbook = getClassSpellbook(character.cls)
  const starterSpell = spellbook[0]?.id ?? null
  const validIds = new Set(spellbook.map((spell) => spell.id))

  if (!Array.isArray(character.knownSpells) || !character.knownSpells.length) {
    character.knownSpells = starterSpell ? [starterSpell] : []
  } else {
    character.knownSpells = character.knownSpells.filter((id: unknown) => validIds.has(id))
  }

  if (!character.spellShopInitialized) {
    character.knownSpells = starterSpell ? [starterSpell] : []
    character.spellShopInitialized = true
  }

  const requestedSlots = getMaxSlots
    ? getMaxSlots(character)
    : Math.max(2, Math.min(6, Array.isArray(character.memorizedSpells) ? character.memorizedSpells.length : 2))
  const maxSlots = Math.max(2, Math.min(6, Math.floor(Number(requestedSlots) || 2)))
  const existing = Array.isArray(character.memorizedSpells) ? character.memorizedSpells : []
  const known = new Set(character.knownSpells)
  const normalized: Array<string | null> = []

  for (let index = 0; index < maxSlots; index += 1) {
    const spellId = existing[index] || null
    normalized.push(spellId && known.has(spellId) ? spellId : character.knownSpells[index] || null)
  }

  character.memorizedSpells = normalized
  if (!isRecord(character.spellCooldowns)) character.spellCooldowns = {}
  character.autoUseSkills = character.autoUseSkills !== false
  character.autoSkillSlots = Array.isArray(character.autoSkillSlots)
    ? character.autoSkillSlots.slice(0, 6).map((enabled: unknown) => enabled !== false)
    : []
  while (character.autoSkillSlots.length < 6) character.autoSkillSlots.push(true)
}

function ensureBagState(character: MutableCharacter): void {
  if (!Array.isArray(character.bags) || !character.bags.length) {
    character.bags = ['Worn Pouch', 'Worn Pouch', 'Worn Pouch', 'Worn Pouch']
  }
  while (character.bags.length < 4) character.bags.push('Worn Pouch')
  character.bags = character.bags.map((name: unknown) =>
    typeof name === 'string' && hasOwn(CONTAINER_ITEMS, name) ? name : 'Worn Pouch',
  )
}

function ensureCommonExtendedState(character: MutableCharacter): void {
  if (!isRecord(character.abilities)) {
    character.abilities = rollLegacyClassAbilities(character.cls, character.level)
  } else {
    const fallback = rollLegacyClassAbilities(character.cls, character.level)
    for (const ability of ABILITIES) {
      const value = Number(character.abilities[ability])
      character.abilities[ability] = Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback[ability]
    }
  }

  if (!isRecord(character.stats)) character.stats = {}
  for (const key of [
    'kills',
    'namedKills',
    'eliteKills',
    'bossKills',
    'deaths',
    'goldEarned',
    'xpEarned',
    'dailiesClaimed',
    'loginDays',
    'weeklyTiersClaimed',
  ]) {
    if (!Number.isFinite(Number(character.stats[key]))) character.stats[key] = 0
  }

  if (!isRecord(character.achievements)) character.achievements = {}
  if (typeof character.activeTitle !== 'string') character.activeTitle = ''
  if (!Array.isArray(character.unlockedTitles)) character.unlockedTitles = []
  character.unlockedTitles = Array.from(
    new Set(character.unlockedTitles.map((title: unknown) => String(title || '').trim()).filter(Boolean)),
  )

  if (!Array.isArray(character.dailyQuests)) character.dailyQuests = []
  if (!Number.isFinite(Number(character.dailyReset))) character.dailyReset = 0
  if (!isRecord(character.bossCooldowns)) character.bossCooldowns = {}
  if (typeof character.hardcore !== 'boolean') character.hardcore = false

  if (!Array.isArray(character.group)) character.group = []
  character.group = Array.from(new Set(character.group
    .map((slot: unknown) => Math.floor(Number(slot)))
    .filter((slot: number) => Number.isInteger(slot) && slot >= 0 && slot < 24)))
    .slice(0, 5)
  if (typeof character.lfg !== 'boolean') character.lfg = false
  if (!Array.isArray(character.lfgParty)) character.lfgParty = []
  character.lfgParty = character.lfgParty
    .filter((hero: unknown) => isRecord(hero) && typeof hero.name === 'string' && hero.name.trim())
    .slice(0, 5)
  if (!Array.isArray(character.partyLineup)) character.partyLineup = []
  character.partyLineup = Array.from(new Set(character.partyLineup.map((id: unknown) => String(id || '').trim()).filter(Boolean))).slice(0, 6)
  if (typeof character.groupSplitGold !== 'boolean') character.groupSplitGold = false
  if (!Array.isArray(character.groupMercs)) character.groupMercs = []
  character.groupMercs = character.groupMercs
    .map((type: unknown) => String(type || ''))
    .filter((type: string) => type in MERCENARY_TYPES)
    .slice(0, 5)
  if (!Array.isArray(character.groupMercNames)) character.groupMercNames = []
  character.groupMercNames = character.groupMercNames.slice(0, character.groupMercs.length)
    .map((name: unknown) => sanitizeString(name, '', 24))
  while (character.groupMercNames.length < character.groupMercs.length) character.groupMercNames.push('')
  if (!Array.isArray(character.groupMercGear)) character.groupMercGear = []
  character.groupMercGear = character.groupMercs.map((_: string, index: number) => {
    const gear = isRecord(character.groupMercGear[index]) ? character.groupMercGear[index] : {}
    for (const slot of LEGACY_EQUIPMENT_SLOTS) {
      if (!hasOwn(gear, slot)) gear[slot] = null
    }
    for (const key of Object.keys(gear)) {
      if (!(LEGACY_EQUIPMENT_SLOTS as readonly string[]).includes(key)) delete gear[key]
    }
    return gear
  })
  if (!isRecord(character.partyHp)) character.partyHp = {}
  if (!isRecord(character.partyHp.units)) character.partyHp.units = {}
  for (const [id, pool] of Object.entries(character.partyHp.units)) {
    if (!isRecord(pool)) {
      delete character.partyHp.units[id]
      continue
    }
    pool.maxHp = Math.max(1, toInteger(pool.maxHp, 1))
    pool.hp = Math.max(0, Math.min(pool.maxHp, toInteger(pool.hp, pool.maxHp)))
  }

  if (!isRecord(character.pets)) character.pets = { active: 'none', owned: [], lastActionAt: 0 }
  if (!Array.isArray(character.pets.owned)) character.pets.owned = []
  if (typeof character.pets.active !== 'string') character.pets.active = 'none'
  if (!Number.isFinite(Number(character.pets.lastActionAt))) character.pets.lastActionAt = 0

  if (!isRecord(character.mercenary)) {
    character.mercenary = {
      type: 'none',
      customName: '',
      totalPaid: 0,
      hires: 0,
      lastHiredAt: 0,
      totalUpkeepPaid: 0,
      nextUpkeepAt: 0,
      lastUpkeepPaidAt: 0,
      actionReadyAt: 0,
    }
  }
  if (!isRecord(character.mercenary.gear)) character.mercenary.gear = {}
  for (const slot of LEGACY_EQUIPMENT_SLOTS) {
    if (!hasOwn(character.mercenary.gear, slot)) character.mercenary.gear[slot] = null
  }
}

export function migrateLegacyCharacter(
  character: LegacyCharacterSave,
  options: LegacyCharacterMigrationOptions = {},
): LegacyCharacterMigrationResult {
  const mutable = character as MutableCharacter
  const fromVersion = typeof mutable.version === 'string' ? mutable.version : null
  let repaired = false
  migrateLegacyRenamedReferences(character)

  if (!isLegacyClassId(mutable.cls)) {
    mutable.cls = 'Warrior'
    repaired = true
  }
  if (!isLegacyRaceId(mutable.race)) {
    mutable.race = 'Human'
    repaired = true
  }
  if (typeof mutable.name !== 'string' || !mutable.name.trim()) {
    mutable.name = 'Adventurer'
    repaired = true
  }

  const classData = CLASSES[mutable.cls as keyof typeof CLASSES]
  mutable.level = Math.max(1, toInteger(mutable.level, 1))
  mutable.xp = toNonNegativeInteger(mutable.xp, 0)
  mutable.xpNext = legacyXpToNextLevel(mutable.level)
  mutable.maxHp = Math.max(1, toInteger(mutable.maxHp, classData.hp))
  mutable.maxMp = Math.max(0, toInteger(mutable.maxMp, classData.mp))
  mutable.hp = Math.min(mutable.maxHp, Math.max(0, toInteger(mutable.hp, mutable.maxHp)))
  mutable.mp = Math.min(mutable.maxMp, Math.max(0, toInteger(mutable.mp, mutable.maxMp)))
  mutable.atk = Math.max(1, toInteger(mutable.atk, classData.atk))
  mutable.def = Math.max(0, toInteger(mutable.def, classData.def))
  mutable.mpRegen = Math.max(0, toInteger(mutable.mpRegen, classData.mpRegen))
  mutable.gold = toNonNegativeInteger(mutable.gold, 0)
  mutable.faction = Math.max(-500, Math.min(500, toInteger(mutable.faction, 0)))

  for (const key of Object.keys(mutable).filter((key) =>
    /^healpotions_|^manapotions_|^healpotions$|^manapotions$/.test(key),
  )) {
    mutable[key] = toNonNegativeInteger(mutable[key], 0)
  }
  for (const key of [
    'healpotions',
    'manapotions',
    'healpotions_ghp',
    'manapotions_gmp',
    'healpotions_shp',
    'manapotions_smp',
    'healpotions_heroic',
    'manapotions_heroic',
    'healpotions_epic',
    'manapotions_epic',
    'healpotions_legendary',
    'manapotions_legendary',
  ]) {
    mutable[key] = toNonNegativeInteger(mutable[key], 0)
  }

  if (mutable.healpotions_lhp === undefined) mutable.healpotions_lhp = mutable.manapotions_lhp || 0
  if (mutable.manapotions_lmp === undefined) mutable.manapotions_lmp = 0
  delete mutable.manapotions_lhp
  mutable.healpotions_lhp = toNonNegativeInteger(mutable.healpotions_lhp, 0)
  mutable.manapotions_lmp = toNonNegativeInteger(mutable.manapotions_lmp, 0)

  mutable.afkEnabled = Boolean(mutable.afkEnabled)
  const lastAfk = Number(mutable.lastAfkAt)
  mutable.lastAfkAt = Number.isFinite(lastAfk) && lastAfk > 0 ? Math.floor(lastAfk) : null

  mutable.zone = toInteger(mutable.zone, 0)
  if (mutable.zone < 0 || mutable.zone >= ZONES.length) {
    mutable.zone = 0
    repaired = true
  }
  mutable.bindZone = toInteger(mutable.bindZone, mutable.zone || 0)
  if (mutable.bindZone < 0 || mutable.bindZone >= ZONES.length) {
    mutable.bindZone = mutable.zone || 0
    repaired = true
  }

  if (!isRecord(mutable.corpse)) {
    mutable.corpse = null
  } else {
    const zone = toInteger(mutable.corpse.zone, -1)
    if (zone < 0 || zone >= ZONES.length) {
      mutable.corpse = null
    } else {
      const now = options.now?.() ?? Date.now()
      mutable.corpse = {
        zone,
        gold: toNonNegativeInteger(mutable.corpse.gold, 0),
        ts: toInteger(mutable.corpse.ts || now, now),
      }
    }
  }

  if (!Array.isArray(mutable.inventory)) {
    mutable.inventory = []
    repaired = true
  } else {
    const normalizedInventory = mutable.inventory
      .map(normalizeLegacyInventoryEntry)
      .filter((entry: unknown) => entry !== null)
    if (normalizedInventory.length !== mutable.inventory.length) repaired = true
    mutable.inventory = normalizedInventory
  }

  mutable.runeStash = Array.isArray(mutable.runeStash)
    ? mutable.runeStash.filter((rune: unknown) => typeof rune === 'string' && hasOwn(RUNE_DATA, rune))
    : []
  const validRunewords = new Set<string>(
    Object.values(RUNEWORD_RECIPES_BY_SLOT).flatMap((recipes) =>
      recipes.map((recipe) => String(recipe.name)),
    ),
  )
  mutable.discoveredRunewords = Array.isArray(mutable.discoveredRunewords)
    ? mutable.discoveredRunewords.filter(
        (name: unknown) => typeof name === 'string' && validRunewords.has(name),
      )
    : []

  if (!isRecord(mutable.equipment)) {
    mutable.equipment = {}
    repaired = true
  }
  for (const slot of LEGACY_EQUIPMENT_SLOTS) {
    const before = mutable.equipment[slot]
    const normalized = normalizeLegacyEquipmentEntry(before ?? null, slot)
    if (JSON.stringify(before ?? null) !== JSON.stringify(normalized)) repaired = true
    mutable.equipment[slot] = normalized
  }

  if (!Array.isArray(mutable.quests)) {
    mutable.quests = createFreshLegacyQuests()
    repaired = true
  } else {
    const knownQuestNames = new Set(mutable.quests.map((quest: unknown) => (isRecord(quest) ? quest.name : null)))
    for (const quest of createFreshLegacyQuests()) {
      if (!knownQuestNames.has(quest.name)) {
        mutable.quests.push(quest)
        repaired = true
      }
    }
  }
  mutable.pinnedQuestKeys = Array.isArray(mutable.pinnedQuestKeys)
    ? mutable.pinnedQuestKeys.slice(0, 3).map(String)
    : []

  ensureSpellState(mutable, options.getMaxMemorizedSpellSlots)
  ensureBagState(mutable)
  ensureCommonExtendedState(mutable)
  options.migrateExtendedState?.(character)

  mutable.version = LEGACY_GAME_VERSION
  return {
    character,
    repaired,
    fromVersion,
    toVersion: LEGACY_GAME_VERSION,
  }
}

export function migrateLegacyCharacterInPlace(
  character: LegacyCharacterSave,
  options: LegacyCharacterMigrationOptions = {},
): LegacyCharacterSave {
  return migrateLegacyCharacter(character, options).character
}

export function sanitizeLegacyImportedCharacter(
  character: LegacyCharacterSave,
): LegacyCharacterSave {
  const mutable = character as MutableCharacter
  mutable.name = sanitizeString(mutable.name, 'Adventurer', 24)
  mutable.cls = isLegacyClassId(mutable.cls) ? mutable.cls : 'Warrior'
  mutable.race = isLegacyRaceId(mutable.race) ? mutable.race : 'Human'

  const boundedIntegers: Array<[string, number, number, number]> = [
    ['level', 1, 1, Number.MAX_SAFE_INTEGER],
    ['xp', 0, 0, 999_999_999_999],
    ['xpNext', 100, 1, 999_999_999_999],
    ['gold', 0, 0, 999_999_999_999],
    ['hp', 1, 0, 999_999_999],
    ['mp', 0, 0, 999_999_999],
    ['maxHp', 1, 1, 999_999_999],
    ['maxMp', 0, 0, 999_999_999],
    ['atk', 1, 0, 999_999_999],
    ['def', 0, 0, 999_999_999],
    ['faction', 0, -500, 500],
    ['zone', 0, 0, ZONES.length - 1],
  ]
  for (const [key, fallback, minimum, maximum] of boundedIntegers) {
    mutable[key] = Math.max(minimum, Math.min(maximum, toInteger(mutable[key], fallback)))
  }
  mutable.hp = Math.min(mutable.hp, mutable.maxHp)
  mutable.mp = Math.min(mutable.mp, mutable.maxMp)

  for (const key of Object.keys(mutable).filter((key) =>
    /^healpotions_|^manapotions_|^healpotions$|^manapotions$/.test(key),
  )) {
    mutable[key] = Math.max(0, Math.min(999_999, toInteger(mutable[key], 0)))
  }

  mutable.inventory = Array.isArray(mutable.inventory)
    ? mutable.inventory
        .slice(0, 300)
        .map(normalizeLegacyInventoryEntry)
        .filter((entry: unknown) => entry !== null)
    : []

  const equipment = isRecord(mutable.equipment) ? mutable.equipment : {}
  mutable.equipment = Object.fromEntries(
    LEGACY_EQUIPMENT_SLOTS.map((slot) => [
      slot,
      normalizeLegacyEquipmentEntry(equipment[slot] ?? null, slot),
    ]),
  )
  mutable.runeStash = Array.isArray(mutable.runeStash)
    ? mutable.runeStash
        .slice(0, 1000)
        .filter((rune: unknown) => typeof rune === 'string' && hasOwn(RUNE_DATA, rune))
    : []

  if (Array.isArray(mutable.knownSpells)) {
    mutable.knownSpells = mutable.knownSpells
      .slice(0, 200)
      .map((spell: unknown) => sanitizeString(spell, '', 80))
      .filter(Boolean)
  }
  if (Array.isArray(mutable.spellQueue)) {
    mutable.spellQueue = mutable.spellQueue
      .slice(0, 12)
      .map((spell: unknown) => sanitizeString(spell, '', 80))
      .filter(Boolean)
  }

  mutable.version = LEGACY_GAME_VERSION
  mutable.saveSchema = LEGACY_SAVE_SCHEMA
  return character
}

export function prepareLegacyImportedCharacter(
  character: LegacyCharacterSave,
  options: LegacyCharacterMigrationOptions = {},
): LegacyCharacterSave {
  migrateLegacyCharacterInPlace(character, options)
  return sanitizeLegacyImportedCharacter(character)
}

export function createLegacyCharacterImportOptions(
  options: LegacyCharacterMigrationOptions = {},
): LegacyImportOptions {
  return {
    migrateCharacter: (character) => migrateLegacyCharacterInPlace(character, options),
    sanitizeCharacter: sanitizeLegacyImportedCharacter,
  }
}
