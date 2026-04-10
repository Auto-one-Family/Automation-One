# IST: Observability, Correlation, Error-Codes, Verträge (E2E)

**Datum:** 2026-04-09  
**Repo:** AutomationOne (`Auto-one`)  
**Methodik:** Code-Recherche (rg), Docker-Monitoring-Stack (Profil `monitoring`), Loki-Stichprobe via `scripts/loki-query.ps1`, Querverweis `.claude/auftraege/`.  
**Hinweis:** Keine PII/Secrets; Geräte-IDs in Beispielen anonymisiert bzw. aus Loki übernommen.  
**Nachtrag 2026-04-10:** `subscriber._route_message` — bei `JSONDecodeError` loggt der Server `topic=…` und `mqtt_parse_fail_id=parse-fail:…` (ohne Handler-Lauf); siehe `docs/debugging/correlation-id-playbook.md` §3.

### Querverweis: Docker-Log-Triage vs. Collector-Rauschen

Geräte-MQTT-Fehler (`kaiser/.../esp/{esp_id}/system/error`, numerische Codes z. B. **3016** `ERROR_MQTT_PAYLOAD_INVALID` im Zusammenhang mit EMERGENCY-Parse) sind von **Observability-/Deploy-Rauschen** (Grafana-Provisioning, Alloy-Container-Tailer nach Recreate, cAdvisor-Host-Hinweise) zu **trennen** — flache „ERROR“-Suchen über alle Container liefern sonst falsche Root-Causes. Methodik und Tabelle: `docs/analysen/IST-docker-log-triage-observability-signal-vs-noise-2026-04-09.md`; Incident-Artefakte: `.claude/reports/current/incidents/INC-2026-04-09-dockerlog-obs-triage/`.

**Code-Verankerung 3016:** Für Operator-Texte mappt der Server **3016** u. a. in `El Servador/god_kaiser_server/src/core/esp32_error_mapping.py`. In der Taxonomie ist der Kommunikationscode für ungültige MQTT-Payloads **3016**; **6016** ist kein definierter Eintrag — Vorkommen in älteren Steuer-/Suchtexten sind Tippfehler (Triage §2.1).

**Kurz:** **Deploy-Lifecycle** (Alloy-Tailer auf entfernte oder alte Container-IDs, Grafana-Startup zu optionalen Provisioning-Pfaden) fällt unter **Klasse B** in der Triage — **nicht** unter MQTT-`system/error` oder Firmware-3016 (**Klasse A**). Korrelation mit HTTP-`request_id` bleibt nur sinnvoll, wenn der Kontext wirklich REST ist (siehe Abschnitt „Warnung: HTTP-request_id …“ unten).

### Abgleich 2026-04-09 (STEUER-03)

Gegen die kanonische Docker-/Loki-Triage [`IST-docker-log-triage-observability-signal-vs-noise-2026-04-09.md`](IST-docker-log-triage-observability-signal-vs-noise-2026-04-09.md) (Klassen **A/B/C**, Trennung **Gerät/MQTT** vs. **Collector-/Deploy-/Stack-Rauschen**) abgeglichen: die **Correlation-Contracts** in diesem Dokument — Clustering-Reihenfolge, Feld-Matrix, Warnung zu REST-`request_id` vs. MQTT-synthetischer CID, zwei Benachrichtigungsketten — bleiben **unverändert**, weil sie die technische Semantik der IDs bereits festhalten; die Triage-Datei operationalisiert nur die **betriebliche Einordnung** von Logzeilen und den Suchhinweis **„6016“ vs. 3016** (dort §2.1), **ohne** diesen IST-Bericht zu ersetzen oder hier zu wiederholen.

---

## Runbook-Problemcluster A–D (Zuordnung, vollständig)

| Cluster | Thema (Steuerlauf Runbook) | Abdeckung in diesem Dokument |
|--------|----------------------------|--------------------------------|
| **A** | Orchestrierung und Analyse-Artefakte (Steuerdatei, additive IST-Doku; Querschnitt mehrerer Berichte = Meta-Analyst) | Methodik, Abschnitt I (Auftragsabgleich), Executive Summary; Verweise: `.claude/skills/auto-debugger/SKILL.md`, Inbox unter `.claude/auftraege/auto-debugger/inbox/` |
| **B** | Observability, Korrelation, E2E-Verträge (IDs, zwei Ketten, UI-Finalität, Playwright/`data-testid`, Firmware-Abgrenzung) | Abschnitte B–G, Top-5-Lücken, Inkonsistenzen; Konzept/Alert-Pfade: `docs/analysen/KONZEPT-auto-debugger-frontend-flow-api-alertcenter-2026-04-09.md` |
| **C** | Prozess und Qualitätstor (`/verify-plan`, `TASK-PACKAGES`, `SPECIALIST-PROMPTS`, Git-Pflicht) | Technische Umsetzung aus diesem IST-Bericht nur nach Gate — Artefakte unter `.claude/reports/current/auto-debugger-runs/problemcluster-obs-2026-04-09/` |
| **D** | Dokumentation und Router (`docs/analysen/` kanonisch vs. Agent-/Skill-Einführung) | Dieses Dokument als IST in `docs/analysen/`; Router: `AGENTS.md`, `.claude/CLAUDE.md`, `.claude/commands/auto-debugger.md`, Agent `auto-debugger` |

