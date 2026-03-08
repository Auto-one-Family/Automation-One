# Phase 2.3 + Phase 4 Analyse: Monitor L2 Verfeinerung

> **Erstellt:** 2026-03-07
> **Typ:** Reine Analyse (kein Code geschrieben)
> **Basis:** Post-Phase-3 IST-Zustand (SensorCard Sparkline, ActuatorCard Rules, Trend-Pfeil)
> **Verifiziert:** Alle Zeilennummern gegen Live-Codebase geprueft

---

## Executive Summary

Phase 3 hat SensorCard (Sparkline + Trend-Pfeil), ActuatorCard (Rules-Section + PWM-Badge) und MonitorView (SparklineCache-Anbindung) erweitert — die Accordion-Template-Struktur blieb **unberuehrt**. Die L2-IST-Analyse-Zeilennummern haben sich durch Phase 3 leicht verschoben, sind aber strukturell konsistent.

**Kritischstes Finding:** Das `zoneKPIs` Computed (Zeile 928-1024) hat **keinen Debounce** — bei 20 Devices mit Live-Sensor-Daten entsteht ~60-100ms Recomputation pro WebSocket-Event, was bei hoher Last die UI blockieren kann. Der `useSubzoneResolver` (Zeile 117) laedt bei **jedem Zonenwechsel** 1 API-Call pro ESP — sequentiell, ohne Bedingung, obwohl die Daten nur als Fallback gebraucht werden.

Phase 4 Items sind mehrheitlich **Frontend-only und unabhaengig voneinander**. Accordion Smart-Defaults (4.1) und "Keine Subzone"-Abhebung (4.5) sind trivial (~30min je). Der HardwareView-Link (4.2) ist trivial weil `/hardware/:zoneId` als Route bereits existiert. Die Stale-Verstaerkung (4.4) ist **optional** — der aktuelle Stand reicht fuer die meisten Faelle, Sparkline/Trend-Pfeil werden aber bei stale nicht gedimmt. Der Lazy-Resolver (4.3) ist die **groesste Aenderung** (~1h) aber mit klarem Scope.

**Geschaetzter Gesamtaufwand:** ~4h (davon 1h Debounce, 0.5h Accordion, 0.5h Link, 1h Resolver, 0.5h Stale, 0.5h Keine-Subzone).

---

## A: zoneKPIs Recomputation + Debounce

### A1: zoneKPIs Definition

- **Datei:** `El Frontend/src/views/MonitorView.vue`
- **Zeilen:** 928–1024
- **Typ:** `computed<ZoneKPI[]>`
- **Interface:** Zeilen 866-885

```typescript
interface ZoneKPI {
  zoneId: string
  zoneName: string
  sensorCount: number
  actuatorCount: number
  activeSensors: number
  activeActuators: number
  alarmCount: number
  aggregation: ReturnType<typeof aggregateZoneSensors>
  lastActivity: string | null
  healthStatus: ZoneHealthStatus   // 'ok' | 'warning' | 'alarm' | 'empty'
  healthReason: string
  onlineDevices: number
  totalDevices: number
}
```

**Berechnete Felder:** sensorCount, actuatorCount, activeSensors, activeActuators, alarmCount, emergencyStoppedCount, newestTimestamp, onlineDevices, aggregation (via `aggregateZoneSensors`), healthStatus + healthReason (via `getZoneHealthStatus`)

**Datenquelle:**
1. `espStore.devices` → `groupDevicesByZone()` (Zeile 929)
2. Pro Zone: Iteration ueber `group.devices` → `.sensors` + `.actuators` (Zeilen 944-978)
3. `aggregateZoneSensors(group.devices)` (Zeile 980) — ruft intern `groupSensorsByBaseType()` auf
4. `allZones.value` fuer leere Zonen (Zeile 1002)

**Hilfs-Funktionen:**
- `groupDevicesByZone()` — aus `useZoneDragDrop.ts` (Zeilen 127-162)
- `aggregateZoneSensors()` — aus `sensorDefaults.ts` (Zeilen 1276-1333)
- `getZoneHealthStatus()` — lokal in MonitorView.vue (Zeilen 889-919)

