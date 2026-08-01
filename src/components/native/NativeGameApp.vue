<script setup lang="ts">
import { onMounted } from 'vue'

import { useSaveStore } from '../../stores/save.store'
import { useUiStore } from '../../stores/ui.store'
import CharacterRoster from './CharacterRoster.vue'
import NativeGameShell from './NativeGameShell.vue'

const saves = useSaveStore()
const ui = useUiStore()

onMounted(async () => {
  if (!saves.loaded) await saves.initialize()
})
</script>

<template>
  <div class="native-app">
    <a class="skip-link" href="#native-main">跳到主要内容</a>

    <div v-if="saves.loading" class="native-state" role="status" aria-live="polite">
      <div class="native-state__mark" aria-hidden="true">凡</div>
      <p>正在读取洞府玉册</p>
      <div class="skeleton-line" />
    </div>

    <div v-else-if="saves.error" class="native-state" role="alert">
      <div class="native-state__mark" aria-hidden="true">凡</div>
      <h1>存档读取失败</h1>
      <p>{{ saves.error }}</p>
      <button class="button button--primary" type="button" @click="saves.initialize()">重新读取</button>
    </div>

    <CharacterRoster v-else-if="ui.screen === 'roster'" />
    <NativeGameShell v-else />
  </div>
</template>
