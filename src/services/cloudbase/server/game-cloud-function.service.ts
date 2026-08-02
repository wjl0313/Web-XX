import {
  LEGACY_GAME_VERSION,
  LEGACY_SAVE_SCHEMA,
  createNativeCharacter,
  createSeededRandom,
  equipLegacyInventoryItem,
  getLegacyItemBaseName,
  simulateLegacyAfkReturn,
  unequipLegacyItem,
} from '../../../game-core'
import {
  getRealmDefinition,
  getV2ProgressionState,
  isP2RootId,
  migrateV2Progression,
} from '../../../game-core/domain/progression'
import { V2EquipmentApplication, V2ProgressionApplication } from '../../../application/v2'
import {
  PlayerAutoStrategy,
  V2_ENABLED_TECHNIQUE_IDS,
  V2_TECHNIQUES,
  canV2RootLearnTechnique,
  createV2BattleState,
  createV2PlayerActor,
  getV2BalanceConfig,
  getV2TechniqueCatalog,
  isV2EquipmentEnabled,
  isV2ZoneEnabled,
  normalizeTechniqueLoadout,
  runV2StrategyUntilComplete,
  simulateV2Offline,
  startV2Battle,
} from '../../../game-core/rulesets/v2'
import { getCharacterRuleset } from '../../../game-core/rulesets'
import type {
  LegacyCharacterSave,
} from '../../../game-core'
import type {
  ClaimAfkRewardResult,
  CloudBattleResult,
  CloudCharacterSave,
  LeaderboardEntry,
  LeaderboardType,
  UserSession,
} from '../../../repositories/game-cloud.repository'

export const GAME_CLOUD_FUNCTION_NAMES = [
  'bootstrap-user',
  'bind-account',
  'create-character',
  'load-characters',
  'save-character',
  'claim-afk-reward',
  'equip-item',
  'breakthrough-character',
  'publish-character',
  'challenge-player',
  'get-leaderboard',
  'save-appearance',
] as const

export type GameCloudFunctionName = (typeof GAME_CLOUD_FUNCTION_NAMES)[number]

export interface GameCloudIdentity {
  userId: string
  anonymous: boolean
  displayName: string | null
}

export interface GameCloudUserDocument extends GameCloudIdentity {
  createdAt: string
  updatedAt: string
}

export interface GameCloudCharacterDocument extends CloudCharacterSave {
  ownerId: string
  rating: number
  published: boolean
  createdAt: string
  lastAfkRequestId?: string
  lastAfkSummary?: ClaimAfkRewardResult['summary']
  lastBreakthroughRequestId?: string
}

export interface GameCloudPublicationDocument {
  characterId: string
  ownerId: string
  name: string
  classId: string
  level: number
  power: number
  rating: number
  kills: number
  weeklyXp: number
  weeklyGold: number
  avatarUrl: string | null
  realmName: string
  realmRank: number
  snapshot: LegacyCharacterSave
  updatedAt: string
}

export interface GameCloudAppearanceDocument {
  characterId: string
  ownerId: string
  taskId: string
  status: 'queued' | 'running' | 'succeeded' | 'failed'
  imageUrl: string | null
  model: string
  seed: string | null
  errorMessage: string | null
  updatedAt: string
}

export interface GameCloudBattleDocument extends CloudBattleResult {
  ownerId: string
  requestId: string
  attackerCharacterId: string
  defenderCharacterId: string
  createdAt: string
}

export interface GameCloudChallengeCommit {
  ownerId: string
  attackerCharacterId: string
  defenderCharacterId: string
  expectedUpdatedAt: string
  attackerRating: number
  defenderRating: number
  battle: GameCloudBattleDocument
  updatedAt: string
}

