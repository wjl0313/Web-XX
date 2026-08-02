<script setup lang="ts">
import { computed } from 'vue'

import { translateLegacyText, ZONES } from '../../game-core'
import { V2_ZONES } from '../../game-core/rulesets'
import { useAfkStore } from '../../stores/afk.store'
import { useActionStore } from '../../stores/action.store'
import { useCombatStore } from '../../stores/combat.store'
import { useSaveStore } from '../../stores/save.store'
import { useUiStore } from '../../stores/ui.store'

const saves = useSaveStore()
const afk = useAfkStore()
const actions = useActionStore()
const combat = useCombatStore()
const ui = useUiStore()
const character = computed(() => saves.activeCharacter!)
const zoneIndex = computed(() => Math.max(0, Math.min(ZONES.length - 1, Number(character.value.zone || 0))))
const zone = computed(() => ZONES[zoneIndex.value])
const huntTarget = computed(() => String((character.value.huntTargets as Record<string, unknown> | undefined)?.[String(zoneIndex.value)] || ''))
const profiles = computed(() => character.value.afkProfiles as Record<string, unknown> || {})
const v2Config = computed(() => afk.v2Configuration)
const v2Pills = computed(() => character.value.v2Pills as Record<string, number> || {})
const v2Goals = [['realm', '冲击境界'], ['gold', '积攒灵石'], ['technique', '寻找功法'], ['herb', '寻找灵草']] as const

const goals = [
  ['balanced', '均衡历练'], ['level', '冲击等级'], ['contract', '完成契约'], ['dungeon', '探索秘境'],
  ['gold', '收集灵石'], ['farm_until_gold', '灵石达到目标'], ['level_alts_to', '小号修炼至指定等级'], ['farm_zone', '固定区域历练'],
] as const

async function toggle() {
  if (afk.running) await afk.stop()
  else await afk.start()
}

function beginRest() {
  if (actions.beginRest()) ui.toast('已开始调息，气血回满前不能执行其他玩法行动。', 'success')
  else ui.toast(combat.inCombat ? '战斗中不能调息。' : '当前无需调息。', 'warning')
}

function useHealingPill() {
  const recovered = actions.useHealingPill()
  ui.toast(recovered > 0 ? `服用回春丹，恢复 ${recovered} 点气血。` : '没有可用的回春丹。', recovered > 0 ? 'success' : 'warning')
}

function useHealingTechnique(techniqueId: string) {
  const recovered = actions.useHealingTechnique(techniqueId)
  ui.toast(recovered > 0 ? `治疗功法恢复 ${recovered} 点气血。` : '法力不足或当前不能施展。', recovered > 0 ? 'success' : 'warning')
}

function saveProfile(index: number) {
  afk.saveProfile(`slot${index}` as 'slot1' | 'slot2' | 'slot3')
  ui.toast(`挂机方案 ${index} 已保存。`, 'success')
}

function loadProfile(index: number) {
  if (!afk.loadProfile(`slot${index}` as 'slot1' | 'slot2' | 'slot3')) {
    ui.toast(combat.inCombat ? '请先结束当前战斗。' : `挂机方案 ${index} 尚未保存。`, 'warning')
    return
  }
  ui.toast(`已读取挂机方案 ${index}。`, 'success')
}
</script>