### A2: Trigger-Frequenz

- **Trigger-Mechanismus:** `computed` referenziert im Template via `v-for="zone in zoneKPIs"` (Zeile ~1566)
- **Primaere Dependency:** `espStore.devices` (Zeile 929) — jedes `sensor_data` WS-Event mutiert den Store
- **Sekundaere Dependency:** `allZones.value` (Zeile 1002) — nur bei Zone-CRUD
- **Geschaetzte Re-Evaluierungen:** Bei 50 Sensoren @10s Intervall = ~5 Events/Sekunde = **5 Recomputes/Sekunde**
- **Aktueller Debounce:** **KEINER**

**Aber:** Vue's `computed` ist lazy — es re-evaluiert nur wenn eine Dependency sich aendert UND das Ergebnis gelesen wird. Da das Template `zoneKPIs` in einem `v-for` referenziert, wird bei jeder `espStore.devices`-Mutation ein Re-Render getriggered.

### A3: Performance-Einschaetzung

| Operation | Komplexitaet | Typisch (20 Devices, 10 Sensoren) |
|-----------|-------------|-----------------------------------|
| `groupDevicesByZone()` | O(D) | ~5ms |
| `.filter()` Ketten (3x pro Device) | O(D * S) | ~10-20ms |
| Timestamp-Scan | O(D * S) | ~10-15ms |
| `aggregateZoneSensors()` x Z Zonen | O(D * S * 2) | ~30-50ms (wegen `groupSensorsByBaseType` nested) |
| `getZoneHealthStatus()` x Z | O(Z) | ~2-5ms |
| **TOTAL PRO RECOMPUTE** | **O(D * S * Z)** | **~60-100ms** |

**Engpass:** `aggregateZoneSensors()` ruft intern `groupSensorsByBaseType()` pro Device auf — das ist der teuerste Teil. Drei separate `.filter()` Aufrufe pro Device (Zeilen 950-953) koennten in einen Single-Pass `.reduce()` zusammengefasst werden.

### A4: Debounce-Empfehlung

**Bestehende Patterns im Projekt:**
- `useQueryFilters.ts`: Manueller `setTimeout`/`clearTimeout` mit 300ms Default
- Kein `lodash.throttle` oder `lodash.debounce` im Projekt

**Empfohlene Option: watchEffect + manueller Throttle (Option B)**

Begruendung: Am wenigsten invasiv — aendert nur MonitorView.vue, kein Eingriff in espStore oder andere Composables. Behaelt die reaktive Natur bei, begrenzt aber Re-Computations auf max 1x/300ms.

**Einfuegestelle:** MonitorView.vue, Zeilen 928-1024 ersetzen

```typescript
// Statt:
const zoneKPIs = computed<ZoneKPI[]>(() => { ... })

// Neu:
const zoneKPIs = ref<ZoneKPI[]>([])
let kpiDebounceTimer: ReturnType<typeof setTimeout> | null = null

function computeZoneKPIs(): ZoneKPI[] {
  // ... bisheriger computed-Body ...
}

watch(
  [() => espStore.devices, allZones],
  () => {
    if (kpiDebounceTimer) clearTimeout(kpiDebounceTimer)
    kpiDebounceTimer = setTimeout(() => {
      zoneKPIs.value = computeZoneKPIs()
    }, 300)
  },
  { immediate: true, deep: false }
)
```

**Risiko:** Alarm-Updates verzoegern sich um max 300ms — akzeptabel fuer Monitoring.

---

## B: Accordion Smart-Defaults

### B1: IST-Zustand Accordion-State

- **Datei:** `El Frontend/src/views/MonitorView.vue`
- **Zeilen:** 1252-1309
- **Datenstruktur:** `ref<Set<string>>(new Set())` — speichert COLLAPSED Subzone-Keys (Zeile 1255)
- **localStorage-Key:** `ao-monitor-subzone-collapse-${zoneId}` (Zeile 1259)
- **Lade-Zeitpunkt:** `watch(selectedZoneId, ..., { immediate: true })` (Zeile 1302-1309)
- **Save-Zeitpunkt:** Sofort bei `toggleSubzone()` (Zeile 1294-1296)

