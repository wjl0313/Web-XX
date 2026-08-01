import { describe, expect, it } from 'vitest'

import {
  GameCloudFunctionService,
  InMemoryGameCloudStore,
  type GameCloudFunctionResponse,
  type GameCloudIdentity,
} from '../../src/services/cloudbase/server'
import type {
  ClaimAfkRewardResult,
  CloudBattleResult,
  CloudCharacterSave,
  LeaderboardEntry,
} from '../../src/repositories/game-cloud.repository'

const USER: GameCloudIdentity = { userId: 'user-1', anonymous: true, displayName: null }

function success<T>(response: GameCloudFunctionResponse): T {
  expect(response.ok).toBe(true)
  return (response as { ok: true; data: T }).data
}

function harness() {
  let now = Date.parse('2026-08-01T00:00:00.000Z')
  let id = 0
  const store = new InMemoryGameCloudStore()
  const service = new GameCloudFunctionService(store, {
    now: () => now,
    createId: (prefix) => `${prefix}-${++id}`,
  })
  return {
    store,
    service,
    setNow(value: string) { now = Date.parse(value) },
  }
}

async function createCharacter(
  service: GameCloudFunctionService,
  identity = USER,
  slot = 0,
  name = '青岚',
): Promise<CloudCharacterSave> {
  return success(await service.invoke('create-character', {
    slot,
    name,
    race: 'Human',
    classId: 'Warrior',
  }, identity))
}

