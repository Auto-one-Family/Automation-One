<template>
  <v-card
    :variant="variant"
    :class="cardClasses"
    :elevation="elevation"
    :density="density"
    @click="handleClick"
  >
    <!-- Header Section -->
    <v-card-title v-if="showHeader" class="d-flex align-center justify-space-between">
      <div class="d-flex align-center">
        <v-icon v-if="icon" :icon="icon" :color="iconColor" class="mr-2" />
        <span class="font-weight-medium">{{ title }}</span>
        <v-chip
          v-if="status"
          :color="getStatusColor(status)"
          size="small"
          variant="tonal"
          class="ml-2"
        >
          {{ status }}
        </v-chip>
      </div>

      <!-- Header Actions -->
      <div v-if="showHeaderActions" class="d-flex align-center">
        <slot name="header-actions" />
        <!-- KORRIGIERT: Expand-Button-Logik -->
        <v-btn
          v-if="showExpandButton"
          icon="mdi-chevron-down"
          variant="text"
          size="small"
          @click.stop="toggleExpanded"
          :class="{ 'rotate-180': expanded }"
        />
      </div>
    </v-card-title>

    <!-- Content Section -->
    <v-card-text v-if="showContent" :class="contentClasses">
      <slot />
    </v-card-text>

    <!-- Actions Section -->
    <v-card-actions v-if="showActions" :class="actionsClasses">
      <slot name="actions" />
    </v-card-actions>

    <!-- Loading Overlay -->
    <v-overlay v-if="loading" contained persistent class="align-center justify-center">
      <v-progress-circular indeterminate size="32" />
    </v-overlay>

    <!-- Error State -->
    <div v-if="error" class="pa-4">
      <v-alert type="error" variant="tonal" density="compact">
        {{ error }}
      </v-alert>
    </div>
  </v-card>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useCentralDataHub } from '@/stores/centralDataHub'
import { useStatusHandling } from '@/composables/useStatusHandling'

const props = defineProps({
  // Card Configuration
  variant: { type: String, default: 'outlined' }, // 'elevated', 'outlined', 'tonal'
  elevation: { type: Number, default: 0 },
  density: { type: String, default: 'default' }, // 'compact', 'default', 'comfortable'

  // Content
  title: { type: String, default: '' },
  icon: { type: String, default: '' },
  iconColor: { type: String, default: 'primary' },
  status: { type: String, default: '' },

  // Display Options
  compact: { type: Boolean, default: false },
  interactive: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' },

  // Sections
  showHeader: { type: Boolean, default: true },
  showContent: { type: Boolean, default: true },
  showActions: { type: Boolean, default: false },
  showHeaderActions: { type: Boolean, default: false },
  showExpandButton: { type: Boolean, default: false },

  // Responsive
  responsive: { type: Boolean, default: true },
})

const emit = defineEmits(['click', 'expand'])

const centralDataHub = useCentralDataHub()
const { getStatusColor: getStatusColorCentral } = useStatusHandling()
const expanded = ref(false)

// Computed Properties
const cardClasses = computed(() => {
  const classes = ['unified-card']

  if (props.compact || centralDataHub.isMobile) {
    classes.push('compact-mode')
  }

  if (props.interactive) {
    classes.push('interactive')
  }

  if (props.responsive) {
    const displayMode = centralDataHub.getDisplayMode
    classes.push(`display-${displayMode}`)
  }

  return classes
})

const contentClasses = computed(() => {
  const classes = []

  if (props.compact || centralDataHub.isMobile) {
    classes.push('pa-3')
  }

  return classes
})

const actionsClasses = computed(() => {
  const classes = []

  if (props.compact || centralDataHub.isMobile) {
    classes.push('pa-3', 'pt-0')
  }

  return classes
})

// Methods
function getStatusColor(status) {
  return getStatusColorCentral(status, 'default', 'vuetify')
}

function handleClick(event) {
  if (props.interactive) {
    emit('click', event)
  }
}

function toggleExpanded() {
  expanded.value = !expanded.value
  emit('expand', expanded.value)
}
</script>

<style scoped>
.unified-card {
  transition: all 0.2s ease;
  border-radius: 12px;
}

.unified-card.interactive {
  cursor: pointer;
  transition: all 0.2s ease;
}

.unified-card.interactive:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);
}

.unified-card.compact-mode {
  border-radius: 8px;
}

.unified-card.display-compact {
  margin-bottom: 8px;
}

.unified-card.display-standard {
  margin-bottom: 16px;
}

.unified-card.display-detailed {
  margin-bottom: 24px;
}

/* Mobile Optimizations */
@media (max-width: 768px) {
  .unified-card {
    border-radius: 8px;
    margin-bottom: 8px;
  }

  .unified-card .v-card-title {
    padding: 12px;
    font-size: 0.875rem;
  }

  .unified-card .v-card-text {
    padding: 12px;
  }

  .unified-card .v-card-actions {
    padding: 12px;
  }
}

/* Rotate animation for expand button */
.rotate-180 {
  transform: rotate(180deg);
}

/* Accessibility */
.unified-card:focus-visible {
  outline: 2px solid var(--v-theme-primary);
  outline-offset: 2px;
}
</style>
