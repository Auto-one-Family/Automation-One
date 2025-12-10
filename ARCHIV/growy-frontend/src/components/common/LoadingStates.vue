<template>
  <!-- ✅ NEU: Erweiterte Loading-States-Komponente -->
  <div class="loading-states">
    <!-- Global Loading Overlay -->
    <v-overlay
      v-model="showGlobalLoading"
      :persistent="globalLoadingPersistent"
      class="global-loading-overlay"
    >
      <v-card
        variant="elevated"
        class="loading-card"
        :color="globalLoadingColor"
        :width="globalLoadingWidth"
      >
        <v-card-text class="text-center pa-6">
          <v-progress-circular
            :size="globalLoadingSize"
            :width="4"
            :color="globalLoadingProgressColor"
            indeterminate
            class="mb-4"
          />
          <div class="text-h6 font-weight-medium mb-2">
            {{ globalLoadingTitle }}
          </div>
          <div class="text-body-2 text-medium-emphasis">
            {{ globalLoadingMessage }}
          </div>
          <div v-if="globalLoadingProgress" class="mt-4">
            <v-progress-linear
              :model-value="globalLoadingProgress"
              :color="globalLoadingProgressColor"
              height="8"
              rounded
            />
            <div class="text-caption mt-2">{{ globalLoadingProgress }}% abgeschlossen</div>
          </div>
          <div v-if="globalLoadingCancelable" class="mt-4">
            <v-btn
              variant="outlined"
              size="small"
              @click="cancelGlobalLoading"
              :disabled="globalLoadingCanceling"
            >
              {{ globalLoadingCanceling ? 'Wird abgebrochen...' : 'Abbrechen' }}
            </v-btn>
          </div>
        </v-card-text>
      </v-card>
    </v-overlay>

    <!-- Inline Loading States -->
    <div v-if="showInlineLoading" class="inline-loading">
      <v-skeleton-loader :type="inlineLoadingType" :loading="true" class="inline-skeleton" />
    </div>

    <!-- Button Loading States -->
    <div v-if="showButtonLoading" class="button-loading">
      <v-btn
        :loading="buttonLoading"
        :disabled="buttonDisabled"
        :color="buttonColor"
        :variant="buttonVariant"
        :size="buttonSize"
        @click="handleButtonClick"
        class="loading-button"
      >
        <template v-slot:loader>
          <v-progress-circular :size="20" :width="2" :color="buttonProgressColor" indeterminate />
        </template>
        <v-icon v-if="buttonIcon" :icon="buttonIcon" class="mr-2" />
        {{ buttonText }}
      </v-btn>
    </div>

    <!-- Progress States -->
    <div v-if="showProgress" class="progress-states">
      <v-card variant="outlined" class="progress-card">
        <v-card-text>
          <div class="d-flex align-center justify-space-between mb-2">
            <span class="text-subtitle-2">{{ progressTitle }}</span>
            <span class="text-caption">{{ progressValue }}%</span>
          </div>
          <v-progress-linear
            :model-value="progressValue"
            :color="progressColor"
            :height="progressHeight"
            :rounded="progressRounded"
            :striped="progressStriped"
            :indeterminate="progressIndeterminate"
          />
          <div v-if="progressMessage" class="text-caption mt-2">
            {{ progressMessage }}
          </div>
        </v-card-text>
      </v-card>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'

