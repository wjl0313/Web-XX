import { webcrypto } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import {
  LEGACY_SAVE_CODEC,
  decodeLegacySavePayload,
  decodeLegacySaveV1,
  decodeLegacySaveV2,
  decodeLegacySaveV3,
  encodeLegacySavePayload,
  encodeLegacySaveV1,
  encodeLegacySaveV2,
  encodeLegacySaveV3,
  type LegacySaveCryptoContext,
} from '../../src/game-core/save'

const context: LegacySaveCryptoContext = {
  crypto: webcrypto as unknown as Crypto,
  origin: 'http://127.0.0.1:5173',
  userAgent: 'Vitest compatibility agent',
}

const payload = {
  meta: { game: 'EmberQuest', saveSchema: 2 },
  slots: [{ name: 'Codec Fixture', level: 9 }, null],
}

function envelope(prefix: string, value: unknown): string {
  return prefix + btoa(JSON.stringify(value))
}

describe('portable legacy save codec', () => {
  it('locks the EQSAVE1 XOR/Base64 representation', async () => {
    const encoded = encodeLegacySaveV1({ slots: [] })

    expect(encoded).toBe('EQSAVE1:Pk8RCR0lBkdJLwIu')
    expect(decodeLegacySaveV1(encoded)).toEqual({ slots: [] })
    expect(await encodeLegacySavePayload({ slots: [] })).toBe(encoded)
    expect(await decodeLegacySavePayload(`  ${encoded}\n`)).toEqual({ slots: [] })
  })

  it('preserves the legacy EQSAVE1 non-Latin text limitation', () => {
    expect(() => encodeLegacySaveV1({ name: '道友' })).toThrow()
  })

  it('decodes plain JSON payloads', async () => {
    expect(await decodeLegacySavePayload(`\n${JSON.stringify(payload)} `)).toEqual(payload)
    await expect(decodeLegacySavePayload('')).rejects.toThrow()
  })

  it('round-trips origin-bound EQSAVE2 payloads', async () => {
    const encoded = await encodeLegacySaveV2(payload, context)

    expect(encoded.startsWith(LEGACY_SAVE_CODEC.v2Prefix)).toBe(true)
    expect(await decodeLegacySaveV2(encoded, context)).toEqual(payload)
    expect(await decodeLegacySavePayload(encoded, { cryptoContext: context })).toEqual(payload)

    const wrapperEncoded = await encodeLegacySavePayload(payload, context)
    expect(wrapperEncoded.startsWith(LEGACY_SAVE_CODEC.v2Prefix)).toBe(true)
  })

  it('rejects EQSAVE2 without matching crypto context or a valid envelope', async () => {
    const encoded = await encodeLegacySaveV2(payload, context)
    const wrongContext = { ...context, origin: 'https://different.example' }

    await expect(decodeLegacySavePayload(encoded)).rejects.toThrow('当前环境不支持加密存档导入')
    await expect(decodeLegacySaveV2(encoded, wrongContext)).rejects.toThrow()
    await expect(
      decodeLegacySaveV2(envelope(LEGACY_SAVE_CODEC.v2Prefix, { alg: 'AES-GCM' }), context),
    ).rejects.toThrow('加密存档封装无效')
  })

  it('round-trips portable password-protected EQSAVE3 payloads', async () => {
    const encoded = await encodeLegacySaveV3(payload, 'secret-123', context)
    const otherBrowserContext = {
      ...context,
      origin: 'https://portable.example',
      userAgent: 'Different browser',
    }

    expect(encoded.startsWith(LEGACY_SAVE_CODEC.v3Prefix)).toBe(true)
    expect(await decodeLegacySaveV3(encoded, 'secret-123', otherBrowserContext)).toEqual(payload)
    expect(
      await decodeLegacySavePayload(encoded, {
        cryptoContext: otherBrowserContext,
        passphrase: 'secret-123',
      }),
    ).toEqual(payload)
  })

  it('rejects weak passwords, missing credentials, and invalid EQSAVE3 envelopes', async () => {
    await expect(encodeLegacySaveV3(payload, 'short', context)).rejects.toThrow(RangeError)

    const encoded = await encodeLegacySaveV3(payload, 'secret-123', context)
    await expect(decodeLegacySavePayload(encoded)).rejects.toThrow(
      '当前环境不支持密码保护存档导入',
    )
    await expect(decodeLegacySaveV3(encoded, '', context)).rejects.toThrow(
      '导入密码保护存档时必须提供密码',
    )
    await expect(decodeLegacySaveV3(encoded, 'wrong-password', context)).rejects.toThrow()
    await expect(
      decodeLegacySaveV3(
        envelope(LEGACY_SAVE_CODEC.v3Prefix, {
          alg: 'AES-GCM',
          iv: 'a',
          data: 'b',
          kdf: 'wrong',
          salt: 'c',
        }),
        'secret-123',
        context,
      ),
    ).rejects.toThrow('密码保护存档封装无效')
  })
})
