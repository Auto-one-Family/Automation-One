# Monitor L2 IST-Analyse — 2026-03-07

## Zusammenfassung

| Bereich | Status | Kernbefund |
|---------|--------|------------|
| **A. Frontend** | GELB | Template-Reihenfolge OK, Accordion Smart-Defaults fehlen, Sparkline nur als leerer Slot |
| **B. Backend** | GRUEN | `GET /zone/{id}/monitor-data` existiert und liefert vollstaendige Daten |
| **C. Stores** | GRUEN | `getRulesForZone`, `inlineMonitorPanelsForZone` korrekt implementiert |
| **D. Datenfluss** | GRUEN | Primaer API, Fallback useZoneGrouping, Ready-Gate vorhanden |
| **E. Qualitaet** | ROT | ActuatorCard Toggle im monitor-mode = Read-Only-Verletzung, kein Race-Condition-Schutz |
| **F. Verknuepfungen** | GELB | Zone-Navigation vorhanden, kein Link Monitor→Hardware |

---

## A. Frontend-Analyse

### A1: L2-Aktivierung und selectedZoneId

**IST-Befund:**

`selectedZoneId` ist ein rein URL-reaktives computed (MonitorView.vue:82):
```ts
const selectedZoneId = computed(() => (route.params.zoneId as string) || null)
```

Kein manuelles Setzen, kein Store-State. Wert ist `null` auf L1, String-UUID auf L2.

**Watches auf selectedZoneId** (6 Stueck):

| Zeile | Zweck | immediate |
|-------|-------|-----------|
| 756-766 | Zone-Existenz-Check → Redirect zu L1 wenn Zone nicht in Devices | ja |
| 1131-1137 | `fetchZoneMonitorData()` triggern | ja |
| 1190-1197 | Accordion-State laden, expandedSensorKey zuruecksetzen | ja |
| 1069-1101 | Zone-Dashboard auto-generieren/-updaten | ja |
| 1049-1053 | Breadcrumb-Update | nein |
| 1273-1297 | Keyboard-Shortcuts (ArrowLeft/Right) aktivieren | nein |

**Datenquelle:** Primaer `zonesApi.getZoneMonitorData(zoneId)` (MonitorView.vue:1121), Endpoint `GET /api/v1/zone/{zone_id}/monitor-data`. Fallback auf `useZoneGrouping` + `useSubzoneResolver` bei API-Fehler.

**Loading-State:** Ready-Gate implementiert (MonitorView.vue:1566-1572):
- `BaseSkeleton` bei `zoneMonitorLoading`
- `ErrorState` mit Retry bei `zoneMonitorError`
- Content erst bei `v-else`

**Code-Pfad Route→Render:**
```
Route /monitor/:zoneId
  → selectedZoneId (computed, Z.82)
  → watch (Z.1131) → fetchZoneMonitorData()
  → zonesApi.getZoneMonitorData(zoneId) (Z.1121)
  → zoneMonitorData.value (ZoneMonitorData)
  → zoneSensorGroup (computed, Z.988-1012) — mappt server→SensorWithContext
  → Template: Subzone-Accordion (Z.1621+)
```

**Bewertung:** OK

---

### A2: Template-Struktur L2 — Reihenfolge der Sektionen

**IST-Reihenfolge** (ab MonitorView.vue:1563):

| # | Element | Bedingung | Zeile |
|---|---------|-----------|-------|
| 1 | Ready-Gate (BaseSkeleton / ErrorState) | `zoneMonitorLoading` / `zoneMonitorError` | 1566-1572 |
| 2 | Zone-Header (Zurueck + Zone-Nav + KPI-Summary) | immer (im `v-else`) | 1573-1618 |
| 3 | Sensoren-Section (Subzone-Accordion) | `zoneSensorGroup?.sensorCount > 0` | 1621-1771 |
| 4 | Aktoren-Section (Subzone-Accordion) | `zoneActuatorGroup?.actuatorCount > 0` | 1774-1820 |
| 5 | ZoneRulesSection | immer (prop `zone-id`) | 1823 |
| 6 | Zone-Dashboards (Links-Liste) | `selectedZoneId` | 1826-1862 |
| 7 | InlineDashboardPanel (L2-Panels) | `v-for panel in inlineMonitorPanelsL2` | 1865-1870 |
| 8 | Empty-State | `zoneSensorCount === 0 && zoneActuatorCount === 0` | 1872-1875 |
| 9 | Bottom-Panel | `dashStore.bottomMonitorPanels?.length > 0` | 1882-1889 |

**SOLL vs IST:** Identisch. Die Reihenfolge Zone-Header → Sensoren → Aktoren → Regeln → Dashboards → Inline-Panels stimmt mit der Auftrags-Historie ueberein.

**Bewertung:** OK

---

### A3: Subzone-Accordions — useZoneGrouping

**Datei:** `El Frontend/src/composables/useZoneGrouping.ts` (332 Zeilen)

**Eingabe:**
```ts
function useZoneGrouping(options?: ZoneGroupingOptions | ZoneGroupingFilters)

interface ZoneGroupingOptions {
  filters?: ZoneGroupingFilters
  subzoneResolver?: Ref<Map<string, SubzoneResolved>>
}
```

Der optionale `subzoneResolver` nutzt Key-Format `${espId}-${gpio}` fuer GPIO-Level-Aufloesung.

**Gruppierungslogik:**
- `espStore.devices` → flatMap → allSensors → filteredSensors → sensorsByZone
- Subzone-Aufloesung pro Sensor (Z.125-135):
  - Mit resolver: `resolver.get("${espId}-${gpio}")` → `{ subzoneId, subzoneName }`
  - Ohne resolver: ESP-Level-Subzone (`esp.subzone_id`, `esp.subzone_name`)
