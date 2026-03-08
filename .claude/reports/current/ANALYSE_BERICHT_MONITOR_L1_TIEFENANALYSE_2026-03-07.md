# Analyse-Bericht: Monitor L1 Tiefenanalyse

> **Datum:** 2026-03-07
> **Scope:** Monitor Level 1 (`/monitor`, kein `zoneId`)
> **Datei:** `El Frontend/src/views/MonitorView.vue` (ca. 2960 Zeilen)
> **Status:** IST-Stand-Bestandsaufnahme (kein Code, nur Analyse)

---

## 1. Executive Summary

Monitor L1 ist funktional solide implementiert. Zone-Tiles mit Status-Ampel (ok/warning/alarm), aggregierten KPIs via `aggregateZoneSensors()`, ESP-Count "X/Y online", ActiveAutomationsSection mit Top-5-Regeln, Cross-Zone-Dashboard-Chips und Inline-Panels sind vorhanden und folgen weitgehend den Design-Prinzipien.

**Die 3 wichtigsten Befunde:**

1. **Keine Loading States auf L1** (P1): Weder Zone-Tiles noch ActiveAutomationsSection zeigen Skeletons/Spinner waehrend des initialen Ladens. Bei langsamer Verbindung sieht der User leere Seite oder Empty State bevor Daten ankommen.
2. **Keine Error States auf L1** (P1): Wenn `espStore.fetchAll()` fehlschlaegt, wird kein Fehler angezeigt. Der Empty State "Keine Zonen mit Geraeten vorhanden" erscheint faelschlicherweise.
3. **Zone-Tiles fehlende :focus-visible** (P2): Zone-Tiles sind klickbar (`cursor: pointer`, `@click`) aber haben kein `:focus-visible` Outline und sind `<div>` statt `<button>` — Keyboard-Accessibility fehlt.

---

## 2. Sektionen-Inventar (Block A.2)

### L1-Bereich: Zeilen 1415–1561 in MonitorView.vue

Bedingung: `v-if="!isZoneDetail"` (Zeile 1415), wobei `isZoneDetail = computed(() => !!selectedZoneId.value)` (Zeile 86).

| # | Sektion | Zeilen | Komponente / HTML | v-if / v-else Bedingung | Datenquelle |
|---|---------|--------|-------------------|------------------------|-------------|
| 1 | L1 Header (System Summary) | 1417–1430 | `<div class="monitor-l1-header">` | (immer sichtbar auf L1) | `systemSummary` computed (aus `zoneKPIs`) |
| 2 | Empty State (0 Zonen) | 1433–1436 | `<div class="monitor-view__empty">` | `v-if="zoneKPIs.length === 0"` | `zoneKPIs` computed |
| 3 | Zone-Tiles Grid | 1439–1503 | `<div class="monitor-zone-grid">` | `v-else` (zoneKPIs.length > 0) | `zoneKPIs` computed |
| 4 | Aktive Automatisierungen | 1506 | `<ActiveAutomationsSection />` | (keine Bedingung, immer auf L1) | `logicStore.enabledRules` |
| 5 | Dashboard Overview Card | 1509–1552 | `<section class="monitor-dashboard-card">` | `v-if="dashStore.crossZoneDashboards.length > 0"` | `dashStore.crossZoneDashboards` |
| 6 | Inline Dashboard Panels | 1555–1560 | `<InlineDashboardPanel>` (v-for) | (immer, falls Panels existieren) | `dashStore.inlineMonitorPanels` |

### IST vs. SOLL DOM-Reihenfolge

| SOLL | IST | Match |
|------|-----|-------|
| 1. Zonen-Kacheln | 1. L1 Header + Zone-Tiles (1417–1503) | Ja (Header ist Ergaenzung) |
| 2. Aktive Automatisierungen | 2. ActiveAutomationsSection (1506) | Ja |
| 3. Cross-Zone-Dashboards | 3. Dashboard Overview Card (1509) | Ja |
| 4. "Dashboards (N)"-Karte | (integriert in Dashboard Overview Card) | Ja (zusammengefasst) |
| 5. Inline-Panels | 4. InlineDashboardPanel (1555) | Ja |

**Ergebnis:** DOM-Reihenfolge entspricht dem SOLL. Die "Dashboards (N)"-Karte und Cross-Zone-Dashboards sind in einer einzigen `<section>` zusammengefasst (Dashboard Overview Card mit Chips).

---

## 3. Zone-Tile-Datenfluss

### 3.1 ZoneKPI Interface (Zeile 808–827, MonitorView.vue)

```typescript
type ZoneHealthStatus = 'ok' | 'warning' | 'alarm'  // Zeile 806

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
  healthStatus: ZoneHealthStatus
  healthReason: string
  onlineDevices: number
  totalDevices: number
}
```

**Kein separates Interface-File** — ZoneKPI ist inline in MonitorView.vue definiert (nicht in `types/`).

