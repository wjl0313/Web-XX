import { ALL_ITEM_DATA, ZONES } from '../../game-core/data'
import {
  V2_CLASS_TECHNIQUES,
  getV2CharacterLoadout,
  getV2CharacterTechniqueIds,
  getV2SimpleItemStats,
  isV2EquipmentEnabled,
  isV2ZoneEnabled,
  normalizeTechniqueLoadout,
  validateTechniqueLoadout,
  type TechniqueLoadout,
} from '../../game-core/rulesets/v2'
import type { LegacyCharacterSave } from '../../game-core/save'
import { getLegacyItemBaseName, type LegacyEquipmentSlot } from '../../game-core/systems/equipment'
import { normalizeCharacterClassId } from '../../game-core/domain'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function applyStats(character: Record<string, any>, item: unknown, direction: 1 | -1): void {
  const stats = getV2SimpleItemStats(item, character)
  if (!stats) return
  character.atk = Math.max(1, Number(character.atk || 0) + stats.atk * direction)
  character.def = Math.max(0, Number(character.def || 0) + stats.def * direction)
  character.maxHp = Math.max(1, Number(character.maxHp || 1) + stats.hp * direction)
  character.maxMp = Math.max(0, Number(character.maxMp || 0) + stats.mp * direction)
  if (!character.abilities || typeof character.abilities !== 'object') character.abilities = {}
  for (const key of ['str', 'dex', 'con', 'int', 'wis', 'cha']) {
    character.abilities[key] = Math.max(1, Number(character.abilities[key] || 10) + stats[key] * direction)
  }
  character.hp = Math.min(character.maxHp, Math.max(0, Number(character.hp || 0)))
  character.mp = Math.min(character.maxMp, Math.max(0, Number(character.mp || 0)))
}

function itemSlot(item: unknown): LegacyEquipmentSlot | null {
  const baseName = getLegacyItemBaseName(item)
  if (!isV2EquipmentEnabled(baseName)) return null
  const data = ALL_ITEM_DATA[baseName as keyof typeof ALL_ITEM_DATA]
  return data?.slot as LegacyEquipmentSlot || null
}

export class V2EquipmentApplication {
  equipInventoryItem(source: LegacyCharacterSave, index: number): LegacyCharacterSave | null {
    const inventory = Array.isArray(source.inventory) ? source.inventory : []
    const normalized = Math.floor(index)
    if (normalized < 0 || normalized >= inventory.length) return null
    const item = inventory[normalized]
    const slot = itemSlot(item)
    if (!slot) return null
    const character = clone(source) as Record<string, any>
    if (!character.equipment || typeof character.equipment !== 'object') character.equipment = {}
    if (!Array.isArray(character.inventory)) character.inventory = []
    const displaced = character.equipment[slot]
    if (displaced) {
      applyStats(character, displaced, -1)
      character.inventory.push(displaced)
    }
    character.equipment[slot] = item
    character.inventory.splice(normalized, 1)
    applyStats(character, item, 1)
    return character
  }

  unequip(source: LegacyCharacterSave, slot: LegacyEquipmentSlot): LegacyCharacterSave | null {
    const equipment = source.equipment && typeof source.equipment === 'object' ? source.equipment as Record<string, unknown> : {}
    const item = equipment[slot]
    if (!item) return null
    const character = clone(source) as Record<string, any>
    if (!Array.isArray(character.inventory)) character.inventory = []
    applyStats(character, item, -1)
    character.equipment[slot] = null
    character.inventory.push(item)
    return character
  }

  setZone(source: LegacyCharacterSave, index: number): LegacyCharacterSave | null {
    const normalized = Math.floor(index)
    if (!isV2ZoneEnabled(normalized) || !ZONES[normalized] || Number(source.level || 1) < ZONES[normalized].minLvl) return null
    const character = clone(source)
    character.zone = normalized
    return character
  }

  setTechniqueSlot(
    source: LegacyCharacterSave,
    slot: number,
    techniqueId: string | null,
    battleActive: boolean,
  ): LegacyCharacterSave | null {
    if (battleActive) return null
    const known = getV2CharacterTechniqueIds(source)
    if (techniqueId && !known.includes(techniqueId)) return null
    const current = getV2CharacterLoadout(source)
    const slots = [...current.slots] as TechniqueLoadout['slots']
    const normalizedSlot = Math.floor(slot)
    if (normalizedSlot < 0 || normalizedSlot >= 3) return null
    slots[normalizedSlot] = techniqueId
    const nextLoadout = normalizeTechniqueLoadout({ slots }, known)
    if (!validateTechniqueLoadout(nextLoadout, known).valid) return null
    const character = clone(source)
    character.v2TechniqueLoadout = nextLoadout
    return character
  }

  toggleAutoTechniqueSlot(source: LegacyCharacterSave, slot: number, enabled: boolean): LegacyCharacterSave | null {
    const normalized = Math.floor(slot)
    if (normalized < 0 || normalized >= 3) return null
    const character = clone(source) as Record<string, any>
    if (!Array.isArray(character.v2AutoTechniqueSlots)) character.v2AutoTechniqueSlots = [true, true, true]
    character.v2AutoTechniqueSlots = character.v2AutoTechniqueSlots.slice(0, 3)
    while (character.v2AutoTechniqueSlots.length < 3) character.v2AutoTechniqueSlots.push(true)
    character.v2AutoTechniqueSlots[normalized] = enabled
    return character
  }

  getItemDelta(item: unknown): Record<'atk' | 'def' | 'hp' | 'mp', number> {
    const stats = getV2SimpleItemStats(item)
    return { atk: Number(stats?.atk || 0), def: Number(stats?.def || 0), hp: Number(stats?.hp || 0), mp: Number(stats?.mp || 0) }
  }

  autoEquipBest(source: LegacyCharacterSave): { character: LegacyCharacterSave; equipped: number } {
    let character = clone(source)
    let equipped = 0
    for (const slot of ['weapon', 'offhand', 'chest', 'legs', 'feet', 'charm'] as const) {
      const inventory = Array.isArray(character.inventory) ? character.inventory : []
      let bestIndex = -1
      let bestScore = -1
      inventory.forEach((item, index) => {
        if (itemSlot(item) !== slot) return
        const stats = getV2SimpleItemStats(item, character)
        const score = Number(stats?.atk || 0) * 2 + Number(stats?.def || 0) * 2 + Number(stats?.hp || 0) / 10 + Number(stats?.mp || 0) / 10
        if (score > bestScore) { bestScore = score; bestIndex = index }
      })
      if (bestIndex < 0) continue
      const next = this.equipInventoryItem(character, bestIndex)
      if (next) { character = next; equipped += 1 }
    }
    return { character, equipped }
  }

  ensureV2TechniqueState(source: LegacyCharacterSave): LegacyCharacterSave {
    const character = clone(source)
    const classId = normalizeCharacterClassId(character.cls) || '炼体士'
    const defaults = [...(V2_CLASS_TECHNIQUES[classId] || V2_CLASS_TECHNIQUES['炼体士'])]
    const known = getV2CharacterTechniqueIds(character)
    const normalizedKnown = known.length > 0 ? known : defaults
    character.v2KnownTechniques = normalizedKnown
    character.v2TechniqueLoadout = normalizeTechniqueLoadout(
      character.v2TechniqueLoadout || { slots: normalizedKnown },
      normalizedKnown,
    )
    return character
  }
}
