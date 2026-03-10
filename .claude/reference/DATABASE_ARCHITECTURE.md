# Datenbank-Architektur & Wissensdatenbank

> **Version:** 1.4 | **Aktualisiert:** 2026-03-10
> **Zweck:** Trennung operative vs. Wissensdaten, Abhängigkeiten, Verteilung, Sicherheit
> **Quellen:** `El Servador/god_kaiser_server/src/db/models/`, Repositories, Services, Export-API

---

## 0. Übersicht: Operative Daten vs. Wissensdaten

| Kategorie | Tabellen / Orte | Zweck | Schreibzugriff |
|-----------|-----------------|--------|----------------|
| **Operativ (Betrieb)** | esp_devices (soft-delete), sensor_configs, actuator_configs, sensor_data (inkl. zone_id, subzone_id, device_name), actuator_states, actuator_history, esp_heartbeat_logs, cross_esp_logic, logic_execution_history, zones, device_zone_changes, device_active_context | Laufbetrieb, Steuerung, Time-Series, Regeln, Zonen | API + MQTT-Handler |
| **Wissen (Kontext)** | zone_contexts, subzone_configs.custom_data, sensor_metadata (JSON), actuator_metadata (JSON), device_metadata (JSON) | Betriebskontext, KI-Export, Inventar, Anbau | API (Operator/Admin) |
| **System/App** | user_accounts, token_blacklist, audit_logs, notifications, notification_preferences, email_log, plugin_configs, plugin_executions, diagnostic_reports, dashboards, system_config, sensor_type_defaults | Auth, Audit, Benachrichtigungen, Plugins, UI | API (rollenbasiert) |

Wissensdaten sind **getrennt gespeichert**, aber **logisch verknüpft** über `zone_id` (Zonen) und `esp_id` (Geräte/Subzonen). Es gibt **keinen FK** von `zone_contexts` zu `esp_devices` — bewusst, damit Zonen-Kontext auch ohne Geräte existieren kann (flexibel, modular).

---

## 1. Trennung und Verknüpfung

### 1.1 Zonen-Ebene

| Tabelle | Schlüssel | Verknüpfung | Beschreibung |
|---------|-----------|-------------|--------------|
| **esp_devices** | zone_id (String, optional) | Quelle der Zone: ESPs tragen zone_id/zone_name | Geräte-Zuordnung zu einer Zone |
| **zone_contexts** | zone_id (UNIQUE, kein FK) | Logisch: gleicher zone_id-Wert wie auf ESP | Betriebskontext pro Zone (Sorte, Substrat, Phase, Zyklen) |

**Verknüpfung:** `zone_id` ist der **logische Schlüssel**. Zonen entstehen durch Zone-Zuweisung an ESPs; `zone_contexts` kann vor oder nach Geräten gepflegt werden. Sync: Bei Zone-Assign ruft `ZoneService` nach MQTT-Publish `ZoneContextService.sync_zone_name(zone_id, zone_name)` auf — gleiche Session, gleiche Transaktion.

**Repository:** `ZoneContextRepository` (eigener Repo, kein BaseRepository wegen Integer-PK). Service: `ZoneContextService`. API: `api/v1/zone_context.py`.

### 1.2 Subzonen-Ebene

| Tabelle | Schlüssel | Verknüpfung | Beschreibung |
|---------|-----------|-------------|--------------|
| **subzone_configs** | esp_id (FK → esp_devices.device_id), subzone_id | 1 ESP : N Subzonen; parent_zone_id muss ESP.zone_id entsprechen | GPIO-Gruppen, Safe-Mode, **custom_data (JSONB)** |

**Wissen auf Subzonen:** `subzone_configs.custom_data` — subzonenspezifische Metadaten (Material, Notizen, Fein-Kontext). Keine eigene Tabelle; erweiterbar ohne Migration.

**Repository:** `SubzoneRepository`. Service: `SubzoneService`. API: `api/v1/subzone.py` (device-scoped: `/subzone/devices/{esp_id}/...`).

### 1.3 Geräte- und Komponenten-Ebene

