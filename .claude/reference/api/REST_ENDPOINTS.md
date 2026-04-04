---
name: rest-api-reference
description: REST API Endpoints GET POST PUT DELETE ESP Sensor Actuator Zone
  Auth Login Token Frontend Server HTTP CRUD
allowed-tools: Read
---

# REST API Referenz

> **Version:** 4.0 | **Aktualisiert:** 2026-04-04
> **Base URL:** `/api/v1/`
> **Auth:** JWT Bearer Token (außer `/auth/status`, `/auth/setup`, `/health`)
> **Quellen:** Vollständige Codebase-Analyse aller Router in `El Servador/god_kaiser_server/src/api/v1/`
> **Endpoint-Anzahl:** ~240 Endpoints (inkl. Zone Context, Backups, Export, Schema Registry, Dashboards, IntentOutcomes)

---

## 0. Quick-Lookup (Alle Endpoints)

### Authentication (`/auth`) - 10 Endpoints

| Endpoint | Method | Auth | Beschreibung |
|----------|--------|------|--------------|
| `/auth/status` | GET | - | System-Status (setup_required?) |
| `/auth/setup` | POST | - | Ersten Admin erstellen |
| `/auth/login` | POST | - | Login, JWT Token erhalten |
| `/auth/refresh` | POST | - | Token refresh |
| `/auth/register` | POST | JWT | Neuen User registrieren |
| `/auth/logout` | POST | JWT | Logout |
| `/auth/me` | GET | JWT | Aktuelle User-Info |
| `/auth/mqtt-credentials` | POST | Admin | MQTT-Credentials konfigurieren |
| `/auth/api-keys` | GET | JWT | API-Keys auflisten |
| `/auth/api-keys` | POST | JWT | API-Key erstellen |

### ESP Devices (`/esp`) - 17 Endpoints

| Endpoint | Method | Auth | Beschreibung |
|----------|--------|------|--------------|
| `/esp/devices` | GET | JWT | Alle ESPs auflisten (ohne pending_approval). Query: `include_deleted=true` zeigt soft-deleted Devices (Admin) |
| `/esp/devices` | POST | Operator | Neues ESP registrieren |
| `/esp/devices/pending` | GET | Operator | **Pending Devices auflisten** |
| `/esp/devices/{esp_id}` | GET | JWT | ESP Details |
| `/esp/devices/{esp_id}` | PATCH | Operator | ESP aktualisieren |
| `/esp/devices/{esp_id}` | DELETE | Operator | ESP soft-delete (setzt deleted_at, Sensordaten bleiben erhalten) |
| `/esp/devices/{esp_id}/health` | GET | JWT | ESP Health Metrics |
| `/esp/devices/{esp_id}/config` | POST | Operator | Sensor/Actuator-Config senden |
| `/esp/devices/{esp_id}/restart` | POST | Operator | ESP neu starten |
| `/esp/devices/{esp_id}/reset` | POST | Operator | Factory Reset (confirm=true) |
| `/esp/devices/{esp_id}/gpio-status` | GET | JWT | GPIO-Status (bus-aware) |
| `/esp/devices/{esp_id}/assign_kaiser` | POST | Operator | Kaiser zuweisen |
| `/esp/devices/{esp_id}/approve` | POST | Operator | **Pending Device genehmigen** |
| `/esp/devices/{esp_id}/reject` | POST | Operator | **Pending Device ablehnen** |
| `/esp/devices/{esp_id}/alert-config` | PATCH | Operator | Device-Level Alert-Config setzen (Phase 4A.7) |
| `/esp/devices/{esp_id}/alert-config` | GET | JWT | Device-Level Alert-Config abrufen |
| `/esp/discovery` | GET | JWT | Network Discovery Results |

### Sensors (`/sensors`) - 18 Endpoints

| Endpoint | Method | Auth | Beschreibung |
|----------|--------|------|--------------|
| `/sensors` | GET | JWT | Alle Sensoren |
| `/sensors/config/{config_id}` | GET | JWT | Sensor-Config by UUID (immer eindeutig, auch bei 2x SHT31) |
| `/sensors/{sensor_id}` | GET | JWT | Sensor Details |
| `/sensors` | POST | JWT | Sensor erstellen |
| `/sensors/{esp_id}/{config_id}` | DELETE | Operator | Sensor-Config löschen (by UUID, Sensordaten bleiben erhalten) |
| `/sensors/data` | GET | JWT | Query Sensor-Daten (historisch, filterbar nach zone_id, subzone_id, resolution, before_timestamp) |
| `/sensors/{sensor_id}/data` | GET | JWT | Sensor-Daten (historisch) |
| `/sensors/{sensor_id}/stats` | GET | JWT | Sensor-Statistiken. Query: `sensor_type` (Multi-Value-Filter) |
| `/sensors/types` | GET | JWT | Alle Sensor-Typen |
| `/sensors/calibrate` | POST | JWT/API-Key | Sensor kalibrieren (body: esp_id, gpio, sensor_type, calibration_points) |
| `/sensors/{sensor_id}/process` | POST | JWT | Sensor-Wert verarbeiten |
| `/sensors/onewire/scan` | POST | JWT | OneWire-Bus scannen |
| `/sensors/{sensor_id}/trigger` | POST | JWT | Messung triggern |
| `/sensors/by-esp/{esp_id}` | GET | JWT | Sensoren nach ESP |
| `/sensors/{sensor_id}/alert-config` | PATCH | Operator | Per-Sensor Alert-Config setzen (Phase 4A.7) |
| `/sensors/{sensor_id}/alert-config` | GET | JWT | Per-Sensor Alert-Config abrufen |
| `/sensors/{sensor_id}/runtime` | GET | JWT | Runtime-Stats + Wartungsstatus (Phase 4A.8) |
| `/sensors/{sensor_id}/runtime` | PATCH | Operator | Runtime-Stats aktualisieren (Wartungslog) |

### Actuators (`/actuators`) - 13 Endpoints

| Endpoint | Method | Auth | Beschreibung |
|----------|--------|------|--------------|
| `/actuators` | GET | JWT | Alle Actuators |
| `/actuators/{esp_id}/{gpio}` | GET | JWT | Actuator Details (ESP+GPIO) |
| `/actuators/{esp_id}/{gpio}` | POST | Operator | Actuator erstellen/aktualisieren (ESP+GPIO) |
| `/actuators/{esp_id}/{gpio}/command` | POST | Operator | Actuator steuern |
| `/actuators/{esp_id}/{gpio}/status` | GET | JWT | Actuator-Status lesen |
| `/actuators/{esp_id}/{gpio}/history` | GET | JWT | Actuator-History (Query: `start_time`, `end_time`, `limit`≤500, `include_aggregation`) |
| `/actuators/emergency_stop` | POST | Operator | Global Emergency-Stop |
| `/actuators/clear_emergency` | POST | Operator | Not-Aus aufheben (MQTT clear_emergency an ESP(s)) |
| `/actuators/emergency-stop` | POST | Operator | **DEPRECATED Alias** fuer `/actuators/emergency_stop` (Sunset: 2026-07-03) |
| `/actuators/clear-emergency` | POST | Operator | **DEPRECATED Alias** fuer `/actuators/clear_emergency` (Sunset: 2026-07-03) |
| `/actuators/{esp_id}/{gpio}` | DELETE | Operator | Actuator löschen |
| `/actuators/by-esp/{esp_id}` | GET | JWT | Actuators nach ESP |
| `/actuators/{actuator_id}/alert-config` | PATCH | Operator | Per-Actuator Alert-Config setzen (UUID) |
| `/actuators/{actuator_id}/alert-config` | GET | JWT | Per-Actuator Alert-Config abrufen (UUID) |
| `/actuators/{actuator_id}/runtime` | GET | JWT | Runtime-Stats + Wartungsstatus (UUID) |
| `/actuators/{actuator_id}/runtime` | PATCH | Operator | Runtime-Stats aktualisieren (Wartungslog, UUID) |

### Zones (`/zone`) - 7 Endpoints

