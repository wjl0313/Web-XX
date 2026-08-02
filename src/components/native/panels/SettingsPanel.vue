<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Cloud, Download, Eye, ExternalLink, FileKey2, History, Link2, RefreshCw, RotateCcw, Save, ShieldCheck, Swords, Trash2, Trophy, Upload, UserRound } from 'lucide-vue-next'

import {
  createLegacyCharacterImportOptions,
  createLegacySaveExportPayload,
  decodeLegacySavePayload,
  encodeLegacySaveV1,
  encodeLegacySaveV2,
  encodeLegacySaveV3,
  extractLegacySlotsFromPayload,
  mergeLegacyImportedSlots,
  validateLegacyImportedSlots,
  type LegacySaveBackup,
  type LegacySlots,
} from '../../../game-core/save'
import { getSaveRepository } from '../../../services/save-repository.provider'
import { useAfkStore } from '../../../stores/afk.store'
import { useCombatStore } from '../../../stores/combat.store'
import { useCloudStore } from '../../../stores/cloud.store'
import { useSaveStore } from '../../../stores/save.store'
import { useUiStore } from '../../../stores/ui.store'
import V2BalanceConsole from '../V2BalanceConsole.vue'

const saves = useSaveStore()
const afk = useAfkStore()
const combat = useCombatStore()
const cloud = useCloudStore()
const ui = useUiStore()
const repository = getSaveRepository()
const backups = ref<LegacySaveBackup[]>([])
const integrity = ref('尚未检查')
const importError = ref('')
const importSuccess = ref('')
const password = ref('')
const exportFormat = ref<'json' | 'eqsave1' | 'eqsave2' | 'eqsave3'>('json')
const importMode = ref<'replace' | 'merge'>('replace')
const importPreview = ref<{ name: string; slots: LegacySlots } | null>(null)
const backupPreview = ref<number | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const cloudDisplayName = ref('')
const active = computed(() => saves.activeCharacter)
const previewCharacters = computed(() => importPreview.value?.slots.map((slot, index) => slot ? ({ index, name: String(slot.name || '未命名'), level: Number(slot.level || 1), cls: String(slot.cls || '') }) : null).filter(Boolean) || [])
const conflictCount = computed(() => importPreview.value?.slots.filter((slot, index) => Boolean(slot && saves.slots[index])).length || 0)
const compatibilityEntries = computed(() => {
  const character = active.value as Record<string, unknown> | null
  if (!character) return []
  return [
    ['悟道', 'aa'], ['转世重修', 'prestige'], ['符纹', 'runeStash'], ['灵兽', 'pets'],
    ['旧秘境', 'dungeon'], ['护道人', 'mercenary'], ['套装方案', 'loadouts'], ['成就', 'achievements'],
    ['已发现符纹组合', 'discoveredRunewords'],
  ].map(([label, key]) => ({ label, key, value: character[key] })).filter((entry) => entry.value !== undefined)
})
const leaderboardOptions = [
  { type: 'power', label: '战力榜' },
  { type: 'rating', label: '斗法榜' },
  { type: 'realm', label: '境界榜' },
] as const

function cryptoContext() {
  return globalThis.crypto ? { crypto: globalThis.crypto, origin: location.origin, userAgent: navigator.userAgent } : undefined
}
function downloadText(text: string, filename: string, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}
function safeDate() { return new Date().toISOString().slice(0, 10) }
function pretty(value: unknown) { return JSON.stringify(value, null, 2) }
async function refreshBackups() { backups.value = await repository.listBackups() }
async function saveNow() { await saves.persist(repository); integrity.value = '已保存'; ui.toast('存档已保存。', 'success') }
async function snapshot() { await repository.createBackup(saves.slots, { force: true, kind: 'manual', label: '手动快照' }); await refreshBackups(); ui.toast('手动快照已创建。', 'success') }
async function checkIntegrity() { const result = await repository.verifyIntegrity(); integrity.value = result.ok ? '存档完整' : result.status === 'missing-stamp' ? '缺少校验戳' : '存档内容与校验戳不一致' }