**Hinweis:** Cluster **C** und **D** sind hier benannt und verlinkt, auch wenn die Tiefe der Prozessbeschreibung in Skill/Agent/Run-Ordner liegt — keine stille Auslassung.

### Zwei Benachrichtigungsketten: NotificationRouter/DB-Inbox vs. WebSocket `error_event`

**Persistierte ISA-18.2-Kette:** `NotificationRouter` schreibt in die DB (`notifications`), optional E-Mail; Frontend-Inbox über REST und WS-Events wie `notification_new` / `notification_updated` (siehe Konzeptbericht §5.2–5.3).

**Parallele Echtzeit-Kette:** `error_handler.py` u. a. broadcastet **`error_event`** über WebSocket **ohne** denselben Router — betroffene Meldungen erscheinen **nicht** automatisch in der Inbox.

**Debugging-Konsequenz:** „Leerer Drawer“ bei gleichzeitigem `error_event` ist plausibel und umgekehrt. Triage: erst klären, ob die Spur zur **Inbox** (Felder `correlation_id`, `fingerprint`, `parent_notification_id`) oder zum **Error-Stream** gehört; beides blind zu einer Root-Cause zusammenzulegen führt zu falscher Schicht-Zuordnung.

**Nachtrag 2026-04-10 (Operator-Tabelle, repo-abgesichert):** Symptom → erwartete Quelle → welche Korrelationsfelder **zuerst** nutzen (Reihenfolge wie oben „Clustering-Reihenfolge“ = Konzept §6.2).

| Symptom / Operator-Frage | Erwartete Quelle (Kette) | Korrelationsfelder (Priorität 1→5) |
|--------------------------|--------------------------|-------------------------------------|
| Toast „Fehler …“ / System-Monitor zeigt `error_event`, **Inbox-Drawer bleibt leer** | **Kette B:** MQTT `…/system/error` → `error_handler.py` → Audit-Zeile + **`error_event`**-Broadcast (**kein** `NotificationRouter`) | **3)** `esp_id` + Zeitfenster; **4)** MQTT-Topic/Audit-Kontext; Payload/WS-Daten: `error_log_id`, `error_code`, `context` (Evidence: `serialize_error_event` liefert u. a. `esp_id`, `error_log_id`, kein Inbox-`correlation_id`) |
| Eintrag in **Server-Inbox** mit Ack/Resolve; Badge/Drawer | **Kette A:** `NotificationRouter.route` → DB `notifications` → WS `notification_new` / `notification_updated` | **1)** `correlation_id`, `fingerprint`, `parent_notification_id`; **2)** HTTP `X-Request-ID` / `request_id` nur wenn der Auslöser REST war |
| „Ich sehe überall Alerts“ — unklar welche Schicht | Zuerst **Kette** zuordnen (A vs. B), dann joinen | **1)** nur bei Kette A; bei Kette B **nicht** mit Inbox-Feldern „ersetzen“ — höchstens **3)** `esp_id` + Zeitfenster parallel |

**Evidence (Repo-Pfade, Stichprobe):**

- **Kette A — Persistenz + Router:** `El Servador/god_kaiser_server/src/services/notification_router.py` (`NotificationRouter`), REST `El Servador/god_kaiser_server/src/api/v1/notifications.py`.
- **Kette B — ESP-Error ohne Router:** `El Servador/god_kaiser_server/src/mqtt/handlers/error_handler.py` — nach Audit-Write `WebSocketManager.get_instance()` → `broadcast("error_event", broadcast_payload)`; Serialisierung `El Servador/god_kaiser_server/src/services/event_contract_serializers.py` (`serialize_error_event`).
- **Frontend — Inbox vs. Toast:** persistierte Inbox `El Frontend/src/shared/stores/notification-inbox.store.ts` (REST + `notification_new` / `notification_updated`); transiente Echtzeit-Fehler `El Frontend/src/shared/stores/notification.store.ts` (`handleErrorEvent` für WS `error_event`); UI-Hinweis z. B. `El Frontend/src/components/notifications/NotificationDrawer.vue` (Unterscheidung Inbox vs. `error_event`-Toast).

### Warnung: HTTP-`request_id` / `X-Request-ID` und MQTT-synthetische CID nicht vermischen

Dieselbe Bezeichnung **`request_id`** in Server-Logs (ContextVar) kann eine **REST-UUID** (Middleware/Client-Header) oder eine **MQTT-synthetische** Korrelationszeichenkette sein (`generate_mqtt_correlation_id` in `mqtt/subscriber.py`). **Nicht** unter einer vermeintlich einheitlichen „Request-ID“ in Loki joinen, ohne Quelle zu prüfen — sonst entstehen falsche Cross-Layer-Ketten (siehe P0-Lücke „Semantik-Kollision“ oben und `core/request_context.py`).

