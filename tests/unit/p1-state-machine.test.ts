import { describe, expect, it } from 'vitest'

import {
  PlayerAutoStrategy,
  V2_TECHNIQUES,
  createEmptyElementResistances,
  createV2BattleState,
  dispatchV2BattleCommand,
  replaceTechniqueSlot,
  runV2StrategyUntilComplete,
  startV2Battle,
  type BattleActorState,
  type BattleState,
  type BattleStrategy,
  type TechniqueDefinition,
} from '../../src/game-core/rulesets/v2'

function actor(
  id: 'player' | 'enemy',
  patch: Partial<BattleActorState> = {},
): BattleActorState {
  const slots = patch.techniqueLoadout?.slots || [null, null, null]
  return {
    id,
    side: id,
    name: id === 'player' ? '测试修士' : '测试妖兽',
    level: 1,
    element: 'neutral',
    hp: 500,
    maxHp: 500,
    mp: 100,
    maxMp: 100,
    shield: 0,
    attack: 20,
    defense: 5,
    spirit: 10,
    physique: 10,
    agility: id === 'player' ? 20 : 10,
    criticalChance: 0,
    criticalMultiplier: 1.5,
    affinities: {},
    resistances: createEmptyElementResistances(),
    knownTechniqueIds: slots.filter((value): value is string => Boolean(value)),
    techniqueLoadout: { slots: [...slots] as [string | null, string | null, string | null] },
    ...patch,
  }
}

function battle(
  seed: string,
  player = actor('player'),
  enemy = actor('enemy'),
): BattleState {
  return createV2BattleState({
    seed,
    player,
    enemy,
    zoneId: 'test-zone',
    enemyContentId: 'test-enemy',
    rewards: { xp: 10, gold: 5 },
  })
}

