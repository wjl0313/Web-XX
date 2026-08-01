import {
  legacyStableSaveHash,
  normalizeLegacySlots,
  parseLegacySlots,
} from './legacy-save.adapter'
import type { LegacySaveIssue, LegacySlot, LegacySlots } from './types'

export type LegacySaveDifferenceKind = 'type' | 'value' | 'missing' | 'unexpected'

export interface LegacySaveDifference {
  path: string
  kind: LegacySaveDifferenceKind
  legacyValue?: unknown
  candidateValue?: unknown
}

export interface LegacySaveShadowOptions {
  ignoredPaths?: readonly string[]
  ignoredPathPrefixes?: readonly string[]
  maxDifferences?: number
}

export interface LegacySaveShadowResult {
  equal: boolean
  legacyHash: string
  candidateHash: string
  legacyIssues: LegacySaveIssue[]
  candidateIssues: LegacySaveIssue[]
  differences: LegacySaveDifference[]
  legacySlots: LegacySlots
  candidateSlots: LegacySlots
}

function valueType(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function shouldIgnore(path: string, options: LegacySaveShadowOptions): boolean {
  if (options.ignoredPaths?.includes(path)) return true
  return Boolean(options.ignoredPathPrefixes?.some((prefix) => path === prefix || path.startsWith(`${prefix}.`) || path.startsWith(`${prefix}[`)))
}

function compareValue(
  legacyValue: unknown,
  candidateValue: unknown,
  path: string,
  options: LegacySaveShadowOptions,
  differences: LegacySaveDifference[],
): void {
  if (differences.length >= Math.max(1, Math.floor(options.maxDifferences ?? 200))) return
  if (shouldIgnore(path, options)) return
  if (Object.is(legacyValue, candidateValue)) return
  const legacyType = valueType(legacyValue)
  const candidateType = valueType(candidateValue)
  if (legacyType !== candidateType) {
    differences.push({ path, kind: 'type', legacyValue, candidateValue })
    return
  }
  if (Array.isArray(legacyValue) && Array.isArray(candidateValue)) {
    const length = Math.max(legacyValue.length, candidateValue.length)
    for (let index = 0; index < length; index += 1) {
      const nextPath = `${path}[${index}]`
      if (index >= legacyValue.length) differences.push({ path: nextPath, kind: 'unexpected', candidateValue: candidateValue[index] })
      else if (index >= candidateValue.length) differences.push({ path: nextPath, kind: 'missing', legacyValue: legacyValue[index] })
      else compareValue(legacyValue[index], candidateValue[index], nextPath, options, differences)
      if (differences.length >= Math.max(1, Math.floor(options.maxDifferences ?? 200))) return
    }
    return
  }
  if (isRecord(legacyValue) && isRecord(candidateValue)) {
    const keys = Array.from(new Set([...Object.keys(legacyValue), ...Object.keys(candidateValue)])).sort()
    for (const key of keys) {
      const nextPath = `${path}.${key}`
      if (!(key in legacyValue)) differences.push({ path: nextPath, kind: 'unexpected', candidateValue: candidateValue[key] })
      else if (!(key in candidateValue)) differences.push({ path: nextPath, kind: 'missing', legacyValue: legacyValue[key] })
      else compareValue(legacyValue[key], candidateValue[key], nextPath, options, differences)
      if (differences.length >= Math.max(1, Math.floor(options.maxDifferences ?? 200))) return
    }
    return
  }
  differences.push({ path, kind: 'value', legacyValue, candidateValue })
}

export function compareLegacySaveShadow(
  legacyRaw: string | null,
  candidate: readonly LegacySlot[],
  options: LegacySaveShadowOptions = {},
): LegacySaveShadowResult {
  const legacy = parseLegacySlots(legacyRaw)
  const normalizedCandidate = normalizeLegacySlots(candidate)
  const candidateRaw = JSON.stringify(normalizedCandidate.slots)
  const candidateRoundTrip = parseLegacySlots(candidateRaw)
  const differences: LegacySaveDifference[] = []
  compareValue(legacy.slots, candidateRoundTrip.slots, '$', options, differences)
  return {
    equal: legacy.issues.length === 0 && normalizedCandidate.issues.length === 0 && candidateRoundTrip.issues.length === 0 && differences.length === 0,
    legacyHash: legacyStableSaveHash(legacyRaw || ''),
    candidateHash: legacyStableSaveHash(candidateRaw),
    legacyIssues: legacy.issues,
    candidateIssues: [...normalizedCandidate.issues, ...candidateRoundTrip.issues],
    differences,
    legacySlots: legacy.slots,
    candidateSlots: candidateRoundTrip.slots,
  }
}
