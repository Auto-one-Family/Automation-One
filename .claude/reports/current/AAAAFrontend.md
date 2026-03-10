# T13-R3: Frontend-Layout — Zone/Subzone-Einsicht und Multi-Zone-Konfiguration

## Context

T13-R1 (Zone-Konsolidierung) und T13-R2 (Multi-Zone Device-Scope) haben Backend-APIs bereitgestellt:
- Zone CRUD (`/api/v1/zones`) mit status (active/archived/deleted)
- Device Scope (`device_scope`, `assigned_zones` auf Sensor/Actuator Config)
- Device Context (`/api/v1/device-context/`) fuer Active-Zone-Wechsel
- WebSocket-Events: `device_scope_changed`, `device_context_changed`

Das Frontend nutzt diese APIs noch **nicht**. Zonen kommen aus ESP-Device-Aggregation, `device_scope` existiert nirgends im Frontend, kein Zone-Filter in Monitor, keine Scope-Spalte in Components Tab.

**Ziel:** Frontend vollstaendig an T13-R1/R2 Backend anbinden — Zone-Entitaeten, Archiv, Multi-Zone-Konfiguration, Filter, Badges.

---

## Phase 0: Backend-Prerequisite-Check (VOR jeder Implementierung)

Jeder WP beginnt mit einer Verifikation, dass die benoetigten Backend-APIs existieren und korrekt antworten. Bei fehlenden Prerequisites → Auftrag abbrechen und melden.

| Prerequisite | Check-Methode | Benoetigt fuer |
|-------------|---------------|----------------|
| `GET /api/v1/zones` liefert `zones[]` mit `status` Feld | `curl localhost:8000/api/v1/zones` | WP1, WP2 |
| `POST /api/v1/zones` erstellt Zone-Entitaet | Testaufruf | WP2 |
| `POST /api/v1/zones/{id}/archive` archiviert Zone | Testaufruf | WP2 |
| `device_scope` + `assigned_zones` in Sensor/Actuator Config Response | `curl GET /api/v1/sensors/{id}/{gpio}` | WP4 |
| `PUT /api/v1/device-context/{type}/{id}` existiert | Testaufruf | WP4 |
| `subzone_strategy` in `POST /zone/devices/{id}/assign` wird akzeptiert | Schema-Check | WP3 |
| WS-Event-Namen exakt: `device_scope_changed`, `device_context_changed` | Backend-Code verifiziert (sensors.py:959, actuators.py:579, device_context.py:114) | WP1 |
| Alembic-Migrationen fuer zone.status und sensor_configs.device_scope angewendet | `alembic current` | WP1 |

**Verifiziert:** WS-Event-Namen sind korrekt (aus Backend-Code bestaetigt).
**Verifiziert:** `subzone_strategy` existiert im Backend (zone_service.py, subzone_repo.py).

---

## Analyse-Ergebnis (Gap-Matrix)

| Feature | IST | SOLL | WP |
|---------|-----|------|----|
| Zone-Quelle L1 | `groupDevicesByZone()` (Device-Aggregation) | `GET /zones` (Zone-Entitaet) | WP2 |
| Zone-Status-Badge | Fehlt | active/archived Badge auf ZonePlate | WP2 |
| Archivierte Zonen L1 | Nicht sichtbar | Eigener Bereich, ausgegraut | WP2 |
| Leere Zonen L1 | Nicht sichtbar | MiniCard mit "0 Geraete" | WP2 |
| Zone CRUD UI | Implizit via ZoneAssignmentPanel | ZoneSettingsSheet (erstellen/archivieren/umbenennen) | WP2 |
| `subzone_strategy` bei Zone-Wechsel | Fehlt | ZoneSwitchDialog (transfer/reset/copy) | WP3 |
| Subzone Sensor/Aktor-Zaehler | Fehlt | Count-Badge in Subzone-Chips | WP3 |
| `device_scope` in ConfigPanels | Fehlt | DeviceScopeSection (Lokal/Multi-Zone/Mobil) | WP4 |
| Multi-Zone Badges auf Cards | Fehlt | "Multi-Zone"/"Mobil" Badge | WP4 |
| WS-Events scope/context | Nicht registriert | Handler in zone.store.ts | WP1 |
| Zone-Filter Monitor | Fehlt | Dropdown in Monitor-Toolbar | WP5 |
| Scope-Spalte Components Tab | Fehlt | Spalte + Filter | WP5 |
| `MessageType` fuer neue Events | Fehlt | `device_scope_changed`, `device_context_changed` | WP1 |
| Zone Entity Types | Fehlt | `ZoneEntity`, `ZoneEntityCreate`, etc. | WP1 |
| Device Scope Types | Fehlt | `DeviceScope`, `DeviceContextSet`, etc. | WP1 |
| API Client `/zones` CRUD | Fehlt | `createZoneEntity()`, `archiveZoneEntity()`, etc. | WP1 |
| API Client `/device-context` | Fehlt | `deviceContextApi` | WP1 |

