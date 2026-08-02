import type { Element, RootProfile } from './types'

export function clampAffinity(value: unknown): number {
  const parsed = Number(value)
  return Math.max(0, Math.min(100, Number.isFinite(parsed) ? parsed : 0))
}

export function normalizeAffinities(
  source?: Partial<Record<Element, unknown>> | null,
): Partial<Record<Element, number>> {
  if (!source) return {}
  return Object.fromEntries(Object.entries(source).map(([key, value]) => [key, clampAffinity(value)]))
}

export function getAffinityMultiplier(
  element: Element,
  affinities: Partial<Record<Element, number>>,
): number {
  if (element === 'neutral') return 1
  return 1 + clampAffinity(affinities[element]) / 500
}

export function getRootAffinity(root: RootProfile, element: Element): number {
  return clampAffinity(root.affinities[element])
}