### 3.2 Datenfluss

```
espStore.devices (ref<ESPDevice[]>)
    |
    v
groupDevicesByZone(espStore.devices)  ← aus useZoneDragDrop composable
    |
    v
zoneKPIs computed (Zeile 865–939) — filtert ZONE_UNASSIGNED aus, iteriert pro Zone:
    |
    ├─ sensorCount: sensors.length pro device
    ├─ activeSensors: sensors.filter(s => s.quality !== 'error' && s.quality !== 'stale').length
    ├─ alarmCount: sensors.filter(s => s.quality === 'error' || s.quality === 'bad').length
    ├─ onlineDevices: getESPStatus(device) === 'online' || 'stale'
    ├─ aggregation: aggregateZoneSensors(group.devices)  ← aus sensorDefaults.ts
    ├─ lastActivity: newest sensor.last_read/last_reading_at (with timestamp sanity check)
    └─ healthStatus: getZoneHealthStatus(...)
```

### 3.3 Berechnung der Kernfelder

**`activeSensors`** (Zeile 885):
```typescript
activeSensors += sensors.filter(s => s.quality !== 'error' && s.quality !== 'stale').length
```
Basiert auf `quality`-Feld des Sensors, NICHT auf Timestamp-Alter. Alle Qualitaeten ausser `error` und `stale` gelten als aktiv.

**`alarmCount`** (Zeile 887):
```typescript
alarmCount += sensors.filter(s => s.quality === 'error' || s.quality === 'bad').length
```
Zaehlt Sensoren mit Quality `error` ODER `bad`. Kein Schwellwert-System — rein quality-basiert.

**`onlineDevices`** (Zeile 891–893):
```typescript
const status = getESPStatus(device as any)
if (status === 'online' || status === 'stale') onlineDevices++
```
Nutzt `getESPStatus()` aus `useESPStatus.ts`. Logik (Zeile 77–107):
- `device.status === 'online'` oder `device.connected === true` → online
- Heartbeat-Alter < 90s → online, < 300s → stale, > 300s → offline
- `stale` zaehlt als "online" fuer ESP-Count (konservativ)

**`avgTemperature` / `avgHumidity`:** Nicht als eigene Felder vorhanden. Stattdessen: `aggregation` (via `aggregateZoneSensors()`) liefert pro Sensor-Typ (temp, humidity, etc.) einen Durchschnittswert. Die Anzeige erfolgt ueber `formatAggregatedValue(st, deviceCount)`.

### 3.4 Status-Ampel (Zeile 831–863)

`getZoneHealthStatus()` bestimmt den Status:

| Status | Bedingung |
|--------|-----------|
| `alarm` | Alle Devices offline (totalDevices > 0 && onlineDevices === 0) ODER keine Sensoren aktiv (sensorCount > 0 && activeSensors === 0) |
| `warning` | Teilweise Devices offline, ODER alarmCount > 0, ODER teilweise Sensoren inaktiv, ODER emergency_stopped Actuators |
| `ok` | Alles in Ordnung |

**Visuelle Darstellung (Zeile 1447–1454):**
- **Farb-Border:** `border-left: 3px solid` in gruen/gelb/rot via Klasse `monitor-zone-tile--ok/warning/alarm`
- **Icon:** `CheckCircle2` (ok), `AlertTriangle` (warning), `XCircle` (alarm)
- **Text:** "Alles OK", "Warnung", "Alarm" via `HEALTH_STATUS_CONFIG`
- **Farbe:** `var(--color-success)`, `var(--color-warning)`, `var(--color-error)` via `.zone-status--ok/warning/alarm`

**Doppelte Kodierung: Ja — Farbe + Icon + Text.** Erfuellt das Design-Prinzip vollstaendig.

**Health Reason** (Zeile 1457–1459): Bei warning/alarm wird ein erklaerrender Text angezeigt (z.B. "2 Geraete offline", "3 Sensoren fehlerhaft").

### 3.5 Stale-Check auf Zone-Tiles

**Vorhanden:** Ja (Zeile 1497–1499, Funktion `isZoneStale` Zeile 942–949).

```typescript
function isZoneStale(lastActivity: string | null): boolean {
  if (!lastActivity) return true
  const age = Date.now() - new Date(lastActivity).getTime()
  return age > ZONE_STALE_THRESHOLD_MS  // 60000ms = 60s
}
```

Visuell: `monitor-zone-tile__activity--stale` setzt `color: var(--color-warning)` (gelb).
Anzeige: Clock-Icon + `formatRelativeTime(zone.lastActivity)` bzw. "Keine Daten".

**Befund:** Stale-Indikator existiert, aber nur auf der `lastActivity`-Zeile im Footer. Kein gelbes Highlight auf der gesamten Tile oder im KPI-Bereich. Ist dezent aber vorhanden.

