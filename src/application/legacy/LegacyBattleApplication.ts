import { formatCultivationPhrase, translateLegacyText, ZONES } from '../../game-core/data'
import { createSystemRandom, type RandomSource } from '../../game-core/rng'
import {
  createLegacyBossEncounter,
  createLegacyMob,
  resolveLegacyDefeat,
  resolveLegacyFlee,
  resolveLegacySoloMobTurn,
  resolveLegacyPlayerAttack,
  resolveLegacySoloVictory,
  type LegacyCombatJournalEventInput,
  type LegacyMobCombatant,
} from '../../game-core/systems/combat'
import {
  getLegacyActiveSetBonusStats,
  getLegacyEquippedRunewordEffects,
} from '../../game-core/systems/equipment'
import {
  castLegacySpell,
  executeLegacyAutoCast,
  getLegacyMaxMemorizedSpellSlots,
  type LegacySpellCastResult,
} from '../../game-core/systems/spells'
import type { LegacyCharacterSave } from '../../game-core/save'

export type LegacyBattleNoticeKind = 'info' | 'damage' | 'heal' | 'loot' | 'danger'

export interface LegacyBattleNotice {
  text: string
  kind: LegacyBattleNoticeKind
  details: Omit<LegacyCombatJournalEventInput, 'message' | 'category'>
}

export interface LegacyBattleTransition {
  applied: boolean
  character: LegacyCharacterSave | null
  mob: LegacyMobCombatant | null
  notices: LegacyBattleNotice[]
  deleteCharacter: boolean
  persist: boolean
}

export interface LegacyEncounterTransition {
  mob: LegacyMobCombatant | null
  notices: LegacyBattleNotice[]
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function notice(
  text: string,
  kind: LegacyBattleNoticeKind = 'info',
  details: Omit<LegacyCombatJournalEventInput, 'message' | 'category'> = { type: 'info' },
): LegacyBattleNotice {
  return { text, kind, details }
}

export class LegacyBattleApplication {
  #random: RandomSource

  constructor(random: RandomSource = createSystemRandom()) {
    this.#random = random
  }

  setRandomSource(random: RandomSource): void {
    this.#random = random
  }

  spawn(character: LegacyCharacterSave, currentMob: LegacyMobCombatant | null): LegacyEncounterTransition {
    if (currentMob?.hp && currentMob.hp > 0) return { mob: currentMob, notices: [] }
    const zoneIndex = Number(character.zone || 0)
    const huntTargets = character.huntTargets && typeof character.huntTargets === 'object'
      ? character.huntTargets as Record<string, unknown>
      : {}
    const mob = createLegacyMob({
      zoneIndex,
      playerLevel: Number(character.level || 1),
      random: this.#random,
      forcedTarget: String(huntTargets[String(zoneIndex)] || ''),
    })
    return {
      mob,
      notices: [notice(formatCultivationPhrase('encounter', {
        zone: translateLegacyText(ZONES[zoneIndex]?.name || '历练区域'),
        enemy: translateLegacyText(mob.name),
      }), 'info', { type: 'encounter', targetName: mob.name })],
    }
  }

  spawnBoss(
    character: LegacyCharacterSave,
    currentMob: LegacyMobCombatant | null,
    now = Date.now(),
  ): LegacyEncounterTransition {
    const source = character as Record<string, any>
    const result = createLegacyBossEncounter({
      zoneIndex: Number(source.zone || 0),
      playerLevel: Number(source.level || 1),
      bossCooldowns: source.bossCooldowns,
      now,
      hasActiveEncounter: Boolean(currentMob),
      dungeonActive: Boolean(source.dungeon?.active),
    })
    if (!result.mob) {
      const messages = {
        'active-encounter': '请先结束当前战斗。',
        'dungeon-active': '请先离开秘境再挑战区域首领。',
        'no-boss': '此区域没有可挑战的首领。',
        cooldown: `首领仍在恢复，约 ${Math.ceil(Math.max(0, result.readyAt - now) / 60_000)} 分钟后可再次挑战。`,
      }
      return {
        mob: currentMob,
        notices: [notice(messages[result.failure!], 'info', { type: 'action-failed' })],
      }
    }
    return {
      mob: result.mob,
      notices: [notice(`强大气息降临：${translateLegacyText(result.mob.name)}向你发起挑战。`, 'danger', {
        type: 'encounter',
        targetName: result.mob.name,
      })],
    }
  }