### Clustering-Reihenfolge (für Orchestrierung / Triage, verbindlich)

1. Notification: `correlation_id`, `fingerprint`, `parent_notification_id`  
2. HTTP: `X-Request-ID` / `request_id` (nur wenn HTTP-Kontext gesichert)  
3. `esp_id` + Zeitfenster  
4. MQTT-Logzeilen mit generierter/synthetischer CID  
5. Titel / Dedup-Key zuletzt  

---

## A) Executive Summary

**Nachweislich vorhandene IDs (kurz):**

| Schicht | IDs / Mechanismen |
|--------|-------------------|
| **Server (HTTP)** | `X-Request-ID` einlesen oder UUID generieren; Response-Header; `ContextVar` als `request_id` in Logs/Audit (`El Servador/god_kaiser_server/src/middleware/request_id.py`, `core/request_context.py`, `core/logging_config.py`). |
| **Server (MQTT)** | Pro eingehender Nachricht synthetische Zeichenkette `generate_mqtt_correlation_id(esp_id, topic_suffix, seq)` — wird in dieselbe `ContextVar` geschrieben wie HTTP-`request_id` (`mqtt/subscriber.py` `_route_message`, `_run_handler_with_cid`). |
| **MQTT-Payloads (App)** | `correlation_id`, `intent_id`, `request_id` je nach Topic (Actuator, Sensor-Command, Config, Intent-Outcome, Firmware-ACKs). |
| **Firmware** | `correlation_id` / `intent_id` in Config-/Intent-Pfaden, `ensureCorrelationId`-Fallbacks, `seq` u. a. im Heartbeat/Publish (`El Trabajante/src/services/communication/mqtt_client.cpp`, z. B. `publishHeartbeat`), Broker-`msg_id` nur Debug-Log. |
| **Frontend** | Pro REST-Aufruf `crypto.randomUUID()` als `X-Request-ID`; Fehlerpfad liest `x-request-id` aus Response/Headers (`src/api/index.ts`). **Dev-only:** zuletzt vom Server gelieferte `x-request-id` sichtbar unter der System-Monitor-Tab-Leiste (`src/components/system-monitor/RestRequestIdDevBar.vue`, nur Vite-Development). WS-Events typisiert mit optionalen `correlation_id` / `request_id` (`src/types/websocket-events.ts`). |
| **Loki/Alloy** | Labels: u. a. `compose_service`, `level`. Structured Metadata: `logger`, `request_id` (Server), optional **`correlation_id`** wenn die Log**zeile** `correlation_id=…` enthält (Alloy-Regex auf `message`, `docker/alloy/config.alloy`), `component` (Frontend), `device`/`error_code` (Serial-Logger). Korrelation in Log**zeile** per `|=` auf beliebige Strings (`docs/debugging/logql-queries.md`). **Server-REST:** optional `traceparent` im JSON-Log, wenn der Client den W3C-Header mitschickt (`middleware/request_id.py`, `logging_config.py`). |

**Wesentliche Lücken (P0–P2, Auswahl):**

| P | Lücke |
|---|--------|
| **P0** | **Semantik-Kollision `request_id`:** Ein Name, zwei Welten — REST-UUID vs. MQTT-Schlüssel `esp:topic:seq:ts_ms`. Cross-Layer-Suchen in Loki sind verwirrend, wenn Nutzer eine „Request-ID“ aus dem Browser mit MQTT-Logs joinen will. |
| **P1** | **Kein durchgängiger W3C Trace Context:** Firmware und Frontend setzen weiterhin kein `traceparent`. **Server (REST):** optional — eingehender `traceparent`-Header wird durchgereicht (Response + JSON-Logfeld), ohne MQTT-Pflicht. Vollständige E2E-Traces weiterhin primär über `request_id` / MQTT-CIDs. |
| **P1** | **`failure_class` (Pilot I08, teilweise):** Server setzt das Feld jetzt an drei markierten Stellen (JSON-Logs via `JSONFormatter`, Whitelist `_STRUCTURED_JSON_FIELDS` in `El Servador/god_kaiser_server/src/core/logging_config.py`): `mqtt_json_parse` / `mqtt_route` (`mqtt/subscriber.py`), `sensor_payload_validation` (`mqtt/handlers/sensor_handler.py`). Werte sind kurze feste Strings (keine PII). LogQL-Beispiele: `docs/debugging/logql-queries.md`. Ausstehend: breitere Abdeckung weiterer Handler. |
| **P2** | **Tenant/User nicht in strukturierten Logs:** Kein standardisiertes `tenant`/`user_id`-Feld in Logging-Pipeline (Alloy); Multi-Tenant- oder Audit-Forensik läuft über API/DB, nicht über Log-Join. |

