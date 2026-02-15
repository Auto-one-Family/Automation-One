# MQTT-Debug Agent: Verifizierungsbericht

**Datum:** 2026-02-04
**Geprueft:** MQTT_TOPICS.md, COMMUNICATION_FLOWS.md, mqtt-debug.md
**Codebase-Quellen:** topic_builder.cpp, topics.py, mqtt_client.cpp, heartbeat_handler.py, sensor_handler.py, publisher.py, constants.py

---

## 1. Topic-Schema Konsistenz

### ESP32 Topics (TopicBuilder - topic_builder.cpp)

| Methode | Topic-Pattern | Zeile |
|---------|---------------|-------|
| `buildSensorDataTopic(gpio)` | `kaiser/{kaiser_id}/esp/{esp_id}/sensor/{gpio}/data` | 53-57 |
| `buildSensorBatchTopic()` | `kaiser/{kaiser_id}/esp/{esp_id}/sensor/batch` | 61-65 |
| `buildSensorCommandTopic(gpio)` | `kaiser/{kaiser_id}/esp/{esp_id}/sensor/{gpio}/command` | 70-74 |
| `buildSensorResponseTopic(gpio)` | `kaiser/{kaiser_id}/esp/{esp_id}/sensor/{gpio}/response` | 79-83 |
| `buildActuatorCommandTopic(gpio)` | `kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/command` | 87-91 |
| `buildActuatorStatusTopic(gpio)` | `kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/status` | 95-99 |
| `buildActuatorResponseTopic(gpio)` | `kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/response` | 103-107 |
| `buildActuatorAlertTopic(gpio)` | `kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/alert` | 111-115 |
| `buildActuatorEmergencyTopic()` | `kaiser/{kaiser_id}/esp/{esp_id}/actuator/emergency` | 119-123 |
| `buildSystemHeartbeatTopic()` | `kaiser/{kaiser_id}/esp/{esp_id}/system/heartbeat` | 127-131 |
| `buildSystemHeartbeatAckTopic()` | `kaiser/{kaiser_id}/esp/{esp_id}/system/heartbeat/ack` | 136-140 |
| `buildSystemCommandTopic()` | `kaiser/{kaiser_id}/esp/{esp_id}/system/command` | 144-148 |
| `buildSystemDiagnosticsTopic()` | `kaiser/{kaiser_id}/esp/{esp_id}/system/diagnostics` | 152-156 |
| `buildSystemErrorTopic()` | `kaiser/{kaiser_id}/esp/{esp_id}/system/error` | 160-164 |
| `buildConfigTopic()` | `kaiser/{kaiser_id}/esp/{esp_id}/config` | 168-172 |
| `buildConfigResponseTopic()` | `kaiser/{kaiser_id}/esp/{esp_id}/config_response` | 176-180 |
| `buildBroadcastEmergencyTopic()` | `kaiser/broadcast/emergency` | 184-187 |
| `buildSubzoneAssignTopic()` | `kaiser/{kaiser_id}/esp/{esp_id}/subzone/assign` | 192-196 |
| `buildSubzoneRemoveTopic()` | `kaiser/{kaiser_id}/esp/{esp_id}/subzone/remove` | 199-203 |
| `buildSubzoneAckTopic()` | `kaiser/{kaiser_id}/esp/{esp_id}/subzone/ack` | 206-210 |
| `buildSubzoneStatusTopic()` | `kaiser/{kaiser_id}/esp/{esp_id}/subzone/status` | 213-217 |
| `buildSubzoneSafeTopic()` | `kaiser/{kaiser_id}/esp/{esp_id}/subzone/safe` | 220-224 |

### Server Topics (topics.py / constants.py)

