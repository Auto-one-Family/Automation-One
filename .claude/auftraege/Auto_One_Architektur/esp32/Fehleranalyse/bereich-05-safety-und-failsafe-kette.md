# Bereich 05A - Safety und Failsafe-Kette

> Stand: 2026-04-05  
> Scope: Emergency-Stop, Queue-Interlocks, ACK-/Disconnect-Uebergaenge, Offline-Failsafe.

## 1) Was war veraltet?

### Veraltet A - "Emergency ist nicht transaktionssicher, Queue-Tail bleibt aktiv" (teilweise falsch)

- Der alte Text unterstellte, dass enqueued Kommandos nach Notstopp unkontrolliert nachlaufen.
- Aktueller Code verarbeitet `NOTIFY_EMERGENCY_STOP` im Safety-Task in fester Reihenfolge: zuerst `bumpSafetyEpoch(...)`, danach explizit beide Queues (`flushActuatorCommandQueue()`, `flushSensorCommandQueue()`), dann `emergencyStopAll(...)`.
- Ausnahme Legacy-Pfad `MQTT_USE_PUBSUBCLIENT`: Systembefehl `safe_mode` flusht die Queues und ruft `emergencyStopAll(...)` ohne vorangehenden `bumpSafetyEpoch(...)` auf (alle anderen Emergency-Pfade im selben Build setzen den Epoch weiterhin).
- Delta: Risiko ist nicht mehr "unguardierter Queue-Tail", sondern verbleibend nur noch "verteilte Trigger-Pfade muessen alle denselben Ablauf nutzen".

### Veraltet B - "ACK/Disconnect fuehrt typischerweise zu False-Positive-Safe-Transitions" (zu pauschal)

- Der alte Text bildet den inzwischen eingebauten Guard-Satz nicht ab:
  - `onMqttConnectCallback()` setzt ACK-Zeitstempel neu,
  - ACK-Contract wird fail-closed validiert (`status`, `handover_epoch`, Typpruefung, Epoch-Match),
  - Timeout-Guard (`g_server_timeout_triggered`) verhindert Mehrfach-Transitions,
  - stale `server/status offline` Retains werden direkt nach Reconnect verworfen.
- Delta: Das Risiko ist von "hoch, generisch" auf "restlich bei Contract-Verletzungen/Netzrandfaellen" reduziert.

### Veraltet C - "SafetyController-Bypass ist aktuell als konkrete Luecke nachgewiesen" (so nicht belegt)

- Direktzugriffe auf Aktor-Treiber ausserhalb des `ActuatorManager` sind im aktuellen Stand nicht als reale Callsite nachgewiesen.
- Die Sicherheitskette wird ueber `SafetyController` + `ActuatorManager` + Driver-`emergencyStop()` gefahren.
- Delta: Bypass bleibt als Architektur-Risiko (fehlender hart erzwungener Compile-Gate), aber nicht als aktuell reproduzierter Defekt.

## 2) Was ist jetzt der IST-Stand?

### SAF-IST-001 - Emergency-Stop-Pfad ist mehrstufig gehaertet

- ESP- und Broadcast-Emergency werden getrennt verarbeitet (jeweils eigener Topic-Zweig, Auth-Token-Keys getrennt).
- Broadcast-Payload laeuft durch Contract-Validierung; bei `critical_unknown` wird explizit failsafe-stop ausgelost (`triggerBroadcastEmergencyStop(...)`).
- Standard-Build (ESP-IDF MQTT, ohne `MQTT_USE_PUBSUBCLIENT`): Stopp laeuft ueber `NOTIFY_EMERGENCY_STOP` an den Safety-Task (Core 1) mit Epoch-Bump, Queue-Flush und `emergencyStopAll(...)`.
- Legacy-Build `MQTT_USE_PUBSUBCLIENT`: ESP-Emergency und Broadcast-Notstop werden im MQTT-Callback synchron mit Flush, Epoch-Bump und `emergencyStopAll(...)` ausgefuehrt; bei `safe_mode` entfaellt der Epoch-Bump (siehe Veraltet A).

### SAF-IST-002 - ACK-/Disconnect-Kette ist fail-closed modelliert

- Heartbeat-ACK ohne gueltigen Contract wird verworfen und als Contract-Mismatch gezaehlt.
- Offline-Mode-Uebergaenge nutzen Handover-Epoch-Validierung (`validateServerAckContract`), inklusive Reject-Codes.
- ACK-Timeout fuehrt immer in P4-Disconnect-Pfad; bei 0 Offline-Rules wird sofort Safe-State gesetzt.

### SAF-IST-003 - Offline-Failsafe unterscheidet korrekt zwischen "mit Regeln" und "ohne Regeln"

- `offline_rule_count == 0`: sofort `setAllActuatorsToSafeState()` (default_state-basiert), zusaetzlich Defense-in-Depth beim Eintritt in `OFFLINE_ACTIVE`.
- `offline_rule_count > 0`: delegierter P4-Pfad mit Grace-Delay, periodischer Rule-Evaluation und Handover-Adoption.

### SAF-IST-004 - Emergency-Clear hat formale Verifikation, aber nur baseline-stark

