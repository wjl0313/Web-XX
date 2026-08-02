<script setup lang="ts">
import { computed } from 'vue'

import { LEGACY_EQUIPMENT_SLOTS, getLegacyItemDisplayName, translateLegacyText, ZONES } from '../../game-core'
import {
  ELEMENT_LABELS,
  createV2PlayerActor,
  getCharacterRuleset,
  getV2CharacterRoot,
  type BattleEffectInstance,
  type ResistedElement,
} from '../../game-core/rulesets'
import { GROWTH_STRATEGIES, P2_TALENT_PROFILES, getP2RootElementLabels } from '../../game-core/domain/progression'
import { useCombatStore } from '../../stores/combat.store'
import { useActionStore } from '../../stores/action.store'
import { useProgressionStore } from '../../stores/progression.store'
import { useSaveStore } from '../../stores/save.store'
import { useUiStore } from '../../stores/ui.store'

const saves = useSaveStore()
const combat = useCombatStore()
const actions = useActionStore()
const progression = useProgressionStore()
const ui = useUiStore()
const character = computed(() => saves.activeCharacter!)
const isV2 = computed(() => getCharacterRuleset(character.value) === 'v2')
const v2Root = computed(() => isV2.value ? getV2CharacterRoot(character.value) : null)
const v2Actor = computed(() => isV2.value ? createV2PlayerActor(character.value) : null)
const resistedElements: ResistedElement[] = ['metal', 'wood', 'water', 'fire', 'earth', 'thunder', 'ice', 'wind', 'dark']
const v2Affinities = computed(() => Object.entries(v2Root.value?.affinities || {})
  .filter(([, value]) => Number(value) > 0)
  .map(([element, value]) => ({ label: ELEMENT_LABELS[element as keyof typeof ELEMENT_LABELS], value: Number(value) })))
const v2Resistances = computed(() => resistedElements.map((element) => ({
  label: ELEMENT_LABELS[element], value: Number(v2Actor.value?.resistances[element] || 0),
})))
const v2Effects = computed(() => (combat.v2State?.effects || []).filter((effect) => effect.targetActorId === 'player'))
const zone = computed(() => ZONES[Math.max(0, Math.min(ZONES.length - 1, Number(character.value.zone || 0)))])
const equipment = computed(() => character.value.equipment as Record<string, unknown> || {})
const abilities = computed(() => character.value.abilities as Record<string, unknown> || {})
const equipmentLabels: Record<string, string> = {
  weapon: '主法器', offhand: '辅手法器', chest: '衣袍', legs: '护腿', feet: '鞋履', charm: '饰品',
}
const abilityLabels: Record<string, string> = { str: '体魄', dex: '身法', con: '根骨', int: '悟性', wis: '神识', cha: '机缘' }

function percent(value: unknown, maximum: unknown): number {
  return Math.max(0, Math.min(100, Number(value || 0) / Math.max(1, Number(maximum || 1)) * 100))
}
function effectLabel(effect: BattleEffectInstance): string {
  const labels: Record<BattleEffectInstance['type'], string> = {
    poison: '中毒', regeneration: '持续恢复', stun: '眩晕', freeze: '冻结',
    attack_down: '攻击降低', agility_down: '身法降低', attack_up: '攻击提高', agility_up: '身法提高',
  }
  return `${labels[effect.type]} ${effect.remainingRounds} 回合`
}
function changeStrategy(value: string) {
  if (!progression.setGrowthStrategy(value as keyof typeof GROWTH_STRATEGIES)) ui.toast(actions.resting ? '调息中不能切换成长策略。' : '战斗中不能切换成长策略。', 'warning')
}
function breakthrough() {
  if (progression.breakthrough()) ui.toast(`突破成功，进入${progression.realm?.displayName || '下一境界'}。`, 'success')
  else ui.toast(actions.resting ? '调息中不能突破。' : combat.inCombat ? '战斗中不能突破。' : '修为尚未圆满或已达当前境界上限。', 'warning')
}
</script>

