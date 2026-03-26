# Analyse B1 — Backend API-Response Audit: Cross-Zone/Mobile Felder

> **Erstellt:** 2026-03-25
> **Status:** ABGESCHLOSSEN
> **Architektur-Entscheidung:** TEILWEISE — `device_scope`/`assigned_zones` kommen mit, `active_zone_id`/`context_since` NICHT

---

## 1. Pydantic-Schema-Inventar

### Sensor-Schemas (`src/schemas/sensor.py`)

| Schema | Zweck | device_scope | assigned_zones | assigned_subzones | active_zone_id | context_since |
|--------|-------|:---:|:---:|:---:|:---:|:---:|
| `SensorConfigResponse` (Z.335) | GET Response | YES (Z.431) | YES (Z.435) | YES (Z.439) | NO | NO |
| `SensorConfigCreate` (Z.117) | POST Request | YES (Z.238) | YES (Z.243) | YES (Z.248) | NO | NO |
| `SensorConfigUpdate` (Z.274) | PUT Request | YES (Z.320) | YES (Z.325) | YES (Z.329) | NO | NO |

### Actuator-Schemas (`src/schemas/actuator.py`)

| Schema | Zweck | device_scope | assigned_zones | assigned_subzones | active_zone_id | context_since |
|--------|-------|:---:|:---:|:---:|:---:|:---:|
| `ActuatorConfigResponse` (Z.243) | GET Response | YES (Z.284) | YES (Z.288) | YES (Z.292) | NO | NO |
| `ActuatorConfigUpdate` (Z.212) | PUT Request | YES (Z.228) | YES (Z.233) | YES (Z.237) | NO | NO |

### Monitor-Schemas (`src/schemas/monitor.py`)

| Schema | Zweck | device_scope | assigned_zones | assigned_subzones | active_zone_id | context_since |
|--------|-------|:---:|:---:|:---:|:---:|:---:|
| `SubzoneSensorEntry` (Z.16) | Zone-Monitor Sensor | NO | NO | NO | NO | NO |
| `SubzoneActuatorEntry` (Z.31) | Zone-Monitor Aktor | NO | NO | NO | NO | NO |
| `ZoneMonitorData` (Z.56) | Zone-Monitor Gesamt | NO | NO | NO | NO | NO |

### ESP-Schemas (`src/schemas/esp.py`)

| Schema | Zweck | device_scope | assigned_zones | assigned_subzones | active_zone_id | context_since |
|--------|-------|:---:|:---:|:---:|:---:|:---:|
| `ESPDeviceResponse` (Z.192) | Device-Uebersicht | NO | NO | NO | NO | NO |
| `ESPDeviceListResponse` (Z.1057) | Device-Liste (paginated) | NO | NO | NO | NO | NO |

### Device-Context-Schemas (`src/schemas/device_context.py`)

| Schema | Zweck | device_scope | assigned_zones | assigned_subzones | active_zone_id | context_since |
|--------|-------|:---:|:---:|:---:|:---:|:---:|
| `DeviceContextResponse` (Z.59) | Context GET/PUT/DELETE | NO | NO | NO | YES (Z.64) | YES (Z.67) |
| `DeviceContextSet` (Z.22) | Context SET Request | NO | NO | NO | YES | NO |
| `DeviceScopeUpdate` (Z.85) | Scope Update Request | YES | YES | YES | NO | NO |

**Erkenntnis:** Das Design trennt bewusst:
- **Statische Konfig-Felder** (`device_scope`, `assigned_zones`, `assigned_subzones`) → Sensor/Actuator-Schemas
- **Dynamische Laufzeit-Felder** (`active_zone_id`, `context_since`) → DeviceContext-Schema (separate Tabelle)

---

## 2. Endpoint-Feld-Matrix

