import { describe, expect, it } from 'vitest'

import { createSeededRandom } from '../../src/game-core/rng'
import {
  V2_ENEMIES,
  V2_OFFLINE_MAX_MS,
  applyV2RewardBundle,
  createV2RewardBundle,
  isV2Resting,
  rollP2Loot,
  simulateV2AutoEncounter,
  simulateV2Offline,
  type V2RewardBundle,
} from '../../src/game-core/rulesets/v2'
import { createNativeCharacter } from '../../src/game-core/save'

function strongCharacter() {
  const source = createNativeCharacter({
    name: '历练修士', race: '金天灵根', classId: '五行法修', ruleset: 'v2',
    rootId: '金天灵根', talentSeed: 'p2-afk', now: 1,
  })
  source.atk = 5_000
  source.def = 1_000
  source.maxHp = 20_000
  source.hp = 20_000
  source.maxMp = 5_000
  source.mp = 5_000
  source.inventoryCapacity = 500
  return source
}

describe('P2 奖励和掉落管线', () => {
  it('结算修为、灵石、装备、功法、灵草、材料、图鉴和任务且支持幂等', () => {
    const source = strongCharacter()
    const bundle: V2RewardBundle = {
      cultivation: 100,
      gold: 88,
      enemyId: 'vermin_tyrant',
      enemyName: '噬灵鼠王',
      boss: true,
      firstClear: true,
      equipment: ['Rusty Dagger'],
      techniques: ['metal_severing_needle'],
      herbs: { 凝露草: 2 },
      materials: { 妖丹: 2, 首领精魄: 2 },
    }
    const once = applyV2RewardBundle(source, bundle, 'reward-1')
    const twice = applyV2RewardBundle(once.character, bundle, 'reward-1')
    expect(once.cultivationApplied).toBeGreaterThan(0)
    expect(once.character.gold).toBe(Number(source.gold) + 88)
    expect(once.character.v2Herbs).toMatchObject({ 凝露草: 2 })
    expect(once.character.v2Materials).toMatchObject({ 妖丹: 2, 首领精魄: 2 })
    expect(once.character.v2Codex).toMatchObject({ vermin_tyrant: 1 })
    expect(once.character.v2TaskProgress).toMatchObject({ zoneKills: 1, bossKills: 1 })
    expect(once.techniquesAdded).toEqual(['metal_severing_needle'])
    expect(twice.cultivationApplied).toBe(0)
    expect(twice.character.gold).toBe(once.character.gold)
  })

  it('背包满时停止增加装备，且掉落表不会生成符纹或禁制', () => {
    const source = strongCharacter()
    source.inventoryCapacity = source.inventory.length
    const bundle = createV2RewardBundle(V2_ENEMIES.vermin_tyrant, source, createSeededRandom('boss-loot'), true)
    const applied = applyV2RewardBundle(source, bundle, 'full-bag')
    expect(applied.inventoryFull).toBe(true)
    expect(applied.equipmentAdded).toBe(0)
    const lootKeys = JSON.stringify(rollP2Loot(V2_ENEMIES.vermin_tyrant, createSeededRandom('no-runes'), [], true))
    expect(lootKeys).not.toMatch(/符纹|禁制|rune/i)
  })
})

describe('P2 自动历练与离线模拟', () => {
  it('自动历练使用 v2 状态机并发放 P2 奖励', () => {
    const result = simulateV2AutoEncounter(strongCharacter(), {
      seed: 'p2-auto-state-machine',
      forceEnemyId: 'spirit_field_rat',
    })
    expect(result.state.ruleset).toBe('v2')
    expect(result.state.phase).toBe('COMPLETED')
    expect(result.state.events.some((event) => event.type === 'TurnOrderBuilt')).toBe(true)
    expect(result.reward).not.toBeNull()
  })

  it('十五分钟内逐场模拟，长离线使用聚合并将收益封顶八小时', () => {
    const source = strongCharacter()
    const exact = simulateV2Offline(source, { elapsedMs: 10 * 60_000, seed: 'offline-exact' })
    const aggregate = simulateV2Offline(source, { elapsedMs: 60 * 60_000, seed: 'offline-aggregate' })
    const capped = simulateV2Offline(source, { elapsedMs: 24 * 60 * 60_000, seed: 'offline-capped' })
    expect(exact.summary.mode).toBe('exact')
    expect(aggregate.summary.mode).toBe('aggregate')
    expect(capped.summary.simulatedMs).toBeLessThanOrEqual(V2_OFFLINE_MAX_MS)
    expect(capped.summary.fights).toBeGreaterThan(0)
  })

  it('固定 seed 产生一致的抽样摘要', () => {
    const source = strongCharacter()
    const left = simulateV2Offline(source, { elapsedMs: 2 * 60 * 60_000, seed: 'fixed-seed' })
    const right = simulateV2Offline(source, { elapsedMs: 2 * 60 * 60_000, seed: 'fixed-seed' })
    expect(left.summary).toEqual(right.summary)
  })

  it('战败只触发调息，不再作为自动历练的停止原因', () => {
    const source = createNativeCharacter({
      name: '战败续练修士', race: '五行伪灵根', classId: '炼体士', ruleset: 'v2',
      rootId: '五行伪灵根', talentSeed: 'defeat-continue', now: 1,
    })
    source.atk = 1
    source.def = 0
    source.maxHp = 100
    source.hp = 30
    source.maxMp = 0
    source.mp = 0
    const result = simulateV2AutoEncounter(source, {
      seed: 'defeat-continue',
      forceEnemyId: 'spirit_field_rat',
    })
    expect(result.result.outcome).toBe('defeat')
    expect(result.stopReason).toBeNull()
    expect(result.character.hp).toBe(1)
    expect(isV2Resting(result.character)).toBe(true)
  })

  it('离线模拟战败后继续推进，不再因角色死亡截断收益', () => {
    const source = createNativeCharacter({
      name: '离线续练修士', race: '五行伪灵根', classId: '炼体士', ruleset: 'v2',
      rootId: '五行伪灵根', talentSeed: 'offline-defeat-continue', now: 1,
    })
    source.atk = 1
    source.def = 0
    source.maxHp = 10
    source.hp = 10
    source.maxMp = 0
    source.mp = 0
    const result = simulateV2Offline(source, { elapsedMs: 30 * 60_000, seed: 'offline-defeat-continue' })
    expect(result.summary.defeats).toBeGreaterThan(0)
    expect(result.summary.stopReason).toBe('离线时间耗尽')
  })
})

describe('战后调息入口', () => {
  it('自动历练胜利后按统一公式恢复，并按恢复后的比例判断调息', () => {
    const source = strongCharacter()
    source.hp = 4_001
    source.mp = 1_000
    source.abilities = { ...(source.abilities as Record<string, unknown>), dex: 1 }
    const result = simulateV2AutoEncounter(source, {
      seed: 'auto-recovery',
      forceEnemyId: 'spirit_field_rat',
    })
    expect(result.result.outcome).toBe('victory')
    const battlePlayer = result.state.actors.player
    expect(Number(result.character.hp)).toBeGreaterThan(battlePlayer.hp)
    expect(Number(result.character.mp)).toBeGreaterThanOrEqual(battlePlayer.mp)
    expect(result.character.v2ActionState).toBeUndefined()
  })
})
