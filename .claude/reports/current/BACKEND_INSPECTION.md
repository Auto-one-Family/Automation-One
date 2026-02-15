# Backend Inspection Report
**Timestamp:** 2026-02-15T14:46:00Z
**Inspector:** Backend Inspector
**Kontext:** ESP32-Dev SHT31, pending_approval, Parallel-Inspektion
**Branch:** feature/frontend-consolidation (ahead 15)

---

## 1. System-Gesamtzustand

### Container-Status (12/12 running)
| Container | Image | Status | Ports |
|-----------|-------|--------|-------|
| automationone-server | auto-one-el-servador | Up 4h (healthy) | 8000 |
| automationone-frontend | auto-one-el-frontend | Up 4h (healthy) | 5173 |
| automationone-mqtt | eclipse-mosquitto:2 | Up 4h (healthy) | 9001 |
| automationone-postgres | postgres:16-alpine | Up 4h (healthy) | 5432 |
| automationone-loki | grafana/loki:3.4 | Up 4h (healthy) | 3100 |
| automationone-grafana | grafana/grafana:11.5.2 | Up 4h (healthy) | 3000 |
| automationone-prometheus | prom/prometheus:v3.2.1 | Up 4h (healthy) | 9090 |
| automationone-promtail | grafana/promtail:3.4 | Up 4h (healthy) | - |
| automationone-cadvisor | cadvisor:v0.49.1 | Up 4h (healthy) | 8080 |
| automationone-mqtt-logger | eclipse-mosquitto:2 | Up 4h | - |
| automationone-mosquitto-exporter | mosquitto-exporter:0.8.0 | Up 4h **(unhealthy)** | 9234 |
| automationone-postgres-exporter | postgres-exporter:v0.16.0 | Up 4h (healthy) | 9187 |

### debug-status.ps1 Ergebnis
- **Overall:** `critical` (aber irrefÃ¼hrend - siehe Analyse)
- **Docker:** ok (12/12 running)
- **Server:** error (Invoke-RestMethod Timeout-Bug im Script, aber curl.exe zeigt: alive=true)
- **Postgres:** ok (16 Connections, 39 MB)
- **MQTT:** ok (port open)
- **Frontend:** ok (port open)
- **Loki:** error im Script (aber Loki liefert Daten erfolgreich via API)
- **Prometheus:** error im Script
- **Grafana:** error im Script
- **Disk:** Images 18.2GB (66% reclaimable), Build Cache 8.5GB (6.1GB reclaimable)

> **BEFUND:** Debug-Status-Script meldet false-positive "critical" - die Services laufen alle korrekt. Das Script hat Timeout-Probleme mit Invoke-RestMethod unter Windows.

---

## 2. Loki-Logs (alle Services)

### 2.1 el-servador (God-Kaiser Server)

**HTTP-Traffic (letzte 15 Min):**
- Prometheus Metrics-Scraping: alle 15s `/api/v1/health/metrics` -> 200 OK
- Docker Healthcheck: alle 30s `/api/v1/health/live` -> 200 OK
- Frontend-Polling: `/api/v1/esp/devices/pending` -> 200 OK (regelmÃ¤ÃŸig)
- Frontend-Auth: `/api/v1/auth/login` -> 200 OK, `/api/v1/auth/status` -> 200 OK
- WebSocket: client connected `client_1771166245812_uirx41l9v` -> accepted

**Auth-AuffÃ¤lligkeiten:**
- `14:37:24` - JWT verification failed: Signature has expired
- `14:37:25` - Refresh token is blacklisted
- `14:37:24` - GET `/api/v1/auth/me` -> 401 Unauthorized (2x)
- Danach: `/api/v1/auth/refresh` -> 200 OK (Token-Refresh erfolgreich)
- WebSocket reconnect nach Token-Refresh: OK

