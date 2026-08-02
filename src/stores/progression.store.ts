import { computed } from 'vue'
import { defineStore } from 'pinia'

import { V2ProgressionApplication } from '../application/v2'
import { GROWTH_STRATEGIES, getRealmDefinition, getV2ProgressionState, type GrowthStrategyId } from '../game-core/domain/progression'
import { getCharacterRuleset } from '../game-core/rulesets'
import { useCombatStore } from './combat.store'
import { useActionStore } from './action.store'
import { useSaveStore } from './save.store'

export const useProgressionStore = defineStore('progression-v2', () => {
  const saves = useSaveStore()
  const combat = useCombatStore()
  const actions = useActionStore()
  const application = new V2ProgressionApplication()
  const isV2 = computed(() => getCharacterRuleset(saves.activeCharacter) === 'v2')
  const state = computed(() => saves.activeCharacter && isV2.value ? getV2ProgressionState(saves.activeCharacter) : null)
  const realm = computed(() => state.value ? getRealmDefinition(state.value.realm.realmId) : null)
  const strategies = Object.values(GROWTH_STRATEGIES)

  function setGrowthStrategy(strategyId: GrowthStrategyId): boolean {
    if (!saves.activeCharacter || !isV2.value || combat.inCombat || actions.resting) return false
    saves.replaceActiveCharacter(application.setGrowthStrategy(saves.activeCharacter, strategyId))
    void saves.persist()
    return true
  }

  function breakthrough(): boolean {
    if (!saves.activeCharacter || !isV2.value || actions.resting) return false
    const next = application.breakthrough(saves.activeCharacter, combat.inCombat)
    if (!next) return false
    saves.replaceActiveCharacter(next)
    void saves.persist()
    return true
  }

  return { isV2, state, realm, strategies, setGrowthStrategy, breakthrough }
})
