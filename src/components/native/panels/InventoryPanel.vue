<script setup lang="ts">
import { computed, ref } from 'vue'
import { ArrowUpToLine, PackageOpen, Search } from 'lucide-vue-next'

import {
  ALL_ITEM_DATA,
  getLegacyItemBaseName,
  getLegacyItemDisplayName,
  getLegacyItemEffectiveStats,
  getLegacyItemQuality,
  translateLegacyText,
} from '../../../game-core'
import { useCharacterStore } from '../../../stores/character.store'

const characters = useCharacterStore()
const query = ref('')
const qualityLabels: Record<string, string> = {
  Normal: '凡品', Magic: '灵品', Rare: '珍品', Epic: '极品', Legendary: '古宝', Mythic: '通天', Runeword: '符纹造物',
}

const items = computed(() => characters.inventory.map((item, index) => {
  const base = getLegacyItemBaseName(item)
  const data = ALL_ITEM_DATA[base as keyof typeof ALL_ITEM_DATA]
  return { item, index, base, data, stats: getLegacyItemEffectiveStats(item), quality: getLegacyItemQuality(item) }
}).filter((entry) => {
  const needle = query.value.trim().toLowerCase()
  if (!needle) return true
  return [entry.base, getLegacyItemDisplayName(entry.item), entry.data?.type].filter(Boolean).join(' ').toLowerCase().includes(needle)
}))
</script>

<template>
  <section class="content-panel" aria-labelledby="inventory-title">
    <header class="panel-heading">
      <div>
        <p class="eyebrow">{{ characters.inventory.length }} / {{ characters.inventoryCapacity }} 格</p>
        <h2 id="inventory-title">储物袋</h2>
      </div>
      <label class="search-control">
        <Search :size="17" />
        <span class="sr-only">查找储物袋</span>
        <input v-model="query" type="search" placeholder="搜索物品" />
      </label>
    </header>

    <div v-if="items.length" class="item-grid">
      <article v-for="entry in items" :key="entry.index" class="item-card" :class="`quality-${entry.quality.toLowerCase()}`">
        <div class="item-card__topline">
          <span>{{ qualityLabels[entry.quality] }}</span>
          <span>{{ translateLegacyText(entry.data.slot) }}</span>
        </div>
        <h3>{{ translateLegacyText(getLegacyItemDisplayName(entry.item)) }}</h3>
        <p>{{ translateLegacyText(entry.data?.type || entry.base) }}</p>
        <dl v-if="entry.stats" class="item-stats">
          <div v-if="entry.stats.atk"><dt>攻</dt><dd>+{{ entry.stats.atk }}</dd></div>
          <div v-if="entry.stats.def"><dt>防</dt><dd>+{{ entry.stats.def }}</dd></div>
          <div v-if="entry.stats.hp"><dt>气血</dt><dd>+{{ entry.stats.hp }}</dd></div>
          <div v-if="entry.stats.mp"><dt>法力</dt><dd>+{{ entry.stats.mp }}</dd></div>
        </dl>
        <button v-if="entry.data" class="button button--secondary" type="button" @click="characters.equipInventoryItem(entry.index)">
          <ArrowUpToLine :size="16" /> 装备
        </button>
      </article>
    </div>

    <div v-else class="empty-state empty-state--large">
      <PackageOpen :size="34" />
      <h3>{{ query ? '没有匹配物品' : '储物袋尚空' }}</h3>
      <p>{{ query ? '调整查找词后再试。' : '斗法、委托和闭关所得的物品会出现在这里。' }}</p>
    </div>
  </section>
</template>