**Invertierte Logik:** Set enthaelt COLLAPSED Keys. `isSubzoneExpanded(key)` = `!collapsedSubzones.value.has(key)` (Zeile 1282-1283). Leeres Set = alle expanded.

### B2: Subzone-Zaehlung

- **Zaehlung ueber:** `zoneSensorGroup.subzones` (aus `useZoneGrouping.ts` oder API-Response)
- **"Keine Subzone" mitzaehlend:** **JA** — `SUBZONE_NONE ('__none__')` wird als Array-Eintrag mit `subzoneId: null` eingefuegt (useZoneGrouping.ts Zeile 189)
- **Konstante:** `useZoneGrouping.ts` Zeile 100: `const SUBZONE_NONE = '__none__'`
- **Label:** `'Keine Subzone'` (useZoneGrouping.ts Zeile 186, MonitorView.vue Zeilen 1783, 1928)

**Fuer Smart-Defaults:** "Keine Subzone" sollte **nicht** in die <=4-Zaehlung einfliessen, aber immer offen bleiben. Effektive Zaehlung = `subzones.filter(s => s.subzoneId !== null).length`.

### B3: Einfuegestelle Smart-Defaults

- **Bestehender Kommentar:** Zeile 1263: `// Default: all expanded if ≤4 subzones, else only first expanded` — **vorhanden aber NICHT implementiert**
- **Code an Zeile 1264:** `collapsedSubzones.value = new Set()` — ignoriert den Kommentar komplett

**Empfohlene Stelle:** `loadAccordionState()` Funktion (Zeilen 1257-1269), im `else`-Zweig

```typescript
function loadAccordionState(zoneId: string) {
  try {
    const stored = localStorage.getItem(`ao-monitor-subzone-collapse-${zoneId}`)
    if (stored) {
      collapsedSubzones.value = new Set(JSON.parse(stored))
    } else {
      // Smart-Default: ≤4 benannte Subzonen → alle offen
      // >4 benannte Subzonen → nur erste + "Keine Subzone" offen
      const sensorSubzones = zoneSensorGroup.value?.subzones ?? []
      const actuatorSubzones = zoneActuatorGroup.value?.subzones ?? []
      const namedCount = new Set([
        ...sensorSubzones.filter(s => s.subzoneId !== null).map(s => s.subzoneId),
        ...actuatorSubzones.filter(s => s.subzoneId !== null).map(s => s.subzoneId),
      ]).size

      if (namedCount <= 4) {
        collapsedSubzones.value = new Set()  // alle offen
      } else {
        // Alle ausser erste Subzone collapsed
        const allKeys = [
          ...sensorSubzones.map(s => getSubzoneKey(zoneId, s.subzoneId)),
          ...actuatorSubzones.map(s => getSubzoneKey(zoneId, s.subzoneId)),
        ]
        const firstNamedKey = sensorSubzones.find(s => s.subzoneId !== null)
        const collapsed = new Set(allKeys.filter(key => {
          const isNone = key.endsWith('-__none__') || key.endsWith('-null')
          const isFirst = firstNamedKey && key === getSubzoneKey(zoneId, firstNamedKey.subzoneId)
          return !isNone && !isFirst
        }))
        collapsedSubzones.value = collapsed
      }
    }
  } catch {
    collapsedSubzones.value = new Set()
  }
}
```

**Problem:** `zoneSensorGroup` und `zoneActuatorGroup` koennten beim initialen Load noch `null` sein (API-Daten noch nicht geladen). Loesung: Zweiten Watch hinzufuegen der Smart-Defaults appliziert wenn Daten verfuegbar werden und localStorage leer ist.

### B4: Phase-3-Auswirkungen

- **Accordion-Logik veraendert:** NEIN
- **Sparkline:** Ist ein `#sparkline` Slot innerhalb von SensorCard — keine Auswirkung auf Accordion-Struktur
- **Sensoren/Aktoren:** Separate Accordion-Sektionen (Sensoren: Zeilen 1748-1908, Aktoren: Zeilen 1910-1959), teilen sich den gleichen `collapsedSubzones` State und `isSubzoneExpanded()` / `toggleSubzone()` Funktionen

