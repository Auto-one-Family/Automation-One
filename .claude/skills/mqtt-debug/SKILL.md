---
name: mqtt-debug
description: |
  MQTT-Debug Skill für AutomationOne IoT-Framework.
  Wissensbasis für MQTT-Traffic-Analyse, Broker-Health,
  Message-Flow-Debugging, Circuit Breaker Diagnose,
  Offline-Buffer-Status, Client-Disconnect-Analyse.
  Fokus: Was passiert auf MQTT-Protokoll-Ebene.
allowed-tools: Read, Grep, Glob
---

# MQTT Debug Skill

> **Fokus:** MQTT-Protokoll-Ebene - Traffic, Broker, Message-Flow
> **NICHT:** Handler-Verarbeitung (server-debug), Hardware (esp32-debug)

---

## 0. Quick Reference - Debug-Fokus

| Ich analysiere... | Primäre Quelle | Sekundäre Quelle |
|-------------------|----------------|------------------|
| **MQTT-Traffic** | `logs/current/mqtt_traffic.log` | `make mqtt-sub` live |
| **Broker-Health** | `make logs-mqtt` | `docker compose logs mqtt-broker` |
| **ESP32 MQTT-Status** | `logs/current/esp32_serial.log` | Pattern: `[MQTT]` |
| **Server MQTT-Status** | `logs/current/god_kaiser.log` | Logger: `src.mqtt.*` |
| **Fehlende Messages** | Sequenz-Analyse | Cross-Layer-Korrelation |
| **Connection-Issues** | Broker-Log + Serial-Log | Circuit Breaker Status |

### Schnell-Diagnose Befehle

| Ziel | Befehl |
|------|--------|
| Live MQTT-Traffic | `make mqtt-sub` |
| Broker-Logs | `make logs-mqtt` |
| Container-Status | `make status` |
| Server-Health (inkl. MQTT) | `make health` |
| ESP32 Serial | `make monitor` |

---

## 1. Debug-Fokus & Abgrenzung

### Mein Bereich

- MQTT-Traffic-Analyse (Topic-Patterns, Payload-Validierung)
- Broker-Health (Connection, Persistence, Queues)
- Message-Flow-Probleme (fehlende Messages, falsche QoS)
- Client-Disconnects (ESP32 und Server)
- Offline-Buffer-Status (ESP32: 100 Messages, Server: unbegrenzt)
- Circuit Breaker Status (ESP32: 5 failures → 30s OPEN)
- Registration Gate (ESP32: 10s Timeout Fallback)
- Last-Will-Testament (LWT) Analysis
- Request-Response-Sequenzen (Heartbeat→ACK, Command→Response)

### NICHT mein Bereich

| Problem | Zuständiger Agent |
|---------|-------------------|
| Sensor-Hardware-Probleme | `esp32-debug` |
| API/Handler-Fehler | `server-debug` |
| Frontend WebSocket | `frontend-debug` |
| Datenbankprobleme | `db-inspector` |
| System-Operationen | `system-control` |

### Abgrenzung zu anderen Debug-Agents

```
mqtt-debug: Was wird über MQTT gesendet? (Topics, Payloads, Timing)
server-debug: Wie verarbeitet der Server es? (Handler-Logs)
esp32-debug: Was passiert auf dem ESP32? (Serial-Logs, Hardware)
```

---

## 2. Log-Locations

### Primäre Quellen

| Quelle | Pfad | Format |
|--------|------|--------|
| MQTT-Traffic | `logs/current/mqtt_traffic.log` | `{topic} {json_payload}` |
| Broker-Log | Docker Volume `/mosquitto/log/mosquitto.log` | Timestamp + Message |
| ESP32 MQTT | `logs/current/esp32_serial.log` | `[MQTT]` Prefix |
| Server MQTT | `logs/current/god_kaiser.log` | JSON, logger: `src.mqtt.*` |

### Log-Zugriff

```bash
# MQTT-Traffic (mosquitto_sub -v Output)
cat logs/current/mqtt_traffic.log

# Broker-Logs via Docker
make logs-mqtt
docker compose logs -f mqtt-broker

# ESP32 MQTT-Logs filtern
grep "\[MQTT\]" logs/current/esp32_serial.log

# Server MQTT-Logs filtern (JSON)
grep '"logger":"src.mqtt' logs/current/god_kaiser.log
```

### Traffic-Log Format

```
kaiser/god/esp/ESP_12AB34CD/system/heartbeat {"esp_id":"ESP_12AB34CD","ts":1735818000,...}
```