---

## Build-Sequenz

```
WP1 (Typen + API + WS) ──→ WP2 (Zone L1 + ZoneSettingsSheet)
                        ├──→ WP3 (Subzone-Zaehler + ZoneSwitchDialog)
                        ├──→ WP4 (DeviceScopeSection + Badges)
                        └──→ WP5 (Filter Monitor + Components Tab)
```

WP1 ist Voraussetzung. WP2-WP5 koennen nach WP1 sequentiell oder teils parallel.

---

## WP1: Typen, API-Client, WS-Events (Fundament)

### 1.1 Neue Types in `El Frontend/src/types/index.ts`

```typescript
// Zone Entity (T13-R1 Backend)
export type ZoneStatus = 'active' | 'archived' | 'deleted'

export interface ZoneEntity {
  id: string              // UUID
  zone_id: string         // Technical slug
  name: string            // Display name
  description: string | null
  status: ZoneStatus
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export interface ZoneEntityCreate {
  zone_id: string
  name: string
  description?: string | null
}

export interface ZoneEntityUpdate {
  name?: string | null
  description?: string | null
}

export interface ZoneEntityListResponse {
  zones: ZoneEntity[]
  total: number
}

// Device Scope (T13-R2 Backend)
export type DeviceScope = 'zone_local' | 'multi_zone' | 'mobile'

export interface DeviceContextSet {
  active_zone_id: string | null
  active_subzone_id?: string | null
  context_source?: 'manual' | 'sequence' | 'mqtt'
}

export interface DeviceContextResponse {
  success: boolean
  config_type: 'sensor' | 'actuator'
  config_id: string
  active_zone_id: string | null
  active_subzone_id: string | null
  context_source: string
  context_since: string | null
}
```

### 1.2 Bestehende Interfaces erweitern

**`SensorConfigCreate`** (Zeile 617): Felder ergaenzen:
- `device_scope?: DeviceScope`
- `assigned_zones?: string[] | null`

**`SensorConfigResponse`** (Zeile 657): Felder ergaenzen:
- `device_scope: DeviceScope | null` (NICHT optional — Backend liefert Feld immer, kann aber null sein fuer alte Records)
- `assigned_zones: string[] | null`

**`ActuatorConfigCreate`** (Zeile 818): Felder ergaenzen:
- `device_scope?: DeviceScope`
- `assigned_zones?: string[] | null`

**`ActuatorConfigResponse`** (Zeile 834): Felder ergaenzen:
- `device_scope: DeviceScope | null` (NICHT optional — Backend liefert Feld immer)
- `assigned_zones: string[] | null`

**`ZoneAssignRequest`** (Zeile 903): Feld ergaenzen:
- `subzone_strategy?: 'transfer' | 'copy' | 'reset'`

**`MessageType`** (Zeile 408): Neue Events:
- `| 'device_scope_changed'`
- `| 'device_context_changed'`
- `| 'subzone_assignment'` (fehlt aktuell, wird aber im esp.store dispatched)

### 1.3 Neue API-Client-Datei: `El Frontend/src/api/device-context.ts`

```typescript
import api from './index'
import type { DeviceContextSet, DeviceContextResponse } from '@/types'

export const deviceContextApi = {
  async setContext(configType: 'sensor' | 'actuator', configId: string, body: DeviceContextSet): Promise<DeviceContextResponse> {
    const response = await api.put<DeviceContextResponse>(`/device-context/${configType}/${configId}`, body)
    return response.data
  },
  async getContext(configType: 'sensor' | 'actuator', configId: string): Promise<DeviceContextResponse> {
    const response = await api.get<DeviceContextResponse>(`/device-context/${configType}/${configId}`)
    return response.data
  },
  async clearContext(configType: 'sensor' | 'actuator', configId: string): Promise<DeviceContextResponse> {
    const response = await api.delete<DeviceContextResponse>(`/device-context/${configType}/${configId}`)
    return response.data
  },
}
```