  attack(character: LegacyCharacterSave, currentMob: LegacyMobCombatant | null): LegacyBattleTransition {
    if (!currentMob) return this.emptyTransition(character, currentMob)
    let nextCharacter = clone(character) as Record<string, any>
    const mob = clone(currentMob)
    const notices: LegacyBattleNotice[] = []
    const set = getLegacyActiveSetBonusStats(nextCharacter.equipment)
    const runeword = getLegacyEquippedRunewordEffects(nextCharacter.equipment)
    const hit = resolveLegacyPlayerAttack(nextCharacter as any, mob, this.#random, {
      atkBonus: set.atk,
      critChanceBonus: runeword.crit,
    })

    if (hit.hit) {
      mob.hp = Math.max(0, mob.hp - hit.damage)
      if (hit.wardConsumed) {
        mob.wardReady = false
        notices.push(notice(`${translateLegacyText(mob.name)}以玄奥护盾削弱了这次攻击。`, 'info', {
          type: 'named-ward-absorbed', actorName: mob.name,
        }))
      }
      notices.push(notice(`你对${translateLegacyText(mob.name)}造成${hit.damage}点${hit.critical ? '会心' : ''}伤害。`, 'damage', {
        type: 'player-hit', actorName: String(nextCharacter.name || ''), targetName: mob.name, amount: hit.damage, critical: hit.critical,
      }))
    } else {
      notices.push(notice(`${translateLegacyText(mob.name)}施展身法，避开了这次攻击。`, 'info', {
        type: 'player-miss', actorName: String(nextCharacter.name || ''), targetName: mob.name,
      }))
    }

    if (mob.hp <= 0) {
      const victory = this.resolveVictory(nextCharacter, mob)
      return { applied: true, character: victory.character, mob: null, notices: [...notices, ...victory.notices], deleteCharacter: false, persist: true }
    }

    const mobTurn = resolveLegacySoloMobTurn({
      player: nextCharacter as any,
      mob,
      random: this.#random,
      stunned: hit.stunned,
      strikeModifiers: { mitigation: set.def },
    })
    nextCharacter = mobTurn.player as Record<string, any>
    const resolvedMob = mobTurn.mob
    if (mobTurn.enrageTriggered) {
      notices.push(notice(`${translateLegacyText(resolvedMob.name)}气息暴涨，陷入狂暴。`, 'danger', {
        type: 'named-enrage', actorName: resolvedMob.name,
      }))
    }
    if (!mobTurn.stunned) {
      const strike = mobTurn.strike!
      if (strike.hit) {
        notices.push(notice(`${translateLegacyText(resolvedMob.name)}袭来，你损失${strike.damage}点${strike.critical ? '会心' : ''}气血。`, 'danger', {
          type: 'mob-hit', actorName: resolvedMob.name, targetName: String(nextCharacter.name || ''), amount: strike.damage, critical: strike.critical,
        }))
      } else {
        notices.push(notice(formatCultivationPhrase('dodge'), 'info', {
          type: 'mob-miss', actorName: resolvedMob.name, targetName: String(nextCharacter.name || ''),
        }))
      }
      if (mobTurn.venomDamage > 0) {
        notices.push(notice(`${translateLegacyText(resolvedMob.name)}的毒煞额外侵蚀你${mobTurn.venomDamage}点气血。`, 'danger', {
          type: 'named-venom', actorName: resolvedMob.name, targetName: String(nextCharacter.name || ''), amount: mobTurn.venomDamage,
        }))
      }
      if (mobTurn.wardRefreshed) {
        notices.push(notice(`${translateLegacyText(resolvedMob.name)}重新凝聚玄奥护盾。`, 'info', {
          type: 'named-ward', actorName: resolvedMob.name,
        }))
      }
    } else {
      notices.push(notice(`${translateLegacyText(resolvedMob.name)}陷入眩晕，未能反击。`, 'info', {
        type: 'mob-stunned', actorName: resolvedMob.name,
      }))
    }

