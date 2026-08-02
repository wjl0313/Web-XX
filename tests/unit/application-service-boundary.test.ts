import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const storeUrls = [
  new URL('../../src/stores/combat.store.ts', import.meta.url),
  new URL('../../src/stores/afk.store.ts', import.meta.url),
  new URL('../../src/stores/character.store.ts', import.meta.url),
  new URL('../../src/stores/save.store.ts', import.meta.url),
]

function readStores(): string {
  return storeUrls
    .map((url) => `// ${fileURLToPath(url)}\n${readFileSync(url, 'utf8')}`)
    .join('\n')
}

describe('P0 Application Service boundary', () => {
  it('keeps random sources and legacy rule engines out of Pinia stores', () => {
    const source = readStores()

    expect(source).not.toMatch(/\bMath\.random\s*\(/)
    expect(source).not.toMatch(/\bcreateSystemRandom\b/)
    expect(source).not.toMatch(/\bcreateLegacyMob\b/)
    expect(source).not.toMatch(/\bcreateLegacyBossEncounter\b/)
    expect(source).not.toMatch(/\bresolveLegacy(PlayerAttack|SoloMobTurn|SoloVictory|Defeat|Flee)\b/)
    expect(source).not.toMatch(/\bsimulateLegacy(Party|Dungeon)?AfkReturn\b/)
    expect(source).not.toMatch(/\brollLegacy(Item|Loot|Rune|Affix|Quality)\w*\b/)
    expect(source).not.toMatch(/\bresolveV2Damage\b/)
    expect(source).not.toMatch(/\bbuildInitiativeOrder\b/)
    expect(source).not.toMatch(/\bdispatchV2BattleCommand\b/)
  })

  it('routes mutable game actions through versioned application services', () => {
    const source = readStores()

    expect(source).toContain('new LegacyBattleApplication()')
    expect(source).toContain('new LegacyAfkApplication()')
    expect(source).toContain('new LegacyEquipmentApplication()')
    expect(source).toContain('new LegacyProgressionApplication()')
    expect(source).toContain('new V2BattleApplication()')
    expect(source).toContain('new V2EquipmentApplication()')
  })
})
