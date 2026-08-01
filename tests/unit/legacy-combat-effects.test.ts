import { describe, expect, it } from 'vitest'

import type { RandomSource } from '../../src/game-core/rng'
import {
  applyLegacyLifesteal,
  applyLegacyMobStatusEffect,
  applyLegacyStatusEffect,
  cleanupLegacyStatusEffects,
  consumeLegacyGlobalCooldown,
  getLegacyStatusEffectModifiers,
  isLegacyMobStunned,
  refreshLegacyNamedWard,
  resolveLegacyWeaponProc,
  rollLegacyNamedVenomDamage,
  tickLegacyMobStatusEffects,
  triggerLegacyNamedEnrage,
  type LegacyMobCombatant,
} from '../../src/game-core/systems/combat'

const random = (values: number[]): RandomSource => {
  let index = 0
  const next = () => values[Math.min(index++, values.length - 1)] ?? 0
  return {
    next,
    integer: (min, max) => min + Math.floor(next() * (max - min + 1)),
    chance: (probability) => next() < probability,
    pick: <T>(items: readonly T[]) => items[Math.floor(next() * items.length)],
  }
}

const mob = (mechanic: string | null = null): LegacyMobCombatant => ({
  name: '妖兽', baseName: '妖兽', level: 10, hp: 100, maxHp: 100, atk: 20, def: 10,
  elite: false, named: Boolean(mechanic), namedMechanic: mechanic ? { id: mechanic } : null,
  turnCount: 0, wardReady: false, enrageTriggered: false,
})

describe('legacy combat effects', () => {
  it('cleans, replaces and folds timed character status effects', () => {
    const effects = [
      { id: 'old', name: '旧效果', expiresAt: 99, atkBonus: 99 },
      { id: 'fury', name: '怒意', expiresAt: 200, atkBonus: 2, playerDamageMult: 1.1 },
    ]
    const cleaned = cleanupLegacyStatusEffects(effects, 100)
    expect(cleaned.expired.map((entry) => entry.id)).toEqual(['old'])
    const applied = applyLegacyStatusEffect(cleaned.active, { id: 'fury', name: '新怒意', expiresAt: 300, atkBonus: 4 }, 100)
    expect(applied).toHaveLength(1)
    expect(getLegacyStatusEffectModifiers(applied)).toMatchObject({ atkBonus: 4, playerDamageMult: 1 })
  })

  it('ticks active poison once per combat tick and removes expired effects', () => {
    let target = applyLegacyMobStatusEffect(mob(), { id: 'poison', name: '毒', kind: 'dot', dps: 7.8, expiresAt: 200 })
    target = applyLegacyMobStatusEffect(target, { id: 'stun', name: '晕', kind: 'stun', expiresAt: 90 })
    const result = tickLegacyMobStatusEffects(target, 100)
    expect(result.damage).toBe(7)
    expect(result.mob.hp).toBe(93)
    expect(result.expired.map((entry) => entry.id)).toEqual(['stun'])
    expect(isLegacyMobStunned(result.mob, 100)).toBe(false)
  })

  it('preserves the 800ms global cooldown boundary', () => {
    expect(consumeLegacyGlobalCooldown(0, 1_000)).toEqual({ consumed: true, readyAt: 1_800 })
    expect(consumeLegacyGlobalCooldown(1_800, 1_799)).toEqual({ consumed: false, readyAt: 1_800 })
  })

  it('resolves damage, poison and mana weapon procs without global state', () => {
    const player = { name: '修士', level: 10, hp: 50, maxHp: 100, mp: 10, maxMp: 100, atk: 20, def: 10 }
    const poisoned = resolveLegacyWeaponProc({
      player, mob: mob(), weaponBase: 'Rusty Dagger', random: random([0, 1]), playerDamageMultiplier: 2,
    })
    expect(poisoned.triggered).toBe(true)
    expect(poisoned.damage).toBeGreaterThan(0)
    expect(poisoned.poisonDamage).toBe(Math.floor(poisoned.damage * 0.5))

    const mana = resolveLegacyWeaponProc({ player, mob: mob(), weaponBase: 'Cracked Staff', random: random([0, 0]) })
    expect(mana.kind).toBe('mana')
    expect(mana.manaRestored).toBeGreaterThan(0)
  })

  it('applies runeword lifesteal with minimum one healing and maximum cap', () => {
    const player = { name: '修士', level: 1, hp: 99, maxHp: 100, atk: 1, def: 1 }
    const result = applyLegacyLifesteal(player, 2, 0.01)
    expect(result.healed).toBe(1)
    expect(result.player.hp).toBe(100)
  })

  it('keeps enrage, ward cadence and venom probability deterministic', () => {
    const enraged = triggerLegacyNamedEnrage({ ...mob('enrage'), hp: 40 })
    expect(enraged.triggered).toBe(true)
    expect(enraged.mob.atk).toBe(29)
    const ward = refreshLegacyNamedWard({ ...mob('ward'), turnCount: 3 })
    expect(ward.refreshed).toBe(true)
    expect(ward.mob.wardReady).toBe(true)
    expect(rollLegacyNamedVenomDamage(mob('venom'), random([0.34, 0.5]))).toBe(11)
    expect(rollLegacyNamedVenomDamage(mob('venom'), random([0.35]))).toBe(0)
  })
})
