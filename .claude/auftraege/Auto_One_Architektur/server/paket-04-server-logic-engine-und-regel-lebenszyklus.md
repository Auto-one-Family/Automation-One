# Paket 04: Server Logic Engine und Regel-Lebenszyklus

## 1. Scope und Rule-Begriffe

### Scope

Diese Analyse beschreibt den vollstaendigen Rule-Lifecycle im Backend `El Servador` fuer:

- Definition (`Create/Update/Delete/Toggle/Test`) ueber REST.
- Runtime-Auswertung (Telemetry, Zeit, Reconnect, Rule-Update).
- Action-Dispatch inkl. Rueckkanal und Historisierung.
- Konfliktbehandlung, Loop-Prevention, Flapping-Schutz.
- Konsistenz zwischen Definition (DB), Runtime (Engine) und UI-Sicht (REST/WS).

### Kernbegriffe

- **Rule-Definition**: Persistierte Regel in `cross_esp_logic` (`rule_name`, `trigger_conditions`, `actions`, `enabled`, `priority`, `cooldown_seconds`, `max_executions_per_hour`, `last_triggered`, `rule_metadata`, Timestamps).
- **Runtime-Evaluation**: Pruefung von Conditions in `LogicEngine` pro Triggerereignis.
- **Execution**: Ausfuehrung von Actions ueber modularen Executor-Pfad (`actuator`, `notification`, `delay`, `plugin`, `diagnostics`).
- **Execution-History**: Zeitreihen-Logging in `logic_execution_history` (success/fail, trigger_data, actions_executed, execution_time_ms).
- **Hysteresis-State**: Persistenter Schaltzustand in `logic_hysteresis_states` pro `(rule_id, condition_index)`.
- **UI-Sicht**: REST-Endpunkte (`/v1/logic/*`) + WebSocket Event `logic_execution` (plus actuator/sensor/status Events).

### Rule-Lifecycle (IST)

1. **Create**: `POST /v1/logic/rules` -> `LogicService.create_rule()` -> Validierung -> DB-Commit -> Config-Push an betroffene ESPs.
2. **Update**: `PUT /v1/logic/rules/{id}` -> Validierung -> DB-Commit -> `LogicEngine.on_rule_updated()` (bumpless transfer, OFF-Guards, Sofort-Re-Eval) -> Config-Push.
3. **Delete**: `DELETE /v1/logic/rules/{id}` -> DB-Delete -> Config-Push.
4. **Toggle**: `POST /v1/logic/rules/{id}/toggle` -> `enabled` umschalten, optional OFF fuer Rule-Actuators bei Disable -> Config-Push.
5. **Runtime**:
   - Sensor-Trigger ueber MQTT `sensor_handler` -> `LogicEngine.evaluate_sensor_data(...)`.
   - Zeit-Trigger ueber `LogicScheduler` -> `evaluate_timer_triggered_rules()`.
   - Reconnect-Trigger ueber `heartbeat_handler` -> `trigger_reconnect_evaluation(...)`.
   - Rule-Update-Trigger ueber `on_rule_updated(...)` (interne `type=rule_update` Triggerdaten).
6. **Observe**:
   - `GET /v1/logic/rules`, `GET /v1/logic/rules/{id}`, `GET /v1/logic/execution_history`.
   - WebSocket `logic_execution`, plus abgeleitete actuator/sensor/health Events.

---

## 2. Rule-Datenmodell und Versionierungsregeln

### 2.1 Persistenzmodell

**Primartabelle: `cross_esp_logic`**

- `id` (UUID, PK)
- `rule_name` (unique)
- `description`
- `enabled` (indexiert)
- `trigger_conditions` (JSON)
- `logic_operator` (`AND|OR`)
- `actions` (JSON)
- `priority` (int)
- `cooldown_seconds` (int, nullable)
- `max_executions_per_hour` (int, nullable)
- `last_triggered` (timestamptz)
- `rule_metadata` (JSON)
- `created_at`, `updated_at` (TimestampMixin)