- Gruppierung: Nested `Map<zoneId, Map<subzoneId, sensors[]>>` → flatten zu `ZoneGroup[]`

**"Keine Subzone" Behandlung:**
- Konstante `SUBZONE_NONE = '__none__'` (Z.100)
- Zuweisung: `sensor.subzone_id ?? SUBZONE_NONE` (Z.170)
- Anzeige: `'Keine Subzone'` fuer benannte Zonen, leer fuer Unassigned (Z.185-187)
- Sortierung: `null`-Subzones ans Ende (Z.195-199)

**Output-Interfaces:**
```ts
interface ZoneGroup {
  zoneId: string | null       // null = ZONE_UNASSIGNED
  zoneName: string
  subzones: SubzoneGroup[]
  sensorCount: number
}

interface SubzoneGroup {
  subzoneId: string | null    // null = keine Subzone
  subzoneName: string         // 'Keine Subzone' wenn null
  sensors: SensorWithContext[]
}

// SensorWithContext erweitert MockSensor um:
// esp_id, esp_name, zone_id, zone_name, subzone_id, subzone_name, esp_state
```

**Accordion-State:** useZoneGrouping selbst hat KEINEN Accordion-State. Der Accordion-State ist direkt in MonitorView implementiert (Z.1143-1197):
- localStorage-Key: `ao-monitor-subzone-collapse-${zoneId}` (Z.1147/1162)
- **Smart-Defaults: NICHT implementiert** — Code setzt leeres Set (alle offen), obwohl Kommentar ≤4-Regel erwaehnt (Z.1152)

**Subzone-Badge auf SensorCard:** `subzone_name` fliesst ueber `SensorWithContext` als Prop an SensorCard. SensorCard zeigt `subzoneLabel` computed (sensor.subzone_name → sensor.subzone_id → 'Keine Subzone').

**Bewertung:** OK (Accordion Smart-Defaults = LUECKE, siehe E3)

---

### A4: SensorCard im monitor-mode

**Datei:** `El Frontend/src/components/devices/SensorCard.vue`

**Props-Interface (Z.21-24):**
```ts
interface Props {
  sensor: SensorWithContext   // aus useZoneGrouping
  mode: 'monitor' | 'config'
}
```
Kein `withDefaults` — beide Props required.

**Emits (Z.28-31):**
```ts
defineEmits<{
  configure: [sensor: SensorWithContext]
  click: [sensor: SensorWithContext]
}>()
```

**Monitor-Mode Rendering (Z.130-159):**

| Bereich | Inhalt | Zeile |
|---------|--------|-------|
| Header | Sensor-Typ-Icon (14px, ICON_MAP) + Name + Quality-Block (Status-Dot + Text-Label) | 131-138 |
| Value | `formatValue(raw_value)` + `resolvedUnit` | 139-142 |
| Sparkline-Slot | Optionaler Named-Slot `sparkline` (32px Hoehe) — Parent injiziert | 144-146 |
| Footer | Links: `esp_id` (11px, muted). Rechts: `subzoneLabel` + Stale/Offline-Badge | 147-158 |

**Doppelte Kodierung:** Status-Dot (`sensor-card__dot--{good|warning|alarm|offline}`) + Text-Label (`qualityLabel`: "OK"/"Warnung"/"Kritisch"/"Offline").

**Stale-Indikator:** `getDataFreshness(sensor.last_read)` → `freshness === 'stale'` (Grenzwert 120s). CSS `sensor-card--stale` (opacity 0.7, gelber Border 25%). Badge mit Clock-Icon und `formatRelativeTime(sensor.last_read)`.

**ESP-Offline-Indikator:** `esp_state !== undefined && esp_state !== 'OPERATIONAL'`. CSS `sensor-card--esp-offline` (opacity 0.5). Badge mit WifiOff-Icon "ESP offline". Badge-Prioritaet: Offline hat Vorrang vor Stale.

**Klick-Verhalten:** `handleClick()` emittiert `click` Event — kein internes Routing. Parent (MonitorView) entscheidet. Im MonitorView: `toggleExpanded(sensorKey)` oeffnet inline 1h-Chart.

**Read-Only:** Ja — kein Toggle, kein Edit-Button, kein Config-Button im monitor-mode.

**Kein Expanded Panel in SensorCard selbst.** Das Expanded Panel (1h-Chart) ist in MonitorView.vue inline implementiert (Z.1710-1741), nicht in der Komponente.

**ICON_MAP (Z.15-19):** Thermometer, Droplets, Wind, Sun, Gauge, Leaf, Activity + Aliase (Droplet→Droplets, Zap→Activity).

**Bewertung:** OK

---

### A5: ActuatorCard im monitor-mode

**Datei:** `El Frontend/src/components/devices/ActuatorCard.vue`

**Props-Interface (Z.12-15):**
```ts
interface Props {
  actuator: ActuatorWithContext   // aus useZoneGrouping
  mode: 'monitor' | 'config'
}
```

**Emits (Z.19-22):**
```ts
defineEmits<{
  configure: [actuator: ActuatorWithContext]
  toggle: [espId: string, gpio: number, currentState: boolean]
}>()
```

**Kein separater Monitor-Template-Branch.** Anders als SensorCard gibt es keinen `v-if="mode === 'config'"` / `v-else`. Die gesamte Karte ist ein einziger Template-Block. Unterschiede:
- `ChevronRight`-Icon (Z.75-78): nur im config-Mode sichtbar
- `handleClick()` (Z.37-41): nur im config-Mode emittiert `configure`, im monitor-Mode **gar nichts**

**State-Badge (Z.82-87):** Binaer Ein/Aus (`actuator.state ? 'Ein' : 'Aus'`). **Kein PWM-Badge** im aktuellen Code.
Emergency-Stopp: Badge "Not-Stopp" (badge-danger), CSS `actuator-card--emergency`.

