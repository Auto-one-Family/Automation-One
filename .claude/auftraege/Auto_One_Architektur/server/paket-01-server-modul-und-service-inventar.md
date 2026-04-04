# Paket 01 - Server Modul- und Service-Inventar (El Servador)

Stand: 2026-04-03  
Scope: Produktiver Server-Code unter `El Servador/god_kaiser_server/src/` (Analyse, keine Codeaenderung)

## 1. Executive Snapshot (max 12 Bullet-Points)

- El Servador ist faktisch die zentrale Steuerinstanz zwischen ESP, DB und Frontend; die Startannahme passt im Kern.
- Der Runtime-Einstieg `src/main.py` ist der zentrale Orchestrator fuer DB, MQTT, Handler-Registrierung, WebSocket, Logic Engine, Scheduler und Nebenservices.
- API-Layer ist breit ausgebaut (29 Router-Dateien, inkl. Ops/Debug/Plugin/Diagnostics) und stark service-getrieben.
- Messaging-Pfad ist klar getrennt: `mqtt/client.py` (Transport/Resilience), `mqtt/subscriber.py` (Routing/Threadpool), `mqtt/handlers/*` (Domain-Reaktion), `mqtt/publisher.py` (outbound Commands/Config).
- Persistenz ist DB-zentriert mit Repository-Pattern (`db/repositories/*`) plus starkem Einsatz von JSON-Feldern in Device-/Config-Tabellen.
- Logic Engine ist ein eigener kritischer Kernpfad mit modularen Condition-/Action-Evaluatoren und Safety-Bausteinen (ConflictManager, RateLimiter, Hysteresis-State).
- Safety ist zweistufig: Command-Gating im `SafetyService` plus Laufzeit-Schutz in der Logic Engine; beide sind fuer Aktor-Sicherheit kritisch.
- Background-Runtime ist zweigleisig: `core/scheduler.py` (Maintenance/Simulation/Monitoring) plus `services/logic_scheduler.py` (zeitbasierte Rule-Evaluation).
- Device-Ingestion nutzt primar Heartbeat + Sensor-Topics; `discovery_handler.py` ist weiterhin vorhanden, aber als deprecated markiert.
- Command/Dispatch ist auf MQTT gestuetzt; Zone/Subzone nutzen ACK-Waiting ueber `MQTTCommandBridge`, was robust ist, aber implizite Fallback-Vertraege hat.
- IST != Startannahme: Es existieren serverinterne Mock-/Simulation-Subsysteme, die produktiven Codepfad teilen (nicht nur Testcode), inklusive eigener Runtime- und MQTT-Hooks.
- Hauptrisiken liegen in zentralen Orchestrierungs-SPOFs, JSON-basierten impliziten Contracts, sowie hoher Kopplung zwischen Handlern, Services und Repositories.

## 2. Layer-Karte

### 2.1 API / Router / Controller

- Entry: `src/api/v1/__init__.py` (Router-Komposition)
- Router (vollstaendig):  
  `auth`, `users`, `esp`, `sensors`, `sensor_type_defaults`, `actuators`, `logic`, `health`, `audit`, `debug`, `errors`, `logs`, `notifications`, `zone`, `zones`, `subzone`, `device_context`, `zone_context`, `dashboards`, `plugins`, `diagnostics`, `backups`, `sequences`, `webhooks`, `component_export`, `schema_registry`, `ai`, `kaiser`
- Realtime API: `src/api/v1/websocket/realtime.py`

### 2.2 Domain-Services

- Core Domain: `esp_service`, `sensor_service`, `actuator_service`, `safety_service`, `logic_service`, `logic_engine`, `logic_scheduler`
- Zonen-Kontext: `zone_service`, `subzone_service`, `device_scope_service`, `zone_context_service`, `monitor_data_service`
- Config/Provisioning: `config_builder`, `sensor_type_registration`, `sensor_scheduler_service`, `gpio_validation_service`
- Notifications/Ops: `notification_router`, `email_service`, `email_retry_service`, `digest_service`, `alert_suppression_service`, `alert_suppression_scheduler`
- Plugin/Diagnostics: `plugin_service`, `diagnostics_service`, `diagnostics_report_generator`
- Weitere produktive Services: `database_backup_service`, `audit_retention_service`, `audit_backup_service`, `dashboard_service`, `health_service`, `kaiser_service`, `mqtt_auth_service`, `event_aggregator_service`, `library_service`, `ai_service`, `ai_notification_bridge`, `zone_kpi_service`, `zone_aware_thresholds`, `vpd_calculator`, `god_client`

