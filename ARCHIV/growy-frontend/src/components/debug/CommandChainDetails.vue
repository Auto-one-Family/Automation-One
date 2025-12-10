<template>
  <div class="command-chain-details">
    <!-- Chain Information -->
    <div class="mb-4">
      <v-row>
        <v-col cols="12" md="6">
          <div class="text-subtitle-2 mb-2">Befehlsketten-Information</div>
          <v-list density="compact" variant="text">
            <v-list-item>
              <template #prepend>
                <v-icon icon="mdi-identifier" size="small" />
              </template>
              <v-list-item-title class="text-body-2">Command ID</v-list-item-title>
              <template #append>
                <span class="font-mono text-caption">{{ chain.command_id }}</span>
              </template>
            </v-list-item>
            <v-list-item>
              <template #prepend>
                <v-icon icon="mdi-clock" size="small" />
              </template>
              <v-list-item-title class="text-body-2">Erstellt</v-list-item-title>
              <template #append>
                <span class="text-caption">{{ formatTimestamp(chain.created_at) }}</span>
              </template>
            </v-list-item>
            <v-list-item v-if="chain.completed_at">
              <template #prepend>
                <v-icon icon="mdi-check-circle" size="small" />
              </template>
              <v-list-item-title class="text-body-2">Abgeschlossen</v-list-item-title>
              <template #append>
                <span class="text-caption">{{ formatTimestamp(chain.completed_at) }}</span>
              </template>
            </v-list-item>
          </v-list>
        </v-col>
        <v-col cols="12" md="6">
          <div class="text-subtitle-2 mb-2">Status-Details</div>
          <v-list density="compact" variant="text">
            <v-list-item>
              <template #prepend>
                <v-icon
                  :icon="getChainStatusIcon(chain.status)"
                  :color="getChainStatusColor(chain.status)"
                  size="small"
                />
              </template>
              <v-list-item-title class="text-body-2">Status</v-list-item-title>
              <template #append>
                <v-chip :color="getChainStatusColor(chain.status)" size="x-small" variant="tonal">
                  {{ chain.status }}
                </v-chip>
              </template>
            </v-list-item>
            <v-list-item v-if="chain.type">
              <template #prepend>
                <v-icon icon="mdi-tag" size="small" />
              </template>
              <v-list-item-title class="text-body-2">Typ</v-list-item-title>
              <template #append>
                <span class="text-caption">{{ getChainTypeLabel(chain.type) }}</span>
              </template>
            </v-list-item>
            <v-list-item v-if="chain.priority">
              <template #prepend>
                <v-icon icon="mdi-priority-high" size="small" />
              </template>
              <v-list-item-title class="text-body-2">Priorität</v-list-item-title>
              <template #append>
                <span class="text-caption">{{ chain.priority }}</span>
              </template>
            </v-list-item>
          </v-list>
        </v-col>
      </v-row>
    </div>

    <!-- Command Path -->
    <div class="mb-4">
      <div class="text-subtitle-2 mb-2">Befehlspfad</div>
      <v-card variant="outlined" class="pa-3">
        <div class="command-path">
          <div v-for="(node, index) in chain.path" :key="index" class="path-node">
            <v-chip
              :color="getNodeStatusColor(node.status)"
              size="small"
              variant="tonal"
              class="mr-2"
            >
              <v-icon :icon="getNodeStatusIcon(node.status)" size="small" class="mr-1" />
              {{ node.name || node.id }}
            </v-chip>
            <v-icon
              v-if="index < chain.path.length - 1"
              icon="mdi-arrow-right"
              color="grey"
              size="small"
              class="mx-2"
            />
          </div>
        </div>
      </v-card>
    </div>

    <!-- Responses -->
    <div v-if="chain.responses && chain.responses.length > 0" class="mb-4">
      <div class="text-subtitle-2 mb-2">Antworten</div>
      <v-expansion-panels>
        <v-expansion-panel v-for="(response, index) in chain.responses" :key="index">
          <v-expansion-panel-title>
            <div class="d-flex align-center">
              <v-icon
                :icon="getResponseStatusIcon(response.status)"
                :color="getResponseStatusColor(response.status)"
                size="small"
                class="mr-2"
              />
              <span class="text-body-2">{{ response.node_name || response.node_id }}</span>
              <v-chip
                :color="getResponseStatusColor(response.status)"
                size="x-small"
                variant="tonal"
                class="ml-2"
              >
                {{ response.status }}
              </v-chip>
            </div>
          </v-expansion-panel-title>
          <v-expansion-panel-text>
            <div class="response-details">
              <div v-if="response.timestamp" class="mb-2">
                <strong>Zeitstempel:</strong> {{ formatTimestamp(response.timestamp) }}
              </div>
              <div v-if="response.data" class="mb-2">
                <strong>Daten:</strong>
                <pre class="response-data">{{ JSON.stringify(response.data, null, 2) }}</pre>
              </div>
              <div v-if="response.error" class="mb-2">
                <strong>Fehler:</strong>
                <v-alert type="error" variant="tonal" density="compact" class="mt-1">
                  {{ response.error }}
                </v-alert>
              </div>
            </div>
          </v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>
    </div>

    <!-- Metadata -->
    <div v-if="chain.metadata" class="mb-4">
      <div class="text-subtitle-2 mb-2">Metadaten</div>
      <v-card variant="outlined" class="pa-3">
        <pre class="metadata-json">{{ JSON.stringify(chain.metadata, null, 2) }}</pre>
      </v-card>
    </div>

    <!-- Actions -->
    <div class="d-flex justify-end gap-2">
      <v-btn
        v-if="chain.status === 'active'"
        color="warning"
        variant="outlined"
        size="small"
        prepend-icon="mdi-stop"
        @click="cancelChain"
      >
        Abbrechen
      </v-btn>
      <v-btn
        v-if="chain.status === 'failed'"
        color="primary"
        variant="outlined"
        size="small"
        prepend-icon="mdi-refresh"
        @click="retryChain"
      >
        Wiederholen
      </v-btn>
      <v-btn
        color="secondary"
        variant="outlined"
        size="small"
        prepend-icon="mdi-delete"
        @click="deleteChain"
      >
        Löschen
      </v-btn>
    </div>
  </div>
