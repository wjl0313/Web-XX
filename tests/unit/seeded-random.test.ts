import { describe, expect, it } from 'vitest'

import { createSeededRandom } from '../../src/game-core/rng'

describe('createSeededRandom', () => {
  it('同一种子始终产生相同序列', () => {
    const first = createSeededRandom('test-001')
    const second = createSeededRandom('test-001')

    expect(Array.from({ length: 12 }, () => first.next())).toEqual(
      Array.from({ length: 12 }, () => second.next()),
    )
  })

  it('锁定 test-001 的算法序列', () => {
    const random = createSeededRandom('test-001')

    expect(Array.from({ length: 6 }, () => random.next())).toEqual([
      0.6986518395133317,
      0.09118573507294059,
      0.4548909526783973,
      0.282387935789302,
      0.6031579922419041,
      0.5387790808454156,
    ])
  })

  it('不同种子产生不同序列', () => {
    const first = createSeededRandom('test-001')
    const second = createSeededRandom('test-002')

    expect(Array.from({ length: 5 }, () => first.next())).not.toEqual(
      Array.from({ length: 5 }, () => second.next()),
    )
  })

  it('在包含端点的整数范围内取值', () => {
    const random = createSeededRandom('integer-range')
    const values = Array.from({ length: 200 }, () => random.integer(3, 8))

    expect(values.every((value) => value >= 3 && value <= 8)).toBe(true)
    expect(new Set(values)).toEqual(new Set([3, 4, 5, 6, 7, 8]))
  })

  it('支持概率判断和集合选取', () => {
    const random = createSeededRandom('choice')
    const options = ['剑修', '丹医', '阵法师'] as const

    expect(random.chance(0)).toBe(false)
    expect(random.chance(1)).toBe(true)
    expect(options).toContain(random.pick(options))
  })

  it('拒绝不合法输入', () => {
    expect(() => createSeededRandom('')).toThrow('随机种子不能为空')

    const random = createSeededRandom('invalid-input')
    expect(() => random.integer(4, 3)).toThrow('随机整数范围无效')
    expect(() => random.chance(1.1)).toThrow('概率必须位于 0 到 1 之间')
    expect(() => random.pick([])).toThrow('不能从空集合中随机选取')
  })
})