### 2.3 Messaging (MQTT/Event)

- Transport/Broker-Anbindung: `mqtt/client.py`
- Subscription/Routing: `mqtt/subscriber.py`
- Publishing: `mqtt/publisher.py`
- Offline-Resilience: `mqtt/offline_buffer.py`
- Topic-Contract: `mqtt/topics.py`
- Handler (vollstaendig produktiv):  
  `sensor_handler`, `heartbeat_handler`, `lwt_handler`, `actuator_handler`, `actuator_response_handler`, `actuator_alert_handler`, `config_handler`, `zone_ack_handler`, `subzone_ack_handler`, `error_handler`, `diagnostics_handler`, `discovery_handler` (deprecated, aber aktiv), `base_handler`

### 2.4 Persistence / Repository / DB

- Session/Engine/Circuit-Breaker: `db/session.py`
- Repositories (Kern): `esp_repo`, `sensor_repo`, `actuator_repo`, `logic_repo`, `notification_repo`, `zone_repo`, `subzone_repo`, `device_context_repo`, `zone_context_repo`, `audit_log_repo`
- Repositories (erg.): `email_log_repo`, `dashboard_repo`, `user_repo`, `token_blacklist_repo`, `sensor_type_defaults_repo`, `esp_heartbeat_repo`, `system_config_repo`, `kaiser_repo`, `library_repo`, `ai_repo`, `base_repo`
- Models (Domain-Kerne): ESP, Sensor, Actuator, Logic, Zone/Subzone, Notification, Audit, User/Auth, Diagnostics, Plugin, Dashboard, DeviceContext, Heartbeat

### 2.5 Runtime / Worker / Scheduler / Background

- App-Lifecycle-Orchestrierung: `main.py`
- Zentraler Scheduler: `core/scheduler.py`
- Maintenance Worker: `services/maintenance/service.py` (+ jobs)
- Simulation Worker: `services/simulation/scheduler.py`
- WebSocket Runtime: `websocket/manager.py`
- Resilience Runtime: `core/resilience/*`, `core/metrics.py`, `middleware/request_id.py`

## 3. Vollstaendige Modultabelle

Legende Kritikalitaet: `kritisch` = sicherheits-/kernpfadkritisch, `hoch` = produktionsrelevant mit starker Auswirkung, `mittel` = wichtig aber nicht primarer Safety-Kern.