**Laufzeit-/Audittabellen**

- `logic_execution_history`:
  - `logic_rule_id`, `trigger_data`, `actions_executed`, `success`, `error_message`, `execution_time_ms`, `timestamp`, `execution_metadata`
- `logic_hysteresis_states`:
  - `rule_id`, `condition_index`, `is_active`, `last_value`, `last_activation`, `last_deactivation`, `updated_at`
  - Unique: `(rule_id, condition_index)`

### 2.2 Condition-/Action-Domain (Schema + Validation)

- **Conditions**:
  - `sensor` / `sensor_threshold` (operator-basiert, optional `subzone_id`, optional `zone_id` runtimeseitig beachtet)
  - `time` / `time_window` (HH:MM oder Stunden, optional `days_of_week`, optional `timezone`)
  - `hysteresis` (cooling/heating Schwellpaare)
  - `compound`/`logic` (`AND|OR` ueber Subconditions)
- **Actions**:
  - `actuator` / `actuator_command`
  - `notification`
  - `delay`
  - `sequence`
  - `plugin` / `autoops_trigger`
  - `run_diagnostic` (ueber Diagnostics-Executor)

### 2.3 Versionierung (IST-Regeln)

Es existiert **keine explizite Rule-Version-Spalte** (`version`, `revision`, `etag`).

Faktische Versionierungsanker:

1. `updated_at` der Regel (DB-seitig).
2. `last_triggered` (nur Laufzeitaktivitaet, nicht Definitionsversion).
3. `logic_execution_history.timestamp` als Ereigniszeitleiste.
4. Persistierte Hysteresezustaende (`logic_hysteresis_states.updated_at`) als zustandsbezogene Runtime-Version.
5. Config-Push nach CRUD/Toggle als indirekte Propagation der Definitionsaenderung.

### 2.4 Invariante und wichtige Inkonsistenz

- Engine- und Repo-Kommentare modellieren Prioritaet als: **niedriger Wert = hoehere Prioritaet**.
- API-/Schema-Texte enthalten teilweise die Gegenaussage (`1=lowest, 100=highest`).
- Ergebnis: semantischer Drift zwischen Doku/Request-Modell und Runtime-Aufloesung.

---

## 3. Evaluations- und Triggerpipeline

### 3.1 Triggerquellen

1. **Telemetry (primar)**  
   MQTT Sensordaten -> `sensor_handler` speichert Messung -> non-blocking `LogicEngine.evaluate_sensor_data(...)`.

2. **Zeitgesteuert**  
   `LogicScheduler` (default 60s Intervall) -> `evaluate_timer_triggered_rules()`.

3. **Event-basiert**  
   Reconnect nach Heartbeat/LWT-Phase -> `trigger_reconnect_evaluation(esp_id)` mit Trigger `type=reconnect`.

4. **Manuell/administrativ**
   - `POST /rules/{id}/test` (Dry-Run oder bewusstes Execute im Testkontext).
   - `PUT /rules/{id}` triggert `on_rule_updated(...)` mit internem `type=rule_update`.
   - `toggle` aendert Aktivierung und kann OFF erzwingen.

### 3.2 Reihenfolge der Auswertung

Pro Regel in `_evaluate_rule(...)`:

1. Kontextaufbau inkl. Cross-Sensor-Werte.
2. Condition-Evaluation (modular: sensor/time/hysteresis/diagnostics/compound).
3. Sonderpfad: Hysterese-Deaktivierung (`_hysteresis_just_deactivated`) -> sofort OFF, Cooldown-Bypass.
4. Wenn Conditions false: Abbruch.
5. Cooldown-Pruefung (Bypass fuer `rule_update` und `reconnect`).
6. Rate-Limit-Pruefung (global, per-ESP, per-Rule/hour).
7. Action-Ausfuehrung.
8. `last_triggered` setzen, Execution-History schreiben, Commit.
9. Fehlerpfad: Metrics inkrementieren, failed history schreiben.

### 3.3 Kurzschlussregeln

