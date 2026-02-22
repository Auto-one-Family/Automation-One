# System-State Report fuer Phasenplan-Validierung

> **Erfasst:** 2026-02-21, via `/system-control` (Ops-Modus)
> **Zweck:** Ist-Zustand als Basis fuer Phase 0-4 Validierung

---

## 1. Docker-Stack Status

**12/13 Services laufen, 1 unhealthy (nicht kritisch):**

| Service | Container | Status | Ports |
|---------|-----------|--------|-------|
| postgres | automationone-postgres | Up 2h (healthy) | 5432 |
| mqtt-broker | automationone-mqtt | Up 2h (healthy) | 1883, 9001 |
| el-servador | automationone-server | Up 2h (healthy) | 8000 |
| el-frontend | automationone-frontend | Up 2h (healthy) | 5173 |
| grafana | automationone-grafana | Up 2h (healthy) | 3000 |
| prometheus | automationone-prometheus | Up 2h (healthy) | 9090 |
| loki | automationone-loki | Up 2h (healthy) | 3100 |
| promtail | automationone-promtail | Up 2h (healthy) | - |
| cadvisor | automationone-cadvisor | Up 2h (healthy) | 8080 |
| postgres-exporter | automationone-postgres-exporter | Up 2h (healthy) | 9187 |
| mosquitto-exporter | automationone-mosquitto-exporter | Up 2h (**unhealthy**) | 9234 |
| mqtt-logger | automationone-mqtt-logger | Up 2h (running) | 1883 |

**Fehlend:** adminer (devtools Profil nicht aktiv), serial-logger (hardware Profil nicht aktiv)

**Bewertung Phase 0:** Stack ist bereit. Mosquitto-Exporter unhealthy hat keinen Einfluss auf Alert-Regeln (nutzt god_kaiser_* Metriken, nicht Exporter-Metriken).

---

## 2. Prometheus-Metriken — Tatsaechlich Exponiert

**Quelle:** `GET /api/v1/health/metrics` (live abgefragt)

### Existierende Metriken (15 total)

| Metrik | Typ | Aktueller Wert | In Phase 0 Alerts? |
|--------|-----|----------------|-------------------|
| `god_kaiser_uptime_seconds` | Gauge | 5955.0 | Nein |
| `god_kaiser_cpu_percent` | Gauge | 15.3 | Nein |
| `god_kaiser_memory_percent` | Gauge | 29.3 | JA (ao-high-memory) |
| `god_kaiser_mqtt_connected` | Gauge | 1.0 | JA (ao-mqtt-disconnected) |
| `god_kaiser_mqtt_messages_total` | Counter | (mit direction Label) | Nein |
| `god_kaiser_mqtt_errors_total` | Counter | (mit direction Label) | JA (ao-high-mqtt-error-rate) |
| `god_kaiser_websocket_connections` | Gauge | 0.0 | Nein |
| `god_kaiser_db_query_duration_seconds` | Histogram | sum=5.8, count=1554 | JA (ao-db-query-slow) |
| `god_kaiser_esp_total` | Gauge | 5.0 | JA (ao-esp-offline) |
| `god_kaiser_esp_online` | Gauge | 1.0 | JA (ao-esp-offline) |
| `god_kaiser_esp_offline` | Gauge | 2.0 | JA (ao-esp-offline) |
| `god_kaiser_esp_avg_heap_free_bytes` | Gauge | 0.0 | Nein |
| `god_kaiser_esp_min_heap_free_bytes` | Gauge | 0.0 | Nein |
| `god_kaiser_esp_avg_wifi_rssi_dbm` | Gauge | 0.0 | Nein |
| `god_kaiser_esp_avg_uptime_seconds` | Gauge | 0.0 | Nein |

### FEHLENDE Metriken fuer Phase 0 Alert-Regeln

**KRITISCH fuer Phase 0 — Diese Metriken existieren NICHT:**

