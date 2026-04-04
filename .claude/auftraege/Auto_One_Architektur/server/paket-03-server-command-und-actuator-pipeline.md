# Paket 03: Server Command- und Actuator-Pipeline

## 1. Scope und Command-Typen

### Scope

Diese Analyse beschreibt die produktive Server-Pipeline fuer Aktor-Kommandos in `El Servador` ueber den End-to-End-Pfad:

`Ausloeser -> Command-Erzeugung -> Safety-Gate -> Dispatch -> ACK/NACK -> terminaler Zustand`

Abgedeckt sind REST-Ausloeser, Logic-/Automation-Ausloeser, MQTT-Rueckmeldungen, Historisierung, Audit und WebSocket-Sichtbarkeit.

### Produktive Einstiegspunkte

1) **API-getriggerte Commands (direkt)**
- `POST /v1/actuators/{esp_id}/{gpio}/command`  
  Direkter Einzelbefehl (ON/OFF/PWM/TOGGLE) fuer Operator/UI.
- `POST /v1/actuators/emergency_stop`  
  Not-Aus durch OFF-Publish pro Aktor + Broadcast.
- `POST /v1/actuators/clear_emergency`  
  Freigabe des Emergency-Zustands (MQTT clear + DB-State-Clear).

2) **UI-getriggerte Commands**
- Frontend steuert produktiv ueber dieselben REST-Endpunkte wie oben (kein separater WebSocket-Command-Channel fuer Aktoren).

3) **Rule-/Automation-getriggerte Commands**
- Logic Engine (sensor-triggered, timer-triggered, reconnect-triggered, rule-update-triggered) ruft `ActuatorService.send_command(...)` auf.
- Rule-Disable (`POST /v1/logic/rules/{rule_id}/toggle` mit `enabled=false`) erzwingt OFF fuer betroffene Aktoren.

### Command-Klassen

1) **Normal**
- ON/OFF/PWM/TOGGLE aus REST oder Logic Engine.
- Standard-Safety-Validation aktiv.

2) **Kritisch / safety-relevant**
- Rule-konfliktbehaftete Commands (ConflictManager, Prioritaeten, Safety-Flag in Action-Model).
- Auto-OFF bei Heartbeat-Timeout (serverseitige Sicherheitsruecknahme des DB-Zustands + History-Eintrag).

3) **Emergency**
- `emergency_stop`/`clear_emergency`.
- Semantisch absolute Prioritaet; operativ aktuell via Publish/Broadcast umgesetzt.

---

## 2. Command-Lifecycle-State-Machine

### 2.1 Ist-Pipeline (Code-basiert)

1. **CREATE**
- Quelle: REST-Request oder Logic Action.
- `ActuatorService` erzeugt `correlation_id` (UUID) pro Command.

2. **PRECHECK**
- Objekt-/Online-Pruefungen (ESP existiert, Aktor existiert, enabled, online).
- SafetyService-Pruefung (Emergency-Flag, Value-Range, Min/Max, Constraints).

3. **DISPATCH_ATTEMPT**
- MQTT Publish auf `.../actuator/{gpio}/command` mit QoS 2.
- Retry im Publisher (exponential backoff, max attempts konfigurierbar).

4. **DISPATCH_RESULT**
- Publish fail -> sofortiger Fehlerpfad mit History/Audit `success=false`.
- Publish success -> API gibt `command_sent=true, acknowledged=false` zurueck (ACK ist asynchron).

5. **ASYNC_FEEDBACK**
- ESP sendet:
  - `.../actuator/{gpio}/response` (explizite Command-Response),
  - `.../actuator/{gpio}/status` (State-Update),
  - optional `.../actuator/{gpio}/alert` (runtime_protection/safety_violation/emergency_stop/...).
- Server korreliert primär ueber `correlation_id` (falls im Payload enthalten).

6. **PERSIST / OBSERVE**
- Actuator History + Audit + WebSocket-Events werden geschrieben/gesendet.

### 2.2 Normatives terminales Zustandsmodell (fuer P2.x-Vertraege)

`PENDING -> DISPATCHED -> (CONFIRMED | REJECTED | TIMED_OUT | ROLLED_BACK)`

