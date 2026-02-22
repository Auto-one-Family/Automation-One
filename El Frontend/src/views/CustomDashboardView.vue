<script setup lang="ts">
/**
 * CustomDashboardView — Dashboard Builder (Phase 2)
 *
 * Route: /custom-dashboard
 *
 * Phase 1: Placeholder with coming-soon message
 * Phase 2: Full GridStack.js integration with widget catalog
 */

import { LayoutGrid } from 'lucide-vue-next'
</script>

<template>
  <div class="custom-dashboard-view">
    <div class="custom-dashboard-view__placeholder">
      <LayoutGrid class="custom-dashboard-view__icon" />
      <h2 class="custom-dashboard-view__title">Dashboard Builder</h2>
      <p class="custom-dashboard-view__description">
        Erstelle benutzerdefinierte Dashboards mit Drag-and-Drop-Widgets.
        Kombiniere Sensor-Charts, Aktor-Steuerungen und System-Übersichten
        in einem personalisierten Layout.
      </p>
      <div class="custom-dashboard-view__features">
        <div class="custom-dashboard-view__feature">
          <span class="custom-dashboard-view__feature-dot" />
          Linien-Charts mit Echtzeit-Daten
        </div>
        <div class="custom-dashboard-view__feature">
          <span class="custom-dashboard-view__feature-dot" />
          Gauge-Charts mit Schwellwert-Zonen
        </div>
        <div class="custom-dashboard-view__feature">
          <span class="custom-dashboard-view__feature-dot" />
          Aktor-Steuerung direkt im Dashboard
        </div>
        <div class="custom-dashboard-view__feature">
          <span class="custom-dashboard-view__feature-dot" />
          Alarm-Übersicht und ESP-Health
        </div>
        <div class="custom-dashboard-view__feature">
          <span class="custom-dashboard-view__feature-dot" />
          Layout speichern und wiederherstellen
        </div>
      </div>
      <span class="custom-dashboard-view__badge">Phase 2 — In Entwicklung</span>
    </div>
  </div>
</template>

<style scoped>
.custom-dashboard-view {
  min-height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-8);
}

.custom-dashboard-view__placeholder {
  max-width: 480px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-4);
}

.custom-dashboard-view__icon {
  width: 64px;
  height: 64px;
  color: var(--color-accent-dim);
  opacity: 0.6;
}

.custom-dashboard-view__title {
  font-size: var(--text-2xl);
  font-weight: 700;
  color: var(--color-text-primary);
  margin: 0;
}

.custom-dashboard-view__description {
  font-size: var(--text-base);
  color: var(--color-text-secondary);
  line-height: var(--leading-normal);
  margin: 0;
}

.custom-dashboard-view__features {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  align-items: flex-start;
  width: 100%;
  padding: var(--space-4);
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
}

.custom-dashboard-view__feature {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
}

.custom-dashboard-view__feature-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-accent);
  flex-shrink: 0;
}

.custom-dashboard-view__badge {
  display: inline-block;
  padding: var(--space-1) var(--space-3);
  background: var(--color-accent-dim);
  color: var(--color-accent-bright);
  font-size: var(--text-xs);
  font-weight: 600;
  border-radius: var(--radius-full);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wide);
}
</style>