<template>
  <aside class="legacy-left-rail" aria-label="角色状态">
    <details class="legacy-side-panel" open>
      <summary>角色</summary>
      <div class="legacy-side-panel__body">
        <div class="legacy-character-title">
          <strong>{{ character.name }} <span>«初入仙途»</span></strong>
          <small>{{ isV2 ? progression.state?.rootId : translateLegacyText(String(character.race)) }} {{ translateLegacyText(String(character.cls)) }} — {{ isV2 ? progression.realm?.displayName : `修为等级 ${character.level}` }}</small>
        </div>

        <label class="legacy-resource"><span>气血</span><i><b :style="{ width: `${percent(character.hp, character.maxHp)}%` }" class="is-hp" /><em>{{ percent(character.hp, character.maxHp).toFixed(1) }}%</em></i></label>
        <label class="legacy-resource"><span>法力</span><i><b :style="{ width: `${percent(character.mp, character.maxMp)}%` }" class="is-mp" /><em>{{ percent(character.mp, character.maxMp).toFixed(1) }}%</em></i></label>
        <label class="legacy-resource"><span>修为</span><i><b :style="{ width: `${percent(character.xp, character.xpNext)}%` }" class="is-xp" /><em>{{ percent(character.xp, character.xpNext).toFixed(1) }}%</em></i><small>{{ Number(character.xp || 0).toLocaleString('zh-CN') }} / {{ Number(character.xpNext || 0).toLocaleString('zh-CN') }} 修为</small></label>

        <dl class="legacy-stat-list">
          <div><dt>修为等级</dt><dd>{{ character.level }}</dd></div>
          <div><dt>气血</dt><dd>{{ character.hp }}/{{ character.maxHp }}</dd></div>
          <div><dt>法力</dt><dd>{{ character.mp }}/{{ character.maxMp }}</dd></div>
          <div><dt>攻击</dt><dd>{{ character.atk }}</dd></div>
          <div><dt>防御</dt><dd>{{ character.def }}</dd></div>
          <div v-if="isV2"><dt>境界</dt><dd>{{ progression.realm?.displayName }}</dd></div>
          <div v-if="isV2"><dt>本命五行</dt><dd>{{ ELEMENT_LABELS[v2Actor?.element || 'neutral'] }}</dd></div>
        </dl>

        <div v-if="isV2" class="legacy-abilities">
          <span>灵根资质 · {{ v2Root?.displayName }}</span>
          <p>{{ v2Root?.grade }} · 可学{{ getP2RootElementLabels(v2Root).join('、') }}属性功法 · 修炼速度 {{ Math.round(Number(v2Root?.cultivationRate || 0) * 100) }}%</p>
          <dl><div v-for="entry in v2Affinities" :key="entry.label"><dt>{{ entry.label }}</dt><dd>{{ entry.value }}</dd></div></dl>
        </div>

        <div v-if="isV2 && progression.state" class="legacy-abilities">
          <span>天赋与成长策略</span>
          <p>主天赋：{{ progression.state.mainTalentId }} · {{ P2_TALENT_PROFILES[progression.state.mainTalentId].description }}</p>
          <p>副天赋：{{ progression.state.secondaryTalentId }} · {{ P2_TALENT_PROFILES[progression.state.secondaryTalentId].description }}</p>
          <label><span>成长策略</span><select :value="progression.state.growthStrategyId" :disabled="combat.inCombat || actions.resting" @change="changeStrategy(($event.target as HTMLSelectElement).value)"><option v-for="strategy in progression.strategies" :key="strategy.id" :value="strategy.id">{{ strategy.displayName }}</option></select></label>
          <button type="button" :disabled="combat.inCombat || actions.resting || progression.state.realm.cultivation < progression.state.realm.cultivationRequired" @click="breakthrough">突破境界</button>
        </div>

        <div v-if="isV2" class="legacy-abilities">
          <span>五行与异属性抗性</span>
          <dl><div v-for="entry in v2Resistances" :key="entry.label"><dt>{{ entry.label }}</dt><dd>{{ entry.value > 0 ? '+' : '' }}{{ entry.value }}</dd></div></dl>
        </div>

        <div class="legacy-abilities">
          <span>六维属性</span>
          <dl><div v-for="(label, key) in abilityLabels" :key="key"><dt>{{ label }}</dt><dd>{{ Number(abilities[key] || 10) }}</dd></div></dl>
        </div>

        <dl class="legacy-stat-list">
          <div><dt>灵石</dt><dd>{{ Number(character.gold || 0).toLocaleString('zh-CN') }}</dd></div>
          <div><dt>当前区域</dt><dd>{{ translateLegacyText(zone.name) }}</dd></div>
        </dl>
      </div>
    </details>

    <details class="legacy-side-panel">
      <summary>状态效果</summary>
      <div class="legacy-side-panel__body legacy-chip-list">
        <template v-if="isV2">
          <span v-if="actions.resting">调息中 · 每秒恢复 {{ actions.recoveryPerSecond }} 点气血</span>
          <span v-for="effect in v2Effects" :key="effect.id">{{ effectLabel(effect) }}</span>
          <p v-if="!actions.resting && !v2Effects.length">当前无持续状态。</p>
        </template>
        <template v-else>
          <span v-for="(effect, index) in (Array.isArray(character.statusEffects) ? character.statusEffects : [])" :key="index">{{ translateLegacyText(String(effect.name || effect.id || effect)) }}</span>
          <p v-if="!Array.isArray(character.statusEffects) || !character.statusEffects.length">当前无持续状态。</p>
        </template>
      </div>
    </details>

    <details class="legacy-side-panel">
      <summary>当前装备</summary>
      <dl class="legacy-side-panel__body legacy-compact-list">
        <div v-for="slot in LEGACY_EQUIPMENT_SLOTS" :key="slot"><dt>{{ equipmentLabels[slot] }}</dt><dd>{{ equipment[slot] ? translateLegacyText(getLegacyItemDisplayName(equipment[slot])) : '空' }}</dd></div>
      </dl>
    </details>

    <details class="legacy-side-panel">
      <summary>功法典籍</summary>
      <div class="legacy-side-panel__body"><p>已知功法：{{ isV2 ? (Array.isArray(character.v2KnownTechniques) ? character.v2KnownTechniques.length : 0) : (Array.isArray(character.knownSpells) ? character.knownSpells.length : 0) }} 部</p><p v-if="isV2">出战功法固定为三个槽位，战斗中不可更换。</p></div>
    </details>
  </aside>
</template>