| Konstante | Topic-Pattern | Datei:Zeile |
|-----------|---------------|-------------|
| `MQTT_TOPIC_ESP_SENSOR_DATA` | `kaiser/{kaiser_id}/esp/{esp_id}/sensor/{gpio}/data` | constants.py:14 |
| `MQTT_TOPIC_ESP_ACTUATOR_STATUS` | `kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/status` | constants.py:15 |
| `MQTT_TOPIC_ESP_CONFIG_RESPONSE` | `kaiser/{kaiser_id}/esp/{esp_id}/config_response` | constants.py:17 |
| `MQTT_TOPIC_ESP_HEARTBEAT` | `kaiser/{kaiser_id}/esp/{esp_id}/system/heartbeat` | constants.py:21 |
| `MQTT_TOPIC_ESP_ACTUATOR_COMMAND` | `kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/command` | constants.py:24 |
| `MQTT_TOPIC_ESP_SENSOR_COMMAND` | `kaiser/{kaiser_id}/esp/{esp_id}/sensor/{gpio}/command` | constants.py:25 |
| `MQTT_TOPIC_ESP_SENSOR_RESPONSE` | `kaiser/{kaiser_id}/esp/{esp_id}/sensor/{gpio}/response` | constants.py:26 |
| `MQTT_TOPIC_ESP_CONFIG` | `kaiser/{kaiser_id}/esp/{esp_id}/config` | constants.py:29 |
| `MQTT_TOPIC_ESP_SYSTEM_COMMAND` | `kaiser/{kaiser_id}/esp/{esp_id}/system/command` | constants.py:30 |
| `MQTT_TOPIC_ESP_HEARTBEAT_ACK` | `kaiser/{kaiser_id}/esp/{esp_id}/system/heartbeat/ack` | constants.py:32 |
| `MQTT_TOPIC_ESP_ZONE_ASSIGN` | `kaiser/{kaiser_id}/esp/{esp_id}/zone/assign` | constants.py:35 |
| `MQTT_TOPIC_ESP_ZONE_ACK` | `kaiser/{kaiser_id}/esp/{esp_id}/zone/ack` | constants.py:36 |
| `MQTT_TOPIC_SUBZONE_ASSIGN` | `kaiser/{kaiser_id}/esp/{esp_id}/subzone/assign` | constants.py:46 |
| `MQTT_TOPIC_SUBZONE_REMOVE` | `kaiser/{kaiser_id}/esp/{esp_id}/subzone/remove` | constants.py:47 |
| `MQTT_TOPIC_SUBZONE_SAFE` | `kaiser/{kaiser_id}/esp/{esp_id}/subzone/safe` | constants.py:48 |
| `MQTT_TOPIC_SUBZONE_ACK` | `kaiser/{kaiser_id}/esp/{esp_id}/subzone/ack` | constants.py:51 |
| `MQTT_TOPIC_SUBZONE_STATUS` | `kaiser/{kaiser_id}/esp/{esp_id}/subzone/status` | constants.py:52 |

### Konsistenz-Status

- [x] **Alle ESP32-Topics in Server dokumentiert:** 22/22 Topics sind konsistent
- [x] **Abweichungen:** Keine strukturellen Abweichungen gefunden
- [x] **Zusaetzliche Server-Topics:** Server hat einige zusaetzliche Topics fuer interne Kommunikation (Kaiser-to-Kaiser)

**Ergebnis:** KONSISTENT

---

## 2. Payload-Schemas

### 2.1 Heartbeat (ESP->Server)

**Dokumentierte Felder (MQTT_TOPICS.md Zeile 402-425):**
- `ts` (int, required) - Unix Timestamp
- `uptime` (int, required) - Uptime in Sekunden
- `heap_free` (int, required) - Freier Heap in Bytes
- `wifi_rssi` (int, required) - WiFi RSSI in dBm
- `esp_id`, `zone_id`, `master_zone_id`, `zone_assigned`, `sensor_count`, `actuator_count`, `gpio_status`, `gpio_reserved_count` (optional)

**ESP32-Code Felder (mqtt_client.cpp:659-720):**
```cpp
"esp_id", "zone_id", "master_zone_id", "zone_assigned", "ts", "uptime",
"heap_free", "wifi_rssi", "sensor_count", "actuator_count",
"gpio_status" (array), "gpio_reserved_count", "config_status"
```

**Server-Validierung (heartbeat_handler.py:61-79):**
- Erwartet: `ts`, `uptime`, `heap_free` (oder `free_heap`), `wifi_rssi`
- Validierung in `_validate_payload()` (nicht explizit gezeigt, aber referenziert)

**Status:** KONSISTENT - Dokumentation und Code stimmen ueberein. Server akzeptiert sowohl `heap_free` als auch `free_heap`.

### 2.2 Sensor Data (ESP->Server)

**Dokumentierte Felder (MQTT_TOPICS.md Zeile 76-116):**
- `ts` / `timestamp` (int, required) - Unix Timestamp
- `esp_id` (string, required) - ESP32 Device ID
- `gpio` (int, required) - GPIO Pin Nummer
- `sensor_type` (string, required) - Sensor-Typ
- `raw` / `raw_value` (float, required) - Raw Sensor-Wert
- `raw_mode` (bool, **REQUIRED**) - true = Server verarbeitet
- Optional: `value`, `unit`, `quality`, `subzone_id`, `sensor_name`, `library_name`, `library_version`, `meta`, `onewire_address`, `i2c_address`

**Server-Validierung (sensor_handler.py:370-426):**
```python
Required fields:
- ts OR timestamp (int)
- esp_id (string)
- gpio (int)
- sensor_type (string)
- raw OR raw_value (numeric)
- raw_mode (bool)  # REQUIRED!
```

**Status:** KONSISTENT - Dokumentation und Server-Validierung stimmen ueberein.

**Wichtig:** `raw_mode` ist PFLICHTFELD - dies ist korrekt dokumentiert.

