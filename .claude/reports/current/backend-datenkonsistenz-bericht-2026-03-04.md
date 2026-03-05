# Backend-Datenkonsistenz — Vollständiger Analyse-Bericht (Rev. 3)

> **Erstellt:** 2026-03-04  
> **Revision:** 3 — Fix implementiert (Ready-Gate, Fallback nur bei Fehler)  
> **Rev. 2:** Ausführliche Analyse mit frontend-development, server-development, db-inspector, system-control  
> **Auftrag:** `auftrag-backend-datenkonsistenz-vollanalyse.md`  
> **Quellen:** Codebase-Verifikation, DB-Models, REST-API, MQTT-Handler, MonitorView, Composables  
> **Output:** Vollständiger Bericht gemäß Blöcken 1–6 + Einzelheiten-Durchgang

---

## Executive Summary

**Ziel erreicht:** Vollständige Analyse von Datenbank, Backend, MQTT und Frontend für Zone/Subzone/Geräte-Datenfluss.

**Hauptbefund:** Das „Keine Subzone“-Flackern entsteht durch eine **Frontend-Race-Condition**, nicht durch zwei Backend-Logiken. Die Datenbank ist Single Source of Truth; der `GET /zone/{zone_id}/monitor-data` Endpoint existiert und liefert korrekte Daten. Das Frontend rendert jedoch **ohne Ready-Gate**: Während `zoneMonitorData` noch lädt, wird der **Fallback** (useZoneGrouping + useSubzoneResolver) angezeigt. Der Fallback zeigt „Keine Subzone“, weil `useSubzoneResolver` asynchron lädt und `resolverMap` initial leer ist.

**Priorisierter Fix:** MonitorView L2 mit `v-if="!zoneMonitorLoading"` oder Skeleton blockieren, bis API-Response da ist — **kein Fallback-Rendering während des Ladens**.

---

## 1. System-Status (system-control)

| Check | Ergebnis |
|-------|----------|
| Docker Stack | OK — 11 Container laufen (postgres, mqtt, server, frontend, monitoring) |
| automationone-postgres | Up 10h, healthy |
| automationone-server | Up 31min, healthy |
| automationone-frontend | Up 31min, healthy |
| automationone-mqtt | Up 10h, healthy |

**Verifiziert:** Stack läuft. DB-Inspector-Report bestätigt: pg_isready OK, Migration `add_subzone_custom_data` (head), keine Orphaned Records.

---

## 2. Block 1: Datenbank-Inventar (PostgreSQL)

### 2.1 ER-Diagramm (Text/ASCII)

```
┌─────────────────────┐       ┌──────────────────────┐
│ esp_devices         │       │ subzone_configs       │
├─────────────────────┤       ├──────────────────────┤
│ id (UUID PK)        │       │ id (UUID PK)          │
│ device_id (VARCHAR) │◄──────│ esp_id (FK→device_id) │
│ zone_id             │       │ subzone_id            │
│ zone_name           │       │ subzone_name          │
│ master_zone_id      │       │ parent_zone_id        │
│ ...                 │       │ assigned_gpios (JSON) │
└─────────┬───────────┘       │ safe_mode_active      │
          │                   └──────────────────────┘
          │ CASCADE
          ▼
┌─────────────────────┐       ┌──────────────────────┐
│ sensor_configs      │       │ actuator_configs     │
├─────────────────────┤       ├──────────────────────┤
│ id (UUID PK)        │       │ id (UUID PK)          │
│ esp_id (FK→id)      │       │ esp_id (FK→id)        │
│ gpio                │       │ gpio                  │
│ sensor_type         │       │ actuator_type         │
│ (KEIN subzone_id)   │       │ (KEIN subzone_id)     │
└─────────┬───────────┘       └──────────────────────┘
          │
          ▼
┌─────────────────────┐
│ sensor_data         │
├─────────────────────┤
│ sensor_config_id    │
│ raw_value, value    │
│ quality, timestamp  │
└─────────────────────┘

┌─────────────────────┐       ┌──────────────────────┐
│ zone_contexts       │       │ logic_execution_     │
│ (Wissensdatenbank)  │       │ history              │
├─────────────────────┤       ├──────────────────────┤
│ zone_id (UNIQUE)    │       │ rule_id, triggered_at│
│ variety, substrate  │       │ ...                   │
│ growth_phase, ...   │       └──────────────────────┘
└─────────────────────┘
```

