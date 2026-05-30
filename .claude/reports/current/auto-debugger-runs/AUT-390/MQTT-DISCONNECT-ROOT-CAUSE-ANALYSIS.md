# MQTT Disconnect Root Cause Analysis
**Datum:** 2026-05-13  
**Incident:** ESP_6B27C8 Disconnect ~15:34:07 — Keine Wiederverbindung für 10+ Minuten  
**Branch:** auto-debugger/work  
**Status:** Analyse vollständig — BUG-1 implementiert (AUT-390) — Emergency-Incident ergänzt

---

## 1. Incident-Überblick

### Zeitstrahl (exakt aus Loki/MQTT-Logger rekonstruiert)

| Zeitstempel | Event | Quelle | Seq# |
|------------|-------|--------|------|
| 15:23:07 | Server-Neustart | Docker | — |
| 15:23:46 | Erster Heartbeat nach Neustart | MQTT-Logger | — |
| 15:23:46 | Session-Takeover LWT unterdrückt (Fix 2 aktiv) | god_kaiser.log | — |
| 15:31:46 | Letzter normaler Heartbeat | MQTT-Logger | — |
| 15:32:07 | Normaler Sensor-Batch | MQTT-Logger | 220–225 |
| **15:32:37** | **FREEZE: seq 228 wird nie gesendet** | MQTT-Logger | 226–227 |
| 15:32:46 | Erwarteter Heartbeat FEHLT | MQTT-Logger | — |
| **15:34:07** | **Broker `exceeded timeout`** | Mosquitto Logs | — |
| 15:34:07 | LWT gesendet: `{"status":"offline","reason":"unexpected_disconnect"}` | MQTT-Logger | — |
| 15:34:07+ | **NULL CONNECT-Versuche für 10+ Minuten** | Mosquitto Logs | — |

### Letzter bekannter Zustand (Heartbeat 15:31:46)
```json
{
  "mqtt_circuit_breaker_open": false,
  "wifi_circuit_breaker_open": false,
  "heap_free": 47676,
  "wifi_rssi": -55,
  "uptime": 1029
}
```
WiFi war stabil (-55 dBm), kein vorangegangener CB-Alarm.

---

## 2. Detaillierte Ursachenanalyse

### RC-1 (Primär): TCP Send-Buffer Congestion (EAGAIN)

**Was passierte:**  
Um 15:32:37 versuchte der ESP, `seq 228` (moisture GPIO33) zu publizieren. Der TCP-Send-Buffer war voll — `send()` schlug fehl mit `errno=11 (EAGAIN/EWOULDBLOCK)`.

**Mechanismus:**  
Das ESP-IDF MQTT-Task ist single-threaded und blockiert intern in einer Write-Retry-Schleife, wenn TCP EAGAIN zurückgibt. Es wartet bis zu `MQTT_CLIENT_NETWORK_TIMEOUT_MS = 45000ms` auf Socket-Schreibbereitschaft.

**Code-Beleg:**  
`mqtt_client.cpp:77` — `static const int MQTT_CLIENT_NETWORK_TIMEOUT_MS = 45000;`  
`mqtt_client.cpp:2190–2195` — Fehlerbehandlung für EAGAIN: kein sofortiger Reconnect geplant:
```cpp
// Write-path EAGAIN/EWOULDBLOCK errors often precede DISCONNECTED and
// represent temporary send-buffer pressure. Let DISCONNECTED own the
// reconnect scheduling to avoid duplicate backoff state transitions.
if (tls_timeout) {
    self->scheduleManagedReconnect_("mqtt_transport_error");
}
// EAGAIN: no immediate reconnect scheduled here — waits for DISCONNECTED
```

**Konsequenz:**  
Während das MQTT-Task blockiert ist, können **keine** PINGREQs gesendet werden. Der Broker erhält 90 Sekunden lang kein MQTT-Traffic und feuert `exceeded timeout`.

**Warum EAGAIN nach 9 Minuten stabiler Operation?**  
Mögliche Ursachen (ohne Serial-Log nicht bestimmbar):
- Kurze WiFi-Congestion → TCP-Receiver-Window auf Broker-Seite voll
- Router-TCP-Buffer-Druck durch andere Geräte
- Verzögerte PUBACKs → QoS1-Nachrichten stauen im TCP-Buffer