| Modul-ID | Layer | Modul | Rolle / Verantwortung | Explizite Nicht-Verantwortung | Inputs | Outputs | Persistenzbezug | Up-/Downstream Abhaengigkeiten | Kritikalitaet |
|---|---|---|---|---|---|---|---|---|---|
| SRV-MOD-001 | Runtime | `main.py` | Gesamte Startup/Shutdown-Orchestrierung, Wiring aller Kernkomponenten | Keine Fachentscheidung zu Sensor-/Aktorlogik selbst | App-Lifecycle, Settings | Initialisierte globale Laufzeitinstanzen | RAM + indirekt DB/MQTT | nutz fast alle Core/DB/MQTT/Services | kritisch (SPOF-Orchestrator) |
| SRV-MOD-002 | API | `api/v1/__init__.py` | Zusammensetzen aller v1-Router | Keine Fachlogik | Router-Imports | APIRouter-Graph | none | alle Router-Dateien | hoch |
| SRV-MOD-003 | API | `auth.py`, `users.py` | AuthN/AuthZ, User-Management Endpoints | Keine MQTT- oder Sensorprozessierung | HTTP Requests | JWT/Responses, DB writes | DB | security, user_repo, token_blacklist_repo | hoch |
| SRV-MOD-004 | API | `esp.py` | Device CRUD, Device Commands, Config Push Endpoints | Kein direkter MQTT-Transport | HTTP Requests | Service-Calls, API Responses | DB indirekt | esp_service, config_builder | kritisch (Device-Steuerung) |
| SRV-MOD-005 | API | `sensors.py`, `sensor_type_defaults.py` | Sensor-Konfig/Abfrage/Trigger-Endpunkte | Keine Roh-MQTT-Verarbeitung | HTTP Requests | DB writes, ggf. MQTT command publish | DB | sensor_service, config_builder | kritisch (Ingestion/Config) |
| SRV-MOD-006 | API | `actuators.py` | Aktor-Konfig und Befehlsendpunkte | Kein Safety-Bypass | HTTP Requests | Actuator commands via service | DB + MQTT indirekt | actuator_service, safety_service | kritisch |
| SRV-MOD-007 | API | `logic.py`, `sequences.py` | Rule CRUD, Regel- und Sequenzverwaltung | Keine direkte GPIO-Ausfuehrung | HTTP Requests | Regelzustandsaenderung, Trigger an LogicEngine | DB | logic_service, logic_engine | kritisch |
| SRV-MOD-008 | API | `zone.py`, `zones.py`, `subzone.py` | Zone/Subzone CRUD und Assignment-Endpunkte | Kein direkter Topic-String-Bau | HTTP Requests | MQTT Assign/Remove via Services + DB updates | DB | zone_service, subzone_service, mqtt_command_bridge | kritisch |
| SRV-MOD-009 | API | `device_context.py`, `zone_context.py`, `dashboards.py` | Kontexthaltung/Visualisierungsdaten fuer Frontend | Keine Aktorsteuerung | HTTP Requests | Read/Write Kontexte | DB | device_scope/zone_context/dashboard services | hoch |
| SRV-MOD-010 | API | `notifications.py`, `audit.py`, `errors.py`, `logs.py` | Alert/Audit/Error-Ingestion und Abfrage | Keine Sensorregel-Evaluation | HTTP Requests, Frontend Logs | Notification/Audit Daten + WS Events | DB | notification_router, repos | hoch |
| SRV-MOD-011 | API | `plugins.py`, `diagnostics.py`, `backups.py` | Betriebsfunktionen (Plugins, Diagnose, Backups) | Keine Device-Ingestion | HTTP Requests | Job-/Exec-Trigger, Reports | DB + filesystem indirekt | plugin_service, diagnostics_service, backup_service | hoch |
| SRV-MOD-012 | API | `webhooks.py`, `component_export.py`, `schema_registry.py`, `ai.py`, `kaiser.py` | Integrations-/Erweiterungs-APIs | Kein Kern-Safety-Check | HTTP Requests/Webhooks | Responses, ggf. DB writes | DB teils | spezialisierte services | mittel |
| SRV-MOD-013 | Messaging | `mqtt/client.py` | MQTT-Verbindung, Reconnect, Circuit-Breaker, Offline-Buffer | Keine Fachpayload-Interpretation | Broker events + publish requests | Connect/subscribe/publish side effects | RAM buffer | subscriber, publisher, core.resilience | kritisch (Transportbasis) |
| SRV-MOD-014 | Messaging | `mqtt/subscriber.py` | Topic-Matching, Handler-Dispatch, Threadpool/Loop-Bruecke | Keine Business-Validierung | raw MQTT messages | Handler invocations | RAM | mqtt client, TopicBuilder, handlers | kritisch |
| SRV-MOD-015 | Messaging | `mqtt/publisher.py` | Fachnahe Publish-API (commands/config/system) mit Retry | Kein DB-Tracking | service-level publish calls | MQTT messages | none | mqtt client, TopicBuilder | hoch |
| SRV-MOD-016 | Messaging | `mqtt/offline_buffer.py` | Puffern/Flushen bei Broker-Ausfall | Keine Persistenz in DB | publish failures | buffered replay | RAM | mqtt client | hoch |
| SRV-MOD-017 | Messaging | `mqtt/topics.py` | Topic-Builder und Topic-Parser als Contract-Schicht | Keine Payload-Validierung | topic build/parse calls | topic strings + parsed metadata | none | API/services/handlers | kritisch (Contract-Owner) |
| SRV-MOD-018 | Messaging Handler | `sensor_handler.py` | Sensor-Data Ingestion, Validierung, Persistierung, Trigger Logic | Keine Rule-Definition | MQTT `.../sensor/.../data` | DB sensor_data, WS events, logic trigger | DB + RAM cache | sensor_repo, esp_repo, logic_engine | kritisch |
| SRV-MOD-019 | Messaging Handler | `heartbeat_handler.py` | Device-Liveness, Auto-Discovery, Reconnect-Logik, ACK | Keine Sensorwertprozessierung | MQTT heartbeat | Device status updates, audit/ws events | DB + RAM caches | esp_repo, logic_engine, mqtt bridge | kritisch |
| SRV-MOD-020 | Messaging Handler | `lwt_handler.py` | Instant-offline Detection via LWT | Keine Discovery-Fachlogik | MQTT LWT | Device offline state, audit/ws | DB | esp_repo, actuator_repo | hoch |
| SRV-MOD-021 | Messaging Handler | `actuator_handler.py` | Verarbeitung Aktor-Statusmeldungen | Keine Command-Erzeugung | MQTT actuator status | actuator state/history updates | DB | actuator_repo, esp_repo | kritisch |
| SRV-MOD-022 | Messaging Handler | `actuator_response_handler.py` | Verarbeitung Command-Antworten (success/fail) | Kein Safety-Gating | MQTT actuator response | command-history, ws | DB | actuator_repo, esp_repo | hoch |
| SRV-MOD-023 | Messaging Handler | `actuator_alert_handler.py` | Kritische Aktor-Alerts (emergency/runtime/safety violations) | Keine Aktorsteuerung | MQTT actuator alert | notifications/audit/ws | DB | repos, notification stack | kritisch |
| SRV-MOD-024 | Messaging Handler | `config_handler.py` | Config ACK/NACK/Partial-Success Verarbeitung | Kein Config-Build | MQTT config_response | audit + config-status updates | DB | esp/sensor/actuator repos | hoch |
| SRV-MOD-025 | Messaging Handler | `zone_ack_handler.py`, `subzone_ack_handler.py` | ACK-Aufloesung fuer Zone/Subzone, DB-Bestaetigung | Kein Assignment-Entscheid | MQTT ack topics | ACK-Future resolution + ws/db updates | DB + RAM futures | mqtt_command_bridge, zone/subzone services | kritisch |
| SRV-MOD-026 | Messaging Handler | `error_handler.py`, `diagnostics_handler.py` | ESP Error-/Diagnostics-Ingestion und Broadcast | Keine Device-Config | MQTT error/diagnostics | audit + metadata updates + ws | DB | esp_repo, audit_repo | hoch |
| SRV-MOD-027 | Messaging Handler | `discovery_handler.py` | Legacy Discovery-Pfad (deprecated) | Kein primarer Discovery-Pfad mehr | MQTT discovery topic | device registration/update | DB | esp_repo | mittel (IST != Startannahme-Differenz) |
| SRV-MOD-028 | Service | `esp_service.py` | Device-Lebenszyklus, Config-Senden, Discovery/Approval, Restart/Reset | Keine Topic-Parsing-Logik | API/handler-Aufrufe | DB updates + MQTT command/config | DB + MQTT | esp_repo, publisher, audit/websocket | kritisch |
| SRV-MOD-029 | Service | `sensor_service.py` | Sensor-Config, Verarbeitung, Query, Trigger-Measurement | Keine Heartbeat-Steuerung | API/handler-Aufrufe | DB sensor data/config + MQTT measure | DB + MQTT | sensor_repo, esp_repo, publisher | kritisch |
| SRV-MOD-030 | Service | `actuator_service.py` | Aktor-Command-Ausfuehrung mit Safety-Gate und Logging | Keine Regel-Evaluation | API/logic actions | MQTT actuator command + audit/history/ws | DB + MQTT | safety_service, actuator_repo, publisher | kritisch |
| SRV-MOD-031 | Service | `safety_service.py` | Safety-Validierung fuer Aktorbefehle + Emergency Flags | Keine Topic-Transportrolle | actuator command requests | allow/deny Entscheidungen | RAM + DB lookups | actuator_repo, esp_repo | kritisch |
| SRV-MOD-032 | Service | `logic_engine.py` | Regel-Evaluation, Action-Ausfuehrung, Konflikt-/Rate-Schutz | Keine API-Auth oder HTTP concerns | Sensor/Timer/Reconnect Trigger | actuator commands, ws, execution logs | DB + RAM state | logic_repo, actuator_service, evaluators/executors | kritisch |
| SRV-MOD-033 | Service | `logic_scheduler.py` | Periodische Timer-Rule-Auswertung | Keine Action-Details | periodic tick | calls into logic_engine | RAM | logic_engine | hoch |
| SRV-MOD-034 | Service | `logic_service.py` + `services/logic/*` | Rule CRUD/Validation + Condition/Action Plugins + Safety-Submodule | Kein MQTT Transport | API calls | DB writes, engine interaction | DB + RAM | logic_repo, logic_engine | kritisch |
| SRV-MOD-035 | Service | `config_builder.py` | Build server->ESP Config inkl. offline_rules | Kein Publish selbst | ESP/config request | normalized config payload | DB reads | repos + mapping engine + sensor registry | kritisch |
| SRV-MOD-036 | Service | `zone_service.py` | Zone assignment/remove inkl. ACK-Flow und Subzone-Strategien | Keine HTTP-Auth | API calls + ACK events | DB zone state + MQTT assigns + ws | DB + MQTT | esp/zone/subzone repos, mqtt bridge | kritisch |
| SRV-MOD-037 | Service | `subzone_service.py` | Subzone assign/remove/safe-mode/ACK + DB sync | Keine globale Zone-Policy | API calls + ACK events | DB subzone state + MQTT subzone topics | DB + MQTT | esp_repo, subzone tables, publisher | kritisch |
| SRV-MOD-038 | Service | `mqtt_command_bridge.py` | ACK-basierte Command-Korrelation (Future-Registry) | Kein fachlicher Entscheid ueber payload-Inhalt | send-and-wait requests + ack callbacks | resolved futures / timeout errors | RAM | MQTT client + ack handlers | hoch |
| SRV-MOD-039 | Service | `device_scope_service.py`, `zone_context_service.py` | Active Context / Zone Context Aufloesung und Synchronisation | Keine Aktorbefehle | API/service requests | context decisions/writes | DB + RAM cache | context repos | hoch |
| SRV-MOD-040 | Service | `notification_router.py` | Zentrale Routinginstanz fuer Notifications (DB->WS->Email) | Kein Sensor-Ingestion | service calls | persisted notifications + ws + email | DB | notification/email/user repos + ws manager | hoch |
| SRV-MOD-041 | Service | `plugin_service.py` | Registry<->DB Sync, Plugin Execution, Schedule-Verwaltung | Keine Sensor/Aktor-Basislogik | API/scheduler triggers | plugin exec records + ws events | DB | plugin registry + scheduler + db | hoch |
| SRV-MOD-042 | Service | `diagnostics_service.py` | 10 modulare Systemchecks + Report-Persistenz | Keine Aktorsteuerung | API/scheduled trigger | diagnostic reports | DB | DB models/repos + optional plugin service | hoch |
| SRV-MOD-043 | Background | `maintenance/service.py` + jobs | Cleanup, Health-Checks, Aggregation-Jobs | Keine Rule-Evaluation | scheduler ticks | cleanup/monitor effects + ws events | DB + RAM stats | central scheduler + repos + handlers | hoch |
| SRV-MOD-044 | Background | `simulation/scheduler.py` + `simulation/actuator_handler.py` | Mock-ESP Runtime (Heartbeat/Sensor/Actuator simulation) | Kein real-device Firmware-Ersatz | API/scheduler/MQTT | simulated MQTT traffic + mock state updates | DB + RAM | central scheduler + mqtt + repos | hoch (Produktivpfad fuer Mock-Betrieb) |
| SRV-MOD-045 | Background | `sensor_scheduler_service.py` | Scheduled Sensor trigger jobs wiederherstellen/steuern | Keine sensor processing semantics | startup/schedule operations | MQTT measure commands | DB + scheduler state | sensor_repo, esp_repo, publisher | hoch |
| SRV-MOD-046 | Background | `database_backup_service.py`, `email_retry_service.py`, `digest_service.py`, `alert_suppression_scheduler.py` | Operative Nebenjobs (Backup, Retry, Digest, Suppression) | Keine Device-Ingestion | scheduler ticks | backup files, email retries, suppression effects | DB + filesystem | scheduler + notification/email services | mittel-hoch |
| SRV-MOD-047 | Persistence | `db/session.py` | Async Engine/Sessions + DB circuit breaker/resilient_session | Keine Domainqueries | service/repo session requests | db sessions, rollback/commit control | DB + RAM | sqlalchemy + resilience registry | kritisch |
| SRV-MOD-048 | Persistence | `db/repositories/*` | Datenzugriffsschicht (CRUD/queries pro Aggregat) | Kein Topic/HTTP Handling | service/handler calls | model instances, DB writes | DB | models + session | kritisch |
| SRV-MOD-049 | Persistence | `db/models/*` | Persistente Domaintypen + Zustandsmodelle | Keine Fachlogik | ORM usage | Tabellenzustand | DB | repositories/services | kritisch |
| SRV-MOD-050 | Runtime | `core/scheduler.py` | Zentrales Job-Management fuer non-logic jobs | Keine Rule-Inferenz | job registrations | scheduled executions/statistics | RAM | maintenance/simulation/plugin services | hoch |
| SRV-MOD-051 | Runtime | `websocket/manager.py` | Realtime Push, Subscriptions, Broadcast-Filter, rate-limit | Keine Persistenzentscheidung | broadcast calls + ws client events | ws messages | RAM | handlers/services | hoch |
| SRV-MOD-052 | Runtime | `core/config.py`, `core/security.py`, `core/resilience/*`, `core/metrics.py`, `middleware/request_id.py` | Konfiguration, Security, Cross-cutting Reliability/Observability | Keine Domainentscheidung | env/config/request context | validated settings, metrics, context IDs | RAM | nahezu alle module | hoch |