| Endpoint | Method | Auth | Beschreibung |
|----------|--------|------|--------------|
| `/zone/zones` | GET | JWT | **DEPRECATED** — Use GET /zones/ instead. Alle Zonen aus zones-Tabelle, enriched mit Device/Sensor/Actuator Counts. Query: `?status=active\|archived\|deleted` |
| `/zone/devices/{esp_id}/assign` | POST | Operator | ESP einer Zone zuweisen (MQTT). T13-R1: Zone muss existieren + aktiv sein. `subzone_strategy`: transfer/copy/reset. Response: `ack_received`, `warning` (T14-Fix-B) |
| `/zone/devices/{esp_id}/zone` | DELETE | Operator | Zone-Zuweisung entfernen |
| `/zone/devices/{esp_id}` | GET | JWT | Zone-Info für ESP |
| `/zone/{zone_id}/devices` | GET | JWT | Alle ESPs in Zone |
| `/zone/{zone_id}/monitor-data` | GET | JWT | Zone Monitor Data L2 (Sensoren/Aktoren nach Subzone gruppiert) |
| `/zone/unassigned` | GET | JWT | ESPs ohne Zone-Zuweisung |

> **Hinweis:** Zone-Assignment-Endpoints (`/zone`) weisen ESPs zu/entfernen Zonen.
> Für Zone-Entity-CRUD (erstellen, listen, löschen) siehe `/zones` (plural) unten.
> T13-R1: Zone muss vor Assignment in `zones`-Tabelle existieren (kein Auto-Create mehr).

### Zone Entity (`/zones`) - 7 Endpoints (T13-R1)

| Endpoint | Method | Auth | Beschreibung |
|----------|--------|------|--------------|
| `/zones` | POST | Operator | Zone erstellen (zone_id, name, description) |
| `/zones` | GET | JWT | Alle Zonen listen (enriched mit Device/Sensor/Actuator Counts). Query: `?status=active\|archived\|deleted` (Default: non-deleted) |
| `/zones/{zone_id}` | GET | JWT | Zone nach zone_id abrufen |
| `/zones/{zone_id}` | PUT | Operator | Zone aktualisieren (name, description) |
| `/zones/{zone_id}` | PATCH | Operator | Partielle Zone-Aktualisierung (nur übergebene Felder). Synct `esp_devices.zone_name` bei Umbenennung |
| `/zones/{zone_id}/archive` | POST | Operator | Zone archivieren (Devices müssen vorher entfernt werden, Subzones werden deaktiviert) |
| `/zones/{zone_id}/reactivate` | POST | Operator | Archivierte Zone reaktivieren (Subzones bleiben deaktiviert) |
| `/zones/{zone_id}` | DELETE | Operator | Zone soft-delete (blockiert wenn Devices zugeordnet). Setzt status='deleted' + deleted_at |

> **Hinweis:** Zonen sind eigenständige DB-Entitäten (Tabelle `zones`).
> T13-R1: `zones`-Tabelle ist Single Source of Truth. FK: `esp_devices.zone_id` → `zones.zone_id`.
> Zone Lifecycle: active → archived → deleted (Soft-Delete).

### Subzones (`/subzone`) - 6 Endpoints

| Endpoint | Method | Auth | Beschreibung |
|----------|--------|------|--------------|
| `/subzone/devices/{esp_id}/subzones/assign` | POST | Operator | GPIOs einer Subzone zuweisen (MQTT) |
| `/subzone/devices/{esp_id}/subzones/{subzone_id}` | DELETE | Operator | Subzone entfernen |
| `/subzone/devices/{esp_id}/subzones` | GET | JWT | Alle Subzones eines ESP |
| `/subzone/devices/{esp_id}/subzones/{subzone_id}` | GET | JWT | Subzone Details |
| `/subzone/devices/{esp_id}/subzones/{subzone_id}/safe-mode` | POST | Operator | Safe-Mode aktivieren |
| `/subzone/devices/{esp_id}/subzones/{subzone_id}/safe-mode` | DELETE | Operator | Safe-Mode deaktivieren |

> **Hinweis:** Subzone-Endpoints sind device-scoped (wie Zone-Endpoints).
> Subzones haben eine eigene `subzone_configs` DB-Tabelle (inkl. `custom_data` JSONB für Subzonen-Metadaten).
>
> **subzone_id Normalisierung (Sensors/Actuators Create-Update):** `null`, `””`, `”__none__”` → „Keine Subzone” = GPIO aus allen Subzonen entfernt. Nutzt `utils/subzone_helpers.normalize_subzone_id()`.
>
> **subzone_warning (CP-S1):** Falls die Subzone-Zuweisung nach Sensor/Actuator-Create oder -Update scheitert (z.B. ungültige subzone_id, Zone-Mismatch), wird kein 400 zurückgegeben. Der Sensor/Aktor wird gespeichert, der Config-Push an den ESP wird trotzdem gesendet, und die Response enthält `subzone_warning: “<Fehlermeldung>”`. `subzone_warning: null` bedeutet: Subzone-Zuweisung war erfolgreich. Betrifft: `ActuatorConfigResponse`, `SensorConfigResponse`.

### Device Context (`/device-context`) - 3 Endpoints (T13-R2)

| Endpoint | Method | Auth | Beschreibung |
|----------|--------|------|--------------|
| `/device-context/{config_type}/{config_id}` | PUT | Operator | Aktiven Zone-Kontext für Sensor/Aktor setzen |
| `/device-context/{config_type}/{config_id}` | GET | JWT | Aktiven Zone-Kontext abrufen |
| `/device-context/{config_type}/{config_id}` | DELETE | Operator | Kontext löschen (Fallback: zone_local) |

> **config_type:** `sensor` oder `actuator`. **config_id:** UUID der SensorConfig/ActuatorConfig.
> Nutzt `DeviceScopeService` mit 30s In-Memory Cache. WebSocket-Broadcast: `device_context_changed`.

### Zone Context (`/zone/context`) - 7 Endpoints (Phase K3)

| Endpoint | Method | Auth | Beschreibung |
|----------|--------|------|--------------|
| `/zone/context` | GET | JWT | Alle Zone-Kontexte (paginiert) |
| `/zone/context/{zone_id}` | GET | JWT | Kontext einer Zone |
| `/zone/context/{zone_id}` | PUT | Operator | Kontext anlegen/ersetzen (Upsert) |
| `/zone/context/{zone_id}` | PATCH | Operator | Kontext teilweise aktualisieren |
| `/zone/context/{zone_id}/archive-cycle` | POST | Operator | Anbauzyklus archivieren |
| `/zone/context/{zone_id}/history` | GET | JWT | Archivierte Zyklen (History) |
| `/zone/context/{zone_id}/kpis` | GET | JWT | Zone-KPIs (VPD, DLI, Health-Score) |

> **DB-Tabelle:** `zone_contexts` (Alembic: `add_zone_context_table`). Felder u.a. variety, substrate, growth_phase, cycle_history, custom_data.

### Kaiser (`/kaiser`) - 5 Endpoints

| Endpoint | Method | Auth | Beschreibung |
|----------|--------|------|--------------|
| `/kaiser` | GET | JWT | Alle Kaisers auflisten |
| `/kaiser/{kaiser_id}` | GET | JWT | Kaiser-Details |
| `/kaiser/{kaiser_id}/hierarchy` | GET | JWT | Vollstaendige Hierarchie: Kaiser → Zonen → Subzonen → Sensoren/Aktoren |
| `/kaiser` | POST | Operator | Kaiser registrieren |
| `/kaiser/{kaiser_id}/zones` | PUT | Operator | Managed Zones aktualisieren |

> **Hierarchy-Response:** Subzonen enthalten `sensors[]` und `actuators[]` (aus assigned_gpios + sensor_configs/actuator_configs). "Keine Subzone" Gruppe fuer ESPs ohne Subzone. Nutzt: `HierarchyTab.vue`, System-Monitor.

### Logic/Automation (`/logic`) - 8 Endpoints

| Endpoint | Method | Auth | Beschreibung |
|----------|--------|------|--------------|
| `/logic/rules` | GET | JWT | Automation Rules auflisten |
| `/logic/rules` | POST | Operator | Neue Rule erstellen |
| `/logic/rules/{rule_id}` | GET | JWT | Rule Details |
| `/logic/rules/{rule_id}` | PUT | Operator | Rule aktualisieren |
| `/logic/rules/{rule_id}` | DELETE | Operator | Rule löschen |
| `/logic/rules/{rule_id}/toggle` | POST | Operator | Rule aktivieren/deaktivieren |
| `/logic/rules/{rule_id}/test` | POST | Operator | Rule testen |
| `/logic/execution_history` | GET | JWT | Execution History |

### Sequences (`/sequences`) - 4 Endpoints

| Endpoint | Method | Auth | Beschreibung |
|----------|--------|------|--------------|
| `/sequences` | GET | JWT | Alle Sequences |
| `/sequences/stats` | GET | JWT | Sequence-Statistiken |
| `/sequences/{sequence_id}` | GET | JWT | Sequence Details |
| `/sequences/{sequence_id}/cancel` | POST | JWT | Sequence abbrechen |

