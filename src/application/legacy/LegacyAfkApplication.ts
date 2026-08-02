import { createSystemRandom, type RandomSource } from '../../game-core/rng'
import { ZONES } from '../../game-core/data'
import {
  applyLegacyAfkProvisioning,
  applyLegacyAfkRest,
  planLegacyAfkGoal,
  simulateLegacyPartyAfkReturn,
  useBestLegacyPotion,
  type LegacyAfkSummary,
} from '../../game-core/systems/afk'
import type { LegacyCharacterSave, LegacySlots } from '../../game-core/save'

export type LegacyAfkTickAction =
  | { type: 'none'; character: LegacyCharacterSave }
  | { type: 'attack'; character: LegacyCharacterSave }
  | { type: 'auto-cast'; character: LegacyCharacterSave }
  | { type: 'spawn'; character: LegacyCharacterSave }
  | { type: 'switched-character'; slots: LegacySlots; activeSlot: number }

export interface LegacyAfkOfflineResult {
  slots: LegacySlots
  activeSlot: number
  summary: LegacyAfkSummary | null
}

export type LegacyAfkProfileSlot = 'slot1' | 'slot2' | 'slot3'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export class LegacyAfkApplication {
  #random: RandomSource

  constructor(random: RandomSource = createSystemRandom()) {
    this.#random = random
  }

  setRandomSource(random: RandomSource): void {
    this.#random = random
  }

  updateConfiguration(
    character: LegacyCharacterSave,
    patch: Record<string, unknown>,
  ): LegacyCharacterSave {
    const next = clone(character) as Record<string, any>
    for (const [key, value] of Object.entries(patch)) next[key] = value
    return next
  }

  setGoal(character: LegacyCharacterSave, goal: string): LegacyCharacterSave {
    const allowed = new Set(['balanced', 'level', 'contract', 'dungeon', 'gold', 'farm_until_gold', 'level_alts_to', 'farm_zone'])
    return this.updateConfiguration(character, { afkGoal: allowed.has(goal) ? goal : 'balanced' })
  }

  setZone(character: LegacyCharacterSave, zoneIndex: number): LegacyCharacterSave | null {
    const index = Math.max(0, Math.min(ZONES.length - 1, Math.floor(Number(zoneIndex) || 0)))
    if (Number(character.level || 1) < ZONES[index].minLvl) return null
    const next = clone(character) as Record<string, any>
    next.zone = index
    next.afkGoal = 'farm_zone'
    next.afkGoalTargets = { ...(next.afkGoalTargets || {}), farm_zone: index }
    return next
  }

  setHuntTarget(character: LegacyCharacterSave, target: string): LegacyCharacterSave {
    const next = clone(character) as Record<string, any>
    const zoneIndex = Math.max(0, Math.min(ZONES.length - 1, Math.floor(Number(next.zone) || 0)))
    const normalized = ZONES[zoneIndex].mobs.includes(target as never) ? target : ''
    next.huntTargets = { ...(next.huntTargets || {}) }
    if (normalized) next.huntTargets[String(zoneIndex)] = normalized
    else delete next.huntTargets[String(zoneIndex)]
    return next
  }

  bindZone(character: LegacyCharacterSave, zoneIndex: number): LegacyCharacterSave | null {
    const index = Math.max(0, Math.min(ZONES.length - 1, Math.floor(Number(zoneIndex) || 0)))
    if (Number(character.level || 1) < ZONES[index].minLvl) return null
    return this.updateConfiguration(character, { bindZone: index })
  }

  saveProfile(character: LegacyCharacterSave, slot: LegacyAfkProfileSlot): LegacyCharacterSave {
    const next = clone(character) as Record<string, any>
    next.afkProfiles = { ...(next.afkProfiles || {}) }
    next.afkProfiles[slot] = {
      afkGoal: next.afkGoal,
      afkGoalTargets: clone(next.afkGoalTargets || {}),
      zone: next.zone,
      huntTargets: clone(next.huntTargets || {}),
      autoUseSkills: next.autoUseSkills !== false,
      autoSkillSlots: clone(next.autoSkillSlots || []),
      autoUseHpPotions: next.autoUseHpPotions !== false,
      autoUseMpPotions: next.autoUseMpPotions !== false,
      autoHpPotionPercent: Number(next.autoHpPotionPercent || 35),
      autoMpPotionPercent: Number(next.autoMpPotionPercent || 20),
      autoRestHpPercent: Number(next.autoRestHpPercent || 40),
      autoRestMpPercent: Number(next.autoRestMpPercent || 20),
      afkIntervalMs: Number(next.afkIntervalMs || 1200),
      afkRules: clone(next.afkRules || {}),
      lootFilter: clone(next.lootFilter || {}),
    }
    return next
  }

  loadProfile(character: LegacyCharacterSave, slot: LegacyAfkProfileSlot): LegacyCharacterSave | null {
    const source = character.afkProfiles && typeof character.afkProfiles === 'object'
      ? (character.afkProfiles as Record<string, unknown>)[slot]
      : null
    if (!source || typeof source !== 'object' || Array.isArray(source)) return null
    const next = clone(character) as Record<string, any>
    const profile = clone(source) as Record<string, any>
    for (const key of [
      'afkGoal', 'afkGoalTargets', 'zone', 'huntTargets', 'autoUseSkills', 'autoSkillSlots',
      'autoUseHpPotions', 'autoUseMpPotions', 'autoHpPotionPercent', 'autoMpPotionPercent',
      'autoRestHpPercent', 'autoRestMpPercent', 'afkIntervalMs', 'afkRules', 'lootFilter',
    ]) {
      if (Object.hasOwn(profile, key)) next[key] = profile[key]
    }
    return next
  }

  prepareGoal(slots: LegacySlots, activeSlot: number, now = Date.now()): LegacyAfkTickAction {
    const source = slots[activeSlot]
    if (!source) return { type: 'none', character: {} }
    const plan = planLegacyAfkGoal(source, { slots, activeSlot })
    if (plan.nextAltSlot !== null) {
      const nextSlots = clone(slots)
      const current = plan.character
      current.afkEnabled = false
      current.lastAfkAt = null
      nextSlots[activeSlot] = current
      const alt = clone(nextSlots[plan.nextAltSlot]!) as Record<string, any>
      alt.afkGoal = 'level_alts_to'
      alt.afkGoalTargets = {
        ...(alt.afkGoalTargets && typeof alt.afkGoalTargets === 'object' ? alt.afkGoalTargets : {}),
        level_alts_to: Number(
          plan.character.afkGoalTargets
          && typeof plan.character.afkGoalTargets === 'object'
          && (plan.character.afkGoalTargets as Record<string, unknown>).level_alts_to
          || 20,
        ),
      }
      alt.afkEnabled = true
      alt.lastAfkAt = now
      nextSlots[plan.nextAltSlot] = alt
      return { type: 'switched-character', slots: nextSlots, activeSlot: plan.nextAltSlot }
    }
    const provisioning = applyLegacyAfkProvisioning(plan.character)
    return { type: 'none', character: provisioning.character }
  }

  planTick(
    character: LegacyCharacterSave,
    options: { inCombat: boolean; canAutoCast: boolean },
  ): LegacyAfkTickAction {
    let next = clone(character) as Record<string, any>
    next.mp = Math.min(Number(next.maxMp || 0), Number(next.mp || 0) + Number(next.mpRegen || 0))
    if (options.inCombat) {
      const hpThreshold = Math.max(5, Math.min(95, Number(next.autoHpPotionPercent || 35)))
      const mpThreshold = Math.max(5, Math.min(95, Number(next.autoMpPotionPercent || 20)))
      if (next.autoUseHpPotions !== false && Number(next.hp || 0) < Number(next.maxHp || 0) * hpThreshold / 100) {
        const potion = useBestLegacyPotion(next, 'hp')
        if (potion.used) return { type: 'none', character: potion.character }
      }
      if (next.autoUseMpPotions !== false && Number(next.mp || 0) < Number(next.maxMp || 0) * mpThreshold / 100) {
        const potion = useBestLegacyPotion(next, 'mp')
        if (potion.used) return { type: 'none', character: potion.character }
      }
      return { type: options.canAutoCast ? 'auto-cast' : 'attack', character: next }
    }
    const mpRestThreshold = Math.max(5, Math.min(95, Number(next.autoRestMpPercent || 20)))
    if (Number(next.mp || 0) < Number(next.maxMp || 0) * mpRestThreshold / 100) {
      const rest = applyLegacyAfkRest(next, 'mp')
      if (rest.applied) return { type: 'none', character: rest.character }
    }
    const hpRestThreshold = Math.max(5, Math.min(95, Number(next.autoRestHpPercent || 40)))
    if (Number(next.hp || 0) < Number(next.maxHp || 0) * hpRestThreshold / 100) {
      const rest = applyLegacyAfkRest(next, 'hp', this.#random.next())
      if (rest.applied) return { type: 'none', character: rest.character }
    }
    return { type: 'spawn', character: next }
  }

  recoverOffline(slots: LegacySlots, activeSlot: number, now = Date.now()): LegacyAfkOfflineResult {
    const source = slots[activeSlot]
    const last = Number(source?.lastAfkAt || 0)
    if (!source || !source.afkEnabled || last <= 0 || now <= last) return { slots, activeSlot, summary: null }
    const result = simulateLegacyPartyAfkReturn(slots, activeSlot, { elapsedMs: now - last, random: this.#random, now })
    return {
      slots: result.summary.applied ? result.slots : slots,
      activeSlot,
      summary: result.summary.applied ? result.summary : null,
    }
  }
}
