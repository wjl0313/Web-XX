import type {
  AppearanceGenerationInput,
  AppearanceJob,
  AppearanceTaskRepository,
} from './appearance-types'

export interface RunningHubAppearanceTransport {
  submit(input: AppearanceGenerationInput): Promise<unknown>
  inspect(taskId: string): Promise<unknown>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function decodeJob(value: unknown): AppearanceJob {
  if (!isRecord(value) || typeof value.taskId !== 'string' || typeof value.status !== 'string') {
    throw new TypeError('立绘服务返回了无效任务数据')
  }
  const status = value.status
  if (!['queued', 'running', 'succeeded', 'failed'].includes(status)) {
    throw new TypeError('立绘服务返回了未知任务状态')
  }
  return {
    taskId: value.taskId,
    status: status as AppearanceJob['status'],
    imageUrl: typeof value.imageUrl === 'string' ? value.imageUrl : null,
    model: typeof value.model === 'string' ? value.model : '',
    seed: typeof value.seed === 'string' ? value.seed : null,
    errorMessage: typeof value.errorMessage === 'string' ? value.errorMessage : null,
  }
}

export class RunningHubAppearanceApi implements AppearanceTaskRepository {
  constructor(private readonly transport: RunningHubAppearanceTransport) {}

  async create(input: AppearanceGenerationInput): Promise<AppearanceJob> {
    return decodeJob(await this.transport.submit(input))
  }

  async get(taskId: string): Promise<AppearanceJob> {
    if (!taskId.trim()) throw new TypeError('立绘任务 ID 不能为空')
    return decodeJob(await this.transport.inspect(taskId))
  }
}