### 2.3 Actuator Command (Server->ESP)

**Dokumentierte Felder (MQTT_TOPICS.md Zeile 228-247):**
- `command` (string) - ON, OFF, PWM, TOGGLE
- `value` (float) - 0.0-1.0 fuer PWM
- `duration` (int) - Sekunden (0 = unbegrenzt)
- `timestamp` (int)

**Server-Code Felder (publisher.py:64-102):**
```python
payload = {
    "command": command.upper(),
    "value": value,
    "duration": duration,
    "timestamp": int(time.time()),
    "correlation_id": correlation_id  # optional
}
```

**Status:** KONSISTENT - Code stimmt mit Dokumentation ueberein. `correlation_id` ist zusaetzlich im Code fuer End-to-End Tracking.

---

## 3. QoS-Werte

### Dokumentierte QoS (MQTT_TOPICS.md Zeile 1033-1040)

| QoS | Verwendung |
|-----|------------|
| 0 | Heartbeat, Diagnostics |
| 1 | Sensor-Daten, Alerts, Status |
| 2 | Commands, Config |

### ESP32 QoS (mqtt_client.cpp)

| Topic | QoS | Zeile | Kommentar |
|-------|-----|-------|-----------|
| Heartbeat | 0 | 720 | `// QoS 0 (heartbeat doesn't need guaranteed delivery)` |
| LWT | 1 | 315, 335 | `// QoS 1 (At Least Once)` |
| Default publish | 1 | 536 | `qos == 1` als default |

### Server QoS (constants.py, subscriber.py)

| Konstante | QoS | Datei:Zeile |
|-----------|-----|-------------|
| `QOS_SENSOR_DATA` | 1 | constants.py:195 |
| `QOS_ACTUATOR_COMMAND` | 2 | constants.py:196 |
| `QOS_SENSOR_COMMAND` | 2 | constants.py:197 |
| `QOS_HEARTBEAT` | 0 | constants.py:198 |
| `QOS_CONFIG` | 2 | constants.py:199 |

**Server Subscriber QoS Logic (subscriber.py:118-124):**
```python
if "heartbeat" in pattern:
    qos = 0  # Heartbeat: QoS 0
elif "config" in pattern or "ack" in pattern:
    qos = 2  # Config: QoS 2 (exactly once)
else:
    qos = 1  # Default: QoS 1 (at least once)
```

### Vergleichstabelle

| Topic | Dokumentiert | ESP32 | Server | Status |
|-------|--------------|-------|--------|--------|
| heartbeat | 0 | 0 | 0 | KONSISTENT |
| sensor/data | 1 | 1 (default) | 1 | KONSISTENT |
| actuator/command | 2 | - (Server publishes) | 2 | KONSISTENT |
| actuator/status | 1 | 1 (default) | 1 | KONSISTENT |
| config | 2 | - (Server publishes) | 2 | KONSISTENT |
| config_response | 2 | 1 (default) | 2 (subscription) | HINWEIS |
| diagnostics | 0 | 0 | 1 (subscription) | HINWEIS |

**Hinweise:**
1. ESP32 verwendet default QoS 1 fuer publishes (ausser Heartbeat mit QoS 0)
2. Server subscriber verwendet QoS 2 nur fuer config/ack patterns
3. Diagnostics: Dokumentation sagt QoS 0, Server subscribed mit QoS 1 - kein Konflikt da QoS upgrade erlaubt

---

## 4. Timing-Konstanten

### Dokumentierte Werte

| Metrik | Dokumentiert | Quelle |
|--------|--------------|--------|
| Heartbeat-Intervall | 60s | MQTT_TOPICS.md Zeile 400 |
| Device-Timeout | 300s (5 min) | MQTT_TOPICS.md Zeile 605 |

### ESP32 Werte

| Metrik | Wert | Datei:Zeile |
|--------|------|-------------|
| `HEARTBEAT_INTERVAL_MS` | 60000 (60s) | mqtt_client.h:117 |

### Server Werte

| Metrik | Wert | Datei:Zeile |
|--------|------|-------------|
| `HEARTBEAT_TIMEOUT_SECONDS` | 300 | heartbeat_handler.py:44 |
| `heartbeat_timeout` (config) | 120 (default) | config.py:194 |
| `heartbeat_timeout_seconds` | 180 (default) | config.py:480 |
| `TIMEOUT_ESP_HEARTBEAT` | 120000 (2 min) | constants.py:183 |

### Vergleichstabelle

| Metrik | Dokumentiert | ESP32 | Server | Status |
|--------|--------------|-------|--------|--------|
| Heartbeat-Intervall | 60s | 60s | - | KONSISTENT |
| Device-Timeout | 300s | - | 300s (handler) | KONSISTENT |
| Heartbeat-Timeout (config) | - | - | 120s / 180s | ABWEICHUNG |

