import { computed } from 'vue'
import { defineStore } from 'pinia'

import {
  advanceV2Rest,
  getCharacterRuleset,
  getV2RestActionState,
  getV2RestHealingTechniques,
  getV2RestRecoveryPerSecond,
  getV2RestRemainingMs,
  isV2Resting,
  startV2Rest,
  useV2RestHealingPill,
  useV2RestHealingTechnique,
} from '../game-core/rulesets'
import { useSaveStore } from './save.store'

export const useActionStore = defineStore('action-v2', () => {
  const saves = useSaveStore()
  let timer: ReturnType<typeof setInterval> | null = null
  let lastPersistedAt = 0

  const isV2 = computed(() => getCharacterRuleset(saves.activeCharacter) === 'v2')
  const resting = computed(() => isV2.value && isV2Resting(saves.activeCharacter))
  const state = computed(() => getV2RestActionState(saves.activeCharacter))
  const recoveryPerSecond = computed(() => saves.activeCharacter && resting.value
    ? getV2RestRecoveryPerSecond(saves.activeCharacter)
    : 0)
  const remainingSeconds = computed(() => saves.activeCharacter && resting.value
    ? Math.ceil(getV2RestRemainingMs(saves.activeCharacter) / 1_000)
    : 0)
  const healingTechniques = computed(() => saves.activeCharacter && resting.value
    ? getV2RestHealingTechniques(saves.activeCharacter)
    : [])

  function persistIfNeeded(now: number, force = false): void {
    if (!force && now - lastPersistedAt < 5_000) return
    lastPersistedAt = now
    void saves.persist()
  }

  function tick(now = Date.now()): number {
    const source = saves.activeCharacter
    if (!source || !isV2.value || !isV2Resting(source)) return 0
    const result = advanceV2Rest(source, now)
    if (result.elapsedTicks <= 0 && !result.completed) return 0
    saves.replaceActiveCharacter(result.character)
    persistIfNeeded(now, result.completed)
    return result.recovered
  }

  function beginRest(now = Date.now()): boolean {
    const source = saves.activeCharacter
    if (!source || !isV2.value || Number(source.hp || 0) >= Number(source.maxHp || 1)) return false
    const next = startV2Rest(source, 'manual', now)
    if (!isV2Resting(next)) return false
    saves.replaceActiveCharacter(next)
    persistIfNeeded(now, true)
    return true
  }

  function useHealingPill(): number {
    const source = saves.activeCharacter
    if (!source || !isV2.value) return 0
    const result = useV2RestHealingPill(source)
    if (!result) return 0
    saves.replaceActiveCharacter(result.character)
    persistIfNeeded(Date.now(), true)
    return result.recovered
  }

  function useHealingTechnique(techniqueId: string): number {
    const source = saves.activeCharacter
    if (!source || !isV2.value) return 0
    const result = useV2RestHealingTechnique(source, techniqueId)
    if (!result) return 0
    saves.replaceActiveCharacter(result.character)
    persistIfNeeded(Date.now(), true)
    return result.recovered
  }

  function startTimer(): void {
    if (timer) return
    tick()
    timer = setInterval(() => tick(), 1_000)
  }

  function stopTimer(): void {
    if (timer) clearInterval(timer)
    timer = null
    tick()
    if (saves.activeCharacter && resting.value) persistIfNeeded(Date.now(), true)
  }

  return {
    isV2,
    resting,
    state,
    recoveryPerSecond,
    remainingSeconds,
    healingTechniques,
    tick,
    beginRest,
    useHealingPill,
    useHealingTechnique,
    startTimer,
    stopTimer,
  }
})
