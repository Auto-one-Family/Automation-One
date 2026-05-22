# Bericht: ESP32 Netzwerk-/MQTT-Instabilität und State-Latenz

Datum: 2026-05-17  
Autor: Codex (Analyse auf Basis vorhandener Artefakte, **ohne** neue Disconnect-Tests)

## 1) Ziel und Scope

Dieser Bericht bewertet:

1. den Stand der bereits gemachten Änderungen (deine Session + meine Änderungen),
2. die relevanten Logs zur Root-Cause-Eingrenzung,
3. die neue Beobachtung: **State-Antworten vom ESP kommen teils erst nach mehreren Sekunden**,
4. eine systematische Strategie für Firmware + Docker-Stack.

Es wurden **keine neuen Netzwechsel/Disconnect-Tests** durchgeführt.

## 2) Verwendete Datenquellen

- Code-Änderungen (Working Tree):
  - `El Trabajante/src/main.cpp`
  - `El Trabajante/src/services/communication/mqtt_client.cpp`
  - `El Trabajante/src/services/communication/wifi_manager.cpp`
  - `El Trabajante/src/tasks/communication_task.cpp`
  - `El Trabajante/src/tasks/publish_queue.h`
  - `El Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py`
  - `El Servador/god_kaiser_server/src/db/repositories/esp_repo.py`
  - `El Frontend/src/stores/esp.ts`
  - `scripts/hardware/repro_disconnect_esp32.sh`, `scripts/hardware/verify_disconnect_fix.sh`
- Laufartefakte:
  - `logs/current/hardware/disconnect-repro/20260517_084454`
  - `logs/current/hardware/disconnect-repro/20260517_094620`
  - `logs/current/hardware/disconnect-repro/20260517_103356`
  - `logs/current/hardware/disconnect-repro/20260517_105021`
  - plus aggregierte `run_summary.json`-Auswertung mehrerer 20260517-Runs
- Zusammenfassungen:
  - `logs/current/hardware/disconnect-repro/verify_disconnect_fix_latest.json`
  - `/home/robin/.cursor/debug-6dd16c.log`

## 3) Executive Summary (kurz)

- Der ursprüngliche Disconnect-/Takeover-Komplex ist **teilweise verbessert**, aber **nicht vollständig eliminiert**.
- Die neue Verzögerung bei ON/OFF-State-Antworten ist **klar reproduzierbar** und korreliert mit:
  1) massivem Queue-Pressure,
  2) neuem Deferral-Verhalten für kritische Topics (u. a. `actuator/.../response`),
  3) wiederholtem 1s-Requeue unter Pressure.
- Es gibt zusätzlich ein Messartefakt-Risiko: einzelne Verifikationsläufe sind unvollständig (z. B. 094620 ohne `run_summary.json`), wodurch Kurzreports zu optimistisch sein können.

## 4) Befunde mit Belegen

## F1 (hoch): Neue State-Latenz wird durch Critical-Defer-Logik unter Queue-Pressure verursacht

### Beobachtung

In den relevanten Läufen (insb. `20260517_103356`, `20260517_105021`) werden kritische Antworten (`actuator/.../response`) sehr häufig um jeweils 1000 ms verschoben.

### Log-Belege

- `20260517_105021/esp32_serial.log`:
  - sehr viele Zeilen `queue drain deferred critical under pressure ... topic=.../actuator/25/response`
  - zusätzlich Drops: `Publish retry queue full during backoff, dropping: .../actuator/25/response`
- `20260517_103356/esp32_serial.log`:
  - gleiche Deferral-Muster für `.../actuator/14/response` und `.../actuator/25/response`
  - Queue-Age-Spitzen bei Aktorverarbeitung bis >2s (`queue_age_ms=2113`)

### Quantitative Belege (aus Logs extrahiert)

- Run `20260517_103356`:
  - `actuator queue dequeue queue_age_ms`: p50=892 ms, p95=1762 ms, max=2113 ms
  - `actuator execute result exec_ms`: max=915 ms
  - `queue drain deferred critical under pressure`: 862 Events
- Run `20260517_105021`:
  - `queue_age_ms`: p50=8 ms, p95=201 ms, max=260 ms (besser als 103356, aber weiterhin Pressure)
  - `queue drain deferred critical under pressure`: 987 Events
  - Response-Drops: `retry_drop_actuator_response=2`

### Code-Beleg (Ursachenpfad)

- `El Trabajante/src/tasks/publish_queue.h`:
  - Watermark wurde auf `PUBLISH_QUEUE_SHED_WATERMARK = 4` abgesenkt (früheres Eingreifen).