- Compound `AND`: erster false kann effektiv abbrechen.
- Compound `OR`: erster true reicht.
- Fehlender Evaluator fuer Condition-Typ:
  - bei `AND` konservativ false
  - bei `OR` weitere Bedingungen pruefen
- Keine Cross-Sensor-Daten verfuegbar fuer benoetigte Condition -> false.
- Stale-Sensor-Grenze fuer timer/re-eval: 5 Minuten.

### 3.4 Action-Dispatch und Rueckmeldekanal (ACK/NACK/Status)

**Dispatch**

- `LogicEngine` -> `ActuatorActionExecutor` -> `ActuatorService.send_command(...)`.
- `ActuatorService`:
  - Safety-Validation,
  - MQTT publish actuator command (mit `correlation_id`),
  - Command-History/Audit-Log,
  - WS Events (`actuator_command` oder `actuator_command_failed`).

**Rueckkanal**

- MQTT `.../actuator/{gpio}/response` -> `ActuatorResponseHandler` (success/fail, message, optional `correlation_id`) -> DB-Log + WS `actuator_response`.
- MQTT `.../actuator/{gpio}/status` -> `ActuatorStatusHandler` (Istzustand inkl. Fehler) -> DB-State + WS `actuator_status`.
- Logic-seitig parallel: WS `logic_execution` nach jeder Action-Execution.

**Wichtig**

- Rule-Execution-History erfasst den Erfolg der Rule-Execution-Pipeline, nicht zwingend den finalen Hardware-Endzustand.
- Finales Device-ACK/NACK ist asynchron und entkoppelt.

---

## 4. Konflikt- und Loop-Prevention-Matrix

| Klasse | Erkennung | IST-Strategie | Nachweisbar ueber |
|---|---|---|---|
| Gleichzeitige gegensaetzliche Actions auf gleichem Aktor | `ConflictManager.acquire_actuator(esp,gpio,rule,priority,command)` | Lock pro Aktor, Safety-Prioritaet, sonst prioritaets-/fifo-basiert | Conflict-History, Warnlogs, `god_kaiser_safety_triggers_total` |
| Mehrere Regeln gleiches Ziel | Batch-Locking ueber gesamten Triggerbatch | Winner blockt unterlegene Rules bis Lock-Release | Conflict-History + Lock-Statistiken |
| Prioritaetskollision | Vergleich `effective_priority` | Niedriger Wert gewinnt (plus Safety-Override) | Conflict-Logs |
| Rule-Loop (Definitionsebene) | `LoopDetector` in `LogicValidator.validate()` | Graph-basierte Cycle-Detection vor Save | Validation-Fehler bei Create/Update |
| Thrashing/Flapping nahe Schwelle | `HysteresisConditionEvaluator` | Activate-/Deactivate-Schwellen + persistenter State | `logic_hysteresis_states`, Hysteresis-Logs |
| Trigger-Spam | Cooldown + RateLimiter | Cooldown pro Rule + global/per-ESP/per-hour Limits | Execution-History + Safety-Metric |
| Reconnect-Sturm | Offline-Backoff + reconnect trigger type | 30s Backoff fuer offline targets, invalidation nach Heartbeat online | Heartbeat-/Logic-Logs |
| Time-Window OFF-Spam | Timer OFF-Guard | OFF nur wenn letzte Execution juenger als Fenster (2x cooldown oder 120s) | Timer-Logs + History |
| Rule-Update Flapping | Bumpless transfer + Post-Re-Eval OFF-Guard | Selektiver State-Reset, OFF nur bei realer Deaktivierungslage | `on_rule_updated` Logs + Tests |
| Selbsttrigger durch Actions | Teilweise via LoopDetector, nicht zur Laufzeit global erzwungen | Pre-save Loopcheck; runtimeseitig keine zentrale causal chain guard | Validator-Fehler, Rest = Risiko |

### Loop-Prevention zusammengefasst

