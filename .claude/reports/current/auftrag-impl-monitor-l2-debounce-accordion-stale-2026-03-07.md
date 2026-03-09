# Auftrag: Monitor L2 Verfeinerung — Debounce + Accordion + Stale + Keine-Subzone

> **Erstellt:** 2026-03-07
> **Ziel-Repo:** auto-one
> **Typ:** Implementierung (4 Items, alle in MonitorView.vue + SensorCard.vue)
> **Prioritaet:** HOCH — Rundet Monitor L2 ab
> **Aufwand:** ~2.5h gesamt
> **Abhaengigkeit:** Phase 0 + Phase 1 + Phase 3 muessen ERLEDIGT sein
> **Grundlage:** Analyse-Report `PHASE23_PHASE4_ANALYSE_MONITOR_L2_VERFEINERUNG_2026-03-07.md`

---

## Systemkontext

AutomationOne hat 3 Schichten: **El Trabajante** (ESP32 Firmware), **El Servador** (FastAPI Backend), **El Frontend** (Vue 3 + TypeScript). Dieser Auftrag betrifft ausschliesslich **El Frontend**.

### Monitor L2 = Read-Only Zone-Detail-Ansicht

Route: `/monitor/:zoneId`. Zeigt Sensoren und Aktoren einer Zone in Subzone-Accordions. Monitor = Beobachten + Verstehen. Kein Toggle, keine Konfiguration.

### Relevante Dateien

| Datei | Pfad | Rolle |
|-------|------|-------|
| MonitorView.vue | `El Frontend/src/views/MonitorView.vue` | Hauptdatei — L1 + L2 in einer View |
| SensorCard.vue | `El Frontend/src/components/devices/SensorCard.vue` | Sensor-Karte mit Sparkline + Trend |
| useZoneGrouping.ts | `El Frontend/src/composables/useZoneGrouping.ts` | Subzone-Gruppierung |

---

## Was NICHT gemacht wird

- Keine Backend-Aenderungen
- Keine neuen Dateien erstellen
- Keine Aenderungen an ActuatorCard.vue, logic.store.ts, dashboard.store.ts
- Keine Router-Aenderungen (das macht der zweite Auftrag)
- Keine useSubzoneResolver-Aenderungen (das macht der zweite Auftrag)
- Kein Refactoring von bestehendem funktionierendem Code

---

## Item 1: zoneKPIs Debounce (Phase 2.3) — ~1h

### Problem

Das `zoneKPIs` Computed (MonitorView.vue, ca. Zeile 928-1024) berechnet KPIs fuer alle Zone-Tiles auf L1 (Sensor-Count, Alarm-Count, Health-Status, Aggregation). Es reagiert direkt auf `espStore.devices` — jedes WebSocket `sensor_data`-Event triggert eine vollstaendige Neuberechnung ueber alle Devices, Sensoren und Zonen.

**Gemessene Kosten:** ~60-100ms pro Recompute bei 20 Devices mit 10 Sensoren. Bei 50 Sensoren @10s Intervall = ~5 Events/Sekunde = ~5 Recomputes/Sekunde. Das kann die UI bei hoher Last blockieren.

**Teuerster Teil:** `aggregateZoneSensors()` (importiert aus `sensorDefaults.ts`) ruft intern `groupSensorsByBaseType()` auf — verschachtelte Iteration ueber Devices und Sensors pro Zone.

### IST-Zustand (verifiziert)

```typescript
// MonitorView.vue ca. Zeile 928
const zoneKPIs = computed<ZoneKPI[]>(() => {
  const groups = groupDevicesByZone(espStore.devices)
  // ... ~90 Zeilen Berechnung ...
  return kpis
})
```

Das `ZoneKPI` Interface (ca. Zeile 866-885):
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

Template-Nutzung: `v-for="zone in zoneKPIs"` im L1-Bereich (ca. Zeile 1566).

### SOLL

Das `zoneKPIs` Computed wird durch einen debounced Mechanismus ersetzt: Bei schnellen aufeinanderfolgenden WS-Events wird die Berechnung hoechstens einmal pro 300ms ausgefuehrt. Die Template-Nutzung (`v-for="zone in zoneKPIs"`) bleibt unveraendert.

### Implementierung

**Schritt 1a:** Den Body des bestehenden `computed<ZoneKPI[]>` in eine eigene Funktion extrahieren:

