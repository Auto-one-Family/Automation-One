# Report S5 — MQTT-Handler Vollständigkeit (Steckbriefe + Master-Tabelle)

**Datum:** 2026-04-05  
**Codebasis:** `El Servador/god_kaiser_server/src/`  
**Auftrag:** `auftrag-server-S5-mqtt-handler-vollstaendig-2026-04-05.md`

---

## Kurzfassung

- **Registriert in `main.py`:** 17 Topic-Pattern (14 Produktiv-Handler-Module + 3 Mock-Routen als eine Closure).  
- **Paket `handlers/`:** 15 Python-Module inkl. `base_handler.py` (kein Subscriber-Entry) und 14 aktive Handler-Module mit Geschäftslogik.  
- **QoS beim Subscribe:** zentral in `subscriber.py:subscribe_all()` — Heartbeat **0**, `config_response` **2**, sonst **1**.  
- **Routing:** `_route_message` → JSON-Pflicht → `generate_mqtt_correlation_id` → optional **Inbound-Inbox** für „kritische“ Topics → ThreadPool → async im Main-Loop (`_run_handler_with_cid`).  
- **Wichtigste Doc-Drift:** `MQTT_TOPICS.md` listet u. a. **`sensor/batch`** — **kein** Handler/Subscribe in `main.py`.

---

## Master-Tabelle — alle Server-Subscriptions

| Pattern | QoS (Subscribe) | Handler-Entry | Datei:Zeile (Implementierung) |
|---------|-----------------|---------------|-------------------------------|
| `kaiser/+/esp/+/sensor/+/data` | 1 | `sensor_handler.handle_sensor_data` | `sensor_handler.py` (Modul-Fn ~1340); Reg. `main.py:254-256` |
| `kaiser/+/esp/+/actuator/+/status` | 1 | `actuator_handler.handle_actuator_status` | `actuator_handler.py` ~521; Reg. `main.py:257-259` |
| `kaiser/+/esp/+/actuator/+/response` | 1 | `actuator_response_handler.handle_actuator_response` | `actuator_response_handler.py` (Klasse + ggf. Modul-Fn); Reg. `main.py:261-263` |
| `kaiser/+/esp/+/actuator/+/alert` | 1 | `actuator_alert_handler.handle_actuator_alert` | `actuator_alert_handler.py`; Reg. `main.py:265-267` |
| `kaiser/+/esp/+/system/heartbeat` | 0 | `heartbeat_handler.handle_heartbeat` | `heartbeat_handler.py` ~2028; Reg. `main.py:268-270` |
| `kaiser/+/discovery/esp32_nodes` | 1 | `discovery_handler.handle_discovery` | `discovery_handler.py`; Reg. `main.py:271-273` |
| `kaiser/+/esp/+/config_response` | 2 | `config_handler.handle_config_ack` | `config_handler.py`; Reg. `main.py:274-276` |
| `kaiser/+/esp/+/zone/ack` | 1 | `zone_ack_handler.handle_zone_ack` | `zone_ack_handler.py`; Reg. `main.py:278-280` |
| `kaiser/+/esp/+/subzone/ack` | 1 | `subzone_ack_handler.handle_subzone_ack` | `subzone_ack_handler.py` ~195; Reg. `main.py:282-284` |
| `kaiser/+/esp/+/system/will` | 1 | `lwt_handler.handle_lwt` | `lwt_handler.py`; Reg. `main.py:290` |
| `kaiser/+/esp/+/system/error` | 1 | `error_handler.handle_error_event` | `error_handler.py`; Reg. `main.py:295-297` |
| `kaiser/+/esp/+/system/intent_outcome` | 1 | `intent_outcome_handler.handle_intent_outcome` | `intent_outcome_handler.py` ~249; Reg. `main.py:299-302` |
| `kaiser/+/esp/+/system/intent_outcome/lifecycle` | 1 | `intent_outcome_lifecycle_handler.handle_intent_outcome_lifecycle` | `intent_outcome_lifecycle_handler.py` ~134; Reg. `main.py:304-307` |
| `kaiser/+/esp/+/system/diagnostics` | 1 | `diagnostics_handler.handle_diagnostics` | `diagnostics_handler.py`; Reg. `main.py:314-316` |
| `kaiser/+/esp/+/actuator/+/command` | 1 | `mock_actuator_command_handler` (Closure) | `main.py:355-369, 378-380` |
| `kaiser/+/esp/+/actuator/emergency` | 1 | `mock_actuator_command_handler` | `main.py:382-384` |
| `kaiser/broadcast/emergency` | 1 | `mock_actuator_command_handler` | `main.py:386-388` |

