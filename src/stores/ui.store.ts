import { defineStore } from 'pinia'

export type AppScreen = 'roster' | 'game'
export type GamePanel = 'combat' | 'inventory' | 'equipment' | 'spells' | 'zones' | 'quests' | 'settings'

export const useUiStore = defineStore('ui', {
  state: () => ({
    screen: 'roster' as AppScreen,
    panel: 'combat' as GamePanel,
    mobileMenuOpen: false,
  }),
  actions: {
    showRoster() {
      this.screen = 'roster'
      this.mobileMenuOpen = false
    },
    showGame() {
      this.screen = 'game'
      this.mobileMenuOpen = false
    },
    openPanel(panel: GamePanel) {
      this.panel = panel
      this.mobileMenuOpen = false
    },
  },
})
