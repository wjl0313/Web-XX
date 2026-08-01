import { MERCENARY_TYPES, PHASE1, SPELLBOOK_BY_CLASS } from '../../data'
import type { RandomSource } from '../../rng'
import { legacyXpToNextLevel } from '../../save'
import { applyLegacyExperience, applyLegacyLevelStatGains } from '../progression'
import { resolveLegacyMobStrike } from './legacy-combat.formulas'
import type {
  LegacyMobCombatant,
  LegacyMobStrikeModifiers,
} from './types'

export const LEGACY_MAX_PARTY_SIZE = 6

export type LegacyPartyUnitType = 'player' | 'merc-main' | 'merc' | 'group' | 'lfg'

export interface LegacyPartyUnit {
  unitId: string
  type: LegacyPartyUnitType
  name: string
  level: number
  hp: number
  maxHp: number
  atk?: number
  def: number
  isPlayer?: boolean
  dex?: number
}

export interface LegacyPartyStrikeOptions extends LegacyMobStrikeModifiers {
  targetId?: string
  sneakAttack?: boolean
  sneakChance?: number
  allowTankRedirect?: boolean
  aoeChance?: number
  aoeScale?: number
  disableAoe?: boolean
}

export interface LegacyPartyStrikeResult {
  units: LegacyPartyUnit[]
  targetId: string | null
  splashTargetId: string | null
  damage: number
  primaryDamage: number
  splashDamage: number
  absorbed: number
  hit: boolean
  critical: boolean
  dodged: boolean
  killedPlayer: boolean
}

export interface BuildLegacyPartyOptions {
  character: Record<string, any>
  slots?: readonly (Record<string, any> | null)[]
  activeSlot?: number
}

export interface BuildLegacyPartyResult {
  units: LegacyPartyUnit[]
  lineup: string[]
  partyHp: { units: Record<string, { hp: number; maxHp: number }> }
  localGroupSlots: number[]
}

export interface LegacyPartyExperienceResult {
  leader: Record<string, any>
  localMembers: Array<{ slot: number; character: Record<string, any>; levelsGained: number }>
  totalXpPerMember: number
  leaderLevelsGained: number
}

export interface LegacyPartyAllyInput {
  unitId: string
  character: Record<string, any>
}

export interface LegacyPartyAllyAction {
  unitId: string
  kind: 'heal' | 'damage'
  spellId: string | null
  targetId: string
  damage: number
  healed: number
  atkDebuff: number
}