## 4. Ownership-Matrix

Kernmodule mit explizitem Ownership pro Pflichtachse.

| Kernmodul | SSoT-Owner | Contract-Owner | State-Owner | Failure-Owner |
|---|---|---|---|---|
| Device Registrierung/Lifecycle (`esp_service` + `esp_repo`) | PostgreSQL (`esp_devices`) | API + Heartbeat payload contract (`esp.py`, `heartbeat_handler.py`) | DB (`status`, `last_seen`, metadata) | `heartbeat_handler`, `maintenance health checks` |
| Sensor Ingestion (`sensor_handler`) | PostgreSQL (`sensor_data`) | MQTT Sensor Topic + Payload (`mqtt/topics.py`, handler validation) | DB (Messwerte) + kurzzeitige Handler-Caches | `sensor_handler` + resilient DB layer |
| Actuator Dispatch (`actuator_service`) | DB (`actuator_configs`, command history) | MQTT actuator command/response topics | DB (command history, actuator state mirror) | `safety_service` + `actuator_*_handler` |
| Rule Execution (`logic_engine`) | DB (`cross_esp_logic`, execution history, hysteresis states) | Rule JSON Schema/condition-action semantics (`logic_service` + evaluators) | Hybrid: DB + RAM runtime locks/caches | `logic_engine` + conflict/rate limiter |
| Safety Gate (`safety_service`) | DB config + in-memory emergency flags | Service-Contract `validate_actuator_command` | RAM (`_emergency_stop_active`) + DB lookups | `safety_service` |
| Zone/Subzone Assignment (`zone_service`, `subzone_service`) | DB (`zone*`, `subzone*`, device_zone_changes) | MQTT assign/ack contract | DB + pending metadata fields | ACK handlers + `mqtt_command_bridge` |
| Config Push (`config_builder` + `esp_service.send_config`) | DB Config-Tabellen | Config payload contract (`mqtt/publisher` + firmware expectation) | DB + correlation metadata | `config_handler` + `esp_service` |
| Notification Pipeline (`notification_router`) | DB (`notifications`, `email_log`) | NotificationCreate schema + ws/email payloads | DB + transient routing state | `notification_router` |
| MQTT Transport (`mqtt/client`, `subscriber`) | Brokerzustand + registrierte handler-map | Topic/subscribe/publish contract | RAM (connection state, buffer, handlers) | `mqtt/client` resilience + subscriber dispatch |
| Scheduler Runtime (`core/scheduler`) | Scheduler in-memory registry | Job-ID/category conventions | RAM job graph | `core/scheduler` + owning service |
| WebSocket Runtime (`websocket/manager`) | In-memory connection registry | WS event envelope (`type/timestamp/data`) | RAM | `websocket/manager` |
| DB Session/Resilience (`db/session`) | DB engine/session state | session context contract | RAM + DB pool | `db/session` + resilience breakers |