| Geplanter Alert | Benoetigte Metrik | Status | Aktion |
|----------------|-------------------|--------|--------|
| ao-sensor-temp-range | `god_kaiser_sensor_value{sensor_type="..."}` | **FEHLT** | Server-Dev: Sensor-Value Gauge implementieren |
| ao-sensor-ph-range | `god_kaiser_sensor_value{sensor_type="..."}` | **FEHLT** | Server-Dev: Sensor-Value Gauge implementieren |
| ao-sensor-humidity-range | `god_kaiser_sensor_value{sensor_type="..."}` | **FEHLT** | Server-Dev: Sensor-Value Gauge implementieren |
| ao-sensor-ec-range | `god_kaiser_sensor_value{sensor_type="..."}` | **FEHLT** | Server-Dev: Sensor-Value Gauge implementieren |
| ao-sensor-stale | `god_kaiser_sensor_last_update` | **FEHLT** | Server-Dev: Last-Update Gauge implementieren |
| ao-heartbeat-gap | `god_kaiser_esp_last_heartbeat` | **FEHLT** | Server-Dev: Last-Heartbeat Gauge implementieren |
| ao-esp-boot-loop | `god_kaiser_esp_boot_count` | **FEHLT** | Server-Dev: Boot-Count Counter implementieren |
| ao-esp-error-cascade | `god_kaiser_esp_errors_total` | **FEHLT** | Server-Dev: ESP-Error Counter implementieren |
| ao-esp-safe-mode | `god_kaiser_esp_safe_mode` | **FEHLT** | Server-Dev: Safe-Mode Gauge implementieren |
| ao-ws-disconnects | `god_kaiser_ws_disconnects_total` | **FEHLT** | Server-Dev: WS-Disconnect Counter implementieren |
| ao-mqtt-message-backlog | `god_kaiser_mqtt_queued_messages` | **FEHLT** | Server-Dev: Queue-Size Gauge implementieren |
| ao-api-errors-high | `god_kaiser_http_errors_total` | **FEHLT** | Server-Dev: HTTP-Error Counter implementieren |
| ao-logic-engine-errors | `god_kaiser_logic_errors_total` | **FEHLT** | Server-Dev: Logic-Error Counter implementieren |
| ao-actuator-timeout | `god_kaiser_actuator_timeouts_total` | **FEHLT** | Server-Dev: Actuator-Timeout Counter implementieren |
| ao-safety-triggered | `god_kaiser_safety_triggers_total` | **FEHLT** | Server-Dev: Safety-Trigger Counter implementieren |

**Fazit:** 15 der 20 geplanten neuen Alerts brauchen Metriken die noch NICHT im Server implementiert sind. Nur 5 der 20 neuen Alerts koennen sofort mit bestehenden Metriken umgesetzt werden (ao-db-query-slow nutzt vorhandene Histogram-Daten). Die uebrigen brauchen `server-dev` Implementierung in `metrics.py`.

**3-Stage-Pipeline-kompatible Alerts (SOFORT machbar):**
- ao-db-query-slow (Histogram existiert)
- ao-db-connections-high (pg_stat_activity via postgres-exporter)
- ao-container-restart (container_restart_count via cAdvisor)
- ao-cadvisor-down (up{job="cadvisor"})
- ao-disk-usage-high (node_filesystem_* falls Node-Exporter vorhanden — PRUEFEN)

---

## 3. Error-Code-Dateien — Ist-Zustand

### ESP32: `El Trabajante/src/models/error_codes.h`

| Range | Kategorie | Codes gezaehlt | Beispiele |
|-------|-----------|----------------|-----------|
| 1001-1006 | GPIO | 6 | GPIO_RESERVED, GPIO_CONFLICT |
| 1007-1019 | I2C | 10 | I2C_INIT_FAILED, I2C_BUS_STUCK, I2C_CRC_FAILED |
| 1020-1029 | OneWire | 10 | ONEWIRE_INIT_FAILED, ONEWIRE_DUPLICATE_ROM |
| 1030-1032 | PWM | 3 | PWM_INIT_FAILED, PWM_SET_FAILED |
| 1040-1043 | Sensor | 4 | SENSOR_READ_FAILED, SENSOR_TIMEOUT |
| 1050-1053 | Actuator | 4 | ACTUATOR_SET_FAILED, ACTUATOR_CONFLICT |
| 1060-1063 | DS18B20 | 4 | DS18B20_SENSOR_FAULT, POWER_ON_RESET |
| 2001-2005 | NVS | 5 | NVS_INIT_FAILED, NVS_CLEAR_FAILED |
| 2010-2014 | Config | 5 | CONFIG_INVALID, CONFIG_VALIDATION |
| 2020-2021 | Logger | 2 | LOGGER_INIT_FAILED, LOGGER_BUFFER_FULL |
| 2030-2032 | Storage | 3 | STORAGE_INIT_FAILED |
| 2500-2506 | Subzone | 7 | SUBZONE_INVALID_ID, SUBZONE_GPIO_CONFLICT |
| 3001-3032 | Communication | 15 | WIFI_*, MQTT_*, HTTP_*, NETWORK_* |
| 4001-4202 | Application | 22 | STATE_*, OPERATION_*, WATCHDOG_*, DEVICE_* |