export interface GameCloudServerStore {
  ensureUser(identity: GameCloudIdentity, now: string): Promise<GameCloudUserDocument>
  createCharacter(document: GameCloudCharacterDocument): Promise<GameCloudCharacterDocument>
  listCharacters(ownerId: string): Promise<GameCloudCharacterDocument[]>
  getOwnedCharacter(ownerId: string, characterId: string): Promise<GameCloudCharacterDocument | null>
  getPublishedCharacter(characterId: string): Promise<GameCloudPublicationDocument | null>
  updateOwnedCharacter(
    ownerId: string,
    characterId: string,
    expectedUpdatedAt: string | null,
    update: (current: GameCloudCharacterDocument) => GameCloudCharacterDocument,
  ): Promise<GameCloudCharacterDocument>
  upsertPublication(document: GameCloudPublicationDocument): Promise<void>
  publishOwnedCharacter(
    ownerId: string,
    characterId: string,
    expectedUpdatedAt: string,
    publication: GameCloudPublicationDocument,
    updatedAt: string,
  ): Promise<GameCloudCharacterDocument>
  commitChallenge(commit: GameCloudChallengeCommit): Promise<void>
  findChallengeByRequest(ownerId: string, requestId: string): Promise<GameCloudBattleDocument | null>
  queryLeaderboard(type: LeaderboardType, limit: number): Promise<GameCloudPublicationDocument[]>
  upsertAppearance(document: GameCloudAppearanceDocument): Promise<void>
}

export class GameCloudServiceError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable = false,
  ) {
    super(message)
    this.name = 'GameCloudServiceError'
  }
}

export interface GameCloudFunctionServiceOptions {
  now?: () => number
  createId?: (prefix: string) => string
}

export type GameCloudFunctionResponse =
  | { ok: true; data: unknown }
  | { ok: false; error: { code: string; message: string; retryable: boolean } }

const EQUIPMENT_SLOTS = new Set(['weapon', 'offhand', 'chest', 'legs', 'feet', 'charm'])
const LEADERBOARD_TYPES = new Set<LeaderboardType>(['power', 'rating', 'realm'])

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requiredString(value: unknown, field: string, maximum = 128): string {
  const normalized = String(value || '').trim()
  if (!normalized || normalized.length > maximum) {
    throw new GameCloudServiceError('invalid-input', `${field} 无效`)
  }
  return normalized
}

function requiredTimestamp(value: unknown, field: string): string {
  const normalized = requiredString(value, field, 64)
  if (!Number.isFinite(Date.parse(normalized))) {
    throw new GameCloudServiceError('invalid-input', `${field} 不是有效时间`)
  }
  return normalized
}

function validateCharacterData(value: unknown): LegacyCharacterSave {
  if (!isRecord(value)) throw new GameCloudServiceError('invalid-save', '角色存档必须是对象')
  const bytes = new TextEncoder().encode(JSON.stringify(value)).byteLength
  if (bytes > 900_000) throw new GameCloudServiceError('save-too-large', '角色存档超过服务端大小限制')
  const data = clone(value)
  data.name = requiredString(data.name, 'name', 24)
  data.cls = requiredString(data.cls, 'class', 32)
  data.race = requiredString(data.race, 'race', 32)
  data.level = Math.max(1, Math.min(999, Math.floor(Number(data.level) || 1)))
  data.maxHp = Math.max(1, Math.floor(Number(data.maxHp) || 1))
  data.hp = Math.max(0, Math.min(data.maxHp, Math.floor(Number(data.hp) || 0)))
  data.maxMp = Math.max(0, Math.floor(Number(data.maxMp) || 0))
  data.mp = Math.max(0, Math.min(data.maxMp, Math.floor(Number(data.mp) || 0)))
  data.gold = Math.max(0, Math.floor(Number(data.gold) || 0))
  if (!Array.isArray(data.inventory)) data.inventory = []
  if (!isRecord(data.equipment)) data.equipment = {}
  data.version = LEGACY_GAME_VERSION
  if (getCharacterRuleset(data) !== 'v2') return data
  const submittedProgression = isRecord(data.v2Progression) ? data.v2Progression : null
  if (!submittedProgression || !isP2RootId(submittedProgression.rootId)) {
    throw new GameCloudServiceError('invalid-root', '灵根资质无效')
  }
  const migrated = migrateV2Progression(data)
  if (!isV2ZoneEnabled(migrated.zone)) throw new GameCloudServiceError('invalid-zone', '当前历练区域未开放')
  const progression = getV2ProgressionState(migrated)
  const submittedKnown = Array.isArray(migrated.v2KnownTechniques)
    ? migrated.v2KnownTechniques.map(String)
    : []
  if (
    !submittedKnown.length
    || submittedKnown.some((id) => !(V2_ENABLED_TECHNIQUE_IDS as readonly string[]).includes(id))
    || submittedKnown.some((id) => !canV2RootLearnTechnique(progression.rootId, id))
    || submittedKnown.length !== new Set(submittedKnown).size
  ) throw new GameCloudServiceError('invalid-techniques', '已获得功法与灵根资质不符')
  const known = submittedKnown
  const submittedSlots = isRecord(migrated.v2TechniqueLoadout) && Array.isArray(migrated.v2TechniqueLoadout.slots)
    ? migrated.v2TechniqueLoadout.slots.slice(0, 4).map((id: unknown) => id == null || id === '' ? null : String(id))
    : []
  const submittedEquipped = submittedSlots.filter((id: string | null): id is string => Boolean(id))
  if (
    submittedSlots.length > 3
    || submittedEquipped.some((id: string) => !known.includes(id))
    || submittedEquipped.length !== new Set(submittedEquipped).size
  ) throw new GameCloudServiceError('invalid-technique-loadout', '出战功法配置无效')
  const loadout = normalizeTechniqueLoadout(migrated.v2TechniqueLoadout, known)
  const equippedTechniques = loadout.slots.filter((id): id is string => Boolean(id))
  if (equippedTechniques.length > 3 || equippedTechniques.length !== new Set(equippedTechniques).size) {
    throw new GameCloudServiceError('invalid-technique-loadout', '出战功法配置无效')
  }
  migrated.v2KnownTechniques = known
  migrated.v2TechniqueLoadout = loadout
  for (const item of Object.values(migrated.equipment as Record<string, unknown>)) {
    if (item && !isV2EquipmentEnabled(getLegacyItemBaseName(item))) {
      throw new GameCloudServiceError('invalid-equipment', '装备未纳入服务端白名单')
    }
  }
  return migrated
}