```typescript
// MonitorView.vue — bestehenden computed-Body extrahieren
function computeZoneKPIs(): ZoneKPI[] {
  // ... exakt der bisherige computed-Body, unveraendert ...
}
```

**Schritt 1b:** Das `computed` durch ein `ref` + debounced `watch` ersetzen:

```typescript
const zoneKPIs = ref<ZoneKPI[]>([])
let kpiDebounceTimer: ReturnType<typeof setTimeout> | null = null

// Initialer Compute (sofort, kein Debounce)
zoneKPIs.value = computeZoneKPIs()

// Debounced Re-Compute bei Daten-Aenderungen
watch(
  () => espStore.devices,
  () => {
    if (kpiDebounceTimer) clearTimeout(kpiDebounceTimer)
    kpiDebounceTimer = setTimeout(() => {
      zoneKPIs.value = computeZoneKPIs()
    }, 300)
  },
  { deep: false }
)

// Sofortiger Re-Compute bei Zone-Aenderungen (selten, soll nicht verzoegert werden)
watch(allZones, () => {
  zoneKPIs.value = computeZoneKPIs()
})
```

**Warum `deep: false`:** `espStore.devices` ist ein Array — Vue erkennt Array-Mutationen (push, splice) ohne deep Watch. Der Watch triggert bei jeder Referenz-Aenderung des Arrays. Wenn der Store stattdessen Properties auf bestehenden Objekten mutiert (z.B. `device.sensors[0].raw_value = 42`), muss `deep: true` bleiben — dann ist der Debounce umso wichtiger. **Pruefen:** Wie aktualisiert `espStore` Sensor-Werte? Wenn via Object-Mutation → `deep: true` verwenden.

**Schritt 1c:** Cleanup im `onUnmounted`:

```typescript
onUnmounted(() => {
  if (kpiDebounceTimer) clearTimeout(kpiDebounceTimer)
})
```

### Kein bestehendes Debounce-Pattern im Projekt

Das Projekt hat KEIN `lodash.throttle` oder `lodash.debounce`. Das naechste Pattern ist `useQueryFilters.ts` mit manuellem `setTimeout`/`clearTimeout` und 300ms Default. Der hier vorgeschlagene Ansatz ist konsistent mit diesem Muster.

### Akzeptanzkriterien

- [ ] `zoneKPIs` ist ein `ref<ZoneKPI[]>` statt `computed<ZoneKPI[]>`
- [ ] Berechnung wird bei schnellen WS-Events hoechstens 1x/300ms ausgefuehrt
- [ ] Initialer Load zeigt KPIs sofort (kein 300ms Delay beim Seitenaufruf)
- [ ] Zone-CRUD-Events (allZones Watch) loesen sofortige Neuberechnung aus (kein Debounce)
- [ ] Template `v-for="zone in zoneKPIs"` funktioniert weiterhin unveraendert
- [ ] Timer wird bei Component-Unmount aufgeraeumt
- [ ] L1 Zone-Tiles aktualisieren sich innerhalb 300ms nach Sensor-Event (manueller Test)

---

## Item 2: Accordion Smart-Defaults (Phase 4.1) — ~30min

### Problem

Wenn eine Zone viele Subzonen hat (>4), sind aktuell alle Accordion-Sektionen offen — das erzeugt Informationsueberflutung. Ein bestehender Kommentar (ca. Zeile 1263) erwaehnt die ≤4-Regel, aber der Code implementiert sie nicht: `collapsedSubzones.value = new Set()` → alle offen.

### IST-Zustand (verifiziert)

**Accordion-State-Management in MonitorView.vue:**

```typescript
// ca. Zeile 1255
const collapsedSubzones = ref<Set<string>>(new Set())

// ca. Zeile 1257-1269
function loadAccordionState(zoneId: string) {
  try {
    const stored = localStorage.getItem(`ao-monitor-subzone-collapse-${zoneId}`)
    if (stored) {
      collapsedSubzones.value = new Set(JSON.parse(stored))
    } else {
      // Default: all expanded if ≤4 subzones, else only first expanded
      collapsedSubzones.value = new Set()  // <-- IGNORIERT den Kommentar
    }
  } catch {
    collapsedSubzones.value = new Set()
  }
}

// ca. Zeile 1282-1283
function isSubzoneExpanded(key: string): boolean {
  return !collapsedSubzones.value.has(key)
}
```

