import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../..')
const indexSource = readFileSync(resolve(root, 'index.html'), 'utf8')
const legacySource = readFileSync(resolve(root, 'legacy/fanxiulu-monolith.html'), 'utf8')

describe('冻结的旧版基线', () => {
  it('保持已记录的文件校验值和行数', () => {
    const hash = createHash('sha256').update(legacySource).digest('hex').toUpperCase()

    expect(hash).toBe('113F9ED589375E746C50A13EC6FE29B32BC6F255B208B7FACE43D7218A2685CC')
    expect(legacySource.split(/\r?\n/)).toHaveLength(39_469)
  })

  it('保留关键屏幕、存档键与角色槽约束', () => {
    expect(legacySource).toContain('const MAX_SLOTS = 24;')
    expect(legacySource).toContain("const SAVE_KEY = 'EmberQuest_slots';")
    expect(legacySource).toContain('id="screen-login"')
    expect(legacySource).toContain('id="screen-charselect"')
    expect(legacySource).toContain('id="screen-game"')
    expect(legacySource).toContain('function loadSlots()')
    expect(legacySource).toContain('function saveSlots(options = {})')
  })

  it('根入口保持为小型 Vue 入口', () => {
    expect(indexSource.trimEnd().split(/\r?\n/).length).toBeLessThanOrEqual(30)
    expect(indexSource).toContain('<html lang="zh-CN">')
    expect(indexSource).toContain('src="/src/main.ts"')
  })
})