    if (Number(nextCharacter.hp || 0) <= 0) {
      const defeat = this.resolveDefeat(nextCharacter, resolvedMob)
      return {
        applied: true,
        character: defeat.character,
        mob: null,
        notices: [...notices, ...defeat.notices],
        deleteCharacter: defeat.character === null,
        persist: true,
      }
    }

    return { applied: true, character: nextCharacter, mob: resolvedMob, notices, deleteCharacter: false, persist: true }
  }

  cast(character: LegacyCharacterSave, currentMob: LegacyMobCombatant | null, spellId: string): LegacyBattleTransition {
    return this.applySpellResult(castLegacySpell({
      classId: String(character.cls || ''),
      spellId,
      caster: character as any,
      target: currentMob,
      random: this.#random,
    }), currentMob)
  }

  autoCast(
    character: LegacyCharacterSave,
    currentMob: LegacyMobCombatant | null,
    now = Date.now(),
  ): LegacyBattleTransition {
    const source = character as Record<string, any>
    const result = executeLegacyAutoCast({
      classId: String(source.cls || ''),
      memorizedSpells: source.memorizedSpells,
      autoUseSkills: source.autoUseSkills !== false,
      autoSkillSlots: source.autoSkillSlots,
      maxSlots: getLegacyMaxMemorizedSpellSlots(Number(source.aa?.extraSpellSlots || 0)),
      caster: source as any,
      target: currentMob,
      random: this.#random,
      now,
    })
    return result.cast ? this.applySpellResult(result.cast, currentMob) : this.emptyTransition(character, currentMob)
  }

