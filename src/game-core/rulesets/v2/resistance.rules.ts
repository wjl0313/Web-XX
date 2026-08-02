import type { Element, ElementResistances, ResistedElement } from './types'

export const RESISTED_ELEMENTS = [
  'metal', 'wood', 'water', 'fire', 'earth', 'thunder', 'ice', 'wind', 'dark',
] as const satisfies readonly ResistedElement[]

export function createEmptyElementResistances(): ElementResistances {
  return { metal: 0, wood: 0, water: 0, fire: 0, earth: 0, thunder: 0, ice: 0, wind: 0, dark: 0 }
}

export function clampResistance(value: unknown): number {
  const parsed = Number(value)
  return Math.max(-50, Math.min(300, Number.isFinite(parsed) ? parsed : 0))
}

export function normalizeElementResistances(
  source?: Partial<Record<ResistedElement, unknown>> | null,
): ElementResistances {
  const result = createEmptyElementResistances()
  for (const element of RESISTED_ELEMENTS) result[element] = clampResistance(source?.[element])
  return result
}

export function mergeElementResistances(
  ...sources: Array<Partial<Record<ResistedElement, unknown>> | null | undefined>
): ElementResistances {
  const result = createEmptyElementResistances()
  for (const source of sources) {
    if (!source) continue
    for (const element of RESISTED_ELEMENTS) result[element] += Number(source[element] || 0)
  }
  return normalizeElementResistances(result)
}

export function getResistanceMultiplier(element: Element, resistances: ElementResistances): number {
  if (element === 'neutral') return 1
  const resistance = clampResistance(resistances[element])
  return Math.max(0.25, Math.min(1.5, 100 / (100 + resistance)))
}