### Intent Outcomes (`/intent-outcomes`) - 2 Endpoints

| Endpoint | Method | Auth | Beschreibung |
|----------|--------|------|--------------|
| `/intent-outcomes` | GET | JWT | Intent Outcomes auflisten (Filter: esp_id, flow, outcome, limit) |
| `/intent-outcomes/{intent_id}` | GET | JWT | Terminal Outcome eines Intents abrufen |

> **P0.2 Visibility:** Kanonische Outcome-Records aus `command_outcomes`-Tabelle. Felder: `intent_id`, `correlation_id`, `esp_id`, `flow`, `outcome` (accepted/rejected/applied/persisted/failed/expired), `contract_version`, `semantic_mode`, `legacy_status`, `target_status`, `is_final`, `code`, `reason`, `retryable`, `generation`, `seq`, `epoch`, `ttl_ms`, `ts`, `first_seen_at`, `terminal_at`.
> **Contract-Härtung (Server Authority):** Unknown/Legacy-Werte werden serverseitig deterministisch kanonisiert; bei Vertragsverletzung wird `code=CONTRACT_UNKNOWN_CODE` gesetzt (bzw. `CONTRACT_MISSING_CORRELATION` bei fehlender `correlation_id`).

### Sensor Type Defaults (`/sensor-type-defaults`) - 6 Endpoints

| Endpoint | Method | Auth | Beschreibung |
|----------|--------|------|--------------|
| `/sensor-type-defaults` | GET | JWT | Alle Defaults |
| `/sensor-type-defaults/{sensor_type}` | GET | JWT | Default für Typ |
| `/sensor-type-defaults` | POST | JWT | Default erstellen |
| `/sensor-type-defaults/{sensor_type}` | PATCH | JWT | Default aktualisieren |
| `/sensor-type-defaults/{sensor_type}` | DELETE | JWT | Default löschen |
| `/sensor-type-defaults/{sensor_type}/effective` | GET | JWT | Effektive Konfiguration |

### Debug/Mock-ESP (`/debug`) - ~60 Endpoints

| Endpoint | Method | Auth | Beschreibung |
|----------|--------|------|--------------|
| `/debug/mock-esp` | POST | JWT | Mock-ESP erstellen |
| `/debug/mock-esp` | GET | JWT | Alle Mock-ESPs |
| `/debug/mock-esp/{esp_id}` | GET | JWT | Mock-ESP Details |
| `/debug/mock-esp/{esp_id}` | DELETE | JWT | Mock-ESP soft-delete (Sensordaten bleiben erhalten) |
| `/debug/mock-esp/{esp_id}` | PATCH | JWT | Mock-ESP aktualisieren |
| `/debug/mock-esp/{esp_id}/heartbeat` | POST | JWT | Heartbeat triggern |
| `/debug/mock-esp/{esp_id}/state` | POST | JWT | State setzen |
| `/debug/mock-esp/{esp_id}/sensors` | POST | JWT | Sensor hinzufügen |
| `/debug/mock-esp/{esp_id}/sensors/{gpio}` | POST | JWT | Sensor-Wert setzen |
| `/debug/mock-esp/{esp_id}/sensors/{gpio}` | DELETE | JWT | Sensor entfernen (⚠️ Guard: 409 bei >1 Sensor auf GPIO ohne sensor_type; bevorzugt `DELETE /sensors/{esp_id}/{config_id}`) |
| `/debug/mock-esp/{esp_id}/actuators` | POST | JWT | Actuator hinzufügen |
| `/debug/mock-esp/{esp_id}/actuators/{gpio}` | POST | JWT | Actuator-State setzen |
| `/debug/mock-esp/{esp_id}/actuators/{gpio}` | DELETE | JWT | Actuator entfernen |
| `/debug/mock-esp/{esp_id}/actuators/{gpio}/command` | POST | JWT | Actuator-Command |
| `/debug/mock-esp/{esp_id}/emergency-stop` | POST | JWT | Emergency-Stop |
| `/debug/mock-esp/{esp_id}/clear-emergency` | POST | JWT | Emergency-Stop zurücksetzen |
| `/debug/mock-esp/{esp_id}/messages` | GET | JWT | MQTT Messages |
| `/debug/mock-esp/{esp_id}/auto-heartbeat` | POST | JWT | Auto-Heartbeat Toggle |
| `/debug/mock-esp/{esp_id}/batch-sensors` | POST | JWT | Batch Sensor-Werte |
| `/debug/mock-esp/{esp_id}/simulate-disconnect` | POST | JWT | Disconnect simulieren |
| `/debug/mock-esp/{esp_id}/simulate-reconnect` | POST | JWT | Reconnect simulieren |
| `/debug/mock-esp/{esp_id}/zone/ack` | POST | JWT | Zone ACK simulieren |
| `/debug/mock-esp/{esp_id}/subzone/ack` | POST | JWT | Subzone ACK simulieren |
| `/debug/mock-esp/{esp_id}/config-response` | POST | JWT | Config-Response simulieren |
| `/debug/db/tables` | GET | JWT | Alle Tabellen |
| `/debug/db/{table}/schema` | GET | JWT | Tabellen-Schema |
| `/debug/db/{table}` | GET | JWT | Tabellen-Daten |
| `/debug/db/{table}/{record_id}` | GET | JWT | Record Details |
| `/debug/db/{table}/{record_id}` | DELETE | JWT | Record löschen |
| `/debug/logs` | GET | JWT | Server-Logs |
| `/debug/logs/files` | GET | JWT | Log-Files |
| `/debug/logs/cleanup` | DELETE | JWT | Logs bereinigen |
| `/debug/logs/cleanup/preview` | GET | JWT | Cleanup-Preview |
| `/debug/mqtt/topics` | GET | JWT | MQTT-Topics |
| `/debug/mqtt/messages` | GET | JWT | MQTT-Messages (Cache) |
| `/debug/mqtt/publish` | POST | JWT | MQTT-Message senden |
| `/debug/health` | GET | JWT | Debug Health-Check |
| `/debug/config` | GET | JWT | Debug-Konfiguration |
| `/debug/stats` | GET | JWT | Debug-Statistiken |
| `/debug/cache/clear` | POST | JWT | Cache leeren |
| `/debug/scheduler/jobs` | GET | JWT | Scheduler-Jobs |
| `/debug/scheduler/jobs/{job_id}/run` | POST | JWT | Job manuell ausführen |
| `/debug/resilience/status` | GET | JWT | Resilience-Status |

### Logs (`/logs`) - 1 Endpoint

| Endpoint | Method | Auth | Beschreibung |
|----------|--------|------|--------------|
| `/logs/frontend` | POST | None | Frontend Error Log Ingestion (fire-and-forget, rate-limited 10/min/IP) |

### Errors (`/errors`) - 4 Endpoints

| Endpoint | Method | Auth | Beschreibung |
|----------|--------|------|--------------|
| `/errors` | GET | JWT | Error-Logs |
| `/errors/stats` | GET | JWT | Error-Statistiken |
| `/errors/codes` | GET | JWT | Error-Code-Liste |
| `/errors/codes/{code}` | GET | JWT | Error-Code Details |

### Audit (`/audit`) - 22 Endpoints

| Endpoint | Method | Auth | Beschreibung |
|----------|--------|------|--------------|
| `/audit` | GET | Admin | Audit-Logs |
| `/audit/stats` | GET | Admin | Audit-Statistiken |
| `/audit/actions` | GET | Admin | Verfügbare Actions |
| `/audit/entity-types` | GET | Admin | Verfügbare Entity-Types |
| `/audit/users` | GET | Admin | Audit nach User |
| `/audit/timeline` | GET | Admin | Audit-Timeline |
| `/audit/search` | GET | Admin | Volltext-Suche |
| `/audit/events/aggregated` | GET | JWT | Aggregierte Events aus mehreren Quellen (`audit_log`, `sensor_data`, `esp_health`, `actuators`) |
| `/audit/export` | GET | Admin | Audit-Export |
| `/audit/retention` | GET | Admin | Retention-Einstellungen |
| `/audit/retention` | PUT | Admin | Retention aktualisieren |
| `/audit/cleanup` | POST | Admin | Manuelles Cleanup |
| `/audit/cleanup/preview` | GET | Admin | Cleanup-Preview |
| `/audit/cleanup/preview/detailed` | GET | Admin | Detaillierter Preview |
| `/audit/cleanup/stats` | GET | Admin | Cleanup-Statistiken |
| `/audit/auto-cleanup/status` | GET | Admin | Auto-Cleanup Status |
| `/audit/auto-cleanup/toggle` | POST | Admin | Auto-Cleanup Toggle |
| `/audit/backups` | GET | Admin | Backup-Liste |
| `/audit/backups` | POST | Admin | Backup erstellen |
| `/audit/backups/{backup_id}` | DELETE | Admin | Backup löschen |
| `/audit/backups/{backup_id}/restore` | POST | Admin | Backup wiederherstellen |
| `/audit/backups/{backup_id}/download` | GET | Admin | Backup herunterladen |
| `/audit/retention/auto` | PUT | Admin | Auto-Retention Toggle |

