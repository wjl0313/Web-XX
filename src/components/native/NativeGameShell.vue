<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import {
  Backpack,
  BookOpenText,
  CircleUserRound,
  Compass,
  Map,
  Menu,
  ScrollText,
  Settings,
  Shield,
  Swords,
} from 'lucide-vue-next'

import { ZONES, translateLegacyText } from '../../game-core/data'
import { useAfkStore } from '../../stores/afk.store'
import { useCombatStore } from '../../stores/combat.store'
import { useSaveStore } from '../../stores/save.store'
import { useUiStore, type GamePanel } from '../../stores/ui.store'
import CombatPanel from './panels/CombatPanel.vue'
import EquipmentPanel from './panels/EquipmentPanel.vue'
import InventoryPanel from './panels/InventoryPanel.vue'
import QuestsPanel from './panels/QuestsPanel.vue'
import SettingsPanel from './panels/SettingsPanel.vue'
import SpellsPanel from './panels/SpellsPanel.vue'
import ZonesPanel from './panels/ZonesPanel.vue'
import ResourceBar from './ResourceBar.vue'

const saves = useSaveStore()
const ui = useUiStore()
const combat = useCombatStore()
const afk = useAfkStore()
const character = computed(() => saves.activeCharacter)
const currentZone = computed(() => {
  const index = Math.max(0, Math.min(ZONES.length - 1, Number(character.value?.zone || 0)))
  return ZONES[index]
})

const panels: Array<{ id: GamePanel; label: string; icon: typeof Swords }> = [
  { id: 'combat', label: '斗法', icon: Swords },
  { id: 'inventory', label: '储物袋', icon: Backpack },
  { id: 'equipment', label: '随身装备', icon: Shield },
  { id: 'spells', label: '功法典籍', icon: BookOpenText },
  { id: 'zones', label: '历练区域', icon: Map },
  { id: 'quests', label: '委托', icon: ScrollText },
  { id: 'settings', label: '设置', icon: Settings },
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

async function leave() {
  combat.reset()
  if (afk.running) await afk.stop()
  await saves.persist()
  saves.leaveCharacter()
  ui.showRoster()
}

function visibilityHandler() {
  void afk.handleVisibility(document.hidden)
}

onMounted(() => document.addEventListener('visibilitychange', visibilityHandler))
onBeforeUnmount(() => document.removeEventListener('visibilitychange', visibilityHandler))
</script>

<template>
  <main v-if="character" id="native-main" class="game-workspace">
    <header class="game-topbar">
      <button class="icon-button game-topbar__menu" type="button" title="打开导航" aria-label="打开导航" @click="ui.mobileMenuOpen = !ui.mobileMenuOpen">
        <Menu :size="20" />
      </button>
      <div class="brand-lockup brand-lockup--compact">
        <span class="brand-seal" aria-hidden="true">凡</span>
        <div>
          <p class="eyebrow">凡修录</p>
          <h1>{{ character.name }}</h1>
        </div>
      </div>

      <div class="character-summary">
        <span>修为等级 <strong>{{ character.level }}</strong></span>
        <span>{{ translateLegacyText(String(character.cls)) }}</span>
        <span>{{ Number(character.gold || 0).toLocaleString('zh-CN') }} 灵石</span>
      </div>

      <div class="topbar-resources">
        <ResourceBar label="气血" tone="health" :value="Number(character.hp)" :maximum="Number(character.maxHp)" />
        <ResourceBar label="法力" tone="mana" :value="Number(character.mp)" :maximum="Number(character.maxMp)" />
      </div>

      <button class="button button--quiet" type="button" @click="leave">
        <CircleUserRound :size="17" />
        返回角色库
      </button>
    </header>

    <nav class="game-nav" :class="{ 'is-open': ui.mobileMenuOpen }" aria-label="游戏功能">
      <button
        v-for="item in panels"
        :key="item.id"
        class="game-nav__item"
        :class="{ 'is-active': ui.panel === item.id }"
        type="button"
        :aria-current="ui.panel === item.id ? 'page' : undefined"
        @click="ui.openPanel(item.id)"
      >
        <component :is="item.icon" :size="18" />
        <span>{{ item.label }}</span>
      </button>
      <div class="game-nav__context">
        <Compass :size="16" />
        <span>{{ translateLegacyText(currentZone.name) }}</span>
      </div>
    </nav>

    <section class="game-content" :aria-label="panels.find((item) => item.id === ui.panel)?.label">
      <component :is="activeComponent" />
    </section>
  </main>
</template>
