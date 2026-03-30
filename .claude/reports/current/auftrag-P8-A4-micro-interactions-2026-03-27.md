# Auftrag P8-A4 — Micro-Interactions System

**Typ:** Feature — Frontend (CSS + Vue)
**Schwere:** HIGH
**Aufwand:** ~2-3h
**Ziel-Agent:** frontend-dev
**Abhaengigkeit:** Keine
**Roadmap:** `roadmap-P8-v2-implementation-2026-03-27.md`

---

## Kontext

AutomationOne ist ein IoT-Framework mit Vue 3 Dashboard. Das Frontend zeigt Echtzeit-Sensor/Aktor-Daten ueber 10 Widget-Typen:
- **Sensor-Widgets:** LineChart, HistoricalChart, MultiSensor, Gauge, SensorCard, Statistics
- **Aktor-Widgets:** ActuatorCard, ActuatorRuntime
- **System-Widgets:** ESPHealth, AlarmList

Daten kommen ueber zwei Wege:
1. **REST-API** (initialer Load): `GET /api/v1/sensors/data` mit Query-Parametern (`esp_id`, `gpio`, `sensor_type`, `start_time`, `end_time`, `zone_id`, `subzone_id`). Stats: `GET /api/v1/sensors/{esp_id}/{gpio}/stats` (min/max/avg, genutzt von StatisticsWidget). Es gibt KEINEN Endpunkt `GET /sensors/{esp_id}/{gpio}/data`.
2. **WebSocket** (Live-Updates): 16 Event-Typen, darunter `sensor_data` (neuer Messwert), `actuator_status` (State-Wechsel), `esp_health`

Das Design-System nutzt `tokens.css` mit 129 Tokens. Relevante Tokens:
- `--color-accent` — Akzentfarbe (fuer Highlights)
- `--color-text-primary` — Standard-Textfarbe
- `--color-success` — Gruen (Aktor ON)
- `--color-error` — Rot (Fehler, Emergency)
- `--color-warning` — Orange (Warnung)
- `--color-neutral` — ⚠️ EXISTIERT NICHT in tokens.css. EMPFEHLUNG: Neues Token `--color-neutral: #484860` in tokens.css anlegen (konsistent mit `--color-text-muted`). Wird auch in P8-A6 (Aktor-Analytics) und UX-Wissensartikel referenziert — ein zentrales Token vermeidet Inkonsistenzen. Alternativ: `--color-text-muted` direkt nutzen, aber dann auch in P8-A6 anpassen.
- `--glass-bg` — Glass-Hintergrund
- `--radius-md` — Standard Border-Radius

---

## Problem

1. **Kein Skeleton-Loading:** Widgets zeigen waehrend des initialen API-Calls NICHTS — leere Flaeche. User weiss nicht ob das System laedt oder kaputt ist.
2. **Kein Live-Value-Highlight:** Wenn ein Sensor-Wert sich via WebSocket aendert, gibt es keine visuelle Indikation. User sieht nicht dass sich etwas aktualisiert hat.
3. **Keine Stale-Indication:** Ein Sensor der seit 10 Minuten keine Daten liefert sieht identisch aus wie ein frischer Sensor.
4. **Keine Aktor-Transitions:** ON→OFF Wechsel passiert abrupt ohne Animation.

Aus UX-Forschung (Micro-Interaction Patterns, Bootcamp/Medium 2025, Motion UI Trends):
- Skeleton-Screens reduzieren wahrgenommene Ladezeit signifikant
- Alle Animationen muessen unter 300ms bleiben (ueber 300ms fuehlt sich traege an)
- NUR CSS Transforms und Opacity animieren (GPU-beschleunigt), KEINE Layout-Properties (width, height, margin — verursachen Reflows)
- `will-change: transform` nur auf aktiv animierte Elemente setzen, nicht permanent
- `prefers-reduced-motion` MUSS respektiert werden: Barrierefreiheit
- Max 8 gleichzeitig animierte Elemente pro Viewport (Performance)

---

