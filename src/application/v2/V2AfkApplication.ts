import {
  normalizeV2AutoConfiguration,
  prepareV2AutoEncounter,
  simulateV2AutoEncounter,
  simulateV2Offline,
  type V2AutoConfiguration,
  type V2AutoEncounterResult,
  type V2OfflineResult,
} from '../../game-core/rulesets/v2'
import type { LegacyCharacterSave } from '../../game-core/save/types'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export class V2AfkApplication {
  getConfiguration(character: LegacyCharacterSave): V2AutoConfiguration {
    return normalizeV2AutoConfiguration(character.v2AutoConfiguration, Number(character.zone || 0))
  }

  updateConfiguration(character: LegacyCharacterSave, patch: Partial<V2AutoConfiguration>): LegacyCharacterSave {
    const next = clone(character)
    next.v2AutoConfiguration = normalizeV2AutoConfiguration({ ...this.getConfiguration(character), ...patch }, Number(character.zone || 0))
    return next
  }

  prepareEncounter(character: LegacyCharacterSave, now = Date.now()) {
    return prepareV2AutoEncounter(character, this.getConfiguration(character), now)
  }

  runEncounter(character: LegacyCharacterSave, seed: string): V2AutoEncounterResult {
    return simulateV2AutoEncounter(character, { seed, configuration: this.getConfiguration(character) })
  }

  recoverOffline(character: LegacyCharacterSave, elapsedMs: number, seed: string): V2OfflineResult {
    return simulateV2Offline(character, { elapsedMs, seed, configuration: this.getConfiguration(character) })
  }
}