> **Projection-Konsistenz (Step 3):** Bei `GET /audit/events/aggregated` enthalten contract-relevante Quellen in `events[].metadata.contract_payload` eine kanonische Shared-Projection (gleicher Serializer-Layer wie bei WebSocket-Events).

### Users (`/users`) - 7 Endpoints

| Endpoint | Method | Auth | Beschreibung |
|----------|--------|------|--------------|
| `/users` | GET | Admin | Alle User |
| `/users` | POST | Admin | User erstellen |
| `/users/{user_id}` | GET | Admin | User Details |
| `/users/{user_id}` | PATCH | Admin | User bearbeiten |
| `/users/{user_id}` | DELETE | Admin | User löschen |
| `/users/{user_id}/reset-password` | POST | Admin | Passwort zurücksetzen |
| `/users/{user_id}/role` | PATCH | Admin | Rolle ändern |

### Notifications (`/notifications`) - 15 Endpoints

| Endpoint | Method | Auth | Beschreibung |
|----------|--------|------|--------------|
| `/notifications` | GET | JWT | Alle Notifications (paginiert, filterbar) |
| `/notifications/unread-count` | GET | JWT | Ungelesene-Anzahl + höchste Severity |
| `/notifications/alerts/active` | GET | JWT | Aktive Alerts (Phase 4B, ISA-18.2) |
| `/notifications/alerts/stats` | GET | JWT | Alert-Statistiken: MTTA, MTTR, Counts (Phase 4B) |
| `/notifications/email-log` | GET | Admin | Email-Versandprotokoll (paginiert, filterbar). Query `status`, `template` (Teilstring), `date_from`, `date_to`, `page`, `page_size` (Phase C V1.1, V1.2) |
| `/notifications/email-log/stats` | GET | Admin | Email-Versandstatistiken. `by_status` inkl. permanently_failed (Phase C V1.1, V1.2) |
| `/notifications/{id}` | GET | JWT | Notification Details |
| `/notifications/{id}/read` | PATCH | JWT | Als gelesen markieren |
| `/notifications/{id}/acknowledge` | PATCH | JWT | Alert bestätigen: active → acknowledged (Phase 4B) |
| `/notifications/{id}/resolve` | PATCH | JWT | Alert erledigen: active/acknowledged → resolved (Phase 4B) |
| `/notifications/read-all` | PATCH | JWT | Alle als gelesen markieren |
| `/notifications/send` | POST | Admin | Manuelle Notification senden |
| `/notifications/preferences` | GET | JWT | User-Preferences abrufen |
| `/notifications/preferences` | PUT | JWT | User-Preferences aktualisieren |
| `/notifications/test-email` | POST | JWT | Test-Email senden |

### Webhooks (`/webhooks`) - 1 Endpoint

| Endpoint | Method | Auth | Beschreibung |
|----------|--------|------|--------------|
| `/webhooks/grafana-alerts` | POST | None | Grafana Alert Webhook Empfänger |

### Diagnostics (`/diagnostics`) - 6 Endpoints

| Endpoint | Method | Auth | Beschreibung |
|----------|--------|------|--------------|
| `/diagnostics/run` | POST | Operator | Vollständigen Diagnose-Lauf starten |
| `/diagnostics/run/{check_name}` | POST | Operator | Einzelnen Check ausführen |
| `/diagnostics/history` | GET | JWT | Report-History auflisten |
| `/diagnostics/history/{report_id}` | GET | JWT | Report-Details abrufen |
| `/diagnostics/export/{report_id}` | POST | Operator | Report als Markdown exportieren |
| `/diagnostics/checks` | GET | JWT | Verfügbare Checks auflisten |

### Plugins (`/plugins`) - 8 Endpoints

| Endpoint | Method | Auth | Beschreibung |
|----------|--------|------|--------------|
| `/plugins` | GET | JWT | Alle Plugins auflisten |
| `/plugins/{plugin_id}` | GET | JWT | Plugin-Details mit letzten Executions |
| `/plugins/{plugin_id}/execute` | POST | Operator | Plugin manuell ausführen |
| `/plugins/{plugin_id}/config` | PUT | Admin | Plugin-Konfiguration ändern |
| `/plugins/{plugin_id}/history` | GET | JWT | Execution-History |
| `/plugins/{plugin_id}/enable` | POST | Admin | Plugin aktivieren |
| `/plugins/{plugin_id}/disable` | POST | Admin | Plugin deaktivieren |
| `/plugins/{plugin_id}/schedule` | PUT | Admin | Plugin-Schedule setzen/ändern |

### Backups (`/backups`) - 6 Endpoints (Phase A V5.1)

| Endpoint | Method | Auth | Beschreibung |
|----------|--------|------|--------------|
| `/backups/database/create` | POST | Admin | Sofort-Backup auslösen |
| `/backups/database/list` | GET | Admin | Backup-Liste |
| `/backups/database/{backup_id}/download` | GET | Admin | Backup-Datei herunterladen |
| `/backups/database/{backup_id}` | DELETE | Admin | Einzelnes Backup löschen |
| `/backups/database/{backup_id}/restore` | POST | Admin | Wiederherstellen (confirm=true) |
| `/backups/database/cleanup` | POST | Admin | Alte Backups aufräumen |

### Export (`/export`) - 5 Endpoints (Phase K4 Wissensinfrastruktur)

| Endpoint | Method | Auth | Beschreibung |
|----------|--------|------|--------------|
| `/export/components` | GET | JWT | Alle Komponenten als AI-Ready JSON |
| `/export/components/{component_id}` | GET | JWT | Einzelne Komponente |
| `/export/zones` | GET | JWT | Alle Zonen inkl. Kontext |
| `/export/zones/{zone_id}` | GET | JWT | Zone inkl. Komponenten + Kontext |
| `/export/system-description` | GET | JWT | System-Beschreibung (WoT-Style) |

### Schema Registry (`/schema-registry`) - 3 Endpoints (Phase K4 L0.2)

| Endpoint | Method | Auth | Beschreibung |
|----------|--------|------|--------------|
| `/schema-registry` | GET | JWT | Device-Typen (Sensoren/Aktoren) auflisten |
| `/schema-registry/{device_type}` | GET | JWT | JSON-Schema für Gerätetyp |
| `/schema-registry/{device_type}/validate` | POST | JWT | Metadaten gegen Schema validieren |

### Health (`/health`) - 6 Endpoints

| Endpoint | Method | Auth | Beschreibung |
|----------|--------|------|--------------|
| `/health` | GET | - | Health Check |
| `/health/detailed` | GET | JWT | Detaillierter Health Check |
| `/health/esp` | GET | JWT | ESP Health Summary |
| `/health/metrics` | GET | JWT | System Metrics |
| `/health/live` | GET | - | Liveness Probe |
| `/health/ready` | GET | - | Readiness Probe (inkl. RuntimeState: logic_liveness, recovery_completed, worker_health) |

### Dashboards (`/dashboards`) - 5 Endpoints

| Endpoint | Method | Auth | Beschreibung |
|----------|--------|------|--------------|
| `/dashboards` | GET | JWT | Dashboards auflisten (eigene + shared). Query: `page`, `page_size` |
| `/dashboards` | POST | JWT | Dashboard erstellen (mit Widgets + Layout) |
| `/dashboards/{dashboard_id}` | GET | JWT | Dashboard Details (Owner/Shared/Admin) |
| `/dashboards/{dashboard_id}` | PUT | JWT | Dashboard aktualisieren (Owner/Admin) |
| `/dashboards/{dashboard_id}` | DELETE | JWT | Dashboard löschen (Owner/Admin) |

