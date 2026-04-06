# Report S7 — Domain-Services Batch 1: Aktor, Safety, Config, State-Adoption

**Datum:** 2026-04-05  
**Auftrag:** `.claude/auftraege/Auto_One_Architektur/server/auftrag-server-S7-domain-services-aktuator-safety-config-2026-04-05.md`  
**Code-Wurzel:** `El Servador/god_kaiser_server/src/services/` (+ MQTT-Handler, API, Publisher)

---

## Kurzfassung

Die serverseitige **Erfolgsdefinition** für Aktor-Befehle endet bei **MQTT-Publish (oder No-Op-Delta)**, nicht bei physischer Finalität auf dem ESP. Die **fachliche Finalität** (Hardware wirklich umgeschaltet) wird über **`actuator/.../response`** und **`actuator/.../status`** vom Gerät zurückgemeldet und separat persistiert. **REST 200** auf `POST .../command` bedeutet nur: `ActuatorService.send_command()` hat `True` geliefert — mit der dokumentierten Ausnahme **No-Op-Delta** wird dabei **kein** MQTT gesendet; `acknowledged` bleibt im Response-Schema explizit `false` (asynchrones MQTT-ACK).

---

## 1. ActuatorService — Einstiegspunkte und Kette

### Öffentliche Methode

| Methode | Wer ruft (Caller-Anker) |
|---------|-------------------------|
| `ActuatorService.send_command(...)` | `api/v1/actuators.py` (`send_command` Endpoint ~729), `services/logic_engine.py` (`_execute_action_legacy` ~1058), `services/logic/actions/actuator_executor.py` (`execute` ~116), `api/v1/logic.py` (`toggle_rule` ~501 bei Regel-Disable) |
| Instanziierung | `main.py` (~655), `api/deps.py` `get_actuator_service` (~681) |

### Reihenfolge innerhalb `send_command`

1. `correlation_id` (UUID) erzeugen (`actuator_service.py` ~77).  
2. **`SafetyService.validate_actuator_command`** (~80) — bei `valid=False`: Audit/Command-Log, optional WS `actuator_command_failed`, `return False`.  
3. Session: ESP lookup; Actuator-Config für Logging; **`_is_noop_delta`**: wenn gewünschter Zustand == persistierter State → Command-Log mit `noop_delta`, **kein MQTT**, `return True` (~165–187).  
4. **`publisher.publish_actuator_command`** (~191) — bei `False`: Metrik, Logs, WS, `return False`.  
5. Bei Publish-OK: Command-Log + Audit + WS `actuator_command` (~254–306), `return True`.

### Erwartete Geräte-Antworten (nach Publish)

- **QoS:** `publisher.publish_actuator_command` nutzt `QOS_ACTUATOR_COMMAND` (Kommentar: Exactly once) — `mqtt/publisher.py` ~98.  
- **Eingehend:** `ActuatorResponseHandler.handle_actuator_response` (`mqtt/handlers/actuator_response_handler.py`) — canonicalisiert Payload, Terminal-Authority über `CommandContractRepository`, schreibt History mit `issued_by="esp32_response"`.  
- **Status-Sync:** `ActuatorStatusHandler` (`mqtt/handlers/actuator_handler.py`) aktualisiert `actuator_states`, füttert bei Adoption `record_adopted_state`.

---

## 2. SafetyService — Hart blockieren vs. „degraded“

### `validate_actuator_command` / `check_safety_constraints`

**Hart blockierend** (`valid=False`, kein Publish):

- Emergency-Stop (global `__ALL__` oder ESP-spezifisch) — `safety_service.py` ~115–126.  
- Wert außerhalb [0.0, 1.0] (global PWM-Range) — ~129–133.  
- ESP nicht gefunden — `check_safety_constraints` ~162–166.  
- ESP offline (`not esp_device.is_online`) — ~170–174 (Kommentar V1-22).  
- Keine Actuator-Config / Actuator disabled — ~179–190.  
- Wert außerhalb `min_value`/`max_value` der Config — ~193–200.

**Nur Warnungen** (`valid=True`, `warnings`):

- Actuator bereits aktiv bei gesetztem `timeout_seconds` — Hinweis, Enforcement „full“ laut Kommentar auf ESP-Seite — ~202–210.  
- Mehrfach-Nutzung GPIO (Warnung trotz DB-Unique-Erwartung) — ~212–218.

