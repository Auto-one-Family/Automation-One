# 🚀 **CODEBASE-ANALYSE & STRUKTURELLE VEREINHEITLICHUNG DER GERÄTEVERWALTUNG**

## 📊 **ANALYSEERGEBNISSE**

### **A) Aktuelle Komponenten-Struktur**

#### **ESP-Geräteverwaltung:**
- ✅ **`src/components/settings/EspDeviceCard.vue`** (585 Zeilen) - Zentrale ESP-Karte mit expandierbarer Konfiguration
- ✅ **`src/components/settings/EspGrid.vue`** (255 Zeilen) - Zonenbasierte Gruppierung bereits implementiert
- ❌ **`src/components/settings/EspDevicePanel.vue`** (1159 Zeilen) - **REDUNDANT** - zu groß, Funktionalität bereits in Card
- ✅ **Modulare ESP-Komponenten:**
  - `src/components/settings/esp/EspDeviceInfo.vue` - Geräteinformationen
  - `src/components/settings/esp/EspPinConfiguration.vue` - Pin-Konfiguration  
  - `src/components/settings/esp/EspZoneManagement.vue` - Zonenverwaltung

#### **Kaiser/God-Verwaltung:**
- ❌ **FEHLT:** `src/components/settings/GodDeviceCard.vue` - Dummy-God-Server Anzeige
- ❌ **FEHLT:** `src/components/settings/KaiserDeviceCard.vue` - Pi-Server als Card-Struktur
- ❌ **FEHLT:** `src/components/settings/DeviceCardBase.vue` - Einheitliche Basis-Komponente
- ✅ **`src/components/dashboard/SystemStateCard.vue`** - Zeigt Kaiser-Status, aber nicht als Card
- ✅ **`src/components/settings/SimpleServerSetup.vue`** - Server-Konfiguration, aber nicht als Card

#### **Redundante Dateien (bereits entfernt):**
- ✅ `src/components/settings/DeviceCard.vue` → **ENTFERNT**
- ✅ `src/components/settings/DeviceGrid.vue` → **ENTFERNT**
- ✅ `src/components/settings/DeviceCardBase.vue` → **ENTFERNT**
- ✅ `src/components/settings/KaiserDeviceCard.vue` → **ENTFERNT**
- ✅ `src/stores/deviceManagement.js` → **ENTFERNT**

### **B) Store-Redundanzen**

#### **Identifizierte Redundanzen:**
1. **ESP-Device-Verwaltung:** 
   - `src/stores/mqtt.js` → `espDevices` Map (Hauptverwaltung)
   - `src/stores/devices.js` → `deviceConfigs` Map (redundant)
   - `src/stores/espManagement.js` → ESP-spezifische Logik (konsolidiert)

2. **Zonen-Verwaltung:**
   - `src/stores/centralConfig.js` → `zones.zoneMapping` (zentral)
   - `src/stores/zones.js` → `zones` Map (redundant)

3. **ID-Generierung:**
   - ❌ **FEHLT:** `src/utils/deviceIdGenerator.js` - Einheitliche ID-Generierung aus friendlyName
   - ✅ **BESTEHEND:** `espFriendlyName` in MQTT Store

## 🎯 **ZIELBILD DER STRUKTUR**

### **1. Vertikale Karten-Reihenfolge (immer sichtbar):**
```
┌─────────────────────────────────────┐
│ 🧠 God Card (Dummy)                 │
├─────────────────────────────────────┤
│ 👑 Kaiser Card (Pi-Server)          │
├─────────────────────────────────────┤
│ 📦 Unkonfigurierte ESPs (Box)       │
│   ┌─────────┐ ┌─────────┐          │
│   │ Agent 1 │ │ Agent 2 │          │
│   └─────────┘ └─────────┘          │
├─────────────────────────────────────┤
│ 🌱 Zone: Gewächshaus (Box)          │
│   ┌─────────┐ ┌─────────┐          │
│   │ Agent 3 │ │ Agent 4 │          │
│   └─────────┘ └─────────┘          │
└─────────────────────────────────────┘
```

### **2. Automatisches Verschwinden der unkonfigurierten Box:**

Die **"🕳️ Unkonfiguriert"** Box verschwindet automatisch, sobald alle ESPs in Zonen sind. Dies ist bereits in der bestehenden `groupDevicesByZone` Funktion in `src/utils/espHelpers.js` implementiert.

## 🛠 **KONKRETE UMSETZUNG**

### **Phase 1: Basis-Komponenten erstellen**

