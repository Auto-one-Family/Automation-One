# VERIFY-PLAN-REPORT — INC-2026-04-20-offline-mode-observability-hardening (GATE 1)

> **Skill:** `.claude/skills/verify-plan/SKILL.md` — Reality-Check von `TASK-PACKAGES.md` gegen Repo-Ist.
> **Gate:** 1 von 2 (User-Anforderung: zweiter Gate-Check vor Implementierung).
> **Eingabe:** `TASK-PACKAGES.md` (Initial, 8 Pakete).
> **Ausgabe:** Diese Datei + Pflicht zur Mutation von `TASK-PACKAGES.md` vor Gate 2.
> **Branch:** `auto-debugger/work`.

---

## A. Vorab-Verifikation Code-Anker (aus Bericht 2026-04-20)

| Code-Anker aus Bericht | Repo-Pfad | Stichprobe (Zeile + Befund) | Status |
|------------------------|-----------|------------------------------|--------|
| `conflict_manager.py` Konfliktlogik | `El Servador/god_kaiser_server/src/services/logic/safety/conflict_manager.py` | L29 `FIRST_WINS = "first_wins"`; L241,249 `resolution = ConflictResolution.FIRST_WINS`; L252 `Conflict on {actuator_key}: {rule_id} blocked by ...`; L262 `message=f"Conflict on {actuator_key}: {resolution.value}"` | **PASS** |
| `publish_queue.cpp` Queue-Counter + 4062 | `El Trabajante/src/tasks/publish_queue.cpp` | L13 `g_pq_shed_count`; L14 `g_pq_drop_count`; L40-41 stats-Export; L102,104 Drop + 4062; L133 Shed; L157-159 Drop + 4062 | **PASS** |
| `mqtt_client.cpp` Outbox + drop_code | `El Trabajante/src/services/communication/mqtt_client.cpp` | L637-638 `MQTT Outbox full, message dropped`; L1134 `drop_code = (msg_id == -2) ? "PUBLISH_OUTBOX_FULL" : "EXECUTE_FAIL"`; L1409 Payload-Export; L1414-1417 Heartbeat-Felder `publish_queue_fill/hwm/shed/drop` | **PASS** |
| `config_handler.py` Terminal-Authority | `El Servador/god_kaiser_server/src/mqtt/handlers/config_handler.py` | L138 `_build_terminal_authority_key`; L147 `upsert_terminal_event_authority`; L162 `if was_stale:`; L168 `Skipping stale config_response due to terminal authority guard` | **PASS** |
| `device_response_contract.py` correlation canonicalisation | `El Servador/god_kaiser_server/src/services/device_response_contract.py` | L141-147 Fallback `request_id`; L148-155 Synthetic `missing-corr:cfg:...`; L260-263 Synthetic `missing-corr:act:...` | **PASS** |
| `actuator.store.ts` handleConfigResponse | `El Frontend/src/shared/stores/actuator.store.ts` | L39 `correlation_id?`; L146-147 Timeout-Konstanten; L336 `notifyContractIssue`; L420 Timeout-Config; L875 `handleConfigResponse`; L881-901 Match-Logik | **PASS** |
| `esp32_error_mapping.py` 4062 Mapping | `El Servador/god_kaiser_server/src/core/esp32_error_mapping.py` | L1613-1626 `4062 {"category":"APPLICATION","severity":"WARNING","message_de":"FreeRTOS Task-Queue voll", ...}` | **PASS** |

**Fazit Abschnitt A:** Alle sieben Code-Anker aus dem Bericht sind repo-konsistent. Der Plan kann sich auf konkrete Zeilen stuetzen.

---

## B. PKG-weise Plan↔Code-Abgleich

### PKG-01 — Queue-Pressure als Betriebszustand

**Plan-Aussage:** Neuer MQTT-Handler `queue_pressure_handler.py` analog zu `error_handler.py`, Topic `system/queue_pressure`.

