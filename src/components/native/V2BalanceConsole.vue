<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Copy, Download, RotateCcw, Save, Settings2, Upload } from 'lucide-vue-next'

import {
  ELEMENT_LABELS,
  V2_BALANCE_CLASS_IDS,
  V2_BALANCE_PARAMETERS,
  V2_ENEMIES,
  calculateV2PostBattleRecovery,
  getCharacterRuleset,
  type AbilityKey,
  type Element,
  type V2BalanceClassId,
  type V2CombatBalanceConfig,
  type V2EnemyBalanceProfile,
  type V2EquipmentBalanceProfile,
  type V2GameBalanceConfig,
  type V2GrowthStatKey,
} from '../../game-core/rulesets'
import { useActionStore } from '../../stores/action.store'
import { useAfkStore } from '../../stores/afk.store'
import { useBalanceStore } from '../../stores/balance.store'
import { useCombatStore } from '../../stores/combat.store'
import { useSaveStore } from '../../stores/save.store'
import { useUiStore } from '../../stores/ui.store'

type ConsoleTab = 'combat' | 'growth' | 'techniques' | 'equipment' | 'enemies' | 'recovery' | 'json'

const balance = useBalanceStore()
const saves = useSaveStore()
const combat = useCombatStore()
const afk = useAfkStore()
const actions = useActionStore()
const ui = useUiStore()
balance.initialize()

const draft = ref<V2GameBalanceConfig>(clone(balance.configuration))
const tab = ref<ConsoleTab>('combat')
const selectedClassId = ref<V2BalanceClassId>('炼体士')
const selectedGrowthId = ref('balanced')
const selectedTechniqueId = ref(Object.keys(draft.value.techniques)[0] || '')
const selectedEquipmentId = ref(Object.keys(draft.value.equipment)[0] || '')
const selectedEnemyId = ref(Object.keys(draft.value.enemies)[0] || '')
const jsonText = ref('')
const locked = computed(() => combat.inCombat || afk.running || actions.resting)
const dirty = computed(() => JSON.stringify(draft.value) !== JSON.stringify(balance.configuration))
const selectedClass = computed(() => draft.value.classes[selectedClassId.value])
const selectedGrowth = computed(() => draft.value.growthStrategies[selectedGrowthId.value])
const selectedTechnique = computed(() => draft.value.techniques[selectedTechniqueId.value])
const selectedEquipment = computed<V2EquipmentBalanceProfile>(() => draft.value.equipment[selectedEquipmentId.value])
const selectedEnemy = computed<V2EnemyBalanceProfile>(() => draft.value.enemies[selectedEnemyId.value])
const techniqueOptions = computed(() => Object.values(draft.value.techniques))
const enemyOptions = computed(() => Object.keys(draft.value.enemies).map((id) => ({ id, label: V2_ENEMIES[id]?.displayName || id })))
const recoveryPreview = computed(() => saves.activeCharacter && getCharacterRuleset(saves.activeCharacter) === 'v2'
  ? calculateV2PostBattleRecovery(saves.activeCharacter, draft.value)
  : null)