**Was ist schon gut:**

- **Reife MQTT→Handler→Log-Kette:** Explizite `ContextVar`-Setzung im **Main-Event-Loop** (Workaround ThreadPool/`run_coroutine_threadsafe`) ist dokumentiert und getestet (`subscriber.py`, Tests `test_mqtt_correlation.py`).
- **JSON-Parse-Fehler (MQTT):** Ohne erfolgreichen Parse kein Handler; ERROR-Log mit `topic=` und `mqtt_parse_fail_id=parse-fail:…` zur Korrelation in Loki (`subscriber.py`, `test_mqtt_correlation.py`).
- **WS-Envelope vs. Payload:** `websocket/manager.py` prüft Divergenz von `correlation_id` und zählt Metriken (`increment_ws_envelope_data_divergence`, `increment_ws_missing_correlation`).
- **Prometheus:** Breites Set an zählerbasierten Signalen für MQTT-Fehler, WS-Contract, Config-Intents, Outcomes (`core/metrics.py`).
- **Loki-Alerts:** `for: 2m`, `noDataState: OK` bei mehreren Regeln — bewusst gegen Flapping (`docker/grafana/provisioning/alerting/loki-alert-rules.yml`).
- **Referenzdokument Error-Codes:** Zentrale Tabelle `.claude/reference/errors/ERROR_CODES.md` mit Firmware- und Server-Bereichen.

---

## B) Feld-Matrix („Correlation Contract“)

**Legende:** `gesetzt+weitergegeben` | `gesetzt, bricht ab bei …` | `fehlt` | `nur in Logs` | `nur in Payload`

| Vorgangstyp | `request_id` / `X-Request-ID` | `correlation_id` | `trace_id` / `traceparent` | `device_id` / `esp_id` | `tenant` / `user_id` | `intent_id` | MQTT `msg_id` | WebSocket-Metadaten |
|-------------|-------------------------------|------------------|----------------------------|------------------------|----------------------|-------------|---------------|---------------------|
| REST: Sensor-CRUD | gesetzt+weitergegeben (Middleware + Client-Header; Logs) | fehlt (nicht Standard in reinen Sensor-REST-Pfaden; Kalibrierung siehe API) | optional: Client-Header `traceparent` → Response + JSON-Log (`traceparent`), kein Zwang | nur in Payload/URL (Ressource) | fehlt in strukturierten Logs; JWT enthält User serverintern | optional Kalibrierungssession (`calibration_sessions.py`) | fehlt | fehlt |
| REST: Zone/Subzone ACK-Pfad | gesetzt+weitergegeben für HTTP-Teil | gesetzt+weitergegeben in ACK-MQTT-Payloads wenn Firmware mitspielt; FIFO-Fallback ohne Payload-CID dokumentiert (siehe S11-Bericht) | fehlt | gesetzt+weitergegeben (esp/zone) | fehlt | context-abhängig (Config-Intent) | fehlt | gesetzt+weitergegeben wenn Broadcast `correlation_id` setzt |
| MQTT: sensor/telemetry ingest | nur in Logs als Alias: synthetische MQTT-CID in `ContextVar` (`subscriber`) | nur in Logs (generiert aus `esp_id`+Topic+`seq`); **nicht** zwingend identisch mit Payload-`correlation_id` falls vorhanden | fehlt | gesetzt+weitergegeben (Payload/Topic) | fehlt | fehlt typischerweise | nur in Logs (Firmware `LOG_D` msg_id) | nur in Logs / abgeleitet über Broadcast-Daten |
| MQTT: actuator command + response | Server-Publish: `intent_id`/`correlation_id` gekoppelt (`publisher.py`); Response: Contract-Kanonisierung inkl. synthetischer CID bei Fehlen (`device_response_contract.py`) | gesetzt+weitergegeben | fehlt | gesetzt+weitergegeben | fehlt | gesetzt+weitergegeben bei Publisher | fehlt in App-Payload | gesetzt+weitergegeben typisch über Daten/Envelope |
| MQTT: config push / ACK | HTTP-Request-ID nur für REST-Einstieg; auf MQTT übernommen als Intent/Correlation in Payloads | gesetzt+weitergegeben (Pflicht in Firmware-Queue-Logik) | fehlt | gesetzt+weitergegeben | fehlt | gesetzt+weitergegeben (Pending-Store) | fehlt | WS nach Verarbeitung |
| MQTT: intent_outcome / lifecycle | nur in Logs über gesetzte MQTT-CID im Handler | gesetzt+weitergegeben; fehlend → synthetisch `missing-corr:…` (`intent_outcome_handler.py`) | fehlt | gesetzt+weitergegeben | fehlt | gesetzt+weitergegeben; fehlend → Normalisierung | fehlt | Broadcast mit Correlation |
| MQTT: LWT / disconnect | nur in Logs | fehlt im dokumentierten LWT-Payload (`lwt_handler.py` Docstring — status/reason/timestamp) | fehlt | gesetzt+weitergegeben (Topic) | fehlt | fehlt | fehlt | gesetzt+weitergegeben über WS-Daten |
| WebSocket: Broadcast | nur in Logs wenn Kontext gesetzt | gesetzt+weitergegeben in Envelope wenn auflösbar (`manager.broadcast`) | fehlt | oft in `data` | fehlt | optional in `data` | fehlt | `correlation_id` Top-Level im Envelope |
| Background-Job (Scheduler, Retry) | gesetzt, bricht ab bei Jobs ohne explizites Setzen — oft `[-]` in Logs | context-abhängig | fehlt | falls Job Gerät kennt: nur in Logs/Message | fehlt | context-abhängig | fehlt | fehlt |
| Frontend: globaler API-Client | gesetzt+weitergegeben (`X-Request-ID` pro Request) | fehlt als Header (Operator nutzt REST-UUID; Business-CID separat in APIs) | fehlt | fehlt im Header | fehlt | nur wo API Body vorsieht | fehlt | WS separat vom Axios-Client |

