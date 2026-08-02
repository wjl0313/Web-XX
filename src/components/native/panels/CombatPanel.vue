<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { ZONES, translateLegacyText } from '../../../game-core/data'
import {
  ELEMENT_LABELS,
  V2_TECHNIQUES,
  canActorUseTechnique,
  type BattleEvent,
  type Element,
  type TechniqueDefinition,
} from '../../../game-core/rulesets'
import { getLegacySpellById } from '../../../game-core/systems/spells'
import { useAfkStore } from '../../../stores/afk.store'
import { useActionStore } from '../../../stores/action.store'
import { useCharacterStore } from '../../../stores/character.store'
import { useCombatStore } from '../../../stores/combat.store'
import { useSaveStore } from '../../../stores/save.store'
import LegacyCultivatorAvatar from '../LegacyCultivatorAvatar.vue'

const saves = useSaveStore()
const characters = useCharacterStore()
const combat = useCombatStore()
const afk = useAfkStore()
const actions = useActionStore()
const character = computed(() => saves.activeCharacter!)
const zoneIndex = computed(() => Math.max(0, Math.min(ZONES.length - 1, Number(character.value.zone || 0))))
const zone = computed(() => ZONES[zoneIndex.value])
const memorized = computed(() => (Array.isArray(character.value.memorizedSpells) ? character.value.memorizedSpells : [])
  .map((id) => getLegacySpellById(String(character.value.cls || ''), String(id || '')))
  .filter(Boolean))
const v2Techniques = computed(() => characters.v2TechniqueLoadout.slots
  .map((id) => id ? V2_TECHNIQUES[id] : null))
const v2Player = computed(() => combat.v2PlayerActor)
const v2Pills = computed(() => v2Player.value?.pills || {})
const v2Enemy = computed(() => combat.v2EnemyActor)
const v2ActiveActor = computed(() => {
  const activeId = combat.v2State?.activeActorId
  return activeId ? combat.v2State?.actors[activeId] || null : null
})
const v2LastDamageEvent = computed(() => [...(combat.v2State?.events || combat.lastCompletedV2State?.events || [])]
  .reverse()
  .find((event) => event.type === 'DamageDealt' && event.breakdown))
const playerAnimation = ref('')
const enemyAnimation = ref('')
const battlePopups = ref<Array<{ id: number; actorId: string; text: string; kind: 'damage' | 'critical' | 'heal' }>>([])
const displayedMob = ref<Record<string, any> | null>(combat.mob ? { ...combat.mob } : null)
const combatLogElement = ref<HTMLElement | null>(null)
const displayedMobHpPercent = computed(() => displayedMob.value
  ? Math.max(0, Math.min(100, Number(displayedMob.value.hp || 0) / Math.max(1, Number(displayedMob.value.maxHp || 1)) * 100))
  : 0)
const v2PlayerEffects = computed(() => (combat.v2State?.effects || []).filter((effect) => effect.targetActorId === 'player'))
const v2EnemyEffects = computed(() => (combat.v2State?.effects || []).filter((effect) => effect.targetActorId === 'enemy'))
let animationTimers: number[] = []
let lastAnimatedLogId = combat.log[combat.log.length - 1]?.id || 0
let popupId = 0

