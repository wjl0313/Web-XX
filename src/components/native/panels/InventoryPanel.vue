<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  ALL_ITEM_DATA,
  getLegacyItemBaseName,
  getLegacyItemDisplayName,
  getLegacyItemEffectiveStats,
  getLegacyItemQuality,
  getLegacyItemSellValue,
  translateLegacyText,
  type LegacyEquipmentSlot,
} from '../../../game-core'
import {
  ALCHEMY_V2_RECIPES,
  ELEMENT_LABELS,
  V2_EQUIPMENT_PROFILES,
  isV2EquipmentEnabled,
  type P2PillId,
  type ResistedElement,
} from '../../../game-core/rulesets'
import { useActivitiesStore } from '../../../stores/activities.store'
import { useActionStore } from '../../../stores/action.store'
import { useCharacterStore } from '../../../stores/character.store'
import { useSaveStore } from '../../../stores/save.store'
import { useUiStore } from '../../../stores/ui.store'

const characters = useCharacterStore()
const ui = useUiStore()
const activities = useActivitiesStore()
const actions = useActionStore()
const saves = useSaveStore()
const isV2 = computed(() => characters.ruleset === 'v2')
const query = ref('')
const qualityFilter = ref('all')
const slotFilter = ref('all')
const sortBy = ref<'quality' | 'name' | 'score'>('quality')
const page = ref(1)
const pageSize = 12
const selectedIndex = ref<number | null>(null)
const qualityLabels: Record<string, string> = { Normal: '凡品', Magic: '灵品', Rare: '珍品', Epic: '极品', Legendary: '古宝', Mythic: '通天', Runeword: '符纹造物' }
const qualityRanks: Record<string, number> = { Normal: 0, Magic: 1, Rare: 2, Epic: 3, Legendary: 4, Mythic: 5, Runeword: 6 }
const slotLabels: Record<string, string> = { weapon: '主手法器', offhand: '副手法器', chest: '衣袍', legs: '护腿', feet: '鞋履', charm: '饰品' }
const equipmentSlots = Object.entries(slotLabels)
const resistedElements: ResistedElement[] = ['metal', 'wood', 'water', 'fire', 'earth', 'thunder', 'ice', 'wind', 'dark']
const alchemyRecipe = ref<P2PillId>('回春丹')
const alchemyCount = ref(1)
const herbs = computed(() => characterCountRecord(saves.activeCharacter?.v2Herbs))
const pills = computed(() => characterCountRecord(saves.activeCharacter?.v2Pills))

function characterCountRecord(value: unknown): Record<string, number> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, number> : {}
}

function queueAlchemy() {
  if (activities.queueAlchemy(alchemyRecipe.value, alchemyCount.value)) ui.toast('炼丹任务已加入队列。', 'success')
  else ui.toast(actions.resting ? '调息中不能开始炼丹。' : '灵草不足或炼丹队列已满。', 'warning')
}

function claimAlchemy() {
  const claimed = activities.claimAlchemy()
  if (!claimed) ui.toast(actions.resting ? '调息中不能领取炼丹成果。' : '当前没有已完成的丹药。', 'warning')
  else ui.toast(`已领取：${Object.entries(claimed).map(([id, count]) => `${id}×${count}`).join('、')}`, 'success')
}

function usePill(pillId: P2PillId) {
  if (activities.usePill(pillId)) ui.toast(`已服用${pillId}。`, 'success')
  else ui.toast(actions.resting ? '调息中只能服用回春丹。' : '战斗中请在战斗操作栏服丹，或丹药库存不足。', 'warning')
}

function effectiveStats(item: unknown) {
  return isV2.value ? characters.getItemDelta(item) : getLegacyItemEffectiveStats(item)
}

function itemResistances(item: unknown) {
  const profile = V2_EQUIPMENT_PROFILES[getLegacyItemBaseName(item)]
  return resistedElements
    .map((element) => ({ element, label: ELEMENT_LABELS[element], value: Number(profile?.resistances?.[element] || 0) }))
    .filter((entry) => entry.value !== 0)
}

function equippedItem(slot: string): unknown | null {
  return characters.equipment[slot as LegacyEquipmentSlot]
}

function itemCategory(data: unknown): string {
  const record = data && typeof data === 'object' ? data as Record<string, unknown> : {}
  const slot = String(record.slot || '')
  return slot && slotLabels[slot] ? slotLabels[slot] : translateLegacyText(String(record.type || '杂物'))
}