</template>

<script setup>
import { useCentralDataHub } from '@/stores/centralDataHub'
import { safeSuccess, safeError } from '@/utils/snackbarUtils'

const props = defineProps({
  chain: {
    type: Object,
    required: true,
  },
})

// Stores
const centralDataHub = useCentralDataHub()

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

const getChainTypeLabel = (type) => {
  const typeMap = {
    esp_transfer: 'ESP-Transfer',
    kaiser_register: 'Kaiser-Registrierung',
    cross_kaiser_logic: 'Cross-Kaiser-Logik',
    emergency_stop: 'Emergency Stop',
    system_command: 'System-Befehl',
  }
  return typeMap[type] || type
}

const getNodeStatusColor = (status) => {
  const colorMap = {
    pending: 'warning',
    active: 'info',
    completed: 'success',
    failed: 'error',
    skipped: 'grey',
  }
  return colorMap[status] || 'grey'
}

const getNodeStatusIcon = (status) => {
  const iconMap = {
    pending: 'mdi-clock-outline',
    active: 'mdi-play-circle',
    completed: 'mdi-check-circle',
    failed: 'mdi-alert-circle',
    skipped: 'mdi-skip-next',
  }
  return iconMap[status] || 'mdi-help-circle'
}

const getResponseStatusColor = (status) => {
  return getNodeStatusColor(status)
}

const getResponseStatusIcon = (status) => {
  return getNodeStatusIcon(status)
}

const formatTimestamp = (timestamp) => {
  const date = new Date(timestamp)
  return date.toLocaleString('de-DE')
}

const cancelChain = async () => {
  try {
    await centralDataHub.cancelCommandChain(props.chain.command_id)
    safeSuccess('Befehlskette abgebrochen')
  } catch (error) {
    console.error('Failed to cancel chain:', error)
    safeError('Fehler beim Abbrechen der Befehlskette')
  }
}

const retryChain = async () => {
  try {
    await centralDataHub.retryCommandChain(props.chain.command_id)
    safeSuccess('Befehlskette wird wiederholt')
  } catch (error) {
    console.error('Failed to retry chain:', error)
    safeError('Fehler beim Wiederholen der Befehlskette')
  }
}

const deleteChain = async () => {
  try {
    await centralDataHub.deleteCommandChain(props.chain.command_id)
    safeSuccess('Befehlskette gelöscht')
  } catch (error) {
    console.error('Failed to delete chain:', error)
    safeError('Fehler beim Löschen der Befehlskette')
  }
}
</script>

<style scoped>
.command-chain-details {
  width: 100%;
}

.command-path {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.path-node {
  display: flex;
  align-items: center;
}

.response-data,
.metadata-json {
  background: rgba(0, 0, 0, 0.05);
  padding: 0.5rem;
  border-radius: 4px;
  font-family: 'Courier New', monospace;
  font-size: 0.875rem;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 200px;
  overflow-y: auto;
}

.response-details {
  font-size: 0.875rem;
}

/* Responsive Design */
@media (max-width: 768px) {
  .command-path {
    flex-direction: column;
    align-items: flex-start;
  }

  .path-node {
    margin-bottom: 0.5rem;
  }
}
</style>
