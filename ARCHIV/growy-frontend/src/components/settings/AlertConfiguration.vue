<template>
  <v-card variant="outlined" class="alert-configuration">
    <v-card-title class="d-flex align-center">
      <v-icon icon="mdi-bell-alert" class="mr-2" color="warning" />
      Alert-Konfiguration
      <v-spacer />

      <!-- 🆕 NEU: Profil-Auswahl -->
      <v-select
        v-model="selectedProfileId"
        :items="availableProfiles"
        item-title="name"
        item-value="id"
        density="compact"
        hide-details
        variant="outlined"
        style="max-width: 200px"
        class="mr-2"
        @update:model-value="handleProfileChange"
      >
        <template v-slot:prepend>
          <v-icon icon="mdi-account-cog" size="small" />
        </template>
        <template v-slot:item="{ item, props }">
          <v-list-item v-bind="props">
            <template v-slot:prepend>
              <v-icon
                :icon="item.raw.id === activeProfileId ? 'mdi-check-circle' : 'mdi-circle-outline'"
                :color="item.raw.id === activeProfileId ? 'success' : 'grey'"
              />
            </template>
            <v-list-item-title>{{ item.raw.name }}</v-list-item-title>
            <v-list-item-subtitle>{{ item.raw.description }}</v-list-item-subtitle>
          </v-list-item>
        </template>
      </v-select>

      <!-- 🆕 NEU: Profil-Management Buttons -->
      <v-btn
        icon="mdi-plus"
        size="small"
        variant="text"
        color="success"
        @click="showCreateProfileDialog = true"
        title="Neues Profil erstellen"
        class="mr-1"
      />
      <v-btn
        icon="mdi-content-save"
        size="small"
        variant="text"
        color="primary"
        @click="saveCurrentAsProfile"
        title="Aktuelle Konfiguration speichern"
        class="mr-1"
      />
      <v-btn
        icon="mdi-delete"
        size="small"
        variant="text"
        color="error"
        @click="deleteCurrentProfile"
        title="Aktuelles Profil löschen"
        :disabled="selectedProfileId === 'default'"
        class="mr-2"
      />

      <v-switch
        v-model="alertSystem.enabled"
        @update:model-value="toggleAlertSystem"
        color="warning"
        hide-details
      />
    </v-card-title>

    <v-card-text>
      <!-- Benachrichtigungskanäle -->
      <div class="mb-6">
        <h4 class="text-subtitle-1 mb-3">Benachrichtigungskanäle</h4>
        <v-row>
          <v-col cols="12" sm="6" md="3">
            <v-switch
              v-model="alertSystem.notificationChannels.snackbar"
              @update:model-value="(val) => toggleNotificationChannel('snackbar', val)"
              label="Snackbar"
              color="primary"
              hide-details
            />
          </v-col>
          <v-col cols="12" sm="6" md="3">
            <v-switch
              v-model="alertSystem.notificationChannels.sound"
              @update:model-value="(val) => toggleNotificationChannel('sound', val)"
              label="Sound"
              color="warning"
              hide-details
            />
          </v-col>
          <v-col cols="12" sm="6" md="3">
            <v-switch
              v-model="alertSystem.notificationChannels.email"
              @update:model-value="(val) => toggleNotificationChannel('email', val)"
              label="E-Mail"
              color="info"
              hide-details
            />
          </v-col>
          <v-col cols="12" sm="6" md="3">
            <v-switch
              v-model="alertSystem.notificationChannels.push"
              @update:model-value="(val) => toggleNotificationChannel('push', val)"
              label="Push"
              color="success"
              hide-details
            />
          </v-col>
        </v-row>
      </div>

      <!-- Sensor-spezifische Alert-Konfiguration -->
      <div class="mb-6">
        <h4 class="text-subtitle-1 mb-3">Sensor-Alerts konfigurieren</h4>
        <v-expansion-panels>
          <v-expansion-panel v-for="sensor in availableSensors" :key="sensor.id" class="mb-2">
            <v-expansion-panel-title>
              <div class="d-flex align-center">
                <v-icon :icon="getSensorIcon(sensor.type)" class="mr-2" />
                {{ sensor.name }} ({{ sensor.espId }})
                <v-chip
                  v-if="getAlertConfig(sensor.espId, sensor.gpio)"
                  color="warning"
                  size="small"
                  class="ml-2"
                >
                  Alerts aktiv
                </v-chip>
              </div>
            </v-expansion-panel-title>
            <v-expansion-panel-text>
              <SensorAlertConfig
                :sensor="sensor"
                :alert-config="getAlertConfig(sensor.espId, sensor.gpio)"
                @config-updated="handleAlertConfigUpdate"
              />
            </v-expansion-panel-text>
          </v-expansion-panel>
        </v-expansion-panels>
      </div>

      <!-- Aktive Alerts -->
      <div class="mb-6" v-if="activeAlerts.length > 0">
        <h4 class="text-subtitle-1 mb-3">Aktive Alerts</h4>
        <v-list>
          <v-list-item
            v-for="alert in activeAlerts"
            :key="alert.id"
            :color="getAlertColor(alert.type)"
            variant="tonal"
            class="mb-2"
          >
            <template #prepend>
              <v-icon :icon="getAlertIcon(alert.type)" />
            </template>
            <v-list-item-title>{{ alert.data.message }}</v-list-item-title>
            <v-list-item-subtitle>
              {{ formatTimeAgo(alert.timestamp) }}
            </v-list-item-subtitle>
            <template #append>
              <v-btn
                size="small"
                color="primary"
                variant="text"
                @click="acknowledgeAlert(alert.id)"
              >
                Bestätigen
              </v-btn>
            </template>
          </v-list-item>
        </v-list>
      </div>

      <!-- Alert-Historie -->
      <div>
        <h4 class="text-subtitle-1 mb-3">Alert-Historie</h4>
        <v-list v-if="alertHistory.length > 0" class="elevation-1">
          <v-list-item v-for="alert in alertHistory.slice(0, 10)" :key="alert.id" class="mb-2">
            <template #prepend>
              <v-icon
                :icon="getAlertIcon(alert.type)"
                :color="getAlertColor(alert.type)"
                size="small"
              />
            </template>
            <v-list-item-title class="d-flex align-center">
              <v-chip :color="getAlertColor(alert.type)" size="small" class="mr-2">
                {{ getAlertTypeName(alert.type) }}
              </v-chip>
              {{ alert.data?.message || 'Alert' }}
            </v-list-item-title>
            <v-list-item-subtitle>
              {{ formatTimestamp(alert.timestamp) }}
            </v-list-item-subtitle>
            <template #append>
              <v-icon
                :icon="alert.acknowledged ? 'mdi-check-circle' : 'mdi-clock-outline'"
                :color="alert.acknowledged ? 'success' : 'warning'"
                size="small"
              />
            </template>
          </v-list-item>
        </v-list>
        <v-alert v-else type="info" variant="tonal" density="compact">
          Keine Alert-Historie verfügbar
        </v-alert>
      </div>
    </v-card-text>

    <!-- 🆕 NEU: Profil erstellen Dialog -->
    <v-dialog v-model="showCreateProfileDialog" max-width="500px">
      <v-card>
        <v-card-title>Neues Alert-Profil erstellen</v-card-title>
        <v-card-text>
          <v-text-field
            v-model="newProfileName"
            label="Profil-Name"
            placeholder="z.B. Gewächshaus Sommer"
            variant="outlined"
            class="mb-3"
          />
          <v-textarea
            v-model="newProfileDescription"
            label="Beschreibung (optional)"
            placeholder="Beschreibung der Konfiguration..."
            variant="outlined"
            rows="3"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="outlined" @click="showCreateProfileDialog = false"> Abbrechen </v-btn>
          <v-btn color="primary" @click="createNewProfile" :disabled="!newProfileName.trim()">
            Erstellen
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-card>
</template>

