<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Download, ExternalLink, History, RotateCcw, Save, ShieldCheck, Trash2, Upload } from 'lucide-vue-next'

import {
  createLegacyCharacterImportOptions,
  createLegacySaveExportPayload,
  decodeLegacySavePayload,
  extractLegacySlotsFromPayload,
  validateLegacyImportedSlots,
  type LegacySaveBackup,
} from '../../../game-core/save'
import { getSaveRepository } from '../../../services/save-repository.provider'
import { useSaveStore } from '../../../stores/save.store'

const saves = useSaveStore()
const repository = getSaveRepository()
const backups = ref<LegacySaveBackup[]>([])
const integrity = ref('尚未检查')
const importError = ref('')
const importSuccess = ref('')
const password = ref('')
const fileInput = ref<HTMLInputElement | null>(null)

async function refreshBackups() {
  backups.value = await repository.listBackups()
}

async function saveNow() {
  await saves.persist(repository)
  integrity.value = '已保存'
}

async function snapshot() {
  await repository.createBackup(saves.slots, { force: true, kind: 'manual', label: '手动快照' })
  await refreshBackups()
}

async function checkIntegrity() {
  const result = await repository.verifyIntegrity()
  integrity.value = result.ok ? '存档完整' : result.status === 'missing-stamp' ? '缺少校验戳' : '存档内容与校验戳不一致'
}

function downloadJson() {
  const payload = createLegacySaveExportPayload(saves.slots, new Date())
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `fanxiulu-${new Date().toISOString().slice(0, 10)}.json`
  anchor.click()
  URL.revokeObjectURL(url)
}

async function importFile(event: Event) {
  importError.value = ''
  importSuccess.value = ''
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  try {
    const context = globalThis.crypto ? { crypto: globalThis.crypto, origin: location.origin, userAgent: navigator.userAgent } : undefined
    const payload = await decodeLegacySavePayload(await file.text(), { cryptoContext: context, passphrase: password.value })
    const slots = validateLegacyImportedSlots(extractLegacySlotsFromPayload(payload), createLegacyCharacterImportOptions())
    saves.replaceAllSlots(slots)
    await saves.persist(repository)
    importSuccess.value = `已导入 ${slots.filter(Boolean).length} 位修士。`
  } catch (cause) {
    importError.value = cause instanceof Error ? cause.message : '导入失败'
  } finally {
    if (fileInput.value) fileInput.value.value = ''
  }
}

async function restoreBackup(index: number) {
  const backup = backups.value[index]
  if (!backup) return
  await repository.createBackup(saves.slots, { force: true, kind: 'before-restore', label: '恢复前快照' })
  saves.replaceAllSlots(validateLegacyImportedSlots(backup.slots, createLegacyCharacterImportOptions()))
  await saves.persist(repository)
  await refreshBackups()
}

async function removeBackup(index: number) {
  await repository.deleteBackup(index)
  await refreshBackups()
}

function openLegacy() {
  window.location.assign('/?legacy=1')
}

onMounted(refreshBackups)
</script>

<template>
  <div class="settings-layout">
    <section class="settings-section" aria-labelledby="save-title">
      <header class="panel-heading">
        <div><p class="eyebrow">本地仓储</p><h2 id="save-title">存档</h2></div>
        <span class="status-indicator"><ShieldCheck :size="15" /> {{ integrity }}</span>
      </header>
      <div class="settings-actions">
        <button class="button button--primary" type="button" :disabled="saves.saving" @click="saveNow"><Save :size="17" />{{ saves.saving ? '保存中' : '立即保存' }}</button>
        <button class="button button--secondary" type="button" @click="checkIntegrity"><ShieldCheck :size="17" />校验存档</button>
        <button class="button button--secondary" type="button" @click="downloadJson"><Download :size="17" />导出 JSON</button>
      </div>
    </section>

    <section class="settings-section" aria-labelledby="import-title">
      <header class="panel-heading panel-heading--compact"><div><p class="eyebrow">JSON / EQSAVE1–3</p><h2 id="import-title">导入</h2></div></header>
      <div class="import-row">
        <label><span>密码（仅 EQSAVE3）</span><input v-model="password" type="password" autocomplete="current-password" /></label>
        <input ref="fileInput" class="sr-only" type="file" accept=".json,.eqsave,.txt" @change="importFile" />
        <button class="button button--secondary" type="button" @click="fileInput?.click()"><Upload :size="17" />选择存档</button>
      </div>
      <p v-if="importError" class="form-error" role="alert">{{ importError }}</p>
      <p v-if="importSuccess" class="form-success" role="status">{{ importSuccess }}</p>
    </section>

    <section class="settings-section" aria-labelledby="backup-title">
      <header class="panel-heading panel-heading--compact">
        <div><p class="eyebrow">最多保留 5 份</p><h2 id="backup-title">版本快照</h2></div>
        <button class="button button--secondary" type="button" @click="snapshot"><History :size="17" />创建快照</button>
      </header>
      <div v-if="backups.length" class="backup-list">
        <article v-for="(backup, index) in backups" :key="`${backup.timestamp}-${index}`" class="backup-row">
          <div><strong>{{ backup.label || (backup.kind === 'auto' ? '自动备份' : '手动快照') }}</strong><span>{{ new Date(backup.timestamp || 0).toLocaleString('zh-CN') }}</span></div>
          <span>{{ backup.slots.filter(Boolean).length }} 位修士</span>
          <button class="icon-button" type="button" title="恢复此快照" aria-label="恢复此快照" @click="restoreBackup(index)"><RotateCcw :size="16" /></button>
          <button class="icon-button icon-button--danger" type="button" title="删除此快照" aria-label="删除此快照" @click="removeBackup(index)"><Trash2 :size="16" /></button>
        </article>
      </div>
      <div v-else class="empty-state"><History :size="26" /><p>尚无版本快照。</p></div>
    </section>

    <section class="settings-section settings-section--legacy" aria-labelledby="legacy-title">
      <div><p class="eyebrow">兼容回退</p><h2 id="legacy-title">旧版运行时</h2></div>
      <button class="button button--quiet" type="button" @click="openLegacy"><ExternalLink :size="17" />打开冻结版本</button>
    </section>
  </div>
</template>
