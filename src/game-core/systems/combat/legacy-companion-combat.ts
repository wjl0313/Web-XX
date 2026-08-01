import { MERCENARY_TYPES, PETS, PHASE5 } from '../../data'
import type { RandomSource } from '../../rng'
import { getLegacyItemEffectiveStats } from '../equipment'
import {
  applyLegacyPartyHeal,
  getLegacyBestPartyHealTarget,
} from './legacy-party-combat'
import type { LegacyPartyUnit } from './legacy-party-combat'
import type { LegacyMobCombatant } from './types'

export const LEGACY_MERCENARY_UPKEEP_INTERVAL_MS = 180_000
export const LEGACY_MERCENARY_GEAR_SLOTS = ['weapon', 'offhand', 'chest', 'legs', 'feet', 'charm'] as const

export type LegacyMercenaryType = keyof typeof MERCENARY_TYPES
export type LegacyPetType = keyof typeof PETS
export type LegacyCompanionActionKind =
  | 'none'
  | 'cooldown'
  | 'missed'
  | 'damage'
  | 'debuff'
  | 'heal'
  | 'mana'
  | 'smite'

export interface LegacyMercenaryUpkeepResult {
  character: Record<string, any>
  cyclesDue: number
  cyclesPaid: number
  goldPaid: number
  dismissedMain: boolean
  dismissedGroup: number
}

export interface LegacyCompanionActionResult {
  character: Record<string, any>
  mob: LegacyMobCombatant
  party: LegacyPartyUnit[]
  actorId: string | null
  targetId: string | null
  kind: LegacyCompanionActionKind
  damage: number
  healed: number
  manaRestored: number
  atkDebuff: number
  defDebuff: number
  acted: boolean
  killedMob: boolean
}

