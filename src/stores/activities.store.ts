import { computed } from 'vue'
import { defineStore } from 'pinia'

import { V2ActivitiesApplication } from '../application/v2'
import {
  getAlchemyV2Queue,
  getCaveTrainingTask,
  getP2DungeonState,
  type P2DungeonModifierId,
  type P2PillId,
} from '../game-core/rulesets/v2'
import { getCharacterRuleset } from '../game-core/rulesets'
import { useCombatStore } from './combat.store'
import { useActionStore } from './action.store'
import { useSaveStore } from './save.store'

export const useActivitiesStore = defineStore('activities-v2', () => {
  const saves = useSaveStore()
  const combat = useCombatStore()
  const actions = useActionStore()
  const application = new V2ActivitiesApplication()
  let sequence = 0
  const isV2 = computed(() => getCharacterRuleset(saves.activeCharacter) === 'v2')
  const dungeon = computed(() => saves.activeCharacter && isV2.value ? getP2DungeonState(saves.activeCharacter) : null)
  const caveTask = computed(() => saves.activeCharacter && isV2.value ? getCaveTrainingTask(saves.activeCharacter) : null)
  const alchemyQueue = computed(() => saves.activeCharacter && isV2.value ? getAlchemyV2Queue(saves.activeCharacter) : [])

  function enterDungeon(modifierId: P2DungeonModifierId, autoDive: boolean): boolean {
    if (!saves.activeCharacter || !isV2.value || combat.inCombat || actions.resting) return false
    saves.replaceActiveCharacter(application.enterDungeon(saves.activeCharacter, modifierId, autoDive))
    void saves.persist()
    return true
  }

  function challengeDungeon(auto = false): number | null {
    if (!saves.activeCharacter || !isV2.value || combat.inCombat || actions.resting) return null
    const seed = `p2-dungeon-${Date.now()}-${++sequence}`
    if (auto) {
      const result = application.autoDiveDungeon(saves.activeCharacter, seed)
      saves.replaceActiveCharacter(result.character)
      void saves.persist()
      return result.results.length
    }
    const result = application.challengeDungeon(saves.activeCharacter, seed)
    if (!result) return null
    saves.replaceActiveCharacter(result.character)
    void saves.persist()
    return result.victory ? 1 : 0
  }

  function startCave(techniqueId: string, minutes: number): boolean {
    if (!saves.activeCharacter || !isV2.value || actions.resting) return false
    const next = application.startCaveTraining(saves.activeCharacter, techniqueId, minutes)
    if (!next) return false
    saves.replaceActiveCharacter(next)
    void saves.persist()
    return true
  }

  function claimCave(): string | null {
    if (!saves.activeCharacter || !isV2.value || actions.resting) return null
    const result = application.claimCaveTraining(saves.activeCharacter)
    if (!result) return null
    saves.replaceActiveCharacter(result.character)
    void saves.persist()
    return `${result.techniqueId}:${result.points}:${result.masteryName}`
  }

  function queueAlchemy(recipeId: P2PillId, count: number): boolean {
    if (!saves.activeCharacter || !isV2.value || actions.resting) return false
    const next = application.queueAlchemy(saves.activeCharacter, recipeId, count)
    if (!next) return false
    saves.replaceActiveCharacter(next)
    void saves.persist()
    return true
  }

  function claimAlchemy(): Partial<Record<P2PillId, number>> | null {
    if (!saves.activeCharacter || !isV2.value || actions.resting) return null
    const result = application.claimAlchemy(saves.activeCharacter)
    if (!result) return null
    saves.replaceActiveCharacter(result.character)
    void saves.persist()
    return result.claimed
  }

  function usePill(pillId: P2PillId): boolean {
    if (!saves.activeCharacter || !isV2.value || combat.inCombat) return false
    if (actions.resting) return pillId === '回春丹' && actions.useHealingPill() > 0
    const next = application.usePill(saves.activeCharacter, pillId)
    if (!next) return false
    saves.replaceActiveCharacter(next)
    void saves.persist()
    return true
  }

  return { isV2, dungeon, caveTask, alchemyQueue, enterDungeon, challengeDungeon, startCave, claimCave, queueAlchemy, claimAlchemy, usePill }
})
