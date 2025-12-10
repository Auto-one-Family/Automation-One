<template>
  <v-app-bar app elevation="4" color="primary" dark height="72" class="enhanced-navigation">
    <!-- Logo und Titel -->
    <v-app-bar-title class="d-flex align-center brand-section">
      <div class="system-icon-container">
        <v-icon :icon="getSystemIcon()" size="28" class="system-icon" />
      </div>
      <div class="brand-text-container ml-3">
        <div class="system-title d-none d-sm-block">{{ getDynamicTitle() }}</div>
        <div class="system-subtitle d-none d-md-block">IoT Control System</div>
      </div>
      <v-chip
        v-if="getSystemBadge()"
        color="white"
        size="small"
        variant="tonal"
        class="ml-3 d-none d-lg-inline system-badge"
      >
        {{ getSystemBadge() }}
      </v-chip>
    </v-app-bar-title>

    <v-spacer />

    <!-- Navigation Links - Desktop -->
    <div class="d-none d-md-flex align-center navigation-section">
      <v-btn
        v-for="item in filteredNavigationItems"
        :key="item.path"
        :to="item.path"
        variant="text"
        color="white"
        size="large"
        class="nav-button mx-1"
        :class="{ 'nav-button--active': $route.path === item.path }"
      >
        <v-icon :icon="item.icon" size="20" class="mr-2" />
        <span class="nav-text">{{ item.title.replace(/[📊🌿⚙️🧪]\s*/, '') }}</span>
      </v-btn>
    </div>

    <!-- Status Indicators - Desktop -->
    <div class="d-none d-lg-flex align-center status-section ml-6">
      <v-tooltip bottom>
        <template #activator="{ props }">
          <div v-bind="props" class="system-info-indicator">
            <v-icon :icon="getSystemIcon()" color="white" size="20" class="system-icon" />
            <span class="system-text ml-2">
              {{ getDynamicTitle() }}
            </span>
          </div>
        </template>
        <div class="system-tooltip">
          <div><strong>System:</strong> {{ getDynamicTitle() }}</div>
          <div>
            <strong>Modus:</strong> {{ isKaiserMode ? 'Kaiser Edge Controller' : 'God Pi Server' }}
          </div>
          <div v-if="mqttStore.value?.isConnected" class="text-caption">
            Verbunden seit: {{ formatUptime(mqttStore.value.connectionUptime) }}
          </div>
        </div>
      </v-tooltip>
    </div>

    <!-- Mobile Menu Button -->
    <v-btn icon variant="text" color="white" class="d-md-none" @click="mobileMenu = !mobileMenu">
      <v-icon>{{ mobileMenu ? 'mdi-close' : 'mdi-menu' }}</v-icon>
    </v-btn>
  </v-app-bar>

  <!-- Mobile Navigation Menu -->
  <v-navigation-drawer
    v-model="mobileMenu"
    temporary
    location="top"
    class="d-md-none"
    style="top: 64px; height: calc(100vh - 64px)"
  >
    <v-list>
      <v-list-item
        v-for="item in filteredNavigationItems"
        :key="item.path"
        :to="item.path"
        :prepend-icon="item.icon"
        :title="item.title"
        @click="mobileMenu = false"
        :class="{ 'v-list-item--active': $route.path === item.path }"
        density="comfortable"
      />

      <!-- Emergency Actions (nur im Kaiser-Modus) -->
      <v-divider v-if="isKaiserMode" class="my-2" />
      <v-list-item v-if="isKaiserMode" @click="emergencyStopAll">
        <v-list-item-title class="text-error">
          <v-icon class="mr-2">mdi-stop-circle</v-icon>
          Emergency Stop All
        </v-list-item-title>
      </v-list-item>

      <!-- Autonomous Mode Toggle -->
      <v-list-item v-if="isKaiserMode" @click="toggleAutonomousMode">
        <v-list-item-title>
          <v-icon class="mr-2">
            {{ mqttStore.value?.kaiser?.autonomousMode ? 'mdi-account-supervisor' : 'mdi-robot' }}
          </v-icon>
          {{ mqttStore.value?.kaiser?.autonomousMode ? 'Disable Autonomous' : 'Enable Autonomous' }}
        </v-list-item-title>
      </v-list-item>

      <!-- Mobile Status Info -->
      <v-divider class="my-2" />
      <v-list-item>
        <v-list-item-title class="text-caption text-grey">
          <v-icon class="mr-2" color="primary">
            {{ getSystemIcon() }}
          </v-icon>
          {{ getDynamicTitle() }}
        </v-list-item-title>
      </v-list-item>
    </v-list>
  </v-navigation-drawer>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useCentralDataHub } from '@/stores/centralDataHub'
import { formatDuration } from '@/utils/time'

const centralDataHub = useCentralDataHub()
const mqttStore = computed(() => centralDataHub.mqttStore)
const centralConfig = computed(() => centralDataHub.centralConfig)

const mobileMenu = ref(false)

// Navigation Items
const navigationItems = [
  {
    title: '📊 Dashboard',
    shortTitle: '📊',
    path: '/dashboard',
    icon: 'mdi-view-dashboard',
  },
  {
    title: '🌿 Agenten',
    shortTitle: '🌿',
    path: '/zones',
    icon: 'mdi-devices-group',
  },
  {
    title: '⚙️ Einstellungen',
    shortTitle: '⚙️',
    path: '/settings',
    icon: 'mdi-cog',
  },
  {
    title: '🧪 Debug',
    shortTitle: '🧪',
    path: '/dev',
    icon: 'mdi-bug',
    showInProduction: false, // Nur in Development anzeigen
  },
]