## IST

- `StatisticsWidget.vue` hat lokales `isLoading` State — aber keinen Shimmer, nur bedingt sichtbaren Content
- Kein projektweites `widget-skeleton` Pattern — ABER: `BaseSkeleton.vue` existiert moeglicherweise in `src/shared/design/primitives/` (als Spinner/LoadingState, kein Shimmer). `animations.css` existiert moeglicherweise mit `skeleton-loading` keyframes, und Tailwind hat moeglicherweise `animate-skeleton` Klasse. **Dev-Agent MUSS pruefen:** Falls diese Dateien existieren, bestehende Infrastruktur nutzen statt duplizieren. Falls nicht: `.widget-skeleton` CSS direkt definieren (siehe 4.1).
- **Stale-Konzept existiert BEREITS teilweise:**
  - `SensorCard.vue` hat `sensor-card--stale` CSS-Klasse (opacity 0.7, gelber Border 25%, Clock-Icon-Badge) mit `getDataFreshness(sensor.last_read)` bei Schwelle 120s
  - `useZoneKPIs.ts` Composable (aus A1) enthaelt `isZoneStale` fuer Zone-Level-Stale
  - `ZONE_STALE_THRESHOLD_MS = 60_000` in `formatters.ts` (fuer ESP/Zone-Stale, NICHT Sensor-Daten-Stale)
  - Die Widget-Stale-Indication in 4.3 soll das bestehende SensorCard-Pattern auf alle Widget-Typen ausweiten
- Keine `value-updated` CSS-Klasse
- `tokens.css` hat KEINEN `prefers-reduced-motion` Block
- Keine einheitliche Aktor-Transition

---

## SOLL — 4 Micro-Interactions

### 4.1 — Skeleton-Loading fuer alle Widgets

**Globale CSS-Klasse** — Dev-Agent MUSS zuerst pruefen ob `src/styles/animations.css` bereits `skeleton-loading` keyframes enthaelt und ob Tailwind `animate-skeleton` anbietet. Falls ja: Bestehende Infrastruktur nutzen, `.widget-skeleton` als kompatible Utility bauen statt zu duplizieren. Falls nein: Folgende CSS-Definition verwenden:

```css
.widget-skeleton {
  background: linear-gradient(90deg,
    var(--glass-bg) 25%,
    rgba(255,255,255,0.08) 50%,
    var(--glass-bg) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: var(--radius-md);
}

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
```

**Pro Widget-Typ ein Skeleton das die Endform spiegelt:**

| Widget-Typ | Skeleton-Form |
|-----------|---------------|
| GaugeWidget | Runder Platzhalter (Kreis ~80px) + eine Textzeile darunter |
| LineChartWidget | Rechteck (volle Breite, ~60% Hoehe) |
| HistoricalChart | Rechteck (volle Breite, ~70% Hoehe) + schmaler Bar unten (Zeitbereich-Selector) |
| MultiSensor | Rechteck (volle Breite, ~70% Hoehe) |
| SensorCard | Grosser Zahl-Platzhalter (breit, ~40px hoch) + schmale Sparkline darunter |
| ActuatorCard | Status-Badge-Platzhalter (Kreis 12px) + 2 Textzeilen |
| ActuatorRuntime | Status-Badge + 3 schmale Textzeilen + schmaler Balken |
| Statistics | 4 KPI-Boxen (2x2 Grid, je ~60x40px) |
| ESPHealth | Status-Badge + 3 Textzeilen |
| AlarmList | 3-4 schmale Zeilen (Liste) |

**Implementierung pro Widget:**
```vue
<template>
  <div v-if="isLoading" class="widget-skeleton-container">
    <!-- Typ-spezifische Platzhalter-Divs mit class="widget-skeleton" -->
  </div>
  <div v-else>
    <!-- Bestehender Widget-Content -->
  </div>
</template>
```

- Skeleton wird angezeigt solange der initiale API-Call laeuft (`isLoading` State)
- **NICHT** bei WebSocket-Updates (nur beim allerersten Laden)
- Falls ein Widget bereits einen `isLoading` State hat: diesen nutzen. Falls nicht: hinzufuegen.