**Parsing:**
- Topic: Zeilenanfang bis erstes Leerzeichen
- Payload: Alles nach erstem Leerzeichen (JSON)

---

## 3. Diagnose-Patterns

### Pattern A: Message fehlt

**Checkliste:**

1. **Topic korrekt?**
   - Vergleiche mit `MQTT_TOPICS.md` Schema
   - Pattern: `kaiser/{kaiser_id}/esp/{esp_id}/{kategorie}/{gpio?}/{aktion?}`
   - Häufiger Fehler: Falscher `kaiser_id` oder `esp_id`

2. **QoS passend?**
   - QoS 0: Kann verloren gehen (Heartbeat, Diagnostics)
   - QoS 1: At least once (Sensor-Daten, Status)
   - QoS 2: Exactly once (Commands, Config)

3. **Broker running?**
   - `make status` → Container-Status
   - `make health` → mqtt_connected prüfen
   - Telnet-Test: `telnet localhost 1883`

4. **Client connected?**
   - Broker-Log: "New connection from" / "Client disconnected"
   - ESP32: Circuit Breaker Status prüfen

5. **Subscription aktiv?**
   - Server: `subscriber.py` Handler-Registry
   - Broker-Log: "subscribe" Messages

6. **Circuit Breaker offen?**
   - ESP32 Serial: `[MQTT] Circuit OPEN`
   - Failure Count prüfen

### Pattern B: Duplicate Messages

**Checkliste:**

1. **QoS 1** → Duplikate sind ERLAUBT (At Least Once)
2. **QoS 2** → Duplikate sind ein BUG
   - Broker-Problem: Persistence-Issue
   - Client-Problem: Retry ohne Dedup

**Code-Referenz:**
- ESP32 Retry: `mqtt_client.cpp:569-600` (`safePublish()`)
- Server Retry: `publisher.py:354-418` (`_publish_with_retry()`)

### Pattern C: Client Disconnect

**ESP32-Seite prüfen:**

| Check | Location | Pattern |
|-------|----------|---------|
| Circuit Breaker | Serial-Log | `[MQTT] Circuit OPEN` |
| WiFi-Status | Serial-Log | Error 3001-3005 |
| Reconnect-Delay | Serial-Log | Exponential Backoff 1s → 60s |
| LWT gesendet? | Broker-Log | `system/will` Topic |

**Server-Seite prüfen:**

| Check | Location | Pattern |
|-------|----------|---------|
| Circuit Breaker | god_kaiser.log | `[resilience]` |
| paho.mqtt Status | god_kaiser.log | Logger `paho.mqtt` |
| Offline-Buffer | god_kaiser.log | `OfflineBuffer:` |

### Pattern D: Config Push fehlgeschlagen

**Flow analysieren:**

```
T+0s    Server → ESP:  config (QoS 2)
T+0.5s  ESP → Server:  config_response (QoS 2)
```

**Fehlerquellen:**

| Symptom | Mögliche Ursache | Prüfen |
|---------|------------------|--------|
| Config nicht empfangen | Topic nicht subscribed | ESP Subscription-List |
| Payload-Fehler | JSON-Format ungültig | Error 3016 im Serial |
| GPIO-Conflict | Config-Validierung | Error 1002 im Serial |
| Response verloren | QoS-Mismatch | Broker Persistence |

### Pattern E: Heartbeat-Gaps

**Erwartung:** Alle 60s ein Heartbeat

**Analyse:**
1. Timestamp-Differenz zwischen Heartbeats berechnen
2. Gaps > 90s (50% Toleranz) sind problematisch
3. Bei 300s (5min) wird ESP als offline markiert

**Ursachen für Gaps:**
- WiFi-Disconnect → Error 3004
- MQTT Circuit Breaker OPEN → 30s Pause
- ESP32 Watchdog Timeout → Reboot
- Server nicht erreichbar → Messages gepuffert

---

## 4. Error-Code Referenz (MQTT-spezifisch)

### ESP32 MQTT Errors (3010-3016)

| Code | Name | Wo geworfen | Debug-Aktion |
|------|------|-------------|--------------|
| 3010 | MQTT_INIT_FAILED | `mqtt_client.cpp` setup() | WiFi-Status prüfen |
| 3011 | MQTT_CONNECT_FAILED | `mqtt_client.cpp` connect() | Broker erreichbar? |
| 3012 | MQTT_PUBLISH_FAILED | `mqtt_client.cpp` safePublish() | Circuit Breaker? |
| 3013 | MQTT_SUBSCRIBE_FAILED | `mqtt_client.cpp` subscribe() | Topic-Format? |
| 3014 | MQTT_DISCONNECT | `mqtt_client.cpp` callback | Netzwerk? Broker restart? |
| 3015 | MQTT_BUFFER_FULL | `mqtt_client.cpp` offline_buffer | 100 Messages erreicht |
| 3016 | MQTT_PAYLOAD_INVALID | `mqtt_client.cpp` validate() | JSON-Format prüfen |