**SimulationScheduler WARNINGS (wiederholen sich alle 30s):**
```
[MOCK_E1BD1447] Sensor 5_pH not in config
[MOCK_E1BD1447] Sensor 21_sht31_temp not in config
[MOCK_E1BD1447] Sensor 4_DS18B20 not in config
```
> **BEFUND KRITISCH:** MOCK_E1BD1447 ist pending_approval, hat aber KEINE sensor_configs in DB. Der SimulationScheduler versucht trotzdem Sensordaten zu generieren und scheitert 3x pro 30s-Zyklus. Das sind ~6 Warnings/Minute = 360/Stunde.

**HeartbeatHandler WARNINGS (jede Minute):**
```
ZONE_MISMATCH [MOCK_25045525]: ESP lost zone config (zone_assigned=false). DB has zone_id='test'. Auto-reassigning zone.
```
> **BEFUND:** MOCK_25045525 sendet `zone_assigned=false` im Heartbeat, aber DB hat zone_id='test'. Server reassigned zone jede Minute neu. Endlos-Loop.

**MQTT Subscriber ERRORS (jede Minute):**
```
Invalid JSON payload on topic kaiser/god/esp/MOCK_25045525/system/will: Expecting value: line 1 column 1 (char 0)
```
> **BEFUND:** Mock-ESP publiziert `(null)` als Will-Message. Server-Subscriber crasht bei JSON-Parse.

**Maintenance Jobs (normal):**
- `health_check_esps`: 1 checked, 1 online, 0 timed out (korrekt - nur MOCK_25045525 ist "online")
- `sensor_health`: 1 checked, 0 stale, 1 healthy (DS18B20 auf MOCK_25045525)
- Alle APScheduler Jobs laufen im Takt (15s metrics, 30s sensor/mqtt, 60s heartbeat/health)

### 2.2 mqtt-broker (Mosquitto)

**HauptsÃ¤chlich Healthcheck-Traffic:**
- Alle 30s: `healthcheck` Client connected/disconnected (Docker HEALTHCHECK)
- `14:37:58`: `auto-CFF24EEC-DC29-82C7-90F4-B2AFDE8935AA` subscribed `#` (kurze Debug-Session, disconnected 14:38:18)
- `14:32:35`: Mosquitto DB-Persist: "Saving in-memory database to /mosquitto/data/mosquitto.db"
- Keine Anomalien, kein Client-Overflow

### 2.3 postgres

**Loki-Ergebnis:** Leere Ausgabe (keine Logs Ã¼ber Loki gesammelt)
> **BEFUND:** Postgres-Logs werden nicht Ã¼ber Promtail/Loki erfasst oder das Label stimmt nicht. DB lÃ¤uft aber einwandfrei (verifiziert Ã¼ber direkte Queries).

---

## 3. Datenbank-Inspektion

### 3.1 ESP Devices

| device_id | name | status | ip_address | firmware | last_seen |
|-----------|------|--------|------------|----------|-----------|
| MOCK_E1BD1447 | *(leer)* | **pending_approval** | *(leer)* | *(leer)* | 2026-02-15 14:45:37 |
| MOCK_25045525 | Mock #5525 | online | 127.0.0.1 | MOCK_1.0.0 | 2026-02-15 14:45:17 |

**Capabilities MOCK_E1BD1447:** `{"max_sensors": 20, "max_actuators": 12, "features": ["heartbeat", "sensors", "actuators"]}`
**Capabilities MOCK_25045525:** `{"max_sensors": 20, "max_actuators": 12, "mock": true}`

> **BEFUND KRITISCH:** Es gibt KEINE echte ESP32-Hardware im System. Beide GerÃ¤te sind MOCK-Devices vom SimulationScheduler. Kein ESP_00000001 oder anderes reales GerÃ¤t in der DB. Der User beschreibt einen echten ESP32 mit SHT31 - dessen Heartbeats kommen entweder nicht an oder werden nicht verarbeitet.

