import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { createSeededRandom } from '../../src/game-core/rng'
import { configureSaveRepository } from '../../src/services/save-repository.provider'
import { LocalSaveRepository, type KeyValueStorage } from '../../src/services/local/local-save.repository'
import { useCharacterStore } from '../../src/stores/character.store'
import { useCombatStore } from '../../src/stores/combat.store'
import { useAfkStore } from '../../src/stores/afk.store'
import { useSaveStore } from '../../src/stores/save.store'

class MemoryStorage implements KeyValueStorage {
  values = new Map<string, string>()
  getItem(key: string): string | null { return this.values.get(key) ?? null }
  setItem(key: string, value: string): void { this.values.set(key, value) }
  removeItem(key: string): void { this.values.delete(key) }
}

let repository: LocalSaveRepository
let storage: MemoryStorage

beforeEach(() => {
  setActivePinia(createPinia())
  storage = new MemoryStorage()
  repository = new LocalSaveRepository(storage, { now: () => new Date('2026-08-01T00:00:00Z') })
  configureSaveRepository(repository)
})

describe('native domain stores', () => {
  it('creates, persists and reloads a compatible character slot', async () => {
    const saves = useSaveStore()
    await saves.initialize(repository)
    await saves.createCharacter(0, { name: '青岚', race: '五行杂灵根', classId: '炼体士', now: 1 }, repository)

    expect(saves.activeSlot).toBe(0)
    expect(saves.activeCharacter).toMatchObject({ name: '青岚', level: 1, race: '五行杂灵根', cls: '炼体士', version: '1.6.19' })
    expect(saves.slots).toHaveLength(24)
    expect(JSON.parse(storage.getItem('EmberQuest_slots')!)[0]).toMatchObject({ race: 'Human', cls: 'Warrior' })

    const freshPinia = createPinia()
    setActivePinia(freshPinia)
    const reloaded = useSaveStore()
    await reloaded.initialize(repository)
    expect(reloaded.slots[0]).toMatchObject({ name: '青岚', race: '五行杂灵根', cls: '炼体士', knownSpells: ['shield_slam'] })
  })

  it('equips and unequips inventory entries through the character boundary', async () => {
    const saves = useSaveStore()
    await saves.initialize(repository)
    await saves.createCharacter(0, { name: '青岚', race: '五行杂灵根', classId: '炼体士' }, repository)
    saves.activeCharacter!.inventory = ['Worn Shortsword']
    const characters = useCharacterStore()
    const baseAttack = Number(saves.activeCharacter!.atk)

    expect(characters.equipInventoryItem(0)).toBe(true)
    expect(saves.activeCharacter!.equipment).toMatchObject({ weapon: 'Worn Shortsword' })
    expect(Number(saves.activeCharacter!.atk)).toBeGreaterThan(baseAttack)
    expect(characters.unequip('weapon')).toBe(true)
    expect((saves.activeCharacter!.equipment as Record<string, unknown>).weapon).toBeNull()
  })

  it('runs native deterministic combat without the legacy iframe', async () => {
    const saves = useSaveStore()
    await saves.initialize(repository)
    await saves.createCharacter(0, { name: '青岚', race: '五行杂灵根', classId: '炼体士' }, repository)
    const combat = useCombatStore()
    combat.setRandomSource(createSeededRandom('native-combat'))

    expect(combat.spawn()).not.toBeNull()
    for (let turn = 0; turn < 30 && combat.mob; turn += 1) combat.attack()

    expect(combat.log.length).toBeGreaterThan(1)
    expect(Number(saves.activeCharacter!.stats && (saves.activeCharacter!.stats as Record<string, unknown>).kills || 0)).toBeGreaterThanOrEqual(0)
  })

  it('runs the frozen slot-order auto-cast rule and restores its structured journal', async () => {
    const saves = useSaveStore()
    await saves.initialize(repository)
    await saves.createCharacter(0, { name: '云岫', race: '五行杂灵根', classId: '五行法修' }, repository)
    const combat = useCombatStore()
    combat.setRandomSource(createSeededRandom('native-auto-cast'))
    expect(combat.spawn()).not.toBeNull()

    expect(combat.autoCast(1_000)).toBe(true)
    expect(combat.log.map((entry) => entry.event.type)).toEqual(expect.arrayContaining([
      'encounter', 'spell-cast', 'spell-damage',
    ]))
    expect(combat.replaySummary.spellsCast).toBe(1)
    expect(combat.replaySummary.damageDealt).toBeGreaterThan(0)

    const journal = combat.exportJournal()
    const messages = combat.log.map((entry) => entry.text)
    combat.reset()
    expect(combat.log).toEqual([])
    expect(combat.restoreJournal(journal)).toBe(true)
    expect(combat.log.map((entry) => entry.text)).toEqual(messages)
    expect(combat.restoreJournal('{')).toBe(false)
  })

  it('spawns and settles a zone boss through the native combat boundary', async () => {
    const saves = useSaveStore()
    await saves.initialize(repository)
    await saves.createCharacter(0, { name: '临渊', race: '五行杂灵根', classId: '炼体士' }, repository)
    const combat = useCombatStore()
    combat.setRandomSource({
      next: () => 0.99,
      integer: (_minimum, maximum) => maximum,
      pick: <T>(items: readonly T[]) => items.at(-1)!,
    })

    expect(combat.spawnBoss(1_000)).toMatchObject({ boss: true, name: '[Boss] Vermin Tyrant' })
    expect(combat.spawnBoss(1_000)).toBeNull()
    combat.mob!.hp = 1
    saves.activeCharacter!.atk = 10_000
    expect(combat.attack()).toBe(true)

    expect(combat.mob).toBeNull()
    expect(saves.activeCharacter!.bossCooldowns).toMatchObject({ 0: expect.any(Number) })
    expect((saves.activeCharacter!.stats as Record<string, number>).bossKills).toBe(1)
    expect(combat.log.some((entry) => entry.text.startsWith('首领战利品：'))).toBe(true)
  })

  it('restores offline party XP into every compatible local character slot', async () => {
    const saves = useSaveStore()
    await saves.initialize(repository)
    await saves.createCharacter(0, { name: '队长', race: '五行杂灵根', classId: '炼体士' }, repository)
    await saves.createCharacter(1, { name: '队友', race: '五行杂灵根', classId: '炼体士' }, repository)
    expect(saves.selectSlot(0)).toBe(true)
    saves.activeCharacter!.group = [1]
    saves.activeCharacter!.afkEnabled = true
    saves.activeCharacter!.lastAfkAt = 1_000
    const afk = useAfkStore()
    afk.setRandomSource({
      next: () => 0,
      integer: (minimum) => minimum,
      pick: <T>(items: readonly T[]) => items[0],
    })

    const summary = await afk.recoverOffline(4_600)
    expect(summary?.xp).toBeGreaterThan(0)
    expect((saves.slots[0]!.stats as Record<string, number>).xpEarned).toBe(summary!.xp)
    expect((saves.slots[1]!.stats as Record<string, number>).xpEarned).toBe(summary!.xp)
    expect(saves.activeSlot).toBe(0)
  })
})