**Toggle-Button (Z.89-95):** **In BEIDEN Modi sichtbar** — keine `v-if="mode !== 'monitor'"` Guard. Emittiert `toggle` Event. `:disabled="actuator.emergency_stopped"`.

**"Bedient Subzone(n)" (Z.29-35, 70-73):**
```ts
const servedSubzoneLabel = computed(() => {
  const name = props.actuator.subzone_name ?? ''
  const id = props.actuator.subzone_id ?? ''
  if (typeof name === 'string' && name.trim()) return name
  if (typeof id === 'string' && id.trim()) return id
  return '—'    // Fallback: Gedankenstrich
})
```

**Bewertung:** BUG — Toggle-Button im monitor-mode verletzt Read-Only-Prinzip (siehe E5)

---

### A6: ZoneRulesSection

**Datei:** `El Frontend/src/components/monitor/ZoneRulesSection.vue`

**Props (Z.20-22):**
```ts
interface Props { zoneId: string | null }
```

**Datenbeschaffung (Z.28-31):**
```ts
const rulesForZone = computed<LogicRule[]>(() => {
  if (!props.zoneId) return []
  return logicStore.getRulesForZone(props.zoneId)
})
```
`onMounted`: `logicStore.fetchRules()` wenn `rules.length === 0`. `watch(zoneId)`: erneut laden bei Zone-Wechsel.

**Schwellwert-Logik (Z.17-43):**
- `RULES_VISIBLE_THRESHOLD = 10`
- `MAX_DISPLAYED_WHEN_OVER = 5`
- Bei `> 10` Regeln: erste 5 + Banner "Weitere X Regeln — Im Regeln-Tab anzeigen"

**Empty State (Z.71-89):** Zap-Icon + "Keine Automatisierungen fuer diese Zone" + Button "Zum Regeln-Tab" → `router.push({ name: 'logic' })`.

**RuleCardCompact (Z.92-118):** Gerendert in `monitor-card-grid`. Kein `zoneNames`-Prop uebergeben (Zone ist implizit auf L2).

**Bewertung:** OK

---

### A6b: RuleCardCompact

**Datei:** `El Frontend/src/components/logic/RuleCardCompact.vue`

**Props (Z.15-21):**
```ts
interface Props {
  rule: LogicRule
  isActive?: boolean        // Default: false
  zoneNames?: string[]      // Default: []
}
```

**Status-Dot (Z.100-107):** `--on` (gruen, Glow), `--off` (grau), `--error` (rot, Glow). `isActive` triggert Flash-Animation auf Card-Border (1.5s, einmalig).

**Fehler-Rand (Z.173-181):** `border-left: 3px solid var(--color-status-alarm)` bei `last_execution_success === false`.

**Zone-Badge (Z.76-79):** Nur gerendert wenn `zoneNames !== undefined` (Z.119). In ZoneRulesSection (L2) nicht uebergeben → nicht sichtbar. In ActiveAutomationsSection (L1) uebergeben → sichtbar.

**Navigation (Z.82-84):** `router.push({ name: 'logic-rule', params: { ruleId: rule.id } })`. Gesamte Karte ist ein `<button>`.

**Bewertung:** OK

---

### A7: Zone-Dashboard-Links

**IST-Befund:** `dashStore.zoneDashboards(selectedZoneId!)` in MonitorView.vue:1836.

**dashboard.store.ts — `zoneDashboards()` (Z.513-515):**
```ts
function zoneDashboards(zoneId: string): DashboardLayout[] {
  return layouts.value.filter(l => l.scope === 'zone' && l.zoneId === zoneId)
}
```
Filter: `scope === 'zone'` AND `zoneId === zoneId`. Keine Unterscheidung zwischen Auto-generierten und User-erstellten Dashboards in der Filterung.

**Klick:** Navigation zu `/monitor/:zoneId/dashboard/:dashboardId` (DashboardViewer). `getDashboardNameSuffix(dash)` fuer eindeutige Namen (createdAt "DD.MM." oder ID).

**Empty State:** "Dashboard erstellen" Link zu Editor bei leeren Zonen (LayoutDashboard Icon, dashed Border).

**Auto-Generierung:** `generateZoneDashboard(zoneId, devices, zoneName)` wird via Watch auf selectedZoneId aufgerufen (Z.1069-1101) beim ersten Zonenbesuch. Guard: `generatedZoneDashboards` Set verhindert Mehrfach-Generierung.

**Bewertung:** OK

---

### A8: Inline-Panels

**inlineMonitorPanelsL2 (MonitorView.vue:1237-1251):**
```ts
const inlineMonitorPanelsL2 = computed(() => {
  const cross = dashStore.inlineMonitorPanelsCrossZone
  const zoneId = selectedZoneId.value
  if (!zoneId) return cross
  const forZone = dashStore.inlineMonitorPanelsForZone(zoneId)
  // Deduplizierung via Set auf panel.id
  const combined = [...cross, ...forZone (unique)]
  return combined.sort((a, b) => (a.target?.order ?? 0) - (b.target?.order ?? 0))
})
```

**dashboard.store.ts:**
- `inlineMonitorPanelsCrossZone` (Z.721-725): `scope !== 'zone'` oder null — fuer L1 und L2 sichtbar
- `inlineMonitorPanelsForZone(zoneId)` (Z.728-732): `scope === 'zone'` AND `zoneId === zoneId` — zone-spezifisch

**Rendering:** `InlineDashboardPanel.vue` — reines CSS-Grid (12 Spalten), kein GridStack. `ROW_HEIGHT_INLINE = 80px`. Props: `layoutId`, `mode: 'inline' | 'side-panel'`.