const entries = computed(() => characters.inventory.map((item, index) => {
  const base = getLegacyItemBaseName(item)
  const data = ALL_ITEM_DATA[base as keyof typeof ALL_ITEM_DATA]
  const stats = effectiveStats(item)
  const quality = getLegacyItemQuality(item)
  const record = item && typeof item === 'object' && !Array.isArray(item) ? item as Record<string, unknown> : {}
  const score = Number(stats?.atk || 0) + Number(stats?.def || 0) + Number(stats?.hp || 0) / 5 + Number(stats?.mp || 0) / 5
  return {
    item, index, base, data, stats, quality, record, score,
    v2Enabled: isV2EquipmentEnabled(base),
    resistances: itemResistances(item),
    displayName: translateLegacyText(getLegacyItemDisplayName(item)),
  }
}))

const filtered = computed(() => entries.value.filter((entry) => {
  const needle = query.value.trim().toLowerCase()
  if (needle && ![entry.base, entry.displayName, translateLegacyText(entry.data?.type || ''), translateLegacyText(entry.data?.slot || '')].join(' ').toLowerCase().includes(needle)) return false
  if (qualityFilter.value !== 'all' && entry.quality !== qualityFilter.value) return false
  if (slotFilter.value === 'favorite' && !entry.record.favorite) return false
  if (slotFilter.value === 'locked' && !entry.record.locked) return false
  if (!['all', 'favorite', 'locked'].includes(slotFilter.value) && entry.data?.slot !== slotFilter.value) return false
  return true
}).sort((left, right) => {
  if (sortBy.value === 'name') return left.displayName.localeCompare(right.displayName, 'zh-CN')
  if (sortBy.value === 'score') return right.score - left.score
  return qualityRanks[right.quality] - qualityRanks[left.quality] || right.score - left.score
}))

const pageCount = computed(() => Math.max(1, Math.ceil(filtered.value.length / pageSize)))
const items = computed(() => filtered.value.slice((page.value - 1) * pageSize, page.value * pageSize))
const selected = computed(() => entries.value.find((entry) => entry.index === selectedIndex.value) || null)
const compared = computed(() => {
  const entry = selected.value
  const slot = entry?.data?.slot
  if (!entry || !slot) return null
  const equipped = characters.equipment[slot as keyof typeof characters.equipment]
  const oldStats = effectiveStats(equipped)
  return {
    item: equipped,
    name: equipped ? translateLegacyText(getLegacyItemDisplayName(equipped)) : '该槽位为空',
    stats: oldStats,
    resistances: itemResistances(equipped),
    delta: {
      atk: Number(entry.stats?.atk || 0) - Number(oldStats?.atk || 0),
      def: Number(entry.stats?.def || 0) - Number(oldStats?.def || 0),
      hp: Number(entry.stats?.hp || 0) - Number(oldStats?.hp || 0),
      mp: Number(entry.stats?.mp || 0) - Number(oldStats?.mp || 0),
    },
  }
})

const resistanceDelta = computed(() => {
  if (!isV2.value || !selected.value || !compared.value) return []
  const selectedValues = Object.fromEntries(selected.value.resistances.map((entry) => [entry.element, entry.value]))
  const equippedValues = Object.fromEntries(compared.value.resistances.map((entry) => [entry.element, entry.value]))
  return resistedElements
    .map((element) => ({
      element,
      label: ELEMENT_LABELS[element],
      value: Number(selectedValues[element] || 0) - Number(equippedValues[element] || 0),
    }))
    .filter((entry) => entry.value !== 0)
})

watch([query, qualityFilter, slotFilter, sortBy], () => { page.value = 1 })
watch(pageCount, (count) => { if (page.value > count) page.value = count })

function equip(index: number) {
  const entry = entries.value.find((item) => item.index === index)
  if (isV2.value && entry && !entry.v2Enabled) {
    ui.toast('该装备未纳入当前修行体系，暂时不能装备。', 'warning')
    return
  }
  if (characters.equipInventoryItem(index)) {
    selectedIndex.value = null
    ui.toast('装备已更换。', 'success')
  }
}

async function sell(index: number) {
  const entry = entries.value.find((item) => item.index === index)
  if (!entry) return
  if (entry.record.locked || entry.record.favorite) {
    ui.toast('锁定或收藏的物品不能出售。', 'warning')
    return
  }
  const accepted = await ui.confirm(`出售“${entry.displayName}”，预计获得 ${getLegacyItemSellValue(entry.item)} 枚灵石？`, { title: '出售物品', confirmLabel: '确认出售' })
  if (!accepted) return
  const value = characters.sellInventoryItem(index)
  if (value === null) return
  selectedIndex.value = null
  ui.toast(`已出售物品，获得 ${value} 枚灵石。`, 'success')
}

