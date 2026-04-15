# BERICHT gesamt IST-Stand AutomationOne (2026-04-14)

## 1. Executive Summary

- Das System ist insgesamt lauffaehig, aber die Fertigation-Integrationskette ist derzeit nur teilweise umgesetzt: Frontend-Widget + KPI-Logik existieren, serverseitige Domainenrichments (`measurement_role`-Semantik) sind nicht als eigener Datenpfad verankert.
- Cross-Layer Lifecycle ist technisch vorhanden (Heartbeat, LWT, Soft-Delete, Reconnect-Adoption, Background-Loops), aber mehrere asynchrone Pfade haben kein gemeinsames End-to-End-Terminalsignal.
- Traceability ist gemischt: HTTP `request_id` ist sauber im Middleware/Logging-Pfad, MQTT-seitig ist `correlation_id` breit genutzt, aber bei Sensor-Events nicht durchgaengig bis in alle Oberflaechen-/Persistenzartefakte.
- Frontend-Cleanup ist in den Kernpfaden ueberwiegend gut (`onUnmounted`, Unsubscribe, Abort), aber mindestens ein echter Intervall-Leak ist vorhanden.
- Top-3 P0:
- P0-1: Referenzdoku aus Auftrag (`docs/FERTIGATION_WIDGET_INTEGRATION.md`) fehlt komplett; geforderter Soll/Ist-Abgleich ist dadurch blockiert.
- P0-2: Fertigation serverseitig ohne expliziten Inflow/Runoff-Domainpfad (kein `measurement_role`-Treffer im Produktcode-Tree von Frontend/Backend fuer Live-Nutzung), dadurch semantische Luecke.
- P0-3: `MaintenanceView` startet `setInterval(loadData, 30000)` ohne Cleanup auf Unmount -> akkumulierte Poller bei Navigationswechsel.

## 2. Branch / Commit / Analyseumfang

- Branch: `auto-debugger/work`
- Letzter Commit: `d5b73c9e fix(frontend): stabilize hardware delete fallback and event chain`
- Umfang: Firmware (`El Trabajante`), Backend (`El Servador/god_kaiser_server`), Frontend (`El Frontend`), Docker/Observability, vorhandene Analysen unter `docs/analysen`.
- Ausgefuehrt: repo-basierte Read/RG-Analyse + `vue-tsc --noEmit`.

## 3. Schicht Firmware (IST)

- MQTT-Pfad ist fail-closed fuer Registrierung: in `El Trabajante/src/services/communication/mqtt_client.cpp` blockiert das Registration-Gate Non-Heartbeat-Publishes bis valider Heartbeat-ACK kommt.
- Config-Updates werden ueber Queue verarbeitet (`routeIncomingMessage` in `El Trabajante/src/main.cpp`), damit Sensor/Aktor-Konfiguration auf Core-1 sequentiell angewendet wird.
- Sensor-Loeschung ist implizit ueber Config-Payload (`active=false`) realisiert: `parseAndConfigureSensorWithTracking()` ruft `sensorManager.removeSensor(...)` auf und dokumentiert NVS-Cleanup.
- Sensor-Commands laufen ueber `sensor_command_queue` mit Admission, TTL/Epoch-Invalidierung und Intent-Outcome-Rueckmeldung (`El Trabajante/src/tasks/sensor_command_queue.cpp`).
- Korrelation ist vorhanden (`intent_id`, `correlation_id`, `epoch`) in Queue/Outcome-Telemetrie, aber semantische "Server hat Konfig entfernt"-Quelle bleibt indirekt (nur via nachgelagerter Config-Push sichtbar).

**Evidence-Block Firmware**
- `El Trabajante/src/services/communication/mqtt_client.cpp`: Registration-Gate, Heartbeat/ACK, Publish-Guard, Queue/Retry, LWT-Clearing.
- `El Trabajante/src/main.cpp`: `routeIncomingMessage()` + `parseAndConfigureSensorWithTracking()` (`active=false` -> `removeSensor(...)`).
- `El Trabajante/src/tasks/sensor_command_queue.cpp`: Queue-Overflow-Counter, Admission/Expiry, Intent-Outcome.

## 4. Schicht Backend (IST) inkl. Background/MQTT

