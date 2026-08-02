<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { BookOpenCheck, Coins, LockKeyhole, Play, Sparkles, X } from 'lucide-vue-next'

import {
  getLegacyClassSpellbook,
  getLegacyMaxMemorizedSpellSlots,
  getLegacyScaledSpellMpCost,
  getLegacySpellFactionRequirement,
} from '../../../game-core/systems/spells'
import { translateLegacyText } from '../../../game-core/data'
import {
  CAVE_TRAINING_DURATIONS,
  ELEMENT_LABELS,
  V2_TECHNIQUES,
  canActorUseTechnique,
  getV2CharacterRoot,
  getV2LearnableTechniqueIds,
  getTechniqueMasteryName,
  getTechniqueMasteryPoints,
  type TechniqueDefinition,
} from '../../../game-core/rulesets'
import { getP2RootElementLabels } from '../../../game-core/domain/progression'
import { useActivitiesStore } from '../../../stores/activities.store'
import { useActionStore } from '../../../stores/action.store'
import { useCharacterStore } from '../../../stores/character.store'
import { useCombatStore } from '../../../stores/combat.store'
import { useSaveStore } from '../../../stores/save.store'
import { useUiStore } from '../../../stores/ui.store'

const saves = useSaveStore()
const characters = useCharacterStore()
const combat = useCombatStore()
const ui = useUiStore()
const activities = useActivitiesStore()
const actions = useActionStore()
const character = computed(() => saves.activeCharacter!)
const known = computed(() => new Set(Array.isArray(character.value.knownSpells) ? character.value.knownSpells : []))
const spells = computed(() => getLegacyClassSpellbook(String(character.value.cls || '')))
const slotCount = computed(() => getLegacyMaxMemorizedSpellSlots(Number((character.value.aa as Record<string, unknown> | undefined)?.extraSpellSlots || 0)))
const memorized = computed(() => Array.from({ length: slotCount.value }, (_, index) => Array.isArray(character.value.memorizedSpells) ? character.value.memorizedSpells[index] || null : null))
const autoSlots = computed(() => Array.isArray(character.value.autoSkillSlots) ? character.value.autoSkillSlots : [])
const v2Root = computed(() => getV2CharacterRoot(character.value))
const v2Techniques = computed(() => characters.v2KnownTechniques)
const v2LearnableCount = computed(() => getV2LearnableTechniqueIds(v2Root.value).length)
const v2Loadout = computed(() => characters.v2TechniqueLoadout.slots)
const now = ref(Date.now())
const caveTechniqueId = ref('')
const caveDuration = ref(15)
let clock: ReturnType<typeof setInterval> | null = null