- `clearEmergencyStop()` prueft `verifySystemSafety()` vor dem Clear.
- Aktuell prueft `verifySystemSafety()` ein Mindestfenster (`verification_timeout_ms` seit `emergency_timestamp_`), verwirft bei `max_retry_attempts == 0`, und kurzschliesst bei `verification_timeout_ms == 0` oder fehlendem Zeitstempel — nicht auf einer vollstaendigen Hardware-/Sensor-Readiness-Matrix.

## 3) Welche Restluecken bleiben?

### FA-SAF-001 - Emergency Auth bleibt fail-open bei leerem Token (kritisch)

- **Befund:** Wenn `emergency_auth` bzw. `broadcast_em_tok` im NVS-Namespace `system_config` leer sind, werden die zugehoerigen Emergency-Kommandos explizit akzeptiert ("fail-open").
- **Risiko:** Unerwuenschte/unauthorisierte Emergency-Ausloesung im Feldbetrieb bei Fehlkonfiguration.
- **Prioritaet:** kritisch
- **Verifikation noetig:** Feldrichtlinie, dass Token provisioning-pflichtig ist und leerer Token als Deploy-Fehler blockiert wird.

### FA-SAF-002 - Kein harter Build-/Runtime-Gate gegen Umgehung der Safety-Eingangspunkte (hoch)

- **Befund:** Safety-Aufrufe sind konventionell zentralisiert, aber nicht formal erzwungen (z. B. kein dedizierter "Safety-only command gate").
- **Risiko:** Zukuenftige Aenderungen koennen versehentlich Aktorpfade ohne Safety-Gate einfuehren.
- **Prioritaet:** hoch
- **Verifikation noetig:** Architekturtest/Static-Check auf erlaubte Aktor-Entry-Points.

### FA-SAF-003 - Blocking Delay im Recovery-Pfad (`resumeOperation`) (hoch)

- **Befund:** `SafetyController::resumeOperation()` nutzt `delay(recovery_config_.inter_actuator_delay_ms)` (Default 2000 ms); produktiver Aufruf aus `routeIncomingMessage` (MQTT-Router) nach erfolgreichem `clearEmergencyStop()`.
- **Risiko:** Blockierende Sequenz im MQTT-Nachrichtenpfad haelt weitere MQTT-Verarbeitung fuer die Delay-Dauer auf und kann Reaktionszeit/Fairness verschlechtern.
- **Prioritaet:** hoch
- **Verifikation noetig:** Nachweis, auf welchem Thread/Kontext `resumeOperation()` produktiv laeuft, und ob Non-Blocking-Umstellung erforderlich ist.

### FA-SAF-004 - Safe-State semantisch von `default_state` abhaengig (mittel)

- **Befund:** Bei ACK-Timeout/Disconnect ohne Regeln wird auf `default_state` geschaltet, nicht auf hartes "alle OFF".
- **Risiko:** Falsch konfigurierte Defaults koennen ein "technisch safe" aber fachlich ungewolltes Verhalten erzeugen.
- **Prioritaet:** mittel
- **Verifikation noetig:** Policy-Check, dass `default_state` je Aktor als sicherer Zustand auditiert wird.

## 4) Was wurde in der Datei konkret angepasst?

- Reality-Check gegen `El Trabajante/src` (2026-04-05): Reihenfolge im Safety-Task, Legacy-`safe_mode`-Ausnahme, `verifySystemSafety`-Semantik, Aufrufkontext von `resumeOperation`, konkrete NVS-Keys fuer Fail-open.
- Alte pauschale Findings FA-SAF-002/003/004 wurden auf aktuellen Code-Stand neu bewertet (nicht blind fortgeschrieben).
- Die Datei ist auf vier Pflichtbloecke umgestellt: veraltet -> IST -> Restluecken -> konkrete Anpassungen.
- Neue Restluecken sind priorisiert und mit "Verifikation noetig" versehen.
- Der Bereich heisst nun explizit "05A", konsistent zur Schrittkette.

## Abnahmekriterien (harte Gates fuer Schritt 5)

- **AK-05A-01 (Bestanden/Nicht bestanden):** Emergency-Stop-Pfad dokumentiert im Safety-Task die Reihenfolge Epoch-Bump, Queue-Flush, `emergencyStopAll`; Ausnahme `safe_mode` unter `MQTT_USE_PUBSUBCLIENT` ohne Epoch-Bump genannt.
- **AK-05A-02 (Bestanden/Nicht bestanden):** ACK-Contract-Pruefungen (status + handover_epoch + Typ + Epoch-Match) sind als fail-closed beschrieben.
- **AK-05A-03 (Bestanden/Nicht bestanden):** Veraltete Aussagen wurden explizit als veraltet markiert und durch IST-Befunde ersetzt.
- **AK-05A-04 (Bestanden/Nicht bestanden):** Mindestens ein kritisches und ein hohes Restrisiko sind reproduzierbar begruendet und priorisiert.
- **AK-05A-05 (Bestanden/Nicht bestanden):** Offene Punkte sind explizit als "Verifikation noetig" markiert.
