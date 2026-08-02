import { ref } from 'vue'
import { defineStore } from 'pinia'

import {
  DEFAULT_V2_GAME_BALANCE_CONFIG,
  getCharacterRuleset,
  getRuntimeV2GameBalanceConfig,
  normalizeV2GameBalanceConfig,
  resetRuntimeV2GameBalanceConfig,
  setRuntimeV2GameBalanceConfig,
  type V2EquipmentBalanceProfile,
  type V2GameBalanceConfig,
} from '../game-core/rulesets'
import { getLegacyItemBaseName } from '../game-core/systems/equipment'
import type { LegacyCharacterSave } from '../game-core/save'
import { useSaveStore } from './save.store'

export const V2_BALANCE_STORAGE_KEY = 'fanxiulu:v2-game-balance:v1'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function profileValue(profile: V2EquipmentBalanceProfile | undefined, key: string): number {
  return Number(profile?.[key as keyof V2EquipmentBalanceProfile] || 0)
}

function rebaseEquippedItems(
  source: LegacyCharacterSave,
  previous: V2GameBalanceConfig,
  next: V2GameBalanceConfig,
): LegacyCharacterSave {
  if (getCharacterRuleset(source) !== 'v2') return source
  const character = clone(source)
  const equipment = character.equipment && typeof character.equipment === 'object'
    ? character.equipment as Record<string, unknown>
    : {}
  const totals = Object.values(equipment).reduce((result, item) => {
    const id = getLegacyItemBaseName(item)
    if (!id) return result
    for (const key of ['atk', 'def', 'hp', 'mp', 'str', 'dex', 'con', 'int', 'wis', 'cha']) {
      result[key] += profileValue(next.equipment[id], key) - profileValue(previous.equipment[id], key)
    }
    return result
  }, { atk: 0, def: 0, hp: 0, mp: 0, str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 } as Record<string, number>)

  character.atk = Math.max(1, Number(character.atk || 1) + totals.atk)
  character.def = Math.max(0, Number(character.def || 0) + totals.def)
  character.maxHp = Math.max(1, Number(character.maxHp || 1) + totals.hp)
  character.maxMp = Math.max(0, Number(character.maxMp || 0) + totals.mp)
  character.hp = Math.max(0, Math.min(Number(character.maxHp), Number(character.hp || 0)))
  character.mp = Math.max(0, Math.min(Number(character.maxMp), Number(character.mp || 0)))
  const abilities = character.abilities && typeof character.abilities === 'object'
    ? character.abilities as Record<string, unknown>
    : {}
  for (const key of ['str', 'dex', 'con', 'int', 'wis', 'cha']) {
    abilities[key] = Math.max(1, Number(abilities[key] || 10) + totals[key])
  }
  character.abilities = abilities
  return character
}

export const useBalanceStore = defineStore('v2-game-balance', () => {
  const saves = useSaveStore()
  const configuration = ref<V2GameBalanceConfig>(clone(getRuntimeV2GameBalanceConfig()))
  const initialized = ref(false)
  const revision = ref(0)

  function initialize(): void {
    if (initialized.value) return
    try {
      const raw = globalThis.localStorage?.getItem(V2_BALANCE_STORAGE_KEY)
      configuration.value = raw
        ? setRuntimeV2GameBalanceConfig(JSON.parse(raw))
        : getRuntimeV2GameBalanceConfig()
    } catch {
      configuration.value = resetRuntimeV2GameBalanceConfig()
      globalThis.localStorage?.removeItem(V2_BALANCE_STORAGE_KEY)
    }
    initialized.value = true
  }

  function apply(value: unknown): V2GameBalanceConfig {
    initialize()
    const previous = clone(configuration.value)
    const normalized = normalizeV2GameBalanceConfig(value)
    const slots = saves.slots.map((slot) => slot ? rebaseEquippedItems(slot, previous, normalized) : null)
    if (slots.some((slot, index) => slot !== saves.slots[index])) saves.replaceAllSlots(slots, saves.activeSlot)
    configuration.value = setRuntimeV2GameBalanceConfig(normalized)
    globalThis.localStorage?.setItem(V2_BALANCE_STORAGE_KEY, JSON.stringify(configuration.value))
    revision.value += 1
    void saves.persist()
    return configuration.value
  }

  function reset(): V2GameBalanceConfig {
    return apply(DEFAULT_V2_GAME_BALANCE_CONFIG)
  }

  function importJson(source: string): V2GameBalanceConfig {
    return apply(JSON.parse(source))
  }

  function exportJson(): string {
    return JSON.stringify(configuration.value, null, 2)
  }

  return { configuration, initialized, revision, initialize, apply, reset, importJson, exportJson }
})