- **CONFIRMED**
  - Nachweis durch positive `response.success=true` oder konsistente statusbasierte Bestaetigung mit passender Korrelation.
- **REJECTED**
  - Safety-Reject vor Dispatch oder NACK/Fehler vom Device.
- **TIMED_OUT**
  - Kein valides ACK/NACK innerhalb Command-Timeout-Fenster.
- **ROLLED_BACK**
  - Nach initialem Versand/Bestaetigungsversuch wird sicherer Zielzustand (typisch OFF) erzwungen, z.B. bei Device-Offline/Recovery-Guard.

### 2.3 Ist-vs-Soll-Gap

- **Ist:** Fuer Aktor-Commands existiert keine serverseitige dedizierte Pending-Command-Tabelle mit Timeout-Uhr und exakt-einem terminalen Status.
- **Ist:** ACK-Verarbeitung ist asynchron und historienbasiert, nicht als harte State-Machine persisted.
- **Soll (dieses Paket):** Terminale Zustandsautoritaet explizit erzwingen (`CONFIRMED`, `REJECTED`, `TIMED_OUT`, `ROLLED_BACK`).

---

## 3. Contract-Matrix fuer Dispatch + ACK/NACK

| Command-Klasse | Ausloeser | Dispatch | Korrelation | ACK/NACK Quelle | Autoritaet finaler Status |
|---|---|---|---|---|---|
| Normal (REST) | `POST /actuators/{esp}/{gpio}/command` | MQTT QoS2 + Retry | `correlation_id` im Payload/Audit/WS | `actuator/response`, `actuator/status`, `actuator/alert` | Derzeit verteilt (History/Audit/Status); soll: dedizierter Command-State |
| Normal (Logic) | LogicEngine Action Executor | MQTT QoS2 + Retry | `correlation_id` + `issued_by=logic:{rule_id}` | wie oben | wie oben |
| Kritisch (Rule disable OFF) | `logic/rules/{id}/toggle` | MQTT QoS2 + Retry | `correlation_id` + `issued_by=rule_toggle:*` | wie oben | wie oben |
| Emergency Stop | `POST /actuators/emergency_stop` | OFF pro Aktor + emergency broadcast | kein einheitlicher command_id; pro Publish + History | indirekt ueber spaetere status/alert/responses | derzeit best effort; soll: globales emergency command tracking |
| Clear Emergency | `POST /actuators/clear_emergency` | MQTT clear_emergency topic | kein eigener request/command state key | spaetere status/heartbeat/alerts | derzeit best effort + DB clear_emergency_states |

### Semantik zu IDs

- **`correlation_id`**: Primaerer technischer Tracking-Key fuer Aktor-Kommandos (generiert im Service, in MQTT transportiert, in Audit/WS weitergegeben).
- **`request_id`**: API-/Context-Korrelation vorhanden, aber nicht primaerer Aktor-Command-Key.
- **`command_id`**: Fuer produktive Aktor-Kommandos derzeit kein durchgaengiger first-class Key implementiert.

---

## 4. Idempotenz- und Duplicate-Strategie

### 4.1 Ist-Zustand

- MQTT QoS2 reduziert Double-Delivery auf Transportebene, ersetzt aber keine fachliche Idempotenz.
- Publisher-Retries koennen Re-Send verursachen (bei unklarer Broker-/Client-Rueckmeldung).
- History/Audit protokollieren Korrelation, aber es gibt keinen harten deduplizierenden `command_id`-Store fuer Aktor-Commands.

### 4.2 Verbindlicher Idempotenz-Schluessel (Soll)

Fuer P2.5/P2.6:

`idempotency_key = hash(esp_id, gpio, normalized_command, normalized_value, duration, issued_by_scope, client_request_token)`

Regeln:
- Bei erneutem Key innerhalb TTL-Fenster: kein neuer fachlicher Dispatch, sondern Re-Use des vorhandenen terminalen Ergebnisses.
- `correlation_id` bleibt Transport-/Tracing-ID; Idempotenz-Key ist fachlicher Dedup-Key.

### 4.3 Duplicate-Regeln

- **DUPLICATE same key + terminal known** -> sofortige Antwort mit bekanntem Terminalstatus.
- **DUPLICATE same key + pending** -> keine zweite Dispatch-Welle; Join auf bestehendes Pending.
- **DUPLICATE mit anderer Payload** -> als neuer Command behandeln (neuer Key).