- Startup/Lifecycle ist stark asynchron orchestriert (`El Servador/god_kaiser_server/src/main.py`): MQTT-Subscriber, LogicEngine, LogicScheduler, zentrale Scheduler-Jobs, Inbound-Replay-Worker.
- `LogicEngine` startet eigenen Evaluationsloop (`asyncio.create_task(self._evaluation_loop())`) und verarbeitet sensor-/timer-/reconnect-getriggerte Regeln.
- `LogicScheduler` startet separaten Task fuer periodische Timer-Regeln (`_scheduler_loop()` mit `asyncio.sleep(interval)`).
- Heartbeat-Handler verarbeitet Discovery, Restore von Soft-Delete, Status-Uebergang nach `online`, Reconnect-Adoption und startet Hintergrundtasks (`_complete_adoption_and_trigger_reconnect_eval`, `_handle_reconnect_state_push`).
- LWT-Handler setzt Status auf `offline`, resettet Aktorzustaende und schreibt Disconnect-Metadaten.
- Config-ACK-Handler hat Terminal-Authority-Guard und uebertraegt `correlation_id`/`request_id` in Audit + WebSocket.

**Evidence-Block Backend**
- `El Servador/god_kaiser_server/src/main.py`
- `El Servador/god_kaiser_server/src/services/logic_engine.py`
- `El Servador/god_kaiser_server/src/services/logic_scheduler.py`
- `El Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py`
- `El Servador/god_kaiser_server/src/mqtt/handlers/lwt_handler.py`
- `El Servador/god_kaiser_server/src/mqtt/handlers/config_handler.py`

## 5. Schicht Frontend (IST)

- Fertigation-Widget existiert unter `El Frontend/src/components/dashboard-widgets/FertigationPairWidget.vue` (nicht unter dem im Auftrag genannten `dashboard/widgets`-Pfad).
- KPI-Logik (`useFertigationKPIs`) kombiniert REST-Bootstrap (`sensorsApi.queryData`) mit Live-WS-Updates (`websocketService.on('sensor_data', ...)`), inkl. Staleness/Trend/Health.
- Dashboard-Registry bindet `fertigation-pair` als Widget-Typ in `useDashboardWidgets` ein.
- Device-Delete-Kette ist klar: `ZonePlate` emittiert `device-delete` -> `HardwareView.handleDelete` -> `espStore.deleteDevice` -> `espApi.deleteDevice`.
- Cleanup-Qualitaet: in Kernpfaden gut (z. B. `useFertigationKPIs`, `HardwareView`, `SystemMonitorView`), aber nicht flaechendeckend.

**Evidence-Block Frontend**
- `El Frontend/src/components/dashboard-widgets/FertigationPairWidget.vue`
- `El Frontend/src/composables/useFertigationKPIs.ts`
- `El Frontend/src/composables/useDashboardWidgets.ts`
- `El Frontend/src/components/dashboard/ZonePlate.vue`
- `El Frontend/src/views/HardwareView.vue`
- `El Frontend/src/stores/esp.ts`

## 6. Datenbank / Persistenz (IST)

- Soft-Delete ist explizit modelliert (`ESPDevice.deleted_at`, `deleted_by`) in `El Servador/god_kaiser_server/src/db/models/esp.py`.
- Sensor-Zeitreihen bleiben bei Device-Loeschung erhalten (`SensorData.esp_id` mit `ondelete="SET NULL"`), inkl. Snapshot-Felder (`device_name`, `zone_id`, `subzone_id`) in `SensorData`.
- SensorConfig traegt flexible Metadaten (`sensor_metadata` JSON), dort waere `measurement_role` technisch abbildbar; ein zwingender Domain-Contract ist aber nicht sichtbar.
- API-Delete fuer ESP ist Soft-Delete (`/devices/{esp_id}`), inklusive Alert-Resolve vor Loeschung.

**Evidence-Block Persistenz**
- `El Servador/god_kaiser_server/src/db/models/esp.py`
- `El Servador/god_kaiser_server/src/db/models/sensor.py` (enthaelt `SensorConfig` und `SensorData`)
- `El Servador/god_kaiser_server/src/api/v1/esp.py`

## 7. Querschnitt: Fertigation Inflow/Runoff

### Datenfluss (IST)

