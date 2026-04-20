# RUN-FORENSIK-REPORT (EA5484, Cross-ESP/Transport/Config)

Datum: 2026-04-17  
Incident: `INC-2026-04-11-ea5484-mqtt-transport-keepalive`  
Scope dieses Reports: Vollständige Fehlerzusammenfassung auf Basis echter Run-Logs (`terminal 35`) plus Code-Abgleich in Firmware (`El Trabajante`), Server (`El Servador`) und MQTT-Schicht.

---

## 1) Quellenlage und Methode

Ausgewertete Primärquellen:

- Lauf-Log: `terminals/35.txt` (EA5484-Run mit Boot, Config, Commands, Transportabbrüchen)
- Incident-Artefakte:
  - `INCIDENT-LAGEBILD.md`
  - `CORRELATION-MAP.md`
  - `TASK-PACKAGES.md`
  - `VERIFY-PLAN-REPORT.md`
- Firmware-Code (ESP32):
  - `El Trabajante/src/main.cpp`
  - `El Trabajante/src/services/communication/mqtt_client.cpp`
  - `El Trabajante/src/services/config/config_manager.cpp`
  - `El Trabajante/src/tasks/command_admission.cpp`
  - `El Trabajante/src/tasks/actuator_command_queue.cpp`
  - `El Trabajante/src/services/safety/offline_mode_manager.cpp`
  - `El Trabajante/src/tasks/emergency_broadcast_contract.h`
- Server-Code:
  - `El Servador/god_kaiser_server/src/services/esp_service.py`
  - `El Servador/god_kaiser_server/src/services/logic_engine.py`
  - `El Servador/god_kaiser_server/src/api/v1/actuators.py`

Methodik:

- Timeline aus echten Laufzeilen rekonstruiert
- Jede Fehleraussage gegen Codepfad verifiziert
- Fehler in voneinander getrennte Cluster aufgeteilt (Transport, Config-Finalität, Admission, Security/Contract, Ressourcen)

---

## 2) Executive Summary (alle bestätigten Fehler, Stand 2. Analyse-Pass)

### F-01 (kritisch): MQTT-Transport instabil (Fehlerbild hat sich zwischen den Läufen geändert)

Symptome:

- Aktueller Lauf: `esp-tls select() timeout` und `ESP_ERR_ESP_TLS_CONNECTION_TIMEOUT` im Connect-Pfad.
- Frühere Läufe: `Writing didn't complete`/`sock_errno` im Write-Pfad (unter Last).
- Broker-Korrelation: wiederholte kurze Sessions mit `Client ... disconnected: connection closed by client` für `ESP_EA5484`; parallel bei `ESP_6B27C8` zeitweise `session taken over` bzw. `exceeded timeout`.

Code-/System-Korrelation:

- Transportfehler werden in `mqtt_event_handler` erfasst, bei Disconnect wird 3014 geloggt.
- P4-Safety reagiert korrekt: Grace-Phase, danach `OFFLINE_ACTIVE` falls Reconnect ausbleibt.
- Nach manueller Intervention (zweites ESP kurz getrennt + Reset) stabilisierte sich die Strecke wieder.

Bewertung:

- Primärer Fehlercluster bleibt Transport-/Session-Instabilität im Mehrgerätebetrieb.
- Wichtig: Das frühere Write-Timeout-Fehlerbild wurde durch die Firmware-Anpassung entschärft; residual dominieren Connect-Timeout/Jitter und Recovery-Folgen.

---

### F-02 (mittel-hoch): Outbox-/Publish-Druck ist als Verstärker bestätigt (nicht in jedem Run dominant)

Symptome (historisch bestätigt):

- Früherer Run: `OUTBOX: outbox_enqueue(46): Memory exhausted`.
- Danach `Publish failed ... system/intent_outcome/lifecycle` und Error 3012.
- Mehrfach `SafePublish failed after retry`.
- Jüngster Run: diese Signatur nicht dominierend, hier war der Connect-Timeout-Pfad im Vordergrund.

Code-Korrelation:

- ESP-IDF-Publish-Pfad nutzt Outbox; bei Kapazitätsproblemen werden kritische Publishes nicht sicher zugestellt.
- Heartbeat-Payload wird bei knapper Headroom reduziert (`skipping gpio_status`), was den Druck dämpfen soll, aber den Kernfehler nicht beseitigt.

Bewertung:

- Validierter Sekundärcluster aus der Incident-Historie; verstärkt Transportprobleme und Finalitätslücken.

---