#### **1. `src/components/settings/DeviceCardBase.vue` (NEU)**
```vue
<template>
  <v-card
    :variant="isSelected ? 'elevated' : 'outlined'"
    :class="[
      'device-card-base',
      {
        'selected-card': isSelected,
        expanded: isSelected,
        'error-state': hasError,
      },
    ]"
    :elevation="isSelected ? 12 : 2"
    @click="handleCardClick"
  >
    <!-- Card Header mit Status -->
    <v-card-title class="d-flex align-center pa-4 pb-2">
      <v-icon
        :icon="getDeviceStatusIcon()"
        :color="getDeviceStatusColor()"
        class="mr-2"
        size="small"
      />
      <span class="text-subtitle-2 font-weight-medium text-truncate">
        {{ deviceInfo.friendlyName || deviceId }}
      </span>
      <v-spacer />

      <!-- Header Actions Slot -->
      <slot name="header-actions" />

      <!-- Status Badge -->
      <v-chip :color="getDeviceStatusColor()" size="x-small" variant="tonal" class="ml-2">
        {{ getDeviceStatusText() }}
      </v-chip>
    </v-card-title>

    <!-- Card Content -->
    <v-card-text class="pa-4 pt-2">
      <!-- Device ID -->
      <div class="d-flex align-center mb-2">
        <v-icon icon="mdi-identifier" size="16" color="grey" class="mr-2" />
        <span class="text-caption text-grey-darken-1 font-mono">
          {{ deviceId }}
        </span>
      </div>

      <!-- Device Type -->
      <div class="d-flex align-center mb-2">
        <v-icon icon="mdi-devices" size="16" color="grey" class="mr-2" />
        <span class="text-caption text-grey-darken-1">
          {{ deviceInfo.type || 'Unbekannt' }}
        </span>
      </div>

      <!-- Last Update -->
      <div class="d-flex align-center">
        <v-icon icon="mdi-clock-outline" size="16" color="grey" class="mr-2" />
        <span class="text-caption text-grey-darken-1">
          {{ formatLastUpdate() }}
        </span>
      </div>

      <!-- Error Indicators -->
      <div v-if="hasError" class="mt-2">
        <v-chip color="error" size="x-small" variant="tonal">
          {{ errorMessage }}
        </v-chip>
      </div>
    </v-card-text>

    <!-- Expandable Content -->
    <v-expand-transition>
      <div v-if="isSelected" class="expanded-configuration">
        <v-divider />
        <slot name="expanded-content" />
      </div>
    </v-expand-transition>

    <!-- Card Actions -->
    <v-card-actions class="pa-4 pt-0">
      <v-spacer />
      <slot name="card-actions" />
    </v-card-actions>
  </v-card>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  deviceId: { type: String, required: true },
  deviceInfo: { type: Object, required: true },
  isSelected: { type: Boolean, default: false },
  hasError: { type: Boolean, default: false },
  errorMessage: { type: String, default: '' },
})

const emit = defineEmits(['select', 'configure'])

const handleCardClick = () => {
  emit('select', props.deviceId)
}

const getDeviceStatusText = () => {
  return props.deviceInfo.status || 'Unknown'
}

const getDeviceStatusColor = () => {
  const status = props.deviceInfo.status || 'unknown'
  const colorMap = {
    online: 'success',
    offline: 'error',
    warning: 'warning',
    unknown: 'grey',
  }
  return colorMap[status] || 'grey'
}

const getDeviceStatusIcon = () => {
  const status = props.deviceInfo.status || 'unknown'
  const iconMap = {
    online: 'mdi-wifi',
    offline: 'mdi-wifi-off',
    warning: 'mdi-alert',
    unknown: 'mdi-help-circle',
  }
  return iconMap[status] || 'mdi-help-circle'
}

const formatLastUpdate = () => {
  if (!props.deviceInfo.lastUpdate) return 'Nie'
  const now = Date.now()
  const diff = now - props.deviceInfo.lastUpdate
  if (diff < 60000) return 'Gerade eben'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`
  return `${Math.floor(diff / 86400000)}d`
}
</script>

<style scoped>
.device-card-base {
  transition: all 0.3s ease;
  cursor: pointer;
  height: 100%;
  min-height: 200px;
  display: flex;
  flex-direction: column;
}

.device-card-base:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.selected-card.expanded {
  transform: scale(1.05);
  z-index: 10;
  transition: all 0.3s ease;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
  position: relative;
  min-height: 400px;
}

.error-state {
  border: 2px solid rgb(var(--v-theme-error));
  background: linear-gradient(
    135deg,
    rgba(var(--v-theme-error), 0.05) 0%,
    rgba(var(--v-theme-error), 0.02) 100%
  );
}

.expanded-configuration {
  background: rgba(var(--v-theme-primary), 0.02);
}
</style>
```

#### **2. `src/components/settings/GodDeviceCard.vue` (NEU)**
```vue
<template>
  <DeviceCardBase
    device-id="god-server"
    :device-info="godDeviceInfo"
    :is-selected="isSelected"
    :has-error="false"
    @select="handleSelect"
  >
    <template #header-actions>
      <v-btn
        icon="mdi-information"
        size="small"
        variant="text"
        color="warning"
        @click.stop="showGodInfo"
      />
    </template>

    <template #expanded-content>
      <div class="pa-4">
        <v-alert type="warning" variant="tonal" class="mb-4">
          <strong>Dummy-God-Server:</strong> Diese Komponente ist derzeit nicht implementiert.
          Sie dient als Platzhalter für zukünftige God-Server-Integration.
        </v-alert>

        <div class="text-subtitle-2 mb-2">God-Server Informationen</div>
        <v-list density="compact">
          <v-list-item>
            <template #prepend>
              <v-icon icon="mdi-brain" size="small" />
            </template>
            <v-list-item-title class="text-body-2">Status</v-list-item-title>
            <template #append>
              <v-chip color="warning" size="x-small" variant="tonal">Dummy</v-chip>
            </template>
          </v-list-item>

          <v-list-item>
            <template #prepend>
              <v-icon icon="mdi-connection" size="small" />
            </template>
            <v-list-item-title class="text-body-2">Verbindung</v-list-item-title>
            <template #append>
              <v-chip color="error" size="x-small" variant="tonal">Nicht verfügbar</v-chip>
            </template>
          </v-list-item>
        </v-list>
      </div>
    </template>

    <template #card-actions>
      <v-btn
        @click.stop="handleConfigure"
        color="warning"
        size="small"
        variant="tonal"
        prepend-icon="mdi-cog"
      >
        {{ isSelected ? 'Schließen' : 'Info' }}
      </v-btn>
    </template>
  </DeviceCardBase>
</template>

<script setup>
import { computed } from 'vue'
import DeviceCardBase from './DeviceCardBase.vue'

const props = defineProps({
  isSelected: { type: Boolean, default: false },
})

const emit = defineEmits(['select', 'configure'])

const godDeviceInfo = computed(() => ({
  friendlyName: 'God Server',
  type: 'Dummy God Server',
  status: 'offline',
  lastUpdate: null,
}))

const handleSelect = (deviceId) => {
  emit('select', deviceId)
}

const handleConfigure = () => {
  emit('configure', 'god-server')
}

