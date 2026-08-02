import { ref } from 'vue'
import { defineStore } from 'pinia'

export type AppScreen = 'login' | 'roster' | 'game'
export type GamePanel = 'combat' | 'inventory' | 'equipment' | 'spells' | 'zones' | 'quests' | 'settings'
export type ToastTone = 'info' | 'success' | 'warning' | 'danger'

export interface NativeToast {
  id: number
  message: string
  tone: ToastTone
}

export interface NativeConfirmDialog {
  title: string
  message: string
  confirmLabel: string
  danger: boolean
}

export const useUiStore = defineStore('ui', () => {
  const screen = ref<AppScreen>('login')
  const panel = ref<GamePanel>('combat')
  const mobileMenuOpen = ref(false)
  const toasts = ref<NativeToast[]>([])
  const dialog = ref<NativeConfirmDialog | null>(null)
  let toastId = 0
  let dialogResolver: ((accepted: boolean) => void) | null = null

  function startLocal(): void {
    screen.value = 'roster'
  }

  function showLogin(): void {
    screen.value = 'login'
    mobileMenuOpen.value = false
  }

  function showRoster(): void {
    screen.value = 'roster'
    mobileMenuOpen.value = false
  }

  function showGame(): void {
    screen.value = 'game'
    mobileMenuOpen.value = false
  }

  function openPanel(nextPanel: GamePanel): void {
    panel.value = nextPanel
    mobileMenuOpen.value = false
  }

  function toast(message: string, tone: ToastTone = 'info', duration = 3200): void {
    const id = ++toastId
    toasts.value.push({ id, message, tone })
    globalThis.setTimeout(() => dismissToast(id), Math.max(800, duration))
  }

  function dismissToast(id: number): void {
    toasts.value = toasts.value.filter((entry) => entry.id !== id)
  }

  function confirm(
    message: string,
    options: Partial<Omit<NativeConfirmDialog, 'message'>> = {},
  ): Promise<boolean> {
    if (dialogResolver) dialogResolver(false)
    dialog.value = {
      title: options.title || '请确认操作',
      message,
      confirmLabel: options.confirmLabel || '确认',
      danger: options.danger === true,
    }
    return new Promise((resolve) => {
      dialogResolver = resolve
    })
  }

  function resolveConfirm(accepted: boolean): void {
    const resolve = dialogResolver
    dialogResolver = null
    dialog.value = null
    resolve?.(accepted)
  }

  return {
    screen,
    panel,
    mobileMenuOpen,
    toasts,
    dialog,
    startLocal,
    showLogin,
    showRoster,
    showGame,
    openPanel,
    toast,
    dismissToast,
    confirm,
    resolveConfirm,
  }
})
