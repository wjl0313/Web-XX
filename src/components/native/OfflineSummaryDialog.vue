<script setup lang="ts">
import { computed } from 'vue'

import { useAfkStore } from '../../stores/afk.store'

const afk = useAfkStore()
const summary = computed(() => afk.summary)

function formatDuration(ms: number) {
  const minutes = Math.floor(ms / 60_000)
  const seconds = Math.floor(ms % 60_000 / 1000)
  return `${minutes} 分 ${seconds} 秒`
}
</script>

<template>
  <div v-if="summary" class="legacy-offline-backdrop" role="presentation">
    <section class="legacy-offline-dialog" role="dialog" aria-modal="true" aria-label="离线收益">
      <header>
        <div><small>重返修仙界</small><h2>离线历练结算</h2></div>
        <span v-if="afk.legacySummary">{{ formatDuration(afk.legacySummary.elapsedMs) }}</span>
        <span v-else-if="afk.v2Summary">{{ formatDuration(afk.v2Summary.simulatedMs) }} · {{ afk.v2Summary.mode === 'exact' ? '逐场模拟' : '抽样聚合' }}</span>
      </header>
      <dl v-if="afk.legacySummary">
        <div><dt>战斗</dt><dd>{{ afk.legacySummary.fights }}</dd></div>
        <div><dt>修为</dt><dd>{{ afk.legacySummary.xp.toLocaleString('zh-CN') }}</dd></div>
        <div><dt>灵石</dt><dd>{{ afk.legacySummary.gold.toLocaleString('zh-CN') }}</dd></div>
        <div><dt>装备</dt><dd>{{ afk.legacySummary.loot }}</dd></div>
        <div><dt>符纹</dt><dd>{{ afk.legacySummary.runes }}</dd></div>
        <div><dt>声望</dt><dd>+{{ afk.legacySummary.faction }}</dd></div>
      </dl>
      <dl v-else-if="afk.v2Summary">
        <div><dt>战斗</dt><dd>{{ afk.v2Summary.fights }}</dd></div>
        <div><dt>胜 / 负</dt><dd>{{ afk.v2Summary.victories }} / {{ afk.v2Summary.defeats }}</dd></div>
        <div><dt>修为</dt><dd>{{ afk.v2Summary.cultivation.toLocaleString('zh-CN') }}</dd></div>
        <div><dt>灵石</dt><dd>{{ afk.v2Summary.gold.toLocaleString('zh-CN') }}</dd></div>
        <div><dt>装备</dt><dd>{{ afk.v2Summary.equipment }}</dd></div>
        <div><dt>功法 / 灵草</dt><dd>{{ afk.v2Summary.techniques }} / {{ afk.v2Summary.herbs }}</dd></div>
        <div><dt>丹药消耗</dt><dd>{{ afk.v2Summary.pillsUsed }}</dd></div>
        <div><dt>停止原因</dt><dd>{{ afk.v2Summary.stopReason }}</dd></div>
      </dl>
      <footer><button type="button" @click="afk.clearSummary">领取并继续</button></footer>
    </section>
  </div>
</template>