- `El Trabajante/src/services/communication/mqtt_client.cpp`:
  - `publish()`: kritische Direktpublishes werden bei `fill >= watermark` in Queue umgeleitet.
  - `processPublishQueue()`: kritische Queue-Elemente werden bei Pressure mit `next_retry_ms = now + 1000` requeued und der Loop bricht ab.
  - Das betrifft explizit auch `.../actuator/.../response`.

### Bewertung

Die Logik schützt vor blockierenden Socket-Calls, erhöht aber in Pressure-Phasen direkt die Ende-zu-Ende-Latenz der finalen State-Antwort.  
Das passt exakt zu deiner Beobachtung („finale Antwort erst mehrere Sekunden später“).

---

## F2 (hoch): Session-Takeover ist reduziert, aber weiterhin vorhanden

### Beobachtung

In neueren Runs ist `exceeded timeout` nicht mehr dominant, aber `session taken over` tritt weiterhin auf.

### Belege

- `20260517_105021/mqtt_broker.log`:
  - `Client ESP_EA5484 ... disconnected: session taken over.`
  - direkt danach neuer Connect mit `k90`: `New client connected ... as ESP_EA5484 (p4, c1, k90).`
- `20260517_103356/mqtt_broker.log`:
  - kein Takeover, stattdessen sauberes `connection closed by client` vor Reconnect.

### Bewertung

Die neuen Disconnect-Guards (MQTT vor WiFi-Handover trennen, WiFi-loss-forced-disconnect) wirken, sind aber noch nicht in jedem Lauf hinreichend.

---

## F3 (mittel): Verifikations-Reporting ist teilweise inkonsistent bei unvollständigen Runs

### Beobachtung

Run `20260517_094620` hat `VERIFY_FIX_REPORT.md`, aber keine `SUMMARY.md` und kein `run_summary.json`.

### Belege

- `20260517_094620/VERIFY_FIX_REPORT.md`:
  - `Summary vorhanden: False`
  - `run_summary.json vorhanden: False`
  - dennoch textliches „Kein Disconnect im Lauf beobachtet.“

### Bewertung

Solche Kurzreports können ohne vollständige Summary zu falsch-sicheren Aussagen führen. Für Entscheidungen sollten nur komplette Runs (`run_summary.json` vorhanden) als belastbar gelten.

---

## F4 (mittel): Testlast im Docker-Stack ist hoch und verschiebt den Schwerpunkt von „Netzproblem“ zu „Stauproblem“

### Beobachtung

Broker-Logs zeigen sehr viele `auto-*` Clients im selben Capture-Fenster; parallel starke Queue-Pressure im ESP.

### Belege

- `20260517_105021/mqtt_broker.log`: große Anzahl `New client connected ... as auto-...`
- `20260517_105021/server.log`: `Queue pressure event ... fill_level=5`
- Serial: zahlreiche `Publish queue full`, `queue drain deferred critical under pressure`, `outbox lock hold`

### Bewertung

Die Messung ist real, aber mischt mehrere Effekte:

1. Netzwerk-/Session-Robustheit  
2. Last-/Backpressure-Resilienz  
3. UI-wahrgenommene Steuerlatenz

Diese Achsen müssen für saubere Ursachenbeweise getrennt werden.

## 5) Stand der Änderungen (Analyse)

## 5.1 Firmware (Netzwerk/Disconnect)

- `main.cpp`: keepalive von 60 auf 90 gesetzt (im Broker als `k90` beobachtet).
- `wifi_manager.cpp`: explizites `mqttClient.disconnect()` vor WiFi-Handover/Disconnect.
- `communication_task.cpp`: `enforceMqttDisconnectOnWifiLoss()` eingebaut.

**Wirkung:** reduziert Session-Kollisionen in Teilmengen, aber noch Restfälle.

## 5.2 Firmware (Latenz-/Queue-Verhalten)

- `publish_queue.h`: Watermark 6 -> 4.
- `mqtt_client.cpp`: zusätzliche Deferrals und Requeues (1000ms) für kritische Topics unter Pressure.
- `disable_auto_reconnect=true` gesetzt (stärkeres Managed-Reconnect-Regime).

**Wirkung:** weniger blockierende Calls, aber höhere Wahrscheinlichkeit für verzögerte finale Response bei Last.

## 5.3 Server/Frontend (Heartbeat/Online-Status)

