import { LEGACY_STORAGE_KEYS } from '../game-core/save/constants'
import { parseLegacySlots } from '../game-core/save/legacy-save.adapter'
import { evaluateNativeRuntimeGate, type NativeRuntimeGateResult } from '../game-core/save/native-runtime.gate'
import { createNativeSaveEnvelope } from '../game-core/save/native-save.envelope'

export interface FeatureFlagStorage {
  getItem(key: string): string | null
}

export interface ResolveFeatureFlagsOptions {
  search?: string
  storage?: FeatureFlagStorage | null
  now?: () => Date
}

export type RuntimeMode = 'legacy' | 'equivalent' | 'v2'

export interface FeatureFlags {
  requestedMode: RuntimeMode
  runtimeMode: RuntimeMode
  legacyGameBridge: boolean
  equivalentRuntime: boolean
  v2Placeholder: boolean
  nativeRuntimeRequested: boolean
  nativeRuntimeGate: NativeRuntimeGateResult
}

/** P0 完成后默认进入 Vue 原生功能等价壳；冻结旧版只通过显式 legacy 模式访问。 */
export const DEFAULT_RUNTIME_MODE: RuntimeMode = 'equivalent'

function resolveRequestedMode(search: string): RuntimeMode {
  const params = new URLSearchParams(search)
  const explicitMode = params.get('mode')
  if (explicitMode === 'legacy' || explicitMode === 'equivalent' || explicitMode === 'v2') {
    return explicitMode
  }
  // 保留已有实验链接，避免旧书签和回归测试失效。
  if (params.get('native') === '1') return 'equivalent'
  return DEFAULT_RUNTIME_MODE
}

export function resolveFeatureFlags(options: ResolveFeatureFlagsOptions = {}): Readonly<FeatureFlags> {
  const search = options.search ?? (typeof window !== 'undefined' ? window.location.search : '')
  const storage = options.storage === undefined
    ? (typeof window !== 'undefined' ? window.localStorage : null)
    : options.storage
  const requestedMode = resolveRequestedMode(search)
  const nativeRuntimeRequested = requestedMode === 'equivalent'
  const legacyRaw = storage?.getItem(LEGACY_STORAGE_KEYS.slots) ?? null
  const parsed = parseLegacySlots(legacyRaw)
  const nativeEnvelope = createNativeSaveEnvelope(parsed.slots, {
    sourceLegacyRaw: legacyRaw,
    createdAt: options.now?.() ?? new Date(),
  })
  const nativeRuntimeGate = evaluateNativeRuntimeGate({
    requested: nativeRuntimeRequested,
    legacyRaw,
    nativeEnvelope,
  })
  // Gate 继续作为迁移诊断信息，但损坏旧存档由本地仓储隔离，不能把默认入口重新导向 iframe。
  const runtimeMode: RuntimeMode = requestedMode

  return Object.freeze({
    requestedMode,
    runtimeMode,
    legacyGameBridge: runtimeMode === 'legacy',
    equivalentRuntime: runtimeMode === 'equivalent' || runtimeMode === 'v2',
    v2Placeholder: false,
    nativeRuntimeRequested,
    nativeRuntimeGate,
  })
}

export const featureFlags = resolveFeatureFlags()