**Repo-Ist:**
- Handler-Verzeichnis `El Servador/god_kaiser_server/src/mqtt/handlers/` existiert, inkl. `error_handler.py` (Referenz-Pattern).
- TopicBuilder in `El Servador/god_kaiser_server/src/mqtt/topics.py` hat **keine** `build_queue_pressure_topic` / `parse_queue_pressure_topic` Methoden — **muss ergaenzt werden**.
- `parse_system_error_topic` (L620-641) ist das Muster fuer den Parser.
- Heartbeat-Payload enthaelt bereits `publish_queue_fill/hwm/shed/drop` (L1414-1417 mqtt_client.cpp), aber **im Server-Handler** `heartbeat_handler.py` werden diese Felder **nicht konsumiert** (Grep in `El Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py` = 0 Matches).

**Deltas (Gate-1-Findings):**

| # | Befund | Konsequenz fuer Plan |
|---|--------|----------------------|
| D-01-1 | TopicBuilder muss erweitert werden: `build_queue_pressure_topic(esp_id, kaiser_id="god")` + `parse_queue_pressure_topic(topic)`. | PKG-01 Owner `mqtt-dev` und `server-dev` greifen ineinander — in SPECIALIST-PROMPTS nach Gate 2 klar abgrenzen. |
| D-01-2 | Heartbeat-Handler konsumiert die Queue-Telemetrie aktuell nicht. Falls das PKG **ohne** neues Topic auskommen soll, kann Option 2 "Heartbeat-Telemetrie persistieren" die Alternative sein. | **Splitten:** PKG-01a (neues Topic + Handler) vs. PKG-01b (Heartbeat-Feld-Konsum erweitern). |
| D-01-3 | Neue Tabelle `esp_queue_pressure_events` wurde im Plan nur "falls noetig" erwaehnt. Eine Alembic-Migration ist laut `forbidden` in diesem Lauf nicht erlaubt. | **Entscheidung:** Keine neue Tabelle. Persistenz in bestehende `mqtt_errors` mit `subcategory=QUEUE_PRESSURE` ODER nur In-Memory-Metric via `core/metrics.py`. |
| D-01-4 | `core/metrics.py` existiert — ist bereits Prometheus-Metric-Pfad; natuerlicher Ablageort fuer Queue-Metrics. | Option 3: Prometheus-Gauge `esp_publish_queue_pressure{esp_id, level}` — **bevorzugt**, weil ohne DB-Migration. |

**BLOCKER-Codes fuer PKG-01:**

- `B-QP-TOPIC-01`: TopicBuilder-Erweiterung fehlt — muss im Dispatch explizit an `mqtt-dev` + `server-dev` delegiert werden, nicht doppelt.
- `B-QP-PERSIST-01`: Persistenz-Strategie (Tabelle vs. Prometheus vs. bestehende Error-Pipeline) **offen** — Robins Entscheidung vor Dispatch.

**Empfohlene Mutation:** PKG-01 in PKG-01a (Firmware Event-Emitter) + PKG-01b (Server Telemetrie-Konsum via Prometheus/Error-Pipeline) splitten.

---

### PKG-02 — Rule-Arbitration-Log-Labels

**Plan-Aussage:** Log-Erweiterung in `conflict_manager.py:252,262`.

**Repo-Ist:**
- L252 `logger.warning(f"Conflict on {actuator_key}: {rule_id} blocked by {existing_lock.rule_id} (lower priority {new_prio} vs {existing_prio})")` — **String-Interpolation mit f-string**.
- L262 `message=f"Conflict on {actuator_key}: {resolution.value}"` — nicht Logger-Output, sondern Error-Event-Message.

**Deltas:**

| # | Befund | Konsequenz |
|---|--------|------------|
| D-02-1 | Aktuelle Logger-Line ist f-string -> Log-Parser (Loki/Grafana) koennen regex-basiert matchen. Additive Felder via **structured logging** (extra-dict) empfohlen statt reiner f-string-Erweiterung. | In Spezialisten-Prompt explizit `logger.warning(... , extra={"event_class": "RULE_ARBITRATION", "result": "expected", ...})` anweisen. Ruff+Logger-Config pruefen. |
| D-02-2 | `logger` in `conflict_manager.py` aktuell ohne `get_logger(__name__)` (vor-verifiziert via Grep noetig). | Pre-Check: `Grep 'get_logger' conflict_manager.py` vor Implementierung. Als BLOCKER `B-LOG-API-01` markieren bis geklaert. |