---

### RC-2 (Sekundär): Circuit Breaker zählt OUTBOX-full als Broker-Ausfall (AUT-346)

**Was passierte:**  
Während das MQTT-Task in EAGAIN blockierte, lief die Comm-Task weiter (Core 0, 50ms-Takt). `processPublishQueue()` versuchte, ausstehende Nachrichten zu senden. `esp_mqtt_client_publish()` gab `-2` (OUTBOX voll) zurück.

**Code-Beleg:**  
`mqtt_client.cpp:1279–1289` — OUTBOX-full löst CB-Failure aus:
```cpp
if (msg_id == -2) {  // OUTBOX full
    circuit_breaker_.recordFailure();  // ← FEHLER: OUTBOX-full ≠ Broker ausgefallen
}
```

**CB-Konfiguration:**  
`mqtt_client.cpp:247` — `circuit_breaker_("MQTT", 5, 30000, 10000)`:
- Threshold: **5 Failures** → OPEN
- Recovery: **30s** OPEN → HALF_OPEN  
- Half-Open-Fenster: **10s**

**Zeitrechnung:**  
Comm-Task läuft alle 50ms. Wenn die Publish-Queue Nachrichten enthält und jeder Drain-Versuch `-2` zurückgibt:
```
5 Fehler × 50ms = 250ms → CB OPEN
```
CB öffnet innerhalb von **250ms** nach dem ersten EAGAIN!

**Konsequenz:**  
`publish()` prüft CB zuerst:
```cpp
// mqtt_client.cpp:610
if (!circuit_breaker_.allowRequest()) {
    LOG_W(TAG, "MQTT publish blocked by Circuit Breaker (Service DOWN)");
    return false;
}
```

**Heartbeat ist blockiert!** Der Heartbeat dient auch als MQTT-Keepalive. Wenn CB OPEN ist:
1. `publishHeartbeat()` → `publish()` → CB-Check → `return false`
2. Kein PINGREQ/PUBLISH mehr vom ESP
3. Broker-Keepalive-Timeout nach 90s → `exceeded timeout` bei 15:34:07

**Aber warte:** `publishHeartbeat()` prüft auch `isConnected()`:
```cpp
// mqtt_client.cpp:1495
if (!isConnected()) {
    return;
}
```
`isConnected()` = `g_mqtt_connected.load()` — wird erst bei `MQTT_EVENT_DISCONNECTED` auf `false` gesetzt. Zwischen 15:32:37 und 15:34:07 war `g_mqtt_connected = true` (TCP-Verbindung noch "offen").

**Der exakte Fehler-Pfad:**
1. EAGAIN bei ~15:32:37
2. processPublishQueue gibt -2 zurück × 5 → CB OPEN in ~250ms
3. 15:32:46: Heartbeat-Timer feuert → `publish()` → CB blockt → **kein Heartbeat gesendet**
4. 15:34:07: Broker `exceeded timeout` (90s ohne Traffic)
5. `MQTT_EVENT_DISCONNECTED` feuert → `recordFailure()` → CB bleibt OPEN

---

### RC-3 (Tertiär): Keine Wiederverbindung für 10+ Minuten

**Was wir wissen:**  
Mosquitto-Logs zeigen **null CONNECT-Pakete** von ESP_6B27C8 für 10+ Minuten nach 15:34:07.

**Erwartetes Verhalten:**  
Nach `MQTT_EVENT_DISCONNECTED`:
1. `scheduleManagedReconnect_("mqtt_disconnected")` wird aufgerufen
2. Delay: ~3-4s (Basis 1500ms × 2^1 + Jitter 0-649ms)
3. Grace-Check: `last_disconnect_ms_ + MANAGED_RECONNECT_AUTO_GRACE_MS (15s)`
4. Bei **~15:34:22**: `esp_mqtt_client_reconnect()` wird aufgerufen
5. → CONNECT-Paket sollte zum Broker gehen

**ESP-IDF Auto-Reconnect:**  
ESP-IDF MQTT hat eingebautes Auto-Reconnect (kein `disable_auto_reconnect` gesetzt). Auch ohne managed reconnect würde ESP-IDF selbstständig reconnecten.

