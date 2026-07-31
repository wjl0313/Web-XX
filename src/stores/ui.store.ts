import { defineStore } from 'pinia'

export type AppScreen = 'game'

export const useUiStore = defineStore('ui', {
  state: () => ({
    screen: 'game' as AppScreen,
  }),
})