### 3.6 Klick-Verhalten (Zeile 1444)

```html
<div ... @click="goToZone(zone.zoneId)">
```
```typescript
function goToZone(zoneId: string) {
  router.push({ name: 'monitor-zone', params: { zoneId } })
}
```
`cursor: pointer` im CSS (Zeile 2296). Navigiert via `router.push`.

**Befund:** Zone-Tiles sind `<div>` mit `@click`, NICHT `<button>`. Fehlendes `:focus-visible`, nicht per Keyboard tabbbar. **Accessibility-Luecke.**

### 3.7 Responsive Grid (Zeile 2278–2289)

```css
.monitor-zone-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--space-4);
  margin-bottom: var(--space-10);
}

@media (max-width: 639px) {
  .monitor-zone-grid { grid-template-columns: 1fr; }
}
```

| Viewport | Verhalten |
|----------|-----------|
| < 640px | 1 Spalte |
| 640–559px | auto-fill, minmax 280px |
| >= 1280px | 4+ Spalten moeglich |

---

## 4. ActiveAutomationsSection (Block A.4)

**Datei:** `El Frontend/src/components/monitor/ActiveAutomationsSection.vue` (224 Zeilen)

### 4.1 Komponenten-Interface

- **Props:** Keine
- **Emits:** Keine
- **Stores:** `useLogicStore()` (shared/stores/logic.store.ts)
- **Router:** `useRouter()` fuer Navigation

### 4.2 topRules Computed (Zeile 22–34)

```typescript
const topRules = computed<LogicRule[]>(() => {
  const enabled = logicStore.enabledRules  // computed: rules.filter(r => r.enabled)
  const sorted = [...enabled].sort((a, b) => {
    // 1. Fehler zuerst (last_execution_success === false → 0, sonst 1)
    const aErr = a.last_execution_success === false ? 0 : 1
    const bErr = b.last_execution_success === false ? 0 : 1
    if (aErr !== bErr) return aErr - bErr
    // 2. Priority (aufsteigend)
    const aPrio = a.priority ?? 0
    const bPrio = b.priority ?? 0
    if (aPrio !== bPrio) return aPrio - bPrio
    // 3. Name (alphabetisch)
    return (a.name || '').localeCompare(b.name || '')
  })
  return sorted.slice(0, MAX_DISPLAYED)  // MAX_DISPLAYED = 5
})
```

**Edge Case:** `last_execution_success === undefined` wird NICHT als Fehler behandelt (nur `=== false` ist Fehler). Korrekt.

### 4.3 Template-Struktur

- **Ueberschrift:** `"Aktive Automatisierungen ({{ enabledCount }})"` — dynamisches N
- **Container:** `<ul role="list">` mit `<li>` pro Regel — semantisch korrekt
- **Grid:** `class="monitor-card-grid"` mit Override: `grid-template-columns: repeat(auto-fill, minmax(min(200px, 100%), 1fr))`
- **RuleCardCompact Props:** `:rule="rule" :is-active="isRuleActive(rule.id)" :zone-names="logicStore.getZonesForRule(rule)"`
- **"Alle Regeln"-Link:** Bei <= 5 Regeln: "Alle Regeln". Bei > 5: "Alle {N} Regeln anzeigen"
- **Empty State:** Zap-Icon, "Keine aktiven Automatisierungen", Hint-Text, Button "Zum Regeln-Tab" → `/logic`

### 4.4 Initialisierung (Zeile 48–52)

```typescript
onMounted(() => {
  if (logicStore.rules.length === 0) {
    logicStore.fetchRules()
  }
})
```
Fetcht nur wenn Store leer. Kein Watch.

### 4.5 CSS-Klassen und Tokens

| Aspekt | Wert |
|--------|------|
| `margin-bottom` | `var(--space-10)` (40px) |
| Grid | `minmax(min(200px, 100%), 1fr)` — responsive safe |
| Link-Farbe | `var(--color-iridescent-2)` |
| Empty State BG | `var(--color-bg-secondary)` |
| Empty State Border | `1px dashed var(--glass-border)` |
| Focus-visible | `outline: 2px solid var(--color-iridescent-2)` auf Links |
| Font-Sizes | `var(--text-sm)` (12px), `var(--text-xs)` (11px) |

---

## 5. RuleCardCompact (Block A.5)

**Datei:** `El Frontend/src/components/logic/RuleCardCompact.vue` (293 Zeilen)

### 5.1 Props-Interface (Zeile 15–21)

```typescript
interface Props {
  rule: LogicRule
  isActive?: boolean       // Default: false
  zoneNames?: string[]     // Default: [] (via withDefaults)
}
```

### 5.2 Zone-Badge (Zeile 76–80)

```typescript
const zoneBadgeText = computed(() => {
  if (!props.zoneNames || props.zoneNames.length === 0) return '—'
  if (props.zoneNames.length <= 2) return props.zoneNames.join(', ')
  return `${props.zoneNames[0]} +${props.zoneNames.length - 1}`
})
```

