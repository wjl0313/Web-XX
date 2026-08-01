import type { LeaderboardType } from '../../../src/repositories/game-cloud.repository'
import {
  GameCloudServiceError,
  type GameCloudAppearanceDocument,
  type GameCloudChallengeCommit,
  type GameCloudCharacterDocument,
  type GameCloudIdentity,
  type GameCloudPublicationDocument,
  type GameCloudServerStore,
  type GameCloudUserDocument,
} from '../../../src/services/cloudbase/server/game-cloud-function.service'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function firstDocument(response: any): any | null {
  const data = response?.data
  if (Array.isArray(data)) return data[0] || null
  return data && typeof data === 'object' ? data : null
}

function documents(response: any): any[] {
  return Array.isArray(response?.data) ? response.data : []
}

function withoutDatabaseId<T extends Record<string, any>>(value: T): T {
  const output = clone(value)
  delete output._id
  delete output._openid
  return output
}

export class CloudBaseGameServerStore implements GameCloudServerStore {
  constructor(private readonly db: any) {}

  async ensureUser(identity: GameCloudIdentity, now: string): Promise<GameCloudUserDocument> {
    const reference = this.db.collection('users').doc(identity.userId)
    const current = firstDocument(await reference.get())
    const document = current
      ? { ...withoutDatabaseId(current), ...identity, updatedAt: now }
      : { ...identity, createdAt: now, updatedAt: now }
    await reference.set({ data: document })
    return document
  }

  async createCharacter(document: GameCloudCharacterDocument): Promise<GameCloudCharacterDocument> {
    const occupied = await this.db.collection('characters')
      .where({ ownerId: document.ownerId, slot: document.slot })
      .limit(1)
      .get()
    if (documents(occupied).length) throw new GameCloudServiceError('slot-occupied', '该云端角色槽位已被占用')
    try {
      await this.db.collection('characters').doc(document.id).set({ data: document })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (/duplicate|unique|E11000/i.test(message)) {
        throw new GameCloudServiceError('slot-occupied', '该云端角色槽位已被占用')
      }
      throw error
    }
    return clone(document)
  }

  async listCharacters(ownerId: string): Promise<GameCloudCharacterDocument[]> {
    const response = await this.db.collection('characters').where({ ownerId }).limit(24).get()
    return documents(response).map((document) => withoutDatabaseId(document) as GameCloudCharacterDocument)
  }

  async getOwnedCharacter(ownerId: string, characterId: string): Promise<GameCloudCharacterDocument | null> {
    const document = firstDocument(await this.db.collection('characters').doc(characterId).get())
    if (!document || document.ownerId !== ownerId) return null
    return withoutDatabaseId(document) as GameCloudCharacterDocument
  }

  async getPublishedCharacter(characterId: string): Promise<GameCloudPublicationDocument | null> {
    const document = firstDocument(await this.db.collection('publications').doc(characterId).get())
    return document ? withoutDatabaseId(document) as GameCloudPublicationDocument : null
  }

  async updateOwnedCharacter(
    ownerId: string,
    characterId: string,
    expectedUpdatedAt: string | null,
    update: (current: GameCloudCharacterDocument) => GameCloudCharacterDocument,
  ): Promise<GameCloudCharacterDocument> {
    let output: GameCloudCharacterDocument | null = null
    await this.db.runTransaction(async (transaction: any) => {
      const reference = transaction.collection('characters').doc(characterId)
      const currentRaw = firstDocument(await reference.get())
      if (!currentRaw || currentRaw.ownerId !== ownerId) {
        throw new GameCloudServiceError('character-not-found', '角色不存在')
      }
      const current = withoutDatabaseId(currentRaw) as GameCloudCharacterDocument
      if (expectedUpdatedAt !== null && current.updatedAt !== expectedUpdatedAt) {
        throw new GameCloudServiceError('save-conflict', '存档版本冲突')
      }
      const next = update(clone(current))
      if (next.id !== current.id || next.ownerId !== current.ownerId || next.slot !== current.slot) {
        throw new GameCloudServiceError('immutable-field', '禁止修改角色归属或槽位')
      }
      await reference.set({ data: next })
      output = next
    })
    if (!output) throw new GameCloudServiceError('transaction-failed', '角色事务未返回结果', true)
    return clone(output)
  }