**Hinweis Runtime-State (Querverweis S9):** Prozessweiter Emergency-Stop in `SafetyService._global_emergency_stop_active`; Simulation/Mock haben eigenes `emergency_stopped` in `simulation/scheduler.py` — zwei Ebenen, nicht automatisch identisch mit Production-ESP-Pfad.

---

## 3. Config-Pipeline — Bau, Push, Antwort, Reconciliation

### Bau

- **`ConfigPayloadBuilder.build_combined_config`** (`services/config_builder.py`): lädt Sensoren/Aktoren pro ESP, GPIO-Konflikt-Check (I2C/OneWire ausgenommen), baut `offline_rules` nur für **lokal gleiches ESP** (Cross-ESP explizit ausgeschlossen — Kommentar ~360–361).  
- Mapping: `ConfigMappingEngine` / `core/config_mapping.py`.

### Push (kein separater „nur Push“-Endpoint im Builder-Kommentar — Push aus APIs + Heartbeat)

- **`ESPService.send_config`** (`esp_service.py` ~368): Offline-Verhalten `warn` | `skip` | `fail`; injiziert `correlation_id`; `publisher.publish_config`.  
- Aufrufer u. a.: `api/v1/sensors.py`, `api/v1/actuators.py`, `api/v1/logic.py` (`_push_config_to_affected_esps`), `mqtt/handlers/heartbeat_handler.py` (Auto-Push bei pending config).

### Antwortpfad

- **`ConfigHandler.handle_config_ack`** (`mqtt/handlers/config_handler.py`): Topic-Parse → **`canonicalize_config_response`** (`device_response_contract.py`) → `CommandContractRepository.upsert_terminal_event_authority` (Stale-Guard) → Logging / DB-Updates weiter unten in Handler.

### Reconciliation-Hooks

- Heartbeat: pending config detection (`_has_pending_config` in `heartbeat_handler.py`), Adoption + `trigger_reconnect_evaluation` nach `mark_adoption_completed`.  
- Terminal-Events: Contract-Authority in Config- und Actuator-Response-Handlern.

---

## 4. State adoption & Device-Response-Contract — State-Owner

| Aspekt | Server | ESP / Firmware |
|--------|--------|----------------|
| **Soll-Zustand (Policy)** | DB (Configs, Rules), Logic Engine entscheidet Aktionen | — |
| **Befehl ausgeben** | MQTT Publish (Command) | Empfängt, führt aus (soll) |
| **Ist-Zustand Hardware** | Projektion in DB via **Status**-MQTT + optional **Response** | **Authoritative** für physische Schaltung |
| **Reconnect** | `StateAdoptionService`: Phase `adopting` → nach Grace `adopted` → Logic `delta_enforced` | Status-Messages füllen `record_adopted_state` |

**Ablauf Adoption:**

- **Start:** `heartbeat_handler.py` bei Reconnect (`offline_seconds > threshold`) → `start_reconnect_cycle` (~297–303).  
- **Snapshot:** `actuator_handler.py` bei Status → `record_adopted_state` (~187–194).  
- **Abschluss:** `heartbeat_handler._complete_adoption_and_trigger_reconnect_eval` → `asyncio.sleep(ADOPTION_GRACE_SECONDS)` dann `mark_adoption_completed` (~1588–1593) → `logic_engine.trigger_reconnect_evaluation`.  
- **Logic-Gate:** `logic_engine.py` überspringt Aktor-Aktionen, wenn `not await adoption_service.is_adoption_completed(esp_id)` (~914–921, ~1031–1038).

**Device-Response-Contract:** Rein funktionale Canonicalisierung in `device_response_contract.py` (kein I/O) — Handler machen Persistenz + Metriken.

---

## 5. Cross-ESP vs. Single-ESP — explizite Code-Annahmen

- **ActuatorService:** immer **ein** `esp_id` + `gpio` pro Aufruf — keine implizite Multi-ESP-Broadcast in diesem Service.  
- **Logic / CrossESPLogic:** Regeln können **mehrere ESPs** in Bedingungen und Aktionen referenzieren; Ausführung iteriert Aktionen, jede mit eigenem `esp_id`.  
- **Offline-Rules im Config-Payload:** nur Regeln, bei denen Sensor **und** Aktor auf **demselben** ESP liegen; OR-Compounds mit mehreren Bedingungen werden verworfen; Cross-ESP-Anteile in Aktionen → Skip (`config_builder.py` ~645–678, ~486–492).  
- **Logic pre-check:** pro Ziel-ESP Online-Check und Adoption-Check vor Executor (`logic_engine.py` ~907–936).

---

## 6. Traces (nummeriert, mit Dateianker)

### Happy Path A — REST Aktor-Command

