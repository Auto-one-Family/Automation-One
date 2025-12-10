<template>
  <div class="command-chain-list">
    <!-- Filter Options -->
    <div class="mb-4">
      <v-row>
        <v-col cols="12" md="6">
          <v-select
            v-model="statusFilter"
            label="Status-Filter"
            :items="statusFilterOptions"
            item-title="label"
            item-value="value"
            variant="outlined"
            density="comfortable"
            clearable
          />
        </v-col>
        <v-col cols="12" md="6">
          <v-text-field
            v-model="searchQuery"
            label="Suche nach Command-ID"
            variant="outlined"
            density="comfortable"
            prepend-inner-icon="mdi-magnify"
            clearable
          />
        </v-col>
      </v-row>
    </div>

    <!-- Command Chains List -->
    <div v-if="filteredChains.length === 0" class="text-center py-8">
      <v-icon icon="mdi-arrow-decision-outline" size="48" color="grey-lighten-1" />
      <h3 class="text-h6 mt-4 mb-2">Keine Befehlsketten gefunden</h3>
      <p class="text-body-2 text-grey">
        {{ getEmptyStateMessage() }}
      </p>
    </div>

    <div v-else>
      <v-expansion-panels>
        <v-expansion-panel
          v-for="chain in filteredChains"
          :key="chain.command_id"
          :class="getChainStatusClass(chain.status)"
        >
          <v-expansion-panel-title>
            <div class="d-flex align-center justify-space-between w-100">
              <div class="d-flex align-center">
                <v-icon
                  :icon="getChainStatusIcon(chain.status)"
                  :color="getChainStatusColor(chain.status)"
                  class="mr-2"
                  size="small"
                />
                <span class="font-mono text-caption">{{ chain.command_id }}</span>
              </div>
              <div class="d-flex align-center">
                <v-chip
                  :color="getChainStatusColor(chain.status)"
                  size="x-small"
                  variant="tonal"
                  class="mr-2"
                >
                  {{ chain.status }}
                </v-chip>
                <span class="text-caption text-grey">
                  {{ formatTimestamp(chain.created_at) }}
                </span>
              </div>
            </div>
          </v-expansion-panel-title>
          <v-expansion-panel-text>
            <CommandChainDetails :chain="chain" />
          </v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useCentralDataHub } from '@/stores/centralDataHub'
import CommandChainDetails from './CommandChainDetails.vue'

const props = defineProps({
  kaiserId: {
    type: String,
    required: true,
  },
})

// Stores
const centralDataHub = useCentralDataHub()

// Reactive Data
const statusFilter = ref(null)
const searchQuery = ref('')

// Filter Options
const statusFilterOptions = [
  { label: 'Ausstehend', value: 'pending' },
  { label: 'Aktiv', value: 'active' },
  { label: 'Abgeschlossen', value: 'completed' },
  { label: 'Fehlgeschlagen', value: 'failed' },
  { label: 'Abgebrochen', value: 'cancelled' },
]

// Computed Properties
const allChains = computed(() => {
  return Array.from(centralDataHub.hierarchicalState.commandChains.values()).filter(
    (chain) => chain.kaiser_id === props.kaiserId,
  )
})

const filteredChains = computed(() => {
  let chains = allChains.value

  // Status-Filter
  if (statusFilter.value) {
    chains = chains.filter((chain) => chain.status === statusFilter.value)
  }

  // Such-Filter
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    chains = chains.filter(
      (chain) =>
        chain.command_id.toLowerCase().includes(query) ||
        chain.path.some((node) => node.toLowerCase().includes(query)),
    )
  }

  return chains.sort((a, b) => b.created_at - a.created_at)
})

// Methods
const getChainStatusColor = (status) => {
  const colorMap = {
    pending: 'warning',
    active: 'info',
    completed: 'success',
    failed: 'error',
    cancelled: 'grey',
  }
  return colorMap[status] || 'grey'
}

const getChainStatusIcon = (status) => {
  const iconMap = {
    pending: 'mdi-clock-outline',
    active: 'mdi-play-circle',
    completed: 'mdi-check-circle',
    failed: 'mdi-alert-circle',
    cancelled: 'mdi-close-circle',
  }
  return iconMap[status] || 'mdi-help-circle'
}

const getChainStatusClass = (status) => {
  return `chain-status-${status}`
}

const formatTimestamp = (timestamp) => {
  const date = new Date(timestamp)
  return date.toLocaleString('de-DE')
}

const getEmptyStateMessage = () => {
  if (statusFilter.value || searchQuery.value) {
    return 'Keine Befehlsketten entsprechen den aktuellen Filtern.'
  }
  return 'Noch keine Befehlsketten für diesen Kaiser erstellt.'
}

// Lifecycle
onMounted(async () => {
  // Lade hierarchische Daten wenn noch nicht vorhanden
  if (allChains.value.length === 0) {
    await centralDataHub.aggregateGodData()
  }
})
</script>

<style scoped>
.command-chain-list {
  width: 100%;
}

.chain-status-pending {
  border-left: 4px solid var(--v-warning-base);
}

.chain-status-active {
  border-left: 4px solid var(--v-info-base);
}

.chain-status-completed {
  border-left: 4px solid var(--v-success-base);
}

.chain-status-failed {
  border-left: 4px solid var(--v-error-base);
}

.chain-status-cancelled {
  border-left: 4px solid var(--v-grey-base);
}

/* Responsive Design */
@media (max-width: 768px) {
  .command-chain-list .v-expansion-panel-title {
    padding: 8px;
  }
}
</style>
