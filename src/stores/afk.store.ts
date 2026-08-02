import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { LegacyAfkApplication, type LegacyAfkProfileSlot } from '../application/legacy'
import { V2AfkApplication } from '../application/v2'
import type { RandomSource } from '../game-core/rng'
import { getCharacterRuleset } from '../game-core/rulesets'
import {
  isV2Resting,
  isV2ZoneEnabled,
  type V2AutoConfiguration,
  type V2AutoStopReason,
  type V2OfflineSummary,
} from '../game-core/rulesets'
import type { LegacyAfkSummary } from '../game-core/systems/afk'
import { useCombatStore } from './combat.store'
import { useActionStore } from './action.store'
import { useSaveStore } from './save.store'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export const useAfkStore = defineStore('afk', () => {
  const saves = useSaveStore()
  const combat = useCombatStore()
  const actions = useActionStore()
  const application = new LegacyAfkApplication()
  const v2Application = new V2AfkApplication()
  const running = ref(false)
  const summary = ref<LegacyAfkSummary | V2OfflineSummary | null>(null)
  const hiddenAt = ref<number | null>(null)
  let timer: ReturnType<typeof setInterval> | null = null
  let lastHandledV2BattleId: string | null = null

  const isV2 = computed(() => getCharacterRuleset(saves.activeCharacter) === 'v2')
  const enabled = computed(() => isV2.value
    ? Boolean(saves.activeCharacter?.v2AfkEnabled)
    : Boolean(saves.activeCharacter?.afkEnabled))
  const legacySummary = computed(() => summary.value && 'xp' in summary.value ? summary.value : null)
  const v2Summary = computed(() => summary.value && 'victories' in summary.value ? summary.value : null)
  const v2Configuration = computed(() => saves.activeCharacter && isV2.value
    ? v2Application.getConfiguration(saves.activeCharacter)
    : null)

  function setRandomSource(source: RandomSource): void {
    application.setRandomSource(source)
  }

  function prepareGoal(now = Date.now()): boolean {
    if (isV2.value) return false
    const result = application.prepareGoal(saves.slots, saves.activeSlot, now)
    if (result.type === 'switched-character') {
      saves.replaceAllSlots(result.slots, result.activeSlot)
      combat.reset()
      return true
    }
    if (saves.activeCharacter) saves.replaceActiveCharacter(result.character)
    return false
  }

  function stopV2ForReason(reason: Exclude<V2AutoStopReason, null>): void {
    running.value = false
    if (timer) clearInterval(timer)
    timer = null
    const source = saves.activeCharacter
    if (!source) return
    const next = clone(source)
    next.v2AfkEnabled = false
    next.v2LastAfkAt = null
    next.v2LastAutoStopReason = reason
    saves.replaceActiveCharacter(next)
    void saves.persist()
  }

  function handleCompletedV2Battle(): void {
    const completed = combat.lastCompletedV2State
    if (!completed?.result || completed.id === lastHandledV2BattleId) return
    lastHandledV2BattleId = completed.id
    const configuration = v2Application.getConfiguration(saves.activeCharacter!)
    if (completed.encounter.boss && configuration.stopAtBoss) {
      stopV2ForReason('首领战停止')
    } else if (combat.lastV2InventoryFull && configuration.stopWhenInventoryFull) {
      stopV2ForReason('背包已满')
    }
  }

  function tick(): void {
    if (!saves.activeCharacter || !running.value) return
    if (isV2.value) {
      actions.tick()
      if (actions.resting) return
      const configuration = v2Application.getConfiguration(saves.activeCharacter)
      if (!combat.inCombat) {
        const prepared = v2Application.prepareEncounter(saves.activeCharacter)
        saves.replaceActiveCharacter(prepared.character)
        if (isV2Resting(prepared.character)) {
          void saves.persist()
          return
        }
        combat.spawn()
      } else {
        combat.autoResolve(1, configuration.healingThreshold, configuration.hpPillThreshold, configuration.mpPillThreshold)
        handleCompletedV2Battle()
      }
      void saves.persist()
      return
    }
    prepareGoal()
    const source = saves.activeCharacter
    if (!source) return
    const action = application.planTick(source, {
      inCombat: combat.inCombat,
      canAutoCast: source.autoUseSkills !== false,
    })
    if (action.type === 'switched-character') {
      saves.replaceAllSlots(action.slots, action.activeSlot)
      combat.reset()
      return
    }
    saves.replaceActiveCharacter(action.character)
    if (action.type === 'auto-cast') {
      if (!combat.autoCast()) combat.attack()
    } else if (action.type === 'attack') {
      combat.attack()
    } else if (action.type === 'spawn') {
      combat.spawn()
    } else if (action.type === 'none') {
      void saves.persist()
    }
  }

  async function start(): Promise<boolean> {
    if (!saves.activeCharacter || running.value) return false
    if (isV2.value) {
      const now = Date.now()
      const next = clone(saves.activeCharacter)
      next.v2AfkEnabled = true
      next.v2LastAfkAt = now
      next.v2AutoConfiguration = v2Application.getConfiguration(next)
      const preparedCharacter = combat.inCombat
        ? next
        : v2Application.prepareEncounter(next, now).character
      saves.replaceActiveCharacter(preparedCharacter)
      lastHandledV2BattleId = combat.lastCompletedV2State?.id || null
      running.value = true
      timer = setInterval(tick, 2_500)
      await saves.persist()
      return true
    }
    prepareGoal()
    const prepared = saves.activeCharacter
    if (!prepared) return false
    const next = clone(prepared)
    next.afkEnabled = true
    next.lastAfkAt = Date.now()
    saves.replaceActiveCharacter(next)
    running.value = true
    timer = setInterval(tick, Math.max(400, Number(next.afkIntervalMs || 1200)))
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
    if (isV2.value) {
      next.v2AfkEnabled = false
      next.v2LastAfkAt = null
    } else {
      next.afkEnabled = false
      next.lastAfkAt = null
    }
    saves.replaceActiveCharacter(next)
    await saves.persist()
  }

  async function recoverOffline(now = Date.now()): Promise<LegacyAfkSummary | V2OfflineSummary | null> {
    if (isV2.value) {
      const source = saves.activeCharacter
      const last = Math.floor(Number(source?.v2LastAfkAt || 0))
      if (!source?.v2AfkEnabled || last <= 0 || now - last < 10_000) return null
      const result = v2Application.recoverOffline(source, now - last, `p2-offline:${saves.activeSlot}:${last}:${now}`)
      result.character.v2LastAfkAt = now
      saves.replaceActiveCharacter(result.character)
      summary.value = result.summary
      await saves.persist()
      return result.summary
    }
    const result = application.recoverOffline(saves.slots, saves.activeSlot, now)
    if (!result.summary) return null
    saves.replaceAllSlots(result.slots, result.activeSlot)
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
        if (isV2.value) next.v2LastAfkAt = now
        else next.lastAfkAt = now
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

  function updateConfiguration(patch: Record<string, unknown>): boolean {
    const source = saves.activeCharacter
    if (!source) return false
    if (isV2.value) {
      saves.replaceActiveCharacter(v2Application.updateConfiguration(source, patch as Partial<V2AutoConfiguration>))
      void saves.persist()
      return true
    }
    saves.replaceActiveCharacter(application.updateConfiguration(source, patch))
    void saves.persist()
    return true
  }

  function setGoal(goal: string): boolean {
    const source = saves.activeCharacter
    if (!source) return false
    if (isV2.value) return updateConfiguration({ goal })
    saves.replaceActiveCharacter(application.setGoal(source, goal))
    void saves.persist()
    return true
  }

  function setZone(zoneIndex: number): boolean {
    const source = saves.activeCharacter
    if (!source || combat.inCombat || (isV2.value && actions.resting)) return false
    if (isV2.value) {
      if (!isV2ZoneEnabled(zoneIndex)) return false
      const next = clone(source)
      next.zone = zoneIndex
      next.v2AutoConfiguration = { ...v2Application.getConfiguration(next), zoneIndex }
      saves.replaceActiveCharacter(next)
      combat.reset()
      void saves.persist()
      return true
    }
    const next = application.setZone(source, zoneIndex)
    if (!next) return false
    saves.replaceActiveCharacter(next)
    combat.reset()
    void saves.persist()
    return true
  }

  function setHuntTarget(target: string): boolean {
    const source = saves.activeCharacter
    if (!source || isV2.value || combat.inCombat) return false
    saves.replaceActiveCharacter(application.setHuntTarget(source, target))
    void saves.persist()
    return true
  }

  function bindZone(zoneIndex: number): boolean {
    const source = saves.activeCharacter
    if (!source || isV2.value) return false
    const next = application.bindZone(source, zoneIndex)
    if (!next) return false
    saves.replaceActiveCharacter(next)
    void saves.persist()
    return true
  }

  function saveProfile(slot: LegacyAfkProfileSlot): boolean {
    const source = saves.activeCharacter
    if (!source || isV2.value) return false
    saves.replaceActiveCharacter(application.saveProfile(source, slot))
    void saves.persist()
    return true
  }

  function loadProfile(slot: LegacyAfkProfileSlot): boolean {
    const source = saves.activeCharacter
    if (!source || isV2.value || combat.inCombat) return false
    const next = application.loadProfile(source, slot)
    if (!next) return false
    saves.replaceActiveCharacter(next)
    combat.reset()
    void saves.persist()
    return true
  }

  return {
    running,
    isV2,
    enabled,
    summary,
    legacySummary,
    v2Summary,
    v2Configuration,
    hiddenAt,
    setRandomSource,
    tick,
    start,
    stop,
    recoverOffline,
    handleVisibility,
    clearSummary,
    updateConfiguration,
    setGoal,
    setZone,
    setHuntTarget,
    bindZone,
    saveProfile,
    loadProfile,
  }
})
