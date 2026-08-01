import type { SaveRepository } from '../repositories/save.repository'
import { LocalSaveRepository } from './local/local-save.repository'

let configured: SaveRepository | null = null

export function configureSaveRepository(repository: SaveRepository | null): void {
  configured = repository
}

export function getSaveRepository(): SaveRepository {
  if (configured) return configured
  if (typeof window === 'undefined') throw new Error('当前环境没有可用的浏览器存储')
  configured = new LocalSaveRepository(window.localStorage)
  return configured
}
