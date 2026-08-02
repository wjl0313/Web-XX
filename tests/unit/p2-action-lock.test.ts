import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { configureSaveRepository } from '../../src/services/save-repository.provider'
import { LocalSaveRepository, type KeyValueStorage } from '../../src/services/local/local-save.repository'
import { useActionStore } from '../../src/stores/action.store'
import { useActivitiesStore } from '../../src/stores/activities.store'
import { useAfkStore } from '../../src/stores/afk.store'
import { useCharacterStore } from '../../src/stores/character.store'
import { useCombatStore } from '../../src/stores/combat.store'
import { useProgressionStore } from '../../src/stores/progression.store'
import { useSaveStore } from '../../src/stores/save.store'

class MemoryStorage implements KeyValueStorage {
  values = new Map<string, string>()
  getItem(key: string): string | null { return this.values.get(key) ?? null }
  setItem(key: string, value: string): void { this.values.set(key, value) }
  removeItem(key: string): void { this.values.delete(key) }
}

describe('P2 调息行动锁', () => {
  let repository: LocalSaveRepository

  beforeEach(() => {
    setActivePinia(createPinia())
    repository = new LocalSaveRepository(new MemoryStorage(), { now: () => new Date('2026-08-03T00:00:00Z') })
    configureSaveRepository(repository)
  })

  it('调息期间锁定玩法行动，但仍允许更换装备', async () => {
    const saves = useSaveStore()
    await saves.initialize(repository)
    await saves.createCharacter(0, {
      name: '守息者', race: '五行伪灵根', classId: '丹医', ruleset: 'v2', rootId: '五行伪灵根',
    }, repository)
    saves.activeCharacter!.hp = 1
    saves.activeCharacter!.level = 10
    saves.activeCharacter!.inventory = ['Worn Shortsword']
    saves.activeCharacter!.v2Herbs = { 凝露草: 10, 清心花: 10 }

    const actions = useActionStore()
    const activities = useActivitiesStore()
    const afk = useAfkStore()
    const characters = useCharacterStore()
    const combat = useCombatStore()
    const progression = useProgressionStore()

    expect(actions.beginRest(1_000)).toBe(true)
    expect(actions.resting).toBe(true)
    expect(combat.spawn()).toBeNull()
    expect(afk.setZone(1)).toBe(false)
    expect(activities.enterDungeon('spirit_pressure', false)).toBe(false)
    expect(activities.startCave('verdant_rejuvenation', 15)).toBe(false)
    expect(activities.queueAlchemy('回春丹', 1)).toBe(false)
    expect(progression.setGrowthStrategy('body')).toBe(false)
    expect(progression.breakthrough()).toBe(false)

    expect(characters.equipInventoryItem(0)).toBe(true)
    expect(saves.activeCharacter?.equipment).toMatchObject({ weapon: 'Worn Shortsword' })
  })
})
