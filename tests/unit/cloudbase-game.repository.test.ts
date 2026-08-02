import { describe, expect, it } from 'vitest'

import {
  CloudBaseFunctionClient,
  CloudFunctionError,
  type CloudBaseCallable,
  type CloudFunctionCallOptions,
  type CloudFunctionClient,
} from '../../src/services/cloudbase/cloud-function.client'
import { CloudBaseGameRepository } from '../../src/services/cloudbase/cloudbase-game.repository'

class CallableStub implements CloudBaseCallable {
  calls: CloudFunctionCallOptions[] = []

  constructor(private readonly result: unknown, private readonly failure?: Error) {}

  async callFunction(options: CloudFunctionCallOptions): Promise<{ result?: unknown }> {
    this.calls.push(options)
    if (this.failure) throw this.failure
    return { result: this.result }
  }
}

describe('CloudBase function client', () => {
  it('unwraps the structured success envelope', async () => {
    const callable = new CallableStub({ ok: true, data: { userId: 'u-1' } })
    const client = new CloudBaseFunctionClient(callable)

    await expect(client.invoke('bootstrap-user')).resolves.toEqual({ userId: 'u-1' })
    expect(callable.calls).toEqual([{ name: 'bootstrap-user', data: {} }])
  })

  it('normalizes rejected and transport errors', async () => {
    const rejected = new CloudBaseFunctionClient(new CallableStub({
      ok: false,
      error: { code: 'save-conflict', message: '存档版本冲突', retryable: false },
    }))
    await expect(rejected.invoke('save-character')).rejects.toMatchObject({
      name: 'CloudFunctionError',
      code: 'save-conflict',
      functionName: 'save-character',
      retryable: false,
    })

    const transport = new CloudBaseFunctionClient(new CallableStub({}, new Error('network down')))
    await expect(transport.invoke('get-leaderboard')).rejects.toEqual(
      expect.objectContaining<Partial<CloudFunctionError>>({
        code: 'transport-error',
        functionName: 'get-leaderboard',
        retryable: true,
      }),
    )
  })
})

describe('CloudBase game repository', () => {
  it('establishes an anonymous CloudBase identity before bootstrapping the user', async () => {
    const order: string[] = []
    const client: CloudFunctionClient = {
      async invoke<T>(name: string): Promise<T> {
        order.push(name)
        return { userId: 'anonymous-1', anonymous: true, displayName: null } as T
      },
    }
    const repository = new CloudBaseGameRepository(client, {
      async signInAnonymously() { order.push('auth') },
    })
    await expect(repository.signInAnonymously()).resolves.toMatchObject({ userId: 'anonymous-1', anonymous: true })
    expect(order).toEqual(['auth', 'bootstrap-user'])
  })

  it('maps domain operations to the P2 cloud-function contract', async () => {
    const calls: Array<{ name: string; data?: Record<string, unknown> }> = []
    const client: CloudFunctionClient = {
      async invoke<T>(name: string, data?: Record<string, unknown>): Promise<T> {
        calls.push({ name, data })
        return (name === 'get-leaderboard' ? [] : {}) as T
      },
    }
    const repository = new CloudBaseGameRepository(client)

    await repository.bindAccount('青岚')
    await repository.createCharacter({ slot: 2, name: '青岚', race: 'Human', classId: 'Warrior' })
    await repository.loadCharacters()
    await repository.breakthroughCharacter({ characterId: 'char-1', expectedUpdatedAt: '2026-08-01T00:00:00.000Z', requestId: 'breakthrough-1' })
    await repository.publishCharacter('char-1')
    await repository.getLeaderboard('power', 500)
    await repository.saveAppearance({
      characterId: 'char-1',
      taskId: 'task-1',
      status: 'running',
      imageUrl: null,
      model: 'portrait-v1',
      seed: null,
    })

    expect(calls.map((call) => call.name)).toEqual([
      'bind-account',
      'create-character',
      'load-characters',
      'breakthrough-character',
      'publish-character',
      'get-leaderboard',
      'save-appearance',
    ])
    expect(calls[1].data).toMatchObject({ slot: 2, name: '青岚' })
    expect(calls[5].data).toEqual({ type: 'power', limit: 100 })
  })
})
