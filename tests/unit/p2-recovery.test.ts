import { describe, expect, it } from 'vitest'

import {
  V2_TECHNIQUES,
  advanceV2PassiveMana,
  advanceV2Rest,
  createEmptyElementResistances,
  getV2PassiveManaPerSecond,
  getV2RestRecoveryPerSecond,
  isV2Resting,
  resolveV2Healing,
  resolveV2HealingPillAmount,
  startV2Rest,
  startV2RestBelowThreshold,
  useV2RestHealingPill,
  useV2RestHealingTechnique,
  type BattleActorState,
} from '../../src/game-core/rulesets/v2'
import { createNativeCharacter } from '../../src/game-core/save'

function recoveryCharacter() {
  const source = createNativeCharacter({
    name: '调息修士', race: '五行伪灵根', classId: '丹医', ruleset: 'v2',
    rootId: '五行伪灵根', talentSeed: 'recovery-test', now: 1,
  })
  source.maxHp = 1_000
  source.hp = 100
  source.maxMp = 500
  source.mp = 500
  source.abilities = { ...(source.abilities as Record<string, unknown>), str: 12, con: 10, wis: 14 }
  source.v2Pills = { 回春丹: 2, 回灵丹: 0 }
  return source
}

function healingActor(patch: Partial<BattleActorState> = {}): BattleActorState {
  return {
    id: 'player', side: 'player', name: '丹医', level: 1, element: 'wood',
    hp: 100, maxHp: 1_000, mp: 100, maxMp: 100, shield: 0,
    attack: 10, defense: 5, spirit: 10, physique: 10, agility: 10,
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    criticalChance: 0, criticalMultiplier: 1.5, damageMultiplier: 1, healingMultiplier: 1,
    statusResistances: { control: 0, poison: 0 }, techniqueMastery: {},
    affinities: { wood: 20 }, resistances: createEmptyElementResistances(),
    knownTechniqueIds: ['verdant_rejuvenation'],
    techniqueLoadout: { slots: ['verdant_rejuvenation', null, null] },
    ...patch,
  }
}

describe('P2 调息与固定点数恢复', () => {
  it('自然恢复只按体魄固定点数计算，与最大气血无关', () => {
    const lowMax = recoveryCharacter()
    const highMax = recoveryCharacter()
    highMax.maxHp = 10_000
    highMax.hp = 100

    expect(getV2RestRecoveryPerSecond(lowMax)).toBe(4)
    expect(getV2RestRecoveryPerSecond(highMax)).toBe(4)

    const lowResult = advanceV2Rest(startV2Rest(lowMax, 'manual', 1_000), 4_000)
    const highResult = advanceV2Rest(startV2Rest(highMax, 'manual', 1_000), 4_000)
    expect(Number(lowResult.character.hp) - 100).toBe(12)
    expect(Number(highResult.character.hp) - 100).toBe(12)
  })

  it('战后仅在气血低于阈值时进入调息，并在满血后自动结束', () => {
    const source = recoveryCharacter()
    expect(isV2Resting(startV2RestBelowThreshold(source, 0.2, 'post_battle', 1_000))).toBe(true)
    source.hp = 201
    expect(isV2Resting(startV2RestBelowThreshold(source, 0.2, 'post_battle', 1_000))).toBe(false)
    source.hp = 200
    expect(isV2Resting(startV2RestBelowThreshold(source, 0.2, 'post_battle', 1_000))).toBe(true)

    source.hp = 995
    const completed = advanceV2Rest(startV2Rest(source, 'manual', 1_000), 3_000)
    expect(completed.character.hp).toBe(1_000)
    expect(completed.completed).toBe(true)
    expect(isV2Resting(completed.character)).toBe(false)
  })

  it('回春丹按基础药力和体魄恢复，不随最大气血变化', () => {
    expect(resolveV2HealingPillAmount(12)).toBe(56)
    expect(resolveV2HealingPillAmount(20)).toBeGreaterThan(resolveV2HealingPillAmount(12))

    const lowMax = startV2Rest(recoveryCharacter(), 'manual', 1_000)
    const highMax = startV2Rest({ ...recoveryCharacter(), maxHp: 10_000 }, 'manual', 1_000)
    const lowResult = useV2RestHealingPill(lowMax)!
    const highResult = useV2RestHealingPill(highMax)!
    expect(lowResult.recovered).toBe(56)
    expect(highResult.recovered).toBe(56)
    expect((lowResult.character.v2Pills as Record<string, number>).回春丹).toBe(1)
  })
})

