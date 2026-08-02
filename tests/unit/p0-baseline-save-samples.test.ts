import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  exportNativeSlotsToLegacy,
  importLegacySlotsToNative,
  parseLegacySlots,
} from '../../src/game-core/save'

const samples = [
  ['01-low-warrior.json', '青锋', 4, 'Warrior'],
  ['02-mid-cleric.json', '栖月', 28, 'Cleric'],
  ['03-high-wizard.json', '照玄', 92, 'Wizard'],
  ['04-legacy-heavy-rogue.json', '无迹', 74, 'Rogue'],
] as const

describe('P0 frozen baseline save samples', () => {
  for (const [file, name, level, classId] of samples) {
    it(`loads and round-trips ${file} without dropping fields`, () => {
      const raw = readFileSync(new URL(`../../legacy/baseline-save-samples/${file}`, import.meta.url), 'utf8')
      const parsed = parseLegacySlots(raw)

      expect(parsed.issues).toEqual([])
      expect(parsed.slots).toHaveLength(24)
      expect(parsed.slots[0]).toMatchObject({ name, level, cls: classId })
      expect(exportNativeSlotsToLegacy(importLegacySlotsToNative(parsed.slots))).toEqual(parsed.slots)
    })
  }

  it('preserves populated frozen-system fields in the legacy-heavy sample', () => {
    const raw = readFileSync(new URL('../../legacy/baseline-save-samples/04-legacy-heavy-rogue.json', import.meta.url), 'utf8')
    const character = parseLegacySlots(raw).slots[0]

    expect(character).toMatchObject({
      guild: { name: '听雨楼', contribution: 12_600 },
      casino: { spins: 184 },
      social: { friends: ['friend-a', 'friend-b'] },
      shrine: { deity: 'old-shadow-idol' },
      pets: { active: 'shadow-wolf' },
      mercenary: { type: 'Vanguard', customName: '铁山' },
      dungeon: { best: 34 },
      prestige: { rank: 2 },
      aa: { points: 18 },
    })
  })
})