const showGodInfo = () => {
  window.$snackbar?.showInfo(
    'God-Server ist derzeit nicht implementiert. Diese Komponente dient als Platzhalter für zukünftige Integration.',
    { timeout: 8000 }
  )
}
</script>
```

#### **3. `src/components/settings/KaiserDeviceCard.vue` (NEU)**
```vue
<template>
  <DeviceCardBase
    device-id="kaiser-server"
    :device-info="kaiserDeviceInfo"
    :is-selected="isSelected"
    :has-error="hasKaiserError"
    :error-message="kaiserErrorMessage"
    @select="handleSelect"
  >
    <template #header-actions>
      <v-btn
        icon="mdi-refresh"
        size="small"
        variant="text"
        color="primary"
        @click.stop="refreshKaiserStatus"
        :loading="refreshing"
      />
    </template>

    <template #expanded-content>
      <div class="pa-4">
        <!-- Kaiser Status -->
        <div class="text-subtitle-2 mb-2">Kaiser Server Status</div>
        <v-list density="compact" class="mb-4">
          <v-list-item>
            <template #prepend>
              <v-icon icon="mdi-web" size="small" />
            </template>
            <v-list-item-title class="text-body-2">WebServer</v-list-item-title>
            <template #append>
              <v-chip
                :color="mqttStore.kaiser.webserverActive ? 'warning' : 'success'"
                size="x-small"
                variant="tonal"
              >
                {{ mqttStore.kaiser.webserverActive ? 'Setup Mode' : 'Operational' }}
              </v-chip>
            </template>
          </v-list-item>

          <v-list-item>
            <template #prepend>
              <v-icon icon="mdi-connection" size="small" />
            </template>
            <v-list-item-title class="text-body-2">MQTT Verbindung</v-list-item-title>
            <template #append>
              <v-chip
                :color="mqttStore.isConnected ? 'success' : 'error'"
                size="x-small"
                variant="tonal"
              >
                {{ mqttStore.isConnected ? 'Verbunden' : 'Nicht verbunden' }}
              </v-chip>
            </template>
          </v-list-item>

          <v-list-item>
            <template #prepend>
              <v-icon icon="mdi-shield-check" size="small" />
            </template>
            <v-list-item-title class="text-body-2">Safe Mode</v-list-item-title>
            <template #append>
              <v-chip
                :color="mqttStore.isSafeMode ? 'warning' : 'success'"
                size="x-small"
                variant="tonal"
              >
                {{ mqttStore.isSafeMode ? 'Aktiviert' : 'Deaktiviert' }}
              </v-chip>
            </template>
          </v-list-item>
        </v-list>

        <!-- God Connection -->
        <div class="text-subtitle-2 mb-2">God-Verbindung</div>
        <v-list density="compact" class="mb-4">
          <v-list-item>
            <template #prepend>
              <v-icon :icon="getGodConnectionIcon()" size="small" />
            </template>
            <v-list-item-title class="text-body-2">God Pi Status</v-list-item-title>
            <template #append>
              <v-chip
                :color="mqttStore.kaiser.godConnection.connected ? 'success' : 'error'"
                size="x-small"
                variant="tonal"
              >
                {{ mqttStore.kaiser.godConnection.connected ? 'Verbunden' : 'Getrennt' }}
              </v-chip>
            </template>
          </v-list-item>

          <v-list-item>
            <template #prepend>
              <v-icon icon="mdi-robot" size="small" />
            </template>
            <v-list-item-title class="text-body-2">Autonomous Mode</v-list-item-title>
            <template #append>
              <v-chip
                :color="mqttStore.kaiser.autonomousMode ? 'warning' : 'success'"
                size="x-small"
                variant="tonal"
              >
                {{ mqttStore.kaiser.autonomousMode ? 'Aktiviert' : 'Deaktiviert' }}
              </v-chip>
            </template>
          </v-list-item>
        </v-list>

        <!-- Quick Actions -->
        <div class="text-subtitle-2 mb-2">Schnellaktionen</div>
        <div class="d-flex flex-wrap gap-2">
          <v-btn
            color="primary"
            size="small"
            variant="outlined"
            prepend-icon="mdi-account-plus"
            @click="registerWithGod"
            :loading="registering"
            :disabled="!mqttStore.kaiser.godConnection.connected"
          >
            Re-register
          </v-btn>
          <v-btn
            color="warning"
            size="small"
            variant="outlined"
            prepend-icon="mdi-robot"
            @click="toggleAutonomousMode"
            :disabled="!mqttStore.kaiser.godConnection.connected"
          >
            {{ mqttStore.kaiser.autonomousMode ? 'Disable' : 'Enable' }} Autonomous
          </v-btn>
        </div>
      </div>
    </template>

    <template #card-actions>
      <v-btn
        @click.stop="handleConfigure"
        color="primary"
        size="small"
        variant="tonal"
        prepend-icon="mdi-cog"
      >
        {{ isSelected ? 'Schließen' : 'Konfigurieren' }}
      </v-btn>
    </template>
  </DeviceCardBase>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useMqttStore } from '@/stores/mqtt'
import DeviceCardBase from './DeviceCardBase.vue'

const props = defineProps({
  isSelected: { type: Boolean, default: false },
})

const emit = defineEmits(['select', 'configure'])

const mqttStore = useMqttStore()
const refreshing = ref(false)
const registering = ref(false)

const kaiserDeviceInfo = computed(() => ({
  friendlyName: 'Kaiser Pi',
  type: 'Pi Server',
  status: mqttStore.isConnected ? 'online' : 'offline',
  lastUpdate: Date.now(),
}))

const hasKaiserError = computed(() => {
  return !mqttStore.isConnected || mqttStore.error
})

const kaiserErrorMessage = computed(() => {
  if (!mqttStore.isConnected) return 'Nicht verbunden'
  if (mqttStore.error) return mqttStore.error
  return ''
})

const handleSelect = (deviceId) => {
  emit('select', deviceId)
}

const handleConfigure = () => {
  emit('configure', 'kaiser-server')
}

const getGodConnectionIcon = () => {
  if (!mqttStore.kaiser.godConnection.connected) return 'mdi-wifi-off'
  if (mqttStore.kaiser.godConnection.syncEnabled) return 'mdi-sync'
  return 'mdi-sync-off'
}

const refreshKaiserStatus = async () => {
  refreshing.value = true
  try {
    await mqttStore.testConnection()
    window.$snackbar?.showSuccess('Kaiser Status aktualisiert')
  } catch (error) {
    window.$snackbar?.showError(`Fehler beim Aktualisieren: ${error.message}`)
  } finally {
    refreshing.value = false
  }
}

const registerWithGod = async () => {
  registering.value = true
  try {
    await mqttStore.registerWithGod()
    window.$snackbar?.showSuccess('Erfolgreich bei God registriert')
  } catch (error) {
    window.$snackbar?.showError(`Registrierung fehlgeschlagen: ${error.message}`)
  } finally {
    registering.value = false
  }
}

