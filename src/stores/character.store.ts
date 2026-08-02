import { computed } from 'vue'
import { defineStore } from 'pinia'

import { LegacyEquipmentApplication } from '../application/legacy'
import { V2EquipmentApplication } from '../application/v2'
import {
  CONTAINER_ITEMS,
  ZONES,
  getLegacyClassSpells,
  toLegacyClassId,
  type LegacyEquipmentSlot,
} from '../game-core'
import {
  V2_TECHNIQUES,
  getCharacterRuleset,
  getV2CharacterLoadout,
  getV2CharacterTechniqueIds,
} from '../game-core/rulesets'
import { useSaveStore } from './save.store'
import { useActionStore } from './action.store'

export const useCharacterStore = defineStore('character', () => {
  const saves = useSaveStore()
  const actions = useActionStore()
  const application = new LegacyEquipmentApplication()
  const v2Application = new V2EquipmentApplication()
  const character = computed(() => saves.activeCharacter)
  const ruleset = computed(() => getCharacterRuleset(character.value))
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
  const v2KnownTechniques = computed(() => character.value && ruleset.value === 'v2'
    ? getV2CharacterTechniqueIds(character.value).map((id) => V2_TECHNIQUES[id]).filter(Boolean)
    : [])
  const v2TechniqueLoadout = computed(() => character.value && ruleset.value === 'v2'
    ? getV2CharacterLoadout(character.value)
    : { slots: [null, null, null] as [null, null, null] })

  function equipInventoryItem(index: number): boolean {
    const source = character.value
    if (!source) return false
    const result = ruleset.value === 'v2'
      ? v2Application.equipInventoryItem(source, index)
      : application.equipInventoryItem(source, index)
    if (!result) return false
    saves.replaceActiveCharacter(result)
    return true
  }

  function unequip(slot: LegacyEquipmentSlot): boolean {
    const source = character.value
    if (!source) return false
    const result = ruleset.value === 'v2'
      ? v2Application.unequip(source, slot)
      : application.unequip(source, slot)
    if (!result) return false
    saves.replaceActiveCharacter(result)
    return true
  }

  function setZone(index: number): boolean {
    const source = character.value
    if (!source || (ruleset.value === 'v2' && actions.resting)) return false
    const result = ruleset.value === 'v2'
      ? v2Application.setZone(source, index)
      : application.setZone(source, index)
    if (!result) return false
    saves.replaceActiveCharacter(result)
    return true
  }

  function memorizeSpell(spellId: string, slot: number, battleActive = false): boolean {
    const source = character.value
    if (!source || (ruleset.value === 'v2' && actions.resting)) return false
    const result = ruleset.value === 'v2'
      ? v2Application.setTechniqueSlot(source, slot, spellId, battleActive)
      : application.memorizeSpell(source, spellId, slot)
    if (!result) return false
    saves.replaceActiveCharacter(result)
    return true
  }

  function forgetSpell(slot: number, battleActive = false): boolean {
    const source = character.value
    if (!source || (ruleset.value === 'v2' && actions.resting)) return false
    const result = ruleset.value === 'v2'
      ? v2Application.setTechniqueSlot(source, slot, null, battleActive)
      : application.forgetSpell(source, slot)
    if (!result) return false
    saves.replaceActiveCharacter(result)
    return true
  }

  function toggleSpellAutoCast(slot: number, enabled: boolean): boolean {
    const source = character.value
    if (!source || (ruleset.value === 'v2' && actions.resting)) return false
    const result = ruleset.value === 'v2'
      ? v2Application.toggleAutoTechniqueSlot(source, slot, enabled)
      : application.toggleAutoCast(source, slot, enabled)
    if (!result) return false
    saves.replaceActiveCharacter(result)
    return true
  }

  function purchaseSpell(spellId: string): number | null {
    const source = character.value
    if (!source) return null
    if (ruleset.value === 'v2') return null
    const result = application.purchaseSpell(source, spellId)
    if (!result) return null
    saves.replaceActiveCharacter(result.character)
    void saves.persist()
    return result.cost
  }

  function usePotion(kind: 'hp' | 'mp'): boolean {
    const source = character.value
    if (!source) return false
    if (ruleset.value === 'v2') return false
    const result = application.usePotion(source, kind)
    if (!result) return false
    saves.replaceActiveCharacter(result)
    return true
  }

  function rest(kind: 'hp' | 'mp'): boolean {
    const source = character.value
    if (!source) return false
    if (ruleset.value === 'v2') return false
    const result = application.rest(source, kind)
    if (!result) return false
    saves.replaceActiveCharacter(result)
    void saves.persist()
    return true
  }

  function getItemDelta(item: unknown): Record<'atk' | 'def' | 'hp' | 'mp', number> {
    return ruleset.value === 'v2' ? v2Application.getItemDelta(item) : application.getItemDelta(item)
  }

  function toggleInventoryFlag(index: number, flag: 'locked' | 'favorite'): boolean {
    const source = character.value
    if (!source) return false
    const result = application.toggleInventoryFlag(source, index, flag)
    if (!result) return false
    saves.replaceActiveCharacter(result)
    void saves.persist()
    return true
  }

  function sellInventoryItem(index: number): number | null {
    const source = character.value
    if (!source || (ruleset.value === 'v2' && actions.resting)) return null
    const result = application.sellInventoryItem(source, index)
    if (!result) return null
    saves.replaceActiveCharacter(result.character)
    void saves.persist()
    return result.value
  }

  function autoEquipBest(): number {
    const source = character.value
    if (!source) return 0
    const result = ruleset.value === 'v2' ? v2Application.autoEquipBest(source) : application.autoEquipBest(source)
    if (result.equipped > 0) {
      saves.replaceActiveCharacter(result.character)
      void saves.persist()
    }
    return result.equipped
  }

  return {
    character,
    ruleset,
    zone,
    inventory,
    equipment,
    inventoryCapacity,
    knownSpells,
    v2KnownTechniques,
    v2TechniqueLoadout,
    equipInventoryItem,
    unequip,
    setZone,
    memorizeSpell,
    forgetSpell,
    toggleSpellAutoCast,
    purchaseSpell,
    usePotion,
    rest,
    getItemDelta,
    toggleInventoryFlag,
    sellInventoryItem,
    autoEquipBest,
  }
})