---

## C: Zone-Header und Cross-Links

### C1: Zone-Header IST-Zustand

- **Datei:** `El Frontend/src/views/MonitorView.vue`
- **Zeilen:** 1701-1745
- **CSS-Layout:** Flexbox (`display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap;`)

| Element | Zeile | Beschreibung |
|---------|-------|-------------|
| Zurueck-Button | 1702-1705 | `<button>` mit ArrowLeft Icon, ruft `goBack()` → `router.push({ name: 'monitor' })` |
| Zone-Navigation | 1708-1728 | Prev/Next Buttons (ChevronLeft/Right), nur wenn `sortedZoneIds.length > 1` |
| Zone-Name + Position | 1717-1718 | `{{ selectedZoneName }} ({{ zonePositionLabel }})` |
| Header-Info | 1730-1744 | Stacked: Title (wenn nur 1 Zone) + KPI-Zeile (Sensoren/Aktoren/Alarme) |
| **Settings-Icon** | **FEHLT** | Kein Zahnrad/Config-Button im Header |

**Platz fuer zusaetzliches Icon:** Ja — Flexbox mit `flex-wrap: wrap` bietet Platz. Empfohlen: Rechts neben Header-Info, vor der Zone-Navigation (oder ganz rechts mit `margin-left: auto`).

### C2: Bestehende Cross-Links

| Von | Nach | Route | Trigger | Zeile |
|-----|------|-------|---------|-------|
| L2 Header Zurueck | L1 Monitor | `monitor` | goBack() | 1320 |
| L2 Prev Zone | Andere Zone L2 | `monitor-zone` | goToPrevZone() | ~1340 |
| L2 Next Zone | Andere Zone L2 | `monitor-zone` | goToNextZone() | ~1360 |
| L2 Empty Subzone | Hardware | `hardware` | router-link | 1815 |
| L2 Dashboard Edit | Editor | `editor-dashboard` | router.push() | 1497 |
| L2 New Dashboard | Editor | `editor` | router-link | 1644, 1968 |
| L2 Zone Dashboard | Monitor Dash | `monitor-zone-dashboard` | router-link | 1979-1991 |
| ActuatorCard Rules | Logic | `/logic` | router-link | ActuatorCard.vue:134-140 |
| SensorCard Config | (Parent-Event) | — | `emit('configure')` | SensorCard.vue:31-33 |

**Fehlt:** Direkter Link Monitor L2 → HardwareView fuer die ausgewaehlte Zone

### C3: HardwareView-Route

- **Route `/hardware/:zoneId`:** **EXISTIERT** (Name: `hardware-zone`)
- **Datei:** `El Frontend/src/router/index.ts`, Zeilen 67-84
- **Alle Hardware-Routes:**

| Route | Name | Existiert |
|-------|------|-----------|
| `/hardware` | `hardware` | Ja |
| `/hardware/:zoneId` | `hardware-zone` | **Ja** |
| `/hardware/:zoneId/:espId` | `hardware-esp` | Ja |

**Fazit:** Kein Workaround noetig — der Link kann direkt `{ name: 'hardware-zone', params: { zoneId: selectedZoneId } }` nutzen.

### C4: Icon-Positionierung

- **Icon-Library:** `lucide-vue-next` v0.468.0 (package.json)
- **Settings-Icon verfuegbar:** Ja (`Settings` aus lucide-vue-next)
- **Aktuell importiert (MonitorView.vue Zeile 63-64):** ArrowLeft, Activity, AlertTriangle, ChevronLeft, ChevronRight
- **Noch nicht importiert:** `Settings` — muss zum Import hinzugefuegt werden

**Empfohlene Position:** Rechts neben Header-Info, als letztes Element im `.monitor-view__header` Flexbox-Container

```vue
<!-- Nach Zeile 1744 (.monitor-view__header-info Ende), vor </div> des Headers -->
<router-link
  :to="{ name: 'hardware-zone', params: { zoneId: selectedZoneId } }"
  class="monitor-view__config-link"
  title="Hardware-Konfiguration"
>
  <Settings class="w-4 h-4" />
</router-link>
```