<template>
  <aside class="legacy-right-rail" aria-label="挂机设置">
    <template v-if="afk.isV2">
      <details class="legacy-side-panel" open>
        <summary>自动历练</summary>
        <div class="legacy-side-panel__body legacy-afk-body">
          <div class="legacy-afk-status"><span><i :class="{ 'is-on': afk.running }" />{{ afk.running ? '运行中' : '已停止' }}</span><button type="button" :aria-label="afk.running ? '停止自动历练' : '开始自动历练'" @click="toggle">{{ afk.running ? '停止' : '开启' }}</button></div>
          <label><span>历练目标</span><select :value="v2Config?.goal" :disabled="afk.running" @change="afk.setGoal(($event.target as HTMLSelectElement).value)"><option v-for="goal in v2Goals" :key="goal[0]" :value="goal[0]">{{ goal[1] }}</option></select></label>
          <label><span>固定区域</span><select :value="v2Config?.zoneIndex" :disabled="afk.running || combat.inCombat || actions.resting" @change="afk.setZone(Number(($event.target as HTMLSelectElement).value))"><option v-for="zoneEntry in V2_ZONES" :key="zoneEntry.id" :value="zoneEntry.legacyZoneIndex" :disabled="Number(character.level) < zoneEntry.minimumLevel">{{ zoneEntry.displayName }}</option></select></label>
          <label><span>治疗功法阈值 {{ Math.round(Number(v2Config?.healingThreshold || 0.4) * 100) }}%</span><input type="range" min="10" max="90" step="5" :value="Number(v2Config?.healingThreshold || 0.4) * 100" @change="afk.updateConfiguration({ healingThreshold: Number(($event.target as HTMLInputElement).value) / 100 })" /></label>
          <label><span>战后调息阈值 {{ Math.round(Number(v2Config?.meditationThreshold || 0.2) * 100) }}%</span><input type="range" min="5" max="80" step="5" :value="Number(v2Config?.meditationThreshold || 0.2) * 100" @change="afk.updateConfiguration({ meditationThreshold: Number(($event.target as HTMLInputElement).value) / 100 })" /></label>
          <label><span>气血丹阈值 {{ Math.round(Number(v2Config?.hpPillThreshold || 0.3) * 100) }}%</span><input type="range" min="5" max="90" step="5" :value="Number(v2Config?.hpPillThreshold || 0.3) * 100" @change="afk.updateConfiguration({ hpPillThreshold: Number(($event.target as HTMLInputElement).value) / 100 })" /></label>
          <label><span>法力丹阈值 {{ Math.round(Number(v2Config?.mpPillThreshold || 0.2) * 100) }}%</span><input type="range" min="5" max="90" step="5" :value="Number(v2Config?.mpPillThreshold || 0.2) * 100" @change="afk.updateConfiguration({ mpPillThreshold: Number(($event.target as HTMLInputElement).value) / 100 })" /></label>
          <label class="legacy-check"><input type="checkbox" :checked="v2Config?.stopAtBoss !== false" @change="afk.updateConfiguration({ stopAtBoss: ($event.target as HTMLInputElement).checked })" /><span>遭遇首领后停止</span></label>
          <label class="legacy-check"><input type="checkbox" :checked="v2Config?.stopWhenInventoryFull !== false" @change="afk.updateConfiguration({ stopWhenInventoryFull: ($event.target as HTMLInputElement).checked })" /><span>背包满后停止</span></label>
          <button type="button" :disabled="!combat.inCombat || actions.resting" @click="combat.autoResolve()">自动完成当前战斗</button>
        </div>
      </details>

      <details class="legacy-side-panel" open>
        <summary>调息</summary>
        <div class="legacy-side-panel__body legacy-afk-body">
          <template v-if="actions.resting">
            <div class="legacy-afk-status"><span><i class="is-on" />调息中</span><strong>{{ character.hp }} / {{ character.maxHp }}</strong></div>
            <p>体魄 {{ Number((character.abilities as Record<string, unknown> | undefined)?.str || 10) }} · 每秒恢复 {{ actions.recoveryPerSecond }} 点 · 约 {{ actions.remainingSeconds }} 秒</p>
            <button type="button" :disabled="!v2Pills.回春丹" @click="useHealingPill">回春丹 ×{{ v2Pills.回春丹 || 0 }}</button>
            <button v-for="technique in actions.healingTechniques" :key="technique.id" type="button" :disabled="Number(character.mp || 0) < technique.manaCost" @click="useHealingTechnique(technique.id)">{{ technique.displayName }} · {{ technique.manaCost }} 法力</button>
          </template>
          <template v-else>
            <div class="legacy-afk-status"><span><i />当前未调息</span><strong>{{ character.hp }} / {{ character.maxHp }}</strong></div>
            <button type="button" :disabled="combat.inCombat || Number(character.hp || 0) >= Number(character.maxHp || 1)" @click="beginRest">开始调息</button>
          </template>
        </div>
      </details>

      <details class="legacy-side-panel" open>
        <summary>历练说明</summary>
        <div class="legacy-side-panel__body">
          <p>战斗中不能调息，只能用治疗功法或丹药回血。战后气血达到或低于阈值会自动调息至满；自然恢复只按体魄计算固定点数。调息期间不能寻敌、突破、秘境、洞府参悟或炼丹，但可以更换装备，并可消耗回春丹或法力施展已拥有的治疗功法加快恢复。</p>
          <p>在线与离线历练使用同一套回合制斗法；离线最多结算 8 小时，首领默认不会自动重复。</p>
        </div>
      </details>
    </template>

    <template v-else>
    <details class="legacy-side-panel" open>
      <summary>自动历练</summary>
      <div class="legacy-side-panel__body legacy-afk-body">
        <div class="legacy-afk-status"><span><i :class="{ 'is-on': afk.running }" />{{ afk.running ? '运行中' : '已停止' }}</span><button type="button" :aria-label="afk.running ? '停止挂机' : '开始挂机'" @click="toggle">{{ afk.running ? '停止' : '开启' }}</button></div>
        <label><span>挂机目标：</span><select :value="String(character.afkGoal || 'balanced')" :disabled="afk.running" @change="afk.setGoal(($event.target as HTMLSelectElement).value)"><option v-for="goal in goals" :key="goal[0]" :value="goal[0]">{{ goal[1] }}</option></select></label>
        <label><span>挂机方案：</span><select aria-label="挂机方案"><option v-for="index in 3" :key="index" :value="index">方案{{ ['一', '二', '三'][index - 1] }}</option></select></label>
        <div class="legacy-profile-buttons"><button v-for="index in 3" :key="`save-${index}`" type="button" :aria-label="`保存挂机方案 ${index}`" @click="saveProfile(index)">保存{{ index }}</button><button v-for="index in 3" :key="`load-${index}`" type="button" aria-label="读取" :disabled="!profiles[`slot${index}`]" @click="loadProfile(index)">读取{{ index }}</button></div>
        <label class="legacy-check"><input type="checkbox" :checked="character.autoUseSkills !== false" @change="afk.updateConfiguration({ autoUseSkills: ($event.target as HTMLInputElement).checked })" /><span>自动功法</span></label>
        <label class="legacy-check"><input type="checkbox" :checked="character.autoUseHpPotions !== false" @change="afk.updateConfiguration({ autoUseHpPotions: ($event.target as HTMLInputElement).checked })" /><span>自动疗伤</span></label>
        <label class="legacy-check"><input type="checkbox" :checked="character.autoUseMpPotions !== false" @change="afk.updateConfiguration({ autoUseMpPotions: ($event.target as HTMLInputElement).checked })" /><span>自动调息</span></label>
      </div>
    </details>

    <details class="legacy-side-panel">
      <summary>行动间隔</summary>
      <div class="legacy-side-panel__body">
        <label><span>每次行动</span><select :value="Number(character.afkIntervalMs || 1200)" :disabled="afk.running" @change="afk.updateConfiguration({ afkIntervalMs: Number(($event.target as HTMLSelectElement).value) })"><option :value="800">0.8 秒</option><option :value="1200">1.2 秒</option><option :value="1800">1.8 秒</option><option :value="2500">2.5 秒</option></select></label>
        <label><span>疗伤阈值 {{ Number(character.autoHpPotionPercent || 35) }}%</span><input type="range" min="5" max="95" step="5" :value="Number(character.autoHpPotionPercent || 35)" @change="afk.updateConfiguration({ autoHpPotionPercent: Number(($event.target as HTMLInputElement).value) })" /></label>
        <label><span>回灵阈值 {{ Number(character.autoMpPotionPercent || 20) }}%</span><input type="range" min="5" max="95" step="5" :value="Number(character.autoMpPotionPercent || 20)" @change="afk.updateConfiguration({ autoMpPotionPercent: Number(($event.target as HTMLInputElement).value) })" /></label>
      </div>
    </details>

    <details class="legacy-side-panel">
      <summary>历练区域</summary>
      <div class="legacy-side-panel__body">
        <label><span>当前区域</span><select :value="zoneIndex" :disabled="afk.running || combat.inCombat" @change="afk.setZone(Number(($event.target as HTMLSelectElement).value))"><option v-for="(entry, index) in ZONES" :key="entry.name" :value="index" :disabled="Number(character.level) < entry.minLvl">{{ translateLegacyText(entry.name) }}</option></select></label>
        <label><span>猎杀目标</span><select :value="huntTarget" :disabled="afk.running || combat.inCombat" @change="afk.setHuntTarget(($event.target as HTMLSelectElement).value)"><option value="">随机寻敌</option><option v-for="mob in zone.mobs" :key="mob" :value="mob">{{ translateLegacyText(mob) }}</option></select></label>
        <button type="button" @click="afk.bindZone(zoneIndex)">{{ Number(character.bindZone || 0) === zoneIndex ? '已绑定当前区域' : '绑定当前区域' }}</button>
      </div>
    </details>

    <details class="legacy-side-panel" open>
      <summary>当前目标</summary>
      <div class="legacy-side-panel__body"><strong>{{ huntTarget ? translateLegacyText(huntTarget) : '随机寻敌' }}</strong><small>{{ translateLegacyText(zone.name) }}</small></div>
    </details>
    </template>
  </aside>
</template>
