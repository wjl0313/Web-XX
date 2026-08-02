<script setup lang="ts">
import { computed } from 'vue'
import {
  getLegacyItemDisplayName,
  getLegacyItemEffectiveStats,
  getLegacyItemBaseName,
  translateLegacyText,
  type LegacyEquipmentSlot,
} from '../../../game-core'
import {
  ELEMENT_LABELS,
  getV2EquipmentResistances,
  isV2EquipmentEnabled,
  type ResistedElement,
} from '../../../game-core/rulesets'
import { useCharacterStore } from '../../../stores/character.store'
import { useSaveStore } from '../../../stores/save.store'
import LegacyCultivatorAvatar from '../LegacyCultivatorAvatar.vue'

const saves = useSaveStore()
const characters = useCharacterStore()
const character = computed(() => saves.activeCharacter!)
const isV2 = computed(() => characters.ruleset === 'v2')
const resistedElements: ResistedElement[] = ['metal', 'wood', 'water', 'fire', 'earth', 'thunder', 'ice', 'wind', 'dark']
const equipmentResistances = computed(() => {
  if (!isV2.value) return []
  const resistances = getV2EquipmentResistances(character.value)
  return resistedElements
    .filter((element) => Number(resistances[element] || 0) !== 0)
    .map((element) => ({ label: ELEMENT_LABELS[element], value: Number(resistances[element] || 0) }))
})
const slots: Array<{ id: LegacyEquipmentSlot; label: string }> = [
  { id: 'weapon', label: '主法器' },
  { id: 'offhand', label: '辅手法器' },
  { id: 'chest', label: '衣袍' },
  { id: 'legs', label: '护腿' },
  { id: 'feet', label: '鞋履' },
  { id: 'charm', label: '饰品' },
]

function stats(item: unknown) {
  return isV2.value ? characters.getItemDelta(item) : getLegacyItemEffectiveStats(item)
}
</script>

<template>
  <div class="legacy-equipment-page">
    <section class="content-panel legacy-equipment-paperdoll" aria-labelledby="equipment-title">
      <header class="legacy-panel-heading"><div><h2 id="equipment-title">随身装备</h2><small>完整保留六槽装备</small></div></header>
      <div class="legacy-equipment-stage">
        <div class="legacy-equipment-avatar"><LegacyCultivatorAvatar :appearance="character.appearance as Record<string, unknown>" :label="`${character.name}的装备形象`" /></div>
        <article v-for="(slot, index) in slots" :key="slot.id" class="legacy-equipment-slot equipment-slot" :class="`slot-${index + 1}`">
          <span>{{ slot.label }}</span>
          <template v-if="characters.equipment[slot.id]">
            <strong>{{ translateLegacyText(getLegacyItemDisplayName(characters.equipment[slot.id])) }}</strong>
            <small v-if="stats(characters.equipment[slot.id])">攻 +{{ stats(characters.equipment[slot.id])!.atk }} · 防 +{{ stats(characters.equipment[slot.id])!.def }}</small>
            <small v-if="isV2 && !isV2EquipmentEnabled(getLegacyItemBaseName(characters.equipment[slot.id]))">当前修行体系未收录，此装备效果不计入斗法</small>
            <button type="button" aria-label="卸下装备" @click="characters.unequip(slot.id)">卸下</button>
          </template>
          <em v-else>空</em>
        </article>
      </div>
    </section>

    <aside class="legacy-equipment-stats" aria-labelledby="stats-title">
      <h2 id="stats-title">修士属性</h2>
      <dl><div><dt>攻击</dt><dd>{{ character.atk }}</dd></div><div><dt>防御</dt><dd>{{ character.def }}</dd></div><div><dt>气血上限</dt><dd>{{ character.maxHp }}</dd></div><div><dt>法力上限</dt><dd>{{ character.maxMp }}</dd></div></dl>
      <section v-if="isV2"><h3>装备抗性</h3><div v-if="equipmentResistances.length"><span v-for="entry in equipmentResistances" :key="entry.label">{{ entry.label }} {{ entry.value > 0 ? '+' : '' }}{{ entry.value }}</span></div><p v-else>当前装备没有提供五行或异属性抗性。</p></section>
      <section><h3>符纹匣</h3><template v-if="isV2"><p>符纹数据暂时保留，但不计入符纹、套装与复杂重铸效果。</p></template><template v-else><div v-if="Array.isArray(character.runeStash) && character.runeStash.length"><span v-for="(rune, index) in character.runeStash" :key="`${rune}-${index}`">{{ translateLegacyText(String(rune)) }}</span></div><p v-else>尚未收集符纹。</p></template></section>
    </aside>
  </div>
</template>
