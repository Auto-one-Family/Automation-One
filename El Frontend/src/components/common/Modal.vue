<script setup lang="ts">
import { X } from 'lucide-vue-next'
import { onMounted, onUnmounted, watch } from 'vue'

interface Props {
  /** Whether the modal is open */
  open: boolean
  /** Modal title */
  title: string
  /** Max width class (e.g., 'max-w-md', 'max-w-lg', 'max-w-2xl') */
  maxWidth?: string
  /** Whether to show the close button in the header */
  showClose?: boolean
  /** Whether clicking overlay closes the modal */
  closeOnOverlay?: boolean
  /** Whether pressing Escape closes the modal */
  closeOnEscape?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  maxWidth: 'max-w-md',
  showClose: true,
  closeOnOverlay: true,
  closeOnEscape: true,
})

const emit = defineEmits<{
  'update:open': [value: boolean]
  close: []
}>()

function close() {
  emit('update:open', false)
  emit('close')
}

function handleOverlayClick() {
  if (props.closeOnOverlay) {
    close()
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.closeOnEscape && props.open) {
    close()
  }
}

// Handle body scroll lock
watch(() => props.open, (isOpen) => {
  if (isOpen) {
    document.body.style.overflow = 'hidden'
  } else {
    document.body.style.overflow = ''
  }
})

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
  document.body.style.overflow = ''
})
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="open"
        class="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="title"
      >
        <!-- Overlay -->
        <div
          class="absolute inset-0 bg-black/50"
          @click="handleOverlayClick"
        />

        <!-- Modal Content -->
        <div
          :class="[
            'card relative w-full',
            maxWidth,
            'max-h-[90vh] overflow-hidden flex flex-col',
            'transform transition-all duration-200'
          ]"
          @click.stop
        >
          <!-- Header -->
          <div class="card-header flex items-center justify-between flex-shrink-0">
            <h3 class="font-semibold text-dark-100 text-responsive-lg">
              {{ title }}
            </h3>
            <button
              v-if="showClose"
              class="p-2 rounded-lg text-dark-400 hover:text-dark-200 hover:bg-dark-800 transition-colors touch-target"
              @click="close"
              aria-label="Close modal"
            >
              <X class="w-5 h-5" />
            </button>
          </div>

          <!-- Body (scrollable) -->
          <div class="card-body overflow-y-auto flex-1">
            <slot />
          </div>

          <!-- Footer (optional slot) -->
          <div v-if="$slots.footer" class="px-4 sm:px-6 py-4 border-t border-dark-700 flex-shrink-0">
            <slot name="footer" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* Modal enter/leave transitions */
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}

.modal-enter-active .card,
.modal-leave-active .card {
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .card,
.modal-leave-to .card {
  transform: scale(0.95);
  opacity: 0;
}
</style>
