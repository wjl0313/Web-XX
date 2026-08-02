import { describe, expect, it } from 'vitest'

import {
  P2_ROOT_GROUPS,
  P2_ROOT_IDS,
  P2_ROOT_PROFILES,
  P2_PUBLIC_REALM_CAP_ID,
  canP2RootLearnElement,
  createTalentChoices,
  getRealmDefinition,
  getV2ProgressionState,
  migrateV2Progression,
  performV2Breakthrough,
  setV2GrowthStrategy,
  type P2RootId,
} from '../../src/game-core/domain/progression'
import { canV2RootLearnTechnique, createV2PlayerActor } from '../../src/game-core/rulesets/v2'
import { createNativeCharacter } from '../../src/game-core/save'

function character(rootId: P2RootId = '木天灵根') {
  return createNativeCharacter({
    name: `测试-${rootId}`,
    race: rootId,
    classId: '五行法修',
    ruleset: 'v2',
    rootId,
    talentSeed: `seed-${rootId}`,
    now: 1,
  })
}

describe('P2 灵根、天赋与成长迁移', () => {
  it('定义 31 种标准五行组合与对应修炼倍率', () => {
    expect(P2_ROOT_IDS).toHaveLength(31)
    expect(P2_ROOT_GROUPS.map((group) => [group.id, group.rootIds.length])).toEqual([
      ['五灵根', 1],
      ['四灵根', 5],
      ['三灵根', 10],
      ['双灵根', 10],
      ['天灵根', 5],
    ])
    for (const profile of Object.values(P2_ROOT_PROFILES)) {
      expect(profile.cultivationRate).toBeCloseTo(1 / profile.elements.length, 10)
      expect(profile.caveTrainingRate).toBeCloseTo(1 / profile.elements.length, 10)
    }
  })

  it('灵根只允许学习所含五行属性及无属性功法', () => {
    expect(canP2RootLearnElement('金天灵根', 'metal')).toBe(true)
    expect(canP2RootLearnElement('金天灵根', 'wood')).toBe(false)
    expect(canP2RootLearnElement('金天灵根', 'neutral')).toBe(true)
    expect(canV2RootLearnTechnique('水土双灵根', 'mystic_water_bind')).toBe(true)
    expect(canV2RootLearnTechnique('水土双灵根', 'earth_guardian_aegis')).toBe(true)
    expect(canV2RootLearnTechnique('水土双灵根', 'scarlet_flame_art')).toBe(false)
    expect(canV2RootLearnTechnique('五行伪灵根', 'scarlet_flame_art')).toBe(true)
  })

  it('固定种子只生成三个不重复天赋，主副天赋保持可解释且不相同', () => {
    const choices = createTalentChoices('p2-fixed-seed', 3)
    expect(choices).toEqual(createTalentChoices('p2-fixed-seed', 3))
    expect(new Set(choices).size).toBe(3)
    const state = getV2ProgressionState(character())
    expect(state.talentChoices).toHaveLength(3)
    expect(state.secondaryTalentId).not.toBe(state.mainTalentId)
  })

  it('迁移旧等级但固定三个功法槽，并把公开境界封顶在结丹后期', () => {
    const source = character()
    delete source.v2Progression
    source.level = 65
    source.xp = 999_999
    const migrated = migrateV2Progression(source)
    const state = getV2ProgressionState(migrated)
    expect(state.realm.realmId).toBe(P2_PUBLIC_REALM_CAP_ID)
    expect(getRealmDefinition(state.realm.realmId).displayName).toBe('结丹后期')
    expect(migrated.v2TechniqueLoadout?.slots).toHaveLength(3)
  })
})

describe('P2 突破与成长策略', () => {
  it('修为未满不能突破，修为满后固定成功且恢复气血法力', () => {
    const source = character()
    expect(performV2Breakthrough(source)).toBeNull()
    const state = getV2ProgressionState(source)
    state.realm.cultivation = state.realm.cultivationRequired
    source.v2Progression = state
    source.hp = 1
    source.mp = 0
    const result = performV2Breakthrough(source)
    expect(result?.event.type).toBe('realm-breakthrough')
    expect(result?.character.level).toBe(Number(source.level) + 1)
    expect(result?.character.hp).toBe(result?.character.maxHp)
    expect(result?.character.mp).toBe(result?.character.maxMp)
  })

  it('切换成长策略不重置已有属性，并在下一次突破采用所选倾向', () => {
    const source = character()
    const originalAttack = Number(source.atk)
    const body = setV2GrowthStrategy(source, 'body').character
    expect(body.atk).toBe(originalAttack)
    const state = getV2ProgressionState(body)
    state.realm.cultivation = state.realm.cultivationRequired
    body.v2Progression = state
    const result = performV2Breakthrough(body)!
    expect(result.event).toMatchObject({ type: 'realm-breakthrough', strategyId: 'body' })
    expect(Number(result.character.atk)).toBeGreaterThan(originalAttack)
  })

  it('旧悟道与转世字段不会进入 v2 战斗属性', () => {
    const source = character('金天灵根')
    const baseline = createV2PlayerActor(source)
    const polluted = structuredClone(source)
    polluted.aa = { allDamage: 999, maxHp: 999 }
    polluted.prestige = { attackMultiplier: 999, defenseMultiplier: 999 }
    polluted.runeStash = [{ allStats: 999 }]
    const actor = createV2PlayerActor(polluted)
    expect(actor.attack).toBe(baseline.attack)
    expect(actor.defense).toBe(baseline.defense)
    expect(actor.maxHp).toBe(baseline.maxHp)
  })
})