### 2.2 Subzone-Zuordnung: assigned_gpios (BK3 bestätigt)

| Tabelle | subzone_id? | assigned_gpios? | Zuordnung |
|---------|-------------|----------------|-----------|
| **sensor_configs** | **NEIN** | — | Nur über subzone_configs.assigned_gpios |
| **actuator_configs** | **NEIN** | — | Nur über subzone_configs.assigned_gpios |
| **subzone_configs** | JA (eigene ID) | **JA (JSON Array)** | Quelle der Zuordnung |

**Code-Verifikation:**
- `El Servador/god_kaiser_server/src/db/models/sensor.py`: Kein `subzone_id`-Feld
- `El Servador/god_kaiser_server/src/db/models/actuator.py`: Kein `subzone_id`-Feld
- `El Servador/god_kaiser_server/src/db/models/subzone.py`: `assigned_gpios: Mapped[List[int]]` (JSON Array)

**Klarstellung:** Es gibt **keine** `subzone_id` auf sensor_configs oder actuator_configs. Die Zuordnung erfolgt ausschließlich über `subzone_configs.assigned_gpios`: Für jede Subzone enthält `assigned_gpios` eine Liste von GPIOs. Ein Sensor/Aktor gehört zur Subzone, wenn `(esp_id, gpio)` in einer Subzone's `assigned_gpios` vorkommt. GPIOs in keiner Subzone → „Keine Subzone“.

### 2.3 subzone_configs — FK und Typen

| Spalte | Typ | FK | Beschreibung |
|--------|-----|-----|--------------|
| esp_id | String(50) | esp_devices.**device_id** (VARCHAR) | Nicht esp_devices.id (UUID)! |
| parent_zone_id | String(50) | Logisch | Muss ESP.zone_id entsprechen |
| assigned_gpios | JSON (List[int]) | — | z.B. [4, 5, 6] |
| subzone_id | String(50) | — | UNIQUE(esp_id, subzone_id) |

**MonitorDataService-Logik:** Lädt Subzonen mit `parent_zone_id == zone_id`. Map `(device_id, gpio) → (subzone_id, subzone_name)` aus `assigned_gpios`.

### 2.4 Tabellen-Übersicht (28 Tabellen)

| Kategorie | Tabellen |
|-----------|----------|
| **Zone/Subzone/Geräte** | esp_devices, subzone_configs, sensor_configs, actuator_configs |
| **Time-Series** | sensor_data, actuator_states, actuator_history, esp_heartbeat_logs |
| **Logic** | cross_esp_logic, logic_execution_history |
| **Wissen** | zone_contexts (subzone_configs.custom_data) |
| **System** | audit_logs, user_accounts, token_blacklist, notifications, plugin_configs, diagnostic_reports, dashboards, system_config, sensor_type_defaults, email_log, ai_predictions, esp_ownership, kaiser_registry, library_metadata |

### 2.5 FK-Kaskaden

| Tabelle | FK → | ON DELETE |
|---------|------|-----------|
| sensor_configs | esp_devices(id) | CASCADE |
| actuator_configs | esp_devices(id) | CASCADE |
| subzone_configs | esp_devices(**device_id**) | CASCADE |
| sensor_data | sensor_configs | CASCADE |
| actuator_states | actuator_configs | CASCADE |

---

## 3. Block 2: REST-Endpoints — Zone, Subzone, Geräte

### 3.1 Zone-Endpoints

| Methode | Pfad | Handler | Service | DB-Operation |
|---------|------|---------|---------|--------------|
| POST | `/zone/devices/{esp_id}/assign` | zone.py | ZoneService | esp_devices.zone_id, zone_name, master_zone_id |
| DELETE | `/zone/devices/{esp_id}/zone` | zone.py | ZoneService | zone_id = NULL |
| GET | `/zone/devices/{esp_id}` | zone.py | ESPRepository | SELECT esp_devices |
| GET | `/zone/{zone_id}/devices` | zone.py | ESPRepository | SELECT WHERE zone_id |
| **GET** | **`/zone/{zone_id}/monitor-data`** | **zone.py** | **MonitorDataService** | **Zone + Subzonen + Sensoren/Aktoren gruppiert** |
| GET | `/zone/unassigned` | zone.py | ZoneService | SELECT WHERE zone_id IS NULL |

**Code-Pfad:** `El Servador/god_kaiser_server/src/api/v1/zone.py` Zeile 262–291

