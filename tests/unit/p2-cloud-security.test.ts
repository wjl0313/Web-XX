import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { getV2ProgressionState } from '../../src/game-core/domain/progression'
import type { CloudCharacterSave } from '../../src/repositories/game-cloud.repository'
import {
  GameCloudFunctionService,
  InMemoryGameCloudStore,
  type GameCloudFunctionResponse,
  type GameCloudIdentity,
} from '../../src/services/cloudbase/server'

const USER: GameCloudIdentity = { userId: 'p2-security-user', anonymous: true, displayName: null }

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
  return { service, store, setNow(value: string) { now = Date.parse(value) }, now: () => now }
}

async function create(service: GameCloudFunctionService): Promise<CloudCharacterSave> {
  return success(await service.invoke('create-character', {
    slot: 0,
    name: '云端修士',
    race: '火天灵根',
    classId: '五行法修',
    rootId: '火天灵根',
    talentSeed: 'cloud-security',
  }, USER))
}

describe('P2 云端权威校验', () => {
  it('拒绝非法装备、非法功法与客户端改写灵根天赋', async () => {
    const { service } = harness()
    const created = await create(service)
    const illegalEquipment = await service.invoke('save-character', {
      characterId: created.id,
      expectedUpdatedAt: created.updatedAt,
      data: { ...created.data, equipment: { ...created.data.equipment, weapon: '伪造仙器' } },
    }, USER)
    expect(illegalEquipment).toMatchObject({ ok: false, error: { code: 'invalid-equipment' } })

    const illegalTechnique = await service.invoke('save-character', {
      characterId: created.id,
      expectedUpdatedAt: created.updatedAt,
      data: { ...created.data, v2KnownTechniques: [...(created.data.v2KnownTechniques || []), 'forged-technique'] },
    }, USER)
    expect(illegalTechnique).toMatchObject({ ok: false, error: { code: 'invalid-techniques' } })

    const progression = getV2ProgressionState(created.data)
    const forgedProfile = await service.invoke('save-character', {
      characterId: created.id,
      expectedUpdatedAt: created.updatedAt,
      data: { ...created.data, v2Progression: { ...progression, rootId: '五行伪灵根' } },
    }, USER)
    expect(forgedProfile).toMatchObject({ ok: false, error: { code: 'immutable-progression-profile' } })
  })

  it('挂机开始时间以服务器为准且八小时封顶', async () => {
    const { service, setNow, now } = harness()
    const created = await create(service)
    setNow('2026-08-01T00:01:00.000Z')
    const armed = success<CloudCharacterSave>(await service.invoke('save-character', {
      characterId: created.id,
      expectedUpdatedAt: created.updatedAt,
      data: {
        ...created.data,
        atk: 5_000,
        def: 1_000,
        hp: 20_000,
        maxHp: 20_000,
        v2AfkEnabled: true,
        v2LastAfkAt: 1,
      },
    }, USER))
    expect(armed.data.v2LastAfkAt).toBe(now())

    setNow('2026-08-02T00:01:00.000Z')
    const claimed = success<any>(await service.invoke('claim-afk-reward', {
      characterId: created.id,
      expectedUpdatedAt: armed.updatedAt,
      lastActiveAt: new Date(Number(armed.data.v2LastAfkAt)).toISOString(),
      claimedAt: '2026-08-02T00:01:00.000Z',
      requestId: 'afk-cap-request',
    }, USER))
    expect(claimed.summary.mode).toBe('aggregate')
    expect(claimed.summary.simulatedMs).toBeLessThanOrEqual(8 * 60 * 60_000)
  })

  it('境界只能由服务端固定突破并对 requestId 幂等', async () => {
    const { service, setNow } = harness()
    const created = await create(service)
    const progression = getV2ProgressionState(created.data)
    progression.realm.cultivation = progression.realm.cultivationRequired
    setNow('2026-08-01T00:01:00.000Z')
    const ready = success<CloudCharacterSave>(await service.invoke('save-character', {
      characterId: created.id,
      expectedUpdatedAt: created.updatedAt,
      data: { ...created.data, v2Progression: progression },
    }, USER))
    setNow('2026-08-01T00:02:00.000Z')
    const first = success<CloudCharacterSave>(await service.invoke('breakthrough-character', {
      characterId: created.id,
      expectedUpdatedAt: ready.updatedAt,
      requestId: 'breakthrough-1',
    }, USER))
    const replay = success<CloudCharacterSave>(await service.invoke('breakthrough-character', {
      characterId: created.id,
      expectedUpdatedAt: ready.updatedAt,
      requestId: 'breakthrough-1',
    }, USER))
    expect(getV2ProgressionState(first.data).realm.realmId).toBe('qi-2')
    expect(replay).toEqual(first)
  })

  it('匿名身份不能伪装完成账号绑定，排行榜只开放 P2 三类', async () => {
    const { service } = harness()
    expect(await service.invoke('bind-account', { displayName: '正式道籍' }, USER)).toMatchObject({
      ok: false,
      error: { code: 'account-link-required' },
    })
    expect(await service.invoke('get-leaderboard', { type: 'kills' }, USER)).toMatchObject({
      ok: false,
      error: { code: 'invalid-leaderboard' },
    })
  })
})

describe('P2 CloudBase 集合与安全规则', () => {
  it('只声明六个 P2 集合，并禁止客户端绕过云函数直读写', () => {
    const root = resolve(process.cwd(), 'cloudbase')
    const config = JSON.parse(readFileSync(resolve(root, 'database/collections.json'), 'utf8'))
    expect(config.collections.map((entry: { name: string }) => entry.name)).toEqual([
      'users',
      'character_saves',
      'public_characters',
      'pvp_snapshots',
      'battle_records',
      'appearance_jobs',
    ])
    for (const name of config.collections.map((entry: { name: string }) => entry.name)) {
      const rule = JSON.parse(readFileSync(resolve(root, `rules/database/${name}.json`), 'utf8'))
      expect(rule).toEqual({ read: false, write: false })
    }
  })

  it('关键写操作只能由已认证身份调用云函数', () => {
    const root = resolve(process.cwd(), 'cloudbase')
    const rules = JSON.parse(readFileSync(resolve(root, 'rules/functions.json'), 'utf8'))
    for (const name of ['save-character', 'claim-afk-reward', 'breakthrough-character', 'publish-character', 'challenge-player']) {
      expect(rules[name]).toEqual({ invoke: 'auth != null' })
    }
    expect(rules['*']).toEqual({ invoke: false })
  })
})