describe('CloudBase server function service', () => {
  it('authenticates, creates, validates unique slots and loads only owned characters', async () => {
    const { service } = harness()
    expect(success(await service.invoke('bootstrap-user', {}, USER))).toEqual(USER)
    const created = await createCharacter(service)

    expect(created).toMatchObject({ slot: 0, schemaVersion: 2, gameVersion: '1.6.19' })
    expect(created.data).toMatchObject({ name: '青岚', cls: 'Warrior', level: 1 })
    const duplicate = await service.invoke('create-character', {
      slot: 0,
      name: '丹霞',
      race: 'Human',
      classId: 'Warrior',
    }, USER)
    expect(duplicate).toMatchObject({ ok: false, error: { code: 'slot-occupied' } })
    expect(success<CloudCharacterSave[]>(await service.invoke('load-characters', {}, USER))).toHaveLength(1)
    expect(success<CloudCharacterSave[]>(await service.invoke('load-characters', {}, {
      userId: 'user-2', anonymous: true, displayName: null,
    }))).toEqual([])
  })

  it('enforces optimistic concurrency while accepting and normalizing valid saves', async () => {
    const { service, setNow } = harness()
    const created = await createCharacter(service)
    setNow('2026-08-01T00:01:00.000Z')
    const saved = success<CloudCharacterSave>(await service.invoke('save-character', {
      characterId: created.id,
      expectedUpdatedAt: created.updatedAt,
      data: { ...created.data, level: 5, hp: 999_999, gold: -10 },
    }, USER))

    expect(saved.data).toMatchObject({ level: 5, hp: created.data.maxHp, gold: 0 })
    const conflict = await service.invoke('save-character', {
      characterId: created.id,
      expectedUpdatedAt: created.updatedAt,
      data: saved.data,
    }, USER)
    expect(conflict).toMatchObject({ ok: false, error: { code: 'save-conflict', retryable: false } })
  })

  it('settles AFK rewards from server time and a deterministic seed, then rejects replay', async () => {
    const { service, setNow } = harness()
    const created = await createCharacter(service)
    const lastActiveAt = '2026-08-01T00:00:00.000Z'
    setNow('2026-08-01T00:00:01.000Z')
    const armed = success<CloudCharacterSave>(await service.invoke('save-character', {
      characterId: created.id,
      expectedUpdatedAt: created.updatedAt,
      data: { ...created.data, afkEnabled: true, lastAfkAt: Date.parse(lastActiveAt) },
    }, USER))
    setNow('2026-08-01T00:10:00.000Z')
    const claimed = success<ClaimAfkRewardResult>(await service.invoke('claim-afk-reward', {
      characterId: created.id,
      expectedUpdatedAt: armed.updatedAt,
      lastActiveAt,
      claimedAt: '2026-08-01T00:10:00.000Z',
    }, USER))

    expect(claimed.summary).toMatchObject({ applied: true, capped: false })
    expect(claimed.summary.xp).toBeGreaterThan(0)
    const replay = await service.invoke('claim-afk-reward', {
      characterId: created.id,
      expectedUpdatedAt: armed.updatedAt,
      lastActiveAt,
      claimedAt: '2026-08-01T00:10:00.000Z',
    }, USER)
    expect(replay).toMatchObject({ ok: false, error: { code: 'save-conflict' } })
  })

  it('executes equipment changes on the server instead of trusting client stat deltas', async () => {
    const { service, setNow } = harness()
    const created = await createCharacter(service)
    setNow('2026-08-01T00:01:00.000Z')
    const prepared = success<CloudCharacterSave>(await service.invoke('save-character', {
      characterId: created.id,
      expectedUpdatedAt: created.updatedAt,
      data: { ...created.data, inventory: ['Rusty Dagger'] },
    }, USER))
    setNow('2026-08-01T00:02:00.000Z')
    const equipped = success<CloudCharacterSave>(await service.invoke('equip-item', {
      characterId: created.id,
      expectedUpdatedAt: prepared.updatedAt,
      inventoryIndex: 0,
    }, USER))

    expect(equipped.data.equipment).toMatchObject({ weapon: 'Rusty Dagger' })
    expect(equipped.data.inventory).toEqual([])
    expect(Number(equipped.data.atk)).toBeGreaterThan(Number(created.data.atk))
  })

  it('publishes projections, persists appearance status and returns a limited leaderboard', async () => {
    const { service, setNow, store } = harness()
    const created = await createCharacter(service)
    setNow('2026-08-01T00:01:00.000Z')
    expect(success(await service.invoke('publish-character', { characterId: created.id }, USER))).toBeUndefined()
    expect(success(await service.invoke('save-appearance', {
      characterId: created.id,
      taskId: 'task-1',
      status: 'succeeded',
      imageUrl: 'https://example.test/portrait.png',
      model: 'portrait-v1',
      seed: '42',
    }, USER))).toBeUndefined()
    const board = success<LeaderboardEntry[]>(await service.invoke('get-leaderboard', { type: 'power', limit: 500 }, USER))

    expect(board).toHaveLength(1)
    expect(board[0]).toMatchObject({ rank: 1, characterId: created.id, avatarUrl: 'https://example.test/portrait.png' })
    expect(store.appearances.get(created.id)).toMatchObject({ taskId: 'task-1', status: 'succeeded' })
  })

  it('runs deterministic PvP against published snapshots and commits both ratings', async () => {
    const { service, setNow, store } = harness()
    const defenderIdentity = { userId: 'user-2', anonymous: false, displayName: '丹霞' }
    const attacker = await createCharacter(service, USER, 0, '青岚')
    const defender = await createCharacter(service, defenderIdentity, 0, '丹霞')
    setNow('2026-08-01T00:01:00.000Z')
    success(await service.invoke('publish-character', { characterId: defender.id }, defenderIdentity))
    const freshAttacker = success<CloudCharacterSave[]>(await service.invoke('load-characters', {}, USER))[0]
    setNow('2026-08-01T00:02:00.000Z')
    const battle = success<CloudBattleResult>(await service.invoke('challenge-player', {
      attackerCharacterId: attacker.id,
      defenderCharacterId: defender.id,
      expectedUpdatedAt: freshAttacker.updatedAt,
    }, USER))

    expect(battle.recordId).toBe('battle-3')
    expect(battle.seed).toContain(`${attacker.id}:${defender.id}`)
    expect(battle.battleLog.length).toBeGreaterThan(0)
    expect(store.battles.get(battle.recordId)).toMatchObject({ winnerCharacterId: battle.winnerCharacterId })
    expect(store.characters.get(attacker.id)?.rating).not.toBe(1_000)
    expect(store.publications.get(defender.id)?.rating).not.toBe(1_000)
  })

  it('returns structured authentication and input failures', async () => {
    const { service } = harness()
    expect(await service.invoke('load-characters', {}, null)).toEqual({
      ok: false,
      error: { code: 'unauthenticated', message: '请先登录', retryable: false },
    })
    expect(await service.invoke('get-leaderboard', { type: 'unknown' }, USER)).toMatchObject({
      ok: false,
      error: { code: 'invalid-leaderboard' },
    })
  })
})
