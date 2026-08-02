<script setup lang="ts">
import { computed, ref } from 'vue'
import { Bookmark, Check, Crown, LockKeyhole, MapPin, Search, Target } from 'lucide-vue-next'

import { BOSS_BY_ZONE, ZONES, translateLegacyText } from '../../../game-core/data'
import {
  P2_DUNGEON_MODIFIERS,
  V2_ENEMIES,
  V2_ZONES,
  getV2ZoneSpiritualAbundance,
  type P2DungeonModifierId,
} from '../../../game-core/rulesets'
import { useActivitiesStore } from '../../../stores/activities.store'
import { useActionStore } from '../../../stores/action.store'
import { useAfkStore } from '../../../stores/afk.store'
import { useCharacterStore } from '../../../stores/character.store'
import { useCombatStore } from '../../../stores/combat.store'
import { useSaveStore } from '../../../stores/save.store'
import { useUiStore } from '../../../stores/ui.store'

const saves = useSaveStore()
const characters = useCharacterStore()
const combat = useCombatStore()
const afk = useAfkStore()
const ui = useUiStore()
const activities = useActivitiesStore()
const actions = useActionStore()
const query = ref('')
const dungeonModifier = ref<P2DungeonModifierId>('spirit_pressure')
const dungeonAuto = ref(false)
const character = computed(() => saves.activeCharacter!)
const isV2 = computed(() => characters.ruleset === 'v2')
const currentHuntTarget = computed(() => String((character.value.huntTargets as Record<string, unknown> | undefined)?.[String(character.value.zone || 0)] || ''))
const zones = computed(() => ZONES.map((zone, index) => {
  const v2Zone = V2_ZONES.find((entry) => entry.legacyZoneIndex === index) || null
  const legacyBoss = BOSS_BY_ZONE[index as keyof typeof BOSS_BY_ZONE] || null
  const v2Boss = v2Zone?.bossId ? V2_ENEMIES[v2Zone.bossId] || null : null
  return {
    zone,
    index,
    enabled: !isV2.value || Boolean(v2Zone),
    name: isV2.value && v2Zone ? v2Zone.displayName : translateLegacyText(zone.name),
    description: isV2.value && v2Zone ? v2Zone.description : translateLegacyText(zone.desc),
    minLvl: isV2.value && v2Zone ? v2Zone.minimumLevel : zone.minLvl,
    maxLvl: isV2.value && v2Zone ? v2Zone.maximumLevel : zone.maxLvl,
    mobNames: isV2.value && v2Zone
      ? v2Zone.mobIds.map((id) => V2_ENEMIES[id]?.displayName || id)
      : zone.mobs.map(translateLegacyText),
    eliteName: isV2.value && v2Zone ? V2_ENEMIES[v2Zone.eliteId]?.displayName || v2Zone.eliteId : null,
    boss: isV2.value ? v2Boss : legacyBoss,
    bossName: isV2.value ? v2Boss?.displayName || null : legacyBoss ? translateLegacyText(legacyBoss.name) : null,
    abundance: isV2.value && v2Zone ? getV2ZoneSpiritualAbundance(v2Zone.id, character.value) : null,
  }
}).filter((entry) => {
  const needle = query.value.trim().toLowerCase()
  return !needle || [entry.name, entry.description, ...entry.mobNames, entry.eliteName || '', entry.bossName || ''].join(' ').toLowerCase().includes(needle)
}))
const currentZoneEntry = computed(() => zones.value.find((entry) => entry.index === Number(character.value.zone || 0)) || zones.value[0])
const unlockedCount = computed(() => zones.value.filter((entry) => entry.enabled && Number(character.value.level) >= entry.minLvl).length)

function travel(index: number) {
  if (combat.inCombat || actions.resting) return
  if (characters.setZone(index)) {
    combat.reset()
    void saves.persist()
    ui.toast(`已前往${translateLegacyText(ZONES[index].name)}。`, 'success')
  }
}

function challengeBoss(index: number) {
  if (actions.resting) return
  const entry = zones.value.find((zone) => zone.index === index)
  if (!entry?.enabled || !entry.boss) return
  if (Number(character.value.zone) !== index && !characters.setZone(index)) return
  const boss = combat.spawnBoss()
  ui.openPanel('combat')
  if (!boss) ui.toast('当前无法挑战该区域首领，请查看斗法记录。', 'warning')
}
function enterDungeon() {
  if (activities.enterDungeon(dungeonModifier.value, dungeonAuto.value)) ui.toast('已进入幽竹秘境。', 'success')
  else if (actions.resting) ui.toast('调息中不能进入秘境。', 'warning')
}
function challengeDungeon() {
  const count = activities.challengeDungeon(Boolean(activities.dungeon?.autoDive))
  if (count === null) ui.toast(actions.resting ? '调息中不能挑战秘境。' : '请先进入秘境或结束当前战斗。', 'warning')
  else ui.toast(count > 0 ? `已完成 ${count} 层秘境挑战。` : '本层挑战失败，已退回检查点。', count > 0 ? 'success' : 'warning')
}
</script>