**v-if Bedingung (Zeile 119):** `v-if="zoneNames !== undefined"` — Badge wird immer gezeigt wenn `zoneNames` Prop uebergeben wird (auch bei leerem Array → "—"). Auf L2 wird `zoneNames` NICHT uebergeben → kein Badge.

**CSS (Zeile 254–265):**
- `padding: 2px 8px`
- `border: 1px solid var(--glass-border)`
- `border-radius: var(--radius-sm)` (6px)
- `max-width: 140px` mit `text-overflow: ellipsis`
- `font-size: var(--text-xs)` (11px)
- `color: var(--color-text-muted)`
- `background: var(--color-bg-tertiary)`

### 5.3 Status-Indikatoren

| Indikator | Implementierung | CSS |
|-----------|-----------------|-----|
| **Fehler-Rand** | `rule-card-compact--error` bei `hasError` (Zeile 93) | `border-left: 3px solid var(--color-status-alarm)`, `border-color: rgba(248, 113, 113, 0.4)` |
| **Glow (Active)** | `rule-card-compact--active` bei `isActive` (Zeile 92) | `animation: rule-compact-flash 1.5s ease-out` (box-shadow green glow → fade) |
| **Status-Dot** | 8px circle, `--on/--off/--error` Klassen | `--on`: green + box-shadow, `--off`: muted, `--error`: red + box-shadow |
| **Status-Label** | "Aktiv"/"Deaktiviert"/"Fehler" (Zeile 109–111) | Farbkodiert via `--active/--disabled/--error` Klassen |
| **Error Icon** | `AlertCircle` bei `hasError` (Zeile 112–116) | 12px, `var(--color-status-alarm)` |
| **ARIA-live** | `aria-live="polite"` auf `<button>` (Zeile 96) | - |
| **aria-label** | Dynamisch: "Regel {name} oeffnen. Status: {label}." (Zeile 44–49) | - |
| **:focus-visible** | `outline: 2px solid var(--color-iridescent-2)`, `outline-offset: 2px` (Zeile 153–156) | Ja |
| **Transition auf Dot** | `transition: background-color var(--transition-fast), box-shadow var(--transition-fast)` (Zeile 194) | Ja |

### 5.4 Klick-Handler (Zeile 82–84)

```typescript
function navigateToRule() {
  router.push({ name: 'logic-rule', params: { ruleId: props.rule.id } })
}
```

### 5.5 Hardcoded Werte

| Stelle | Wert | Sollte Token sein? |
|--------|------|-------------------|
| Zeile 212 | `font-size: 12px` | Ja → `var(--text-sm)` |
| Zeile 222–224 | `font-size: 10px` | Evtl. → `var(--text-xs)` ist 11px |
| Zeile 268–269 | `font-size: 10px` | Evtl. |
| Zeile 282–284 | `font-size: 10px`, `gap: 4px` | Evtl. |
| Zeile 173–175 | `rgba(248, 113, 113, 0.4/0.6)` | Akzeptabel (dynamischer Opacity auf Status-Farbe) |
| Zeile 164–166 | `rgba(34, 197, 94, 0.4)` | Akzeptabel (Animation) |

---

## 6. API-Calls bei L1-Load (Block B.1)

### onMounted in MonitorView.vue (Zeile 737–746)

```typescript
onMounted(() => {
  if (espStore.devices.length === 0) {
    espStore.fetchAll()
  }
  if (selectedZoneId.value) {
    dashStore.breadcrumb.zoneName = selectedZoneName.value
  }
})
```

### Vollstaendige API-Call-Liste bei L1 Kalt-Load

| # | Endpoint | Store-Methode | Zeitpunkt | Bemerkung |
|---|----------|---------------|-----------|-----------|
| 1 | `GET /api/v1/debug/mock-esp` + `GET /api/v1/esp/devices` | `espStore.fetchAll()` | onMounted (wenn leer) | 2 parallele Calls (Mock + Real) |
| 2 | `GET /api/v1/logic/rules` | `logicStore.fetchRules()` | ActiveAutomationsSection.onMounted (wenn leer) | Nur wenn rules.length === 0 |
| 3 | `GET /api/v1/dashboards/layouts` | `dashStore.fetchLayouts()` | Store-Init (auto) | Automatisch beim Store-Erstellen |

**Gesamt: 3–4 API-Calls** (espStore macht 2 parallele Calls intern). Bei warmem Cache (Devices/Rules bereits geladen): 0–1 Calls (nur dashStore auto-sync).

### Aggregation: Frontend (Block B.2)

**Alle Aggregationen (avgTemperature, alarmCount, onlineDevices, healthStatus) werden komplett im Frontend berechnet** aus `espStore.devices`. Es gibt KEINEN speziellen L1-Aggregations-Endpoint. `aggregateZoneSensors()` berechnet Mittelwerte pro Sensor-Typ im Frontend.