**Reihenfolge im Template:** Nach Zone-Dashboard-Links, vor Empty-State.

**Bottom-Panel (Z.1882-1889):** `dashStore.bottomMonitorPanels` — placement `'bottom-panel'`, max-height 400px, overflow-y auto. Erscheint ausserhalb des `<main>`-Blocks.

**Side-Panel (Z.1893-1899):** `dashStore.sideMonitorPanels` — `<aside>` im CSS-Grid, nur aktiv bei `sideMonitorPanels.length > 0`.

**Bewertung:** OK

---

### A9: Sparkline-Cache

**Datei:** `El Frontend/src/composables/useSparklineCache.ts` (57 Zeilen)

**API:**
```ts
function useSparklineCache(maxPoints = DEFAULT_MAX_POINTS)
// Returns: { sparklineCache: Ref<Map<string, ChartDataPoint[]>>, getSensorKey }
```

- `getSensorKey(espId, gpio, sensorType?)`: `"${espId}-${gpio}-${sensorType}"` oder `"${espId}-${gpio}"`
- `sparklineCache`: `ref<Map<string, ChartDataPoint[]>>` — direkt lesbar

**Deduplizierung (Z.41-45):** Punkt wird nur hinzugefuegt wenn Wert geaendert ODER >5s vergangen (`DEDUP_INTERVAL_MS`). Kein Timer — nur reaktiv bei `espStore.devices`-Aenderung.

**Kein Singleton:** Jeder Aufruf erzeugt eigene Instanz. In MonitorView (Z.92): `const { sparklineCache, getSensorKey } = useSparklineCache()`.

**maxPoints:** `DEFAULT_MAX_POINTS = 30`. Ueberschuss wird per `shift()` abgeschnitten (FIFO).

**Watch-Trigger:** Deep-Watch auf `espStore.devices` (Z.28-51).

**Nutzung auf L2:** SensorCard hat einen optionalen `sparkline`-Slot, aber MonitorView injiziert **nichts** in diesen Slot. Der Sparkline-Cache existiert im Code, wird aber auf L2 **nicht visuell genutzt**.

**Bewertung:** LUECKE — Sparkline-Cache existiert, wird aber nicht an SensorCards weitergegeben. Leerer Slot.

---

### A10: Sensor → L3 SlideOver

**IST-Befund:**

Der Klick auf SensorCard oeffnet zunaechst ein **Inline Expanded Panel** (1h-Chart) in MonitorView (Z.1696):
```ts
@click="toggleExpanded(getSensorKey(sensor.esp_id, sensor.gpio, sensor.sensor_type))"
```

Im Expanded Panel gibt es den Button "Zeitreihe anzeigen" (Z.1734), der den L3 SlideOver oeffnet:
```ts
@click.stop="openSensorDetail(sensor)"
```

**openSensorDetail() (Z.295-316):**
1. Setzt `selectedDetailSensor.value`
2. Setzt `showSensorDetail.value = true`
3. Ruft `fetchDetailData()` auf (sensorsApi.queryData, limit 1000)
4. URL-Sync via `router.replace({ name: 'monitor-sensor', params: { zoneId, sensorId } })`
5. `sensorId`-Format: `${sensor.esp_id}-gpio${sensor.gpio}`

**closeSensorDetail() (Z.318-335):**
1. `showSensorDetail = false`
2. URL: `router.replace({ name: 'monitor-zone', params: { zoneId } })`
3. Nach 300ms: State zuruecksetzen (Animation)

**router.replace (nicht push):** Korrekt — kein History-Eintrag fuer SlideOver.

**L2 bleibt sichtbar:** Ja — SlideOver als Overlay ueber L2.

**Deep-Link:** `selectedSensorId` aus `route.params.sensorId` wird beim Mount aufgeloest (Z.769-799).

**Bewertung:** OK

---

## B. Backend-Analyse

### B1: GET /api/v1/zone/{zone_id}/monitor-data

**IST-Befund:** Endpoint EXISTIERT.

**Datei:** `El Servador/god_kaiser_server/src/api/v1/zone.py`
- Zeile 264: `@router.get("/{zone_id}/monitor-data", response_model=ZoneMonitorData)`
- Auth: `ActiveUser` (eingeloggter User, keine Operator-Rolle noetig)
- Delegiert an `MonitorDataService(db).get_zone_monitor_data(zone_id)` (Z.293)

**Response-Schema** (`El Servador/god_kaiser_server/src/schemas/monitor.py`):

```python
class SubzoneSensorEntry(BaseModel):         # Z.16
    esp_id: str
    gpio: int
    sensor_type: str
    name: Optional[str] = None
    raw_value: Optional[float] = None
    unit: str = ""
    quality: str = "unknown"
    last_read: Optional[str] = None          # ISO-String

class SubzoneActuatorEntry(BaseModel):       # Z.31
    esp_id: str
    gpio: int
    actuator_type: str
    name: Optional[str] = None
    state: bool = False
    pwm_value: int = 0
    emergency_stopped: bool = False

class SubzoneGroup(BaseModel):               # Z.45
    subzone_id: Optional[str] = None
    subzone_name: str
    sensors: List[SubzoneSensorEntry] = []
    actuators: List[SubzoneActuatorEntry] = []

class ZoneMonitorData(BaseModel):            # Z.56
    zone_id: str
    zone_name: str
    subzones: List[SubzoneGroup] = []
    sensor_count: int = 0
    actuator_count: int = 0
    alarm_count: int = 0
```

