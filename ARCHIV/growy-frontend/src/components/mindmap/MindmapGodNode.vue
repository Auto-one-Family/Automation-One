<template>
  <UnifiedCard
    :title="computedGodData.name"
    :subtitle="computedGodData.id"
    icon="mdi-brain"
    icon-color="warning"
    :status="computedGodData.status"
    variant="outlined"
    class="mindmap-node god-node"
    :class="{ expanded: isExpanded }"
    :interactive="true"
    :show-header-actions="true"
    :show-expand-button="true"
    :expanded="isExpanded"
    @click="$emit('expand')"
    @expand="$emit('expand')"
  >
    <!-- Header Actions -->
    <template #header-actions>
      <!-- ✅ OPTIMIERT: God als Kaiser Indikator - nur wenn relevant -->
      <v-chip
        v-if="computedGodData.godAsKaiser"
        size="x-small"
        color="primary"
        variant="tonal"
        class="mr-2"
      >
        <v-icon icon="mdi-crown" size="x-small" class="mr-1" />
        Kaiser
      </v-chip>

      <v-btn icon="mdi-cog" @click.stop="$emit('configure')" />
    </template>

    <!-- Content -->
    <template #content>
      <v-expand-transition>
        <div v-if="isExpanded">
          <!-- ✅ OPTIMIERT: Kompakte System-Information -->
          <div class="system-overview mb-4">
            <v-row>
              <v-col cols="4">
                <div class="stat-card text-center">
                  <div class="text-h4 font-weight-bold text-warning">
                    {{ computedGodData.kaiserCount }}
                  </div>
                  <div class="text-caption">Kaiser-Systeme</div>
                </div>
              </v-col>
              <v-col cols="4">
                <div class="stat-card text-center">
                  <div class="text-h4 font-weight-bold text-success">
                    {{ computedGodData.espCount }}
                  </div>
                  <div class="text-caption">Feldgeräte</div>
                </div>
              </v-col>
              <v-col cols="4">
                <div class="stat-card text-center">
                  <div class="text-h4 font-weight-bold text-info">{{ systemHealth }}%</div>
                  <div class="text-caption">System-Health</div>
                </div>
              </v-col>
            </v-row>
          </div>

          <!-- ✅ OPTIMIERT: God als Kaiser Information - nur wenn relevant -->
          <div v-if="computedGodData.godAsKaiser" class="god-kaiser-info mb-4">
            <v-alert type="info" variant="tonal" class="mb-4">
              <template #prepend>
                <v-icon icon="mdi-crown" />
              </template>
              <div>
                <strong>God Pi als Kaiser:</strong> Verwaltet alle ESP-Geräte direkt.
                <br />
                <strong>Kaiser ID:</strong> {{ computedGodData.kaiserId }}
              </div>
            </v-alert>
          </div>

          <!-- ✅ OPTIMIERT: Kaiser-Übersicht - nur wenn andere Kaiser vorhanden -->
          <div v-if="kaiserSystems.length > 0" class="kaiser-overview-section mb-4">
            <h4 class="text-subtitle-1 font-weight-medium mb-3">
              <v-icon icon="mdi-crown" size="small" class="mr-1" />
              Kaiser-Systeme ({{ kaiserSystems.length }})
            </h4>
            <div class="kaiser-grid">
              <div
                v-for="kaiser in kaiserSystems"
                :key="kaiser.id"
                class="kaiser-preview"
                @click="selectKaiser(kaiser.id)"
              >
                <v-chip
                  :color="kaiser.status === 'online' ? 'primary' : 'grey'"
                  size="small"
                  variant="tonal"
                  class="kaiser-chip"
                >
                  <v-icon
                    :icon="kaiser.status === 'online' ? 'mdi-wifi' : 'mdi-wifi-off'"
                    size="small"
                    class="mr-1"
                  />
                  {{ kaiser.name }}
                </v-chip>
              </div>
            </div>
          </div>

          <!-- ✅ OPTIMIERT: System-Erklärung nur bei Problemen -->
          <div
            v-if="systemExplanation && systemExplanation.healthStatus !== 'good'"
            class="system-explanation-section"
          >
            <v-alert
              :type="systemExplanation.healthStatus === 'good' ? 'info' : 'warning'"
              variant="tonal"
              class="mb-4"
            >
              <template #prepend>
                <v-icon icon="mdi-information" size="large" />
              </template>
              <div class="explanation-content">
                <h4 class="text-h6 font-weight-medium mb-2">{{ systemExplanation.title }}</h4>
                <p class="text-body-2 mb-3">
                  {{ systemExplanation.description }}
                </p>
                <div v-if="systemExplanation.healthMessage" class="mb-3">
                  <v-chip
                    :color="systemExplanation.healthStatus === 'good' ? 'success' : 'warning'"
                    size="small"
                    variant="tonal"
                  >
                    <v-icon
                      :icon="
                        systemExplanation.healthStatus === 'good' ? 'mdi-check-circle' : 'mdi-alert'
                      "
                      size="small"
                      class="mr-1"
                    />
                    {{ systemExplanation.healthMessage }}
                  </v-chip>
                </div>
              </div>
            </v-alert>
          </div>
        </div>
      </v-expand-transition>
    </template>
  </UnifiedCard>
</template>