const toggleAutonomousMode = () => {
  mqttStore.kaiser.autonomousMode = !mqttStore.kaiser.autonomousMode
  mqttStore.saveKaiserConfig()
  window.$snackbar?.showInfo(
    `Autonomous mode ${mqttStore.kaiser.autonomousMode ? 'aktiviert' : 'deaktiviert'}`
  )
}
</script>
```

### **Phase 2: ESP-Karte auf Basis-Komponente umstellen**

#### **4. `src/components/settings/EspDeviceCard.vue` erweitern**
```vue
<template>
  <DeviceCardBase
    :device-id="espId"
    :device-info="espDeviceInfo"
    :is-selected="isSelected"
    :has-error="hasError"
    :error-message="errorMessage"
    @select="handleSelect"
  >
    <template #header-actions>
      <!-- Zone-Change QuickAction -->
      <v-menu v-if="!isNewDevice" @click.stop>
        <template #activator="{ props }">
          <v-btn
            icon="mdi-map-marker"
            v-bind="props"
            size="small"
            variant="text"
            color="primary"
            class="mr-2"
            @click.stop
          />
        </template>
        <v-list density="compact">
          <v-list-subheader>Zone ändern</v-list-subheader>
          <v-list-item
            v-for="zone in availableZones"
            :key="zone"
            @click="changeZone(zone)"
            :active="deviceInfo.zone === zone"
          >
            <template #prepend>
              <v-icon
                :icon="zone === '🕳️ Unkonfiguriert' ? 'mdi-help-circle' : 'mdi-map-marker'"
                :color="zone === '🕳️ Unkonfiguriert' ? 'grey' : 'primary'"
                size="small"
              />
            </template>
            <v-list-item-title>{{ zone }}</v-list-item-title>
          </v-list-item>

          <!-- Zone löschen Option -->
          <v-divider />
          <v-list-item
            v-if="deviceInfo.zone && deviceInfo.zone !== '🕳️ Unkonfiguriert'"
            @click="showDeleteZoneDialog = true"
            color="error"
          >
            <template #prepend>
              <v-icon icon="mdi-delete" color="error" size="small" />
            </template>
            <v-list-item-title class="text-error">Zone löschen</v-list-item-title>
          </v-list-item>
        </v-list>
      </v-menu>
    </template>

    <template #expanded-content>
      <!-- Bestehende erweiterte Konfiguration -->
      <div v-if="showDeviceInfo" class="pa-4">
        <EspDeviceInfo
          :esp-id="espId"
          :readonly="readonly"
          @device-config-change="handleDeviceConfigChange"
        />
      </div>

      <div v-if="showZoneManagement" class="pa-4">
        <EspZoneManagement
          :esp-id="espId"
          :readonly="readonly"
          @zone-config-change="handleZoneConfigChange"
        />
      </div>

      <div v-if="showPinConfiguration" class="pa-4">
        <EspPinConfiguration :esp-id="espId" :readonly="readonly" @pin-change="handlePinChange" />
      </div>

      <!-- Schnellaktionen -->
      <div class="pa-4">
        <div class="d-flex align-center mb-3">
          <v-icon icon="mdi-tools" color="warning" class="mr-2" />
          <h4 class="text-subtitle-1 font-weight-medium">Schnellaktionen</h4>
        </div>

        <div class="d-flex flex-wrap gap-2">
          <v-btn
            color="primary"
            size="small"
            variant="outlined"
            prepend-icon="mdi-refresh"
            @click="restartDevice"
            :loading="restarting"
          >
            Neustart
          </v-btn>
          <v-btn
            color="warning"
            size="small"
            variant="outlined"
            prepend-icon="mdi-shield-off"
            @click="disableSafeMode"
            :loading="disablingSafeMode"
          >
            SafeMode deaktivieren
          </v-btn>
          <v-btn
            color="info"
            size="small"
            variant="outlined"
            prepend-icon="mdi-update"
            @click="startOTA"
            :loading="startingOTA"
          >
            OTA Update
          </v-btn>
        </div>
      </div>
    </template>

    <template #card-actions>
      <!-- Accept Button für neue Geräte -->
      <v-btn
        v-if="isNewDevice"
        @click.stop="$emit('accept', espId)"
        color="success"
        size="small"
        variant="tonal"
        prepend-icon="mdi-plus"
      >
        Hinzufügen
      </v-btn>

      <!-- Configure Button für bekannte Geräte -->
      <v-btn
        v-else
        @click.stop="handleConfigure"
        color="primary"
        size="small"
        variant="tonal"
        prepend-icon="mdi-cog"
      >
        {{ isSelected ? 'Schließen' : 'Konfigurieren' }}
      </v-btn>
    </template>
  </DeviceCardBase>

  <!-- ✅ NEU: Sicherheits-Dialog für Zonen-Löschung -->
  <v-dialog v-model="showDeleteZoneDialog" max-width="400">
    <v-card>
      <v-card-title class="text-h6">
        <v-icon icon="mdi-alert" color="warning" class="mr-2" />
        Zone löschen
      </v-card-title>
      <v-card-text>
        <p>Sind Sie sicher, dass Sie die Zone <strong>"{{ deviceInfo.zone }}"</strong> löschen möchten?</p>
        <p class="text-caption text-grey">Das ESP-Gerät wird in die unkonfigurierte Zone verschoben.</p>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn @click="showDeleteZoneDialog = false" variant="text">
          Abbrechen
        </v-btn>
        <v-btn @click="confirmDeleteZone" color="error" variant="tonal">
          Löschen
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useMqttStore } from '@/stores/mqtt'
import { useCentralConfigStore } from '@/stores/centralConfig'
import { getAllZones, validateZoneName } from '@/utils/espHelpers'
import { useBlinkTracker } from '@/composables/useBlinkTracker'
import DeviceCardBase from './DeviceCardBase.vue'
import EspZoneManagement from './esp/EspZoneManagement.vue'
import EspPinConfiguration from './esp/EspPinConfiguration.vue'
import EspDeviceInfo from './esp/EspDeviceInfo.vue'

// Props und Emits bleiben gleich
const props = defineProps({
  espId: { type: String, required: true },
  isSelected: { type: Boolean, default: false },
  isRecentlyMoved: { type: Boolean, default: false },
  showZoneManagement: { type: Boolean, default: true },
  showPinConfiguration: { type: Boolean, default: true },
  showDeviceInfo: { type: Boolean, default: true },
  readonly: { type: Boolean, default: false },
  compact: { type: Boolean, default: false },
})

const emit = defineEmits([
  'select',
  'accept',
  'configure',
  'zone-change',
  'pin-change',
  'device-config-change',
  'zone-config-change',
])

// Stores
const mqttStore = useMqttStore()
const centralConfig = useCentralConfigStore()

// Blink-Tracker für Zonenwechsel-Animation
const { markAsRecentlyMoved } = useBlinkTracker()