### 3.2 Subzone-Endpoints

| Methode | Pfad | Handler | Service | DB-Operation |
|---------|------|---------|---------|--------------|
| POST | `/subzone/devices/{esp_id}/subzones/assign` | subzone.py | SubzoneService | INSERT/UPDATE subzone_configs |
| GET | `/subzone/devices/{esp_id}/subzones` | subzone.py | SubzoneService | SELECT subzone_configs |
| GET | `/subzone/devices/{esp_id}/subzones/{subzone_id}` | subzone.py | SubzoneService | SELECT WHERE subzone_id |
| DELETE | `/subzone/devices/{esp_id}/subzones/{subzone_id}` | subzone.py | SubzoneService | DELETE subzone_configs |
| POST | `.../safe-mode` | subzone.py | SubzoneService | UPDATE safe_mode_active |
| DELETE | `.../safe-mode` | subzone.py | SubzoneService | UPDATE safe_mode_active |

### 3.3 monitor-data Endpoint — Schema (implementiert)

**Request:** `GET /api/v1/zone/{zone_id}/monitor-data`

**Response:** `ZoneMonitorData`
- `zone_id`, `zone_name`
- `subzones: SubzoneGroup[]` — pro Subzone: `subzone_id`, `subzone_name`, `sensors[]`, `actuators[]`
- `sensor_count`, `actuator_count`, `alarm_count`
- GPIOs ohne Subzone → `SubzoneGroup(subzone_id=null, subzone_name="Keine Subzone")`

**Logik (MonitorDataService, `src/services/monitor_data_service.py`):**
1. ESPs mit `zone_id` laden
2. `subzone_configs` WHERE `parent_zone_id == zone_id`
3. `gpio_to_subzone` Map aus `assigned_gpios` bauen: `(esp_id, gpio) → (subzone_id, subzone_name)`
4. `sensor_configs`/`actuator_configs` für ESPs in Zone laden (JOIN esp_devices)
5. Letzte Werte aus `sensor_data`/`actuator_states`
6. Gruppierung nach Subzone; unbekannte GPIOs → „Keine Subzone“

---

## 4. Block 3: MQTT-Handler — Schreibpfade in DB

| Topic (Pattern) | Handler | DB-Operation | Tabelle |
|-----------------|---------|--------------|---------|
| `kaiser/+/esp/+/zone/ack` | zone_ack_handler | UPDATE esp_devices (zone_id bestätigt) | esp_devices |
| `kaiser/+/esp/+/subzone/ack` | subzone_ack_handler | UPDATE subzone_configs (last_ack_at) | subzone_configs |
| `kaiser/+/esp/+/sensor/+/data` | sensor_handler | INSERT sensor_data | sensor_data |
| `kaiser/+/esp/+/actuator/+/status` | actuator_handler | UPDATE actuator_states | actuator_states |
| `kaiser/+/esp/+/system/heartbeat` | heartbeat_handler | INSERT esp_heartbeat_logs, UPDATE esp_devices.last_seen | esp_heartbeat_logs, esp_devices |
| `kaiser/+/esp/+/config_response` | config_handler | UPDATE sensor_configs/actuator_configs | sensor_configs, actuator_configs |

**Race Conditions?** zone_ack und subzone_ack schreiben in dieselben Tabellen wie REST. Keine separaten Caches. REST schreibt sofort (optimistisch), MQTT-ACK bestätigt. Bei Mock-ESPs: REST schreibt, MQTT wird nicht gesendet — DB bleibt konsistent.

---

## 5. Block 4: Service-Layer — Datenfluss

### 5.1 ZoneService

- **assign_zone:** ESPRepository.get_by_device_id → device.zone_id = … → commit → MQTT publish
- **remove_zone:** zone_id = NULL → commit → MQTT publish
- **Cascade bei Zone-Removal:** SubzoneConfigs haben FK zu esp_devices (device_id). Wenn ESP gelöscht wird: CASCADE. Bei Zone-Removal (nur zone_id = NULL): Subzonen bleiben erhalten (parent_zone_id kann veraltet sein — optionaler Cleanup).

### 5.2 SubzoneService

- **assign_subzone:** Validiert assigned_gpios gegen sensor_configs/actuator_configs (GPIO muss existieren). Speichert in subzone_configs. MQTT publish.
- **assigned_gpios min_length:** Pydantic-Schema erlaubt `[]` (leere Subzone). BK4: Optional min_length=1 wenn aus Sensor-Kontext erstellt.

