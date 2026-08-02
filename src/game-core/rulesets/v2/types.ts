import type { V2BattleRuntimeConfig } from './balance.config'

export type GameRuleset = 'legacy' | 'v2'

export type Element =
  | 'neutral'
  | 'metal'
  | 'wood'
  | 'water'
  | 'fire'
  | 'earth'
  | 'thunder'
  | 'ice'
  | 'wind'
  | 'dark'

export type ResistedElement = Exclude<Element, 'neutral'>
export type ElementResistances = Record<ResistedElement, number>
export type AbilityKey = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha'

export type RootGrade = '伪灵根' | '真灵根' | '天灵根' | '变异灵根' | '特殊血脉'

export interface RootProfile {
  id: string
  displayName: string
  grade: RootGrade
  elements: readonly Element[]
  affinities: Partial<Record<Element, number>>
  cultivationRate: number
  resistances?: Partial<ElementResistances>
}

export type TechniqueEffectType =
  | 'direct_damage'
  | 'healing'
  | 'shield'
  | 'poison'
  | 'attack_down'
  | 'agility_down'
  | 'mana_restore'

export interface TechniqueDefinition {
  id: string
  displayName: string
  description: string
  classIds: readonly string[]
  element: Element
  effectType: TechniqueEffectType
  target: 'enemy' | 'self'
  manaCost: number
  cooldown: number
  basePower: number
  attackScale?: number
  spiritScale?: number
  physiqueScale?: number
  abilityScales?: Partial<Record<AbilityKey, number>>
  duration?: number
  magnitude?: number
}

export interface TechniqueLoadout {
  slots: [string | null, string | null, string | null]
}

export type BattleSide = 'player' | 'enemy'

export interface BattleActorState {
  id: string
  side: BattleSide
  name: string
  level: number
  element: Element
  hp: number
  maxHp: number
  mp: number
  maxMp: number
  shield: number
  attack: number
  defense: number
  spirit: number
  physique: number
  agility: number
  abilities?: Record<AbilityKey, number>
  criticalChance: number
  criticalMultiplier: number
  damageMultiplier: number
  healingMultiplier: number
  statusResistances: Record<'control' | 'poison', number>
  techniqueMastery: Record<string, number>
  affinities: Partial<Record<Element, number>>
  resistances: ElementResistances
  knownTechniqueIds: string[]
  techniqueLoadout: TechniqueLoadout
  pills?: Partial<Record<BattlePillId, number>>
}

export type BattlePillId = '回春丹' | '回灵丹'

export type BattleEffectType =
  | 'poison'
  | 'regeneration'
  | 'stun'
  | 'freeze'
  | 'attack_down'
  | 'agility_down'
  | 'attack_up'
  | 'agility_up'

export interface BattleEffectInstance {
  id: string
  type: BattleEffectType
  sourceActorId: string
  targetActorId: string
  magnitude: number
  remainingRounds: number
  appliedRound: number
  element?: Element
}

export type BattlePhase =
  | 'IDLE'
  | 'INITIALIZING'
  | 'ROUND_START'
  | 'BUILD_TURN_ORDER'
  | 'WAITING_FOR_COMMAND'
  | 'RESOLVING_ACTION'
  | 'APPLYING_EFFECTS'
  | 'CHECKING_RESULT'
  | 'ROUND_END'
  | 'VICTORY'
  | 'DEFEAT'
  | 'ESCAPED'
  | 'SETTLEMENT'
  | 'COMPLETED'

export type BattleCommand =
  | { type: 'basic_attack'; actorId: string; targetId: string }
  | { type: 'use_technique'; actorId: string; targetId: string; techniqueId: string }
  | { type: 'use_pill'; actorId: string; pillId: BattlePillId }
  | { type: 'escape'; actorId: string }

export interface BattleResult {
  outcome: 'victory' | 'defeat' | 'escaped'
  winnerActorId: string | null
  loserActorId: string | null
  rounds: number
}

export interface DamageBreakdown {
  base: number
  scaling: number
  affinityMultiplier: number
  elementMultiplier: number
  resistanceMultiplier: number
  defenseMultiplier: number
  criticalMultiplier: number
  statusMultiplier: number
  equipmentMultiplier: number
  finalAmount: number
  hitChance?: number
  hit?: boolean
}

export type BattleEventType =
  | 'BattleStarted'
  | 'RoundStarted'
  | 'TurnOrderBuilt'
  | 'TurnStarted'
  | 'ActionDeclared'
  | 'DamageDealt'
  | 'HealingApplied'
  | 'ShieldApplied'
  | 'StatusApplied'
  | 'StatusExpired'
  | 'ResourceChanged'
  | 'TechniqueCooldownChanged'
  | 'UnitDefeated'
  | 'BattleEscaped'
  | 'BattleEnded'
  | 'RewardsGranted'
  | 'RestStarted'

export interface BattleEvent {
  sequence: number
  type: BattleEventType
  round: number
  message: string
  actorId?: string
  targetId?: string
  techniqueId?: string
  element?: Element
  amount?: number
  valueBefore?: number
  valueAfter?: number
  critical?: boolean
  controlled?: boolean
  advantage?: '克制' | '被克' | '无关系'
  breakdown?: DamageBreakdown
  command?: BattleCommand
  turnOrder?: string[]
  effect?: BattleEffectInstance
  result?: BattleResult
  rewards?: { xp: number; gold: number; itemId?: string | null }
}

export interface BattleState {
  id: string
  ruleset: 'v2'
  phase: BattlePhase
  round: number
  actors: Record<string, BattleActorState>
  turnOrder: string[]
  activeActorId: string | null
  pendingCommand: BattleCommand | null
  cooldowns: Record<string, number>
  effects: BattleEffectInstance[]
  result: BattleResult | null
  randomState: string
  actedActorIds: string[]
  eventSequence: number
  events: BattleEvent[]
  balanceConfig: V2BattleRuntimeConfig
  encounter: {
    zoneId: string
    enemyContentId: string
    boss: boolean
    rewards: { xp: number; gold: number; itemId?: string | null }
  }
}

export interface BattleCommandValidation {
  valid: boolean
  reason?:
    | 'battle-complete'
    | 'wrong-phase'
    | 'not-active-actor'
    | 'actor-defeated'
    | 'actor-controlled'
    | 'invalid-target'
    | 'technique-not-known'
    | 'technique-not-equipped'
    | 'insufficient-mana'
    | 'technique-on-cooldown'
    | 'unknown-technique'
    | 'pill-not-available'
    | 'resource-full'
}

export interface BattleTransition {
  state: BattleState
  events: BattleEvent[]
  validation: BattleCommandValidation
}

export interface BattleDecisionContext {
  state: Readonly<BattleState>
  actor: Readonly<BattleActorState>
  opponent: Readonly<BattleActorState>
  techniques: Readonly<Record<string, TechniqueDefinition>>
}

export interface BattleStrategy {
  selectCommand(context: BattleDecisionContext): BattleCommand
}