**Invertierte Logik:** Das Set speichert COLLAPSED Keys. Leeres Set = alle offen.

**Subzone-Key-Format:** `getSubzoneKey(zoneId, subzoneId)` — vermutlich `"${zoneId}-${subzoneId}"` oder aehnlich. Im Template genutzt fuer Sensoren-Accordions (ca. Zeile 1748-1908) und Aktoren-Accordions (ca. Zeile 1910-1959).

**SUBZONE_NONE:** `'__none__'` (useZoneGrouping.ts Zeile 100) — Sensoren/Aktoren ohne Subzone-Zuordnung. Wird als `subzoneId: null` im SubzoneGroup-Interface zurueckgegeben.

### SOLL

Die ≤4-Regel wird implementiert:
- **≤4 benannte Subzonen:** Alle Accordions offen (aktuelles Verhalten, behalten)
- **>4 benannte Subzonen:** Nur die erste benannte Subzone und "Keine Subzone" offen, Rest zugeklappt
- **localStorage hat Vorrang:** Wenn der User selbst Accordions geoeffnet/geschlossen hat (localStorage existiert), wird der Smart-Default NICHT angewendet
- **"Keine Subzone" zaehlt NICHT** fuer die ≤4-Schwelle, bleibt aber IMMER offen

### Implementierung

**Schritt 2a:** Den `else`-Zweig in `loadAccordionState()` ersetzen:

```typescript
function loadAccordionState(zoneId: string) {
  try {
    const stored = localStorage.getItem(`ao-monitor-subzone-collapse-${zoneId}`)
    if (stored) {
      collapsedSubzones.value = new Set(JSON.parse(stored))
      return
    }
  } catch {
    // Fall through to smart defaults
  }

  // Smart-Defaults anwenden
  applySmartDefaults(zoneId)
}
```

**Schritt 2b:** Eigene Funktion `applySmartDefaults()`:

```typescript
function applySmartDefaults(zoneId: string) {
  const sensorSubzones = zoneSensorGroup.value?.subzones ?? []
  const actuatorSubzones = zoneActuatorGroup.value?.subzones ?? []

  // Alle einzigartigen benannten Subzone-IDs zaehlen (ohne "Keine Subzone")
  const namedSubzoneIds = new Set<string>()
  for (const s of sensorSubzones) {
    if (s.subzoneId !== null) namedSubzoneIds.add(s.subzoneId)
  }
  for (const s of actuatorSubzones) {
    if (s.subzoneId !== null) namedSubzoneIds.add(s.subzoneId)
  }

  if (namedSubzoneIds.size <= 4) {
    // Wenige Subzonen → alle offen
    collapsedSubzones.value = new Set()
    return
  }

  // Viele Subzonen → nur erste benannte + "Keine Subzone" offen
  const firstNamedId = sensorSubzones.find(s => s.subzoneId !== null)?.subzoneId
    ?? actuatorSubzones.find(s => s.subzoneId !== null)?.subzoneId

  const collapsed = new Set<string>()
  for (const subzone of sensorSubzones) {
    if (subzone.subzoneId === null) continue  // "Keine Subzone" bleibt offen
    if (subzone.subzoneId === firstNamedId) continue  // Erste bleibt offen
    collapsed.add(getSubzoneKey(zoneId, subzone.subzoneId))
  }
  for (const subzone of actuatorSubzones) {
    if (subzone.subzoneId === null) continue
    if (subzone.subzoneId === firstNamedId) continue
    collapsed.add(getSubzoneKey(zoneId, subzone.subzoneId))
  }

  collapsedSubzones.value = collapsed
}
```

**Schritt 2c:** Timing-Problem loesen — `zoneSensorGroup` kann beim initialen `loadAccordionState()` noch `null` sein (API-Daten laden noch). Zweiter Watch der Smart-Defaults nachtraeglich appliziert:

```typescript
// Einmalig Smart-Defaults applizieren wenn Daten verfuegbar werden
// und kein localStorage existiert
const smartDefaultsApplied = ref(false)

watch(
  [zoneSensorGroup, zoneActuatorGroup],
  () => {
    if (smartDefaultsApplied.value) return
    if (!selectedZoneId.value) return
    if (!zoneSensorGroup.value && !zoneActuatorGroup.value) return

    // Nur applizieren wenn kein localStorage vorhanden
    const stored = localStorage.getItem(
      `ao-monitor-subzone-collapse-${selectedZoneId.value}`
    )
    if (stored) {
      smartDefaultsApplied.value = true
      return
    }

    applySmartDefaults(selectedZoneId.value)
    smartDefaultsApplied.value = true
  }
)

// Reset bei Zone-Wechsel
watch(selectedZoneId, () => {
  smartDefaultsApplied.value = false
})
```