> **DB-Tabelle:** `dashboards` (Alembic: `add_dashboards_table`, `add_dashboard_target_field`).
> Widgets als JSONB-Array gespeichert. Ownership-basierte Autorisierung in Service-Schicht.
> Frontend-Sync: localStorage als Cache + Server als Langzeit-Persistenz.

---

## 1. Authentication (`/auth`)

### 1.1 GET /auth/status

Prüft System-Status (Initial Setup erforderlich?).

**Auth:** Nicht erforderlich

**Response 200:**
```json
{
  "success": true,
  "data": {
    "setup_required": true,
    "user_count": 0
  }
}
```

---

### 1.2 POST /auth/setup

Erstellt den ersten Admin-User (nur wenn `setup_required: true`).

**Auth:** Nicht erforderlich

**Request Body (SetupRequest):**
```json
{
  "username": "admin",
  "email": "admin@example.com",
  "password": "SecurePassword123",
  "full_name": "Administrator"
}
```

**Response 200 (TokenResponse):**
```json
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "token_type": "bearer"
}
```

**Error Responses:**
| Code | Reason |
|------|--------|
| 400 | Setup already completed |
| 422 | Validation Error |

---

### 1.3 POST /auth/login

Login mit Credentials.

**Auth:** Nicht erforderlich

**Request Body (LoginRequest):**
```json
{
  "username": "admin",
  "password": "SecurePassword123",
  "remember_me": false
}
```

**Response 200 (TokenResponse):**
```json
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "token_type": "bearer"
}
```

**Error Responses:**
| Code | Reason |
|------|--------|
| 401 | Invalid credentials |
| 403 | Account disabled |

---

### 1.4 POST /auth/refresh

Erneuert Access-Token mit Refresh-Token.

**Request Body (RefreshTokenRequest):**
```json
{
  "refresh_token": "eyJ..."
}
```

**Response 200 (TokenResponse):**
```json
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "token_type": "bearer"
}
```

---

### 1.5 GET /auth/me

Holt aktuelle User-Informationen.

**Auth:** JWT Required

**Response 200:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "username": "admin",
    "email": "admin@example.com",
    "full_name": "Administrator",
    "role": "admin",
    "is_active": true,
    "created_at": "2026-01-01T00:00:00Z"
  }
}
```

---

### 1.6 POST /auth/logout

Logout (optional alle Sessions).

**Auth:** JWT Required

**Request Body (LogoutRequest):**
```json
{
  "logout_all": false
}
```

---

## 2. ESP Devices (`/esp`)

### 2.1 GET /esp/devices

Alle ESP-Geräte auflisten.

**Auth:** JWT Required

**Query-Parameter:**

| Parameter | Typ | Default | Beschreibung |
|-----------|-----|---------|--------------|
| `zone_id` | string | - | Filter nach Zone |
| `status` | string | - | online, offline |
| `include_sensors` | bool | false | Sensoren inkludieren |
| `include_actuators` | bool | false | Actuators inkludieren |
| `page` | int | 1 | Seite (1-indexed) |
| `page_size` | int | 20 | Einträge pro Seite |

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "esp_id": "ESP_12AB34CD",
      "name": "Greenhouse Sensor",
      "zone_id": "greenhouse",
      "zone_name": "Gewächshaus",
      "is_online": true,
      "last_heartbeat": "2026-02-01T10:00:00Z",
      "sensor_count": 3,
      "actuator_count": 2
    }
  ],
  "pagination": {
    "total": 5,
    "page": 1,
    "page_size": 20,
    "total_pages": 1
  }
}
```

---

### 2.2 GET /esp/devices/{esp_id}

Einzelnes ESP-Gerät mit Details.

**Auth:** JWT Required

**Path Parameters:**
| Parameter | Typ | Beschreibung |
|-----------|-----|--------------|
| `esp_id` | string | ESP Device ID |

**Response 200:**
```json
{
  "success": true,
  "data": {
    "esp_id": "ESP_12AB34CD",
    "name": "Greenhouse Sensor",
    "zone_id": "greenhouse",
    "zone_name": "Gewächshaus",
    "master_zone_id": "main_zone",
    "is_online": true,
    "last_heartbeat": "2026-02-01T10:00:00Z",
    "uptime": 3600,
    "heap_free": 245760,
    "wifi_rssi": -65,
    "sensors": [...],
    "actuators": [...],
    "metadata": {...}
  }
}
```

---

### 2.3 POST /esp/devices

Neues ESP-Gerät manuell registrieren.

**Auth:** Operator Required

**Request Body (ESPDeviceCreate):**
```json
{
  "device_id": "ESP_12AB34CD",
  "name": "Greenhouse Sensor",
  "zone_id": "greenhouse",
  "zone_name": "Gewächshaus",
  "hardware_type": "ESP32_WROOM"
}
```

---

### 2.4 GET /esp/devices/pending

Pending Devices auflisten (warten auf Genehmigung).

**Auth:** Operator Required

**Response 200 (PendingDevicesListResponse):**
```json
{
  "success": true,
  "devices": [
    {
      "device_id": "ESP_12AB34CD",
      "discovered_at": "2026-02-01T10:00:00Z",
      "last_seen": "2026-02-01T10:05:00Z",
      "zone_id": null,
      "heap_free": 245760,
      "wifi_rssi": -65,
      "sensor_count": 2,
      "actuator_count": 1,
      "heartbeat_count": 5
    }
  ],
  "count": 1
}
```

---

### 2.5 PATCH /esp/devices/{esp_id}

ESP-Gerät aktualisieren.

**Auth:** Operator Required

**Request Body (ESPDeviceUpdate):**
```json
{
  "name": "New Name",
  "zone_id": "new_zone"
}
```

---

### 2.6 DELETE /esp/devices/{esp_id}

ESP-Gerät soft-delete (setzt `deleted_at`). Sensordaten, Heartbeat-Logs, Aktor-Historie und AI-Predictions bleiben erhalten (FK SET NULL). Sensor/Actuator-Configs werden per CASCADE gelöscht.

**Auth:** Operator Required

---

### 2.7 POST /esp/devices/{esp_id}/approve

Pending Device genehmigen.

**Auth:** Operator Required

**Request Body (ESPApprovalRequest):**
```json
{
  "name": "Gewächshaus Sensor 1",
  "zone_id": "greenhouse",
  "zone_name": "Gewächshaus"
}
```

**Response 200 (ESPApprovalResponse):**
```json
{
  "success": true,
  "message": "Device 'ESP_12AB34CD' approved successfully",
  "device_id": "ESP_12AB34CD",
  "status": "approved",
  "approved_by": "admin",
  "approved_at": "2026-02-01T10:10:00Z"
}
```

---

### 2.8 POST /esp/devices/{esp_id}/reject

Pending Device ablehnen.

**Auth:** Operator Required

**Request Body (ESPRejectionRequest):**
```json
{
  "reason": "Unknown device, not part of installation"
}
```

---

## 3. Sensors (`/sensors`)

### 3.1 GET /sensors

Alle Sensoren auflisten.

**Auth:** JWT Required

**Query-Parameter:**

| Parameter | Typ | Beschreibung |
|-----------|-----|--------------|
| `esp_id` | string | Filter nach ESP |
| `sensor_type` | string | Filter nach Typ |
| `active` | bool | Nur aktive Sensoren |
| `subzone_id` | string | Filter nach Subzone |

---

### 3.2 GET /sensors/{sensor_id}

Sensor-Details.

**Auth:** JWT Required

---

### 3.2b GET /sensors/data

Query historische Sensor-Daten (global, filterbar). Phase 0.1: Response enthält `zone_id`, `subzone_id` pro Reading (zum Messzeitpunkt).

**Auth:** JWT Required

**Query-Parameter:**

| Parameter | Typ | Beschreibung |
|-----------|-----|--------------|
| `esp_id` | string | Filter nach ESP device ID |
| `gpio` | int | Filter nach GPIO |
| `sensor_type` | string | Filter nach Sensortyp |
| `start_time` | datetime | Startzeit (ISO) |
| `end_time` | datetime | Endzeit (ISO) |
| `quality` | string | Filter nach quality |
| `zone_id` | string | Filter nach Zone (Phase 0.1) |
| `subzone_id` | string | Filter nach Subzone (Phase 0.1) |
| `limit` | int | Max. Anzahl (1-1000, default 100) |
| `resolution` | string | Aggregation: `raw` (default), `1m`, `5m`, `1h`, `1d` |
| `before_timestamp` | datetime | Cursor-Pagination: nur Daten vor diesem Zeitpunkt |