IST != Startannahme (Ownership-relevant):

- Discovery ist nicht mehr eigener Primaerpfad; Heartbeat ist Contract-Owner fuer Discovery-Lebenszyklus.
- Mock-Simulation teilt produktive Contracts (MQTT Topics, Repositories) und ist damit kein reines Test-Artefakt.

## 5. Kritikalitaets- und Kopplungsanalyse

### 5.1 Identifizierte Single-Points-of-Failure (SPOF)

- `main.py` als monolithischer Runtime-Wiring-Punkt.
- `mqtt/client.py` als zentrale Broker-Verbindungsinstanz.
- `db/session.py` (Engine + Session Factory + CircuitBreaker Init).
- `logic_engine.py` fuer Regel-/Aktor-Automation.
- `safety_service.py` fuer Freigabe/Blockade aktiver Befehle.
- `core/scheduler.py` fuer alle zentralen Background-Jobs ausser LogicScheduler.

### 5.2 Zyklische bzw. enge Kopplungen

- `logic_engine` <-> `sequence_executor` (explizit per `set_action_executors()` zur Laufzeit aufgeloest).
- `zone/subzone services` <-> `*_ack_handler` <-> `mqtt_command_bridge` (ACK-Korrelation + Fallback FIFO).
- `handlers` -> `repositories/services` -> `websocket manager` (stark synchrone End-to-End-Kette).
- `main.py` importiert und initialisiert viele Module direkt (hohe Compile-/Runtime-Kopplung).