### Akzeptanzkriterien

- [ ] Zone mit ≤4 benannten Subzonen: Alle Accordions offen beim ersten Besuch
- [ ] Zone mit >4 benannten Subzonen: Nur erste Subzone + "Keine Subzone" offen
- [ ] localStorage-Werte haben Vorrang ueber Smart-Defaults
- [ ] "Keine Subzone" zaehlt NICHT fuer die ≤4-Schwelle
- [ ] "Keine Subzone" ist IMMER offen (unabhaengig von Smart-Default)
- [ ] Bei Zone-Wechsel wird Smart-Default fuer neue Zone korrekt angewendet
- [ ] Kein Flackern: Accordions springen nicht von "alle offen" zu "Smart-Default" sichtbar um

---

## Item 3: Stale-Verstaerkung fuer Sparkline + Trend (Phase 4.4) — ~15min

### Problem

SensorCards mit `sensor-card--stale` (>120s ohne Update) werden mit `opacity: 0.7` und gelbem Border gedimmt. Seit Phase 3 haben SensorCards aber Sparkline und Trend-Pfeil — diese werden NICHT separat gedimmt und bleiben visuell praesent, obwohl die Daten veraltet sind.

### IST-Zustand (verifiziert)

```css
/* SensorCard.vue ca. Zeile 391-398 */
.sensor-card--stale {
  opacity: 0.7;
  border-color: rgba(251, 191, 36, 0.25);
}
.sensor-card--stale .sensor-card__number {
  color: var(--color-text-secondary);
}
```

Phase 3 hat den Sparkline-Slot befuellt und einen Trend-Pfeil hinzugefuegt — aber keine Stale-Styles fuer diese neuen Elemente ergaenzt.

### SOLL

Sparkline und Trend-Pfeil werden bei stale Cards zurueckgenommen, damit veraltete Trend-Informationen nicht als aktuell missverstanden werden.

### Implementierung

**SensorCard.vue — nach dem bestehenden `.sensor-card--stale` Block hinzufuegen:**

```css
/* Sparkline bei stale: zuruecknehmen damit veralteter Trend nicht taeuscht */
.sensor-card--stale .sensor-card__sparkline {
  opacity: 0.5;
  filter: saturate(0.3);
}

/* Trend-Pfeil bei stale: zuruecknehmen */
.sensor-card--stale .sensor-card__trend {
  opacity: 0.5;
}
```

**WICHTIG:** Die CSS-Klassen `.sensor-card__sparkline` und `.sensor-card__trend` muessen auf den entsprechenden Elementen im Template existieren. **Pruefen:** Haben die Sparkline- und Trend-Elemente in SensorCard.vue diese Klassen? Wenn nicht, muessen die Klassen im Template hinzugefuegt werden.

### Akzeptanzkriterien

- [ ] Stale SensorCard: Sparkline-Chart hat reduzierte Opacity (0.5) und entsaettigte Farben
- [ ] Stale SensorCard: Trend-Pfeil hat reduzierte Opacity (0.5)
- [ ] Nicht-stale SensorCards: Sparkline und Trend-Pfeil zeigen volle Farben
- [ ] ESP-offline Cards: Verhalten unveraendert (eigenes CSS-Klasse hat Vorrang)

---

## Item 4: "Keine Subzone" visuell abheben (Phase 4.5) — ~30min

### Problem

Sensoren und Aktoren ohne Subzone-Zuordnung erscheinen unter "Keine Subzone" in den Accordion-Sektionen. Aktuell sieht dieser Bereich **optisch identisch** aus wie benannte Subzonen — gleiche CSS-Klasse `monitor-subzone`, gleicher Border, gleicher Hintergrund. Der User kann nicht auf einen Blick erkennen welche Sensoren noch keinem Bereich zugeordnet sind.

### IST-Zustand (verifiziert)

**Sensoren-Accordion (ca. Zeile 1751-1754):**
```vue
<div
  v-for="subzone in zoneSensorGroup.subzones"
  :key="subzone.subzoneId ?? '__none__'"
  class="monitor-subzone"
>
```

