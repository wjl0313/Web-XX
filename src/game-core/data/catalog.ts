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

const LEGACY_ITEM_BASE_NAMES = Object.keys(ALL_ITEM_DATA).sort((left, right) => right.length - left.length)

function translateExactLegacyText(value: string): string | null {
  return ZH_CN_REFERENCE_TEXT[value]
    ?? CULTIVATION_TEXT_OVERRIDES[value]
    ?? CULTIVATION_CONTENT_TEXT_OVERRIDES[value]
    ?? LEGACY_ZH_CN_EXACT[value as keyof typeof LEGACY_ZH_CN_EXACT]
    ?? null
}

export function isLegacyClassId(value: unknown): value is LegacyClassId {
  return typeof value === 'string' && Object.hasOwn(CLASSES, value)
}

export function isLegacyRaceId(value: unknown): value is LegacyRaceId {
  return typeof value === 'string' && Object.hasOwn(RACE_CLASS_RULES, value)
}

export function translateLegacyText(value: string): string {
  const exact = translateExactLegacyText(value)
  if (exact) return exact

  const dynamicPrefixes = [
    ['[Boss] ', '【区域首领】'],
    ['[Named] ', '【命名强敌】'],
    ['[Elite] ', '【精英】'],
  ] as const
  for (const [prefix, translatedPrefix] of dynamicPrefixes) {
    if (value.startsWith(prefix)) {
      return `${translatedPrefix}${translateLegacyText(value.slice(prefix.length))}`
    }
  }

  for (const baseName of LEGACY_ITEM_BASE_NAMES) {
    const baseIndex = value.indexOf(baseName)
    if (baseIndex < 0) continue
    const prefix = value.slice(0, baseIndex).trim()
    const suffixSource = value.slice(baseIndex + baseName.length).trim()
    const suffix = suffixSource.startsWith('of ') ? suffixSource.slice(3).trim() : ''
    if (suffixSource && !suffix) continue

    const translatedPrefix = prefix ? translateExactLegacyText(prefix) : null
    const translatedSuffix = suffix ? translateExactLegacyText(suffix) : null
    if ((prefix && !translatedPrefix) || (suffix && !translatedSuffix)) continue

    const translatedBase = translateExactLegacyText(baseName)
    if (!translatedBase) continue
    return [translatedPrefix, translatedBase, translatedSuffix].filter(Boolean).join('·')
  }
  return value
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
