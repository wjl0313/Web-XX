import { BOSS_BY_ZONE, NAMED_MECHANICS, PHASE4, ZONES } from '../../data'
import type { RandomSource } from '../../rng'
import type { LegacyCharacterSave } from '../../save'
import { rollLegacyItemVariant } from '../equipment'
import type { LegacyMobCombatant } from './types'

export interface LegacyBossDefinition {
  name: string
  mob: string
  mechanic: string
}

export type LegacyBossEncounterFailure =
  | 'active-encounter'
  | 'dungeon-active'
  | 'no-boss'
  | 'cooldown'

export interface CreateLegacyBossEncounterInput {
  zoneIndex: number
  playerLevel: number
  bossCooldowns?: Record<string, unknown> | null
  now?: number
  hasActiveEncounter?: boolean
  dungeonActive?: boolean
}

export interface LegacyBossEncounterResult {
  spawned: boolean
  failure: LegacyBossEncounterFailure | null
  boss: LegacyBossDefinition | null
  mob: LegacyMobCombatant | null
  readyAt: number
}

export interface LegacyBossVictoryBonus {
  character: LegacyCharacterSave
  loot: unknown[]
  cooldownUntil: number | null
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function clampZone(value: unknown): number {
  return Math.max(0, Math.min(ZONES.length - 1, Math.floor(Number(value) || 0)))
}

export function getLegacyBossForZone(zoneIndex: number): LegacyBossDefinition | null {
  const index = clampZone(zoneIndex)
  const configured = (BOSS_BY_ZONE as unknown as Record<string, LegacyBossDefinition>)[String(index)]
  if (configured) return clone(configured)
  const zone = ZONES[index]
  if (!zone?.mobs?.length) return null
  return { name: `Champion of ${zone.name}`, mob: zone.mobs[0], mechanic: 'ward' }
}

export function getLegacyBossReadyAt(
  zoneIndex: number,
  bossCooldowns: Record<string, unknown> | null | undefined,
): number {
  return Math.max(0, Math.floor(Number(bossCooldowns?.[String(clampZone(zoneIndex))] || 0)))
}

export function createLegacyBossEncounter(
  input: CreateLegacyBossEncounterInput,
): LegacyBossEncounterResult {
  const zoneIndex = clampZone(input.zoneIndex)
  const boss = getLegacyBossForZone(zoneIndex)
  const readyAt = getLegacyBossReadyAt(zoneIndex, input.bossCooldowns)
  const failed = (failure: LegacyBossEncounterFailure): LegacyBossEncounterResult => ({
    spawned: false,
    failure,
    boss,
    mob: null,
    readyAt,
  })
  if (input.hasActiveEncounter) return failed('active-encounter')
  if (input.dungeonActive) return failed('dungeon-active')
  if (!boss) return failed('no-boss')
  if (Math.floor(input.now ?? Date.now()) < readyAt) return failed('cooldown')

  const level = Math.max(1, Math.floor(Number(input.playerLevel) || 1) + 2)
  const hp = Math.floor((60 + level * 25) * PHASE4.bossHpMult)
  const mechanic = NAMED_MECHANICS.find((entry) => entry.id === boss.mechanic) || NAMED_MECHANICS[0]
  return {
    spawned: true,
    failure: null,
    boss,
    readyAt,
    mob: {
      name: `[Boss] ${boss.name}`,
      level,
      hp,
      maxHp: hp,
      atk: Math.floor((5 + level * 2) * PHASE4.bossAtkMult),
      def: Math.floor((2 + level) * PHASE4.bossDefMult),
      baseName: boss.mob,
      elite: true,
      named: true,
      boss: true,
      namedMechanic: mechanic,
      enrageTriggered: false,
      wardReady: false,
      turnCount: 0,
    },
  }
}

export function resolveLegacyBossVictoryBonus(
  source: LegacyCharacterSave,
  defeated: LegacyMobCombatant,
  random: RandomSource,
  now = Date.now(),
): LegacyBossVictoryBonus {
  const character = clone(source) as Record<string, any>
  if (!defeated.boss) return { character, loot: [], cooldownUntil: null }
  const zoneIndex = clampZone(character.zone)
  const zone = ZONES[zoneIndex]
  const cooldownUntil = Math.floor(now) + PHASE4.bossCooldownMs
  if (!character.bossCooldowns || typeof character.bossCooldowns !== 'object' || Array.isArray(character.bossCooldowns)) {
    character.bossCooldowns = {}
  }
  character.bossCooldowns[String(zoneIndex)] = cooldownUntil
  if (!Array.isArray(character.inventory)) character.inventory = []

  const loot: unknown[] = []
  const itemLevel = Math.max(1, defeated.level + 1)
  if (random.next() < PHASE4.bossLegendaryChance) {
    loot.push(rollLegacyItemVariant(zone.rare, 'loot_named', {
      random,
      forceLevel: itemLevel,
      forceRarity: 'Legendary',
    }, zoneIndex))
  }
  loot.push(rollLegacyItemVariant(zone.rare, 'loot_named', {
    random,
    forceLevel: itemLevel,
  }, zoneIndex))
  character.inventory.push(...loot)
  return { character, loot, cooldownUntil }
}