---

## D: Subzone-API-Calls und Resolver-Redundanz

### D1: useSubzoneResolver IST-Zustand

- **Datei:** `El Frontend/src/composables/useSubzoneResolver.ts` (93 Zeilen)
- **Initialisierung:** MonitorView.vue Zeile 117: `const subzoneResolver = useSubzoneResolver(selectedZoneId)`
- **Auto-Trigger:** Interner Watch auf `[zoneId, () => devicesInZone.value.length]` mit `{ immediate: true }` (Zeile 79-85)
- **API-Calls:** `subzonesApi.getSubzones(espId)` pro ESP — **sequentiell** (await in for-Loop, Zeile 53)
- **Calls bei 5 ESPs:** **5 sequentielle Calls** zu `GET /subzone/devices/{espId}/subzones`
- **Geschaetzte Zeit:** ~100-500ms pro Call = **500-2500ms total**

### D2: Aufruf-Reihenfolge

| Aktion | Trigger | Timing |
|--------|---------|--------|
| `fetchZoneMonitorData()` | `watch(selectedZoneId)` Zeile 1229-1235 | Sofort bei Zone-Wechsel |
| `useSubzoneResolver.buildResolver()` | Interner Watch Zeile 79-85 | Sofort bei Zone-Wechsel |
| **Parallel/Sequentiell:** | **PARALLEL** | Beide Watchers feuern unabhaengig |
| **Fehler-Bedingung:** | **KEINE** | Resolver laedt **IMMER**, unabhaengig vom monitor-data Erfolg |

### D3: Resolver-Daten-Nutzung

- **Template-Nutzung:** Indirekt ueber `zoneSensorGroup` Computed (Zeile 1073-1098)
- **Logik (Zeile 1077):** `if (data && !zoneMonitorError.value)` → API-Daten nutzen. **Nur bei Error** faellt es auf `sensorsByZone.value` zurueck, das den Resolver nutzt.
- **Notwendig bei API-Erfolg:** **NEIN** — Resolver-Daten werden verworfen wenn monitor-data erfolgreich ist
- **Redundanz:** ~95% der Aufrufe sind unnoetig (API-Fehler sind selten)

### D4: Lazy-Strategie

**Empfohlener Ansatz:** Resolver nur bei API-Error initialisieren (Option A)

**Betroffene Dateien:**
1. `El Frontend/src/views/MonitorView.vue` — Zeile 117 + neuer Watch
2. `El Frontend/src/composables/useSubzoneResolver.ts` — `immediate: false` Option hinzufuegen

**Andere Views betroffen:** **Keine** — nur MonitorView nutzt `useSubzoneResolver` (geprueft via Codebase-Suche)

```typescript
// MonitorView.vue — Lazy-Resolver Pattern
const subzoneResolver = useSubzoneResolver(selectedZoneId, { lazy: true })

// Trigger Resolver nur bei API-Error
watch(zoneMonitorError, (error) => {
  if (error && selectedZoneId.value) {
    subzoneResolver.buildResolver()
  }
})
```

**useSubzoneResolver.ts — lazy Option:**
```typescript
export function useSubzoneResolver(
  zoneIdRef: Ref<string | null>,
  options: { lazy?: boolean } = {}
) {
  // ... bestehender Code ...

  if (!options.lazy) {
    watch([zoneId, () => devicesInZone.value.length], () => {
      buildResolver()
    }, { immediate: true })
  }

  return { resolverMap, isLoading, error, buildResolver }
}
```

**Risiko:** Bei API-Error verzoegert sich die Fallback-Anzeige um die Resolver-Ladezeit (~500-2500ms). Akzeptabel weil Error-Case selten und User ohnehin einen Error-State sieht.

---

## E: Stale-Visualisierung + "Keine Subzone"

### E1: Stale-Indikator IST nach Phase 3