**BLOCKER-Codes:**
- `B-LOG-API-01`: Logger-API in `conflict_manager.py` vor Aenderung verifizieren.

**Empfohlene Mutation:** PKG-02 um `extra={}`-Ansatz konkretisieren.

---

### PKG-03 — End-to-End-Latenzmarker

**Plan-Aussage:** Timestamps `t_command_ms`, `t_applied_ms`, `t_published_ms`, `t_rendered_ms` cross-layer.

**Repo-Ist:**
- Firmware Heartbeat hat `esp_timer_get_time()`-Zugriff (monotonic us).
- Server-Side Intent-Pipeline in `src/services/` hat Async-Pfade — `datetime.now(timezone.utc)` ist laut `api-rules.md` Abschnitt 7 verpflichtend.
- Frontend `actuator.store.ts` hat `logger.error`/`logger.warn` mit strukturierten Feldern.

**Deltas:**

| # | Befund | Konsequenz |
|---|--------|------------|
| D-03-1 | "DEBUG_LATENCY" Flag war als Build-Flag vorgeschlagen — in PlatformIO `build_flags` in `platformio.ini` zu ergaenzen. | In SPECIALIST-PROMPT explizit `platformio.ini`-Pfad nennen. |
| D-03-2 | Payload-Groesse unter Burst-Druck kritisch — bereits in PKG-01 relevant (Queue-Pressure). Optional-Felder nur in DEBUG ist korrekt. | Kein Delta. |
| D-03-3 | Server-Timestamp-Konvention: **immer** `datetime.now(timezone.utc)` (api-rules.md). Keine naive Timestamps, keine `utcnow()`. | In SPECIALIST-PROMPT als "Timezone-Pflicht" vermerken. |
| D-03-4 | Abhaengigkeit zu PKG-01: Gemeinsame Event-Klassen-Konvention (STATE_EMIT, QUEUE_PRESSURE). Wenn PKG-01 gesplittet wird (siehe D-01-2), dann in PKG-03 explizit auf PKG-01a referenzieren. | Mutation notwendig. |

**BLOCKER-Codes:** keine harten BLOCKER.

**Empfohlene Mutation:** PKG-03 Owner-Liste um `mqtt-dev` (Event-Konvention-Abstimmung mit PKG-01) ergaenzen; Timezone-Pflicht als Akzeptanzkriterium.

---

### PKG-04 — Config-Correlation robust

**Plan-Aussage:** Server emittiert `config.terminal_guard` WS-Event; FE macht Soft-Match.

**Repo-Ist:**
- `config_handler.py:162-168` hat frueh-return vor WS-Broadcast-Teil. **Vor** dem Early-Return gibt es bereits eine korrekte Persistenz (`upsert_terminal_event_authority`).
- Es existiert `El Servador/.../websocket/manager.py` fuer WS-Broadcasts (ggf. exakter Pfad `src/websocket/manager.py` — in PKG-Doc noch nicht konkretisiert).
- Frontend `actuator.store.ts` hat dediziertes Event-Routing (WS-Subscription), zu finden im gleichen Modul.

**Deltas:**

