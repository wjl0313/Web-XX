export type AppearanceJobStatus = 'queued' | 'running' | 'succeeded' | 'failed'

export interface AppearanceGenerationInput {
  characterId: string
  prompt: string
  negativePrompt?: string
  model: string
  seed?: string | null
  width?: number
  height?: number
}

export interface AppearanceJob {
  taskId: string
  status: AppearanceJobStatus
  imageUrl: string | null
  model: string
  seed: string | null
  errorMessage: string | null
}

export interface AppearanceTaskRepository {
  create(input: AppearanceGenerationInput): Promise<AppearanceJob>
  get(taskId: string): Promise<AppearanceJob>
}