function validateV2SaveTransition(
  current: LegacyCharacterSave,
  incoming: LegacyCharacterSave,
  serverNow: number,
): LegacyCharacterSave {
  if (getCharacterRuleset(current) !== 'v2' || getCharacterRuleset(incoming) !== 'v2') return incoming
  const before = getV2ProgressionState(current)
  const after = getV2ProgressionState(incoming)
  if (
    before.rootId !== after.rootId
    || before.mainTalentId !== after.mainTalentId
    || before.secondaryTalentId !== after.secondaryTalentId
    || JSON.stringify(before.talentChoices) !== JSON.stringify(after.talentChoices)
  ) {
    throw new GameCloudServiceError('immutable-progression-profile', '灵根与天赋只能由服务端创建流程确定')
  }
  if (before.realm.realmId !== after.realm.realmId || before.realm.breakthroughs !== after.realm.breakthroughs) {
    throw new GameCloudServiceError('breakthrough-requires-server', '境界变化必须通过服务端突破确认')
  }
  const next = clone(incoming)
  const wasEnabled = Boolean(current.v2AfkEnabled)
  const willEnable = Boolean(incoming.v2AfkEnabled)
  next.v2AfkEnabled = willEnable
  next.v2LastAfkAt = willEnable
    ? (wasEnabled ? Number(current.v2LastAfkAt || serverNow) : serverNow)
    : null
  return next
}

function toCloudSave(document: GameCloudCharacterDocument): CloudCharacterSave {
  return {
    id: document.id,
    slot: document.slot,
    schemaVersion: document.schemaVersion,
    gameVersion: document.gameVersion,
    data: clone(document.data),
    updatedAt: document.updatedAt,
  }
}

function calculatePower(data: LegacyCharacterSave): number {
  return Math.max(1, Math.floor(
    Number(data.level || 1) * 20
    + Number(data.atk || 0) * 4
    + Number(data.def || 0) * 4
    + Number(data.maxHp || 0)
    + Number(data.maxMp || 0) * 0.5,
  ))
}