### 1.4 Zone Entity CRUD in `El Frontend/src/api/zones.ts` ergaenzen

Neue Methoden im bestehenden `zonesApi`-Objekt (nach `getZoneMonitorData`):

```typescript
// Zone Entity CRUD (/v1/zones)
async createZoneEntity(data: ZoneEntityCreate): Promise<ZoneEntity>
async listZoneEntities(status?: ZoneStatus): Promise<ZoneEntityListResponse>
async getZoneEntity(zoneId: string): Promise<ZoneEntity>
async updateZoneEntity(zoneId: string, data: ZoneEntityUpdate): Promise<ZoneEntity>
async archiveZoneEntity(zoneId: string): Promise<ZoneEntity>
async reactivateZoneEntity(zoneId: string): Promise<ZoneEntity>
async deleteZoneEntity(zoneId: string): Promise<{ success: boolean; message: string }>
```

### 1.5 Zone Store erweitern: `El Frontend/src/shared/stores/zone.store.ts`

Neuer State + Actions:

```typescript
// State (NEU)
const zoneEntities = ref<ZoneEntity[]>([])
const isLoadingZones = ref(false)

// Actions (NEU)
async function fetchZoneEntities(status?: ZoneStatus): Promise<void>
async function createZone(data: ZoneEntityCreate): Promise<ZoneEntity>
async function updateZone(zoneId: string, data: ZoneEntityUpdate): Promise<void>
async function archiveZone(zoneId: string): Promise<void>
async function reactivateZone(zoneId: string): Promise<void>

// Getters (NEU)
const activeZones = computed(() => zoneEntities.value.filter(z => z.status === 'active'))
const archivedZones = computed(() => zoneEntities.value.filter(z => z.status === 'archived'))

// WS Handler (NEU)
function handleDeviceScopeChanged(message): void   // Toast + fetchAll
function handleDeviceContextChanged(message): void  // Toast + fetchAll
```

**Architektur-Entscheidung:** Zone Store bekommt eigenen State (`zoneEntities`). Bisher hatte er keinen State — nur WS-Handler. Die WS-Handler fuer `zone_assignment`/`subzone_assignment` bleiben unveraendert (sie arbeiten auf `devices[]` via Dependency Injection). Die neuen Handler `handleDeviceScopeChanged`/`handleDeviceContextChanged` loesen ein `espStore.fetchAll()` Reload aus (defensiv, da scope-Aenderungen die gesamte Device-Darstellung betreffen).

### 1.6 ESP Store WS-Registration: `El Frontend/src/stores/esp.ts`

- `ws.filters.types` Array: `'device_scope_changed'` und `'device_context_changed'` ergaenzen
- WS-Dispatcher: Delegation an `zoneStore.handleDeviceScopeChanged()` / `.handleDeviceContextChanged()`

### 1.7 API Index Export: `El Frontend/src/api/index.ts`

`device-context.ts` exportieren. **Beachte:** Bestehende API-Module (zones.ts, subzones.ts, esp.ts) nutzen `export const xxxApi = { ... }` als Named Export und importieren `api` als Default aus `./index`. Gleiches Pattern fuer device-context.ts verwenden.

**Commit:** `feat(types): T13-R3 WP1 — zone entity types, device scope, API clients, WS events`

---

## WP2: Zone-Status in HardwareView L1

### 2.1 Neue Komponente: `El Frontend/src/components/zones/ZoneSettingsSheet.vue`

SlideOver-Panel analog zu `ESPSettingsSheet.vue`. Benutzt bestehende `SlideOver`-Komponente.

**Sektionen:**
1. Zone-Name (inline editable)
2. Zone-Beschreibung (textarea)
3. Status-Badge (active/archived)
4. Aktions-Buttons:
   - Aktiv → "Archivieren" (mit Confirm-Dialog)
   - Archiviert → "Reaktivieren"
5. Gefahrenzone: "Zone loeschen" (nur wenn 0 Devices)

**Props:** `zone: ZoneEntity`, `isOpen: boolean`, `deviceCount: number`
**Emits:** `close`, `zone-updated`, `zone-archived`, `zone-reactivated`

