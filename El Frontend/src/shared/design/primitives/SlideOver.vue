<script setup lang="ts">
/**
 * SlideOver — Slide-in Panel from Right
 *
 * Used for configuration panels (Sensor, Actuator, ESP, Zone).
 * Slides in from the right edge with a semi-transparent backdrop.
 *
 * Features:
 * - 300ms CSS slide-in/out animation
 * - Click outside (backdrop) closes panel
 * - ESC key closes panel
 * - Three width variants: sm (320px), md (400px), lg (560px)
 * - Mobile: 100% width
 * - Teleported to body to avoid z-index issues
 */

import { watch, onMounted, onUnmounted } from 'vue'
import { X } from 'lucide-vue-next'

interface Props {
  /** Whether the panel is open */
  open: boolean
  /** Panel header title */
  title?: string
  /** Panel width variant */
  width?: 'sm' | 'md' | 'lg'
}

const props = withDefaults(defineProps<Props>(), {
  title: '',
  width: 'md',
})

const emit = defineEmits<{
  close: []
}>()

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.open) {
    emit('close')
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
})

// Prevent body scroll when open
watch(() => props.open, (isOpen) => {
  if (isOpen) {
    document.body.style.overflow = 'hidden'
  } else {
    document.body.style.overflow = ''
  }
}, { immediate: true })

onUnmounted(() => {
  document.body.style.overflow = ''
})
</script>

<template>
  <Teleport to="body">
    <Transition name="slide-over-fade">
      <div
        v-if="open"
        class="slide-over-backdrop"
        @click.self="emit('close')"
      >
        <Transition name="slide-over-panel" appear>
          <div
            v-if="open"
            :class="['slide-over', `slide-over--${width}`]"
            role="dialog"
            aria-modal="true"
            :aria-label="title"
          >
            <!-- Header -->
            <header class="slide-over__header">
              <h2 class="slide-over__title">{{ title }}</h2>
              <button
                class="slide-over__close"
                title="Schließen (ESC)"
                @click="emit('close')"
              >
                <X class="w-5 h-5" />
              </button>
            </header>

            <!-- Content -->
            <div class="slide-over__content">
              <slot />
            </div>

            <!-- Footer (optional slot) -->
            <footer v-if="$slots.footer" class="slide-over__footer">
              <slot name="footer" />
            </footer>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* ═══════════════════════════════════════════════════════════════════════════
   BACKDROP
   ═══════════════════════════════════════════════════════════════════════════ */

.slide-over-backdrop {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal);
  background: var(--slide-over-backdrop);
  display: flex;
  justify-content: flex-end;
}

/* Backdrop fade transition */
.slide-over-fade-enter-active,
.slide-over-fade-leave-active {
  transition: opacity var(--slide-over-duration) var(--ease-out);
}

.slide-over-fade-enter-from,
.slide-over-fade-leave-to {
  opacity: 0;
}

/* ═══════════════════════════════════════════════════════════════════════════
   PANEL
   ═══════════════════════════════════════════════════════════════════════════ */

.slide-over {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-bg-secondary);
  border-left: 1px solid var(--glass-border);
  box-shadow: -8px 0 32px rgba(0, 0, 0, 0.4);
  overflow: hidden;
}

.slide-over--sm {
  width: var(--slide-over-width-sm);
}

.slide-over--md {
  width: var(--slide-over-width-md);
}

.slide-over--lg {
  width: var(--slide-over-width-lg);
}

/* Panel slide transition */
.slide-over-panel-enter-active,
.slide-over-panel-leave-active {
  transition: transform var(--slide-over-duration) var(--ease-out);
}

.slide-over-panel-enter-from,
.slide-over-panel-leave-to {
  transform: translateX(100%);
}

/* ═══════════════════════════════════════════════════════════════════════════
   HEADER
   ═══════════════════════════════════════════════════════════════════════════ */

.slide-over__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-4) var(--space-6);
  border-bottom: 1px solid var(--glass-border);
  flex-shrink: 0;
}

.slide-over__title {
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.slide-over__close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
  flex-shrink: 0;
}

.slide-over__close:hover {
  background: var(--glass-bg-light);
  color: var(--color-text-primary);
}

/* ═══════════════════════════════════════════════════════════════════════════
   CONTENT
   ═══════════════════════════════════════════════════════════════════════════ */

.slide-over__content {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-6);
}

/* ═══════════════════════════════════════════════════════════════════════════
   FOOTER
   ═══════════════════════════════════════════════════════════════════════════ */

.slide-over__footer {
  padding: var(--space-4) var(--space-6);
  border-top: 1px solid var(--glass-border);
  flex-shrink: 0;
}

/* ═══════════════════════════════════════════════════════════════════════════
   RESPONSIVE — Full width on mobile
   ═══════════════════════════════════════════════════════════════════════════ */

@media (max-width: 640px) {
  .slide-over--sm,
  .slide-over--md,
  .slide-over--lg {
    width: 100%;
  }
}
</style>
