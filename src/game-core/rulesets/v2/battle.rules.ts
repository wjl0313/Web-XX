import { getAffinityMultiplier } from './affinity.rules'
import { getElementAdvantageLabel, getElementMultiplier } from './element.rules'
import { getResistanceMultiplier } from './resistance.rules'
import { getEffectiveAttack } from './status.rules'
import type {
  BattleActorState,
  BattleState,
  DamageBreakdown,
  Element,
  TechniqueDefinition,
} from './types'

const UINT32_RANGE = 4_294_967_296

function hashSeed(seed: string): number {
  let hash = 2_166_136_261
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index)
    hash = Math.imul(hash, 16_777_619)
  }
  return hash >>> 0
}

export function createV2RandomState(seed: string): string {
  if (!seed.trim()) throw new Error('随机种子不能为空')
  return hashSeed(seed).toString(16).padStart(8, '0')
}

export function takeV2Random(state: BattleState): number {
  const previous = Number.parseInt(state.randomState, 16) >>> 0
  const nextState = (previous + 0x6d2b79f5) >>> 0
  let value = nextState
  value = Math.imul(value ^ (value >>> 15), value | 1)
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
  state.randomState = nextState.toString(16).padStart(8, '0')
  return ((value ^ (value >>> 14)) >>> 0) / UINT32_RANGE
}

export function calculateDefenseMultiplier(defense: number, state?: BattleState): number {
  const normalized = Math.max(0, Number(defense) || 0)
  const configuration = state?.balanceConfig.combat
  const constant = Math.max(1, Number(configuration?.defenseConstant || 100))
  return Math.max(Number(configuration?.minimumDefenseMultiplier ?? 0.25), Math.min(1, constant / (constant + normalized)))
}

export interface ResolveV2DamageInput {
  state: BattleState
  attacker: BattleActorState
  target: BattleActorState
  element: Element
  basePower: number
  attackScale?: number
  spiritScale?: number
  physiqueScale?: number
  canCritical?: boolean
  statusMultiplier?: number
  equipmentMultiplier?: number
}

export function resolveV2Damage(input: ResolveV2DamageInput): {
  breakdown: DamageBreakdown
  critical: boolean
  hit: boolean
  advantage: '克制' | '被克' | '无关系'
} {
  const attackScale = Number(input.attackScale ?? 1)
  const spiritScale = Number(input.spiritScale ?? 0)
  const physiqueScale = Number(input.physiqueScale ?? 0)
  const scaling = getEffectiveAttack(input.state, input.attacker) * attackScale
    + input.attacker.spirit * spiritScale
    + input.attacker.physique * physiqueScale
  const affinityMultiplier = getAffinityMultiplier(input.element, input.attacker.affinities)
  const combat = input.state.balanceConfig.combat
  const elementMultiplier = getElementMultiplier(input.element, input.target.element, input.state.balanceConfig.elements)
  const resistanceMultiplier = getResistanceMultiplier(input.element, input.target.resistances)
  const defenseMultiplier = calculateDefenseMultiplier(input.target.defense, input.state)
  const rawHitChance = combat.baseHitChance
    + input.attacker.agility * combat.agilityHitChanceScale
    - combat.baseDodgeChance
    - input.target.agility * combat.agilityDodgeChanceScale
  const hitChance = Math.max(combat.minimumHitChance, Math.min(combat.maximumHitChance, rawHitChance))
  const hit = hitChance >= 1 || takeV2Random(input.state) < hitChance
  const critical = hit && input.canCritical !== false && takeV2Random(input.state) < input.attacker.criticalChance
  const criticalMultiplier = critical ? input.attacker.criticalMultiplier : 1
  const statusMultiplier = Math.max(0, Number(input.statusMultiplier ?? 1))
  const equipmentMultiplier = Math.max(0, Number(input.equipmentMultiplier ?? 1) * Number(input.attacker.damageMultiplier || 1))
  const varianceMultiplier = combat.damageVarianceMinimum
    + takeV2Random(input.state) * Math.max(0, combat.damageVarianceMaximum - combat.damageVarianceMinimum)
  const finalAmount = hit ? Math.max(1, Math.floor(
    (Math.max(0, input.basePower) + scaling)
      * affinityMultiplier
      * elementMultiplier
      * resistanceMultiplier
      * defenseMultiplier
      * criticalMultiplier
      * statusMultiplier
      * equipmentMultiplier
      * varianceMultiplier,
  )) : 0
  return {
    critical,
    hit,
    advantage: getElementAdvantageLabel(input.element, input.target.element, input.state.balanceConfig.elements),
    breakdown: {
      base: input.basePower,
      scaling,
      affinityMultiplier,
      elementMultiplier,
      resistanceMultiplier,
      defenseMultiplier,
      criticalMultiplier,
      statusMultiplier,
      equipmentMultiplier,
      finalAmount,
      hitChance,
      hit,
    },
  }
}

export function resolveTechniqueDamage(
  state: BattleState,
  attacker: BattleActorState,
  target: BattleActorState,
  technique: TechniqueDefinition,
) {
  return resolveV2Damage({
    state,
    attacker,
    target,
    element: technique.element,
    basePower: technique.basePower,
    attackScale: technique.attackScale,
    spiritScale: technique.spiritScale,
    physiqueScale: technique.physiqueScale,
  })
}

export function resolveV2Healing(
  actor: BattleActorState,
  technique: TechniqueDefinition,
): number {
  const scaling = actor.attack * Number(technique.attackScale || 0)
    + actor.spirit * Number(technique.spiritScale || 0)
    + actor.physique * Number(technique.physiqueScale || 0)
    + Object.entries(technique.abilityScales || {}).reduce((sum, [ability, scale]) => (
      sum + Number(actor.abilities?.[ability as keyof typeof actor.abilities] || 0) * Number(scale || 0)
    ), 0)
  const affinity = getAffinityMultiplier(technique.element, actor.affinities)
  return Math.max(1, Math.floor((technique.basePower + scaling) * affinity * Number(actor.healingMultiplier || 1)))
}

export function getEscapeChance(actor: BattleActorState, target: BattleActorState, state?: BattleState): number {
  const configuration = state?.balanceConfig.combat
  const base = configuration?.escapeBaseChance ?? 0.35
  const scale = configuration?.escapeAgilityScale ?? 0.02
  return Math.max(configuration?.escapeMinimumChance ?? 0.1, Math.min(configuration?.escapeMaximumChance ?? 0.9, base + (actor.agility - target.agility) * scale))
}
