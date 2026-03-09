# Frontend Dev Report: Code-Review Notification/Alert, Cross-View-Konsistenz, Frontend-Luecken

## Modus: A (Analyse)
## Auftrag: Code-Review Bereiche 1-3 — Notification/Alert-System, Cross-View-Konsistenz L1/L2/Monitor, FL-03 und Status-Dot

---

## Codebase-Analyse

Gelesene Dateien: `notification-inbox.store.ts`, `alert-center.store.ts`, `NotificationDrawer.vue`, `AlertStatusBar.vue`, `NotificationBadge.vue`, `QuickAlertPanel.vue`, `DeviceMiniCard.vue`, `LiveDataPreview.vue`, `SensorSatellite.vue`, `SensorColumn.vue`, `ESPOrbitalLayout.vue`, `esp.ts`, `sensor.store.ts`, `useESPStatus.ts`

---

## BEREICH 1: Notification/Alert-System

### Datenfluesse

**Initial Load (REST)** — `notification-inbox.store.ts:146-172`:
- `notificationsApi.list({ page: 1, page_size: 50 })` + `notificationsApi.getUnreadCount()` parallel
- Getriggert von `NotificationDrawer.vue:122-131` via `watch(inboxStore.isDrawerOpen)`

**Real-time (WebSocket)** — `esp.ts:1604-1607`:
```
ws.on('notification_new')          -> inboxStore.handleWSNotificationNew()
ws.on('notification_updated')      -> inboxStore.handleWSNotificationUpdated()
ws.on('notification_unread_count') -> inboxStore.handleWSUnreadCount()
```

**Alert Stats (Polling)** — `alert-center.store.ts:186-191`: 30s Interval via `setInterval`. Gestartet in `AlertStatusBar.vue:33` (onMounted) UND in `App.vue` bei Login.

### Status-Tabs (active/acknowledged/resolved)

`NotificationDrawer.vue:55-67` — `statusTabs` computed:
```typescript
const active = stats?.active_count ?? inboxStore.notifications.filter(n => n.status === 'active').length
const ack = stats?.acknowledged_count ?? ...
const resolved = inboxStore.notifications.filter(n => n.status === 'resolved').length
```

**Problem IC-02:** `resolved` zaehlt nur geladene Inbox-Items (max 50). `active` und `ack` kommen aus REST-Stats (alle Items systemweit). Inkonsistente Zaehlbasis.

### Parallele Filter-Systeme

`NotificationDrawer.vue:36`: lokale `activeStatusFilter ref<StatusFilter>` (active/acknowledged/resolved) parallel zu `inboxStore.activeFilter` (Severity: all/critical/warning/system). Beide aktiv gleichzeitig. Dazu kommt `inboxStore.sourceFilter` als drittes AND-Glied. Drei parallele Filter-Dimensionen.

### Acknowledge/Resolve

- `NotificationDrawer.vue:94-100`: `alertStore.acknowledgeAlert(id)` / `alertStore.resolveAlert(id)`
- `QuickAlertPanel.vue:115-138`: gleiche Actions + Batch-Ack

### Quick-Alert-Panel

Datenquelle: `inboxStore.notifications` direkt (kein eigener Fetch). Top 5 nach Severity sortiert, Status-gefiltert. `QuickAlertPanel.vue:80-94`.

### Badge-Zahl

`NotificationBadge.vue:26-33`:
```typescript
const badgeCount = computed(() => {
  const unresolvedAlerts = alertStore.unresolvedCount  // active + acknowledged aus REST-Stats
  return unresolvedAlerts > 0 ? unresolvedAlerts : inboxStore.unreadCount
})
const hasBadge = computed(() => badgeCount.value > 0 && espStore.devices.length > 0)
```

Beim App-Start (alertStats noch null): Badge = `inboxStore.unreadCount`. Nach erstem Poll: Badge = `active + acknowledged`. Kann visuell springen.

### AlertStatusBar Polling-Bug

`AlertStatusBar.vue:37` ruft `alertStore.stopStatsPolling()` in `onUnmounted`. Da `statsPollTimer` eine einzige Modulvariable in `alert-center.store.ts:44` ist, loescht das auch den von `App.vue` gestarteten globalen Timer. **Bug IC-01:** Drawer schliessen stoppt das globale Polling.

