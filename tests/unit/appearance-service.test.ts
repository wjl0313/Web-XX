import { describe, expect, it } from 'vitest'

import { RunningHubAppearanceApi } from '../../src/services/runninghub/appearance-api'
import {
  AppearancePollingTimeoutError,
  pollAppearanceJob,
} from '../../src/services/runninghub/appearance-poller'
import type {
  AppearanceGenerationInput,
  AppearanceJob,
  AppearanceTaskRepository,
} from '../../src/services/runninghub/appearance-types'

const queued: AppearanceJob = {
  taskId: 'task-1',
  status: 'queued',
  imageUrl: null,
  model: 'portrait-v1',
  seed: '42',
  errorMessage: null,
}

describe('RunningHub appearance API', () => {
  it('validates task responses at the transport boundary', async () => {
    const input: AppearanceGenerationInput = {
      characterId: 'char-1',
      prompt: '一位青衣剑修',
      model: 'portrait-v1',
    }
    const api = new RunningHubAppearanceApi({
      submit: async () => queued,
      inspect: async () => ({ ...queued, status: 'succeeded', imageUrl: 'https://img.test/task-1.png' }),
    })

    await expect(api.create(input)).resolves.toEqual(queued)
    await expect(api.get('task-1')).resolves.toMatchObject({
      status: 'succeeded',
      imageUrl: 'https://img.test/task-1.png',
    })

    const invalid = new RunningHubAppearanceApi({
      submit: async () => ({ task: 'missing-id' }),
      inspect: async () => ({ taskId: 'task-1', status: 'unknown' }),
    })
    await expect(invalid.create(input)).rejects.toThrow('无效任务数据')
    await expect(invalid.get('task-1')).rejects.toThrow('未知任务状态')
  })
})

describe('appearance polling', () => {
  it('reports progress and returns the terminal task', async () => {
    const jobs: AppearanceJob[] = [
      queued,
      { ...queued, status: 'running' },
      { ...queued, status: 'succeeded', imageUrl: 'https://img.test/task-1.png' },
    ]
    let index = 0
    const updates: string[] = []
    const repository: AppearanceTaskRepository = {
      create: async () => queued,
      get: async () => jobs[Math.min(index++, jobs.length - 1)],
    }

    const result = await pollAppearanceJob(repository, 'task-1', {
      intervalMs: 250,
      timeoutMs: 2_000,
      now: () => index * 250,
      sleep: async () => undefined,
      onUpdate: (job) => updates.push(job.status),
    })

    expect(result.status).toBe('succeeded')
    expect(updates).toEqual(['queued', 'running', 'succeeded'])
  })

  it('supports timeout and cancellation without changing the task', async () => {
    let now = 0
    const repository: AppearanceTaskRepository = {
      create: async () => queued,
      get: async () => queued,
    }

    await expect(pollAppearanceJob(repository, 'task-1', {
      intervalMs: 250,
      timeoutMs: 500,
      now: () => now,
      sleep: async (milliseconds) => { now += milliseconds },
    })).rejects.toBeInstanceOf(AppearancePollingTimeoutError)

    const controller = new AbortController()
    controller.abort()
    await expect(pollAppearanceJob(repository, 'task-1', {
      signal: controller.signal,
    })).rejects.toMatchObject({ name: 'AbortError' })
  })
})
