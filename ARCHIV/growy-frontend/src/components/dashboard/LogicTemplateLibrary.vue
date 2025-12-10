<template>
  <v-card class="logic-template-library" variant="outlined">
    <v-card-title class="d-flex align-center">
      <v-icon icon="mdi-puzzle" class="mr-2" color="primary" />
      Logik-Bausteine
      <v-spacer />
      <v-btn
        icon="mdi-plus"
        size="small"
        variant="text"
        @click="showSaveTemplateDialog = true"
        :disabled="!canSaveTemplate"
      >
        <v-tooltip location="top">
          <template #activator="{ props }">
            <span v-bind="props">Als Vorlage sichern</span>
          </template>
        </v-tooltip>
      </v-btn>
    </v-card-title>

    <v-card-text>
      <!-- 🆕 NEU: Vordefinierte Bausteine -->
      <div class="template-sections">
        <!-- Feuchtigkeits-Bausteine -->
        <div class="template-section mb-4">
          <h4 class="text-subtitle-2 mb-2 d-flex align-center">
            <v-icon icon="mdi-water-percent" size="small" class="mr-2" color="blue" />
            Feuchtigkeits-Logik
          </h4>
          <div class="template-grid">
            <div
              v-for="template in moistureTemplates"
              :key="template.id"
              class="template-item"
              draggable="true"
              @dragstart="handleTemplateDragStart($event, template)"
            >
              <div class="template-header">
                <v-icon :icon="template.icon" size="small" class="mr-2" />
                <span class="template-title">{{ template.title }}</span>
              </div>
              <div class="template-description">{{ template.description }}</div>
              <div class="template-tags">
                <v-chip size="x-small" variant="tonal" class="mr-1">Feuchtigkeit</v-chip>
                <v-chip size="x-small" variant="tonal">Pumpe</v-chip>
              </div>
            </div>
          </div>
        </div>

        <!-- Temperatur-Bausteine -->
        <div class="template-section mb-4">
          <h4 class="text-subtitle-2 mb-2 d-flex align-center">
            <v-icon icon="mdi-thermometer" size="small" class="mr-2" color="red" />
            Temperatur-Logik
          </h4>
          <div class="template-grid">
            <div
              v-for="template in temperatureTemplates"
              :key="template.id"
              class="template-item"
              draggable="true"
              @dragstart="handleTemplateDragStart($event, template)"
            >
              <div class="template-header">
                <v-icon :icon="template.icon" size="small" class="mr-2" />
                <span class="template-title">{{ template.title }}</span>
              </div>
              <div class="template-description">{{ template.description }}</div>
              <div class="template-tags">
                <v-chip size="x-small" variant="tonal" class="mr-1">Temperatur</v-chip>
                <v-chip size="x-small" variant="tonal">Lüftung</v-chip>
              </div>
            </div>
          </div>
        </div>

        <!-- Zeit-Bausteine -->
        <div class="template-section mb-4">
          <h4 class="text-subtitle-2 mb-2 d-flex align-center">
            <v-icon icon="mdi-clock" size="small" class="mr-2" color="orange" />
            Zeit-basierte Logik
          </h4>
          <div class="template-grid">
            <div
              v-for="template in timeTemplates"
              :key="template.id"
              class="template-item"
              draggable="true"
              @dragstart="handleTemplateDragStart($event, template)"
            >
              <div class="template-header">
                <v-icon :icon="template.icon" size="small" class="mr-2" />
                <span class="template-title">{{ template.title }}</span>
              </div>
              <div class="template-description">{{ template.description }}</div>
              <div class="template-tags">
                <v-chip size="x-small" variant="tonal" class="mr-1">Timer</v-chip>
                <v-chip size="x-small" variant="tonal">Zeitplan</v-chip>
              </div>
            </div>
          </div>
        </div>

        <!-- Benutzerdefinierte Templates -->
        <div v-if="customTemplates.length > 0" class="template-section mb-4">
          <h4 class="text-subtitle-2 mb-2 d-flex align-center">
            <v-icon icon="mdi-star" size="small" class="mr-2" color="amber" />
            Meine Templates
          </h4>
          <div class="template-grid">
            <div
              v-for="template in customTemplates"
              :key="template.id"
              class="template-item custom-template"
              draggable="true"
              @dragstart="handleTemplateDragStart($event, template)"
            >
              <div class="template-header">
                <v-icon :icon="template.icon" size="small" class="mr-2" />
                <span class="template-title">{{ template.title }}</span>
                <v-spacer />
                <v-btn
                  icon="mdi-delete"
                  size="x-small"
                  variant="text"
                  color="error"
                  @click.stop="deleteCustomTemplate(template.id)"
                />
              </div>
              <div class="template-description">{{ template.description }}</div>
              <div class="template-tags">
                <v-chip size="x-small" variant="tonal" class="mr-1">Benutzerdefiniert</v-chip>
                <v-chip size="x-small" variant="tonal">{{ template.category }}</v-chip>
              </div>
            </div>
          </div>
        </div>
      </div>
    </v-card-text>

    <!-- 🆕 NEU: Template speichern Dialog -->
    <v-dialog v-model="showSaveTemplateDialog" max-width="500">
      <v-card>
        <v-card-title>Template speichern</v-card-title>
        <v-card-text>
          <v-text-field
            v-model="newTemplate.title"
            label="Template-Name"
            placeholder="z.B. Feuchtigkeit < 30% → Pumpe an"
            variant="outlined"
            density="comfortable"
            class="mb-3"
          />
          <v-textarea
            v-model="newTemplate.description"
            label="Beschreibung"
            placeholder="Beschreibung der Logik..."
            variant="outlined"
            density="comfortable"
            rows="2"
            class="mb-3"
          />
          <v-select
            v-model="newTemplate.category"
            :items="templateCategories"
            label="Kategorie"
            variant="outlined"
            density="comfortable"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="showSaveTemplateDialog = false">Abbrechen</v-btn>
          <v-btn color="primary" @click="saveCustomTemplate" :disabled="!canSaveTemplate">
            Speichern
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-card>
</template>