**Hinweis `traceparent`:** Kein OpenTelemetry-Stack; **Server-REST** unterstützt optional W3C-`traceparent` (Durchreichen + JSON-Feld). Firmware/Frontend/MQTT bleiben ohne `traceparent`-Pflicht.

---

## C) Handshake & Vertrags-Abschluss

### Server ↔ Firmware

1. **Einstieg (Server → Gerät):** MQTT-Publish mit Payload-Feldern (`publish_actuator_command`, `publish_sensor_config`, …). Actuator/Sensor-Command: `correlation_id` und `intent_id` werden bei Vorhandensein gleichgesetzt (`mqtt/publisher.py` Zeilen 96–99, 135–140).
2. **Weitergabe:** Firmware spiegelt `correlation_id` in Responses/ACKs (`main.cpp`, `actuator_manager.cpp`, `config_update_queue.cpp`, `intent_contract.cpp`).
3. **Abschluss (terminal):** Server-Handler persistieren Outcomes / Events, loggen mit Handler-Logger; Intent-Outcome-Handler normalisiert fehlende Felder und schreibt Audit/Notifications (`intent_outcome_handler.py`). Firmware: `publishIntentOutcome` mit NVS-Outbox (`intent_contract.cpp`).
4. **Lücken:** (a) JSON unparsebar → kein Handler; Korrelation nur über ERROR-Zeile mit `mqtt_parse_fail_id` (nicht dieselbe Zeichenkette wie `generate_mqtt_correlation_id` nach erfolgreichem Parse). (b) Broker-`msg_id` erscheint nicht serverseitig in strukturierten Feldern. (c) Emergency-Pfad: siehe Inkonsistenzen / S11 — MQTT pro GPIO kann von Audit-`incident_correlation_id` abweichen.

### Server ↔ Frontend

1. **Einstieg:** Browser sendet `X-Request-ID` (UUID); Middleware übernimmt oder generiert (`request_id.py` ~46–54).
2. **Weitergabe:** `get_request_id()` in Logging/Audit; Fehler-Responses inkl. `request_id` (`exception_handlers.py`).
3. **Abschluss:** UI: Stores finalisieren Intents (`actuator.store` etc.); parallel Server-Logs mit ggf. `[-]` wenn Pfad nicht HTTP ist. Frontend-Fehler werden teils an Server gespiegelt (`frontend.error` Logger) — **ohne** automatische HTTP-Request-ID in derselben Zeile.
4. **Lücken:** WebSocket-Nachrichten tragen nicht automatisch die UUID der ursprünglichen Benutzeraktion, sofern nicht explizit in Domain-Payload enthalten; Operator muss `correlation_id` aus WS oder Audit-API nutzen.

---

## D) Error-Codes & Logs

### Inventar (Auswahl)

| Bereich | Ort |
|---------|-----|
| Firmware | `El Trabajante/src/models/error_codes.h` |
| Server | `El Servador/god_kaiser_server/src/core/error_codes.py` |
| Referenz | `.claude/reference/errors/ERROR_CODES.md` |
| Frontend | `El Frontend/src/utils/errorCodeTranslator.ts` (Kategorien/Labels), `parseApiError.ts` / `GodKaiserException`-Mapping |

### `failure_class` (Zielbild vs. IST)

**IST:** Begriff **`failure_class`** kommt im Repo-Code **nicht** vor (rg: keine Treffer). Klassifikation erfolgt implizit über Logger-Namen, numerische Codes und Metriken (z. B. `god_kaiser_mqtt_errors_total`, `CONTRACT_*`).

### Zehn repräsentative ERROR-Muster aus Loki (anonymisiert / typisiert)

**Abfrage:** `powershell -ExecutionPolicy Bypass -File scripts/loki-query.ps1 errors 120`  
**LogQL-Basis:** `{compose_service=~".+"} | level="ERROR"` (vgl. `docs/debugging/logql-queries.md`).

