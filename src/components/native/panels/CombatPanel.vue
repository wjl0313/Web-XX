<script setup lang="ts">
import { computed } from 'vue'
import { Activity, Crosshair, FlaskConical, Footprints, Pause, Play, Sparkles, Swords } from 'lucide-vue-next'

import { ZONES, translateLegacyText } from '../../../game-core/data'
import { getLegacySpellById } from '../../../game-core/systems/spells'
import { useAfkStore } from '../../../stores/afk.store'
import { useCharacterStore } from '../../../stores/character.store'
import { useCombatStore } from '../../../stores/combat.store'
import { useSaveStore } from '../../../stores/save.store'
import ResourceBar from '../ResourceBar.vue'

const saves = useSaveStore()
const characters = useCharacterStore()
const combat = useCombatStore()
const afk = useAfkStore()
const character = computed(() => saves.activeCharacter!)
const zone = computed(() => ZONES[Math.max(0, Math.min(ZONES.length - 1, Number(character.value.zone || 0)))])
const memorized = computed(() => (Array.isArray(character.value.memorizedSpells) ? character.value.memorizedSpells : [])
  .map((id) => getLegacySpellById(String(character.value.cls || ''), String(id || '')))
  .filter(Boolean))

async function toggleAfk() {
  if (afk.running) await afk.stop()
  else await afk.start()
}
</script>

<template>
  <div class="panel-layout panel-layout--combat">
    <section class="combat-stage" aria-labelledby="combat-title">
      <header class="panel-heading">
        <div>
          <p class="eyebrow">{{ translateLegacyText(zone.name) }}</p>
          <h2 id="combat-title">遭遇</h2>
        </div>
        <span class="status-indicator" :class="{ 'is-live': combat.inCombat }">
          <Activity :size="15" /> {{ combat.inCombat ? '交战中' : '周遭平静' }}
        </span>
      </header>

      <div class="encounter-field" :class="{ 'has-target': combat.mob }">
        <div class="encounter-field__sigil" aria-hidden="true">
          <Crosshair v-if="combat.mob" :size="58" />
          <span v-else>静</span>
        </div>
        <template v-if="combat.mob">
          <p class="eyebrow">修为等级 {{ combat.mob.level }} · {{ combat.mob.elite ? '精英妖兽' : combat.mob.named ? '命名妖兽' : '普通妖兽' }}</p>
          <h3>{{ translateLegacyText(combat.mob.name) }}</h3>
          <ResourceBar label="妖兽气血" tone="enemy" :value="combat.mob.hp" :maximum="combat.mob.maxHp" />
          <dl class="encounter-stats">
            <div><dt>攻击</dt><dd>{{ combat.mob.atk }}</dd></div>
            <div><dt>防御</dt><dd>{{ combat.mob.def }}</dd></div>
            <div><dt>特性</dt><dd>{{ combat.mob.namedMechanic?.name || '无' }}</dd></div>
          </dl>
        </template>
        <template v-else>
          <p class="eyebrow">{{ zone.mobs.map(translateLegacyText).join(' · ') }}</p>
          <h3>尚未发现目标</h3>
          <p>{{ translateLegacyText(zone.desc) }}</p>
        </template>
      </div>

      <div class="combat-actions" aria-label="战斗操作">
        <button v-if="!combat.mob" class="button button--primary" type="button" @click="combat.spawn">
          <Crosshair :size="18" /> 寻敌
        </button>
        <button v-else class="button button--primary" type="button" :disabled="combat.busy" @click="combat.attack">
          <Swords :size="18" /> 普攻
        </button>
        <button
          v-for="spell in memorized"
          :key="spell!.id"
          class="button button--secondary"
          type="button"
          @click="combat.cast(spell!.id)"
        >
          <Sparkles :size="17" /> {{ translateLegacyText(spell!.name) }}
        </button>
        <button class="icon-button" type="button" title="使用疗伤丹" aria-label="使用疗伤丹" @click="characters.usePotion('hp')">
          <FlaskConical :size="18" />
        </button>
        <button v-if="combat.mob" class="icon-button" type="button" title="脱离战斗" aria-label="脱离战斗" @click="combat.flee">
          <Footprints :size="18" />
        </button>
      </div>

      <div class="afk-strip">
        <div>
          <strong>自动历练</strong>
          <span>{{ afk.running ? '每 1.2 秒执行一次队列' : '离开页面后仍可结算收益' }}</span>
        </div>
        <button class="button" :class="afk.running ? 'button--danger' : 'button--secondary'" type="button" @click="toggleAfk">
          <Pause v-if="afk.running" :size="17" />
          <Play v-else :size="17" />
          {{ afk.running ? '停止挂机' : '开始挂机' }}
        </button>
      </div>
    </section>

    <aside class="combat-log" aria-labelledby="log-title">
      <header class="panel-heading panel-heading--compact">
        <div>
          <p class="eyebrow">最近 80 条</p>
          <h2 id="log-title">斗法记录</h2>
        </div>
      </header>
      <ol v-if="combat.log.length" class="log-list" aria-live="polite">
        <li v-for="entry in combat.log" :key="entry.id" :class="`log-entry--${entry.kind}`">{{ entry.text }}</li>
      </ol>
      <div v-else class="empty-state">
        <Swords :size="28" />
        <p>寻敌后，伤害、战利品和状态效果会记录在这里。</p>
      </div>
    </aside>

    <section v-if="afk.summary" class="afk-summary" aria-label="离线收益">
      <div><span>战斗</span><strong>{{ afk.summary.fights }}</strong></div>
      <div><span>修为</span><strong>{{ afk.summary.xp.toLocaleString('zh-CN') }}</strong></div>
      <div><span>灵石</span><strong>{{ afk.summary.gold.toLocaleString('zh-CN') }}</strong></div>
      <div><span>掉落</span><strong>{{ afk.summary.loot }}</strong></div>
      <button class="icon-button" type="button" title="关闭离线收益" aria-label="关闭离线收益" @click="afk.clearSummary">×</button>
    </section>
  </div>
</template>