**CSS `sensor-card--stale`** (SensorCard.vue Zeilen 391-398):
```css
.sensor-card--stale {
  opacity: 0.7;
  border-color: rgba(251, 191, 36, 0.25);   /* Gelber Border, gedimmt */
}
.sensor-card--stale .sensor-card__number {
  color: var(--color-text-secondary);         /* Gedimmter Zahlenwert */
}
```

**CSS `sensor-card--esp-offline`** (Zeilen 401-408):
```css
.sensor-card--esp-offline {
  opacity: 0.5;                               /* Staerker gedimmt als stale */
  border-color: var(--glass-border);           /* Standard-Grau */
}
.sensor-card--esp-offline .sensor-card__number {
  color: var(--color-text-muted);             /* Noch staerker gedimmt */
}
```

**Phase-3-Auswirkungen:**
- **Sparkline bei stale:** Wird **NICHT** separat gedimmt — erbt nur die `opacity: 0.7` der gesamten Card
- **Trend-Pfeil bei stale:** Wird **NICHT** separat gedimmt — bleibt in normaler Farbe
- **Grenzwert:** `DATA_STALE_THRESHOLD_S = 120` (formatters.ts Zeile 470)

### E2: Verstaerkung noetig?

**Bewertung: Grenzwertig ausreichend — optionale Verstaerkung empfohlen**

**Begruendung:**
- `opacity: 0.7` ist subtil — bei einer Card mit lebhafter Sparkline und farbigem Trend-Pfeil faellt der Unterschied kaum auf
- Der gelbe Border (`rgba(251, 191, 36, 0.25)`) ist bei 25% Opacity fast unsichtbar auf dunklem Hintergrund
- Das Clock-Badge ("vor X Minuten") ist das staerkste Signal, aber klein (10px Font)

**Empfehlung: Zwei gezielte CSS-Ergaenzungen**
```css
.sensor-card--stale .sensor-card__trend {
  opacity: 0.5;    /* Trend-Pfeil deutlich zuruecknehmen */
}
.sensor-card--stale .sensor-card__sparkline {
  opacity: 0.5;    /* Sparkline-Chart zuruecknehmen */
  filter: saturate(0.3);  /* Farben entsaettigen */
}
```

Dies verstaerkt das Stale-Signal ohne die Card-Struktur zu aendern. Phase 4.4 ist damit eine **~15min CSS-Ergaenzung**, kein architektureller Eingriff.

### E3: "Keine Subzone" IST-Zustand

- **Template-Rendering:** Normaler `<div class="monitor-subzone">` — identisch mit benannten Subzonen (MonitorView.vue Zeilen 1751-1754, 1914-1917)
- **Visueller Unterschied zu benannten Subzonen:** **KEINER** — gleiche CSS-Klasse `monitor-subzone`
- **Label:** `'Keine Subzone'` (MonitorView.vue Zeilen 1783, 1928: `{{ subzone.subzoneName || 'Keine Subzone' }}`)
- **Konstante:** `SUBZONE_NONE = '__none__'` (useZoneGrouping.ts Zeile 100)
- **Normalisierung:** `subzoneHelpers.ts` Zeilen 16-21: `normalizeSubzoneId()` mappt `'__none__'` → `null`

### E4: Einfuegestelle visuelle Abhebung

**Empfohlene Option: A (dashed Border + anderer Hintergrund)**

Begruendung: Konsistent mit HardwareView "unassigned-section" Pattern. Dashed Border signalisiert "unvollstaendig/temporaer". Keine neue Komponente noetig — nur CSS-Klasse und `:class` Binding.

**Template-Aenderung (Zeile 1754 und 1917):**
```vue
<!-- Sensoren: Zeile 1754 -->
<div
  v-for="subzone in zoneSensorGroup.subzones"
  :key="subzone.subzoneId ?? '__none__'"
  :class="['monitor-subzone', { 'monitor-subzone--unassigned': subzone.subzoneId === null }]"
>

<!-- Aktoren: Zeile 1917 -->
<div
  v-for="subzone in zoneActuatorGroup.subzones"
  :key="subzone.subzoneId ?? '__none__'"
  :class="['monitor-subzone', { 'monitor-subzone--unassigned': subzone.subzoneId === null }]"
>
```