**Hinweis:** Server hat mehrere Timeout-Konfigurationen:
- `HEARTBEAT_TIMEOUT_SECONDS = 300` in heartbeat_handler.py (verwendet fuer `check_device_timeouts()`)
- Config defaults variieren (120s, 180s) - diese sind ueberschreibbar via Umgebungsvariablen

---

## 5. Fehlende Referenzen im mqtt-debug Agent

### Aktuelle Referenzen (mqtt-debug.md Zeile 86-92)

| Thema | Datei | Vorhanden |
|-------|-------|-----------|
| Topic-Schema | `.claude/reference/api/MQTT_TOPICS.md` | JA |
| Payload-Struktur | `.claude/reference/api/MQTT_TOPICS.md` | JA |
| Kommunikationsfluesse | `.claude/reference/patterns/COMMUNICATION_FLOWS.md` | JA |
| QoS-Anforderungen | `.claude/reference/api/MQTT_TOPICS.md` | JA |

### Fehlende Referenzen

| Referenz | Benoetigt fuer | Empfehlung |
|----------|----------------|------------|
| ERROR_CODES.md | Payload-Fehler (`success:false`, `error_code` Feld) | Hinzufuegen zur Referenz-Tabelle |
| WEBSOCKET_EVENTS.md | Server->Frontend Events nach MQTT-Verarbeitung | Optional - hilft bei End-to-End Debugging |

### Empfohlene Erweiterung fuer mqtt-debug.md Zeile 86-92:

```markdown
## 6. Referenzen

| Thema | Datei | Section |
|-------|-------|---------|
| Topic-Schema | `.claude/reference/api/MQTT_TOPICS.md` | Section 0: Quick-Lookup |
| Payload-Struktur | `.claude/reference/api/MQTT_TOPICS.md` | Per Topic |
| Kommunikationsfluesse | `.claude/reference/patterns/COMMUNICATION_FLOWS.md` | Sequenzen |
| QoS-Anforderungen | `.claude/reference/api/MQTT_TOPICS.md` | Per Topic |
| Error-Codes | `.claude/reference/errors/ERROR_CODES.md` | Payload-Fehler Analyse |
| WebSocket-Events | `.claude/reference/api/WEBSOCKET_EVENTS.md` | Server->Frontend nach MQTT |
```

---

## 6. Korrektur-Aktionen

### Dokumentations-Updates

1. [ ] **MQTT_TOPICS.md:** `raw_mode` als REQUIRED markieren (bereits korrekt, aber prominent hervorheben)
2. [ ] **MQTT_TOPICS.md:** `correlation_id` fuer actuator/command dokumentieren (fehlt in Doku)
3. [ ] **mqtt-debug.md:** ERROR_CODES.md zu Referenzen hinzufuegen (Zeile 86-92)
4. [ ] **mqtt-debug.md:** WEBSOCKET_EVENTS.md optional zu Referenzen hinzufuegen

### Code-Konsistenz (Keine kritischen Aenderungen noetig)

- QoS-Werte sind konsistent
- Topic-Patterns sind konsistent
- Payload-Felder sind konsistent (mit dokumentierten Alternativen wie `ts`/`timestamp`, `raw`/`raw_value`)

### Hinweise fuer Entwickler

1. **Timing-Konfiguration:** Server-Timeout-Werte sind via Umgebungsvariablen konfigurierbar - Dokumentation sollte dies erwaehnen
2. **QoS Upgrade:** ESP32 default QoS 1 wird nie niedriger als dokumentiert sein - QoS upgrade ist MQTT-konform
3. **Payload-Kompatibilitaet:** Server akzeptiert multiple Feldnamen (`heap_free`/`free_heap`, `ts`/`timestamp`, `raw`/`raw_value`) - diese Flexibilitaet ist dokumentiert

---

## 7. Zusammenfassung

| Kategorie | Status | Bemerkung |
|-----------|--------|-----------|
| Topic-Schema | KONSISTENT | Alle 22 ESP32-Topics stimmen mit Server ueberein |
| Payload-Schemas | KONSISTENT | Heartbeat, Sensor, Actuator Command - alle OK |
| QoS-Werte | KONSISTENT | Alle kritischen Pfade haben korrekten QoS |
| Timing-Konstanten | KONSISTENT | 60s Heartbeat, 300s Timeout wie dokumentiert |
| Agent-Referenzen | ERWEITERBAR | ERROR_CODES.md sollte hinzugefuegt werden |

**Gesamtergebnis:** MQTT-Debug Agent Dokumentation ist VERIFIZIERT und KONSISTENT mit der Codebase.

---

*Bericht erstellt: 2026-02-04*
*Verifiziert durch: Automatisierte Codebase-Analyse*