- `heartbeat_handler.py`: serverseitiger Receive-Zeitstempel als robuste `last_seen`-Quelle, Schutz gegen regressive Timestamps.
- `esp_repo.py`: `offline` überschreibt `last_seen` nicht blind.
- `esp.ts`: Schutz gegen stale/out-of-order Timestamps, stabileres Offline/Online-Verhalten.

**Wirkung:** verbessert Anzeige-/Statuskonsistenz, adressiert aber nicht direkt Aktor-Response-Latenz.

## 6) Systematische Strategie (Code + Docker-Stack)

## Phase A: Messdisziplin herstellen (sonst keine eindeutige Root Cause)

1. **Run-Gating hart machen**  
   Ein Lauf ist nur verwertbar, wenn `run_summary.json` + `SUMMARY.md` + vollständige Zeitfenster vorhanden sind.
2. **Lastprofile trennen**  
   - Profil `net-switch-min-load` (nur Netzwechsel, kein Flood)  
   - Profil `load-only` (kein Netzwechsel, nur Pressure)  
   - Profil `combined` (beides)
3. **Metrik-Kernset standardisieren**  
   - `session_taken_over`, `exceeded_timeout`, `mqtt_disconnected`
   - `actuator queue_age p50/p95/max`
   - `count(queue drain deferred critical ... actuator/.../response)`
   - `retry queue full ... actuator/.../response`

## Phase B: State-Latenz priorisiert beheben (ohne Disconnect-Fix zu verlieren)

1. **Critical-Topic-Klassifizierung aufteilen**  
   `actuator/.../response` und `.../intent_outcome` nicht identisch behandeln.
2. **Deferral-Regel für Response entschärfen**  
   Für `actuator/.../response` statt starrem `+1000ms`:
   - kleinere adaptive Delays (z. B. 50/100/200ms),
   - max retry window begrenzen,
   - bevorzugte Drain-Quota pro Tick für Response-Topics.
3. **Priorisierte Queue-/Dual-Queue-Drain-Reihenfolge**  
   Critical-Response vor Telemetrie/Diagnostik drainen.
4. **Drop-Policy schärfen**  
   Responses möglichst nicht droppen; stattdessen weniger wichtige Topics früher shedden.

## Phase C: Netzwerk/Takeover final absichern

1. Korrelationstabelle pro Lauf:  
   `WiFi event` -> `mqtt disconnect (lokal)` -> `broker disconnect reason` -> `new connect`.
2. Fälle mit `session taken over` isolieren (minimal load).
3. Prüfen, ob `disconnect()`-Pfad bei bestimmten Event-Interleavings nicht rechtzeitig erreicht wird.

## Phase D: Docker-Stack entkoppeln (Messstörquellen reduzieren)

1. Testtraffic in separaten Topics/Namespaces halten.
2. Auto-Client-Fluten zeitlich vom Netzwechsel entkoppeln.
3. Capture-Fenster um ESP-Ereignisse herum enger schneiden (weniger Rauschen).

## 7) Konkrete Fehler-/Risikomatrix

1. **State-Response-Lag unter Pressure**  
   - Severity: hoch  
   - Evidenz: Deferred-critical + queue_age/exec-Spitzen + Response-Drops  
   - Primärer Fixhebel: Queue-/Deferral-Strategie

2. **Session-Takeover Restvorkommen**  
   - Severity: hoch  
   - Evidenz: Broker `session taken over` in einzelnen neuen Runs  
   - Fixhebel: Disconnect-Reihenfolge + Event-Interleaving absichern

3. **Unvollständige Runs führen zu unscharfen Schlussfolgerungen**  
   - Severity: mittel  
   - Evidenz: `20260517_094620` ohne Summary/JSON  
   - Fixhebel: harte Run-Gates in Verifikation

## 8) Empfohlene nächste Umsetzungsschritte

1. **Sofort**: Response-Pfad priorisieren (Deferral für `actuator/.../response` entschärfen, adaptive Retry, kein harter 1s-Zyklus).
2. **Dann**: Verifikationsskript um „verwertbar/unverwertbar“-Gate verschärfen.
3. **Danach**: getrennte Testprofile (net-only vs load-only) ausführen und getrennt bewerten.
4. **Abschluss**: erst nach getrennten Profilen final über Session-Fix-Wirksamkeit urteilen.

---

## Anhang A: Wichtige Einzelfakten

- Keepalive 90 ist aktiv und im Broker sichtbar (`k90`).
- `20260517_103356`: kein `session taken over`, aber starke Queue-/Latenzsignale.
- `20260517_105021`: `session taken over` weiterhin vorhanden, plus massive critical-defers.
- `20260517_094620`: nur Teilartefakte; nicht als harte Erfolgsmessung verwenden.