| Ort | Feld | Verknüpfung | Beschreibung |
|-----|------|-------------|--------------|
| **esp_devices** | device_metadata (JSON) | 1:1 zum Gerät | Geräte-Metadaten (Hersteller, Modell, Seriennummer, etc.) |
| **esp_devices** | device_metadata.simulation_config.sensors (JSON) | 1:1 zum Gerät | Mock-Sensor-Konfigurationen für SimulationScheduler (Key: `cfg_{uuid}`, derived cache from sensor_configs via `rebuild_simulation_config()`) |
| **sensor_configs** | sensor_metadata (JSON, inkl. description, unit), runtime_stats, alert_config | FK esp_id → esp_devices | Sensor-Metadaten, Laufzeit, Schwellen |
| **actuator_configs** | actuator_metadata (JSON), runtime_stats, alert_config | FK esp_id → esp_devices | Aktor-Metadaten, Laufzeit |

**Verknüpfung:** ESP ist die Wurzel; Sensoren/Aktoren hängen per FK an ESP. Zone-Kontext wird über `esp.zone_id` → `zone_contexts.zone_id` zugeordnet (in Export und UI join-artig geladen).

> **GELÖST (T08-Fix1, 2026-03-08):** Mock-Sensor-Daten nutzen jetzt Write-Through Cache Pattern:
> - `sensor_configs`-Tabelle = **Single Source of Truth**
> - `device_metadata.simulation_config.sensors` = **derived cache**, Keys `cfg_{uuid}` (DB-IDs)
> - `rebuild_simulation_config()` in ESPRepository wird nach JEDEM CUD auf sensor_configs aufgerufen
> - simulation_config wird NIRGENDS direkt geschrieben (nur via rebuild)
> - Multi-Value-Sensoren (SHT31, BME280) werden via `expand_multi_value()` korrekt gesplittet
> - Startup-Reconciliation (Step 3.5.1) rebuildet alle simulation_configs beim Server-Start

---

## 2. Abhängigkeiten (Lesen/Schreiben)

### 2.1 Wer schreibt wo?

| Schreiboperation | Verantwortlicher Service | Tabellen |
|------------------|--------------------------|----------|
| Zone zuweisen | ZoneService | esp_devices (zone_id, zone_name), optional zone_contexts.zone_name (sync) |
| Zone-Kontext anlegen/ändern | ZoneContextService | zone_contexts |
| Subzone anlegen/ändern | SubzoneService | subzone_configs |
| Sensor/Aktor-Metadaten | SensorRepository / ActuatorRepository (via API) | sensor_configs.sensor_metadata, actuator_configs.actuator_metadata |
| Gerät-Metadaten | ESPRepository (via API) | esp_devices.device_metadata |

### 2.2 Wer liest Wissen wofür?

| Consumer | Quelle(n) | API / Pfad |
|----------|-----------|------------|
| **Frontend Wissensdatenbank (Komponenten-Tab)** | zone_contexts, subzone_configs, sensor/actuator configs + metadata, export | `/zone/context`, `/subzone/devices/{esp_id}/subzones`, `/export/*`, `/schema-registry/*`, ggf. inventory-API |
| **Export (AI-Ready JSON)** | esp_devices, sensor_configs, actuator_configs, zone_contexts, actuator_states, sensor_data (latest) | `/export/components`, `/export/zones`, `/export/system-description` |
| **Schema-Registry** | Statische JSON-Schemas (Dateien), keine DB | `/schema-registry`, `/schema-registry/{device_type}/validate` |
| **Zone-KPI / Health-Score** | zone_contexts, sensor_data, Geräte-Status | `/zone/context/{zone_id}/kpis` (ZoneKpiService) |

### 2.3 Abhängigkeitsregeln

- **ZoneContext** hat keine FK zu ESP. Änderungen an ESP.zone_id beeinflussen ZoneContext nur über expliziten Sync (zone_name). Kein CASCADE von Geräten auf Kontext.
- **SubzoneConfig** hat FK zu esp_devices (CASCADE delete). Löschung eines ESPs löscht seine Subzonen.
- **ESP Soft-Delete (T02-Fix1):** `esp_devices.deleted_at` statt physischem DELETE. Zeitreihen-FKs (sensor_data, esp_heartbeat_logs, actuator_states, actuator_history, ai_predictions) nutzen SET NULL — historische Daten bleiben nach Device-Löschung erhalten. sensor_data speichert `device_name` als Kontext-Snapshot.
- **Export-Layer** liest aus mehreren Tabellen und fügt sie zusammen; er schreibt nicht. Einzige Schreibstelle für Kontext sind ZoneContextService und SubzoneRepository/Service.

---

## 3. Verteilung: An wen geht welches Wissen?

