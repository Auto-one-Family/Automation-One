# MQTT Debug-Topic Analysis Report
**Datum:** 2026-02-10
**Auftraggeber:** Technical Manager (Phase 2A: ESP32 Debug-Infrastruktur)
**Agents:** esp32-dev (Codebase-Analyse) + mqtt-debug (MQTT-Validierung)
**Detail-Reports:** `.claude/reports/current/ESP32_DEV_REPORT.md` + `.claude/reports/current/MQTT_DEBUG_REPORT.md`

---

## Executive Summary

Vollstaendige Codebase-Analyse fuer die Implementation eines MQTT Debug-Topics abgeschlossen.
**Ergebnis: Gruenes Licht. Keine Blocker. Implementation kann starten.**

Neues Topic `kaiser/{kaiser_id}/esp/{esp_id}/system/debug` (QoS 0, 60s periodisch + event-basiert)
passt perfekt in die bestehende Architektur. Beide Agents (esp32-dev + mqtt-debug) bestaetigen
den Ansatz unabhaengig voneinander.

**KRITISCHER Nebenfund:** `system/diagnostics` hat KEINEN Server-Handler. ESP32 HealthMonitor
published seit Monaten ins Leere. Empfehlung: system/debug als Ersatz nutzen.

---

## Teil 1: IST-Zustand MQTT-Kommunikation

### 1.1 MQTT-Topics (komplett)

**ESP32 published (15 Topics):**

| Topic-Suffix | QoS | Frequenz | Builder-Methode |
|-------------|-----|----------|-----------------|
| sensor/{gpio}/data | 1 | 30s/Sensor | buildSensorDataTopic() |
| sensor/batch | 1 | 60s (optional) | buildSensorBatchTopic() |
| sensor/{gpio}/response | 1 | Auf Anfrage | buildSensorResponseTopic() |
| actuator/{gpio}/status | 1 | Bei Aenderung | buildActuatorStatusTopic() |
| actuator/{gpio}/response | 1 | Nach Command | buildActuatorResponseTopic() |
| actuator/{gpio}/alert | 1 | Bei Alert | buildActuatorAlertTopic() |
| system/heartbeat | 0 | 60s | buildSystemHeartbeatTopic() |
| system/diagnostics | 0 | 60s + Aenderung | buildSystemDiagnosticsTopic() |
| system/error | 1 | Bei Error | buildSystemErrorTopic() |
| config_response | 2 | Nach Config | buildConfigResponseTopic() |
| subzone/ack | 1 | Nach Assign/Remove | buildSubzoneAckTopic() |
| subzone/status | 1 | Bei Aenderung | buildSubzoneStatusTopic() |
| status | 1 | Bei Aenderung | Direkt in main.cpp |
| safe_mode | 1 | Bei Safe-Mode | Direkt in main.cpp |
| zone/ack | 1 | Nach Zone-Assign | Direkt in main.cpp |

**Topic-Schema:** `kaiser/{kaiser_id}/esp/{esp_id}/{kategorie}/{gpio}/{aktion}`
- kaiser_id = "god" (einziger Wert)
- esp_id = z.B. "ESP_12AB34CD"

**Server subscribed (14 Handler):**

| Pattern | Handler | Status |
|---------|---------|--------|
| .../sensor/+/data | sensor_handler.py | Aktiv |
| .../actuator/+/status | actuator_handler.py | Aktiv |
| .../actuator/+/response | actuator_response_handler.py | Aktiv |
| .../actuator/+/alert | actuator_alert_handler.py | Aktiv |
| .../system/heartbeat | heartbeat_handler.py | Aktiv |
| .../system/error | error_handler.py | Aktiv |
| .../system/will | lwt_handler.py | Aktiv |
| .../discovery/esp32_nodes | discovery_handler.py | Aktiv |
| .../config_response | config_handler.py | Aktiv |
| .../zone/ack | zone_ack_handler.py | Aktiv |
| .../subzone/ack | subzone_ack_handler.py | Aktiv |
| .../actuator/+/command | mock_actuator_command_handler | Aktiv |
| .../actuator/emergency | mock_actuator_command_handler | Aktiv |
| kaiser/broadcast/emergency | mock_actuator_command_handler | Aktiv |

**FEHLEND:** system/diagnostics → KEIN Handler! Daten gehen verloren.

### 1.2 Server Handler-Architektur

```
subscriber.py (Message Router) -> _route_message() -> _find_handler() -> ThreadPool(10)
    -> JSON Parse -> Topic Match (Wildcard +/#) -> Handler -> DB/Audit/WebSocket
```

