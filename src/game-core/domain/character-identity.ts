import {
  CLASSES,
  GAME_RACES,
  RACE_CLASS_RULES,
  type LegacyClassId,
  type LegacyRaceId,
} from '../data'

/**
 * 新游戏核心的正式角色身份 ID。
 *
 * 英文 ID 只用于读取冻结版数据和兼容旧存档；新玩法不得再把它们写入领域状态。
 */
export const CHARACTER_CLASS_TO_LEGACY = Object.freeze({
  炼体士: 'Warrior',
  丹医: 'Cleric',
  金刚护法: 'Paladin',
  猎妖修士: 'Ranger',
  尸道修士: 'Death Knight',
  木灵法修: 'Druid',
  武僧: 'Monk',
  音修: 'Bard',
  影修: 'Rogue',
  灵祭师: 'Shaman',
  鬼道修士: 'Necromancer',
  五行法修: 'Wizard',
  御灵法修: 'Conjurer',
  神识法修: 'Enchanter',
  御兽师: 'Beastmaster',
  血煞体修: 'Berserker',
} as const satisfies Readonly<Record<string, LegacyClassId>>)

export const CHARACTER_RACE_TO_LEGACY = Object.freeze({
  五行杂灵根: 'Human',
  厚土灵体: 'Goliath',
  光明灵体: 'Aasimar',
  木天灵根: 'Wood Elf',
  金天灵根: 'High Elf',
  暗灵根: 'Dark Elf',
  木水双灵根: 'Half Elf',
  锻金之体: 'Dwarf',
  不灭之体: 'Troll',
  巨力灵体: 'Ogre',
  风木双灵根: 'Halfling',
  通明灵体: 'Gnome',
  蛟血灵体: 'Lizardfolk',
  疾风灵体: 'Tabaxi',
  水土双灵根: 'Bullywug',
  真龙血脉: 'Dragonborn',
} as const satisfies Readonly<Record<string, LegacyRaceId>>)

export type CharacterClassId = keyof typeof CHARACTER_CLASS_TO_LEGACY
export type CharacterRaceId = keyof typeof CHARACTER_RACE_TO_LEGACY

export const CHARACTER_CLASS_IDS = Object.freeze(
  Object.keys(CHARACTER_CLASS_TO_LEGACY) as CharacterClassId[],
)
export const CHARACTER_RACE_IDS = Object.freeze(
  Object.keys(CHARACTER_RACE_TO_LEGACY) as CharacterRaceId[],
)

export const LEGACY_CLASS_TO_CHARACTER = Object.freeze(
  Object.fromEntries(
    Object.entries(CHARACTER_CLASS_TO_LEGACY).map(([characterId, legacyId]) => [legacyId, characterId]),
  ) as Record<LegacyClassId, CharacterClassId>,
)

export const LEGACY_RACE_TO_CHARACTER = Object.freeze(
  Object.fromEntries(
    Object.entries(CHARACTER_RACE_TO_LEGACY).map(([characterId, legacyId]) => [legacyId, characterId]),
  ) as Record<LegacyRaceId, CharacterRaceId>,
)

export const DEFAULT_CHARACTER_CLASS_ID: CharacterClassId = '炼体士'
export const DEFAULT_CHARACTER_RACE_ID: CharacterRaceId = '五行杂灵根'

export function isCharacterClassId(value: unknown): value is CharacterClassId {
  return typeof value === 'string' && Object.hasOwn(CHARACTER_CLASS_TO_LEGACY, value)
}

export function isCharacterRaceId(value: unknown): value is CharacterRaceId {
  return typeof value === 'string' && Object.hasOwn(CHARACTER_RACE_TO_LEGACY, value)
}

/** 接受新中文 ID 或旧英文 ID，并统一返回新核心中文 ID。 */
export function normalizeCharacterClassId(value: unknown): CharacterClassId | null {
  if (isCharacterClassId(value)) return value
  return typeof value === 'string'
    ? LEGACY_CLASS_TO_CHARACTER[value as LegacyClassId] ?? null
    : null
}

/** 接受新中文 ID 或旧英文 ID，并统一返回新核心中文 ID。 */
export function normalizeCharacterRaceId(value: unknown): CharacterRaceId | null {
  if (isCharacterRaceId(value)) return value
  return typeof value === 'string'
    ? LEGACY_RACE_TO_CHARACTER[value as LegacyRaceId] ?? null
    : null
}

/** 只应在冻结数据或旧存档边界调用。 */
export function toLegacyClassId(value: unknown): LegacyClassId | null {
  const normalized = normalizeCharacterClassId(value)
  return normalized ? CHARACTER_CLASS_TO_LEGACY[normalized] : null
}

/** 只应在冻结数据或旧存档边界调用。 */
export function toLegacyRaceId(value: unknown): LegacyRaceId | null {
  const normalized = normalizeCharacterRaceId(value)
  return normalized ? CHARACTER_RACE_TO_LEGACY[normalized] : null
}

export const CHARACTER_RACE_CLASS_RULES: Readonly<Record<CharacterRaceId, readonly CharacterClassId[]>> =
  Object.freeze(Object.fromEntries(
    CHARACTER_RACE_IDS.map((raceId) => {
      const legacyRace = CHARACTER_RACE_TO_LEGACY[raceId]
      return [raceId, RACE_CLASS_RULES[legacyRace].map((classId) => LEGACY_CLASS_TO_CHARACTER[classId])]
    }),
  ) as unknown as Record<CharacterRaceId, readonly CharacterClassId[]>)

export function getCharacterClassData(value: unknown) {
  const legacyId = toLegacyClassId(value) ?? CHARACTER_CLASS_TO_LEGACY[DEFAULT_CHARACTER_CLASS_ID]
  return CLASSES[legacyId]
}

export function assertCompleteCharacterIdentityMappings(): void {
  if (CHARACTER_CLASS_IDS.length !== Object.keys(CLASSES).length) {
    throw new Error('中文传承 ID 与冻结职业数据不完整')
  }
  if (CHARACTER_RACE_IDS.length !== GAME_RACES.length) {
    throw new Error('中文灵根 ID 与冻结种族数据不完整')
  }
}