| Wissenstyp | Wo gespeichert | An wen verteilt | Weg |
|------------|----------------|-----------------|-----|
| Zone-Kontext (Sorte, Substrat, Phase, Zyklen) | zone_contexts | Frontend (Komponenten, Zonen-Editor), Export-API, KI/MCP | REST: /zone/context, /export/zones |
| Subzonen-Metadaten | subzone_configs.custom_data | Frontend (Subzone-Editor), Export (wenn erweitert) | REST: /subzone/... |
| Geräte-/Sensor-/Aktor-Metadaten | device_metadata, sensor_metadata, actuator_metadata | Frontend (DeviceDetailPanel, Inventar), Export (components) | REST: /esp, /sensors, /actuators, /export/components |
| Device-Typ-Schemas (Struktur) | Schema-Registry (Dateien) | Frontend (SchemaForm), Validierung, KI | REST: /schema-registry |
| Laufzeit/Wartung | runtime_stats (sensor/actuator_configs) | Frontend (RuntimeMaintenanceSection), Export | REST: /sensors/{id}/runtime, /actuators/{id}/runtime |

Alle Schreibzugriffe laufen über REST-API mit **JWT und Rollen** (Operator für Zone/Subzone/Kontext, Admin für System). MQTT schreibt nur operative Daten (sensor_data, actuator_states, heartbeat, config_ack).

---

## 4. Modularität und Sicherheit

### 4.1 Modular

- **Ein Modell pro Datei**, alle in `db/models/` registriert (`__init__.py`).
- **Ein Repository pro Entität** (oder pro Aggregat); ZoneContext hat eigenen Repo (kein UUID-PK).
- **Services orchestrieren** mehrere Repos nur wo nötig (z. B. ZoneService + ZoneContextService beim Assign).
- **Export** ist read-only Aggregation; keine Geschäftslogik in der DB für Export.

### 4.2 Abstrahiert

- **Zone:** Eigene `zones`-Tabelle (zone_id, zone_name, status, created_at, updated_at). `esp_devices.zone_id` referenziert `zones.zone_id` (FK, ON DELETE SET NULL). `zone_contexts` ergänzt Zonen um Betriebskontext.
- **Wissen:** Erweiterung über JSON/JSONB (custom_data, *_metadata) ohne Schema-Migration; Schema-Registry und Frontend-SchemaForm für Validierung.

### 4.3 Sicher

- **Parametrisierte Queries** überall (SQLAlchemy ORM/Repositories); keine String-Formatierung für SQL.
- **Session:** Eine Request-Session; ZoneContextService nutzt dieselbe Session wie ZoneService beim Assign (Transaktionskonsistenz).
- **Rollen:** Siehe REST_ENDPOINTS.md (Operator, Admin, JWT). Sensible Endpoints (zone/context, export, backups) rollengeschützt.

### 4.4 Flexibel / dynamisch anpassbar

- **custom_data** in zone_contexts und subzone_configs: beliebige Keys; Frontend/Editor können neue Felder hinzufügen.
- **Schema-Registry:** Neue Gerätetypen = neue JSON-Schema-Dateien; API bleibt gleich.
- **Neue Wissens-Tabellen** möglich (z. B. device_inventory separat), ohne bestehende FKs zu ändern; Export-Layer kann erweitert werden.

---

## 5. Code-Locations (Kurz)

| Bereich | Pfad |
|---------|------|
| Modelle | `src/db/models/*.py` (zone_context.py, subzone.py, esp.py, sensor.py, actuator.py) |
| Repositories | `src/db/repositories/` (zone_context_repo, subzone_repo, esp_repo, …) |
| Services | `src/services/zone_context_service.py`, `zone_service.py`, `subzone_service.py` |
| Export (Wissen aggregieren) | `src/api/v1/component_export.py` |
| Zone-Kontext API | `src/api/v1/zone_context.py` |
| Schema-Registry | `src/api/v1/schema_registry.py` |

---

## 6. Dokumentations-Stand

- **Schema-Übersicht (Tabellen):** `.claude/reference/testing/SYSTEM_OPERATIONS_REFERENCE.md` §1.2
- **REST-Endpoints (Zone, Subzone, Export, Schema):** `.claude/reference/api/REST_ENDPOINTS.md`
- **Datenbank-Architektur (diese Datei):** Trennung, Verknüpfung, Abhängigkeiten, Verteilung

Empfehlung: Bei neuen Wissens-Tabellen oder -Feldern diese Datei und §1.2 in SYSTEM_OPERATIONS_REFERENCE aktualisieren.