  async upsertPublication(document: GameCloudPublicationDocument): Promise<void> {
    await this.db.collection('publications').doc(document.characterId).set({ data: document })
  }

  async publishOwnedCharacter(
    ownerId: string,
    characterId: string,
    expectedUpdatedAt: string,
    publication: GameCloudPublicationDocument,
    updatedAt: string,
  ): Promise<GameCloudCharacterDocument> {
    let output: GameCloudCharacterDocument | null = null
    await this.db.runTransaction(async (transaction: any) => {
      const characterReference = transaction.collection('characters').doc(characterId)
      const currentRaw = firstDocument(await characterReference.get())
      if (!currentRaw || currentRaw.ownerId !== ownerId) {
        throw new GameCloudServiceError('character-not-found', '角色不存在')
      }
      if (currentRaw.updatedAt !== expectedUpdatedAt) {
        throw new GameCloudServiceError('save-conflict', '存档版本冲突')
      }
      const next = { ...withoutDatabaseId(currentRaw), published: true, updatedAt } as GameCloudCharacterDocument
      await characterReference.set({ data: next })
      await transaction.collection('publications').doc(characterId).set({ data: publication })
      output = next
    })
    if (!output) throw new GameCloudServiceError('transaction-failed', '发布事务未返回结果', true)
    return clone(output)
  }

  async commitChallenge(commit: GameCloudChallengeCommit): Promise<void> {
    await this.db.runTransaction(async (transaction: any) => {
      const characters = transaction.collection('characters')
      const publications = transaction.collection('publications')
      const attackerReference = characters.doc(commit.attackerCharacterId)
      const attackerRaw = firstDocument(await attackerReference.get())
      if (!attackerRaw || attackerRaw.ownerId !== commit.ownerId) {
        throw new GameCloudServiceError('character-not-found', '进攻角色不存在')
      }
      if (attackerRaw.updatedAt !== commit.expectedUpdatedAt) {
        throw new GameCloudServiceError('save-conflict', '进攻角色版本冲突')
      }
      const defenderPublicationReference = publications.doc(commit.defenderCharacterId)
      const defenderPublication = firstDocument(await defenderPublicationReference.get())
      if (!defenderPublication) throw new GameCloudServiceError('opponent-not-found', '挑战目标不存在')

      await attackerReference.update({ data: { rating: commit.attackerRating, updatedAt: commit.updatedAt } })
      await defenderPublicationReference.update({ data: { rating: commit.defenderRating, updatedAt: commit.updatedAt } })
      const attackerPublicationReference = publications.doc(commit.attackerCharacterId)
      const attackerPublication = firstDocument(await attackerPublicationReference.get())
      if (attackerPublication) {
        await attackerPublicationReference.update({ data: { rating: commit.attackerRating, updatedAt: commit.updatedAt } })
      }
      const defenderCharacterReference = characters.doc(commit.defenderCharacterId)
      const defenderCharacter = firstDocument(await defenderCharacterReference.get())
      if (defenderCharacter) {
        await defenderCharacterReference.update({ data: { rating: commit.defenderRating, updatedAt: commit.updatedAt } })
      }
      await transaction.collection('battles').doc(commit.battle.recordId).set({ data: commit.battle })
    })
  }

  async queryLeaderboard(type: LeaderboardType, limit: number): Promise<GameCloudPublicationDocument[]> {
    const field = {
      power: 'power',
      level: 'level',
      rating: 'rating',
      kills: 'kills',
      'weekly-xp': 'weeklyXp',
      'weekly-gold': 'weeklyGold',
    }[type]
    const response = await this.db.collection('publications').orderBy(field, 'desc').limit(limit).get()
    return documents(response).map((document) => withoutDatabaseId(document) as GameCloudPublicationDocument)
  }

  async upsertAppearance(document: GameCloudAppearanceDocument): Promise<void> {
    await this.db.runTransaction(async (transaction: any) => {
      await transaction.collection('appearances').doc(document.characterId).set({ data: document })
      if (document.status !== 'succeeded' || !document.imageUrl) return
      const publicationReference = transaction.collection('publications').doc(document.characterId)
      if (firstDocument(await publicationReference.get())) {
        await publicationReference.update({ data: { avatarUrl: document.imageUrl, updatedAt: document.updatedAt } })
      }
    })
  }
}