### 5.3 MonitorDataService

- **Datei:** `src/services/monitor_data_service.py`
- **Methode:** `get_zone_monitor_data(zone_id)`
- **Logik:** ESPs in Zone → subzone_configs (parent_zone_id) → gpio_to_subzone Map → sensor_configs/actuator_configs → SensorData/ActuatorState → SubzoneGroups mit „Keine Subzone“ für unzugeordnete GPIOs.
- **Wichtig:** Verwendet `device_id` (VARCHAR) für gpio_to_subzone, da subzone_configs.esp_id auf device_id referenziert.

### 5.4 KaiserService / get_hierarchy

- Liefert Zone → Subzone → ESPs pro Subzone. **Nicht** Sensoren/Aktoren pro Subzone. Für Monitor L2: **monitor-data Endpoint** nutzen.

---

## 6. Block 5: Identifizierte Bruchstellen — Verifizierung

| ID | Hypothese | Verifizierung | Status |
|----|-----------|---------------|--------|
| **BK1** | "Keine Subzone" Flackern = Frontend Race | MonitorView: zoneMonitorData = null während Load → Fallback (useZoneGrouping) → resolverMap leer → alle Sensoren subzone_id=null → "Keine Subzone". **Kein v-if="zoneMonitorLoading"** blockiert Rendering. | **BESTÄTIGT** |
| **BK2** | monitor-data als Primary? | MonitorView nutzt `zonesApi.getZoneMonitorData()` als Primary (watch mit immediate). **ABER:** Während Loading wird Fallback angezeigt. Fallback = useZoneGrouping + useSubzoneResolver. | **BESTÄTIGT** — Race durch Fallback |
| **BK3** | subzone_id auf Sensor/Aktor? | sensor_configs, actuator_configs: **KEIN** subzone_id. Nur subzone_configs.assigned_gpios. Code-Verifikation: grep in models/ ergab keine Treffer. | **BESTÄTIGT** |
| **BK4** | Subzone Create mit leeren GPIOs | subzonesApi.assignSubzone erlaubt assigned_gpios: []. Backend akzeptiert. | **Optional** min_length=1 |
| **BK5** | espWithSubzone-Lookup | useSubzoneCRUD.findEspForSubzone nutzt getSubzones pro Device — korrekt. | **BEHOBEN** (B1/B5 Fix) |

---

## 7. Block 6: Stabilitäts-Anforderungen (Soll-Zustand)

### 7.1 Datenbank ✅

- Single Source of Truth: PostgreSQL
- Klare FK-Ketten
- Keine Redundanz bei Subzone-Zuordnung (nur assigned_gpios)

### 7.2 Backend ✅

- Ein Schreibweg pro Entität
- Konsolidierter Endpoint GET /zone/{id}/monitor-data existiert
- MQTT-Handler schreiben in dieselben Tabellen

### 7.3 Frontend — Fix erforderlich

- **Problem:** Kein Ready-Gate. Während Loading wird Fallback gerendert.
- **Lösung:** `v-if="!zoneMonitorLoading"` auf L2-Content ODER Skeleton/Spinner bis `zoneMonitorData` da ist. Kein Fallback-Rendering während des Ladens.

---

## 8. Frontend-Datenfluss — Einzelheiten

### 8.1 MonitorView L2 — Aktuelle Implementierung

**Datei:** `El Frontend/src/views/MonitorView.vue`

**State (Zeile 87–90):**
```typescript
const zoneMonitorData = ref<ZoneMonitorData | null>(null)
const zoneMonitorLoading = ref(false)
const zoneMonitorError = ref<string | null>(null)
```

**Watch (Zeile 980–998):**
```typescript
watch(selectedZoneId, async (zoneId) => {
  if (!zoneId) { zoneMonitorData.value = null; return }
  zoneMonitorLoading.value = true
  zoneMonitorError.value = null
  try {
    zoneMonitorData.value = await zonesApi.getZoneMonitorData(zoneId)
  } catch (e) {
    zoneMonitorError.value = ...
    zoneMonitorData.value = null
  } finally {
    zoneMonitorLoading.value = false
  }
}, { immediate: true })
```

