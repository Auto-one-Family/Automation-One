# Auftrag: El Servador — vollstaendige Angleichung an Firmware-Vertrags- und Heartbeat-Update (P0–P2)

**Datum:** 2026-04-05  
**Prioritaet:** Hoch (Blockiert saubere End-to-End-Sicht auf Intent-Outcomes, Config-Pending-Lifecycle und Geraete-Gesundheit)  
**Zielrolle:** Server-Entwickler (Python/FastAPI, MQTT, PostgreSQL, WebSocket)

---

## 1. Kontext (IST auf ESP32 — bereits umgesetzt)

Die Firmware **El Trabajante** liefert u. a.:

- **Intent-Outcome-Erweiterungen:** u. a. `PENDING_RING_EVICTION` (config, failed, retryable), **Critical Outbox**-Strategie mit Zaehler **`outcome_drop_count_critical`**, Publish-Pfad **`PUBLISH_OUTBOX_FULL`** (statt generischem OUTBOX_FULL wo angegeben).
- **Zone/Subzone:** Bei **Config-Lane busy** → **`zone/ack`** bzw. **`subzone/ack`** mit **`reason_code`: `CONFIG_LANE_BUSY`** plus zugehoerige **Intent-Outcomes** (Flows `zone`, `subzone_assign`, `subzone_remove`, `subzone_safe` — exakt wie in Firmware benannt).
- **Parse-/Validierungsfehler:** String-Codes u. a. **`JSON_PARSE_ERROR`**, ggf. **`VALIDATION_ERROR`**, **`SUBZONE_NOT_FOUND`**; System-Command bei JSON-Fehler → **`…/command/response`** im gleichen Stil (`success`, `error`, `reason_code`, `correlation_id`) + Outcome wo sinnvoll.
- **Neues MQTT-Topic:**  
  `kaiser/{kaiser_id}/esp/{esp_id}/system/intent_outcome/lifecycle`  
  mit Payload u. a. **`boot_sequence_id`**, **`schema`: `config_pending_lifecycle_v1`** (Variante B CONFIG_PENDING-Lifecycle). Firmware-Doku: `El Trabajante/docs/runtime-readiness-policy.md`.
- **Heartbeat:** Felder **`degraded` / `degraded_reason`** entfallen; stattdessen u. a. **`persistence_degraded`**, **`persistence_degraded_reason`**, **`runtime_state_degraded`**, **`mqtt_circuit_breaker_open`**, **`wifi_circuit_breaker_open`**, **`network_degraded`**, **`critical_outcome_drop_count`**, **`publish_outbox_drop_count`** (Semantik und Regeln in Firmware-Kommentaren).
- **`intent_metadata`:** optional **verschachtelt unter `data.*`** (z. B. `intent_id`, `correlation_id`, …) zusaetzlich zu Top-Level — Parser auf ESP filtert/mergt; Server muss gleichen Vertrag unterstuetzen.
- **Keine neuen numerischen ESP-Codes** in `error_codes.h` — alles stringbasierte Codes wie oben.

---

## 2. Ziel dieses Auftrags

Du sollst **die gesamte Serverlogik und die Datenbankschicht** (inkl. alles was daran haengt: MQTT-Ingestion, Normalisierung, Persistenz, APIs, WebSockets, Metriken, Tests, Simulation/Mocks) so erweitern oder korrigieren, dass:

1. Alle neuen **MQTT-Payloads und Topics** korrekt **empfangen, validiert, normalisiert und gespeichert** werden (oder bewusst als reines Telemetrie-Ereignis behandelt werden, mit Begruendung).
2. **Keine stillen Regressionen** entstehen: aeltere Clients/Firmware-Versionen, soweit noch im Feld, **best-effort** nicht abbrechen (Felder optional, Defaults dokumentiert).
3. **Observability:** Metriken/Logs decken neue Codes und Lifecycle-Events ab; Ops kann Ursachenketten folgen.

---

## 3. Pflicht-Analyse (gesamter Server + DB)

Arbeite **systematisch** durch — nicht nur „MQTT-Handler anfassen“.

### 3.1 MQTT-Schicht

