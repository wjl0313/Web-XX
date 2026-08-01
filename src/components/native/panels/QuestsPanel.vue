<script setup lang="ts">
import { computed } from 'vue'
import { CheckCircle2, CircleDashed, ScrollText } from 'lucide-vue-next'

import { translateLegacyText } from '../../../game-core/data'
import { useSaveStore } from '../../../stores/save.store'

const saves = useSaveStore()
const character = computed(() => saves.activeCharacter!)
const quests = computed(() => Array.isArray(character.value.quests) ? character.value.quests : [])
const completed = computed(() => quests.value.filter((quest) => quest.done).length)
</script>

<template>
  <section class="content-panel" aria-labelledby="quests-title">
    <header class="panel-heading">
      <div>
        <p class="eyebrow">已了结 {{ completed }} / {{ quests.length }}</p>
        <h2 id="quests-title">委托</h2>
      </div>
    </header>

    <div v-if="quests.length" class="quest-list">
      <article v-for="(quest, index) in quests" :key="`${quest.name}-${index}`" class="quest-row" :class="{ 'is-complete': quest.done }">
        <div class="quest-row__state" aria-hidden="true">
          <CheckCircle2 v-if="quest.done" :size="20" />
          <CircleDashed v-else :size="20" />
        </div>
        <div class="quest-row__body">
          <div><h3>{{ translateLegacyText(String(quest.name)) }}</h3><span>{{ quest.done ? '已经完成' : `${quest.prog || 0} / ${quest.count || 0}` }}</span></div>
          <p>{{ translateLegacyText(String(quest.desc || `击败 ${quest.mob}`)) }}</p>
          <div class="quest-progress"><span :style="{ transform: `scaleX(${Math.min(1, Number(quest.prog || 0) / Math.max(1, Number(quest.count || 1)))})` }" /></div>
        </div>
        <div class="quest-row__reward"><strong>{{ Number(quest.xp || 0).toLocaleString('zh-CN') }}</strong><span>修为</span><strong>{{ Number(quest.gold || 0).toLocaleString('zh-CN') }}</strong><span>灵石</span></div>
      </article>
    </div>
    <div v-else class="empty-state empty-state--large"><ScrollText :size="34" /><h3>暂无委托</h3><p>新的委托会随存档迁移或内容更新加入。</p></div>
  </section>
</template>