**sensorSubzones computed (Zeile 1042–1058):**
```typescript
const sensorSubzones = computed(() => {
  const zoneId = selectedZoneId.value
  if (!zoneId) return []
  const data = zoneMonitorData.value
  if (data) {
    return data.subzones.filter(sz => sz.sensors.length > 0).map(...)
  }
  const fallback = fallbackSensorsByZone.value.find(z => z.zoneId === zoneId)
  return fallback?.subzones ?? []
})
```

**Kritisch:** Wenn `zoneMonitorData` null (während Loading), wird **sofort** Fallback verwendet. Kein `v-if="!zoneMonitorLoading"` im Template.

### 8.2 Fallback-Kette — Warum „Keine Subzone“?

1. **fallbackSensorsByZone** kommt von `useZoneGrouping({ subzoneResolver: subzoneResolverMap })`
2. **subzoneResolverMap** kommt von `useSubzoneResolver(selectedZoneId)`
3. **useSubzoneResolver** (`El Frontend/src/composables/useSubzoneResolver.ts`):
   - Startet mit `resolverMap = new Map()` (leer)
   - `buildResolver()` wird per watch auf zoneId + devicesInZone.length getriggert
   - Ruft **asynchron** `subzonesApi.getSubzones(espId)` für jedes Device in der Zone
   - Erst wenn alle Responses da: `resolverMap` gefüllt
4. **useZoneGrouping** (`El Frontend/src/composables/useZoneGrouping.ts`):
   - `allSensors` computed: Für jeden Sensor Lookup `resolver.get(\`${espId}-${gpio}\`)`
   - Wenn resolver leer: `resolved = undefined` → `subzoneId = null`, `subzoneName = ''`
   - Gruppierung: `szId === SUBZONE_NONE` (null) → `subzoneName = "Keine Subzone"` (Zeile 186)

**Zeitablauf:**
- t=0ms: User navigiert zu /monitor/:zoneId
- t=0ms: watch triggert, zoneMonitorLoading=true, zoneMonitorData=null
- t=0ms: sensorSubzones: data=null → Fallback
- t=0ms: fallbackSensorsByZone: resolverMap leer → alle subzone_id=null → "Keine Subzone"
- t=0ms: **RENDER: "Keine Subzone" für alle** ← FLACKERN
- t=200–500ms: API-Response → zoneMonitorData gesetzt, zoneMonitorLoading=false
- t=200–500ms: sensorSubzones: data vorhanden → API-Daten
- t=200–500ms: **RENDER: Korrekte Subzonen** ← FLACKERN Ende

### 8.3 Template-Struktur — Wo fehlt das Ready-Gate?

**Zeile 1597–1646:** L2-Content wird **ohne** zoneMonitorLoading-Check gerendert:

```html
<template v-else>  <!-- isZoneDetail = true -->
  <div ref="monitorContentRef">
    <div class="monitor-view__header">...</div>
    <!-- KEIN v-if="!zoneMonitorLoading" hier! -->
    <section v-if="zoneSensorGroup && zoneSensorGroup.sensorCount > 0" ...>
      <!-- Subzone Accordion mit fallback-Daten während Loading -->
```

**Fix-Stelle:** Den gesamten L2-Content-Block (ab Zeile 1599) mit einem Wrapper versehen:
```html
<template v-if="!zoneMonitorLoading">
  <!-- Bestehender L2-Content -->
</template>
<div v-else class="monitor-view__skeleton">
  <!-- Skeleton oder Spinner -->
</div>
```

---

## 9. Priorisierte Fix-Liste

| Prio | Fix | Beschreibung | Aufwand |
|------|-----|---------------|---------|
| **1** | **Ready-Gate MonitorView L2** | `v-if="!zoneMonitorLoading"` auf Subzone-Accordion-Container. Skeleton oder Spinner während Loading. Kein Fallback-Rendering während zoneMonitorLoading. | 1–2h |
| **2** | **Fallback optional** | Nach Ready-Gate: Fallback nur bei API-Fehler (zoneMonitorError). Bei Erfolg: nur API-Daten. | 0.5h |
| **3** | **DB-Dokumentation** | subzone_id auf sensor/actuator_configs — bestätigt: existiert NICHT. | 0h (erledigt) |
| **4** | **Subzone Create Validierung** | assigned_gpios min_length=1 optional | 1h |
| **5** | **useSubzoneResolver Entkopplung** | Falls MonitorView nur API nutzt: useSubzoneResolver nur für Fallback bei Fehler. Reduziert parallele Lade-Quellen. | 0.5h |

---