---

## BEREICH 2: Cross-View-Konsistenz

### DeviceMiniCard.vue — Daten

**Sensor-Count** `DeviceMiniCard.vue:153-159`:
```typescript
const sensorCount = computed(() => {
  const grouped = groupSensorsByBaseType(sensors)
  return grouped.reduce((sum, g) => sum + g.values.length, 0)
})
```
Count = gruppierte Values (SHT31 = 2). Konsistent mit `extraSensorsCount` (Zeile 137-143).

**Live-Werte:** Reaktiv aus `props.device` -> `espStore.devices`. WS-Events mutieren `device.sensors[].raw_value` via `sensor.store.ts:handleSensorData()`. Kein eigener WS-Handler in Komponente.

### ESPOrbitalLayout / Orbital (L2)

`ESPOrbitalLayout.vue:126-128`:
```typescript
const sensors = computed<MockSensor[]>(() => (props.device?.sensors as MockSensor[]) || [])
```

`SensorColumn.vue:82`:
```typescript
:value="sensor.processed_value ?? sensor.raw_value ?? 0"
```

Identische Datenquelle wie DeviceMiniCard: `espStore.devices.sensors[]`.

**Inkonsistenz IC-04:** Multi-Value-Darstellung divergiert zwischen Views:
- `DeviceMiniCard`: nutzt `groupSensorsByBaseType(sensors)` — liest `sensor.raw_value` und `sensor.sensor_type`
- `SensorSatellite`: nutzt `props.multiValues` (`sensor.multi_values` Record)

Fuer **Real-ESPs (Post-Fix1)**: Separate `MockSensor`-Eintraege pro Value-Type (sht31_temp, sht31_humidity). `multi_values` ist null. SensorSatellite zeigt Single-Value. DeviceMiniCard gruppiert korrekt.

Fuer **Legacy-Mock-ESPs** (handleKnownMultiValueSensor-Pfad): Ein Eintrag mit `multi_values = { sht31_temp: {...}, sht31_humidity: {...} }`. SensorSatellite Multi-Value korrekt. DeviceMiniCard liest nur `raw_value` (primaer).

### Monitor-View — Stale-Daten-Problem (HIGH)

Monitor L2 laedt via `zonesApi.getZoneMonitorData(zoneId)` beim Zone-Wechsel — REST-Snapshot. `SensorCard` rendert aus diesen Daten. WS-Events (`sensor_data`) mutieren `espStore.devices`, **nicht** die Monitor-L2-Daten.

**IC-05:** Sensorwerte in Monitor L2 werden nicht live aktualisiert. L1 (DeviceMiniCard) und Orbital zeigen Live-WS-Werte. Monitor L2 zeigt Snapshot vom letzten Zone-Wechsel.

Einzige Live-Komponente in Monitor L2: `useSparklineCache` fuer Sparklines. Der Hauptwert in SensorCard bleibt eingefroren.

### LiveDataPreview.vue

`LiveDataPreview.vue:73-85`: Direkte WS-Subscription via `websocketService.subscribe()`, kein Store-Zugriff. Multi-Value-Filter via `props.sensorType` (case-insensitive, Zeile 53-54). Cleanup in `onUnmounted` korrekt. Eigenstaendig von Store-Pipeline.

---

## BEREICH 3: Bekannte Luecken

### FL-03: Aktoren in DeviceMiniCard fehlen — Code-Beweis

`DeviceMiniCard.vue` — kein Aktor-Code vorhanden:
- Keine `actuators`-Variable, kein `device.actuators`-Zugriff
- Keine Aktor-Computed Properties
- Template Zeile 228: `<span v-if="sensorCount > 0">{{ sensorCount }}S</span>` — nur Sensor-Count
- Template Zeile 236-256: nur `device-mini-card__sensors`-Block

Root Cause: Bewusste Entscheidung beim L1-Redesign (v9.4). Aktoren wurden ausgelassen.

### Status-Dot Logik

`useESPStatus.ts:77-107` — pure function `getESPStatus(device: ESPDevice)`:

```
Priority 1: device.status === 'error'     -> 'error'
            device.status === 'safemode'   -> 'safemode'
            device.status === 'online'     -> 'online'
            device.connected === true      -> 'online'
            device.status === 'offline'    -> 'offline'

Priority 2: device.status === 'approved'  -> last_seen Pruefung (< 5min = online)

Priority 3: Heartbeat-Timing via last_seen || last_heartbeat
            < 90s  -> 'online'
            < 300s -> 'stale'
            >= 300s -> 'offline'
            kein ts -> 'unknown'
```

Farben (`useESPStatus.ts:30-67`):
- online: `var(--color-success)` + pulse=true
- stale: `var(--color-warning)` + pulse=false
- offline: `var(--color-text-muted)` + pulse=false
- error: `var(--color-error)` + pulse=false
- safemode: `var(--color-warning)` + pulse=false
- unknown: `var(--color-text-muted)` + pulse=false

Verwendung in `DeviceMiniCard.vue:53-57`:
```typescript
const deviceStatus = computed<ESPStatus>(() => getESPStatus(props.device))
const statusColor = computed(() => statusDisplay.value.color)
```

Template Zeile 219-226: Dot-Farbe via `:style="{ backgroundColor: statusColor }"`.

`getESPStatus` ist pure function — kann in v-for ohne Composable-Constraint aufgerufen werden. Konsistent in DeviceMiniCard, ZonePlate, espStore.onlineDevices/offlineDevices eingesetzt.

---

## Zusammenfassung gefundener Probleme

| ID | Severity | Datei:Zeile | Problem |
|----|----------|-------------|---------|
| IC-01 | Medium | `alert-center.store.ts:44`, `AlertStatusBar.vue:37` | Drawer-close loescht globalen Poll-Timer aus App.vue (stopStatsPolling auf shared timer) |
| IC-02 | Medium | `NotificationDrawer.vue:59` | resolved-Count aus lokalem Array (<= 50), active/ack aus REST-Stats (alle) |
| IC-03 | Low | `NotificationDrawer.vue:36` | Drei parallele Filter-Dimensionen (Severity-Store, Status-lokal, Source-Store) |
| IC-04 | Low | `sensor.store.ts:156` vs `DeviceMiniCard.vue:116` | Multi-Value: Legacy-Pfad (multi_values) vs Post-Fix1-Pfad (separate Eintraege) |
| IC-05 | High | MonitorView (zonesApi.getZoneMonitorData) | Monitor L2: REST-Snapshot statt Live-WS-Werte — Sensorwerte eingefroren |
| FL-03 | Medium | `DeviceMiniCard.vue:112-256` | Aktoren fehlen komplett in L1 MiniCard |

## Empfehlung

- IC-05 (High): SensorCard in Monitor L2 auf espStore.devices anbinden ODER WS-Handler fuer Monitor-Daten
- IC-01 (Medium): AlertStatusBar pruefen ob globalTimer laeuft bevor eigenem startStatsPolling
- FL-03 (Medium): DeviceMiniCard um Aktor-Block erweitern
- IC-02 (Medium): resolved via eigenen REST-Call laden (nicht aus lokalem Array)

## Modus: A (Analyse)

### FRUEHERER REPORT-INHALT (archiviert)
## Auftrag: Root-Cause-Analyse fuer BUG-4, BUG-10, FL-01, FL-03, LiveDataPreview, Store
## Datum: 2026-03-08

---

## Codebase-Analyse

Analysierte Dateien:
- `El Frontend/src/components/dashboard/DeviceMiniCard.vue` (574 Zeilen)
- `El Frontend/src/components/esp/SensorConfigPanel.vue` (880+ Zeilen)
- `El Frontend/src/components/esp/LiveDataPreview.vue` (176 Zeilen)
- `El Frontend/src/components/esp/ESPSettingsSheet.vue` (300+ Zeilen analysiert)
- `El Frontend/src/stores/esp.ts` (350+ Zeilen analysiert)
- `El Frontend/src/api/esp.ts` (Actuator-Mapping analysiert)
- `El Frontend/src/api/sensors.ts` (vollstaendig)
- `El Frontend/src/types/index.ts` (MockActuator, MockSensor, MockESP Interfaces)
- `El Frontend/src/views/HardwareView.vue` (1018+ Zeilen analysiert)

---

