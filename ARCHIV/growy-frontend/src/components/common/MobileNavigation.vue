<template>
  <!-- ✅ NEU: Mobile-spezifische Navigation -->
  <div class="mobile-navigation d-md-none">
    <!-- Bottom Navigation für Mobile -->
    <v-bottom-navigation
      v-model="activeTab"
      :color="navigationColor"
      :elevation="8"
      class="mobile-bottom-nav"
      @update:model-value="handleTabChange"
    >
      <v-btn
        v-for="item in mobileNavItems"
        :key="item.value"
        :value="item.value"
        :to="item.route"
        :aria-label="item.ariaLabel"
        class="mobile-nav-btn"
      >
        <v-icon :icon="item.icon" size="small" />
        <span class="mobile-nav-label">{{ item.label }}</span>
      </v-btn>
    </v-bottom-navigation>

    <!-- Mobile Header (wenn nicht in Bottom Navigation) -->
    <v-app-bar v-if="showMobileHeader" :color="headerColor" :elevation="4" class="mobile-header">
      <v-app-bar-nav-icon
        @click="toggleMobileMenu"
        :aria-label="mobileMenuOpen ? 'Menü schließen' : 'Menü öffnen'"
      />

      <v-app-bar-title class="mobile-title">
        <span class="d-none d-sm-inline">{{ pageTitle }}</span>
        <span class="d-sm-none">{{ shortPageTitle }}</span>
      </v-app-bar-title>

      <v-spacer />

      <!-- Mobile Actions -->
      <div class="mobile-actions">
        <v-btn
          icon="mdi-refresh"
          size="small"
          variant="text"
          @click="handleRefresh"
          :loading="refreshing"
          aria-label="Seite aktualisieren"
        />

        <v-btn
          icon="mdi-cog"
          size="small"
          variant="text"
          to="/settings"
          aria-label="Einstellungen öffnen"
        />
      </div>
    </v-app-bar>

    <!-- Mobile Menu Drawer -->
    <v-navigation-drawer
      v-model="mobileMenuOpen"
      location="left"
      temporary
      :width="280"
      class="mobile-menu-drawer"
    >
      <v-list>
        <v-list-item
          v-for="item in mobileMenuItems"
          :key="item.value"
          :to="item.route"
          :prepend-icon="item.icon"
          :title="item.title"
          :subtitle="item.subtitle"
          @click="mobileMenuOpen = false"
        />
      </v-list>

      <!-- Mobile Menu Footer -->
      <template #append>
        <v-divider />
        <v-list>
          <v-list-item
            prepend-icon="mdi-theme-light-dark"
            title="Theme wechseln"
            @click="toggleTheme"
          />
          <!-- About-Menüpunkt entfernt -->
        </v-list>
      </template>
    </v-navigation-drawer>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useThemeStore } from '@/stores/theme'

const route = useRoute()
const router = useRouter()
const themeStore = useThemeStore()

// ✅ NEU: Mobile Navigation State
const activeTab = ref(0)
const mobileMenuOpen = ref(false)
const refreshing = ref(false)

// ✅ NEU: Mobile Navigation Items
const mobileNavItems = computed(() => [
  {
    value: 0,
    label: 'Dashboard',
    shortLabel: 'Home',
    icon: 'mdi-view-dashboard',
    route: '/dashboard',
    ariaLabel: 'Zum Dashboard navigieren',
  },
  {
    value: 1,
    label: 'Agenten',
    shortLabel: 'Agenten',
    icon: 'mdi-map-marker',
    route: '/zones',
    ariaLabel: 'Agenten verwalten',
  },
  {
    value: 2,
    label: 'Einstellungen',
    shortLabel: 'Config',
    icon: 'mdi-cog',
    route: '/settings',
    ariaLabel: 'Einstellungen öffnen',
  },
  {
    value: 3,
    label: 'Debug',
    shortLabel: 'Debug',
    icon: 'mdi-bug',
    route: '/dev',
    ariaLabel: 'Debug-Tools öffnen',
  },
])