**Response 200 (SensorDataResponse):**
```json
{
  "success": true,
  "esp_id": "ESP_12AB34CD",
  "gpio": 34,
  "sensor_type": "ph",
  "readings": [
    {
      "timestamp": "2026-02-01T10:00:00Z",
      "raw_value": 2150,
      "processed_value": 6.8,
      "unit": "pH",
      "quality": "good",
      "sensor_type": "ph",
      "zone_id": "greenhouse",
      "subzone_id": "zone_a",
      "min_value": 6.5,
      "max_value": 7.1,
      "sample_count": 12
    }
  ],
  "count": 1,
  "resolution": "1h",
  "time_range": {"start": "...", "end": "...", "has_more": true, "next_cursor": "2026-02-01T09:00:00Z"}
}
```

---

### 3.3 GET /sensors/{sensor_id}/data

Historische Sensor-Daten.

**Auth:** JWT Required

**Query-Parameter:**

| Parameter | Typ | Beschreibung |
|-----------|-----|--------------|
| `start_time` | datetime | Startzeit (ISO) |
| `end_time` | datetime | Endzeit (ISO) |
| `limit` | int | Max. Anzahl Einträge |
| `resolution` | string | `raw` (default), `1m`, `5m`, `1h`, `1d` |

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "timestamp": "2026-02-01T10:00:00Z",
      "raw_value": 2150,
      "processed_value": 21.5,
      "unit": "°C",
      "quality": "good"
    }
  ]
}
```

---

### 3.4 GET /sensors/{sensor_id}/stats

Sensor-Statistiken. Berechnet min/max/avg/stddev aus `COALESCE(processed_value, raw_value)` — fällt auf raw_value zurück wenn processed_value NULL ist.

**Auth:** JWT Required

**Query-Parameter:**
| Parameter | Typ | Default | Beschreibung |
|-----------|-----|---------|--------------|
| `start_time` | datetime | -24h | Start des Zeitraums |
| `end_time` | datetime | now | Ende des Zeitraums |
| `sensor_type` | string | null | Filter für Multi-Value-Sensoren (z.B. `sht31_temp`, `sht31_humidity`). Ohne Filter: Stats des ersten Sensor-Typs auf dem GPIO |

**Response 200:**
```json
{
  "success": true,
  "data": {
    "min": 18.5,
    "max": 28.3,
    "avg": 22.1,
    "count": 1440,
    "period": "24h"
  }
}
```

---

## 4. Actuators (`/actuators`)

### 4.1 GET /actuators

Alle Actuators auflisten.

**Auth:** JWT Required

---

### 4.2 GET /actuators/{esp_id}/{gpio}

Actuator-Details.

**Auth:** JWT Required

---

### 4.3 POST /actuators/{esp_id}/{gpio}/command

Actuator steuern.

**Auth:** Operator Required

**Request Body (ActuatorCommand):**
```json
{
  "command": "ON",
  "value": 1.0,
  "duration": 60
}
```

**Commands:** `ON`, `OFF`, `PWM`, `TOGGLE`

**Response 200:**
```json
{
  "success": true,
  "message": "Command sent",
  "command_id": "cmd_12345"
}
```

---

### 4.4 POST /actuators/emergency_stop

Global Emergency-Stop für alle Actuators.

**Legacy Alias:** `/actuators/emergency-stop` (**deprecated**, Sunset: **2026-07-03**)

**Auth:** Operator Required

**Request Body (EmergencyStopRequest):**
```json
{
  "reason": "User request",
  "esp_id": "ESP_12AB34CD"
}
```

---

### 4.5 POST /actuators/clear_emergency

Not-Aus aufheben: Emergency-Flag serverseitig und auf allen betroffenen ESPs (bzw. Mocks) zuruecksetzen. Sendet MQTT-Payload `{"command": "clear_emergency", "reason": "..."}` an jedes Geraet (einzeln oder via Broadcast je nach Implementierung). Aktoren sind danach wieder steuerbar.

**Legacy Alias:** `/actuators/clear-emergency` (**deprecated**, Sunset: **2026-07-03**)

**Auth:** JWT (Operator)

**Request Body (ClearEmergencyRequest):**
```json
{
  "esp_id": "ESP_12AB34CD",
  "reason": "manual"
}
```
- `esp_id`: optional; wenn gesetzt nur dieses Geraet, sonst alle Geraete.

**Response 200 (ClearEmergencyResponse):**
```json
{
  "success": true,
  "message": "Emergency stop cleared",
  "devices_cleared": 2
}
```

---

## 5. Logic/Automation (`/logic`)

### 5.1 GET /logic/rules

Automation Rules auflisten (paginiert, sortiert nach Priority aufsteigend — niedrigere Nummer = höhere Priorität).

**Auth:** JWT Required

**Query-Parameter:**

| Parameter | Typ | Default | Beschreibung |
|-----------|-----|---------|--------------|
| `enabled` | bool | - | Filter nach enabled Status |
| `page` | int | 1 | Seite (1-indexed) |
| `page_size` | int | 20 | Einträge pro Seite (max: 100) |

**Response 200 (LogicRuleListResponse):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "High pH Alert",
      "description": "Stop dosing pump when pH exceeds 7.5",
      "conditions": [
        {"type": "sensor", "esp_id": "ESP_12AB34CD", "gpio": 34, "operator": ">", "value": 7.5}
      ],
      "actions": [
        {"type": "actuator", "esp_id": "ESP_AABBCCDD", "gpio": 5, "command": "OFF"}
      ],
      "logic_operator": "AND",
      "enabled": true,
      "priority": 80,
      "cooldown_seconds": 300,
      "max_executions_per_hour": null,
      "last_triggered": "2026-01-01T12:00:00Z",
      "execution_count": 15,
      "last_execution_success": true,
      "created_at": "2026-01-01T00:00:00Z",
      "updated_at": "2026-01-01T12:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "page_size": 20,
    "total_items": 5,
    "total_pages": 1,
    "has_next": false,
    "has_prev": false
  }
}
```

---

### 5.2 POST /logic/rules

Neue Rule erstellen.

**Auth:** Operator Required

**Request Body (LogicRuleCreate):**
```json
{
  "name": "High pH Alert",
  "description": "Stop dosing pump when pH exceeds 7.5",
  "conditions": [
    {
      "type": "sensor",
      "esp_id": "ESP_12AB34CD",
      "gpio": 34,
      "operator": ">",
      "value": 7.5,
      "sensor_type": "ph"
    },
    {
      "type": "time",
      "start_time": "06:00",
      "end_time": "22:00"
    }
  ],
  "actions": [
    {
      "type": "actuator",
      "esp_id": "ESP_AABBCCDD",
      "gpio": 5,
      "command": "OFF",
      "value": 0.0
    }
  ],
  "logic_operator": "AND",
  "enabled": true,
  "priority": 80,
  "cooldown_seconds": 300,
  "max_executions_per_hour": 10
}
```

**Condition Types:**

| type | Felder | Beschreibung |
|------|--------|--------------|
| `sensor` / `sensor_threshold` | esp_id, gpio, operator, value, sensor_type?, subzone_id? (Phase 2.4) | Sensor-Schwellwert |
| `time` / `time_window` | start_time (HH:MM), end_time (HH:MM), days_of_week? | Zeitfenster |
| `hysteresis` | esp_id, gpio, sensor_type?, activate_above?, deactivate_below?, activate_below?, deactivate_above? | Hysterese |
| `compound` | logic (AND/OR), conditions[] | Verschachtelte Bedingungen |

**Action Types:**

| type | Felder | Beschreibung |
|------|--------|--------------|
| `actuator` / `actuator_command` | esp_id, gpio, command (ON/OFF/PWM/TOGGLE), value?, duration? | Actuator steuern |
| `notification` | channel (email/webhook/websocket), target, message_template | Benachrichtigung |
| `delay` | seconds (1-3600) | Verzögerung |
| `sequence` | description?, abort_on_failure?, steps[] (name, action, delay_seconds?) | Verkettete Aktionen |

**Response 201 (LogicRuleResponse):** Siehe GET /logic/rules Response-Objekt.

**Error Responses:**
| Code | Reason |
|------|--------|
| 400 | Validation Error oder Duplicate Name |
| 422 | Unprocessable Entity |

---

### 5.3 GET /logic/rules/{rule_id}

Rule Details abrufen.

**Auth:** JWT Required

**Response 200 (LogicRuleResponse):** Siehe GET /logic/rules Response-Objekt.

**Error Responses:**
| Code | Reason |
|------|--------|
| 404 | Rule not found |

