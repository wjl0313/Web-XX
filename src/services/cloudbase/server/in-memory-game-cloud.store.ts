import type { LeaderboardType } from '../../../repositories/game-cloud.repository'
import {
  GameCloudServiceError,
  type GameCloudAppearanceDocument,
  type GameCloudChallengeCommit,
  type GameCloudCharacterDocument,
  type GameCloudIdentity,
  type GameCloudPublicationDocument,
  type GameCloudServerStore,
  type GameCloudUserDocument,
} from './game-cloud-function.service'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function valueFor(document: GameCloudPublicationDocument, type: LeaderboardType): number {
  if (type === 'level') return document.level
  if (type === 'rating') return document.rating
  if (type === 'kills') return document.kills
  if (type === 'weekly-xp') return document.weeklyXp
  if (type === 'weekly-gold') return document.weeklyGold
  if (type === 'realm') return document.realmRank
  return document.power
}

export class InMemoryGameCloudStore implements GameCloudServerStore {
  readonly users = new Map<string, GameCloudUserDocument>()
  readonly characters = new Map<string, GameCloudCharacterDocument>()
  readonly publications = new Map<string, GameCloudPublicationDocument>()
  readonly battles = new Map<string, GameCloudChallengeCommit['battle']>()
  readonly appearances = new Map<string, GameCloudAppearanceDocument>()

  async ensureUser(identity: GameCloudIdentity, now: string): Promise<GameCloudUserDocument> {
    const current = this.users.get(identity.userId)
    const next = current
      ? { ...current, anonymous: identity.anonymous, displayName: identity.displayName, updatedAt: now }
      : { ...identity, createdAt: now, updatedAt: now }
    this.users.set(identity.userId, clone(next))
    return clone(next)
  }

  async createCharacter(document: GameCloudCharacterDocument): Promise<GameCloudCharacterDocument> {
    if ([...this.characters.values()].some((entry) => entry.ownerId === document.ownerId && entry.slot === document.slot)) {
      throw new GameCloudServiceError('slot-occupied', '该云端角色槽位已被占用')
    }
    this.characters.set(document.id, clone(document))
    return clone(document)
  }

  async listCharacters(ownerId: string): Promise<GameCloudCharacterDocument[]> {
    return [...this.characters.values()].filter((document) => document.ownerId === ownerId).map(clone)
  }

  async getOwnedCharacter(ownerId: string, characterId: string): Promise<GameCloudCharacterDocument | null> {
    const document = this.characters.get(characterId)
    return document?.ownerId === ownerId ? clone(document) : null
  }

  async getPublishedCharacter(characterId: string): Promise<GameCloudPublicationDocument | null> {
    const document = this.publications.get(characterId)
    return document ? clone(document) : null
  }

  async updateOwnedCharacter(
    ownerId: string,
    characterId: string,
    expectedUpdatedAt: string | null,
    update: (current: GameCloudCharacterDocument) => GameCloudCharacterDocument,
  ): Promise<GameCloudCharacterDocument> {
    const current = this.characters.get(characterId)
    if (!current || current.ownerId !== ownerId) {
      throw new GameCloudServiceError('character-not-found', '角色不存在')
    }
    if (expectedUpdatedAt !== null && current.updatedAt !== expectedUpdatedAt) {
      throw new GameCloudServiceError('save-conflict', '存档版本冲突')
    }
    const next = update(clone(current))
    if (next.id !== current.id || next.ownerId !== current.ownerId || next.slot !== current.slot) {
      throw new GameCloudServiceError('immutable-field', '禁止修改角色归属或槽位')
    }
    this.characters.set(characterId, clone(next))
    return clone(next)
  }

  async upsertPublication(document: GameCloudPublicationDocument): Promise<void> {
    this.publications.set(document.characterId, clone(document))
  }

  async publishOwnedCharacter(
    ownerId: string,
    characterId: string,
    expectedUpdatedAt: string,
    publication: GameCloudPublicationDocument,
    updatedAt: string,
  ): Promise<GameCloudCharacterDocument> {
    const character = this.characters.get(characterId)
    if (!character || character.ownerId !== ownerId) {
      throw new GameCloudServiceError('character-not-found', '角色不存在')
    }
    if (character.updatedAt !== expectedUpdatedAt) {
      throw new GameCloudServiceError('save-conflict', '存档版本冲突')
    }
    character.published = true
    character.updatedAt = updatedAt
    this.characters.set(characterId, clone(character))
    this.publications.set(characterId, clone(publication))
    return clone(character)
  }

  async commitChallenge(commit: GameCloudChallengeCommit): Promise<void> {
    const replay = [...this.battles.values()].find((battle) =>
      battle.ownerId === commit.ownerId && battle.requestId === commit.battle.requestId)
    if (replay) return
    const attacker = this.characters.get(commit.attackerCharacterId)
    if (!attacker || attacker.ownerId !== commit.ownerId) {
      throw new GameCloudServiceError('character-not-found', '进攻角色不存在')
    }
    if (attacker.updatedAt !== commit.expectedUpdatedAt) {
      throw new GameCloudServiceError('save-conflict', '进攻角色版本冲突')
    }
    const defenderPublication = this.publications.get(commit.defenderCharacterId)
    if (!defenderPublication) throw new GameCloudServiceError('opponent-not-found', '挑战目标不存在')

    attacker.rating = commit.attackerRating
    attacker.updatedAt = commit.updatedAt
    this.characters.set(attacker.id, clone(attacker))
    const attackerPublication = this.publications.get(attacker.id)
    if (attackerPublication) {
      attackerPublication.rating = commit.attackerRating
      attackerPublication.updatedAt = commit.updatedAt
      this.publications.set(attacker.id, clone(attackerPublication))
    }
    defenderPublication.rating = commit.defenderRating
    defenderPublication.updatedAt = commit.updatedAt
    this.publications.set(defenderPublication.characterId, clone(defenderPublication))
    const defender = this.characters.get(commit.defenderCharacterId)
    if (defender) {
      defender.rating = commit.defenderRating
      defender.updatedAt = commit.updatedAt
      this.characters.set(defender.id, clone(defender))
    }
    this.battles.set(commit.battle.recordId, clone(commit.battle))
  }

  async findChallengeByRequest(ownerId: string, requestId: string): Promise<GameCloudChallengeCommit['battle'] | null> {
    const battle = [...this.battles.values()].find((entry) => entry.ownerId === ownerId && entry.requestId === requestId)
    return battle ? clone(battle) : null
  }

  async queryLeaderboard(type: LeaderboardType, limit: number): Promise<GameCloudPublicationDocument[]> {
    return [...this.publications.values()]
      .sort((left, right) => valueFor(right, type) - valueFor(left, type) || left.characterId.localeCompare(right.characterId))
      .slice(0, limit)
      .map(clone)
  }

  async upsertAppearance(document: GameCloudAppearanceDocument): Promise<void> {
    this.appearances.set(document.characterId, clone(document))
    const publication = this.publications.get(document.characterId)
    if (publication && document.status === 'succeeded' && document.imageUrl) {
      publication.avatarUrl = document.imageUrl
      publication.updatedAt = document.updatedAt
      this.publications.set(publication.characterId, clone(publication))
    }
  }
}
