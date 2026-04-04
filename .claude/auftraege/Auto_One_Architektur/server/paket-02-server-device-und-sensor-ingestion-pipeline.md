# Paket 02 - Server Device- und Sensor-Ingestion-Pipeline

## 1. Scope + Begriffsdefinitionen

### Scope
Diese Analyse beschreibt die produktive Device- und Sensor-Ingestion im Backend `El Servador` (Codebasis unter `El Servador/god_kaiser_server/src`), end-to-end von Eingang bis Persistenz und Folgeausgaben.

Abgedeckt sind:
- MQTT-Ingestion fuer Device- und Sensorpfade.
- HTTP-Ingestion fuer sensorbezogene Verarbeitungs-Endpunkte.
- Fehler-, Retry-, Drop- und Recovery-Verhalten.
- Rueckwaertskompatibilitaet und Contract-Drift-Risiken.

Nicht als produktive Device/Sensor-Ingestion gewertet:
- `api/v1/debug/*` (Debug-/Mock-API, Admin-Testpfade).
- Reine Read-Endpunkte (`GET`) ohne Ingestion.
- Reine Frontend-/Grafana-Integrationspfade ohne Device-/Sensor-Nutzdaten als Primardatenquelle.

### Begriffe
- **Ingestion**: `Eingang -> Parse -> Validation -> Normalisierung -> Fachlogik -> Persistenz -> Ausgabe`.
- **Entry Contract**: Erwartetes Topic/Schema inkl. Pflicht-/Optionalfeldern.
- **Recovery**: Verhalten bei Wiederanlauf, Broker/DB-Ausfall, Reconnect.
- **Datenverlust**: Nachricht wird verworfen, nicht persistiert oder nur teilweise weitergegeben.

---

## 2. Ingestion-Flow-Inventar

| Flow-ID | Eingang | Pfad | Status |
|---|---|---|---|
| `SRV-ING-FLOW-001` | MQTT | `kaiser/+/esp/+/sensor/+/data` | produktiv |
| `SRV-ING-FLOW-002` | MQTT | `kaiser/+/esp/+/system/heartbeat` | produktiv |
| `SRV-ING-FLOW-003` | MQTT | `kaiser/+/esp/+/system/will` (LWT) | produktiv |
| `SRV-ING-FLOW-004` | MQTT | `kaiser/+/esp/+/system/diagnostics` | produktiv |
| `SRV-ING-FLOW-005` | MQTT | `kaiser/+/esp/+/system/error` | produktiv |
| `SRV-ING-FLOW-006` | MQTT | `kaiser/+/discovery/esp32_nodes` | legacy, aktiv subscribed |
| `SRV-ING-FLOW-007` | MQTT | `kaiser/+/esp/+/config_response` | produktiv (Device-Config-Ingestion) |
| `SRV-ING-FLOW-008` | HTTP | `POST /api/v1/sensors/process` | produktiv |
| `SRV-ING-FLOW-009` | HTTP | `POST /api/v1/sensors/calibrate` | produktiv |

Hinweis zu internen Event-Intakes:
- Es gibt **keinen separaten internen Queue-Intake** fuer Device/Sensor-Rohdaten neben MQTT/HTTP.
- Interne Weiterverarbeitung (z. B. Logic Engine Trigger, WebSocket Broadcast) haengt an den genannten Flows.

---

## 3. Detaillierte Flow-Steckbriefe

### `SRV-ING-FLOW-001` - MQTT Sensor Data
- **Entry Contract**
  - Topic: `kaiser/{kaiser_id}/esp/{esp_id}/sensor/{gpio}/data`
  - Pflichtfelder Payload: `ts|timestamp`, `esp_id`, `gpio`, `sensor_type`, `raw|raw_value`
  - Optional: `value`, `unit`, `quality`, `raw_mode`, `time_valid`, `i2c_address`, `onewire_address`, `error_code`, `_source`, `_test_mode`