## BUG-4: Config-Panel zeigt keine Actuators in "Geraete nach Subzone"

### Exakte Datei + Zeile
**Datei:** `El Frontend/src/components/esp/ESPSettingsSheet.vue`
**Zeilen:** 212-223 (Actuator-Loop in `devicesBySubzone` computed)

**Ursache liegt aber in:** `El Frontend/src/api/esp.ts` Zeilen 269-282

### Code-Snippet — Problematische Stelle

```typescript
// api/esp.ts Zeile 269-282: mapActuatorConfigToMockActuator
function mapActuatorConfigToMockActuator(config: ActuatorConfigResponse): MockActuator {
  return {
    gpio: config.gpio,
    actuator_type: config.actuator_type,
    name: config.name || null,
    state: config.is_active ?? false,
    pwm_value: config.current_value ?? 0,
    emergency_stopped: false,
    last_command: config.last_command_at || null,
    config_status: config.config_status as MockActuator['config_status'],
    config_error: config.config_error || null,
    config_error_detail: config.config_error_detail || null,
    // FEHLT: subzone_id ist NICHT gemappt!
  }
}
```

ESPSettingsSheet.vue Zeile 212-214 greift darauf zu:
```typescript
for (const actuator of deviceActuators) {
  const szId = (actuator as any).subzone_id ?? deviceSubzoneId ?? null
  // subzone_id ist IMMER undefined -> Fallback auf ESP-Level subzone_id
```

### Root Cause

`MockActuator` Interface in `types/index.ts` Zeilen 295-310 hat **kein `subzone_id` Feld**:

```typescript
export interface MockActuator {
  gpio: number
  actuator_type: string
  name: string | null
  state: boolean
  pwm_value: number
  emergency_stopped: boolean
  last_command: string | null
  config_status?: 'pending' | 'applied' | 'failed' | null
  config_error?: string | null
  config_error_detail?: string | null
  // subzone_id FEHLT im Interface!
}
```

Kausalkette:
1. `ActuatorConfigResponse` vom Server enthaelt (ggf.) `subzone_id`
2. `mapActuatorConfigToMockActuator()` uebersetzt es NICHT in `MockActuator`
3. `ESPSettingsSheet.devicesBySubzone` liest `(actuator as any).subzone_id` — ist `undefined`
4. Fallback `?? deviceSubzoneId` greift auf ESP-Level-Subzone (nicht Aktor-Subzone)
5. Alle Aktoren landen in derselben Subzone-Gruppe (ESP-Level oder null)

**Wichtig:** Aktoren verschwinden nicht gaenzlich — sie erscheinen in "Keine Subzone" oder der ESP-Level-Subzone. Das Symptom "GPIO 27 fehlt" deutet darauf hin, dass die Subzone-Gruppe mit diesem Aktor entweder leer angezeigt wird oder der Aktor gar nicht im `deviceActuators` Array landet.

**Weiterer moeglicher Grund:** Bei Real-ESPs ruft `enrichDbDevicesWithActuators()` `actuatorsApi.list({ page_size: 100 })` auf. Falls der Aktor auf Seite 2 liegt (> 100 Aktoren), wird er nie geladen. Bei normalen Installationen kein Problem, aber der `page_size: 100` Hard-Limit ist ein Risikofaktor.

### Fix-Vorschlag

**Schritt 1 — `MockActuator` Interface erweitern** (`types/index.ts` nach Zeile 310):
```typescript
export interface MockActuator {
  ...
  config_error_detail?: string | null
  /** Subzone assignment ID (optional) */
  subzone_id?: string | null
  /** Human-readable subzone name (optional) */
  subzone_name?: string | null
}
```

**Schritt 2 — Mapping erweitern** (`api/esp.ts` Zeile 280-281):
```typescript
function mapActuatorConfigToMockActuator(config: ActuatorConfigResponse): MockActuator {
  return {
    ...
    config_error_detail: config.config_error_detail || null,
    subzone_id: (config as any).subzone_id ?? null,   // NEU
    subzone_name: (config as any).subzone_name ?? null, // NEU
  }
}
```

**Voraussetzung:** Server muss `subzone_id` in `ActuatorConfigResponse` liefern. Server-Dev-Analyse empfohlen.

---