function publicationFrom(document: GameCloudCharacterDocument, now: string): GameCloudPublicationDocument {
  const data = document.data as Record<string, any>
  const progression = getCharacterRuleset(data) === 'v2' ? getV2ProgressionState(data) : null
  const realm = progression ? getRealmDefinition(progression.realm.realmId) : null
  return {
    characterId: document.id,
    ownerId: document.ownerId,
    name: String(data.name || ''),
    classId: String(data.cls || ''),
    level: Math.max(1, Math.floor(Number(data.level || 1))),
    power: calculatePower(data),
    rating: Math.floor(Number(document.rating || 1_000)),
    kills: Math.max(0, Math.floor(Number(data.stats?.kills || 0))),
    weeklyXp: Math.max(0, Math.floor(Number(data.weekly?.xp || data.weeklyXp || 0))),
    weeklyGold: Math.max(0, Math.floor(Number(data.weekly?.gold || data.weeklyGold || 0))),
    avatarUrl: typeof data.appearance?.imageUrl === 'string' ? data.appearance.imageUrl : null,
    realmName: realm?.displayName || `修为等级 ${Math.max(1, Math.floor(Number(data.level || 1)))}`,
    realmRank: progression?.realm.breakthroughs || Math.max(0, Math.floor(Number(data.level || 1)) - 1),
    snapshot: clone(data),
    updatedAt: now,
  }
}

function leaderboardValue(document: GameCloudPublicationDocument, type: LeaderboardType): number {
  if (type === 'realm') return document.realmRank
  if (type === 'level') return document.level
  if (type === 'rating') return document.rating
  if (type === 'kills') return document.kills
  if (type === 'weekly-xp') return document.weeklyXp
  if (type === 'weekly-gold') return document.weeklyGold
  return document.power
}

function asLeaderboardEntries(
  documents: readonly GameCloudPublicationDocument[],
  type: LeaderboardType,
): LeaderboardEntry[] {
  return documents.map((document, index) => ({
    rank: index + 1,
    characterId: document.characterId,
    name: document.name,
    classId: document.classId,
    level: document.level,
    power: document.power,
    rating: document.rating,
    value: leaderboardValue(document, type),
    avatarUrl: document.avatarUrl,
    realmName: document.realmName,
  }))
}

export class GameCloudFunctionService {
  private readonly now: () => number
  private readonly createId: (prefix: string) => string
  private readonly v2Equipment = new V2EquipmentApplication()
  private readonly v2Progression = new V2ProgressionApplication()

  constructor(
    private readonly store: GameCloudServerStore,
    options: GameCloudFunctionServiceOptions = {},
  ) {
    this.now = options.now || Date.now
    this.createId = options.createId || ((prefix) => `${prefix}-${this.now()}-${Math.random().toString(36).slice(2, 12)}`)
  }

  async invoke(
    functionName: string,
    event: unknown,
    identity: GameCloudIdentity | null,
  ): Promise<GameCloudFunctionResponse> {
    try {
      if (!GAME_CLOUD_FUNCTION_NAMES.includes(functionName as GameCloudFunctionName)) {
        throw new GameCloudServiceError('unknown-function', '未知云函数')
      }
      if (!identity?.userId) throw new GameCloudServiceError('unauthenticated', '请先登录')
      const data = await this.dispatch(functionName as GameCloudFunctionName, isRecord(event) ? event : {}, identity)
      return { ok: true, data }
    } catch (error) {
      const normalized = error instanceof GameCloudServiceError
        ? error
        : new GameCloudServiceError('internal-error', '服务端处理失败', true)
      return {
        ok: false,
        error: { code: normalized.code, message: normalized.message, retryable: normalized.retryable },
      }
    }
  }

  private async dispatch(
    functionName: GameCloudFunctionName,
    event: Record<string, any>,
    identity: GameCloudIdentity,
  ): Promise<unknown> {
    if (functionName === 'bootstrap-user') return this.bootstrapUser(identity)
    if (functionName === 'bind-account') return this.bindAccount(identity, event)
    if (functionName === 'create-character') return this.createCharacter(identity, event)
    if (functionName === 'load-characters') return this.loadCharacters(identity)
    if (functionName === 'save-character') return this.saveCharacter(identity, event)
    if (functionName === 'claim-afk-reward') return this.claimAfkReward(identity, event)
    if (functionName === 'equip-item') return this.equipItem(identity, event)
    if (functionName === 'breakthrough-character') return this.breakthroughCharacter(identity, event)
    if (functionName === 'publish-character') return this.publishCharacter(identity, event)
    if (functionName === 'challenge-player') return this.challengePlayer(identity, event)
    if (functionName === 'get-leaderboard') return this.getLeaderboard(event)
    return this.saveAppearance(identity, event)
  }

