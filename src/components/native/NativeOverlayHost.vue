<script setup lang="ts">
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-vue-next'

import { useUiStore } from '../../stores/ui.store'

const ui = useUiStore()
</script>

<template>
  <div class="toast-stack" aria-live="polite" aria-atomic="false">
    <div v-for="entry in ui.toasts" :key="entry.id" class="native-toast" :class="`native-toast--${entry.tone}`">
      <CheckCircle2 v-if="entry.tone === 'success'" :size="17" />
      <AlertTriangle v-else-if="entry.tone === 'warning' || entry.tone === 'danger'" :size="17" />
      <Info v-else :size="17" />
      <span>{{ entry.message }}</span>
      <button type="button" title="关闭提示" aria-label="关闭提示" @click="ui.dismissToast(entry.id)"><X :size="15" /></button>
    </div>
  </div>

  <div v-if="ui.dialog" class="native-dialog-backdrop" role="presentation" @click.self="ui.resolveConfirm(false)">
    <section class="native-dialog" role="alertdialog" aria-modal="true" aria-labelledby="native-dialog-title" aria-describedby="native-dialog-message">
      <AlertTriangle :size="24" aria-hidden="true" />
      <h2 id="native-dialog-title">{{ ui.dialog.title }}</h2>
      <p id="native-dialog-message">{{ ui.dialog.message }}</p>
      <div class="native-dialog__actions">
        <button class="button button--quiet" type="button" @click="ui.resolveConfirm(false)">取消</button>
        <button class="button" :class="ui.dialog.danger ? 'button--danger' : 'button--primary'" type="button" @click="ui.resolveConfirm(true)">{{ ui.dialog.confirmLabel }}</button>
      </div>
    </section>
  </div>
</template>