| # | Befund | Konsequenz |
|---|--------|------------|
| D-04-1 | Exakter Pfad des WS-Managers muss verifiziert werden. Name in bestehenden Incident-Notes: `websocket/manager.py:225-233`. | Pre-Check: Grep `broadcast|ws_manager` im Server. Wenn andere Convention (`notify`, `dispatch`), anpassen. |
| D-04-2 | Frontend Soft-Match-Policy: "pending count == 1 fuer esp_id+config_type" — muss gegen parallele Multi-Config-Updates (z.B. mehrere Offline-Rules) robust sein. | Akzeptanzkriterium erweitern: Unit-Test mit 2 gleichzeitigen Config-Updates auf gleichem Paar -> fallback auf Contract-Issue. |
| D-04-3 | `websocket-events.ts` (Frontend) typt WS-Events. Neuer Event-Typ `config.terminal_guard` muss dort hinzugefuegt werden. | Pfad in SPECIALIST-PROMPT ergaenzen: `El Frontend/src/.../websocket-events.ts` (Einheitspfad aus TM-Notizen: `El Frontend/src/.../websocket-events.ts:84-99`). |
| D-04-4 | `correlation_id_source` als neues Feld: FE muss Default-Handling haben (unbekannt -> wie bisher). | Nur als additives Feld, kein Breaking Change. |

**BLOCKER-Codes:**
- `B-WS-PATH-01`: WS-Manager-Pfad verifizieren.
- `B-FE-WS-TYPE-01`: `websocket-events.ts` Typen-Erweiterung ohne any-Cast.

**Empfohlene Mutation:** PKG-04 in PKG-04a (Server-WS-Event + correlation_id_source) + PKG-04b (FE Soft-Match + TS-Typen) splitten.

---

### PKG-05 — Healthcheck-Filter Monitoring

**Plan-Aussage:** Loki-Pipeline-Config Label `healthcheck=true`.

**Repo-Ist:**
- Loki-Config-Pfad unbekannt, Annahme: `infra/monitoring/loki/` oder `docker/loki/`.

**Deltas:**

| # | Befund | Konsequenz |
|---|--------|------------|
| D-05-1 | Loki-Config-Pfad nicht verifiziert. | BLOCKER `B-MON-PATH-01`: User-Aktion bzw. Repo-Search vor Dispatch. |
| D-05-2 | Grafana-Panel-Default filter muss in Dashboard-JSON editiert werden (in Repo einchecken, nicht nur runtime). | Mutation: Scope erweitern um Dashboard-JSON. |

**BLOCKER-Codes:**
- `B-MON-PATH-01`: Loki/Grafana-Config-Pfad im Repo bestaetigen.
- `B-USER-DOCKER-01`: Broker-Neustart / Grafana-Reload ausserhalb Claude-Sandbox.

**Empfohlene Mutation:** PKG-05 explizit mit "User-Aktion erforderlich" markieren und Scope auf Repo-Config-Dateien begrenzen.

---

### PKG-06 — Stale-Guard expected_guard Label

**Plan-Aussage:** Log-Format `CONFIG_GUARD action=skip_stale_response status=expected ...`.

**Repo-Ist:**
- `config_handler.py:168` — aktuelles Log-Level ist `logger.info` (aus dem Grep-Treffer — muss final bestaetigt werden; meist `info` bei Idempotenz-Pfaden).

**Deltas:**

| # | Befund | Konsequenz |
|---|--------|------------|
| D-06-1 | Log-Level bereits INFO vermutet — wenn ja, kein Level-Change, nur Format-Aenderung. | Vor Gate 2 verifizieren: `Read config_handler.py L162-175`. |
| D-06-2 | Structured-Logging-Ansatz konsistent mit PKG-02. | Harmonieren in SPECIALIST-PROMPTS-Konsolidierung. |

**BLOCKER-Codes:** keine.

**Empfohlene Mutation:** Log-Level-Verifikation in Akzeptanzkriterien als Pre-Check.

---

### PKG-07 — 4062 semantisch schaerfen

**Plan-Aussage:** `subcategory=MQTT_PUBLISH_BACKPRESSURE` im Mapping.

**Repo-Ist:**
- `esp32_error_mapping.py:1613-1626` — aktuelle Keys: `category, severity, message_de, message_user_de, troubleshooting_de, docs_link, recoverable, user_action_required`.
- **Neues Feld** `subcategory` existiert vermutlich **nicht** als Standard-Schluessel — Snapshot-Tests / Consumer pruefen (z.B. UI, Alerting).

**Deltas:**