---

### 5.4 PUT /logic/rules/{rule_id}

Rule aktualisieren (alle Felder optional).

**Auth:** Operator Required

**Request Body (LogicRuleUpdate):**
```json
{
  "name": "Updated Name",
  "conditions": [...],
  "actions": [...],
  "priority": 90
}
```

**Response 200 (LogicRuleResponse):** Siehe GET /logic/rules Response-Objekt.

**Error Responses:**
| Code | Reason |
|------|--------|
| 400 | Validation Error |
| 404 | Rule not found |

---

### 5.5 DELETE /logic/rules/{rule_id}

Rule löschen.

**Auth:** Operator Required

**Response 200 (LogicRuleResponse):** Gibt die gelöschte Rule zurück.

**Error Responses:**
| Code | Reason |
|------|--------|
| 404 | Rule not found |

---

### 5.6 POST /logic/rules/{rule_id}/toggle

Rule aktivieren/deaktivieren.

**Auth:** Operator Required

**Request Body (RuleToggleRequest):**
```json
{
  "enabled": true,
  "reason": "Maintenance complete"
}
```

**Response 200 (RuleToggleResponse):**
```json
{
  "success": true,
  "message": "Rule 'High pH Alert' enabled",
  "rule_id": "uuid",
  "rule_name": "High pH Alert",
  "enabled": true,
  "previous_state": false
}
```

---

### 5.7 POST /logic/rules/{rule_id}/test

Rule testen/simulieren ohne Aktionen auszuführen.

**Auth:** Operator Required

**Request Body (RuleTestRequest):**
```json
{
  "mock_sensor_values": {"ESP_12AB34CD:34": 7.8},
  "mock_time": "14:30",
  "dry_run": true
}
```

**Response 200 (RuleTestResponse):**
```json
{
  "success": true,
  "rule_id": "uuid",
  "rule_name": "High pH Alert",
  "would_trigger": true,
  "condition_results": [
    {
      "condition_index": 0,
      "condition_type": "sensor",
      "result": true,
      "details": "ESP_12AB34CD:34 (7.8) > 7.5",
      "actual_value": 7.8
    }
  ],
  "action_results": [
    {
      "action_index": 0,
      "action_type": "actuator",
      "would_execute": true,
      "details": "ESP_AABBCCDD:5 OFF",
      "dry_run": true
    }
  ],
  "dry_run": true
}
```

---

### 5.8 GET /logic/execution_history

Execution History abfragen (nicht rule-scoped).

**Auth:** JWT Required

**Query-Parameter:**

| Parameter | Typ | Default | Beschreibung |
|-----------|-----|---------|--------------|
| `rule_id` | UUID | - | Filter nach Rule |
| `success` | bool | - | Filter nach Erfolg |
| `start_time` | datetime | -7 Tage | Start-Zeitraum (ISO) |
| `end_time` | datetime | jetzt | End-Zeitraum (ISO) |
| `limit` | int | 50 | Max Ergebnisse (1-100) |

**Response 200 (ExecutionHistoryResponse):**
```json
{
  "success": true,
  "entries": [
    {
      "id": "uuid",
      "rule_id": "uuid",
      "rule_name": "High pH Alert",
      "triggered_at": "2026-01-01T12:00:00Z",
      "trigger_reason": "ESP_12AB34CD:34 (7.8) > 7.5",
      "actions_executed": [
        {"type": "actuator", "esp_id": "ESP_AABBCCDD", "gpio": 5, "command": "OFF"}
      ],
      "success": true,
      "error_message": null,
      "execution_time_ms": 45.2
    }
  ],
  "total_count": 150,
  "success_rate": 0.95
}
```

---

## 6. Debug/Mock-ESP (`/debug`)

### 6.1 POST /debug/mock-esp

Mock-ESP erstellen.

**Auth:** JWT Required

**Request Body (MockESPCreate):**
```json
{
  "esp_id": "ESP_MOCK_001",
  "name": "Test ESP",
  "zone_id": "test_zone"
}
```

---

### 6.2 GET /debug/mock-esp/{esp_id}

Mock-ESP Details (Live aus Memory).

**Auth:** JWT Required

---

### 6.3 POST /debug/mock-esp/{esp_id}/sensors

Sensor zu Mock-ESP hinzufügen.

**Auth:** JWT Required

**Request Body (MockSensorConfig):**
```json
{
  "gpio": 4,
  "sensor_type": "DS18B20",
  "name": "Test Sensor",
  "initial_value": 20.0
}
```

> **BEKANNTE BUGS (T02-T08, 2026-03-07):**
> - **NB6:** Key-Format `{gpio}_{sensor_type}` in `simulation_config` überschreibt bei 2+ Sensoren gleichen Typs auf gleichem GPIO (z.B. 2x DS18B20 auf OneWire-Bus, 2x SHT31 auf I2C GPIO 0).
> - **NB7:** Frontend DS18B20 OneWire-Flow sendet `name`, `initial_value`, `unit` nicht mit — Backend erhält auto-generierte Werte. SHT31-Flow funktioniert korrekt.
> - **NB10:** Multi-Value-Split (SHT31 → temp + humidity) nur im Batch-Create-Pfad, nicht bei Einzel-Add über diesen Endpoint.

---

### 6.3a DELETE /debug/mock-esp/{esp_id}/sensors/{gpio}

Sensor von Mock-ESP entfernen. **Veraltet** — Frontend nutzt seit T10-Fix-B einheitlich `DELETE /sensors/{esp_id}/{config_id}`.

**Auth:** JWT Required

> **T10-Fix-B Guard:** Bei >1 Sensor auf demselben GPIO (z.B. I2C-Bus GPIO 0) und fehlendem `sensor_type` Query-Parameter gibt der Endpoint **409 Conflict** zurück statt alle Sensoren zu löschen. Bevorzugter Weg: `DELETE /sensors/{esp_id}/{config_id}` (UUID, Single Source of Truth).

---

### 6.4 POST /debug/mock-esp/{esp_id}/sensors/{gpio}

Sensor-Wert setzen.

**Auth:** JWT Required

**Request Body (SetSensorValueRequest):**
```json
{
  "raw_value": 2150,
  "quality": "good",
  "publish": true
}
```

---

## 7. Database Explorer (`/debug/db`)

### 7.1 GET /debug/db/tables

Alle Tabellen mit Schema.

**Auth:** JWT Required

---

### 7.2 GET /debug/db/{table}

Tabellen-Daten mit Filter/Pagination.

**Auth:** JWT Required

**Query-Parameter:**

| Parameter | Typ | Beschreibung |
|-----------|-----|--------------|
| `page` | int | Seitennummer (1-indexed) |
| `page_size` | int | Records pro Seite (max: 500) |
| `sort_by` | string | Sortier-Spalte |
| `sort_order` | string | "asc" oder "desc" |
| `filters` | JSON | Filter-Objekt |

---

## 8. Logs (`/debug/logs`)

### 8.1 GET /debug/logs

Server-Logs mit Filter.

**Auth:** JWT Required

**Query-Parameter:**

| Parameter | Typ | Beschreibung |
|-----------|-----|--------------|
| `level` | string | DEBUG, INFO, WARNING, ERROR, CRITICAL |
| `module` | string | Logger-Name |
| `start_time` | datetime | Startzeit (ISO) |
| `end_time` | datetime | Endzeit (ISO) |
| `search` | string | Volltext-Suche |
| `page` | int | Seite |
| `page_size` | int | Einträge pro Seite |

---

## 9. Health (`/health`)

### 9.1 GET /health

Health Check (keine Auth erforderlich).

**Response 200:**
```json
{
  "status": "healthy",
  "mqtt_connected": true
}
```

> **Hinweis:** `/health` gibt nur `status` und `mqtt_connected` zurück. Für Details `/health/detailed` nutzen.

### 9.2 GET /health/detailed

Detaillierter Health Check mit Komponenten-Status (JWT erforderlich, ActiveUser).