| # | Endpoint | Response-Schema | device_scope | assigned_zones | assigned_subzones | active_zone_id | context_since |
|---|----------|----------------|:---:|:---:|:---:|:---:|:---:|
| E1 | `GET /api/v1/esp/devices` | `ESPDeviceListResponse` | NO | NO | NO | NO | NO |
| E2 | `GET /api/v1/zone/{id}/monitor-data` | `ZoneMonitorData` | NO | NO | NO | NO | NO |
| E3 | `GET /api/v1/sensors/` | `SensorConfigResponse[]` | **YES** | **YES** | **YES** | NO | NO |
| E4 | `GET /api/v1/sensors/config/{id}` | `SensorConfigResponse` | **YES** | **YES** | **YES** | NO | NO |
| E5 | `GET /api/v1/actuators/` | `ActuatorConfigResponse[]` | **YES** | **YES** | **YES** | NO | NO |
| E6 | `GET /api/v1/actuators/{esp}/{gpio}` | `ActuatorConfigResponse` | **YES** | **YES** | **YES** | NO | NO |
| E7 | `GET /api/v1/device-context/sensor/{id}` | `DeviceContextResponse` | NO | NO | NO | **YES** | **YES** |
| E8 | `GET /api/v1/device-context/actuator/{id}` | `DeviceContextResponse` | NO | NO | NO | **YES** | **YES** |

**Kernbefund:** Die beiden Endpoint-Gruppen die das Frontend am haeufigsten nutzt (E1: ESP-Liste fuer HardwareView, E2: Zone-Monitor fuer MonitorView) liefern **KEINE** Cross-Zone-Felder. Nur die Config-Detail-Endpoints (E3-E6) liefern `device_scope`/`assigned_zones`.

---

## 3. Live-Response-Beispiele

### E1: `GET /api/v1/esp/devices` — Erster Eintrag (gekuerzt)

```json
{
  "device_id": "MOCK_T18V6LOGIC",
  "name": "Mock #OGIC",
  "zone_id": "mock_zone",
  "zone_name": "MOCK ZONE Name",
  "status": "online",
  "sensor_count": 2,
  "actuator_count": 1,
  "subzones": [...],
  "zone_context": {...}
}
```

**Fehlende Felder:** `device_scope`, `assigned_zones`, `assigned_subzones`, `active_zone_id`, `context_since` — alle ABSENT.

> **Hinweis:** `device_scope: "zone_local"` taucht innerhalb `metadata.simulation_config.sensors[*]` auf, aber das ist Simulation-Metadata, NICHT die eigentliche Config-Response.

### E2: `GET /api/v1/zone/mock_zone/monitor-data` — SubzoneSensorEntry

```json
{
  "esp_id": "MOCK_24557EC6",
  "gpio": 4,
  "sensor_type": "ds18b20",
  "name": "Temp 0C79",
  "raw_value": 20.0,
  "unit": "°C",
  "quality": "good",
  "last_read": "2026-03-11T08:57:57.770000+00:00"
}
```

**Fehlende Felder:** Alle 5 Cross-Zone-Felder ABSENT. `SubzoneSensorEntry` ist ein Minimal-Schema fuer Display-Zwecke.

### E3: `GET /api/v1/sensors/` — Erster Eintrag (Felder-Auszug)

```json
{
  "id": "93b13bbf-7215-45c6-9cea-f61c80c9d579",
  "esp_device_id": "MOCK_T18V6LOGIC",
  "sensor_type": "sht31_humidity",
  "device_scope": "zone_local",
  "assigned_zones": [],
  "assigned_subzones": [],
  "... weitere Config-Felder ..."
}
```

**Vorhandene Felder:** `device_scope` = "zone_local", `assigned_zones` = [], `assigned_subzones` = [].
**Fehlende Felder:** `active_zone_id`, `context_since` — ABSENT (nicht im Schema).

### E5: `GET /api/v1/actuators/` — Erster Eintrag (Felder-Auszug)

```json
{
  "device_scope": "zone_local",
  "assigned_zones": [],
  "assigned_subzones": []
}
```

**Gleiche Situation wie Sensoren:** Statische Config-Felder vorhanden, dynamische Context-Felder fehlen.

### E7: `GET /api/v1/device-context/sensor/93b13bbf-...`

```json
{
  "success": true,
  "message": "No active context set",
  "config_type": "sensor",
  "config_id": "93b13bbf-7215-45c6-9cea-f61c80c9d579",
  "active_zone_id": null,
  "active_subzone_id": null,
  "context_source": "none",
  "context_since": null
}
```

**Funktioniert:** Endpoint liefert korrekt Context-Daten (hier: kein Context gesetzt). Auth-Tier: OperatorUser.

---

## 4. DB-Query-Analyse

