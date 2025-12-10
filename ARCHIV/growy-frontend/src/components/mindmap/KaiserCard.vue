<template>
  <UnifiedCard
    class="kaiser-card-professional"
    :class="{ 'god-kaiser': isGod }"
    :title="getKaiserTitle()"
    :icon="getKaiserIcon()"
    :icon-color="getKaiserIconColor()"
    :status="getKaiserStatus()"
    :show-header-actions="true"
    :show-actions="true"
    variant="outlined"
    :compact="centralDataHub.isMobile"
  >
    <!-- Header Actions -->
    <template #header-actions>
      <div class="kaiser-metrics">
        <v-chip size="small" color="primary" variant="tonal">
          {{ configuredESPs.length }} ESPs
        </v-chip>
        <v-chip
          v-if="isGod && unconfiguredEsps.length > 0"
          size="small"
          color="warning"
          variant="tonal"
        >
          {{ unconfiguredEsps.length }} Neu
        </v-chip>
        <v-chip size="small" :color="getHealthColor()" variant="tonal">
          {{ onlineCount }}/{{ totalCount }}
        </v-chip>
      </div>
    </template>

    <!-- ESP-Sections -->
    <div class="esp-sections">
      <!-- 1. UNKONFIGURIERTE ESPs (nur bei God, prominent oben) -->
      <div v-if="isGod && unconfiguredEsps.length > 0" class="unconfigured-section">
        <div class="section-divider">
          <v-icon icon="mdi-radar" color="warning" size="16" />
          <span class="section-title">Neue Geräte entdeckt</span>
        </div>

        <div class="esp-list-unconfigured">
          <div
            v-for="esp in unconfiguredEsps"
            :key="esp.id"
            class="esp-item-unconfigured"
            @click="$emit('assign-esp', esp)"
          >
            <div class="esp-row">
              <div class="esp-status-info">
                <v-icon icon="mdi-help-circle" color="warning" size="16" />
                <span class="esp-name">{{ getESPDisplayName(esp) }}</span>
              </div>
              <v-btn
                size="x-small"
                color="warning"
                variant="outlined"
                @click.stop="$emit('assign-esp', esp)"
              >
                Zuweisen
              </v-btn>
            </div>
          </div>
        </div>
      </div>

      <!-- 2. KONFIGURIERTE ESPs -->
      <div class="configured-section" v-if="configuredESPs.length > 0">
        <div class="section-divider" v-if="isGod && unconfiguredEsps.length > 0">
          <v-icon icon="mdi-check-circle" color="success" size="16" />
          <span class="section-title">Konfigurierte Geräte</span>
        </div>

        <!-- Zone-Navigation (NUR wenn mehrere Zonen) -->
        <div class="zone-navigation" v-if="availableZones.length > 1">
          <v-chip-group v-model="selectedZone" selected-class="text-primary" class="zone-chips">
            <v-chip size="small" variant="outlined" value="all">
              Alle ({{ configuredESPs.length }})
            </v-chip>
            <v-chip
              v-for="zone in availableZones"
              :key="zone.name"
              size="small"
              variant="outlined"
              :value="zone.name"
            >
              {{ zone.name }} ({{ zone.count }})
            </v-chip>
          </v-chip-group>
        </div>

        <!-- ESP-Liste (gefiltert) -->
        <div class="esp-list-configured">
          <div
            v-for="esp in filteredConfiguredESPs"
            :key="esp.id"
            class="esp-item-configured"
            draggable="true"
            @dragstart="handleEspDrag(esp)"
            @click="$emit('esp-configure', esp)"
          >
            <div class="esp-row">
              <div class="esp-status-info">
                <v-icon :icon="getESPIcon(esp)" :color="getESPColor(esp)" size="16" />
                <span class="esp-name">{{ getESPDisplayName(esp) }}</span>
                <v-chip size="x-small" color="primary" variant="flat" class="zone-tag">
                  {{ getZoneForEsp(esp.id) || 'Standard' }}
                </v-chip>
              </div>

              <div class="esp-metadata">
                <span class="metric">{{ getSensorCount(esp.id) }}S</span>
                <span class="metric">{{ getActuatorCount(esp.id) }}A</span>
                <span class="connection-dots" :class="getConnectionQuality(esp.id)">
                  {{ getConnectionDots(esp) }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Quick Actions (Footer) -->
    <template #actions>
      <v-btn size="small" variant="outlined" color="primary" @click="$emit('add-esp')">
        <v-icon icon="mdi-plus" size="16" />
        ESP hinzufügen
      </v-btn>
      <v-btn size="small" variant="text" @click="$emit('kaiser-configure')">
        <v-icon icon="mdi-cog" size="16" />
        Konfigurieren
      </v-btn>
    </template>
  </UnifiedCard>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useCentralDataHub } from '@/stores/centralDataHub'
