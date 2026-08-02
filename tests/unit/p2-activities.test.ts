import { describe, expect, it } from 'vitest'

import {
  autoDiveP2Dungeon,
  claimAlchemyV2,
  claimCaveTraining,
  enterP2Dungeon,
  getAlchemyV2Queue,
  getCaveTrainingTask,
  queueAlchemyV2,
  startCaveTraining,
} from '../../src/game-core/rulesets/v2'
import type { P2RootId } from '../../src/game-core/domain/progression'
import { createNativeCharacter } from '../../src/game-core/save'

function character(rootId: P2RootId = '金天灵根') {
  const source = createNativeCharacter({
    name: `洞府-${rootId}`, race: rootId, classId: '五行法修', ruleset: 'v2',
    rootId, talentSeed: `activity-${rootId}`, now: 1,
  })
  source.v2KnownTechniques = [...(source.v2KnownTechniques || []), 'gengjin_sword_art']
  return source
}

describe('P2 洞府功法参悟', () => {
  it('只允许一门已获得功法参悟，到期后领取熟练度', () => {
    const source = character()
    const started = startCaveTraining(source, 'gengjin_sword_art', 15, 1_000)!
    expect(getCaveTrainingTask(started)).toMatchObject({ techniqueId: 'gengjin_sword_art', durationMinutes: 15 })
    expect(startCaveTraining(started, 'gengjin_sword_art', 60, 1_000)).toBeNull()
    expect(claimCaveTraining(started, 1_000 + 14 * 60_000)).toBeNull()
    const claimed = claimCaveTraining(started, 1_000 + 15 * 60_000)!
    expect(claimed.points).toBeGreaterThan(0)
    expect(getCaveTrainingTask(claimed.character)).toBeNull()
  })

  it('同含金属性时灵根越纯参悟越快，不含金属性时不能参悟庚金功法', () => {
    const singleMetal = startCaveTraining(character('金天灵根'), 'gengjin_sword_art', 60, 1_000)!
    const dualMetal = startCaveTraining(character('金木双灵根'), 'gengjin_sword_art', 60, 1_000)!
    const wood = startCaveTraining(character('木天灵根'), 'gengjin_sword_art', 60, 1_000)
    expect(getCaveTrainingTask(singleMetal)!.masteryPoints).toBeGreaterThan(getCaveTrainingTask(dualMetal)!.masteryPoints)
    expect(getCaveTrainingTask(singleMetal)!.completesAt).toBe(1_000 + 60 * 60_000)
    expect(wood).toBeNull()
  })
})

describe('P2 简化炼丹', () => {
  it('固定消耗、固定成功、单队列最多五次且不读取旧炼丹等级', () => {
    const source = character()
    source.alchemyLevel = 100
    source.v2Herbs = { 凝露草: 20, 清心花: 10 }
    const queued = queueAlchemyV2(source, '回春丹', 5, 1_000)!
    expect(getAlchemyV2Queue(queued)).toHaveLength(5)
    expect(queueAlchemyV2(queued, '回春丹', 1, 1_000)).toBeNull()
    expect(queued.v2Herbs).toMatchObject({ 凝露草: 10, 清心花: 5 })
    const lastCompletion = getAlchemyV2Queue(queued).at(-1)!.completesAt
    const claimed = claimAlchemyV2(queued, lastCompletion)!
    expect(claimed.claimed).toEqual({ 回春丹: 5 })
    expect(getAlchemyV2Queue(claimed.character)).toHaveLength(0)
  })
})

describe('P2 幽竹秘境', () => {
  it('使用 v2 战斗逐层深入，每五层建立检查点并保留首次奖励', () => {
    const source = character()
    source.atk = 50_000
    source.def = 5_000
    source.maxHp = 100_000
    source.hp = 100_000
    source.maxMp = 10_000
    source.mp = 10_000
    source.inventoryCapacity = 500
    const entered = enterP2Dungeon(source, 'spirit_pressure', true)
    const result = autoDiveP2Dungeon(entered, 'dungeon-five', 5)
    expect(result.results).toHaveLength(5)
    expect(result.results.every((entry) => entry.battle.ruleset === 'v2' && entry.victory)).toBe(true)
    expect(result.results.at(-1)?.dungeon.checkpoint).toBe(6)
    expect(result.results.at(-1)?.dungeon.firstClearFloors).toEqual([1, 2, 3, 4, 5])
  })
})
