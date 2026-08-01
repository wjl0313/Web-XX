import type { RandomSource } from './random-source'

const UINT32_RANGE = 4_294_967_296

function hashSeed(seed: string): number {
  let hash = 2_166_136_261

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index)
    hash = Math.imul(hash, 16_777_619)
  }

  return hash >>> 0
}

export function createSeededRandom(seed: string): RandomSource {
  if (!seed.trim()) throw new Error('随机种子不能为空')

  let state = hashSeed(seed)

  function next(): number {
    state = (state + 0x6d2b79f5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / UINT32_RANGE
  }

  return {
    next,
    integer(min, max) {
      if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || min > max) {
        throw new RangeError('随机整数范围无效')
      }

      return min + Math.floor(next() * (max - min + 1))
    },
    chance(probability) {
      if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
        throw new RangeError('概率必须位于 0 到 1 之间')
      }
      if (probability === 0) return false
      if (probability === 1) return true
      return next() < probability
    },
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) throw new RangeError('不能从空集合中随机选取')
      return items[Math.floor(next() * items.length)]
    },
  }
}