1. Client `POST /api/v1/actuators/{esp_id}/{gpio}/command` → `actuators.py` `send_command` (~680).  
2. Vorab: ESP/Actuator existent, enabled, online — sonst 404/409/Validation (~707–726).  
3. `actuator_service.send_command` (`actuator_service.py` ~46).  
4. `safety_service.validate_actuator_command` (~80) → `valid=True`.  
5. Kein No-Op → `publisher.publish_actuator_command` (`publisher.py` ~63) → MQTT.  
6. HTTP 200 + `ActuatorCommandResponse` mit `command_sent=True`, **`acknowledged=False`** (`actuators.py` ~750–758).  
7. (Asynchron) ESP sendet `.../actuator/{gpio}/response` → `ActuatorResponseHandler` → History `esp32_response` (`actuator_response_handler.py` ~61–170).

### Happy Path B — Logic Engine → Aktor (Executor-Pfad)

1. Regel feuert → `logic_engine._execute_actions` → `ActuatorActionExecutor.execute` (`actuator_executor.py` ~115).  
2. Adoption completed + ESP online (`logic_engine.py` ~914–936).  
3. `send_command` wie oben; WS `logic_execution` mit `success` (`logic_engine.py` ~951–964).  
4. MQTT wie Publisher-Pfad.

### Störfall 1 — Safety blockiert (z. B. Emergency Stop)

1. `send_command` ruft `validate_actuator_command` (`actuator_service.py` ~80).  
2. `safety_service` findet aktiven E-Stop → `valid=False` (`safety_service.py` ~115–118).  
3. `send_command` loggt Command/Audit, WS `actuator_command_failed`, **`return False`** (~87–143).  
4. REST: `actuators.py` wirft `ValidationException` → **kein** 200 (~738–743).  
5. **Terminalität physisch:** ESP könnte unverändert bleiben oder bereits gestoppt sein — Server spiegelt das nicht allein durch diese Ablehnung.

### Störfall 2 — MQTT Publish-Fehler

1. Safety OK, kein No-Op (`actuator_service.py` ~189).  
2. `publish_actuator_command` → `False` (`actuator_service.py` ~201).  
3. `increment_actuator_timeout`, Command-Log `success=False`, Audit, WS failed (~202–252).  
4. **`return False`** (~252).  
5. REST: `ValidationException` — analog Störfall 1 (~738–743).  
6. Keine Garantie, dass das Gerät den Befehl je sieht — **Reparatur** erneuter Versuch (Client/Logic), Broker/Netzwerk beheben.

---

## 7. Text-Sequenzdiagramme (4 Szenarien)

### Szenario 1 — REST Command bis MQTT

```
Operator -> actuators.py: POST /command
actuators.py -> ActuatorService: send_command()
ActuatorService -> SafetyService: validate_actuator_command()
SafetyService --> ActuatorService: valid=True
ActuatorService -> Publisher: publish_actuator_command()
Publisher --> MQTT Broker: QoS actuator
actuators.py --> Operator: HTTP 200, acknowledged=False
MQTT Broker -> ESP: (delivery)
Note over ESP: Ausführung physisch
ESP -> Server: actuator/.../response (async)
```

### Szenario 2 — Logic Rule → Aktor

```
LogicEngine -> LogicEngine: adoption + online pre-check
LogicEngine -> ActuatorActionExecutor: execute()
ActuatorActionExecutor -> ActuatorService: send_command()
ActuatorService -> SafetyService: validate...
ActuatorService -> Publisher: publish...
LogicEngine -> WebSocket: logic_execution
```

### Szenario 3 — Config Push + config_response

```
API/Heartbeat -> ConfigPayloadBuilder: build_combined_config()
API/Heartbeat -> ESPService: send_config()
ESPService -> Publisher: publish_config(+correlation_id)
ESP -> Server: config_response MQTT
ConfigHandler -> device_response_contract: canonicalize_config_response()
ConfigHandler -> CommandContractRepository: upsert_terminal_event_authority()
```

### Szenario 4 — Reconnect + Adoption

```
HeartbeatHandler: reconnect detected
HeartbeatHandler -> StateAdoptionService: start_reconnect_cycle(adopting)
ESP -> ActuatorStatusHandler: status
ActuatorStatusHandler -> StateAdoptionService: record_adopted_state()
HeartbeatHandler: after ADOPTION_GRACE_SECONDS
HeartbeatHandler -> StateAdoptionService: mark_adoption_completed(adopted)
HeartbeatHandler -> LogicEngine: trigger_reconnect_evaluation(delta_enforced)
```