const tabs: readonly { id: ConsoleTab; label: string }[] = [
  { id: 'combat', label: '战斗与五行' },
  { id: 'growth', label: '职业成长' },
  { id: 'techniques', label: '功法' },
  { id: 'equipment', label: '装备' },
  { id: 'enemies', label: '怪物与掉落' },
  { id: 'recovery', label: '恢复与丹药' },
  { id: 'json', label: 'JSON' },
]
const combatFields: readonly { key: keyof V2CombatBalanceConfig; label: string; step: number; min: number; max: number }[] = [
  { key: 'baseCriticalChance', label: '基础致命一击概率', step: 0.001, min: 0, max: 1 },
  { key: 'agilityCriticalChanceScale', label: '每点身法致命概率', step: 0.001, min: 0, max: 1 },
  { key: 'maximumCriticalChance', label: '致命一击概率上限', step: 0.01, min: 0, max: 1 },
  { key: 'criticalDamageMultiplier', label: '致命一击倍率', step: 0.05, min: 1, max: 10 },
  { key: 'baseHitChance', label: '基础命中率', step: 0.01, min: 0, max: 1 },
  { key: 'agilityHitChanceScale', label: '每点身法命中加成', step: 0.001, min: 0, max: 1 },
  { key: 'baseDodgeChance', label: '基础闪避率', step: 0.01, min: 0, max: 1 },
  { key: 'agilityDodgeChanceScale', label: '每点身法闪避加成', step: 0.001, min: 0, max: 1 },
  { key: 'minimumHitChance', label: '最低命中率', step: 0.01, min: 0, max: 1 },
  { key: 'maximumHitChance', label: '最高命中率', step: 0.01, min: 0, max: 1 },
  { key: 'defenseConstant', label: '防御减伤常数', step: 1, min: 1, max: 10000 },
  { key: 'minimumDefenseMultiplier', label: '防御后最低承伤倍率', step: 0.01, min: 0, max: 1 },
  { key: 'damageVarianceMinimum', label: '伤害浮动下限', step: 0.01, min: 0, max: 10 },
  { key: 'damageVarianceMaximum', label: '伤害浮动上限', step: 0.01, min: 0, max: 10 },
  { key: 'escapeBaseChance', label: '基础遁走概率', step: 0.01, min: 0, max: 1 },
  { key: 'escapeAgilityScale', label: '身法差遁走系数', step: 0.001, min: 0, max: 1 },
  { key: 'escapeMinimumChance', label: '最低遁走概率', step: 0.01, min: 0, max: 1 },
  { key: 'escapeMaximumChance', label: '最高遁走概率', step: 0.01, min: 0, max: 1 },
]
const growthStats: readonly { key: V2GrowthStatKey; label: string }[] = [
  { key: 'maxHp', label: '气血上限' }, { key: 'maxMp', label: '法力上限' },
  { key: 'atk', label: '攻击' }, { key: 'def', label: '防御' },
  { key: 'str', label: '体魄' }, { key: 'dex', label: '身法' },
  { key: 'con', label: '根骨' }, { key: 'wis', label: '神识' },
]
const abilities: readonly { key: AbilityKey; label: string }[] = [
  { key: 'str', label: '体魄' }, { key: 'dex', label: '身法' }, { key: 'con', label: '根骨' },
  { key: 'int', label: '悟性' }, { key: 'wis', label: '神识' }, { key: 'cha', label: '机缘' },
]
const equipmentStats = [
  { key: 'atk', label: '攻击' }, { key: 'def', label: '防御' }, { key: 'hp', label: '气血' }, { key: 'mp', label: '法力' },
  ...abilities,
] as const
const resistedElements = ['metal', 'wood', 'water', 'fire', 'earth', 'thunder', 'ice', 'wind', 'dark'] as const
const fiveElements = ['metal', 'wood', 'water', 'fire', 'earth'] as const
const enemyStats = [
  { key: 'level', label: '等级' }, { key: 'hp', label: '气血' }, { key: 'mp', label: '法力' },
  { key: 'attack', label: '攻击' }, { key: 'defense', label: '防御' }, { key: 'spirit', label: '神识强度' },
  { key: 'physique', label: '体魄' }, { key: 'agility', label: '身法' }, { key: 'criticalChance', label: '致命概率' },
  { key: 'xp', label: '修为奖励' }, { key: 'gold', label: '灵石奖励' },
] as const
const dropStats = [
  { key: 'guaranteedEquipmentChance', label: '绑定装备掉率' }, { key: 'equipmentChance', label: '随机装备掉率' }, { key: 'firstClearEquipmentCount', label: '首通额外装备数' },
  { key: 'herbDropChance', label: '灵草掉率' }, { key: 'herbDropCount', label: '灵草抽取次数' },
  { key: 'herbAmountMultiplier', label: '每次灵草数量' }, { key: 'techniqueChance', label: '功法掉率' },
  { key: 'demonCoreCount', label: '妖丹数量' }, { key: 'bossEssenceCount', label: '首领精魄数量' },
  { key: 'firstClearBossEssenceCount', label: '首通精魄数量' },
] as const

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T }
function setTechniqueScale(key: AbilityKey, event: Event) {
  if (!selectedTechnique.value) return
  if (!selectedTechnique.value.abilityScales) selectedTechnique.value.abilityScales = {}
  selectedTechnique.value.abilityScales[key] = Number((event.target as HTMLInputElement).value) || 0
}
function setEnemyPool(key: 'equipmentPool' | 'herbPool' | 'techniquePool', event: Event) {
  selectedEnemy.value.drops[key] = (event.target as HTMLInputElement).value.split(/[,，]/).map((entry) => entry.trim()).filter(Boolean)
}
function prepareJson() { jsonText.value = JSON.stringify(draft.value, null, 2) }
function changeTab(next: ConsoleTab) { tab.value = next; if (next === 'json') prepareJson() }
function applyDraft() {
  if (locked.value) return
  draft.value = clone(balance.apply(draft.value))
  ui.toast('数值配置已应用到当前运行时。', 'success')
}
async function resetDraft() {
  if (locked.value) return
  const accepted = await ui.confirm('恢复推荐值会覆盖当前全部数值配置。', { title: '恢复推荐数值', confirmLabel: '恢复推荐值', danger: true })
  if (!accepted) return
  draft.value = clone(balance.reset())
  prepareJson()
  ui.toast('已恢复推荐数值。', 'success')
}
function importJson() {
  if (locked.value) return
  try {
    draft.value = clone(balance.importJson(jsonText.value))
    prepareJson()
    ui.toast('配置 JSON 已校验并应用。', 'success')
  } catch (cause) { ui.toast(cause instanceof Error ? cause.message : '配置 JSON 无效。', 'danger') }
}
async function copyJson() {
  prepareJson()
  await navigator.clipboard.writeText(jsonText.value)
  ui.toast('配置 JSON 已复制。', 'success')
}
function downloadJson() {
  prepareJson()
  const url = URL.createObjectURL(new Blob([jsonText.value], { type: 'application/json' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = '凡修录-v2-数值配置.json'
  anchor.click()
  URL.revokeObjectURL(url)
}
watch(() => balance.revision, () => { draft.value = clone(balance.configuration) })
</script>

<template>
  <section class="settings-section balance-console" aria-labelledby="balance-console-title">
    <header class="panel-heading">
      <div><p class="eyebrow">全局策划参数</p><h2 id="balance-console-title">数值配置台</h2></div>
      <span class="status-indicator"><Settings2 :size="15" />{{ dirty ? '有未应用修改' : '运行时已同步' }}</span>
    </header>

    <div class="balance-console__tabs" role="tablist" aria-label="数值配置分组">
      <button v-for="entry in tabs" :key="entry.id" type="button" :class="{ 'is-active': tab === entry.id }" @click="changeTab(entry.id)">{{ entry.label }}</button>
    </div>

    <div v-if="tab === 'combat'" class="balance-console__body">
      <fieldset><legend>对战默认值</legend><div class="balance-field-grid"><label v-for="field in combatFields" :key="field.key"><span>{{ field.label }}</span><input v-model.number="draft.combat[field.key]" type="number" :min="field.min" :max="field.max" :step="field.step" /></label></div></fieldset>
      <fieldset><legend>五行相克</legend><div class="balance-field-grid"><label v-for="element in fiveElements" :key="element"><span>{{ ELEMENT_LABELS[element] }}克制</span><select v-model="draft.elements.overcomes[element]"><option v-for="target in fiveElements" :key="target" :value="target">{{ ELEMENT_LABELS[target] }}</option></select></label><label><span>克制倍率</span><input v-model.number="draft.elements.advantageMultiplier" type="number" min="0" max="10" step="0.01" /></label><label><span>被克倍率</span><input v-model.number="draft.elements.disadvantageMultiplier" type="number" min="0" max="10" step="0.01" /></label><label><span>同属性倍率</span><input v-model.number="draft.elements.sameElementMultiplier" type="number" min="0" max="10" step="0.01" /></label><label><span>无关系倍率</span><input v-model.number="draft.elements.neutralMultiplier" type="number" min="0" max="10" step="0.01" /></label></div></fieldset>
    </div>

    <div v-else-if="tab === 'growth'" class="balance-console__body">
      <div class="balance-selectors"><label><span>职业</span><select v-model="selectedClassId"><option v-for="id in V2_BALANCE_CLASS_IDS" :key="id" :value="id">{{ id }}</option></select></label><label><span>突破路线</span><select v-model="selectedGrowthId"><option v-for="(_, id) in draft.growthStrategies" :key="id" :value="id">{{ id }}</option></select></label></div>
      <fieldset><legend>{{ selectedClassId }}初始属性</legend><div class="balance-field-grid"><label><span>气血上限</span><input v-model.number="selectedClass.initial.maxHp" type="number" min="1" step="1" /></label><label><span>法力上限</span><input v-model.number="selectedClass.initial.maxMp" type="number" min="0" step="1" /></label><label><span>攻击</span><input v-model.number="selectedClass.initial.atk" type="number" min="1" step="1" /></label><label><span>防御</span><input v-model.number="selectedClass.initial.def" type="number" min="0" step="1" /></label><label v-for="ability in abilities" :key="ability.key"><span>{{ ability.label }}</span><input v-model.number="selectedClass.initial.abilities[ability.key]" type="number" min="1" step="1" /></label></div></fieldset>
      <fieldset><legend>{{ selectedGrowthId }}单次突破成长</legend><div class="balance-field-grid"><label v-for="stat in growthStats" :key="stat.key"><span>{{ stat.label }}</span><input v-model.number="selectedGrowth.gains[stat.key]" type="number" min="0" step="1" /></label></div></fieldset>
      <fieldset><legend>{{ selectedClassId }}成长倍率</legend><div class="balance-field-grid"><label v-for="stat in growthStats" :key="stat.key"><span>{{ stat.label }}</span><input v-model.number="selectedClass.growthMultipliers[stat.key]" type="number" min="0" max="10" step="0.05" /></label></div></fieldset>
    </div>

    <div v-else-if="tab === 'techniques'" class="balance-console__body">
      <div class="balance-selectors"><label><span>功法</span><select v-model="selectedTechniqueId"><option v-for="entry in techniqueOptions" :key="entry.id" :value="entry.id">{{ entry.displayName }}</option></select></label></div>
      <fieldset v-if="selectedTechnique"><legend>{{ selectedTechnique.displayName }}</legend><div class="balance-field-grid"><label><span>法力消耗</span><input v-model.number="selectedTechnique.manaCost" type="number" min="0" step="1" /></label><label><span>冷却回合</span><input v-model.number="selectedTechnique.cooldown" type="number" min="0" step="1" /></label><label><span>基础威力</span><input v-model.number="selectedTechnique.basePower" type="number" min="0" step="1" /></label><label><span>攻击缩放</span><input v-model.number="selectedTechnique.attackScale" type="number" min="0" step="0.05" /></label><label><span>神识缩放</span><input v-model.number="selectedTechnique.spiritScale" type="number" min="0" step="0.05" /></label><label><span>体魄缩放</span><input v-model.number="selectedTechnique.physiqueScale" type="number" min="0" step="0.05" /></label><label><span>持续回合</span><input v-model.number="selectedTechnique.duration" type="number" min="0" step="1" /></label><label><span>效果强度</span><input v-model.number="selectedTechnique.magnitude" type="number" min="0" step="1" /></label><label v-for="ability in abilities" :key="ability.key"><span>{{ ability.label }}缩放</span><input :value="selectedTechnique.abilityScales?.[ability.key] || 0" type="number" min="0" step="0.05" @input="setTechniqueScale(ability.key, $event)" /></label></div></fieldset>
    </div>

    <div v-else-if="tab === 'equipment'" class="balance-console__body">
      <div class="balance-selectors"><label><span>装备</span><select v-model="selectedEquipmentId"><option v-for="(_, id) in draft.equipment" :key="id" :value="id">{{ id }}</option></select></label></div>
      <fieldset><legend>基础属性</legend><div class="balance-field-grid"><label v-for="stat in equipmentStats" :key="stat.key"><span>{{ stat.label }}</span><input v-model.number="selectedEquipment[stat.key]" type="number" min="0" step="1" /></label><label><span>固定伤害倍率</span><input v-model.number="selectedEquipment.fixedDamageMultiplier" type="number" min="0" max="10" step="0.01" /></label></div></fieldset>
      <fieldset><legend>五行抗性</legend><div class="balance-field-grid"><label v-for="element in resistedElements" :key="element"><span>{{ ELEMENT_LABELS[element] }}</span><input v-model.number="selectedEquipment.resistances[element]" type="number" min="-100" max="100" step="1" /></label></div></fieldset>
    </div>

    <div v-else-if="tab === 'enemies'" class="balance-console__body">
      <div class="balance-selectors"><label><span>怪物</span><select v-model="selectedEnemyId"><option v-for="entry in enemyOptions" :key="entry.id" :value="entry.id">{{ entry.label }}</option></select></label></div>
      <fieldset><legend>战斗属性与奖励</legend><div class="balance-field-grid"><label v-for="stat in enemyStats" :key="stat.key"><span>{{ stat.label }}</span><input v-model.number="selectedEnemy[stat.key]" type="number" min="0" :max="stat.key === 'criticalChance' ? 1 : undefined" :step="stat.key === 'criticalChance' ? 0.01 : 1" /></label></div></fieldset>
      <fieldset><legend>逐怪掉落</legend><div class="balance-field-grid"><label><span>绑定装备</span><select v-model="selectedEnemy.drops.guaranteedEquipmentId"><option value="">无</option><option v-for="(_, id) in draft.equipment" :key="id" :value="id">{{ id }}</option></select></label><label class="balance-field--wide"><span>随机装备池（逗号分隔）</span><input :value="selectedEnemy.drops.equipmentPool.join(', ')" type="text" @change="setEnemyPool('equipmentPool', $event)" /></label><label class="balance-field--wide"><span>灵草池（逗号分隔）</span><input :value="selectedEnemy.drops.herbPool.join(', ')" type="text" @change="setEnemyPool('herbPool', $event)" /></label><label class="balance-field--wide"><span>功法池（逗号分隔）</span><input :value="selectedEnemy.drops.techniquePool.join(', ')" type="text" @change="setEnemyPool('techniquePool', $event)" /></label><label v-for="stat in dropStats" :key="stat.key"><span>{{ stat.label }}</span><input v-model.number="selectedEnemy.drops[stat.key]" type="number" min="0" :max="stat.key.includes('Chance') ? 1 : undefined" :step="stat.key.includes('Chance') ? 0.01 : 1" /></label></div></fieldset>
      <fieldset><legend>五行抗性</legend><div class="balance-field-grid"><label v-for="element in resistedElements" :key="element"><span>{{ ELEMENT_LABELS[element] }}</span><input v-model.number="selectedEnemy.resistances[element]" type="number" min="-100" max="100" step="1" /></label></div></fieldset>
    </div>

    <div v-else-if="tab === 'recovery'" class="balance-console__body">
      <fieldset><legend>战后、调息与丹药</legend><div class="balance-field-grid"><label v-for="parameter in V2_BALANCE_PARAMETERS" :key="parameter.key"><span>{{ parameter.label }}</span><input v-model.number="draft[parameter.key]" type="number" :min="parameter.min" :max="parameter.max" :step="parameter.step" /><small>{{ parameter.unit === '%' ? `${Math.round(draft[parameter.key] * 100)}%` : parameter.unit }}</small></label></div></fieldset>
      <div v-if="recoveryPreview" class="balance-preview"><div><span>当前角色</span><strong>等级 {{ recoveryPreview.hp.level }} · 体魄 {{ recoveryPreview.hp.attribute }} · 神识 {{ recoveryPreview.mp.attribute }}</strong></div><div><span>预计气血恢复</span><strong>{{ recoveryPreview.hp.calculatedAmount }} / {{ recoveryPreview.hp.maximum }}（{{ (recoveryPreview.hp.calculatedAmount / recoveryPreview.hp.maximum * 100).toFixed(1) }}%）</strong></div><div><span>预计法力恢复</span><strong>{{ recoveryPreview.mp.calculatedAmount }} / {{ recoveryPreview.mp.maximum }}（{{ recoveryPreview.mp.maximum ? (recoveryPreview.mp.calculatedAmount / recoveryPreview.mp.maximum * 100).toFixed(1) : '0.0' }}%）</strong></div></div>
    </div>

    <div v-else class="balance-console__body"><textarea v-model="jsonText" class="balance-json" spellcheck="false" aria-label="完整数值配置 JSON" /><div class="settings-actions"><button class="button button--secondary" type="button" @click="prepareJson"><RotateCcw :size="16" />载入当前草稿</button><button class="button button--secondary" type="button" @click="copyJson"><Copy :size="16" />复制 JSON</button><button class="button button--secondary" type="button" @click="downloadJson"><Download :size="16" />下载 JSON</button><button class="button button--primary" type="button" :disabled="locked || !jsonText.trim()" @click="importJson"><Upload :size="16" />校验并应用</button></div></div>

    <p v-if="locked" class="form-error" role="status">战斗、自动历练或调息期间不能应用数值配置。</p>
    <footer class="balance-console__actions"><button class="button button--secondary" type="button" :disabled="locked" @click="resetDraft"><RotateCcw :size="17" />恢复推荐值</button><button class="button button--primary" type="button" :disabled="locked || !dirty" @click="applyDraft"><Save :size="17" />应用全部参数</button></footer>
  </section>
</template>
