<script setup lang="ts">
import { computed } from 'vue'
import { BookOpenCheck, LockKeyhole, Play, Sparkles } from 'lucide-vue-next'

import { getLegacyClassSpellbook, getLegacyScaledSpellMpCost } from '../../../game-core/systems/spells'
import { translateLegacyText } from '../../../game-core/data'
import { useCharacterStore } from '../../../stores/character.store'
import { useCombatStore } from '../../../stores/combat.store'
import { useSaveStore } from '../../../stores/save.store'

const saves = useSaveStore()
const characters = useCharacterStore()
const combat = useCombatStore()
const character = computed(() => saves.activeCharacter!)
const known = computed(() => new Set(Array.isArray(character.value.knownSpells) ? character.value.knownSpells : []))
const spells = computed(() => getLegacyClassSpellbook(String(character.value.cls || '')))
const memorized = computed(() => Array.isArray(character.value.memorizedSpells) ? character.value.memorizedSpells : [])
</script>

<template>
  <section class="content-panel" aria-labelledby="spells-title">
    <header class="panel-heading">
      <div>
        <p class="eyebrow">已参悟 {{ known.size }} / {{ spells.length }}</p>
        <h2 id="spells-title">功法典籍</h2>
      </div>
      <div class="spell-slots" aria-label="已铭刻功法">
        <span v-for="slot in 2" :key="slot" :class="{ 'is-filled': memorized[slot - 1] }">
          {{ slot }} · {{ translateLegacyText(String(memorized[slot - 1] || '空')) }}
        </span>
      </div>
    </header>

    <div class="spell-grid">
      <article v-for="spell in spells" :key="spell.id" class="spell-card" :class="{ 'is-locked': !known.has(spell.id) }">
        <div class="spell-card__icon" aria-hidden="true">
          <LockKeyhole v-if="!known.has(spell.id)" :size="21" />
          <Sparkles v-else :size="21" />
        </div>
        <div class="spell-card__body">
          <div class="item-card__topline">
            <span>{{ translateLegacyText(spell.kind) }}</span>
            <span>修为等级 {{ spell.levelReq }} · {{ getLegacyScaledSpellMpCost(spell, Number(character.level)) }} 法力</span>
          </div>
          <h3>{{ translateLegacyText(spell.name) }}</h3>
          <p>{{ translateLegacyText(spell.desc) }}</p>
          <div class="spell-card__meta"><span>调息时间 {{ spell.cooldown }} 秒</span><span>{{ spell.target === 'enemy' ? '敌方目标' : '自身' }}</span></div>
        </div>
        <div v-if="known.has(spell.id)" class="spell-card__actions">
          <button class="icon-button" type="button" title="铭刻到功法位一" aria-label="铭刻到功法位一" @click="characters.memorizeSpell(spell.id, 0)">1</button>
          <button class="icon-button" type="button" title="铭刻到功法位二" aria-label="铭刻到功法位二" @click="characters.memorizeSpell(spell.id, 1)">2</button>
          <button class="button button--secondary" type="button" @click="combat.cast(spell.id)"><Play :size="15" />施展</button>
        </div>
        <span v-else class="locked-note"><BookOpenCheck :size="15" /> 尚未参悟</span>
      </article>
    </div>
  </section>
</template>