| # | Befund | Konsequenz |
|---|--------|------------|
| D-07-1 | Neues Dict-Feld `subcategory` — Frontend/Consumer muessen es tolerieren (Default-Handling). | Pre-Check: `Grep "subcategory" El Frontend/src/`. Falls 0 Matches: nur Backend-Erweiterung. |
| D-07-2 | `troubleshooting_de` aendert den Text — Doku/Helpcenter-Referenz pruefen. | Mutation: Troubleshooting als Mergeable (alte Zeilen behalten, neue Publish-Kontext-Zeilen anhaengen). |

**BLOCKER-Codes:** keine.

**Empfohlene Mutation:** Akzeptanzkriterium ergaenzen: Snapshot-Test fuer Error-Mapping-Dict (key-stability).

---

### PKG-08 — Mosquitto max_packet_size

**Plan-Aussage:** Broker-Config migrieren.

**Repo-Ist (verifiziert):**
- Mosquitto-Config tatsaechlich an `docker/mosquitto/mosquitto.conf:79`: `message_size_limit 262144`.
- Zusaetzlich `/.github/mosquitto/mosquitto.conf` vorhanden (vermutlich CI-Version).
- Mehrere dev-Varianten: `mosquitto_fix.conf`, `mosquitto_full_logging.conf`, `mosquitto_minimal.conf` unter `El Servador/god_kaiser_server/` (Dev-Artefakte, nicht Produktion).

**Deltas:**

| # | Befund | Konsequenz |
|---|--------|------------|
| D-08-1 | Mehrere Config-Dateien — Migration muss konsistent ueber alle aktiven Pfade erfolgen (mindestens `docker/mosquitto/mosquitto.conf` und `.github/mosquitto/mosquitto.conf`). | Scope erweitern: alle Produktion/CI-Configs. |
| D-08-2 | Broker-Version im Container bestimmt ob `max_packet_size` unterstuetzt wird (2.0+). | Pre-Check: `docker inspect` fuer Broker-Image-Tag (User-Aktion). |

**BLOCKER-Codes:**
- `B-MQTT-VERSION-01`: Broker-Version (2.0+) verifizieren vor Migration.
- `B-USER-DOCKER-01` (gemeinsam mit PKG-05).

**Empfohlene Mutation:** Scope um zweite Config-Datei erweitern, Broker-Version als Pre-Check.

---

## C. Querschnittliche BLOCKER (zusammengefasst)

| Code | Scope | Was zu tun | Owner |
|------|-------|------------|-------|
| `B-QP-TOPIC-01` | PKG-01 | TopicBuilder-Pfad/-Registrierung abstimmen | mqtt-dev + server-dev |
| `B-QP-PERSIST-01` | PKG-01 | Persistenz-Strategie waehlen (Prom vs. mqtt_errors vs. neue Tabelle) — **User-Entscheidung vor Dispatch** | Robin |
| `B-LOG-API-01` | PKG-02 | Logger-API in `conflict_manager.py` verifizieren | server-dev (Pre-Check im Prompt) |
| `B-WS-PATH-01` | PKG-04 | WS-Manager-Pfad verifizieren | server-dev |
| `B-FE-WS-TYPE-01` | PKG-04 | `websocket-events.ts` typen-erweitern ohne any | frontend-dev |
| `B-MON-PATH-01` | PKG-05 | Loki/Grafana-Config-Pfad im Repo suchen | server-dev (Pre-Check) |
| `B-USER-DOCKER-01` | PKG-05, PKG-08 | Docker-Aktionen (Neustart, Config-Reload) ausserhalb Sandbox | Robin |
| `B-MQTT-VERSION-01` | PKG-08 | Broker-Version (2.0+) verifizieren | Robin / mqtt-dev |

---

## D. HW-Evidence-Gaps

