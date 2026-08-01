<script setup lang="ts">
import { computed, ref } from 'vue'
import { Check, LockKeyhole, MapPin, Search } from 'lucide-vue-next'

import { ZONES, translateLegacyText } from '../../../game-core/data'
import { useCharacterStore } from '../../../stores/character.store'
import { useCombatStore } from '../../../stores/combat.store'
import { useSaveStore } from '../../../stores/save.store'

const saves = useSaveStore()
const characters = useCharacterStore()
const combat = useCombatStore()
const query = ref('')
const character = computed(() => saves.activeCharacter!)
const zones = computed(() => ZONES.map((zone, index) => ({ zone, index })).filter(({ zone }) => {
  const needle = query.value.trim().toLowerCase()
  return !needle || [zone.name, zone.desc, ...zone.mobs].join(' ').toLowerCase().includes(needle)
}))

function travel(index: number) {
  if (combat.inCombat) return
  characters.setZone(index)
}
</script>

<template>
  <section class="content-panel" aria-labelledby="zones-title">
    <header class="panel-heading">
      <div>
        <p class="eyebrow">已解锁 {{ ZONES.filter((zone) => Number(character.level) >= zone.minLvl).length }} / {{ ZONES.length }}</p>
        <h2 id="zones-title">历练区域</h2>
      </div>
      <label class="search-control">
        <Search :size="17" /><span class="sr-only">搜索区域</span>
        <input v-model="query" type="search" placeholder="搜索区域或妖兽" />
      </label>
    </header>

    <div class="zone-list">
      <article v-for="entry in zones" :key="entry.index" class="zone-row" :class="{ 'is-current': Number(character.zone) === entry.index, 'is-locked': Number(character.level) < entry.zone.minLvl }">
        <div class="zone-row__marker" aria-hidden="true">
          <Check v-if="Number(character.zone) === entry.index" :size="18" />
          <LockKeyhole v-else-if="Number(character.level) < entry.zone.minLvl" :size="18" />
          <MapPin v-else :size="18" />
        </div>
        <div class="zone-row__body">
          <div><h3>{{ translateLegacyText(entry.zone.name) }}</h3><span>修为等级 {{ entry.zone.minLvl }}–{{ entry.zone.maxLvl }}</span></div>
          <p>{{ translateLegacyText(entry.zone.desc) }}</p>
          <small>{{ entry.zone.mobs.map(translateLegacyText).join(' · ') }}</small>
        </div>
        <button class="button button--secondary" type="button" :disabled="Number(character.level) < entry.zone.minLvl || combat.inCombat || Number(character.zone) === entry.index" @click="travel(entry.index)">
          {{ Number(character.zone) === entry.index ? '当前区域' : Number(character.level) < entry.zone.minLvl ? '尚未解锁' : '前往' }}
        </button>
      </article>
    </div>
  </section>
</template>