---

## 7. WebSocket-Events auf L1 (Block B.3)

L1 selbst registriert KEINE eigenen WebSocket-Handler. Die Aktualisierung erfolgt indirekt:

| Event | Handler-Location | Auswirkung auf L1 |
|-------|-------------------|-------------------|
| `sensor_data` | `espStore` (WebSocket-Init) | `sensor.raw_value` + `quality` aktualisiert → `zoneKPIs` computed wird reaktiv neu berechnet |
| `esp_health` | `espStore` | Device-Status aktualisiert → `onlineDevices` in `zoneKPIs` aendert sich |
| `actuator_status` | `espStore` | Actuator-State → `activeActuators` in `zoneKPIs` |
| `logic_execution` | `logicStore` | `activeExecutions` Map + `last_execution_success` → `topRules` Sortierung, `isRuleActive()` Glow |

**Re-Render-Verhalten:** Bei jedem `sensor_data` Event wird das reaktive `devices` Array in espStore aktualisiert. Da `zoneKPIs` ein `computed` ist das von `espStore.devices` abhaengt, wird es bei JEDER Sensor-Aenderung komplett neu berechnet (alle Zonen, nicht nur betroffene). Das ist eine potenzielle Performance-Concern bei vielen Devices/Sensoren.

**Optimierungen vorhanden:** Keine. Kein `shallowRef`, kein `triggerRef`, kein gezieltes Update nur der betroffenen Zone.

---

## 8. Qualitaets-Tabellen (Block D)

### 8.1 Error States

| Bereich | Scenario | IST | SOLL | Abweichung |
|---------|----------|-----|------|------------|
| Zone-Tiles | fetchAll() schlaegt fehl | Kein Error State. Empty State "Keine Zonen" erscheint faelschlich | Fehler-Meldung mit Retry | **P1: Fehlt** |
| Zone-Tiles | 0 Zonen vorhanden | Empty State mit Activity-Icon + Text "Keine Zonen mit Geraeten vorhanden" | Empty State mit Link "Zone erstellen" | **P2: Kein Link zu /hardware** |
| ActiveAutomationsSection | fetchRules() schlaegt fehl | Kein Error State. Zeigt "Aktive Automatisierungen (0)" + Empty State | Fehler-Meldung | **P2: Fehlt** (aber benigne — zeigt Empty State) |
| Cross-Zone-Dashboards | 0 Dashboards | Sektion komplett ausgeblendet (`v-if`) | Korrekt: hidden | OK |
| Inline-Panels | Widget laesst sich nicht laden | Abhaengig von InlineDashboardPanel-Implementierung | Widget-Level Error | Nicht geprueft |

### 8.2 Loading States

| Bereich | Loading State vorhanden? | Wie? |
|---------|--------------------------|------|
| Zone-Tiles | **NEIN** | Kein Skeleton/Spinner waehrend espStore.fetchAll() |
| ActiveAutomationsSection | **NEIN** | Kein Indikator waehrend fetchRules() |
| Cross-Zone-Dashboards | **NEIN** | dashStore laedt synchron aus localStorage |

**Befund:** L1 hat KEINE Loading States. Bei kaltem Cache sieht der User fuer kurze Zeit den Empty State ("Keine Zonen...") bevor die Daten ankommen.

### 8.3 Performance

| Aspekt | IST |
|--------|-----|
| API-Calls bei Kalt-Load | 3–4 (akzeptabel) |
| zoneKPIs Recomputation | Bei JEDEM sensor_data WS-Event — komplett neu berechnet |
| shallowRef/triggerRef | Nicht genutzt |
| useSparklineCache auf L1? | Import vorhanden (Zeile 23), aber nicht auf L1 genutzt (nur L2 SensorCard Sparklines) |
| keep-alive | MonitorView in keep-alive `:include` — State bleibt bei Tab-Wechsel erhalten |

### 8.4 Ungenutzte/Veraltete Code-Pfade

| Befund | Datei | Zeile |
|--------|-------|-------|
| `console.warn` | MonitorView.vue | 688 — `fetchDetailStats` Fehler-Log (L3, nicht L1) |
| `useSparklineCache` Import | MonitorView.vue | 23 — auf L1 nicht genutzt, nur fuer L2 SensorCard |
| `useSwipeNavigation` Import | MonitorView.vue | 18 — nur fuer L2 Zone-Navigation |
| Keine `<!-- TODO -->` oder `<!-- FIXME -->` im L1-Bereich | - | - |

---

## 9. Klick-Pfad-Tabelle (Block E.2)