import UnifiedCard from '@/components/common/UnifiedCard.vue'

const props = defineProps({
  kaiser: { type: Object, required: true },
  esps: { type: Array, default: () => [] },
  unconfiguredEsps: { type: Array, default: () => [] }, // NUR für God
  isGod: { type: Boolean, default: false },
})

const emit = defineEmits(['esp-configure', 'esp-drag', 'assign-esp', 'add-esp', 'kaiser-configure'])

// ✅ VERWENDE BESTEHENDE STORE-REFERENZEN
const centralDataHub = useCentralDataHub()
const selectedZone = ref('all')

// ✅ VERWENDE BESTEHENDE LOGIC aus vorhandenen Komponenten
const configuredESPs = computed(() => {
  return props.esps.filter((esp) => {
    const zone = centralDataHub.centralConfig.getZoneForEsp(esp.id)
    return zone && zone !== '🕳️ Unkonfiguriert'
  })
})

const availableZones = computed(() => {
  const zones = new Map()
  configuredESPs.value.forEach((esp) => {
    const zone = centralDataHub.centralConfig.getZoneForEsp(esp.id) || 'Standard'
    zones.set(zone, (zones.get(zone) || 0) + 1)
  })
  return Array.from(zones.entries()).map(([name, count]) => ({ name, count }))
})

const filteredConfiguredESPs = computed(() => {
  if (selectedZone.value === 'all') return configuredESPs.value
  return configuredESPs.value.filter((esp) => {
    const zone = centralDataHub.centralConfig.getZoneForEsp(esp.id)
    return zone === selectedZone.value
  })
})

// ✅ NUTZE BESTEHENDE HELPER-FUNKTIONEN
const getESPDisplayName = (esp) => {
  // Verwende bestehende Logik aus centralDataHub
  return (
    centralDataHub.getDeviceInfo(esp.id)?.espFriendlyName ||
    centralDataHub.getDeviceInfo(esp.id)?.espUsername ||
    esp.id
  )
}

const getESPIcon = (esp) => {
  const deviceInfo = centralDataHub.getDeviceInfo(esp.id)
  const status = deviceInfo?.status || 'offline'
  const icons = {
    online: 'mdi-wifi',
    offline: 'mdi-wifi-off',
    configured: 'mdi-check-circle',
  }
  return icons[status] || 'mdi-help-circle'
}

const getESPColor = (esp) => {
  const deviceInfo = centralDataHub.getDeviceInfo(esp.id)
  const status = deviceInfo?.status || 'offline'
  const colors = {
    online: 'success',
    offline: 'error',
    configured: 'info',
  }
  return colors[status] || 'grey'
}

const getConnectionDots = (esp) => {
  const deviceInfo = centralDataHub.getDeviceInfo(esp.id)
  const quality = deviceInfo?.connectionQuality || 'unknown'
  const dots = {
    excellent: '●●●',
    good: '●●○',
    poor: '●○○',
    unknown: '○○○',
  }
  return dots[quality] || '○○○'
}

const onlineCount = computed(() => {
  return [...configuredESPs.value, ...props.unconfiguredEsps].filter((esp) => {
    const deviceInfo = centralDataHub.getDeviceInfo(esp.id)
    return deviceInfo?.status === 'online'
  }).length
})

const totalCount = computed(() => {
  return configuredESPs.value.length + props.unconfiguredEsps.length
})

const getKaiserTitle = () => {
  if (props.isGod) {
    return 'God Controller'
  }
  return props.kaiser.name || props.kaiser.id
}

const getKaiserIcon = () => {
  if (props.isGod) {
    return 'mdi-crown'
  }
  return 'mdi-server'
}