---

## 8. Failure-Ownership (Grenze | terminaler Status | wer repariert)

| Grenze | Wer führt terminalen Status (Server-seitig modelliert) | Wer repariert |
|--------|--------------------------------------------------------|----------------|
| Safety lehnt ab | Command/Audit-Log `success=False`; kein MQTT | Operator: E-Stop lösen, Gerät online, Config korrigieren |
| MQTT Publish fail | Gleiches + Metrik `actuator_timeout` | Ops: Broker, Netz, Publisher-Retry-Konfiguration |
| ESP nicht erreichbar (offline) | REST 409 schon vor Service; Logic skip/backoff | Netzwerk, Gerät, Heartbeat |
| Gerät widerspricht (Response success=false) | History `esp32_response`, Contract-Terminalität | Firmware/Debug; ggf. erneuter Command |
| Config partial_success / error | `config_response` canonical + Audit/DB-Updates im Handler | GPIO-Konflikt/NVS laut Payload beheben, erneuter Push |
| No-Op-Delta (Server) | Log `noop_delta`, HTTP 200 möglich **ohne** MQTT | Kein Repair nötig — beabsichtigtes Überspringen |
| Regel-Toggle OFF fehlgeschlagen | **`toggle_rule` liefert trotzdem `success=True`** (`logic.py` ~534); nur Log Warning | P1 — UI/API täuschen Erfolg vor; Operator erneut OFF senden |

---

## 9. Abnahmekriterium: REST 200 ≠ physische Ausführung

**Beleg 1 — HTTP 200 ohne Geräte-Bestätigung:** Response-Feld `acknowledged=False` mit Kommentar „ACK is async via MQTT“ (`actuators.py` ~757–758).

**Beleg 2 — HTTP 200 ohne MQTT:** `send_command` kann `True` zurückgeben bei No-Op-Delta (`actuator_service.py` ~165–187): gewünschter Zustand entspricht bereits DB-State → kein `publish_actuator_command`, aber `return True`.

**Beleg 3 — Erfolg = Publish, nicht Hardware:** `send_command` setzt `success=True` im Command-Log direkt nach erfolgreichem Publish (`actuator_service.py` ~254–267), bevor eine `response`-Message eintrifft.

---

## 10. Gap-Liste P0 / P1 / P2 (Bezug G3 Vollständigkeit / G5 Finalität)

| ID | Schwere | Beobachtung |
|----|---------|-------------|
| G5-P1 | P1 | `toggle_rule`: Regel wird deaktiviert und API meldet Erfolg, auch wenn `send_command(OFF)` fehlschlägt — nur Warning-Log (`logic.py` ~501–516 vs. ~534). |
| G3-P2 | P2 | `ActuatorCommandResponse.safety_warnings` ist bei REST immer `[]` (`actuators.py` ~757), obwohl `SafetyService` Warnungen liefern kann — Observability-Lücke. |
| G5-P2 | P2 | Correlation-ID wird in REST-Response nicht zurückgegeben; Client kann async `actuator_response` nur über Zeit/ESP/GPIO matchen. |
| G3-P2 | P2 | Zwei Notstop-Konzepte (SafetyService global dict vs. Simulation `emergency_stopped`) — dokumentieren/vereinheitlichen für vollständiges Systembild. |
| G5-P1 | P1 | Adoption: `is_adoption_completed` ist `True`, wenn **kein** Zyklus existiert (`state_adoption_service.py` ~96–101) — frisches Gerät ohne `start_reconnect_cycle` blockiert nicht; bei Reconnect aber schon. Einsteiger müssen das Modell kennen. |

---

## 11. Referenzierte Dateien (Index)

- `src/services/actuator_service.py`  
- `src/services/safety_service.py`  
- `src/services/config_builder.py`  
- `src/services/esp_service.py` (`send_config`)  
- `src/services/state_adoption_service.py`  
- `src/services/device_response_contract.py`  
- `src/mqtt/publisher.py`  
- `src/mqtt/handlers/config_handler.py`  
- `src/mqtt/handlers/actuator_handler.py`  
- `src/mqtt/handlers/actuator_response_handler.py`  
- `src/mqtt/handlers/heartbeat_handler.py`  
- `src/api/v1/actuators.py`  
- `src/api/v1/logic.py`  
- `src/services/logic_engine.py`  
- `src/services/logic/actions/actuator_executor.py`  
- `src/api/deps.py`  
- `src/main.py`

---

*Ende Report S7 Batch 1.*