function schedule(callback: () => void, delay: number) {
  animationTimers.push(globalThis.setTimeout(callback, delay))
}
function animatePlayer(kind: 'attack' | 'heal') {
  playerAnimation.value = kind === 'attack' ? 'is-attacking' : 'is-healing'
  schedule(() => { playerAnimation.value = '' }, 540)
}
function animateEnemy(kind: 'hit' | 'enter') {
  enemyAnimation.value = kind === 'hit' ? 'is-hit' : 'is-entering'
  schedule(() => { enemyAnimation.value = '' }, 420)
}
function pulseActor(actorId: string | undefined, animation: string, duration = 420) {
  if (!actorId) return
  const target = actorId === 'player' ? playerAnimation : enemyAnimation
  target.value = ''
  schedule(() => {
    target.value = animation
    schedule(() => {
      if (target.value === animation) target.value = ''
    }, duration)
  }, 16)
}
function showBattlePopup(actorId: string | undefined, text: string, kind: 'damage' | 'critical' | 'heal') {
  if (actorId !== 'player' && actorId !== 'enemy') return
  const popup = { id: ++popupId, actorId, text, kind }
  battlePopups.value.push(popup)
  schedule(() => {
    battlePopups.value = battlePopups.value.filter((entry) => entry.id !== popup.id)
  }, 760)
}
function animateBattleEvents(entries: typeof combat.log) {
  let offset = 0
  for (const entry of entries) {
    const event = entry.event as BattleEvent
    if (!event || typeof event.type !== 'string') continue
    if (event.type === 'ActionDeclared') {
      const animation = event.command?.type === 'use_pill'
        ? 'is-healing'
        : event.command?.type === 'use_technique'
          ? 'is-casting'
          : 'is-attacking'
      schedule(() => pulseActor(event.actorId, animation, 540), offset)
      offset += 220
    } else if (event.type === 'DamageDealt') {
      schedule(() => {
        pulseActor(event.targetId, 'is-hit', 360)
        const critical = Number(event.breakdown?.criticalMultiplier || 1) > 1
        showBattlePopup(event.targetId, `${critical ? '会心 ' : '-'}${Number(event.amount || 0)}`, critical ? 'critical' : 'damage')
      }, offset)
      offset += 300
    } else if (event.type === 'HealingApplied' || (event.type === 'ResourceChanged' && Number(event.amount || 0) > 0)) {
      schedule(() => {
        const targetId = event.targetId || event.actorId
        pulseActor(targetId, 'is-healing', 460)
        showBattlePopup(targetId, `+${Number(event.amount || 0)}`, 'heal')
      }, offset)
      offset += 300
    } else if (event.type === 'UnitDefeated') {
      schedule(() => pulseActor(event.targetId, 'is-defeated', 520), offset)
      offset += 520
    }
  }
}
async function scrollCombatLogToBottom() {
  await nextTick()
  const element = combatLogElement.value
  if (element) element.scrollTop = element.scrollHeight
}
function spawn() {
  const result = combat.spawn()
  if (result) animateEnemy('enter')
}
function attack() {
  if (combat.isV2 && !combat.waitingForPlayer) return
  if (!combat.isV2) {
    animatePlayer('attack')
    schedule(() => animateEnemy('hit'), 140)
  }
  combat.attack()
}
function cast(spellId: string, kind: string) {
  if (combat.isV2 && !combat.waitingForPlayer) return
  if (!combat.isV2) {
    animatePlayer(kind === 'heal' || kind === 'mana' ? 'heal' : 'attack')
    if (kind !== 'heal' && kind !== 'mana') schedule(() => animateEnemy('hit'), 140)
  }
  combat.cast(spellId)
}
function useV2Pill(pillId: '回春丹' | '回灵丹') {
  combat.usePill(pillId)
}
function v2Cooldown(techniqueId: string): number {
  return Number(combat.v2State?.cooldowns[`player:${techniqueId}`] || 0)
}
function v2TechniqueReady(technique: TechniqueDefinition): boolean {
  const state = combat.v2State
  const actor = combat.v2PlayerActor
  return Boolean(state && actor && combat.waitingForPlayer && canActorUseTechnique(state, actor, technique))
}
function effectLabel(effectType: TechniqueDefinition['effectType']): string {
  return {
    direct_damage: '直接伤害', healing: '治疗', shield: '护盾', poison: '中毒',
    attack_down: '降低攻击', agility_down: '降低身法', mana_restore: '恢复法力',
  }[effectType]
}
function resistanceSummary(resistances: Partial<Record<Element, number>> | undefined): string {
  if (!resistances) return '无额外抗性'
  const entries = (Object.entries(resistances) as Array<[Element, number]>)
    .filter(([element, value]) => element !== 'neutral' && Number(value) !== 0)
    .map(([element, value]) => `${ELEMENT_LABELS[element]} ${Number(value) > 0 ? '+' : ''}${value}`)
  return entries.length ? entries.join(' · ') : '无额外抗性'
}
function autoBattle() {
  if (!combat.inCombat) combat.spawn()
  if (combat.inCombat) combat.autoResolve()
}
function heal() {
  if (characters.usePotion('hp')) animatePlayer('heal')
}
function rest() {
  if (characters.rest('mp')) animatePlayer('heal')
}
function effectLabelShort(type: string): string {
  return ({
    poison: '中毒', regeneration: '恢复', stun: '眩晕', freeze: '冻结',
    attack_down: '攻降', agility_down: '身法降', attack_up: '攻升', agility_up: '身法升',
  } as Record<string, string>)[type] || type
}
function mobGlyph(mob: Record<string, any> | null): string {
  if (!mob) return '👾'
  const name = String(mob.baseName || mob.name || '').toLowerCase()
  const pairs: Array<[string, string]> = [
    ['dragon', '🐉'], ['drake', '🐉'], ['wyrm', '🐉'], ['serpent', '🐍'], ['snake', '🐍'], ['naga', '🐍'],
    ['skeleton', '💀'], ['lich', '💀'], ['undead', '💀'], ['bone', '💀'], ['wraith', '👻'], ['ghost', '👻'], ['spirit', '👻'], ['shade', '👻'],
    ['demon', '👹'], ['devil', '👹'], ['fiend', '👹'], ['imp', '👹'], ['ogre', '👹'], ['troll', '👹'],
    ['goblin', '👺'], ['kobold', '👺'], ['gnoll', '👺'], ['spider', '🕷️'], ['scorpion', '🦂'], ['beetle', '🪲'],
    ['bug', '🐛'], ['worm', '🪱'], ['wolf', '🐺'], ['hound', '🐺'], ['jackal', '🐺'], ['bear', '🐻'], ['boar', '🐗'], ['rat', '🐀'], ['bat', '🦇'],
    ['slime', '🟢'], ['ooze', '🟢'], ['blob', '🟢'], ['golem', '🗿'], ['sentinel', '🗿'], ['construct', '🗿'], ['statue', '🗿'],
    ['knight', '⚔️'], ['captain', '⚔️'], ['herald', '🛡️'], ['guard', '🛡️'], ['soldier', '⚔️'],
    ['mage', '🔮'], ['witch', '🔮'], ['warlock', '🔮'], ['caster', '🔮'], ['totem', '🪬'],
    ['elemental', '🔥'], ['flame', '🔥'], ['fire', '🔥'], ['frost', '❄️'], ['ice', '❄️'],
    ['fish', '🐟'], ['crab', '🦀'], ['shark', '🦈'], ['bird', '🦅'], ['harpy', '🦅'], ['raven', '🐦‍⬛'],
    ['plant', '🌿'], ['treant', '🌳'], ['mushroom', '🍄'],
  ]
  for (const [needle, glyph] of pairs) if (name.includes(needle)) return glyph
  return mob.named ? '👹' : mob.elite ? '👺' : '👾'
}
async function toggleAfk() {
  if (afk.running) await afk.stop()
  else await afk.start()
}
watch(() => combat.mob, (next) => {
  if (next) {
    const entering = !displayedMob.value || displayedMob.value.baseName !== next.baseName
    displayedMob.value = { ...next }
    if (entering) animateEnemy('enter')
    return
  }
  if (!displayedMob.value) return
  const completedEnemy = combat.v2EnemyActor
  if (completedEnemy) displayedMob.value = { ...displayedMob.value, hp: completedEnemy.hp, maxHp: completedEnemy.maxHp }
  enemyAnimation.value = 'is-defeated'
  schedule(() => {
    displayedMob.value = null
    enemyAnimation.value = ''
  }, 520)
}, { immediate: true })

