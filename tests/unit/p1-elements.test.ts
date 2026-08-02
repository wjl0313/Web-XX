import { describe, expect, it } from 'vitest'

import {
  calculateDefenseMultiplier,
  clampAffinity,
  clampResistance,
  createEmptyElementResistances,
  createV2BattleState,
  getAffinityMultiplier,
  getElementMultiplier,
  getResistanceMultiplier,
  normalizeElementResistances,
  resolveV2Damage,
  type BattleActorState,
  type Element,
} from '../../src/game-core/rulesets/v2'

function actor(id: string, element: Element): BattleActorState {
  return {
    id,
    side: id === 'player' ? 'player' : 'enemy',
    name: id,
    level: 1,
    element,
    hp: 100,
    maxHp: 100,
    mp: 100,
    maxMp: 100,
    shield: 0,
    attack: 20,
    defense: 0,
    spirit: 10,
    physique: 10,
    agility: 10,
    criticalChance: 0,
    criticalMultiplier: 1.5,
    affinities: {},
    resistances: createEmptyElementResistances(),
    knownTechniqueIds: [],
    techniqueLoadout: { slots: [null, null, null] },
  }
}

describe('P1 五行、亲和与抗性规则', () => {
  it.each([
    ['metal', 'wood'],
    ['wood', 'earth'],
    ['earth', 'water'],
    ['water', 'fire'],
    ['fire', 'metal'],
  ] as const)('%s 克制 %s', (attackElement, targetElement) => {
    expect(getElementMultiplier(attackElement, targetElement)).toBe(1.2)
    expect(getElementMultiplier(targetElement, attackElement)).toBe(0.85)
  })

  it('无属性、同属性和五行链外属性不产生额外克制', () => {
    expect(getElementMultiplier('neutral', 'wood')).toBe(1)
    expect(getElementMultiplier('fire', 'fire')).toBe(1)
    expect(getElementMultiplier('thunder', 'water')).toBe(1)
    expect(getElementMultiplier('ice', 'fire')).toBe(1)
  })

  it('将亲和限制为 0～100，并锁定 0/50/100 倍率', () => {
    expect(clampAffinity(-1)).toBe(0)
    expect(clampAffinity(101)).toBe(100)
    expect(getAffinityMultiplier('fire', { fire: 0 })).toBe(1)
    expect(getAffinityMultiplier('fire', { fire: 50 })).toBe(1.1)
    expect(getAffinityMultiplier('fire', { fire: 100 })).toBe(1.2)
    expect(getAffinityMultiplier('neutral', { neutral: 100 })).toBe(1)
  })

  it('将抗性限制为 -50～300，并将最终倍率限制为 0.25～1.50', () => {
    expect(clampResistance(-999)).toBe(-50)
    expect(clampResistance(999)).toBe(300)
    expect(getResistanceMultiplier('fire', normalizeElementResistances({ fire: -50 }))).toBe(1.5)
    expect(getResistanceMultiplier('fire', normalizeElementResistances({ fire: 100 }))).toBe(0.5)
    expect(getResistanceMultiplier('fire', normalizeElementResistances({ fire: 300 }))).toBe(0.25)
    expect(getResistanceMultiplier('neutral', normalizeElementResistances({ fire: 300 }))).toBe(1)
  })

  it('按亲和、五行、抗性、防御顺序给出完整伤害分解', () => {
    const player = actor('player', 'fire')
    const enemy = actor('enemy', 'metal')
    player.affinities.fire = 100
    enemy.resistances.fire = 100
    enemy.defense = 100
    const state = createV2BattleState({
      seed: 'p1-pipeline',
      player,
      enemy,
      zoneId: 'test-zone',
      enemyContentId: 'test-enemy',
      rewards: { xp: 0, gold: 0 },
    })

    const result = resolveV2Damage({
      state,
      attacker: state.actors.player,
      target: state.actors.enemy,
      element: 'fire',
      basePower: 10,
      attackScale: 1,
      canCritical: false,
    })

    expect(result.advantage).toBe('克制')
    expect(result.breakdown).toMatchObject({
      base: 10,
      scaling: 20,
      affinityMultiplier: 1.2,
      elementMultiplier: 1.2,
      resistanceMultiplier: 0.5,
      defenseMultiplier: calculateDefenseMultiplier(100),
      criticalMultiplier: 1,
      statusMultiplier: 1,
      equipmentMultiplier: 1,
    })
    expect(result.breakdown.finalAmount).toBeGreaterThan(0)
  })
})