- `El Servador/god_kaiser_server/src/mqtt/subscriber.py` — Registrierung, Routing, **kritische Topics** (`_is_critical_topic`), ggf. Durable-Inbox-Verhalten fuer neue Topics.
- `El Servador/god_kaiser_server/src/mqtt/topics.py` — **TopicBuilder:** Pattern fuer `…/system/intent_outcome/lifecycle` (parse + validate), Konsistenz mit bestehendem `parse_intent_outcome_topic`.
- Handler (jeweils unter `El Servador/god_kaiser_server/src/mqtt/handlers/`):
  - `intent_outcome_handler.py` — End-to-End: Payload-Validierung, **Merge von `data.*` in intent_metadata**, Umgang mit neuen **`code`-Strings**, Persistenz, WS, Metriken (Intent-Payload: `outcome_drop_count_critical`; Heartbeat separat: `critical_outcome_drop_count` in Firmware).
  - **Neu oder erweitert:** Handler fuer **Lifecycle** (dedizierter Handler vs. Erweiterung — technisch begruenden, eine klare Wahl treffen).
  - `heartbeat_handler.py` — kompletter Pfad: Ack, DB-Updates, **Ableitung von health_status** vs. neue booleans/Zaehler, Simulation/Mock-Pfade.
  - `zone_ack_handler.py`, `subzone_ack_handler.py` — **`reason_code`** (insb. `CONFIG_LANE_BUSY`, `JSON_PARSE_ERROR`, …): parsen, in DB/WS abbilden, mit Command-/Intent-State abgleichen.
  - Weitere Handler, die **command/response**, Config oder Subzone-Zustaende beruehren — Querpruefung auf doppelte oder widersprüchliche Zustandsuebergaenge.

### 3.2 Vertrags- und Normalisierungsmodule

(Basispfad Server-Code: `El Servador/god_kaiser_server/src/`.)

- `El Servador/god_kaiser_server/src/services/intent_outcome_contract.py` — **IST:** `CANONICAL_FLOWS` enthaelt nur `command`, `config`, `publish`. Firmware sendet zusaetzlich **zone- und subzone-Flows**.  
  **SOLL:** Erweitere den Kanon **oder** definiere explizit, wie **unbekannte Flows** als `raw_flow` persistiert und in API/WS exponiert werden, ohne dass alles als **Contract-Violation** endet. Ziel: **keine falschen `CONTRACT_UNKNOWN_CODE`-Lawinen** bei gueltiger Firmware.
- `El Servador/god_kaiser_server/src/services/system_event_contract.py` — `canonicalize_heartbeat`: pruefen, ob neue Felder **still ignoriert** werden duerfen oder ob bewusst validiert/normalisiert werden soll (Dokumentation im Modul).
- Serialisierung fuer Events/API: `El Servador/god_kaiser_server/src/services/event_contract_serializers.py`, `El Servador/god_kaiser_server/src/services/event_aggregator_service.py` (z. B. Mapping `degraded` → Severity — aktuell noch heartbeat-basiert).

### 3.3 Datenbank

- **Models & Migrationen (Alembic):**  
  - Tabellen rund um **Command/Intent/Outcome** (`command_contract_repo`, Intent-Outcome-Rows): brauchen wir Spalten oder JSONB fuer **Lifecycle** (`boot_sequence_id`, `schema`, config-pending-state)?  
  - `esp_heartbeat_logs` / Geraetemodell `ESPDevice` (`El Servador/god_kaiser_server/src/db/models/esp.py`): aktuell werden in `ESPHeartbeatRepository.log_heartbeat` im Wesentlichen **Heap/RSSI/uptime/Zaehler** gespeichert; **neue Firmware-Felder** gehen verloren. Entscheide und implementiere **eine** klare Strategie:
    - **Option A:** Erweiterung des Models um explizite nullable Spalten (Telemetrie + Flags + Zaehler),  
    - **Option B:** JSONB **raw_payload** / **telemetry_extension** pro Heartbeat-Log,  
    - **Option C:** separate Tabelle **device_runtime_telemetry** mit FK und Zeitstempel.  
  Begruende kurz im PR/Migrations-Kommentar.
- **Repositories:** `command_contract_repo`, `esp_heartbeat_repo`, Zone/Subzone-Repos — alle Schreibpfade, die von neuen ACK-/Outcome-Codes betroffen sein koennten.
- **Indizes & Retention:** wenn neue Tabellen/Spalten — keine ungebremsten Voll-Scans; Retention wie bei Heartbeat-Logs bedenken.

### 3.4 API & WebSocket

- REST: Router unter `El Servador/god_kaiser_server/src/api/v1/` (z. B. `intent_outcomes.py`, Device-Health) — Felder und Filter auf **neue Codes/Flows** pruefen.
- WebSocket: `El Servador/god_kaiser_server/src/websocket/manager.py` und `El Servador/god_kaiser_server/src/api/v1/websocket/realtime.py` — Events, die Heartbeat oder Outcomes an das Frontend geben; Payload-Schema aktualisieren (Breaking Changes dokumentieren oder Versionsfeld erhoehen).
- OpenAPI/Client-Typen falls generiert — mitziehen.

### 3.5 Metriken & Logging

- `El Servador/god_kaiser_server/src/core/metrics.py` — neue Counter/Histogramme fuer: Lifecycle-Messages, neue Outcome-Codes, ACK-`reason_code`-Histogramm, Heartbeat-Degradationsflags.
- Strukturierte Logs: `esp_id`, `correlation_id`, `flow`, `code`, `boot_sequence_id` wo verfuegbar.

