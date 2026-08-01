export const LEGACY_COMBAT_JOURNAL_VERSION = 1
export const LEGACY_COMBAT_JOURNAL_MAX_EVENTS = 5_000

export type LegacyCombatEventCategory = 'info' | 'damage' | 'heal' | 'loot' | 'danger'

export type LegacyCombatJournalEventType =
  | 'info'
  | 'encounter'
  | 'player-hit'
  | 'player-miss'
  | 'mob-hit'
  | 'mob-miss'
  | 'mob-stunned'
  | 'named-enrage'
  | 'named-venom'
  | 'named-ward'
  | 'named-ward-absorbed'
  | 'spell-cast'
  | 'spell-damage'
  | 'spell-heal'
  | 'spell-mana'
  | 'action-failed'
  | 'quest-complete'
  | 'contract-complete'
  | 'class-quest-complete'
  | 'loot-drop'
  | 'rune-drop'
  | 'reward'
  | 'victory'
  | 'defeat'
  | 'hardcore-death'
  | 'flee'
  | 'flee-failed'

export interface LegacyCombatJournalEvent {
  sequence: number
  occurredAt: number
  type: LegacyCombatJournalEventType
  category: LegacyCombatEventCategory
  message: string
  actorName?: string
  targetName?: string
  amount?: number
  secondaryAmount?: number
  critical?: boolean
  spellId?: string
  itemId?: string
  questId?: string
  runeId?: string
  xp?: number
  gold?: number
}

export type LegacyCombatJournalEventInput = Omit<LegacyCombatJournalEvent, 'sequence' | 'occurredAt'>

export interface LegacyCombatJournal {
  version: 1
  events: LegacyCombatJournalEvent[]
}

export type LegacyCombatJournalIssueCode =
  | 'invalid-json'
  | 'invalid-root'
  | 'unsupported-version'
  | 'invalid-events'
  | 'invalid-event'
  | 'invalid-sequence'
  | 'too-many-events'

export interface LegacyCombatJournalParseResult {
  journal: LegacyCombatJournal | null
  issues: Array<{ code: LegacyCombatJournalIssueCode; index?: number }>
}

export interface LegacyCombatReplaySummary {
  events: number
  damageDealt: number
  damageTaken: number
  healing: number
  manaRestored: number
  xp: number
  gold: number
  victories: number
  defeats: number
  flees: number
  spellsCast: number
  lootDrops: number
  runeDrops: number
}

const eventTypes = new Set<LegacyCombatJournalEventType>([
  'info', 'encounter', 'player-hit', 'player-miss', 'mob-hit', 'mob-miss',
  'mob-stunned', 'spell-cast', 'spell-damage', 'spell-heal', 'spell-mana',
  'named-enrage', 'named-venom', 'named-ward', 'named-ward-absorbed',
  'action-failed', 'quest-complete', 'contract-complete', 'class-quest-complete',
  'loot-drop', 'rune-drop', 'reward', 'victory', 'defeat', 'hardcore-death',
  'flee', 'flee-failed',
])
const categories = new Set<LegacyCombatEventCategory>(['info', 'damage', 'heal', 'loot', 'danger'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function nonNegative(value: unknown): number {
  return Math.max(0, Number(value) || 0)
}

function isValidEvent(value: unknown): value is LegacyCombatJournalEvent {
  if (!isRecord(value)) return false
  if (!Number.isInteger(value.sequence) || Number(value.sequence) < 1) return false
  if (!Number.isFinite(Number(value.occurredAt)) || Number(value.occurredAt) < 0) return false
  if (!eventTypes.has(value.type as LegacyCombatJournalEventType)) return false
  if (!categories.has(value.category as LegacyCombatEventCategory)) return false
  return typeof value.message === 'string'
}

export function createLegacyCombatJournalEvent(
  input: LegacyCombatJournalEventInput,
  sequence: number,
  occurredAt = Date.now(),
): LegacyCombatJournalEvent {
  return {
    ...input,
    sequence: Math.max(1, Math.floor(Number(sequence) || 1)),
    occurredAt: Math.max(0, Math.floor(Number(occurredAt) || 0)),
  }
}

export function appendLegacyCombatJournalEvent(
  events: readonly LegacyCombatJournalEvent[],
  event: LegacyCombatJournalEvent,
  maximum = LEGACY_COMBAT_JOURNAL_MAX_EVENTS,
): LegacyCombatJournalEvent[] {
  const limit = Math.max(1, Math.floor(Number(maximum) || 1))
  return [...events, event].slice(-limit)
}

export function serializeLegacyCombatJournal(events: readonly LegacyCombatJournalEvent[]): string {
  return JSON.stringify({ version: LEGACY_COMBAT_JOURNAL_VERSION, events })
}

export function parseLegacyCombatJournal(raw: string): LegacyCombatJournalParseResult {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return { journal: null, issues: [{ code: 'invalid-json' }] }
  }
  if (!isRecord(value)) return { journal: null, issues: [{ code: 'invalid-root' }] }
  if (value.version !== LEGACY_COMBAT_JOURNAL_VERSION) {
    return { journal: null, issues: [{ code: 'unsupported-version' }] }
  }
  if (!Array.isArray(value.events)) return { journal: null, issues: [{ code: 'invalid-events' }] }
  if (value.events.length > LEGACY_COMBAT_JOURNAL_MAX_EVENTS) {
    return { journal: null, issues: [{ code: 'too-many-events' }] }
  }

  let previousSequence = 0
  for (let index = 0; index < value.events.length; index += 1) {
    const event = value.events[index]
    if (!isValidEvent(event)) return { journal: null, issues: [{ code: 'invalid-event', index }] }
    if (event.sequence <= previousSequence) {
      return { journal: null, issues: [{ code: 'invalid-sequence', index }] }
    }
    previousSequence = event.sequence
  }

  return {
    journal: { version: LEGACY_COMBAT_JOURNAL_VERSION, events: value.events },
    issues: [],
  }
}

export function replayLegacyCombatJournal(
  events: readonly LegacyCombatJournalEvent[],
): LegacyCombatReplaySummary {
  const summary: LegacyCombatReplaySummary = {
    events: events.length,
    damageDealt: 0,
    damageTaken: 0,
    healing: 0,
    manaRestored: 0,
    xp: 0,
    gold: 0,
    victories: 0,
    defeats: 0,
    flees: 0,
    spellsCast: 0,
    lootDrops: 0,
    runeDrops: 0,
  }
  for (const event of events) {
    if (event.type === 'player-hit' || event.type === 'spell-damage') summary.damageDealt += nonNegative(event.amount) + nonNegative(event.secondaryAmount)
    if (event.type === 'mob-hit') summary.damageTaken += nonNegative(event.amount)
    if (event.type === 'spell-heal') summary.healing += nonNegative(event.amount)
    if (event.type === 'spell-mana') summary.manaRestored += nonNegative(event.amount)
    if (event.type === 'reward') {
      summary.xp += nonNegative(event.xp)
      summary.gold += nonNegative(event.gold)
    }
    if (event.type === 'victory') summary.victories += 1
    if (event.type === 'defeat' || event.type === 'hardcore-death') summary.defeats += 1
    if (event.type === 'flee') summary.flees += 1
    if (event.type === 'spell-cast') summary.spellsCast += 1
    if (event.type === 'loot-drop') summary.lootDrops += 1
    if (event.type === 'rune-drop') summary.runeDrops += 1
  }
  return summary
}