  private async bootstrapUser(identity: GameCloudIdentity): Promise<UserSession> {
    const now = new Date(this.now()).toISOString()
    const user = await this.store.ensureUser(identity, now)
    return { userId: user.userId, anonymous: user.anonymous, displayName: user.displayName }
  }

  private async bindAccount(identity: GameCloudIdentity, event: Record<string, any>): Promise<UserSession> {
    if (identity.anonymous) throw new GameCloudServiceError('account-link-required', '请先通过 CloudBase 身份服务绑定正式账号')
    const now = new Date(this.now()).toISOString()
    const user = await this.store.ensureUser({ ...identity, displayName: requiredString(event.displayName, 'displayName', 32) }, now)
    return { userId: user.userId, anonymous: false, displayName: user.displayName }
  }

  private async createCharacter(identity: GameCloudIdentity, event: Record<string, any>): Promise<CloudCharacterSave> {
    const slot = Math.floor(Number(event.slot))
    if (!Number.isInteger(slot) || slot < 0 || slot >= 24) {
      throw new GameCloudServiceError('invalid-slot', '角色槽位必须位于 0 到 23')
    }
    let data: LegacyCharacterSave
    try {
      data = createNativeCharacter({
        name: requiredString(event.name, 'name', 24),
        race: requiredString(event.race || '木天灵根', 'race', 32),
        classId: requiredString(event.classId, 'classId', 32),
        ruleset: event.ruleset === 'legacy' ? 'legacy' : 'v2',
        rootId: event.rootId,
        mainTalentId: event.mainTalentId,
        secondaryTalentId: event.secondaryTalentId,
        talentSeed: event.talentSeed || `${identity.userId}:${slot}:${this.now()}`,
        hardcore: event.ruleset === 'legacy' && Boolean(event.hardcore),
        now: this.now(),
      })
    } catch (error) {
      throw new GameCloudServiceError('invalid-character', error instanceof Error ? error.message : '角色参数无效')
    }
    const now = new Date(this.now()).toISOString()
    const created = await this.store.createCharacter({
      id: this.createId('char'),
      ownerId: identity.userId,
      slot,
      schemaVersion: LEGACY_SAVE_SCHEMA,
      gameVersion: LEGACY_GAME_VERSION,
      data,
      rating: 1_000,
      published: false,
      createdAt: now,
      updatedAt: now,
    })
    return toCloudSave(created)
  }

  private async loadCharacters(identity: GameCloudIdentity): Promise<CloudCharacterSave[]> {
    const documents = await this.store.listCharacters(identity.userId)
    return documents.sort((left, right) => left.slot - right.slot).map(toCloudSave)
  }

  private async saveCharacter(identity: GameCloudIdentity, event: Record<string, any>): Promise<CloudCharacterSave> {
    const characterId = requiredString(event.characterId, 'characterId')
    if (event.expectedUpdatedAt === null) {
      throw new GameCloudServiceError('missing-version', '保存云端角色必须提供当前版本')
    }
    const expected = requiredTimestamp(event.expectedUpdatedAt, 'expectedUpdatedAt')
    const data = validateCharacterData(event.data)
    const serverNow = this.now()
    const now = new Date(serverNow).toISOString()
    const updated = await this.store.updateOwnedCharacter(identity.userId, characterId, expected, (current) => ({
      ...current,
      schemaVersion: LEGACY_SAVE_SCHEMA,
      gameVersion: LEGACY_GAME_VERSION,
      data: validateV2SaveTransition(current.data, data, serverNow),
      updatedAt: now,
    }))
    if (updated.published) await this.store.upsertPublication(publicationFrom(updated, now))
    return toCloudSave(updated)
  }