// Loading States
const restarting = ref(false)
const disablingSafeMode = ref(false)
const startingOTA = ref(false)
const showDeleteZoneDialog = ref(false)

// Computed Properties
const deviceInfo = computed(() => {
  return mqttStore.espDevices.get(props.espId) || {}
})

const espDeviceInfo = computed(() => ({
  friendlyName: deviceInfo.value.espFriendlyName || deviceInfo.value.espUsername || props.espId,
  type: deviceInfo.value.boardType || 'ESP32',
  status: deviceInfo.value.status || 'offline',
  lastUpdate: deviceInfo.value.lastHeartbeat,
  zone: deviceInfo.value.zone,
}))

const isNewDevice = computed(() => {
  const isInMqttStore = mqttStore.espDevices.has(props.espId)
  const isInCentralConfig = centralConfig.getAllEspIds?.()?.includes(props.espId)
  return isInMqttStore && !isInCentralConfig
})

const hasError = computed(() => {
  return hasIdConflict.value || hasConfigurationError.value
})

const errorMessage = computed(() => {
  if (hasIdConflict.value) return 'ID-Konflikt'
  if (hasConfigurationError.value) return 'Konfigurationsfehler'
  return ''
})

const hasIdConflict = computed(() => {
  return (
    mqttStore.idConflicts?.espId?.has(props.espId) ||
    mqttStore.idConflicts?.kaiser?.has(props.espId)
  )
})

const hasConfigurationError = computed(() => {
  const device = deviceInfo.value
  return !device.zone || !device.boardType || device.missingPins?.length > 0
})

const availableZones = computed(() => {
  const zones = getAllZones()
  if (!zones.includes('🕳️ Unkonfiguriert')) {
    zones.unshift('🕳️ Unkonfiguriert')
  }
  return zones
})

// Methods
const handleSelect = (deviceId) => {
  if (isSelected.value) {
    centralConfig.clearSelectedEspId()
  } else {
    centralConfig.setSelectedEspId(deviceId)
  }
  emit('select', deviceId)
}

const handleConfigure = () => {
  if (isSelected.value) {
    centralConfig.clearSelectedEspId()
  } else {
    centralConfig.setSelectedEspId(props.espId)
  }
  emit('configure', props.espId)
}

// Bestehende Methoden bleiben gleich
const changeZone = (newZone) => {
  const validation = validateZoneName(newZone)
  if (!validation.isValid) {
    window.$snackbar?.showError(`Ungültiger Zonename: ${validation.error}`)
    return
  }

  emit('zone-change', { espId: props.espId, oldZone: deviceInfo.value.zone, newZone })
  window.$snackbar?.showSuccess(`ESP ${props.espId} zu Zone "${newZone}" verschoben`)
}

// ✅ NEU: Bestätigte Zonen-Löschung
const confirmDeleteZone = async () => {
  showDeleteZoneDialog.value = false
  await deleteZone()
}

// ✅ NEU: Geänderte deleteZone-Methode
const deleteZone = async () => {
  try {
    // Verschiebe ESP in unkonfigurierte Zone
    await centralConfig.setZone(props.espId, centralConfig.zones.defaultZone)
    
    // Sende MQTT-Befehl an ESP
    await mqttStore.sendSystemCommand(props.espId, 'update_zone', {
      zone: centralConfig.zones.defaultZone,
      timestamp: Date.now(),
    })
    
    // Markiere für Animation
    markAsRecentlyMoved(props.espId, deviceInfo.value.zone, centralConfig.zones.defaultZone)
    
    window.$snackbar?.showSuccess('Zone gelöscht und ESP in unkonfigurierte Zone verschoben')
  } catch (error) {
    console.error('Failed to delete zone:', error)
    window.$snackbar?.showError(`Fehler beim Löschen der Zone: ${error.message}`)
  }
}

// QuickActions
const restartDevice = async () => {
  restarting.value = true
  try {
    await mqttStore.sendSystemCommand(props.espId, 'restart', {})
    window.$snackbar?.showSuccess('Neustart-Befehl gesendet')
  } catch (error) {
    window.$snackbar?.showError(`Fehler beim Neustart: ${error.message}`)
  } finally {
    restarting.value = false
  }
}

const disableSafeMode = async () => {
  disablingSafeMode.value = true
  try {
    await mqttStore.sendSystemCommand(props.espId, 'disable_safe_mode', {})
    window.$snackbar?.showSuccess('SafeMode deaktiviert')
  } catch (error) {
    window.$snackbar?.showError(`Fehler beim Deaktivieren: ${error.message}`)
  } finally {
    disablingSafeMode.value = false
  }
}

const startOTA = async () => {
  startingOTA.value = true
  try {
    await mqttStore.sendSystemCommand(props.espId, 'start_ota', {})
    window.$snackbar?.showSuccess('OTA Update gestartet')
  } catch (error) {
    window.$snackbar?.showError(`Fehler beim OTA Update: ${error.message}`)
  } finally {
    startingOTA.value = false
  }
}

// Event-Handler für modulare Komponenten
const handleDeviceConfigChange = (event) => {
  emit('device-config-change', event)
}

const handleZoneConfigChange = (event) => {
  emit('zone-config-change', event)
}