### 2.2 HardwareView L1 umstellen: `El Frontend/src/views/HardwareView.vue`

**Kernchange:** Zone-Liste aus `zoneStore.zoneEntities` statt `groupDevicesByZone()`.

```typescript
// onMounted ergaenzen
await zoneStore.fetchZoneEntities()

// Neue Computed
const activeZoneEntities = computed(() => zoneStore.activeZones)
const archivedZoneEntities = computed(() => zoneStore.archivedZones)

// Devices pro Zone (aus espStore, wie bisher)
function getDevicesForZone(zoneId: string): ESPDevice[] {
  return filteredEsps.value.filter(d => d.zone_id === zoneId)
}
```

**Template-Aenderungen:**
- Aktive Zonen: `v-for="zone in activeZoneEntities"` → `<ZonePlate :zone-entity="zone" :devices="getDevicesForZone(zone.zone_id)" />`
- Archivierte Zonen: **AccordionSection mit `defaultCollapsed: true`** und localStorage-Persistenz (`ao-archived-zones-open`). Zeigt Header "Archivierte Zonen (N)" als Toggle. Inhalt: `v-for="zone in archivedZoneEntities"` → `<ZonePlate :zone-entity="zone" :is-archived="true" :devices="getDevicesForZone(zone.zone_id)" />`
- Leere Zonen: Werden automatisch sichtbar, da Zone-Entitaeten auch ohne Devices existieren

**FIX FL-01:** "Zone erstellen" Button (Zeile 885-892) hat aktuell `:disabled="unassignedDevices.length === 0"`. Da Zonen jetzt eigenstaendige Entitaeten sind (koennen ohne Devices existieren), MUSS diese Bedingung **entfernt** werden. Button ist immer aktiv. Title-Text anpassen: "Neue Zone erstellen".

**Unassigned-Devices Sektion ERHALTEN:** Die bestehende "Nicht zugewiesen"-Sektion (Zeile 773-843) bleibt vollstaendig unveraendert. `unassignedDevices` Computed (Zeile 321-328) und `localUnassignedDevices` ref bleiben bestehen. Diese Sektion wird weiterhin unter den Zonen angezeigt.

**WICHTIG — `groupDevicesByZone` bleibt erhalten** fuer MonitorView und andere Nutzer. Nur HardwareView wechselt auf Zone-Entitaeten.

### 2.3 ZonePlate erweitern: `El Frontend/src/components/dashboard/ZonePlate.vue`

**Neue Props:**
- `zoneEntity?: ZoneEntity` (optional, fuer Zone-Entitaetsdaten)
- `isArchived?: boolean` (Default: false)

**Visuelle Aenderungen bei `isArchived`:**
- Container: `opacity-60` + `border-dashed`
- Header: "Archiv"-Badge (grau)
- Kein Drag-Drop
- Kein "Neue Subzone"-Button
- Kein Device-Hinzufuegen

**Neues Emit:** `(e: 'zone-settings', zoneId: string): void`
- Settings-Icon-Button im Zone-Header (neben bestehendem Collapse-Toggle)
- **Pattern-Klarstellung:** ZoneSettingsSheet wird von L1 als SlideOver geoeffnet — gleich wie ESPSettingsSheet (akzeptiertes Pattern). L1 zeigt an UND erlaubt SlideOver-Zugriff, L2 ist fuer inline-Konfiguration.

### 2.4 FIX FL-03: DeviceMiniCard Aktor-Count

`El Frontend/src/components/dashboard/DeviceMiniCard.vue` (Zeile 153-157): Zeigt aktuell nur `sensorCount`. Ergaenzen:
- `actuatorCount` Computed (analog zu `sensorCount`, zaehlt `device.actuators`)
- Im Template: Count-Badge aendern zu "3 S / 1 A" oder "3 Sensoren, 1 Aktor"
- Alternativ: Zwei separate Badges oder kombinierter Count

### 2.5 ZoneSettingsSheet in HardwareView einbinden

```typescript
const settingsZone = ref<ZoneEntity | null>(null)
const isZoneSettingsOpen = ref(false)

function openZoneSettings(zoneId: string) {
  settingsZone.value = zoneStore.zoneEntities.find(z => z.zone_id === zoneId) ?? null
  isZoneSettingsOpen.value = !!settingsZone.value
}
```

