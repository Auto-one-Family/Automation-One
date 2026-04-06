# Report S11 — Command / Actuator End-to-End (Bereich B)

**Datum:** 2026-04-05  
**Bezug:** `auftrag-server-S11-crosscut-command-actuator-e2e-2026-04-05.md`  
**Code-Wurzel:** `El Servador/god_kaiser_server/src/`

---

## 1. Serverseitiger Command-Lifecycle (textuell)

Es gibt **keine** zentrale Enum-State-Maschine wie `pending → dispatched → …` im Code. Die **tatsächlich verwendeten Begriffe** ergeben sich aus HTTP-Response-Feldern, Logs, Command-History, Safety-Layer und dem **Intent-/Outcome-Contract** (nur Intent-Pfad).

### 1.1 Normale Aktor-Befehle (REST / Logic → MQTT → optional Response)

```
[SafetyService.validate_actuator_command]
    ├─ abgelehnt → Audit + optional WS "actuator_command_failed" + return False
    └─ ok
         ├─ noop_delta (desired==current) → log_command(success, issued_by="…:noop_delta"), kein MQTT
         └─ publish_actuator_command
                ├─ Publish fehlgeschlagen → log_command(success=False), Audit, WS failure
                └─ Publish ok → log_command(success=True), Audit, WS "actuator_command"
                     … (asynchron) …
                     ESP → …/actuator/{gpio}/response
                          → ActuatorResponseHandler → Command-History (issued_by="esp32_response")
                          → WS "actuator_response"
                          → CommandContract terminal authority (Dedup / stale guard)
```

**Code-Begriffe (Auszug):**

| Phase | Begriff / Signal | Quelle |
|--------|------------------|--------|
| HTTP-Antwort | `command_sent`, `acknowledged=False` (fest) | `ActuatorCommandResponse` in `schemas/actuator.py` |
| Vor MQTT | Safety `valid` / Fehlertext | `SafetyService.validate_actuator_command` |
| Entfall MQTT | `noop_delta`, Metadata `skipped: desired_equals_current` | `ActuatorService.send_command` |
| Nach Publish (Server) | `success=True` in `log_command`, `issued_by` z. B. `user:…`, `logic:{rule_id}` | `ActuatorService`, `ActuatorRepository.log_command` |
| ESP-Rückmeldung | `success`, `message`, canonical `code`, `terminality`, `is_final` | `canonicalize_actuator_response` → fest `is_final=True`, `terminality` success/failure |

### 1.2 Intent-Outcome-Pfad (accepted vs. terminal)

Separater Kanal: Topic `…/system/intent_outcome` (und Lifecycle auf `…/intent_outcome/lifecycle`).

- **Outcomes (kanonisch):** `accepted`, `rejected`, `applied`, `persisted`, `failed`, `expired` — siehe `CANONICAL_OUTCOMES` / `FINAL_OUTCOMES` in `services/intent_outcome_contract.py`.
- **Nicht-final (Sinne „accepted“):** u. a. Aliase werden nach `accepted` normalisiert; **final** laut `FINAL_OUTCOMES`: `persisted`, `rejected`, `failed`, `expired`.

Actuator-**response**-Payloads werden contractseitig immer als **terminal** behandelt (`is_final=True` in `canonicalize_actuator_response`) — das ist **nicht** dasselbe wie ein Intent-Outcome `accepted`.

---

## 2. Korrelation & Fallback — Tabelle mit Risikoklassen