### 3.6 Tests & Simulation

- **Unit:** `El Servador/god_kaiser_server/tests/unit/test_intent_outcome_contract.py`, `test_intent_outcome_handler_contract.py` — neue Flows, Codes, `data.*`-Merge, Lifecycle-Payload minimal.
- **Integration:** MQTT-Subscriber kritische Topics; Heartbeat mit neuem und altem Payload (optionaler Kompatibilitaetstest).
- **Simulation:** `El Servador/god_kaiser_server/src/services/simulation/scheduler.py` und Mock-Heartbeats — aktualisieren, damit CI und lokale Tests **nicht** veraltete Felder senden.

### 3.7 Dokumentation im Server-Repo

- Kurz-Dokument (z. B. unter `El Servador/god_kaiser_server/docs/` — Ordner existiert — oder `.claude/reference/api/MQTT_TOPICS.md` ergaenzen): **Topic-Liste**, **Payload-Beispiele**, **Code-String-Enum** (nur dokumentarisch, keine Pflicht fuer Firmware-Aenderung), **Heartbeat-Schema-Version** oder `metrics_schema_version`-Erwartung.

---

## 4. Konkrete String-Codes und Topics (Checkliste)

| Thema | Aktion |
|--------|--------|
| `PENDING_RING_EVICTION`, `PUBLISH_OUTBOX_FULL`, `CONFIG_LANE_BUSY`, `JSON_PARSE_ERROR`, `VALIDATION_ERROR`, `SUBZONE_NOT_FOUND` | Ingestion akzeptieren, persistieren/telemetrieren, Metriken, keine numerische Zuordnung noetig |
| Topic `…/system/intent_outcome/lifecycle` | Subscribe + Handler + Persistenz/Audit nach Entscheidung in 3.3 |
| Heartbeat: neue Felder | Parsing, DB-Strategie, WS/API, Abloesung `degraded`/`degraded_reason` |
| `intent_metadata` / `data.*` | Vor `canonicalize_intent_outcome` und vor Repo-Upsert vereinheitlichen |

---

## 5. Abnahmekriterien

1. **Alle** in Abschnitt 4 genannten **Topics und Codes** sind im Code abgedeckt (Handler + Tests oder explizit als „bewusst nur geloggt“ mit Kommentar und Metrik).
2. **Alembic-Migration** laeuft auf leerer und bestehender DB ohne Datenverlust; Rollback dokumentiert.
3. **pytest** und relevante Integrationstests **gruen**; keine neuen Flakes.
4. **Kein** unkontrolliertes Hochdrehen von `CONTRACT_UNKNOWN_CODE` bei gueltigen Firmware-Payloads der neuen Flows.
5. Kurze **interne Changelog-Notiz** (1–2 Absaetze): was sich fuer Frontend/Ops aendert.

---

## 6. Nicht im Scope (bewusst)

- Aenderungen an **El Trabajante** (Firmware) — nur Server.
- Numerische ESP-Error-Code-Mappings in `error_codes.h` — laut Robin nicht erforderlich.
- Life-Repo-Dokumentation — optional nur wenn du einen PR dort separat vorbereitest; **dieser Auftrag ist im Auto-One-Repo vollstaendig umsetzbar**.

---

## 7. Startpunkte (bekannte Dateien)

- `El Servador/god_kaiser_server/src/mqtt/subscriber.py` (`_is_critical_topic`, Durable-Inbox)
- `El Servador/god_kaiser_server/src/mqtt/handlers/intent_outcome_handler.py`
- `El Servador/god_kaiser_server/src/services/intent_outcome_contract.py`
- `El Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py`
- `El Servador/god_kaiser_server/src/db/repositories/esp_heartbeat_repo.py`
- `El Servador/god_kaiser_server/src/db/repositories/command_contract_repo.py`
- `El Servador/god_kaiser_server/src/db/models/esp_heartbeat.py` (Tabelle `esp_heartbeat_logs`)
- `El Servador/god_kaiser_server/src/mqtt/topics.py` (`TopicBuilder.parse_intent_outcome_topic`)
- `El Servador/god_kaiser_server/src/mqtt/handlers/zone_ack_handler.py`, `subzone_ack_handler.py`
- `El Servador/god_kaiser_server/src/services/event_aggregator_service.py` (Heartbeat → unified events)

---

**Erfolgsdefinition:** Ein Operator kann anhand von **DB-Eintraegen, Logs und Metriken** nachvollziehen: Config-Pending-Ring-Eviction, Publish-Outbox-Druck, Config-Lane-Backpressure, JSON-Fehler auf Zone/Subzone/Command, und **CONFIG_PENDING-Lifecycle** pro Boot-Sequenz — konsistent mit der Firmware vom 2026-04-05.