- **Parse/Validation**
  - `Subscriber._route_message`: JSON parse, Handler-Routing, ThreadPool-Dispatch.
  - Topic-Parse via `TopicBuilder.parse_sensor_data_topic`.
  - Payload-Validation in `sensor_handler._validate_payload`.
- **Normalisierung**
  - Feld-Aliase: `ts|timestamp`, `raw|raw_value`.
  - `raw_mode` default `True`.
  - `sensor_type` lowercase.
  - Timestamp-Fallback auf Serverzeit bei `time_valid=false`, `ts<=0`, `ts<2020-01-01`, `ts fehlt`.
  - Unit-Aufloesung: Registry priorisiert gegenueber Payload.
- **Fachliche Verarbeitung**
  - Sensor-Config-Lookup (3-way/4-way je nach I2C/OneWire Adresse).
  - Optional Pi-Enhanced Processing, DS18B20 Raw-Sicherheitskonvertierung.
  - Physikalische Plausibilitaetspruefung (nur server-prozessierte Werte).
  - Zone/Subzone-Aufloesung, Threshold-Evaluation, VPD-Berechnung, Logic-Trigger.
- **Persistenzziele**
  - `sensor_data` via `SensorRepository.save_data` (dedup ueber Unique Constraint).
  - `esp_devices.last_seen` (throttled).
  - `sensor_configs` Metadata/Status (`pending -> active`).
  - Commit vor WS/Logic-Nebenpfaden.
- **Folgeausgaben**
  - MQTT publish fuer Pi-Enhanced response (best effort).
  - WebSocket `sensor_data` (best effort).
  - Notification-Pipeline (suppress-aware).
  - Async Logic Engine Evaluation.
- **Datenverlust / Recovery**
  - Invalid JSON/Topic/Payload -> Drop.
  - DB-Circuit-Breaker offen -> Drop mit Warnlog.
  - QoS1-Duplikate -> dedup, kein doppelter Write.
  - Reconnect/Resubscribe durch MQTTClient/Subscriber.

### `SRV-ING-FLOW-002` - MQTT Heartbeat
- **Entry Contract**
  - Topic: `kaiser/{kaiser_id}/esp/{esp_id}/system/heartbeat`
  - Legacy akzeptiert: `.../{esp_id}/heartbeat`
  - Pflichtfelder: `ts`, `uptime`, `heap_free|free_heap`, `wifi_rssi`
  - Optional breit (counts, zone, ip, gpio_status, boot_count, time_valid, etc.)
- **Parse/Validation**
  - Topic-Parse via `parse_heartbeat_topic`.
  - Payload-Validation in `heartbeat_handler._validate_payload`.
- **Normalisierung**
  - `heap_free|free_heap` kompatibel.
  - `sensor_count|active_sensors` und `actuator_count|active_actuators` kompatibel.
  - Timestamp serverseitig fallback bei `ts<=0`.
- **Fachliche Verarbeitung**
  - Auto-Discovery fuer unbekannte Devices (pending_approval oder online fuer mocks).
  - Status-Transitions (`pending`, `approved`, `online`, `rejected`).
  - Early Heartbeat ACK an ESP.
  - Reconnect-Erkennung, optional Full-State-Push.
  - Zone-Mismatch-Erkennung + Auto-Resync.
  - Timeout-Job (`check_device_timeouts`) markiert offline + Safety-Reset.
- **Persistenzziele**
  - `esp_devices` (status, last_seen, metadata, ip).
  - `esp_heartbeat` Historie (savepoint-basiert).
  - Audit-Logs fuer discovery/online/offline/reject events.
- **Folgeausgaben**
  - MQTT ACK (`.../system/heartbeat/ack`), optional Config-Push.
  - WebSocket `esp_health`, `device_discovered`, `device_rediscovered`.
- **Datenverlust / Recovery**
  - Invalid Payload -> kein DB-Write, aber Error-ACK wird versucht.
  - DB down/open breaker -> Verarbeitung scheitert.
  - Recovery durch weitere Heartbeats, Broker-Reconnect, periodische Timeout-Pruefung.