### F-03 (hoch): `CONFIG_PENDING_AFTER_RESET` blockiert Aktor-Befehle (sichtbarer Cross-ESP-Effekt)

Symptome:

- Mehrfach `Actuator command rejected: CONFIG_PENDING_AFTER_RESET` (GPIO 14/25), bevor Config vollständig ist.
- Gleichzeitig `Pending exit blocked: MISSING_ACTUATORS (sensors=4, actuators=0, offline_rules=1)`.
- Zustand tritt auch nach erfolgreichem MQTT-Reconnect auf, solange Konfig-Konsistenz fehlt.

Code-Korrelation:

- `shouldAcceptCommand(...)` blockiert Aktor-Commands in `STATE_CONFIG_PENDING_AFTER_RESET` (nur Recovery/Config/Allowlist-Systembefehle erlaubt).
- Queue-Worker publiziert dann Intent-Outcomes als `rejected`.
- Exit aus Pending erfolgt erst bei Readiness-Entscheidung (`evaluatePendingExit`).

Bewertung:

- Verhalten ist designkonform (Safety/Admission), aber operativ kritisch sobald Cross-ESP-Logik vor Device-Readiness Befehle sendet.
- Haupttreiber hier: Runtime-Konfig-Konsistenz (`offline_rules` vorhanden, aber `actuators=0`).

---

### F-04 (mittel-hoch): Heartbeat-ACK triggert weiterhin persistente Approval-Writes

Symptome im Run:

- Regelmäßig: `ConfigManager: Device approval saved ... state_changed=false, ts_changed=true`
- Wiederholt in Heartbeat-Kadenz.

Code-Korrelation:

- `setDeviceApproved(...)` soll idempotent sein, schreibt aber weiterhin bei jedem neuen Timestamp (`ts_changed=true`).
- Damit bleibt unnötige NVS-Schreiblast aktiv.

Bewertung:

- Kein sofortiger Crash-Trigger, aber ein echter Verstärker für Last/Jitter/Flash-Wear und damit für fragile Kommunikationslagen.

---

### F-05 (mittel): Security-Policy „fail-open“ bei Emergency-Token

Symptome im Run:

- `ESP emergency accepted (no token configured - fail-open)`
- `AUTHORIZED EMERGENCY-CLEAR TRIGGERED` nach Emergency-Topic.

Code-Korrelation:

- In `main.cpp` sind sowohl ESP-emergency als auch broadcast-emergency bei fehlendem Token explizit fail-open.

Bewertung:

- Funktional beabsichtigt für bestimmte Betriebsmodi, aber sicherheitlich riskant im Feldbetrieb.

---

### F-06 (mittel, cross-device/contract): Broadcast-Emergency Command-Contract-Mismatch (3016-Pfad)

Befund:

- Firmware akzeptiert im Broadcast-Contract nur `stop_all` oder `emergency_stop`.
- Server-Broadcast baut `command: "EMERGENCY_STOP"` (Uppercase).
- Das kann auf Firmware-Seite `EMERGENCY_CONTRACT_MISMATCH` triggern und über `ERROR_MQTT_PAYLOAD_INVALID` als 3016 sichtbar werden.

Code-Korrelation:

- Server: `api/v1/actuators.py` (Broadcast-Payload)
- Firmware: `tasks/emergency_broadcast_contract.h` + Verarbeitung in `main.cpp`

Bewertung:

- Harte Vertragsinkonsistenz zwischen Schichten. Passt zur separat beobachteten 3016-UI-Meldung (anderes Gerät im Screenshot).

---

### F-07 (mittel): Config-Timeouts im Frontend sind Folge fehlender terminaler Config-Finalisierung unter Transportstress

Befund:

- UI zeigt wiederkehrende `Konfigurations-Timeout`-Toasts.
- Server sendet bei `send_config` ein `config_published` mit `correlation_id`; terminale Finalität kommt erst via Firmware `config_response` oder `config_failed`.
- Unter Transport-/Outbox-Problemen verzögert oder fehlt diese Finalisierung.

Bewertung:

- Kein isolierter UI-Bug, sondern Lifecycle-Lücke bei gestörter MQTT-Strecke und/oder dauerhaftem Pending-State.

---

### F-08 (mittel): WS-Contract-Mismatch bei `config_response` (Envelope vs Payload)

Befund:

- Im Server-Lauf wurde ein `contract_mismatch` gemeldet, weil die Envelope-`correlation_id` (`unknown:...`) von der Payload-`correlation_id` abwich.

Code-Korrelation:

- Sichtbar im WebSocket-/Contract-Pfad beim Handling/Broadcast von `config_response`.

Bewertung:

- Kein Primärtreiber für Disconnects, aber relevant für saubere Korrelation, UI-Finalität und Incident-Observability.

---

## 3) Konkrete Ablaufketten aus dem System (rekonstruiert)

### Ablauf A: Boot → Pending → Command-Rejects → (teilweise) Recovery

1. Boot mit partieller Runtime (`sensors=4`, `actuators=0`, `offline_rules=1`)
2. Zustand bleibt `CONFIG_PENDING_AFTER_RESET` (Exit blockiert wegen `MISSING_ACTUATORS`)
3. Eingehende Aktor-Befehle werden mehrfach geblockt (`CONFIG_PENDING_AFTER_RESET`)
4. MQTT-Reconnect kann erfolgreich sein (ACK/Subscriptions wieder da).
5. Pending-State bleibt dennoch blockiert, solange `MISSING_ACTUATORS` besteht.
6. Aktor-Commands bleiben in dieser Phase weiter abgewiesen.

Interpretation:

- Admission/Safety arbeitet korrekt; das operative Problem ist die fehlende Konfig-Konsistenz bei gleichzeitiger Cross-ESP-Command-Last.

---

### Ablauf B: Stabilisierung kurzzeitig → (historisch) Outbox-Druck → Disconnect-Kaskade

1. Nach erfolgreichem Config-Rejoin laufen Commands/Heartbeats zunächst
2. `outbox_enqueue ... Memory exhausted` tritt auf
3. Kritischer Lifecycle-Publish (`intent_outcome/lifecycle`) schlägt fehl (3012)
4. TCP write-Fehler / `Writing didn't complete` folgen
5. Disconnects häufen sich, Reconnects bleiben fragil
6. Nach Grace: `OFFLINE_ACTIVE`

Interpretation:

- Ressourcen-/Backpressure-Pfad und Transportpfad verstärken sich gegenseitig; im jüngsten Lauf war der Connect-Timeout-Pfad dominanter.

---

### Ablauf C: Emergency-Pfad mit Fail-Open

1. Emergency-Topic wird empfangen (`.../actuator/emergency`)
2. Token in NVS fehlt
3. Firmware akzeptiert dennoch (fail-open)
4. Emergency-clear wird ausgeführt

Interpretation:

- Kein Parsing-Fehler, sondern bewusst permissive Sicherheitskonfiguration.

---

## 4) Root-Cause-Cluster und Wechselwirkungen

### RC-Cluster 1: Transport-/Session-Instabilität (Mehrgeräte-Reconnect-Fenster)

Evidenz:

- Wiederkehrende TLS-connect timeouts (`ESP_ERR_ESP_TLS_CONNECTION_TIMEOUT`)
- Wiederkehrende MQTT disconnect events mit späterem Reconnect
- Broker-seitig kurze Sessions, teils clientseitig initiierte Disconnects
- Keine OOM-Signatur als Primärursache (Heap bleibt grundsätzlich vorhanden)

Wirkung:

- Messdaten/Publishes fallen aus
- Config-/Intent-Finalität wird unzuverlässig
- Safety-P4 muss häufiger übernehmen

---

### RC-Cluster 2: Publish-Backpressure/Outbox-Erschöpfung (historisch bestätigt)

Evidenz:

- `outbox_enqueue ... Memory exhausted`
- `Publish failed ... intent_outcome/lifecycle`
- `SafePublish failed after retry`

Wirkung:

- Gerade Kontroll-/Lifecycle-Nachrichten gehen verloren oder verspätet raus
- Frontend sieht Timeouts statt sauberer terminaler Events

---

### RC-Cluster 3: Recovery-State-Mismatch (Cross-ESP sendet vor Device-Readiness)

Evidenz:

- Mehrfache Command-Rejects im Pending-State
- Später dieselben Command-Typen erfolgreich nach OPERATIONAL

Wirkung:

- Für Nutzer wirkt es wie „Cross-ESP-Logik läuft nicht sauber“, tatsächlich ist es überwiegend ein Readiness-/Admission-Problem.

---

### RC-Cluster 4: Contract-/Policy-Inkonsistenzen

Evidenz:

- Broadcast-Emergency Command-Case-Mismatch
- Fail-open bei fehlendem Emergency-Token
- ACK-Approval-Persistenz schreibt häufiger als beabsichtigt
- WS-Envelope/Payload-Korrelation bei `config_response` nicht immer konsistent

Wirkung:

- 3016-Symptome möglich (contract mismatch)
- unnötige Last, Korrelation-Noise und Sicherheitsunschärfe

---

## 5) Vollständige Fehlerliste (konsolidiert)

1. MQTT-Transport/Session instabil im Mehrgeräte-Reconnect-Fenster (TLS-Connect-Timeouts, Disconnects)  
2. Historisch: MQTT Outbox erschöpft (`outbox_enqueue memory exhausted`)  
3. Historisch: Kritische Lifecycle-Publishes fallen aus (u. a. `intent_outcome/lifecycle`, 3012)  
4. Historisch: Wiederholte SafePublish-Retry-Fehlschläge  
5. Heartbeat-Payload wird bei knapper Headroom degradiert (`gpio_status` weg)  
6. Recovery-Phase blockiert Aktor-Commands (`CONFIG_PENDING_AFTER_RESET`)  
7. Pending-Exit blockiert (`MISSING_ACTUATORS`: `offline_rules` vorhanden, `actuators=0`)  
8. Wiederholte Approval-NVS-Writes trotz beabsichtigter Idempotenz (state unchanged, timestamp changed)  
9. Emergency-Pfad akzeptiert ohne Token (fail-open)  
10. Broadcast-Emergency Contract-Inkonsistenz (Uppercase vs erwartete Werte) mit 3016-Risiko  
11. Frontend-Config-Timeouts als Folge ausbleibender/verspäteter terminaler Config-Finalität  
12. WS-Contract-Mismatch bei `config_response`-Korrelation (Envelope/Payload-Abweichung)

---

## 6) Priorisierte Maßnahmen (aus Befund abgeleitet)

### P0 (sofort)

- Transport-/Broker-Fenster stabilisieren (TLS/Netz/Broker-Limits mit Zeitfenster-Korrelation)
- Pending-Blockade auflösen: Konfig-Pipeline prüfen, damit bei `offline_rules` nicht dauerhaft `actuators=0` verbleibt
- Lifecycle-Publishes robust machen (Outbox-/Retry-Strategie für `intent_outcome`-Kanäle)
- Broadcast-Emergency Contract angleichen (einheitlicher Command-Wert zwischen Server/Firmware)

### P1 (kurzfristig)

- Approval-Persistenz wirklich deduplizieren (kein NVS-Write pro Heartbeat-ACK ohne fachlichen Zustandswechsel)
- Cross-ESP-Kommandoauslösung an Device-Readiness koppeln (serverseitig/fachlich), um Pending-Reject-Stürme zu vermeiden
- WS-Contract-Enrichment für `config_response` korrigieren (Envelope-/Payload-`correlation_id` konsistent)

### P2 (härtung)

- Fail-open im Emergency-Pfad als explizite Betriebsoption absichern (Prod-Default fail-closed)
- Telemetrie für Config-Finalitätslatenz (`config_published` → terminal event) als SLO erfassen

---

## 7) Offene Punkte / notwendige Zusatz-Evidenz

- Broker-/Server-Rohlogs im identischen UTC-Fenster zum Device-Log (inkl. Session-Events `connection closed by client` vs `exceeded timeout`)
- Vergleich mit betroffenem Zweitgerät aus UI-Screenshot (ESP_6B27C8), um 3016-Contract-Pfad direkt zu bestätigen
- Korrelation von `correlation_id` über REST → WS → MQTT für die konkret timeoutenden Config-Vorgänge
- Verifikation, warum `config_response` teils mit `unknown:*` Envelope-Korrelation im WS-Pfad erscheint

---

## 8) Abschlussbewertung

Der Incident zeigt keinen Einzelfehler, sondern eine gekoppelte Fehlerkette mit wechselndem Schwerpunkt:

- **Transport/Session instabil** im Mehrgeräte-Reconnect-Fenster (aktueller Schwerpunkt),  
- dadurch laufen **Config-/Command-Lifecycles asynchron**,  
- und die **Cross-ESP-Logik** wirkt im Betrieb „unsauber“, weil Kommandos im Pending-State bewusst abgewiesen werden.  
- **Outbox-/Publish-Backpressure** ist als historischer Verstärker bestätigt und bleibt relevant.  

Zusätzlich bestehen zwei strukturelle Kanten mit hoher Relevanz:

- **Emergency-Contract-Mismatch** (3016-Pfad möglich)  
- **Fail-open Security-Policy** bei fehlendem Token  
- **WS-Korrelations-Mismatch** bei `config_response` als zusätzlicher Finalitäts-/Observability-Störfaktor.