describe('P2 治疗功法独立公式', () => {
  it('青木回春只按自身配置的木亲和、神识和根骨缩放', () => {
    const technique = V2_TECHNIQUES.verdant_rejuvenation
    const baseline = resolveV2Healing(healingActor(), technique)
    const highWisdom = resolveV2Healing(healingActor({
      abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 30, cha: 10 },
    }), technique)
    const highConstitution = resolveV2Healing(healingActor({
      abilities: { str: 10, dex: 10, con: 30, int: 10, wis: 10, cha: 10 },
    }), technique)
    const highAffinity = resolveV2Healing(healingActor({ affinities: { wood: 80 } }), technique)
    const irrelevantPhysique = resolveV2Healing(healingActor({
      abilities: { str: 80, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    }), technique)
    const largerHealthPool = resolveV2Healing(healingActor({ maxHp: 10_000 }), technique)

    expect(highWisdom).toBeGreaterThan(baseline)
    expect(highConstitution).toBeGreaterThan(baseline)
    expect(highAffinity).toBeGreaterThan(baseline)
    expect(irrelevantPhysique).toBe(baseline)
    expect(largerHealthPool).toBe(baseline)
  })

  it('调息中只能施展已拥有的治疗功法，并消耗法力', () => {
    const source = startV2Rest(recoveryCharacter(), 'manual', 1_000)
    const result = useV2RestHealingTechnique(source, 'verdant_rejuvenation')!
    expect(result.recovered).toBeGreaterThan(0)
    expect(result.character.mp).toBe(Number(source.mp) - V2_TECHNIQUES.verdant_rejuvenation.manaCost)
    expect(useV2RestHealingTechnique(source, 'scarlet_flame_art')).toBeNull()
  })
})

describe('P2 场景被动法力恢复', () => {
  it('恢复速度随神识、场景灵力充沛度和当前境界提升', () => {
    const lowSpirit = recoveryCharacter()
    lowSpirit.abilities = { ...(lowSpirit.abilities as Record<string, unknown>), wis: 10 }
    const highSpirit = recoveryCharacter()
    highSpirit.abilities = { ...(highSpirit.abilities as Record<string, unknown>), wis: 80 }
    const highZone = recoveryCharacter()
    highZone.zone = 40
    highZone.abilities = { ...(highZone.abilities as Record<string, unknown>), wis: 10 }
    const highRealm = recoveryCharacter()
    const progression = highRealm.v2Progression as Record<string, unknown>
    progression.realm = {
      realmId: 'foundation-early',
      cultivation: 0,
      cultivationRequired: 1_100,
      breakthroughs: 13,
    }
    highRealm.abilities = { ...(highRealm.abilities as Record<string, unknown>), wis: 10 }

    expect(getV2PassiveManaPerSecond(highSpirit)).toBeGreaterThan(getV2PassiveManaPerSecond(lowSpirit))
    expect(getV2PassiveManaPerSecond(highZone)).toBeGreaterThan(getV2PassiveManaPerSecond(lowSpirit))
    expect(getV2PassiveManaPerSecond(highRealm)).toBeGreaterThan(getV2PassiveManaPerSecond(lowSpirit))
  })

  it('按时间累计恢复法力，并受最大法力上限约束', () => {
    const source = recoveryCharacter()
    source.maxMp = 500
    source.mp = 100
    source.abilities = { ...(source.abilities as Record<string, unknown>), wis: 50 }
    source.v2LastManaRegenAt = 1_000
    const result = advanceV2PassiveMana(source, 5_000)
    expect(result.elapsedMs).toBe(4_000)
    expect(result.recovered).toBeGreaterThan(0)
    expect(Number(result.character.mp)).toBeGreaterThan(100)
    expect(Number(result.character.mp)).toBeLessThanOrEqual(500)
    expect(Number(result.character.v2LastManaRegenAt)).toBe(5_000)
  })

  it('调息只恢复气血，不恢复法力', () => {
    const source = startV2Rest(recoveryCharacter(), 'manual', 1_000)
    const result = advanceV2Rest(source, 4_000)
    expect(Number(result.character.mp)).toBe(Number(source.mp))
    expect(Number(result.character.hp)).toBeGreaterThan(Number(source.hp))
  })
})