<template>
  <section class="content-panel" aria-labelledby="zones-title">
    <header class="panel-heading">
      <div><p class="eyebrow">已解锁 {{ unlockedCount }} / {{ isV2 ? V2_ZONES.length : ZONES.length }}</p><h2 id="zones-title">历练区域</h2></div>
      <label class="search-control"><Search :size="17" /><span class="sr-only">搜索区域</span><input v-model="query" type="search" placeholder="搜索区域或妖兽" /></label>
    </header>

    <section class="zone-controls" aria-label="当前区域设置">
      <div><MapPin :size="17" /><span>当前区域</span><strong>{{ currentZoneEntry?.name }}</strong></div>
      <label><span><Target :size="15" />猎杀目标</span><select :value="isV2 ? '' : currentHuntTarget" :disabled="isV2 || combat.inCombat" @change="afk.setHuntTarget(($event.target as HTMLSelectElement).value)"><option value="">随机遭遇</option><option v-for="mob in (isV2 ? [] : ZONES[Number(character.zone || 0)].mobs)" :key="mob" :value="mob">{{ translateLegacyText(mob) }}</option></select></label>
      <button class="button button--secondary" type="button" :disabled="isV2" @click="afk.bindZone(Number(character.zone || 0))"><Bookmark :size="16" />{{ isV2 ? '使用固定历练区域' : Number(character.bindZone || 0) === Number(character.zone || 0) ? '已绑定此区域' : '绑定为归返地' }}</button>
    </section>

    <div class="zone-list">
      <article v-for="entry in zones" :key="entry.index" class="zone-row" :class="{ 'is-current': Number(character.zone) === entry.index, 'is-locked': !entry.enabled || Number(character.level) < entry.minLvl }">
        <div class="zone-row__marker" aria-hidden="true"><Check v-if="Number(character.zone) === entry.index" :size="18" /><LockKeyhole v-else-if="!entry.enabled || Number(character.level) < entry.minLvl" :size="18" /><MapPin v-else :size="18" /></div>
        <div class="zone-row__body">
          <div><h3>{{ entry.name }}</h3><span>{{ entry.enabled ? `修为等级 ${entry.minLvl}–${entry.maxLvl}` : '尚未开放' }}</span></div>
          <p>{{ entry.enabled ? entry.description : '该历练区域尚未开放。' }}</p>
          <small v-if="entry.enabled">妖兽：{{ entry.mobNames.join(' · ') }}<template v-if="entry.eliteName"> · 精英：{{ entry.eliteName }}</template></small>
          <div class="zone-yields"><template v-if="isV2"><span>单人斗法</span><span>装备、功法与灵草掉落</span><span v-if="entry.abundance">灵力充沛 ×{{ entry.abundance }}</span></template><template v-else><span>修为倍率 ×{{ entry.zone.xpMult }}</span><span>灵石倍率 ×{{ entry.zone.goldMult }}</span></template><span v-if="entry.boss"><Crown :size="13" />首领：{{ entry.bossName }}</span></div>
        </div>
        <div class="zone-row__actions">
          <button class="button button--secondary" type="button" :disabled="!entry.enabled || Number(character.level) < entry.minLvl || combat.inCombat || actions.resting || Number(character.zone) === entry.index" @click="travel(entry.index)">{{ Number(character.zone) === entry.index ? '当前区域' : !entry.enabled ? '尚未开放' : Number(character.level) < entry.minLvl ? '尚未解锁' : '前往' }}</button>
          <button v-if="entry.boss" class="button button--quiet" type="button" :disabled="Number(character.level) < entry.minLvl || combat.inCombat || actions.resting" @click="challengeBoss(entry.index)"><Crown :size="15" />挑战首领</button>
        </div>
      </article>
    </div>

    <section v-if="isV2" class="legacy-activity-summary" aria-labelledby="dungeon-title">
      <header><div><strong id="dungeon-title">幽竹秘境</strong><small>单人二十层 · 每五层首领 · 死亡退回检查点</small></div><span>最高 {{ activities.dungeon?.best || 0 }} 层</span></header>
      <dl><div><dt>当前层</dt><dd>{{ activities.dungeon?.floor || 1 }}</dd></div><div><dt>检查点</dt><dd>{{ activities.dungeon?.checkpoint || 1 }}</dd></div><div><dt>状态</dt><dd>{{ activities.dungeon?.active ? '探索中' : '未进入' }}</dd></div></dl>
      <template v-if="!activities.dungeon?.active">
        <label><span>难度词缀</span><select v-model="dungeonModifier"><option v-for="modifier in P2_DUNGEON_MODIFIERS" :key="modifier.id" :value="modifier.id">{{ modifier.name }}</option></select></label>
        <label class="legacy-check"><input v-model="dungeonAuto" type="checkbox" /><span>自动深入</span></label>
        <button type="button" :disabled="actions.resting" @click="enterDungeon">进入秘境</button>
      </template>
      <button v-else type="button" :disabled="actions.resting" @click="challengeDungeon">{{ activities.dungeon?.autoDive ? '自动深入' : '挑战当前层' }}</button>
    </section>
  </section>
</template>
