import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { V2AfkApplication, V2BattleApplication, V2EquipmentApplication } from '../../src/application/v2'
import { isV2Resting } from '../../src/game-core/rulesets/v2'
import { createNativeCharacter } from '../../src/game-core/save'
import { configureSaveRepository } from '../../src/services/save-repository.provider'
import { LocalSaveRepository, type KeyValueStorage } from '../../src/services/local/local-save.repository'
import { useAfkStore } from '../../src/stores/afk.store'
import { useActionStore } from '../../src/stores/action.store'
import { useCombatStore } from '../../src/stores/combat.store'
import { useSaveStore } from '../../src/stores/save.store'

class MemoryStorage implements KeyValueStorage {
  values = new Map<string, string>()
  getItem(key: string): string | null { return this.values.get(key) ?? null }
  setItem(key: string, value: string): void { this.values.set(key, value) }
  removeItem(key: string): void { this.values.delete(key) }
}

describe('P1 Application Service', () => {
  it('建立严格 1v1 遭遇，并通过状态机结算奖励', () => {
    const character = createNativeCharacter({
      name: '青岚', race: '金天灵根', classId: '五行法修', ruleset: 'v2', rootId: '金天灵根',
    })
    character.atk = 10_000
    character.maxHp = 1_000
    character.hp = 100
    character.maxMp = 500
    character.mp = 100
    character.abilities = { ...(character.abilities || {}), dex: 100 }
    const application = new V2BattleApplication()
    const started = application.startEncounter(character, null, {
      seed: 'application-victory', forceEnemyId: 'spirit_field_rat',
    })

    expect(started.state?.ruleset).toBe('v2')
    expect(Object.keys(started.state?.actors || {})).toEqual(['player', 'enemy'])
    expect(started.state?.phase).toBe('WAITING_FOR_COMMAND')
    const completed = application.executeCommand(started.character, started.state, {
      type: 'basic_attack', actorId: 'player', targetId: 'enemy',
    })
    expect(completed.state).toBeNull()
    expect(completed.completedState?.result?.outcome).toBe('victory')
    expect(Number(completed.character.gold)).toBeGreaterThan(Number(character.gold || 0))
    expect((completed.character.stats as Record<string, number>).kills).toBe(1)
    expect(completed.character.ruleset).toBe('v2')
    const battlePlayer = completed.completedState!.actors.player
    expect(Number(completed.character.hp)).toBeGreaterThan(battlePlayer.hp)
    expect(Number(completed.character.mp)).toBeGreaterThanOrEqual(battlePlayer.mp)
    expect(completed.completedState?.events.some((event) => event.message.includes('战胜后恢复'))).toBe(true)
    expect(isV2Resting(completed.character)).toBe(true)
    expect(completed.completedState!.events.some((event) => event.type === 'RestStarted')).toBe(true)
  })

  it('只允许第 1 与第 5 个 P1 区域挑战首领', () => {
    const application = new V2BattleApplication()
    const character = createNativeCharacter({
      name: '临渊', race: '火天灵根', classId: '炼体士', ruleset: 'v2', rootId: '火天灵根',
    })
    character.level = 40
    character.maxHp = 10_000
    character.hp = 10_000
    const firstBoss = application.startEncounter(character, null, { seed: 'boss-zone-0', boss: true })
    expect(firstBoss.state?.encounter.enemyContentId).toBe('vermin_tyrant')

    character.zone = 1
    const missingBoss = application.startEncounter(character, null, { seed: 'boss-zone-1', boss: true })
    expect(missingBoss.applied).toBe(false)
    expect(missingBoss.validationReason).toBe('当前区域没有可挑战的首领。')

    character.zone = 4
    const finalBoss = application.startEncounter(character, null, { seed: 'boss-zone-4', boss: true })
    expect(finalBoss.state?.encounter.enemyContentId).toBe('abyss_lord')
  })

  it('先结算战胜恢复，再按恢复后的气血判断 50% 调息阈值', () => {
    const application = new V2BattleApplication()
    const character = createNativeCharacter({
      name: '临界修士', race: '五行伪灵根', classId: '丹医', ruleset: 'v2', rootId: '五行伪灵根',
    })
    character.atk = 10_000
    character.maxHp = 1_000
    character.hp = 500
    character.abilities = { ...(character.abilities || {}), dex: 100 }
    character.v2AutoConfiguration = { meditationThreshold: 0.5 }
    const started = application.startEncounter(character, null, { seed: 'rest-threshold-50', forceEnemyId: 'spirit_field_rat' })
    const completed = application.executeCommand(started.character, started.state, {
      type: 'basic_attack', actorId: 'player', targetId: 'enemy',
    })

    expect(completed.character.hp).toBeGreaterThan(500)
    expect(completed.character.v2ActionState).toBeUndefined()
    expect(completed.completedState?.events.some((event) => event.type === 'RestStarted')).toBe(false)
  })

  it('装备服务保留六槽，只接受 P1 白名单并锁定战斗中功法配置', () => {
    const application = new V2EquipmentApplication()
    const character = createNativeCharacter({
      name: '照川', race: '水土双灵根', classId: '影修', ruleset: 'v2', rootId: '水土双灵根',
    })
    character.inventory = ['Worn Shortsword', 'Developer Crown']

    expect(application.equipInventoryItem(character, 0)?.equipment).toMatchObject({ weapon: 'Worn Shortsword' })
    expect(application.equipInventoryItem(character, 1)).toBeNull()
    expect(application.setZone(character, 5)).toBeNull()
    expect(application.setTechniqueSlot(character, 0, 'shadow_assault', true)).toBeNull()
    expect(application.setTechniqueSlot(character, 0, 'shadow_assault', false)?.v2TechniqueLoadout).toMatchObject({
      slots: ['shadow_assault', expect.anything(), expect.anything()],
    })
  })
})

