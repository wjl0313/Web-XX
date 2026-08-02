import {
  ZONES,
  ALL_ITEM_DATA,
  applyLegacyAfkRest,
  equipLegacyInventoryItem,
  getLegacyItemBaseName,
  getLegacyItemEffectiveStats,
  getLegacyItemSellValue,
  getLegacyLootItemScore,
  isLegacyEquipmentUpgrade,
  memorizeLegacySpell,
  purchaseLegacySpell,
  unequipLegacyItem,
  useBestLegacyPotion,
  type LegacyEquipmentSlot,
} from '../../game-core'
import type { LegacyCharacterSave } from '../../game-core/save'

const STAT_KEYS = ['atk', 'def', 'hp', 'mp'] as const

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export class LegacyEquipmentApplication {
  equipInventoryItem(character: LegacyCharacterSave, index: number): LegacyCharacterSave | null {
    const result = equipLegacyInventoryItem(character, index)
    return result.applied ? result.character : null
  }

  unequip(character: LegacyCharacterSave, slot: LegacyEquipmentSlot): LegacyCharacterSave | null {
    const result = unequipLegacyItem(character, slot)
    return result.applied ? result.character : null
  }

  setZone(character: LegacyCharacterSave, index: number): LegacyCharacterSave | null {
    const normalized = Math.floor(index)
    if (!ZONES[normalized] || Number(character.level || 1) < ZONES[normalized].minLvl) return null
    const next = clone(character)
    next.zone = normalized
    return next
  }

  memorizeSpell(character: LegacyCharacterSave, spellId: string, slot: number): LegacyCharacterSave | null {
    const result = memorizeLegacySpell(character, slot, spellId)
    return result.applied ? result.character : null
  }

  forgetSpell(character: LegacyCharacterSave, slot: number): LegacyCharacterSave | null {
    const result = memorizeLegacySpell(character, slot, null)
    return result.applied ? result.character : null
  }

  toggleAutoCast(character: LegacyCharacterSave, slot: number, enabled: boolean): LegacyCharacterSave | null {
    const normalized = Math.floor(slot)
    if (normalized < 0 || normalized >= 6) return null
    const next = clone(character) as Record<string, any>
    if (!Array.isArray(next.autoSkillSlots)) next.autoSkillSlots = []
    while (next.autoSkillSlots.length <= normalized) next.autoSkillSlots.push(true)
    next.autoSkillSlots[normalized] = enabled
    return next
  }

  purchaseSpell(character: LegacyCharacterSave, spellId: string): { character: LegacyCharacterSave; cost: number } | null {
    const result = purchaseLegacySpell(character, spellId)
    return result.applied ? { character: result.character, cost: result.cost } : null
  }

  usePotion(character: LegacyCharacterSave, kind: 'hp' | 'mp'): LegacyCharacterSave | null {
    const result = useBestLegacyPotion(character, kind)
    return result.used ? result.character : null
  }

  rest(character: LegacyCharacterSave, kind: 'hp' | 'mp'): LegacyCharacterSave | null {
    const result = applyLegacyAfkRest(character, kind, 0)
    return result.applied ? result.character : null
  }

  getItemDelta(item: unknown): Record<(typeof STAT_KEYS)[number], number> {
    const stats = getLegacyItemEffectiveStats(item)
    return Object.fromEntries(STAT_KEYS.map((key) => [key, Number(stats?.[key] || 0)])) as Record<(typeof STAT_KEYS)[number], number>
  }

  toggleInventoryFlag(
    character: LegacyCharacterSave,
    index: number,
    flag: 'locked' | 'favorite',
  ): LegacyCharacterSave | null {
    const inventory = Array.isArray(character.inventory) ? character.inventory : []
    const normalized = Math.floor(index)
    if (normalized < 0 || normalized >= inventory.length) return null
    const next = clone(character) as Record<string, any>
    const current = next.inventory[normalized]
    const record = typeof current === 'string'
      ? { base: current, name: current, quality: 'Normal', rolls: {} }
      : { ...(current || {}) }
    record[flag] = !record[flag]
    next.inventory[normalized] = record
    return next
  }

  sellInventoryItem(character: LegacyCharacterSave, index: number): { character: LegacyCharacterSave; value: number } | null {
    const inventory = Array.isArray(character.inventory) ? character.inventory : []
    const normalized = Math.floor(index)
    if (normalized < 0 || normalized >= inventory.length) return null
    const item = inventory[normalized]
    if (item && typeof item === 'object' && !Array.isArray(item) && ((item as Record<string, unknown>).locked || (item as Record<string, unknown>).favorite)) return null
    const next = clone(character) as Record<string, any>
    const value = getLegacyItemSellValue(item)
    next.inventory.splice(normalized, 1)
    next.gold = Math.max(0, Number(next.gold || 0)) + value
    return { character: next, value }
  }

  autoEquipBest(character: LegacyCharacterSave): { character: LegacyCharacterSave; equipped: number } {
    let next = clone(character)
    let equipped = 0
    for (const slot of ['weapon', 'offhand', 'chest', 'legs', 'feet', 'charm'] as const) {
      const inventory = Array.isArray(next.inventory) ? next.inventory : []
      const current = next.equipment && typeof next.equipment === 'object'
        ? (next.equipment as Record<string, unknown>)[slot]
        : null
      let bestIndex = -1
      let bestScore = Number.NEGATIVE_INFINITY
      inventory.forEach((item, index) => {
        const base = getLegacyItemBaseName(item)
        const data = ALL_ITEM_DATA[base as keyof typeof ALL_ITEM_DATA]
        if (data?.slot !== slot) return
        if (current && !isLegacyEquipmentUpgrade(item, current, 'score', 0)) return
        const score = getLegacyLootItemScore(item)
        if (score > bestScore) {
          bestScore = score
          bestIndex = index
        }
      })
      if (bestIndex < 0) continue
      const result = equipLegacyInventoryItem(next, bestIndex)
      if (result.applied) {
        next = result.character
        equipped += 1
      }
    }
    return { character: next, equipped }
  }
}