  private async claimAfkReward(identity: GameCloudIdentity, event: Record<string, any>): Promise<ClaimAfkRewardResult> {
    const characterId = requiredString(event.characterId, 'characterId')
    const requestId = requiredString(event.requestId, 'requestId')
    const expected = requiredTimestamp(event.expectedUpdatedAt, 'expectedUpdatedAt')
    const lastActiveAt = requiredTimestamp(event.lastActiveAt, 'lastActiveAt')
    const requestedClaimedAt = requiredTimestamp(event.claimedAt, 'claimedAt')
    const serverNow = this.now()
    if (Math.abs(Date.parse(requestedClaimedAt) - serverNow) > 10 * 60_000) {
      throw new GameCloudServiceError('invalid-claim-time', '挂机领取时间偏离服务器时间过大')
    }
    const existing = await this.store.getOwnedCharacter(identity.userId, characterId)
    if (!existing) throw new GameCloudServiceError('character-not-found', '角色不存在')
    if (existing.lastAfkRequestId === requestId && existing.lastAfkSummary) {
      return { save: toCloudSave(existing), summary: clone(existing.lastAfkSummary) }
    }
    let summary: ClaimAfkRewardResult['summary'] | null = null
    const now = new Date(serverNow).toISOString()
    const updated = await this.store.updateOwnedCharacter(identity.userId, characterId, expected, (current) => {
      const storedData = current.data as Record<string, any>
      const isV2 = getCharacterRuleset(storedData) === 'v2'
      const storedLast = Number(isV2 ? storedData.v2LastAfkAt : storedData.lastAfkAt || 0)
      const afkEnabled = Boolean(isV2 ? storedData.v2AfkEnabled : storedData.afkEnabled)
      if (!afkEnabled || storedLast <= 0) {
        throw new GameCloudServiceError('afk-not-active', '服务端存档未开启挂机')
      }
      if (Math.abs(storedLast - Date.parse(lastActiveAt)) > 1_000) {
        throw new GameCloudServiceError('afk-state-conflict', '挂机起始时间与服务端存档不一致')
      }
      const elapsedMs = Math.max(0, serverNow - storedLast)
      const seed = `${identity.userId}:${characterId}:${requestId}:${storedLast}`
      const result = isV2
        ? simulateV2Offline(current.data, {
            elapsedMs,
            seed,
            configuration: storedData.v2AutoConfiguration,
          })
        : simulateLegacyAfkReturn(current.data, {
            elapsedMs: Math.min(30 * 86_400_000, elapsedMs),
            random: createSeededRandom(seed),
            now: serverNow,
          })
      if (isV2) result.character.v2LastAfkAt = serverNow
      else result.character.lastAfkAt = serverNow
      summary = result.summary
      return {
        ...current,
        data: result.character,
        lastAfkRequestId: requestId,
        lastAfkSummary: clone(result.summary),
        updatedAt: now,
      }
    })
    if (!summary) throw new GameCloudServiceError('afk-settlement-failed', '挂机结算未产生结果', true)
    if (updated.published) await this.store.upsertPublication(publicationFrom(updated, now))
    return { save: toCloudSave(updated), summary }
  }

  private async equipItem(identity: GameCloudIdentity, event: Record<string, any>): Promise<CloudCharacterSave> {
    const characterId = requiredString(event.characterId, 'characterId')
    const expected = requiredTimestamp(event.expectedUpdatedAt, 'expectedUpdatedAt')
    const hasInventoryIndex = Object.prototype.hasOwnProperty.call(event, 'inventoryIndex')
      && Number.isInteger(Number(event.inventoryIndex))
    const unequipSlot = typeof event.unequipSlot === 'string' ? event.unequipSlot : ''
    if (hasInventoryIndex === Boolean(unequipSlot)) {
      throw new GameCloudServiceError('invalid-equipment-command', '必须且只能指定一种穿脱操作')
    }
    if (unequipSlot && !EQUIPMENT_SLOTS.has(unequipSlot)) {
      throw new GameCloudServiceError('invalid-equipment-slot', '装备槽位无效')
    }
    const now = new Date(this.now()).toISOString()
    const updated = await this.store.updateOwnedCharacter(identity.userId, characterId, expected, (current) => {
      if (getCharacterRuleset(current.data) === 'v2') {
        const character = hasInventoryIndex
          ? this.v2Equipment.equipInventoryItem(current.data, Math.floor(Number(event.inventoryIndex)))
          : this.v2Equipment.unequip(current.data, unequipSlot as any)
        if (!character) throw new GameCloudServiceError('equipment-rejected', '装备操作未通过白名单或槽位校验')
        return { ...current, data: validateCharacterData(character), updatedAt: now }
      }
      const result = hasInventoryIndex
        ? equipLegacyInventoryItem(current.data, Math.floor(Number(event.inventoryIndex)))
        : unequipLegacyItem(current.data, unequipSlot as any)
      if (!result.applied) throw new GameCloudServiceError('equipment-rejected', `装备操作失败：${result.failure}`)
      return { ...current, data: result.character, updatedAt: now }
    })
    if (updated.published) await this.store.upsertPublication(publicationFrom(updated, now))
    return toCloudSave(updated)
  }