<script>
import { defineComponent, computed, ref } from 'vue'
import { useCentralDataHub } from '@/stores/centralDataHub'
import SensorAlertConfig from './SensorAlertConfig.vue'

export default defineComponent({
  name: 'AlertConfiguration',
  components: {
    SensorAlertConfig,
  },
  setup() {
    const centralDataHub = useCentralDataHub()
    const dashboardStore = computed(() => centralDataHub.dashboardGenerator)
    const mqttStore = computed(() => centralDataHub.mqttStore)

    // 🆕 NEU: Profil-Management State
    const showCreateProfileDialog = ref(false)
    const newProfileName = ref('')
    const newProfileDescription = ref('')

    const alertSystem = computed(() => dashboardStore.value.alertSystem)
    const activeAlerts = computed(() =>
      Array.from(dashboardStore.value.alertSystem.activeAlerts.values()),
    )
    const alertHistory = computed(() => dashboardStore.value.alertSystem.alertHistory)

    // 🆕 NEU: Profil-Computed Properties
    const availableProfiles = computed(() => dashboardStore.value.getAlertProfiles())
    const activeProfileId = computed(() => dashboardStore.value.alertProfiles.activeProfileId)
    const selectedProfileId = ref(activeProfileId.value)

    const availableSensors = computed(() => {
      const sensors = []
      mqttStore.value.espDevices.forEach((device, espId) => {
        if (device.subzones) {
          device.subzones.forEach((subzone) => {
            if (subzone.sensors) {
              subzone.sensors.forEach((sensor) => {
                sensors.push({
                  id: `${espId}-${sensor.gpio}`,
                  espId,
                  gpio: sensor.gpio,
                  name: sensor.name,
                  type: sensor.type,
                  unit: sensor.unit,
                })
              })
            }
          })
        }
      })
      return sensors
    })

    const getAlertConfig = (espId, gpio) => {
      return dashboardStore.value.alertSystem.alerts.get(`${espId}-${gpio}`)
    }

    const handleAlertConfigUpdate = (espId, gpio, config) => {
      if (config) {
        dashboardStore.value.updateAlertConfig(espId, gpio, config)
      } else {
        dashboardStore.value.deleteAlertConfig(espId, gpio)
      }
    }

    const toggleAlertSystem = (enabled) => {
      dashboardStore.value.toggleAlertSystem(enabled)
    }

    const toggleNotificationChannel = (channel, enabled) => {
      dashboardStore.value.toggleNotificationChannel(channel, enabled)
    }

    const acknowledgeAlert = (alertId) => {
      dashboardStore.value.acknowledgeAlert(alertId)
    }

    const getAlertColor = (type) => {
      return dashboardStore.value.alertSystem.alertTypes[type]?.color || 'grey'
    }

    const getAlertIcon = (type) => {
      return dashboardStore.value.alertSystem.alertTypes[type]?.icon || 'mdi-alert'
    }

    const getAlertTypeName = (type) => {
      return dashboardStore.value.alertSystem.alertTypes[type]?.name || type
    }

    const getSensorIcon = (type) => {
      const group = dashboardStore.value.getSensorGroupKey(type)
      return group ? dashboardStore.value.sensorGroups[group].icon : 'mdi-help-circle'
    }

    const formatTimeAgo = (timestamp) => {
      return dashboardStore.value.formatTimeAgo(timestamp)
    }

    const formatTimestamp = (timestamp) => {
      return new Date(timestamp).toLocaleString()
    }

    // 🆕 NEU: Profil-Management Funktionen
    const handleProfileChange = (profileId) => {
      if (profileId && profileId !== activeProfileId.value) {
        const success = dashboardStore.value.activateAlertProfile(profileId)
        if (success) {
          window.$snackbar?.showSuccess(
            `Profil "${dashboardStore.value.getActiveAlertProfile()?.name}" aktiviert`,
          )
        } else {
          window.$snackbar?.showError('Profil konnte nicht aktiviert werden')
          selectedProfileId.value = activeProfileId.value // Reset selection
        }
      }
    }

    const createNewProfile = () => {
      try {
        const profile = dashboardStore.value.createAlertProfile(
          newProfileName.value.trim(),
          newProfileDescription.value.trim(),
        )

        // Automatisch das neue Profil aktivieren
        dashboardStore.value.activateAlertProfile(profile.id)
        selectedProfileId.value = profile.id

        // Dialog schließen und Felder zurücksetzen
        showCreateProfileDialog.value = false
        newProfileName.value = ''
        newProfileDescription.value = ''

        window.$snackbar?.showSuccess(`Profil "${profile.name}" erstellt und aktiviert`)
      } catch (error) {
        console.error('Failed to create profile:', error)
        window.$snackbar?.showError('Profil konnte nicht erstellt werden')
      }
    }

    const saveCurrentAsProfile = () => {
      if (!activeProfileId.value) return

      try {
        const success = dashboardStore.value.saveCurrentConfigAsProfile(activeProfileId.value)
        if (success) {
          window.$snackbar?.showSuccess('Aktuelle Konfiguration gespeichert')
        } else {
          window.$snackbar?.showError('Konfiguration konnte nicht gespeichert werden')
        }
      } catch (error) {
        console.error('Failed to save profile:', error)
        window.$snackbar?.showError('Speichern fehlgeschlagen')
      }
    }

    const deleteCurrentProfile = () => {
      if (!activeProfileId.value || activeProfileId.value === 'default') return

      const profile = dashboardStore.value.getActiveAlertProfile()
      const confirm = window.confirm(`Möchten Sie das Profil "${profile?.name}" wirklich löschen?`)

      if (confirm) {
        try {
          const deleted = dashboardStore.value.deleteAlertProfile(activeProfileId.value)
          if (deleted) {
            selectedProfileId.value = dashboardStore.value.alertProfiles.activeProfileId
            window.$snackbar?.showSuccess('Profil gelöscht')
          } else {
            window.$snackbar?.showError('Profil konnte nicht gelöscht werden')
          }
        } catch (error) {
          console.error('Failed to delete profile:', error)
          window.$snackbar?.showError('Löschen fehlgeschlagen: ' + error.message)
        }
      }
    }

    return {
      alertSystem,
      activeAlerts,
      alertHistory,
      availableSensors,
      getAlertConfig,
      handleAlertConfigUpdate,
      toggleAlertSystem,
      toggleNotificationChannel,
      acknowledgeAlert,
      getAlertColor,
      getAlertIcon,
      getAlertTypeName,
      getSensorIcon,
      formatTimeAgo,
      formatTimestamp,
      // 🆕 NEU: Profil-Management
      showCreateProfileDialog,
      newProfileName,
      newProfileDescription,
      availableProfiles,
      activeProfileId,
      selectedProfileId,
      handleProfileChange,
      createNewProfile,
      saveCurrentAsProfile,
      deleteCurrentProfile,
    }
  },
})
</script>