**Aktoren-Accordion (ca. Zeile 1914-1917):**
```vue
<div
  v-for="subzone in zoneActuatorGroup.subzones"
  :key="subzone.subzoneId ?? '__none__'"
  class="monitor-subzone"
>
```

**Label:** `{{ subzone.subzoneName || 'Keine Subzone' }}` (Zeilen 1783, 1928)

**Visueller Unterschied zu benannten Subzonen:** KEINER

### SOLL

"Keine Subzone" Bereiche heben sich visuell ab: dashed Border-Left (signalisiert "unvollstaendig/temporaer"), leicht anderer Hintergrund. Der Stil signalisiert dem User: "Diese Sensoren sind noch keinem Bereich zugeordnet — du koenntest sie einer Subzone zuweisen."

### Implementierung

**Schritt 4a:** `:class` Binding auf beiden Accordion-Containern:

```vue
<!-- Sensoren: ca. Zeile 1754 -->
<div
  v-for="subzone in zoneSensorGroup.subzones"
  :key="subzone.subzoneId ?? '__none__'"
  :class="['monitor-subzone', { 'monitor-subzone--unassigned': subzone.subzoneId === null }]"
>

<!-- Aktoren: ca. Zeile 1917 -->
<div
  v-for="subzone in zoneActuatorGroup.subzones"
  :key="subzone.subzoneId ?? '__none__'"
  :class="['monitor-subzone', { 'monitor-subzone--unassigned': subzone.subzoneId === null }]"
>
```

**Schritt 4b:** CSS-Klasse im `<style scoped>` Block von MonitorView.vue:

```css
.monitor-subzone--unassigned {
  border-left: 2px dashed var(--color-warning, rgba(251, 191, 36, 0.4));
  background: rgba(251, 191, 36, 0.03);
  border-radius: var(--radius-sm, 6px);
  padding-left: var(--space-3, 12px);
}

.monitor-subzone--unassigned .monitor-subzone__header {
  color: var(--color-text-secondary);
  font-style: italic;
}
```

**Farbwahl:** Gelb/Orange (Warning-Farbe) signalisiert "Achtung, unvollstaendig" — konsistent mit der Stale-Farbe. Opacity 0.03 ist subtil genug um nicht zu stoeren, aber sichtbar genug um den Unterschied zu erkennen.

### Akzeptanzkriterien

- [ ] "Keine Subzone" Bereiche haben sichtbar anderen Stil als benannte Subzonen (dashed Border, Hintergrund)
- [ ] Gilt fuer BEIDE Sektionen (Sensoren und Aktoren)
- [ ] Benannte Subzonen bleiben visuell unveraendert
- [ ] Label "Keine Subzone" ist leicht kursiv und in Sekundaerfarbe
- [ ] Bei Dark-Mode/Light-Mode-Wechsel (falls vorhanden): Farben bleiben lesbar

---

## Reihenfolge der Implementierung

```
1. Item 1 (zoneKPIs Debounce)     — ~1h, unabhaengig, groesste Aenderung
2. Item 2 (Accordion Smart-Defaults) — ~30min, benoetigt korrekte zoneSensorGroup
3. Item 4 ("Keine Subzone")         — ~30min, trivial, kann parallel zu Item 2
4. Item 3 (Stale CSS)               — ~15min, trivial, kann jederzeit
```

Items 2-4 koennen parallel implementiert werden. Item 1 sollte zuerst erledigt werden weil es die groesste strukturelle Aenderung ist (computed → ref + watch).

---

## Gesamte Akzeptanzkriterien

- [ ] Alle Einzelkriterien der 4 Items erfuellt
- [ ] Bestehende Tests laufen weiterhin gruen (keine Regression)
- [ ] Keine TypeScript-Fehler (`npm run type-check`)
- [ ] Keine neuen Dateien erstellt
- [ ] Keine Aenderungen an Dateien ausserhalb von MonitorView.vue und SensorCard.vue
- [ ] L2 Monitor ist weiterhin vollstaendig Read-Only (kein Toggle, keine Konfiguration)
- [ ] Visueller Test: Zone mit >4 Subzonen zeigt Smart-Defaults korrekt
- [ ] Visueller Test: Stale SensorCard zeigt gedimmte Sparkline + Trend
- [ ] Visueller Test: "Keine Subzone" ist optisch unterscheidbar