describe('P1 1v1 回合制状态机', () => {
  it('每轮由当前身法决定先攻，双方最多各行动一次', () => {
    const started = startV2Battle(battle('initiative'), V2_TECHNIQUES)
    expect(started.state.phase).toBe('WAITING_FOR_COMMAND')
    expect(started.state.round).toBe(1)
    expect(started.state.turnOrder).toEqual(['player', 'enemy'])

    const afterPlayer = dispatchV2BattleCommand(started.state, {
      type: 'basic_attack', actorId: 'player', targetId: 'enemy',
    }, V2_TECHNIQUES)

    const roundOneActions = afterPlayer.state.events.filter((event) => event.type === 'ActionDeclared' && event.round === 1)
    expect(roundOneActions.map((event) => event.actorId)).toEqual(['player', 'enemy'])
    expect(afterPlayer.state.round).toBe(2)
    expect(afterPlayer.state.phase).toBe('WAITING_FOR_COMMAND')
    expect(afterPlayer.state.activeActorId).toBe('player')
  })

  it('敌方身法更高时先行动，再停在玩家命令阶段', () => {
    const started = startV2Battle(battle(
      'enemy-first',
      actor('player', { agility: 5 }),
      actor('enemy', { agility: 30 }),
    ), V2_TECHNIQUES)

    expect(started.state.turnOrder).toEqual(['enemy', 'player'])
    expect(started.state.phase).toBe('WAITING_FOR_COMMAND')
    expect(started.state.activeActorId).toBe('player')
    expect(started.events.some((event) => event.type === 'DamageDealt' && event.actorId === 'enemy')).toBe(true)
  })

  it('同身法使用固定 seed，可完全复现先攻顺序与事件', () => {
    const first = startV2Battle(battle(
      'same-agility-seed',
      actor('player', { agility: 10 }),
      actor('enemy', { agility: 10 }),
    ), V2_TECHNIQUES)
    const second = startV2Battle(battle(
      'same-agility-seed',
      actor('player', { agility: 10 }),
      actor('enemy', { agility: 10 }),
    ), V2_TECHNIQUES)

    expect(second.state.turnOrder).toEqual(first.state.turnOrder)
    expect(second.state.randomState).toBe(first.state.randomState)
    expect(second.state.events).toEqual(first.state.events)
  })

  it('眩晕或冻结跳过行动，并在持续时间结束后恢复', () => {
    const source = battle('controlled')
    source.effects.push({
      id: 'stun-player', type: 'stun', sourceActorId: 'enemy', targetActorId: 'player',
      magnitude: 1, remainingRounds: 1, appliedRound: 0,
    })
    const started = startV2Battle(source, V2_TECHNIQUES)

    expect(started.events).toContainEqual(expect.objectContaining({
      type: 'TurnStarted', actorId: 'player', controlled: true, round: 1,
    }))
    expect(started.state.round).toBe(2)
    expect(started.state.activeActorId).toBe('player')
    expect(started.state.effects).toEqual([])
  })

  it('降低身法会影响下一轮重新计算的行动顺序', () => {
    const slow: TechniqueDefinition = {
      id: 'test-slow', displayName: '迟滞术', description: '测试减速', classIds: [],
      element: 'water', effectType: 'agility_down', target: 'enemy', manaCost: 0,
      cooldown: 0, basePower: 0, attackScale: 0, duration: 2, magnitude: 10,
    }
    const techniques = { ...V2_TECHNIQUES, [slow.id]: slow }
    const player = actor('player', {
      agility: 15,
      knownTechniqueIds: [slow.id],
      techniqueLoadout: { slots: [slow.id, null, null] },
    })
    const enemy = actor('enemy', { agility: 20 })
    const started = startV2Battle(battle('agility-down', player, enemy), techniques)
    expect(started.state.turnOrder).toEqual(['enemy', 'player'])

    const next = dispatchV2BattleCommand(started.state, {
      type: 'use_technique', actorId: 'player', targetId: 'enemy', techniqueId: slow.id,
    }, techniques)
    expect(next.state.round).toBe(2)
    expect(next.state.turnOrder).toEqual(['player', 'enemy'])
  })

  it('单位死亡后立即结束，不再允许另一方补行动', () => {
    const source = battle(
      'death-stop',
      actor('player', { attack: 10_000 }),
      actor('enemy', { hp: 1, maxHp: 1 }),
    )
    source.encounter.rewards.itemId = 'Rawhide Boots'
    const started = startV2Battle(source, V2_TECHNIQUES)
    const ended = dispatchV2BattleCommand(started.state, {
      type: 'basic_attack', actorId: 'player', targetId: 'enemy',
    }, V2_TECHNIQUES)

    expect(ended.state.phase).toBe('COMPLETED')
    expect(ended.state.result?.outcome).toBe('victory')
    expect(ended.events.filter((event) => event.type === 'ActionDeclared').map((event) => event.actorId)).toEqual(['player'])
    const reward = ended.events.find((event) => event.type === 'RewardsGranted')
    expect(reward?.message).toContain('生皮靴')
    expect(reward?.message).not.toContain('Rawhide Boots')
  })

  it('验证法力、目标、冷却与战斗中换功法限制', () => {
    const technique = V2_TECHNIQUES.scarlet_flame_art
    const player = actor('player', {
      mp: 0,
      knownTechniqueIds: [technique.id],
      techniqueLoadout: { slots: [technique.id, null, null] },
    })
    const started = startV2Battle(battle('validation', player), V2_TECHNIQUES)
    expect(dispatchV2BattleCommand(started.state, {
      type: 'use_technique', actorId: 'player', targetId: 'enemy', techniqueId: technique.id,
    }, V2_TECHNIQUES).validation.reason).toBe('insufficient-mana')
    expect(dispatchV2BattleCommand(started.state, {
      type: 'basic_attack', actorId: 'player', targetId: 'player',
    }, V2_TECHNIQUES).validation.reason).toBe('invalid-target')
    expect(() => replaceTechniqueSlot(player, 1, null, started.state)).toThrow('战斗中不能更换功法')

    const cooldownState = structuredClone(started.state)
    cooldownState.actors.player.mp = 100
    cooldownState.cooldowns[`player:${technique.id}`] = 1
    expect(dispatchV2BattleCommand(cooldownState, {
      type: 'use_technique', actorId: 'player', targetId: 'enemy', techniqueId: technique.id,
    }, V2_TECHNIQUES).validation.reason).toBe('technique-on-cooldown')
  })

  it('固定快照、三功法与 seed 可完整复现自动战斗', () => {
    const player = actor('player', {
      hp: 240, maxHp: 240, attack: 45, spirit: 30,
      knownTechniqueIds: ['gengjin_sword_art', 'thorn_decay', 'scarlet_flame_art'],
      techniqueLoadout: { slots: ['gengjin_sword_art', 'thorn_decay', 'scarlet_flame_art'] },
    })
    const enemy = actor('enemy', { hp: 260, maxHp: 260, attack: 32, defense: 12 })
    const first = runV2StrategyUntilComplete(
      startV2Battle(battle('replay-seed', player, enemy), V2_TECHNIQUES).state,
      new PlayerAutoStrategy(),
      V2_TECHNIQUES,
    )
    const second = runV2StrategyUntilComplete(
      startV2Battle(battle('replay-seed', player, enemy), V2_TECHNIQUES).state,
      new PlayerAutoStrategy(),
      V2_TECHNIQUES,
    )

    expect(first.state).toEqual(second.state)
    expect(first.events).toEqual(second.events)
    expect(first.state.phase).toBe('COMPLETED')
  })

  it('遁走既有成功也有失败路径，且同 seed 结果稳定', () => {
    const outcomes = Array.from({ length: 40 }, (_, index) => {
      const seed = `escape-${index}`
      const started = startV2Battle(battle(seed), V2_TECHNIQUES)
      const transition = dispatchV2BattleCommand(started.state, { type: 'escape', actorId: 'player' }, V2_TECHNIQUES)
      return { seed, outcome: transition.state.result?.outcome || 'failed' }
    })
    expect(outcomes.some((entry) => entry.outcome === 'escaped')).toBe(true)
    expect(outcomes.some((entry) => entry.outcome === 'failed')).toBe(true)

    const sample = outcomes[7]
    const retry = dispatchV2BattleCommand(
      startV2Battle(battle(sample.seed), V2_TECHNIQUES).state,
      { type: 'escape', actorId: 'player' },
      V2_TECHNIQUES,
    )
    expect(retry.state.result?.outcome || 'failed').toBe(sample.outcome)
  })
})

