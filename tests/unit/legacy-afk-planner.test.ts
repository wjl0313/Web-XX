import { describe, expect, it } from 'vitest'

import { ZONES } from '../../src/game-core/data'
import { createLegacyCharacter, createEmptyLegacySlots } from '../../src/game-core/save'
import {
  applyLegacyAfkProvisioning,
  getBalancedLegacyAfkZoneIndex,
  getBestGoldLegacyAfkZoneIndex,
  getHighestUnlockedLegacyAfkZoneIndex,
  planLegacyAfkGoal,
  useBestLegacyPotion,
} from '../../src/game-core/systems/afk'

function character() {
  return createLegacyCharacter({
    name: '青岚',
    race: 'Human',
    classId: 'Warrior',
    now: 1,
  })
}

describe('legacy AFK goal planner', () => {
  it('uses the frozen highest, gold and balanced zone scoring', () => {
    const source = character()
    source.level = 20

    const unlocked = ZONES
      .map((zone, index) => ({ zone, index }))
      .filter(({ zone }) => zone.minLvl <= 20)
    const expectedHighest = unlocked.toSorted((left, right) =>
      right.zone.minLvl - left.zone.minLvl
      || right.zone.maxLvl - left.zone.maxLvl
      || right.index - left.index,
    )[0].index
    const expectedGold = unlocked.toSorted((left, right) =>
      right.zone.goldMult - left.zone.goldMult
      || right.zone.minLvl - left.zone.minLvl
      || right.zone.maxLvl - left.zone.maxLvl
      || right.index - left.index,
    )[0].index

    expect(getHighestUnlockedLegacyAfkZoneIndex(source)).toBe(expectedHighest)
    expect(getBestGoldLegacyAfkZoneIndex(source)).toBe(expectedGold)
    expect(ZONES[getBalancedLegacyAfkZoneIndex(source)].minLvl).toBeLessThanOrEqual(20)
    expect(ZONES[getBalancedLegacyAfkZoneIndex(source)].maxLvl).toBeGreaterThanOrEqual(20)
  })

  it('plans contract targeting and smart alt handoff without mutating saves', () => {
    const source = character()
    source.level = 30
    source.afkGoal = 'contract'
    source.eliteContracts = [{ active: true, complete: false, zone: 3, target: 'Fear Elemental', bossStep: false }]
    source.afkPinnedContractIdx = 0
    const snapshot = structuredClone(source)

    const contractPlan = planLegacyAfkGoal(source)
    expect(contractPlan.zone).toBe(3)
    expect(contractPlan.actions).toContain('set-contract-hunt-target')
    expect((contractPlan.character.huntTargets as Record<string, string>)['3']).toBe('Fear Elemental')
    expect(source).toEqual(snapshot)

    const slots = createEmptyLegacySlots()
    const alt = character()
    alt.name = '次席'
    alt.level = 4
    slots[0] = source
    slots[1] = alt
    source.afkGoal = 'level_alts_to'
    source.afkGoalTargets = { level_alts_to: 20 }

    const altPlan = planLegacyAfkGoal(source, { slots, activeSlot: 0 })
    expect(altPlan.smartGoalComplete).toBe(true)
    expect(altPlan.nextAltSlot).toBe(1)
  })

  it('applies the gold preset and flags dungeon simulation explicitly', () => {
    const source = character()
    source.level = 30
    source.afkGoal = 'gold'
    const goldPlan = planLegacyAfkGoal(source)
    expect(goldPlan.character.lootFilterPreset).toBe('gold')
    expect(goldPlan.character.lootFilter).toMatchObject({
      autoSellJunk: true,
      autoSellNormalGear: true,
      protectRarePlus: true,
    })

    source.afkGoal = 'dungeon'
    const dungeonPlan = planLegacyAfkGoal(source)
    expect(dungeonPlan.requiresDungeonSimulation).toBe(true)
    expect(dungeonPlan.character.dungeon).toMatchObject({ active: true, floor: 1 })
  })
})

describe('legacy AFK potions', () => {
  it('auto-buys the highest eligible tier while respecting the shared balance', () => {
    const source = character()
    source.level = 30
    source.gold = 5_000
    source.afkRules = { autoBuyPots: true, potMin: 5 }

    const result = applyLegacyAfkProvisioning(source)

    expect(result.purchased).toBe(3)
    expect(result.goldSpent).toBe(4_200)
    expect(result.character).toMatchObject({
      gold: 800,
      healpotions_ghp: 2,
      manapotions_gmp: 1,
    })
    expect(source.gold).toBe(5_000)
  })

  it('uses the highest owned potion and the frozen restoration amount', () => {
    const source = character()
    source.hp = 10
    source.maxHp = 2_000
    source.healpotions_ghp = 1
    source.healpotions_lhp = 2

    const result = useBestLegacyPotion(source, 'hp')

    expect(result.used).toBe(true)
    expect(result.potionKey).toBe('healpotions_ghp')
    expect(result.restored).toBe(1_200)
    expect(result.character).toMatchObject({ hp: 1_210, healpotions_ghp: 0, healpotions_lhp: 2 })
  })
})