| Gap | Was fehlt | Empfehlung |
|-----|-----------|------------|
| HW-01 | Kein aktueller Dauerlauf-Log zur Quantifizierung der "wahrgenommenen 5-10s Differenz". Bericht basiert auf 10-Min-Fenster 2026-04-20 17:02. | Nach PKG-03 (Latenzmarker) einen 10-Min-Dauerlauf mit aktivierten Timestamps ziehen, Evidence unter `logs/`. |
| HW-02 | Queue-Pressure-Hysterese (`fill > 0.8 * capacity`) ist Schaetzwert. | PKG-01a Akzeptanzkriterium: Threshold empirisch aus 2-3 Dauerlauf-Samples validieren, dokumentieren. |
| HW-03 | Mosquitto-Broker-Version-Bestaetigung fehlt. | User-Aktion: `docker inspect automationone-mqtt | grep -i image` -> `.claude/reports/current/incidents/INC-2026-04-20-offline-mode-observability-hardening/logs/broker-image.txt`. |

---

## E. Breaking-Change-Check

| PKG | Aenderung | Breaking? |
|-----|-----------|-----------|
| PKG-01 | Neues Topic `system/queue_pressure` (additiv) | Nein (abonniert nur Server-Handler, den wir selbst anlegen) |
| PKG-02 | Log-Feld-Erweiterung | Nein (Log-Parser-kompatibel wenn Prefix erhalten) |
| PKG-03 | Optionale Timestamp-Felder in bestehenden Payloads | Nein (optional, Consumer ignorieren unbekannte Felder) |
| PKG-04 | Neuer WS-Event `config.terminal_guard`; Feld `correlation_id_source` | Nein (additiv) |
| PKG-05 | Loki-Labels | Nein |
| PKG-06 | Log-Level evtl. unveraendert, Format erweitert | Nein |
| PKG-07 | Dict-Feld `subcategory`; geaendertes `message_user_de` | **MINOR** — UI muss tolerieren; Verify durch Grep in FE |
| PKG-08 | Broker-Directive-Rename (semantisch gleich) | Nein (bei Version 2.0+; sonst BLOCKER) |

---

## F. OUTPUT FUER ORCHESTRATOR (auto-debugger) — Chat-Block

```
VERIFY-PLAN GATE 1 — INC-2026-04-20-offline-mode-observability-hardening

SUMMARY: 8 Pakete geprueft, 4 empfohlene Mutationen, 8 BLOCKER-Codes, 0 harte Plan-Code-Bruchstellen.

MUTATIONEN (pflicht vor Gate 2):
  - PKG-01 splitten -> PKG-01a (Firmware Event-Emitter) + PKG-01b (Server Telemetrie-Konsum).
  - PKG-04 splitten -> PKG-04a (Server-WS + correlation_id_source) + PKG-04b (FE Soft-Match + TS-Typen).
  - PKG-02 auf structured logging mit extra={} konkretisieren; Pre-Check Logger-API.
  - PKG-05, PKG-08 Scope erweitern (zweite Config-Datei, Broker-Version-Gate).

PERSISTENZ-ENTSCHEIDUNG OFFEN:
  - PKG-01b Persistenz-Strategie (Prometheus-Metric bevorzugt, weil kein Alembic).
  -> VOR DISPATCH Robins Entscheidung einholen.

USER-AKTIONEN (Sandbox-Grenze):
  - B-USER-DOCKER-01: Broker-Restart, Grafana-Reload, docker inspect fuer Image-Tag.

STARTROLLE NACH GATE 2:
  - server-dev (PKG-02, PKG-06, PKG-07, PKG-01b) — parallel-dispatch-geeignet.
  - esp32-dev (PKG-01a, PKG-03 Firmware-Teil).
  - frontend-dev (PKG-04b, PKG-03 FE-Teil).
  - mqtt-dev (PKG-08, PKG-01 Topic-Kontrakt).
```

---

## G. Ergebnis Gate 1

**Status:** PASS (keine harten Plan-Code-Bruchstellen; 4 empfohlene Mutationen vor Gate 2; 8 BLOCKER-Codes fuer Dispatch dokumentiert).

**Naechster Schritt:** Mutation von `TASK-PACKAGES.md` gemaess Abschnitt F. Danach Gate 2.