export interface LegacyGroupMercenaryRoundResult {
  character: Record<string, any>
  mob: LegacyMobCombatant
  party: LegacyPartyUnit[]
  actions: LegacyCompanionActionResult[]
  killedMob: boolean
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function mercenaryDefinitions(): Record<string, (typeof MERCENARY_TYPES)[LegacyMercenaryType]> {
  return MERCENARY_TYPES as unknown as Record<string, (typeof MERCENARY_TYPES)[LegacyMercenaryType]>
}

function petDefinitions(): Record<string, (typeof PETS)[LegacyPetType]> {
  return PETS as unknown as Record<string, (typeof PETS)[LegacyPetType]>
}

function syncPlayerHp(character: Record<string, any>, party: readonly LegacyPartyUnit[]): void {
  const player = party.find((unit) => unit.isPlayer || unit.type === 'player')
  if (player) character.hp = Math.max(0, Math.min(Number(character.maxHp || player.maxHp), player.hp))
}

function emptyAction(
  character: Record<string, any>,
  mob: LegacyMobCombatant,
  party: readonly LegacyPartyUnit[],
  kind: LegacyCompanionActionKind = 'none',
  actorId: string | null = null,
): LegacyCompanionActionResult {
  return {
    character,
    mob,
    party: clone(party) as LegacyPartyUnit[],
    actorId,
    targetId: null,
    kind,
    damage: 0,
    healed: 0,
    manaRestored: 0,
    atkDebuff: 0,
    defDebuff: 0,
    acted: false,
    killedMob: mob.hp <= 0,
  }
}

export function getLegacyCompanionFactionPriceMultiplier(faction: number): number {
  const value = Number(faction) || 0
  if (value >= 200) return 0.78
  if (value >= 90) return 0.86
  if (value >= 30) return 0.94
  if (value >= -29) return 1
  if (value >= -89) return 1.12
  return 1.28
}

export function getLegacyMercenaryHireCost(
  mercenaryType: string,
  character: Record<string, any>,
): number {
  const mercenary = mercenaryDefinitions()[mercenaryType]
  if (!mercenary) return 0
  const level = Math.max(1, Number(character.level || 1))
  return Math.max(1, Math.floor(
    (mercenary.baseCost + Math.floor(level * mercenary.levelScale))
    * getLegacyCompanionFactionPriceMultiplier(Number(character.faction || 0)),
  ))
}

export function getLegacyMercenaryUpkeepCost(
  mercenaryType: string,
  character: Record<string, any>,
): number {
  const mercenary = mercenaryDefinitions()[mercenaryType]
  if (!mercenary) return 0
  const level = Math.max(1, Number(character.level || 1))
  return Math.max(1, Math.floor(
    (mercenary.upkeepBase + Math.floor(level * mercenary.upkeepScale))
    * getLegacyCompanionFactionPriceMultiplier(Number(character.faction || 0)),
  ))
}

export function getLegacyTotalMercenaryUpkeep(character: Record<string, any>): number {
  let total = 0
  const mainType = String(character.mercenary?.type || 'none')
  if (mercenaryDefinitions()[mainType]) total += getLegacyMercenaryUpkeepCost(mainType, character)
  for (const type of Array.isArray(character.groupMercs) ? character.groupMercs : []) {
    if (mercenaryDefinitions()[String(type)]) total += getLegacyMercenaryUpkeepCost(String(type), character)
  }
  return total
}

export function settleLegacyMercenaryUpkeep(
  sourceCharacter: Record<string, any>,
  now: number,
): LegacyMercenaryUpkeepResult {
  const character = clone(sourceCharacter)
  if (!character.mercenary || typeof character.mercenary !== 'object') {
    character.mercenary = { type: 'none', nextUpkeepAt: 0, actionReadyAt: 0 }
  }
  const mainType = String(character.mercenary.type || 'none')
  const hasMain = Boolean(mercenaryDefinitions()[mainType])
  const group = (Array.isArray(character.groupMercs) ? character.groupMercs : [])
    .map(String)
    .filter((type) => Boolean(mercenaryDefinitions()[type]))
  character.groupMercs = group
  if (!hasMain && !group.length) {
    character.mercenary.nextUpkeepAt = 0
    return { character, cyclesDue: 0, cyclesPaid: 0, goldPaid: 0, dismissedMain: false, dismissedGroup: 0 }
  }

  const timestamp = Math.max(0, Math.floor(Number(now) || 0))
  let nextDue = Number(character.mercenary.nextUpkeepAt || 0)
  if (!Number.isFinite(nextDue) || nextDue <= 0) {
    character.mercenary.nextUpkeepAt = timestamp + LEGACY_MERCENARY_UPKEEP_INTERVAL_MS
    return { character, cyclesDue: 0, cyclesPaid: 0, goldPaid: 0, dismissedMain: false, dismissedGroup: 0 }
  }
  if (timestamp < nextDue) {
    return { character, cyclesDue: 0, cyclesPaid: 0, goldPaid: 0, dismissedMain: false, dismissedGroup: 0 }
  }

  const cyclesDue = Math.floor((timestamp - nextDue) / LEGACY_MERCENARY_UPKEEP_INTERVAL_MS) + 1
  const perCycle = Math.max(1, getLegacyTotalMercenaryUpkeep(character))
  const cyclesPaid = Math.min(cyclesDue, Math.floor(Math.max(0, Number(character.gold || 0)) / perCycle))
  const goldPaid = perCycle * cyclesPaid
  if (cyclesPaid > 0) {
    character.gold = Math.max(0, Number(character.gold || 0)) - goldPaid
    character.mercenary.totalUpkeepPaid = Math.max(0, Number(character.mercenary.totalUpkeepPaid || 0)) + goldPaid
    character.mercenary.lastUpkeepPaidAt = timestamp
    nextDue += cyclesPaid * LEGACY_MERCENARY_UPKEEP_INTERVAL_MS
    character.mercenary.nextUpkeepAt = nextDue
  }

  let dismissedMain = false
  let dismissedGroup = 0
  if (cyclesPaid < cyclesDue) {
    if (hasMain) {
      dismissedMain = true
      character.mercenary.type = 'none'
      character.mercenary.customName = ''
      character.mercenary.actionReadyAt = 0
    }
    dismissedGroup = group.length
    if (group.length) character.groupMercs = []
    character.mercenary.nextUpkeepAt = 0
  }
  return { character, cyclesDue, cyclesPaid, goldPaid, dismissedMain, dismissedGroup }
}

export function getLegacyMercenaryGearStats(gear: Record<string, unknown> | null | undefined) {
  const totals = { atk: 0, def: 0, hp: 0, mp: 0 }
  for (const slot of LEGACY_MERCENARY_GEAR_SLOTS) {
    const stats = getLegacyItemEffectiveStats(gear?.[slot])
    if (!stats) continue
    totals.atk += Number(stats.atk || 0)
    totals.def += Number(stats.def || 0)
    totals.hp += Number(stats.hp || 0)
    totals.mp += Number(stats.mp || 0)
  }
  return totals
}

export function getLegacyMercenaryGearDamageMultiplier(
  gear: Record<string, unknown> | null | undefined,
): number {
  return 1 + getLegacyMercenaryGearStats(gear).atk * PHASE5.mercGearAtkDamageBonusPerPoint
}

export function resolveLegacyMainMercenarySupport(
  sourceCharacter: Record<string, any>,
  sourceMob: LegacyMobCombatant,
  sourceParty: readonly LegacyPartyUnit[],
  random: RandomSource,
  now: number,
): LegacyCompanionActionResult {
  const character = clone(sourceCharacter)
  const mob = clone(sourceMob)
  let party = clone(sourceParty) as LegacyPartyUnit[]
  const mercenaryType = String(character.mercenary?.type || 'none')
  const mercenary = mercenaryDefinitions()[mercenaryType]
  if (!mercenary || mob.hp <= 0) return emptyAction(character, mob, party)
  const actor = party.find((unit) => unit.unitId === 'merc-main')
  if (actor && actor.hp <= 0) return emptyAction(character, mob, party, 'none', 'merc-main')
  if (!character.mercenary || typeof character.mercenary !== 'object') character.mercenary = {}
  const timestamp = Math.max(0, Math.floor(Number(now) || 0))
  if (Number(character.mercenary.actionReadyAt || 0) > timestamp) {
    return emptyAction(character, mob, party, 'cooldown', 'merc-main')
  }
  character.mercenary.actionReadyAt = timestamp + Number(mercenary.supportCooldownMs || 2_200)
  if (random.next() > Number(mercenary.supportChance || 0.6)) {
    return emptyAction(character, mob, party, 'missed', 'merc-main')
  }

  const level = Math.max(1, Number(character.level || 1))
  const gearMultiplier = getLegacyMercenaryGearDamageMultiplier(character.mercenary.gear)
  const result = emptyAction(character, mob, party, 'damage', 'merc-main')
  result.acted = true
  const behavior = String(mercenary.behavior || 'damage')
  if (behavior === 'damage') {
    const anchored = Math.floor(Number(character.maxHp || 100) * 0.05)
    const legacy = Math.floor(level * 2.1 + Number(character.atk || 0) * 0.28 + random.next() * 8)
    result.damage = Math.max(3, Math.floor(Math.max(anchored, legacy) * gearMultiplier))
  } else if (behavior === 'debuff') {
    const anchored = Math.floor(Number(character.maxHp || 100) * 0.038)
    const legacy = Math.floor(level * 1.8 + Number(character.atk || 0) * 0.18 + random.next() * 6)
    result.kind = 'debuff'
    result.damage = Math.max(2, Math.floor(Math.max(anchored, legacy) * gearMultiplier))
    result.atkDebuff = Math.max(1, Math.floor(level / 26) + 1)
    result.defDebuff = Math.max(1, Math.floor(level / 30) + 1)
  } else if (behavior === 'heal') {
    const target = getLegacyBestPartyHealTarget(party, 0.92, true)
    if (target) {
      const amount = Math.max(6, Math.floor(target.maxHp * 0.07 + level * 1.1 + random.next() * 7))
      const applied = applyLegacyPartyHeal(party, target.unitId, amount)
      party = applied.units
      result.party = party
      result.kind = 'heal'
      result.targetId = target.unitId
      result.healed = applied.healed
      result.damage = 0
      syncPlayerHp(character, party)
      return result
    }
    result.kind = 'smite'
    const anchored = Math.floor(Number(character.maxHp || 100) * 0.025)
    const legacy = Math.floor(level * 0.9 + Number(character.mpRegen || 0) * 1.2 + random.next() * 3)
    result.damage = Math.max(2, Math.floor(Math.max(anchored, legacy) * gearMultiplier))
  } else if (behavior === 'mana') {
    const maximum = Math.max(0, Number(character.maxMp || 0))
    const need = maximum - Math.max(0, Number(character.mp || 0))
    if (need > Math.floor(maximum * 0.1)) {
      result.kind = 'mana'
      result.manaRestored = Math.min(need, Math.max(5, Math.floor(maximum * 0.07 + level + random.next() * 6)))
      character.mp = Math.min(maximum, Number(character.mp || 0) + result.manaRestored)
      result.damage = 0
      return result
    }
    result.kind = 'smite'
    const anchored = Math.floor(Number(character.maxHp || 100) * 0.025)
    const legacy = Math.floor(level * 0.85 + Number(character.mpRegen || 0) * 1.1 + random.next() * 3)
    result.damage = Math.max(2, Math.floor(Math.max(anchored, legacy) * gearMultiplier))
  }

  mob.hp = Math.max(0, mob.hp - result.damage)
  if (result.atkDebuff) mob.atk = Math.max(1, mob.atk - result.atkDebuff)
  if (result.defDebuff) mob.def = Math.max(0, mob.def - result.defDebuff)
  result.mob = mob
  result.killedMob = mob.hp <= 0
  return result
}

export function resolveLegacyGroupMercenarySupport(
  sourceCharacter: Record<string, any>,
  sourceMob: LegacyMobCombatant,
  sourceParty: readonly LegacyPartyUnit[],
  random: RandomSource,
): LegacyGroupMercenaryRoundResult {
  const character = clone(sourceCharacter)
  let mob = clone(sourceMob)
  let party = clone(sourceParty) as LegacyPartyUnit[]
  const actions: LegacyCompanionActionResult[] = []
  const types = (Array.isArray(character.groupMercs) ? character.groupMercs : [])
    .map(String)
    .filter((type) => Boolean(mercenaryDefinitions()[type]))
  const level = Math.max(1, Number(character.level || 1))

  for (let index = 0; index < types.length && mob.hp > 0; index += 1) {
    if (random.next() > 0.42) continue
    const actorId = `merc-${index}`
    const actor = party.find((unit) => unit.unitId === actorId)
    if (actor && actor.hp <= 0) continue
    const mercenary = mercenaryDefinitions()[types[index]]
    const gearMultiplier = getLegacyMercenaryGearDamageMultiplier(character.groupMercGear?.[index])
    const action = emptyAction(character, mob, party, 'damage', actorId)
    action.acted = true
    const behavior = String(mercenary.behavior || 'damage')

    if (behavior === 'damage') {
      action.damage = Math.max(3, Math.floor((level * 2.2 + Number(character.atk || 0) * 0.26 + random.next() * 8) * gearMultiplier))
    } else if (behavior === 'debuff') {
      action.kind = 'debuff'
      action.damage = Math.max(2, Math.floor((level * 1.7 + Number(character.atk || 0) * 0.18 + random.next() * 6) * gearMultiplier))
      action.atkDebuff = Math.max(1, Math.floor(level / 28) + 1)
      action.defDebuff = Math.max(1, Math.floor(level / 32) + 1)
    } else if (behavior === 'heal') {
      const target = getLegacyBestPartyHealTarget(party, 0.9, true)
      if (target) {
        const amount = Math.max(5, Math.floor(target.maxHp * 0.06 + level * 0.9 + random.next() * 6))
        const applied = applyLegacyPartyHeal(party, target.unitId, amount)
        party = applied.units
        action.kind = 'heal'
        action.targetId = target.unitId
        action.healed = applied.healed
        action.party = party
        syncPlayerHp(character, party)
        actions.push(action)
        continue
      }
      action.kind = 'smite'
      action.damage = Math.max(2, Math.floor(level * 1.6 + Number(character.mpRegen || 0) * 1.8 + random.next() * 6))
    } else if (behavior === 'mana') {
      const maximum = Math.max(0, Number(character.maxMp || 0))
      const need = maximum - Math.max(0, Number(character.mp || 0))
      if (need > Math.floor(maximum * 0.12)) {
        action.kind = 'mana'
        action.manaRestored = Math.min(need, Math.max(4, Math.floor(maximum * 0.06 + level * 0.85 + random.next() * 5)))
        character.mp = Math.min(maximum, Number(character.mp || 0) + action.manaRestored)
        actions.push(action)
        continue
      }
      action.kind = 'smite'
      action.damage = Math.max(2, Math.floor(level * 1.4 + Number(character.mpRegen || 0) * 1.6 + random.next() * 5))
    }

    mob.hp = Math.max(0, mob.hp - action.damage)
    if (action.atkDebuff) mob.atk = Math.max(1, mob.atk - action.atkDebuff)
    if (action.defDebuff) mob.def = Math.max(0, mob.def - action.defDebuff)
    action.mob = clone(mob)
    action.killedMob = mob.hp <= 0
    actions.push(action)
  }

  return { character, mob, party, actions, killedMob: mob.hp <= 0 }
}

export function getLegacyPetModifiers(character: Record<string, any>) {
  const type = String(character.pets?.active || 'none')
  const pet = petDefinitions()[type]
  const modifiers = (pet?.mod || {}) as Record<string, number>
  return {
    lootMult: Number(modifiers.lootMult || 1),
    goldMult: Number(modifiers.goldMult || 1),
    healMult: Number(modifiers.healMult || 1),
  }
}

export function resolveLegacyPetAction(
  sourceCharacter: Record<string, any>,
  sourceMob: LegacyMobCombatant,
  sourceParty: readonly LegacyPartyUnit[],
  random: RandomSource,
): LegacyCompanionActionResult {
  const character = clone(sourceCharacter)
  const mob = clone(sourceMob)
  let party = clone(sourceParty) as LegacyPartyUnit[]
  const petType = String(character.pets?.active || 'none')
  const pet = petDefinitions()[petType]
  if (!pet || mob.hp <= 0) return emptyAction(character, mob, party)
  const actorId = `pet-${petType}`
  const result = emptyAction(character, mob, party, 'none', actorId)

  if (pet.kind === 'support') {
    const target = getLegacyBestPartyHealTarget(party, 0.999, true)
    if (!target || random.next() >= PHASE5.petActionChance * 0.5) return result
    const amount = Math.max(1, Math.floor(target.maxHp * 0.04))
    const applied = applyLegacyPartyHeal(party, target.unitId, amount)
    party = applied.units
    result.party = party
    result.targetId = target.unitId
    result.kind = 'heal'
    result.healed = applied.healed
    result.acted = true
    syncPlayerHp(character, party)
    return result
  }

  if (pet.kind !== 'damage' && pet.kind !== 'utility') return result
  if (random.next() >= PHASE5.petActionChance) return result
  result.kind = 'damage'
  result.damage = Math.max(1, Math.floor(PHASE5.petBaseDamage + Number(character.level || 1) * PHASE5.petDamagePerLevel))
  result.acted = true
  mob.hp = Math.max(0, mob.hp - result.damage)
  result.mob = mob
  result.killedMob = mob.hp <= 0
  return result
}