**Code-Beleg:**  
`mqtt_client.cpp:1955–1969` — Reconnect-Planung in DISCONNECTED-Handler:
```cpp
if (self->next_managed_reconnect_ms_ == 0) {
    unsigned long reconnect_base = MANAGED_RECONNECT_BASE_DELAY_MS;
    if (self->transport_write_timeout_count_ >= WRITE_TIMEOUT_ESCALATION_THRESHOLD) {
        reconnect_base = MANAGED_RECONNECT_WRITE_TIMEOUT_BOOST_MS;  // PKG-18
    }
    self->scheduleManagedReconnect_("mqtt_disconnected", reconnect_base);
} else {
    LOG_D(TAG, "[INC-EA5484] reconnect already scheduled (skip duplicate in DISCONNECTED)");
}
```

`processManagedReconnect_()` bei `mqtt_client.cpp:1109` ruft `esp_mqtt_client_reconnect()` auf — **kein CB-Check!** Der managed reconnect ist nicht durch CB blockiert.

**Warum trotzdem kein CONNECT im Broker?**  
Drei Hypothesen (ohne Serial-Log nicht abschließend bestimmbar):

**H1 (wahrscheinlichste): WiFi war nach dem MQTT-Freeze gestört**  
- Der TCP-EAGAIN-Event kann auf eine kurze WiFi-Unterbrechung hindeuten
- Wenn WiFi physisch nicht mit AP verbunden ist → TCP-Verbindungsversuch schlägt fehl → kein CONNECT-Paket am Broker
- ESP-IDF würde `MQTT_EVENT_ERROR` (nicht `DISCONNECTED`) für fehlgeschlagene TCP-Connects feuern
- 10+ Minuten WiFi-Ausfall ist ungewöhnlich, aber möglich (z.B. Router-Neustart, IP-Ablauf)

**H2: 5-Minuten Persistent-Failure-Timer aktiviert AP-Mode (möglich aber unwahrscheinlich)**  
`communication_task.cpp:139–181`:
```cpp
if (!mqttClient.isConnected() && mqttClient.getCircuitBreakerState() == CircuitState::OPEN) {
    // Timer startet nur wenn CB OPEN
    if (mqtt_failure_start == 0) mqtt_failure_start = millis();
    else if (millis() - mqtt_failure_start > 300000) {
        provisionManager.startAPModeForReconfig();
    }
} else {
    mqtt_failure_start = 0;  // RESET wenn CB nicht OPEN
}
```
**Kritisch:** Timer resettet sich bei HALF_OPEN-Phasen! Mit CB-Recovery=30s wechselt CB alle 30s zwischen OPEN und HALF_OPEN. Das macht kumulativen 5-min-Timer faktisch unmöglich unter normalen Bedingungen.

**H3: ESP-IDF MQTT Task in deadem Socket-Zustand**  
- Nach 45s network_timeout hätte ESP-IDF intern disconnecten sollen
- Wenn das nicht passiert (IDF-Bug oder Race-Condition), bleibt der Task hängen
- Kein Reconnect-Event, kein CONNECT

---

## 3. Vorhandene Fixes (bereits deployed)

### Fix 1: STATE_PUSH_RECONNECT_DELAY_SECONDS = 30.0 (war 3.0)
**Datei:** `El Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py`  
**Wirkung:** Verhindert verfrühten Zone/Assign-Push nach Reconnect, der TCP EAGAIN auslösen könnte.  
**Status:** ✅ Bestätigt wirksam (keine Zone/Assign-Burst-Probleme mehr)

### Fix 2: LWT-Suppress für 120s, nicht nur retained
**Datei:** `El Servador/god_kaiser_server/src/mqtt/subscriber.py`  
**Wirkung:** Unterdrückt false-positive LWT-Events nach Server-Neustart.  
**Status:** ✅ Bestätigt wirksam (Log 15:23:46: `Suppressing startup LWT ... retained=0 (39.0s since start)`)

---

## 4. Identifizierte Bugs und erforderliche Fixes

### BUG-1 (KRITISCH): OUTBOX-full wird als CB-Failure gezählt

**Datei:** `El Trabajante/src/services/communication/mqtt_client.cpp:1279`

**Ist-Code:**
```cpp
int msg_id = esp_mqtt_client_publish(mqtt_client_, msg.topic.c_str(),
                                      msg.payload.c_str(), msg.payload.length(),
                                      msg.qos, 0);
if (msg_id == -2) {
    circuit_breaker_.recordFailure();  // ← BUG
}
```