## 10. Datenfluss-Diagramm (Text)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  MONITOR L2 — Aktueller Datenfluss (mit Race)                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  User navigiert zu /monitor/:zoneId                                           │
│         │                                                                     │
│         │  watch(selectedZoneId, immediate: true)                             │
│         ▼                                                                     │
│  zoneMonitorLoading = true                                                    │
│  zoneMonitorData = null                                                       │
│         │                                                                     │
│         ├───────────────────────────────────────────────────────────────────┐│
│         │  PARALLEL:                                                         ││
│         │  1) zonesApi.getZoneMonitorData(zoneId)  ──► 200–500ms             ││
│         │  2) useSubzoneResolver.buildResolver()   ──► N×getSubzones (async)  ││
│         │  3) espStore.devices (evtl. noch leer)                             ││
│         └───────────────────────────────────────────────────────────────────┘│
│         │                                                                     │
│         │  sensorSubzones computed:                                           │
│         │    data = zoneMonitorData.value  →  NULL                           │
│         │    → Fallback: fallbackSensorsByZone                                │
│         │    → useZoneGrouping + useSubzoneResolver                           │
│         │    → resolverMap LEER (noch loading)                                │
│         │    → subzoneId = null für alle Sensoren                             │
│         │    → "Keine Subzone" Gruppe                                         │
│         │                                                                     │
│         │  RENDER: "Keine Subzone" für alle  ◄── FLACKERN t=0                 │
│         │                                                                     │
│         │  ... 200–500ms später ...                                           │
│         │                                                                     │
│         │  zoneMonitorData = API Response                                     │
│         │  zoneMonitorLoading = false                                         │
│         │  sensorSubzones computed: data vorhanden → API-Daten                │
│         │                                                                     │
│         │  RENDER: Korrekte Subzonen  ◄── FLACKERN Ende t=500ms               │
│                                                                               │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  MONITOR L2 — Soll-Datenfluss (mit Ready-Gate)                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  User navigiert zu /monitor/:zoneId                                           │
│         │                                                                     │
│         │  watch(selectedZoneId) → zoneMonitorLoading = true                   │
│         │                                                                     │
│         │  v-if="!zoneMonitorLoading"  →  FALSE  →  Skeleton/Spinner         │
│         │  KEIN Fallback-Rendering                                             │
│         │                                                                     │
│         │  API Response → zoneMonitorData = data                              │
│         │  zoneMonitorLoading = false                                         │
│         │                                                                     │
│         │  v-if="!zoneMonitorLoading"  →  TRUE  →  Content mit API-Daten      │
│         │  Kein Flackern                                                       │
│                                                                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 11. Code-Referenzen — Fix-Implementierung

### 11.1 MonitorView.vue — Änderungen

**Position:** Nach Zeile 1598 (`<template v-else>`), vor dem L2-Content

**Option A — Minimal:**
```vue
<template v-if="!zoneMonitorLoading">
  <!-- Bestehender L2-Content (monitor-view__header, sections, etc.) -->
</template>
<div v-else class="monitor-view__loading">
  <div class="sensor-detail__spinner" />
  <p class="text-sm text-muted">Lade Zonendaten...</p>
</div>
```

**Option B — Mit Error-Handling:**
```vue
<template v-if="zoneMonitorError">
  <div class="monitor-view__error">...</div>
</template>
<template v-else-if="!zoneMonitorLoading">
  <!-- L2-Content -->
</template>
<div v-else class="monitor-view__loading">...</div>
```

### 11.2 Fallback-Nutzung einschränken

In `sensorSubzones` und `actuatorSubzones` computed: Fallback nur wenn `zoneMonitorError`:
```typescript
if (data) return data.subzones...
if (zoneMonitorError.value) {
  const fallback = fallbackSensorsByZone.value.find(...)
  return fallback?.subzones ?? []
}
return []  // Während Loading: leeres Array statt Fallback
```

**Hinweis:** Wenn Ready-Gate korrekt ist, wird Fallback während Loading nie aufgerufen (Content nicht gerendert). Die obige Änderung ist defensiv.

---

## 12. Akzeptanzkriterien — Status

| Kriterium | Status |
|-----------|--------|
| Block 1: Datenbank-Inventar | ✅ |
| Block 2: REST-Endpoints | ✅ |
| Block 3: MQTT-Handler | ✅ |
| Block 4: Service-Layer | ✅ |
| Block 5: Bruchstellen BK1–BK5 | ✅ |
| Block 6: Stabilitäts-Anforderungen | ✅ |
| Frontend-Datenfluss Einzelheiten | ✅ |
| Code-Referenzen für Fix | ✅ |
| Bericht in backend-datenkonsistenz-bericht-2026-03-04.md | ✅ |