### Server MQTT Errors (5101-5107)

| Code | Name | Wo geworfen | Debug-Aktion |
|------|------|-------------|--------------|
| 5101 | PUBLISH_FAILED | `publisher.py` | Broker-Connection? |
| 5102 | TOPIC_BUILD_FAILED | `publisher.py` | Template-Variablen? |
| 5103 | PAYLOAD_SERIALIZATION | `publisher.py` | JSON-Schema? |
| 5104 | CONNECTION_LOST | `client.py` | Reconnect-Status? |
| 5105 | RETRY_EXHAUSTED | `publisher.py` | Circuit Breaker? |
| 5106 | BROKER_UNAVAILABLE | `client.py` | Container running? |
| 5107 | AUTHENTICATION_FAILED | `client.py` | mosquitto.conf? |

### Vollständige Error-Codes

Referenz: `.claude/reference/errors/ERROR_CODES.md`

---

## 5. Circuit Breaker Details

### ESP32 Circuit Breaker

**Konfiguration:** (`mqtt_client.cpp:55-61`)

| Parameter | Wert | Bedeutung |
|-----------|------|-----------|
| Failure Threshold | 5 | Nach 5 Fehlern → OPEN |
| Recovery Timeout | 30s | Zeit bis HALF_OPEN |
| Half-Open Test | 10s | Zeit für Test-Request |

**States:**
- **CLOSED:** Normal operation
- **OPEN:** Alle Requests blockiert (30s)
- **HALF_OPEN:** Ein Test-Request erlaubt

**Serial-Log Pattern:**
```
[MQTT] Circuit OPEN (waiting for recovery)
[MQTT] Circuit Breaker OPENED after reconnect failures
```

### Server Circuit Breaker

**Via Resilience Registry:** `src/core/resilience/`

**Logging Pattern:**
```json
{"logger": "src.core.resilience", "message": "[resilience] CircuitBreaker..."}
```

---

## 6. Offline-Buffer Details

### ESP32 Offline-Buffer

**Konfiguration:** (`mqtt_client.h`)

| Parameter | Wert |
|-----------|------|
| MAX_OFFLINE_MESSAGES | 100 |
| Verhalten bei voll | Neue Messages werden verworfen |

**Code:** `mqtt_client.cpp:824-878`

**Serial-Log Pattern:**
```
[MQTT] Added to offline buffer (count: 42)
[MQTT] Processing offline buffer (42 messages)
[MQTT] Offline buffer full, dropping message
```

### Server Offline-Buffer

**Konfiguration:** (`offline_buffer.py`)

| Parameter | Default |
|-----------|---------|
| max_size | From settings (unbegrenzt) |
| flush_batch_size | From settings |

**Features:**
- Bounded deque (älteste Messages werden verworfen)
- Thread-safe mit asyncio.Lock
- Re-queue failed messages bei flush

**Log Pattern:**
```
[resilience] OfflineBuffer: {n} messages buffered
[resilience] OfflineBuffer: Flushed {n} messages
```

---

## 7. Registration Gate (ESP32)

**Zweck:** Verhindert Publishing vor Server-Acknowledgment

**Timeout:** 10s Fallback (`REGISTRATION_TIMEOUT_MS`)

**Flow:**
1. ESP32 verbindet → Gate CLOSED
2. ESP32 sendet Heartbeat (erlaubt)
3. Server sendet Heartbeat-ACK
4. ESP32 empfängt ACK → Gate OPEN
5. Alle anderen Publishes nun erlaubt

**Bei Timeout:** Gate öffnet automatisch nach 10s

**Serial-Log Pattern:**
```
[MQTT] Registration gate closed - awaiting heartbeat ACK
[MQTT] REGISTRATION CONFIRMED BY SERVER
[MQTT] Gate opened - publishes now allowed
```

---

## 8. Mosquitto-Config Referenz

**Datei:** `docker/mosquitto/mosquitto.conf`

### Aktuelle Konfiguration

