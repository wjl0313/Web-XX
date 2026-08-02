<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import {
  DEFAULT_CHARACTER_CLASS_ID,
  DEFAULT_CHARACTER_RACE_ID,
  normalizeCharacterClassId,
  type CharacterClassId,
  type CharacterRaceId,
} from '../../game-core/domain'
import {
  P2_ROOT_GROUPS,
  P2_ROOT_PROFILES,
  P2_TALENT_PROFILES,
  createTalentChoices,
  getP2RootElementLabels,
  type P2RootId,
  type P2RootTier,
  type P2TalentId,
} from '../../game-core/domain/progression'
import {
  V2_ENABLED_CLASS_IDS,
} from '../../game-core/rulesets'
import { translateLegacyText, ZONES } from '../../game-core/data'
import { useAfkStore } from '../../stores/afk.store'
import { useCombatStore } from '../../stores/combat.store'
import { useSaveStore } from '../../stores/save.store'
import { useUiStore } from '../../stores/ui.store'
import LegacyCultivatorAvatar from './LegacyCultivatorAvatar.vue'

const saves = useSaveStore()
const ui = useUiStore()
const afk = useAfkStore()
const combat = useCombatStore()
const selectedSlot = ref(Math.max(0, saves.slots.findIndex(Boolean)))
const avatarRotation = ref(0)
const creatingSlot = ref<number | null>(null)
const creationStep = ref(1)
const name = ref('')
const race = ref<CharacterRaceId>(DEFAULT_CHARACTER_RACE_ID)
const rootId = ref<P2RootId>('五行伪灵根')
const rootTier = ref<P2RootTier>('五灵根')
const classId = ref<CharacterClassId>(DEFAULT_CHARACTER_CLASS_ID)
const sex = ref<'male' | 'female'>('male')
const hairstyle = ref('束发')
const tone = ref('自然')
const robe = ref('青衫')
const formError = ref('')
const talentSeed = ref('')
const mainTalentId = ref<P2TalentId>('剑心')
const secondaryTalentId = ref<P2TalentId>('身轻如燕')

const selected = computed(() => saves.slots[selectedSlot.value] || null)
const selectedZone = computed(() => {
  const index = Math.max(0, Math.min(ZONES.length - 1, Number(selected.value?.zone || 0)))
  return translateLegacyText(ZONES[index]?.name || '')
})
const rootProfile = computed(() => P2_ROOT_PROFILES[rootId.value])
const rootOptions = computed(() => P2_ROOT_GROUPS.find((group) => group.id === rootTier.value)?.rootIds || [])
const talentChoices = computed(() => createTalentChoices(talentSeed.value || `p2-slot:${creatingSlot.value ?? 0}`, 3))
const availableClasses = computed<readonly CharacterClassId[]>(() => V2_ENABLED_CLASS_IDS)
const stepLabels = ['灵根/体质', '初始传承', '角色外观', '道号确认']
const appearancePreview = computed(() => ({
  sex: sex.value === 'male' ? '男修' : '女修',
  hairstyle: hairstyle.value,
  tone: tone.value,
  robe: robe.value,
}))

watch(() => saves.slots, () => {
  if (!saves.slots[selectedSlot.value]) {
    const firstOccupied = saves.slots.findIndex(Boolean)
    selectedSlot.value = firstOccupied >= 0 ? firstOccupied : 0
  }
}, { deep: true })

function selectSlot(index: number) {
  selectedSlot.value = index
  if (!saves.slots[index]) openCreate(index)
}

function openCreate(index: number) {
  selectedSlot.value = index
  creatingSlot.value = index
  creationStep.value = 1
  formError.value = ''
  name.value = ''
  race.value = DEFAULT_CHARACTER_RACE_ID
  rootId.value = '五行伪灵根'
  rootTier.value = '五灵根'
  classId.value = DEFAULT_CHARACTER_CLASS_ID
  sex.value = 'male'
  hairstyle.value = '束发'
  tone.value = '自然'
  robe.value = '青衫'
  talentSeed.value = `p2-slot:${index}`
  const choices = createTalentChoices(talentSeed.value, 3)
  mainTalentId.value = choices[0]
  secondaryTalentId.value = choices[1]
}

