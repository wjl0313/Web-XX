import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import {
  LegacyBattleApplication,
  type LegacyBattleNotice,
  type LegacyBattleTransition,
} from '../application/legacy'
import {
  V2BattleApplication,
  type V2BattleApplicationTransition,
  type V2BattleNotice,
} from '../application/v2'
import type { RandomSource } from '../game-core/rng'
import {
  createLegacyCombatJournalEvent,
  parseLegacyCombatJournal,
  replayLegacyCombatJournal,
  serializeLegacyCombatJournal,
  type LegacyCombatJournalEvent,
  type LegacyMobCombatant,
} from '../game-core/systems/combat'
import {
  PlayerAutoStrategy,
  V2_ENEMIES,
  V2_TECHNIQUES,
  explainDamage,
  getCharacterRuleset,
  type BattleCommand,
  type BattleEvent,
  type BattleState,
  type DamageBreakdown,
} from '../game-core/rulesets'
import { useSaveStore } from './save.store'

export interface CombatLogEntry {
  id: number
  kind: 'info' | 'damage' | 'heal' | 'loot' | 'danger'
  text: string
  event: LegacyCombatJournalEvent | BattleEvent
}

function isLegacyJournalEvent(
  event: LegacyCombatJournalEvent | BattleEvent,
): event is LegacyCombatJournalEvent {
  return 'occurredAt' in event && 'category' in event
}