| # | Stück Log (gekürzt) | Bewertung |
|---|---------------------|-----------|
| 1 | `subscriber` — `Invalid JSON payload topic=kaiser/... mqtt_parse_fail_id=parse-fail:…` | **synthetische ID in der Zeile** — Korrelation über `mqtt_parse_fail_id` / `parse-fail:`; ContextVar vor Handler weiterhin unset (`[-]` in strukturierten Feldern). |
| 2 | `intent_outcome_lifecycle_handler` — `Invalid ... payload: Missing event_type` | **verwässert:** Topic/Pfad nicht in jeder Zeile; gleiches `[-]`. |
| 3 | `frontend.error` — `[PromiseRejection] ... chartjs-plugin-annotation` | **ohne Request-Kette:** Client-Bug; keine MQTT/REST-Correlation in derselben Logzeile. |
| 4 | `subscriber` ERROR bei Routing-Exception (`Error routing message from {topic}`) | Kann `exc_info` haben — **teilweise brauchbar** mit Topic-String. |
| 5 | Sensor-/Handler-ERROR mit `esp_id=` in Message (laut Doku Query 7) | **vollständiger Kontext** wenn Logger formatiert. |
| 6 | HTTP 5xx mit strukturiertem JSON-Body in Audit | **request_id** vorhanden — **gut** für REST. |
| 7 | MQTT publish failure logs (`publisher`) | **Gerät** im Text; **kein** einheitliches `failure_class`. |
| 8 | DB/Postgres errors (Query 6) | **fehlt** oft explizite Business-CID. |
| 9 | Mosquitto disconnect logs | **nur Transport**; keine App-`correlation_id`. |
| 10 | ESP serial `error_code` in Metadata (Alloy) | **gut** für Gerät, aber **kein** automatischer Join zu Server-`request_id`. |

**Level-Hinweis:** Viele erwartbare Contract-Verletzungen erscheinen als **ERROR** (z. B. invalid lifecycle payload) — Diskussion „expected path“ vs. Severity lohnt sich für Roadmap, ist aber IST so.

---

## E) Metriken

**Prometheus (Server):** `El Servador/god_kaiser_server/src/core/metrics.py` — u. a. `god_kaiser_mqtt_messages_total`, `god_kaiser_mqtt_errors_total`, `WS_*`, `CONTRACT_*`, `CONFIG_INTENTS_*`, `INTENT_OUTCOME_*`, `API_ERROR_CODE_COUNTER` (mit `numeric_code`-Label laut Verwendung in Exception-Handling).

**Join Log ↔ Metrik:**

- **Strategie IST:** Kein gemeinsames `trace_id`-Label. Join nur indirekt über Zeitfenster, `esp_id` in Logzeilen und Prometheus-Serien ohne Hochkardinalitäts-Labels (ESP-Aggregate).
- **Kardinalitätssichere Fehler-MQTT:** Ja — `MQTT_ERRORS_TOTAL` ohne pro-Message-IDs.
- **Contract-Rejects:** Ja — u. a. `HEARTBEAT_CONTRACT_REJECT_TOTAL`, `WS_CONTRACT_MISMATCH_TOTAL`, `CONTRACT_TERMINALIZATION_BLOCKED_TOTAL`.
- **WS-Fehler:** Teilweise — Disconnect-Zähler, Envelope-Divergenz; einzelne UI-Fehler nicht immer als Metrik.

---

## F) Grafana

- **Dashboards:** Provisioning unter `docker/grafana/provisioning/dashboards/` (`system-health.json`, `debug-console.json`). **Operations-Dashboard:** u. a. MQTT-Verarbeitungsfehler (`god_kaiser_mqtt_errors_total`) und WS-Contract-Mismatch (`god_kaiser_ws_contract_mismatch_total`) als Zeitreihen (siehe Panels nach „MQTT Message Rate“).
- **Alerts:** Prometheus `alert-rules.yml` (32 Regeln, Kommentar in `loki-alert-rules.yml`); Loki-Regeln mit `for: 2m`, `noDataState: OK` wo angegeben.
- **False-Positive-Risiko:** Kommentar in `loki-alert-rules.yml` zu **Frontend Down** (deaktiviert wegen Vite-Log-Loch). Für Sensor-Schwellen: Dokumentation in Auftrag empfiehlt Glättung — **IST** abhängig von konkreten Prometheus-Regeln (nicht jede Regel hier zeilenweise geprüft).

---

## G) Wokwi & SIL

- **Gleiche Correlation-Felder wie Hardware?** **Ja, im Prinzip** — Firmware-Codepfade (`intent_contract`, `mqtt_client`, Config-Queue) sind identisch zur Hardware-Build; Unterschiede entstehen durch Laufzeit (z. B. fehlende NTP: Server akzeptiert `ts<=0`, siehe Kommentar `sensor_handler.py`).
- **Blocker / Tooling:** Self-Hosted Wokwi laut `docs/wokwi-self-hosted-evaluation.md` **nicht** Standard-Pro; SIL läuft über Cloud/Wokwi-CI — lokale Reproduktion kann an Plan/Tokens scheitern. **Serial-Logger-Service** in Alloy-Pipeline vorgesehen — in der geprüften `docker compose ps`-Ausgabe war kein `esp32-serial-logger` aktiv; Correlation Serial→Loki dann nur wenn dieser Service im Stack läuft.