**Hinweis QoS-Doku:** In `MQTT_TOPICS.md` steht für `system/diagnostics` oft **QoS 0**; der Server abonniert mit **1** (`subscriber.py:124-129` — alles außer Heartbeat/config ist 1). Das ist bewusst konservativ (at-least-once), weicht aber von der Referenz ab.

**Pattern-Matching:** `_find_handler` iteriert `handlers.items()` in Registrierungsreihenfolge; erste passende Subscription gewinnt (`subscriber.py:523-536`, `topics.py:matches_subscription`).

---

## Trace-first: Subscriber-Schale (alle Handler)

1. **Topic → JSON:** Leerer Payload → Drop (Debug-Log), kein Handler (`subscriber.py:164-167`).  
2. **Ungültiges JSON:** `JSONDecodeError` → Log, `messages_failed++`, **Drop** (`subscriber.py:170-175`).  
3. **Correlation:** `generate_mqtt_correlation_id(esp_id, topic_suffix, seq)` — Format `{esp_id}:{suffix}:{seq|no-seq}:{ts_ms}` (`request_context.py:41-57`). Ohne `seq` im Payload: Suffix + `no-seq` → **höheres Kollisionsrisiko bei Burst** (G3).  
4. **Kritische Inbound-Inbox:** Nur wenn `/_is_critical_topic/` — Sensor `.../data`, `system/error`, `config_response`, `system/intent_outcome`, `.../lifecycle` (`subscriber.py:306-311`). Andere Messages: **kein** Durable-Inbox-Replay bei Handler-Fehler.  
5. **Ausführung:** Async-Handler: `run_coroutine_threadsafe` + Timeout **30 s**; `False` → Warning + Inbox `mark_attempt` (`subscriber.py:361-391`).  
6. **MQTT NACK:** Protokollseitig nicht explizit; „Ack“ = erfolgreiche Handler-Beendigung ohne Exception; Persistenz-Failures können je Handler `False` liefern (z. B. Intent-Outcome).

---

## Steckbriefe (registrierte Handler)

### 1. `sensor_handler` — Sensor-Ingestion

| Aspekt | Inhalt |
|--------|--------|
| **Subscription** | `kaiser/+/esp/+/sensor/+/data`, QoS **1**; `main.py:254-256` |
| **Payload / Aliase** | Pflicht: `ts` **oder** `timestamp`, `esp_id`, `gpio`, `sensor_type`, `raw` **oder** `raw_value`; `raw_mode` optional (Default **true**). Physikalische Plausibilität nach `sensor_type`. |
| **Validierung** | Manuell `_validate_payload` (`sensor_handler.py` ~982+); Topic via `TopicBuilder.parse_sensor_data_topic`. |
| **Verarbeitung** | `resilient_session` → `ESPRepository`, `SensorRepository`, `SubzoneRepository`, `DeviceScopeService`; Speicherung Sensor-Daten; optional **LogicEngine.evaluate_sensor_data**; Pi-Enhanced / Publisher-Pfade möglich. |
| **Transaktion** | Session über `resilient_session`; Commits im Happy-Path der Handler-Logik (siehe Methodenrumpf ab ~180). |
| **Ausgänge** | **WS:** `sensor_data` (best-effort), ggf. VPD-Broadcast; **MQTT:** Publisher für Pi-Enhanced o. ä. wenn aktiv. |
| **Fehlerpfad** | Validierung/ESP fehlt → `False`; Circuit-Breaker `ServiceUnavailableError` abgefangen (siehe Imports/try-Blöcke); WS-Fehler → Warnung, kein Retry. |
| **Korrelation / Finalität** | Server-CID aus Subscriber; Outcome „terminal“ über DB/Logic, nicht als MQTT-Ack. |
| **Störfall-Idee** | ESP gelöscht aber weiter sendend → `ESP_DEVICE_NOT_FOUND`, Daten verworfen (`sensor_handler.py` ~186-193). |

### 2. `heartbeat_handler` — Präsenz / Liveness