**CSS-Aenderung:**
```css
.monitor-subzone--unassigned {
  border-left: 2px dashed var(--color-warning, rgba(251, 191, 36, 0.4));
  background: rgba(251, 191, 36, 0.03);
  border-radius: var(--radius-sm);
  padding-left: var(--space-3);
}
```

### E5: Aktoren-Sektion

- **Aktoren in Subzone-Accordions:** **JA** — separate `<section>` mit eigenem `v-for` ueber `zoneActuatorGroup.subzones` (Zeilen 1910-1959)
- **"Keine Subzone" fuer Aktoren relevant:** **JA** — gleiche Logik wie Sensoren, gleiche Accordion-Funktionen (`isSubzoneExpanded`, `toggleSubzone`), gleiches Label "Keine Subzone" (Zeile 1928)
- **ActuatorCard hat KEIN stale/offline CSS** — kein `isStale`, kein `isEspOffline` (im Gegensatz zu SensorCard)

---

## F: Implementierungsplan Phase 2.3 + Phase 4

Empfohlene Reihenfolge (nach Abhaengigkeit und Aufwand):

### 1. Phase 2.3: zoneKPIs Debounce (~1h)

| Schritt | Datei | Zeilen | Aktion |
|---------|-------|--------|--------|
| 1a | MonitorView.vue | 928 | `computed` → `ref` + `watch` mit 300ms setTimeout |
| 1b | MonitorView.vue | 928-1024 | Computed-Body in eigene `computeZoneKPIs()` Funktion extrahieren |
| 1c | MonitorView.vue | ~1025 | Watch auf `[() => espStore.devices, allZones]` mit Debounce |
| 1d | — | — | Template bleibt unveraendert (`v-for="zone in zoneKPIs"` funktioniert mit ref genauso) |
| 1e | — | — | Verifizieren: L1 Zone-Tiles aktualisieren sich innerhalb 300ms nach Sensor-Event |

### 2. Phase 4.1: Accordion Smart-Defaults (~30min)

| Schritt | Datei | Zeilen | Aktion |
|---------|-------|--------|--------|
| 2a | MonitorView.vue | 1262-1264 | `else`-Zweig in `loadAccordionState()` mit <=4-Logik ersetzen |
| 2b | MonitorView.vue | ~1310 | Zweiten Watch hinzufuegen: Wenn `zoneSensorGroup` erstmals verfuegbar wird UND kein localStorage → Smart-Defaults applizieren |
| 2c | — | — | "Keine Subzone" zaehlt NICHT fuer <=4-Regel, bleibt aber IMMER offen |

### 3. Phase 4.5: "Keine Subzone" Abhebung (~30min)

| Schritt | Datei | Zeilen | Aktion |
|---------|-------|--------|--------|
| 3a | MonitorView.vue | 1754 | `:class` Binding mit `monitor-subzone--unassigned` fuer Sensoren |
| 3b | MonitorView.vue | 1917 | `:class` Binding mit `monitor-subzone--unassigned` fuer Aktoren |
| 3c | MonitorView.vue | CSS | `monitor-subzone--unassigned` Klasse (dashed border, subtiler Hintergrund) |

### 4. Phase 4.4: Stale-Verstaerkung (~15min)

| Schritt | Datei | Zeilen | Aktion |
|---------|-------|--------|--------|
| 4a | SensorCard.vue | nach 398 | CSS fuer `.sensor-card--stale .sensor-card__trend` (opacity) |
| 4b | SensorCard.vue | nach 398 | CSS fuer `.sensor-card--stale .sensor-card__sparkline` (opacity + desaturate) |

### 5. Phase 4.2: HardwareView-Link (~30min)

| Schritt | Datei | Zeilen | Aktion |
|---------|-------|--------|--------|
| 5a | MonitorView.vue | Import | `Settings` aus lucide-vue-next importieren (Zeile 63-64 erweitern) |
| 5b | MonitorView.vue | ~1744 | `<router-link>` mit Settings-Icon nach Header-Info einfuegen |
| 5c | MonitorView.vue | CSS | `.monitor-view__config-link` Styling (Glassmorphism-Button, hover) |