| Stelle | Mechanismus | Fallback ohne harte `correlation_id`? | Risiko |
|--------|-------------|----------------------------------------|--------|
| **MQTTCommandBridge.resolve_ack** | 1) exakter Key `correlation_id` in `ack_data`; 2) sonst ältester pending Future pro `(esp_id, command_type)` FIFO | **Ja**, Zeilen 175–200 in `services/mqtt_command_bridge.py` | **Hoch (B3):** Bei fehlendem/falschem `correlation_id` im Zone/Subzone-ACK kann ein ACK dem **falschen** wartenden API-Call zugeordnet werden, wenn mehrere Operationen parallel laufen. |
| **ZoneAckHandler** | reicht `correlation_id` aus Payload an `resolve_ack` durch | Fallback aktiv, wenn Bridge wartet | Wie oben; siehe `mqtt/handlers/zone_ack_handler.py` (~237–251). |
| **SubzoneAckHandler** | idem | idem | `mqtt/handlers/subzone_ack_handler.py` (~118–133). |
| **ActuatorService.send_command** | pro Aufruf `uuid4()` → MQTT-Payload, wenn gesetzt | **Nein** für Matching: Server hält **keine** Future-Map für normale Aktor-Commands | Kein FIFO-Fallback auf Actuator-Ebene; Korrelation nur für Audit/WS/History, wenn ESP `correlation_id` zurückspiegelt. |
| **ActuatorResponseHandler** | Dedup-Key: mit `correlation_id` → `corr:…`; sonst Fallback-Key aus `esp`, `gpio`, `command`, `ts` | **Ja** (schwache Korrelation über Zeitstempel) | **Mittel:** Zwei Responses ohne brauchbare `correlation_id` (bzw. synthetisch `missing-corr:act:{esp}:{ts}`) können Dedup/Join erschweren; bei identischem `ts` theoretisch Kollisionen. Siehe `device_response_contract.py` (synthetische ID bei fehlendem Feld) und `_build_terminal_authority_key` in `actuator_response_handler.py` (~327–343). |
| **canonicalize_actuator_response** | fehlende `correlation_id` → `missing-corr:act:{topic_esp_id}:{ts}` | erzwungener String, aber nicht zwingend eindeutig | **Mittel** bei Parallelität + fehlendem Firmware-Feld. |
| **Intent-Outcome** | `correlation_id` Pflicht logisch; fehlend → synthetisch `missing-corr:{intent_id}` | Dedup über `(intent_id, generation, seq)` im Handler | `mqtt/handlers/intent_outcome_handler.py` (~61–64, ~109+). |
| **Emergency REST** | `incident_correlation_id` nur in Audit/Metadata/Broadcast-Payload | Per-GPIO `publish_actuator_command` **ohne** `correlation_id`-Parameter | **Mittel:** MQTT-Command an ESP trägt für diesen OFF-Strom **keine** command-`correlation_id`; End-to-End-Join zum Incident nur über Logs/WS-Metadaten, nicht über ESP-Response. `api/v1/actuators.py` (~907–916 vs. ~873). |
| **Subscriber / Inbox-Replay** | generiert/setzt `correlation_id` für Replay | Kontext-IDs für Tracing | `mqtt/subscriber.py` (~472–476). |
| **Logic ConflictManager** | „FIFO“ bei gleicher Priorität | Nur Rule-Auswahl, kein MQTT-ACK | `services/logic/safety/conflict_manager.py` (Hinweis Dokumentation). |

---

## 3. Leitfrage: FIFO-Fallback ohne harte Korrelation?

**Antwort: Ja** — explizit für **Zone/Subzone-ACK-Warte-Pfade** über `MQTTCommandBridge.resolve_ack` Strategy 2 (FIFO über `(esp_id, command_type)`), Datei `El Servador/god_kaiser_server/src/services/mqtt_command_bridge.py`, Zeilen **184–200**.

**Ergänzung:** Für **klassische Aktor-Befehle** (Topic `…/actuator/{gpio}/command`) gibt es **keinen** serverseitigen ACK-Wait und damit **keinen** vergleichbaren FIFO-Fallback; Korrelation ist hier „best effort“ über echoende `correlation_id` in `…/response`.

---

## 4. Emergency End-to-End (Eingang → sichtbares Outcome)

**Pfad (REST Happy-Path):** `POST /api/v1/actuators/emergency_stop`

**Codeanker (≥5):**