**Service-Layer:** `monitor_data_service.py` — 9-stufiger Ablauf:
1. ESPs fuer zone_id laden
2. Subzone-Konfigurationen → `(esp_device_id, gpio) → (subzone_id, subzone_name)` Dict
3. SensorConfigs (JOIN, nur enabled=True)
4. ActuatorConfigs (JOIN, nur enabled=True)
5. Letzte Readings als Batch
6. ActuatorStates laden
7. SensorEntries aufbauen (quality "error"/"bad" → alarm_count++)
8. ActuatorEntries aufbauen
9. Merge in SubzoneGroups (benannte alphabetisch, null zuletzt)

**GPIO-zu-Subzone-Aufloesung:** Nutzt `SubzoneConfig.assigned_gpios` — korrekt, nicht das veraltete `subzone_id` Feld.

**Bewertung:** OK — Endpoint existiert und liefert vollstaendige aggregierte Daten.

---

### B2: sensor_data mit zone_id/subzone_id Filter

**IST-Befund:**

`GET /v1/sensors/data` (sensors.py:978) hat `zone_id` und `subzone_id` als Query-Parameter (Z.993-994):
```python
zone_id: Annotated[Optional[str], Query(description="Filter by zone ID (Phase 0.1)")] = None,
subzone_id: Annotated[Optional[str], Query(description="Filter by subzone ID (Phase 0.1)")] = None,
```

`SensorReading` Schema hat `zone_id` und `subzone_id` Felder (Z.465/469).

`zone_subzone_resolver.py` existiert und wird beim Speichern aufgerufen:
```python
async def resolve_zone_subzone_for_sensor(
    esp_id_str: str, gpio: int,
    esp_repo: "ESPRepository", subzone_repo: "SubzoneRepository",
) -> tuple[Optional[str], Optional[str]]  # (zone_id, subzone_id)
```

**Bewertung:** OK

---

### B3: Logic Rules Endpoints fuer Zone

**IST-Befund:** `GET /v1/logic/rules` (logic.py:58-100) hat **keinen** `zone_id`-Parameter. Filter: nur `enabled`, `page`, `page_size`.

Die Zone-Filterung erfolgt **rein clientseitig** im `logic.store.ts` via `getRulesForZone(zoneId)`.

**Bewertung:** OK — Design-Entscheidung (clientseitige Filterung bei ueberschaubarer Regelmenge), kein Bug.

---

### B4: Dashboard-Endpoints fuer Zone

**IST-Befund:** `GET /api/v1/dashboards` hat kein `zone_id` Query-Parameter. Die Zone-Filterung erfolgt clientseitig im `dashboard.store.ts`:
```ts
function zoneDashboards(zoneId: string): DashboardLayout[] {
  return layouts.value.filter(l => l.scope === 'zone' && l.zoneId === zoneId)
}
```

`target` ist ein JSON-Feld auf dem DashboardLayout Model. `DashboardTarget` Interface:
```ts
interface DashboardTarget {
  view: 'monitor' | 'hardware'
  placement: 'page' | 'inline' | 'side-panel' | 'bottom-panel'
  anchor?: string; panelPosition?: 'left' | 'right'
  panelWidth?: number; order?: number
}
```

**Bewertung:** OK

---

## C. Store-Analyse

### C1: espStore — Datengrundlage

**IST-Befund:**

ESPDevice-Interface (aus `api/esp.ts`):
```ts
interface ESPDevice {
  device_id: string           // "ESP_XXXXXXXX" oder "ESP_MOCK_XXX"
  esp_id?: string             // Alias (Backward-Kompatibilitaet)
  zone_id?: string | null
  zone_name?: string | null
  master_zone_id?: string | null
  subzone_id?: string | null
  subzone_name?: string | null
  is_zone_master?: boolean
  name?: string; status?: string
  sensors: MockSensor[]; actuators: MockActuator[]
  // + weitere Felder
}
```

`zone_id` ist direkt auf dem Device-Objekt.

**WebSocket sensor_data Handler (esp.ts:1134-1136):** Ist ein Durchleiter zu `sensor.store.ts`:
```ts
function handleSensorData(message) {
  const sensorStore = useSensorStore()
  sensorStore.handleSensorData(message, devices.value, getDeviceId)
}
```

**Bewertung:** OK

---

### C2: useZoneGrouping — Gruppierungslogik (Store-Perspektive)

**IST-Befund:**

- **Composable, kein Store.** Jeder Aufruf erzeugt neue Instanz.
- MonitorView instanziiert es einmal (Z.103-105) — wird fuer alle Zonen wiederverwendet.
- **Performance:** Reagiert auf `espStore.devices`-Aenderungen (deep watch im Sparkline-Cache, computed in Grouping). Bei jedem `sensor_data` WS-Event wird espStore.devices mutiert → Grouping re-computed. Das ist akzeptabel da computed lazy evaluiert.

**Bewertung:** OK

---

### C3: logic.store — getRulesForZone

**IST-Befund:**

```ts
// logic.store.ts Z.301-320
function getRulesForZone(zoneId: string): LogicRule[] {
  if (!zoneId) return []
  const espStore = useEspStore()
  return rules.value.filter((rule) => {
    const espIds = extractEspIdsFromRule(rule)  // aus types/logic.ts
    if (espIds.size === 0) return false
    for (const espId of espIds) {
      const device = espStore.devices.find(d => espStore.getDeviceId(d) === espId)
      if (device?.zone_id === zoneId) return true  // EIN Match reicht
    }
    return false
  }).sort((a, b) => {
    const prio = (a.priority ?? 0) - (b.priority ?? 0)
    return prio !== 0 ? prio : (a.name ?? '').localeCompare(b.name ?? '')
  })
}
```

Nutzt `extractEspIdsFromRule` (types/logic.ts:270-295) — rekursiv durch CompoundConditions, erfasst SensorCondition, HysteresisCondition, ActuatorAction.

**`getZonesForRule(rule)` existiert** (Z.326-339): Sammelt Zone-Namen ueber ESP-IDs, bevorzugt `zone_name`, Fallback `zone_id`.

