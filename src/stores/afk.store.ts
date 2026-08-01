import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { createSystemRandom, type RandomSource } from '../game-core/rng'
import {
  applyLegacyAfkProvisioning,
  applyLegacyAfkRest,
  planLegacyAfkGoal,
  simulateLegacyPartyAfkReturn,
  useBestLegacyPotion,
  type LegacyAfkSummary,
} from '../game-core/systems/afk'
import { useCombatStore } from './combat.store'
import { useSaveStore } from './save.store'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export const useAfkStore = defineStore('afk', () => {
  const saves = useSaveStore()
  const combat = useCombatStore()
  const running = ref(false)
  const summary = ref<LegacyAfkSummary | null>(null)
  const hiddenAt = ref<number | null>(null)
  let timer: ReturnType<typeof setInterval> | null = null
  let random: RandomSource = createSystemRandom()

  const enabled = computed(() => Boolean(saves.activeCharacter?.afkEnabled))

  function setRandomSource(source: RandomSource): void {
    random = source
  }

  function prepareGoal(now = Date.now()): boolean {
    const source = saves.activeCharacter
    if (!source) return false
    const plan = planLegacyAfkGoal(source, {
      slots: saves.slots,
      activeSlot: saves.activeSlot,
    })
    if (plan.nextAltSlot !== null) {
      const nextSlots = clone(saves.slots)
      const current = plan.character
      current.afkEnabled = false
      current.lastAfkAt = null
      nextSlots[saves.activeSlot] = current
      const alt = clone(nextSlots[plan.nextAltSlot]!)
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
      saves.replaceAllSlots(nextSlots, plan.nextAltSlot)
      combat.reset()
      return true
    }
    const provisioning = applyLegacyAfkProvisioning(plan.character)
    saves.replaceActiveCharacter(provisioning.character)
    return false
  }

  function tick(): void {
    if (!saves.activeCharacter || !running.value) return
    prepareGoal()
    const source = saves.activeCharacter
    if (!source) return
    let character = clone(source)
    character.mp = Math.min(
      Number(character.maxMp || 0),
      Number(character.mp || 0) + Number(character.mpRegen || 0),
    )
    saves.replaceActiveCharacter(character)

    if (combat.inCombat) {
      const hpThreshold = Math.max(5, Math.min(95, Number(character.autoHpPotionPercent || 35)))
      const mpThreshold = Math.max(5, Math.min(95, Number(character.autoMpPotionPercent || 20)))
      if (character.autoUseHpPotions !== false && Number(character.hp || 0) < Number(character.maxHp || 0) * hpThreshold / 100) {
        const potion = useBestLegacyPotion(character, 'hp')
        if (potion.used) {
          saves.replaceActiveCharacter(potion.character)
          void saves.persist()
          return
        }
      }
      if (character.autoUseMpPotions !== false && Number(character.mp || 0) < Number(character.maxMp || 0) * mpThreshold / 100) {
        const potion = useBestLegacyPotion(character, 'mp')
        if (potion.used) {
          saves.replaceActiveCharacter(potion.character)
          void saves.persist()
          return
        }
      }
      if (combat.autoCast()) return
      combat.attack()
      return
    }

    const mpRestThreshold = Math.max(5, Math.min(95, Number(character.autoRestMpPercent || 20)))
    if (Number(character.mp || 0) < Number(character.maxMp || 0) * mpRestThreshold / 100) {
      const rest = applyLegacyAfkRest(character, 'mp')
      if (rest.applied) {
        saves.replaceActiveCharacter(rest.character)
        return
      }
    }
    const hpRestThreshold = Math.max(5, Math.min(95, Number(character.autoRestHpPercent || 40)))
    if (Number(character.hp || 0) < Number(character.maxHp || 0) * hpRestThreshold / 100) {
      const rest = applyLegacyAfkRest(character, 'hp', random.next())
      if (rest.applied) {
        saves.replaceActiveCharacter(rest.character)
        return
      }
    }
    combat.spawn()
  }

  async function start(): Promise<boolean> {
    const source = saves.activeCharacter
    if (!source || running.value) return false
    prepareGoal()
    const prepared = saves.activeCharacter
    if (!prepared) return false
    const next = clone(prepared)
    next.afkEnabled = true
    next.lastAfkAt = Date.now()
    saves.replaceActiveCharacter(next)
    running.value = true
    timer = setInterval(tick, 1200)
    await saves.persist()
    return true
  }

  async function stop(): Promise<void> {
    if (timer) clearInterval(timer)
    timer = null
    running.value = false
    const source = saves.activeCharacter
    if (!source) return
    const next = clone(source)
    next.afkEnabled = false
    next.lastAfkAt = null
    saves.replaceActiveCharacter(next)
    await saves.persist()
  }

  async function recoverOffline(now = Date.now()): Promise<LegacyAfkSummary | null> {
    const source = saves.activeCharacter
    const last = Number(source?.lastAfkAt || 0)
    if (!source || !source.afkEnabled || last <= 0 || now <= last) return null
    const result = simulateLegacyPartyAfkReturn(saves.slots, saves.activeSlot, { elapsedMs: now - last, random, now })
    if (!result.summary.applied) return null
    saves.replaceAllSlots(result.slots, saves.activeSlot)
    summary.value = result.summary
    await saves.persist()
    return result.summary
  }

  async function handleVisibility(hidden: boolean, now = Date.now()): Promise<void> {
    if (!enabled.value) return
    if (hidden) {
      hiddenAt.value = now
      const source = saves.activeCharacter
      if (source) {
        const next = clone(source)
        next.lastAfkAt = now
        saves.replaceActiveCharacter(next)
        await saves.persist()
      }
      return
    }
    if (hiddenAt.value) {
      await recoverOffline(now)
      hiddenAt.value = null
    }
  }

  function clearSummary(): void {
    summary.value = null
  }

  return { running, enabled, summary, hiddenAt, setRandomSource, tick, start, stop, recoverOffline, handleVisibility, clearSummary }
})
