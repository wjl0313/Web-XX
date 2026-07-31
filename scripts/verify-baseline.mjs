import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const expectedLegacyHash = '113F9ED589375E746C50A13EC6FE29B32BC6F255B208B7FACE43D7218A2685CC'
const root = resolve(import.meta.dirname, '..')
const indexPath = resolve(root, 'index.html')
const legacyPath = resolve(root, 'legacy/fanxiulu-monolith.html')
const builtLegacyPath = resolve(root, 'dist/legacy/fanxiulu-monolith.html')

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex').toUpperCase()
}

const indexSource = readFileSync(indexPath, 'utf8')
const indexLines = indexSource.trimEnd().split(/\r?\n/).length

assert(indexLines <= 30, `index.html 当前为 ${indexLines} 行，超过 30 行上限`)
assert(indexSource.includes('<html lang="zh-CN">'), 'index.html 缺少简体中文语言标记')
assert(indexSource.includes('src="/src/main.ts"'), 'index.html 缺少 Vue 模块入口')
assert(existsSync(legacyPath), '冻结的旧版单文件不存在')
assert(sha256(legacyPath) === expectedLegacyHash, '旧版单文件校验值发生变化')
assert(existsSync(builtLegacyPath), '生产构建缺少旧版兼容文件')
assert(sha256(builtLegacyPath) === expectedLegacyHash, '生产构建中的旧版文件与冻结基线不一致')

console.log(`基线验收通过：index.html ${indexLines} 行，旧版 SHA-256 未变化。`)