**Unit-Tests:** Keine dedizierten Unit-Tests fuer logic.store.ts gefunden. Logic-Tests nur in E2E-Specs.

**Bewertung:** OK (fehlende Unit-Tests = LUECKE, aber nicht L2-spezifisch)

---

### C4: dashboard.store — Zone-Dashboard-Computeds

**IST-Befund:**

| Funktion | Typ | Filter |
|----------|-----|--------|
| `inlineMonitorPanelsForZone(zoneId)` | function | `view=monitor`, `placement=inline`, `scope=zone`, `zoneId` |
| `inlineMonitorPanelsCrossZone` | computed | `view=monitor`, `placement=inline`, `scope !== 'zone'` |
| `bottomMonitorPanels` | computed | `view=monitor`, `placement=bottom-panel` |
| `sideMonitorPanels` | computed | `view=monitor`, `placement=side-panel` |
| `zoneDashboards(zoneId)` | function | `scope=zone`, `zoneId` |

**`generateZoneDashboard(zoneId, devices, zoneName)` existiert (Z.532-695):**
- Sensors per SENSOR_TYPE_CONFIG-Kategorie in 3 Widget-Gruppen
- Time-series → full-width line-chart h:3
- Gauges → half-width w:6 h:2
- Other → sensor-card w:6 h:2
- Actuators → w:4 h:2, 3 pro Zeile
- Guard: `autoGenerated=true` Layout existiert → update statt neu

**Bewertung:** OK

---

## D. Datenfluss L1 → L2

### D1: selectedZoneId — Wie gesetzt

**IST-Befund:** Rein aus Route-Param (MonitorView.vue:82):
```ts
const selectedZoneId = computed(() => (route.params.zoneId as string) || null)
```

Kein separater Store-State. Bei Zone-Card-Klick auf L1: `router.push({ name: 'monitor-zone', params: { zoneId } })`.

**Bewertung:** OK

---

### D2: Daten-Loading beim Zone-Wechsel

**IST-Befund:**
- Watch auf `selectedZoneId` (Z.1131) triggert `fetchZoneMonitorData()` → API-Call mit neuer zoneId.
- Zone-zu-Zone Navigation nutzt `router.replace` (kein push) — History bleibt sauber.
- Loading-Anzeige: `BaseSkeleton` bei `zoneMonitorLoading`.

**Race-Condition-Schutz:** **KEINER.** Kein `abortController`, kein Watch-Cancel. Bei schnellem Zone-Wechsel A→B koennte Zone A's Response nach Zone B's Response ankommen und die Daten ueberschreiben. Allerdings: Die computed `zoneSensorGroup` filtert nach `selectedZoneId`, so dass falsche Daten in `zoneMonitorData` nicht angezeigt werden (nur wenn useZoneGrouping-Fallback aktiv).

**WebSocket-Updates:** `sensor_data` Events fuer andere Zonen werden im espStore global verarbeitet. Die Filterung auf L2 erfolgt per `zoneSensorGroup` computed → zeigt nur Sensoren der ausgewaehlten Zone. Das ist korrekt.

**Bewertung:** LUECKE — Kein AbortController fuer laufende API-Calls bei Zone-Wechsel. Potenzielle Race Condition bei zoneMonitorData.

---

### D3: Uebergabe von Daten L1 → L2

**IST-Befund:** L2 ist self-sufficient. Nur `zoneId` aus der Route. Keine Props, kein provide/inject, kein Router-State. Alle Daten werden ueber API + Stores geladen.

**Bewertung:** OK

---

## E. Qualitaets-Check

### E1: Subzone-Konsistenz

**IST-Befund:** Beide Datenquellen (API `zoneMonitorData` und Fallback `useZoneGrouping`) nutzen `SubzoneConfig.assigned_gpios` fuer die GPIO-zu-Subzone-Zuordnung.

- API-Pfad: `MonitorDataService` baut `gpio_to_subzone` Dict aus SubzoneConfigs
- Fallback-Pfad: `useSubzoneResolver` ruft `subzonesApi.getSubzones(espId)` auf und baut dieselbe Map

SensorCard zeigt `subzoneLabel` aus `SensorWithContext.subzone_name` — dasselbe Feld das auch fuer die Accordion-Gruppierung verwendet wird.

**Inkonsistenz moeglich?** Theoretisch ja: Wenn zwischen API-Call (zoneMonitorData) und SubzoneResolver-Call eine Subzone-Aenderung erfolgt. In der Praxis unwahrscheinlich (Subzone-Aenderungen sind selten).

**Bewertung:** OK (kein praktisches Risiko)

---

### E2: Race Conditions

**IST-Befund:**

| Szenario | Schutz | Status |
|----------|--------|--------|
| Schneller Zone-Wechsel A→B | Kein AbortController, kein Watch-Cancel | LUECKE |
| WS-Event fuer Zone A waehrend Zone B angezeigt | `zoneSensorGroup` computed filtert korrekt | OK |
| Deep-Link zu nicht-existierender Zone | Watch (Z.756-766) redirected zu L1 | OK |
| API-Fehler bei Zone-Load | ErrorState mit Retry, Fallback auf useZoneGrouping | OK |

**Race-Condition-Detail:** `fetchZoneMonitorData()` setzt `zoneMonitorData.value = data` ohne zu pruefen ob `selectedZoneId` sich inzwischen geaendert hat. Wenn Zone B's API-Call vor Zone A's zurueckkommt, zeigt L2 kurzzeitig Zone A's Daten an (bis das naechste computed-Update greift).

**Bewertung:** LUECKE (MITTEL) — Kein API-Call-Cancellation. In der Praxis selten problematisch, da API-Calls schnell sind und computed sofort re-evaluiert.

---

### E3: Empty States

