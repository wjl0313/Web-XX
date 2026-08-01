<script setup lang="ts">
import { computed } from 'vue'
import { CircleOff, Gem, Shield, Shirt, Sparkles, Sword, Watch } from 'lucide-vue-next'

import {
  getLegacyItemDisplayName,
  getLegacyItemEffectiveStats,
  translateLegacyText,
  type LegacyEquipmentSlot,
} from '../../../game-core'
import { useCharacterStore } from '../../../stores/character.store'
import { useSaveStore } from '../../../stores/save.store'

const saves = useSaveStore()
const characters = useCharacterStore()
const character = computed(() => saves.activeCharacter!)
const slots: Array<{ id: LegacyEquipmentSlot; label: string; icon: typeof Sword }> = [
  { id: 'weapon', label: '主手法器', icon: Sword },
  { id: 'chest', label: '法袍', icon: Shirt },
  { id: 'legs', label: '下装', icon: Shield },
  { id: 'feet', label: '法靴', icon: CircleOff },
  { id: 'offhand', label: '副手法器', icon: Sparkles },
  { id: 'charm', label: '护身符', icon: Watch },
]

function stats(item: unknown) {
  return getLegacyItemEffectiveStats(item)
}
</script>

<template>
  <div class="panel-layout panel-layout--equipment">
    <section class="content-panel" aria-labelledby="equipment-title">
      <header class="panel-heading">
        <div>
          <p class="eyebrow">六处装备槽</p>
          <h2 id="equipment-title">随身装备</h2>
        </div>
      </header>

      <div class="equipment-grid">
        <article v-for="slot in slots" :key="slot.id" class="equipment-slot">
          <div class="equipment-slot__icon" aria-hidden="true"><component :is="slot.icon" :size="22" /></div>
          <div class="equipment-slot__body">
            <span>{{ slot.label }}</span>
            <template v-if="characters.equipment[slot.id]">
              <h3>{{ translateLegacyText(getLegacyItemDisplayName(characters.equipment[slot.id])) }}</h3>
              <p v-if="stats(characters.equipment[slot.id])">
                攻 +{{ stats(characters.equipment[slot.id])!.atk }} · 防 +{{ stats(characters.equipment[slot.id])!.def }} · 气血 +{{ stats(characters.equipment[slot.id])!.hp }}
              </p>
            </template>
            <p v-else>尚未装备</p>
          </div>
          <button v-if="characters.equipment[slot.id]" class="icon-button" type="button" title="卸下" aria-label="卸下装备" @click="characters.unequip(slot.id)">
            <CircleOff :size="17" />
          </button>
        </article>
      </div>
    </section>

    <aside class="stats-rail" aria-labelledby="stats-title">
      <header class="panel-heading panel-heading--compact">
        <div><p class="eyebrow">当前总值</p><h2 id="stats-title">修士属性</h2></div>
      </header>
      <dl class="primary-stats">
        <div><dt>攻势</dt><dd>{{ character.atk }}</dd></div>
        <div><dt>防御</dt><dd>{{ character.def }}</dd></div>
        <div><dt>气血上限</dt><dd>{{ character.maxHp }}</dd></div>
        <div><dt>法力上限</dt><dd>{{ character.maxMp }}</dd></div>
      </dl>
      <div class="rune-stash">
        <div class="rune-stash__title"><Gem :size="17" /><strong>符文匣</strong><span>{{ Array.isArray(character.runeStash) ? character.runeStash.length : 0 }}</span></div>
        <div v-if="Array.isArray(character.runeStash) && character.runeStash.length" class="rune-list">
          <span v-for="(rune, index) in character.runeStash" :key="`${rune}-${index}`">{{ translateLegacyText(String(rune)) }}</span>
        </div>
        <p v-else>尚未收集符文。</p>
      </div>
    </aside>
  </div>
</template>