async function encodeExport(slots: LegacySlots): Promise<{ text: string; extension: string }> {
  const payload = createLegacySaveExportPayload(slots, new Date(), { productName: '凡修录' })
  if (exportFormat.value === 'json') return { text: JSON.stringify(payload, null, 2), extension: 'json' }
  if (exportFormat.value === 'eqsave1') return { text: encodeLegacySaveV1(payload), extension: 'eqsave' }
  const context = cryptoContext()
  if (!context) throw new Error('当前浏览器不支持加密存档导出')
  if (exportFormat.value === 'eqsave2') return { text: await encodeLegacySaveV2(payload, context), extension: 'eqsave' }
  return { text: await encodeLegacySaveV3(payload, password.value, context), extension: 'eqsave' }
}

async function exportAll() {
  try {
    const encoded = await encodeExport(saves.slots)
    downloadText(encoded.text, `凡修录-完整存档-${safeDate()}.${encoded.extension}`, exportFormat.value === 'json' ? 'application/json' : 'text/plain')
    ui.toast('完整存档已导出。', 'success')
  } catch (cause) { ui.toast(cause instanceof Error ? cause.message : '导出失败', 'danger') }
}

async function exportCharacter() {
  if (!active.value) return
  try {
    const slots: LegacySlots = Array.from({ length: saves.slots.length }, () => null)
    slots[0] = active.value
    const encoded = await encodeExport(slots)
    downloadText(encoded.text, `凡修录-${String(active.value.name || '单角色')}-${safeDate()}.${encoded.extension}`, exportFormat.value === 'json' ? 'application/json' : 'text/plain')
    ui.toast('当前角色存档已导出。', 'success')
  } catch (cause) { ui.toast(cause instanceof Error ? cause.message : '导出失败', 'danger') }
}

async function inspectImport(event: Event) {
  importError.value = ''
  importSuccess.value = ''
  importPreview.value = null
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  try {
    const payload = await decodeLegacySavePayload(await file.text(), { cryptoContext: cryptoContext(), passphrase: password.value })
    const slots = validateLegacyImportedSlots(extractLegacySlotsFromPayload(payload), createLegacyCharacterImportOptions())
    importPreview.value = { name: file.name, slots }
  } catch (cause) {
    importError.value = cause instanceof Error ? cause.message : '导入预览失败'
  } finally {
    if (fileInput.value) fileInput.value.value = ''
  }
}

async function applyImport() {
  const preview = importPreview.value
  if (!preview) return
  const accepted = await ui.confirm(importMode.value === 'replace'
    ? `将用“${preview.name}”中的 ${previewCharacters.value.length} 位修士覆盖当前全部角色槽。`
    : `将把“${preview.name}”中的角色放入当前空槽，不覆盖已有角色。`, { title: '应用导入存档', confirmLabel: '确认导入', danger: importMode.value === 'replace' })
  if (!accepted) return
  try {
    if (afk.running) await afk.stop()
    combat.reset()
    await repository.createBackup(saves.slots, { force: true, kind: 'before-import', label: '导入前快照' })
    const slots = importMode.value === 'replace'
      ? preview.slots
      : mergeLegacyImportedSlots(saves.slots, preview.slots, createLegacyCharacterImportOptions())
    saves.replaceAllSlots(slots)
    await saves.persist(repository)
    importSuccess.value = `已导入 ${previewCharacters.value.length} 位修士。`
    importPreview.value = null
    await refreshBackups()
    ui.showRoster()
  } catch (cause) { importError.value = cause instanceof Error ? cause.message : '导入失败' }
}