> **BEFUND:** MOCK_E1BD1447 hat keinen `name`, keine `ip_address`, keine `firmware_version`. Wurde 2x discovered (11:33 und 12:02), 1x approved (11:51), danach wieder in pending_approval (wahrscheinlich Re-Discovery nach Server-Neustart oder DB-Reset).

### 3.2 Heartbeats (letzte 30 Min)

| device_id | count | first_hb | last_hb | avg_interval_sec |
|-----------|-------|----------|---------|------------------|
| MOCK_25045525 | 30 | 14:12:17 | 14:41:17 | 60.00s |

> **BEFUND:** Nur MOCK_25045525 hat Heartbeat-Logs (online-Status). MOCK_E1BD1447 (pending) hat KEINE Heartbeat-Logs in den letzten 30 Min - Heartbeats von pending Devices werden nicht in esp_heartbeat_logs geschrieben, nur last_seen wird aktualisiert.

### 3.3 Sensor Configs

| device_id | gpio | sensor_type | sensor_name | enabled | interface |
|-----------|------|-------------|-------------|---------|-----------|
| MOCK_25045525 | 4 | DS18B20 | Temp 0C79 | true | ONEWIRE |

> **BEFUND:** Nur 1 Sensor-Config fÃ¼r MOCK_25045525. MOCK_E1BD1447 hat KEINE sensor_configs (erklÃ¤rt die SimulationScheduler-Warnings).

### 3.4 Sensor Data (letzte 20 EintrÃ¤ge)

| sensor_type | device_id | raw_value | processed_value | unit | data_source |
|-------------|-----------|-----------|-----------------|------|-------------|
| DS18B20 | MOCK_25045525 | 0 | *(null)* | *(leer)* | mock |

- **Alle 20 EintrÃ¤ge:** raw_value=0, processed_value=NULL, unit=leer, data_source=mock
- **Intervall:** ~30s (14:33:08 bis 14:42:38)
- **Gesamt:** 164 EintrÃ¤ge seit 13:24:38

> **BEFUND KRITISCH:** Alle Sensor-Daten haben `raw_value=0`. Der Mock-Simulator generiert keine realistischen Werte. `processed_value` ist immer NULL - Pi-Enhanced-Processing greift nicht oder ist fÃ¼r Mock deaktiviert. `unit` ist leer - DS18B20 sollte 'Â°C' haben.

### 3.5 Orphaned Records
- **0 orphaned sensor_configs** (clean)

### 3.6 Tabellen-GrÃ¶ÃŸen

| Tabelle | GrÃ¶ÃŸe |
|---------|-------|
| sensor_data | **20 MB** |
| esp_heartbeat_logs | 8.9 MB |
| esp_devices | 352 kB |
| audit_logs | 208 kB |
| sensor_configs | 152 kB |
| token_blacklist | 88 kB |
| actuator_history | 88 kB |
| cross_esp_logic | 80 kB |
| ai_predictions | 80 kB |
| user_accounts | 64 kB |
| Gesamt DB | ~39 MB |

> **BEFUND:** sensor_data (20 MB) und esp_heartbeat_logs (8.9 MB) machen 75% der DB aus. Bei mock raw_value=0 ist das 20 MB DatenmÃ¼ll. Cleanup/Retention empfohlen.

### 3.7 Audit Logs

| Timestamp | Event | Source | Status |
|-----------|-------|--------|--------|
| 15 12:02:37 | device_discovered | MOCK_E1BD1447 | success |
| 15 11:52:37 | device_online | MOCK_E1BD1447 | success |
| 15 11:51:58 | device_approved | MOCK_E1BD1447 | success |
| 15 11:33:38 | device_discovered | MOCK_E1BD1447 | success |

> **BEFUND:** MOCK_E1BD1447 wurde um 11:33 entdeckt, um 11:51 approved, kam um 11:52 online, wurde dann um 12:02 ERNEUT als "discovered" registriert -> zurÃ¼ck auf pending_approval. Das deutet auf einen Bug: Nach Approval wird das GerÃ¤t bei nÃ¤chster Discovery wieder auf pending gesetzt.