export interface LegacyPartyAllyRoundResult {
  mob: LegacyMobCombatant
  units: LegacyPartyUnit[]
  actions: LegacyPartyAllyAction[]
  killedMob: boolean
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function clampProbability(value: number): number {
  return Math.max(0, Math.min(1, Number(value) || 0))
}

function mercenaryDefinition(type: string): Record<string, any> | null {
  return (MERCENARY_TYPES as unknown as Record<string, Record<string, any>>)[type] || null
}

function normalizedVitals(character: Record<string, any>): { hp: number; maxHp: number } {
  const maxHp = Math.max(1, Math.floor(Number(character.maxHp || character.hp || 1)))
  return { maxHp, hp: Math.max(0, Math.min(maxHp, Math.floor(Number(character.hp ?? maxHp)))) }
}

function syncPool(
  pools: Record<string, { hp: number; maxHp: number }>,
  id: string,
  requestedMaxHp: number,
): { hp: number; maxHp: number } {
  const maximum = Math.max(1, Math.floor(Number(requestedMaxHp) || 1))
  const current = pools[id]
  if (!current) {
    pools[id] = { hp: maximum, maxHp: maximum }
    return pools[id]
  }
  const oldMaximum = Math.max(1, Math.floor(Number(current.maxHp) || maximum))
  const currentHp = Number.isFinite(Number(current.hp)) ? Number(current.hp) : oldMaximum
  const hp = oldMaximum === maximum
    ? currentHp
    : Math.round(Math.max(0, Math.min(1, currentHp / oldMaximum)) * maximum)
  pools[id] = { hp: Math.max(0, Math.min(maximum, Math.floor(hp))), maxHp: maximum }
  return pools[id]
}

function mercenaryMaxHp(character: Record<string, any>, type: string, offset: number): number {
  const base = Math.max(1, Number(character.maxHp || 100))
  const mercenary = mercenaryDefinition(type) || {}
  let multiplier = mercenary.behavior === 'heal' ? 0.74 : mercenary.behavior === 'debuff' ? 0.8 : 0.9
  const className = String(mercenary.class || '').toLowerCase()
  if (className.includes('warrior') || className.includes('paladin') || className.includes('death')) multiplier += 0.08
  return Math.max(20, Math.floor(base * multiplier + Number(character.level || 1) * (3 + offset)))
}

export function buildLegacyPartyCombatants(options: BuildLegacyPartyOptions): BuildLegacyPartyResult {
  const character = options.character
  const slots = options.slots || []
  const activeSlot = Math.floor(Number(options.activeSlot ?? -1))
  const sameHardcore = (candidate: Record<string, any>) => Boolean(candidate.hardcore) === Boolean(character.hardcore)
  const localGroupSlots = (Array.isArray(character.group) ? character.group : [])
    .map((slot: unknown) => Math.floor(Number(slot)))
    .filter((slot: number) => slot >= 0 && slot < slots.length && slot !== activeSlot && slots[slot] && sameHardcore(slots[slot]!))
  const groupMercs = (Array.isArray(character.groupMercs) ? character.groupMercs : [])
    .map(String)
    .filter((type: string) => Boolean(mercenaryDefinition(type)))
  const lfgParty = (Array.isArray(character.lfgParty) ? character.lfgParty : [])
    .filter((hero: unknown): hero is Record<string, any> => Boolean(hero && typeof hero === 'object' && sameHardcore(hero as Record<string, any>)))
  const available = ['player']
  const mainType = String(character.mercenary?.type || 'none')
  if (mercenaryDefinition(mainType)) available.push('merc-main')
  groupMercs.forEach((_, index) => available.push(`merc-${index}`))
  localGroupSlots.forEach((slot) => available.push(`group-${slot}`))
  lfgParty.forEach((_, index) => available.push(`lfg-${index}`))
  const lineup = normalizeLegacyPartyLineup(available, Array.isArray(character.partyLineup) ? character.partyLineup : [])
  const allowed = new Set(lineup)
  const sourcePools = isRecord(character.partyHp?.units) ? character.partyHp.units : {}
  const pools = clone(sourcePools) as Record<string, { hp: number; maxHp: number }>
  const units: LegacyPartyUnit[] = []

  const playerVitals = normalizedVitals(character)
  units.push({
    unitId: 'player',
    type: 'player',
    isPlayer: true,
    name: String(character.name || 'You'),
    level: Math.max(1, Number(character.level || 1)),
    hp: playerVitals.hp,
    maxHp: playerVitals.maxHp,
    atk: Math.max(0, Number(character.atk || 0)),
    def: Math.max(0, Number(character.def || 0)),
    dex: Number(character.abilities?.dex || 10),
  })
  if (allowed.has('merc-main')) {
    const mercenary = mercenaryDefinition(mainType)!
    const pool = syncPool(pools, 'merc-main', mercenaryMaxHp(character, mainType, 0))
    units.push({
      unitId: 'merc-main',
      type: 'merc-main',
      name: String(character.mercenary?.customName || '').trim() || String(mercenary.name || 'Mercenary'),
      level: Math.max(1, Number(character.level || 1)),
      hp: pool.hp,
      maxHp: pool.maxHp,
      def: Math.max(1, Math.floor(Number(character.def || 1) * 0.72 + Number(character.level || 1) * 0.8)),
    })
  }
  groupMercs.forEach((type, index) => {
    const id = `merc-${index}`
    if (!allowed.has(id)) return
    const mercenary = mercenaryDefinition(type)!
    const pool = syncPool(pools, id, mercenaryMaxHp(character, type, index + 1))
    units.push({
      unitId: id,
      type: 'merc',
      name: String(character.groupMercNames?.[index] || '').trim() || String(mercenary.name || 'Mercenary'),
      level: Math.max(1, Number(character.level || 1)),
      hp: pool.hp,
      maxHp: pool.maxHp,
      def: Math.max(1, Math.floor(Number(character.def || 1) * 0.66 + Number(character.level || 1) * 0.7)),
    })
  })
  localGroupSlots.forEach((slot) => {
    const id = `group-${slot}`
    const member = slots[slot]
    if (!allowed.has(id) || !member) return
    const vitals = normalizedVitals(member)
    units.push({
      unitId: id,
      type: 'group',
      name: String(member.name || 'Group Member'),
      level: Math.max(1, Number(member.level || 1)),
      hp: vitals.hp,
      maxHp: vitals.maxHp,
      atk: Math.max(0, Number(member.atk || 0)),
      def: Math.max(0, Number(member.def || 0)),
      dex: Number(member.abilities?.dex || 10),
    })
  })
  lfgParty.forEach((hero, index) => {
    const id = `lfg-${index}`
    if (!allowed.has(id)) return
    const maximum = Math.max(20, Math.floor(Number(hero.maxHp || hero.hpMax || Number(character.maxHp || 100) * 0.86)))
    const pool = syncPool(pools, id, maximum)
    units.push({
      unitId: id,
      type: 'lfg',
      name: String(hero.name || 'LFG Hero'),
      level: Math.max(1, Number(hero.level || character.level || 1)),
      hp: pool.hp,
      maxHp: pool.maxHp,
      atk: Math.max(0, Number(hero.atk || 0)),
      def: Math.max(1, Number(hero.def || Math.floor(Number(character.def || 1) * 0.75))),
      dex: Number(hero.abilities?.dex || 10),
    })
  })

  const activePools = new Set(units.filter((unit) => ['merc-main', 'merc', 'lfg'].includes(unit.type)).map((unit) => unit.unitId))
  for (const id of Object.keys(pools)) if (!activePools.has(id)) delete pools[id]
  const byId = new Map(units.map((unit) => [unit.unitId, unit]))
  return {
    units: lineup.map((id) => byId.get(id)).filter((unit): unit is LegacyPartyUnit => Boolean(unit)),
    lineup,
    partyHp: { units: pools },
    localGroupSlots: localGroupSlots.filter((slot) => allowed.has(`group-${slot}`)),
  }
}

export function applyLegacySharedPartyExperience(character: Record<string, any>, totalXp: number): { character: Record<string, any>; levelsGained: number } {
  const output = clone(character)
  if (!isRecord(output.stats)) output.stats = {}
  output.stats.xpEarned = Math.max(0, Math.floor(Number(output.stats.xpEarned || 0))) + totalXp
  output.xp = Math.max(0, Math.floor(Number(output.xp || 0))) + totalXp
  output.level = Math.max(1, Math.floor(Number(output.level || 1)))
  output.xpNext = Math.max(1, Math.floor(Number(output.xpNext || legacyXpToNextLevel(output.level))))
  let levelsGained = 0
  while (output.xp >= output.xpNext && levelsGained <= 200) {
    output.xp -= output.xpNext
    output.level += 1
    output.xpNext = legacyXpToNextLevel(output.level)
    applyLegacyLevelStatGains(output, output.level)
    levelsGained += 1
  }
  return { character: output, levelsGained }
}

export function settleLegacyPartyExperience(
  sourceLeader: Record<string, any>,
  localMembers: readonly { slot: number; character: Record<string, any> }[],
  rawXp: number,
  totalPartySize: number,
  xpMultiplier = 1,
): LegacyPartyExperienceResult {
  const size = Math.max(1, Math.min(LEGACY_MAX_PARTY_SIZE, Math.floor(Number(totalPartySize) || 1)))
  const leader = applyLegacyExperience(sourceLeader, rawXp, {
    xpMultiplier,
    groupSize: size,
    groupShareSize: size,
  })
  const members = localMembers.map(({ slot, character }) => {
    const applied = applyLegacySharedPartyExperience(character, leader.totalXp)
    return { slot, character: applied.character, levelsGained: applied.levelsGained }
  })
  return {
    leader: leader.character,
    localMembers: members,
    totalXpPerMember: leader.totalXp,
    leaderLevelsGained: leader.levelsGained,
  }
}

function knownAllySpells(character: Record<string, any>): readonly Record<string, any>[] {
  const book = (SPELLBOOK_BY_CLASS as unknown as Record<string, readonly Record<string, any>[]>)[String(character.cls || character.class || '')] || []
  const known = new Set(Array.isArray(character.knownSpells) ? character.knownSpells.map(String) : [])
  const level = Math.max(1, Number(character.level || 1))
  const selected = book.filter((spell) => known.has(String(spell.id)) && Number(spell.levelReq || 1) <= level)
  return selected.length ? selected : book.filter((spell) => Number(spell.levelReq || 1) <= level)
}

export function resolveLegacyPartyAllyActions(
  sourceMob: LegacyMobCombatant,
  sourceUnits: readonly LegacyPartyUnit[],
  allies: readonly LegacyPartyAllyInput[],
  random: RandomSource,
): LegacyPartyAllyRoundResult {
  const mob = clone(sourceMob)
  let units = clone(sourceUnits) as LegacyPartyUnit[]
  const actions: LegacyPartyAllyAction[] = []
  const byId = new Map(allies.map((ally) => [ally.unitId, ally.character]))

  for (const unit of units) {
    if (mob.hp <= 0 || (unit.type !== 'group' && unit.type !== 'lfg')) continue
    const character = byId.get(unit.unitId)
    if (!character || unit.hp <= 0 || random.next() > 0.7) continue
    const level = Math.max(1, Number(character.level || 1))
    const attack = Math.max(0, Number(character.atk || 0))
    const spells = knownAllySpells(character)
    const damageSpells = spells.filter((spell) => spell.kind === 'damage' || spell.kind === 'damage_weaken')
    const healSpells = spells.filter((spell) => spell.kind === 'heal')
    const healTarget = healSpells.length ? getLegacyBestPartyHealTarget(units, 0.55, true) : null
    if (healTarget) {
      const spell = healSpells[Math.floor(random.next() * healSpells.length)]
      const amount = Math.max(4, Math.floor(healTarget.maxHp * Number(spell.healPct || 0.25) * 0.8 + level))
      const applied = applyLegacyPartyHeal(units, healTarget.unitId, amount)
      units = applied.units
      if (applied.healed > 0) {
        actions.push({
          unitId: unit.unitId,
          kind: 'heal',
          spellId: String(spell.id),
          targetId: healTarget.unitId,
          damage: 0,
          healed: applied.healed,
          atkDebuff: 0,
        })
        continue
      }
    }

    let damage: number
    let spellId: string | null = null
    let atkDebuff = 0
    if (damageSpells.length) {
      const spell = damageSpells[Math.floor(random.next() * damageSpells.length)]
      damage = Math.max(2, Math.floor((level * 1.05 + attack * 0.18 + random.next() * Number(spell.variance || 4)) * Number(spell.power || 1)))
      spellId = String(spell.id)
      if (spell.kind === 'damage_weaken' && spell.weaken) {
        atkDebuff = Math.max(1, Math.floor(Number(spell.weaken) / 2))
      }
    } else {
      damage = Math.max(2, Math.floor(level * 1.2 + attack * 0.22 + random.next() * 5))
    }
    mob.hp = Math.max(0, mob.hp - damage)
    if (atkDebuff) mob.atk = Math.max(1, mob.atk - atkDebuff)
    actions.push({
      unitId: unit.unitId,
      kind: 'damage',
      spellId,
      targetId: mob.encounterId || mob.name,
      damage,
      healed: 0,
      atkDebuff,
    })
  }
  return { mob, units, actions, killedMob: mob.hp <= 0 }
}

export function normalizeLegacyPartyLineup(
  availableUnitIds: readonly string[],
  savedLineup: readonly string[] = [],
): string[] {
  const available = Array.from(new Set(availableUnitIds.map(String))).slice(0, LEGACY_MAX_PARTY_SIZE)
  const allowed = new Set(available)
  const ordered: string[] = []
  for (const id of savedLineup.map(String)) {
    if (allowed.has(id) && !ordered.includes(id)) ordered.push(id)
  }
  for (const id of available) {
    if (!ordered.includes(id)) ordered.push(id)
  }
  return ordered.slice(0, LEGACY_MAX_PARTY_SIZE)
}

export function getLegacyPartyFrontCount(size: number): number {
  return Math.max(1, Math.ceil(Math.max(0, Math.min(LEGACY_MAX_PARTY_SIZE, Math.floor(size))) / 2))
}

export function isLegacyPartyUnitFrontLine(
  lineup: readonly string[],
  unitId: string,
): boolean {
  const index = lineup.indexOf(String(unitId))
  return index >= 0 && index < getLegacyPartyFrontCount(lineup.length)
}

export function orderLegacyPartyUnits(
  units: readonly LegacyPartyUnit[],
  savedLineup: readonly string[] = [],
): LegacyPartyUnit[] {
  const byId = new Map(units.map((unit) => [unit.unitId, unit]))
  const lineup = normalizeLegacyPartyLineup(units.map((unit) => unit.unitId), savedLineup)
  return lineup.map((id) => clone(byId.get(id)!)).filter(Boolean)
}

export function getLegacyBestPartyHealTarget(
  units: readonly LegacyPartyUnit[],
  thresholdPercent = 0.999,
  includeDowned = true,
): LegacyPartyUnit | null {
  const candidates = units
    .filter((unit) => unit.maxHp > 0 && unit.hp < unit.maxHp && (includeDowned || unit.hp > 0))
    .sort((left, right) => (left.hp / left.maxHp) - (right.hp / right.maxHp))
  const target = candidates[0]
  if (!target || (target.hp / target.maxHp) > clampProbability(thresholdPercent)) return null
  return clone(target)
}

export function applyLegacyPartyHeal(
  units: readonly LegacyPartyUnit[],
  unitId: string,
  amount: number,
): { units: LegacyPartyUnit[]; healed: number } {
  const output = clone(units) as LegacyPartyUnit[]
  const target = output.find((unit) => unit.unitId === unitId)
  if (!target) return { units: output, healed: 0 }
  const before = Math.max(0, Math.floor(Number(target.hp) || 0))
  const maximum = Math.max(1, Math.floor(Number(target.maxHp) || 1))
  target.hp = Math.min(maximum, before + Math.max(0, Math.floor(Number(amount) || 0)))
  return { units: output, healed: target.hp - before }
}

export function applyLegacyPartyDamage(
  units: readonly LegacyPartyUnit[],
  unitId: string,
  amount: number,
): { units: LegacyPartyUnit[]; damage: number } {
  const output = clone(units) as LegacyPartyUnit[]
  const target = output.find((unit) => unit.unitId === unitId)
  if (!target) return { units: output, damage: 0 }
  const before = Math.max(0, Math.floor(Number(target.hp) || 0))
  target.hp = Math.max(0, before - Math.max(0, Math.floor(Number(amount) || 0)))
  return { units: output, damage: before - target.hp }
}

export function pickLegacyEnemyPartyTarget(
  units: readonly LegacyPartyUnit[],
  random: RandomSource,
  options: Pick<LegacyPartyStrikeOptions, 'assist' | 'sneakAttack' | 'sneakChance'> = {},
): LegacyPartyUnit | null {
  const ordered = units.slice(0, LEGACY_MAX_PARTY_SIZE)
  const live = ordered.filter((unit) => unit.hp > 0)
  if (!live.length) return null
  const frontCount = getLegacyPartyFrontCount(ordered.length)
  const front = live.filter((unit) => ordered.indexOf(unit) < frontCount)
  const back = live.filter((unit) => ordered.indexOf(unit) >= frontCount)
  const sneakChance = Number.isFinite(Number(options.sneakChance))
    ? clampProbability(Number(options.sneakChance))
    : options.assist ? 0.22 : 0.16
  const sneak = options.sneakAttack === true || (
    options.sneakAttack !== false && random.next() < sneakChance
  )
  const preferred = sneak && back.length ? back : (front.length ? front : back)
  const weighted: LegacyPartyUnit[] = []
  for (const unit of preferred) {
    let weight = unit.isPlayer || unit.type === 'player' ? 1.35 : 1
    if (unit.type === 'merc-main' || unit.type === 'merc') weight *= 1.1
    for (let index = 0; index < Math.max(1, Math.round(weight * 5)); index += 1) {
      weighted.push(unit)
    }
  }
  return clone(weighted[Math.floor(random.next() * weighted.length)] || preferred[0] || live[0])
}

export function resolveLegacyMercTankRedirect(
  incomingDamage: number,
  units: readonly LegacyPartyUnit[],
  random: RandomSource,
  allowRedirect = true,
): { damage: number; absorbed: number } {
  const damage = Math.max(0, Math.floor(Number(incomingDamage) || 0))
  if (!allowRedirect || damage <= 0) return { damage, absorbed: 0 }
  const mainMerc = units.find((unit) => unit.unitId === 'merc-main')
  if (!mainMerc || mainMerc.hp <= 0 || !isLegacyPartyUnitFrontLine(units.map((unit) => unit.unitId), mainMerc.unitId)) {
    return { damage, absorbed: 0 }
  }
  if (random.next() >= PHASE1.mercTankAbsorbChance) return { damage, absorbed: 0 }
  const span = PHASE1.mercTankAbsorbMax - PHASE1.mercTankAbsorbMin
  const absorbed = Math.max(1, Math.floor(damage * (PHASE1.mercTankAbsorbMin + random.next() * span)))
  return { damage: Math.max(0, damage - absorbed), absorbed }
}

export function resolveLegacyPartyMobStrike(
  attacker: LegacyMobCombatant,
  sourceUnits: readonly LegacyPartyUnit[],
  random: RandomSource,
  options: LegacyPartyStrikeOptions = {},
): LegacyPartyStrikeResult {
  let units = clone(sourceUnits).slice(0, LEGACY_MAX_PARTY_SIZE)
  const requested = options.targetId
    ? units.find((unit) => unit.unitId === options.targetId && unit.hp > 0) || null
    : null
  const target = requested || pickLegacyEnemyPartyTarget(units, random, options)
  if (!target) {
    return {
      units,
      targetId: null,
      splashTargetId: null,
      damage: 0,
      primaryDamage: 0,
      splashDamage: 0,
      absorbed: 0,
      hit: false,
      critical: false,
      dodged: false,
      killedPlayer: false,
    }
  }

  const targetIsPlayer = target.isPlayer || target.type === 'player'
  const strike = resolveLegacyMobStrike(attacker, { ...target, atk: Number(target.atk || 0) }, random, {
    playerDodgeChance: targetIsPlayer
      ? options.playerDodgeChance
      : Math.min(0.14, Math.max(0, (Number(target.level || 1) - 1) * 0.001) + Math.max(0, (Number(target.dex || 10) - 10) * 0.003)),
    mobDamageMultiplier: options.mobDamageMultiplier,
    mitigation: targetIsPlayer ? options.mitigation : 0,
    attackScale: options.attackScale,
    maxHpCapPercent: options.maxHpCapPercent,
    assist: options.assist,
  })
  if (!strike.hit) {
    return {
      units,
      targetId: target.unitId,
      splashTargetId: null,
      damage: 0,
      primaryDamage: 0,
      splashDamage: 0,
      absorbed: 0,
      hit: false,
      critical: false,
      dodged: strike.dodged,
      killedPlayer: false,
    }
  }

  const redirect = targetIsPlayer
    ? resolveLegacyMercTankRedirect(strike.damage, units, random, options.allowTankRedirect !== false)
    : { damage: strike.damage, absorbed: 0 }
  const primary = applyLegacyPartyDamage(units, target.unitId, redirect.damage)
  units = primary.units

  let splashDamage = 0
  let splashTargetId: string | null = null
  if (!options.disableAoe) {
    const configuredChance = Number(options.aoeChance)
    const chance = Number.isFinite(configuredChance)
      ? clampProbability(configuredChance)
      : attacker.boss ? 0.22 : (attacker.elite || attacker.named) ? 0.12 : options.assist ? 0.08 : 0.04
    if (random.next() < chance) {
      const live = units.filter((unit) => unit.hp > 0 && unit.unitId !== target.unitId)
      const frontCount = getLegacyPartyFrontCount(units.length)
      const back = live.filter((unit) => units.indexOf(unit) >= frontCount)
      const pool = back.length ? back : live
      if (pool.length) {
        const splashTarget = pool[Math.floor(random.next() * pool.length)] || pool[0]
        const splash = Math.max(1, Math.floor(primary.damage * Number(options.aoeScale || 0.32)))
        const applied = applyLegacyPartyDamage(units, splashTarget.unitId, splash)
        units = applied.units
        splashDamage = applied.damage
        splashTargetId = splashTarget.unitId
      }
    }
  }

  const player = units.find((unit) => unit.isPlayer || unit.type === 'player')
  return {
    units,
    targetId: target.unitId,
    splashTargetId,
    damage: primary.damage + splashDamage,
    primaryDamage: primary.damage,
    splashDamage,
    absorbed: redirect.absorbed,
    hit: true,
    critical: strike.critical,
    dodged: false,
    killedPlayer: Boolean(player && player.hp <= 0),
  }
}

export function splitLegacyPartyGold(
  gold: number,
  localGroupMemberIds: readonly string[],
  enabled: boolean,
): { leader: number; members: Record<string, number> } {
  const total = Math.max(0, Math.floor(Number(gold) || 0))
  const members = Array.from(new Set(localGroupMemberIds.map(String)))
  if (!enabled || !members.length) return { leader: total, members: {} }
  const share = Math.floor(total / (members.length + 1))
  return {
    leader: total - share * members.length,
    members: Object.fromEntries(members.map((id) => [id, share])),
  }
}
