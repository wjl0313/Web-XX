import { ALL_ITEM_DATA } from '../../data'
import type { LegacyCharacterSave } from '../../save'
import { getLegacyItemBaseName, type LegacyEquipmentSlot } from './item-normalizer'
import { getLegacyItemEffectiveStats } from './item-stats'

export type LegacyEquipmentCommandFailure =
  | 'invalid-index'
  | 'not-equipment'
  | 'empty-slot'

export interface LegacyEquipmentCommandResult {
  applied: boolean
  character: LegacyCharacterSave
  item: unknown | null
  displaced: unknown | null
  failure: LegacyEquipmentCommandFailure | null
}

function cloneCharacter(character: LegacyCharacterSave): Record<string, any> {
  return JSON.parse(JSON.stringify(character)) as Record<string, any>
}

function applyItemStats(
  character: Record<string, any>,
  item: unknown,
  direction: 1 | -1,
): void {
  const stats = getLegacyItemEffectiveStats(item)
  if (!stats) return
  character.atk = Number(character.atk || 0) + stats.atk * direction
  character.def = Number(character.def || 0) + stats.def * direction
  character.maxHp = Number(character.maxHp || 0) + stats.hp * direction
  character.maxMp = Number(character.maxMp || 0) + stats.mp * direction
}

function failed(
  character: LegacyCharacterSave,
  failure: LegacyEquipmentCommandFailure,
): LegacyEquipmentCommandResult {
  return {
    applied: false,
    character,
    item: null,
    displaced: null,
    failure,
  }
}

export function equipLegacyInventoryItem(
  source: LegacyCharacterSave,
  inventoryIndex: number,
): LegacyEquipmentCommandResult {
  const inventory = Array.isArray(source.inventory) ? source.inventory : []
  const index = Math.floor(inventoryIndex)
  if (index < 0 || index >= inventory.length) return failed(source, 'invalid-index')

  const item = inventory[index]
  const baseName = getLegacyItemBaseName(item)
  const data = ALL_ITEM_DATA[baseName as keyof typeof ALL_ITEM_DATA]
  if (!data) return failed(source, 'not-equipment')

  const character = cloneCharacter(source)
  if (!character.equipment || typeof character.equipment !== 'object') character.equipment = {}
  if (!Array.isArray(character.inventory)) character.inventory = []
  const slot = data.slot as LegacyEquipmentSlot
  const displaced = character.equipment[slot] || null

  if (displaced) {
    applyItemStats(character, displaced, -1)
    character.inventory.push(displaced)
  }

  character.equipment[slot] = item
  applyItemStats(character, item, 1)
  character.inventory.splice(index, 1)

  return {
    applied: true,
    character,
    item,
    displaced,
    failure: null,
  }
}

export function unequipLegacyItem(
  source: LegacyCharacterSave,
  slot: LegacyEquipmentSlot,
): LegacyEquipmentCommandResult {
  const equipment = source.equipment && typeof source.equipment === 'object'
    ? source.equipment as Record<string, unknown>
    : {}
  const item = equipment[slot]
  if (!item) return failed(source, 'empty-slot')

  const character = cloneCharacter(source)
  if (!Array.isArray(character.inventory)) character.inventory = []
  applyItemStats(character, item, -1)
  character.equipment[slot] = null
  character.inventory.push(item)

  return {
    applied: true,
    character,
    item,
    displaced: null,
    failure: null,
  }
}