// Computed property für gefilterte Navigation Items
const filteredNavigationItems = computed(() => {
  return navigationItems.filter((item) => !item.showInProduction || import.meta.env.DEV)
})

// Kaiser Mode Detection
const isKaiserMode = computed(() => {
  try {
    return centralDataHub.isKaiserMode
  } catch (error) {
    console.warn('Error checking kaiser mode:', error.message)
    return false
  }
})

// System Functions
function getSystemIcon() {
  if (isKaiserMode.value) {
    return 'mdi-server' // Kaiser Edge Controller
  } else if (centralDataHub.isGodMode) {
    return 'mdi-server' // God Pi
  }
  return 'mdi-home-automation' // Standard
}

function getDynamicTitle() {
  try {
    // ✅ KORRIGIERT: Zeige immer den benutzerfreundlichen God-Namen
    if (centralConfig.value.godName && centralConfig.value.godName !== 'Mein IoT System') {
      return centralConfig.value.godName
    }
    return 'IoT Control Center'
  } catch (error) {
    console.warn('Error getting dynamic title:', error.message)
    return 'IoT Control Center'
  }
}

function getSystemBadge() {
  if (isKaiserMode.value) return 'EDGE CONTROLLER'
  if (centralDataHub.isGodMode) return 'GOD PI'
  return null
}

// ✅ MIGRIERT: Uptime-Formatierung durch zentrale Utility
function formatUptime(milliseconds) {
  if (!milliseconds) return '0s'
  return formatDuration(milliseconds) // Direkte Verwendung, da Input bereits Millisekunden
}

// Emergency Actions
async function emergencyStopAll() {
  const confirm = window.confirm(
    'EMERGENCY STOP: This will stop all actuators immediately. Continue?',
  )
  if (confirm) {
    try {
      await mqttStore.value?.emergencyStopAll()
      window.$snackbar?.showSuccess('Emergency stop executed for all devices')
    } catch (error) {
      console.error('Emergency stop failed:', error)
      window.$snackbar?.showError('Emergency stop failed')
    }
  }
}

// Autonomous Mode Toggle
function toggleAutonomousMode() {
  if (!mqttStore.value?.kaiser) return
  mqttStore.value.kaiser.autonomousMode = !mqttStore.value.kaiser.autonomousMode
  mqttStore.value.saveKaiserConfig()
  window.$snackbar?.showInfo(
    `Autonomous mode ${mqttStore.value.kaiser.autonomousMode ? 'enabled' : 'disabled'}`,
  )
}
</script>

<style scoped>
.enhanced-navigation {
  background: linear-gradient(
    135deg,
    rgb(var(--v-theme-primary)) 0%,
    rgb(var(--v-theme-primary-darken-1)) 100%
  ) !important;
  backdrop-filter: blur(10px);
}

/* Brand Section */
.brand-section {
  min-width: 280px;
}

.system-icon-container {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  padding: 8px;
  backdrop-filter: blur(10px);
}

.system-icon {
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2));
}

.brand-text-container {
  line-height: 1.2;
}

.system-title {
  font-size: 1.1rem;
  font-weight: 600;
  color: white;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
}

.system-subtitle {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.8);
  margin-top: -2px;
}

.system-badge {
  font-weight: 600;
  font-size: 0.7rem;
  background: rgba(255, 255, 255, 0.2) !important;
  backdrop-filter: blur(10px);
}

/* Navigation Section */
.navigation-section {
  gap: 8px;
}

.nav-button {
  min-height: 48px !important;
  padding: 0 20px !important;
  border-radius: 12px !important;
  transition: all 0.2s ease !important;
  background: rgba(255, 255, 255, 0.05) !important;
  backdrop-filter: blur(10px);
}

.nav-button:hover {
  background: rgba(255, 255, 255, 0.15) !important;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.nav-button--active {
  background: rgba(255, 255, 255, 0.2) !important;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

.nav-text {
  font-weight: 500;
  font-size: 0.9rem;
  letter-spacing: 0.25px;
}

/* Status Section */
.status-section {
  padding: 8px 16px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.system-info-indicator {
  display: flex;
  align-items: center;
  cursor: pointer;
}

.system-icon {
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.2));
}

.system-text {
  font-size: 0.85rem;
  font-weight: 500;
  color: white;
}

.system-tooltip {
  font-size: 0.8rem;
  line-height: 1.4;
}

.system-tooltip > div {
  margin-bottom: 4px;
}

/* Legacy Active States */
.v-btn--active {
  background-color: rgba(255, 255, 255, 0.1) !important;
}

.v-list-item--active {
  background-color: rgba(var(--v-theme-primary), 0.1) !important;
}

/* Mobile Optimizations */
@media (max-width: 768px) {
  .enhanced-navigation {
    height: 64px !important;
  }

  .brand-section {
    min-width: auto;
  }

  .system-icon-container {
    padding: 6px;
  }
}

@media (max-width: 600px) {
  .v-app-bar-title {
    font-size: 1.1rem !important;
  }
}
</style>