### `SRV-ING-FLOW-003` - MQTT LWT (Instant Offline)
- **Entry Contract**
  - Topic: `kaiser/{kaiser_id}/esp/{esp_id}/system/will`
  - Payload minimal erwartet, `status` optional (warn-only wenn fehlend).
- **Parse/Validation**
  - Topic-Parse via `parse_lwt_topic`.
  - Minimal-Validation (broker-generierte Nachricht).
- **Normalisierung**
  - Disconnect-Reason/Timestamp in Metadata geschrieben.
- **Fachliche Verarbeitung**
  - Device bei online -> offline setzen.
  - Aktuator-States sicher auf `off` resetten + Historie loggen.
- **Persistenzziele**
  - `esp_devices.status`, `device_metadata.last_disconnect`.
  - Actuator-Status/Command-History.
  - Audit-Log `LWT_RECEIVED`.
- **Folgeausgaben**
  - WebSocket `esp_health` offline Event.
- **Datenverlust / Recovery**
  - Unbekanntes Device -> no-op mit Warnlog.
  - Bei DB-Problemen kann Instant-Offline verloren gehen; Heartbeat-Timeout bleibt Fallback.

### `SRV-ING-FLOW-004` - MQTT Diagnostics Snapshot
- **Entry Contract**
  - Topic: `kaiser/{kaiser_id}/esp/{esp_id}/system/diagnostics`
  - Pflichtfelder: `heap_free`, `wifi_rssi`
  - Optional: systemweite Diagnosedaten (uptime, wdt, mqtt_cb, counts, etc.)
- **Parse/Validation**
  - Topic-Parse via `parse_system_diagnostics_topic`.
  - Payload-Validation in `diagnostics_handler._validate_payload`.
- **Normalisierung**
  - Optionalfelder werden tolerant uebernommen.
- **Fachliche Verarbeitung**
  - Mapping in `device_metadata["diagnostics"]`.
- **Persistenzziele**
  - `esp_devices.device_metadata` Update + Commit.
- **Folgeausgaben**
  - WebSocket `esp_diagnostics`.
- **Datenverlust / Recovery**
  - Invalid Payload/ESP unbekannt -> Drop.
  - Keine Retry-Queue fuer Inbound; naechster Snapshot (typisch 60s) fungiert als Recovery.

### `SRV-ING-FLOW-005` - MQTT Error Events
- **Entry Contract**
  - Topic: `kaiser/{kaiser_id}/esp/{esp_id}/system/error`
  - Pflichtfelder: `error_code` (int), `severity` (0..3)
  - Optional: `category`, `message`, `context`, `timestamp`
- **Parse/Validation**
  - Topic-Parse via `parse_system_error_topic`.
  - Payload-Validation inkl. Severity-Range.
- **Normalisierung**
  - Severity Mapping `0..3 -> info/warning/error/critical`.
  - Error-Enrichment ueber `esp32_error_mapping`.
- **Fachliche Verarbeitung**
  - Audit-Persistenz als MQTT-Error.
  - Metrik-Inkrement fuer ESP-Fehler.
- **Persistenzziele**
  - `audit_logs` (inkl. raw ESP message/context).
- **Folgeausgaben**
  - WebSocket `error_event`.
- **Datenverlust / Recovery**
  - DB breaker open/down -> Event wird gedroppt.
  - Kein Retry fuer inbound Fehlerereignisse.

### `SRV-ING-FLOW-006` - MQTT Discovery Legacy
- **Entry Contract**
  - Topic: `kaiser/{kaiser_id}/discovery/esp32_nodes`
  - Pflichtfelder: `esp_id`, `hardware_type`, `mac_address`, `ip_address`, `firmware_version`
- **Parse/Validation**
  - Payload-Validation in `discovery_handler._validate_payload`.
  - `esp_id` muss mit `ESP_` starten.
- **Normalisierung**
  - Legacy-Pfad, Heartbeat-basierte Discovery ist primaer.