| Situation | Anzeige | Status |
|-----------|---------|--------|
| Zone ohne Sensoren UND ohne Aktoren | Empty-State Block (Z.1872-1875) | OK |
| Zone mit Sensoren aber ohne Subzonen | Alle unter "Keine Subzone" Accordion | OK |
| Zone ohne Logic-Rules | ZoneRulesSection Empty State: "Keine Automatisierungen" + Link | OK |
| Zone ohne Dashboards | "Dashboard erstellen" Link (dashed Border) | OK |
| Zone mit alle ESPs offline | Sensoren zeigen `sensor-card--esp-offline` (opacity 0.5), WifiOff-Badge | OK |

**Accordion Smart-Defaults:** NICHT IMPLEMENTIERT. Code setzt leeres Set (alle offen), obwohl Kommentar ≤4-Regel erwaehnt (MonitorView.vue:1152). Bei Zonen mit vielen Subzonen (>4) sind alle Accordions offen statt nur die erste.

**Bewertung:** LUECKE (NIEDRIG) — Smart-Defaults fehlen

---

### E4: Performance — API-Calls bei L2-Load

**Gezaehlte API-Calls beim Oeffnen einer Zone (L2):**

| # | Endpoint | Trigger | Zweck |
|---|----------|---------|-------|
| 1 | `GET /zone/{zone_id}/monitor-data` | Watch auf selectedZoneId (Z.1131) | Primaere L2-Daten |
| 2 | `GET /subzones/{esp_id}` (pro ESP) | useSubzoneResolver (Z.37-77) | Fallback-Resolver |
| 3 | `GET /logic/rules` | ZoneRulesSection onMounted (nur wenn Store leer) | Regeln |
| 4 | `GET /dashboards` | dashboard.store (nur wenn nicht geladen) | Dashboard-Liste |

**Tatsaechliche Calls bei normalem L2-Load:** 1-2 Calls (monitor-data + ggf. Subzone-Resolver). Logic-Rules und Dashboards sind typischerweise bereits im Store geladen.

**Redundanz:** Der `useSubzoneResolver` laedt Subzone-Daten per ESP, obwohl `monitor-data` diese bereits enthaelt. Das ist Fallback-Logik — bei erfolgreichem API-Call wird der Resolver nicht fuer die Anzeige genutzt, aber die API-Calls zum Aufbau des Resolvers werden trotzdem ausgefuehrt.

**Bewertung:** LUECKE (NIEDRIG) — Redundante Subzone-API-Calls auch bei erfolgreichem monitor-data Endpoint. Kein Performance-Problem bei normaler Nutzung, aber unnoetige Last.

---

### E5: Read-Only Enforcement

**IST-Befund:**

**VERLETZUNG GEFUNDEN:** `ActuatorCard.vue` Toggle-Button (Z.89-95) ist in **beiden Modi** sichtbar:
```html
<button
  class="btn-secondary btn-sm flex-shrink-0 touch-target"
  :disabled="actuator.emergency_stopped"
  @click="handleToggle"
>
  {{ actuator.state ? 'Ausschalten' : 'Einschalten' }}
</button>
```
Keine `v-if="mode !== 'monitor'"` Guard. Im monitor-mode kann der User Aktoren schalten — das widerspricht dem Read-Only-Prinzip.

**Sonstige interaktive Bereiche auf L2 (erlaubt):**
- Klick auf SensorCard → Expanded Panel (1h-Chart) → Reine Anzeige
- "Zeitreihe anzeigen" → L3 SlideOver → Reine Anzeige
- "Konfiguration" → Navigation zu /sensors → View-Wechsel (erlaubt)
- Klick auf RuleCardCompact → Navigation zu /logic/:ruleId → View-Wechsel (erlaubt)
- Dashboard-Links → Navigation → View-Wechsel (erlaubt)
- Zone-Navigation (Prev/Next) → View-Wechsel (erlaubt)

**Bewertung:** BUG (HOCH) — ActuatorCard Toggle im monitor-mode muss mit `v-if="mode === 'config'"` geschuetzt werden.

---

### E6: Stale-Sensor-Erkennung

**IST-Befund:** Implementiert in SensorCard.vue.

- `getDataFreshness(sensor.last_read)` aus `formatters.ts` — Grenzwerte:
  - `DATA_LIVE_THRESHOLD_S = 30` (live)
  - `DATA_STALE_THRESHOLD_S = 120` (stale)
- Visuell: CSS `sensor-card--stale` (opacity 0.7, gelber Border 25%), Clock-Badge mit `formatRelativeTime(sensor.last_read)`
- ESP-Offline: CSS `sensor-card--esp-offline` (opacity 0.5), WifiOff-Badge
- Badge-Prioritaet: Offline hat Vorrang vor Stale

**Grenzwert:** 120s (2 Minuten), nicht 60s wie im Auftrag erwaehnt. Das ist eine Design-Entscheidung, kein Bug.

**Bewertung:** OK — Stale-Erkennung vorhanden, Grenzwert 120s statt 60s (Design-Entscheidung).

---

## F. Verknuepfungen

### F1: Daten von L1 an L2

**IST-Befund:**
- L2 kennt nur `zoneId` aus der Route. Keine Props/inject/State-Uebergabe.
- **Back-Button:** Vorhanden (Z.1575-1578): `@click="goBack"` → `router.push({ name: 'monitor' })`
- **Zone-zu-Zone-Navigation:** Vorhanden (Z.1581-1601):
  - Prev/Next Buttons (nur wenn `sortedZoneIds.length > 1`)
  - `goToPrevZone()`/`goToNextZone()` nutzen `router.replace` (saubere History)
  - Position-Label: `"${idx+1}/${total}"`
  - **Keyboard:** ArrowLeft/Right via `useKeyboardShortcuts` (Scope `monitor-zone`)
  - **Touch:** `useSwipeNavigation(monitorContentRef, { threshold: 50 })` — links=next, rechts=prev