| Schritt | Quelle | Verarbeitung | Ziel |
|---|---|---|---|
| 1 | Widget-Konfig (`inflowSensorId`, `runoffSensorId`) | `FertigationPairWidget` setzt Refs | `useFertigationKPIs` |
| 2 | REST | `sensorsApi.queryData({ sensor_config_id, limit: 100 })` fuer beide IDs | initiale KPI-Berechnung |
| 3 | WS | Listener auf `sensor_data`, Match ueber `data.config_id` | partielle KPI-Updates |
| 4 | KPI-Engine | Differenz/Trend/Staleness/Health | Widget-Anzeige + Farbstatus |
| 5 | Chart | `MultiSensorChart` parallel im selben Widget | zweite Datenquelle fuer visuelle Zeitreihe |

### Vollstaendigkeit

- **IST unvollstaendig** fuer die geforderte Domain-Semantik "Fertigation Inflow/Runoff als backendseitig expliziter Vertrag".
- Im Produktcode kein direkter Treffer auf `measurement_role` in `El Frontend/src` und keine dedizierte Inflow/Runoff-Backend-API.
- Doku-Sollpfade aus Auftrag sind teilweise nicht vorhanden:
- `docs/FERTIGATION_WIDGET_INTEGRATION.md` fehlt.
- `El Frontend/src/components/dashboard/widgets/README.md` fehlt (Pfad existiert nicht; effektiv genutzt wird `dashboard-widgets`).

### Doku vs Code

- **Code ahead of Doku:** Fertigation-Widget ist produktiv im Frontend registriert, aber die im Auftrag genannte Integrationsdoku existiert nicht.
- **Doku ahead of Code:** `measurement_role` wird in Konzeptdokumenten beschrieben, aber nicht als belastbarer End-to-End-Pfad in den Kernmodulen belegt.

**Evidence-Block Paket A**
- `El Frontend/src/components/dashboard-widgets/FertigationPairWidget.vue`
- `El Frontend/src/composables/useFertigationKPIs.ts`
- `El Frontend/src/composables/useDashboardWidgets.ts`
- `El Frontend/src/api/sensors.ts`
- `docs/analysen/konzept-fertigation-ux-integration-2026-04-14.md`
- Nicht gefunden: `docs/FERTIGATION_WIDGET_INTEGRATION.md`

## 8. Querschnitt: Traceability / Korrelation

### Tabelle: Pfad -> IDs -> Luecke

| Pfad | gesetzte/verwendete IDs | Luecke |
|---|---|---|
| HTTP-Ingress (`middleware/request_id.py`) | `request_id` aus Header oder generated UUID, Response-Header `X-Request-ID` | keine harte Luecke im HTTP-Pfad |
| Logging (`core/logging_config.py`) | `request_id` wird in JSON/Text-Logs injiziert | `correlation_id` nicht als erstes Klassenelement im Standard-Logfilter |
| Calibration REST (`api/v1/calibration_sessions.py` + `services/calibration_service.py`) | `correlation_id` wird angenommen und in Session/Broadcast genutzt | keine garantierte Kopplung zu globaler `request_id` |
| MQTT Subscriber (`mqtt/subscriber.py`) | generiert MQTT-`correlation_id` aus `esp_id/topic_suffix/seq` | entspricht nicht automatisch HTTP-`request_id`; Merging nur bedingt |
| Sensor Ingest (`mqtt/handlers/sensor_handler.py`) | liest `correlation_id|request_id|trace_id|boot_sequence_id`, speichert Messung + WS-Broadcast | SensorData-Persistenz selbst hat keine explizite `correlation_id`-Spalte |
| Config ACK (`mqtt/handlers/config_handler.py`) | nutzt `correlation_id` + `request_id`, schreibt Audit/WS | robust, aber nur fuer Config-Pfad |
| Actuator Response (`mqtt/handlers/actuator_response_handler.py`) | `correlation_id` im ACK/Audit | keine gemeinsame End-to-End-ID ueber alle Eventtypen erzwungen |
| Frontend SystemMonitor (`views/SystemMonitorView.vue`) | nutzt `request_id` fuer Log-Korrelation | fuer Events ohne `request_id` nur Zeitfenster-Fallback (unscharf) |

**Evidence-Block Paket B**
- `El Servador/god_kaiser_server/src/middleware/request_id.py`
- `El Servador/god_kaiser_server/src/core/logging_config.py`
- `El Servador/god_kaiser_server/src/mqtt/subscriber.py`
- `El Servador/god_kaiser_server/src/mqtt/handlers/sensor_handler.py`
- `El Servador/god_kaiser_server/src/mqtt/handlers/config_handler.py`
- `El Frontend/src/views/SystemMonitorView.vue`