---

## 4. MQTT Live-Traffic

### Captured Messages (30 messages, 15s window)

**Retained Messages von ESP_00000001 (alte Session, kein aktives GerÃ¤t):**
- `kaiser/god/esp/ESP_00000001/system/command/response` - onewire/scan ok (found_count:1, pin:4)
- `kaiser/god/esp/ESP_00000001/system/will` - offline, unexpected_disconnect
- `kaiser/god/esp/ESP_00000001/zone/ack` - zone_assigned: greenhouse
- `kaiser/god/esp/ESP_00000001/config_response` - error: "Actuator config array is empty"
- `kaiser/god/esp/ESP_00000001/actuator/5/status` - relay, state:false
- `kaiser/god/esp/ESP_00000001/actuator/5/response` - ON command executed
- `kaiser/god/esp/ESP_00000001/actuator/5/alert` - emergency_stop
- `kaiser/god/esp/ESP_00000001/onewire/scan_result` - DS18B20 found (280102030405069E)

**Live Messages von MOCK_25045525:**
- `system/heartbeat` - state:OPERATIONAL, uptime:4740, heap:45526, wifi_rssi:-50, sensor_count:1
- `system/will` - `(null)` <- **Fehlerhaft!**
- `zone/assign` - Server sendet zone_id:"test" (Auto-Reassign)
- `system/heartbeat/ack` - status:online, config_available:false

> **BEFUND:** ESP_00000001 retained Messages sind noch auf dem Broker (will: offline). Kein realer ESP32-Traffic sichtbar. Die Will-Message von MOCK_25045525 ist `(null)` statt gÃ¼ltigem JSON - verursacht den subscriber ERROR im Server.

> **BEFUND:** `config_available: false` im Heartbeat-ACK fÃ¼r MOCK_25045525 obwohl 1 DS18B20-SensorConfig existiert. Der Server meldet keine verfÃ¼gbare Config.

---

## 5. Health-Endpoints

### /api/v1/health/live
```json
{"success": true, "alive": true}
```
**Status: OK**

### /api/v1/health/ready
```json
{"success": true, "ready": true, "checks": {"database": true, "mqtt": true, "disk_space": true}}
```
**Status: OK** - Alle Subsysteme bereit

### /api/v1/health/detailed (authentifiziert)
```json
{
  "status": "healthy",
  "version": "2.0.0",
  "environment": "development",
  "uptime_seconds": 13390,
  "uptime_formatted": "0d 3h 43m",
  "database": {
    "connected": true,
    "pool_size": 20,
    "pool_available": 18,
    "latency_ms": 5.0,
    "database_type": "PostgreSQL"
  },
  "mqtt": {
    "connected": true,
    "subscriptions": 5,
    "messages_received": 0,
    "messages_published": 0
  },
  "websocket": {
    "active_connections": 2,
    "total_messages_sent": 0
  },
  "system": {
    "cpu_percent": 14.4,
    "memory_percent": 31.3,
    "memory_used_mb": 2238,
    "disk_free_gb": 935.5
  }
}
```
> **BEFUND:** MQTT Counters zeigen `messages_received: 0, messages_published: 0` trotz aktivem Traffic. Die Health-Counters tracken die MQTT-Messages nicht korrekt.

### /api/v1/health/esp (authentifiziert)
```json
{"success": false, "error": {"code": "INTERNAL_ERROR", "message": "An unexpected error occurred"}}
```
> **BEFUND KRITISCH:** ESP-Health-Endpoint wirft einen INTERNAL_ERROR. Kein Stack-Trace in der Response. Server-Log mÃ¼sste den Fehler zeigen.

