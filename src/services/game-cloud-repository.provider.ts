import type { GameCloudRepository } from '../repositories/game-cloud.repository'

let configured: GameCloudRepository | null = null

export function configureGameCloudRepository(repository: GameCloudRepository | null): void {
  configured = repository
}

export function getGameCloudRepository(): GameCloudRepository {
  if (!configured) throw new Error('尚未配置云端游戏仓储')
  return configured
}
