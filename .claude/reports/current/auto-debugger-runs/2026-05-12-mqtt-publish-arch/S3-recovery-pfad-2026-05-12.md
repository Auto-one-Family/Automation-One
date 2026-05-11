# S3 Recovery-Pfad — Write-Timeout / Drain-Budget / CB-HALF_OPEN (AUT-356)

**Linear:** [AUT-356](https://linear.app/autoone/issue/AUT-356)  
**Parent:** AUT-353  
**Datum:** 2026-05-12  
**Scope:** Firmware-Analyse (El Trabajante, ESP-IDF-Pfad, `MQTT_USE_PUBSUBCLIENT` ausgeschlossen wo relevant)

---

## 1. Drain-Budget & Recovery-Zeitfenster (Queue 8 Slots)

### Ist-Code

- `communication_task.cpp`: operational loop `vTaskDelay(50 ms)`; in `STATE_PENDING_APPROVAL` / `STATE_CONFIG_PENDING_AFTER_RESET` `vTaskDelay(100 ms)` und ebenfalls `processPublishQueue()`.
- `mqtt_client.cpp` — `processPublishQueue()`:
  - `PUBLISH_DRAIN_BUDGET_PER_TICK = 1` (Kommentar **AUT-54**: früher 3/Tick, jetzt **immer** max. 1 Publish pro Comm-Tick).
  - Zusätzliche Verzweigung: bei `isWritePathTimeoutErrno(last_transport_errno_)` → `drain_budget = 1`, sonst ebenfalls `1`.
  - **Folge:** Die PKG-18-„Reduktion“ von 3→1 bei Write-Timeout ist gegenüber dem aktuellen Default **wirkungslos** (1 vs 1). Das DEBUG-Log `Drain throttled: budget=…` mit `drain_budget < PUBLISH_DRAIN_BUDGET_PER_TICK` wird **nie** ausgelöst.

### Quantifizierung (Theorie)

- Volle Queue: `PUBLISH_QUEUE_SIZE = 8` (`publish_queue.h`).
- Nur Drain, jeder `esp_mqtt_client_publish` sofort erfolgreich, kein Requeue durch Backoff:  
  **8 × 50 ms = 400 ms** (operational) bzw. **8 × 100 ms = 800 ms** (restricted admission).
- Praxis: Backoff bei Retries (`getRetryBackoffMs`), OUTBOX full (`msg_id == -2`), erneutes Einreihen mit `next_retry_ms`, sowie parallele **Neuenqueues** vom Safety-Task verlängern die Entleerung — **unter Last nicht durch reine Formel begrenzbar**; Aussage aus Logs (Timestamps `[OUTBOX-TRACE]`, Shed/Drop-Zähler) bleibt maßgeblich.

**Antwort AUT-356 Frage 1:** Unter aktuellem Stand ist das Szenario „3/Tick → 1/Tick bei errno“ durch AUT-54 obsolet; theoretisches Minimum bei leerer Socket-Pipeline bleibt **~400 ms / ~800 ms** je Modus, tatsächliche Recovery **loggestützt** zu messen.

---

## 2. CB OPEN → HALF_OPEN vs. Broker-Keepalive

### MQTT-CircuitBreaker-Parameter

- Konstruktor in `mqtt_client.cpp` (ca. Zeile 247):  
  `CircuitBreaker("MQTT", 5, 30000, 10000)`  
  → **5** Fehler bis OPEN, **`recovery_timeout_ms = 30 s`** (OPEN → erster `allowRequest()`-Pfad wechselt nach 30 s nach HALF_OPEN), **`halfopen_timeout_ms = 10 s`** (HALF_OPEN-Testfenster bis Rückfall OPEN).

### Keepalive (Firmware-Konfiguration)

- `main.cpp` / `platformio.ini`: typisch **`keepalive = 60 s`** (Doku/Konfig konsistent).

### Bewertung

- **30 s < 60 s:** Der Übergang OPEN → HALF_OPEN (Test erlaubt) tritt **vor** Ablauf eines vollen Keepalive-Intervalls ein — *sofern* die Zustandsmaschine nur einmal OPEN bleibt und danach ein erfolgreicher Publish als „Recovery“ zählt.
- **Risiko:** Wiederholte OPEN↔HALF_OPEN-Zyklen oder **lang andauerndes OPEN ohne erfolgreichen Transport** können kumulativ **über 60 s** gehen; dann hängt das Broker-Verhalten von **TCP/MQTT-PING** (IDF-intern) ab, nicht von unserem JSON-Heartbeat.
- **HALF_OPEN:** Solange `halfOpenTestTimedOut()` nicht greift, liefert `allowRequest()` in HALF_OPEN weiter `true` (mehrere Requests möglich bis Timeout — Kommentar „ONE test request“ in `circuit_breaker.h` ist zur tatsächlichen Implementierung **inkonsistent**).

**Antwort AUT-356 Frage 2:** Zahlen: **OPEN-Recovery 30 s**, **HALF_OPEN-Max 10 s**, **Keepalive 60 s**. Der reine OPEN→HALF_OPEN-Recovery-Timeout ist **kleiner** als Keepalive; systemische Verlängerung der Broker-Sicht entsteht eher durch **fehlgeschlagenen Anwendungs-Traffic + CB**, nicht durch 30 s > 60 s.

---

## 3. Heartbeat & Circuit Breaker (`safePublish` vs. direkt)

### Ist-Verhalten

- `publishHeartbeat()` endet mit **`publish(heartbeat_topic, payload, 0)`** — **nicht** `safePublish()` (`mqtt_client.cpp` ca. 1609).
- `publish()` prüft **zuerst** `circuit_breaker_.allowRequest()` (ca. 609–612); bei **OPEN** und noch nicht abgelaufenem 30 s-Recovery: **`false`** → Log „MQTT publish blocked by Circuit Breaker“.
- `safePublish()` enthält eine **Sonderlogik nur für kritische Topics bei CB OPEN** (ein versuchter `publish()` trotz OPEN); Heartbeat ist **unkritisch** und nutzt `safePublish()` ohnehin nicht.

**Antwort AUT-356 Frage 3:** **Keine CB-Ausnahme** für den JSON-Heartbeat: er läuft durch **`publish()` + `allowRequest()`** und wird bei **OPEN** blockiert. Das erklärt serverseitig fehlende Heartbeats unter CB-OPEN (AUT-346-Bezug). **Hinweis:** MQTT-Wire-Keepalive (PING) wird vom **ESP-IDF-Client** verwaltet und **nicht** über `MQTTClient::publish()` abgebildet — Trennung „Broker lebt“ vs. „App-Heartbeat fehlt“ für Ops relevant.

---

## 4. `reserveSlotForCriticalPublish` — Restore-Drop möglich?

### Ablauf (`publish_queue.cpp`)

- Bei voller Queue und `critical`: `reserveSlotForCriticalPublish` entnimmt **sequentiell** alle wartenden Messages (`xQueueReceive`), verwirft **höchstens eine** nicht-kritische (`g_pq_shed_count`), legt alle anderen per `xQueueSend(..., 0)` zurück, danach das kritische Request.

### Restore-Drop-Bedingung

- `xQueueSend` beim Zurücklegen kann **`pdFALSE`** liefern → `g_pq_drop_count`, Log `[SYNC] Queue restore dropped publish`.
- Ursache: Zwischen **Receive** und **Send** kann ein **anderer Task** (z. B. Safety-Task auf Core 1 mit `tryQueuePublish`) Slots füllen — die Queue ist kurzzeitig „kleiner“ als die zu restaurierende Menge.

**Antwort AUT-356 Frage 4:** **Ja**, Restore-Drop ist **möglich** unter **Cross-Core-Race** (Core 0 reordert, Core 1 enqueue parallel). In Logs über **`publish_queue_drop_count`** / **`[SYNC] Queue restore dropped`** erkennbar; Shedding nutzt separates **`shed_count`**.

---

## 5. Zusatzbefund (für AUT-346 / Nachverfolgung)

- **`processPublishQueue()`** ruft **`esp_mqtt_client_publish` direkt auf** — **ohne** `circuit_breaker_.allowRequest()`. Bereits **in der Queue** befindliche Messages können damit **noch Transportversuche** auslösen, während **neue** `publish()`-Aufrufe (Heartbeat, Core-0-Pfade) am CB scheitern. Asymmetrie zwischen **Drain** und **Admission** bei der CB-Policy dokumentieren.

---

## Referenz-Stellen (Repo)

| Thema | Datei |
|--------|--------|
| Drain-Budget, OUTBOX-Trace | `El Trabajante/src/services/communication/mqtt_client.cpp` |
| Comm-Tick 50/100 ms | `El Trabajante/src/tasks/communication_task.cpp` |
| `reserveSlotForCriticalPublish` | `El Trabajante/src/tasks/publish_queue.cpp` |
| CB-Zustände / Timeouts | `El Trabajante/src/error_handling/circuit_breaker.cpp`, `.h` |
| MQTT-CB-Instanz | `El Trabajante/src/services/communication/mqtt_client.cpp` (~Zeile 247) |
| Heartbeat → `publish()` | `El Trabajante/src/services/communication/mqtt_client.cpp` (`publishHeartbeat`) |

---

*Keine Produktcode-Änderungen im Rahmen AUT-356; Befunde für AUT-346 / Sub-Issues.*