<script setup>
import { ref, computed } from 'vue'
import { storage } from '@/utils/storage'

const props = defineProps({
  currentLogic: {
    type: Object,
    default: () => ({}),
  },
})

// 🆕 NEU: Template-State
const showSaveTemplateDialog = ref(false)
const newTemplate = ref({
  title: '',
  description: '',
  category: 'custom',
})

const templateCategories = [
  { title: 'Feuchtigkeit', value: 'moisture' },
  { title: 'Temperatur', value: 'temperature' },
  { title: 'Zeit', value: 'time' },
  { title: 'Licht', value: 'light' },
  { title: 'Benutzerdefiniert', value: 'custom' },
]

// 🆕 NEU: Vordefinierte Templates
const moistureTemplates = [
  {
    id: 'moisture-low-pump',
    title: 'Feuchtigkeit < 30% → Pumpe an',
    description: 'Aktiviert Pumpe bei niedriger Bodenfeuchtigkeit',
    icon: 'mdi-water-pump',
    category: 'moisture',
    logic: {
      conditions: [
        {
          sensorType: 'SENSOR_MOISTURE',
          operator: '<',
          threshold: 30,
        },
      ],
      actuator: {
        type: 'ACTUATOR_PUMP',
        action: 'ON',
      },
    },
  },
  {
    id: 'moisture-high-pump-off',
    title: 'Feuchtigkeit > 80% → Pumpe aus',
    description: 'Deaktiviert Pumpe bei hoher Bodenfeuchtigkeit',
    icon: 'mdi-water-pump-off',
    category: 'moisture',
    logic: {
      conditions: [
        {
          sensorType: 'SENSOR_MOISTURE',
          operator: '>',
          threshold: 80,
        },
      ],
      actuator: {
        type: 'ACTUATOR_PUMP',
        action: 'OFF',
      },
    },
  },
]

const temperatureTemplates = [
  {
    id: 'temp-high-fan',
    title: 'Temperatur > 30°C → Lüftung an',
    description: 'Aktiviert Lüftung bei hoher Temperatur',
    icon: 'mdi-fan',
    category: 'temperature',
    logic: {
      conditions: [
        {
          sensorType: 'SENSOR_TEMP_DS18B20',
          operator: '>',
          threshold: 30,
        },
      ],
      actuator: {
        type: 'ACTUATOR_FAN',
        action: 'ON',
      },
    },
  },
  {
    id: 'temp-low-heater',
    title: 'Temperatur < 15°C → Heizung an',
    description: 'Aktiviert Heizung bei niedriger Temperatur',
    icon: 'mdi-fire',
    category: 'temperature',
    logic: {
      conditions: [
        {
          sensorType: 'SENSOR_TEMP_DS18B20',
          operator: '<',
          threshold: 15,
        },
      ],
      actuator: {
        type: 'ACTUATOR_HEATER',
        action: 'ON',
      },
    },
  },
]

