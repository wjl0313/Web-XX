import type {
  ChallengePlayerInput,
  ClaimAfkRewardInput,
  ClaimAfkRewardResult,
  CloudBattleResult,
  CloudCharacterSave,
  CreateCloudCharacterInput,
  EquipCloudItemInput,
  GameCloudRepository,
  LeaderboardEntry,
  LeaderboardType,
  SaveAppearanceInput,
  SaveCloudCharacterInput,
  UserSession,
} from '../../repositories/game-cloud.repository'
import type { CloudFunctionClient } from './cloud-function.client'

function payload(value: object): Record<string, unknown> {
  return value as Record<string, unknown>
}

export class CloudBaseGameRepository implements GameCloudRepository {
  constructor(private readonly client: CloudFunctionClient) {}

  signInAnonymously(): Promise<UserSession> {
    return this.client.invoke<UserSession>('bootstrap-user')
  }

  createCharacter(input: CreateCloudCharacterInput): Promise<CloudCharacterSave> {
    return this.client.invoke<CloudCharacterSave>('create-character', payload(input))
  }

  loadCharacters(): Promise<CloudCharacterSave[]> {
    return this.client.invoke<CloudCharacterSave[]>('load-characters')
  }

  saveCharacter(input: SaveCloudCharacterInput): Promise<CloudCharacterSave> {
    return this.client.invoke<CloudCharacterSave>('save-character', payload(input))
  }

  claimAfkReward(input: ClaimAfkRewardInput): Promise<ClaimAfkRewardResult> {
    return this.client.invoke<ClaimAfkRewardResult>('claim-afk-reward', payload(input))
  }

  equipItem(input: EquipCloudItemInput): Promise<CloudCharacterSave> {
    return this.client.invoke<CloudCharacterSave>('equip-item', payload(input))
  }

  async publishCharacter(characterId: string): Promise<void> {
    await this.client.invoke('publish-character', { characterId })
  }

  challengePlayer(input: ChallengePlayerInput): Promise<CloudBattleResult> {
    return this.client.invoke<CloudBattleResult>('challenge-player', payload(input))
  }

  getLeaderboard(type: LeaderboardType, limit = 100): Promise<LeaderboardEntry[]> {
    return this.client.invoke<LeaderboardEntry[]>('get-leaderboard', {
      type,
      limit: Math.max(1, Math.min(100, Math.floor(limit))),
    })
  }

  async saveAppearance(input: SaveAppearanceInput): Promise<void> {
    await this.client.invoke('save-appearance', payload(input))
  }
}