Referenz-Pattern (error_handler.py): Parse -> Validate -> resilient_session() -> ESP Lookup -> Business Logic -> Audit DB -> WebSocket Broadcast

### 1.3 ESP32 Publishing-Mechanismus

- `mqttClient.publish(topic, payload, qos)` oder `safePublish()` (1 Retry)
- Circuit Breaker: 5 Failures -> OPEN -> 30s Recovery
- Registration Gate: Nach Connect nur Heartbeats bis Server-ACK (10s Fallback)
- Offline Buffer: 100 Messages max, FIFO bei Reconnect
- Payload: Manuell gebauter JSON-String

---

## Teil 2: IST-Zustand ESP32-seitiges Debugging

### 2.1 Logger-System

**5 Log-Levels mit vollstaendiger Abstraktion:**
```
LOG_DEBUG(0) < LOG_INFO(1) < LOG_WARNING(2) < LOG_ERROR(3) < LOG_CRITICAL(4)
```
- 1324 Aufrufe in 27 Dateien
- Circular Buffer: 50 Eintraege, 6.8 KB RAM
- Runtime-konfigurierbar: `logger.setLogLevel(level)`
- Serial ON/OFF: `logger.setSerialEnabled(bool)`

**Zusaetzlich: 161 direkte Serial.print() Aufrufe** (davon 127 temporaer in mqtt_client.cpp)

### 2.2 Bereits verfuegbare Diagnose-Daten

| Daten | In Heartbeat | In Diagnostics | In Error |
|-------|:---:|:---:|:---:|
| heap_free | X | X | |
| heap_min_free | | X | |
| heap_fragmentation | | X | |
| uptime | X | | |
| wifi_rssi | X | | |
| wifi_connected | | X | |
| mqtt_connected | | X | |
| sensor_count | X | | |
| actuator_count | X | | |
| error_count | | X | |
| system_state | | X | |
| gpio_status | X | | |
| watchdog_* | | X | |
| error_code/severity | | | X |

### 2.3 NICHT erfasste Daten (wertvoll fuer Debug-Topic)

| Daten | Quelle | Wert |
|-------|--------|------|
| Boot-Reason | esp_reset_reason() | Watchdog? Brownout? |
| Log-Buffer | logger.getLogs() | Letzte 50 Eintraege |
| Circuit-Breaker State | circuit_breaker_.getState() | OPEN/CLOSED/HALF_OPEN |
| NVS Usage | StorageManager | Speicherverbrauch |
| WiFi Reconnect Count | WifiManager | Stabilitaet |
| MQTT Reconnect Count | reconnect_attempts_ | Stabilitaet |
| Offline Buffer Count | getOfflineMessageCount() | Puffer-Status |
| Task Stack Watermark | uxTaskGetStackHighWaterMark() | Stack-Safety |

### 2.4 RAM/Flash-Budget

| Parameter | XIAO ESP32-C3 | ESP32 Dev |
|-----------|:---:|:---:|
| MAX_SENSORS | 10 | 20 |
| MAX_ACTUATORS | 6 | 12 |
| MQTT_MAX_PACKET_SIZE | 1024 | 2048 |
| Free Heap (typisch) | ~160-250 KB | ~160-250 KB |

Groesste RAM-Bloecke: Offline Buffer (~25-50 KB), Logger (6.8 KB), Error Buffer (7 KB)

---

## Teil 3: Design-Vorschlag

### 3.1 Topic

```
kaiser/{kaiser_id}/esp/{esp_id}/system/debug
```
- Konsistent mit system/heartbeat, system/diagnostics, system/error, system/will
- Server-Subscription: `kaiser/{id}/esp/+/system/debug`
- Kein Topic-Konflikt (mqtt-debug Agent bestaetigt)

### 3.2 Payload-Schema

```json
{
  "ts": 1735818000,
  "esp_id": "ESP_12AB34CD",
  "type": "log_batch",
  "data": {
    "logs": [
      {"ts_ms": 123456, "level": "WARNING", "message": "Sensor timeout GPIO 4"},
      {"ts_ms": 123789, "level": "ERROR", "message": "[1043] Sensor read timeout"}
    ],
    "metrics": {
      "heap_free": 180000,
      "heap_min_free": 150000,
      "heap_fragmentation_pct": 12,
      "wifi_rssi": -65,
      "wifi_reconnects": 2,
      "mqtt_reconnects": 1,
      "mqtt_offline_buffered": 0,
      "mqtt_circuit_breaker": "CLOSED",
      "error_count": 3,
      "uptime_s": 3600,
      "boot_reason": 1
    }
  }
}
```
- Max ~800 Bytes (unter MQTT_MAX_PACKET_SIZE=1024 des XIAO)
- Kombiniert Logs + Metriken in einem Publish (minimiert Message-Count)