- **Fachliche Verarbeitung**
  - Existiert Device: Metadata/last_seen Update.
  - Neu: Auto-Register `pending_approval`.
- **Persistenzziele**
  - `esp_devices` create/update.
- **Folgeausgaben**
  - Keine kritische direkte Folgeausgabe.
- **Datenverlust / Recovery**
  - Payload unvollstaendig/ungueltig -> Drop.
  - Funktional durch Heartbeat-Discovery ersetzbar.

### `SRV-ING-FLOW-007` - MQTT Config Response
- **Entry Contract**
  - Topic: `kaiser/{kaiser_id}/esp/{esp_id}/config_response`
  - Pflichtfelder: `status`, `type|config_type`
  - Optional: `count`, `failed_count`, `message`, `error_code`, `failures[]`, `failed_item`, `correlation_id`
- **Parse/Validation**
  - Topic-Parse via `parse_config_response_topic`.
  - Status-Validation: `success|partial_success|error|failed`.
- **Normalisierung**
  - Legacy Feld `config_type` akzeptiert.
  - Legacy `failed_item` und neue `failures[]` parallel.
- **Fachliche Verarbeitung**
  - Setzt `config_status` in Sensor/Actuator configs (`applied`/`failed`).
  - Schreibt Audit-Historie.
- **Persistenzziele**
  - `sensor_configs`, `actuator_configs`, `audit_logs`.
- **Folgeausgaben**
  - WebSocket `config_response`.
- **Datenverlust / Recovery**
  - Bei Handler-Fehler bleibt Config-Status evtl. `pending`; spaetere ACKs koennen konsolidieren.

### `SRV-ING-FLOW-008` - HTTP Sensor Process
- **Entry Contract**
  - Endpoint: `POST /api/v1/sensors/process`
  - Auth: `X-API-Key` + Rate-Limit (100 req/60s pro Key)
  - Pydantic Schema `SensorProcessRequest`
  - Pflicht: `esp_id`, `gpio (0..39)`, `sensor_type`, `raw_value (0..4095)`
- **Parse/Validation**
  - FastAPI/Pydantic Validierung + custom validator `sensor_type`.
  - API-Key Guard + Rate-Limit Guard.
- **Normalisierung**
  - `sensor_type` lowercase/trim.
- **Fachliche Verarbeitung**
  - Dynamischer Sensor-Processor Lookup.
  - `processor.process(raw, calibration, params)`.
- **Persistenzziele**
  - Keine direkte Persistenz in diesem Endpoint.
- **Folgeausgaben**
  - HTTP Response `processed_value/unit/quality/processing_time`.
- **Datenverlust / Recovery**
  - Bei 4xx/5xx kein Retry serverseitig; Retry liegt beim Client/ESP.

### `SRV-ING-FLOW-009` - HTTP Sensor Calibrate
- **Entry Contract**
  - Endpoint: `POST /api/v1/sensors/calibrate`
  - Auth: `X-API-Key`
  - Schema `SensorCalibrateRequest` mit `calibration_points[]`, optional `method`, `save_to_config`
- **Parse/Validation**
  - Pydantic Bounds/Pattern.
  - Runtime-Validation ueber Processor (`ValueError` -> 400).
- **Normalisierung**
  - `sensor_type` lowercase.
  - `method` auto-detect (`linear` oder `offset`) falls nicht gesetzt.
- **Fachliche Verarbeitung**
  - `processor.calibrate(...)`, optional DB-Save via `SensorRepository.update_calibration`.
- **Persistenzziele**
  - Nur wenn `save_to_config=true`: Update `sensor_configs.calibration_data`.
- **Folgeausgaben**
  - HTTP Response mit Kalibrierparametern.
- **Datenverlust / Recovery**
  - Ohne Save bleibt nur Response-Ergebnis beim Client.
  - Fehler beim Save liefert warning/message, Prozessresultat bleibt erhalten.

---

## 4. Contract-Matrix

