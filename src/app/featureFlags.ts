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

export interface FeatureFlags {
  legacyGameBridge: boolean
  nativeRuntimeRequested: boolean
  nativeRuntimeGate: NativeRuntimeGateResult
}

export function resolveFeatureFlags(options: ResolveFeatureFlagsOptions = {}): Readonly<FeatureFlags> {
  const search = options.search ?? (typeof window !== 'undefined' ? window.location.search : '')
  const storage = options.storage === undefined
    ? (typeof window !== 'undefined' ? window.localStorage : null)
    : options.storage
  const nativeRuntimeRequested = new URLSearchParams(search).get('native') === '1'
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

  return Object.freeze({
    legacyGameBridge: !nativeRuntimeGate.allowed,
    nativeRuntimeRequested,
    nativeRuntimeGate,
  })
}

export const featureFlags = resolveFeatureFlags()
