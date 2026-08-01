import { computed } from 'vue'
import { defineStore } from 'pinia'

import {
  CONTAINER_ITEMS,
  ZONES,
  equipLegacyInventoryItem,
  getLegacyClassSpells,
  getLegacyItemEffectiveStats,
  toLegacyClassId,
  useBestLegacyPotion,
  unequipLegacyItem,
  type LegacyEquipmentSlot,
} from '../game-core'
import { useSaveStore } from './save.store'

const STAT_KEYS = ['atk', 'def', 'hp', 'mp'] as const

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export const useCharacterStore = defineStore('character', () => {
  const saves = useSaveStore()
  const character = computed(() => saves.activeCharacter)
  const zone = computed(() => ZONES[Math.max(0, Math.min(ZONES.length - 1, Number(character.value?.zone || 0)))])
  const inventory = computed<unknown[]>(() => Array.isArray(character.value?.inventory) ? character.value.inventory : [])
  const equipment = computed<Record<LegacyEquipmentSlot, unknown | null>>(() =>
    (character.value?.equipment || {}) as Record<LegacyEquipmentSlot, unknown | null>,
  )
  const inventoryCapacity = computed(() => {
    const bags = Array.isArray(character.value?.bags) ? character.value.bags : []
    return bags.reduce((sum: number, name: unknown) => {
      const bag = CONTAINER_ITEMS[String(name) as keyof typeof CONTAINER_ITEMS]
      return sum + Number(bag?.slots || 0)
    }, 0)
  })
  const knownSpells = computed(() => {
    const active = character.value
    const legacyClassId = active ? toLegacyClassId(active.cls) : null
    if (!active || !legacyClassId) return []
    const known = new Set(Array.isArray(active.knownSpells) ? active.knownSpells : [])
    return getLegacyClassSpells(legacyClassId).filter((spell) => known.has(spell.id))
  })

  function equipInventoryItem(index: number): boolean {
    const source = character.value
    if (!source) return false
    const result = equipLegacyInventoryItem(source, index)
    if (!result.applied) return false
    saves.replaceActiveCharacter(result.character)
    return true
  }

  function unequip(slot: LegacyEquipmentSlot): boolean {
    const source = character.value
    if (!source) return false
    const result = unequipLegacyItem(source, slot)
    if (!result.applied) return false
    saves.replaceActiveCharacter(result.character)
    return true
  }

  function setZone(index: number): boolean {
    const source = character.value
    const normalized = Math.floor(index)
    if (!source || !ZONES[normalized] || Number(source.level || 1) < ZONES[normalized].minLvl) return false
    const next = clone(source) as Record<string, any>
    next.zone = normalized
    saves.replaceActiveCharacter(next)
    return true
  }

  function memorizeSpell(spellId: string, slot: number): boolean {
    const source = character.value
    const known = new Set(Array.isArray(source?.knownSpells) ? source.knownSpells : [])
    const normalized = Math.floor(slot)
    if (!source || !known.has(spellId) || normalized < 0 || normalized >= 6) return false
    const next = clone(source) as Record<string, any>
    if (!Array.isArray(next.memorizedSpells)) next.memorizedSpells = []
    while (next.memorizedSpells.length <= normalized) next.memorizedSpells.push(null)
    next.memorizedSpells[normalized] = spellId
    saves.replaceActiveCharacter(next)
    return true
  }

  function usePotion(kind: 'hp' | 'mp'): boolean {
    const source = character.value
    if (!source) return false
    const result = useBestLegacyPotion(source, kind)
    if (!result.used) return false
    saves.replaceActiveCharacter(result.character)
    return true
  }

  function getItemDelta(item: unknown): Record<(typeof STAT_KEYS)[number], number> {
    const stats = getLegacyItemEffectiveStats(item)
    return Object.fromEntries(STAT_KEYS.map((key) => [key, Number(stats?.[key] || 0)])) as Record<(typeof STAT_KEYS)[number], number>
  }

  return {
    character,
    zone,
    inventory,
    equipment,
    inventoryCapacity,
    knownSpells,
    equipInventoryItem,
    unequip,
    setZone,
    memorizeSpell,
    usePotion,
    getItemDelta,
  }
})