## BUG-10: MiniCard Count falsch ("3S" statt "4S")

### Exakte Datei + Zeile
**Datei:** `El Frontend/src/components/dashboard/DeviceMiniCard.vue`
**Zeilen:** 153-159

### Code-Snippet — Aktuelle Implementation

```typescript
// Zeile 153-159
const sensorCount = computed(() => {
  const sensors = props.device.sensors as RawSensor[] | undefined
  if (!sensors || sensors.length === 0) return props.device.sensor_count ?? 0
  const grouped = groupSensorsByBaseType(sensors)
  return grouped.reduce((sum, g) => sum + g.values.length, 0)
})
```

### Root Cause

Zwei moegliche Ursachen:

**Ursache A — `sensors[]` kuenftiger Sensor fehlt:** Wenn ein Sensor `config_status: 'pending'` hat (ESP hat Konfiguration noch nicht bestaetigt), zaehlt er in `device.sensor_count` (DB-Wert vom Server), erscheint aber moeglicherweise nicht im `device.sensors[]` Array — je nach Server-Implementierung. Der computed-Fallback (`return props.device.sensor_count ?? 0`) greift nur wenn `sensors` komplett leer ist, nicht wenn ein Element fehlt.

**Ursache B — `groupSensorsByBaseType()` zaehlt falsch:** Bei einem Sensor mit unbekanntem `sensor_type` (nicht in `SENSOR_TYPE_CONFIG`) koennte die Gruppe leer bleiben oder der Sensor wird als Single-Value mit 1 Value gezaehlt. Wenn ein Sensor-Typ faelschlicherweise als Multi-Value behandelt wird aber nur 1 Value hat, stimmt der Count.

**Konkretes Szenario "3S statt 4S":** Ein pending Sensor (z.B. der 4. DS18B20) ist in `sensor_count = 4` enthalten, aber `sensors[]` hat nur 3 Eintraege weil der pending-Sensor noch nicht vom Server im enriched Array geliefert wird. `groupSensorsByBaseType([3 sensors]).values.length` = 3 → "3S". Korrekt waere "4S".

### Fix-Vorschlag

```typescript
// Zeile 153-159: Sicherheits-Fallback
const sensorCount = computed(() => {
  const sensors = props.device.sensors as RawSensor[] | undefined
  if (!sensors || sensors.length === 0) return props.device.sensor_count ?? 0
  const grouped = groupSensorsByBaseType(sensors)
  const groupedCount = grouped.reduce((sum, g) => sum + g.values.length, 0)
  // Verwende hoeheren Wert: sensor_count zaehlt pending configs mit
  return Math.max(groupedCount, props.device.sensor_count ?? 0)
})
```

**Langfristiger Fix:** Server sollte pending Sensoren im enriched `sensors[]` Array liefern (mit `config_status: 'pending'` Marker), damit der Frontend-Count konsistent ist.

---

## FL-01: "+Zone" Button disabled

### Exakte Datei + Zeile
**Datei:** `El Frontend/src/views/HardwareView.vue`
**Zeilen:** 885-894

### Code-Snippet — Problematische Stelle

```html
<!-- Zeile 885-894 -->
<button
  v-if="!showCreateZoneForm"
  class="zone-create-btn"
  :disabled="unassignedDevices.length === 0"
  :title="unassignedDevices.length === 0 ? 'Keine unzugewiesenen ESPs vorhanden' : 'Neue Zone erstellen'"
  @click="showCreateZoneForm = true"
>
  <Plus class="zone-create-btn__icon" />
  Zone erstellen
</button>
```

### Root Cause

**Intentionelles Design — aber unklare UX.**

Das Formular (Zeilen 847-882) erfordert ein ESP aus `unassignedDevices` Dropdown:
```typescript
// Zeile 376-397: handleZoneCreate
async function handleZoneCreate() {
  const name = newZoneName.value.trim()
  if (!name || !selectedEspForNewZone.value) return  // ESP Pflichtfeld!
  const zoneId = generateZoneId(name)
  await zonesApi.assignZone(selectedEspForNewZone.value, { zone_id: zoneId, zone_name: name })
}
```

