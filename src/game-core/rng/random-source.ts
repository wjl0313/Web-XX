export interface RandomSource {
  next(): number
  integer(min: number, max: number): number
  chance(probability: number): boolean
  pick<T>(items: readonly T[]): T
}