| Flow-ID | Eingangs-Contract | Guards/Checks | BK/Defaulting | Version-Gate |
|---|---|---|---|---|
| `001` | MQTT topic + sensor payload | JSON parse, topic parse, required/type checks, ESP lookup | `ts|timestamp`, `raw|raw_value`, `raw_mode=True`, tolerant optional fields | kein explizites Gate |
| `002` | heartbeat topic + payload | topic parse, required/type checks, status-flow checks | legacy topic `/heartbeat`, `heap_free|free_heap`, counts aliases | implicit alt/new Feldsupport |
| `003` | LWT topic + minimal payload | topic parse, device lookup | `status` kann fehlen (warn only) | kein Gate |
| `004` | diagnostics topic + payload | required/type checks (`heap_free`,`wifi_rssi`) | viele optionale Felder toleriert | kein Gate |
| `005` | system/error topic + payload | required/type checks, severity range | unknown error codes erlaubt (enrichment fallback) | kein Gate |
| `006` | discovery topic + payload | required/type checks, `esp_id` prefix check | legacy-path, Heartbeat als Primaer | explizit als deprecated markiert |
| `007` | config_response topic + payload | required `status/type`, enum checks | `type|config_type`, `failures[]|failed_item` | kein Gate |
| `008` | HTTP JSON SensorProcessRequest | API key, rate limit, pydantic | strikte Bounds (`raw_value<=4095`) | kein Gate |
| `009` | HTTP JSON SensorCalibrateRequest | API key, pydantic, processor runtime checks | `method` auto-detect | kein Gate |

Contract-Stabilitaet (gesamt):
- Zusatzfelder werden in MQTT-Handlern meist toleriert (kein `extra forbid`), sofern Pflichtfelder valide bleiben.
- Mehrere Legacy-Aliase sind aktiv, was Rueckwaertskompatibilitaet verbessert.
- Explizite Protokoll-Versionierung (`schema_version`) fehlt in den Kernflows.

---

## 5. Fehler-/Recovery-Matrix

| Fehlerklasse | Detection | Logging/Metrik | Retry/NACK/Drop | Endzustand | Recovery |
|---|---|---|---|---|---|
| `PARSE_FAIL` | JSON decode fail, topic parse fail | error/warning logs, subscriber failed counter | Drop | Message verworfen | naechste Message |
| `SCHEMA_INVALID` | Required/type/range validation fail | strukturierte error logs (ValidationErrorCode) | meist Drop, teils Error-ACK (Heartbeat) | kein Persistenz-Write | Sender korrigiert Payload |
| `SEMANTIC_INVALID` | unbekanntes ESP, fachlich ungueltige Kombination | config/validation warnings/errors | Drop oder partial handling | teils no-op, teils failed status | Auto-discovery/Approval/Config-Resend |
| `TIMEOUT` | Subscriber handler timeout (30s), HTTP wait_for Timeout | error logs | aktuell kein sauberes inbound retry | potentiell unvollstaendige Verarbeitung | Folgeheartbeat/nachfolgende Message |
| `BACKPRESSURE_DROP` | OfflineBuffer maxlen drop (outbound), implizite Ueberlastung | buffer metrics + warnings | oldest drop (outbound), inbound kein expliziter backpressure-guard | potenzieller Verlust einzelner Ausgaben | reconnect + flush (nur outbound) |
| `DEPENDENCY_DOWN` | DB circuit breaker open, MQTT disconnected | resilience logs + health monitor | inbound meist Drop, outbound buffer bei MQTT publish | Verarbeitung stoppt partiell | circuit half-open/reset, reconnect, periodische jobs |

Wichtige Recovery-Mechanismen:
- MQTT auto-reconnect + auto-resubscribe.
- Heartbeat timeout monitor (60s job) als Fallback zu LWT.
- Config auto-push bei Heartbeat Count-Mismatch.
- Sensor dedup bei QoS1 redelivery.

---

## 6. Datenverlust- und Drift-Risiken (Top 10)