| Setting | Wert | Bedeutung |
|---------|------|-----------|
| listener | 1883 | MQTT Port |
| listener | 9001 | WebSocket Port |
| allow_anonymous | true | Keine Auth (DEV ONLY!) |
| persistence | true | Messages überleben Restart |
| max_inflight_messages | 20 | Parallele QoS 1/2 Messages |
| max_queued_messages | 1000 | Queue-Größe pro Client |
| message_size_limit | 262144 | 256KB max Payload |
| connection_messages | true | Log connects/disconnects |

### Logging-Level

```
log_type error
log_type warning
log_type notice
log_type information
```

---

## 9. Topic-Referenz (Kurzform)

### Häufigste Topics für Debug

| Topic-Pattern | Richtung | QoS | Debug-Relevanz |
|---------------|----------|-----|----------------|
| `.../system/heartbeat` | ESP→Server | 0 | Lebenszeichen, Timing |
| `.../system/heartbeat/ack` | Server→ESP | 0 | Registration, Status |
| `.../sensor/{gpio}/data` | ESP→Server | 1 | Sensor-Daten-Flow |
| `.../actuator/{gpio}/command` | Server→ESP | 2 | Command-Delivery |
| `.../actuator/{gpio}/response` | ESP→Server | 1 | Command-ACK |
| `.../config` | Server→ESP | 2 | Config-Push |
| `.../config_response` | ESP→Server | 2 | Config-ACK |
| `.../system/will` | Broker→Server | 1 | LWT (Offline) |
| `.../system/error` | ESP→Server | 1 | Error-Events |
| `kaiser/broadcast/emergency` | Server→ALL | 2 | Emergency Stop |

### Vollständige Topic-Dokumentation

Referenz: `.claude/reference/api/MQTT_TOPICS.md`

---

## 10. Sequenz-Erwartungen

### Heartbeat-Sequenz

```
T+0s    ESP → Server:  system/heartbeat
T+0.1s  Server → ESP:  system/heartbeat/ack {"status":"online"}
T+60s   ESP → Server:  system/heartbeat (nächster)
```

**Prüfpunkte:**
- ACK innerhalb 1s
- Status = "online" (nicht "pending_approval" oder "rejected")
- Intervall ≈ 60s (±10%)

### Command-Sequenz

```
T+0s    Server → ESP:  actuator/{gpio}/command
T+0.1s  ESP → Server:  actuator/{gpio}/response {"success":true}
T+0.2s  ESP → Server:  actuator/{gpio}/status
```

**Prüfpunkte:**
- Response innerhalb 500ms
- Status innerhalb 1s
- `success: true` in Response

### Config-Sequenz

```
T+0s    Server → ESP:  config (QoS 2)
T+0.5s  ESP → Server:  config_response (QoS 2)
```

**Prüfpunkte:**
- Response innerhalb 5s
- `config_applied: true`

---

## 11. Timing-Erwartungen

### Intervalle

| Metrik | Erwartung | Alarm wenn |
|--------|-----------|------------|
| Heartbeat | 60s | Gap > 90s |
| Sensor-Daten | 30s (default) | Gap > 45s |
| Device-Timeout | 300s | ESP offline |

### Latenzen

| Flow | Erwartung | Kritisch wenn |
|------|-----------|---------------|
| Heartbeat→ACK | <1s | >5s |
| Command→Response | <500ms | >2s |
| Config→Response | <1s | >5s |
| Emergency Stop | <100ms | >500ms |

---

## 12. Cross-Layer Korrelation

### MQTT-Fehler → Andere Agents

| MQTT-Symptom | Ursache könnte sein | Weiterleiten an |
|--------------|--------------------|-|
| ESP published nicht | WiFi/Hardware-Problem | esp32-debug |
| Server empfängt nicht | Subscriber/Handler-Config | server-debug |
| Frontend zeigt keine Live-Daten | WebSocket-Bridge-Problem | frontend-debug |
| Messages kommen aber DB leer | DB-Write-Fehler | db-inspector |

### Korrelations-Workflow

1. **Traffic-Log prüfen:** Message wurde gesendet?
2. **Broker-Log prüfen:** Message wurde empfangen/weitergeleitet?
3. **Server-Log prüfen:** Handler wurde aufgerufen?
4. **DB prüfen:** Daten wurden gespeichert?

---

## 13. Make-Targets für Debug

| Target | Zweck | Output |
|--------|-------|--------|
| `make mqtt-sub` | Alle Topics live beobachten | Terminal (Ctrl+C beenden) |
| `make logs-mqtt` | Broker-Logs anzeigen | Mosquitto Log |
| `make status` | Container-Status | Running/Stopped |
| `make health` | Server-Health inkl. MQTT | JSON Response |
| `make monitor` | ESP32 Serial-Monitor | Serial Output |