---

## H) Risiko-Register (No-Breaking-Ausgang)

| Änderung (Vorschlag) | Breaking? | Migrations-/Kompat-Strategie |
|----------------------|-----------|------------------------------|
| Neues Feld `traceparent` optional in MQTT-Payloads | Nein, wenn optional | Feature-Flag / Version-Feld; Firmware ignoriert Unbekanntes |
| Umbenennung `ContextVar` MQTT vs REST | Ja für Ops/Runbooks | Nur mit Übergangsphase und Doc-Update |
| `failure_class` in Logs ergänzen | Nein | Zusatzfeld, alte Parser ignorieren |
| Loki-Label für `correlation_id` | **Ja (Betrieb)** | Label-Explosion — stattdessen Structured Metadata oder `|=` |
| Pflicht `correlation_id` in LWT-Payload | Potenziell Ja für Firmware/Server | Major + koordiniertes Release |

---

## I) Empfohlene Follow-up-Aufträge (max. 8)

**Dokumentation**

1. **„Correlation ID Playbook“** — Akzeptanz: (1) Ein Abschnitt REST vs MQTT-CID Namensschema, (2) Copy-Paste LogQL für drei Szenarien, (3) Verweis auf `request_context.py` + `subscriber.py`.

**Server**

2. ~~**Parse-Error-Correlation**~~ — **Stand 2026-04-10 erfüllt:** (1) `JSONDecodeError` → Logzeile mit Topic + `mqtt_parse_fail_id=parse-fail:…`, (2) `tests/unit/test_mqtt_correlation.py`, (3) kein Handler vor Parse.

3. ~~**Optional `traceparent` in REST-Middleware**~~ — **Stand 2026-04-10 erfüllt:** (1) Header-Durchreichung + Response, (2) JSON-Logfeld `traceparent` wenn gesetzt, (3) keine MQTT-Pflicht (`middleware/request_id.py`, `logging_config.py`).

**Firmware**

4. **Dokumentierte Serial-Beispielsequenz** — Akzeptanz: (1) Ein Markdown mit Boot→Connect→Publish und Beispielzeilen **ohne** Secrets, (2) Verweis auf `seq`/`correlation_id`-Felder, (3) CI-Check optional.

**Frontend**

5. **WS↔REST-Korrelation im Debug-Panel** — Akzeptanz: (1) Letzte `X-Request-ID` sichtbar in Dev-only Panel oder Log, (2) Vitest für Helper, (3) Keine PII.

**Observability**

6. ~~**Alloy: `correlation_id` Structured Metadata**~~ — **Stand 2026-04-10 erfüllt:** (1) Zusatz-`stage.regex` auf `message` mit Wortgrenze (`\bcorrelation_id=…`) + Structured Metadata in `docker/alloy/config.alloy` (kein Loki-Label), (2) Beispiel in `docs/debugging/logql-queries.md` § Structured Metadata, (3) Hochkardinalität nur als Metadata, nicht als Label (unverändert Risiko-Register H).

7. ~~**Dashboard Panel: MQTT errors / Contract counters**~~ — **Stand 2026-04-10 erfüllt:** (1) Timeseries `sum by (direction) (rate(god_kaiser_mqtt_errors_total[5m]))` (Label `direction` aus `metrics.py`), (2) `rate(god_kaiser_ws_contract_mismatch_total[5m])` für `WS_CONTRACT_MISMATCH_TOTAL`, (3) `docker/grafana/provisioning/dashboards/system-health.json` (Panels id 105/106).

8. **`failure_class` Pilot** — Akzeptanz: (1) 3 Handler markieren Klasse im JSON-Log, (2) Beispiel-LogQL, (3) Review gegen PII.

---

## Abgleich mit bestehenden Ziel-Repo-Aufträgen (`.claude/auftraege/`)