watch(() => combat.log.map((entry) => entry.id), () => {
  const entries = combat.log.filter((entry) => entry.id > lastAnimatedLogId)
  if (entries.length) {
    lastAnimatedLogId = entries[entries.length - 1].id
    if (combat.isV2) animateBattleEvents(entries)
  }
  void scrollCombatLogToBottom()
}, { flush: 'post' })

onMounted(() => { void scrollCombatLogToBottom() })
onBeforeUnmount(() => animationTimers.forEach(clearTimeout))
</script>

<template>
  <section class="legacy-combat-panel" aria-labelledby="combat-title">
    <h2 id="combat-title" class="sr-only">斗法场景</h2>
    <span class="sr-only">{{ combat.inCombat ? '交战中' : '周遭平静' }}</span>
    <div class="legacy-battle-stage" aria-label="战斗场景">
      <div class="legacy-battle-sky" aria-hidden="true" />
      <div class="legacy-battle-ground" aria-hidden="true" />
      <span
        v-for="popup in battlePopups"
        :key="popup.id"
        class="legacy-battle-popup"
        :class="[`is-${popup.kind}`, `is-${popup.actorId}`]"
        aria-hidden="true"
      >{{ popup.text }}</span>
      <div v-if="combat.isV2 && combat.inCombat" class="legacy-battle-turn" aria-live="polite">第 {{ combat.v2State?.round || 1 }} 回合 · {{ v2ActiveActor?.name || '结算中' }}行动</div>
      <div v-else-if="combat.isV2 && actions.resting" class="legacy-battle-turn" aria-live="polite">调息中 · 气血 {{ character.hp }}/{{ character.maxHp }} · 每秒 +{{ actions.recoveryPerSecond }} · 约 {{ actions.remainingSeconds }} 秒</div>

      <div class="legacy-battle-enemies">
        <div v-if="displayedMob" class="legacy-battle-unit" :class="[enemyAnimation, { 'is-active': v2ActiveActor?.id === 'enemy' }]">
          <div class="legacy-battle-sprite legacy-battle-sprite--enemy">
            <span aria-hidden="true">{{ mobGlyph(displayedMob) }}</span>
          </div>
          <div v-if="v2EnemyEffects.length" class="legacy-battle-effects"><span v-for="effect in v2EnemyEffects" :key="effect.id">{{ effectLabelShort(effect.type) }} {{ effect.remainingRounds }}</span></div>
          <strong>{{ translateLegacyText(String(displayedMob.name || '妖兽')) }}</strong>
          <i class="legacy-mini-hp"><b :style="{ width: `${displayedMobHpPercent}%` }" /></i>
        </div>
        <p v-else>尚未遭遇敌人。请开启自动历练或主动寻敌。</p>
      </div>

      <div class="legacy-battle-party">
        <div class="legacy-battle-unit" :class="[playerAnimation, { 'is-active': v2ActiveActor?.id === 'player' }]">
          <div class="legacy-battle-sprite legacy-battle-sprite--player"><LegacyCultivatorAvatar :appearance="character.appearance as Record<string, unknown>" :label="`${character.name}的战斗形象`" /></div>
          <div v-if="v2PlayerEffects.length" class="legacy-battle-effects"><span v-for="effect in v2PlayerEffects" :key="effect.id">{{ effectLabelShort(effect.type) }} {{ effect.remainingRounds }}</span></div>
          <strong>{{ character.name }}</strong>
          <i class="legacy-mini-hp"><b :style="{ width: `${Math.max(0, Math.min(100, Number(character.hp) / Math.max(1, Number(character.maxHp)) * 100))}%` }" /></i>
        </div>
      </div>
    </div>

    <section class="legacy-mob-area">
      <template v-if="displayedMob">
        <div class="legacy-mob-heading"><div><strong>{{ translateLegacyText(String(displayedMob.name || '妖兽')) }}</strong><small>修为等级 {{ displayedMob.level }} · {{ displayedMob.boss ? '区域首领' : displayedMob.named ? '命名强敌' : displayedMob.elite ? '精英妖兽' : '普通妖兽' }}</small></div><span>{{ displayedMob.hp }}/{{ displayedMob.maxHp }} 气血</span></div>
        <i class="legacy-wide-hp"><b :style="{ width: `${displayedMobHpPercent}%` }" /></i>
        <div class="legacy-mob-stats"><span>攻击 {{ displayedMob.atk }}</span><span>防御 {{ displayedMob.def }}</span><span>特性 {{ displayedMob.namedMechanic ? translateLegacyText(String(displayedMob.namedMechanic.name || '')) : '无' }}</span></div>
        <div v-if="combat.isV2" class="legacy-mob-stats">
          <span>第 {{ combat.v2State?.round || 0 }} 回合</span>
          <span>当前行动：{{ v2ActiveActor?.name || '结算中' }}</span>
          <span>五行：{{ v2Player ? ELEMENT_LABELS[v2Player.element] : '—' }} 对 {{ v2Enemy ? ELEMENT_LABELS[v2Enemy.element] : '—' }}</span>
        </div>
        <div v-if="combat.isV2" class="legacy-mob-stats">
          <span>敌方抗性：{{ resistanceSummary(v2Enemy?.resistances) }}</span>
          <span>最近五行判定：{{ v2LastDamageEvent?.advantage || '尚未造成伤害' }}</span>
          <span>行动规则：身法高者先攻，每轮各行动一次</span>
        </div>
      </template>
      <template v-else><strong>暂无目标</strong><span>修为等级 —</span><i class="legacy-wide-hp"><b style="width:0" /></i><small>暂无存活敌人。</small></template>
    </section>

    <div class="legacy-combat-actions" aria-label="战斗操作">
      <button v-if="!combat.mob" type="button" :disabled="combat.isV2 && actions.resting" @click="spawn">{{ combat.isV2 && actions.resting ? '调息中' : '寻敌' }}</button>
      <template v-if="combat.isV2">
        <button v-if="combat.mob" type="button" :disabled="!combat.waitingForPlayer" @click="attack">普通攻击</button>
        <button
          v-for="(technique, index) in v2Techniques"
          :key="technique?.id || `empty-${index}`"
          type="button"
          :disabled="!technique || !v2TechniqueReady(technique)"
          :title="technique ? `${ELEMENT_LABELS[technique.element]} · ${effectLabel(technique.effectType)} · 消耗 ${technique.manaCost} 法力` : '未配置功法'"
          @click="technique && cast(technique.id, technique.effectType)"
        >{{ technique ? `${technique.displayName}${v2Cooldown(technique.id) ? `（${v2Cooldown(technique.id)}）` : ''}` : `空功法位 ${index + 1}` }}</button>
        <button v-if="combat.mob" type="button" :disabled="!combat.waitingForPlayer || !Number(v2Pills.回春丹 || 0) || Number(v2Player?.hp || 0) >= Number(v2Player?.maxHp || 1)" @click="useV2Pill('回春丹')">回春丹 ×{{ Number(v2Pills.回春丹 || 0) }}</button>
        <button v-if="combat.mob" type="button" :disabled="!combat.waitingForPlayer || !Number(v2Pills.回灵丹 || 0) || Number(v2Player?.mp || 0) >= Number(v2Player?.maxMp || 1)" @click="useV2Pill('回灵丹')">回灵丹 ×{{ Number(v2Pills.回灵丹 || 0) }}</button>
        <button v-if="combat.mob" type="button" :disabled="!combat.waitingForPlayer" @click="combat.flee">遁走</button>
        <button type="button" :disabled="actions.resting" @click="autoBattle">{{ combat.inCombat ? '自动完成战斗' : actions.resting ? '调息中' : '自动寻敌并战斗' }}</button>
      </template>
      <template v-else>
        <button v-if="combat.mob" type="button" :disabled="combat.busy" @click="attack">攻击</button>
        <button v-for="spell in memorized" :key="spell!.id" type="button" @click="cast(spell!.id, spell!.kind)">{{ translateLegacyText(spell!.name) }}</button>
        <button type="button" @click="heal">疗伤</button>
        <button type="button" @click="rest">调息</button>
        <button v-if="combat.mob" type="button" @click="combat.flee">遁走</button>
        <button type="button" @click="toggleAfk">{{ afk.running ? '停止自动历练' : '开启自动历练' }}</button>
      </template>
    </div>

    <section ref="combatLogElement" class="legacy-combat-log" aria-labelledby="log-title">
      <h3 id="log-title" class="sr-only">斗法记录</h3>
      <ol v-if="combat.log.length" aria-live="polite"><li v-for="entry in combat.log" :key="entry.id" :class="`is-${entry.kind}`">{{ entry.text }}</li></ol>
      <p v-else>欢迎回来，{{ character.name }}！当前位于{{ translateLegacyText(zone.name) }}。</p>
      <details v-if="combat.isV2 && combat.lastDamageBreakdown">
        <summary>最近一次伤害分解</summary>
        <p>{{ combat.lastDamageExplanation }}</p>
      </details>
    </section>

  </section>
</template>