1. **Design-Time**: LoopDetector verhindert neue Zyklen bei Save.
2. **Runtime**:
   - Hysterese minimiert Schaltflattern.
   - Cooldown/Rate-Limit begrenzen Wiederholfrequenz.
   - Conflict-Locks verhindern gleichzeitige gegenseitige Ueberschreibung.
3. **Gap**: Keine persistente, kausal verlinkte Rule-to-Rule Ausfuehrungskette fuer harte Runtime-Selbsttrigger-Unterbindung.

---

## 5. Konsistenzanalyse Runtime/UI

### 5.1 Wie Runtime-Status in die UI gelangt

1. **Definitionsebene (Rule-Liste/Detail)**  
   `GET /v1/logic/rules`, `GET /v1/logic/rules/{id}` aus DB.

2. **Execution-Ebene**  
   `GET /v1/logic/execution_history` aus `logic_execution_history`.

3. **Realtime-Ebene**  
   WebSocket Event `logic_execution` (rule/action outcome, trigger snapshot).

4. **Aktor-/Sensor-Realitaet**
   - `actuator_status`, `actuator_response`, `sensor_data`, `esp_health` Events.
   - Diese Events sind fuer echte Zustandsrueckmeldung oft relevanter als das reine Rule-Execution-Event.

### 5.2 Drift-Risiken (Pflichtfaelle)

1. **Rule gespeichert, aber nicht aktiv zur Runtime**
   - Ursache: `enabled=false`, invalid/no matching trigger context, stale sensor data, rate-limit/cooldown block.
   - Sichtbar: Rule in API vorhanden, aber keine aktuellen history/events.

2. **Rule aktiv, aber UI stale**
   - Ursache: WS-Client nicht verbunden/gefiltert/rate-limited; UI liest nur REST-Snapshot.
   - Sichtbar: DB/History zeigt neue Executions, Frontend-Realtime zeigt nicht zeitnah.

3. **Action ausgefuehrt, aber Rule-State unvollstaendig**
   - Ursache: Rule-Execution als success geloggt, aber spaetere actuator_response/status meldet Fehler oder ausbleibenden Endzustand.
   - Sichtbar: `logic_execution.success=true`, aber `actuator_response.success=false` oder fehlende passende Statusaenderung.

### 5.3 Beobachtbare Beweise pro kritischem Zustand

| Kritischer Zustand | Primarbeweis | Sekundaerbeweis |
|---|---|---|
| Rule triggert | `logic_execution_history` Eintrag success | WS `logic_execution` |
| Rule blockiert durch Cooldown | Debug-Logs `_evaluate_rule` | fehlender neuer history-Eintrag trotz Trigger |
| Rate-Limit gegriffen | Warnlog + `increment_safety_trigger()` | `god_kaiser_safety_triggers_total` Anstieg |
| Konflikt blockiert | ConflictManager Warnlog/History | ausbleibende Aktion eines konkurrierenden Rules |
| Hysterese aktiv/deaktiviert | `logic_hysteresis_states` + Hysteresis-Logs | OFF-Action bei Deaktivierungspfad |
| Actuator Command dispatch fail | `actuator_command_failed` WS + Audit/History fail | `god_kaiser_actuator_timeouts_total` |
| Device bestaetigt Command | MQTT response/status handler logs + DB history | WS `actuator_response` / `actuator_status` |
| Rule-Update wirksam | `on_rule_updated` Logs (OFF/reeval) | nachfolgende history/actuator events |
| Reconnect-Reeval gestartet | Heartbeat- und Logic-Logs (`type=reconnect`) | erneute rule execution ohne cooldown-block |
| UI stale vermutet | Diskrepanz REST/History vs WS-Livefeed | WS disconnect metric/logs |

---

## 6. Risiken (Top 10) + Priorisierung

Prioritaetsskala: **P0 kritisch**, **P1 hoch**, **P2 mittel**.

1. **P0 - Prioritaetssemantik widerspruechlich (Schema vs Engine)**  
   Risiko falscher Operator-Erwartung und fehlerhafter Rule-Reihenfolge in Produktion.

