# Report S12 — Logic & Safety End-to-End (Crosscut C + D)

**Datum:** 2026-04-05  
**Auftrag:** `.claude/auftraege/Auto_One_Architektur/server/auftrag-server-S12-crosscut-logic-safety-e2e-2026-04-05.md`  
**Code-Wurzel:** `El Servador/god_kaiser_server/src/`

---

## Hinweis zur Referenz D2

Die verpflichtende Datei `analyseauftrag-server-end-to-end-vollpruefung-und-vollstaendigkeit-2026-04-03.md` ist im aktuellen Workspace **nicht vorhanden** (laut Git-Status gelöscht). Die **Failure-Klassen** wurden daher **aus dem Ist-Code** abgeleitet und mit einem typischen D2-Schema (Erkennung / Übergang / Persistenz / Sichtbarkeit) belegt. Abgleich mit dem Oberauftrag sollte beim Wiederherstellen der Quelle nachgezogen werden.

---

## 1. Kurzliste „Safety vs. Logic“ — Entscheidungsregeln

| Ebene | Rolle | Überschreibt Logic? | Blockt Ausführung? | Anmerkung |
|-------|--------|---------------------|--------------------|-----------|
| **SafetyService** | Harte Gate vor MQTT | Nein (Logic bleibt „will“) | **Ja** — `send_command` bricht ab | `validate_actuator_command` in `safety_service.py` |
| **ActuatorService** | Orchestrierung + Telemetrie | Nein | **Ja** (Safety oder Publish) | Loggt Fehler, WS `actuator_command_failed` |
| **ConflictManager** | Regel-vs.-Regel um gleichen Aktor | Nein | **Ja** für konkurrierende Rule | Vor jedem Executor-Aufruf in `LogicEngine._execute_actions` |
| **RateLimiter** | `max_executions_per_hour` | Nein | **Ja** — Rule bricht vor Actions ab | `logic_engine.py` → `increment_safety_trigger()` |
| **Cooldown** | Zeit seit letzter Ausführung | Nein | **Ja** — Rule return | Ausnahmen: `rule_update`, `reconnect` |
| **StateAdoptionService** | Reconnect-Handover | Nein | **Ja** — Action wird **übersprungen** (`continue`) | Modern path + Legacy path |
| **Offline-Backoff** | ESP als offline erkannt | Nein | **Ja** — stilles oder geloggtes Skip | `_offline_esp_skip` in `LogicEngine` |
| **ActuatorActionExecutor** | Subzone-Mismatch | Nein | Nein — **skip mit `success=True`** | Kein Safety-Call; bewusstes No-Op |
| **No-Op-Delta** | `desired == current` in DB-State | Nein | Nein — `send_command` **True** ohne MQTT | `ActuatorService._is_noop_delta` |
| **RuntimeStateService** (`DEGRADED_OPERATION` / `RECOVERY_SYNC`) | Betriebsmodus / Readiness | **Nein** | **Nein** für Logic/Actuator | **Nicht** in `LogicEngine` oder `ActuatorService` angebunden; nur Health/Metriken |

**Siegerregel (zusammengefasst):** Intent kommt von **Logic** (inkl. Conflict/Rate/Cooldown/Adoption). **Safety + Transport** entscheiden erst in `ActuatorService.send_command`. **RuntimeMode** blockiert diese Kette derzeit **nicht**.

---

## 2. D2-Matrix — Failure-Klassen mit Codeankern

Spalten: **Erkennung** | **Übergang / Reaktion** | **Persistenz** | **Sichtbarkeit**