**Commit:** `feat(zones): T13-R3 WP2 — zone entities in L1, archive section, ZoneSettingsSheet`

---

## WP3: Subzone-Zaehler und Zone-Switch-Dialog

### 3.1 Subzone-Zaehler in ZonePlate

In `ZonePlate.vue`, die bestehende `subzoneGroups`-Computed ergaenzen:

Zaehler pro Subzone-Chip berechnen: `sensorCount` = Summe `device.sensors?.length` fuer Devices in Subzone, `actuatorCount` = Summe `device.actuators?.length`.

Template: Chip-Label wird `"${subzoneName} (${sensorCount}S, ${actuatorCount}A)"` oder Zaehler als kleiner Badge rechts am Chip.

**ACHTUNG (T12-R1 Bug):** Backend `SubzoneInfo.sensor_count`/`actuator_count` kann 0 liefern obwohl Sensoren/Aktoren konfiguriert sind. Deshalb Zaehler aus Frontend-Daten (`device.sensors`, `device.actuators`) berechnen, NICHT aus API-Counts. Akzeptanzkriterium ergaenzen: "Verifiziere dass Counts mit der tatsaechlichen Anzahl uebereinstimmen."

### 3.2 Neue Komponente: `El Frontend/src/components/zones/ZoneSwitchDialog.vue`

Modal-Dialog (benutzt bestehende `BaseModal`-Komponente).

**Props:**
```typescript
interface Props {
  isOpen: boolean
  deviceName: string
  currentZoneName: string
  targetZoneName: string
}
```
**Emits:** `close`, `confirm(strategy: 'transfer' | 'copy' | 'reset')`

**Inhalt:**
- Beschreibungstext: "ESP wechselt von 'X' zu 'Y'"
- RadioGroup mit 3 Optionen:
  - `transfer` (default, empfohlen): "Subzonen und Zuordnungen uebertragen"
  - `reset`: "Subzonen zuruecksetzen — ESP startet ohne Subzonen"
  - `copy`: "Subzonen kopieren — Originale bleiben in alter Zone"
- Abbrechen / Zone wechseln Buttons

### 3.3 ESPSettingsSheet Zone-Wechsel anpassen: `El Frontend/src/components/esp/ESPSettingsSheet.vue`

Wenn User Zone wechselt (Device hat bereits eine Zone):
1. `ZoneSwitchDialog` oeffnen statt direkt `zonesApi.assignZone()`
2. User waehlt Strategy
3. Auf Confirm: `zonesApi.assignZone(espId, { zone_id, zone_name, subzone_strategy })`

Neuer lokaler State:
```typescript
const showZoneSwitchDialog = ref(false)
const pendingZoneAssign = ref<{ zoneId: string; zoneName: string } | null>(null)
```

### 3.4 ZoneAssignmentPanel subzone_strategy unterstuetzen

`El Frontend/src/components/zones/ZoneAssignmentPanel.vue`: Das `ZoneAssignRequest` hat jetzt `subzone_strategy` (WP1). ZoneAssignmentPanel bekommt optionales Prop `subzoneStrategy?: string` das im Request mitgeschickt wird.

**Commit:** `feat(zones): T13-R3 WP3 — subzone counters, ZoneSwitchDialog, subzone_strategy`

---

## WP4: Multi-Zone Device Scope Konfiguration

### 4.1 Neue Komponente: `El Frontend/src/components/devices/DeviceScopeSection.vue`

Wiederverwendbar in SensorConfigPanel + ActuatorConfigPanel (analog zu `SubzoneAssignmentSection.vue`-Pattern).

**Props:**
```typescript
interface Props {
  configId: string | null        // UUID (null wenn neu)
  configType: 'sensor' | 'actuator'
  modelValue: DeviceScope        // v-model
  assignedZones: string[]        // v-model:assigned-zones
  activeZoneId: string | null
  availableZones: ZoneEntity[]
  disabled?: boolean
}
```
**Emits:** `update:modelValue`, `update:assignedZones`

**Template:**
```
┌─────────────────────────────────┐
│ Typ:  [Lokal ▼]                 │  ← BaseSelect mit 3 Optionen
│                                 │
│ (nur bei multi_zone / mobile:)  │
│ Zugewiesene Zonen:              │
│ [✓] Zone A                      │  ← Checkbox-Liste
│ [✓] Zone B                      │
│ [ ] Zone C                      │
│                                 │
│ Aktuell aktiv: [Zone A ▼]       │  ← BaseSelect, ruft deviceContextApi
└─────────────────────────────────┘
```