// ✅ NEU: Props für verschiedene Loading-States
const props = defineProps({
  // Global Loading
  globalLoading: {
    type: Boolean,
    default: false,
  },
  globalLoadingTitle: {
    type: String,
    default: 'Lädt...',
  },
  globalLoadingMessage: {
    type: String,
    default: 'Bitte warten Sie einen Moment',
  },
  globalLoadingPersistent: {
    type: Boolean,
    default: false,
  },
  globalLoadingColor: {
    type: String,
    default: 'surface',
  },
  globalLoadingWidth: {
    type: [String, Number],
    default: 400,
  },
  globalLoadingSize: {
    type: [String, Number],
    default: 64,
  },
  globalLoadingProgressColor: {
    type: String,
    default: 'primary',
  },
  globalLoadingProgress: {
    type: Number,
    default: null,
  },
  globalLoadingCancelable: {
    type: Boolean,
    default: false,
  },

  // Inline Loading
  inlineLoading: {
    type: Boolean,
    default: false,
  },
  inlineLoadingType: {
    type: String,
    default: 'card',
  },

  // Button Loading
  buttonLoading: {
    type: Boolean,
    default: false,
  },
  buttonDisabled: {
    type: Boolean,
    default: false,
  },
  buttonColor: {
    type: String,
    default: 'primary',
  },
  buttonVariant: {
    type: String,
    default: 'elevated',
  },
  buttonSize: {
    type: String,
    default: 'default',
  },
  buttonIcon: {
    type: String,
    default: null,
  },
  buttonText: {
    type: String,
    default: 'Laden...',
  },

  // Progress
  progress: {
    type: Boolean,
    default: false,
  },
  progressTitle: {
    type: String,
    default: 'Fortschritt',
  },
  progressValue: {
    type: Number,
    default: 0,
  },
  progressColor: {
    type: String,
    default: 'primary',
  },
  progressHeight: {
    type: [String, Number],
    default: 8,
  },
  progressRounded: {
    type: Boolean,
    default: true,
  },
  progressStriped: {
    type: Boolean,
    default: false,
  },
  progressIndeterminate: {
    type: Boolean,
    default: false,
  },
  progressMessage: {
    type: String,
    default: null,
  },
})

// ✅ NEU: Emits
const emit = defineEmits(['global-loading-cancel', 'button-click', 'progress-complete'])

// ✅ NEU: Reactive State
const globalLoadingCanceling = ref(false)

// ✅ NEU: Computed Properties
const showGlobalLoading = computed(() => props.globalLoading)
const showInlineLoading = computed(() => props.inlineLoading)
const showButtonLoading = computed(() => props.buttonLoading)
const showProgress = computed(() => props.progress)

const buttonProgressColor = computed(() => {
  return props.buttonColor === 'primary' ? 'white' : props.buttonColor
})

// ✅ NEU: Event Handlers
const cancelGlobalLoading = () => {
  globalLoadingCanceling.value = true
  emit('global-loading-cancel')

  // Reset nach kurzer Verzögerung
  setTimeout(() => {
    globalLoadingCanceling.value = false
  }, 2000)
}

const handleButtonClick = () => {
  if (!props.buttonLoading && !props.buttonDisabled) {
    emit('button-click')
  }
}

// ✅ NEU: Watchers
watch(
  () => props.progressValue,
  (newValue) => {
    if (newValue >= 100) {
      emit('progress-complete')
    }
  },
)

// ✅ NEU: Expose Methods für externe Steuerung
defineExpose({
  setGlobalLoading: (loading, options = {}) => {
    Object.assign(props, { globalLoading: loading, ...options })
  },
  setProgress: (value, message = null) => {
    Object.assign(props, { progressValue: value, progressMessage: message })
  },
  setButtonLoading: (loading, text = null) => {
    Object.assign(props, { buttonLoading: loading, buttonText: text || props.buttonText })
  },
})
</script>

<style scoped>
/* ✅ NEU: Loading-States Styles */
.loading-states {
  position: relative;
}

.global-loading-overlay {
  z-index: 9999;
}

.loading-card {
  backdrop-filter: blur(8px);
  background-color: rgba(255, 255, 255, 0.95);
}

.inline-loading {
  width: 100%;
}

.inline-skeleton {
  width: 100%;
}

.button-loading {
  display: inline-block;
}

.loading-button {
  min-width: 120px;
}

.progress-states {
  width: 100%;
}

.progress-card {
  background-color: var(--color-background);
  border-color: var(--color-border);
}

/* ✅ NEU: Dark Mode Anpassungen */
:deep(.v-overlay) {
  background-color: rgba(0, 0, 0, 0.6);
}

:deep(.v-card) {
  background-color: var(--color-background);
}

/* ✅ NEU: Responsive Anpassungen */
@media (max-width: 600px) {
  .loading-card {
    margin: 16px;
    width: calc(100% - 32px) !important;
  }

  .global-loading-size {
    font-size: 1.125rem;
  }
}
</style>