function cancelCreate() {
  creatingSlot.value = null
  creationStep.value = 1
  formError.value = ''
}

function chooseRoot(option: P2RootId) {
  rootId.value = option
}

function chooseRootTier(value: P2RootTier) {
  rootTier.value = value
  rootId.value = P2_ROOT_GROUPS.find((group) => group.id === value)?.rootIds[0] || '五行伪灵根'
}

function nextStep() {
  formError.value = ''
  creationStep.value = Math.min(4, creationStep.value + 1)
}

function previousStep() {
  formError.value = ''
  creationStep.value = Math.max(1, creationStep.value - 1)
}

async function create() {
  if (creatingSlot.value === null) return
  if (name.value.trim().length < 2) {
    formError.value = '道号至少需要两个字符'
    return
  }
  formError.value = ''
  try {
    const index = creatingSlot.value
    await saves.createCharacter(index, {
      name: name.value,
      race: race.value,
      classId: classId.value,
      ruleset: 'v2',
      hardcore: false,
      appearance: { sex: sex.value, hairstyle: hairstyle.value, tone: tone.value, robe: robe.value },
      rootId: rootId.value,
      mainTalentId: mainTalentId.value,
      secondaryTalentId: secondaryTalentId.value,
      talentSeed: talentSeed.value,
    })
    selectedSlot.value = index
    creatingSlot.value = null
    ui.toast(`修士“${name.value.trim()}”已录入角色库。`, 'success')
    ui.showGame()
  } catch (cause) {
    formError.value = cause instanceof Error ? cause.message : '创建角色失败'
  }
}

async function enterSelected() {
  if (!selected.value || !saves.selectSlot(selectedSlot.value)) return
  combat.reset()
  afk.clearSummary()
  ui.showGame()
  const summary = await afk.recoverOffline()
  if (summary) ui.toast(`已结算 ${summary.fights} 场离线历练。`, 'success')
}

async function removeSelected() {
  const slot = selected.value
  if (!slot) return
  const accepted = await ui.confirm(`将永久删除修士“${String(slot.name || '未命名')}”及其本地存档。此操作无法撤销。`, {
    title: '删除角色',
    confirmLabel: '确认删除',
    danger: true,
  })
  if (!accepted) return
  await saves.deleteCharacter(selectedSlot.value)
  const firstOccupied = saves.slots.findIndex(Boolean)
  selectedSlot.value = firstOccupied >= 0 ? firstOccupied : 0
  ui.toast('角色已删除。', 'warning')
}
</script>