## 9. Querschnitt: Lifecycle vs. Hintergrund

### Matrix (>=8 Zeilen): interner Ablauf <-> externer Trigger <-> Source of Truth <-> Bruchstelle

| Interner Ablauf | Externer Trigger | Source of Truth | Bekannte Bruchstelle |
|---|---|---|---|
| LogicEngine Start/Stop (`_running`, `_task`) | App lifespan startup/shutdown | In-Memory Task-State + DB Reads | abruptes Prozessende kann Task ohne finalen Marker beenden |
| LogicScheduler Tick | Timer (`interval_seconds`) | In-Memory Scheduler-Task | bei langem Fehler nur Retry-Sleep, kein globaler Circuit pro Rule |
| Heartbeat Online-Uebergang | MQTT `/system/heartbeat` | `esp_devices.status`, `last_seen`, Metadata | mehrere nachgelagerte `create_task`-Pfadabzweige ohne einheitliches Completion-Event |
| Reconnect Adoption + Eval | Heartbeat mit Offline-Dauer > Schwelle | Adoption-Service + LogicEngine Cache | Rekonvergenz verteilt auf mehrere Komponenten (Adoption, Backoff-Cache, State-Push) |
| LWT Offline-Uebergang | MQTT retained LWT | `esp_devices.status=offline` + Actuator-State-Reset | falls Device parallel soft-deleted, Handler ignoriert unbekanntes Device |
| Device Soft-Delete | REST `DELETE /api/v1/esp/devices/{esp_id}` | `deleted_at`, `status='deleted'` | Firmware behaelt lokale Config bis naechster Config-Push/Revocation |
| Sensor Ingest Guard fuer geloeschte ESPs | MQTT sensor_data nach Loeschung | Tombstone check (`include_deleted=True`) | Daten werden still skippt -> kein expliziter Rueckkanal ans Device |
| Inbound Replay Worker | Startup + 5s Loop | Inbound Inbox + RuntimeState recovery flag | Endlosschleife bis Shutdown; kein harter Deadletter-Abschluss im Codeauszug sichtbar |
| Frontend Device-Delete Kette | UI delete aus ZonePlate/HardwareView | Store `devices[]` + Backend Soft-Delete | lokale sofortige Entfernung kann serverseitige Folgeevents race-condition-artig ueberholen |

**Evidence-Block Paket C**
- `El Servador/god_kaiser_server/src/main.py`
- `El Servador/god_kaiser_server/src/services/logic_engine.py`
- `El Servador/god_kaiser_server/src/services/logic_scheduler.py`
- `El Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py`
- `El Servador/god_kaiser_server/src/mqtt/handlers/lwt_handler.py`
- `El Servador/god_kaiser_server/src/api/v1/esp.py`
- `El Servador/god_kaiser_server/src/mqtt/handlers/sensor_handler.py`
- `El Frontend/src/views/HardwareView.vue`, `El Frontend/src/stores/esp.ts`

## 10. Observability / Debugging heute

- Monitoring-Stack ist im Repo konkret vorhanden (Loki, Alloy, Prometheus, Grafana, Exporter) unter Docker-Profile `monitoring`.
- HTTP-Request-Korrelation ist vorhanden (`request_id` Middleware + Logging), Frontend nutzt `request_id` im SystemMonitor fuer Server-Logs.
- MQTT-Korrelation ist vorhanden, aber getrennt (`correlation_id` aus MQTT-Sicht); die Trennung HTTP-`request_id` vs MQTT-`correlation_id` ist technisch sichtbar und nicht automatisch vereinheitlicht.
- Prometheus-Endpoint wird im Backend instrumentiert (`/api/v1/health/metrics`), Scheduler aktualisiert Custom-Metriken zyklisch.
- OTEL-Pipeline als erste Klasse im geprueften Produktcode nicht verifiziert.

**Evidence-Block Observability**
- `docker-compose.yml` (Monitoring-Services + Profile)
- `El Servador/god_kaiser_server/src/main.py` (Instrumentator + Metrics-Job)
- `El Servador/god_kaiser_server/src/middleware/request_id.py`
- `El Servador/god_kaiser_server/src/core/logging_config.py`
- `El Frontend/src/views/SystemMonitorView.vue`

## 11. Test- und Lint-Signal (ehrlich)