1. **Flow 001 Quality-Drift (`stale`)**
   - Handler-Kommentar nennt `quality="stale"`, Validator erlaubt `stale` nicht.
   - Effekt: valide Firmware-Nutzdaten koennen als schema-invalid droppen.

2. **Flow 004 QoS-Drift Diagnostics**
   - Kommentar nennt QoS0, Subscriber weist standardmaessig QoS1 zu (kein heartbeat/config pattern).
   - Risiko: Erwartungsabweichung bei Last/Broker-Semantik.

3. **Fehlende explizite Schema-Versionen**
   - Kein `schema_version` in Kernpayloads.
   - Aenderungen an Feldsemantik sind schwer kontrollierbar.

4. **Inbound ohne persistente Retry-Queue**
   - Bei DB-Ausfall/open breaker gehen MQTT Inbound-Nachrichten verloren.
   - Besonders kritisch fuer Sensorzeitreihen in Stoerphasen.

5. **ThreadPool ohne harte Backpressure fuer Inbound**
   - Kein explizites Queue-Limit/Shedding im Subscriber.
   - Risiko: Memory-/Latenzanstieg unter Burst-Last.

6. **Handler-Timeout ohne Cancellation-Pfad**
   - Timeout wird geloggt, laufende Coroutine wird nicht klar terminiert.
   - Risiko: inkonsistente Nebenwirkungen unter Last.

7. **Flow 006 Legacy Discovery weiter aktiv**
   - Parallel zu Heartbeat-Discovery aktiv subscribed.
   - Risiko: uneinheitliche Discovery-Semantik und doppelte Registrierungsversuche.

8. **Flow 008 Raw-Range hart auf 0..4095**
   - Fuer nicht-ADC Quellen oder andere Firmware-Formate zu strikt.
   - Risiko: unnoetige 4xx bei legitimen Datenquellen.

9. **Teilweise Best-Effort Folgeausgaben**
   - WS/Notification/MQTT Folgeaktionen oft ohne Retry.
   - Persistenz ok, aber Realtime-Sicht kann lueckenhaft sein.

10. **Semantische Alias-Komplexitaet**
   - Viele Legacy-/Aliaspfade (`heap_free/free_heap`, `raw/raw_value`, topic alt/neu).
   - Risiko: schleichender Contract-Drift zwischen Firmware-Generationen.

---

## 7. Hand-off in P2.3/P2.5/P2.7

### Hand-off P2.3 (Contract-Haertung und Versionierung)
- Einfuehrung `schema_version` fuer Flows `001/002/004/005/007`.
- Canonical Contract pro Flow inklusive erlaubter Zusatzfelder dokumentieren.
- `quality`-Enum zwischen Firmware und Server harmonisieren (`stale`, `critical` etc.).

### Hand-off P2.5 (Resilience/Recovery-Vertiefung)
- Inbound-Failure-Strategie fuer DB-down: optional durable ingest queue oder replay-faehiger edge buffer.
- Subscriber-Backpressure-Policy (queue bounds, shed policy, observability KPIs).
- Timeout-Handling mit klarer cancellation/compensation fuer Langlaeufer.

### Hand-off P2.7 (Drift-Governance und Testkatalog)
- Contract-Tests fuer alle 9 Flows (happy, malformed, legacy, forward-compatible).
- Cross-layer Drift-Tests Firmware->Server (feldweise, topicweise, enumweise).
- QoS- und Wiederanlauf-Tests (Broker down/up, DB breaker open/close, reconnect flood).

---

## Abgleich mit Akzeptanzkriterien

- [x] Alle produktiven Eingangspfade sind als E2E-Flows dokumentiert
- [x] Pro Flow sind Schema, Guards, Persistenz und Ausgaenge nachvollziehbar
- [x] Fehlerklassen und Recovery sind reproduzierbar beschrieben
- [x] Rueckwaertskompatibilitaet und Drift-Risiken sind explizit bewertet
- [x] Ergebnis ist ohne externe Kontextdatei verstaendlich