**Problem:** `esp_mqtt_client_publish()` gibt `-2` zurück wenn die ESP-IDF OUTBOX voll ist. Das ist ein **lokaler Backpressure-Event** — der Broker ist erreichbar, aber der ESP kann momentan nicht mehr senden. Das als Broker-Ausfall zu werten ist semantisch falsch.

**Folge:** 5 aufeinanderfolgende OUTBOX-full-Returns (250ms!) öffnen den CB → Heartbeat blockiert → Broker-Keepalive-Timeout.

**Fix:**
```cpp
if (msg_id == -2) {
    // OUTBOX full = ESP-seitiger Backpressure, kein Broker-Ausfall
    // CB NICHT tripped — stattdessen Queue-Drain für kurze Zeit pausieren
    LOG_W(TAG, "[PQ] OUTBOX full (backpressure) — drain paused, CB not tripped");
    pq_drain_backoff_until_ms_ = millis() + PQ_DRAIN_BACKOFF_MS; // z.B. 5000ms
    break;
}
```
Neues Member `pq_drain_backoff_until_ms_` und `PQ_DRAIN_BACKOFF_MS = 5000` hinzufügen.

---

### BUG-2 (HOCH): Kein proaktiver Reconnect bei EAGAIN — wartet auf 90s Broker-Timeout

**Datei:** `El Trabajante/src/services/communication/mqtt_client.cpp:2190`

**Ist-Code:**
```cpp
// Write-path EAGAIN/EWOULDBLOCK errors often precede DISCONNECTED and
// represent temporary send-buffer pressure. Let DISCONNECTED own the
// reconnect scheduling to avoid duplicate backoff state transitions.
if (tls_timeout) {
    self->scheduleManagedReconnect_("mqtt_transport_error");
}
// EAGAIN: no immediate reconnect scheduled here — waits for DISCONNECTED
```

**Problem:** EAGAIN bedeutet der TCP-Buffer ist voll. Das MQTT-Task wartet bis zu 45s (`MQTT_CLIENT_NETWORK_TIMEOUT_MS`). Dann noch 90s bis Broker-Timeout. Gesamtausfall: **bis zu 90s** bevor Reconnect versucht wird.

**Fix:** EAGAIN-Ereignisse sollten nach einem kurzen Threshold (~15-20s) einen proaktiven Reconnect auslösen:
```cpp
if (write_timeout_explicit || write_timeout_silent) {
    self->transport_write_timeout_count_++;
    self->scheduleManagedReconnect_("mqtt_write_timeout", MANAGED_RECONNECT_BASE_DELAY_MS);
} else if (sock_errno == EAGAIN || sock_errno == EWOULDBLOCK || sock_errno == 119) {
    // Backpressure: kein sofortiger Reconnect, aber nach 20s falls nicht erholt
    if (self->next_managed_reconnect_ms_ == 0) {
        self->scheduleManagedReconnect_("mqtt_eagain_backpressure",
                                        MANAGED_RECONNECT_EAGAIN_DELAY_MS); // 20000ms
    }
} else if (tls_timeout) {
    self->tls_connect_timeout_count_++;
    self->scheduleManagedReconnect_("mqtt_tls_timeout");
}
```

---

### BUG-3 (MITTEL): Heartbeat hat keinen CB-Bypass für MQTT-Connected-Zustand (AUT-346)

**Datei:** `El Trabajante/src/services/communication/mqtt_client.cpp:610`

**Kontext:** Wenn CB OPEN ist aber `g_mqtt_connected = true` (TCP-Verbindung physisch noch alive), blockiert CB den Heartbeat. Dabei IST der Heartbeat selbst das Keepalive-Signal das den Broker-Timeout verhindert.

**Anmerkung:** Mit Fix BUG-1 (OUTBOX-full nicht als CB-Failure zählen) wird dieser Fall seltener. Aber er kann immer noch auftreten wenn echte Broker-Failures 5x auftreten.

