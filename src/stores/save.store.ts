import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { LegacyProgressionApplication } from '../application/legacy'
import {
  createEmptyLegacySlots,
  exportNativeSlotsToLegacy,
  importLegacySlotsToNative,
  migrateLegacyCharacterInPlace,
  type CreateNativeCharacterInput,
  type LegacyCharacterSave,
  type LegacySaveIssue,
  type LegacySlots,
} from '../game-core/save'
import type { SaveRepository } from '../repositories/save.repository'
import { getSaveRepository } from '../services/save-repository.provider'

export const useSaveStore = defineStore('save', () => {
  const progression = new LegacyProgressionApplication()
  const slots = ref<LegacySlots>(createEmptyLegacySlots())
  const activeSlot = ref(-1)
  const loaded = ref(false)
  const loading = ref(false)
  const saving = ref(false)
  const issues = ref<LegacySaveIssue[]>([])
  const error = ref('')
  const lastSavedAt = ref<number | null>(null)
  let persistQueued = false
  let queuedRepository: SaveRepository | null = null

  const activeCharacter = computed<LegacyCharacterSave | null>(() =>
    activeSlot.value >= 0 ? slots.value[activeSlot.value] ?? null : null,
  )
  const occupiedCount = computed(() => slots.value.filter(Boolean).length)

  async function initialize(repository: SaveRepository = getSaveRepository()): Promise<void> {
    if (loading.value) return
    loading.value = true
    error.value = ''
    try {
      const result = await repository.load()
      const migrated = result.slots.map((slot) => {
        if (!slot) return null
        return migrateLegacyCharacterInPlace(slot)
      })
      const nativeSlots = importLegacySlotsToNative(migrated)
      const removedSlots = migrated.flatMap((slot, index) => slot && !nativeSlots[index] ? [index] : [])
      slots.value = nativeSlots
      issues.value = [
        ...result.issues,
        ...removedSlots.map((slot) => ({ code: 'invalid-slot' as const, slot })),
      ]
      if (removedSlots.length) {
        await repository.createBackup(migrated, { kind: 'obsolete-ruleset' })
        const cleaned = await repository.save(exportNativeSlotsToLegacy(nativeSlots), { activeSlot: -1 })
        lastSavedAt.value = Date.parse(cleaned.health.savedAt)
      }
      loaded.value = true
      if (activeSlot.value >= 0 && !slots.value[activeSlot.value]) activeSlot.value = -1
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : '读取存档失败'
      throw cause
    } finally {
      loading.value = false
    }
  }

  function selectSlot(index: number): boolean {
    const normalized = Math.floor(index)
    if (normalized < 0 || normalized >= slots.value.length || !slots.value[normalized]) return false
    activeSlot.value = normalized
    return true
  }

  function leaveCharacter(): void {
    activeSlot.value = -1
  }

  async function createCharacter(
    index: number,
    input: CreateNativeCharacterInput,
    repository: SaveRepository = getSaveRepository(),
  ): Promise<LegacyCharacterSave> {
    const normalized = Math.floor(index)
    if (normalized < 0 || normalized >= slots.value.length) throw new RangeError('角色槽位无效')
    if (slots.value[normalized]) throw new Error('角色槽位已被占用')
    const character = progression.createCharacter(input)
    slots.value[normalized] = character
    activeSlot.value = normalized
    await persist(repository)
    return character
  }

  async function deleteCharacter(index: number, repository: SaveRepository = getSaveRepository()): Promise<boolean> {
    const normalized = Math.floor(index)
    if (normalized < 0 || normalized >= slots.value.length || !slots.value[normalized]) return false
    slots.value[normalized] = null
    if (activeSlot.value === normalized) activeSlot.value = -1
    await persist(repository)
    return true
  }

  function replaceActiveCharacter(character: LegacyCharacterSave): void {
    if (activeSlot.value < 0) throw new Error('没有已激活的角色')
    slots.value[activeSlot.value] = character
  }

  function replaceAllSlots(nextSlots: LegacySlots, nextActiveSlot = -1): void {
    slots.value = nextSlots
    activeSlot.value = nextActiveSlot >= 0 && nextSlots[nextActiveSlot] ? nextActiveSlot : -1
  }

  async function persist(repository: SaveRepository = getSaveRepository()): Promise<void> {
    if (saving.value) {
      persistQueued = true
      queuedRepository = repository
      return
    }
    saving.value = true
    error.value = ''
    try {
      let targetRepository = repository
      do {
        persistQueued = false
        queuedRepository = null
        const active = activeCharacter.value
        if (active) active.lastSaved = Date.now()
        const legacySlots = exportNativeSlotsToLegacy(slots.value)
        const serializedSnapshot = JSON.stringify(legacySlots)
        await targetRepository.createBackup(legacySlots, { kind: 'auto' })
        const result = await targetRepository.save(legacySlots, { activeSlot: activeSlot.value })
        const currentSlots = exportNativeSlotsToLegacy(slots.value)
        if (JSON.stringify(currentSlots) === serializedSnapshot) {
          slots.value = importLegacySlotsToNative(result.slots)
        } else {
          persistQueued = true
        }
        lastSavedAt.value = Date.parse(result.health.savedAt)
        if (queuedRepository) targetRepository = queuedRepository
      } while (persistQueued)
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : '保存失败'
      throw cause
    } finally {
      saving.value = false
    }
  }

  return {
    slots,
    activeSlot,
    activeCharacter,
    occupiedCount,
    loaded,
    loading,
    saving,
    issues,
    error,
    lastSavedAt,
    initialize,
    selectSlot,
    leaveCharacter,
    createCharacter,
    deleteCharacter,
    replaceActiveCharacter,
    replaceAllSlots,
    persist,
  }
})