**Response 200:**
```json
{
  "success": true,
  "status": "healthy",
  "version": "2.0.0",
  "environment": "production",
  "uptime_seconds": 86400,
  "uptime_formatted": "1d 0h 0m",
  "timestamp": "2026-03-10T12:00:00Z",
  "database": { "connected": true, "pool_size": 20, "latency_ms": 5.2, "database_type": "PostgreSQL" },
  "mqtt": { "connected": true, "broker_host": "mqtt-broker", "broker_port": 1883 },
  "websocket": { "active_connections": 2 },
  "system": { "cpu_percent": 15.0, "memory_percent": 45.0, "disk_percent": 30.0 },
  "resilience": {
    "healthy": true,
    "breakers": {
      "mqtt": { "state": "closed", "failures": 0, "failure_threshold": 5, "last_failure": null, "forced_open": false },
      "database": { "state": "closed", "failures": 0, "failure_threshold": 5, "last_failure": null, "forced_open": false }
    },
    "summary": { "total": 2, "closed": 2, "open": 0, "half_open": 0 }
  },
  "components": [],
  "warnings": []
}
```

> **Resilience-Feld (Fix-X):** Zeigt Circuit Breaker Status aller registrierten Breaker. Offene Breakers setzen `status: "degraded"` und erzeugen einen Warning-Eintrag. Feld ist `null` wenn ResilienceRegistry nicht initialisiert. Admin-Detail-Ansicht inkl. MQTT-Client-Status: `GET /debug/resilience/status`.

---

## 10. Error Responses

### Standard-Error-Response

```json
{
  "success": false,
  "error": {
    "code": 5201,
    "message": "Invalid ESP device ID format",
    "details": {
      "esp_id": "invalid"
    }
  }
}
```

### HTTP Status Codes

| Code | Bedeutung |
|------|-----------|
| 200 | OK |
| 201 | Created |
| 400 | Bad Request (Validation Error) |
| 401 | Unauthorized (Token fehlt/ungültig) |
| 403 | Forbidden (Keine Berechtigung) |
| 404 | Not Found |
| 409 | Conflict (Duplicate) |
| 422 | Unprocessable Entity |
| 500 | Internal Server Error |

---

## 11. Pydantic Schemas (Übersicht)

### Auth Schemas (`schemas/auth.py`)
- `SetupRequest`, `LoginRequest`, `TokenResponse`
- `RegisterRequest`, `RefreshTokenRequest`
- `UserBase`, `UserUpdate`, `PasswordChangeRequest`
- `LogoutRequest`, `MQTTAuthConfigRequest`
- `APIKeyCreate`, `APIKeyInfo`

### ESP Schemas (`schemas/esp.py`)
- `ESPDeviceBase`, `ESPDeviceUpdate`
- `GpioStatusItem`, `GpioStatusResponse`
- `ESPHealthMetrics`, `ESPHealthSummary`
- `ESPConfigUpdate`, `ESPRestartRequest`
- `PendingESPDevice`, `ESPApprovalRequest`

### Sensor Schemas (`schemas/sensor.py`)
- `SensorConfigBase`, `SensorConfigCreate`, `SensorConfigUpdate`
- `description`, `unit` (optional, max 500/20 Zeichen) — persistiert in `sensor_metadata`, bei GET zurückgegeben
- `SensorReading` (inkl. zone_id, subzone_id Phase 0.1), `SensorDataQuery`, `SensorStats`
- `SensorProcessRequest`, `SensorCalibrateRequest`
- `OneWireDevice`, `OneWireScanRequest`

### Actuator Schemas (`schemas/actuator.py`)
- `ActuatorConfigBase`, `ActuatorConfigUpdate`
- `ActuatorCommand`, `ActuatorState`
- `EmergencyStopRequest`, `ActuatorHistoryEntry`

### Logic Schemas (`schemas/logic.py`)
- `SensorCondition` (optional `subzone_id` Phase 2.4), `TimeCondition`, `HysteresisCondition`, `CompoundCondition`
- `ActuatorAction`, `NotificationAction`, `DelayAction`
- `LogicRuleBase`, `LogicRuleCreate`, `LogicRuleUpdate`
- `LogicRuleResponse`, `LogicRuleListResponse`
- `RuleToggleRequest`, `RuleToggleResponse`
- `RuleTestRequest`, `RuleTestResponse`, `ConditionResult`, `ActionResult`
- `ExecutionHistoryEntry`, `ExecutionHistoryQuery`, `ExecutionHistoryResponse`

### Alert Config Schemas (`schemas/alert_config.py`)
- `SensorAlertConfigUpdate`, `ActuatorAlertConfigUpdate`, `DeviceAlertConfigUpdate`
- `CustomThresholds`, `MaintenanceLogEntry`
- `RuntimeStatsUpdate`, `RuntimeStatsResponse`

### Notification Schemas (`schemas/notification.py`)
- `NotificationCreate`, `NotificationResponse`, `NotificationListResponse`
- `NotificationPreferencesUpdate`, `NotificationPreferencesResponse`
- `UnreadCountResponse`, `TestEmailRequest`
- `AlertStatsResponse`, `AlertActiveListResponse` (Phase 4B)
- `EmailLogResponse`, `EmailLogBrief`, `EmailLogListResponse`, `EmailLogStatsResponse` (Phase C V1.1, V1.2: status permanently_failed)
- `GrafanaAlert`, `GrafanaWebhookPayload`

### Debug Schemas (`schemas/debug.py`)
- `MockESPCreate`, `MockESPUpdate`, `MockESPResponse`
- `MockSensorConfig`, `SetSensorValueRequest`
- `MockActuatorConfig`, `ActuatorCommandRequest`

### Health Schemas (`schemas/health.py`)
- `HealthResponse`, `DetailedHealthResponse`, `LivenessResponse`, `ReadinessResponse`
- `DatabaseHealth`, `MQTTHealth`, `WebSocketHealth`, `SystemResourceHealth`, `ComponentHealth`
- `CircuitBreakerHealth`, `ResilienceSummary`, `ResilienceHealth` (Fix-X)
- `ESPHealthItem`, `ESPHealthSummaryResponse`, `RecentError`

### Common Schemas (`schemas/common.py`)
- `APIResponse[T]`, `PaginatedResponse[T]`
- `BaseResponse`, `ErrorResponse`
- `PaginationParams`, `PaginationMeta`
- `TimeRangeFilter`, `ValidationError`

---

## 12. Code-Locations

### Frontend API-Module (`El Frontend/src/api/`)

| Modul | Datei | Beschreibung |
|-------|-------|--------------|
| auth | `auth.ts` | Authentication |
| esp | `esp.ts` | ESP Devices (Mock + Real) |
| sensors | `sensors.ts` | Sensor CRUD |
| actuators | `actuators.ts` | Actuator Control |
| zones | `zones.ts` | Zone Management |
| subzones | `subzones.ts` | Subzone Management |
| logic | `logic.ts` | Automation Rules |
| debug | `debug.ts` | Mock-ESP Simulation |
| database | `database.ts` | Database Explorer |
| logs | `logs.ts` | Log Viewer |
| audit | `audit.ts` | Audit Logs |
| users | `users.ts` | User Management |
| notifications | `notifications.ts` | Notification Inbox + Preferences + Email Log |
| backups | `backups.ts` | DB-Backup create/list/download/restore/cleanup (Admin) |
| inventory | `inventory.ts` | Wissensdatenbank (aggregiert zone context, export, device schemas) |

### Backend Router (`El Servador/god_kaiser_server/src/api/v1/`)

| Router | Datei | Endpoints |
|--------|-------|-----------|
| auth | `auth.py` | 10 |
| esp | `esp.py` | 17 |
| sensors | `sensors.py` | 16 |
| actuators | `actuators.py` | 12 |
| zone | `zone.py` | 5 |
| zone_context | `zone_context.py` | 7 |
| subzone | `subzone.py` | 6 |
| logic | `logic.py` | 8 |
| sequences | `sequences.py` | 4 |
| sensor_type_defaults | `sensor_type_defaults.py` | 6 |
| debug | `debug.py` | ~60 |
| errors | `errors.py` | 4 |
| audit | `audit.py` | 22 |
| users | `users.py` | 7 |
| health | `health.py` | 6 |
| notifications | `notifications.py` | 15 |
| diagnostics | `diagnostics.py` | 6 |
| plugins | `plugins.py` | 8 |
| backups | `backups.py` | 6 |
| export (component_export) | `component_export.py` | 5 |
| schema_registry | `schema_registry.py` | 3 |
| webhooks | `webhooks.py` | 1 |
| logs | `logs.py` | 1 |
| websocket | `websocket/realtime.py` | 1 |
| ai | `ai.py` | PLANNED (God Layer AI) |
| kaiser | `kaiser.py` | IMPLEMENTED (Kaiser Relay Node, Hierarchy) |
| library | — | REMOVED (INV-1b, war nie implementiert) |
| device_context | `device_context.py` | 3 (T13-R2 Multi-Zone Device Scope) |