export const useCombatStore = defineStore('combat', () => {
  const saves = useSaveStore()
  const application = new LegacyBattleApplication()
  const v2Application = new V2BattleApplication()
  const mob = ref<LegacyMobCombatant | null>(null)
  const v2State = ref<BattleState | null>(null)
  const lastCompletedV2State = ref<BattleState | null>(null)
  const lastV2InventoryFull = ref(false)
  const v2Seed = ref<string | null>(null)
  const log = ref<CombatLogEntry[]>([])
  const busy = ref(false)
  let eventId = 0
  let completedMobTimer: ReturnType<typeof setTimeout> | null = null

  const ruleset = computed(() => getCharacterRuleset(saves.activeCharacter))
  const isV2 = computed(() => ruleset.value === 'v2')
  const inCombat = computed(() => isV2.value
    ? Boolean(v2State.value && v2State.value.phase !== 'COMPLETED')
    : Boolean(mob.value && mob.value.hp > 0))
  const mobHpPercent = computed(() => mob.value ? Math.max(0, Math.min(100, mob.value.hp / mob.value.maxHp * 100)) : 0)
  const replaySummary = computed(() => replayLegacyCombatJournal(log.value
    .map((entry) => entry.event)
    .filter(isLegacyJournalEvent)))
  const v2PlayerActor = computed(() => v2State.value?.actors.player || null)
  const v2EnemyActor = computed(() => v2State.value?.actors.enemy || lastCompletedV2State.value?.actors.enemy || null)
  const waitingForPlayer = computed(() => Boolean(v2State.value?.phase === 'WAITING_FOR_COMMAND' && v2State.value.activeActorId === 'player'))
  const lastDamageBreakdown = computed<DamageBreakdown | null>(() => {
    const source = v2State.value || lastCompletedV2State.value
    return [...(source?.events || [])].reverse().find((event) => event.breakdown)?.breakdown || null
  })
  const lastDamageExplanation = computed(() => {
    const source = v2State.value || lastCompletedV2State.value
    const event = [...(source?.events || [])].reverse().find((entry) => entry.breakdown)
    return event ? explainDamage(event) : null
  })

  function addNotice(entry: LegacyBattleNotice): void {
    const id = ++eventId
    const event = createLegacyCombatJournalEvent({
      ...entry.details,
      message: entry.text,
      category: entry.kind,
    }, id)
    log.value.push({ id, text: entry.text, kind: entry.kind, event })
    if (log.value.length > 80) log.value.splice(0, log.value.length - 80)
  }

  function addV2Notice(entry: V2BattleNotice): void {
    const id = ++eventId
    log.value.push({ id, text: entry.text, kind: entry.kind, event: entry.event })
    if (log.value.length > 120) log.value.splice(0, log.value.length - 120)
  }

  function syncV2Mob(state: BattleState | null): void {
    const enemy = state?.actors.enemy
    if (!enemy) {
      mob.value = null
      return
    }
    const definitionId = state.encounter.enemyContentId
    const definition = V2_ENEMIES[definitionId]
    mob.value = {
      name: enemy.name,
      baseName: definitionId,
      level: enemy.level,
      hp: enemy.hp,
      maxHp: enemy.maxHp,
      atk: enemy.attack,
      def: enemy.defense,
      elite: definition?.rank === 'elite',
      named: definition?.rank === 'elite',
      boss: definition?.rank === 'boss' || state.encounter.boss,
    }
  }

  function applyV2Transition(result: V2BattleApplicationTransition): boolean {
    result.notices.forEach(addV2Notice)
    if (saves.activeSlot >= 0) saves.replaceActiveCharacter(result.character)
    if (result.completedState) lastCompletedV2State.value = result.completedState
    lastV2InventoryFull.value = Boolean(result.inventoryFull)
    v2State.value = result.state
    if (completedMobTimer) clearTimeout(completedMobTimer)
    completedMobTimer = null
    if (result.state) {
      syncV2Mob(result.state)
    } else if (result.completedState) {
      const completedId = result.completedState.id
      syncV2Mob(result.completedState)
      completedMobTimer = setTimeout(() => {
        if (!v2State.value && lastCompletedV2State.value?.id === completedId) mob.value = null
        completedMobTimer = null
      }, 1_400)
    } else {
      syncV2Mob(null)
    }
    if (result.validationReason) {
      const id = ++eventId
      log.value.push({
        id,
        kind: 'info',
        text: typeof result.validationReason === 'string' ? `行动未执行：${result.validationReason}。` : '行动未执行。',
        event: {
          sequence: id,
          type: 'ActionDeclared',
          round: v2State.value?.round || 0,
          message: typeof result.validationReason === 'string' ? `行动未执行：${result.validationReason}。` : '行动未执行。',
        },
      })
    }
    if (result.persist) void saves.persist()
    return result.applied
  }

  function applyTransition(result: LegacyBattleTransition): boolean {
    mob.value = result.mob
    result.notices.forEach(addNotice)
    if (result.deleteCharacter) {
      void saves.deleteCharacter(saves.activeSlot)
      return result.applied
    }
    if (result.character && saves.activeSlot >= 0) saves.replaceActiveCharacter(result.character)
    if (result.persist) void saves.persist()
    return result.applied
  }

  function setRandomSource(source: RandomSource): void {
    application.setRandomSource(source)
  }

  function spawn(): LegacyMobCombatant | null {
    const character = saves.activeCharacter
    if (!character) return null
    if (isV2.value) {
      const result = v2Application.startEncounter(character, v2State.value, { seed: v2Seed.value || undefined })
      applyV2Transition(result)
      return mob.value
    }
    const result = application.spawn(character, mob.value)
    mob.value = result.mob
    result.notices.forEach(addNotice)
    return mob.value
  }

  function spawnBoss(now = Date.now()): LegacyMobCombatant | null {
    const character = saves.activeCharacter
    if (!character) return null
    if (isV2.value) {
      const result = v2Application.startEncounter(character, v2State.value, { seed: v2Seed.value || `v2-boss-${now}`, boss: true })
      applyV2Transition(result)
      return mob.value
    }
    const result = application.spawnBoss(character, mob.value, now)
    mob.value = result.mob
    result.notices.forEach(addNotice)
    return result.notices.some((entry) => entry.details.type === 'encounter') ? result.mob : null
  }

  function attack(): boolean {
    const character = saves.activeCharacter
    if (!character) return false
    if (isV2.value) {
      if (!v2State.value) {
        spawn()
        return false
      }
      if (!waitingForPlayer.value) return false
      return applyV2Transition(v2Application.executeCommand(character, v2State.value, {
        type: 'basic_attack', actorId: 'player', targetId: 'enemy',
      }))
    }
    if (!mob.value) {
      spawn()
      return false
    }
    if (busy.value) return false
    busy.value = true
    try {
      return applyTransition(application.attack(character, mob.value))
    } finally {
      busy.value = false
    }
  }

  function cast(spellId: string): boolean {
    const character = saves.activeCharacter
    if (!character) return false
    if (isV2.value) {
      const technique = V2_TECHNIQUES[spellId]
      if (!technique || !v2State.value || !waitingForPlayer.value) return false
      const command: BattleCommand = {
        type: 'use_technique', actorId: 'player', techniqueId: spellId,
        targetId: technique.target === 'self' ? 'player' : 'enemy',
      }
      return applyV2Transition(v2Application.executeCommand(character, v2State.value, command))
    }
    return applyTransition(application.cast(character, mob.value, spellId))
  }

  function usePill(pillId: '回春丹' | '回灵丹'): boolean {
    const character = saves.activeCharacter
    if (!character || !isV2.value || !v2State.value || !waitingForPlayer.value) return false
    return applyV2Transition(v2Application.executeCommand(character, v2State.value, { type: 'use_pill', actorId: 'player', pillId }))
  }

  function autoCast(now = Date.now()): boolean {
    const character = saves.activeCharacter
    if (!character) return false
    if (isV2.value) {
      if (!v2State.value) return false
      return applyV2Transition(v2Application.executeStrategy(character, v2State.value, new PlayerAutoStrategy(), 1))
    }
    return applyTransition(application.autoCast(character, mob.value, now))
  }

  function flee(): void {
    const character = saves.activeCharacter
    if (!character || !mob.value) return
    if (isV2.value) {
      if (!v2State.value || !waitingForPlayer.value) return
      applyV2Transition(v2Application.executeCommand(character, v2State.value, { type: 'escape', actorId: 'player' }))
      return
    }
    applyTransition(application.flee(character, mob.value))
  }

  function autoResolve(maximumCommands = 500, healingThreshold = 0.4, hpPillThreshold = 0.3, mpPillThreshold = 0.2): boolean {
    const character = saves.activeCharacter
    if (!character || !isV2.value || !v2State.value) return false
    return applyV2Transition(v2Application.executeStrategy(
      character,
      v2State.value,
      new PlayerAutoStrategy(healingThreshold, hpPillThreshold, mpPillThreshold),
      maximumCommands,
    ))
  }

  function setV2Seed(seed: string | null): void {
    v2Seed.value = seed && seed.trim() ? seed.trim() : null
  }

  function reset(): void {
    if (completedMobTimer) clearTimeout(completedMobTimer)
    completedMobTimer = null
    mob.value = null
    v2State.value = null
    lastCompletedV2State.value = null
    lastV2InventoryFull.value = false
    log.value = []
  }

  function exportJournal(): string {
    if (isV2.value) {
      return JSON.stringify({ ruleset: 'v2', state: v2State.value || lastCompletedV2State.value, log: log.value })
    }
    return serializeLegacyCombatJournal(log.value.map((entry) => entry.event).filter(isLegacyJournalEvent))
  }

  function restoreJournal(raw: string): boolean {
    const parsed = parseLegacyCombatJournal(raw)
    if (!parsed.journal) return false
    const events = parsed.journal.events.slice(-80)
    log.value = events.map((event) => ({
      id: event.sequence,
      kind: event.category,
      text: event.message,
      event,
    }))
    eventId = events.at(-1)?.sequence || 0
    return true
  }

  return {
    mob,
    ruleset,
    isV2,
    v2State,
    lastCompletedV2State,
    lastV2InventoryFull,
    v2PlayerActor,
    v2EnemyActor,
    waitingForPlayer,
    lastDamageBreakdown,
    lastDamageExplanation,
    log,
    busy,
    inCombat,
    mobHpPercent,
    replaySummary,
    setRandomSource,
    spawn,
    spawnBoss,
    attack,
    cast,
    usePill,
    autoCast,
    autoResolve,
    flee,
    setV2Seed,
    reset,
    exportJournal,
    restoreJournal,
  }
})