async function restoreBackup(index: number) {
  const backup = backups.value[index]
  if (!backup) return
  const accepted = await ui.confirm(`恢复此快照将替换当前角色槽；系统会先自动创建一份恢复前快照。`, { title: '恢复版本快照', confirmLabel: '确认恢复', danger: true })
  if (!accepted) return
  if (afk.running) await afk.stop()
  combat.reset()
  await repository.createBackup(saves.slots, { force: true, kind: 'before-restore', label: '恢复前快照' })
  saves.replaceAllSlots(validateLegacyImportedSlots(backup.slots, createLegacyCharacterImportOptions()))
  await saves.persist(repository)
  await refreshBackups()
  ui.showRoster()
  ui.toast('版本快照已恢复。', 'success')
}
async function removeBackup(index: number) { if (await repository.deleteBackup(index)) { await refreshBackups(); ui.toast('快照已删除。', 'warning') } }
function openLegacy() { window.location.assign('/?mode=legacy') }
async function cloudAction(action: () => Promise<unknown>, success: string) {
  try { await action(); ui.toast(success, 'success') }
  catch (cause) { ui.toast(cause instanceof Error ? cause.message : '云端操作失败', 'danger') }
}
function signInCloud() { return cloudAction(() => cloud.signIn(), '云道籍已连接。') }
function refreshCloud() { return cloudAction(() => cloud.refreshCharacters(), '云角色已刷新。') }
function bindCloud() { return cloudAction(() => cloud.bindAccount(cloudDisplayName.value), '正式道籍已确认。') }
function uploadCloud() { return cloudAction(() => cloud.uploadActiveCharacter(), '当前角色已上传。') }
function downloadCloud() { return cloudAction(() => cloud.downloadActiveCharacter(), '云端角色已载入本地。') }
function publishCloud() { return cloudAction(() => cloud.publishActiveCharacter(), '公开斗法快照已更新。') }
function claimCloudAfk() { return cloudAction(() => cloud.claimOfflineReward(), '云端离线收益已结算。') }
function breakthroughCloud() { return cloudAction(() => cloud.breakthroughActiveCharacter(), '云端突破已确认。') }
function refreshLeaderboard(type: 'power' | 'rating' | 'realm') { return cloudAction(() => cloud.loadLeaderboard(type), `${leaderboardOptions.find((entry) => entry.type === type)?.label || '排行榜'}已更新。`) }
function challengeCloud(characterId: string) { return cloudAction(() => cloud.challenge(characterId), '异步斗法已结算。') }
onMounted(refreshBackups)
</script>