### 6. Phase 4.3: Lazy Resolver (~1h)

| Schritt | Datei | Zeilen | Aktion |
|---------|-------|--------|--------|
| 6a | useSubzoneResolver.ts | 79-85 | `lazy` Option hinzufuegen: Watch nur wenn `!options.lazy` |
| 6b | MonitorView.vue | 117 | `useSubzoneResolver(selectedZoneId, { lazy: true })` |
| 6c | MonitorView.vue | ~1235 | Neuer Watch: Bei `zoneMonitorError` → `subzoneResolver.buildResolver()` |
| 6d | useSubzoneResolver.ts | 48-67 | Optional: `Promise.all()` statt sequentielle awaits im Error-Fallback |
| 6e | — | — | Verifizieren: Zone-Wechsel macht KEINEN Subzone-API-Call mehr (DevTools Network) |

---

## G: Bereits Erledigtes

Items die durch Phase 0-3 bereits abgedeckt sind:

| Item | Phase | Status | Beleg |
|------|-------|--------|-------|
| AbortController bei Zone-Wechsel (E2/D2) | Phase 1.4 | **ERLEDIGT** | MonitorView.vue Zeile 1204-1207 |
| ActuatorCard Toggle-Guard im Monitor (E5) | Phase 1.1 | **ERLEDIGT** | ActuatorCard.vue `v-if="mode === 'config'"` |
| Sparkline-Cache Anbindung (A9) | Phase 3 | **ERLEDIGT** | MonitorView.vue Zeile 1238+ |
| SensorCard Trend-Pfeil | Phase 3 | **ERLEDIGT** | SensorCard.vue trendUtils Integration |
| ActuatorCard Rules-Section | Phase 3 | **ERLEDIGT** | ActuatorCard.vue `getRulesForActuator` + `getLastExecutionForActuator` |
| Stale-Basis-Visualisierung (opacity, badge) | Phase 0/1 | **ERLEDIGT** | SensorCard.vue Zeilen 391-408 |

---

## H: Offene Entscheidungen (fuer Robin)

### H1: Debounce-Wert (Phase 2.3)
300ms ist ein Standard-Wert. Alternativen:
- **200ms:** Schnelleres UI-Update, aber mehr Recomputes
- **500ms:** Weniger Recomputes, aber Alarm-Verzoegerung spuerbar
- **Frage:** Reicht 300ms oder soll es konfigurierbar sein?

### H2: Stale-Verstaerkung Umfang (Phase 4.4)
- **Option A:** Nur CSS-Ergaenzung (Sparkline + Trend dimmen) — 15min
- **Option B:** Zusaetzlich Border-Verstaerkung (von 25% auf 50% Opacity) — 15min
- **Option C:** Gar nichts aendern — aktueller Stand reicht
- **Frage:** Welche Option bevorzugst du?

### H3: "Keine Subzone" Label (Phase 4.5)
Aktuelles Label: `'Keine Subzone'`. Alternativen:
- `'Unzugeordnet'` (impliziert "bitte zuordnen")
- `'Allgemein'` (neutral)
- `'Ohne Subzone'` (neutral)
- **Frage:** Soll das Label geaendert werden?

### H4: Accordion Smart-Default Timing (Phase 4.1)
`zoneSensorGroup` ist beim initialen `loadAccordionState()` moeglicherweise noch `null` (API laed noch). Zwei Loesungen:
- **Option A:** Zweiter Watch der Smart-Defaults nachtraeglich appliziert — etwas komplex
- **Option B:** `nextTick()` im Watch abwarten — einfacher, aber fragil
- **Frage:** Bevorzugst du Option A oder B?

### H5: Resolver komplett entfernen? (Phase 4.3)
Wenn `getZoneMonitorData` immer zuverlaessig funktioniert, koennte der Resolver komplett entfernt werden statt nur lazy gemacht. Das wuerde ~100 Zeilen Code eliminieren.
- **Frage:** Soll der Resolver als Fallback erhalten bleiben oder komplett entfernt werden?