  flee(character: LegacyCharacterSave, currentMob: LegacyMobCombatant | null): LegacyBattleTransition {
    if (!currentMob) return this.emptyTransition(character, currentMob)
    const set = getLegacyActiveSetBonusStats(character.equipment as Record<string, unknown> | null | undefined)
    const result = resolveLegacyFlee(character, currentMob, this.#random, { mitigation: set.def })
    if (result.escaped) {
      return {
        applied: true,
        character,
        mob: null,
        notices: [notice('你已退走，脱离战斗。', 'info', { type: 'flee', actorName: String(character.name || '') })],
        deleteCharacter: false,
        persist: false,
      }
    }
    let nextCharacter = result.player as Record<string, any>
    const notices = [result.strike?.hit
      ? notice(`退走失败，${translateLegacyText(result.mob.name)}对你造成${result.strike.damage}点伤害。`, 'danger', {
        type: 'flee-failed', actorName: result.mob.name, targetName: String(character.name || ''), amount: result.strike.damage,
      })
      : notice(`退走失败，但你避开了${translateLegacyText(result.mob.name)}的追击。`, 'info', {
        type: 'flee-failed', actorName: result.mob.name, targetName: String(character.name || ''), amount: 0,
      })]
    if (Number(nextCharacter.hp || 0) <= 0) {
      const defeat = this.resolveDefeat(nextCharacter, result.mob)
      return {
        applied: true,
        character: defeat.character,
        mob: null,
        notices: [...notices, ...defeat.notices],
        deleteCharacter: defeat.character === null,
        persist: true,
      }
    }
    return { applied: true, character: nextCharacter, mob: result.mob, notices, deleteCharacter: false, persist: true }
  }

  private applySpellResult(result: LegacySpellCastResult, fallbackMob: LegacyMobCombatant | null): LegacyBattleTransition {
    if (!result.success) {
      const messages = {
        cooldown: '功法尚在调息之中。',
        'insufficient-mana': '法力不足。',
        'missing-target': '当前没有目标。',
        'unknown-spell': '未找到该功法。',
      }
      return {
        applied: false,
        character: result.caster as unknown as LegacyCharacterSave,
        mob: fallbackMob,
        notices: [notice(messages[result.reason!], 'info', { type: 'action-failed', spellId: result.spell?.id })],
        deleteCharacter: false,
        persist: false,
      }
    }
    let character = result.caster as Record<string, any>
    let mob = result.target
    const spellName = translateLegacyText(result.spell?.name || '功法')
    const notices: LegacyBattleNotice[] = [notice(formatCultivationPhrase('spellCast', { spell: spellName }), 'info', {
      type: 'spell-cast', actorName: String(character.name || ''), spellId: result.spell?.id,
    })]
    if (result.spell?.kind === 'heal' || result.spell?.kind === 'mana') {
      notices.push(notice(`${spellName}恢复${result.amount}点${result.spell.kind === 'mana' ? '法力' : '气血'}。`, 'heal', {
        type: result.spell.kind === 'mana' ? 'spell-mana' : 'spell-heal',
        actorName: String(character.name || ''),
        targetName: result.healTargetId || String(character.name || ''),
        amount: result.amount,
        spellId: result.spell.id,
      }))
    } else {
      notices.push(notice(formatCultivationPhrase('spellHit', {
        spell: spellName,
        enemy: translateLegacyText(mob?.name || '目标'),
        damage: result.amount + result.poisonDamage,
      }), 'damage', {
        type: 'spell-damage', actorName: String(character.name || ''), targetName: mob?.name,
        amount: result.amount, secondaryAmount: result.poisonDamage, spellId: result.spell?.id,
      }))
    }
    if (mob && mob.hp <= 0) {
      const victory = this.resolveVictory(character, mob)
      character = victory.character as Record<string, any>
      mob = null
      notices.push(...victory.notices)
    }
    return { applied: true, character, mob, notices, deleteCharacter: false, persist: true }
  }

  private resolveVictory(character: Record<string, any>, defeated: LegacyMobCombatant): { character: LegacyCharacterSave; notices: LegacyBattleNotice[] } {
    const result = resolveLegacySoloVictory(character, defeated, { random: this.#random })
    const notices: LegacyBattleNotice[] = []
    for (const questName of result.questCompletions) notices.push(notice(`委托已完成：${translateLegacyText(questName)}。`, 'loot', { type: 'quest-complete', questId: questName }))
    if (result.contractCompleted) notices.push(notice('契约目标已经完成。', 'loot', { type: 'contract-complete' }))
    if (result.classQuestCompleted) notices.push(notice('传承试炼目标已完成。', 'loot', { type: 'class-quest-complete' }))
    if (result.loot) {
      const item = result.loot as Record<string, any> | string
      const itemId = typeof item === 'string' ? item : item.name || item.base
      notices.push(notice(`发现战利品：${translateLegacyText(itemId)}。`, 'loot', { type: 'loot-drop', itemId }))
    }
    if (result.rune) notices.push(notice(`获得符纹：${translateLegacyText(result.rune)}。`, 'loot', { type: 'rune-drop', runeId: result.rune }))
    for (const bossDrop of result.bossLoot) {
      const item = bossDrop as Record<string, any> | string
      const itemId = typeof item === 'string' ? item : item.name || item.base
      notices.push(notice(`首领战利品：${translateLegacyText(itemId)}。`, 'loot', { type: 'loot-drop', itemId }))
    }
    notices.push(notice(formatCultivationPhrase('victory', { enemy: translateLegacyText(defeated.name) }), 'loot', {
      type: 'victory', targetName: defeated.name,
    }))
    const xp = result.combatXp + result.questXp
    const gold = result.combatGold + result.questGold
    notices.push(notice(`${formatCultivationPhrase('rewardXp', { xp })} ${formatCultivationPhrase('rewardGold', { gold })}`, 'loot', {
      type: 'reward', xp, gold,
    }))
    return { character: result.character, notices }
  }

  private resolveDefeat(character: Record<string, any>, defeatedBy: LegacyMobCombatant): { character: LegacyCharacterSave | null; notices: LegacyBattleNotice[] } {
    const result = resolveLegacyDefeat(character, defeatedBy)
    if (result.hardcore) {
      return {
        character: null,
        notices: [notice(`${character.name} 在 ${translateLegacyText(defeatedBy.name)} 手中陨落，角色存档已删除。`, 'danger', {
          type: 'hardcore-death', actorName: defeatedBy.name, targetName: String(character.name || ''),
        })],
      }
    }
    return {
      character: result.character,
      notices: [notice(`你被 ${translateLegacyText(defeatedBy.name)} 击败，遗失 ${result.lostGold} 枚灵石。`, 'danger', {
        type: 'defeat', actorName: defeatedBy.name, targetName: String(character.name || ''), gold: result.lostGold,
      })],
    }
  }

  private emptyTransition(character: LegacyCharacterSave, mob: LegacyMobCombatant | null): LegacyBattleTransition {
    return { applied: false, character, mob, notices: [], deleteCharacter: false, persist: false }
  }
}
