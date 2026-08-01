import type { RandomSource } from './random-source'

export function createSystemRandom(nextValue: () => number = Math.random): RandomSource {
  const next = (): number => {
    const value = Number(nextValue())
    if (!Number.isFinite(value)) return 0
    return Math.max(0, Math.min(0.9999999999999999, value))
  }
  return {
    next,
    integer(min, max) {
      if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || min > max) throw new RangeError('随机整数范围无效')
      return min + Math.floor(next() * (max - min + 1))
    },
    chance(probability) {
      if (!Number.isFinite(probability) || probability < 0 || probability > 1) throw new RangeError('概率必须位于 0 到 1 之间')
      return probability > 0 && (probability === 1 || next() < probability)
    },
    pick<T>(items: readonly T[]): T {
      if (!items.length) throw new RangeError('不能从空集合中随机选取')
      return items[Math.floor(next() * items.length)]
    },
  }
}