<script setup>
import { computed } from 'vue'
import { useCentralDataHub } from '@/stores/centralDataHub'
import { useSystemExplanations } from '@/composables/useSystemExplanations'
import UnifiedCard from '@/components/common/UnifiedCard.vue'

// Props
defineProps({
  godData: {
    type: Object,
    required: true,
  },
  isExpanded: {
    type: Boolean,
    default: false,
  },
})

// Emits
const emit = defineEmits(['expand', 'configure', 'add-kaiser', 'update', 'select-kaiser'])

// Stores
const centralDataHub = useCentralDataHub()
const mqttStore = computed(() => centralDataHub.mqttStore)
const centralConfig = computed(() => centralDataHub.centralConfig)
const { getCachedExplanation } = useSystemExplanations()

// ✅ OPTIMIERT: Konsolidierte God-Daten mit allen relevanten Informationen
const computedGodData = computed(() => {
  const godName = centralConfig.value.godName || 'God Pi'
  const godId = centralConfig.value.getGodId
  const godAsKaiser = centralConfig.value.isGodKaiser
  const godKaiserId = centralConfig.value.getGodKaiserId
  const isConnected = mqttStore.value.isConnected

  // ✅ OPTIMIERT: Verwende hierarchische Daten für Kaiser-Anzahl
  const kaiserCount = centralDataHub.hierarchicalState.kaisers.size

  return {
    id: godId,
    name: godName,
    status: isConnected ? 'online' : 'offline',
    type: 'central_controller',
    godAsKaiser: godAsKaiser,
    kaiserId: godKaiserId,
    kaiserCount: kaiserCount,
    espCount: espDevices.value.length,
  }
})

// ✅ OPTIMIERT: ESP-Geräte direkt vom God verwaltet
const espDevices = computed(() => {
  if (centralConfig.value.isGodKaiser) {
    return Array.from(mqttStore.value.espDevices.keys())
  }
  return []
})

// ✅ OPTIMIERT: Kaiser-Systeme aus hierarchischer Struktur
const kaiserSystems = computed(() => {
  return Array.from(centralDataHub.hierarchicalState.kaisers.values()).map((kaiser) => ({
    id: kaiser.id,
    name: centralConfig.value.getKaiserDisplayName(kaiser.id),
    status: kaiser.status || 'offline',
  }))
})

// ✅ OPTIMIERT: System-Health basierend auf realen Daten
const systemHealth = computed(() => {
  let health = 100

  // Reduziere Health basierend auf Offline-Kaisern
  const offlineKaisers = kaiserSystems.value.filter((k) => k.status === 'offline').length
  const totalKaisers = kaiserSystems.value.length
  if (totalKaisers > 0) {
    health -= (offlineKaisers / totalKaisers) * 30
  }

  // Reduziere Health basierend auf MQTT-Verbindung
  if (!mqttStore.value.isConnected) {
    health -= 20
  }

  // Reduziere Health basierend auf ESP-Status
  const offlineEsps = espDevices.value.filter((espId) => {
    const device = mqttStore.value.espDevices.get(espId)
    return device && device.status === 'offline'
  }).length
  const totalEsps = espDevices.value.length
  if (totalEsps > 0) {
    health -= (offlineEsps / totalEsps) * 20
  }

  return Math.max(0, Math.round(health))
})

// ✅ OPTIMIERT: System-Erklärung nur bei Problemen
const systemExplanation = computed(() => {
  if (systemHealth.value >= 80) return null // Keine Erklärung bei gutem Health
  return getCachedExplanation('god')
})

// Methods
const selectKaiser = (kaiserId) => {
  emit('select-kaiser', kaiserId)
}
</script>

<style scoped>
/* ✅ OPTIMIERT: Mindmap-spezifische Styles für UnifiedCard */
.mindmap-node {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  cursor: pointer;
  overflow: hidden;
}

.mindmap-node:hover {
  transform: translateY(-2px);
}

.mindmap-node.expanded {
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.2);
}

/* ✅ OPTIMIERT: System-Übersicht */
.system-overview {
  margin-bottom: 1.5rem;
}

.stat-card {
  background: white;
  border-radius: 12px;
  padding: 1rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  transition: transform 0.2s ease;
}

.stat-card:hover {
  transform: translateY(-2px);
}

/* ✅ OPTIMIERT: Kaiser-Übersicht */
.kaiser-overview-section {
  margin-bottom: 1.5rem;
}

.kaiser-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.kaiser-preview {
  cursor: pointer;
  transition: transform 0.2s ease;
}

.kaiser-preview:hover {
  transform: scale(1.05);
}

.kaiser-chip {
  cursor: pointer;
}

/* ✅ OPTIMIERT: System-Erklärung */
.system-explanation-section {
  margin-bottom: 1.5rem;
}

.explanation-content h4 {
  color: #1976d2;
  margin-bottom: 0.5rem;
}

/* Spezifische Node-Typen */
.god-node {
  border-left: 4px solid #ff9800;
  max-width: 600px;
  min-width: 500px;
}

/* Animations */
.v-expand-transition-enter-active,
.v-expand-transition-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

/* Mobile Optimizations */
@media (max-width: 768px) {
  .mindmap-node {
    max-width: 100%;
  }

  .kaiser-grid {
    justify-content: center;
  }
}
</style>
