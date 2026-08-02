import type { Element } from './types'
import type { V2ElementBalanceConfig } from './balance.config'

export const ELEMENT_LABELS: Readonly<Record<Element, string>> = Object.freeze({
  neutral: '无属性',
  metal: '金',
  wood: '木',
  water: '水',
  fire: '火',
  earth: '土',
  thunder: '雷',
  ice: '冰',
  wind: '风',
  dark: '暗',
})

const FIVE_ELEMENT_OVERCOMES: Readonly<Record<string, Element>> = Object.freeze({
  metal: 'wood',
  wood: 'earth',
  earth: 'water',
  water: 'fire',
  fire: 'metal',
})

export function getElementRelationship(
  attackElement: Element,
  targetElement: Element,
  configuration?: V2ElementBalanceConfig,
): 'advantage' | 'disadvantage' | 'neutral' | 'same' {
  if (attackElement === 'neutral' || targetElement === 'neutral') return 'neutral'
  if (attackElement === targetElement) return 'same'
  const overcomes = configuration?.overcomes || FIVE_ELEMENT_OVERCOMES
  if (overcomes[attackElement as keyof typeof overcomes] === targetElement) return 'advantage'
  if (overcomes[targetElement as keyof typeof overcomes] === attackElement) return 'disadvantage'
  return 'neutral'
}

export function getElementMultiplier(attackElement: Element, targetElement: Element, configuration?: V2ElementBalanceConfig): number {
  const relationship = getElementRelationship(attackElement, targetElement, configuration)
  if (relationship === 'advantage') return configuration?.advantageMultiplier ?? 1.2
  if (relationship === 'disadvantage') return configuration?.disadvantageMultiplier ?? 0.85
  if (relationship === 'same') return configuration?.sameElementMultiplier ?? 1
  return configuration?.neutralMultiplier ?? 1
}

export function getElementAdvantageLabel(
  attackElement: Element,
  targetElement: Element,
  configuration?: V2ElementBalanceConfig,
): '克制' | '被克' | '无关系' {
  const relationship = getElementRelationship(attackElement, targetElement, configuration)
  return relationship === 'advantage' ? '克制' : relationship === 'disadvantage' ? '被克' : '无关系'
}