**ESP32 Total:** ~100 Error-Codes definiert (1000-4202)

### Server: `El Servador/god_kaiser_server/src/core/error_codes.py`

| Range | Kategorie | Codes | Klasse |
|-------|-----------|-------|--------|
| 5001-5007 | Config | 7 | ConfigErrorCode |
| 5101-5107 | MQTT | 7 | MQTTErrorCode |
| 5201-5208 | Validation | 8 | ValidationErrorCode |
| 5301-5306 | Database | 6 | DatabaseErrorCode |
| 5401-5405 | Service | 5 | ServiceErrorCode |
| 5501-5503 | Audit | 3 | AuditErrorCode |
| 5600-5642 | Sequence | 19 | SequenceErrorCode |

**Server Total:** 55 Error-Codes definiert (5001-5642)

### Synchronisation ESP32 ↔ Server

Die Python-Datei enthaelt ESP32 Error-Code-Klassen als Mirror:
- `ESP32HardwareError` (IntEnum, 1000-1053)
- `ESP32ServiceError` (IntEnum, 2001-2506)
- `ESP32CommunicationError` (IntEnum, 3001-3032)
- `ESP32ApplicationError` (IntEnum, 4001-4202)
- `ESP32ConfigErrorCode` (String-basiert)

**Bewertung:** Gut synchronisiert. DS18B20-Codes (1060-1063) und einige I2C-Codes (1015-1018) sind in `error_codes.h` aber NICHT im Python-Mirror. Kleine Luecke.

### Test-Error-Block 6000-6099

**Status: NICHT VORHANDEN.** Weder in `error_codes.h` noch in `error_codes.py`. Phase 0 muss diesen Block implementieren.

---

## 4. AI-Service Stubs

### ai_service.py

**Pfad:** `El Servador/god_kaiser_server/src/services/ai_service.py`
**Inhalt:** 1 Zeile Stub

```python
"""AI/God Layer Integration Service - Phase 3 - Priority: MEDIUM - Status: PLANNED"""
```

**Bewertung:** Komplett leer. Phase 3 muss den gesamten Service implementieren.

### ai_repo.py

**Pfad:** `El Servador/god_kaiser_server/src/db/repositories/ai_repo.py`
**Inhalt:** 2 Zeilen Stub

```python
"""AI Predictions Repository - Phase 2 - Priority: MEDIUM - Status: PLANNED
Stores AI predictions/recommendations from God Layer."""
```

**Bewertung:** Komplett leer. Phase 3 muss Repository implementieren.

### ai_prediction Model

**Status:** `ai_prediction.py` existiert NICHT in `src/db/models/`. Phase 3 muss das Model erstellen.

**ai_predictions Tabelle in DB:** Muss via Alembic-Migration erstellt werden, oder existiert bereits (pruefen via DB-Inspector).

---

## 5. Zusammenfassung fuer Phasenplan

| Phase | System-Readiness | Blocker |
|-------|-----------------|---------|
| **Phase 0** | 70% | 15 fehlende Prometheus-Metriken fuer neue Alerts. Test-Error-Block 6000 fehlt. |
| **Phase 1** | 90% | Wokwi-Infrastruktur steht. Nur Error-Injection-Szenarien und Mapping fehlen. |
| **Phase 2** | 85% | Stack laeuft. ESP muss geflasht werden. Frontend-Luecken identifiziert. |
| **Phase 3** | 30% | AI-Service, Repository, DB-Model komplett leer. Metriken fehlen fuer Stufe 1. |
| **Phase 4** | 50% | Dashboards fehlen. Error-Report-Format fehlt. auto-ops muss erweitert werden. |

### Kritischer Pfad

```
Phase 0: Metriken implementieren (server-dev) → Alert-Regeln schreiben → Phase 0 done
    ↓
Phase 1 + Phase 2 (parallel)
    ↓
Phase 3: AI-Service implementieren (server-dev) → braucht Sensordaten aus Phase 2
    ↓
Phase 4: Dashboards + Integration
```

### Empfohlene Agent-Reihenfolge

1. `server-dev` → Metriken in `metrics.py` implementieren (Phase 0 Blocker)
2. `system-control` → Alert-Rules YAML schreiben (Phase 0)
3. `esp32-dev` → Error-Injection-Szenarien (Phase 1, parallel)
4. `frontend-dev` → Kalibrierungs-Wizard + Zeitreihen (Phase 2, parallel)
5. `server-dev` → AI-Service (Phase 3)
6. Hauptkontext → Dashboards (Phase 4)