| Element | Klick-Ziel | Route-Name | Mechanismus | Existiert? |
|---------|-----------|------------|------------|------------|
| Zone-Tile | `/monitor/:zoneId` | `monitor-zone` | `router.push` via `goToZone()` | Ja |
| RuleCardCompact | `/logic/:ruleId` | `logic-rule` | `router.push` via `navigateToRule()` | Ja |
| "Alle Regeln"-Link | `/logic` | `logic` | `router.push` via `goToLogicTab()` | Ja |
| "Zum Regeln-Tab" (Empty State) | `/logic` | `logic` | `router.push` via `goToLogicTab()` | Ja |
| Dashboard-Chip Link | `/monitor/dashboard/:id` | `monitor-dashboard` | `<router-link>` | Ja |
| Dashboard-Chip Edit-Icon | `/editor/:dashboardId` | `editor-dashboard` | `<router-link>` | Ja |
| "+N weitere" Button | (expandiert Liste) | - | `showAllCrossZone = true` | Ja |
| "+" (Neues Dashboard) | `/editor` | `editor` | `<router-link>` | Ja |
| L1 Header Alarm-Text | Keine Navigation | - | - | Kein Klick-Handler |
| Empty State "Keine Zonen" | Keine Navigation | - | - | **Kein Link zu /hardware** |

### E.1 — L1 → L2 Uebergabe

- `goToZone(zone.zoneId)` → `router.push({ name: 'monitor-zone', params: { zoneId } })`
- `zoneId` kommt aus `ZoneKPI.zoneId` (= `group.zoneId` aus `groupDevicesByZone`)
- Kein shared State zwischen L1/L2 ausser espStore (Pinia statefulness)
- Keine localStorage-Persistenz der Zone-Auswahl
- URL ist die einzige State-Quelle (korrekt)

### E.3 — Dashboard-Editor-Integration

- `generateZoneDashboard()`: Nur auf L2 genutzt (Watch auf `selectedZoneId`, Zeile 1068)
- `claimAutoLayout()`: Nur auf L2 (Zone-Dashboards Sektion, Zeile 1380)
- L1 nutzt `crossZoneDashboards` (scope === 'cross-zone'), L2 nutzt `zoneDashboards(zoneId)` (scope === 'zone')

### E.4 — ViewTabBar Verhalten

ViewTabBar Tab "Monitor" zeigt immer Route `/monitor`. Klick auf Tab waehrend L2 navigiert zurueck zu L1 (weil Tab-Route `/monitor` != aktuelle Route `/monitor/:zoneId`).

---

## 10. SOLL-IST-Matrix

| # | Bereich | SOLL | IST | Abweichung | Prio |
|---|---------|------|-----|------------|------|
| 1 | DOM-Reihenfolge L1 | Zonen → Automations → Cross-Zone-Dashboards → Dashboards → Inline | Zonen → Automations → Dashboard-Card (Dashboards+Cross-Zone kombiniert) → Inline | Dashboard-Card fasst Cross-Zone und "Dashboards (N)" zusammen — kein Problem | P3 |
| 2 | Zone-Tile Status-Ampel | Doppelte Kodierung: Farbe + Text + Icon | Farbe (border-left) + Icon (CheckCircle2/AlertTriangle/XCircle) + Text ("Alles OK"/"Warnung"/"Alarm") + Health Reason | Vollstaendig | OK |
| 3 | Stale-Check auf Zone-Tiles | >60s → gelber Indikator | `isZoneStale()` mit Clock-Icon + gelber Text im Footer | Vorhanden, dezent | OK |
| 4 | API-Call-Anzahl | <=3 beim Kalt-Load | 3–4 (2x espStore parallel + 1 logicStore + 1 dashStore auto) | Akzeptabel | OK |
| 5 | Loading State Zone-Tiles | Skeleton/Spinner | Nicht vorhanden | **Fehlt** | P1 |
| 6 | Error State Zone-Tiles | Fehler + Retry | Nicht vorhanden | **Fehlt** | P1 |
| 7 | Zone-Tile Keyboard-Access | `<button>` oder `tabindex` + `:focus-visible` | `<div @click>` ohne Focus | **Fehlt** | P2 |
| 8 | Empty State Link | "Zone erstellen" → /hardware | Nur Text "Keine Zonen mit Geraeten vorhanden" | **Link fehlt** | P2 |
| 9 | 40px Abstand zwischen Sektionen | `var(--space-10)` auf allen Major Sections | Zone-Grid: `margin-bottom: var(--space-10)` Ja. ActiveAutomations: `margin-bottom: var(--space-10)` Ja. Dashboard-Card: `margin-bottom: var(--space-10)` Ja. Empty State: `margin-bottom: var(--space-10)` Ja. | Korrekt | OK |
| 10 | `ul/li` + `role="list"` auf Regel-Grid | Semantische Liste | `<ul role="list">` mit `<li>` in ActiveAutomationsSection | Korrekt | OK |
| 11 | Responsive Grid (min 200px) | `minmax(min(200px, 100%), 1fr)` | ActiveAutomationsSection: Ja. Zone-Grid: `minmax(280px, 1fr)` | Zone-Grid nutzt 280px statt 200px — absichtlich (Tiles brauchen mehr Platz) | OK |
| 12 | Zone-Badge Fallback "—" | Bei leerem `zoneNames` → "—" | `zoneBadgeText`: 0 Zonen → "—" | Korrekt | OK |
| 13 | ARIA-live auf RuleCardCompact | `aria-live="polite"` | Vorhanden (Zeile 96) | Korrekt | OK |
| 14 | :focus-visible auf Cards/Links | `outline: 2px solid var(--color-iridescent-2)` | RuleCardCompact: Ja. ActiveAutomations Links: Ja. Zone-Tiles: **NEIN** | **Teilweise** | P2 |
| 15 | Status-Dot Transition | `transition` auf background-color + box-shadow | Vorhanden auf RuleCardCompact (Zeile 194) | Korrekt | OK |
| 16 | ESP-Count "X/Y online" | In Zone-Tile Footer | `{{ zone.onlineDevices }}/{{ zone.totalDevices }} online` (Zeile 1482) | Korrekt | OK |
| 17 | Dashboard-Suffix | Bei Dopplungen eindeutig | `getDashboardNameSuffix()` — "(DD.MM.)" oder "#XXXXXX" | Vorhanden (nur auf L2 genutzt, L1 zeigt nur Cross-Zone) | OK |
| 18 | `getZonesForRule` | Ermittelt Zone-Namen via ESP-IDs | In logic.store.ts, nutzt `extractEspIdsFromRule` + `espStore.devices` Lookup | Korrekt | OK |
| 19 | zoneNames Prop auf RuleCardCompact | `string[]`, optional | `zoneNames?: string[]`, Default `[]` via `withDefaults` | Korrekt | OK |
| 20 | zoneKPIs Recomputation | Gezielt pro Zone | Komplett bei jedem `sensor_data` WS-Event | **Full recompute** | P2 |

