<template>
  <v-breadcrumbs :items="breadcrumbItems" class="px-0 mb-4">
    <template #divider>
      <v-icon>mdi-chevron-right</v-icon>
    </template>
  </v-breadcrumbs>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useCentralDataHub } from '@/stores/centralDataHub'

const route = useRoute()
const centralDataHub = useCentralDataHub()
const centralConfig = computed(() => centralDataHub.centralConfig)

const breadcrumbItems = computed(() => {
  const path = route.path
  // ✅ KORRIGIERT: Verwende den benutzerfreundlichen God-Namen
  const godName =
    centralConfig.value.godName && centralConfig.value.godName !== 'Mein IoT System'
      ? centralConfig.value.godName
      : 'God Pi'

  // Basis-Mapping für alle Routen
  const mapping = {
    '/': [{ title: 'Hauptübersicht', to: '/', disabled: false }],
    '/dashboard': [
      { title: 'Hauptübersicht', to: '/', disabled: false },
      { title: 'Dashboard', to: '/dashboard', disabled: true },
    ],
    '/zones': [
      { title: 'Hauptübersicht', to: '/', disabled: false },
      { title: 'Agenten', to: '/zones', disabled: true },
    ],
    '/zones/new': [
      { title: 'Hauptübersicht', to: '/', disabled: false },
      { title: 'Agenten', to: '/zones', disabled: false },
      { title: 'Neue Zone', to: '/zones/new', disabled: true },
    ],
    '/zones/:id/edit': [
      { title: 'Hauptübersicht', to: '/', disabled: false },
      { title: 'Agenten', to: '/zones', disabled: false },
      { title: 'Zone bearbeiten', to: route.path, disabled: true },
    ],
    '/zone/:espId/config': [
      { title: 'Hauptübersicht', to: '/', disabled: false },
      { title: 'Agenten', to: '/zones', disabled: false },
      { title: `Agent ${route.params.espId} konfigurieren`, to: route.path, disabled: true },
    ],
    '/devices': [
      { title: 'Hauptübersicht', to: '/', disabled: false },
      { title: 'Geräteverwaltung', to: '/devices', disabled: true },
    ],
    '/settings': [
      { title: 'Hauptübersicht', to: '/', disabled: false },
      { title: 'Einstellungen', to: '/settings', disabled: true },
    ],
    '/dev': [
      { title: 'Hauptübersicht', to: '/', disabled: false },
      { title: 'Entwickler-Tools', to: '/dev', disabled: true },
    ],
  }

  // ✅ KORRIGIERT: Verwende den benutzerfreundlichen God-Namen für alle Routen
  Object.keys(mapping).forEach((key) => {
    if (mapping[key] && mapping[key].length > 0) {
      mapping[key][0].title = godName
    }
  })

  // ✅ KORRIGIERT: Spezielle Behandlung für dynamische Routen mit God-Namen
  if (path.startsWith('/zones/') && path.includes('/edit')) {
    const zoneId = route.params.id
    return [
      {
        title: godName,
        to: '/',
        disabled: false,
      },
      { title: 'Agenten', to: '/zones', disabled: false },
      { title: `Zone ${zoneId} bearbeiten`, to: path, disabled: true },
    ]
  }

  if (path.startsWith('/zone/') && path.includes('/config')) {
    const espId = route.params.espId
    return [
      {
        title: godName,
        to: '/',
        disabled: false,
      },
      { title: 'Agenten', to: '/zones', disabled: false },
      { title: `Agent ${espId} konfigurieren`, to: path, disabled: true },
    ]
  }

  return (
    mapping[path] || [
      {
        title: godName,
        to: '/',
        disabled: false,
      },
      { title: 'Unbekannte Seite', to: path, disabled: true },
    ]
  )
})
</script>

<style scoped>
.v-breadcrumbs {
  background: transparent;
  padding: 0;
}

.v-breadcrumbs :deep(.v-breadcrumbs-item) {
  font-size: 0.875rem;
}

.v-breadcrumbs :deep(.v-breadcrumbs-item--disabled) {
  color: rgba(var(--v-theme-on-surface), 0.6);
  pointer-events: none;
}

/* Mobile Optimierungen */
@media (max-width: 768px) {
  .v-breadcrumbs :deep(.v-breadcrumbs-item) {
    font-size: 0.75rem;
  }
}
</style>
