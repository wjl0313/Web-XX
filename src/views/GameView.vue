<script setup lang="ts">
import { featureFlags } from '../app/featureFlags'
import LegacyGameFrame from '../components/common/LegacyGameFrame.vue'
import NativeGameApp from '../components/native/NativeGameApp.vue'
</script>

<template>
  <LegacyGameFrame v-if="featureFlags.legacyGameBridge" />
  <NativeGameApp v-else />
</template>