### 5.3 Implizite Contracts ohne striktes externes Schema

- Mehrere payloads nutzen flexible Felder/Fallbacks (z. B. `raw` vs `raw_value`, Legacy-Varianten).
- Device-/Simulation-/Config-Metadata in JSON-Feldern fungieren als impliziter Contract zwischen Services und Firmware.
- ACK-Fallback in `mqtt_command_bridge` (esp_id+command_type FIFO) ist funktional, aber nicht streng eindeutig ohne `correlation_id`.
- Deprecated Discovery-Thema bleibt aktiv und kann Doppelpfade erzeugen.

## 6. Top-Risiken (Top 10)

1. **Orchestrator-SPOF:** Ausfall/Regression in `main.py` trifft Startup aller Kernpfade gleichzeitig.  
2. **MQTT zentraler Ausfallpunkt:** Broker-/Client-Probleme koennen Ingestion und Dispatch zugleich degradieren.  
3. **Implizite Payload-Varianten:** Mehrdeutige Feldnamen/Fallbacks erhoehen Integrations- und Regressionsrisiko.  
4. **JSON-State statt starkem Schema:** Kritische Zustaende liegen teils in frei strukturierten Metadata-Feldern.  
5. **ACK-Korrelation mit Fallback:** Ohne sichere `correlation_id` kann bei Last falsche Zuordnung entstehen.  
6. **Hohe Handler-Service-DB-Kopplung:** Fehler in einem Layer wirken direkt auf End-to-End-Flows.  
7. **Safety-State teilweise RAM-basiert:** Emergency/Runtime Flags koennen bei Restart asynchron zur DB wirken.  
8. **Doppel-Scheduler-Architektur:** Zentrale Jobs und LogicScheduler koennen zeitlich schwerer konsistent zu steuern sein.  
9. **Mock und Produktivpfad vermischt:** Simulation nutzt produktive Interfaces; unbeabsichtigte Seiteneffekte sind moeglich.  
10. **Debug/Ops API-Breite:** Viele administrative Endpunkte vergroessern Angriffs- und Fehlbedienflaeche.