Zonen sind **keine eigenstaendigen Datenbank-Entitaeten** in diesem System — sie entstehen durch die ESP-Zuweisung. Der `zone_id` und `zone_name` werden in `esp_devices.zone_id` und `esp_devices.zone_name` gespeichert. Eine "leere Zone" ohne ESP kann daher technisch nicht existieren (ohne Backend-Aenderung).

**Warum disabled erscheint:** Der User hat alle ESPs Zonen zugewiesen. Jetzt will er eine neue Zone erstellen, sieht aber einen disabled Button ohne klaren Erklaerungstext.

### Fix-Vorschlag

**Option A (Quick Win — nur Frontend):** Tooltip-Text verbessern:
```html
:title="unassignedDevices.length === 0
  ? 'Alle ESPs sind bereits Zonen zugewiesen. ESP zuerst aus einer Zone entfernen (in Unzugewiesen-Leiste ziehen), dann neue Zone erstellen.'
  : 'Neue Zone erstellen'"
```

**Option B (Vollstaendige Loesung — Backend noetig):** Neuer `POST /zone/zones` Endpoint der eine Zone ohne initialen ESP erstellt. Dann:
```typescript
async function handleZoneCreate() {
  const name = newZoneName.value.trim()
  if (!name) return
  if (selectedEspForNewZone.value) {
    // Klassischer Pfad: Zone per ESP-Zuweisung erstellen
    await zonesApi.assignZone(selectedEspForNewZone.value, { zone_id: zoneId, zone_name: name })
  } else {
    // Neuer Pfad: Leere Zone im ZoneContext erstellen
    await zonesApi.createZone({ zone_id: zoneId, zone_name: name })
  }
}
```

---

## FL-03: Aktoren auf L1 MiniCard fehlen

### Exakte Datei + Zeile
**Datei:** `El Frontend/src/components/dashboard/DeviceMiniCard.vue`
**Zeilen:** 237-257 (Template — keine Aktor-Sektion vorhanden)

### Code-Snippet — Fehlende Stelle

```html
<!-- Zeile 237-257: NUR Sensor-Zeilen, kein Aktor-Abschnitt -->
<div v-if="sensorDisplays.length > 0" class="device-mini-card__sensors">
  <div v-for="(sensor, idx) in sensorDisplays" ...>
    <!-- Sensor-Daten -->
  </div>
  <div v-if="extraSensorsCount > 0" class="device-mini-card__sensors-overflow">
    +{{ extraSensorsCount }} weitere
  </div>
</div>
<!-- Kein <div v-if="actuatorDisplays.length > 0"> folgt -->
```

### Root Cause

**Feature-Gap — DeviceMiniCard wurde nie fuer Aktor-Anzeige konzipiert.**

Im Script-Block gibt es kein `actuatorDisplays` computed. `SENSOR_ICON_MAP` enthaelt zwar Icons wie `ToggleLeft` (Aktor-tauglich), aber die werden nur fuer Sensoren genutzt.

Die Aktor-Daten sind technisch vorhanden:
- Mock-ESPs: `device.actuators` kommt direkt aus debug-store
- Real-ESPs: `device.actuators` nach `enrichDbDevicesWithActuators()`

Sie werden nur nie gerendert.

### Fix-Vorschlag

In DeviceMiniCard.vue folgende Ergaenzungen:

**Script (nach `extraSensorsCount` computed, ca. Zeile 143):**
```typescript
const MAX_VISIBLE_ITEMS = 4  // Kombiniertes Limit Sensoren + Aktoren

const actuatorDisplays = computed(() => {
  const actuators = (props.device.actuators as MockActuator[] | undefined)
  if (!actuators || actuators.length === 0) return []

  // Restliches Platzbudget nach Sensoren
  const sensorSlots = sensorDisplays.value.length
  const remainingSlots = Math.max(0, MAX_VISIBLE_ITEMS - sensorSlots)
  if (remainingSlots === 0) return []

  return actuators.slice(0, remainingSlots).map(a => ({
    label: a.name || a.actuator_type,
    state: a.state ? 'EIN' : 'AUS',
    stateColor: a.state ? 'var(--color-success)' : 'var(--color-text-muted)',
    icon: resolveIcon('ToggleLeft'),
  }))
})
```