function spellById(id: unknown) { return spells.value.find((spell) => spell.id === id) || null }
function cooldown(spellId: string): number {
  const readyAt = Number((character.value.spellCooldowns as Record<string, unknown> | undefined)?.[spellId] || 0)
  return Math.max(0, Math.ceil((readyAt - now.value) / 1000))
}
function purchaseReason(spell: (typeof spells.value)[number]): string {
  if (known.value.has(spell.id)) return '已参悟'
  if (spell.epic) return '需完成传承试炼'
  if (Number(character.value.level || 1) < Number(spell.levelReq || 1)) return `需要修为等级 ${spell.levelReq}`
  const faction = getLegacySpellFactionRequirement(spell)
  if (Number(character.value.faction || 0) < faction) return `需要声望 ${faction}`
  if (Number(character.value.gold || 0) < Number(spell.cost || 0)) return '灵石不足'
  return ''
}
function purchase(spellId: string) {
  const cost = characters.purchaseSpell(spellId)
  if (cost === null) {
    ui.toast('当前条件不足，无法参悟该功法。', 'warning')
    return
  }
  ui.toast(`功法参悟成功，消耗 ${cost} 枚灵石。`, 'success')
}
function cast(spellId: string) {
  if (characters.ruleset === 'v2' && actions.resting) {
    const recovered = actions.useHealingTechnique(spellId)
    ui.toast(recovered > 0 ? `治疗功法恢复 ${recovered} 点气血。` : '调息中只能施展已拥有且法力足够的治疗功法。', recovered > 0 ? 'success' : 'warning')
    return
  }
  if (!combat.cast(spellId)) return
  now.value = Date.now()
}
function v2Cooldown(techniqueId: string): number {
  return Number(combat.v2State?.cooldowns[`player:${techniqueId}`] || 0)
}
function v2Affinity(technique: TechniqueDefinition): number {
  return Number(v2Root.value.affinities[technique.element] || 0)
}
function v2EffectLabel(effectType: TechniqueDefinition['effectType']): string {
  return {
    direct_damage: '直接伤害', healing: '治疗', shield: '护盾', poison: '中毒',
    attack_down: '降低攻击', agility_down: '降低身法', mana_restore: '恢复法力',
  }[effectType]
}
function v2ScalingLabel(technique: TechniqueDefinition): string {
  const labels: Record<string, string> = { str: '体魄', dex: '身法', con: '根骨', int: '悟性', wis: '神识', cha: '机缘' }
  const entries = Object.entries(technique.abilityScales || {})
    .filter(([, scale]) => Number(scale) !== 0)
    .map(([ability, scale]) => `${labels[ability] || ability}×${Number(scale)}`)
  return entries.length ? entries.join(' · ') : '无六维缩放'
}
function mastery(techniqueId: string): string {
  const points = getTechniqueMasteryPoints(character.value, techniqueId)
  return `${getTechniqueMasteryName(points)} · ${points} 熟练度`
}
function startCave() {
  const techniqueId = caveTechniqueId.value || v2Techniques.value[0]?.id || ''
  if (activities.startCave(techniqueId, caveDuration.value)) ui.toast('洞府参悟已经开始。', 'success')
  else ui.toast(actions.resting ? '调息中不能开始洞府参悟。' : '当前已有参悟任务，或尚未选择已获得功法。', 'warning')
}
function claimCave() {
  const result = activities.claimCave()
  if (!result) ui.toast('参悟尚未完成。', 'warning')
  else ui.toast(`参悟完成：${result.split(':')[1]} 点熟练度，当前${result.split(':')[2]}。`, 'success')
}
function v2Status(technique: TechniqueDefinition): string {
  if (actions.resting) {
    if (technique.effectType !== 'healing') return '调息中不可用'
    return Number(character.value.mp || 0) >= technique.manaCost ? '调息中可以施展' : '法力不足'
  }
  const slot = v2Loadout.value.indexOf(technique.id)
  if (slot < 0) return '未佩戴'
  if (!combat.inCombat) return '已佩戴，战斗外可调整'
  if (!combat.waitingForPlayer) return '等待行动'
  const actor = combat.v2PlayerActor
  const state = combat.v2State
  if (!actor || !state) return '当前不可用'
  if (v2Cooldown(technique.id) > 0) return `冷却 ${v2Cooldown(technique.id)} 回合`
  if (actor.mp < technique.manaCost) return '法力不足'
  return canActorUseTechnique(state, actor, technique) ? '可以施展' : '当前不可用'
}
async function setV2Slot(techniqueId: string, slot: number) {
  if (combat.inCombat || actions.resting) {
    ui.toast(actions.resting ? '调息中不能更换出战功法。' : '战斗中不能更换出战功法。', 'warning')
    return
  }
  const occupiedAt = v2Loadout.value.indexOf(techniqueId)
  if (occupiedAt >= 0 && occupiedAt !== slot) {
    ui.toast(`该功法已经佩戴在功法位 ${occupiedAt + 1}。`, 'warning')
    return
  }
  const currentId = v2Loadout.value[slot]
  if (currentId === techniqueId) return
  if (currentId) {
    const current = V2_TECHNIQUES[currentId]
    const next = V2_TECHNIQUES[techniqueId]
    const accepted = await ui.confirm(`将功法位 ${slot + 1} 的“${current?.displayName || currentId}”替换为“${next?.displayName || techniqueId}”？`, {
      title: '更换出战功法', confirmLabel: '确认更换',
    })
    if (!accepted) return
  }
  if (characters.memorizeSpell(techniqueId, slot, combat.inCombat)) {
    void saves.persist()
    ui.toast(`功法位 ${slot + 1} 已更新。`, 'success')
  }
}
async function clearV2Slot(slot: number) {
  if (combat.inCombat || actions.resting || !v2Loadout.value[slot]) return
  const technique = V2_TECHNIQUES[v2Loadout.value[slot]!]
  const accepted = await ui.confirm(`卸下功法位 ${slot + 1} 的“${technique?.displayName || '功法'}”？`, {
    title: '卸下出战功法', confirmLabel: '确认卸下',
  })
  if (!accepted) return
  if (characters.forgetSpell(slot, combat.inCombat)) void saves.persist()
}

