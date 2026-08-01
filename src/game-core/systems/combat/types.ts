export interface LegacyCombatant {
  name: string
  level: number
  hp: number
  maxHp: number
  atk: number
  def: number
}

export interface LegacyPlayerCombatant extends LegacyCombatant {
  mp?: number
  maxMp?: number
}

export interface LegacyMobCombatant extends LegacyCombatant {
  baseName: string
  elite: boolean
  named: boolean
  boss?: boolean
  namedMechanic?: { id: string; name?: string; desc?: string } | null
  enrageTriggered?: boolean
  wardReady?: boolean
  turnCount?: number
  encounterId?: string
  encounterIndex?: number
}

export interface LegacyPlayerAttackModifiers {
  atkBonus?: number
  mobDodgeBonus?: number
  critChanceBonus?: number
  critMultiplierBonus?: number
  playerDamageMultiplier?: number
}

export interface LegacyMobStrikeModifiers {
  playerDodgeChance?: number
  mobDamageMultiplier?: number
  mitigation?: number
  attackScale?: number
  maxHpCapPercent?: number
  assist?: boolean
}

export interface LegacyAttackResult {
  damage: number
  hit: boolean
  critical: boolean
  stunned: boolean
  wardConsumed: boolean
}

export interface LegacyMobStrikeResult {
  damage: number
  hit: boolean
  critical: boolean
  dodged: boolean
}

export interface LegacyKillRewardModifiers {
  eventXpMultiplier?: number
  eventGoldMultiplier?: number
  dungeonFloorMultiplier?: number
  dungeonXpMultiplier?: number
  dungeonGoldMultiplier?: number
  prestigeGoldMultiplier?: number
  aaGoldMultiplier?: number
  relicGoldMultiplier?: number
  petGoldMultiplier?: number
  runewordXpFind?: number
  runewordGoldFind?: number
  abilityGoldBonus?: number
}

export interface LegacyKillRewards {
  xp: number
  gold: number
}

export type LegacyBattleEventType =
  | 'player-hit'
  | 'player-miss'
  | 'mob-hit'
  | 'mob-miss'
  | 'mob-stunned'
  | 'victory'
  | 'defeat'

export interface LegacyBattleEvent {
  turn: number
  type: LegacyBattleEventType
  damage?: number
  critical?: boolean
}

export interface LegacyBattleResult {
  winner: 'player' | 'mob' | 'timeout'
  turns: number
  player: LegacyPlayerCombatant
  mob: LegacyMobCombatant
  events: LegacyBattleEvent[]
}
