import { NATIVE_SAVE_SCHEMA } from './constants'
import { legacyStableSaveHash, parseLegacySlots } from './legacy-save.adapter'
import {
  parseNativeSaveEnvelope,
  type NativeSaveEnvelopeIssue,
} from './native-save.envelope'
import {
  compareLegacySaveShadow,
  type LegacySaveDifference,
  type LegacySaveShadowOptions,
} from './legacy-save.shadow'
import type { NativeSaveEnvelope } from './types'
import { exportNativeSlotsToLegacy } from './native-character-identity.adapter'

export type NativeRuntimeGateStatus =
  | 'not-requested'
  | 'ready'
  | 'invalid-legacy-save'
  | 'invalid-native-envelope'
  | 'stale-legacy-source'
  | 'shadow-difference'

export interface NativeRuntimeGateInput {
  requested: boolean
  legacyRaw: string | null
  nativeEnvelope: NativeSaveEnvelope | string | null
  shadowOptions?: LegacySaveShadowOptions
}

export interface NativeRuntimeGateResult {
  allowed: boolean
  status: NativeRuntimeGateStatus
  legacyHash: string
  candidateHash: string | null
  legacyIssues: string[]
  envelopeIssues: NativeSaveEnvelopeIssue[]
  differences: LegacySaveDifference[]
}

function blocked(
  status: Exclude<NativeRuntimeGateStatus, 'ready'>,
  partial: Omit<NativeRuntimeGateResult, 'allowed' | 'status'>,
): NativeRuntimeGateResult {
  return { allowed: false, status, ...partial }
}

export function evaluateNativeRuntimeGate(input: NativeRuntimeGateInput): NativeRuntimeGateResult {
  const legacyHash = legacyStableSaveHash(input.legacyRaw || '')
  const base = {
    legacyHash,
    candidateHash: null,
    legacyIssues: [] as string[],
    envelopeIssues: [] as NativeSaveEnvelopeIssue[],
    differences: [] as LegacySaveDifference[],
  }

  if (!input.requested) return blocked('not-requested', base)

  const legacy = parseLegacySlots(input.legacyRaw)
  if (legacy.issues.length > 0) {
    return blocked('invalid-legacy-save', {
      ...base,
      legacyIssues: legacy.issues.map((issue) => issue.code),
    })
  }

  const parsedEnvelope = parseNativeSaveEnvelope(input.nativeEnvelope)
  if (!parsedEnvelope.envelope) {
    return blocked('invalid-native-envelope', {
      ...base,
      envelopeIssues: parsedEnvelope.issues,
    })
  }

  const envelope = parsedEnvelope.envelope
  const legacyCandidateSlots = exportNativeSlotsToLegacy(envelope.slots)
  const candidateRaw = JSON.stringify(legacyCandidateSlots)
  const candidateHash = legacyStableSaveHash(candidateRaw)
  const withCandidate = { ...base, candidateHash }

  if (envelope.saveSchema !== NATIVE_SAVE_SCHEMA || envelope.source.hash !== legacyHash) {
    return blocked('stale-legacy-source', withCandidate)
  }

  const shadow = compareLegacySaveShadow(input.legacyRaw, legacyCandidateSlots, input.shadowOptions)
  if (!shadow.equal) {
    return blocked('shadow-difference', {
      ...withCandidate,
      legacyIssues: shadow.legacyIssues.map((issue) => issue.code),
      differences: shadow.differences,
    })
  }

  return {
    allowed: true,
    status: 'ready',
    ...withCandidate,
  }
}
