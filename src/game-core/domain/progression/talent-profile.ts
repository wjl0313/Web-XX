import type { Element, ResistedElement } from '../../rulesets/v2/types'

export const P2_TALENT_IDS = [
  '剑心', '身轻如燕', '灵台清明', '经脉坚韧',
  '丹火亲和', '厚土护体', '水木长生', '雷意初生',
] as const

export type P2TalentId = (typeof P2_TALENT_IDS)[number]

export interface P2TalentEffects {
  attackMultiplier?: number
  defenseMultiplier?: number
  maxHpMultiplier?: number
  agility?: number
  spirit?: number
  healingMultiplier?: number
  alchemyRate?: number
  affinities?: Partial<Record<Element, number>>
  resistances?: Partial<Record<ResistedElement, number>>
  statusResistances?: Partial<Record<'control' | 'poison', number>>
}

export interface P2TalentProfile {
  id: P2TalentId
  description: string
  effects: P2TalentEffects
}

export const P2_TALENT_PROFILES: Readonly<Record<P2TalentId, P2TalentProfile>> = Object.freeze({
  剑心: { id: '剑心', description: '主法器造成的伤害提高 5%。', effects: { attackMultiplier: 1.05 } },
  身轻如燕: { id: '身轻如燕', description: '基础身法提高 4 点。', effects: { agility: 4 } },
  灵台清明: { id: '灵台清明', description: '神识提高 4 点，控制抗性提高 10%。', effects: { spirit: 4, statusResistances: { control: 10 } } },
  经脉坚韧: { id: '经脉坚韧', description: '最大气血提高 6%，中毒抗性提高 12%。', effects: { maxHpMultiplier: 1.06, statusResistances: { poison: 12 } } },
  丹火亲和: { id: '丹火亲和', description: '火属性亲和提高 10 点，炼丹耗时缩短 6%。', effects: { affinities: { fire: 10 }, alchemyRate: 1.06 } },
  厚土护体: { id: '厚土护体', description: '防御提高 4%，土抗性提高 10 点。', effects: { defenseMultiplier: 1.04, resistances: { earth: 10 } } },
  水木长生: { id: '水木长生', description: '治疗效果提高 6%，水木亲和各提高 5 点。', effects: { healingMultiplier: 1.06, affinities: { water: 5, wood: 5 } } },
  雷意初生: { id: '雷意初生', description: '雷属性功法亲和提高 12 点。', effects: { affinities: { thunder: 12 } } },
})

export function isP2TalentId(value: unknown): value is P2TalentId {
  return typeof value === 'string' && (P2_TALENT_IDS as readonly string[]).includes(value)
}

function hashSeed(seed: string): number {
  let hash = 2_166_136_261
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index)
    hash = Math.imul(hash, 16_777_619)
  }
  return hash >>> 0
}

export function createTalentChoices(seed: string, count = 3): P2TalentId[] {
  const pool = [...P2_TALENT_IDS]
  let state = hashSeed(seed || 'p2-talents')
  for (let index = pool.length - 1; index > 0; index -= 1) {
    state = (state + 0x6d2b79f5) >>> 0
    const swap = state % (index + 1)
    ;[pool[index], pool[swap]] = [pool[swap], pool[index]]
  }
  return pool.slice(0, Math.max(1, Math.min(pool.length, Math.floor(count))))
}

export function mergeTalentEffects(talents: readonly unknown[]): P2TalentEffects {
  const result: P2TalentEffects = { affinities: {}, resistances: {}, statusResistances: {} }
  for (const value of talents) {
    if (!isP2TalentId(value)) continue
    const effects = P2_TALENT_PROFILES[value].effects
    result.attackMultiplier = Number(result.attackMultiplier || 1) * Number(effects.attackMultiplier || 1)
    result.defenseMultiplier = Number(result.defenseMultiplier || 1) * Number(effects.defenseMultiplier || 1)
    result.maxHpMultiplier = Number(result.maxHpMultiplier || 1) * Number(effects.maxHpMultiplier || 1)
    result.healingMultiplier = Number(result.healingMultiplier || 1) * Number(effects.healingMultiplier || 1)
    result.alchemyRate = Number(result.alchemyRate || 1) * Number(effects.alchemyRate || 1)
    result.agility = Number(result.agility || 0) + Number(effects.agility || 0)
    result.spirit = Number(result.spirit || 0) + Number(effects.spirit || 0)
    for (const [key, amount] of Object.entries(effects.affinities || {})) {
      result.affinities![key as Element] = Number(result.affinities![key as Element] || 0) + Number(amount || 0)
    }
    for (const [key, amount] of Object.entries(effects.resistances || {})) {
      result.resistances![key as ResistedElement] = Number(result.resistances![key as ResistedElement] || 0) + Number(amount || 0)
    }
    for (const [key, amount] of Object.entries(effects.statusResistances || {})) {
      result.statusResistances![key as 'control' | 'poison'] = Number(result.statusResistances![key as 'control' | 'poison'] || 0) + Number(amount || 0)
    }
  }
  return result
}