const timeTemplates = [
  {
    id: 'morning-lights',
    title: 'Morgens 06:00-08:00 → LED an',
    description: 'Aktiviert LED-Beleuchtung am Morgen',
    icon: 'mdi-lightbulb',
    category: 'time',
    logic: {
      timers: [
        {
          startTime: '06:00',
          endTime: '08:00',
          days: [1, 2, 3, 4, 5, 6, 0], // Montag-Sonntag
        },
      ],
      actuator: {
        type: 'ACTUATOR_LED',
        action: 'ON',
      },
    },
  },
  {
    id: 'night-lights-off',
    title: 'Nachts 22:00-06:00 → LED aus',
    description: 'Deaktiviert LED-Beleuchtung in der Nacht',
    icon: 'mdi-lightbulb-off',
    category: 'time',
    logic: {
      timers: [
        {
          startTime: '22:00',
          endTime: '06:00',
          days: [1, 2, 3, 4, 5, 6, 0],
        },
      ],
      actuator: {
        type: 'ACTUATOR_LED',
        action: 'OFF',
      },
    },
  },
]

// 🆕 NEU: Benutzerdefinierte Templates laden
const customTemplates = computed(() => {
  return storage.load('custom_logic_templates', [])
})

// 🆕 NEU: Computed Properties
const canSaveTemplate = computed(() => {
  return (
    newTemplate.value.title.trim() &&
    newTemplate.value.description.trim() &&
    Object.keys(props.currentLogic).length > 0
  )
})

// 🆕 NEU: Template-Drag-Handler
const handleTemplateDragStart = (event, template) => {
  event.dataTransfer.setData(
    'application/json',
    JSON.stringify({
      type: 'logic-template',
      template: template,
    }),
  )
  event.dataTransfer.effectAllowed = 'copy'
}

// 🆕 NEU: Benutzerdefiniertes Template speichern
const saveCustomTemplate = () => {
  const template = {
    id: `custom-${Date.now()}`,
    title: newTemplate.value.title,
    description: newTemplate.value.description,
    category: newTemplate.value.category,
    icon: 'mdi-star',
    logic: props.currentLogic,
    createdAt: new Date().toISOString(),
  }

  const templates = storage.load('custom_logic_templates', [])
  templates.push(template)
  storage.save('custom_logic_templates', templates)

  // Dialog zurücksetzen
  newTemplate.value = {
    title: '',
    description: '',
    category: 'custom',
  }
  showSaveTemplateDialog.value = false

  window.$snackbar?.showSuccess('Template erfolgreich gespeichert')
}

// 🆕 NEU: Benutzerdefiniertes Template löschen
const deleteCustomTemplate = (templateId) => {
  const templates = storage.load('custom_logic_templates', [])
  const filteredTemplates = templates.filter((t) => t.id !== templateId)
  storage.save('custom_logic_templates', filteredTemplates)

  window.$snackbar?.showSuccess('Template gelöscht')
}
</script>

<style scoped>
.logic-template-library {
  max-height: 600px;
  overflow-y: auto;
}

.template-sections {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.template-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
}

.template-item {
  background: white;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  padding: 12px;
  cursor: grab;
  transition: all 0.2s ease;
  position: relative;
}

.template-item:hover {
  border-color: #1976d2;
  box-shadow: 0 2px 8px rgba(25, 118, 210, 0.2);
  transform: translateY(-1px);
}

.template-item:active {
  cursor: grabbing;
}

.template-item.custom-template {
  border-left: 4px solid #ffc107;
}

.template-header {
  display: flex;
  align-items: center;
  margin-bottom: 8px;
}

.template-title {
  font-size: 0.875rem;
  font-weight: 500;
  flex: 1;
}

.template-description {
  font-size: 0.75rem;
  color: #666;
  line-height: 1.3;
  margin-bottom: 8px;
}

.template-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
</style>
