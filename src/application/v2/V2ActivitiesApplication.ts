import {
  autoDiveP2Dungeon,
  challengeP2DungeonFloor,
  claimAlchemyV2,
  claimCaveTraining,
  enterP2Dungeon,
  queueAlchemyV2,
  startCaveTraining,
  useP2Pill,
  type P2DungeonModifierId,
  type P2PillId,
} from '../../game-core/rulesets/v2'
import type { LegacyCharacterSave } from '../../game-core/save/types'

export class V2ActivitiesApplication {
  enterDungeon(character: LegacyCharacterSave, modifierId: P2DungeonModifierId, autoDive: boolean): LegacyCharacterSave {
    return enterP2Dungeon(character, modifierId, autoDive)
  }

  challengeDungeon(character: LegacyCharacterSave, seed: string) {
    return challengeP2DungeonFloor(character, seed)
  }

  autoDiveDungeon(character: LegacyCharacterSave, seed: string) {
    return autoDiveP2Dungeon(character, seed)
  }

  startCaveTraining(character: LegacyCharacterSave, techniqueId: string, minutes: number, now = Date.now()) {
    return startCaveTraining(character, techniqueId, minutes, now)
  }

  claimCaveTraining(character: LegacyCharacterSave, now = Date.now()) {
    return claimCaveTraining(character, now)
  }

  queueAlchemy(character: LegacyCharacterSave, recipeId: P2PillId, count: number, now = Date.now()) {
    return queueAlchemyV2(character, recipeId, count, now)
  }

  claimAlchemy(character: LegacyCharacterSave, now = Date.now()) {
    return claimAlchemyV2(character, now)
  }

  usePill(character: LegacyCharacterSave, pillId: P2PillId): LegacyCharacterSave | null {
    return useP2Pill(character, pillId)
  }
}