// ✅ NEU: Mobile Menu Items
const mobileMenuItems = computed(() => [
  {
    value: 'dashboard',
    title: 'Dashboard',
    subtitle: 'System-Übersicht',
    icon: 'mdi-view-dashboard',
    route: '/dashboard',
  },
  {
    value: 'zones',
    title: 'Agenten',
    subtitle: 'Agenten verwalten',
    icon: 'mdi-map-marker',
    route: '/zones',
  },
  {
    value: 'devices',
    title: 'Geräte',
    subtitle: 'Hardware verwalten',
    icon: 'mdi-devices-group',
    route: '/devices',
  },
  {
    value: 'settings',
    title: 'Einstellungen',
    subtitle: 'System konfigurieren',
    icon: 'mdi-cog',
    route: '/settings',
  },
  {
    value: 'debug',
    title: 'Debug Tools',
    subtitle: 'Entwickler-Tools',
    icon: 'mdi-bug',
    route: '/dev',
  },
])

// ✅ NEU: Computed Properties
const navigationColor = computed(() => (themeStore.getIsDark ? 'primary' : 'primary'))
const headerColor = computed(() => (themeStore.getIsDark ? 'surface' : 'surface'))
const showMobileHeader = computed(() => !['dashboard', 'zones'].includes(route.name))

const pageTitle = computed(() => {
  const routeNames = {
    dashboard: 'Dashboard',
    zones: 'Zonen',
    settings: 'Einstellungen',
    devices: 'Geräte',
    development: 'Debug Tools',
  }
  return routeNames[route.name] || 'Growy System'
})

const shortPageTitle = computed(() => {
  const shortNames = {
    dashboard: 'Home',
    zones: 'Zonen',
    settings: 'Config',
    devices: 'Devices',
    development: 'Debug',
  }
  return shortNames[route.name] || 'Growy'
})

// ✅ NEU: Event Handlers
const handleTabChange = (value) => {
  const item = mobileNavItems.value.find((item) => item.value === value)
  if (item && item.route !== route.path) {
    router.push(item.route)
  }
}

const toggleMobileMenu = () => {
  mobileMenuOpen.value = !mobileMenuOpen.value
}

const handleRefresh = async () => {
  refreshing.value = true
  try {
    // Hier könnte eine Refresh-Logik implementiert werden
    await new Promise((resolve) => setTimeout(resolve, 1000))
    window.location.reload()
  } finally {
    refreshing.value = false
  }
}

const toggleTheme = () => {
  themeStore.toggleTheme()
}

// ✅ NEU: Lifecycle
onMounted(() => {
  // Aktiven Tab basierend auf Route setzen
  const currentItem = mobileNavItems.value.find((item) => item.route === route.path)
  if (currentItem) {
    activeTab.value = currentItem.value
  }
})

onUnmounted(() => {
  mobileMenuOpen.value = false
})
</script>

<style scoped>
/* ✅ NEU: Mobile-spezifische Styles */
.mobile-navigation {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 1000;
}

.mobile-bottom-nav {
  border-top: 1px solid rgba(0, 0, 0, 0.12);
}

.mobile-nav-btn {
  min-width: 64px;
  height: 56px;
}

.mobile-nav-label {
  font-size: 0.75rem;
  margin-top: 2px;
}

.mobile-header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 999;
}

.mobile-title {
  font-size: 1.125rem;
  font-weight: 600;
}

.mobile-actions {
  display: flex;
  gap: 8px;
}

.mobile-menu-drawer {
  z-index: 1001;
}

/* ✅ NEU: Dark Mode Anpassungen */
:deep(.v-bottom-navigation) {
  background-color: var(--color-background);
  border-top-color: var(--color-border);
}

:deep(.v-app-bar) {
  background-color: var(--color-background);
}

/* ✅ NEU: Responsive Anpassungen */
@media (max-width: 480px) {
  .mobile-nav-label {
    font-size: 0.625rem;
  }

  .mobile-title {
    font-size: 1rem;
  }
}
</style>
