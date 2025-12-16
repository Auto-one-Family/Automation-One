<script setup lang="ts">
import { computed } from 'vue'
import { ChevronDown } from 'lucide-vue-next'

interface SelectOption {
  value: string | number
  label: string
  disabled?: boolean
}

interface Props {
  /** v-model value */
  modelValue: string | number
  /** Options to display */
  options: SelectOption[]
  /** Label text */
  label?: string
  /** Placeholder text */
  placeholder?: string
  /** Whether the select is disabled */
  disabled?: boolean
  /** Whether the select is required */
  required?: boolean
  /** Error message to display */
  error?: string
  /** Helper text to display below select */
  helper?: string
  /** Select id (auto-generated if not provided) */
  id?: string
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
  required: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: string | number]
}>()

const selectId = computed(() => props.id || `select-${Math.random().toString(36).slice(2, 9)}`)

const selectClasses = computed(() => [
  'w-full px-4 py-2.5 bg-dark-800 border rounded-lg',
  'text-dark-100',
  'focus:outline-none focus:ring-2 focus:border-transparent',
  'transition-all duration-200',
  'appearance-none cursor-pointer',
  'touch-target',
  'pr-10', // Space for chevron
  props.error
    ? 'border-red-500 focus:ring-red-500'
    : 'border-dark-600 focus:ring-blue-500',
  props.disabled ? 'opacity-50 cursor-not-allowed' : '',
])

function handleChange(event: Event) {
  const target = event.target as HTMLSelectElement
  emit('update:modelValue', target.value)
}
</script>

<template>
  <div class="w-full">
    <!-- Label -->
    <label
      v-if="label"
      :for="selectId"
      class="block text-sm font-medium text-dark-300 mb-1.5"
    >
      {{ label }}
      <span v-if="required" class="text-red-400 ml-0.5">*</span>
    </label>

    <!-- Select wrapper -->
    <div class="relative">
      <select
        :id="selectId"
        :value="modelValue"
        :disabled="disabled"
        :required="required"
        :class="selectClasses"
        @change="handleChange"
      >
        <option v-if="placeholder" value="" disabled>
          {{ placeholder }}
        </option>
        <option
          v-for="option in options"
          :key="option.value"
          :value="option.value"
          :disabled="option.disabled"
        >
          {{ option.label }}
        </option>
      </select>

      <!-- Chevron icon -->
      <div class="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
        <ChevronDown class="w-5 h-5 text-dark-400" />
      </div>
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

<style scoped>
/* Remove default select arrow in some browsers */
select {
  background-image: none;
}
</style>
