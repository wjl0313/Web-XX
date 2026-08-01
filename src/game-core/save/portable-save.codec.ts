import { LEGACY_SAVE_CODEC, LEGACY_SAVE_SCHEMA } from './constants'

export interface LegacySaveCryptoContext {
  crypto: Crypto
  origin: string
  userAgent: string
}

export interface DecodeLegacySavePayloadOptions {
  cryptoContext?: LegacySaveCryptoContext
  passphrase?: string
}

interface EncryptedSaveEnvelope extends Record<string, unknown> {
  v?: number
  alg: 'AES-GCM'
  iv: string
  data: string
}

interface PasswordSaveEnvelope extends EncryptedSaveEnvelope {
  kdf: 'PBKDF2-SHA256'
  iterations: number
  salt: string
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function binaryToBase64(value: string): string {
  if (typeof globalThis.btoa !== 'function') throw new Error('当前环境不支持 Base64 编码')
  return globalThis.btoa(value)
}

function base64ToBinary(value: string): string {
  if (typeof globalThis.atob !== 'function') throw new Error('当前环境不支持 Base64 解码')
  return globalThis.atob(value)
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }

  return binaryToBase64(binary)
}

function base64ToBytes(value: string): Uint8Array {
  const binary = base64ToBinary(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

function parseEnvelope(raw: string, prefix: string): Record<string, unknown> {
  const envelopeText = decoder.decode(base64ToBytes(raw.slice(prefix.length)))
  const envelope: unknown = JSON.parse(envelopeText)
  if (!isRecord(envelope)) throw new TypeError('加密存档封装无效')
  return envelope
}

function assertEncryptedEnvelope(value: Record<string, unknown>): EncryptedSaveEnvelope {
  if (
    value.alg !== 'AES-GCM' ||
    typeof value.iv !== 'string' ||
    typeof value.data !== 'string' ||
    !value.iv ||
    !value.data
  ) {
    throw new TypeError('加密存档封装无效')
  }
  return value as EncryptedSaveEnvelope
}

function assertPasswordEnvelope(value: Record<string, unknown>): PasswordSaveEnvelope {
  const encrypted = assertEncryptedEnvelope(value)
  if (
    encrypted.kdf !== 'PBKDF2-SHA256' ||
    typeof encrypted.salt !== 'string' ||
    !encrypted.salt
  ) {
    throw new TypeError('密码保护存档封装无效')
  }

  return {
    ...encrypted,
    kdf: 'PBKDF2-SHA256',
    iterations: Number(encrypted.iterations || LEGACY_SAVE_CODEC.passwordKdfIterations),
    salt: encrypted.salt,
  }
}

async function createOriginBoundKey(context: LegacySaveCryptoContext): Promise<CryptoKey> {
  const seed = `EmberQuest export key v2|${context.origin}|${context.userAgent}`
  const digest = await context.crypto.subtle.digest('SHA-256', encoder.encode(seed))
  return context.crypto.subtle.importKey(
    'raw',
    digest,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt'],
  )
}

async function derivePasswordKey(
  context: LegacySaveCryptoContext,
  passphrase: string,
  salt: Uint8Array,
  iterations: number,
): Promise<CryptoKey> {
  const baseKey = await context.crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  )

  return context.crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export function encodeLegacySaveV1(payload: unknown): string {
  const json = JSON.stringify(payload)
  let encoded = ''

  for (let index = 0; index < json.length; index += 1) {
    encoded += String.fromCharCode(
      json.charCodeAt(index) ^
        LEGACY_SAVE_CODEC.v1XorKey.charCodeAt(index % LEGACY_SAVE_CODEC.v1XorKey.length),
    )
  }

  return LEGACY_SAVE_CODEC.v1Prefix + binaryToBase64(encoded)
}

export function decodeLegacySaveV1(raw: string): unknown {
  const decoded = base64ToBinary(raw.slice(LEGACY_SAVE_CODEC.v1Prefix.length))
  let json = ''

  for (let index = 0; index < decoded.length; index += 1) {
    json += String.fromCharCode(
      decoded.charCodeAt(index) ^
        LEGACY_SAVE_CODEC.v1XorKey.charCodeAt(index % LEGACY_SAVE_CODEC.v1XorKey.length),
    )
  }

  return JSON.parse(json)
}

export async function encodeLegacySaveV2(
  payload: unknown,
  context: LegacySaveCryptoContext,
): Promise<string> {
  const key = await createOriginBoundKey(context)
  const iv = context.crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await context.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(JSON.stringify(payload)),
  )
  const envelope: EncryptedSaveEnvelope = {
    v: LEGACY_SAVE_SCHEMA,
    alg: 'AES-GCM',
    iv: bytesToBase64(iv),
    data: bytesToBase64(new Uint8Array(ciphertext)),
  }

  return LEGACY_SAVE_CODEC.v2Prefix + bytesToBase64(encoder.encode(JSON.stringify(envelope)))
}

export async function decodeLegacySaveV2(
  raw: string,
  context: LegacySaveCryptoContext,
): Promise<unknown> {
  const envelope = assertEncryptedEnvelope(parseEnvelope(raw, LEGACY_SAVE_CODEC.v2Prefix))
  const key = await createOriginBoundKey(context)
  const plaintext = await context.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(envelope.iv) },
    key,
    base64ToBytes(envelope.data),
  )

  return JSON.parse(decoder.decode(new Uint8Array(plaintext)))
}