**Template (nach dem sensors-Block, vor actions-Block):**
```html
<!-- Actuator rows -->
<div v-if="actuatorDisplays.length > 0" class="device-mini-card__sensors">
  <div
    v-for="(act, idx) in actuatorDisplays"
    :key="`act-${idx}`"
    class="device-mini-card__sensor"
  >
    <component :is="act.icon" class="device-mini-card__sensor-icon" />
    <span class="device-mini-card__sensor-name" :title="act.label">{{ act.label }}</span>
    <span class="device-mini-card__sensor-value" :style="{ color: act.stateColor }">{{ act.state }}</span>
  </div>
</div>
```

**Import hinzufuegen** (Zeile 20-22, `MockActuator` Type):
```typescript
import type { MockActuator } from '@/types'
```

---

## LiveDataPreview — Analyse

### Datei
**Datei:** `El Frontend/src/components/esp/LiveDataPreview.vue` (176 Zeilen)

### Status: Kein kritischer Bug

Die Komponente ist korrekt implementiert:
- Zeile 25-28: Props mit `sensorType?: string` fuer Multi-Value-Filter vorhanden
- Zeile 53-54: Case-insensitive sensor_type Vergleich korrekt
- Zeile 73-85: Subscribe/Unsubscribe Pattern korrekt mit Cleanup

### Identifizierte Verbesserungspunkte

**1. Kein Initial-Value (nicht kritisch):**
Die Komponente startet immer mit `--`. Erster echter Wert kommt erst mit naechster WS-Message. Bei langsamen Sensoren (z.B. 30s Intervall) sieht der User 30 Sekunden lang `--`.

**2. `tokens.accent` Dependency (Risiko):**
```typescript
import { tokens } from '@/utils/cssTokens'
// ...
:color="tokens.accent"
```
Falls `@/utils/cssTokens` nicht existiert oder `accent` undefiniert ist, gibt es einen Laufzeitfehler. Diese Datei sollte geprueft werden.

**3. Subscription vs. on() Pattern:**
Zeile 74: `websocketService.subscribe()` (Filter-basiert). Laut SKILL.md v9.60 kann Doppel-Dispatch entstehen wenn gleichzeitig eine Subscription UND ein on()-Listener aktiv sind. Da LiveDataPreview nur subscribe() nutzt, sollte das kein Problem sein — aber konsistenter waere `ws.on()` Pattern wie in anderen Komponenten.

### Fix-Vorschlag fuer Initial-Value (optional)

```typescript
onMounted(async () => {
  subscriptionId = websocketService.subscribe(
    { types: ['sensor_data'], esp_ids: [props.espId] },
    handleMessage,
  )

  // Initial: Letzten bekannten Wert laden
  try {
    const { sensorsApi } = await import('@/api/sensors')
    const result = await sensorsApi.queryData({
      esp_id: props.espId,
      gpio: props.gpio,
      ...(props.sensorType ? { sensor_type: props.sensorType } : {}),
      limit: 1,
    })
    if (result.readings?.length > 0) {
      currentValue.value = result.readings[0].value
      quality.value = result.readings[0].quality ?? 'unknown'
    }
  } catch {
    // Kein historischer Wert — auf Live-Update warten
  }
})
```

---

## Store-Analyse (esp.ts)

### Datenladefluss

```
espStore.fetchAll()
  ↓
espApi.listDevices()
  ↓
  ├── GET /debug/mock-esp          → Mock ESPs (in-memory, sensors+actuators direkt)
  ├── GET /esp/devices             → DB ESPs (nur sensor_count, actuator_count)
  ├── enrichDbDevicesWithSensors() → sensorsApi.list() → device.sensors[]
  └── enrichDbDevicesWithActuators() → actuatorsApi.list({ page_size: 100 }) → device.actuators[]
  ↓
devices.value = dedupedDevices
```

### sensor_count Berechnung

**Mock-ESPs** (api/esp.ts Zeile 402):
```typescript
sensor_count: mock.sensors?.length || 0
```
Direkt aus in-memory Store — keine DB-Abfrage. Immer konsistent mit `sensors[]`.

**DB-ESPs:**
- `sensor_count` kommt vom Server (Datenbankwert, zaehlt ALLE Sensoren inkl. pending)
- Nach `enrichDbDevicesWithSensors()` ist `device.sensors[]` befuellt
- `sensor_count` wird NICHT ueberschrieben nach Enrichment