<template>
  <main id="native-main" class="legacy-roster-screen">
    <h1 class="sr-only">凡修录角色库</h1>
    <div class="legacy-roster-backdrop" aria-hidden="true" />
    <div class="legacy-roster-scene" aria-hidden="true">
      <svg viewBox="0 0 600 700" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="native-stone" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#d6c6aa" /><stop offset="1" stop-color="#75634b" /></linearGradient>
          <linearGradient id="native-gold" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#f0d27a" /><stop offset="1" stop-color="#8a6a1f" /></linearGradient>
        </defs>
        <rect x="60" y="430" width="80" height="200" fill="url(#native-stone)" stroke="#3d2f1a" />
        <rect x="50" y="420" width="100" height="18" fill="url(#native-gold)" stroke="#3d2f1a" />
        <rect x="50" y="625" width="100" height="14" fill="url(#native-gold)" stroke="#3d2f1a" />
        <rect x="460" y="430" width="80" height="200" fill="url(#native-stone)" stroke="#3d2f1a" />
        <rect x="450" y="420" width="100" height="18" fill="url(#native-gold)" stroke="#3d2f1a" />
        <rect x="450" y="625" width="100" height="14" fill="url(#native-gold)" stroke="#3d2f1a" />
        <path d="M170 640V340Q170 160 300 160T430 340V640Z" fill="url(#native-stone)" stroke="#3d2f1a" stroke-width="2" />
        <path d="M170 340Q170 160 300 160T430 340" fill="none" stroke="url(#native-gold)" stroke-width="10" />
        <path d="M210 640V360Q210 200 300 200T390 360V640Z" fill="#5a7da3" opacity=".55" />
        <ellipse cx="300" cy="660" rx="240" ry="34" fill="#a8792f" stroke="#3d2f1a" />
        <ellipse cx="300" cy="660" rx="190" ry="25" fill="none" stroke="#5b3f12" stroke-width="2" />
      </svg>
    </div>

    <div class="legacy-roster-nameplate" aria-live="polite">
      <strong v-if="selected">{{ selected.name }} [{{ selected.level || 1 }} {{ normalizeCharacterClassId(selected.cls) || DEFAULT_CHARACTER_CLASS_ID }}]</strong>
      <strong v-else>未选择角色</strong>
      <span>{{ selected ? selectedZone : '' }}</span>
    </div>

    <div v-if="selected" class="legacy-roster-avatar" :style="{ transform: `translateX(-50%) rotateY(${avatarRotation}deg)` }">
      <LegacyCultivatorAvatar :appearance="selected.appearance as Record<string, unknown>" :label="`${selected.name}的角色形象`" />
    </div>

    <aside class="legacy-roster-panel" aria-label="角色库">
      <h2 class="sr-only">选择修士</h2>
      <div class="legacy-rpg-header">角色库</div>
      <div class="legacy-roster-actions">
        <button type="button" :disabled="!selected" @click="enterSelected">探索</button>
        <button type="button" :disabled="!selected" @click="removeSelected">删除</button>
        <button type="button" :disabled="!selected" @click="avatarRotation += 45">轮换</button>
      </div>
      <div class="legacy-slot-list" aria-label="角色槽位">
        <button
          v-for="(slot, index) in saves.slots"
          :key="index"
          type="button"
          :class="{ 'is-selected': selectedSlot === index, 'is-empty': !slot }"
          :aria-label="slot ? `槽位 ${index + 1} ${slot.name}` : `槽位 ${index + 1} 创建角色`"
          @click="selectSlot(index)"
        >
          <template v-if="slot">
            <strong>{{ slot.name }}</strong>
            <small>{{ String((slot.v2Progression as Record<string, unknown> | undefined)?.rootId || '五行伪灵根') }} · {{ normalizeCharacterClassId(slot.cls) || DEFAULT_CHARACTER_CLASS_ID }} · 修为等级 {{ slot.level || 1 }}</small>
          </template>
          <template v-else>创建角色</template>
        </button>
      </div>
      <div class="legacy-roster-bottom">
        <button type="button" @click="ui.showLogin">离开</button>
        <button class="is-primary" type="button" :disabled="!selected" @click="enterSelected">进入修仙界</button>
      </div>
    </aside>

    <section v-if="creatingSlot !== null" class="legacy-create-backdrop" aria-label="创建角色">
      <div class="legacy-create-window">
        <header>
          <div><small>槽位 {{ creatingSlot + 1 }} · 步骤 {{ creationStep }}/4</small><h2 id="create-title">{{ stepLabels[creationStep - 1] }}</h2></div>
          <button type="button" aria-label="取消创建" @click="cancelCreate">×</button>
        </header>
        <div class="legacy-create-steps" aria-label="角色创建步骤">
          <span v-for="(label, index) in stepLabels" :key="label" :class="{ 'is-active': creationStep === index + 1, 'is-complete': creationStep > index + 1 }">{{ index + 1 }}. {{ label }}</span>
        </div>
        <form @submit.prevent="create">
          <fieldset v-if="creationStep === 1">
            <legend>选择灵根与体质</legend>
            <div class="legacy-choice-grid" aria-label="灵根资质">
              <button v-for="group in P2_ROOT_GROUPS" :key="group.id" type="button" :class="{ 'is-selected': rootTier === group.id }" @click="chooseRootTier(group.id)"><strong>{{ group.id }}</strong><small>{{ group.qualification }} · {{ group.rootIds.length }} 种组合</small></button>
            </div>
            <div class="legacy-choice-grid legacy-root-choice-grid">
              <button v-for="option in rootOptions" :key="option" type="button" :class="{ 'is-selected': rootId === option }" @click="chooseRoot(option)">{{ option }}</button>
            </div>
            <dl class="legacy-create-review legacy-root-review">
              <div><dt>资质</dt><dd>{{ rootProfile.grade }} · {{ rootProfile.tier }}</dd></div>
              <div><dt>可学属性</dt><dd>{{ getP2RootElementLabels(rootProfile).join('、') }}</dd></div>
              <div><dt>修炼速度</dt><dd>天灵根的 {{ Math.round(rootProfile.cultivationRate * 100) }}%</dd></div>
            </dl>
          </fieldset>
          <fieldset v-else-if="creationStep === 2">
            <legend>选择初始传承</legend>
            <div class="legacy-choice-grid">
              <button v-for="option in availableClasses" :key="option" type="button" :class="{ 'is-selected': classId === option }" @click="classId = option">{{ option }}</button>
            </div>
            <legend>选择主天赋与副天赋</legend>
            <p>本槽位固定提供以下三个天赋，不提供重抽。</p>
            <div class="legacy-choice-grid">
              <button v-for="talent in talentChoices" :key="`main-${talent}`" type="button" :class="{ 'is-selected': mainTalentId === talent }" @click="mainTalentId = talent; if (secondaryTalentId === talent) secondaryTalentId = talentChoices.find((entry) => entry !== talent) || secondaryTalentId"><strong>主：{{ talent }}</strong><small>{{ P2_TALENT_PROFILES[talent].description }}</small></button>
            </div>
            <div class="legacy-choice-grid">
              <button v-for="talent in talentChoices.filter((entry) => entry !== mainTalentId)" :key="`secondary-${talent}`" type="button" :class="{ 'is-selected': secondaryTalentId === talent }" @click="secondaryTalentId = talent"><strong>副：{{ talent }}</strong><small>{{ P2_TALENT_PROFILES[talent].description }}</small></button>
            </div>
          </fieldset>
          <fieldset v-else-if="creationStep === 3" class="legacy-appearance-step">
            <legend>设置角色外观</legend>
            <div class="legacy-appearance-preview"><LegacyCultivatorAvatar :appearance="{ sex, hairstyle, tone, robe }" label="角色外观预览" /></div>
            <div class="legacy-appearance-controls">
              <label><span>性别</span><select v-model="sex"><option value="male">男修</option><option value="female">女修</option></select></label>
              <label><span>发式</span><select v-model="hairstyle"><option>束发</option><option>披发</option><option>高髻</option><option>短发</option></select></label>
              <label><span>肤色</span><select v-model="tone"><option>自然</option><option>白皙</option><option>小麦</option><option>古铜</option></select></label>
              <label><span>衣着</span><select v-model="robe"><option>青衫</option><option>玄袍</option><option>赤衣</option><option>素衣</option></select></label>
            </div>
          </fieldset>
          <fieldset v-else>
            <legend>输入道号并确认</legend>
            <dl class="legacy-create-review">
              <div><dt>灵根/体质</dt><dd>{{ rootId }}</dd></div>
              <div><dt>初始传承</dt><dd>{{ classId }}</dd></div>
              <div><dt>天赋</dt><dd>{{ mainTalentId }} · {{ secondaryTalentId }}</dd></div>
              <div><dt>修行体系</dt><dd>回合制斗法 · 灵根资质成长</dd></div>
              <div><dt>外观</dt><dd>{{ appearancePreview.sex }} · {{ appearancePreview.hairstyle }} · {{ appearancePreview.robe }}</dd></div>
            </dl>
            <label class="legacy-name-field"><span>道号</span><input v-model="name" maxlength="24" required placeholder="至少两个字符" autocomplete="off" /></label>
            <p>生死劫永久删档暂未开放。</p>
          </fieldset>
          <p v-if="formError" class="form-error" role="alert">{{ formError }}</p>
          <footer>
            <button v-if="creationStep > 1" type="button" @click="previousStep">上一步</button>
            <span />
            <button v-if="creationStep < 4" class="is-primary" type="button" @click="nextStep">下一步</button>
            <button v-else class="is-primary" type="submit">创建并进入</button>
          </footer>
        </form>
      </div>
    </section>
  </main>
</template>