**Bewertung:** OK

---

### F2: Dashboard-Editor-Integration

**IST-Befund:**
- Von L2 aus: Zone-Dashboard-Links enthalten Edit-Icons. Klick oeffnet DashboardViewer → "Im Editor bearbeiten" Link.
- Auto-Generated-Banner im DashboardViewer bietet "Anpassen" → Editor Deep-Link.
- Empty State: "Dashboard erstellen" Link zum Editor.
- **Target-Dropdown im Editor:** Existiert in `CustomDashboardView.vue` mit "Monitor — Inline", "Monitor — Unteres Panel", "Monitor — Seitenpanel", "Hardware — Inline" etc.
- **Zone-Scope:** Ueber `setLayoutTarget()` mit `scope: 'zone'` und `zoneId` konfigurierbar.
- **Automatische Sichtbarkeit:** Neu erstellte Zone-Dashboards erscheinen auf L2 der richtigen Zone (sofern `scope=zone` und `zoneId` korrekt gesetzt).

**Bewertung:** OK

---

### F3: HardwareView-Verknuepfung

**IST-Befund:**
- **Monitor L2 → HardwareView:** Im Expanded Panel gibt es den Button "Konfiguration" → `/sensors?sensor={espId}-gpio{gpio}` (SensorsView/Wissensdatenbank). **Kein direkter Link zu HardwareView** (`/hardware`).
- **HardwareView → Monitor L2:** Kein Link gefunden. SensorsView hat "Live-Daten im Monitor anzeigen" → `/monitor/:zoneId`, aber HardwareView selbst hat keinen Monitor-Link.
- **Icon-Sprache:** Activity = Monitor (Sidebar), Settings = Hardware (Sidebar). Konsistent in der Sidebar-Navigation.

**Bewertung:** LUECKE (NIEDRIG) — Keine direkte bidirektionale Verknuepfung Monitor↔Hardware. Cross-Links gehen ueber SensorsView (Wissensdatenbank) als Zwischenschritt.

---

## Priorisierte Luecken-Liste

| # | Bereich | Beschreibung | Schwere | Aufwand |
|---|---------|--------------|---------|---------|
| 1 | E5 | **ActuatorCard Toggle-Button im monitor-mode sichtbar** — verletzt Read-Only-Prinzip. User kann auf L2 Aktoren schalten. Fix: `v-if="mode === 'config'"` auf Button. | HOCH | ~15min |
| 2 | E2/D2 | **Kein AbortController bei Zone-Wechsel** — `fetchZoneMonitorData()` hat keinen Cancel-Mechanismus. Bei schnellem Zone-Wechsel kann veraltete Response angezeigt werden. Fix: AbortController + zoneId-Guard in Response-Handler. | MITTEL | ~1h |
| 3 | A9 | **Sparkline-Cache nicht an SensorCards angebunden** — Cache existiert und wird befuellt, aber SensorCard-Sparkline-Slot bleibt leer auf L2. Entweder Slot befuellen oder Cache entfernen. | MITTEL | ~2h |
| 4 | E4 | **Redundante Subzone-API-Calls** — `useSubzoneResolver` macht pro-ESP API-Calls auch wenn `monitor-data` erfolgreich war. Fix: Resolver nur bei API-Fehler initialisieren (lazy). | NIEDRIG | ~1h |
| 5 | E3/A3 | **Accordion Smart-Defaults nicht implementiert** — Bei >4 Subzonen sind alle Accordions offen statt nur erste. Fix: Set mit collapsed Subzones vorbelegen wenn count > 4. | NIEDRIG | ~30min |
| 6 | F3 | **Kein direkter Link Monitor L2 ↔ HardwareView** — Cross-Navigation geht ueber SensorsView. Fix: Link "Hardware-Ansicht" im Zone-Header oder Footer. | NIEDRIG | ~30min |
| 7 | A5 | **ActuatorCard kein PWM-Badge** — `pwm_value` wird vom Backend geliefert aber nicht angezeigt. Nur binaer Ein/Aus. | NIEDRIG | ~30min |

---

## Offene Fragen (fuer Robin)

1. **Stale-Grenzwert 120s vs 60s:** SensorCard nutzt `DATA_STALE_THRESHOLD_S = 120` (2 Minuten). Der Auftrag erwaehnt 60s. Soll der Grenzwert auf 60s gesenkt werden?

2. **Sparkline auf L2:** Soll der Sparkline-Cache tatsaechlich in den SensorCard-Slot injiziert werden? Das wuerde die Cards visuell groesser machen. Alternative: Sparkline nur in L1 Zone-Tiles oder gar nicht.

3. **ActuatorCard PWM:** Soll `pwm_value` als Prozent-Badge angezeigt werden wenn > 0? Oder ist binaer Ein/Aus fuer L2-Monitoring ausreichend?

4. **Monitor L2 → Hardware Link:** Soll ein direkter Link zur HardwareView im Zone-Header erscheinen (z.B. Zahnrad-Icon neben Zone-Name)? Oder reicht der Umweg ueber SensorsView?

5. **Accordion Smart-Defaults:** Soll die ≤4-Regel umgesetzt werden (alle offen wenn ≤4 Subzonen, nur erste offen wenn >4)? Oder bevorzugt Robin einen anderen Default (z.B. alle immer offen, localStorage ueberschreibt)?

6. **Race Condition Prioritaet:** Wie oft wechselt Robin Zonen schnell hintereinander? Wenn selten: NIEDRIG statt MITTEL. Wenn haeufig (z.B. bei Tab-Navigation): AbortController hat hoehere Prioritaet.
