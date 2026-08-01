export { simulateLegacyBattle } from './battle-engine'
export type {
  SimulateLegacyBattleInput,
  SimulateLegacyBattleResult,
} from './battle-engine'
export * from './legacy-combat.resolution'
export * from './legacy-combat-effects'
export * from './legacy-companion-combat'
export * from './legacy-mob-pack'
export * from './legacy-party-combat'
export * from './legacy-combat.journal'
export * from './legacy-named-mechanic.turn'
export * from './legacy-boss'
export {
  calculateLegacyKillRewards,
  createLegacyMob,
  getLegacyLowLevelGoldMultiplier,
  getLegacyZoneMobLevel,
  getLegacyZoneProgressGoldMultiplier,
  legacySkillLevelFloor,
  pickLegacyLootBase,
  resolveLegacyMobStrike,
  resolveLegacyPlayerAttack,
  rollLegacyRuneDrop,
  scaleLegacyMobHp,
} from './legacy-combat.formulas'
export type { CreateLegacyMobOptions } from './legacy-combat.formulas'
export type {
  LegacyAttackResult,
  LegacyBattleEvent,
  LegacyBattleEventType,
  LegacyBattleResult,
  LegacyCombatant,
  LegacyKillRewardModifiers,
  LegacyKillRewards,
  LegacyMobCombatant,
  LegacyMobStrikeModifiers,
  LegacyMobStrikeResult,
  LegacyPlayerAttackModifiers,
  LegacyPlayerCombatant,
} from './types'