- Ausgefuehrt: `npx vue-tsc --noEmit` in `El Frontend` -> **OK (Exit 0)**.
- Versuch 1 Backend-Lint: `poetry run ruff check src/` -> **nicht ausfuehrbar** (`poetry` im aktuellen Shell-Kontext nicht gefunden).
- Versuch 2 Backend-Lint: `.\.venv\Scripts\python -m ruff check src/` -> **nicht ausfuehrbar** (`No module named ruff` in lokaler `.venv`).
- `pytest` in diesem Lauf nicht ausgefuehrt (kein falsches Gruen-Signal).

## 12. P0 / P1 / P2 (priorisierte Analyse-Folgen)

### P0

1. Fehlende Soll-Doku fuer Fertigation-Integration (`docs/FERTIGATION_WIDGET_INTEGRATION.md`) verhindert belastbaren Doku-vs-Code-Abgleich.
2. Fertigation-Semantik (Inflow/Runoff-Rollen) nicht als konsistenter serverseitiger Domainpfad verankert; Frontend nutzt aktuell reine Sensor-ID-Paarlogik.
3. `MaintenanceView` erzeugt dauerhaftes Polling ohne `onUnmounted`-Cleanup (`setInterval` ohne `clearInterval`).

### P1

1. Duale Datenquellen im Fertigation-Widget (REST Bootstrap + WS KPI + separater Chart-Livepfad) koennen zu kurzfristig divergierenden Anzeigen fuehren.
2. Traceability ist je Kanal gut, aber kanaluebergreifend nicht verpflichtend vereinheitlicht (`request_id` vs `correlation_id`).
3. Lifecycle-Endzustaende verteilen sich auf mehrere asynchrone Tasks ohne zentralen "fully converged"-Marker pro Device-Reconnect.

### P2

1. Einzelne Frontend-Timeouts (z. B. Filter-Debounce in SystemMonitor) werden nicht immer explizit aufgeraeumt; Risiko gering, aber kumulativ beobachtenswert.
2. Mehrere bestehende Analyse-/Konzeptdokumente referenzieren Sollzustand, der im Produktcode nur teilweise erreicht ist (Pflegeaufwand fuer Doku-Konsistenz).

## 13. BLOCKER

- Blocker-1: Auftrag referenziert nicht vorhandene Pflichtreferenzdateien (`docs/FERTIGATION_WIDGET_INTEGRATION.md`, Widget-README im genannten Pfad), daher ist ein "vollstaendig gegen Soll-Doku verifiziert" formal nicht erreichbar.
- Blocker-2: Dieser Lauf ist codebasiert; laufzeitbezogene Aussagen zu realer Last/Korrelation in Produktion (Loki/Prometheus Live-Signale) sind ohne aktive Laufumgebung nicht verifiziert.

## 14. Abnahme-Checkliste (Pakete A-F)

| Paket | Status | Kurzbegruendung |
|---|---|---|
| A Fertigation Inflow/Runoff | **Teil** | Widget/KPI vorhanden, Domain-/Doku-Luecken (fehlende Referenzdatei, kein expliziter measurement_role-Pfad) |
| B Traceability ohne neue DB | **Erfuellt** | ID-Pfad-Tabelle erstellt, kanalweise Verfolgung + Luecken benannt |
| C Lifecycle/Abmeldung/Hintergrund | **Erfuellt** | Matrix mit 9 Zeilen inkl. Source-of-Truth und Bruchstellen |
| D Frontend Subscriptions/Cleanup | **Erfuellt** | P0/P1-Befunde mit Evidence inkl. Leak-Fund und positiven Gegenbelegen |
| E Firmware IST | **Erfuellt** | MQTT/Queue/Config-Entfernungspfad beschrieben, Risiko bei serverseitiger Loeschung ohne Push markiert |
| F Qualitaetssignal | **Teil** | `vue-tsc` ausgefuehrt OK, Backend-Lint mangels verfuegbarem `poetry/ruff` nicht ausfuehrbar dokumentiert |

---

### Optionaler Agent-Prompt (Copy/Paste)

```text
Bitte nimm den Bericht docs/analysen/BERICHT-gesamt-ist-stand-automationone-2026-04-14.md als Basis und starte danach genau ein separates Implementierungspaket (nur P0-1 oder nur P0-2 oder nur P0-3), mit konkreten Code-Changes, Tests und Doku-Update.
```
