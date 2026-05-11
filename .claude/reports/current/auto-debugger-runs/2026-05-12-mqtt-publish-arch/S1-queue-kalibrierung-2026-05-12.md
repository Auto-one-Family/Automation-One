# S1: AUT-355 — Queue-Parameter-Kalibrierung nach Heartbeat-Metrics-Split

**Issue:** [AUT-355](https://linear.app/autoone/issue/AUT-355) (Sub von AUT-353)  
**Datum:** 2026-05-12  
**Typ:** Analyse / Kalibrierungsempfehlung (Linear-Verifikation: **kein Code-Change** in diesem Issue)  
**Vorbedingung S2:** Erfüllt — siehe `BELEG-AUT354-S2-core0-directpath-queue-2026-05-12.md` (Queue-Tiefe **8**, keine „15“-Slots).

---

## 1. IST-Parameter (repo-verifiziert)

| Parameter | Wert | Kanonische Datei |
|-----------|------|------------------|
| `PUBLISH_QUEUE_SIZE` | **8** | `El Trabajante/src/tasks/publish_queue.h` |
| `PUBLISH_QUEUE_SHED_WATERMARK` | **6** (75 % von 8) | `publish_queue.h` |
| `PUBLISH_DRAIN_BUDGET_PER_TICK` | **1** | `El Trabajante/src/services/communication/mqtt_client.cpp` (`MQTTClient::processPublishQueue`, Kommentar **AUT-54**) |
| Comm-Task-Takt | **50 ms** | `communication_task.cpp` (`vTaskDelay` am Ende der Task-Schleife) |

**Korrektur zum Linear-Issue-Body:** Dort ist noch `PUBLISH_DRAIN_BUDGET_PER_TICK = 3` und ein Verweis auf `publish_queue.cpp` für den Drain-Budget genannt — **veraltet**. IST: Budget **1**, Definition in **`mqtt_client.cpp`** (nicht `publish_queue.cpp`).

---

## 2. Auswirkung Metrics-Split (`ENABLE_METRICS_SPLIT`) auf die Publish-Queue

### 2.1 Pfad-Trennung

- **`publishHeartbeat()`** und **`publishHeartbeatMetrics()`** laufen im **MQTTClient::loop()**-Kontext der **Communication-Task (Core 0)** und rufen `publish(...)` auf → **Core-0-Direktpfad** → **`esp_mqtt_client_publish` ohne `g_publish_queue`-Slot** (siehe S2-BELEG §4, Zeilen P1).
- Der Split **verlagert** JSON-Felder aus dem Core-Heartbeat in ein zweites Topic; er **vergrößert** nicht die Anzahl der Core-1-Enqueue-Pfade.

**Folge für `g_publish_queue`:** Die Shed-Schwelle und Queue-Tiefe sind **nicht** primär durch den Metrics-Split belastet; belastet wird die **gemeinsame IDF-MQTT-Outbox / TCP-Schreibpfad** durch **einen zusätzlichen Direkt-Publish** pro Heartbeat-Zyklus, **wenn** Metriken sich geändert haben **oder** spätestens alle **`METRICS_MAX_SKIP_COUNT` (5)** Heartbeat-Takte (`mqtt_client.h` / `publishHeartbeatMetrics()`).

### 2.2 Grobe Frequenz (Direktpfad, additiv durch Split)

- Kern-Heartbeat: typ. **60 s** nach Registration (`HEARTBEAT_INTERVAL_MS` in `mqtt_client` — nicht hier zitiert, siehe S2-Tabelle).
- Zusätzlich `…/system/heartbeat_metrics`: **eventgetrieben bei Counter-Änderung**, sonst **alle 5** Heartbeats (~**5 min** bei ruhenden Zählern und 60 s HB).

Damit ist der „additivale Strom“ **niedrig frequent**, aber **im selben Tick** wie der Core-Heartbeat ausgeführt (`publishHeartbeatMetrics()` direkt nach erfolgreichem Heartbeat-`publish`).

---

## 3. Quantifizierung „Publishes pro 50 ms-Tick“ (Code + vorhandene Logs)

### 3.1 Pro Tick aus **Queue-Drain** (`g_publish_queue`)

- **Höchstens `PUBLISH_DRAIN_BUDGET_PER_TICK` = 1** erfolgreicher Dequeue + Versuch `esp_mqtt_client_publish` (plus ggf. Re-Enqueue bei Backoff), siehe `processPublishQueue()`.
- Bei **Write-Path-Timeout**-Backpressure: Budget bleibt **1**, explizit nicht erhöht.

### 3.2 Pro Tick **Direktpfad** (ohne Queue-Slot, Auszug)

Aus S2-BELEG und `communication_task.cpp` (operational path):

1. `mqttClient.loop()` → kann **Heartbeat** (+ bei Split **Metrics**) auslösen — **1–2** Direkt-Publishes im HB-Tick.
2. `processIntentOutcomeOutbox()` **innerhalb** `processPublishQueue()` — bis zu **2** Replay-Versuche/Tick (`intent_contract.cpp`, S2).
3. `handleActuatorStatusPublish()` — alle **30 s**, **N** Status-Publishes **hintereinander** im **selben** Tick (N = aktive Aktoren).
4. `handleQueuePressureHysteresis()` — **selten**, nur auf ENTER/RECOVERED-Flanken.

**Antwort auf Linear-Frage „wie viele aus Core 1 vs Core 0 pro Tick?“:**  
Core-1-Traffic erscheint als **Drain** (max. 1 Nachricht/Tick) **plus** mögliche **Callbacks** auf Core 0 mit **Enqueue**-Pfad (nicht als fester „X pro Tick“ im Code ohne Lastprofil). Eine **einzelne Zahl** „Publishes/Tick“ ist ohne Feld-Trace nicht global konstant — die **obere Schranke** für Drain ist **1**/Tick; Direktpfad-Spitzen kommen von **HB+Metrics** und **periodischen N× Actuator-Status**.

### 3.3 Log-Evidenz (2026-05-11, Queue-Pressure)

Aus `BELEG-F1-COMM-QUEUE-EXHAUSTION-2026-05-11.md` (ESP_EA5484):

- Queue angelegt mit **8 Slots** (bestätigt).
- `queue_pressure entered_pressure` bei **fill=6..7**, **hwm=8**, **`shed=0`**, **`drop=0`** bis zum späteren „queue full“ / Sensor-Drop.

**Interpretation:** Unter dieser Last wurde **noch nicht** über `shed_count` geshedded (Zähler 0 im Ausschnitt); die Schwelle **fill ≥ 6** wurde aber erreicht (Pressure-Events). Engpässe gingen später in **Queue-Full** und **Transport (errno=11)** über — konsistent mit S2: **Outbox/TCP** kann unabhängig von der reinen App-Queue zum Bottleneck werden.

---

## 4. Bewertung der aktuellen Parameter

### 4.1 `PUBLISH_QUEUE_SIZE = 8`

- **Beibehalten.** Begründung: AUT-344/AUT-354 — 15 Slots früher ~33 kB Heap und **CommTask-Start** auf echten Geräten gefährdet; 8 Slots sind bewusster Kompromiss (~15–18 kB nur Queue-Puffer, siehe S2 §6).

### 4.2 `PUBLISH_QUEUE_SHED_WATERMARK = 6` (75 %)

- **Beibehalten.** Begründung:
  - **2 Slots** Reserve zwischen Shed-Zone und „voll“ (8) für kritische Einreihungen und Drift.
  - `queue_pressure`-Hysterese: **RECOVERED** bei **fill < 4** (`PRESSURE_RECOVERED_THRESHOLD` in `communication_task.cpp`) — konsistent mit frühem Shed-Eintritt; Änderung der Watermark ohne Anpassung der Hysterese würde PKG-01a-Semantik verschieben.
  - **Anheben** (z. B. 7): kaum Headroom bis Hard-Drop → **nicht empfohlen**.
  - **Absenken** (z. B. 5): aggressiveres Shed von Nicht-Kritischem → kann Sensordaten verlieren, ohne dass der Metrics-Split die Queue-Last erhöht.

### 4.3 `PUBLISH_DRAIN_BUDGET_PER_TICK = 1`

- **Beibehalten**; **nicht** auf 2–3 anheben ohne Messkampagne. Begründung:
  - **AUT-54:** früher 3/Tick → Mikro-Bursts am TCP-Schreibpfad, beobachtet unter Last (**errno=11**).
  - Metrics-Split erhöht die **Direktpfad**-Publishes im Heartbeat-Tick, nicht den Drain — **mehr Drain/Tick** würde die **Konkurrenz um dieselbe Outbox im selben 50-ms-Fenster** verschärfen.
  - Risiko einer Erhöhung: höhere Wahrscheinlichkeit von **EAGAIN / Write-Failures** und **CB-OPEN**-Ketten (F1-BELEG).

---

## 5. Kalibrierungsempfehlung (Zusammenfassung)

| Parameter | Empfehlung | Kurzbegründung |
|-----------|------------|----------------|
| `PUBLISH_QUEUE_SIZE` | **8** | Heap/CommTask-Stabilität (AUT-344) |
| `PUBLISH_QUEUE_SHED_WATERMARK` | **6** | 75 %-Backpressure + 2 Slots bis „voll“; passt zu PKG-01a-Hysterese |
| `PUBLISH_DRAIN_BUDGET_PER_TICK` | **1** | TCP/Outbox-Schonung (AUT-54); Split lastet Direktpfad, nicht Queue |

**Optional nächste Schritte (außerhalb AUT-355, falls gewünscht):**

- Feld- oder Staging-Logs: **Zähler** `shed_count` / `drop_count` / `publish_outbox_full_count` über **24 h** Normal- + Stressbetrieb nach AUT-121-Merge-Produktivierung.
- Falls später Daten zeigen **dauerhaft niedrige** Queue-Fill **und** keine Transport-Regression: **vorsichtiger** Test mit Drain-Budget **2** nur auf **Canary**-Builds — nicht als Default ohne Messung.

---

## 6. Verifikation (Linear)

- [x] S2-Vorbedingung (8 vs. 15) eingearbeitet.
- [x] Traffic-Mix aus **Code + S2 + F1-Beleg** beschrieben (keine erfundenen msgs/s-Zahlen).
- [x] DrainBudget-/Watermark-/Size-Empfehlung mit **Risiko** für höheres DrainBudget.
- [x] **Kein Firmware-Code geändert** (Scope AUT-355).

---

## 7. Anhang: `ENABLE_METRICS_SPLIT` IST im Repo

`El Trabajante/src/config/feature_flags.h` definiert aktuell **`#define ENABLE_METRICS_SPLIT`** (Zeile 25).  
`El Trabajante/docs/Mqtt_Protocoll.md` erwähnt teils „esp32_dev nicht gesetzt“ — bei Abweichung **maßgeblich `feature_flags.h`** für diesen Report-Stand.
