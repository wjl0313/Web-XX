import { describe, expect, it } from 'vitest'

import {
  compareLegacySaveShadow,
  createEmptyLegacySlots,
} from '../../src/game-core/save'

describe('legacy save shadow comparison', () => {
  it('accepts an exact 24-slot round trip', () => {
    const slots = createEmptyLegacySlots()
    slots[0] = { name: '青岚', level: 12, nested: { hp: 80 } }
    const result = compareLegacySaveShadow(JSON.stringify(slots), structuredClone(slots))
    expect(result.equal).toBe(true)
    expect(result.differences).toEqual([])
    expect(result.legacyHash).toBe(result.candidateHash)
  })

  it('reports field paths and difference kinds instead of a single hash mismatch', () => {
    const legacy = createEmptyLegacySlots()
    legacy[0] = { name: '青岚', hp: 80, equipment: { weapon: 'Rusty Dagger' } }
    const candidate = structuredClone(legacy)
    candidate[0] = { name: '青岚', hp: 79, equipment: {}, newField: true }
    const result = compareLegacySaveShadow(JSON.stringify(legacy), candidate)
    expect(result.equal).toBe(false)
    expect(result.differences).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: '$[0].hp', kind: 'value' }),
      expect.objectContaining({ path: '$[0].equipment.weapon', kind: 'missing' }),
      expect.objectContaining({ path: '$[0].newField', kind: 'unexpected' }),
    ]))
  })

  it('supports explicit transient-field ignores without hiding other changes', () => {
    const legacy = createEmptyLegacySlots()
    legacy[0] = { name: '青岚', savedAt: 1, session: { tick: 4 }, hp: 80 }
    const candidate = structuredClone(legacy)
    candidate[0] = { name: '青岚', savedAt: 2, session: { tick: 99 }, hp: 70 }
    const result = compareLegacySaveShadow(JSON.stringify(legacy), candidate, {
      ignoredPaths: ['$[0].savedAt'],
      ignoredPathPrefixes: ['$[0].session'],
    })
    expect(result.differences).toEqual([
      expect.objectContaining({ path: '$[0].hp', kind: 'value' }),
    ])
  })

  it('keeps invalid legacy input visible even when both normalized arrays are empty', () => {
    const result = compareLegacySaveShadow('{', createEmptyLegacySlots())
    expect(result.equal).toBe(false)
    expect(result.legacyIssues).toEqual([{ code: 'invalid-json' }])
  })

  it('caps detailed output for large migrations', () => {
    const legacy = createEmptyLegacySlots()
    const candidate = createEmptyLegacySlots()
    legacy[0] = { a: 1, b: 2, c: 3 }
    candidate[0] = { a: 9, b: 9, c: 9 }
    expect(compareLegacySaveShadow(JSON.stringify(legacy), candidate, { maxDifferences: 2 }).differences).toHaveLength(2)
  })
})
