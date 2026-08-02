import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const indexPath = resolve(root, 'index.html')
const legacyPath = resolve(root, 'legacy/fanxiulu-monolith.html')
const builtLegacyPath = resolve(root, 'dist/legacy/fanxiulu-monolith.html')
const baselineMetadataPath = resolve(root, 'legacy/baseline-version.json')
const baselineBehaviorPath = resolve(root, 'legacy/baseline-behavior-report.md')
const baselineSaveSamplesPath = resolve(root, 'legacy/baseline-save-samples')
const baselineScreenshotsPath = resolve(root, 'legacy/baseline-screenshots')
const featureFlagsPath = resolve(root, 'src/app/featureFlags.ts')
const requiredSaveSamples = [
  'legacy/baseline-save-samples/01-low-warrior.json',
  'legacy/baseline-save-samples/02-mid-cleric.json',
  'legacy/baseline-save-samples/03-high-wizard.json',
  'legacy/baseline-save-samples/04-legacy-heavy-rogue.json',
]

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex').toUpperCase()
}

assert(existsSync(baselineMetadataPath), '缺少冻结基线元数据 legacy/baseline-version.json')
const baseline = JSON.parse(readFileSync(baselineMetadataPath, 'utf8'))
const expectedHashes = baseline.sha256 || {}
const expectedLegacyHash = expectedHashes['legacy/fanxiulu-monolith.html']

assert(typeof expectedLegacyHash === 'string', '冻结基线元数据缺少旧版单体 SHA-256')
assert(existsSync(baselineBehaviorPath), '缺少冻结行为报告')
assert(existsSync(baselineSaveSamplesPath), '缺少冻结存档样本目录')
assert(existsSync(baselineScreenshotsPath), '缺少冻结截图目录')
assert(baseline.defaultRuntimeAfterP0 === 'equivalent', 'P0 完成后的默认运行模式必须为 equivalent')

for (const relativePath of requiredSaveSamples) {
  assert(typeof expectedHashes[relativePath] === 'string', `冻结基线元数据缺少存档样本 SHA-256：${relativePath}`)
}

for (const [relativePath, expectedHash] of Object.entries(expectedHashes)) {
  const absolutePath = resolve(root, relativePath)
  assert(existsSync(absolutePath), `冻结基线文件不存在：${relativePath}`)
  assert(sha256(absolutePath) === expectedHash, `冻结基线文件校验值发生变化：${relativePath}`)
}

const appVersionSource = readFileSync(resolve(root, 'src/app/version.ts'), 'utf8')
const saveConstantsSource = readFileSync(resolve(root, 'src/game-core/save/constants.ts'), 'utf8')
assert(appVersionSource.includes(`APP_VERSION = '${baseline.appVersion}'`), '应用版本与冻结基线元数据不一致')
assert(saveConstantsSource.includes(`LEGACY_GAME_VERSION = '${baseline.legacyGameVersion}'`), '旧版游戏版本与冻结基线元数据不一致')
assert(saveConstantsSource.includes(`LEGACY_SAVE_SCHEMA = ${baseline.legacySaveSchema}`), '旧版存档 schema 与冻结基线元数据不一致')
assert(saveConstantsSource.includes(`NATIVE_SAVE_ENVELOPE_VERSION = ${baseline.nativeEnvelopeVersion}`), '原生存档信封版本与冻结基线元数据不一致')
assert(saveConstantsSource.includes(`NATIVE_SAVE_SCHEMA = ${baseline.nativeSaveSchema}`), '原生存档 schema 与冻结基线元数据不一致')

const featureFlagsSource = readFileSync(featureFlagsPath, 'utf8')
assert(featureFlagsSource.includes("DEFAULT_RUNTIME_MODE: RuntimeMode = 'equivalent'"), '默认入口尚未切换到原生等价壳')

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

console.log(`基线验收通过：${baseline.baseline}，index.html ${indexLines} 行，冻结源与静态数据 SHA-256 未变化，中文运行副本已直接生成且无 DOM 原型拦截。`)