const handlePinChange = (event) => {
  emit('pin-change', event)
}
</script>
```


### **Phase 3: Einheitliche Geräteverwaltung**

#### **5. `DeviceManagement.vue` (NEU)**
```vue
<template>
  <div class="device-management">
    <!-- Header -->
    <div class="d-flex align-center justify-space-between mb-6">
      <div class="d-flex align-center">
        <v-icon icon="mdi-devices-group" class="mr-2" color="primary" />
        <h2 class="text-h5 font-weight-medium">Geräteverwaltung</h2>
        <v-chip :color="getOverallStatusColor()" size="small" variant="tonal" class="ml-3">
          {{ totalDeviceCount }} Gerät{{ totalDeviceCount !== 1 ? 'e' : '' }}
        </v-chip>
      </div>

      <!-- Filter Options -->
      <div class="d-flex align-center">
        <v-btn-toggle
          v-model="filterMode"
          mandatory
          density="comfortable"
          variant="outlined"
          size="small"
        >
          <v-btn value="all" prepend-icon="mdi-view-grid"> Alle </v-btn>
          <v-btn value="online" prepend-icon="mdi-wifi"> Online </v-btn>
          <v-btn value="offline" prepend-icon="mdi-wifi-off"> Offline </v-btn>
        </v-btn-toggle>
      </div>
    </div>

    <!-- Device Cards -->
    <div class="device-cards-container">
      <!-- God Card (immer sichtbar) -->
      <div class="mb-4">
        <GodDeviceCard
          :is-selected="selectedDeviceId === 'god-server'"
          @select="handleDeviceSelect"
          @configure="handleDeviceConfigure"
        />
      </div>

      <!-- Kaiser Card (immer sichtbar) -->
      <div class="mb-4">
        <KaiserDeviceCard
          :is-selected="selectedDeviceId === 'kaiser-server'"
          @select="handleDeviceSelect"
          @configure="handleDeviceConfigure"
        />
      </div>

      <!-- ESP Devices nach Zonen gruppiert -->
      <div v-for="(devicesInZone, zoneName) in groupedEspDevices" :key="zoneName" class="mb-6">
        <!-- Zone Header -->
        <div class="d-flex align-center mb-3">
          <v-icon
            :icon="zoneName === '��️ Unkonfiguriert' ? 'mdi-help-circle' : 'mdi-map-marker'"
            :color="zoneName === '��️ Unkonfiguriert' ? 'grey' : 'primary'"
            class="mr-2"
          />
          <h4 class="text-h6 font-weight-medium">{{ zoneName }}</h4>
          <v-chip
            :color="zoneName === '��️ Unkonfiguriert' ? 'grey' : 'primary'"
            size="small"
            variant="tonal"
            class="ml-2"
          >
            {{ devicesInZone.length }} Gerät{{ devicesInZone.length !== 1 ? 'e' : '' }}
          </v-chip>
        </div>

        <!-- Zone Grid -->
        <v-row>
          <v-col v-for="espId in devicesInZone" :key="espId" cols="12" sm="6" md="4" lg="3">
            <EspDeviceCard
              :esp-id="espId"
              :is-selected="selectedDeviceId === espId"
              :class="{ 'recently-moved': isRecentlyMoved(espId) }"
              @select="handleDeviceSelect"
              @accept="handleDeviceAccept"
              @configure="handleDeviceConfigure"
              @zone-change="handleZoneChange"
            />
          </v-col>
        </v-row>
      </div>
    </div>

    <!-- Empty State -->
    <div v-if="filteredEspDevices.length === 0" class="text-center py-8">
      <v-icon icon="mdi-devices-off" size="64" color="grey-lighten-1" />
      <p class="text-grey mt-2">
        {{ getEmptyStateMessage() }}
      </p>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="text-center py-8">
      <v-progress-circular indeterminate color="primary" />
      <p class="text-grey mt-2">Lade Geräte...</p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useMqttStore } from '@/stores/mqtt'
import { useCentralConfigStore } from '@/stores/centralConfig'
import { groupDevicesByZone } from '@/utils/espHelpers'
import { useBlinkTracker } from '@/composables/useBlinkTracker'
import DeviceCardBase from './DeviceCardBase.vue'
import GodDeviceCard from './GodDeviceCard.vue'
import KaiserDeviceCard from './KaiserDeviceCard.vue'
import EspDeviceCard from './EspDeviceCard.vue'

defineProps({
  loading: {
    type: Boolean,
    default: false,
  },
})

// Emits
const emit = defineEmits(['device-select', 'device-accept', 'device-configure'])

// Stores
const mqttStore = useMqttStore()
const centralConfig = useCentralConfigStore()

// Blink-Tracker für Zonenwechsel-Animation
const { isRecentlyMoved, watchZoneChanges, markAsRecentlyMoved } = useBlinkTracker()

// Reactive Data
const filterMode = ref('all')
const selectedDeviceId = ref(null)

// Computed Properties
const espDevices = computed(() => {
  return Array.from(mqttStore.espDevices.keys())
})

const filteredEspDevices = computed(() => {
  if (filterMode.value === 'all') {
    return espDevices.value
  }

  return espDevices.value.filter((espId) => {
    const device = mqttStore.espDevices.get(espId)
    const status = device?.status || 'offline'

    if (filterMode.value === 'online') {
      return status === 'online'
    } else if (filterMode.value === 'offline') {
      return status === 'offline'
    }

    return true
  })
})

const groupedEspDevices = computed(() => {
  return groupDevicesByZone(filteredEspDevices.value)
})

const totalDeviceCount = computed(() => {
  return 2 + espDevices.value.length // God + Kaiser + ESPs
})

// Methods
const handleDeviceSelect = (deviceId) => {
  selectedDeviceId.value = deviceId
  emit('device-select', deviceId)
}

const handleDeviceAccept = (espId) => {
  emit('device-accept', espId)
}

const handleDeviceConfigure = (deviceId) => {
  emit('device-configure', deviceId)
}

const handleZoneChange = async (zoneChangeData) => {
  const { espId, oldZone, newZone } = zoneChangeData

  try {
    await centralConfig.setZone(espId, newZone)
    markAsRecentlyMoved(espId, oldZone, newZone)
    window.$snackbar?.showSuccess(`ESP ${espId} erfolgreich zu Zone "${newZone}" verschoben`)
  } catch (error) {
    console.error('Zone change failed:', error)
    window.$snackbar?.showError(`Fehler beim Verschieben: ${error.message}`)
  }
}

const getOverallStatusColor = () => {
  const onlineCount = espDevices.value.filter((espId) => {
    const device = mqttStore.espDevices.get(espId)
    return device?.status === 'online'
  }).length

  const totalCount = espDevices.value.length

  if (totalCount === 0) return 'grey'
  if (onlineCount === totalCount) return 'success'
  if (onlineCount > 0) return 'warning'
  return 'error'
}

const getEmptyStateMessage = () => {
  switch (filterMode.value) {
    case 'online':
      return 'Keine online ESP-Geräte gefunden'
    case 'offline':
      return 'Keine offline ESP-Geräte vorhanden'
    default:
      return 'Keine ESP-Geräte im Netzwerk gefunden'
  }
}

// Watch für Zonenänderungen und Animation
watch(
  () => mqttStore.espDevices,
  (newDevices, oldDevices) => {
    watchZoneChanges(newDevices, oldDevices)
  },
  { deep: true },
)

// Initialisiere Zonenverwaltung beim Mount
onMounted(() => {
  centralConfig.loadZonesFromStorage()
  centralConfig.updateAvailableZones()
})
</script>