function autoEquip() {
  const count = characters.autoEquipBest()
  ui.toast(count ? `已自动替换 ${count} 件更优装备。` : '没有发现更优装备。', count ? 'success' : 'info')
}
</script>

<template>
  <div class="legacy-inventory-layout">
    <aside class="legacy-paperdoll" :class="{ 'has-v2-alchemy': isV2 }" aria-label="当前装备">
      <h2>随身装备</h2>
      <div class="legacy-paperdoll-grid">
        <article v-for="([slot, label]) in equipmentSlots" :key="slot">
          <span>{{ label }}</span>
          <strong>{{ equippedItem(slot) ? translateLegacyText(getLegacyItemDisplayName(equippedItem(slot))) : '空' }}</strong>
        </article>
      </div>
      <button type="button" @click="autoEquip">自动装备更优物品</button>
      <details v-if="isV2" class="legacy-side-panel" open>
        <summary>简化炼丹</summary>
        <div class="legacy-side-panel__body legacy-afk-body">
          <p>灵草：{{ Object.entries(herbs).map(([id, count]) => `${id}×${count}`).join(' · ') || '暂无' }}</p>
          <label><span>丹方</span><select v-model="alchemyRecipe"><option v-for="recipe in ALCHEMY_V2_RECIPES" :key="recipe.id" :value="recipe.id">{{ recipe.id }}</option></select></label>
          <p>{{ ALCHEMY_V2_RECIPES[alchemyRecipe].description }}</p>
          <small>需要：{{ Object.entries(ALCHEMY_V2_RECIPES[alchemyRecipe].materials).map(([id, count]) => `${id}×${Number(count) * alchemyCount}`).join('、') }}</small>
          <label><span>次数</span><input v-model.number="alchemyCount" type="number" min="1" max="5" /></label>
          <button type="button" :disabled="actions.resting" @click="queueAlchemy">加入炼丹队列</button>
          <p>队列：{{ activities.alchemyQueue.length }} / 5</p>
          <button type="button" :disabled="actions.resting || !activities.alchemyQueue.length" @click="claimAlchemy">领取已完成丹药</button>
          <div class="legacy-chip-list"><button v-for="pillId in (Object.keys(ALCHEMY_V2_RECIPES) as P2PillId[])" :key="pillId" type="button" :disabled="!pills[pillId] || (actions.resting && pillId !== '回春丹')" @click="usePill(pillId)">{{ pillId }} ×{{ pills[pillId] || 0 }}</button></div>
        </div>
      </details>
    </aside>

    <section class="content-panel legacy-bag-area" aria-labelledby="inventory-title">
      <header class="legacy-panel-heading">
        <div><h2 id="inventory-title">储物袋</h2><small>{{ characters.inventory.length }} / {{ characters.inventoryCapacity }} 格</small></div>
      </header>
      <div class="legacy-inventory-toolbar">
        <input v-model="query" type="search" placeholder="搜索物品" aria-label="查找储物袋" />
        <select v-model="qualityFilter" aria-label="品质筛选"><option value="all">全部品质</option><option v-for="(label, key) in qualityLabels" :key="key" :value="key">{{ label }}</option></select>
        <select v-model="slotFilter" aria-label="部位筛选"><option value="all">全部物品</option><option v-for="(label, key) in slotLabels" :key="key" :value="key">{{ label }}</option><option value="favorite">仅收藏</option><option value="locked">仅锁定</option></select>
        <select v-model="sortBy" aria-label="排序"><option value="quality">按品质</option><option value="score">按属性</option><option value="name">按名称</option></select>
      </div>

      <div v-if="items.length" class="legacy-bag-grid">
        <button v-for="entry in items" :key="entry.index" type="button" :class="[`quality-${entry.quality.toLowerCase()}`, { 'is-selected': selectedIndex === entry.index }]" @click="selectedIndex = entry.index">
          <span class="legacy-bag-slot-flags">{{ entry.record.locked ? '🔒' : '' }}{{ entry.record.favorite ? '★' : '' }}</span>
          <h3>{{ entry.displayName }}</h3>
          <small>{{ qualityLabels[entry.quality] }} · {{ itemCategory(entry.data) }}</small>
          <em>攻 {{ Number(entry.stats?.atk || 0) }} · 防 {{ Number(entry.stats?.def || 0) }}</em>
          <em v-if="isV2 && !entry.v2Enabled">暂未收录</em>
        </button>
      </div>
      <div v-else class="legacy-empty-state"><h3>{{ query ? '没有匹配物品' : '储物袋尚空' }}</h3><p>{{ query ? '调整查找词或筛选条件后再试。' : '斗法、委托和闭关所得的物品会出现在这里。' }}</p></div>

      <footer class="legacy-pagination"><button type="button" aria-label="上一页" :disabled="page <= 1" @click="page--">上一页</button><span>第 {{ page }} / {{ pageCount }} 页 · 共 {{ filtered.length }} 件</span><button type="button" aria-label="下一页" :disabled="page >= pageCount" @click="page++">下一页</button></footer>
    </section>

    <aside v-if="selected" class="legacy-item-detail" aria-label="物品详情与装备对比">
        <header><div><small>物品详情</small><h2>{{ selected.displayName }}</h2><span>{{ qualityLabels[selected.quality] }} · {{ itemCategory(selected.data) }}</span></div><button type="button" aria-label="关闭物品详情" @click="selectedIndex = null">×</button></header>
        <div class="legacy-compare-grid">
          <section><strong>待装备物品</strong><dl><div v-for="key in ['atk', 'def', 'hp', 'mp']" :key="key"><dt>{{ { atk: '攻击', def: '防御', hp: '气血', mp: '法力' }[key] }}</dt><dd>{{ Number(selected.stats?.[key as 'atk'] || 0) }}</dd></div></dl></section>
          <section v-if="compared"><strong>当前装备</strong><h3>{{ compared.name }}</h3><dl><div v-for="key in ['atk', 'def', 'hp', 'mp']" :key="key"><dt>{{ { atk: '攻击', def: '防御', hp: '气血', mp: '法力' }[key] }}</dt><dd>{{ Number(compared.stats?.[key as 'atk'] || 0) }}</dd></div></dl></section>
        </div>
        <div v-if="isV2" class="legacy-compare-grid">
          <section><strong>待装备抗性</strong><p v-if="!selected.resistances.length">无抗性</p><dl v-else><div v-for="entry in selected.resistances" :key="entry.element"><dt>{{ entry.label }}</dt><dd>{{ entry.value > 0 ? '+' : '' }}{{ entry.value }}</dd></div></dl></section>
          <section v-if="compared"><strong>当前装备抗性</strong><p v-if="!compared.resistances.length">无抗性</p><dl v-else><div v-for="entry in compared.resistances" :key="entry.element"><dt>{{ entry.label }}</dt><dd>{{ entry.value > 0 ? '+' : '' }}{{ entry.value }}</dd></div></dl></section>
        </div>
        <dl v-if="compared" class="legacy-delta-list"><div v-for="key in ['atk', 'def', 'hp', 'mp']" :key="key"><dt>{{ { atk: '攻击差值', def: '防御差值', hp: '气血差值', mp: '法力差值' }[key] }}</dt><dd :class="{ 'is-positive': compared.delta[key as 'atk'] > 0, 'is-negative': compared.delta[key as 'atk'] < 0 }">{{ compared.delta[key as 'atk'] > 0 ? '+' : '' }}{{ compared.delta[key as 'atk'] }}</dd></div></dl>
        <dl v-if="isV2 && resistanceDelta.length" class="legacy-delta-list"><div v-for="entry in resistanceDelta" :key="entry.element"><dt>{{ entry.label }}抗性差值</dt><dd :class="{ 'is-positive': entry.value > 0, 'is-negative': entry.value < 0 }">{{ entry.value > 0 ? '+' : '' }}{{ entry.value }}</dd></div></dl>
        <div class="legacy-item-actions"><button v-if="selected.data?.slot" type="button" :disabled="isV2 && !selected.v2Enabled" @click="equip(selected.index)">{{ isV2 && !selected.v2Enabled ? '暂未收录' : '装备' }}</button><button type="button" @click="characters.toggleInventoryFlag(selected.index, 'locked')">{{ selected.record.locked ? '取消锁定' : '锁定' }}</button><button type="button" @click="characters.toggleInventoryFlag(selected.index, 'favorite')">{{ selected.record.favorite ? '取消收藏' : '收藏' }}</button><button class="is-danger" type="button" :disabled="Boolean(selected.record.locked || selected.record.favorite || (isV2 && actions.resting))" @click="sell(selected.index)">出售</button></div>
    </aside>
  </div>
</template>