describe('P1 Pinia 集成与冻结边界', () => {
  let repository: LocalSaveRepository

  beforeEach(() => {
    setActivePinia(createPinia())
    repository = new LocalSaveRepository(new MemoryStorage(), { now: () => new Date('2026-08-01T00:00:00Z') })
    configureSaveRepository(repository)
  })

  it('v2 角色由同一状态机完成手动与自动战斗', async () => {
    const saves = useSaveStore()
    await saves.initialize(repository)
    await saves.createCharacter(0, {
      name: '青岚', race: '金天灵根', classId: '五行法修', ruleset: 'v2', rootId: '金天灵根',
    }, repository)
    saves.activeCharacter!.atk = 500
    saves.activeCharacter!.maxHp = 2_000
    saves.activeCharacter!.hp = 2_000
    const combat = useCombatStore()
    combat.setV2Seed('store-v2-battle')

    expect(combat.spawn()).toMatchObject({ baseName: expect.any(String) })
    expect(combat.isV2).toBe(true)
    expect(combat.waitingForPlayer).toBe(true)
    expect(combat.attack()).toBe(true)
    if (combat.inCombat) expect(combat.autoResolve()).toBe(true)

    expect(combat.inCombat).toBe(false)
    expect(combat.lastCompletedV2State?.phase).toBe('COMPLETED')
    expect(combat.lastCompletedV2State?.events.some((event) => event.type === 'TurnOrderBuilt')).toBe(true)
    expect(combat.lastCompletedV2State?.events.some((event) => event.type === 'DamageDealt' && Boolean(event.breakdown))).toBe(true)
  })

  it('v2 在线自动历练逐次推进可见战斗，而不是在场景外整场结算', async () => {
    const saves = useSaveStore()
    await saves.initialize(repository)
    await saves.createCharacter(0, {
      name: '观战者', race: '金天灵根', classId: '五行法修', ruleset: 'v2', rootId: '金天灵根',
    }, repository)
    saves.activeCharacter!.atk = 20
    saves.activeCharacter!.maxHp = 2_000
    saves.activeCharacter!.hp = 2_000
    saves.activeCharacter!.abilities = { ...(saves.activeCharacter!.abilities || {}), dex: 100 }
    const combat = useCombatStore()
    const afk = useAfkStore()

    expect(await afk.start()).toBe(true)
    try {
      expect(combat.mob).toBeNull()
      afk.tick()
      expect(combat.mob).toMatchObject({ baseName: expect.any(String), hp: expect.any(Number) })
      expect(combat.inCombat).toBe(true)
      const logAfterSpawn = combat.log.length

      afk.tick()
      expect(combat.log.length).toBeGreaterThan(logAfterSpawn)
      expect(combat.log.some((entry) => entry.event.type === 'ActionDeclared')).toBe(true)
    } finally {
      await afk.stop()
    }
  })

  it('v2 开启自动历练时先检查 50% 调息阈值，低血量不会先进入战斗', async () => {
    const saves = useSaveStore()
    await saves.initialize(repository)
    await saves.createCharacter(0, {
      name: '自动调息者', race: '五行伪灵根', classId: '丹医', ruleset: 'v2', rootId: '五行伪灵根',
    }, repository)
    saves.activeCharacter!.atk = 10_000
    saves.activeCharacter!.maxHp = 1_000
    saves.activeCharacter!.hp = 500
    saves.activeCharacter!.abilities = { ...(saves.activeCharacter!.abilities || {}), dex: 100 }
    const combat = useCombatStore()
    const afk = useAfkStore()
    const actions = useActionStore()
    expect(afk.updateConfiguration({ meditationThreshold: 0.5 })).toBe(true)
    expect(afk.v2Configuration?.meditationThreshold).toBe(0.5)
    expect(new V2AfkApplication().prepareEncounter(saves.activeCharacter!, 1).character.v2ActionState)
      .toMatchObject({ type: 'resting', reason: 'auto_threshold' })

    const starting = afk.start()
    expect(saves.activeCharacter!.v2ActionState).toMatchObject({ type: 'resting', reason: 'auto_threshold' })
    expect(await starting).toBe(true)
    try {
      expect(saves.activeCharacter!.v2ActionState).toMatchObject({ type: 'resting', reason: 'auto_threshold' })
      expect(actions.resting).toBe(true)
      expect(combat.inCombat).toBe(false)
      afk.tick()
      expect(combat.inCombat).toBe(false)
      actions.tick(Date.now() + 10 * 60_000)
      expect(actions.resting).toBe(false)
      afk.tick()
      expect(combat.inCombat).toBe(true)
    } finally {
      await afk.stop()
    }
  })

  it('v2 战败后重新开启自动历练会先完成调息，再开始新战斗', async () => {
    const saves = useSaveStore()
    await saves.initialize(repository)
    await saves.createCharacter(0, {
      name: '再战者', race: '五行伪灵根', classId: '炼体士', ruleset: 'v2', rootId: '五行伪灵根',
    }, repository)
    saves.activeCharacter!.atk = 1
    saves.activeCharacter!.maxHp = 160
    saves.activeCharacter!.hp = 1
    saves.activeCharacter!.abilities = { ...(saves.activeCharacter!.abilities || {}), dex: 100 }
    const combat = useCombatStore()
    const afk = useAfkStore()
    const actions = useActionStore()

    combat.setV2Seed('restart-after-defeat')
    expect(combat.spawn()).not.toBeNull()
    expect(combat.autoResolve()).toBe(true)
    expect(combat.lastCompletedV2State?.result?.outcome).toBe('defeat')

    expect(await afk.start()).toBe(true)
    try {
      afk.tick()
      expect(afk.running).toBe(true)
      expect(actions.resting).toBe(true)
      expect(combat.inCombat).toBe(false)
      actions.tick(Date.now() + 10 * 60_000)
      afk.tick()
      expect(actions.resting).toBe(false)
      expect(combat.inCombat).toBe(true)
      expect(combat.mob).not.toBeNull()
    } finally {
      await afk.stop()
    }
  })

  it('v2 使用 P2 自动历练与离线结算，但不恢复 legacy 挂机档案', async () => {
    const saves = useSaveStore()
    await saves.initialize(repository)
    await saves.createCharacter(0, {
      name: '静修者', race: '五行伪灵根', classId: '丹医', ruleset: 'v2', rootId: '五行伪灵根',
    }, repository)
    const afk = useAfkStore()

    expect(afk.isV2).toBe(true)
    expect(afk.enabled).toBe(false)
    expect(await afk.start()).toBe(true)
    expect(afk.enabled).toBe(true)
    expect(afk.setGoal('gold')).toBe(true)
    expect(afk.setZone(1)).toBe(true)
    expect(await afk.recoverOffline(Date.now() + 60_000)).toMatchObject({ mode: 'exact' })
    expect(afk.saveProfile('slot1')).toBe(false)
    await afk.stop()
  })
})