<style scoped>
.device-management {
  width: 100%;
}

.device-cards-container {
  width: 100%;
}

.v-btn-toggle {
  border-radius: 8px;
}

.v-btn-toggle .v-btn {
  border-radius: 6px;
  margin: 0 2px;
}

/* Animation für kürzlich verschobene Geräte */
.esp-device-card.recently-moved {
  animation: blink-zone 0.6s ease-in-out 3;
}

@keyframes blink-zone {
  0%,
  100% {
    background-color: transparent;
  }
  50% {
    background-color: rgba(255, 235, 59, 0.4);
  }
}

/* Responsive Design */
@media (max-width: 768px) {
  .device-cards-container .v-row {
    margin: 0;
  }

  .device-cards-container .v-col {
    padding: 8px;
  }
}
</style>
```

### **Phase 4: Store-Konsolidierung**

#### **6. Redundante Stores bereinigen**

Die Stores `zones.js` und `devices.js` können entfernt werden, da ihre Funktionalität bereits in `centralConfig.js` und `mqtt.js` konsolidiert ist.

#### **7. `centralConfig.js` erweitern**
```javascript
// Zusätzliche Methoden für einheitliche Geräteverwaltung

// ✅ NEU: Zentrale Geräteverwaltung
getAllDevices() {
  const devices = {
    god: {
      id: 'god-server',
      friendlyName: 'God Server',
      type: 'Dummy God Server',
      status: 'offline',
      lastUpdate: null,
    },
    kaiser: {
      id: 'kaiser-server',
      friendlyName: 'Kaiser Pi',
      type: 'Pi Server',
      status: this.isConnected ? 'online' : 'offline',
      lastUpdate: Date.now(),
    },
    esp: this.getAllEspIds().map(espId => {
      const device = useMqttStore().espDevices.get(espId)
      return {
        id: espId,
        friendlyName: device?.espFriendlyName || device?.espUsername || espId,
        type: device?.boardType || 'ESP32',
        status: device?.status || 'offline',
        lastUpdate: device?.lastHeartbeat,
        zone: device?.zone,
      }
    })
  }
  
  return devices
}

// ✅ NEU: Einheitliche ID-Generierung
generateDeviceId(friendlyName) {
  return friendlyName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Umlaute entfernen
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_') // Sonderzeichen zu _
    .replace(/_+/g, '_') // Mehrfache _ zu einem
    .replace(/^_|_$/g, '') // Anfang/Ende _ entfernen
}
```

Die Änderung ist **NICHT vollständig**. Hier sind die fehlenden Ergänzungen basierend auf Ihren Anforderungen:

## 🔧 **FEHLENDE ERGÄNZUNGEN**

### **1. Zonen-Löschung mit Sicherheitsfrage**
```vue
<!-- In EspDeviceCard.vue - Zone löschen Dialog -->
<template>
  <!-- Bestehender Code... -->
  
  <!-- ✅ NEU: Sicherheits-Dialog für Zonen-Löschung -->
  <v-dialog v-model="showDeleteZoneDialog" max-width="400">
    <v-card>
      <v-card-title class="text-h6">
        <v-icon icon="mdi-alert" color="warning" class="mr-2" />
        Zone löschen
      </v-card-title>
      <v-card-text>
        <p>Sind Sie sicher, dass Sie die Zone <strong>"{{ deviceInfo.zone }}"</strong> löschen möchten?</p>
        <p class="text-caption text-grey">Das ESP-Gerät wird in die unkonfigurierte Zone verschoben.</p>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn @click="showDeleteZoneDialog = false" variant="text">
          Abbrechen
        </v-btn>
        <v-btn @click="confirmDeleteZone" color="error" variant="tonal">
          Löschen
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup>
// Bestehender Code...

// ✅ NEU: Dialog State
const showDeleteZoneDialog = ref(false)

// ✅ NEU: Bestätigte Zonen-Löschung
const confirmDeleteZone = async () => {
  showDeleteZoneDialog.value = false
  await deleteZone()
}

// ✅ NEU: Geänderte deleteZone-Methode
const deleteZone = async () => {
  try {
    // Verschiebe ESP in unkonfigurierte Zone
    await centralConfig.setZone(props.espId, centralConfig.zones.defaultZone)
    
    // Sende MQTT-Befehl an ESP
    await mqttStore.sendSystemCommand(props.espId, 'update_zone', {
      zone: centralConfig.zones.defaultZone,
      timestamp: Date.now(),
    })
    
    // Markiere für Animation
    markAsRecentlyMoved(props.espId, deviceInfo.value.zone, centralConfig.zones.defaultZone)
    
    window.$snackbar?.showSuccess('Zone gelöscht und ESP in unkonfigurierte Zone verschoben')
  } catch (error) {
    console.error('Failed to delete zone:', error)
    window.$snackbar?.showError(`Fehler beim Löschen der Zone: ${error.message}`)
  }
}
</script>
```

### **2. Automatisches Verschwinden der unkonfigurierten Box**
```vue
<!-- In DeviceManagement.vue - Bedingte Anzeige -->
<template>
  <!-- Bestehender Code... -->
  
  <!-- ✅ NEU: Unkonfigurierte ESPs nur anzeigen wenn vorhanden -->
  <div 
    v-for="(devicesInZone, zoneName) in groupedEspDevices" 
    :key="zoneName" 
    class="mb-6"
    v-show="zoneName !== '🕳️ Unkonfiguriert' || devicesInZone.length > 0"
  >
    <!-- Zone Header -->
    <div class="d-flex align-center mb-3">
      <v-icon
        :icon="zoneName === '��️ Unkonfiguriert' ? 'mdi-help-circle' : 'mdi-map-marker'"
        :color="zoneName === '��️ Unkonfiguriert' ? 'grey' : 'primary'"
        class="mr-2"
      />
      <h4 class="text-h6 font-weight-medium">{{ zoneName }}</h4>
      <v-chip
        :color="zoneName === '��️ Unkonfiguriert' ? 'grey' : 'primary'"
        size="small"
        variant="tonal"
        class="ml-2"
      >
        {{ devicesInZone.length }} Gerät{{ devicesInZone.length !== 1 ? 'e' : '' }}
      </v-chip>
    </div>

    <!-- Zone Grid -->
    <v-row>
      <v-col v-for="espId in devicesInZone" :key="espId" cols="12" sm="6" md="4" lg="3">
        <EspDeviceCard
          :esp-id="espId"
          :is-selected="selectedDeviceId === espId"
          :class="{ 'recently-moved': isRecentlyMoved(espId) }"
          @select="handleDeviceSelect"
          @accept="handleDeviceAccept"
          @configure="handleDeviceConfigure"
          @zone-change="handleZoneChange"
        />
      </v-col>
    </v-row>
  </div>