---

## 5. Retry-/Timeout-/Reconciliation-Regeln

### 5.1 Retry

- **Ist:** Publish-Retry im Publisher (exponential backoff, attempts konfigurierbar).
- **Soll:** Retry nur bis `max_attempts`; danach terminal `TIMED_OUT` oder `REJECTED(DISPATCH_FAIL)` mit eindeutiger Fehlerursache.

### 5.2 Timeout

- **Ist:** Kein dedizierter serverseitiger Aktor-Command-ACK-Timer mit harter Transition.
- **Soll:** Pro Pending-Command ein Ack-Deadline-Timer:
  - kein ACK/NACK bis Deadline -> `TIMED_OUT`
  - danach Reconciliation-Policy ausfuehren.

### 5.3 Reconciliation

1) **ACK verloren (`ACK_LOST`)**
- Device hat ausgefuehrt, Server sah kein ACK.
- Reconcile ueber status/heartbeat/state-snapshot und Korrelation-Heuristik.

2) **ACK verspaetet (`ACK_DELAYED`)**
- ACK nach Timeout.
- Policy: late ACK akzeptieren nur, wenn Command noch im reconciliable Fenster und keine kollidierende neuere Aktion mit hoeherer Version vorliegt.

3) **Finalen Zustand erzwingen**
- Wenn Timeout + unsicherer Device-Zustand:
  - erzwinge sicheren Rueckfall (`ROLLED_BACK`, typischerweise OFF),
  - markiere Ursache und Reconciliation-Quelle.

4) **Autoritaet**
- Server bleibt Zustandautoritaet fuer terminales Command-Resultat, Device bleibt Ausfuehrungsautoritaet fuer tatsaechlichen physischen Aktorzustand.
- Reconciliation verbindet beide Sichten deterministisch.

---

## 6. Failure- und Inkonsistenzrisiken (Top 10)

### F1 - ACK_LOST
- **Detection:** Command ohne ACK, aber spaeter passender Statuswechsel.
- **Sichtbares Symptom:** UI zeigt lange "pending" oder Timeout trotz realer Ausfuehrung.
- **Technische Ursache:** ACK-Nachricht verloren/verzoegert.
- **Gegenmassnahme:** Timeout + statusbasierte Reconciliation + dedizierte late-ACK-Regel.

### F2 - ACK_DELAYED
- **Detection:** ACK kommt nach gesetztem Timeout.
- **Sichtbares Symptom:** Status springt von timed_out auf bestaetigt oder bleibt widerspruechlich.
- **Technische Ursache:** Broker-/Netz-Latenz, ESP-Queue-Verzoegerung.
- **Gegenmassnahme:** Versionierte Command-Generation + akzeptanzfenster fuer late ACK.

### F3 - DISPATCH_FAIL
- **Detection:** Publisher gibt nach Retry `False`.
- **Sichtbares Symptom:** Sofortiger API-Fehler bzw. `actuator_command_failed`.
- **Technische Ursache:** MQTT disconnected, Circuit-Breaker offen, Broker nicht erreichbar.
- **Gegenmassnahme:** Terminal `REJECTED(DISPATCH_FAIL)`, Queue fuer spaetere kontrollierte Wiederholung nur mit Idempotenz-Key.

### F4 - SAFETY_REJECT
- **Detection:** SafetyService `valid=false`.
- **Sichtbares Symptom:** API 4xx / command failed ohne Dispatch.
- **Technische Ursache:** Emergency aktiv, Value out-of-range, offline, disabled, Constraint-Verstoss.
- **Gegenmassnahme:** Striktes Early-Reject, klare Fehlercodes, Audit-Pflicht.

### F5 - DUPLICATE_COMMAND
- **Detection:** Mehrfaches gleiches Kommando in kurzer Zeit mit gleichem fachlichen Inhalt.
- **Sichtbares Symptom:** doppelte History-Eintraege, potenziell doppelte physische Schaltung.
- **Technische Ursache:** Client retries, QoS-Neuzustellung, fehlender serverseitiger Idempotenz-Store.
- **Gegenmassnahme:** Persistente Idempotenz-Keys + Pending-Join.