1. **Safety-Blockade zuerst:** `await safety_service.emergency_stop_all()` bzw. `emergency_stop_esp` — `api/v1/actuators.py` (~888–892); Implementierung `services/safety_service.py` (~226–245).
2. **Sofortige OFF-Commands pro Aktor:** `publisher.publish_actuator_command(..., command="OFF", …)` **ohne** `correlation_id` — `api/v1/actuators.py` (~907–916).
3. **Command-History:** `log_command(..., command_type="EMERGENCY_STOP", metadata mit incident_correlation_id)` — (~936–948).
4. **MQTT-Broadcast für spät verbindende ESPs:** `kaiser/broadcast/emergency` — (~993–1010).
5. **WebSocket sichtbar fürs Dashboard:** `ws_manager.broadcast("actuator_alert", …)` — (~1020–1033).
6. **Audit:** `audit_repo.log_emergency_stop` — (~971–985).

**Outcome sichtbar:** HTTP 200 mit Zählern; WS-Event `actuator_alert`; MQTT retained clear auf Startup separat in `main.py` (~213–225) beeinflusst Broker-Zustand, nicht den obigen Request-Flow.

**Logic/MQTT-Eingang (ESP-seitiger Notfall):** Topics `kaiser/+/esp/+/actuator/emergency` und Broadcast — in **Produktiv-Subscriber** an `MockActuatorHandler` gebunden (`main.py` ~381–387); echte Hardware nutzt denselben Handler-Pfad laut Registrierung (Mock-Name historisch). Simulation: `simulation/scheduler.py` routed `handle_emergency` / `handle_broadcast_emergency`.

---

## 5. Intent-Outcome: Verdrahtung vs. Firmware

| Firmware-Dokument / Code | Server |
|--------------------------|--------|
| Kanonisch `…/system/intent_outcome` (`intent_contract.cpp`) | Handler `intent_outcome_handler`, Subscription in `main.py` (~300–303) |
| Lifecycle `…/system/intent_outcome/lifecycle` (`main.cpp` CONFIG_PENDING) | Handler `intent_outcome_lifecycle_handler` (~305–309) |
| TopicBuilder-Tests / Docs | `TopicBuilder.parse_intent_outcome_topic` / `parse_intent_outcome_lifecycle_topic` in `mqtt/topics.py` |

**Fazit:** Die in `El Trabajante/docs/Mqtt_Protocoll.md` und `runtime-readiness-policy.md` genannten **beiden** Pfade sind auf dem Server abonniert und mit eigenen Handlern verdrahtet.

**Lücken / Restrisiko:**

- **P2:** Ältere oder abweichende Topic-Schreibweisen (ohne `kaiser/{id}/esp/{id}/system/…`) würden **nicht** matchen — Wildcard ist fest `kaiser/+/esp/+/system/intent_outcome`.
- **P2:** Andere Flows als in `CANONICAL_FLOWS` landen als Contract-Normalisierung — siehe `intent_outcome_contract.py`; Monitoring über `increment_contract_unknown_code` / Metrics.
- **P1:** REST `ActuatorCommandResponse` liefert **keine** `correlation_id` an den Client; paralleles UI-Matching zu `actuator_response` / Intent-Outcomes ist erschwert (nicht Intent-Topic-Lücke, aber E2E-Observability).

---

## 6. Parallelität: Zwei gleichartige Commands an dieselbe ESP kurz hintereinander

**Voraussetzung:** Beide über `ActuatorService.send_command` (REST oder Logic) — jeweils **neue** `correlation_id` (`uuid4()`), beide MQTT-Publishes mit eigenem Payload.

**Erwartetes Mapping der Responses:**

1. **Idealfall (Firmware konform):** Jede `…/response` enthält dieselbe `correlation_id` wie der auslösende Command → eindeutige Zuordnung in Audit + sinnvolle `_build_terminal_authority_key` mit `corr:…`.
2. **Fehlende `correlation_id` auf dem ESP:** Server erzeugt `missing-corr:act:{esp_id}:{ts}` — wenn beide Responses denselben Sekunden-`ts` haben, **kollidieren** synthetische IDs; Terminal-Authority und Nachvollziehbarkeit leiden.
3. **Reihenfolge:** MQTT QoS 2 für Commands reduziert Duplikate, garantiert aber keine Anwendungs-Reihenfolge relativ zu parallelen Clients; die **History** zeigt zwei unabhängige Einträge (`issued_by` Server) und später zwei `esp32_response`-Einträge.

