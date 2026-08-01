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
const builtLegacySource = readFileSync(builtLegacyPath, 'utf8')
assert(sha256(builtLegacyPath) !== expectedLegacyHash, '生产构建没有生成独立的中文运行副本')
assert(builtLegacySource.includes('"Character Select":"角色库"'), '中文运行副本没有使用参考词库')
assert(builtLegacySource.includes('"Create a New Character":"创建角色"'), '中文运行副本仍含旧角色槽名称')
assert(builtLegacySource.includes('id="fanxiulu-display-runtime"'), '中文运行副本缺少同步显示层')
assert(!builtLegacySource.includes('id="fanxiulu-xiuxian-localization"'), '中文运行副本仍在使用旧整页映射层')
assert(!builtLegacySource.includes('setTimeout(applyAll,80)'), '中文运行副本仍在延时重写整页文本')
assert((builtLegacySource.match(/new MutationObserver/g) || []).length === 0, '中文运行副本仍含文本观察器')
assert(!builtLegacySource.includes("Object.getOwnPropertyDescriptor(Node.prototype, 'textContent')"), '中文运行副本仍在拦截全局文本属性')
assert(!builtLegacySource.includes('Element.prototype.setAttribute ='), '中文运行副本仍在覆写 Element 原型')
assert(!builtLegacySource.includes('Document.prototype.createTextNode ='), '中文运行副本仍在覆写 Document 原型')
assert(builtLegacySource.includes('row.textContent = window.__fanxiuluDisplayText("创建角色")'), '角色槽文本没有在生成阶段直接写入')

console.log(`基线验收通过：index.html ${indexLines} 行，冻结源 SHA-256 未变化，中文运行副本已直接生成且无 DOM 原型拦截。`)