### 4.2 — Live-Value Highlight

Wenn ein Sensor-Wert sich via WebSocket `sensor_data` Event aendert:

```css
.value-updated {
  color: var(--color-accent) !important;
  transition: color 200ms ease-out;
}
```

**Implementierung in Sensor-Widgets** (SensorCard, Gauge, LineChart etc.):
```typescript
const isValueUpdated = ref(false)
let highlightTimeout: ReturnType<typeof setTimeout> | null = null

watch(() => sensorValue.value, () => {
  isValueUpdated.value = true
  if (highlightTimeout) clearTimeout(highlightTimeout)
  highlightTimeout = setTimeout(() => {
    isValueUpdated.value = false
  }, 300)
})
```

```html
<span :class="{ 'value-updated': isValueUpdated }">
  {{ formattedValue }}
</span>
```

- Wert blinkt 300ms in Accent-Farbe, dann Fade zurueck (200ms CSS-Transition). Gesamt-Dauer 500ms — das verletzt NICHT die 300ms-Regel, weil der Rueckfade kein neuer visueller Impuls ist sondern ein passiver Uebergang. Die wahrgenommene "Aktion" endet nach 300ms.
- Nicht animieren wenn Widget nicht mounted (kein Leak)
- Kein Highlight beim initialen Laden — nur bei Updates
- **onUnmounted:** `clearTimeout(highlightTimeout)` aufraeumen (Memory-Leak-Schutz)

### 4.3 — Stale-Data Indication

Wenn ein Sensor laenger als 2 Minuten keine Daten liefert:

```css
.widget-stale {
  opacity: 0.5;
  transition: opacity 500ms ease;
}

.stale-indicator {
  position: absolute;
  top: 4px;
  right: 4px;
  font-size: 12px;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 1; }
}
```

**Bestehendes Stale-Pattern (SensorCard) als Vorbild:**
- `SensorCard.vue` hat bereits `getDataFreshness(sensor.last_read)` mit Schwelle 120s
- Bei `freshness === 'stale'`: CSS-Klasse `sensor-card--stale` (opacity 0.7, gelber Border 25%), Badge mit Clock-Icon
- `useZoneKPIs.ts` (Composable aus A1) enthaelt `isZoneStale` fuer Zone-Level-Stale (nutzt `ZONE_STALE_THRESHOLD_MS = 60_000` aus `formatters.ts`)

**Implementierung — bestehendes Pattern auf alle Widgets ausweiten:**
```typescript
// In `formatters.ts` (Projektkonvention fuer Stale-Konstanten):
// ZONE_STALE_THRESHOLD_MS = 60_000 existiert bereits (ESP/Zone-Level)
// NEU: Widget-Daten-Stale mit separatem Namen:
export const WIDGET_DATA_STALE_THRESHOLD_MS = 2 * 60 * 1000 // 120s — konsistent mit SensorCard

const isStale = computed(() => {
  if (!lastDataTimestamp.value) return false
  return Date.now() - lastDataTimestamp.value > WIDGET_DATA_STALE_THRESHOLD_MS
})
```

- `lastDataTimestamp` wird bei jedem WebSocket-Update aktualisiert
- Tooltip bei Hover auf das Warn-Icon: "Letzte Daten vor X Minuten"
- Die 120s-Schwelle kommt aus `WIDGET_DATA_STALE_THRESHOLD_MS` in `formatters.ts` — NICHT hardcoded pro Widget
- ⚠️ `ZONE_STALE_THRESHOLD_MS` (60s, fuer ESP/Zone-Level) ist eine ANDERE Konstante — nicht verwechseln
- Dev-Agent soll das bestehende `getDataFreshness()`-Pattern aus SensorCard identifizieren und als Composable (z.B. `useWidgetStale`) extrahieren, damit alle 10 Widgets es konsistent nutzen koennen

### 4.4 — Aktor Status-Transitions

