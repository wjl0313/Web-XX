import type { AppearanceJob, AppearanceTaskRepository } from './appearance-types'

export interface AppearancePollingOptions {
  intervalMs?: number
  timeoutMs?: number
  signal?: AbortSignal
  now?: () => number
  sleep?: (milliseconds: number) => Promise<void>
  onUpdate?: (job: AppearanceJob) => void
}

export class AppearancePollingTimeoutError extends Error {
  constructor(readonly taskId: string) {
    super('立绘生成等待超时')
    this.name = 'AppearancePollingTimeoutError'
  }
}

function abortError(): Error {
  return new DOMException('立绘生成已取消', 'AbortError')
}

export async function pollAppearanceJob(
  repository: AppearanceTaskRepository,
  taskId: string,
  options: AppearancePollingOptions = {},
): Promise<AppearanceJob> {
  const now = options.now ?? Date.now
  const sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)))
  const intervalMs = Math.max(250, Math.floor(options.intervalMs ?? 2_000))
  const timeoutMs = Math.max(intervalMs, Math.floor(options.timeoutMs ?? 120_000))
  const startedAt = now()

  while (true) {
    if (options.signal?.aborted) throw abortError()
    const job = await repository.get(taskId)
    options.onUpdate?.(job)
    if (job.status === 'succeeded' || job.status === 'failed') return job
    if (now() - startedAt >= timeoutMs) throw new AppearancePollingTimeoutError(taskId)
    await sleep(intervalMs)
  }
}