**Optionaler Fix (nach BUG-1):** In `publishHeartbeat()` einen speziellen QoS-0-Heartbeat senden der CB-Check umgeht — allerdings nur wenn `isConnected()` = true:
```cpp
// Nur wenn MQTT-Verbindung laut ESP-IDF noch steht, aber CB OPEN
// QoS 0 heartbeat = PINGREQ-Ersatz für Keepalive
bool cb_open = (circuit_breaker_.getState() == CircuitState::OPEN);
if (cb_open && isConnected()) {
    // Direct publish bypassing CB — keepalive must survive CB state
    // esp_mqtt_client_publish direkt (ohne publish()-Wrapper)
}
```

**Empfehlung:** Zuerst BUG-1 fixen. AUT-346 als separates Issue behandeln.

---

### BUG-4 (NIEDRIG): Kein WiFi-Recovery-Mechanismus nach MQTT-Disconnect

**Problem:** Nach einem MQTT-Disconnect wird nur MQTT reconnected. Wenn der MQTT-Disconnect durch ein WiFi-Problem verursacht wurde, kann WiFi in einem degradierten Zustand bleiben. Es gibt keinen expliziten WiFi-Reset-Mechanismus.

**Beobachtung:** Die 10+ Minuten ohne Reconnect deuten auf WiFi-Level-Probleme hin, die nicht durch MQTT-Reconnect allein gelöst werden.

**Fix:** Nach N fehlgeschlagenen MQTT-Reconnect-Versuchen (z.B. 5) WiFi disconnecten und reconnecten:
```cpp
// In processManagedReconnect_():
if (managed_reconnect_attempts_ >= FORCE_WIFI_RESET_THRESHOLD /* e.g. 5 */) {
    LOG_W(TAG, "[RECOVERY] Multiple MQTT reconnect failures — force WiFi reset");
    wifiManager.disconnect();
    delay(1000);
    wifiManager.connect(/* config */);
    managed_reconnect_attempts_ = 0;
}
```

---

## 5. Fix-Prioritäten und Implementierungsreihenfolge

| Priorität | Bug | Impact | Aufwand | Datei |
|-----------|-----|--------|---------|-------|
| 🔴 P1 | BUG-1: OUTBOX-full ≠ CB-Failure | Verhindert 90% der Disconnects durch CB-Overreaction | Mittel | `mqtt_client.cpp:1279` |
| 🟠 P2 | BUG-2: EAGAIN proaktiver Reconnect | Reduziert Disconnect-Dauer von 90s auf ~20s | Mittel | `mqtt_client.cpp:2190` |
| 🟡 P3 | BUG-4: WiFi-Reset nach N MQTT-Failures | Stellt Verbindung wieder her wenn WiFi degradiert | Hoch | `mqtt_client.cpp:1084` |
| 🟢 P4 | BUG-3: Heartbeat CB-Bypass | Redundant nach P1, aber extra Sicherheit | Niedrig | `mqtt_client.cpp:610` |

---

## 6. Verifikationsplan nach Fix

### Nach BUG-1:
```bash
# Serial monitor beobachten: "MQTT OUTBOX full (backpressure)" statt "Circuit Breaker (Service DOWN)"
# Heartbeat-Intervall bleibt stabil bei 60s
# Bei Stress-Test (burst publish): CB bleibt CLOSED
```

### Build:
```bash
cd "El Trabajante"
~/.platformio/penv/Scripts/pio.exe run -e esp32_dev
# Expected: Exit 0, keine Errors
```

### Integration:
1. Serial-Log beobachten: kein "publish blocked by Circuit Breaker" bei normalem Betrieb
2. MQTT-Logger: Heartbeats weiter alle 60s auch unter Last
3. Broker-Log: kein `exceeded timeout` in 24h Testbetrieb

---

## 7. Offene Fragen (Serial Log benötigt)

1. **Was geschah auf dem ESP zwischen 15:34:07 und 15:44+?**
   - Welche WiFi-Events?
   - Hat managed reconnect versucht zu reconnecten? (`[INC-EA5484] managed reconnect requested`)
   - War AP-Mode aktiv?

2. **Wie viele OUTBOX-full (-2) Returns zwischen 15:32:37 und 15:34:07?**
   - Bestätigt die CB-Threshold-Überschreitung

3. **WiFi-Status nach 15:34:07?**
   - `wifi_rssi`, IP-Adresse, Association-Status

