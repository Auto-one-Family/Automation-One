<script setup lang="ts">
import { computed } from 'vue'
import { X } from 'lucide-vue-next'

interface Props {
  /** v-model value */
  modelValue: string | number
  /** Input type */
  type?: 'text' | 'email' | 'password' | 'number' | 'search' | 'tel' | 'url'
  /** Label text */
  label?: string
  /** Placeholder text */
  placeholder?: string
  /** Whether the input is disabled */
  disabled?: boolean
  /** Whether the input is required */
  required?: boolean
  /** Error message to display */
  error?: string
  /** Helper text to display below input */
  helper?: string
  /** Whether to show a clear button */
  clearable?: boolean
  /** Input id (auto-generated if not provided) */
  id?: string
  /** Min value for number inputs */
  min?: number
  /** Max value for number inputs */
  max?: number
  /** Step value for number inputs */
  step?: number
}

const props = withDefaults(defineProps<Props>(), {
  type: 'text',
  disabled: false,
  required: false,
  clearable: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: string | number]
}>()

const inputId = computed(() => props.id || `input-${Math.random().toString(36).slice(2, 9)}`)

const inputClasses = computed(() => [
  'w-full px-4 py-2.5 bg-dark-800 border rounded-lg',
  'text-dark-100 placeholder-dark-400',
  'focus:outline-none focus:ring-2 focus:border-transparent',
  'transition-all duration-200',
  'touch-target',
  props.error
    ? 'border-red-500 focus:ring-red-500'
    : 'border-dark-600 focus:ring-blue-500',
  props.disabled ? 'opacity-50 cursor-not-allowed' : '',
  props.clearable && props.modelValue ? 'pr-10' : '',
])

function handleInput(event: Event) {
  const target = event.target as HTMLInputElement
  const value = props.type === 'number' ? parseFloat(target.value) || 0 : target.value
  emit('update:modelValue', value)
}

function clear() {
  emit('update:modelValue', props.type === 'number' ? 0 : '')
}
</script>

<template>
  <div class="w-full">
    <!-- Label -->
    <label
      v-if="label"
      :for="inputId"
      class="block text-sm font-medium text-dark-300 mb-1.5"
    >
      {{ label }}
      <span v-if="required" class="text-red-400 ml-0.5">*</span>
    </label>

    <!-- Input wrapper -->
    <div class="relative">
      <input
        :id="inputId"
        :type="type"
        :value="modelValue"
        :placeholder="placeholder"
        :disabled="disabled"
        :required="required"
        :min="min"
        :max="max"
        :step="step"
        :class="inputClasses"
        @input="handleInput"
      />

      <!-- Clear button -->
      <button
        v-if="clearable && modelValue"
        type="button"
        class="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-dark-400 hover:text-dark-200 transition-colors"
        @click="clear"
      >
        <X class="w-4 h-4" />
      </button>
    </div>

    <!-- Error message -->
    <p v-if="error" class="mt-1.5 text-sm text-red-400">
      {{ error }}
    </p>

    <!-- Helper text -->
    <p v-else-if="helper" class="mt-1.5 text-sm text-dark-400">
      {{ helper }}
    </p>
  </div>
</template>
