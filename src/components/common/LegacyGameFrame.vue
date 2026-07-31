<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import { LEGACY_GAME_PATH } from '../../app/constants'

type FrameState = 'loading' | 'ready' | 'error'

const state = ref<FrameState>('loading')
const reloadKey = ref(0)
let loadTimeout: number | undefined

const frameSource = computed(() => `${LEGACY_GAME_PATH}?bridge=${reloadKey.value}`)

function clearLoadTimeout() {
  if (loadTimeout !== undefined) {
    window.clearTimeout(loadTimeout)
    loadTimeout = undefined
  }
}

function armLoadTimeout() {
  clearLoadTimeout()
  loadTimeout = window.setTimeout(() => {
    if (state.value === 'loading') state.value = 'error'
  }, 15_000)
}

function handleLoad() {
  clearLoadTimeout()
  state.value = 'ready'
}

function handleError() {
  clearLoadTimeout()
  state.value = 'error'
}

function reload() {
  state.value = 'loading'
  reloadKey.value += 1
  armLoadTimeout()
}

onMounted(armLoadTimeout)
onBeforeUnmount(clearLoadTimeout)
</script>

<template>
  <section class="legacy-game" :data-state="state">
    <div v-if="state === 'loading'" class="launch-state" role="status" aria-live="polite">
      <div class="launch-mark" aria-hidden="true">凡</div>
      <p>正在开启洞府</p>
      <div class="launch-progress" aria-hidden="true"><span /></div>
    </div>

    <div v-else-if="state === 'error'" class="launch-state launch-state--error" role="alert">
      <div class="launch-mark" aria-hidden="true">凡</div>
      <h1>洞府暂未开启</h1>
      <p>旧版兼容页面加载失败，请重新载入。</p>
      <button type="button" @click="reload">重新载入</button>
    </div>

    <iframe
      :key="reloadKey"
      class="legacy-game__frame"
      :class="{ 'is-ready': state === 'ready' }"
      :src="frameSource"
      title="凡修录游戏界面"
      allow="autoplay"
      @load="handleLoad"
      @error="handleError"
    />
  </section>
</template>