| Aspekt | Inhalt |
|--------|--------|
| **Subscription** | `kaiser/+/esp/+/system/heartbeat`, QoS **0**; `main.py:268-270` |
| **Payload / Aliase** | Canonical über `canonicalize_heartbeat` (`system_event_contract`); Legacy-Felder werden normalisiert (u. a. Heap/WiFi — siehe Firmware-Doku / Contract). |
| **Validierung** | Topic-Parse + Contract; detaillierte Pfadlogik im Handler (sehr große Datei). |
| **Verarbeitung** | Auto-Discovery, `ESPRepository`, `ESPHeartbeatRepository`, Metriken, ggf. State-Adoption, Config-Push, **MQTTCommandBridge** (Reconnect/Handover). |
| **Ausgänge** | **MQTT:** u. a. `heartbeat/ack` (QoS 1), ggf. LWT-Clear, weitere Publishes (`heartbeat_handler.py` ~424, 1006, 1486); **WS:** `esp_health` / verwandte Events in Pfaden. |
| **Fehlerpfad** | Heartbeat **nicht** in kritischer Inbox → bei Crash/Timeout **kein** Inbox-Replay (G2). |
| **Korrelation** | Handover `epoch` / `session_id` pro ESP; ACK-Contract für Strict-Firmware. |
| **Störfall-Idee** | QoS 0 → Nachricht kann verloren gehen; Offline-Erkennung fällt auf Heartbeat-Timeout (300 s) oder LWT zurück. |

### 3. `lwt_handler` — Last Will

| Aspekt | Inhalt |
|--------|--------|
| **Subscription** | `kaiser/+/esp/+/system/will`, QoS **1**; `main.py:290` |
| **Payload** | `canonicalize_lwt`; minimal `status` (fehlend → Warnung, angenommen offline). |
| **Verarbeitung** | `CommandContractRepository.upsert_terminal_event_authority` (Dedup/stale guard), ESP offline, State-Adoption-Hooks. |
| **Ausgänge** | **WS:** `esp_health` mit `serialize_esp_health_event` (`lwt_handler.py` ~272+). |
| **Fehlerpfad** | Unbekanntes ESP → `True` (kein harter Fehler, bewusst). |
| **Korrelation** | `correlation_id` / `generation` / `seq` in Authority-Key nutzbar (`lwt_handler.py` ~130-148). |

### 4. `diagnostics_handler` — Diagnose-Telemetrie

| Aspekt | Inhalt |
|--------|--------|
| **Subscription** | `kaiser/+/esp/+/system/diagnostics`, QoS **1** (Subscribe-Logik; Doku oft 0). |
| **Payload** | `canonicalize_diagnostics` + `_validate_payload`. |
| **Verarbeitung** | ESP-Lookup, Metadaten/JSON-Felder am Device, `flag_modified` wo nötig. |
| **Ausgänge** | **WS:** `esp_diagnostics`. |
| **Fehlerpfad** | Nicht in kritischer Inbox → bei Ausfall **kein** Durable-Replay (G2, niedriger Schweregrad). |

### 5. `error_handler` — Geräte-Fehlerkanal

| Aspekt | Inhalt |
|--------|--------|
| **Subscription** | `kaiser/+/esp/+/system/error`, QoS **1** |
| **Payload** | `canonicalize_error_event`; Mapping nur zur **Anreicherung**, ESP-Codes werden vertraut. |
| **Verarbeitung** | `AuditLogRepository`, Device-Lookup. |
| **Ausgänge** | **WS:** `error_event`. |
| **Inbound-Inbox** | **Ja** (kritisch) — Replay bei Reconnect möglich (`subscriber.py:306-311`). |

### 6. `config_handler` — Config-Antworten

| Aspekt | Inhalt |
|--------|--------|
| **Subscription** | `kaiser/+/esp/+/config_response`, QoS **2** |
| **Payload / Aliase** | `canonicalize_config_response` — u. a. `type`→`config_type`, partielle Erfolge, `failures` / Legacy `failed_item`. |
| **Verarbeitung** | Zuerst `CommandContractRepository.upsert_terminal_event_authority`; bei **stale** → früher Return `True` (Terminalität geschützt); danach DB-Updates Sensor/Actuator, Audit. |
| **Ausgänge** | **WS:** `config_response`. |
| **Inbound-Inbox** | **Ja**. |
| **Finalität** | `is_final`, `retry_policy`, Dedup-Key — Verweis G3 / Command-Contract. |

### 7. `discovery_handler` — Discovery (Legacy)

| Aspekt | Inhalt |
|--------|--------|
| **Subscription** | `kaiser/+/discovery/esp32_nodes`, QoS **1** |
| **Payload** | `_validate_payload` (manuell). |
| **Verarbeitung** | Registrierung/Update `ESPRepository`; **deprecated** zugunsten Heartbeat. |
| **Ausgänge** | **Kein** WebSocket-Broadcast in diesem Modul. |
| **Störfall** | Doppelte Discovery + Heartbeat — konsistent, UI evtl. erst nach Heartbeat. |

