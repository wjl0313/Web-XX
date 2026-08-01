<script setup lang="ts">
import { computed, ref } from 'vue'
import { ChevronRight, Plus, Trash2, UserRound, X } from 'lucide-vue-next'

import {
  CHARACTER_RACE_CLASS_RULES,
  CHARACTER_RACE_IDS,
  DEFAULT_CHARACTER_CLASS_ID,
  DEFAULT_CHARACTER_RACE_ID,
  normalizeCharacterClassId,
  normalizeCharacterRaceId,
  type CharacterClassId,
  type CharacterRaceId,
} from '../../game-core/domain'
import { useAfkStore } from '../../stores/afk.store'
import { useSaveStore } from '../../stores/save.store'
import { useUiStore } from '../../stores/ui.store'

const saves = useSaveStore()
const ui = useUiStore()
const afk = useAfkStore()
const creatingSlot = ref<number | null>(null)
const deleteArmed = ref<number | null>(null)
const name = ref('')
const race = ref<CharacterRaceId>(DEFAULT_CHARACTER_RACE_ID)
const classId = ref<CharacterClassId>(DEFAULT_CHARACTER_CLASS_ID)
const hardcore = ref(false)
const formError = ref('')

const availableClasses = computed(() => CHARACTER_RACE_CLASS_RULES[race.value])

function openCreate(index: number) {
  creatingSlot.value = index
  deleteArmed.value = null
  formError.value = ''
  name.value = ''
  race.value = DEFAULT_CHARACTER_RACE_ID
  classId.value = DEFAULT_CHARACTER_CLASS_ID
  hardcore.value = false
}

function changeRace() {
  if (!availableClasses.value.includes(classId.value)) classId.value = availableClasses.value[0]
}

async function create() {
  if (creatingSlot.value === null) return
  formError.value = ''
  try {
    await saves.createCharacter(creatingSlot.value, {
      name: name.value,
      race: race.value,
      classId: classId.value,
      hardcore: hardcore.value,
    })
    creatingSlot.value = null
    ui.showGame()
  } catch (cause) {
    formError.value = cause instanceof Error ? cause.message : '创建角色失败'
  }
}

async function enter(index: number) {
  if (!saves.selectSlot(index)) return
  ui.showGame()
  await afk.recoverOffline()
}

async function remove(index: number) {
  if (deleteArmed.value !== index) {
    deleteArmed.value = index
    return
  }
  await saves.deleteCharacter(index)
  deleteArmed.value = null
}
</script>

<template>
  <main id="native-main" class="roster-shell">
    <header class="roster-header">
      <div class="brand-lockup">
        <span class="brand-seal" aria-hidden="true">凡</span>
        <div>
          <p class="eyebrow">洞府玉册</p>
          <h1>凡修录</h1>
        </div>
      </div>
      <div class="roster-summary">
        <strong>{{ saves.occupiedCount }}</strong>
        <span>位修士 / 24 个槽位</span>
      </div>
    </header>

    <section v-if="creatingSlot !== null" class="creation-band" aria-labelledby="create-title">
      <div class="creation-band__heading">
        <div>
          <p class="eyebrow">槽位 {{ creatingSlot + 1 }}</p>
          <h2 id="create-title">录入新修士</h2>
        </div>
        <button class="icon-button" type="button" title="取消创建" aria-label="取消创建" @click="creatingSlot = null">
          <X :size="18" />
        </button>
      </div>
      <form class="creation-form" @submit.prevent="create">
        <label>
          <span>道号</span>
          <input v-model="name" maxlength="24" required placeholder="至少两个字符" autocomplete="off" />
        </label>
        <label>
          <span>灵根与体质</span>
          <select v-model="race" @change="changeRace">
            <option v-for="option in CHARACTER_RACE_IDS" :key="option" :value="option">{{ option }}</option>
          </select>
        </label>
        <label>
          <span>初始传承</span>
          <select v-model="classId">
            <option v-for="option in availableClasses" :key="option" :value="option">{{ option }}</option>
          </select>
        </label>
        <label class="check-control">
          <input v-model="hardcore" type="checkbox" />
          <span>生死劫模式</span>
        </label>
        <p v-if="formError" class="form-error" role="alert">{{ formError }}</p>
        <button class="button button--primary" type="submit">
          <Plus :size="17" />
          创建并进入
        </button>
      </form>
    </section>

    <section class="slot-section" aria-labelledby="slot-title">
      <div class="section-heading">
        <div>
          <p class="eyebrow">本地存档</p>
          <h2 id="slot-title">选择修士</h2>
        </div>
        <p>旧版存档会在读取时自动迁移，原始字段保持兼容。</p>
      </div>

      <div class="slot-grid">
        <article v-for="(slot, index) in saves.slots" :key="index" class="slot-card" :class="{ 'slot-card--empty': !slot }">
          <template v-if="slot">
            <div class="slot-card__index">{{ String(index + 1).padStart(2, '0') }}</div>
            <div class="slot-card__avatar" aria-hidden="true"><UserRound :size="25" /></div>
            <div class="slot-card__body">
              <h3>{{ slot.name }}</h3>
              <p>{{ normalizeCharacterRaceId(slot.race) || DEFAULT_CHARACTER_RACE_ID }} · {{ normalizeCharacterClassId(slot.cls) || DEFAULT_CHARACTER_CLASS_ID }}</p>
              <div class="slot-card__meta">
                <span>修为等级 {{ slot.level || 1 }}</span>
                <span>{{ Number(slot.gold || 0).toLocaleString('zh-CN') }} 灵石</span>
              </div>
            </div>
            <div class="slot-card__actions">
              <button class="button button--primary" type="button" @click="enter(index)">
                进入修仙界 <ChevronRight :size="16" />
              </button>
              <button class="icon-button icon-button--danger" type="button" :title="deleteArmed === index ? '再次点击确认删除' : '删除角色'" :aria-label="deleteArmed === index ? '再次点击确认删除角色' : '删除角色'" @click="remove(index)">
                <Trash2 :size="16" />
              </button>
            </div>
          </template>
          <button v-else class="empty-slot" type="button" @click="openCreate(index)">
            <Plus :size="18" />
            <span>槽位 {{ index + 1 }}</span>
            <small>创建角色</small>
          </button>
        </article>
      </div>
    </section>
  </main>
</template>
