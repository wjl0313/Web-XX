import { describe, expect, it } from 'vitest'

import {
  castLegacySpell,
  getLegacyCappedSpellHealPercent,
  getLegacyCappedSpellManaPercent,
  getLegacyClassSpellbook,
  getLegacyScaledSpellMpCost,
  getLegacySpellById,
} from '../../src/game-core/systems/spells'
import type { RandomSource } from '../../src/game-core/rng'

const random = (value: number): RandomSource => ({
  next: () => value,
  integer: (min, max) => min + Math.floor(value * (max - min + 1)),
  chance: (probability) => value < probability,
  pick: <T>(items: readonly T[]) => items[Math.floor(value * items.length)],
})

const caster = {
  name: '测试方士',
  level: 10,
  hp: 60,
  maxHp: 100,
  mp: 100,
  maxMp: 100,
  atk: 20,
  def: 10,
  spellCooldowns: {},
}

const target = {
  name: '测试妖兽',
  baseName: '测试妖兽',
  level: 10,
  hp: 200,
  maxHp: 200,
  atk: 20,
  def: 10,
  elite: false,
  named: false,
}

describe('legacy spell engine', () => {
  it('indexes class and epic spells from generated data', () => {
    expect(getLegacyClassSpellbook('Wizard')).toHaveLength(7)
    expect(getLegacySpellById('Wizard', 'fireball')?.kind).toBe('damage')
    expect(getLegacySpellById('Wizard', 'missing')).toBeNull()
  })

  it('keeps level-scaled mana cost and heal/mana caps', () => {
    const fireball = getLegacySpellById('Wizard', 'fireball')!
    expect(getLegacyScaledSpellMpCost(fireball, 10)).toBe(30)
    expect(getLegacyCappedSpellHealPercent({ healPct: 0.8 })).toBe(0.35)
    expect(getLegacyCappedSpellHealPercent({ healPct: 0.8, epic: true })).toBe(0.55)
    expect(getLegacyCappedSpellManaPercent({ manaPct: 0.8, epic: true })).toBe(0.45)
  })

  it('casts deterministic damage and applies cooldown', () => {
    const result = castLegacySpell({
      classId: 'Wizard',
      spellId: 'fireball',
      caster,
      target,
      random: random(0.5),
      now: 1_000,
    })
    expect(result.success).toBe(true)
    expect(result.amount).toBe(65)
    expect(result.target?.hp).toBe(135)
    expect(result.caster.mp).toBe(70)
    expect(result.cooldownUntil).toBe(9_000)
  })

  it('applies weaken and poison follow-up without global state', () => {
    const weakened = castLegacySpell({
      classId: 'Warrior', spellId: 'shield_slam', caster, target, random: random(0.5), now: 2_000,
    })
    expect(weakened.target?.atk).toBe(18)

    const poisoned = castLegacySpell({
      classId: 'Rogue', spellId: 'poison_strike', caster, target, random: random(0), now: 2_000,
    })
    expect(poisoned.poisonDamage).toBe(8)
    expect(poisoned.statusEffect?.kind).toBe('dot')
    expect(poisoned.statusEffect?.expiresAt).toBeGreaterThan(2_000)
  })

  it('caps healing and mana restoration at resource maximums', () => {
    const healed = castLegacySpell({
      classId: 'Cleric', spellId: 'greater_heal', caster, random: random(0.5), now: 1_000,
    })
    expect(healed.caster.hp).toBe(100)
    expect(healed.amount).toBe(40)

    const mana = castLegacySpell({
      classId: 'Wizard', spellId: 'clarity', caster: { ...caster, mp: 80 }, random: random(0.5), now: 1_000,
    })
    expect(mana.caster.mp).toBe(100)
  })

  it('heals the weakest party member, including a downed companion', () => {
    const result = castLegacySpell({
      classId: 'Cleric',
      spellId: 'greater_heal',
      caster,
      partyUnits: [
        { unitId: 'player', type: 'player', name: '测试方士', level: 10, hp: 60, maxHp: 100, def: 10, isPlayer: true },
        { unitId: 'merc-0', type: 'merc', name: '倒地佣兵', level: 10, hp: 0, maxHp: 120, def: 8 },
      ],
      random: random(0),
      now: 1_000,
    })
    expect(result.healTargetId).toBe('merc-0')
    expect(result.partyUnits.find((unit) => unit.unitId === 'merc-0')?.hp).toBeGreaterThan(0)
    expect(result.caster.hp).toBe(60)
  })

  it('rejects cooldown, insufficient mana and missing targets before mutation', () => {
    expect(castLegacySpell({
      classId: 'Wizard', spellId: 'fireball', caster: { ...caster, spellCooldowns: { fireball: 5_000 } }, target, random: random(0), now: 1_000,
    }).reason).toBe('cooldown')
    expect(castLegacySpell({
      classId: 'Wizard', spellId: 'fireball', caster: { ...caster, mp: 0 }, target, random: random(0), now: 1_000,
    }).reason).toBe('insufficient-mana')
    expect(castLegacySpell({
      classId: 'Wizard', spellId: 'fireball', caster, random: random(0), now: 1_000,
    }).reason).toBe('missing-target')
  })
})