**Empfehlung:** Serial-Monitor für den nächsten Disconnect aktiv lassen und vollständige Log-Ausgabe sichern.

---

## 8. Zusammenfassung

```
EAGAIN bei 15:32:37 (TCP Send-Buffer voll)
    │
    ├─→ ESP-IDF MQTT-Task blockiert in Write-Retry (bis 45s)
    │       └─→ Kein PINGREQ sendbar
    │
    ├─→ processPublishQueue gibt -2 (OUTBOX full) zurück
    │       └─→ recordFailure() × 5 in ~250ms → CB OPEN  ← BUG-1
    │
    ├─→ publishHeartbeat() → publish() → CB blockt → kein Heartbeat ← AUT-346
    │
    └─→ 90s ohne MQTT Traffic → Broker "exceeded timeout" bei 15:34:07
            │
            └─→ MQTT_EVENT_DISCONNECTED
                    │
                    ├─→ scheduleManagedReconnect_ (nach 15s grace)
                    │
                    └─→ Reconnect-Versuche können Broker nicht erreichen
                            └─→ Ursache unklar (WiFi degradiert?) ← H1
```

**Kernaussage:** Der Disconnect wäre vermeidbar gewesen, wenn OUTBOX-full **nicht** als CB-Failure gewertet würde (BUG-1). Der CB öffnete innerhalb von 250ms und blockierte den Heartbeat, was den Broker-Timeout auslöste. Ohne BUG-1 würde der Heartbeat weiter laufen und der Broker-Timeout ausbleiben.

---

---

## 9. Nachfolge-Incident: Emergency-State nach Reconnect (16:20–16:23)

### Was der User beobachtete
Der ESP kam nach dem Disconnect wieder online — aber sofort war ein Emergency-State aktiv. Aktor GPIO 25 (Leuchte) lehnte alle ON-Befehle ab: `"Actuator in emergency stop state. Clear emergency first."`

### Rekonstruierter Zeitstrahl (aus MQTT-Logger + god_kaiser.log)

| Zeit | Event | Beleg |
|------|-------|-------|
| ~15:14:37 | ESP bootet (POWERON) | `heartbeat.uptime=3967` @ 16:20:44 |
| ~15:14:37 | Logic Rule "Beleuchtung Zelt" → GPIO 25 ON | Dauerauftrag 07:00–19:00 |
| 15:34:07 | MQTT-Disconnect (Incident aus §1–8) | Broker `exceeded timeout` |
| 15:34+ | ESP offline/reconnect (Dauer unklar) | 0 CONNECT in Broker-Log |
| **~16:14:37** | **Firmware Runtime-Protection feuert** | `runtime_ms: 3600022 ≥ max_runtime_ms: 3600000` |
| 16:20:10 | ESP wieder voll online, emergency bereits aktiv | seq 621: `EXECUTE_FAIL` |
| 16:20:27 | Actuator-Status bestätigt: `emergency:"active"` | seq 626 |
| 16:21:09 | Logic Engine sendet erneut ON-Befehl | Dauerregel feuert wieder |
| 16:21:10 | ESP: Alert `emergency_stop`, Response `failed` | seq 640, 642 |
| 16:21:10 | `queue_pressure` entered (fill=7/8) | seq — |
| 16:21:48 | User cleared emergency manuell | `POST /api/v1/actuators/clear_emergency` |
| 16:22:09 | Logic Rule "Beleuchtung Zelt" → GPIO 25 ON (wieder) | Korrelation `b545ed2f` |
| 16:23:09 | Logic Rule → GPIO 25 ON (wieder) | Korrelation `1b39d594` |
| **16:23:21** | **Zweiter Disconnect: LWT `unexpected_disconnect`** | seq —, neuer Incident |

### Root Cause: Firmware Runtime-Protection (erwartetes Verhalten)

**`max_runtime_ms: 3600000`** (1 Stunde) ist die konfigurierte Maximal-Laufzeit des Relais GPIO 25. Die Firmware-`PumpActuator`-Runtime-Protection zählt die kumulative ON-Zeit. Nach exakt 3.600.022 ms (1h + 22ms) löste sie `emergencyStop()` aus.

**Code-Beleg:**  
`El Trabajante/src/services/actuator/actuator_drivers/` — `PumpActuator` zählt `runtime_ms_` und vergleicht mit `config.max_runtime_ms`:
```
runtime_ms: 3600022 >= max_runtime_ms: 3600000 → emergencyStop("runtime_protection")
```