  private async breakthroughCharacter(identity: GameCloudIdentity, event: Record<string, any>): Promise<CloudCharacterSave> {
    const characterId = requiredString(event.characterId, 'characterId')
    const requestId = requiredString(event.requestId, 'requestId')
    const expected = requiredTimestamp(event.expectedUpdatedAt, 'expectedUpdatedAt')
    const existing = await this.store.getOwnedCharacter(identity.userId, characterId)
    if (!existing) throw new GameCloudServiceError('character-not-found', '角色不存在')
    if (existing.lastBreakthroughRequestId === requestId) return toCloudSave(existing)
    const now = new Date(this.now()).toISOString()
    const updated = await this.store.updateOwnedCharacter(identity.userId, characterId, expected, (current) => {
      if (getCharacterRuleset(current.data) !== 'v2') {
        throw new GameCloudServiceError('wrong-ruleset', '当前角色不能通过该入口突破')
      }
      const result = this.v2Progression.breakthrough(current.data)
      if (!result) throw new GameCloudServiceError('breakthrough-not-ready', '修为未满或已达到当前境界上限')
      return {
        ...current,
        data: validateCharacterData(result),
        lastBreakthroughRequestId: requestId,
        updatedAt: now,
      }
    })
    if (updated.published) await this.store.upsertPublication(publicationFrom(updated, now))
    return toCloudSave(updated)
  }

  private async publishCharacter(identity: GameCloudIdentity, event: Record<string, any>): Promise<void> {
    const characterId = requiredString(event.characterId, 'characterId')
    const current = await this.store.getOwnedCharacter(identity.userId, characterId)
    if (!current) throw new GameCloudServiceError('character-not-found', '角色不存在')
    const now = new Date(this.now()).toISOString()
    const publication = publicationFrom(current, now)
    await this.store.publishOwnedCharacter(identity.userId, characterId, current.updatedAt, publication, now)
  }