Wenn ein Aktor den State wechselt (via WebSocket `actuator_status` Event):

```css
.actuator-transition-on {
  animation: pulseOn 200ms ease;
}
.actuator-transition-off {
  transition: background-color 300ms ease;
}
.actuator-transition-emergency {
  animation: emergencyPulse 150ms ease 2;
}
.actuator-transition-error {
  animation: shake 150ms ease;
}

@keyframes pulseOn {
  0% { transform: scale(1); }
  50% { transform: scale(1.03); }
  100% { transform: scale(1); }
}

@keyframes emergencyPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

@keyframes shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-2px); }
  75% { transform: translateX(2px); }
}
```

| Transition | Animation | Dauer |
|-----------|-----------|-------|
| OFF → ON | Pulse (scale 1→1.03→1) + Farbe gruen | 200ms |
| ON → OFF | Smooth Color-Fade (gruen→neutral) | 300ms |
| ANY → EMERGENCY | 2x schneller Pulse (rot), dann statisch rot | 2×150ms |
| ANY → ERROR | Einmaliger Shake (translateX) | 150ms |

**Implementierung:** Dev-Agent muss pruefen ob die Transitions in `ActuatorCard.vue` (Monitor-Komponente, `src/components/devices/`) oder `ActuatorCardWidget.vue` (Dashboard-Widget-Wrapper) gehoeren — oder in beiden. Wenn Transitions auch im Monitor sichtbar sein sollen (empfohlen): In `ActuatorCard.vue` implementieren.
- `watch()` auf den Aktor-State
- Bei Wechsel: passende CSS-Klasse setzen, nach Animation-Dauer entfernen
- Transition-Klasse wird auf den Status-Badge oder die gesamte Card angewendet

---

## Globaler prefers-reduced-motion Block

In `animations.css` (NICHT in `tokens.css` — Tokens definieren Werte, Animationsverhalten gehoert in die Animations-Datei):

```css
@media (prefers-reduced-motion: reduce) {
  .widget-skeleton,
  .stale-indicator,
  .actuator-transition-on,
  .actuator-transition-emergency,
  .actuator-transition-error {
    animation: none !important;
  }
  .value-updated,
  .widget-stale,
  .actuator-transition-off {
    transition: none !important;
  }
}
```

---

## Einschraenkungen

- Keine neuen npm-Pakete (alles CSS + Vue)
- Skeleton ersetzt aktuelle Leer-Zustaende, fuegt keine Schicht hinzu
- Stale-Schwelle ist Developer-Konstante, nicht User-konfigurierbar (vorerst)
- Performance: Darf auf Raspberry Pi keinen Jank verursachen — einfache CSS-Animationen
- Max 8 gleichzeitig animierte Elemente pro Viewport
- NUR CSS Transforms + Opacity animieren (GPU-beschleunigt)

---

## Was NICHT gemacht wird

- Pull-to-Refresh (Mobile-Feature, spaeterer Auftrag)
- Swipe-Gesten (Mobile-Feature, spaeterer Auftrag)
- Celebration-Animations (zu nischig, kein Prioritaet)
- Chart.js interne Animationen aendern (funktionieren bereits)

---

## Akzeptanzkriterien

- [ ] Alle 10 Widget-Typen haben typ-spezifische Skeletons waehrend initialem Laden
- [ ] Live-Value Highlight bei WebSocket-Updates (300ms Accent, dann Fade-Back)
- [ ] Stale-Indication bei > 2min ohne Daten (opacity 0.5 + pulsierendes Warn-Icon)
- [ ] Aktor Status-Transitions: 4 Varianten (ON, OFF, EMERGENCY, ERROR) animiert
- [ ] `@media (prefers-reduced-motion: reduce)` deaktiviert ALLE Animationen
- [ ] Keine Layout-Shifts durch Animationen (kein CLS)
- [ ] Keine neuen npm-Pakete
- [ ] Stale-Schwelle als geteilte Konstante (nicht hardcoded pro Widget)