### 8. `actuator_handler` — Aktor-Status (ESP → Server)

| Aspekt | Inhalt |
|--------|--------|
| **Subscription** | `kaiser/+/esp/+/actuator/+/status`, QoS **1** |
| **Payload / Aliase** | `state` bool/string; `value` / `pwm`; `runtime_ms` / `uptime` (siehe Docstring ~52-62). |
| **Verarbeitung** | Actuator-State in DB, State-Adoption; History-Logging. |
| **Ausgänge** | **WS:** `actuator_status` (optional `correlation_id`). |

### 9. `actuator_response_handler` — Aktor-Command-Response

| Aspekt | Inhalt |
|--------|--------|
| **Subscription** | `.../actuator/+/response`, QoS **1** |
| **Payload** | `canonicalize_actuator_response` (Topic vs. Payload-Kohärenz). |
| **Verarbeitung** | `CommandContractRepository` (Terminal Authority), Command-History. |
| **Ausgänge** | **WS:** `actuator_response`. |

### 10. `actuator_alert_handler` — Aktor-Alerts

| Aspekt | Inhalt |
|--------|--------|
| **Subscription** | `.../actuator/+/alert`, QoS **1** |
| **Payload / Aliase** | `alert_type` oder `type`; Timestamp-Range-Check. |
| **Verarbeitung** | History, Notifications-Pfad je nach Schwere. |
| **Ausgänge** | **WS:** Alert-Event (siehe ~193). |

### 11. `zone_ack_handler` — Zone-ACK

| Aspekt | Inhalt |
|--------|--------|
| **Subscription** | `.../zone/ack`, QoS **1** |
| **Payload** | Manuell `_validate_payload`; optional **`reason_code`** (Metrik `increment_mqtt_ack_reason_code`). |
| **Verarbeitung** | ESP/Zone-Update, `ZoneRepository`; **`_command_bridge.resolve_ack`** (`zone_ack_handler.py` ~239). |
| **Ausgänge** | **WS:** `zone_assignment`. |

### 12. `subzone_ack_handler` — Subzone-ACK

| Aspekt | Inhalt |
|--------|--------|
| **Subscription** | `.../subzone/ack`, QoS **1** |
| **Payload** | **Pydantic** `SubzoneAckPayload`; optional `reason_code`. |
| **Verarbeitung** | `SubzoneService.handle_subzone_ack`; `commit` bei Erfolg; **immer** `resolve_ack` auch bei Error (Timeout-Vermeidung). |
| **Ausgänge** | **WS:** `subzone_assignment`. |

### 13. `intent_outcome_handler` — Intent-Outcome

| Aspekt | Inhalt |
|--------|--------|
| **Subscription** | `.../system/intent_outcome`, QoS **1** |
| **Payload** | `merge_intent_outcome_nested_data`; Pflichtfelder `intent_id`, `flow`, `outcome`, `ts`; fehlende **`correlation_id`** → synthetisch `missing-corr:…` + Contract-Code (`intent_outcome_handler.py` ~61-65). |
| **Verarbeitung** | `canonicalize_intent_outcome`; `upsert_intent` / `upsert_outcome`; Dedup bei **stale** → `increment_intent_duplicate`, `commit`, `True`. |
| **Ausgänge** | **WS:** `intent_outcome` mit `correlation_id`. |
| **Fehlerpfad** | DB-Fehler → **`False`** (explizit: keine stille Ack ohne Persistenz, ~171-174). |
| **Inbound-Inbox** | **Ja**. |

### 14. `intent_outcome_lifecycle_handler` — Outcome-Lifecycle (CONFIG_PENDING)

| Aspekt | Inhalt |
|--------|--------|
| **Subscription** | `.../system/intent_outcome/lifecycle`, QoS **1** |
| **Payload** | Pflicht: `event_type`, `schema`; `ts` optional aber typgeprüft. |
| **Verarbeitung** | `AuditLogRepository.log_device_event`; `commit`. |
| **Ausgänge** | **WS:** `intent_outcome_lifecycle`. |
| **Inbound-Inbox** | **Ja** (Suffix-Match in `_is_critical_topic`). |

### 15. `mock_actuator_command_handler` (Closure in `main.py`) — Mock-ESP Kommandoeingang

