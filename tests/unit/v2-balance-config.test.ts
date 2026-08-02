import { afterEach, describe, expect, it } from 'vitest'

import { V2ProgressionApplication } from '../../src/application/v2'
import {
  DEFAULT_V2_GAME_BALANCE_CONFIG,
  applyV2PostBattleRecovery,
  calculateV2PostBattleRecovery,
  createV2BattleState,
  createV2EnemyActor,
  createV2PlayerActor,
  getV2EnemyCatalog,
  getV2GameBalanceConfig,
  getV2TechniqueCatalog,
  normalizeV2GameBalanceConfig,
  resetRuntimeV2GameBalanceConfig,
  setRuntimeV2GameBalanceConfig,
  type V2GameBalanceConfig,
} from '../../src/game-core/rulesets/v2'
import { createNativeCharacter } from '../../src/game-core/save'

function character() {
  return createNativeCharacter({
    name: '数值校验修士', race: '五行伪灵根', classId: '炼体士', ruleset: 'v2',
    rootId: '五行伪灵根', talentSeed: 'balance-test', now: 1,
  })
}

afterEach(() => resetRuntimeV2GameBalanceConfig())

describe('v2 全局数值配置', () => {
  it('集中包含职业、成长、功法、五行、战斗、装备、怪物和逐怪掉落', () => {
    const value = getV2GameBalanceConfig()
    expect(Object.keys(value.classes)).toEqual(['炼体士', '丹医', '五行法修', '影修'])
    expect(Object.keys(value.growthStrategies)).toContain('balanced')
    expect(Object.keys(value.techniques)).toHaveLength(12)
    expect(value.elements.overcomes.fire).toBe('metal')
    expect(value.combat.criticalDamageMultiplier).toBe(1.5)
    expect(Object.keys(value.equipment).length).toBeGreaterThan(20)
    expect(Object.keys(value.enemies)).toHaveLength(22)
    expect(value.enemies.spirit_field_rat.drops.guaranteedEquipmentId).toBe('Rusty Dagger')
  })

  it('拒绝非有限数值并约束概率参数', () => {
    const malformed = JSON.parse(JSON.stringify(DEFAULT_V2_GAME_BALANCE_CONFIG)) as V2GameBalanceConfig
    malformed.combat.maximumCriticalChance = 8
    malformed.enemies.spirit_field_rat.drops.equipmentChance = -3
    malformed.postBattleHpBaseRatio = Number.NaN
    const normalized = normalizeV2GameBalanceConfig(malformed)
    expect(normalized.combat.maximumCriticalChance).toBe(1)
    expect(normalized.enemies.spirit_field_rat.drops.equipmentChance).toBe(0)
    expect(normalized.postBattleHpBaseRatio).toBe(DEFAULT_V2_GAME_BALANCE_CONFIG.postBattleHpBaseRatio)
  })

  it('运行时覆盖会参与新角色初始属性、功法和怪物属性解析', () => {
    const configured = normalizeV2GameBalanceConfig(DEFAULT_V2_GAME_BALANCE_CONFIG)
    configured.classes.炼体士.initial.maxHp = 777
    configured.techniques.mountain_breaking_fist.basePower = 99
    configured.enemies.spirit_field_rat.hp = 333
    setRuntimeV2GameBalanceConfig(configured)

    expect(character().maxHp).toBe(777)
    expect(getV2TechniqueCatalog().mountain_breaking_fist.basePower).toBe(99)
    expect(getV2EnemyCatalog().spirit_field_rat.hp).toBe(333)
  })

  it('职业倍率和突破路线共同决定实际突破成长', () => {
    const source = character()
    const progression = source.v2Progression as Record<string, any>
    progression.realm.cultivation = progression.realm.cultivationRequired
    progression.growthStrategyId = 'balanced'
    const configured = normalizeV2GameBalanceConfig(DEFAULT_V2_GAME_BALANCE_CONFIG)
    configured.growthStrategies.balanced.gains.maxHp = 10
    configured.classes.炼体士.growthMultipliers.maxHp = 2
    setRuntimeV2GameBalanceConfig(configured)
    const result = new V2ProgressionApplication().breakthrough(source)!
    expect(Number(result.maxHp) - Number(source.maxHp)).toBe(20)
  })
})

describe('v2 战胜后恢复曲线', () => {
  it('按最大资源基础值与属性等级成长项计算，并受软上限和硬上限约束', () => {
    const source = character()
    source.level = 40
    source.maxHp = 600
    source.hp = 1
    source.maxMp = 500
    source.mp = 1
    source.abilities = { ...(source.abilities as Record<string, number>), str: 45, wis: 50 }
    const value = calculateV2PostBattleRecovery(source)
    expect(value.hp.baseAmount).toBe(60)
    expect(value.hp.rawGrowthAmount).toBe(180)
    expect(value.hp.effectiveGrowthAmount).toBeLessThan(value.hp.rawGrowthAmount)
    expect(value.hp.calculatedAmount).toBeLessThanOrEqual(210)
    expect(value.mp.calculatedAmount).toBeLessThanOrEqual(175)
  })

  it('只恢复缺失资源，且装备结算进角色后的体魄和资源上限会自然参与公式', () => {
    const source = character()
    source.level = 10
    source.maxHp = 500
    source.hp = 490
    source.maxMp = 300
    source.mp = 295
    source.abilities = { ...(source.abilities as Record<string, number>), str: 30, wis: 25 }
    const result = applyV2PostBattleRecovery(source)
    expect(result.hp.recovered).toBe(10)
    expect(result.mp.recovered).toBe(5)
    expect(result.character.hp).toBe(500)
    expect(result.character.mp).toBe(300)
  })

  it('战斗状态只保存战斗所需的小型配置快照', () => {
    const source = character()
    const enemy = createV2EnemyActor(getV2EnemyCatalog(source).spirit_field_rat)
    const state = createV2BattleState({
      seed: 'compact-config', player: createV2PlayerActor(source), enemy,
      zoneId: enemy.id, enemyContentId: enemy.id, rewards: { xp: 0, gold: 0 },
      balanceConfig: getV2GameBalanceConfig(source),
    })
    expect('enemies' in state.balanceConfig).toBe(false)
    expect('techniques' in state.balanceConfig).toBe(false)
    expect(state.balanceConfig.combat.baseHitChance).toBe(1)
  })
})