| Failure-Klasse | Erkennung | Übergang / Reaktion | Persistenz | Sichtbarkeit (WS / MQTT / API) |
|----------------|-----------|---------------------|------------|--------------------------------|
| **D2-F01 Emergency Stop aktiv** | `SafetyService.validate_actuator_command` prüft `_emergency_stop_active` | `SafetyCheckResult(valid=False)` | `ActuatorRepository.log_command` + `AuditLogRepository.log_actuator_command` (failed) | WS `actuator_command_failed`; MQTT: kein Publish |
| **D2-F02 Wert außerhalb [0,1] (global)** | `validate_actuator_command` | wie F01 | wie F01 | wie F01 |
| **D2-F03 Wert außerhalb min/max (Aktor-Config)** | `check_safety_constraints` | wie F01 | wie F01 | wie F01 |
| **D2-F04 ESP offline / unbekannt** | `esp_repo.get_by_device_id` + `is_online` in Safety; zusätzlich Logic-Pre-Check | Safety: ablehnen; Logic: Skip + Backoff-Cache | Command/Audit bei Safety-Pfad | API 409 in `actuators.send_command` (vor Service); Logic: Log warn |
| **D2-F05 Aktor disabled / nicht gefunden** | `check_safety_constraints` | wie F01 | wie F01 | wie F01 |
| **D2-F06 MQTT-Publish fehlgeschlagen** | `Publisher.publish_actuator_command` → `False` (nach bestandenem Safety) | `return False` aus `send_command` | `log_command` + Audit failed | WS `actuator_command_failed` (`MQTT publish failed`) |
| **D2-F07 Regel-Konflikt (gleicher esp:gpio)** | `ConflictManager.acquire_actuator` | Gesamte Action-Liste abgebrochen, Locks rollback | Kein separater Safety-Log; nur Engine-Log (`logger.warning`) | WS `logic_execution` nur wenn Executor lief — bei komplettem Konflikt-Return **oft keine** Success-Broadcast für die blockierte Rule |
| **D2-F08 Rate-Limit pro Stunde** | `RateLimiter.check_rate_limit` | Rule return vor `_execute_actions` | Kein Execution-Log in dem Pfad | `increment_safety_trigger()` Metrik |
| **D2-F09 Cooldown aktiv** | `logic_repo.get_last_execution` vs `cooldown_seconds` | Rule return | Kein neuer Execution-Log | Debug-Log |
| **D2-F10 Adoption nicht abgeschlossen** | `StateAdoptionService.is_adoption_completed` | `continue` — kein `send_command` | Kein Command-Log durch diesen Pfad | Info-Log in Logic |
| **D2-F11 Subzone-Mismatch** | `ActuatorActionExecutor` + `SubzoneRepository` | `ActionResult(success=True, skipped)` | Kein Safety-Involvement | WS `logic_execution` mit `success: true` / Message „Skipped“ |
| **D2-F12 No-Op Delta (State bereits gleich)** | `ActuatorService._is_noop_delta` | `return True` ohne MQTT | `log_command` success mit `noop_delta` Metadata | Kein normales `actuator_command` WS für echtes Schalten |
| **D2-F13 Runtime DEGRADED / RECOVERY_SYNC** | `RuntimeStateService.snapshot` / `main.py` Transition | **Kein** autom. Stopp von Logic | N/A für Commands | `/api/v1/health` liefert `mode`; Heartbeat-Telemetrie kann `runtime_state_degraded` flaggen (siehe `esp_heartbeat` / Aggregator) — **entkoppelt** von Logic-Gating |

**Codeanker (Auswahl):**

- `SafetyService.validate_actuator_command` / `check_safety_constraints` — `src/services/safety_service.py`
- `ActuatorService.send_command` — `src/services/actuator_service.py`
- `LogicEngine._evaluate_rule`, `_execute_actions`, `_execute_action_legacy` — `src/services/logic_engine.py`
- `ActuatorActionExecutor.execute` — `src/services/logic/actions/actuator_executor.py`
- `ConflictManager` — `src/services/logic/safety/conflict_manager.py`
- `RateLimiter` — `src/services/logic/safety/rate_limiter.py`
- `RuntimeStateService` — `src/services/runtime_state_service.py`; Lifespan — `src/main.py` (u. a. Zeilen ~746–766, 964–965)

---

## 3. Interlocks — Logic will Aktor, Safety verbietet, Runtime DEGRADED

**Ablauf (Ist):**

1. Sensor- oder Timer-Trigger → `LogicEngine.evaluate_*` → Bedingungen, Cooldown, Rate-Limit.
2. `_execute_actions` → ConflictManager → ggf. Adoption/Offline-Checks → `ActuatorActionExecutor` → `ActuatorService.send_command`.
3. `SafetyService.validate_actuator_command` — bei Verstoß: **Abbruch**, Audit + Command-Log + optional WS `actuator_command_failed`.

**Runtime `DEGRADED_OPERATION`:** wird in `main.py` gesetzt, wenn MQTT beim Start nicht verbunden ist. **Die Logic Engine läuft trotzdem** (Start vor `RECOVERY_SYNC`-Transition; kein Guard in `LogicEngine`). **Safety** kann weiterhin blockieren (z. B. Emergency, offline ESP). **Kein** „Sieger“ zwischen Runtime-Mode und Safety — weil Runtime-Mode die Command-Kette nicht abfragt.

**Fazit:** In diesem Szenario gewinnt **Safety** (bzw. Transport nach Safety) über das Logic-Intent. **Runtime-DEGRADED** ist parallel sichtbar (Health), **ohne** dedizierte Interlock-Integration in die Logic/Safety-Kette.

---

## 4. Recovery — nach `RECOVERY_SYNC` / Inbound-Replay

**Reihenfolge im Lifespan (`main.py`):**

- `LogicEngine.start()` und `LogicScheduler.start()` laufen **vor** `transition(RECOVERY_SYNC)` und Inbound-Replay.
- Background-Task `replay_pending_events` setzt `recovery_completed` anhand Inbox-Pending — **ohne** LogicEngine zu pausieren.

**Folge:**

- **Laufende Rules:** Scheduler und Sensor-Handler können **während** `RECOVERY_SYNC` feuern.
- **Pending Commands:** Es gibt **keinen** serverseitigen „Command-Queue-Drain“ gekoppelt an Recovery; MQTT-Publish nutzt Publisher mit Retry — fehlgeschlagene Publishes werden wie D2-F06 behandelt.
- **Reconnect:** `trigger_reconnect_evaluation` kann Rules ohne Cooldown neu evaluieren (`trigger_data.type == "reconnect"`).