| Aspekt | Inhalt |
|--------|--------|
| **Subscriptions** | `.../actuator/+/command`, `.../actuator/emergency`, `kaiser/broadcast/emergency`, je QoS **1** |
| **Payload** | JSON beliebig → `json.dumps` an SimulationScheduler. |
| **Verarbeitung** | `get_simulation_scheduler().handle_mqtt_message`; nur wenn Mock zutrifft, sonst **`None`** → Subscriber zählt als „nicht zutreffend“ (kein False-Error, `main.py:369`). |
| **Ausgänge** | Indirekt über Mock/Simulation (MQTT publish callback in `main.py:346-348`). |

---

## Modul ohne Subscriber-Entry: `base_handler.py`

Abstrakte Basisklasse / `ValidationResult` — **wird nicht** in `main.py` registriert. Dient als Musterbibliothek; konkrete Handler nutzen teils eigene Validierung statt Vererbung.

---

## Drift — `MQTT_TOPICS.md` vs. implementierter Server

| Thema | IST (Server) | SOLL / Doku | Bewertung |
|-------|----------------|-------------|-----------|
| `sensor/batch` | Kein Subscribe, kein Handler | In `MQTT_TOPICS.md` als ESP→Server dokumentiert | **Drift / Lücke** — Batch-Daten gehen verloren, wenn nur Batch genutzt wird |
| `system/diagnostics` QoS | Subscribe-QoS **1** | Doku oft **0** | Bewusste Abweichung (at-least-once) |
| Viele weitere ESP→Server Topics (`status`, `safe_mode`, `subzone/status`, `mqtt/auth_status`, …) | Nicht abonniert | In Quick-Lookup-Tabelle genannt | Erwartbar, sofern nicht genutzt; sonst **fachliche Lücke** |
| `TopicBuilder.parse_topic` | Enthält **keinen** `parse_system_diagnostics` | Generischer Parser soll „alle“ Typen abdecken | **Implementierungs-Drift** (nur wenn `parse_topic` genutzt wird) |

---

## Gap-Liste (P0 / P1 / P2) — Bezug G2 / G3

| ID | Schwere | Bezug | Befund |
|----|---------|-------|--------|
| GAP-S5-01 | **P0** | G2 (stille Verluste) | **`sensor/batch` nicht subscribed** — dokumentierte Firmware/Protokoll-Fähigkeit ohne Server-Ingestion. |
| GAP-S5-02 | **P1** | G2 | **Heartbeat, LWT, Diagnostics, Actuator-*, Discovery** ohne kritische Inbox — bei Prozess-Crash während Handler kein `replay_pending_events` für diese Klasse. |
| GAP-S5-03 | **P1** | G3 (Korrelation) | **`generate_mqtt_correlation_id`**: fehlendes `seq` → `no-seq`; hohe Rate gleicher Topic-Suffixe kann Log-Korrelation erschweren (kein FIFO auf Broker-Seite für dedizierte Business-ID). |
| GAP-S5-04 | **P1** | G3 | **Intent-Outcome** synthetische `correlation_id` bei Firmware-Verstoß — nachvollziehbar, aber nicht identisch zum ausgehenden Server-Intent (Trace-Lücke bis manuelle Zuordnung). |
| GAP-S5-05 | **P2** | — | **`parse_topic`** ohne Diagnostics-Parser — Wartungs-/Tooling-Drift. |
| GAP-S5-06 | **P2** | G2 (UX) | **Discovery** ohne WS — Gerät taucht in UI ggf. erst nach Heartbeat auf. |

**Parallelität / FIFO (Verweis S11):** `MQTTCommandBridge.resolve_ack` nutzt u. a. `correlation_id` aus ACK-Payload; Zone/Subzone-Handler reichen diese durch. Bei parallelen gleichartigen Commands ohne eindeutige Correlation besteht Race-Risiko — Detailausbau laut Auftrag in **S11**.

---

## Abnahme-Checkliste (Auftrag)

- [x] Jeder in `main.py` registrierte Pattern-Eintrag mit Steckbrief abgedeckt (inkl. Mock-Closure).  
- [x] Zusätzliche `*_handler.py` im Ordner: `base_handler` als „kein Subscriber“ dokumentiert.  
- [x] Master-Tabelle aller Subscriptions.  
- [x] Drift-Sektion zu `MQTT_TOPICS.md`.  
- [x] Gap-Liste P0–P2 mit G2/G3-Bezug.

---

*Erstellt aus Code-Stand 2026-04-05 (`main.py`, `subscriber.py`, `handlers/*.py`, `topics.py`, `request_context.py`).*
