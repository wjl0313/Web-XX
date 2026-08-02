import type { CharacterClassId } from '../../domain'
import {
  canP2RootLearnElement,
  getP2RootProfile,
  type P2RootId,
  type P2RootProfile,
} from '../../domain/progression'
import { V2_CLASS_TECHNIQUES, V2_TECHNIQUES } from './content'
import { V2_ENABLED_TECHNIQUE_IDS } from './content.flags'
import type { TechniqueDefinition } from './types'

export function canV2RootLearnTechnique(
  root: P2RootProfile | P2RootId | unknown,
  technique: TechniqueDefinition | string,
): boolean {
  const definition = typeof technique === 'string' ? V2_TECHNIQUES[technique] : technique
  return Boolean(definition && canP2RootLearnElement(root, definition.element))
}

export function getV2LearnableTechniqueIds(root: P2RootProfile | P2RootId | unknown): string[] {
  return V2_ENABLED_TECHNIQUE_IDS.filter((id) => canV2RootLearnTechnique(root, id))
}

export function getV2InitialTechniqueIds(rootId: P2RootId, classId: CharacterClassId): string[] {
  const root = getP2RootProfile(rootId)
  const preferred = V2_CLASS_TECHNIQUES[classId] || []
  const learnable = getV2LearnableTechniqueIds(root)
  return Array.from(new Set([
    ...preferred.filter((id) => canV2RootLearnTechnique(root, id)),
    ...learnable,
  ])).slice(0, 3)
}