### /api/v1/esp/devices/pending (authentifiziert)
```json
{
  "success": true,
  "count": 1,
  "devices": [{
    "device_id": "MOCK_E1BD1447",
    "discovered_at": "2026-02-15T12:02:37",
    "last_seen": "2026-02-15T14:44:37",
    "zone_id": "greenhouse",
    "heap_free": 49999,
    "wifi_rssi": -53,
    "sensor_count": 3,
    "actuator_count": 0,
    "heartbeat_count": 1,
    "ip_address": null,
    "hardware_type": "ESP32_WROOM"
  }]
}
```
> **BEFUND:** Pending-Device zeigt `sensor_count: 3` (pH, sht31_temp, DS18B20) obwohl 0 sensor_configs existieren. Die sensor_count kommt aus dem Heartbeat-Payload, nicht aus DB.

---

## 6. Cross-Layer-Korrelation

### Heartbeat-Flow (MOCK_25045525 - online)
```
SimScheduler (14:41:17) -> MQTT publish heartbeat
  -> Broker receives -> Server subscriber processes
    -> HeartbeatHandler: ZONE_MISMATCH warning -> Auto-reassign zone
      -> MQTT publish zone/assign
        -> MQTT publish heartbeat/ack (config_available: false)
          -> DB: esp_heartbeat_logs INSERT (60s interval bestÃ¤tigt)
            -> DB: last_seen UPDATE
```
**Timing:** End-to-End < 1s, aber ZONE_MISMATCH loop jede Minute

### Heartbeat-Flow (MOCK_E1BD1447 - pending_approval)
```
SimScheduler (14:40:37) -> MQTT publish heartbeat
  -> Server processes -> Updates last_seen in DB
    -> KEIN Heartbeat-Log (pending devices excluded)
      -> SimScheduler sensor_job (14:40:38) -> Sensors not in config (3 warnings)
```
**Timing:** Heartbeat 14:40:37, Sensor-Versuch 14:40:38 (1s delay)

### Discovery-Approval-Rediscovery Bug
```
11:33:38 - MOCK_E1BD1447 discovered (pending_approval)
11:51:58 - Admin approved
11:52:37 - Device came online
12:02:37 - Device REDISCOVERED -> zurÃ¼ck auf pending_approval!
```
> **ROOT CAUSE HYPOTHESE:** Nach Approval behandelt der nÃ¤chste Heartbeat-Cycle das GerÃ¤t als "neu" statt als "bekannt". MÃ¶glicherweise wird der Status im SimulationScheduler nicht korrekt synchronisiert, oder der Heartbeat-Handler prÃ¼ft den Status nicht korrekt.

### MQTT Will-Message Korrelation
```
SimScheduler publishes will=(null) fÃ¼r MOCK_25045525
  -> Broker retained
    -> Server subscriber: JSON parse error (jede Minute)
      -> Kein Crash (error wird geloggt, Verarbeitung geht weiter)
```

---

## 7. Befunde & Bewertung

### KRITISCH (FunktionsstÃ¶rung)

| # | Befund | Auswirkung | Betroffene Komponente |
|---|--------|------------|-----------------------|
| K1 | **Kein echtes ESP32-GerÃ¤t sichtbar** | Nur MOCK-Devices in DB. Real-ESP Heartbeats erreichen System nicht oder werden nicht verarbeitet. | MQTT/Server/ESP |
| K2 | **Discovery-Approval-Rediscovery Bug** | MOCK_E1BD1447 wurde nach Approval erneut als pending_approval registriert (11:51 approved, 12:02 rediscovered). Approval-Flow defekt. | HeartbeatHandler/Discovery |
| K3 | **Health/ESP Endpoint INTERNAL_ERROR** | `/api/v1/health/esp` gibt 500 zurÃ¼ck. ESP-Health-Monitoring via API nicht mÃ¶glich. | API/ESP-Service |
| K4 | **Sensor-Data raw_value immer 0** | 164 EintrÃ¤ge mit raw_value=0, processed_value=NULL, unit=leer. Mock-Simulator generiert keine realistischen Werte. 20 MB nutzlose Daten. | SimulationScheduler |

### HOCH (Wiederkehrende Fehler)