## 7. Hand-off in P2.2-P2.7

### P2.2 (Device/Sensor-Ingestion) - zuerst vertiefen

- Heartbeat-Discovery + Sensor-Ingestion End-to-End als Prime-Path: `heartbeat_handler` -> `esp_repo` -> `sensor_handler` -> `logic_engine`.
- Payload-Contract-Haertung: Feldvarianten, Pflichtfelder, Zeitstempel-Normalisierung.
- Ownership-Check fuer `last_seen/status` zwischen Heartbeat, LWT und Maintenance timeout.

### P2.3 (Command/Actuator-Dispatch) - kritisch

- `actuator_service` + `safety_service` + `actuator_response/alert_handler` als geschlossener Command-Kreis.
- ACK-/Response-Konsistenz (success/fail, correlation_id, history logging).
- Failure-Pfade: offline device, MQTT publish fail, safety reject, timeout/race.

### P2.4 (Logic Engine)

- Evaluator-/Executor-Vertrag, inklusive Compound/Hysteresis/Time-Kombinationen.
- Persistenzgrenze RAM vs DB bei Hysteresis-/Conflict-/Rate-State.
- Reconnect-/Rule-Update-Pfade (inkl. OFF-Guard und cooldown bypass).

### P2.5 (Safety / Failure)