2. **P0 - Kein expliziter Rule-Definition-Versionzaehler**  
   Erschwert deterministische UI/Runtime-Koharenz bei konkurrierenden Aenderungen.

3. **P0 - Rule-success != Hardware-success (asynchroner ACK-Kanal)**  
   Kann truegerische "gruen"-Lage in UI erzeugen, obwohl Aktor final fehlschlug.

4. **P1 - Runtime-Selbsttrigger nur partiell abgesichert**  
   Design-Time Loop-Check vorhanden, aber keine globale runtime-kausale Loop-Sperre.

5. **P1 - Drift zwischen WS-Livefeed und REST-Snapshot**  
   Bei WS-Problemen bleibt UI ohne expliziten Reconciliation-Hinweis stale.

6. **P1 - Reconnect-/Rule-Update Sonderpfade komplex und fehleranfaellig**  
   Viele Guards (cooldown bypass, off-guard, stale guard) -> Regressionen wahrscheinlich.

7. **P1 - Toggle-disable OFF ist Best-Effort ohne harte terminale Command-State-Maschine**  
   OFF-Intention wird gesendet, aber finaler Nachweis verteilt auf mehrere Kanaele.

8. **P2 - Validator-Safetychecks weitgehend Warn-orientiert**  
   Fachlich riskante Rule-Kombinationen werden nicht immer hart geblockt.

9. **P2 - Mixed legacy/modular Pfade erhoehen Variantenraum**  
   Fallback-Logik (`_check_conditions_legacy`, `_execute_action_legacy`) erhoeht Testlast.

10. **P2 - Offline-Rules als partielle Runtime-Replik auf ESP koennen Definitionsdrift verursachen**  
    Lokale Rule-Teilmenge auf Device (inkl. Trunkierung/Transform) muss aktiv gegen DB-Stand abgeglichen werden.

---

## 7. Hand-off in P2.5/P2.7

### Hand-off fuer P2.5 (Konsistenz- und Runtime-Vertrag)

1. **Rule-Version einfuehren**
   - Explizites Feld `definition_version` (monoton) in `cross_esp_logic`.
   - Rueckgabe in allen Rule-Responses und WS `logic_execution`.

2. **Execution-Korrelation haerten**
   - Rule-Execution-ID mit `correlation_id`-Bruecke zu actuator_response/status.
   - UI kann dann "Rule fired" vs "Actuator confirmed" sauber trennen.

3. **Priority-Semantik normieren**
   - Eine eindeutige Definition durchgaengig in Schema, API-Texte, Validator, UI.

4. **Runtime-Drift-Detektor**
   - Job/Endpoint: aktive Rules ohne erfolgreiche Execution in Zeitfenster X.
   - Job/Endpoint: execution success ohne passende actuator confirmation in Zeitfenster Y.

### Hand-off fuer P2.7 (Safety und Loop-Haertung)

1. **Runtime causal guard**
   - Persistente Ausfuehrungskette (`triggered_by_rule_id`, depth, window) fuer harte Loop-Abwehr.

2. **Konfliktpolitik formal festziehen**
   - Prioritaetskontrakt + Gleichstandsregel + Safety-Override als testbare Invarianten.

3. **Terminale Action-Bestaetigung fuer safety-kritische Commands**
   - Fuer kritische Aktoren: success erst nach response/status-confirmation.

4. **UI-Reconciliation-Flag**
   - Event/Statusfeld fuer "realtime degraded" (WS down, stale, partial confirmation).

---

### Akzeptanz-Check fuer diesen Auftrag

- [x] Rule-Lifecycle fuer Create/Update/Delete/Runtime vollstaendig beschrieben
- [x] Triggering und Ausfuehrungsreihenfolge klar nachvollziehbar
- [x] Konflikt- und Loop-Schutz explizit und pruefbar dokumentiert
- [x] Konsistenzgrenzen zwischen Rule, Runtime und UI transparent gemacht
- [x] Ergebnis ohne externe Kontextdatei verstaendlich