**Active-Zone-Wechsel:** Beim Dropdown-Change direkt `deviceContextApi.setContext()` aufrufen (nicht Teil des Save-Flows der Config-Panels — sofort wirksam).

**UX-Hinweis (Inkonsistenz vermeiden):** Unterhalb des Active-Zone-Dropdowns einen Info-Text anzeigen: _"Aktive Zone wird sofort gewechselt (ohne Speichern)"_ — damit klar ist, dass Scope-Aenderung Save braucht, Active-Zone aber sofort wirkt. Visuell: `text-xs text-dark-400 italic`.

### 4.2 SensorConfigPanel erweitern: `El Frontend/src/components/esp/SensorConfigPanel.vue`

Neues AccordionSection "Zone-Zuordnung" einbinden (nach SubzoneAssignmentSection):

```vue
<AccordionSection title="Zone-Zuordnung" storage-key="sensor-zone-scope">
  <DeviceScopeSection
    :config-id="sensorDbId"
    config-type="sensor"
    v-model="localScope"
    v-model:assigned-zones="localAssignedZones"
    :active-zone-id="activeZoneId"
    :available-zones="availableZones"
    :disabled="isSaving"
  />
</AccordionSection>
```

**Lokaler State:**
```typescript
const localScope = ref<DeviceScope>('zone_local')
const localAssignedZones = ref<string[]>([])
const activeZoneId = ref<string | null>(null)
const availableZones = ref<ZoneEntity[]>([])
```

**Init:** Beim Laden der SensorConfig (`sensorConfig.device_scope`, `sensorConfig.assigned_zones`) lokalen State setzen. `availableZones` aus `zoneStore.activeZones`.

**Save:** `localScope` und `localAssignedZones` in `SensorConfigCreate` einbauen beim `handleSave()`.

### 4.3 ActuatorConfigPanel erweitern: `El Frontend/src/components/esp/ActuatorConfigPanel.vue`

Identisches Pattern wie 4.2. Gleiche `DeviceScopeSection` Komponente.

### 4.4 Scope-Badges auf Sensor/Aktor-Cards

**Wo Badges anzeigen:**
- `SensorSatellite.vue` / `ActuatorSatellite.vue` (Orbital View L2): Wenn Config geladen und `device_scope !== 'zone_local'` → Badge anzeigen
- `SensorCard.vue` / `ActuatorCard.vue` (MonitorView L2): Gleiche Logik

**Badge-Darstellung:**
| Scope | Badge-Text | Farbe |
|-------|-----------|-------|
| `zone_local` | (kein Badge) | — |
| `multi_zone` | "Multi-Zone" | `bg-blue-500/20 text-blue-400` |
| `mobile` | "Mobil" | `bg-orange-500/20 text-orange-400` |

Nutze `BaseBadge` Komponente (existiert in `shared/design/`).

**Badge-Slots pruefen:** Vor Implementierung pruefen ob SensorCard.vue / ActuatorCard.vue / SensorSatellite.vue bereits Badge-Slots haben (z.B. aus Subzone-Phase). Falls ja: gleichen Slot nutzen, kein neues Badge-Element daneben bauen.

**Datenquelle:** `device_scope` kommt aus SensorConfigResponse/ActuatorConfigResponse (DB-Daten). Nicht aus MockSensor (Heartbeat). D.h. Badge nur sichtbar wenn Config geladen.

### 4.5 Cross-Zone Sichtbarkeit (vereinfacht)

Multi-Zone-Sensoren in "fremden" Zonen anzeigen ist komplex — haengt davon ab ob das Backend `GET /zone/{zone_id}/monitor-data` bereits Multi-Zone-Geraete aus anderen Zonen liefert.

**Minimalversion fuer WP4:** Tooltip auf Multi-Zone-Badge: "Bedient: Zone A, Zone B" (aus `assigned_zones`). Volle Cross-Zone-Sichtbarkeit (Sensor in fremder Zone als Shared-Card) wird als Stretch-Goal markiert und haengt vom Backend-Verhalten ab.

**Commit:** `feat(zones): T13-R3 WP4 — DeviceScopeSection, scope badges, active zone switching`

---

## WP5: Filter in Monitor und Components Tab