| Auftrag (Dateiname) | Was der Auftrag fordert | IST erfüllt / teilweise / offen |
|----------------------|-------------------------|----------------------------------|
| `analyseauftrag-server-epic1-vertrag-korrelation-ist-verdrahtung-2026-04-05.md` | Vollständige Server-Ist-Landkarte Epic 1 (Actuator, Emergency, FIFO) | **teilweise** — vorliegender Bericht bestätigt Correlation/ContextVar-Muster; Detailtiefe Epic-1-Report separat einholen |
| `Auto_One_Architektur/integration/analyse-und-fixauftrag-bereich-c-server-randhaertung-envelope-trace-callsites-2026-04-04.md` | Envelope/Trace an Server-Rändern | **offen** (Fixauftrag; technische Trace-IDs weiterhin nicht Standard) |
| `Auto_One_Architektur/frontend/.../auftrag-frontend-F05-websocket-realtime-contract-2026-04-05.md` | WS-Realtime-Contract | **teilweise** — WS-Metriken + `correlation_id` im Manager vorhanden; vollständige Finalität über alle Events nicht hier verifiziert |
| `Auto_One_Architektur/esp32/paket-06-esp32-observability-und-reconciliation-contract.md` | FW-Observability-Felder | **teilweise** — Firmware hat `correlation_id`/Outcomes; alle SOLL-Events aus Paket-06 nicht Gegenstand dieses IST-Schnitts |
| `Auto_One_Architektur/server/report-server-S11-e2e-command-actuator-2026-04-05.md` | E2E Command/Actuator Risiken | **erfüllt** (Inhalt deckt sich mit IST: FIFO-ACK, Emergency-Lücke) — als **Wissensbasis** nutzen |
| `auftrag-analyse-integrationsluecken-frontend-gesamtsystem-2026-04-05.md` | Frontend Integrationslücken inkl. Intent-State | **teilweise** — Stores nutzen `correlationId`; Lückenliste des Auftrags nicht vollständig abgearbeitet |
| `auftrag-analyse-integrationsluecken-esp32-gesamtsystem-2026-04-05.md` | Cross-Layer Contracts ESP | **teilweise** — bestätigt Top-level vs Envelope-Thema existiert |

---

## Inkonsistenzen (≥5, mit Evidence)

1. **Gleicher Name, unterschiedliche Semantik:** `request_context.py` beschreibt explizit REST-UUID **und** MQTT-Format im selben `ContextVar` — Kommentar Zeilen 7–9 vs. `generate_mqtt_correlation_id` Zeilen 41–56.
2. **JSON-Fehler vs. Payload-CID:** `subscriber._route_message` ruft `generate_mqtt_correlation_id` erst nach erfolgreichem Parse auf; bei `JSONDecodeError` gibt es **keine** Payload-CID, aber eine **eigene** synthetische `mqtt_parse_fail_id` in der ERROR-Message (nicht identisch mit dem MQTT-CID-Schema nach Parse).
3. **Actuator-Log ohne CID:** `publish_actuator_command` loggt nur ESP/GPIO/Command — Zeilen 103–105, **`correlation_id` fehlt in Log-Message** trotz Payload.
4. ~~**Alloy-Kommentar vs. Realität**~~ — **Stand 2026-04-10:** `docker/alloy/config.alloy` extrahiert optionales `correlation_id` aus der Lognachricht (Structured Metadata, nicht als Label); nicht jede Zeile enthält ein solches Feld — Parallelnutzung von `request_id`-Metadata (REST-UUID vs. MQTT-CID) bleibt semantisch zu prüfen (`correlation-id-playbook.md`).
5. **LWT-Doc ohne Correlation:** `lwt_handler.py` Docstring Zeilen 64–69 — Payload ohne `correlation_id`; Offline-Ereignis nur über Topic/`esp_id` verknüpfbar.
6. **Frontend globaler UUID vs. Server-Antwort:** `index.ts` generiert pro Request neue UUID Zeilen 27–29; Middleware kann Header **vom Client** übernehmen (`request_id.py` 46–51) — bei bewusster Wahl des Clients konsistent, sonst **zwei** IDs im Spiel (Client vs. Server-Log wenn Server neu generiert hätte — hier: Server nimmt Client-ID wenn gesendet).

---

## Laufzeit / Methodik (durchgeführt)

- **Docker:** `docker compose --profile monitoring ps` — Stack inkl. Loki, Grafana, Alloy, Prometheus, `el-servador`, `el-frontend`, MQTT aktiv (Stand Analyse).
- **Normalbetrieb:** Container liefen >1h laut Metadaten; kontinuierliche Logs vorhanden.
- **Fehlerpfad:** Bereits in Loki: ungültiges JSON auf `intent_outcome`, invalides `intent_outcome/lifecycle` (stützt Analyse ohne zusätzlichen Produktiv-Traffic).
- **Firmware Serial:** In dieser Session kein frischer Wokwi-/Hardware-Capture; Evidence aus Firmware-Quellcode (`El Trabajante/src/services/communication/mqtt_client.cpp`, `El Trabajante/src/tasks/intent_contract.cpp`). **Beispielsequenz Boot → Connect → Publish** (inkl. `seq` / `boot_sequence_id` / `correlation_id`): `docs/debugging/firmware-serial-boot-connect-publish.md`.
- **Frontend:** Code-Evidence für `X-Request-ID`; Netzwerk-Tab-Verifikation durch Nutzer empfohlen als Routine-Check.

---

## Breaking Changes: keine

Dieses Dokument ist **reine Analyse**; es wurden **keine** produktiven APIs, Topics oder DB-Schemas geändert. Potenziell breaking wären erst **Umsetzungen** aus Abschnitt H ohne Freigabe/Migration.