**Server wartet nicht** auf die zweite Response im selben Request — beide HTTP-Calls können `200` mit `acknowledged=False` zurückgeben, bevor eine Response eintrifft.

---

## 7. Traces (konzeptionell)

### 7.1 Happy-Path REST

1. `POST /api/v1/actuators/{esp_id}/{gpio}/command` — `api/v1/actuators.py` `send_command` (~728–736).  
2. `ActuatorService.send_command` — Safety, optional noop, `publish_actuator_command` mit `correlation_id` — `services/actuator_service.py` (~76–199).  
3. `Publisher.publish_actuator_command` — Payload inkl. `correlation_id` — `mqtt/publisher.py` (~88–96).  
4. Response `ActuatorCommandResponse` mit `command_sent=True`, `acknowledged=False` (~750–758).  
5. Später: MQTT `…/response` → `ActuatorResponseHandler` → WS `actuator_response`.

### 7.2 Happy-Path MQTT (Inbound)

- ESP publiziert `kaiser/{kaiser}/esp/{esp}/actuator/{gpio}/response` mit gültigem JSON → `ActuatorResponseHandler.handle_actuator_response` → DB + WS.

### 7.3 Störfall (Timeout / NAK)

- **Zone/Subzone mit Warten:** `MQTTCommandBridge.send_and_wait_ack` wirft `MQTTACKTimeoutError` nach Timeout — `mqtt_command_bridge.py` (~138–151). ACK mit Fehlerstatus löst Future trotzdem (Subzone-Kommentar: „inkl. error“) — `subzone_ack_handler.py` (~118–119).  
- **Normaler Aktor:** Kein Timeout auf Server-Seite; „NAK“ = `success: false` in `…/response` → WS + History mit Fehler.  
- **Safety-Blockade nach Emergency:** `validate_actuator_command` scheitert mit globalem E-Stop — `safety_service.py` (~114–125).

---

## 8. Gap-Liste (P0 / P1 / P2) — Bezug G3, G5

| ID | Schwere | Beschreibung |
|----|---------|--------------|
| G3-P0 | P0 | **FIFO-Fallback** in `MQTTCommandBridge.resolve_ack` bei fehlender/inkorrekter `correlation_id` für Zone/Subzone (Race → falscher Caller). |
| G5-P1 | P1 | **REST** gibt keine `correlation_id` zurück; `acknowledged` bleibt immer `False` — schwache Client-E2E-Observability. |
| G5-P1 | P1 | **Emergency**-GPIO-Publishes ohne MQTT-`correlation_id` — schwächere Verknüpfung ESP-Response ↔ Incident. |
| — | P2 | Actuator-Response ohne ESP-`correlation_id` — synthetische IDs von `ts` möglicherweise nicht eindeutig unter Parallelität. |
| — | P2 | Intent-Flows außerhalb `CANONICAL_FLOWS` — abhängig von Normalisierung/Contract-Metriken. |

---

## 9. Abnahme-Checkliste (Auszug Auftrag)

| Kriterium | Erfüllt |
|-----------|---------|
| Lifecycle-Diagramm textuell, Begriffe aus Code | Ja (Abschnitt 1) |
| Korrelations-/Fallback-Tabelle + Risiko | Ja (Abschnitt 2) |
| FIFO-Frage mit Codezeilen | Ja (Abschnitt 3, `mqtt_command_bridge.py:184–200`) |
| Emergency ≥5 Codeanker | Ja (Abschnitt 4) |
| Intent-Outcome Verdrahtung + Lücken | Ja (Abschnitt 5) |
| Parallelitäts-Szenario | Ja (Abschnitt 6) |
| Traces REST / MQTT / Störung | Ja (Abschnitt 7) |
| Gap-Liste P0/P1/P2 | Ja (Abschnitt 8) |

---

*Ende Report S11*