  private async challengePlayer(identity: GameCloudIdentity, event: Record<string, any>): Promise<CloudBattleResult> {
    const attackerId = requiredString(event.attackerCharacterId, 'attackerCharacterId')
    const defenderId = requiredString(event.defenderCharacterId, 'defenderCharacterId')
    const expected = requiredTimestamp(event.expectedUpdatedAt, 'expectedUpdatedAt')
    const requestId = requiredString(event.requestId, 'requestId')
    if (attackerId === defenderId) throw new GameCloudServiceError('invalid-opponent', '不能挑战自己')
    const replay = await this.store.findChallengeByRequest(identity.userId, requestId)
    if (replay) return {
      recordId: replay.recordId,
      seed: replay.seed,
      winnerCharacterId: replay.winnerCharacterId,
      ratingChange: replay.ratingChange,
      battleLog: clone(replay.battleLog),
    }
    const attacker = await this.store.getOwnedCharacter(identity.userId, attackerId)
    if (!attacker) throw new GameCloudServiceError('character-not-found', '进攻角色不存在')
    if (attacker.updatedAt !== expected) throw new GameCloudServiceError('save-conflict', '进攻角色版本冲突')
    const defender = await this.store.getPublishedCharacter(defenderId)
    if (!defender) throw new GameCloudServiceError('opponent-not-found', '挑战目标未公开或不存在')
    const attackerData = validateCharacterData(attacker.data)
    const defenderData = validateCharacterData(defender.snapshot)
    if (getCharacterRuleset(attackerData) !== 'v2' || getCharacterRuleset(defenderData) !== 'v2') {
      throw new GameCloudServiceError('wrong-ruleset', '异步斗法只接受当前修行体系的公开快照')
    }
    const seed = `${attackerId}:${defenderId}:${requestId}`
    const attackerActor = createV2PlayerActor(attackerData)
    attackerActor.hp = attackerActor.maxHp
    attackerActor.mp = attackerActor.maxMp
    const defenderActor = createV2PlayerActor(defenderData)
    defenderActor.id = 'enemy'
    defenderActor.side = 'enemy'
    defenderActor.hp = defenderActor.maxHp
    defenderActor.mp = defenderActor.maxMp
    const initial = createV2BattleState({
      seed,
      player: attackerActor,
      enemy: defenderActor,
      zoneId: 'asynchronous_pvp',
      enemyContentId: defenderId,
      rewards: { xp: 0, gold: 0 },
      balanceConfig: getV2BalanceConfig(attackerData),
    })
    const simulation = runV2StrategyUntilComplete(initial, new PlayerAutoStrategy(), getV2TechniqueCatalog(attackerData), 500)
    if (simulation.state.phase !== 'COMPLETED' || !simulation.state.result) {
      throw new GameCloudServiceError('pvp-settlement-failed', '服务端斗法未能完成', true)
    }
    const attackerWon = simulation.state.result.outcome === 'victory'
    const ratingChange = attackerWon ? 16 : -12
    const now = new Date(this.now()).toISOString()
    const recordId = this.createId('battle')
    const battleLog = simulation.state.events.map((entry) => ({ ...entry }))
    const result: CloudBattleResult = {
      recordId,
      seed,
      winnerCharacterId: attackerWon ? attackerId : defenderId,
      ratingChange,
      battleLog,
    }
    await this.store.commitChallenge({
      ownerId: identity.userId,
      attackerCharacterId: attackerId,
      defenderCharacterId: defenderId,
      expectedUpdatedAt: expected,
      attackerRating: Math.max(0, attacker.rating + ratingChange),
      defenderRating: Math.max(0, defender.rating - ratingChange),
      battle: {
        ...result,
        ownerId: identity.userId,
        requestId,
        attackerCharacterId: attackerId,
        defenderCharacterId: defenderId,
        createdAt: now,
      },
      updatedAt: now,
    })
    return result
  }

  private async getLeaderboard(event: Record<string, any>): Promise<LeaderboardEntry[]> {
    const type = String(event.type || '') as LeaderboardType
    if (!LEADERBOARD_TYPES.has(type)) throw new GameCloudServiceError('invalid-leaderboard', '排行榜类型无效')
    const limit = Math.max(1, Math.min(100, Math.floor(Number(event.limit || 100))))
    return asLeaderboardEntries(await this.store.queryLeaderboard(type, limit), type)
  }

  private async saveAppearance(identity: GameCloudIdentity, event: Record<string, any>): Promise<void> {
    const characterId = requiredString(event.characterId, 'characterId')
    const character = await this.store.getOwnedCharacter(identity.userId, characterId)
    if (!character) throw new GameCloudServiceError('character-not-found', '角色不存在')
    const status = String(event.status || '')
    if (!['queued', 'running', 'succeeded', 'failed'].includes(status)) {
      throw new GameCloudServiceError('invalid-appearance-status', '立绘任务状态无效')
    }
    const imageUrl = event.imageUrl === null ? null : requiredString(event.imageUrl, 'imageUrl', 2_048)
    if (status === 'succeeded' && !imageUrl) {
      throw new GameCloudServiceError('invalid-appearance-image', '成功任务必须包含图片地址')
    }
    if (imageUrl && !/^(https:\/\/|cloud:\/\/)/i.test(imageUrl)) {
      throw new GameCloudServiceError('invalid-appearance-image', '立绘地址必须使用 HTTPS 或 CloudBase 云存储')
    }
    const now = new Date(this.now()).toISOString()
    await this.store.upsertAppearance({
      characterId,
      ownerId: identity.userId,
      taskId: requiredString(event.taskId, 'taskId'),
      status: status as GameCloudAppearanceDocument['status'],
      imageUrl,
      model: requiredString(event.model, 'model'),
      seed: event.seed === null ? null : requiredString(event.seed, 'seed'),
      errorMessage: event.errorMessage == null ? null : String(event.errorMessage).slice(0, 1_000),
      updatedAt: now,
    })
  }
}