**Lücke (siehe Gap-Liste):** Kein explizites „Recovery-Gate“ das Logic-Actuator-Enforcement bis Ende Replay unterbindet.

---

## 5. Tests — Abdeckung und Lücken

| Kernpfad | Existierende Tests (Beispiele) | Lücke |
|----------|--------------------------------|-------|
| Emergency / Safety Gate | `tests/unit/test_safety_service_emergency_state.py`, `tests/integration/test_emergency_stop.py` | Kombination **Logic trigger + Emergency** in einem Integrationstest gezielt (Rule feuert, dann E-Stop, dann erneuter Trigger) — teilweise implizit, nicht als Matrix |
| Online-Guard (Safety) | `tests/unit/test_online_guard.py` | — |
| Offline-Backoff (Logic) | `tests/unit/test_offline_backoff_invalidation.py` | Kopplung zu `RuntimeMode` / `RECOVERY_SYNC` fehlt |
| Logic Engine E2E | `tests/integration/test_logic_engine.py`, `test_logic_automation.py`, `test_logic_engine_resilience.py`, `tests/e2e/test_logic_engine_real_server.py` | Expliziter Test: **`log_execution(success=True)` trotz fehlgeschlagenem `send_command`** (siehe Gap P1) |
| ConflictManager / RateLimiter | eher indirekt über Integration | Dedizierte Unit-Tests für „blockiert ganze Action-Liste“ vs. Teilfehlschlag |
| Runtime State Machine | `tests/unit/test_runtime_state_service.py` | **Kein** Test: „bei DEGRADED darf/kann Logic dennoch senden“ (Verhaltensdokumentation) |
| Actuator MQTT failure | ggf. über Mocks in Actuator-Tests | Gezielter Test: Safety OK, `publish_actuator_command` False → WS-Event + Audit |

**„Kein Test“-Markierung:** Ein vollständiger **E2E-Proof** für „RECOVERY_SYNC + parallele Rule-Ausführung“ ist **nicht** als isolierter pytest-Fall auffindbar — Verhalten aus Code erschlossen.

---

## 6. Zwei reproduzierbare Störfälle (manuell / Test-skizzierbar)

### Störfall A — aus Logic (Regel feuert, Ausführung scheitert an Safety)

1. Regel mit Sensor-Schwelle so konfigurieren, dass sie zuverlässig triggert.
2. Globalen Emergency Stop auslösen (`SafetyService.emergency_stop_all` über API `POST /actuators/emergency_stop` — wie in bestehenden Emergency-Tests).
3. Sensorwert triggert Regel erneut → `ActuatorService.send_command` scheitert in `validate_actuator_command` → Logs + WS `actuator_command_failed` mit `issued_by` wie `logic:<rule_id>`.

### Störfall B — Safety-Block ohne Logic (REST/API)

1. ESP online, Aktor enabled.
2. Emergency aktiv (wie oben).
3. `POST /api/v1/actuators/{esp_id}/{gpio}/command` → HTTP 400 `ValidationException` „Command rejected by safety validation…“ (`actuators.py` nach `send_command` False).

---

## 7. Gap-Liste P0 / P1 / P2

| Prio | ID | Befund |
|------|-----|--------|
| **P0** | S12-G1 | **RuntimeMode** (DEGRADED/RECOVERY) **koppelt nicht** an Logic/Actuator — Betriebsmodus und Safety-Story sind für Betreiber schwer ohne Dokumentation konsistent erklärbar. *Entweder* bewusst dokumentieren als „Observability only“ *oder* Product-Entscheidung für Gates. |
| **P1** | S12-G2 | **`logic_repo.log_execution(..., success=True)`** wird nach `_execute_actions` **unabhängig** davon gesetzt, ob alle Aktions-`send_command`-Aufrufe fehlgeschlagen sind → **Audit/Monitoring** kann „Rule OK“ zeigen bei **0 erfolgreichen** Aktorschaltungen. |
| **P1** | S12-G3 | **Subzone-Skip** liefert `success=True` — für Alarmierung/Analytics kann das wie Erfolg wirken; Semantik „skipped“ nur in Message/Data. |
| **P2** | S12-G4 | Konflikt-Pfad (D2-F07): begrenzte Sichtbarkeit über WS vs. Safety-Failures — vereinheitlichen oder dokumentieren. |
| **P2** | S12-G5 | Fehlende **Parent-D2**-Quelle im Repo — Nachziehen bei Wiederherstellung des Oberauftrags. |

---

## 8. Abnahmehinweise (Selbstcheck)

- Jede Zeile der Matrix hat mindestens einen **Codeanker** oder ist als **nicht modelliert** benannt (F13: Runtime ohne Logic-Gate).
- Kernpfade haben **Test-Referenzen** oder begründete Lücken (Recovery+Logic parallel, Execution-Success-Mismatch).

---

*Ende Report S12*
