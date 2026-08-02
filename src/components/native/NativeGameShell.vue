<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import GameLayout from '../../layouts/GameLayout.vue'
import { useAfkStore } from '../../stores/afk.store'
import { useActionStore } from '../../stores/action.store'
import { useCombatStore } from '../../stores/combat.store'
import { useSaveStore } from '../../stores/save.store'
import { useUiStore, type GamePanel } from '../../stores/ui.store'
import AfkControlRail from './AfkControlRail.vue'
import CharacterStatusRail from './CharacterStatusRail.vue'
import OfflineSummaryDialog from './OfflineSummaryDialog.vue'
import CombatPanel from './panels/CombatPanel.vue'
import EquipmentPanel from './panels/EquipmentPanel.vue'
import InventoryPanel from './panels/InventoryPanel.vue'
import QuestsPanel from './panels/QuestsPanel.vue'
import SettingsPanel from './panels/SettingsPanel.vue'
import SpellsPanel from './panels/SpellsPanel.vue'
import ZonesPanel from './panels/ZonesPanel.vue'

const saves = useSaveStore()
const ui = useUiStore()
const combat = useCombatStore()
const afk = useAfkStore()
const actions = useActionStore()
const compactView = ref(false)
const character = computed(() => saves.activeCharacter)
const panels: Array<{ id: GamePanel; label: string; glyph: string }> = [
  { id: 'combat', label: '斗法', glyph: '⚔' },
  { id: 'zones', label: '历练区域', glyph: '🗺' },
  { id: 'inventory', label: '储物袋', glyph: '🎒' },
  { id: 'equipment', label: '随身装备', glyph: '🛡' },
  { id: 'spells', label: '功法典籍', glyph: '🔮' },
  { id: 'quests', label: '委托', glyph: '📜' },
  { id: 'settings', label: '设置', glyph: '⚙' },
]
const activeComponent = computed(() => ({
  combat: CombatPanel,
  inventory: InventoryPanel,
  equipment: EquipmentPanel,
  spells: SpellsPanel,
  zones: ZonesPanel,
  quests: QuestsPanel,
  settings: SettingsPanel,
})[ui.panel])

async function saveNow() {
  await saves.persist()
  ui.toast('道途已保存。', 'success')
}

async function leave() {
  combat.reset()
  afk.clearSummary()
  if (afk.running) await afk.stop()
  await saves.persist()
  saves.leaveCharacter()
  ui.showRoster()
}

function visibilityHandler() {
  void afk.handleVisibility(document.hidden)
}

onMounted(() => {
  actions.startTimer()
  document.addEventListener('visibilitychange', visibilityHandler)
})
onBeforeUnmount(() => {
  actions.stopTimer()
  document.removeEventListener('visibilitychange', visibilityHandler)
})
</script>

<template>
  <GameLayout>
    <main v-if="character" id="native-main" class="legacy-game-screen" :class="{ 'is-compact': compactView }">
      <h1 class="sr-only">{{ character.name }}</h1>
      <header class="legacy-game-topbar">
        <strong>凡修录 - 版本 1.6.19</strong>
        <span class="legacy-topbar-spacer" />
        <span class="legacy-save-state">▣ {{ saves.saving ? '保存中' : saves.lastSavedAt ? '已保存' : '本地存档' }}</span>
        <button type="button" @click="ui.openPanel('settings')">⚙ 设置</button>
        <button type="button" @click="saveNow">▣ 保存道途</button>
        <button type="button" @click="leave">♙ 角色</button>
        <button type="button" @click="compactView = !compactView">界面</button>
        <button type="button" disabled title="更多功能暂未开放">… 更多</button>
      </header>

      <div class="legacy-game-grid">
        <CharacterStatusRail />

        <section class="legacy-center-panel" :aria-label="panels.find((item) => item.id === ui.panel)?.label">
          <nav class="legacy-tab-bar" aria-label="游戏功能">
            <button
              v-for="item in panels"
              :key="item.id"
              type="button"
              :class="{ 'is-active': ui.panel === item.id }"
              :aria-current="ui.panel === item.id ? 'page' : undefined"
              @click="ui.openPanel(item.id)"
            ><span aria-hidden="true">{{ item.glyph }}</span>{{ item.label }}</button>
          </nav>
          <div class="legacy-tab-content"><component :is="activeComponent" /></div>
        </section>

        <AfkControlRail />
      </div>

      <nav class="mobile-bottom-nav legacy-mobile-nav" aria-label="移动端功能导航">
        <button v-for="item in panels.slice(0, 6)" :key="item.id" :class="{ 'is-active': ui.panel === item.id }" type="button" @click="ui.openPanel(item.id)"><span aria-hidden="true">{{ item.glyph }}</span><span>{{ item.label }}</span></button>
      </nav>
    </main>
    <OfflineSummaryDialog />
  </GameLayout>
</template>
