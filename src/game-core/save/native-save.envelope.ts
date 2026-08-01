import {
  LEGACY_GAME_VERSION,
  NATIVE_SAVE_ENVELOPE_FORMAT,
  NATIVE_SAVE_ENVELOPE_VERSION,
  NATIVE_SAVE_SCHEMA,
} from './constants'
import { legacyStableSaveHash, normalizeLegacySlots } from './legacy-save.adapter'
import { importLegacySlotsToNative } from './native-character-identity.adapter'
import type { LegacySlot, NativeSaveEnvelope } from './types'

export type NativeSaveEnvelopeIssueCode =
  | 'missing-envelope'
  | 'invalid-json'
  | 'invalid-root'
  | 'unsupported-format'
  | 'unsupported-version'
  | 'unsupported-schema'
  | 'invalid-created-at'
  | 'invalid-active-slot'
  | 'invalid-source'
  | 'invalid-slots'
  | 'payload-hash-mismatch'

export interface NativeSaveEnvelopeIssue {
  code: NativeSaveEnvelopeIssueCode
}

export interface NativeSaveEnvelopeParseResult {
  envelope: NativeSaveEnvelope | null
  issues: NativeSaveEnvelopeIssue[]
}

export interface CreateNativeSaveEnvelopeOptions {
  activeSlot?: number
  createdAt?: Date
  gameVersion?: string
  saveSchema?: number
  sourceLegacyRaw: string | null
}

type NativeEnvelopePayload = Omit<NativeSaveEnvelope, 'payloadHash'>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function createPayloadHash(payload: NativeEnvelopePayload): string {
  return legacyStableSaveHash(JSON.stringify(payload))
}

function normalizeActiveSlot(value: number | undefined, slots: readonly LegacySlot[]): number {
  const slot = Math.floor(Number(value ?? -1))
  return slot >= 0 && slot < slots.length && Boolean(slots[slot]) ? slot : -1
}

export function createNativeSaveEnvelope(
  slots: readonly LegacySlot[],
  options: CreateNativeSaveEnvelopeOptions,
): NativeSaveEnvelope {
  const normalized = normalizeLegacySlots(slots)
  if (normalized.issues.length > 0) {
    throw new TypeError('原生存档包含无效角色槽位')
  }

  const nativeSlots = importLegacySlotsToNative(normalized.slots)
  const payload: NativeEnvelopePayload = {
    format: NATIVE_SAVE_ENVELOPE_FORMAT,
    envelopeVersion: NATIVE_SAVE_ENVELOPE_VERSION,
    gameVersion: options.gameVersion ?? LEGACY_GAME_VERSION,
    saveSchema: options.saveSchema ?? NATIVE_SAVE_SCHEMA,
    createdAt: (options.createdAt ?? new Date()).toISOString(),
    activeSlot: normalizeActiveSlot(options.activeSlot, nativeSlots),
    source: {
      kind: 'legacy-local',
      hash: legacyStableSaveHash(options.sourceLegacyRaw || ''),
    },
    slots: nativeSlots,
  }

  return { ...payload, payloadHash: createPayloadHash(payload) }
}

export function serializeNativeSaveEnvelope(envelope: NativeSaveEnvelope): string {
  return JSON.stringify(envelope)
}

export function parseNativeSaveEnvelope(raw: string | unknown): NativeSaveEnvelopeParseResult {
  if (raw === null || raw === undefined || raw === '') {
    return { envelope: null, issues: [{ code: 'missing-envelope' }] }
  }

  let value: unknown = raw
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw)
    } catch {
      return { envelope: null, issues: [{ code: 'invalid-json' }] }
    }
  }

  if (!isRecord(value)) {
    return { envelope: null, issues: [{ code: 'invalid-root' }] }
  }

  const issues: NativeSaveEnvelopeIssue[] = []
  if (value.format !== NATIVE_SAVE_ENVELOPE_FORMAT) issues.push({ code: 'unsupported-format' })
  if (value.envelopeVersion !== NATIVE_SAVE_ENVELOPE_VERSION) issues.push({ code: 'unsupported-version' })
  if (value.saveSchema !== NATIVE_SAVE_SCHEMA) issues.push({ code: 'unsupported-schema' })
  if (typeof value.createdAt !== 'string' || Number.isNaN(Date.parse(value.createdAt))) {
    issues.push({ code: 'invalid-created-at' })
  }
  if (!Number.isInteger(value.activeSlot) || Number(value.activeSlot) < -1 || Number(value.activeSlot) >= 24) {
    issues.push({ code: 'invalid-active-slot' })
  }
  if (
    !isRecord(value.source) ||
    value.source.kind !== 'legacy-local' ||
    typeof value.source.hash !== 'string' ||
    !value.source.hash
  ) {
    issues.push({ code: 'invalid-source' })
  }
  if (!Array.isArray(value.slots)) {
    issues.push({ code: 'invalid-slots' })
  } else {
    const normalized = normalizeLegacySlots(value.slots)
    if (normalized.issues.length > 0 || value.slots.length !== normalized.slots.length) {
      issues.push({ code: 'invalid-slots' })
    }
  }

  if (issues.length > 0) return { envelope: null, issues }

  const envelope = value as unknown as NativeSaveEnvelope
  const { payloadHash, ...payload } = envelope
  if (typeof payloadHash !== 'string' || payloadHash !== createPayloadHash(payload)) {
    return { envelope: null, issues: [{ code: 'payload-hash-mismatch' }] }
  }

  if (envelope.activeSlot >= 0 && !envelope.slots[envelope.activeSlot]) {
    return { envelope: null, issues: [{ code: 'invalid-active-slot' }] }
  }

  return { envelope, issues: [] }
}