### E1: `GET /esp/devices` (`src/api/v1/esp.py:155-274`)

- Query: `ESPRepository.get_all()` → laedt `ESPDevice`-Objekte
- Danach: `SensorRepository.count_by_esp()` / `ActuatorRepository.count_by_esp()` (nur Counts!)
- **KEIN** Laden von `sensor_configs` mit Details → `device_scope` nicht verfuegbar
- **KEIN** JOIN auf `device_active_context`

### E2: Zone Monitor Data (`src/services/monitor_data_service.py:39-231`)

- 7 separate DB-Queries
- Query 3 (Z.79-85): `SELECT SensorConfig JOIN ESPDevice WHERE esp_id IN (uuids) AND enabled = True`
- `SensorConfig` wird geladen, aber `SubzoneSensorEntry` extrahiert nur: `esp_id, gpio, sensor_type, name, raw_value, unit, quality, last_read`
- **`device_scope` ist im ORM-Objekt vorhanden** (wird geladen), aber **nicht in das Response-Schema gemappt**
- **KEIN** JOIN auf `device_active_context`
- **KEINE** Filterung nach `device_scope` — multi_zone/mobile Sensoren anderer Zonen werden NICHT inkludiert

### E3/E4: Sensor Config Endpoints (`src/api/v1/sensors.py`)

- Query: `SensorRepository.query_paginated()` oder `get_by_id()`
- Response via `SensorConfigResponse` → `device_scope`, `assigned_zones`, `assigned_subzones` vorhanden
- **KEIN** JOIN auf `device_active_context` → `active_zone_id` fehlt

### device_active_context Zugriff

- **Nur** ueber `DeviceScopeService.get_active_context()` in `src/services/device_scope_service.py`
- 30-Sekunden In-Memory-Cache (`_context_cache` mit NamedTuple `ActiveContextData`)
- Wird aufgerufen von:
  1. `DeviceContextRouter` (GET/PUT/DELETE Endpoints)
  2. `zone_subzone_resolver.py` (beim MQTT SensorDataHandler fuer multi_zone/mobile Routing)
- **NICHT** aufgerufen von: ESP-List-Endpoint, Zone-Monitor-Service, Sensor-Config-Endpoints

---

## 5. device_active_context Status

```sql
SELECT * FROM device_active_context;
-- (0 rows)
```

**Tabelle ist leer.** Das ist erwartbar:
- Alle 10 Sensoren haben `device_scope = 'zone_local'`
- Alle 2 Aktoren haben `device_scope = 'zone_local'`
- Kein Sensor/Aktor wurde bisher als `multi_zone` oder `mobile` konfiguriert
- Context-Eintraege werden erst erzeugt wenn ein `PUT /device-context/...` aufgerufen wird

---

## 6. Config-Update Faehigkeit

### `SensorConfigUpdate` Schema (`src/schemas/sensor.py:274`)

```python
device_scope: Optional[str]     # Pattern: ^(zone_local|multi_zone|mobile)$
assigned_zones: Optional[List[str]]
assigned_subzones: Optional[List[str]]
```

**JA — `device_scope` kann ueber den bestehenden PUT-Endpoint gesetzt werden.**

### `ActuatorConfigUpdate` Schema (`src/schemas/actuator.py:212`)

```python
device_scope: Optional[str]
assigned_zones: Optional[List[str]]
assigned_subzones: Optional[List[str]]
```

**JA — gleiche Situation fuer Aktoren.**

### `DeviceScopeUpdate` Schema (`src/schemas/device_context.py:85`)

Existiert als separates Request-Schema fuer Scope-Updates. Wird im `DeviceContextRouter` verwendet.

**Fazit:** Das Backend ist bereits vollstaendig vorbereitet fuer Cross-Zone-Konfiguration. Nur die Frontend-UI fehlt.

---

## 7. Architektur-Entscheidung

### Antwort: **TEILWEISE**

| Feld | Status | Quelle |
|------|--------|--------|
| `device_scope` | Kommt mit in E3-E6 (Config-Endpoints) | `SensorConfigResponse` / `ActuatorConfigResponse` |
| `assigned_zones` | Kommt mit in E3-E6 | Gleich |
| `assigned_subzones` | Kommt mit in E3-E6 | Gleich |
| `active_zone_id` | **FEHLT in ALLEN Standard-Responses** | Nur via `GET /device-context/{type}/{id}` |
| `context_since` | **FEHLT in ALLEN Standard-Responses** | Nur via `GET /device-context/{type}/{id}` |