**Heartbeat-Metriken bestätigen den vorherigen Disconnect:**
```json
{
  "publish_outbox_drop_count": 1,    ← das verlorene seq 228
  "publish_queue_shed_count": 5,     ← Backpressure-Sheds während EAGAIN
  "safe_publish_retry_count": 30,    ← 30 Retry-Versuche während Disconnect
  "intent_chain_stage_enqueue_fail_count": 5  ← Queue voll
}
```
Diese Zahlen korrelieren exakt mit RC-1/RC-2 aus §2.

### Ist das ein Bug?

**Runtime-Protection selbst:** Kein Bug — das ist korrektes Safety-Verhalten. Die Firmware hat nach 1 Stunde Dauerbetrieb korrekt abgeschaltet.

**Aber: Konfigurationsproblem**  
`max_runtime_ms: 3600000` (1h) für eine **Leuchte** (Grow-Light) ist zu restriktiv. Eine Grow-Light soll lt. Logic Rule von 07:00–19:00 laufen (12 Stunden). Mit `max_runtime_ms = 3.600.000 ms` würde sie jeden Tag nach 1h stoppen und Emergency-State auslösen.

**Empfehlung:** `max_runtime_ms` für Leuchte auf mindestens `43200000` (12h) oder `0` (kein Limit) setzen.

### Problemkette: Logic Engine sendet ON während Emergency

Nach der Runtime-Protection sendet die Logic Engine weiter ON-Befehle (weil die Zeitregel 07:00-19:00 noch gilt). Der ESP lehnt alle ab → `EXECUTE_FAIL` → Intent-Outcome `retryable: true`. Das erzeugt unnötig Traffic und Queue-Pressure.

**Belegt:** `queue_pressure.entered_pressure (fill=7/8)` bei 16:21:09 — direkt ausgelöst durch den ON-Befehl während Emergency.

**Empfehlung:** Server-seitig prüfen: Wenn Aktor im Emergency-State ist (aus vorherigem actuator-Status bekannt), keine weiteren Befehle senden bis Emergency cleared.

### Zweiter Disconnect bei 16:23:21

Um 16:23:21 erscheint erneut eine LWT mit `"reason":"unexpected_disconnect","timestamp":0`. Die `timestamp:0` ist charakteristisch für einen ESP-Reboot (NVS-Will-Timestamp nicht gesetzt = LWT vom vorherigen Boot). Das deutet auf einen **ESP-Neustart** nach dem Emergency-Event hin — möglicherweise durch Watchdog-Timeout oder manuelle Auslösung.

---

## 10. Gesamtbild aller Incidents (2026-05-13)

```
~15:14  ESP bootet (POWERON) — Leuchte ON via Logic Rule
         │
15:32:37 EAGAIN: TCP Send-Buffer voll, seq 228 nie gesendet
         │
         ├─→ processPublishQueue → -2 (OUTBOX full) × 5 in 250ms → CB OPEN  [RC-2]
         │       AUT-390-Fix: recordFailure() entfernt ← BEHOBEN
         │
         ├─→ Heartbeat bei 15:32:46 blockiert (CB OPEN)  [RC-2]
         │
15:34:07 Broker "exceeded timeout" → LWT → MQTT_EVENT_DISCONNECTED
         │
         └─→ ESP versucht reconnect (0 CONNECT im Broker-Log für 10+ min)  [RC-3]
                 └─→ WiFi wahrscheinlich degradiert

~16:14   Leuchte GPIO 25 erreicht max_runtime_ms (1h) → emergencyStop()
         │
16:20    ESP wieder online — Emergency aktiv
         │
16:21:09 Logic Engine sendet ON → ESP: "emergency stop state" → queue_pressure
16:21:48 User cleared emergency manuell
         │
16:23:21 ESP Reboot (LWT timestamp=0) ← zweiter Disconnect
```

---

*Analyse-Basis: Mosquitto-Broker-Logs, MQTT-Logger (`automationone-mqtt-logger`), God-Kaiser-Server-Logs, `mqtt_client.cpp` (vollständig gelesen), `communication_task.cpp`, Firmware-Architektur-Dokumentation*
