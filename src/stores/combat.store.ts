import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { formatCultivationPhrase, translateLegacyText, ZONES } from '../game-core/data'
import {
  createLegacyBossEncounter,
  createLegacyMob,
  createLegacyCombatJournalEvent,
  parseLegacyCombatJournal,
  replayLegacyCombatJournal,
  resolveLegacyDefeat,
  resolveLegacyFlee,
  resolveLegacySoloMobTurn,
  resolveLegacyPlayerAttack,
  resolveLegacySoloVictory,
  serializeLegacyCombatJournal,
  type LegacyCombatJournalEvent,
  type LegacyCombatJournalEventInput,
  type LegacyMobCombatant,
} from '../game-core/systems/combat'
import {
  getLegacyActiveSetBonusStats,
  getLegacyEquippedRunewordEffects,
} from '../game-core/systems/equipment'
import {
  castLegacySpell,
  executeLegacyAutoCast,
  getLegacyMaxMemorizedSpellSlots,
  type LegacySpellCastResult,
} from '../game-core/systems/spells'
import { createSystemRandom, type RandomSource } from '../game-core/rng'
import { useSaveStore } from './save.store'

export interface CombatLogEntry {
  id: number
  kind: 'info' | 'damage' | 'heal' | 'loot' | 'danger'
  text: string
  event: LegacyCombatJournalEvent
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export const useCombatStore = defineStore('combat', () => {
  const saves = useSaveStore()
  const mob = ref<LegacyMobCombatant | null>(null)
  const log = ref<CombatLogEntry[]>([])
  const busy = ref(false)
  let random: RandomSource = createSystemRandom()
  let eventId = 0

  const inCombat = computed(() => Boolean(mob.value && mob.value.hp > 0))
  const mobHpPercent = computed(() => mob.value ? Math.max(0, Math.min(100, mob.value.hp / mob.value.maxHp * 100)) : 0)
  const replaySummary = computed(() => replayLegacyCombatJournal(log.value.map((entry) => entry.event)))

  function addLog(
    text: string,
    kind: CombatLogEntry['kind'] = 'info',
    details: Omit<LegacyCombatJournalEventInput, 'message' | 'category'> = { type: 'info' },
  ): void {
    const id = ++eventId
    const event = createLegacyCombatJournalEvent({ ...details, message: text, category: kind }, id)
    log.value.push({ id, text, kind, event })
    if (log.value.length > 80) log.value.splice(0, log.value.length - 80)
  }

  function setRandomSource(source: RandomSource): void {
    random = source
  }

  function spawn(): LegacyMobCombatant | null {
    const character = saves.activeCharacter
    if (!character || inCombat.value) return mob.value
    mob.value = createLegacyMob({
      zoneIndex: Number(character.zone || 0),
      playerLevel: Number(character.level || 1),
      random,
    })
    const message = formatCultivationPhrase('encounter', {
      zone: translateLegacyText(ZONES[Number(character.zone || 0)]?.name || '历练区域'),
      enemy: translateLegacyText(mob.value.name),
    })
    addLog(message, 'info', { type: 'encounter', targetName: mob.value.name })
    return mob.value
  }

  function spawnBoss(now = Date.now()): LegacyMobCombatant | null {
    const character = saves.activeCharacter as Record<string, any> | null
    if (!character) return null
    const result = createLegacyBossEncounter({
      zoneIndex: Number(character.zone || 0),
      playerLevel: Number(character.level || 1),
      bossCooldowns: character.bossCooldowns,
      now,
      hasActiveEncounter: Boolean(mob.value),
      dungeonActive: Boolean(character.dungeon?.active),
    })
    if (!result.mob) {
      const messages = {
        'active-encounter': '请先结束当前战斗。',
        'dungeon-active': '请先离开秘境再挑战区域首领。',
        'no-boss': '此区域没有可挑战的首领。',
        cooldown: `首领仍在恢复，约 ${Math.ceil(Math.max(0, result.readyAt - now) / 60_000)} 分钟后可再次挑战。`,
      }
      addLog(messages[result.failure!], 'info', { type: 'action-failed' })
      return null
    }
    mob.value = result.mob
    addLog(`强大气息降临：${translateLegacyText(result.mob.name)}向你发起挑战。`, 'danger', {
      type: 'encounter',
      targetName: result.mob.name,
    })
    return result.mob
  }

  function handleVictory(character: Record<string, any>, defeated: LegacyMobCombatant): Record<string, any> {
    const result = resolveLegacySoloVictory(character, defeated, { random })
    for (const questName of result.questCompletions) addLog(`委托已完成：${translateLegacyText(questName)}。`, 'loot', { type: 'quest-complete', questId: questName })
    if (result.contractCompleted) addLog('契约目标已经完成。', 'loot', { type: 'contract-complete' })
    if (result.classQuestCompleted) addLog('传承试炼目标已完成。', 'loot', { type: 'class-quest-complete' })
    if (result.loot) {
      const item = result.loot as Record<string, any> | string
      const itemId = typeof item === 'string' ? item : item.name || item.base
      addLog(`发现战利品：${translateLegacyText(itemId)}。`, 'loot', { type: 'loot-drop', itemId })
    }
    if (result.rune) addLog(`获得符纹：${translateLegacyText(result.rune)}。`, 'loot', { type: 'rune-drop', runeId: result.rune })
    for (const bossDrop of result.bossLoot) {
      const item = bossDrop as Record<string, any> | string
      const itemId = typeof item === 'string' ? item : item.name || item.base
      addLog(`首领战利品：${translateLegacyText(itemId)}。`, 'loot', { type: 'loot-drop', itemId })
    }
    addLog(formatCultivationPhrase('victory', { enemy: translateLegacyText(defeated.name) }), 'loot', { type: 'victory', targetName: defeated.name })
    const xp = result.combatXp + result.questXp
    const gold = result.combatGold + result.questGold
    addLog(`${formatCultivationPhrase('rewardXp', { xp })} ${formatCultivationPhrase('rewardGold', { gold })}`, 'loot', { type: 'reward', xp, gold })
    return result.character
  }

  function handleDefeat(character: Record<string, any>, defeatedBy: LegacyMobCombatant): Record<string, any> | null {
    const result = resolveLegacyDefeat(character, defeatedBy)
    if (result.hardcore) {
      addLog(`${character.name} 在 ${translateLegacyText(defeatedBy.name)} 手中陨落，角色存档已删除。`, 'danger', { type: 'hardcore-death', actorName: defeatedBy.name, targetName: character.name })
      return null
    }
    addLog(`你被 ${translateLegacyText(defeatedBy.name)} 击败，遗失 ${result.lostGold} 枚灵石。`, 'danger', { type: 'defeat', actorName: defeatedBy.name, targetName: character.name, gold: result.lostGold })
    return result.character as Record<string, any>
  }

  function attack(): boolean {
    const source = saves.activeCharacter
    if (!source) return false
    if (!mob.value) {
      spawn()
      return false
    }
    if (busy.value) return false
    busy.value = true
    try {
      let character = clone(source) as Record<string, any>
      const currentMob = clone(mob.value)
      const set = getLegacyActiveSetBonusStats(character.equipment)
      const runeword = getLegacyEquippedRunewordEffects(character.equipment)
      const hit = resolveLegacyPlayerAttack(character as any, currentMob, random, {
        atkBonus: set.atk,
        critChanceBonus: runeword.crit,
      })
      if (hit.hit) {
        currentMob.hp = Math.max(0, currentMob.hp - hit.damage)
        if (hit.wardConsumed) {
          currentMob.wardReady = false
          addLog(`${translateLegacyText(currentMob.name)}以玄奥护盾削弱了这次攻击。`, 'info', { type: 'named-ward-absorbed', actorName: currentMob.name })
        }
        addLog(`你对${translateLegacyText(currentMob.name)}造成${hit.damage}点${hit.critical ? '会心' : ''}伤害。`, 'damage', { type: 'player-hit', actorName: character.name, targetName: currentMob.name, amount: hit.damage, critical: hit.critical })
      } else addLog(`${translateLegacyText(currentMob.name)}施展身法，避开了这次攻击。`, 'info', { type: 'player-miss', actorName: character.name, targetName: currentMob.name })

      if (currentMob.hp <= 0) {
        character = handleVictory(character, currentMob)
        mob.value = null
        saves.replaceActiveCharacter(character)
        void saves.persist()
        return true
      }
      const mobTurn = resolveLegacySoloMobTurn({
        player: character as any,
        mob: currentMob,
        random,
        stunned: hit.stunned,
        strikeModifiers: { mitigation: set.def },
      })
      character = mobTurn.player as Record<string, any>
      const resolvedMob = mobTurn.mob
      if (mobTurn.enrageTriggered) {
        addLog(`${translateLegacyText(resolvedMob.name)}气息暴涨，陷入狂暴。`, 'danger', { type: 'named-enrage', actorName: resolvedMob.name })
      }
      if (!mobTurn.stunned) {
        const strike = mobTurn.strike!
        if (strike.hit) {
          addLog(`${translateLegacyText(resolvedMob.name)}袭来，你损失${strike.damage}点${strike.critical ? '会心' : ''}气血。`, 'danger', { type: 'mob-hit', actorName: resolvedMob.name, targetName: character.name, amount: strike.damage, critical: strike.critical })
        } else addLog(formatCultivationPhrase('dodge'), 'info', { type: 'mob-miss', actorName: resolvedMob.name, targetName: character.name })
        if (mobTurn.venomDamage > 0) {
          addLog(`${translateLegacyText(resolvedMob.name)}的毒煞额外侵蚀你${mobTurn.venomDamage}点气血。`, 'danger', { type: 'named-venom', actorName: resolvedMob.name, targetName: character.name, amount: mobTurn.venomDamage })
        }
        if (mobTurn.wardRefreshed) {
          addLog(`${translateLegacyText(resolvedMob.name)}重新凝聚玄奥护盾。`, 'info', { type: 'named-ward', actorName: resolvedMob.name })
        }
      } else addLog(`${translateLegacyText(resolvedMob.name)}陷入眩晕，未能反击。`, 'info', { type: 'mob-stunned', actorName: resolvedMob.name })

      if (Number(character.hp || 0) <= 0) {
        const defeatedCharacter = handleDefeat(character, resolvedMob)
        mob.value = null
        if (!defeatedCharacter) {
          void saves.deleteCharacter(saves.activeSlot)
          return true
        }
        character = defeatedCharacter
      } else mob.value = resolvedMob
      saves.replaceActiveCharacter(character)
      void saves.persist()
      return true
    } finally {
      busy.value = false
    }
  }

  function applySpellResult(result: LegacySpellCastResult): boolean {
    if (!result.success) {
      const messages = { cooldown: '功法尚在调息之中。', 'insufficient-mana': '法力不足。', 'missing-target': '当前没有目标。', 'unknown-spell': '未找到该功法。' }
      addLog(messages[result.reason!], 'info', { type: 'action-failed', spellId: result.spell?.id })
      return false
    }
    let character = result.caster as Record<string, any>
    mob.value = result.target
    const spellName = translateLegacyText(result.spell?.name || '功法')
    addLog(formatCultivationPhrase('spellCast', { spell: spellName }), 'info', { type: 'spell-cast', actorName: character.name, spellId: result.spell?.id })
    if (result.spell?.kind === 'heal' || result.spell?.kind === 'mana') addLog(`${spellName}恢复${result.amount}点${result.spell.kind === 'mana' ? '法力' : '气血'}。`, 'heal', { type: result.spell.kind === 'mana' ? 'spell-mana' : 'spell-heal', actorName: character.name, targetName: result.healTargetId || character.name, amount: result.amount, spellId: result.spell.id })
    else addLog(formatCultivationPhrase('spellHit', {
      spell: spellName,
      enemy: translateLegacyText(result.target?.name || '目标'),
      damage: result.amount + result.poisonDamage,
    }), 'damage', { type: 'spell-damage', actorName: character.name, targetName: result.target?.name, amount: result.amount, secondaryAmount: result.poisonDamage, spellId: result.spell?.id })
    if (mob.value && mob.value.hp <= 0) {
      character = handleVictory(character, mob.value)
      mob.value = null
    }
    saves.replaceActiveCharacter(character)
    void saves.persist()
    return true
  }

  function cast(spellId: string): boolean {
    const source = saves.activeCharacter
    if (!source) return false
    return applySpellResult(castLegacySpell({
      classId: String(source.cls || ''),
      spellId,
      caster: source as any,
      target: mob.value,
      random,
    }))
  }

  function autoCast(now = Date.now()): boolean {
    const source = saves.activeCharacter as Record<string, any> | null
    if (!source) return false
    const result = executeLegacyAutoCast({
      classId: String(source.cls || ''),
      memorizedSpells: source.memorizedSpells,
      autoUseSkills: source.autoUseSkills !== false,
      autoSkillSlots: source.autoSkillSlots,
      maxSlots: getLegacyMaxMemorizedSpellSlots(Number(source.aa?.extraSpellSlots || 0)),
      caster: source as any,
      target: mob.value,
      random,
      now,
    })
    return result.cast ? applySpellResult(result.cast) : false
  }

  function flee(): void {
    const source = saves.activeCharacter
    if (!source || !mob.value) return
    const set = getLegacyActiveSetBonusStats(
      source.equipment as Record<string, unknown> | null | undefined,
    )
    const result = resolveLegacyFlee(source, mob.value, random, { mitigation: set.def })
    if (result.escaped) {
      mob.value = null
      addLog('你已退走，脱离战斗。', 'info', { type: 'flee', actorName: String(source.name || '') })
      return
    }
    let character = result.player as Record<string, any>
    if (result.strike?.hit) addLog(`退走失败，${translateLegacyText(result.mob.name)}对你造成${result.strike.damage}点伤害。`, 'danger', { type: 'flee-failed', actorName: result.mob.name, targetName: String(source.name || ''), amount: result.strike.damage })
    else addLog(`退走失败，但你避开了${translateLegacyText(result.mob.name)}的追击。`, 'info', { type: 'flee-failed', actorName: result.mob.name, targetName: String(source.name || ''), amount: 0 })
    if (Number(character.hp || 0) <= 0) {
      const defeatedCharacter = handleDefeat(character, result.mob)
      mob.value = null
      if (!defeatedCharacter) {
        void saves.deleteCharacter(saves.activeSlot)
        return
      }
      character = defeatedCharacter
    }
    saves.replaceActiveCharacter(character)
    void saves.persist()
  }

  function reset(): void {
    mob.value = null
    log.value = []
  }

  function exportJournal(): string {
    return serializeLegacyCombatJournal(log.value.map((entry) => entry.event))
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

  return { mob, log, busy, inCombat, mobHpPercent, replaySummary, setRandomSource, spawn, spawnBoss, attack, cast, autoCast, flee, reset, exportJournal, restoreJournal }
})