### 3.3 Frequenz & Trigger

| Trigger | Bedingung | QoS |
|---------|-----------|-----|
| Periodisch | Alle 60s (konfigurierbar) | 0 |
| Event | Bei CRITICAL-Level Log | 0 |
| Event | Bei Circuit-Breaker OPEN | 0 |
| Auf Anfrage | system/command "send_debug" | 0 |

Rate-Limiting: Max 1 Debug-Publish pro 10s (Flood-Schutz)

### 3.4 Server-Pipeline

```
ESP32 -> MQTT system/debug -> Server debug_handler.py
    -> Structured Logging (logger.info() mit esp_id, esp_level, message)
    -> stdout JSON -> Docker Logs -> Promtail -> Loki -> Grafana
```

**Promtail braucht KEINE Aenderung!** Nutzt bestehende Server-Container-Log-Pipeline.

**Grafana LogQL:**
```
{compose_service="el-servador", logger=~".*debug_handler.*"} |= "$esp_id"
```

### 3.5 Performance-Impact

| Metrik | Aktuell | Mit Debug | Delta |
|--------|---------|-----------|-------|
| Messages/ESP/min | 3-5 | 4-6 | +20-30% |
| Payload/ESP/min | ~1-2 KB | ~2-3 KB | +800 Bytes |
| Broker Queue | <100 | <110 | Vernachlaessigbar |
| ESP32 RAM | +0 Bytes (nutzt bestehenden Logger-Buffer) | | |
| ESP32 Flash | +2-3 KB Code | | |

**Risiko: NIEDRIG** (beide Agents bestaetigen)

---

## Implementierungsplan

### Phase 1: ESP32 (esp32-dev Agent)

| Schritt | Datei | Aenderung |
|---------|-------|-----------|
| 1.1 | utils/topic_builder.h + .cpp | buildSystemDebugTopic() |
| 1.2 | error_handling/debug_publisher.h + .cpp | Neue Singleton-Klasse |
| 1.3 | src/main.cpp | debugPublisher.begin() + loop() |

### Phase 2: Server (mqtt-dev Agent)

| Schritt | Datei | Aenderung |
|---------|-------|-----------|
| 2.1 | mqtt/topics.py | parse_system_debug_topic() + build() |
| 2.2 | mqtt/handlers/debug_handler.py | Neuer Handler (Pattern: error_handler.py) |
| 2.3 | src/main.py | Handler-Registrierung |
| 2.4 | mqtt/subscriber.py Zeile 119 | QoS-Logik: "debug" -> QoS 0 |

### Phase 3: Dokumentation (updatedocs)

| Schritt | Datei | Aenderung |
|---------|-------|-----------|
| 3.1 | MQTT_TOPICS.md | Topic #33: system/debug |
| 3.2 | MQTT_TOPICS.md | system/diagnostics: "KEIN HANDLER (deprecated)" |

---

## Nebenfunde

### 1. system/diagnostics: KEIN Server-Handler (KRITISCH)

- ESP32 HealthMonitor published seit Monaten auf dieses Topic
- Server hat keinen Subscriber registriert
- MQTT_TOPICS.md dokumentiert falsch: "main.py:274" existiert nicht
- **Empfehlung:** system/debug als Ersatz nutzen, diagnostics als deprecated markieren

### 2. 127 temporaere Serial.print in mqtt_client.cpp

- Markiert mit `#region agent log` Tags
- Sollten aufgeraeumt werden (sind temporaere Debug-Instrumentierung)

### 3. Logger Circular Buffer (50 Entries) relativ klein

- Bei hoher Log-Frequenz ueberschreibt Buffer in <40ms
- Fuer Debug-Topic: Separater "publish-only" Buffer mit WARNING+ Level sinnvoll

### 4. Registration Gate Timing

- Event-basierter Debug (CRITICAL sofort) kann in ersten 10s nach Connect blockiert werden
- Loesung: Offline-Buffer nutzen (standard-Verhalten)

---

## Agent-Reihenfolge fuer Implementation

```
1. esp32-dev  -> Phase 1 (TopicBuilder + DebugPublisher + main.cpp)
2. mqtt-dev   -> Phase 2 (topics.py + debug_handler.py + subscriber.py)
3. updatedocs -> Phase 3 (MQTT_TOPICS.md aktualisieren)
```

---

**Report-Ende. Bereit fuer TM-Entscheidung.**