<template>
  <div class="settings-layout">
    <V2BalanceConsole />
    <section class="settings-section" aria-labelledby="cloud-title">
      <header class="panel-heading">
        <div><p class="eyebrow">云道籍</p><h2 id="cloud-title">云存档与异步斗法</h2></div>
        <span class="status-indicator"><Cloud :size="15" />{{ cloud.session ? (cloud.session.anonymous ? '匿名道籍' : cloud.session.displayName || '正式道籍') : cloud.available ? '尚未连接' : '未配置云环境' }}</span>
      </header>
      <template v-if="cloud.available">
        <div class="settings-actions">
          <button class="button button--primary" type="button" :disabled="cloud.busy || Boolean(cloud.session)" @click="signInCloud"><Cloud :size="17" />匿名登录</button>
          <button class="button button--secondary" type="button" :disabled="cloud.busy || !cloud.session" @click="refreshCloud"><RefreshCw :size="17" />刷新云角色</button>
          <button class="button button--secondary" type="button" :disabled="cloud.busy || !cloud.session || !active" @click="uploadCloud"><Upload :size="17" />上传当前角色</button>
          <button class="button button--secondary" type="button" :disabled="cloud.busy || !cloud.activeCloudCharacter" @click="downloadCloud"><Download :size="17" />载入云端角色</button>
          <button class="button button--secondary" type="button" :disabled="cloud.busy || !cloud.activeCloudCharacter" @click="publishCloud"><UserRound :size="17" />发布斗法快照</button>
          <button class="button button--secondary" type="button" :disabled="cloud.busy || !cloud.activeCloudCharacter" @click="claimCloudAfk"><History :size="17" />领取离线收益</button>
          <button class="button button--secondary" type="button" :disabled="cloud.busy || !cloud.activeCloudCharacter" @click="breakthroughCloud"><ShieldCheck :size="17" />确认境界突破</button>
        </div>
        <div class="export-controls">
          <label><span>正式道籍名</span><input v-model="cloudDisplayName" maxlength="32" placeholder="完成身份绑定后填写" /></label>
          <button class="button button--secondary" type="button" :disabled="cloud.busy || !cloud.session || !cloudDisplayName.trim()" @click="bindCloud"><Link2 :size="17" />确认账号绑定</button>
        </div>
        <div class="settings-actions">
          <button v-for="entry in leaderboardOptions" :key="entry.type" class="button button--secondary" type="button" :disabled="cloud.busy || !cloud.session" @click="refreshLeaderboard(entry.type)"><Trophy :size="17" />{{ entry.label }}</button>
        </div>
        <div v-if="cloud.leaderboard.length" class="backup-list" aria-label="云端排行榜">
          <article v-for="entry in cloud.leaderboard" :key="entry.characterId" class="backup-row">
            <div><strong>第 {{ entry.rank }} 名 · {{ entry.name }}</strong><span>{{ entry.realmName || `修为等级 ${entry.level}` }} · {{ entry.classId }}</span></div>
            <span>{{ entry.value.toLocaleString('zh-CN') }}</span>
            <button class="icon-button" type="button" title="挑战此修士" aria-label="挑战此修士" :disabled="cloud.busy || entry.characterId === cloud.activeCloudCharacter?.id" @click="challengeCloud(entry.characterId)"><Swords :size="16" /></button>
          </article>
        </div>
        <p v-if="cloud.lastBattle" class="form-success" role="status">最近斗法：{{ cloud.lastBattle.winnerCharacterId === cloud.activeCloudCharacter?.id ? '胜' : '负' }} · 积分 {{ cloud.lastBattle.ratingChange > 0 ? '+' : '' }}{{ cloud.lastBattle.ratingChange }} · {{ cloud.lastBattle.battleLog.length }} 条战斗事件</p>
        <p v-if="cloud.error" class="form-error" role="alert">{{ cloud.error }}</p>
      </template>
      <div v-else class="empty-state"><Cloud :size="26" /><p>当前构建未配置云环境。</p></div>
    </section>

    <section class="settings-section" aria-labelledby="save-title">
      <header class="panel-heading"><div><p class="eyebrow">本地仓储</p><h2 id="save-title">存档与导出</h2></div><span class="status-indicator"><ShieldCheck :size="15" />{{ integrity }}</span></header>
      <div class="export-controls">
        <label><span>导出格式</span><select v-model="exportFormat"><option value="json">JSON 明文</option><option value="eqsave1">EQSAVE1 旧版兼容</option><option value="eqsave2">EQSAVE2 本机加密</option><option value="eqsave3">EQSAVE3 密码保护</option></select></label>
        <label v-if="exportFormat === 'eqsave3'"><span>存档密码</span><input v-model="password" type="password" minlength="6" placeholder="至少 6 个字符" autocomplete="new-password" /></label>
      </div>
      <div class="settings-actions"><button class="button button--primary" type="button" :disabled="saves.saving" @click="saveNow"><Save :size="17" />{{ saves.saving ? '保存中' : '立即保存' }}</button><button class="button button--secondary" type="button" @click="checkIntegrity"><ShieldCheck :size="17" />校验存档</button><button class="button button--secondary" type="button" @click="exportAll"><Download :size="17" />导出完整存档</button><button class="button button--secondary" type="button" :disabled="!active" @click="exportCharacter"><UserRound :size="17" />导出当前角色</button></div>
    </section>

    <section class="settings-section" aria-labelledby="import-title">
      <header class="panel-heading panel-heading--compact"><div><p class="eyebrow">JSON / EQSAVE1–3</p><h2 id="import-title">导入预览</h2></div></header>
      <div class="import-row"><label><span>密码（仅 EQSAVE3）</span><input v-model="password" type="password" autocomplete="current-password" /></label><input ref="fileInput" class="sr-only" type="file" accept=".json,.eqsave,.txt" aria-label="选择本地存档文件" @change="inspectImport" /><button class="button button--secondary" type="button" @click="fileInput?.click()"><Upload :size="17" />选择存档并预览</button></div>
      <article v-if="importPreview" class="import-preview">
        <header><div><p class="eyebrow">{{ importPreview.name }}</p><h3>{{ previewCharacters.length }} 位修士可导入</h3></div><span v-if="conflictCount">{{ conflictCount }} 个同槽冲突</span></header>
        <ul><li v-for="entry in previewCharacters" :key="entry!.index"><span>槽位 {{ entry!.index + 1 }}</span><strong>{{ entry!.name }}</strong><small>修为等级 {{ entry!.level }} · {{ entry!.cls }}</small></li></ul>
        <div class="import-preview__actions"><label><input v-model="importMode" type="radio" value="replace" />覆盖全部角色槽</label><label><input v-model="importMode" type="radio" value="merge" />只合并到空槽</label><button class="button button--primary" type="button" @click="applyImport">应用导入</button></div>
      </article>
      <p v-if="importError" class="form-error" role="alert">{{ importError }}</p><p v-if="importSuccess" class="form-success" role="status">{{ importSuccess }}</p>
    </section>

    <section class="settings-section" aria-labelledby="backup-title">
      <header class="panel-heading panel-heading--compact"><div><p class="eyebrow">最多保留 5 份</p><h2 id="backup-title">版本快照</h2></div><button class="button button--secondary" type="button" @click="snapshot"><History :size="17" />创建快照</button></header>
      <div v-if="backups.length" class="backup-list"><article v-for="(backup, index) in backups" :key="`${backup.timestamp}-${index}`" class="backup-row"><div><strong>{{ backup.label || (backup.kind === 'auto' ? '自动备份' : '手动快照') }}</strong><span>{{ new Date(backup.timestamp || 0).toLocaleString('zh-CN') }}</span></div><span>{{ backup.slots.filter(Boolean).length }} 位修士</span><button class="icon-button" type="button" title="预览此快照" aria-label="预览此快照" @click="backupPreview = backupPreview === index ? null : index"><Eye :size="16" /></button><button class="icon-button" type="button" title="恢复此快照" aria-label="恢复此快照" @click="restoreBackup(index)"><RotateCcw :size="16" /></button><button class="icon-button icon-button--danger" type="button" title="删除此快照" aria-label="删除此快照" @click="removeBackup(index)"><Trash2 :size="16" /></button><ul v-if="backupPreview === index" class="backup-preview-list"><li v-for="(slot, slotIndex) in backup.slots" :key="slotIndex" v-show="slot">槽位 {{ slotIndex + 1 }} · {{ slot?.name }} · 修为等级 {{ slot?.level || 1 }}</li></ul></article></div>
      <div v-else class="empty-state"><History :size="26" /><p>尚无版本快照。</p></div>
    </section>

    <section class="settings-section" aria-labelledby="compatibility-title">
      <header class="panel-heading panel-heading--compact"><div><p class="eyebrow">不推进、不消耗、不改平衡</p><h2 id="compatibility-title">旧版兼容工具</h2></div><FileKey2 :size="20" /></header>
      <p class="settings-description">以下冻结系统只用于确认旧存档仍可读取；原生主流程不会自动运行它们。</p>
      <div v-if="compatibilityEntries.length" class="compatibility-list"><details v-for="entry in compatibilityEntries" :key="entry.key"><summary><span>{{ entry.label }}</span><span>只读数据</span></summary><pre>{{ pretty(entry.value) }}</pre></details></div><div v-else class="empty-state"><FileKey2 :size="24" /><p>当前没有可显示的旧系统数据。</p></div>
    </section>

    <section class="settings-section settings-section--legacy" aria-labelledby="legacy-title"><div><p class="eyebrow">兼容回退</p><h2 id="legacy-title">冻结旧版运行时</h2></div><button class="button button--quiet" type="button" @click="openLegacy"><ExternalLink :size="17" />打开冻结版本</button></section>
  </div>
</template>
