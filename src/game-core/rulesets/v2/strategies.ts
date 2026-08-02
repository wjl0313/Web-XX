import { isTechniqueReady } from './technique.rules'
import type {
  BattleCommand,
  BattleDecisionContext,
  BattleStrategy,
  TechniqueDefinition,
} from './types'

function equippedTechniques(context: BattleDecisionContext): TechniqueDefinition[] {
  return context.actor.techniqueLoadout.slots
    .map((id) => id ? context.techniques[id] : null)
    .filter((technique): technique is TechniqueDefinition => Boolean(technique))
}

function commandForTechnique(
  context: BattleDecisionContext,
  technique: TechniqueDefinition,
): BattleCommand {
  return {
    type: 'use_technique',
    actorId: context.actor.id,
    targetId: technique.target === 'self' ? context.actor.id : context.opponent.id,
    techniqueId: technique.id,
  }
}

export class PlayerManualStrategy implements BattleStrategy {
  constructor(private readonly command: BattleCommand) {}

  selectCommand(): BattleCommand {
    return this.command
  }
}

export class PlayerAutoStrategy implements BattleStrategy {
  constructor(
    private readonly healingThreshold = 0.4,
    private readonly hpPillThreshold = 0.3,
    private readonly mpPillThreshold = 0.2,
  ) {}

  selectCommand(context: BattleDecisionContext): BattleCommand {
    const techniques = equippedTechniques(context)
    const healing = techniques.find((technique) =>
      technique.effectType === 'healing'
      && context.actor.hp / Math.max(1, context.actor.maxHp) < this.healingThreshold
      && isTechniqueReady(context.state, context.actor, technique),
    )
    if (healing) return commandForTechnique(context, healing)

    if (
      context.actor.hp / Math.max(1, context.actor.maxHp) < this.hpPillThreshold
      && Number(context.actor.pills?.回春丹 || 0) > 0
    ) {
      return { type: 'use_pill', actorId: context.actor.id, pillId: '回春丹' }
    }
    if (
      context.actor.mp / Math.max(1, context.actor.maxMp) < this.mpPillThreshold
      && Number(context.actor.pills?.回灵丹 || 0) > 0
    ) {
      return { type: 'use_pill', actorId: context.actor.id, pillId: '回灵丹' }
    }

    const manaRecovery = techniques.find((technique) =>
      technique.effectType === 'mana_restore'
      && context.actor.mp / Math.max(1, context.actor.maxMp) < this.mpPillThreshold
      && isTechniqueReady(context.state, context.actor, technique),
    )
    if (manaRecovery) return commandForTechnique(context, manaRecovery)

    for (const technique of techniques.filter((entry) => entry.effectType !== 'healing' && entry.effectType !== 'mana_restore')) {
      if (isTechniqueReady(context.state, context.actor, technique)) {
        return commandForTechnique(context, technique)
      }
    }

    return { type: 'basic_attack', actorId: context.actor.id, targetId: context.opponent.id }
  }
}

export class MonsterStrategy implements BattleStrategy {
  selectCommand(context: BattleDecisionContext): BattleCommand {
    const techniques = equippedTechniques(context)
    const healing = techniques.find((technique) =>
      technique.effectType === 'healing'
      && context.actor.hp / Math.max(1, context.actor.maxHp) < 0.35
      && isTechniqueReady(context.state, context.actor, technique),
    )
    if (healing) return commandForTechnique(context, healing)
    const offensive = techniques.find((technique) =>
      technique.effectType !== 'healing'
      && technique.effectType !== 'mana_restore'
      && technique.effectType !== 'shield'
      && isTechniqueReady(context.state, context.actor, technique),
    )
    if (offensive) return commandForTechnique(context, offensive)
    const manaRecovery = techniques.find((technique) =>
      technique.effectType === 'mana_restore'
      && context.actor.mp / Math.max(1, context.actor.maxMp) < 0.15
      && isTechniqueReady(context.state, context.actor, technique),
    )
    if (manaRecovery) return commandForTechnique(context, manaRecovery)
    const defensive = techniques.find((technique) =>
      technique.effectType !== 'healing'
      && technique.effectType !== 'mana_restore'
      && isTechniqueReady(context.state, context.actor, technique),
    )
    if (defensive) return commandForTechnique(context, defensive)
    return { type: 'basic_attack', actorId: context.actor.id, targetId: context.opponent.id }
  }
}

export class TestStrategy implements BattleStrategy {
  private index = 0

  constructor(private readonly commands: readonly BattleCommand[]) {}

  selectCommand(context: BattleDecisionContext): BattleCommand {
    const command = this.commands[this.index]
    this.index += 1
    return command ?? { type: 'basic_attack', actorId: context.actor.id, targetId: context.opponent.id }
  }
}
