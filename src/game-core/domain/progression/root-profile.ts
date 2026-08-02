import type { Element, ElementResistances, RootGrade } from '../../rulesets/v2/types'

export const P2_ROOT_IDS = [
  '五行伪灵根',
  '金木水火四灵根', '金木水土四灵根', '金木火土四灵根', '金水火土四灵根', '木水火土四灵根',
  '金木水三灵根', '金木火三灵根', '金木土三灵根', '金水火三灵根', '金水土三灵根',
  '金火土三灵根', '木水火三灵根', '木水土三灵根', '木火土三灵根', '水火土三灵根',
  '金木双灵根', '金水双灵根', '金火双灵根', '金土双灵根', '木水双灵根',
  '木火双灵根', '木土双灵根', '水火双灵根', '水土双灵根', '火土双灵根',
  '金天灵根', '木天灵根', '水天灵根', '火天灵根', '土天灵根',
] as const

export type P2RootId = (typeof P2_ROOT_IDS)[number]
export type P2RootTier = '五灵根' | '四灵根' | '三灵根' | '双灵根' | '天灵根'

export interface P2RootProfile {
  id: P2RootId
  displayName: string
  tier: P2RootTier
  grade: RootGrade
  elements: readonly Element[]
  affinities: Partial<Record<Element, number>>
  cultivationRate: number
  caveTrainingRate: number
  resistances: Partial<ElementResistances>
  description: string
}

const ELEMENT_BY_LABEL = Object.freeze({
  金: 'metal', 木: 'wood', 水: 'water', 火: 'fire', 土: 'earth',
} as const satisfies Record<string, Element>)

const ROOT_ELEMENTS: Readonly<Record<P2RootId, readonly Element[]>> = Object.freeze({
  五行伪灵根: ['metal', 'wood', 'water', 'fire', 'earth'],
  金木水火四灵根: ['metal', 'wood', 'water', 'fire'],
  金木水土四灵根: ['metal', 'wood', 'water', 'earth'],
  金木火土四灵根: ['metal', 'wood', 'fire', 'earth'],
  金水火土四灵根: ['metal', 'water', 'fire', 'earth'],
  木水火土四灵根: ['wood', 'water', 'fire', 'earth'],
  金木水三灵根: ['metal', 'wood', 'water'],
  金木火三灵根: ['metal', 'wood', 'fire'],
  金木土三灵根: ['metal', 'wood', 'earth'],
  金水火三灵根: ['metal', 'water', 'fire'],
  金水土三灵根: ['metal', 'water', 'earth'],
  金火土三灵根: ['metal', 'fire', 'earth'],
  木水火三灵根: ['wood', 'water', 'fire'],
  木水土三灵根: ['wood', 'water', 'earth'],
  木火土三灵根: ['wood', 'fire', 'earth'],
  水火土三灵根: ['water', 'fire', 'earth'],
  金木双灵根: ['metal', 'wood'],
  金水双灵根: ['metal', 'water'],
  金火双灵根: ['metal', 'fire'],
  金土双灵根: ['metal', 'earth'],
  木水双灵根: ['wood', 'water'],
  木火双灵根: ['wood', 'fire'],
  木土双灵根: ['wood', 'earth'],
  水火双灵根: ['water', 'fire'],
  水土双灵根: ['water', 'earth'],
  火土双灵根: ['fire', 'earth'],
  金天灵根: ['metal'],
  木天灵根: ['wood'],
  水天灵根: ['water'],
  火天灵根: ['fire'],
  土天灵根: ['earth'],
})

function tierForCount(count: number): P2RootTier {
  return count === 1 ? '天灵根' : count === 2 ? '双灵根' : count === 3 ? '三灵根' : count === 4 ? '四灵根' : '五灵根'
}

function gradeForCount(count: number): RootGrade {
  if (count === 1) return '天灵根'
  if (count <= 3) return '真灵根'
  return '伪灵根'
}

function affinityForCount(count: number): number {
  return ({ 1: 100, 2: 78, 3: 62, 4: 50, 5: 40 } as Record<number, number>)[count] || 0
}

function profile(id: P2RootId): P2RootProfile {
  const elements = ROOT_ELEMENTS[id]
  const count = elements.length
  const rate = 1 / count
  const affinity = affinityForCount(count)
  const resistance = count === 1 ? 10 : count === 2 ? 5 : count === 3 ? 3 : count === 4 ? 2 : 0
  return Object.freeze({
    id,
    displayName: id,
    tier: tierForCount(count),
    grade: gradeForCount(count),
    elements,
    affinities: Object.fromEntries(elements.map((element) => [element, affinity])) as Partial<Record<Element, number>>,
    cultivationRate: rate,
    caveTrainingRate: rate,
    resistances: Object.fromEntries(elements.map((element) => [element, resistance])) as Partial<ElementResistances>,
    description: `${count} 种五行属性，可参悟对应属性功法；修炼速度为天灵根的 ${count === 1 ? '100%' : `${Math.round(rate * 100)}%`}。`,
  })
}

export const P2_ROOT_PROFILES: Readonly<Record<P2RootId, P2RootProfile>> = Object.freeze(
  Object.fromEntries(P2_ROOT_IDS.map((id) => [id, profile(id)])) as Record<P2RootId, P2RootProfile>,
)

export const P2_ROOT_GROUPS: readonly Readonly<{
  id: P2RootTier
  qualification: RootGrade
  rootIds: readonly P2RootId[]
}>[] = Object.freeze([
  { id: '五灵根', qualification: '伪灵根', rootIds: P2_ROOT_IDS.filter((id) => P2_ROOT_PROFILES[id].elements.length === 5) },
  { id: '四灵根', qualification: '伪灵根', rootIds: P2_ROOT_IDS.filter((id) => P2_ROOT_PROFILES[id].elements.length === 4) },
  { id: '三灵根', qualification: '真灵根', rootIds: P2_ROOT_IDS.filter((id) => P2_ROOT_PROFILES[id].elements.length === 3) },
  { id: '双灵根', qualification: '真灵根', rootIds: P2_ROOT_IDS.filter((id) => P2_ROOT_PROFILES[id].elements.length === 2) },
  { id: '天灵根', qualification: '天灵根', rootIds: P2_ROOT_IDS.filter((id) => P2_ROOT_PROFILES[id].elements.length === 1) },
])

export function isP2RootId(value: unknown): value is P2RootId {
  return typeof value === 'string' && (P2_ROOT_IDS as readonly string[]).includes(value)
}

export function normalizeP2RootId(value: unknown): P2RootId {
  return isP2RootId(value) ? value : '五行伪灵根'
}

export function getP2RootProfile(value: unknown): P2RootProfile {
  return P2_ROOT_PROFILES[normalizeP2RootId(value)]
}

export function canP2RootLearnElement(root: P2RootProfile | P2RootId | unknown, element: Element): boolean {
  if (element === 'neutral') return true
  const profileValue = typeof root === 'object' && root && 'elements' in root
    ? root as P2RootProfile
    : getP2RootProfile(root)
  return profileValue.elements.includes(element)
}

export function getP2RootElementLabels(root: P2RootProfile | P2RootId | unknown): string[] {
  const profileValue = typeof root === 'object' && root && 'elements' in root
    ? root as P2RootProfile
    : getP2RootProfile(root)
  return Object.entries(ELEMENT_BY_LABEL)
    .filter(([, element]) => profileValue.elements.includes(element))
    .map(([label]) => label)
}
