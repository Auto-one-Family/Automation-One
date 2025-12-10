import { defineStore } from 'pinia'
import { storage } from '@/utils/storage'

export const useThemeStore = defineStore('theme', {
  state: () => ({
    // ✅ NEU: Theme-Management
    currentTheme: storage.load('theme', 'light'), // 'light' | 'dark' | 'auto'
    systemTheme: 'light', // Erkannte System-Einstellung
    isDark: false, // Aktueller Dark-Mode-Status

    // ✅ NEU: Theme-Statistiken
    themeStats: {
      lastChange: null,
      changeCount: 0,
      preferredTheme: 'light',
    },
  }),

  getters: {
    // ✅ NEU: Aktueller Theme-Status
    getCurrentTheme: (state) => state.currentTheme,
    getIsDark: (state) => state.isDark,
    getSystemTheme: (state) => state.systemTheme,

    // ✅ NEU: Theme-Optionen für UI
    getThemeOptions: () => [
      { value: 'light', title: 'Hell', icon: 'mdi-white-balance-sunny' },
      { value: 'dark', title: 'Dunkel', icon: 'mdi-weather-night' },
      { value: 'auto', title: 'Automatisch', icon: 'mdi-theme-light-dark' },
    ],

    // ✅ NEU: Theme-Statistiken
    getThemeStats: (state) => state.themeStats,
  },

  actions: {
    // ✅ NEU: Theme initialisieren
    initializeTheme() {
      // System-Theme erkennen
      this.detectSystemTheme()

      // Theme anwenden
      this.applyTheme()

      // System-Theme-Listener
      this.setupSystemThemeListener()
    },

    // ✅ NEU: System-Theme erkennen
    detectSystemTheme() {
      if (typeof window !== 'undefined' && window.matchMedia) {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
        this.systemTheme = mediaQuery.matches ? 'dark' : 'light'
      }
    },

    // ✅ NEU: System-Theme-Listener
    setupSystemThemeListener() {
      if (typeof window !== 'undefined' && window.matchMedia) {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

        const handleChange = (e) => {
          this.systemTheme = e.matches ? 'dark' : 'light'
          if (this.currentTheme === 'auto') {
            this.applyTheme()
          }
        }

        mediaQuery.addEventListener('change', handleChange)
      }
    },

    // ✅ NEU: Theme anwenden
    applyTheme() {
      let targetTheme = this.currentTheme

      if (targetTheme === 'auto') {
        targetTheme = this.systemTheme
      }

      this.isDark = targetTheme === 'dark'

      // Vuetify Theme anwenden
      this.applyVuetifyTheme(targetTheme)

      // CSS-Variablen anwenden
      this.applyCSSVariables(targetTheme)

      // HTML-Attribut setzen
      this.applyHTMLAttributes(targetTheme)

      // Statistiken aktualisieren
      this.updateThemeStats()
    },

    // ✅ NEU: Vuetify Theme anwenden
    applyVuetifyTheme(theme) {
      // Vuetify Theme wird über main.js verwaltet
      // Hier können zusätzliche Vuetify-spezifische Anpassungen erfolgen
      console.log(`🎨 Vuetify Theme angewendet: ${theme}`)
    },

    // ✅ NEU: CSS-Variablen anwenden
    applyCSSVariables(theme) {
      const root = document.documentElement

      if (theme === 'dark') {
        root.style.setProperty('--color-background', '#181818')
        root.style.setProperty('--color-background-soft', '#222222')
        root.style.setProperty('--color-background-mute', '#282828')
        root.style.setProperty('--color-border', 'rgba(84, 84, 84, 0.48)')
        root.style.setProperty('--color-border-hover', 'rgba(84, 84, 84, 0.65)')
        root.style.setProperty('--color-heading', '#ffffff')
        root.style.setProperty('--color-text', 'rgba(235, 235, 235, 0.64)')
      } else {
        root.style.setProperty('--color-background', '#ffffff')
        root.style.setProperty('--color-background-soft', '#f8f8f8')
        root.style.setProperty('--color-background-mute', '#f2f2f2')
        root.style.setProperty('--color-border', 'rgba(60, 60, 60, 0.12)')
        root.style.setProperty('--color-border-hover', 'rgba(60, 60, 60, 0.29)')
        root.style.setProperty('--color-heading', '#2c3e50')
        root.style.setProperty('--color-text', '#2c3e50')
      }
    },

    // ✅ NEU: HTML-Attribute setzen
    applyHTMLAttributes(theme) {
      const html = document.documentElement

      if (theme === 'dark') {
        html.setAttribute('data-theme', 'dark')
        html.classList.add('dark')
        html.classList.remove('light')
      } else {
        html.setAttribute('data-theme', 'light')
        html.classList.add('light')
        html.classList.remove('dark')
      }
    },

    // ✅ NEU: Theme wechseln
    setTheme(theme) {
      if (!['light', 'dark', 'auto'].includes(theme)) {
        console.error(`Ungültiges Theme: ${theme}`)
        return
      }

      this.currentTheme = theme
      storage.save('theme', theme)
      this.applyTheme()
    },

    // ✅ NEU: Theme umschalten
    toggleTheme() {
      const newTheme = this.isDark ? 'light' : 'dark'
      this.setTheme(newTheme)
    },

    // ✅ NEU: Statistiken aktualisieren
    updateThemeStats() {
      this.themeStats.lastChange = Date.now()
      this.themeStats.changeCount++
      this.themeStats.preferredTheme = this.currentTheme

      storage.save('theme_stats', this.themeStats)
    },

    // ✅ NEU: Theme zurücksetzen
    resetTheme() {
      this.setTheme('light')
      this.themeStats = {
        lastChange: null,
        changeCount: 0,
        preferredTheme: 'light',
      }
      storage.save('theme_stats', this.themeStats)
    },
  },
})