- Vollstaendige Failure-Matrix: DB outage, broker outage, stale heartbeat, emergency states.
- Safety-Invarianten pruefen: kein Aktorbefehl ohne Safety-Gate.
- LWT + Timeout + Emergency-State-Konsistenz bei Restart.

### P2.6 (Recovery / Reconciliation)

- Startup-Recovery-Reihenfolge (`main.py`) gegen reale Abhaengigkeiten pruefen.
- Config-Reconciliation (config_response, pending metadata, retries, replay).
- Scheduler-Recovery (mock recovery, sensor schedule recovery, plugin schedules).

### P2.7 (Contracts / Governance)

- Contract-Owner pro Topic/Endpoint finalisieren (owner map operational machen).
- Implizite JSON-Contracts in versionierte, testbare Schemata ueberfuehren.
- Legacy-/Deprecated Pfade (Discovery) mit Sunset-Plan versehen.

## 8. Offene Fragen + Verifikationsplan

### 8.1 Offene Fragen (zwingend fuer Folgepakete)

- Welche Payload-Varianten sind offiziell garantiert (und welche nur Legacy-Toleranz)?
- Ist `correlation_id` fuer alle kritischen ACK-/Response-Flows verpflichtend?
- Welche Metadata-Felder sind harte Vertragsflaeche gegen Firmware, welche intern?
- Wo liegt final der State-Owner fuer Emergency/Actuator-State nach Restart (RAM vs DB)?
- Wie ist die Prioritaet zwischen LWT und Heartbeat-Timeout bei widerspruechlichen Events?
- Welche Debug-Endpoints sind produktiv notwendig vs. nur Entwicklungszweck?
- Soll Discovery-Topic formal entfernt oder weiterhin als fallback supportet werden?

### 8.2 Verifikationsplan (analysebegleitend, keine Codeaenderung)

- **Modulabdeckung:** Vollstaendige Dateiabdeckung je Layer gegen `src/`-Struktur abgleichen.
- **Ownership-Validierung:** Fuer Kernpfade Ingestion/Command/Logic je 1 Trace-Map erzeugen.
- **Contract-Validierung:** Topic-/Payload-Parser gegen Handler-Validierung tabellarisch spiegeln.
- **SPOF-Plausibilisierung:** Startup- und Laufzeitkette je SPOF mit degrade-path dokumentieren.
- **Kopplungscheck:** Zyklische und implizite Contracts in P2.2/P2.3/P2.4 als Pflicht-Inputs markieren.