| # | Befund | Auswirkung | Betroffene Komponente |
|---|--------|------------|-----------------------|
| H1 | **SimScheduler Sensor-Warnings** | 3 Warnings alle 30s fÃ¼r MOCK_E1BD1447 (pending). ~360 Warnings/h. Log-Noise. | SimulationScheduler |
| H2 | **ZONE_MISMATCH Loop** | MOCK_25045525 bekommt jede Minute zone reassigned. Endlos-Loop zwischen ESP (zone_assigned=false) und Server (zone='test'). | HeartbeatHandler |
| H3 | **Invalid Will-Message JSON** | MOCK_25045525 publiziert `(null)` als Will. JSON parse error jede Minute. | SimulationScheduler/MQTT |
| H4 | **MQTT Health-Counters bei 0** | health/detailed zeigt messages_received=0, messages_published=0 trotz aktivem Traffic. Monitoring-Blind. | Health/MQTT-Service |

### MITTEL (Konfiguration/DatenqualitÃ¤t)

| # | Befund | Auswirkung | Betroffene Komponente |
|---|--------|------------|-----------------------|
| M1 | **config_available: false** | Heartbeat-ACK meldet keine Config verfÃ¼gbar, obwohl DS18B20-SensorConfig existiert. | HeartbeatHandler |
| M2 | **Postgres-Logs nicht in Loki** | Keine DB-Logs Ã¼ber Loki abrufbar. Monitoring-LÃ¼cke. | Promtail/Loki-Config |
| M3 | **mosquitto-exporter unhealthy** | Container lÃ¤uft, aber Health-Check schlÃ¤gt fehl. Mosquitto-Metrics in Prometheus ggf. unvollstÃ¤ndig. | Docker/Monitoring |
| M4 | **debug-status.ps1 false-positives** | Script meldet "critical" obwohl alle Services laufen. Invoke-RestMethod Timeout-Bug unter Windows. | Debug-Tooling |
| M5 | **Retained ESP_00000001 Messages** | Alte MQTT-Messages (will: offline, emergency_stop etc.) noch auf Broker. Geister-Daten. | MQTT-Broker |
| M6 | **MOCK_E1BD1447 keine Metadaten** | name=leer, ip_address=leer, firmware_version=leer. Incomplete Device-Record. | SimulationScheduler |

### NIEDRIG (Housekeeping)

| # | Befund | Auswirkung | Betroffene Komponente |
|---|--------|------------|-----------------------|
| N1 | **Docker Disk-Usage** | 18.2GB Images (66% reclaimable), 8.5GB Build Cache. Cleanup empfohlen. | Docker |
| N2 | **sensor_data 20 MB DatenmÃ¼ll** | 164 EintrÃ¤ge mit raw_value=0. Data-Retention/Cleanup Job fehlt oder greift nicht. | Maintenance |
| N3 | **WebSocket total_messages_sent: 0** | WS connected (2 clients) aber keine Messages gesendet. MÃ¶glicherweise Counter-Bug. | WebSocket/Health |

---

### Empfohlene Aktionen (PrioritÃ¤t)

1. **K1/K2:** Discovery-Flow debuggen - warum wird ein approved Device rediscovered? Heartbeat-Handler Logik fÃ¼r Status-Checks prÃ¼fen.
2. **K3:** `/api/v1/health/esp` Exception untersuchen (Server-Logs nach Stack-Trace suchen).
3. **K4:** SimulationScheduler Mock-Werte-Generierung fixen (raw_value sollte nicht 0 sein, unit sollte gesetzt sein).
4. **H1:** Sensor-Job sollte pending_approval Devices Ã¼berspringen.
5. **H2:** Zone-Assign-Loop unterbrechen - entweder Mock-ESP korrigieren oder HeartbeatHandler Zone-Check anpassen.
6. **H3:** Will-Message im SimulationScheduler als valides JSON publizieren.
7. **H4:** MQTT Message-Counter in Health-Service implementieren/fixen.
