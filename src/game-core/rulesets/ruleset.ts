import type { GameRuleset } from './v2/types'

export function getCharacterRuleset(character: unknown): GameRuleset {
  if (!character || typeof character !== 'object') return 'legacy'
  return (character as Record<string, unknown>).ruleset === 'v2' ? 'v2' : 'legacy'
}

export function isV2Character(character: unknown): boolean {
  return getCharacterRuleset(character) === 'v2'
}