### 5.1 MonitorView Zone-Filter: `El Frontend/src/views/MonitorView.vue`

**VOR-CHECK:** MonitorView nutzt aktuell route-basierte Zone-Selection (`/monitor/:zoneId`). L1 zeigt Zone-Tiles, Klick navigiert zu L2. Kein Dropdown-Filter auf L1 vorhanden. Pruefen ob `WidgetConfigPanel` (Phase 3.3/E3) bereits Zone-Filter hat und diesen ggf. erweitern statt neu bauen.

MonitorView L1 hat bereits `allZones ref<ZoneListEntry[]>`. Ergaenzen:

```typescript
const selectedZoneFilter = ref<string | null>(null)

const filteredZoneTiles = computed(() => {
  if (!selectedZoneFilter.value) return allZones.value
  return allZones.value.filter(z => z.zone_id === selectedZoneFilter.value)
})
```

**Template:** Dropdown ueber Zone-Tile-Grid:
```vue
<BaseSelect v-model="selectedZoneFilter" placeholder="Alle Zonen">
  <option :value="null">Alle Zonen</option>
  <option v-for="z in zoneStore.activeZones" :value="z.zone_id">{{ z.name }}</option>
  <optgroup label="Archiv">
    <option v-for="z in zoneStore.archivedZones" :value="z.zone_id">{{ z.name }} (Archiv)</option>
  </optgroup>
</BaseSelect>
```

Archivierte Zone ausgewaehlt → Hinweis-Banner: "Archivierte Zone — nur historische Daten"

### 5.2 MonitorView L2 Subzone-Filter

MonitorView L2 hat `zoneMonitorData` mit `subzones: SubzoneGroup[]`. Ergaenzen:

```typescript
const selectedSubzoneFilter = ref<string | null>(null)

const filteredSubzones = computed(() => {
  if (!selectedSubzoneFilter.value) return zoneMonitorData.value?.subzones ?? []
  return (zoneMonitorData.value?.subzones ?? []).filter(
    sz => sz.subzone_id === selectedSubzoneFilter.value
  )
})
```

Dropdown unter Zone-Header in L2.

### 5.3 Inventory Store Scope-Felder: `El Frontend/src/shared/stores/inventory.store.ts`

**ComponentItem erweitern:**
```typescript
scope: DeviceScope | null      // NEU
activeZone: string | null      // NEU
```

**INVENTORY_COLUMNS erweitern:**
```typescript
{ key: 'scope', label: 'Scope', sortable: true, defaultVisible: false },
{ key: 'activeZone', label: 'Aktive Zone', sortable: true, defaultVisible: false },
```

**allComponents Computed:** `scope` und `activeZone` Felder befuellen. Da `allSensors`/`allActuators` aus `useZoneGrouping()` kommen (MockSensor-Daten ohne `device_scope`), bleibt `scope: null` als Default. Scope-Enrichment wird lazy ueber einen separaten API-Call implementiert wenn die Scope-Spalte aktiviert wird.

### 5.4 SensorsView Scope-Filter

`El Frontend/src/views/SensorsView.vue`: Neues Filter-Dropdown neben dem bestehenden Zone-Filter:

```typescript
const scopeFilter = ref<DeviceScope | 'all'>('all')
```

**Commit:** `feat(zones): T13-R3 WP5 — monitor zone/subzone filters, inventory scope column`

---

## Dateien-Uebersicht

### Neue Dateien (CREATE)

| Datei | WP |
|-------|----|
| `El Frontend/src/api/device-context.ts` | WP1 |
| `El Frontend/src/components/zones/ZoneSettingsSheet.vue` | WP2 |
| `El Frontend/src/components/zones/ZoneSwitchDialog.vue` | WP3 |
| `El Frontend/src/components/devices/DeviceScopeSection.vue` | WP4 |

### Geaenderte Dateien (MODIFY)