onMounted(() => { clock = setInterval(() => { now.value = Date.now() }, 500) })
onBeforeUnmount(() => { if (clock) clearInterval(clock) })
</script>

<template>
  <div class="spells-layout">
    <template v-if="characters.ruleset === 'v2'">
      <section class="content-panel" aria-labelledby="v2-spells-title">
        <header class="panel-heading"><div><p class="eyebrow">已参悟 {{ v2Techniques.length }} / 可学 {{ v2LearnableCount }}</p><h2 id="v2-spells-title">功法典籍</h2><small>{{ v2Root.displayName }}可参悟{{ getP2RootElementLabels(v2Root).join('、') }}及无属性功法</small></div></header>
        <div class="spell-grid">
          <article v-for="technique in v2Techniques" :key="technique.id" class="spell-card">
            <div class="spell-card__icon" aria-hidden="true"><Sparkles :size="21" /></div>
            <div class="spell-card__body">
              <div class="item-card__topline"><span>{{ ELEMENT_LABELS[technique.element] }}属性</span><span>{{ technique.manaCost }} 法力 · 冷却 {{ technique.cooldown }} 回合</span></div>
              <h3>{{ technique.displayName }}</h3><p>{{ technique.description }}</p>
              <div class="spell-card__meta">
                <span>{{ v2EffectLabel(technique.effectType) }}</span>
                <span>{{ technique.target === 'enemy' ? '敌方目标' : '自身' }}</span>
                <span>灵根亲和 {{ v2Affinity(technique) }}</span>
                <span v-if="technique.effectType === 'healing'">{{ v2ScalingLabel(technique) }}</span>
                <span>{{ mastery(technique.id) }}</span>
                <span :class="{ 'cooldown-note': v2Status(technique) !== '可以施展' }">{{ v2Status(technique) }}</span>
              </div>
            </div>
            <div class="spell-card__actions">
              <button v-for="slot in 3" :key="slot" class="icon-button" type="button" :disabled="combat.inCombat || actions.resting" :title="`配置到功法位 ${slot}`" @click="setV2Slot(technique.id, slot - 1)">{{ v2Loadout[slot - 1] === technique.id ? `位${slot}` : slot }}</button>
              <button class="button button--secondary" type="button" :disabled="actions.resting ? technique.effectType !== 'healing' || Number(character.mp || 0) < technique.manaCost : !combat.inCombat || v2Status(technique) !== '可以施展'" @click="cast(technique.id)"><Play :size="15" />施展</button>
            </div>
          </article>
        </div>
      </section>

      <aside class="spell-memory-rail" aria-labelledby="v2-memory-title">
        <header><p class="eyebrow">出战配置</p><h2 id="v2-memory-title">三功法位</h2><span>普通攻击、丹药和遁走不占功法位；战斗中锁定配置。</span></header>
        <ol class="memory-slot-list">
          <li v-for="(techniqueId, index) in v2Loadout" :key="index" :class="{ 'is-empty': !techniqueId }">
            <span class="memory-slot-list__index">{{ index + 1 }}</span>
            <div>
              <strong>{{ techniqueId ? V2_TECHNIQUES[techniqueId]?.displayName || techniqueId : '空功法位' }}</strong>
              <small v-if="techniqueId">{{ ELEMENT_LABELS[V2_TECHNIQUES[techniqueId]?.element || 'neutral'] }} · {{ v2Status(V2_TECHNIQUES[techniqueId]) }}</small>
              <small v-else>从左侧典籍选择一门功法</small>
            </div>
            <button v-if="techniqueId" class="icon-button" type="button" title="卸下功法" aria-label="卸下功法" :disabled="combat.inCombat || actions.resting" @click="clearV2Slot(index)"><X :size="15" /></button>
          </li>
        </ol>
        <section class="legacy-activity-summary" aria-labelledby="cave-title">
          <header><strong id="cave-title">洞府参悟</strong><span>单功法队列</span></header>
          <template v-if="activities.caveTask">
            <p>正在参悟：{{ V2_TECHNIQUES[activities.caveTask.techniqueId]?.displayName }}</p>
            <p>完成时间：{{ new Date(activities.caveTask.completesAt).toLocaleTimeString('zh-CN') }}</p>
            <button type="button" :disabled="actions.resting" @click="claimCave">领取熟练度</button>
          </template>
          <template v-else>
            <label><span>已获得功法</span><select v-model="caveTechniqueId"><option v-for="technique in v2Techniques" :key="technique.id" :value="technique.id">{{ technique.displayName }} · {{ ELEMENT_LABELS[technique.element] }}</option></select></label>
            <label><span>参悟时长</span><select v-model.number="caveDuration"><option v-for="minutes in CAVE_TRAINING_DURATIONS" :key="minutes" :value="minutes">{{ minutes < 60 ? `${minutes} 分钟` : `${minutes / 60} 小时` }}</option></select></label>
            <button type="button" :disabled="actions.resting" @click="startCave">开始参悟</button>
          </template>
        </section>
      </aside>
    </template>

    <template v-else>
    <section class="content-panel" aria-labelledby="spells-title">
      <header class="panel-heading"><div><p class="eyebrow">已参悟 {{ known.size }} / {{ spells.length }}</p><h2 id="spells-title">功法典籍</h2></div></header>
      <div class="spell-grid">
        <article v-for="spell in spells" :key="spell.id" class="spell-card" :class="{ 'is-locked': !known.has(spell.id) }">
          <div class="spell-card__icon" aria-hidden="true"><LockKeyhole v-if="!known.has(spell.id)" :size="21" /><Sparkles v-else :size="21" /></div>
          <div class="spell-card__body">
            <div class="item-card__topline"><span>{{ translateLegacyText(spell.kind) }}</span><span>修为等级 {{ spell.levelReq }} · {{ getLegacyScaledSpellMpCost(spell, Number(character.level)) }} 法力</span></div>
            <h3>{{ translateLegacyText(spell.name) }}</h3><p>{{ translateLegacyText(spell.desc) }}</p>
            <div class="spell-card__meta"><span>调息 {{ spell.cooldown }} 秒</span><span>{{ spell.target === 'enemy' ? '敌方目标' : '自身' }}</span><span v-if="cooldown(spell.id)" class="cooldown-note">剩余 {{ cooldown(spell.id) }} 秒</span></div>
          </div>
          <div v-if="known.has(spell.id)" class="spell-card__actions">
            <button v-for="slot in slotCount" :key="slot" class="icon-button" type="button" :title="`铭刻到功法位 ${slot}`" :aria-label="`铭刻到功法位 ${slot}`" @click="characters.memorizeSpell(spell.id, slot - 1)">{{ slot }}</button>
            <button class="button button--secondary" type="button" :disabled="cooldown(spell.id) > 0" @click="cast(spell.id)"><Play :size="15" />施展</button>
          </div>
          <div v-else class="spell-card__actions">
            <span class="locked-note"><BookOpenCheck :size="15" />{{ purchaseReason(spell) || `${Number(spell.cost || 0)} 灵石` }}</span>
            <button v-if="!purchaseReason(spell)" class="button button--secondary" type="button" @click="purchase(spell.id)"><Coins :size="15" />参悟</button>
          </div>
        </article>
      </div>
    </section>

    <aside class="spell-memory-rail" aria-labelledby="memory-title">
      <header><p class="eyebrow">快捷栏</p><h2 id="memory-title">已铭刻功法</h2><span>当前开放 {{ slotCount }} 个功法位。</span></header>
      <ol class="memory-slot-list">
        <li v-for="(spellId, index) in memorized" :key="index" :class="{ 'is-empty': !spellId }">
          <span class="memory-slot-list__index">{{ index + 1 }}</span>
          <div><strong>{{ spellId ? translateLegacyText(spellById(spellId)?.name || String(spellId)) : '空功法位' }}</strong><small v-if="spellId">{{ cooldown(String(spellId)) ? `调息剩余 ${cooldown(String(spellId))} 秒` : '可以施展' }}</small><small v-else>从左侧典籍中选择铭刻</small></div>
          <label v-if="spellId" class="memory-auto"><input type="checkbox" :checked="autoSlots[index] !== false" @change="characters.toggleSpellAutoCast(index, ($event.target as HTMLInputElement).checked)" /><span>自动</span></label>
          <button v-if="spellId" class="icon-button" type="button" title="取消铭刻" aria-label="取消铭刻" @click="characters.forgetSpell(index)"><X :size="15" /></button>
        </li>
      </ol>
    </aside>
    </template>
  </div>
</template>