---

## 14. Report-Output

### Format

```
.claude/reports/current/MQTT_[FOCUS]_REPORT.md
```

Beispiele:
- `MQTT_HEARTBEAT_REPORT.md`
- `MQTT_CONFIG_REPORT.md`
- `MQTT_DISCONNECT_REPORT.md`

### Severity-Schema

| Tag | Bedeutung |
|-----|-----------|
| [K] | Kritisch - Sofortige Aufmerksamkeit |
| [W] | Warnung - Sollte untersucht werden |
| [I] | Info - Zur Dokumentation |

### Report-Template

```markdown
# MQTT Debug Report: [FOCUS]

**Session:** [aus STATUS.md]
**Erstellt:** [Timestamp]
**Log-Datei:** logs/current/mqtt_traffic.log
**Messages analysiert:** [Anzahl]

---

## 1. Zusammenfassung

| Metrik | Wert |
|--------|------|
| Gesamt-Messages | [n] |
| ESP-Devices | [Liste] |
| Fehler/Anomalien | [n] |
| Status | ✅ OK / ⚠️ WARNUNG / ❌ FEHLER |

---

## 2. Findings

### [K] Kritische Probleme

| Timestamp | Topic/ESP | Problem | Impact |
|-----------|-----------|---------|--------|

### [W] Warnungen

| Timestamp | Topic/ESP | Problem | Empfehlung |
|-----------|-----------|---------|------------|

### [I] Beobachtungen

[...]

---

## 3. Sequenz-Analyse

[Falls relevant]

---

## 4. Empfehlungen

1. [ ] [Konkrete Aktion]
2. [ ] [Weitere Aktion]
3. [ ] [Bei Bedarf: Anderen Agent aktivieren]
```

---

## 15. Code-Referenzen

### ESP32 MQTT-Implementation

| Datei | Zeilen | Funktion |
|-------|--------|----------|
| `mqtt_client.cpp` | 87-280 | Connection Management |
| `mqtt_client.cpp` | 370-448 | Reconnect + Circuit Breaker |
| `mqtt_client.cpp` | 478-567 | Publish + Registration Gate |
| `mqtt_client.cpp` | 569-598 | safePublish() mit Retry |
| `mqtt_client.cpp` | 659-721 | Heartbeat Publishing |
| `mqtt_client.cpp` | 824-878 | Offline Buffer Management |

### Server MQTT-Implementation

| Datei | Funktion |
|-------|----------|
| `publisher.py` | High-level Publishing + Retry |
| `subscriber.py` | Handler-Registry + Routing |
| `offline_buffer.py` | Graceful Degradation |
| `client.py` | Low-level MQTT Client |
| `topics.py` | Topic Builder |

### Handler-Registration

`main.py` Zeilen 201-307 - Alle MQTT-Handler werden hier registriert.

---

## 16. Regeln

### Dokumentations-Pflicht

- JEDE fehlende Response MUSS im Report erscheinen
- JEDES Timing-Problem (Gap > Erwartung) MUSS dokumentiert werden
- JEDE LWT Message MUSS dokumentiert werden
- JEDES `success: false` MUSS dokumentiert werden

### Abgrenzung strikt einhalten

- Ich analysiere NUR MQTT-Traffic und Broker-Status
- Server-Handler-Verhalten → server-debug weiterleiten
- ESP32-internes Verhalten → esp32-debug weiterleiten
- Wenn Message gesendet aber nicht verarbeitet → beide Agents empfehlen

### Log-Datei fehlt

Wenn `logs/current/mqtt_traffic.log` nicht existiert oder leer:

```
⚠️ MQTT-TRAFFIC NICHT VERFÜGBAR

Die Datei logs/current/mqtt_traffic.log existiert nicht oder ist leer.

Mögliche Ursachen:
1. Session wurde ohne MQTT-Capture gestartet
2. mosquitto_sub läuft nicht
3. Kein MQTT-Traffic während der Session

Prüfe:
- Läuft mosquitto_sub? → system-control kann Status prüfen
- Broker erreichbar? → make status, make health
```

---

**Version:** 1.0
**Erstellt:** 2026-02-05
**Basiert auf:** mqtt_client.cpp, publisher.py, subscriber.py, offline_buffer.py, mosquitto.conf, MQTT_TOPICS.md, ERROR_CODES.md
