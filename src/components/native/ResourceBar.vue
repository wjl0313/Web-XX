<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  label: string
  value: number
  maximum: number
  tone?: 'health' | 'mana' | 'xp' | 'enemy'
}>()

const percent = computed(() => Math.max(0, Math.min(100, props.maximum > 0 ? props.value / props.maximum * 100 : 0)))
</script>

<template>
  <div class="resource" :class="`resource--${tone || 'xp'}`">
    <div class="resource__label">
      <span>{{ label }}</span>
      <strong>{{ Math.max(0, Math.floor(value)).toLocaleString('zh-CN') }} / {{ Math.max(0, Math.floor(maximum)).toLocaleString('zh-CN') }}</strong>
    </div>
    <div class="resource__track" role="progressbar" :aria-label="label" :aria-valuenow="percent" aria-valuemin="0" aria-valuemax="100">
      <span :style="{ transform: `scaleX(${percent / 100})` }" />
    </div>
  </div>
</template>
