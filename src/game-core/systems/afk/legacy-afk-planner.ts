import { ZONES } from '../../data'
import type { LegacyCharacterSave, LegacySlots } from '../../save'

export type LegacyAfkGoalId =
  | 'balanced'
  | 'level'
  | 'contract'
  | 'dungeon'
  | 'gold'
  | 'farm_until_gold'
  | 'level_alts_to'
  | 'farm_zone'

export interface LegacyAfkGoalPlan {
  character: LegacyCharacterSave
  goal: LegacyAfkGoalId
  zone: number
  actions: string[]
  smartGoalComplete: boolean
  nextAltSlot: number | null
  requiresDungeonSimulation: boolean
}

export interface LegacyAfkGoalPlanOptions {
  slots?: LegacySlots
  activeSlot?: number
}

const GOLD_LOOT_FILTER = {
  autoSellJunk: true,
  autoSellNormalGear: true,
  autoSellBlueMagicGear: true,
  autoSellRareGear: false,
  autoSellEpicGear: false,
  autoSellLegendaryGear: false,
  autoSellMythicGear: false,
  autoSellRunewordGear: false,
  protectRarePlus: true,
  autoEquipEmptySlots: false,
  autoEquipUpgradedEquipment: false,
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function clampZone(index: unknown): number {
  return Math.max(0, Math.min(ZONES.length - 1, Math.floor(Number(index) || 0)))
}

export function getLegacyAfkGoalId(character: LegacyCharacterSave): LegacyAfkGoalId {
  const goal = String(character.afkGoal || '')
  return [
    'balanced',
    'level',
    'contract',
    'dungeon',
    'gold',
    'farm_until_gold',
    'level_alts_to',
    'farm_zone',
  ].includes(goal)
    ? goal as LegacyAfkGoalId
    : 'balanced'
}

export function isLegacyAfkZoneUnlocked(character: LegacyCharacterSave, zoneIndex: number): boolean {
  const zone = ZONES[zoneIndex]
  return Boolean(zone && Math.max(1, Number(character.level || 1)) >= Math.max(1, Number(zone.minLvl || 1)))
}

export function getHighestUnlockedLegacyAfkZoneIndex(character: LegacyCharacterSave): number {
  let bestIndex = clampZone(character.zone)
  let bestScore = Number.NEGATIVE_INFINITY
  ZONES.forEach((zone, index) => {
    if (!isLegacyAfkZoneUnlocked(character, index)) return
    const score = Number(zone.minLvl || 1) * 100_000 + Number(zone.maxLvl || 1) * 100 + index
    if (score > bestScore) {
      bestScore = score
      bestIndex = index
    }
  })
  return bestIndex
}

export function getBestGoldLegacyAfkZoneIndex(character: LegacyCharacterSave): number {
  let bestIndex = getHighestUnlockedLegacyAfkZoneIndex(character)
  let bestScore = Number.NEGATIVE_INFINITY
  ZONES.forEach((zone, index) => {
    if (!isLegacyAfkZoneUnlocked(character, index)) return
    const score = Number(zone.goldMult || 1) * 1_000_000
      + Number(zone.minLvl || 1) * 1_000
      + Number(zone.maxLvl || 1) * 10
      + index
    if (score > bestScore) {
      bestScore = score
      bestIndex = index
    }
  })
  return bestIndex
}

export function getBalancedLegacyAfkZoneIndex(character: LegacyCharacterSave): number {
  const level = Math.max(1, Number(character.level || 1))
  let bestIndex = getHighestUnlockedLegacyAfkZoneIndex(character)
  let bestScore = Number.NEGATIVE_INFINITY
  ZONES.forEach((zone, index) => {
    if (!isLegacyAfkZoneUnlocked(character, index)) return
    const minLevel = Number(zone.minLvl || 1)
    const maxLevel = Number(zone.maxLvl || minLevel)
    const insideBand = level >= minLevel && level <= maxLevel
    const slightlyOver = level > maxLevel && level <= maxLevel + 4
    const score = (insideBand ? 100_000_000 : slightlyOver ? 50_000_000 : 0)
      + minLevel * 100_000
      + Number(zone.xpMult || 1) * 1_000
      + maxLevel
      + index / 1_000
    if (score > bestScore) {
      bestScore = score
      bestIndex = index
    }
  })
  return bestIndex
}

export function getLegacyAfkGoalTarget(
  character: LegacyCharacterSave,
  goal: LegacyAfkGoalId,
): number {
  const targets = character.afkGoalTargets && typeof character.afkGoalTargets === 'object'
    ? character.afkGoalTargets as Record<string, unknown>
    : {}
  const raw = Number(targets[goal])
  if (goal === 'farm_zone') return Number.isFinite(raw) && raw >= 0 ? clampZone(raw) : clampZone(character.zone)
  if (goal === 'farm_until_gold') return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 100_000
  if (goal === 'level_alts_to') return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 20
  return 0
}

function getPinnedContract(character: Record<string, any>): Record<string, any> | null {
  const board = Array.isArray(character.eliteContracts) ? character.eliteContracts : []
  const index = Math.max(0, Math.min(Math.max(0, board.length - 1), Math.floor(Number(character.afkPinnedContractIdx || 0))))
  return board[index] || character.eliteContract || null
}

function findNextAltBelowLevel(
  slots: LegacySlots | undefined,
  activeSlot: number | undefined,
  targetLevel: number,
): number | null {
  if (!slots) return null
  for (let index = 0; index < slots.length; index += 1) {
    if (index === activeSlot) continue
    const character = slots[index]
    if (character && Number(character.level || 0) < targetLevel) return index
  }
  return null
}

export function planLegacyAfkGoal(
  source: LegacyCharacterSave,
  options: LegacyAfkGoalPlanOptions = {},
): LegacyAfkGoalPlan {
  const character = clone(source) as Record<string, any>
  const goal = getLegacyAfkGoalId(character)
  const actions: string[] = []
  let zone = clampZone(character.zone)
  let smartGoalComplete = false
  let nextAltSlot: number | null = null

  if (goal === 'balanced') zone = getBalancedLegacyAfkZoneIndex(character)
  if (goal === 'level' || goal === 'level_alts_to') zone = getHighestUnlockedLegacyAfkZoneIndex(character)
  if (goal === 'gold' || goal === 'farm_until_gold') zone = getBestGoldLegacyAfkZoneIndex(character)
  if (goal === 'farm_zone') {
    const targetZone = getLegacyAfkGoalTarget(character, goal)
    zone = isLegacyAfkZoneUnlocked(character, targetZone) ? targetZone : clampZone(character.zone)
  }
  if (goal === 'contract') {
    const contract = getPinnedContract(character)
    if (contract?.active && ZONES[Number(contract.zone)] && isLegacyAfkZoneUnlocked(character, Number(contract.zone))) {
      zone = Number(contract.zone)
      if (!contract.bossStep && (ZONES[zone].mobs as readonly string[]).includes(String(contract.target))) {
        if (!character.huntTargets || typeof character.huntTargets !== 'object') character.huntTargets = {}
        character.huntTargets[String(zone)] = contract.target
        actions.push('set-contract-hunt-target')
      }
    }
  }

  if (zone !== Number(character.zone || 0)) {
    if (character.dungeon?.active) {
      character.dungeon.active = false
      character.dungeon.floor = Math.max(1, Number(character.dungeon.checkpoint || 1))
      actions.push('leave-dungeon')
    }
    character.zone = zone
    actions.push('move-zone')
  }

  if (goal === 'gold' || goal === 'farm_until_gold') {
    character.lootFilter = { ...(character.lootFilter || {}), ...GOLD_LOOT_FILTER }
    if (character.lootFilterPreset !== 'gold') actions.push('apply-gold-loot-filter')
    character.lootFilterPreset = 'gold'
  }
  if (goal === 'level' || goal === 'level_alts_to') {
    if (character.autoUseSkills === false) actions.push('enable-skills')
    character.autoUseSkills = true
  }
  if (goal === 'farm_until_gold') {
    smartGoalComplete = Number(character.gold || 0) >= getLegacyAfkGoalTarget(character, goal)
  }
  if (goal === 'level_alts_to') {
    const target = getLegacyAfkGoalTarget(character, goal)
    smartGoalComplete = Number(character.level || 0) >= target
    if (smartGoalComplete) nextAltSlot = findNextAltBelowLevel(options.slots, options.activeSlot, target)
  }
  if (goal === 'dungeon') {
    if (!character.dungeon || typeof character.dungeon !== 'object') character.dungeon = {}
    if (!character.dungeon.active) actions.push('enter-dungeon')
    character.dungeon.active = true
    character.dungeon.floor = Math.max(1, Number(character.dungeon.floor || character.dungeon.checkpoint || 1))
  }

  return {
    character,
    goal,
    zone,
    actions,
    smartGoalComplete,
    nextAltSlot,
    requiresDungeonSimulation: goal === 'dungeon' || Boolean(character.dungeon?.active),
  }
}

export const LEGACY_POTION_TIERS = {
  hp: [
    { key: 'healpotions_legendary', level: 80, price: 55_000, restore: 16_000 },
    { key: 'healpotions_epic', level: 70, price: 24_000, restore: 10_000 },
    { key: 'healpotions_heroic', level: 60, price: 11_000, restore: 6_000 },
    { key: 'healpotions_shp', level: 45, price: 4_500, restore: 3_000 },
    { key: 'healpotions_ghp', level: 25, price: 1_400, restore: 1_200 },
    { key: 'healpotions_lhp', level: 11, price: 500, restore: 450 },
    { key: 'healpotions', level: 1, price: 50, restore: 150 },
  ],
  mp: [
    { key: 'manapotions_legendary', level: 80, price: 55_000, restore: 12_000 },
    { key: 'manapotions_epic', level: 70, price: 24_000, restore: 7_500 },
    { key: 'manapotions_heroic', level: 60, price: 11_000, restore: 4_500 },
    { key: 'manapotions_smp', level: 45, price: 4_500, restore: 2_200 },
    { key: 'manapotions_gmp', level: 25, price: 1_400, restore: 900 },
    { key: 'manapotions_lmp', level: 11, price: 500, restore: 350 },
    { key: 'manapotions', level: 1, price: 50, restore: 150 },
  ],
} as const

export function getLegacyFactionPriceMultiplier(faction: unknown): number {
  const value = Number(faction || 0)
  if (value >= 200) return 0.78
  if (value >= 90) return 0.86
  if (value >= 30) return 0.94
  if (value >= -29) return 1
  if (value >= -89) return 1.12
  return 1.28
}

export function getLegacyPotionCount(character: LegacyCharacterSave, kind: 'hp' | 'mp'): number {
  return LEGACY_POTION_TIERS[kind].reduce(
    (total, tier) => total + Math.max(0, Math.floor(Number(character[tier.key] || 0))),
    0,
  )
}

export interface LegacyAfkProvisioningResult {
  character: LegacyCharacterSave
  purchased: number
  goldSpent: number
}

export function applyLegacyAfkProvisioning(source: LegacyCharacterSave): LegacyAfkProvisioningResult {
  const character = clone(source) as Record<string, any>
  const rules = character.afkRules && typeof character.afkRules === 'object' ? character.afkRules : {}
  if (rules.autoBuyPots === false) return { character, purchased: 0, goldSpent: 0 }
  const target = Math.max(0, Math.min(99, Math.floor(Number(rules.potMin || 5))))
  const level = Math.max(1, Math.floor(Number(character.level || 1)))
  const multiplier = getLegacyFactionPriceMultiplier(character.faction)
  let purchased = 0
  let goldSpent = 0

  for (const kind of ['hp', 'mp'] as const) {
    const need = Math.max(0, target - getLegacyPotionCount(character, kind))
    if (need <= 0) continue
    const tier = LEGACY_POTION_TIERS[kind].find((candidate) => {
      const price = Math.max(1, Math.floor(candidate.price * multiplier))
      return level >= candidate.level && Number(character.gold || 0) >= price
    })
    if (!tier) continue
    const price = Math.max(1, Math.floor(tier.price * multiplier))
    const count = Math.min(need, Math.floor(Number(character.gold || 0) / price))
    if (count <= 0) continue
    character.gold = Number(character.gold || 0) - count * price
    character[tier.key] = Number(character[tier.key] || 0) + count
    purchased += count
    goldSpent += count * price
  }

  return { character, purchased, goldSpent }
}

export interface LegacyPotionUseResult {
  used: boolean
  character: LegacyCharacterSave
  kind: 'hp' | 'mp'
  potionKey: string | null
  restored: number
}

export interface LegacyAfkRestResult {
  applied: boolean
  character: LegacyCharacterSave
  kind: 'hp' | 'mp'
  restored: number
  manaSpent: number
}

export function applyLegacyAfkRest(
  source: LegacyCharacterSave,
  kind: 'hp' | 'mp',
  randomValue = 0.5,
): LegacyAfkRestResult {
  const character = clone(source) as Record<string, any>
  if (kind === 'mp') {
    const current = Number(character.mp || 0)
    const maximum = Number(character.maxMp || 0)
    const next = Math.min(maximum, current + Math.floor(maximum * 0.15))
    character.mp = next
    return { applied: next > current, character, kind, restored: next - current, manaSpent: 0 }
  }

  const level = Math.max(1, Math.floor(Number(character.level || 1)))
  const manaCost = Math.max(0, Math.floor(15 * (1 + Math.max(0, level - 1) * 0.018)))
  if (Number(character.mp || 0) < manaCost || Number(character.hp || 0) >= Number(character.maxHp || 0)) {
    return { applied: false, character, kind, restored: 0, manaSpent: 0 }
  }
  const current = Number(character.hp || 0)
  const maximum = Number(character.maxHp || 0)
  const amount = Math.floor(maximum * 0.26 + Math.max(0, Math.min(0.999999, randomValue)) * 10)
  const next = Math.min(maximum, current + amount)
  character.hp = next
  character.mp = Math.max(0, Number(character.mp || 0) - manaCost)
  return { applied: true, character, kind, restored: next - current, manaSpent: manaCost }
}

export function useBestLegacyPotion(
  source: LegacyCharacterSave,
  kind: 'hp' | 'mp',
  healingMultiplier = 1,
): LegacyPotionUseResult {
  const character = clone(source) as Record<string, any>
  const currentKey = kind === 'hp' ? 'hp' : 'mp'
  const maximumKey = kind === 'hp' ? 'maxHp' : 'maxMp'
  const current = Number(character[currentKey] || 0)
  const maximum = Number(character[maximumKey] || 0)
  if (current >= maximum) return { used: false, character, kind, potionKey: null, restored: 0 }
  const tier = LEGACY_POTION_TIERS[kind].find((candidate) => Number(character[candidate.key] || 0) > 0)
  if (!tier) return { used: false, character, kind, potionKey: null, restored: 0 }
  character[tier.key] = Number(character[tier.key] || 0) - 1
  const amount = Math.floor(tier.restore * Math.max(0, Number(healingMultiplier || 0)))
  const next = Math.min(maximum, current + amount)
  character[currentKey] = next
  return {
    used: true,
    character,
    kind,
    potionKey: tier.key,
    restored: Math.max(0, next - current),
  }
}