describe('P1 自动策略优先级', () => {
  it('低血量优先治疗，无法施展功法时使用普通攻击而不在战斗内调息', () => {
    const heal = V2_TECHNIQUES.verdant_rejuvenation
    const damage = V2_TECHNIQUES.metal_severing_needle
    const player = actor('player', {
      hp: 20, maxHp: 100, mp: 100,
      knownTechniqueIds: [damage.id, heal.id],
      techniqueLoadout: { slots: [damage.id, heal.id, null] },
    })
    const state = startV2Battle(battle('strategy-heal', player), V2_TECHNIQUES).state
    expect(new PlayerAutoStrategy().selectCommand({
      state, actor: state.actors.player, opponent: state.actors.enemy, techniques: V2_TECHNIQUES,
    })).toMatchObject({ type: 'use_technique', techniqueId: heal.id })

    const noTechnique = actor('player', { mp: 1, maxMp: 100 })
    const lowManaState = startV2Battle(battle('strategy-no-meditate', noTechnique), V2_TECHNIQUES).state
    expect(new PlayerAutoStrategy().selectCommand({
      state: lowManaState,
      actor: lowManaState.actors.player,
      opponent: lowManaState.actors.enemy,
      techniques: V2_TECHNIQUES,
    })).toMatchObject({ type: 'basic_attack' })
  })

  it('战斗内服丹消耗一回合，按体魄恢复固定点数并扣除库存', () => {
    const player = actor('player', { hp: 20, maxHp: 500, physique: 10, pills: { 回春丹: 1, 回灵丹: 0 } })
    const state = startV2Battle(battle('battle-pill', player), V2_TECHNIQUES).state
    const transition = dispatchV2BattleCommand(state, {
      type: 'use_pill', actorId: 'player', pillId: '回春丹',
    }, V2_TECHNIQUES)

    expect(transition.validation.valid).toBe(true)
    expect(transition.state.actors.player.pills?.回春丹).toBe(0)
    expect(transition.events).toContainEqual(expect.objectContaining({
      type: 'HealingApplied', actorId: 'player', amount: 50,
    }))
    expect(transition.events.some((event) => event.type === 'ActionDeclared' && event.actorId === 'enemy')).toBe(true)

    const withoutPill = startV2Battle(battle('battle-pill-empty', actor('player')), V2_TECHNIQUES).state
    expect(dispatchV2BattleCommand(withoutPill, {
      type: 'use_pill', actorId: 'player', pillId: '回春丹',
    }, V2_TECHNIQUES).validation.reason).toBe('pill-not-available')
  })
})
