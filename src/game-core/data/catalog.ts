import { CLASSES, GAME_RACES, RACE_CLASS_RULES } from './characters.generated'
import { ZH_CN_REFERENCE_TEXT } from '../locales/zh-CN'
import { ALL_ITEM_DATA } from './items.generated'
import { CULTIVATION_CONTENT_TEXT_OVERRIDES } from './localization-content.zh-cn'
import { LEGACY_ZH_CN_EXACT } from './localization.generated'
import { CULTIVATION_TEXT_OVERRIDES } from './localization.zh-cn'
import { SPELLBOOK_BY_CLASS } from './spells.generated'
import { ZONES } from './world.generated'

export type LegacyClassId = keyof typeof CLASSES
export type LegacyRaceId = (typeof GAME_RACES)[number]
export type LegacyItemName = keyof typeof ALL_ITEM_DATA
export type LegacyZone = (typeof ZONES)[number]
export type LegacySpell = (typeof SPELLBOOK_BY_CLASS)[LegacyClassId][number]

export function isLegacyClassId(value: unknown): value is LegacyClassId {
  return typeof value === 'string' && Object.hasOwn(CLASSES, value)
}

export function isLegacyRaceId(value: unknown): value is LegacyRaceId {
  return typeof value === 'string' && Object.hasOwn(RACE_CLASS_RULES, value)
}

export function translateLegacyText(value: string): string {
  return ZH_CN_REFERENCE_TEXT[value]
    ?? CULTIVATION_TEXT_OVERRIDES[value]
    ?? CULTIVATION_CONTENT_TEXT_OVERRIDES[value]
    ?? LEGACY_ZH_CN_EXACT[value as keyof typeof LEGACY_ZH_CN_EXACT]
    ?? value
}

export function getLegacyClass(value: LegacyClassId) {
  return CLASSES[value]
}

export function getLegacyRaceClasses(value: LegacyRaceId): readonly LegacyClassId[] {
  return RACE_CLASS_RULES[value]
}

export function getLegacyZone(index: number): LegacyZone | null {
  return ZONES[index] ?? null
}

export function getLegacyItem(name: string) {
  return ALL_ITEM_DATA[name as LegacyItemName] ?? null
}

export function getLegacyClassSpells(classId: LegacyClassId): readonly LegacySpell[] {
  return SPELLBOOK_BY_CLASS[classId]
}
