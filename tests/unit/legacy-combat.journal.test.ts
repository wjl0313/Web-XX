import { describe, expect, it } from 'vitest'

import {
  appendLegacyCombatJournalEvent,
  createLegacyCombatJournalEvent,
  parseLegacyCombatJournal,
  replayLegacyCombatJournal,
  serializeLegacyCombatJournal,
} from '../../src/game-core/systems/combat'

function event(
  sequence: number,
  type: Parameters<typeof createLegacyCombatJournalEvent>[0]['type'] = 'info',
  extra: Partial<Parameters<typeof createLegacyCombatJournalEvent>[0]> = {},
) {
  return createLegacyCombatJournalEvent({
    type,
    category: 'info',
    message: `${type}-${sequence}`,
    ...extra,
  }, sequence, sequence * 100)
}

describe('legacy combat event journal', () => {
  it('creates sequenced events and enforces an append history limit', () => {
    const events = [event(1), event(2)]
    expect(appendLegacyCombatJournalEvent(events, event(3), 2).map((entry) => entry.sequence)).toEqual([2, 3])
    expect(events.map((entry) => entry.sequence)).toEqual([1, 2])
  })

  it('round-trips structured combat messages for deterministic log replay', () => {
    const events = [
      event(1, 'encounter', { targetName: '妖兽' }),
      event(2, 'player-hit', { category: 'damage', amount: 12, critical: true }),
    ]
    expect(parseLegacyCombatJournal(serializeLegacyCombatJournal(events))).toEqual({
      journal: { version: 1, events },
      issues: [],
    })
  })

  it('rejects malformed, unsupported and out-of-order journals', () => {
    expect(parseLegacyCombatJournal('{').issues).toEqual([{ code: 'invalid-json' }])
    expect(parseLegacyCombatJournal('[]').issues).toEqual([{ code: 'invalid-root' }])
    expect(parseLegacyCombatJournal('{"version":2,"events":[]}').issues).toEqual([{ code: 'unsupported-version' }])
    expect(parseLegacyCombatJournal(serializeLegacyCombatJournal([event(2), event(1)])).issues).toEqual([
      { code: 'invalid-sequence', index: 1 },
    ])
  })

  it('replays damage, recovery, rewards and outcomes into a stable summary', () => {
    const summary = replayLegacyCombatJournal([
      event(1, 'spell-cast', { spellId: 'fireball' }),
      event(2, 'player-hit', { amount: 10 }),
      event(3, 'spell-damage', { amount: 20, secondaryAmount: 5 }),
      event(4, 'mob-hit', { amount: 7 }),
      event(5, 'spell-heal', { amount: 6 }),
      event(6, 'spell-mana', { amount: 4 }),
      event(7, 'loot-drop'),
      event(8, 'rune-drop'),
      event(9, 'reward', { xp: 100, gold: 9 }),
      event(10, 'victory'),
      event(11, 'flee'),
    ])

    expect(summary).toMatchObject({
      events: 11,
      damageDealt: 35,
      damageTaken: 7,
      healing: 6,
      manaRestored: 4,
      xp: 100,
      gold: 9,
      victories: 1,
      defeats: 0,
      flees: 1,
      spellsCast: 1,
      lootDrops: 1,
      runeDrops: 1,
    })
  })
})