export async function encodeLegacySaveV3(
  payload: unknown,
  passphrase: string,
  context: LegacySaveCryptoContext,
): Promise<string> {
  if (passphrase.length < 6) throw new RangeError('存档密码至少需要 6 个字符')

  const salt = context.crypto.getRandomValues(new Uint8Array(16))
  const iv = context.crypto.getRandomValues(new Uint8Array(12))
  const key = await derivePasswordKey(
    context,
    passphrase,
    salt,
    LEGACY_SAVE_CODEC.passwordKdfIterations,
  )
  const ciphertext = await context.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(JSON.stringify(payload)),
  )
  const envelope: PasswordSaveEnvelope = {
    v: LEGACY_SAVE_SCHEMA,
    alg: 'AES-GCM',
    kdf: 'PBKDF2-SHA256',
    iterations: LEGACY_SAVE_CODEC.passwordKdfIterations,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    data: bytesToBase64(new Uint8Array(ciphertext)),
  }

  return LEGACY_SAVE_CODEC.v3Prefix + bytesToBase64(encoder.encode(JSON.stringify(envelope)))
}

export async function decodeLegacySaveV3(
  raw: string,
  passphrase: string,
  context: LegacySaveCryptoContext,
): Promise<unknown> {
  if (!passphrase) throw new Error('导入密码保护存档时必须提供密码')

  const envelope = assertPasswordEnvelope(parseEnvelope(raw, LEGACY_SAVE_CODEC.v3Prefix))
  const key = await derivePasswordKey(
    context,
    passphrase,
    base64ToBytes(envelope.salt),
    envelope.iterations,
  )
  const plaintext = await context.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(envelope.iv) },
    key,
    base64ToBytes(envelope.data),
  )

  return JSON.parse(decoder.decode(new Uint8Array(plaintext)))
}

export async function encodeLegacySavePayload(
  payload: unknown,
  context?: LegacySaveCryptoContext,
): Promise<string> {
  if (!context) return encodeLegacySaveV1(payload)
  return encodeLegacySaveV2(payload, context)
}

export async function decodeLegacySavePayload(
  text: string,
  options: DecodeLegacySavePayloadOptions = {},
): Promise<unknown> {
  const raw = String(text || '').trim()

  if (raw.startsWith(LEGACY_SAVE_CODEC.v3Prefix)) {
    if (!options.cryptoContext) throw new Error('当前环境不支持密码保护存档导入')
    return decodeLegacySaveV3(raw, options.passphrase || '', options.cryptoContext)
  }

  if (raw.startsWith(LEGACY_SAVE_CODEC.v2Prefix)) {
    if (!options.cryptoContext) throw new Error('当前环境不支持加密存档导入')
    return decodeLegacySaveV2(raw, options.cryptoContext)
  }

  if (raw.startsWith(LEGACY_SAVE_CODEC.v1Prefix)) return decodeLegacySaveV1(raw)
  return JSON.parse(raw)
}
