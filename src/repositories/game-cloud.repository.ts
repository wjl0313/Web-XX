import type { LegacyCharacterSave } from '../game-core/save'
import type { LegacyAfkSummary } from '../game-core/systems/afk'
import type { V2OfflineSummary } from '../game-core/rulesets/v2'

export interface UserSession {
  userId: string
  anonymous: boolean
  displayName: string | null
}

export interface CloudCharacterSave {
  id: string
  slot: number
  schemaVersion: number
  gameVersion: string
  data: LegacyCharacterSave
  updatedAt: string
}

export interface CreateCloudCharacterInput {
  slot: number
  name: string
  race: string
  classId: string
  hardcore?: boolean
  ruleset?: 'legacy' | 'v2'
  rootId?: string
  mainTalentId?: string
  secondaryTalentId?: string
  talentSeed?: string
}

export interface SaveCloudCharacterInput {
  characterId: string
  expectedUpdatedAt: string | null
  data: LegacyCharacterSave
}

export interface ClaimAfkRewardInput {
  characterId: string
  expectedUpdatedAt: string
  lastActiveAt: string
  claimedAt: string
  requestId: string
}

export interface ClaimAfkRewardResult {
  save: CloudCharacterSave
  summary: LegacyAfkSummary | V2OfflineSummary
}

export interface EquipCloudItemInput {
  characterId: string
  expectedUpdatedAt: string
  inventoryIndex?: number
  unequipSlot?: string
}

export interface BreakthroughCloudCharacterInput {
  characterId: string
  expectedUpdatedAt: string
  requestId: string
}

export interface ChallengePlayerInput {
  attackerCharacterId: string
  defenderCharacterId: string
  expectedUpdatedAt: string
  requestId: string
}

export interface CloudBattleResult {
  recordId: string
  seed: string
  winnerCharacterId: string
  ratingChange: number
  battleLog: readonly Record<string, unknown>[]
}

export type LeaderboardType =
  | 'power'
  | 'level'
  | 'rating'
  | 'kills'
  | 'weekly-xp'
  | 'weekly-gold'
  | 'realm'

export interface LeaderboardEntry {
  rank: number
  characterId: string
  name: string
  classId: string
  level: number
  power: number
  rating: number
  value: number
  avatarUrl: string | null
  realmName?: string
}

export interface SaveAppearanceInput {
  characterId: string
  taskId: string
  status: 'queued' | 'running' | 'succeeded' | 'failed'
  imageUrl: string | null
  model: string
  seed: string | null
  errorMessage?: string | null
}

export interface GameCloudRepository {
  signInAnonymously(): Promise<UserSession>
  bindAccount(displayName: string): Promise<UserSession>
  createCharacter(input: CreateCloudCharacterInput): Promise<CloudCharacterSave>
  loadCharacters(): Promise<CloudCharacterSave[]>
  saveCharacter(input: SaveCloudCharacterInput): Promise<CloudCharacterSave>
  claimAfkReward(input: ClaimAfkRewardInput): Promise<ClaimAfkRewardResult>
  equipItem(input: EquipCloudItemInput): Promise<CloudCharacterSave>
  breakthroughCharacter(input: BreakthroughCloudCharacterInput): Promise<CloudCharacterSave>
  publishCharacter(characterId: string): Promise<void>
  challengePlayer(input: ChallengePlayerInput): Promise<CloudBattleResult>
  getLeaderboard(type: LeaderboardType, limit?: number): Promise<LeaderboardEntry[]>
  saveAppearance(input: SaveAppearanceInput): Promise<void>
}
