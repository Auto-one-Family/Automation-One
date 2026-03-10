# T13 Verifikationsbericht: Post-Implementation Code-Analyse

> **Datum:** 2026-03-09
> **Bezug:** T13-R1 (Zone-Konsolidierung & State-Management), T13-R2 (Multi-Zone Device-Scope & Datenrouting)
> **Methode:** Vollstaendige Source-Code-Analyse aller betroffenen Dateien
> **Ergebnis:** Beide Auftraege serverseitig implementiert. 4 Bugs, 3 Architektur-Hinweise.

---

## Inhaltsverzeichnis

1. [T13-R1: Zone-Konsolidierung — Akzeptanzkriterien](#t13-r1)
2. [T13-R2: Multi-Zone Device-Scope — Akzeptanzkriterien](#t13-r2)
3. [Systemarchitektur: Wie das Zone-System jetzt funktioniert](#architektur)
4. [Bugs und Probleme](#bugs)
5. [Datei-Inventar: Was wo umgesetzt wurde](#datei-inventar)
6. [Migrationschain](#migrationschain)

---

<a name="t13-r1"></a>
## 1. T13-R1: Zone-Konsolidierung & State-Management

### Akzeptanzkriterium-Checkliste

| # | Kriterium | Status | Nachweis |
|---|-----------|--------|----------|
| 1 | `esp_devices.zone_id` ist FK auf `zones.zone_id` | PASS | esp.py: `ForeignKey("zones.zone_id", ondelete="SET NULL")`, Migration `add_zone_status_and_fk` |
| 2 | Kein Device-Assignment ohne existierende Zone | PASS | zone_service.py: `zone_repo.get_by_zone_id()` — ValueError wenn Zone nicht existiert. Auto-Create entfernt. |
| 3 | Zone muss `status == "active"` fuer Assignment | PASS | zone_service.py: `if not zone.is_active: raise ValueError("Zone is not active")` |
| 4 | Zone-Liste zeigt Zonen aus `zones`-Tabelle | PASS | zone.py `GET /v1/zone/zones` — Query auf `Zone`-Tabelle mit LEFT JOIN auf ESPDevice + ZoneContext |
| 5 | `zones`-Tabelle hat `status`-Spalte | PASS | zone.py Model: `status = Column(String(20), nullable=False, server_default="active")` |
| 6 | `zones`-Tabelle hat `deleted_at` + `deleted_by` | PASS | zone.py Model: `deleted_at = Column(DateTime(timezone=True))`, `deleted_by = Column(String(64))` |
| 7 | Zone-Archivierung blockiert wenn Devices assigned | PASS | zones.py `/archive`: Prueft `esp_repo.get_by_zone(zone_id)`, 400 wenn Devices vorhanden |
| 8 | Archivierung deaktiviert Subzones | PASS | zones.py `/archive`: `subzone_repo.deactivate_by_zone(zone_id)` |
| 9 | Zone-Reaktivierung moeglich | PASS | zones.py `POST /v1/zones/{zone_id}/reactivate`: `zone_repo.reactivate(zone_id)` |
| 10 | Soft-Delete mit `deleted_at` | PASS | zones.py `DELETE /v1/zones/{zone_id}`: `zone_repo.soft_delete(zone_id, deleted_by)` |
| 11 | Zone-Wechsel: `subzone_configs.parent_zone_id` aktualisiert | PASS | zone_service.py `_handle_subzone_strategy("transfer")`: `sz.parent_zone_id = new_zone_id` |
| 12 | `subzone_strategy` Parameter bei `/assign` | PASS | Schema `ZoneAssignRequest`: `subzone_strategy: str` (transfer/copy/reset, default="transfer") |
| 13 | Transfer-Strategie: Subzones mitwandern | PASS | zone_service.py: Alle Subzones des ESP bekommen neue parent_zone_id |
| 14 | Copy-Strategie: Subzones kopiert | PASS | zone_service.py: Neue Subzone mit `_copy`-Suffix erstellt, Original bleibt |
| 15 | Reset-Strategie: Subzones verwaist | PASS | zone_service.py: Subzones bleiben in alter Zone, nur Affected-Liste fuer Audit |
| 16 | `device_zone_changes` Audit-Tabelle | PASS | Model `DeviceZoneChange`, Migration `add_device_zone_changes` |
| 17 | Audit bei Zone-Wechsel | PASS | zone_service.py: `DeviceZoneChange(esp_id, old_zone_id, new_zone_id, subzone_strategy, affected_subzones)` |
| 18 | `subzone_configs.is_active` Spalte | PASS | subzone.py: `is_active = Column(Boolean, server_default="true", nullable=False)` |
| 19 | `assigned_sensor_config_ids` Spalte | PASS | subzone.py: `assigned_sensor_config_ids = Column(JSON, server_default="[]", nullable=False)` |
| 20 | Count-Sync (`sensor_count`, `actuator_count`) | PASS | subzone_repo.py `sync_subzone_counts()`: Berechnet via GPIO + sensor_config_id Matching |
| 21 | FK-Mismatch-Workaround bei Count-Sync | PASS | subzone_service.py: ESP-UUID via `esp_repo.get_by_device_id()` aufgeloest, dann an `sync_subzone_counts(device_id, esp_uuid)` uebergeben |
| 22 | I2C-Sensoren via `sensor_config_id` zuordbar | PASS | subzone_repo.py `get_subzone_by_sensor_config_id()`: Sucht in `assigned_sensor_config_ids` |
| 23 | I2C-Detection in Resolver | PASS | zone_subzone_resolver.py: `gpio == 0 AND sensor_type in I2C_SENSOR_TYPES` → config_id Lookup |
| 24 | `zone_context`-Tabelle NICHT migriert/verschmolzen | PASS | Separate Tabelle, nur per LEFT JOIN in `GET /zone/zones` enriched |
| 25 | BUG-02 Migration existiert | PASS | `fix_datetime_timezone_naive_columns.py`: 5 DateTime-Spalten auf `timezone=True` |

**T13-R1 Ergebnis: 25/25 PASS**

---

<a name="t13-r2"></a>
## 2. T13-R2: Multi-Zone Device-Scope & Datenrouting

### Akzeptanzkriterium-Checkliste

| # | Kriterium | Status | Nachweis |
|---|-----------|--------|----------|
| 1 | `device_scope` auf sensor_configs | PASS | sensor.py: `device_scope = Column(String(20), server_default="zone_local", nullable=False)` |
| 2 | `device_scope` auf actuator_configs | PASS | actuator.py: identisch |
| 3 | `assigned_zones` JSONB auf sensor_configs | PASS | sensor.py: `assigned_zones = Column(JSON, nullable=True, default=list)` |
| 4 | `assigned_zones` JSONB auf actuator_configs | PASS | actuator.py: identisch |
| 5 | `assigned_subzones` auf beide | PASS | Beide Models: `assigned_subzones = Column(JSON, nullable=True, default=list)` |
| 6 | Application-Level-Validierung assigned_zones | PASS | device_scope_service.py `validate_assigned_zones()`: Prueft zones-Tabelle, alle muessen aktiv sein |
| 7 | `device_active_context` Tabelle | PASS | device_context.py Model + Migration `add_device_scope_and_context` |
| 8 | UNIQUE-Constraint `(config_type, config_id)` | PASS | Model: `UniqueConstraint("config_type", "config_id")` |
| 9 | Bestehende zone_local Sensoren unberuehrt | PASS | Resolver: `scope = getattr(sensor_config, "device_scope", "zone_local")` — Default zone_local |
| 10 | Multi-Zone-Sensor: zone_id aus active_context | PASS | zone_subzone_resolver.py `_resolve_multi_zone()`: `context_repo.get_active_context()` |
| 11 | Multi-Zone ohne Context → `(None, None)` | PASS | Statisch = gilt fuer alle assigned_zones |
| 12 | Mobile-Sensor: Fallback auf ESP-Zone + Warning | PASS | zone_subzone_resolver.py `_resolve_mobile()`: Warning-Log bei fehlendem Context |
| 13 | Context-API PUT Endpoint | PASS | device_context.py: `PUT /device-context/{config_type}/{config_id}` |
| 14 | Context-API GET Endpoint | PASS | device_context.py: `GET /device-context/{config_type}/{config_id}` |
| 15 | Context-API DELETE Endpoint | PASS | device_context.py: `DELETE /device-context/{config_type}/{config_id}` |
| 16 | zone_local Devices: Context-API → 400 | PASS | device_context.py: Prueft ob Config zone_local ist → HTTPException 400 |
| 17 | active_zone_id muss in assigned_zones sein | PASS | device_context.py: Validierung vor `set_active_context()` |
| 18 | sensor_evaluator: zone_id-Filter | PASS | sensor_evaluator.py: `condition["zone_id"]` vs `sensor_data["zone_id"]` |
| 19 | ConflictManager: Zone-aware Key | PASS | conflict_manager.py: `_get_actuator_key(esp_id, gpio, zone_id=None)` → `esp_id:gpio:zone_id` |
| 20 | ConflictManager: Lock-Metadata mit zone_id | PASS | ActuatorLock hat `active_zone_id` Feld |
| 21 | WS-Event `device_context_changed` | PASS | device_context.py: `ws_manager.broadcast("device_context_changed", ...)` bei PUT + DELETE |
| 22 | WS-Event `device_scope_changed` | PASS | sensors.py + actuators.py: `ws_manager.broadcast("device_scope_changed", ...)` bei Scope-Aenderung |
| 23 | Audit: Scope-Aenderungen protokolliert | PASS | sensors.py + actuators.py: `DeviceZoneChange` mit `change_type="scope_change"/"zones_update"` |
| 24 | Audit: Context-Aenderungen protokolliert | PASS | device_scope_service.py: `DeviceZoneChange` mit `change_type="context_change"` |
| 25 | `sensor_config_id` Query-Parameter | PASS | sensors.py `GET /data`: Parameter vorhanden, sensor_repo.py resolves zu esp_id+gpio+type |
| 26 | `change_type` auf device_zone_changes | PASS | Migration `add_device_scope_and_context`: `ADD COLUMN change_type` |
| 27 | In-Memory-Cache fuer active_context | PASS | device_scope_service.py: `_context_cache` dict, 30s TTL, Invalidierung bei set/clear |
| 28 | DeviceActiveContextRepository CRUD | PASS | device_context_repo.py: get, upsert, delete, get_all_for_config_type |
| 29 | Router registriert in __init__.py | PASS | `api_v1_router.include_router(device_context_router)` |
| 30 | sensor_handler: sensor_config + context_repo uebergeben | PASS | sensor_handler.py: Alle 4 Parameter an `resolve_zone_subzone_for_sensor()` uebergeben |

**T13-R2 Ergebnis: 30/30 PASS**

---

<a name="architektur"></a>
## 3. Systemarchitektur: Wie das Zone-System jetzt funktioniert

### 3.1 Zone-Lifecycle (T13-R1)

```
Zone erstellen           Zone archivieren         Zone loeschen (soft)
POST /v1/zones    →     POST /v1/zones/{id}/     DELETE /v1/zones/{id}
                         archive
                              |
     status: active     status: archived      status: deleted
     ──────────────── → ──────────────── →    deleted_at gesetzt
                    ↑                          (Admin-only sichtbar)
                    └── POST /reactivate
```

**Regeln:**
- Archivieren/Loeschen nur wenn KEINE Devices zugeordnet sind
- Archivierung deaktiviert alle Subzones (`is_active = false`)
- Reaktivierung setzt nur Zone-Status — Subzones bleiben deaktiviert (User-Entscheidung)
- Device-Assignment nur auf `active` Zonen moeglich

### 3.2 Zone-Assignment-Flow (T13-R1)

```
POST /v1/zone/devices/{esp_id}/assign
  Body: { zone_id, zone_name?, subzone_strategy: transfer|copy|reset }
              │
              ▼
  ZoneService.assign_zone()
    1. ESP-Lookup (ValueError wenn nicht gefunden)
    2. Zone-Validierung: zones-Tabelle, muss existieren + active
    3. Subzone-Strategie (wenn Zone wechselt):
       ├── transfer: parent_zone_id aller Subzones → neue Zone
       ├── copy:     Kopien in neuer Zone, Originale bleiben
       └── reset:    Subzones bleiben verwaist in alter Zone
    4. ESP-Felder: zone_id, master_zone_id, zone_name, kaiser_id
    5. Audit: DeviceZoneChange → DB
    6. MQTT: kaiser/{kaiser_id}/esp/{device_id}/zone/assign
    7. ZoneContext Sync: zone_name in zone_context-Tabelle
    8. Mock-ESP: SimulationScheduler Update
```

### 3.3 Sensor-Datenfluss mit 3-Wege-Routing (T13-R2)

```
ESP sendet MQTT → kaiser/god/esp/{esp_id}/sensor/{gpio}/data
                         │
                         ▼
              sensor_handler.handle_sensor_data()
                         │
                    ┌────┴────┐
                    │ Step 6  │  Sensor-Config-Lookup (I2C/OneWire/Standard)
                    └────┬────┘
                         │
                    ┌────┴────┐
                    │ Step 8d │  resolve_zone_subzone_for_sensor()
                    └────┬────┘
                         │
            ┌────────────┼────────────┐
            ▼            ▼            ▼
       zone_local    multi_zone     mobile
            │            │            │
    Zone von ESP   Context-Repo   Context-Repo
    Subzone via    active_zone    active_zone
    GPIO/ConfigID  (NULL=alle)   (Fallback→ESP)
            │            │            │
            └────────────┴────────────┘
                         │
                    zone_id + subzone_id
                         │
                    ┌────┴────┐
                    │ Step 9  │  sensor_repo.save_data(zone_id, subzone_id)
                    └────┬────┘
                         │
              WS-Broadcast: sensor_data { zone_id, subzone_id }
              Logic-Engine-Trigger (async Task)
```

### 3.4 Device-Scope-System (T13-R2)

```
┌──────────────────────────────────────────────────────────────┐
│                    sensor_configs / actuator_configs          │
│                                                              │
│  device_scope: "zone_local" | "multi_zone" | "mobile"       │
│  assigned_zones: ["zone_a", "zone_b"]  (JSONB)              │
│  assigned_subzones: ["subzone_x"]      (JSONB)              │
└──────────────────────────────────────────────────────────────┘
                         │
                         │ Wenn multi_zone oder mobile:
                         ▼
┌──────────────────────────────────────────────────────────────┐
│                   device_active_context                       │
│                                                              │
│  config_type: "sensor" | "actuator"                          │
│  config_id: UUID → sensor_configs.id / actuator_configs.id   │
│  active_zone_id: "zone_b"  (welche Zone JETZT bedient wird) │
│  active_subzone_id: (optional)                               │
│  context_source: "manual" | "sequence" | "mqtt"              │
│  UNIQUE(config_type, config_id)                              │
└──────────────────────────────────────────────────────────────┘
                         │
                    Verwaltet via:
                         │
            ┌────────────┴────────────┐
            ▼                         ▼
    DeviceScopeService         REST-API
    (In-Memory-Cache 30s)      PUT/GET/DELETE
    validate_assigned_zones    /api/device-context/
    validate_zone_in_assigned  {config_type}/{config_id}
```

### 3.5 Audit-Trail (T13-R1 + T13-R2)

```
device_zone_changes
├── change_type: "zone_switch"    → ESP wechselt Zone (ZoneService)
├── change_type: "context_change" → active_zone_id aendert sich (DeviceScopeService)
├── change_type: "scope_change"   → device_scope geaendert (sensors.py/actuators.py)
└── change_type: "zones_update"   → assigned_zones geaendert (sensors.py/actuators.py)
```

### 3.6 Logic-Engine-Integration (T13-R2)

**SensorConditionEvaluator:**
- Neues optionales Feld `condition["zone_id"]` fuer Multi-Zone-Matching
- Prueft: `sensor_data["zone_id"] == condition["zone_id"]` (nur bei Trigger-Sensors)
- Cross-Sensor-Lookups haben KEINEN zone_id-Filter

**ConflictManager:**
- Key-Format jetzt: `esp_id:gpio` (zone_local) ODER `esp_id:gpio:zone_id` (multi_zone)
- ActuatorLock speichert `active_zone_id` in Metadata
- Strategien (HIGHER_PRIORITY_WINS, FIRST_WINS, SAFETY_WINS, BLOCKED) unveraendert
- Lock-TTL weiterhin 60s

### 3.7 FK-Architektur (IST-Zustand nach T13)

```
zones
  └── zone_id (UNIQUE, PK-like)
       ├── esp_devices.zone_id → FK (ON DELETE SET NULL)
       └── subzone_configs.parent_zone_id → kein FK (Application-Level)

esp_devices
  ├── id (UUID PK)
  │    ├── sensor_configs.esp_id → FK (UUID)
  │    └── actuator_configs.esp_id → FK (UUID)
  └── device_id (String UNIQUE)
       └── subzone_configs.esp_id → FK (String)

device_active_context
  └── config_id → KEIN DB-FK (polymorphe Referenz via config_type)
```

**Bekannte FK-Inkonsistenz:** `subzone_configs.esp_id` (String auf device_id) vs `sensor_configs.esp_id` (UUID auf id). Count-Sync-Workaround via `esp_repo.get_by_device_id()`.

---

<a name="bugs"></a>
## 4. Bugs und Probleme

### BUG-01: device_context Router fehlt `/v1/` Prefix (MEDIUM)

**Datei:** `src/api/v1/device_context.py:24`
**IST:** `router = APIRouter(prefix="/device-context", ...)`
**Resultierende URL:** `/api/device-context/{config_type}/{config_id}`
**SOLL:** `/api/v1/device-context/{config_type}/{config_id}`

Alle anderen Router haben `/v1/`-Prefix im Router selbst:
- zone.py: `prefix="/v1/zone"`
- zones.py: `prefix="/v1/zones"`
- sensors.py: `prefix="/v1/sensors"`

**Fix:** `prefix="/v1/device-context"`

---

### BUG-02: `remove_zone()` Cascade loescht ALLE Subzones der Zone (HIGH)

**Datei:** `src/services/zone_service.py` — `remove_zone()`
**IST:** `subzone_repo.delete_all_by_zone(old_zone_id)` loescht ALLE Subzones mit `parent_zone_id == old_zone_id`
**Problem:** Wenn mehrere ESPs in derselben Zone sind und ein ESP die Zone verliert, werden ALLE Subzones der Zone geloescht — auch die anderer ESPs.
**SOLL:** `subzone_repo.delete_all_by_esp(device_id)` — nur Subzones des betroffenen ESP loeschen.

---

### BUG-03: Copy-Strategie erzeugt `_copy_copy` bei wiederholtem Kopieren (LOW)

**Datei:** `src/services/zone_service.py` — `_handle_subzone_strategy("copy")`
**IST:** `subzone_id=f"{sz.subzone_id}_copy"` — keine Uniqueness-Pruefung
**Problem:** Bei mehrfachem Kopieren: `subzone_a` → `subzone_a_copy` → `subzone_a_copy_copy`
**SOLL:** Suffix mit Counter oder Hash, z.B. `subzone_a_copy_2`, oder Duplikat-Check vor Create.

---

### BUG-04: `subzone_strategy` wird nicht validiert (LOW)

**Datei:** `src/services/zone_service.py` — `_handle_subzone_strategy()`
**IST:** Bei unbekanntem Strategy-Wert gibt die Funktion eine leere `affected`-Liste zurueck — kein Error.
**Problem:** Tippfehler wie `"transferr"` wird stillschweigend als Reset behandelt (keine Subzone-Aktion).
**SOLL:** ValueError bei unbekanntem Strategy-Wert. Alternativ: Pydantic Literal["transfer", "copy", "reset"] Validierung im Schema.

---

### Architektur-Hinweise (kein Bug, aber beachtenswert)

**H1: Cache-Bypass im sensor_handler**
Der `DeviceScopeService` hat einen 30s-TTL-Cache fuer `active_context`. Im sensor_handler wird aber `DeviceActiveContextRepository` direkt instanziiert und an den Resolver uebergeben — der Service-Cache wird umgangen. Fuer den hot-path (jede Sensor-Messung) bedeutet das: JEDE Messung macht einen DB-Query fuer Context. Fix: DeviceScopeService im sensor_handler nutzen statt direktem Repo.

**H2: GET /zone/zones — DB-Query direkt im Router**
`zone.py` Zeilen ~187-252 enthalten SQLAlchemy-Queries direkt im API-Endpoint statt im Repository. Das verletzt das Repository-Pattern und erschwert Testing/Reuse.

**H3: Einige Zone-Endpoints ohne Auth**
`GET /v1/zone/devices/{esp_id}` und `GET /v1/zone/{zone_id}/devices` haben keinen Auth-Parameter. Moeglicher Public-Zugang je nach Middleware-Config.

---

<a name="datei-inventar"></a>
## 5. Datei-Inventar: Was wo umgesetzt wurde

### Neue Dateien (T13-R1 + T13-R2)

| Datei | Auftrag | Inhalt |
|-------|---------|--------|
| `src/db/models/device_context.py` | T13-R2 | DeviceActiveContext Model |
| `src/db/models/device_zone_change.py` | T13-R1 | DeviceZoneChange Audit-Model |
| `src/db/repositories/device_context_repo.py` | T13-R2 | CRUD fuer device_active_context |
| `src/services/device_scope_service.py` | T13-R2 | Scope-Validierung, Context-Cache |
| `src/api/v1/device_context.py` | T13-R2 | REST-Router PUT/GET/DELETE |
| `src/schemas/device_context.py` | T13-R2 | Pydantic-Schemas |
| `alembic/versions/add_zone_status_and_fk.py` | T13-R1 | status, deleted_at, FK |
| `alembic/versions/add_device_zone_changes.py` | T13-R1 | Audit-Tabelle |
| `alembic/versions/add_subzone_is_active_and_sensor_config_ids.py` | T13-R1 | is_active, sensor_config_ids |
| `alembic/versions/add_device_scope_and_context.py` | T13-R2 | device_scope, context-Tabelle, change_type |
| `alembic/versions/merge_fix_datetime_and_fix_null_subzones.py` | Prereq | Merge-Migration |

### Geaenderte Dateien

| Datei | Auftrag | Aenderungen |
|-------|---------|-------------|
| `src/db/models/zone.py` | T13-R1 | +status, +deleted_at, +deleted_by, Properties is_active/is_archived |
| `src/db/models/subzone.py` | T13-R1 | +is_active, +assigned_sensor_config_ids |
| `src/db/models/esp.py` | T13-R1 | zone_id → FK auf zones.zone_id (SET NULL) |
| `src/db/models/sensor.py` | T13-R2 | +device_scope, +assigned_zones, +assigned_subzones |
| `src/db/models/actuator.py` | T13-R2 | +device_scope, +assigned_zones, +assigned_subzones |
| `src/db/models/__init__.py` | Beide | +DeviceActiveContext, +DeviceZoneChange Imports |
| `src/db/repositories/zone_repo.py` | T13-R1 | +archive, +reactivate, +soft_delete, +list_active, +list_by_status, +is_active |
| `src/db/repositories/subzone_repo.py` | T13-R1 | +update_parent_zone, +deactivate_by_zone, +sync_subzone_counts, +get_subzone_by_sensor_config_id |
| `src/db/repositories/__init__.py` | T13-R2 | +DeviceActiveContextRepository Export |
| `src/services/zone_service.py` | T13-R1 | assign_zone: Validierung statt Auto-Create, subzone_strategy, Audit, _handle_subzone_strategy() |
| `src/services/subzone_service.py` | T13-R1 | +_sync_counts_for_device(), Count-Sync nach upsert |
| `src/utils/zone_subzone_resolver.py` | T13-R2 | 3-Wege-Logik: zone_local/multi_zone/mobile, I2C-Detection |
| `src/mqtt/handlers/sensor_handler.py` | T13-R2 | sensor_config + context_repo an Resolver uebergeben |
| `src/services/logic/conditions/sensor_evaluator.py` | T13-R2 | +zone_id-Filter bei Condition-Matching |
| `src/services/logic/safety/conflict_manager.py` | T13-R2 | Zone-aware Key-Format, active_zone_id in Lock |
| `src/api/v1/zone.py` | T13-R1 | assign: subzone_strategy, Zone-Liste aus zones-Tabelle, Status-Filter |
| `src/api/v1/zones.py` | T13-R1 | +archive, +reactivate Endpoints, Status-Filter, Soft-Delete |
| `src/api/v1/sensors.py` | T13-R2 | +device_scope/assigned_zones in Create/Update, +sensor_config_id Query-Param, WS-Broadcast, Audit |
| `src/api/v1/actuators.py` | T13-R2 | +device_scope/assigned_zones in Create/Update, WS-Broadcast, Audit |
| `src/api/v1/__init__.py` | T13-R2 | +device_context_router Import + Registration |
| `src/schemas/zone.py` | T13-R1 | +subzone_strategy in ZoneAssignRequest, +status in ZoneListEntry |
| `src/schemas/zone_entity.py` | T13-R1 | +status, +deleted_at in ZoneResponse |
| `src/schemas/sensor.py` | T13-R2 | +device_scope, +assigned_zones, +assigned_subzones in Create/Update/Response |
| `src/schemas/actuator.py` | T13-R2 | +device_scope, +assigned_zones, +assigned_subzones in Create/Update/Response |

---

<a name="migrationschain"></a>
## 6. Migrationschain

```
[bestehend] change_extra_data_jsonb
                │
    ┌───────────┴───────────┐
    │                       │
fix_datetime_timezone    fix_null_subzone_names
    │                       │
    └───────────┬───────────┘
                │
    merge_fix_datetime_and_fix_null_subzones  (Merge, leer)
                │
    add_zone_status_and_fk                    (T13-R1: status, deleted_at, FK)
                │
    add_device_zone_changes                   (T13-R1: Audit-Tabelle)
                │
    add_subzone_is_active_and_sensor_config_ids (T13-R1: is_active, config_ids)
                │
    add_device_scope_and_context              (T13-R2: device_scope, context-Tabelle, change_type)
```

**Hinweis:** `change_type` auf `device_zone_changes` wird erst in der T13-R2-Migration hinzugefuegt (nicht in der T13-R1-Migration die die Tabelle erstellt). Das ist korrekt sequenziell — das Model enthaelt alle Spalten, die Migrationen bauen aufeinander auf.

---

## Zusammenfassung

| Auftrag | Akzeptanzkriterien | Bestanden | Bugs |
|---------|-------------------|-----------|------|
| T13-R1 | 25 | 25/25 | 2 (BUG-02 HIGH, BUG-04 LOW) |
| T13-R2 | 30 | 30/30 | 2 (BUG-01 MEDIUM, BUG-03 LOW) |
| **Gesamt** | **55** | **55/55** | **4 Bugs, 3 Architektur-Hinweise** |

Beide Auftraege sind serverseitig vollstaendig implementiert. Das Zone-System hat jetzt:
- **Single Source of Truth** (`zones`-Tabelle mit FK)
- **Lifecycle-Management** (active → archived → deleted)
- **Subzone-Transfer** bei Zone-Wechsel (3 Strategien)
- **3-Wege-Datenrouting** (zone_local / multi_zone / mobile)
- **Audit-Trail** fuer alle Zone/Scope/Context-Aenderungen
- **Logic-Engine-Integration** mit zone_id-Filter und zone-aware ConflictManager

Die 4 identifizierten Bugs sollten vor Frontend-Integration (T13-R3) gefixt werden — insbesondere BUG-01 (Router-Prefix) und BUG-02 (Cascade-Delete).