const getKaiserIconColor = () => {
  if (props.isGod) {
    return 'warning'
  }
  return 'primary'
}

const getKaiserStatus = () => {
  if (props.isGod) {
    return props.kaiser.godAsKaiser ? 'God + Kaiser Modus' : 'God Modus'
  }
  return props.kaiser.status || 'Online'
}

const getHealthColor = () => {
  const percentage = totalCount.value > 0 ? (onlineCount.value / totalCount.value) * 100 : 0
  if (percentage >= 80) return 'success'
  if (percentage >= 50) return 'warning'
  return 'error'
}

const handleEspDrag = (esp) => {
  emit('esp-drag', esp)
}

// ✅ NEU: Helper-Funktionen für ESP-Daten
const getZoneForEsp = (espId) => {
  return centralDataHub.centralConfig.getZoneForEsp(espId)
}

const getSensorCount = (espId) => {
  const deviceInfo = centralDataHub.getDeviceInfo(espId)
  return deviceInfo?.sensors?.length || 0
}

const getActuatorCount = (espId) => {
  const deviceInfo = centralDataHub.getDeviceInfo(espId)
  return deviceInfo?.actuators?.length || 0
}

const getConnectionQuality = (espId) => {
  const deviceInfo = centralDataHub.getDeviceInfo(espId)
  return deviceInfo?.connectionQuality || 'unknown'
}
</script>

<style scoped>
/* God-Kaiser spezielle Behandlung */
.kaiser-card-professional.god-kaiser {
  border-left: 4px solid var(--v-theme-warning);
  background: linear-gradient(135deg, #fff8e1 0%, #ffffff 100%);
  box-shadow: 0 4px 16px rgba(255, 152, 0, 0.1);
}

/* ESP-Sections Container */
.esp-sections {
  max-height: 400px;
  overflow-y: auto;
}

/* Section Divider */
.section-divider {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px 8px;
  background: rgba(0, 0, 0, 0.02);
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}

.section-title {
  font-size: 0.8rem;
  font-weight: 600;
  color: rgba(0, 0, 0, 0.7);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* Unkonfigurierte ESPs - Warning Style */
.unconfigured-section {
  background: rgba(var(--v-theme-warning), 0.05);
}

.esp-list-unconfigured {
  padding: 8px;
}

.esp-item-unconfigured {
  background: white;
  border: 1px solid rgba(var(--v-theme-warning), 0.3);
  border-left: 3px solid var(--v-theme-warning);
  border-radius: 6px;
  margin-bottom: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.esp-item-unconfigured:hover {
  background: rgba(var(--v-theme-warning), 0.1);
  transform: translateX(2px);
}

/* Konfigurierte ESPs - Standard Style */
.esp-list-configured {
  padding: 8px;
}

.esp-item-configured {
  background: white;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 6px;
  margin-bottom: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.esp-item-configured:hover {
  border-color: rgba(var(--v-theme-primary), 0.3);
  background: rgba(var(--v-theme-primary), 0.02);
}

/* ESP-Row Layout */
.esp-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
}

.esp-status-info {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
}

.esp-name {
  font-weight: 500;
  font-size: 0.9rem;
  color: rgba(0, 0, 0, 0.87);
}

.zone-tag {
  margin-left: 8px;
  font-size: 0.65rem !important;
  height: 18px;
}

.esp-metadata {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 0.75rem;
  color: rgba(0, 0, 0, 0.6);
}

.metric {
  font-weight: 600;
  min-width: 20px;
}

.connection-dots {
  font-family: monospace;
  font-size: 0.7rem;
}

.connection-dots.excellent {
  color: #4caf50;
}
.connection-dots.good {
  color: #ff9800;
}
.connection-dots.poor {
  color: #f44336;
}

/* Zone Navigation */
.zone-navigation {
  padding: 8px 12px;
  background: rgba(0, 0, 0, 0.02);
}

.zone-chips {
  margin: 0;
}

/* Kaiser Actions */
.kaiser-actions {
  display: flex;
  justify-content: space-between;
  padding: 12px 16px;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
  background: rgba(0, 0, 0, 0.02);
}

/* Mobile Optimierung */
@media (max-width: 768px) {
  .esp-row {
    padding: 8px 10px;
  }

  .esp-metadata {
    gap: 8px;
  }
}
</style>