---

## 13. Kurzübersicht für Robin

| Thema | Inhalt |
|-------|--------|
| **Ziel** | Backend vollständig analysiert — DB, API, MQTT, Services |
| **Verifizierung** | "Keine Subzone" Flackern = Frontend rendert Fallback während API lädt; resolverMap leer → alle unter "Keine Subzone" |
| **Backend** | ✅ Konsolidierter Endpoint GET /zone/{id}/monitor-data existiert und funktioniert |
| **DB** | ✅ sensor_configs/actuator_configs haben KEIN subzone_id; nur subzone_configs.assigned_gpios |
| **Fix** | Ready-Gate implementiert: v-if="!zoneMonitorLoading" + BaseSkeleton; Fallback nur bei zoneMonitorError |
| **Ergebnis** | Priorisierte Fix-Liste; Backend stabil; Frontend-Fix implementiert (MonitorView.vue) |
| **Code-Stellen** | MonitorView.vue Zeile 1598 ff.; sensorSubzones/actuatorSubzones computed Zeile 1042/1062 |

---

## 14. Einzelheiten-Durchgang (Rev. 2)

### 14.1 Datenbank

- [x] esp_devices.zone_id, zone_name, master_zone_id — korrekt
- [x] subzone_configs.esp_id → device_id (VARCHAR), parent_zone_id, assigned_gpios (JSON)
- [x] sensor_configs: esp_id (UUID FK), gpio, sensor_type — kein subzone_id
- [x] actuator_configs: esp_id (UUID FK), gpio, actuator_type — kein subzone_id
- [x] MonitorDataService: parent_zone_id-Filter, device_id für gpio_to_subzone

### 14.2 Backend

- [x] GET /zone/{zone_id}/monitor-data in zone.py registriert
- [x] MonitorDataService.get_zone_monitor_data() implementiert
- [x] ZoneMonitorData Schema mit subzones, sensor_count, actuator_count, alarm_count
- [x] "Keine Subzone" für GPIOs ohne assigned_gpios-Eintrag

### 14.3 Frontend

- [x] zonesApi.getZoneMonitorData(zoneId) in api/zones.ts
- [x] MonitorView: watch mit immediate, zoneMonitorLoading, zoneMonitorData
- [x] sensorSubzones/actuatorSubzones: data ? API : fallback
- [x] useSubzoneResolver: resolverMap, buildResolver async
- [x] useZoneGrouping: subzoneResolver optional, SUBZONE_NONE → "Keine Subzone"
- [x] **Implementiert:** v-if="!zoneMonitorLoading" auf L2-Content, BaseSkeleton bei Loading, ErrorState bei Fehler, Fallback nur bei zoneMonitorError

### 14.4 MQTT

- [x] zone/ack, subzone/ack schreiben in esp_devices, subzone_configs
- [x] Keine separaten Caches, gleiche Tabellen wie REST

### 14.5 Randfälle

- [x] **Leere Zone:** MonitorDataService liefert `subzones: []`, `sensor_count: 0`, `actuator_count: 0` — korrekt
- [x] **Zone ohne Subzonen:** Alle GPIOs landen in „Keine Subzone“ — korrekt
- [x] **Multi-Value-Sensoren (SHT31):** Zwei Configs (temp + humidity) auf gleichem GPIO — gpio_to_subzone Lookup pro Config, beide erhalten gleiche Subzone

---

## 15. Referenz-Dateien (Skill-Quellen)

| Skill | Referenz | Verwendet für |
|-------|----------|---------------|
| frontend-development | `El Frontend/src/` | MonitorView, useZoneGrouping, useSubzoneResolver, zones.ts |
| server-development | `El Servador/god_kaiser_server/src/` | zone.py, monitor_data_service.py, DB-Models |
| db-inspector | `DB_INSPECTOR_REPORT.md`, Models | Schema, FK, subzone_id-Verifikation |
| system-control | `.claude/skills/system-control/SKILL.md` | Docker-Status, Health-Checks |

---

*Bericht erstellt gemäß auftrag-backend-datenkonsistenz-vollanalyse.md — Rev. 2 mit ausführlicher Analyse*
