import { CONTAINER_ITEMS } from '../../data'
import type { LegacyCharacterSave } from '../../save'
import { getLegacyItemBaseName } from './item-normalizer'

export interface LegacyBagLayoutEntry {
  index: number
  name: string
  slots: number
  overflow: boolean
}

export type LegacyContainerCommandFailure =
  | 'invalid-index'
  | 'locked'
  | 'not-container'
  | 'starter-only'
  | 'insufficient-gold'
  | 'insufficient-capacity'

export interface LegacyContainerCommandResult {
  applied: boolean
  character: LegacyCharacterSave
  item: string | null
  displaced: string | null
  cost: number
  failure: LegacyContainerCommandFailure | null
}

const containers = CONTAINER_ITEMS as unknown as Record<string, { slots: number; cost: number; starter?: boolean }>

function cloneCharacter(character: LegacyCharacterSave): Record<string, any> {
  return JSON.parse(JSON.stringify(character)) as Record<string, any>
}

function failed(
  character: LegacyCharacterSave,
  failure: LegacyContainerCommandFailure,
  cost = 0,
): LegacyContainerCommandResult {
  return { applied: false, character, item: null, displaced: null, cost, failure }
}

export function normalizeLegacyBags(source: readonly unknown[] | null | undefined): string[] {
  const bags = Array.isArray(source) && source.length ? source.slice(0, 4).map(String) : []
  while (bags.length < 4) bags.push('Worn Pouch')
  return bags.map((name) => containers[name] ? name : 'Worn Pouch')
}

export function getLegacyBagLayout(character: LegacyCharacterSave): LegacyBagLayoutEntry[] {
  const bags = normalizeLegacyBags(character.bags as readonly unknown[] | undefined)
  const layout = bags.map((name, index) => ({ index, name, slots: containers[name].slots, overflow: false }))
  const inventoryLength = Array.isArray(character.inventory) ? character.inventory.length : 0
  const capacity = layout.reduce((sum, bag) => sum + bag.slots, 0)
  if (inventoryLength > capacity) {
    layout.push({ index: layout.length, name: 'Overflow', slots: inventoryLength - capacity, overflow: true })
  }
  return layout
}

export function getLegacyInventoryCapacity(character: LegacyCharacterSave): number {
  return getLegacyBagLayout(character).filter((bag) => !bag.overflow).reduce((sum, bag) => sum + bag.slots, 0)
}

export function purchaseLegacyContainer(
  source: LegacyCharacterSave,
  name: string,
  priceMultiplier = 1,
): LegacyContainerCommandResult {
  const data = containers[name]
  if (!data || data.starter) return failed(source, 'starter-only')
  const cost = Math.max(0, Math.floor(data.cost * Math.max(0, Number(priceMultiplier) || 0)))
  if (Number(source.gold || 0) < cost) return failed(source, 'insufficient-gold', cost)
  const character = cloneCharacter(source)
  if (!Array.isArray(character.inventory)) character.inventory = []
  character.gold = Number(character.gold || 0) - cost
  character.inventory.push(name)
  return { applied: true, character, item: name, displaced: null, cost, failure: null }
}

export function installLegacyContainer(
  source: LegacyCharacterSave,
  inventoryIndex: number,
  targetBagIndex = 0,
): LegacyContainerCommandResult {
  const inventory = Array.isArray(source.inventory) ? source.inventory : []
  const index = Math.floor(Number(inventoryIndex))
  if (index < 0 || index >= inventory.length) return failed(source, 'invalid-index')
  const entry = inventory[index]
  if (entry && typeof entry === 'object' && !Array.isArray(entry) && (entry as Record<string, unknown>).locked) {
    return failed(source, 'locked')
  }
  const item = getLegacyItemBaseName(entry)
  const bag = containers[item]
  if (!bag) return failed(source, 'not-container')
  const character = cloneCharacter(source)
  character.bags = normalizeLegacyBags(character.bags)
  const targetIndex = Math.max(0, Math.min(character.bags.length - 1, Math.floor(Number(targetBagIndex) || 0)))
  const oldBagName = character.bags[targetIndex]
  const oldBag = containers[oldBagName] || containers['Worn Pouch']
  const projectedCapacity = getLegacyInventoryCapacity(character) - oldBag.slots + bag.slots
  if (character.inventory.length - 1 > projectedCapacity) return failed(source, 'insufficient-capacity')
  character.inventory.splice(index, 1)
  if (!containers[oldBagName]?.starter) character.inventory.push(oldBagName)
  character.bags[targetIndex] = item
  return { applied: true, character, item, displaced: oldBagName, cost: 0, failure: null }
}