### F6 - OUT_OF_ORDER_CONFIRMATION
- **Detection:** ACK/Status fuer aelteres Kommando trifft nach neuerem Kommando ein.
- **Sichtbares Symptom:** UI/State springt auf veralteten Zustand.
- **Technische Ursache:** asynchrone Delivery-Reihenfolge, fehlende Command-Versionierung.
- **Gegenmassnahme:** monotone `command_generation` pro `(esp_id,gpio)` und Reject veralteter Bestaetigungen.

### F7 - Emergency-Lock Inkonsistenz
- **Detection:** Nach `emergency_stop` sind neue normale Commands weiter moeglich.
- **Sichtbares Symptom:** Not-Aus wirkt nicht systemisch blockierend.
- **Technische Ursache:** Emergency-Endpunkt setzt SafetyService-Stopflag nicht explizit.
- **Gegenmassnahme:** atomar `emergency_stop_all/esp` + persisted emergency command state.

### F8 - ROLLED_BACK ohne explizite Command-Referenz
- **Detection:** OFF/Reset durch Timeout/Offline ohne Zuordnung zu Ursprungskommando.
- **Sichtbares Symptom:** schwer nachvollziehbare Historie.
- **Technische Ursache:** rollback-artige Safety-Aktionen sind verteilt (heartbeat timeout, alerts), nicht command-zentriert modelliert.
- **Gegenmassnahme:** `rollback_of_command_id` Feld + einheitlicher terminaler ROLLED_BACK-Eintrag.

### F9 - Event-Loop Blocking bei Retry
- **Detection:** Latenzspitzen bei gleichzeitigen Requests/Handlers.
- **Sichtbares Symptom:** verzoegerte API-/MQTT-Verarbeitung unter Last.
- **Technische Ursache:** synchrones `time.sleep()` im Retry-Pfad waehrend async Aufrufkette.
- **Gegenmassnahme:** non-blocking Retry (async sleep / background worker).

### F10 - Multi-Source Confirmation Drift
- **Detection:** `response`, `status`, `alert`, `history`, `ws` liefern widerspruechliche Bilder.
- **Sichtbares Symptom:** Frontend/Logs/Audit zeigen unterschiedliche "Wahrheiten".
- **Technische Ursache:** fehlende zentrale Command-State-Autoritaet.
- **Gegenmassnahme:** Command-State-Store als Single Source of Truth + abgeleitete Views.

---

## 7. Hand-off in P2.5/P2.6/P2.7

### P2.5 (Command-State-Store + Autoritaet)
- Einfuehrung einer persistierten `actuator_command_state` Entitaet:
  - `command_id`, `idempotency_key`, `correlation_id`, `esp_id`, `gpio`, `payload_hash`,
  - `state` (`PENDING|DISPATCHED|CONFIRMED|REJECTED|TIMED_OUT|ROLLED_BACK`),
  - `version/generation`, `deadline_at`, `finalized_at`, `final_reason`.
- Genau-ein-terminaler-Zustand als harte Invariante.

### P2.6 (ACK/NACK + Reconciliation Engine)
- Einheitlicher Resolver fuer `response/status/alert` in einen Command-State.
- Late-ACK und Out-of-Order-Regeln mit Versionspruefung.
- Reconcile-Jobs fuer `ACK_LOST` und `TIMED_OUT`.

### P2.7 (Safety/Emergency Konsolidierung)
- Emergency als first-class command flow:
  - serverseitige Sperre atomar setzen/clearen,
  - klare Autoritaetskette fuer Release,
  - command-zentrierte Auditierbarkeit.
- Rollback-Policy explizit implementieren und als `ROLLED_BACK` persistent markieren.

---

### Akzeptanz-Check fuer dieses Paket

- [x] Lifecycle-Modell ist eindeutig und fuer alle Command-Klassen abgedeckt
- [x] ACK/NACK-Semantik und Autoritaet sind klar definiert
- [x] Idempotenzregeln sind technisch pruefbar beschrieben
- [x] Retry/Timeout/Reconciliation ist fuer Teilausfallfaelle konsistent beschrieben
- [x] Ergebnis ist ohne externe Kontextdatei voll verstaendlich