</template>
```

### **3. Zonen-Verschiebung mit MQTT-Kommunikation**
```javascript
// In centralConfig.js - Erweiterte Zone-Verwaltung
actions: {
  // ✅ NEU: Erweiterte Zone-Verschiebung mit MQTT
  async moveEspToZone(espId, newZone, oldZone = null) {
    const mqttStore = useMqttStore()

    try {
      // 1. Validiere ESP-Device
      if (!mqttStore.espDevices.has(espId)) {
        throw new Error(`ESP Device ${espId} nicht gefunden`)
      }

      // 2. Validiere Zonename
      const validation = validateZoneName(newZone)
      if (!validation.isValid) {
        throw new Error(`Ungültiger Zonename: ${validation.error}`)
      }

      // 3. Speichere Zone-Mapping
      this.zones.zoneMapping[espId] = newZone
      this.zones.lastUpdate = Date.now()

      // 4. Aktualisiere MQTT Store
      const device = mqttStore.espDevices.get(espId)
      if (device) {
        device.zone = newZone
      }

      // 5. Sende MQTT-Befehl an ESP
      await mqttStore.sendSystemCommand(espId, 'update_zone', {
        zone: newZone,
        old_zone: oldZone,
        timestamp: Date.now(),
      })

      // 6. Persistiere Änderungen
      this.saveZonesToStorage()

      console.info(`[ZoneChange] ESP ${espId} von "${oldZone}" zu "${newZone}" verschoben`)
      
      return { success: true, espId, oldZone, newZone }
    } catch (error) {
      console.error('[ZoneChange] Fehler beim Verschieben:', error)
      throw error
    }
  },

  // ✅ NEU: Zone komplett löschen
  async deleteZone(zoneName) {
    const mqttStore = useMqttStore()
    const espIdsInZone = this.getEspIdsForZone(zoneName)

    if (espIdsInZone.length === 0) {
      throw new Error(`Zone "${zoneName}" ist bereits leer`)
    }

    try {
      // Verschiebe alle ESPs in unkonfigurierte Zone
      for (const espId of espIdsInZone) {
        await this.moveEspToZone(espId, this.zones.defaultZone, zoneName)
      }

      // Aktualisiere verfügbare Zonen
      this.updateAvailableZones()

      window.$snackbar?.showSuccess(`Zone "${zoneName}" gelöscht - ${espIdsInZone.length} ESPs verschoben`)
      
      return { success: true, deletedZone: zoneName, movedEspCount: espIdsInZone.length }
    } catch (error) {
      console.error('[ZoneDelete] Fehler beim Löschen der Zone:', error)
      throw error
    }
  }
}
```

### **4. Responsive Box-Größen**
```vue
<!-- In DeviceManagement.vue - Dynamische Grid-Größen -->
<template>
  <!-- Bestehender Code... -->
  
  <!-- Zone Grid mit dynamischen Größen -->
  <v-row>
    <v-col 
      v-for="espId in devicesInZone" 
      :key="espId" 
      :cols="getResponsiveCols(devicesInZone.length)"
    >
      <EspDeviceCard
        :esp-id="espId"
        :is-selected="selectedDeviceId === espId"
        :class="{ 'recently-moved': isRecentlyMoved(espId) }"
        @select="handleDeviceSelect"
        @accept="handleDeviceAccept"
        @configure="handleDeviceConfigure"
        @zone-change="handleZoneChange"
      />
    </v-col>
  </v-row>
</template>

<script setup>
// Bestehender Code...

// ✅ NEU: Responsive Grid-Größen basierend auf Anzahl
const getResponsiveCols = (deviceCount) => {
  if (deviceCount === 1) return 12
  if (deviceCount === 2) return 6
  if (deviceCount === 3) return 4
  if (deviceCount === 4) return 3
  return 3 // Default für mehr als 4 Geräte
}
</script>

<style scoped>
/* ✅ NEU: Responsive Anpassungen */
@media (max-width: 768px) {
  .device-cards-container .v-col {
    padding: 4px;
  }
  
  .device-cards-container .v-row {
    margin: 0;
  }
}

@media (max-width: 480px) {
  .device-cards-container .v-col {
    padding: 2px;
  }
}
</style>
```

### **5. Einheitliche ID-Generierung**
```javascript
// In utils/deviceIdGenerator.js (NEU)
export function generateDeviceId(friendlyName) {
  if (!friendlyName) return 'agent'
  
  return friendlyName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Umlaute entfernen
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_') // Sonderzeichen zu _
    .replace(/_+/g, '_') // Mehrfache _ zu einem
    .replace(/^_|_$/g, '') // Anfang/Ende _ entfernen
}

export function generateKaiserId(friendlyName) {
  return `kaiser_${generateDeviceId(friendlyName)}`
}

export function generateEspId(friendlyName, espId) {
  if (friendlyName && friendlyName !== espId) {
    return generateDeviceId(friendlyName)
  }
  return espId
}
```

### **6. Integration in bestehende Komponenten**
```javascript
// In EspDeviceCard.vue - ID-Generierung integrieren
import { generateEspId } from '@/utils/deviceIdGenerator'

// Computed Property erweitern
const espDeviceInfo = computed(() => ({
  friendlyName: deviceInfo.value.espFriendlyName || deviceInfo.value.espUsername || props.espId,
  type: deviceInfo.value.boardType || 'ESP32',
  status: deviceInfo.value.status || 'offline',
  lastUpdate: deviceInfo.value.lastHeartbeat,
  zone: deviceInfo.value.zone,
  generatedId: generateEspId(deviceInfo.value.espFriendlyName, props.espId),
}))
```

Diese Ergänzungen vervollständigen die Anforderungen für:
- ✅ Sicherheitsfrage bei Zonen-Löschung
- ✅ Automatisches Verschwinden der unkonfigurierten Box
- ✅ Responsive Box-Größen
- ✅ MQTT-Kommunikation bei Zonenänderungen
- ✅ Einheitliche ID-Generierung
- ✅ Vollständige Integration in bestehende Strukturen