---

## 11. Priorisierte Optimierungsliste

| # | Optimierung | Datei(en) | Aufwand | Prio | Begruendung |
|---|-------------|-----------|---------|------|-------------|
| 1 | Loading State fuer Zone-Tiles (Skeleton waehrend espStore.fetchAll) | MonitorView.vue | ~1h | P1 | 5-Sekunden-Regel: User sieht leere Seite bei Kalt-Load |
| 2 | Error State fuer Zone-Tiles (ErrorState + Retry bei fetchAll-Fehler) | MonitorView.vue | ~1h | P1 | Fehler wird verschluckt, Empty State taeuscht "keine Zonen" vor |
| 3 | Zone-Tiles als `<button>` oder `<div role="button" tabindex="0">` + `:focus-visible` | MonitorView.vue | ~0.5h | P2 | Keyboard-Accessibility |
| 4 | Empty State "Keine Zonen" um Link "Im Hardware-Tab Geraete zuweisen" ergaenzen | MonitorView.vue | ~0.5h | P2 | User weiss nicht wohin bei leerer L1 |
| 5 | Hardcoded `font-size: 12px` / `10px` in RuleCardCompact durch Token ersetzen | RuleCardCompact.vue | ~0.5h | P3 | Design-System-Compliance |
| 6 | `rgba(59, 130, 246, 0.06)` in `.monitor-dashboard-chip--more:hover` durch Token | MonitorView.vue:2887 | ~5min | P3 | Konsistenz |
| 7 | ZoneKPI Interface nach `types/monitor.ts` extrahieren | MonitorView.vue → types/monitor.ts | ~0.5h | P3 | Code-Organisation |
| 8 | Performance: `zoneKPIs` Recomputation bei WS-Events optimieren (z.B. Debounce) | MonitorView.vue | ~2h | P2 | Bei vielen Sensoren: jeden WS-Event → volle Neuberechnung aller Zonen |

---

## 12. Offene Fragen

1. **`aggregateZoneSensors()` Genauigkeit:** Die Funktion liegt in `sensorDefaults.ts`. Ihre exakte Gruppierungslogik (welche sensor_types werden zu welcher Kategorie aggregiert) wurde nicht im Detail geprueft. Annahme: funktioniert korrekt basierend auf vorherigen Implementierungs-Sessions.

2. **`useSparklineCache` Import:** Wird auf L1 importiert aber nicht genutzt (nur L2). Koennte ein Relikt sein — aber da MonitorView L1+L2 in einer Datei ist, wird es fuer L2 benoetigt. Kein Problem.

3. **`groupDevicesByZone`** stammt aus `useZoneDragDrop`. Die Funktion ist nicht in einem separaten Utility — sie ist im Drag-Drop Composable gebunden. Fuer L1 waere eine Trennung sauberer, ist aber funktional kein Problem.