**Inkonsistenz-Risiko:** Wenn Server in `sensor_count` Sensoren mit `config_status: 'pending'` zaehlt, aber `enrichDbDevicesWithSensors()` diese nicht ins Array aufnimmt, divergieren die Werte. Das erklaert BUG-10.

### WebSocket Handler fuer Sensor/Aktor-Updates

Der ESP Store registriert via `useWebSocket()` Hook (Zeile 129-144) Filter auf `['esp_health', 'sensor_data', 'actuator_status', ...]`. Die `sensor_data` Handler-Logik liegt seit v9.60 im `sensor.store.ts` (shared). Der esp-Store behandelt nur Device-Level-Events (health, discovery, config_response).

Aktor-Updates via `actuator_status` Events werden im Store verarbeitet und aktualisieren den `device.actuators[gpio].state` direkt ohne API-Call.

---

## Qualitaetspruefung (8-Dimensionen — Analyse Only)

| # | Dimension | Befund |
|---|-----------|--------|
| 1 | Struktur & Einbindung | Alle Komponenten korrekt eingebunden |
| 2 | Namenskonvention | Korrekt (PascalCase, camelCase) |
| 3 | Rueckwaertskompatibilitaet | BUG-4 Fix braucht Type-Erweiterung — additive, kein Breaking Change |
| 4 | Wiederverwendbarkeit | DeviceMiniCard wird konsistent wiederverwendet |
| 5 | Speicher & Ressourcen | LiveDataPreview Cleanup korrekt, keine Leaks erkannt |
| 6 | Fehlertoleranz | sensor_count Fallback vorhanden; subzone_id Fallback unzulaenglich |
| 7 | Seiteneffekte | MockActuator Type-Erweiterung betrifft alle Nutzerstellen |
| 8 | Industrielles Niveau | FL-01 intentionell, aber schlechte UX ohne erklaerenden Text |

---

## Cross-Layer Impact

| Aenderung | Betrifft | Aktion |
|-----------|---------|--------|
| BUG-4: `MockActuator.subzone_id` | `ActuatorConfigResponse` Server-Schema | server-dev pruefen ob Feld bereits existiert |
| BUG-4: `mapActuatorConfigToMockActuator()` | Nur Frontend api/esp.ts | Sicher, additive |
| BUG-10: `sensorCount` computed | Nur DeviceMiniCard | Lokale Aenderung, sicher |
| FL-01: Tooltip-Text | Nur HardwareView.vue Template | Kein Risiko |
| FL-03: Aktor-Zeilen in MiniCard | `MockActuator` Type-Import noetig | Sicher |
| LiveDataPreview Initial-Load | `sensorsApi.queryData()` API | Kein Breaking Change |

---

## Ergebnis: Bug-Tabelle

| Bug | Root Cause Zusammenfassung | Exakte Stelle |
|-----|---------------------------|---------------|
| BUG-4 | `MockActuator` Interface hat kein `subzone_id`; Mapping-Funktion uebersetzt es nicht | `types/index.ts:295` + `api/esp.ts:269` |
| BUG-10 | `sensor_count` (DB) > `sensors[].length` bei pending-Sensoren; grouped count unterschaetzt | `DeviceMiniCard.vue:154-159` |
| FL-01 | Button intentionell disabled (Zone braucht initialen ESP); UX erklaert das nicht | `HardwareView.vue:888` |
| FL-03 | Feature-Gap: Kein Template-Block fuer Aktoren in DeviceMiniCard | `DeviceMiniCard.vue:237-257` |
| LiveDataPreview | Kein kritischer Bug; kein Initial-Value-Load; `tokens.accent` Dependency pruefen | `LiveDataPreview.vue:73-85` |

## Verifikation

Analyse-Modus — kein Code geaendert, kein Build noetig.

## Empfehlung naechster Agent

Fuer BUG-4: `server-dev` pruefen ob `ActuatorConfigResponse` bereits `subzone_id` enthaelt, dann `frontend-dev` fuer Implementation.
Fuer FL-01 Option B: `server-dev` fuer neuen `POST /zone/zones` Endpoint.