### Was das fuer die Frontend-Architektur bedeutet

**Hybrid-Loesung empfohlen:**

1. **`device_scope` aus bestehenden Daten nutzen:**
   - Der `espStore.fetchAll()` laedt KEINE Sensor-Details → KEIN `device_scope` verfuegbar
   - ABER: `GET /api/v1/sensors/` liefert `device_scope` → Das SensorConfigPanel / die Config-Endpunkte koennen es nutzen
   - Fuer MonitorView (E2): `SubzoneSensorEntry` muesste um `device_scope` erweitert werden (Backend-Aenderung noetig, aber minimal)

2. **`active_zone_id` ueber separaten Mechanismus laden:**
   - Option A: **Bulk-Endpoint** `GET /api/v1/device-context/bulk?scope=mobile,multi_zone` (neu) → laedt alle aktiven Kontexte auf einmal
   - Option B: **Einzelne Calls** pro nicht-zone_local Geraet an `GET /device-context/{type}/{id}` (N+1 Problem bei vielen mobilen Geraeten)
   - Option C: **`active_zone_id` in SensorConfigResponse einbetten** (Backend-Aenderung: JOIN auf `device_active_context` im Config-Endpoint)

**Empfehlung: Option C (Einbettung) + Monitor-Schema-Erweiterung**

Begruendung:
- Option C vermeidet einen separaten Store vollstaendig
- Die Config-Endpoints laden bereits `SensorConfig` Objekte → ein LEFT JOIN auf `device_active_context` ist minimal-invasiv
- Fuer den MonitorView: `SubzoneSensorEntry` um `device_scope` und optional `active_zone_id` erweitern
- Der 30s-Cache in `DeviceScopeService` kann wiederverwendet werden

---

## 8. Empfehlungen fuer naechste Schritte

### Backend-Aenderungen (minimal, 3 Punkte)

1. **`SensorConfigResponse` um `active_zone_id` und `context_since` erweitern**
   - Neues optionales Feld in Schema
   - LEFT JOIN auf `device_active_context` in den Query-Funktionen der Config-Endpoints
   - Oder: Nachtraeglich via `DeviceScopeService.get_active_context()` anreichern (nutzt Cache)

2. **`SubzoneSensorEntry` um `device_scope` erweitern**
   - Nur 1 Feld hinzufuegen (das ORM-Objekt hat es bereits geladen, wird nur nicht gemappt)
   - Optional: `active_zone_id` hier auch einbetten

3. **Bulk-Context-Endpoint erstellen** (nice-to-have)
   - `GET /api/v1/device-context/bulk?config_type=sensor&scope=mobile,multi_zone`
   - Laedt alle aktiven Kontexte fuer nicht-zone_local Geraete auf einmal
   - Vermeidet N+1 Calls wenn viele mobile Geraete existieren

### Frontend-Konsequenzen

- **KEIN separater `deviceContext.store.ts` noetig** wenn Backend Option C implementiert wird
- `SensorWithContext` in `useZoneGrouping.ts` um `active_zone_id` erweitern
- MonitorView: `device_scope` aus erweitertem `SubzoneSensorEntry` nutzen fuer Badge/Icon-Anzeige
- Config-Panel: `device_scope`, `assigned_zones` sind bereits in der Response → UI kann direkt darauf zugreifen

---

## Akzeptanzkriterien — Checklist

- [x] 6 Endpoints (E1-E6 + E7/E8 Device-Context) mit Schema + tatsaechlicher Response dokumentiert
- [x] Fuer JEDES der 5 Cross-Zone-Felder ist fuer JEDEN Endpoint klar: vorhanden / fehlend / null
- [x] Live-Response als JSON-Beispiel pro Endpoint-Kategorie (5 Beispiele)
- [x] device_active_context Tabelle geprueft: **0 Eintraege** (erwartbar, alle Geraete zone_local)
- [x] SensorConfigUpdate Schema geprueft: **device_scope und assigned_zones vorhanden** (Backend bereit)
- [x] Architektur-Entscheidung formuliert: **TEILWEISE** mit Hybrid-Empfehlung
