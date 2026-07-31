<script setup lang="ts">
import { useUiStore } from '../stores/ui.store'
import GameLayout from '../layouts/GameLayout.vue'

const uiStore = useUiStore()
</script>

<template>
  <GameLayout v-if="uiStore.screen === 'game'" />
</template>