4. **Dashboard-Store Auto-Init:** `fetchLayouts()` wird beim Store-Erstellen automatisch aufgerufen. Bei SSR oder Tests koennte das ungewollt sein — fuer den aktuellen SPA-Betrieb ist es ok.

5. **Zone-Tile `(device as any)` Casts:** Zeilen 888, 891, 898, 912 nutzen `as any` — deutet auf unvollstaendige Typisierung der ESPDevice-Felder hin (emergency_stopped, last_read, last_reading_at, last_seen). Kein funktionaler Fehler, aber Code-Qualitaets-Thema.

---

## Store-Analyse-Zusammenfassung (Block C)

### C.1 espStore (`stores/esp.ts`)

- **Pfad:** `El Frontend/src/stores/esp.ts` (~2500 Zeilen)
- **devices:** `ref<ESPDevice[]>` — Array aller ESP-Geraete mit `sensors[]`, `actuators[]`, `zone_id`, `zone_name`, `status`, etc.
- **getESPStatus(device):** Pure Function in `composables/useESPStatus.ts`. Heartbeat-Logik: online < 90s, stale < 300s, offline > 300s
- **fetchAll():** 2 parallele Calls: `GET /debug/mock-esp` + `GET /esp/devices`, merged Ergebnisse

### C.2 logicStore (`shared/stores/logic.store.ts`)

- **enabledRules:** `computed(() => rules.filter(r => r.enabled))`
- **isRuleActive(ruleId):** `activeExecutions.has(ruleId)` — Map wird via WS `logic_execution` Event befuellt (mit 3s auto-removal Timer)
- **getZonesForRule(rule):** `extractEspIdsFromRule(rule)` → `espStore.devices` Lookup → `zone_name` Set → `Array.from()`
- **fetchRules():** `GET /logic/rules`

### C.3 dashboardStore (`shared/stores/dashboard.store.ts`)

- **crossZoneDashboards:** `layouts.filter(l => l.scope === 'cross-zone' && (!l.target || l.target.view === 'monitor'))`
- **inlineMonitorPanelsCrossZone:** `layouts.filter(l => target.view === 'monitor' && target.placement === 'inline' && scope !== 'zone')`
- **inlineMonitorPanels:** Alias fuer `inlineMonitorPanelsCrossZone`
- **sideMonitorPanels:** `target.view === 'monitor' && placement === 'side-panel'`
- **bottomMonitorPanels:** `target.view === 'monitor' && placement === 'bottom-panel'`
- **DashboardTarget:** `{ view: 'monitor'|'hardware', placement: 'page'|'inline'|'side-panel'|'bottom-panel', anchor?, panelPosition?, panelWidth?, order? }`

### C.4 zoneStore

- **Kein separater zoneStore fuer Zone-Listen.** Zonen-Daten werden aus `espStore.devices` via `groupDevicesByZone()` aggregiert.
- `stores/zone.store.ts` existiert, aber nur fuer `handleZoneAssignment()` / `handleSubzoneAssignment()` Aktionen (stateless).

---

## Design-System-Compliance (Block F)

### F.1 tokens.css Nutzung

| Komponente | Nutzt tokens.css? | Hardcoded Werte |
|------------|-------------------|-----------------|
| Zone-Tiles (MonitorView) | Ja — `--space-*`, `--text-*`, `--color-*`, `--radius-md`, `--glass-border`, `--font-mono` | `10px` font-size (Zeile 2395, 2451), `3px` gap (Zeile 2345, 2450), `1px` gap (Zeile 2391), `2px` translateY (Zeile 2319) |
| ActiveAutomationsSection | Ja — durchgehend Token-basiert | `14px` Icon-Groesse (Zeile 154, 207) — akzeptabel fuer Lucide Icons |
| RuleCardCompact | Teilweise | `12px` font-size (Zeile 212), `10px` (Zeile 222, 268, 282), `4px` gap (Zeile 282) |
| Dashboard-Card/Chips | Ja | `rgba(59, 130, 246, 0.06)` (Zeile 2887), `rgba(167, 139, 250, 0.15)` (Zeile 2946) |

### F.2 Design-System-Konsistenz

- **Zone-Tiles vs. HardwareView ZonePlate:** Aehnlich (glass-Stil, border, padding) aber nicht identisch. Zone-Tiles haben `border-left: 3px solid` fuer Status-Ampel, ZonePlate nutzt Status-Dot im Header. Bewusst verschiedene Designs fuer verschiedene Kontexte.
- **Empty States:** ActiveAutomationsSection und ZoneRulesSection nutzen identisches Pattern (Icon + Text + Hint + Link-Button, dashed border). Konsistent.
- **"Alle Regeln"-Link:** Identischer Stil wie ZoneRulesSection "Im Regeln-Tab anzeigen" (iridescent-2 Farbe, ExternalLink Icon, sm Font). Konsistent.