| Datei | WP | Aenderungen |
|-------|----|-------------|
| `El Frontend/src/types/index.ts` | WP1 | ZoneEntity, DeviceScope, DeviceContextSet; MessageType erweitern; SensorConfig/ActuatorConfig um device_scope; ZoneAssignRequest um subzone_strategy |
| `El Frontend/src/api/zones.ts` | WP1 | CRUD-Methoden fuer `/v1/zones` |
| `El Frontend/src/shared/stores/zone.store.ts` | WP1+WP2 | zoneEntities State, CRUD Actions, WS-Handler, Getters |
| `El Frontend/src/stores/esp.ts` | WP1 | WS-Event-Types + Dispatcher-Delegation |
| `El Frontend/src/views/HardwareView.vue` | WP2 | Zone-Quelle umstellen, Archiv-Bereich, ZoneSettingsSheet einbinden |
| `El Frontend/src/components/dashboard/ZonePlate.vue` | WP2+WP3 | isArchived Prop, zone-settings Emit, Subzone-Zaehler |
| `El Frontend/src/components/dashboard/DeviceMiniCard.vue` | WP2 | FIX FL-03: actuatorCount anzeigen |
| `El Frontend/src/components/esp/ESPSettingsSheet.vue` | WP3 | ZoneSwitchDialog vor Zone-Wechsel |
| `El Frontend/src/components/zones/ZoneAssignmentPanel.vue` | WP3 | subzone_strategy Prop durchreichen |
| `El Frontend/src/components/esp/SensorConfigPanel.vue` | WP4 | DeviceScopeSection einbinden |
| `El Frontend/src/components/esp/ActuatorConfigPanel.vue` | WP4 | DeviceScopeSection einbinden |
| `El Frontend/src/views/MonitorView.vue` | WP5 | Zone-Filter + Subzone-Filter |
| `El Frontend/src/shared/stores/inventory.store.ts` | WP5 | scope/activeZone Felder + Spalten |
| `El Frontend/src/views/SensorsView.vue` | WP5 | Scope-Filter-Dropdown |

---

## Kritische Implementierungshinweise

1. **Doppeltes Zone-System:** `/v1/zones` = Zone-Entitaet (CRUD). `/zone/devices/{id}/assign` = ESP-Zuweisung (MQTT-Bridge). Nicht verwechseln. `ZoneSettingsSheet` nutzt ersteres, `ZoneAssignmentPanel` nutzt letzteres.

2. **Zone-Erstellung Reihenfolge:** Erst Zone-Entitaet erstellen (`POST /zones`), DANN ESP zuweisen. Das Backend T13-R1 erwartet, dass die Zone existiert bevor ein Device zugewiesen wird.

3. **`groupDevicesByZone` bleibt:** Nur HardwareView wechselt auf `zoneStore.zoneEntities`. MonitorView, PendingDevicesPanel etc. nutzen weiterhin die bestehende Aggregation.

4. **Scope-Daten nicht im Heartbeat:** `MockSensor` (Live-Daten) hat kein `device_scope`. Das ist ein DB-Feld in `SensorConfigResponse`. DeviceScopeSection muss die Config separat laden.

5. **WS-Handler defensiv:** Neue Events (`device_scope_changed`, `device_context_changed`) sollten bei Fehler nur loggen, nicht den Store-State zerstoeren.

6. **Dark Theme Only:** Alle neuen Komponenten nutzen nur dark-* Tailwind-Klassen.

---

## Verifikation

### Build-Check nach jedem WP

```bash
cd "El Frontend" && npm run build
cd "El Frontend" && npx vue-tsc --noEmit
```

### Manuelle Tests

- L1: Aktive Zonen sichtbar, archivierte Zonen in collapsed AccordionSection
- L1: Leere Zone ohne Devices angezeigt
- L1: "Zone erstellen" Button IMMER aktiv (FL-01 Fix verifizieren)
- L1: DeviceMiniCard zeigt Sensor- UND Aktor-Count (FL-03 Fix verifizieren)
- L1: Unassigned-Devices Sektion weiterhin sichtbar und funktional
- L2: ZoneSettingsSheet oeffnen, Zone umbenennen, archivieren, reaktivieren
- L2: Zone-Wechsel mit ZoneSwitchDialog (subzone_strategy sichtbar)
- L2: SensorConfigPanel → DeviceScopeSection → Scope wechseln → Badge erscheint
- L2: Active-Zone-Wechsel zeigt Info-Text "wird sofort gewechselt"
- Monitor: Zone-Filter-Dropdown funktioniert
- Components Tab: Scope-Spalte einblendbar
- Subzone-Zaehler stimmen mit tatsaechlicher Sensor/Aktor-Anzahl ueberein

### Bestehende Tests

```bash
cd "El Frontend" && npx vitest run
```

Alle bestehenden Tests muessen gruen bleiben nach jedem WP.
