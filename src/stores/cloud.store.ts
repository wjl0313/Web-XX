import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { getV2ProgressionState } from '../game-core/domain/progression'
import { getCharacterRuleset } from '../game-core/rulesets'
import type {
  CloudBattleResult,
  CloudCharacterSave,
  GameCloudRepository,
  LeaderboardEntry,
  LeaderboardType,
  UserSession,
} from '../repositories/game-cloud.repository'
import { getGameCloudRepositoryOrNull } from '../services/game-cloud-repository.provider'
import { useSaveStore } from './save.store'

function requestId(prefix: string): string {
  const suffix = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return `${prefix}:${suffix}`
}

export const useCloudStore = defineStore('cloud-p2', () => {
  const saves = useSaveStore()
  const available = ref(Boolean(getGameCloudRepositoryOrNull()))
  const session = ref<UserSession | null>(null)
  const characters = ref<CloudCharacterSave[]>([])
  const leaderboardType = ref<Extract<LeaderboardType, 'power' | 'rating' | 'realm'>>('power')
  const leaderboard = ref<LeaderboardEntry[]>([])
  const lastBattle = ref<CloudBattleResult | null>(null)
  const lastAfkSummary = ref<Record<string, unknown> | null>(null)
  const busy = ref(false)
  const error = ref('')

  const activeCloudCharacter = computed(() => characters.value.find((entry) => entry.slot === saves.activeSlot) || null)

  function repository(): GameCloudRepository {
    const configured = getGameCloudRepositoryOrNull()
    available.value = Boolean(configured)
    if (!configured) throw new Error('当前构建未配置云环境')
    return configured
  }

  async function execute<T>(operation: (cloud: GameCloudRepository) => Promise<T>): Promise<T> {
    if (busy.value) throw new Error('云端操作正在进行')
    busy.value = true
    error.value = ''
    try {
      return await operation(repository())
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : '云端操作失败'
      throw cause
    } finally {
      busy.value = false
    }
  }

  async function signIn(): Promise<UserSession> {
    return execute(async (cloud) => {
      session.value = await cloud.signInAnonymously()
      characters.value = await cloud.loadCharacters()
      return session.value
    })
  }

  async function bindAccount(displayName: string): Promise<UserSession> {
    return execute(async (cloud) => {
      session.value = await cloud.bindAccount(displayName.trim())
      return session.value
    })
  }

  async function refreshCharacters(): Promise<CloudCharacterSave[]> {
    return execute(async (cloud) => {
      characters.value = await cloud.loadCharacters()
      return characters.value
    })
  }

  async function ensureActiveCloudCharacter(cloud: GameCloudRepository): Promise<CloudCharacterSave> {
    const local = saves.activeCharacter
    if (!local || saves.activeSlot < 0) throw new Error('请先进入一名角色')
    const existing = characters.value.find((entry) => entry.slot === saves.activeSlot)
    if (existing) return existing
    const progression = getCharacterRuleset(local) === 'v2' ? getV2ProgressionState(local) : null
    const created = await cloud.createCharacter({
      slot: saves.activeSlot,
      name: String(local.name || '未命名修士'),
      race: String(local.race || '木天灵根'),
      classId: String(local.cls || '炼体士'),
      ruleset: getCharacterRuleset(local),
      rootId: progression?.rootId,
      mainTalentId: progression?.mainTalentId,
      secondaryTalentId: progression?.secondaryTalentId,
      talentSeed: String(local.v2TalentSeed || ''),
      hardcore: getCharacterRuleset(local) === 'legacy' && Boolean(local.hardcore),
    })
    characters.value = [...characters.value.filter((entry) => entry.slot !== created.slot), created]
    return created
  }

  async function uploadActiveCharacter(): Promise<CloudCharacterSave> {
    return execute(async (cloud) => {
      const local = saves.activeCharacter
      if (!local) throw new Error('请先进入一名角色')
      const remote = await ensureActiveCloudCharacter(cloud)
      const saved = await cloud.saveCharacter({ characterId: remote.id, expectedUpdatedAt: remote.updatedAt, data: local })
      characters.value = [...characters.value.filter((entry) => entry.id !== saved.id), saved]
      return saved
    })
  }

  async function downloadActiveCharacter(): Promise<CloudCharacterSave> {
    return execute(async (cloud) => {
      characters.value = await cloud.loadCharacters()
      const remote = characters.value.find((entry) => entry.slot === saves.activeSlot)
      if (!remote) throw new Error('当前槽位没有云端角色')
      const slots = [...saves.slots]
      slots[saves.activeSlot] = remote.data
      saves.replaceAllSlots(slots, saves.activeSlot)
      await saves.persist()
      return remote
    })
  }

  async function publishActiveCharacter(): Promise<void> {
    return execute(async (cloud) => {
      const remote = await ensureActiveCloudCharacter(cloud)
      await cloud.publishCharacter(remote.id)
      characters.value = await cloud.loadCharacters()
    })
  }

  async function loadLeaderboard(type = leaderboardType.value): Promise<LeaderboardEntry[]> {
    return execute(async (cloud) => {
      leaderboardType.value = type
      leaderboard.value = await cloud.getLeaderboard(type, 30)
      return leaderboard.value
    })
  }

  async function challenge(defenderCharacterId: string): Promise<CloudBattleResult> {
    return execute(async (cloud) => {
      const attacker = activeCloudCharacter.value
      if (!attacker) throw new Error('请先上传当前角色')
      lastBattle.value = await cloud.challengePlayer({
        attackerCharacterId: attacker.id,
        defenderCharacterId,
        expectedUpdatedAt: attacker.updatedAt,
        requestId: requestId('pvp'),
      })
      characters.value = await cloud.loadCharacters()
      return lastBattle.value
    })
  }

  async function claimOfflineReward(): Promise<CloudCharacterSave> {
    return execute(async (cloud) => {
      const remote = activeCloudCharacter.value
      if (!remote) throw new Error('请先上传当前角色')
      const last = Number(remote.data.v2LastAfkAt || remote.data.lastAfkAt || 0)
      if (last <= 0) throw new Error('云端角色尚未开启自动历练')
      const result = await cloud.claimAfkReward({
        characterId: remote.id,
        expectedUpdatedAt: remote.updatedAt,
        lastActiveAt: new Date(last).toISOString(),
        claimedAt: new Date().toISOString(),
        requestId: requestId('afk'),
      })
      lastAfkSummary.value = result.summary as unknown as Record<string, unknown>
      characters.value = [...characters.value.filter((entry) => entry.id !== result.save.id), result.save]
      const slots = [...saves.slots]
      slots[saves.activeSlot] = result.save.data
      saves.replaceAllSlots(slots, saves.activeSlot)
      await saves.persist()
      return result.save
    })
  }

  async function breakthroughActiveCharacter(): Promise<CloudCharacterSave> {
    return execute(async (cloud) => {
      const remote = activeCloudCharacter.value
      if (!remote) throw new Error('请先上传当前角色')
      const saved = await cloud.breakthroughCharacter({
        characterId: remote.id,
        expectedUpdatedAt: remote.updatedAt,
        requestId: requestId('breakthrough'),
      })
      characters.value = [...characters.value.filter((entry) => entry.id !== saved.id), saved]
      const slots = [...saves.slots]
      slots[saves.activeSlot] = saved.data
      saves.replaceAllSlots(slots, saves.activeSlot)
      await saves.persist()
      return saved
    })
  }

  return {
    available,
    session,
    characters,
    activeCloudCharacter,
    leaderboardType,
    leaderboard,
    lastBattle,
    lastAfkSummary,
    busy,
    error,
    signIn,
    bindAccount,
    refreshCharacters,
    uploadActiveCharacter,
    downloadActiveCharacter,
    publishActiveCharacter,
    loadLeaderboard,
    challenge,
    claimOfflineReward,
    breakthroughActiveCharacter,
  }
})
