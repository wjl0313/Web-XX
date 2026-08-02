import { createNativeCharacter, type CreateNativeCharacterInput, type LegacyCharacterSave } from '../../game-core/save'

export class LegacyProgressionApplication {
  createCharacter(input: CreateNativeCharacterInput): LegacyCharacterSave {
    return createNativeCharacter(input)
  }
}
