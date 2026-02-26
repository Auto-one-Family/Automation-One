# SHT31 Error Investigation - Consolidated Report

> **Datum:** 2026-02-25 ~20:15-21:00 UTC
> **Device:** ESP_472204 (ESP32 dev, real hardware)
> **Sensor:** SHT31 (I2C, Adresse 0x44, GPIO 21/22)
> **Agents:** system-control, server-debug, auto-ops
> **Status:** AKTIV - Errors laufen noch

---

## Executive Summary

Der SHT31-Sensor auf ESP_472204 hat **nie Daten geliefert** und feuert im Sekundentakt I2C-Errors. Das ist primär ein **Hardware-Problem** (Verkabelung/Pull-Ups), aber die Error-Flut hat **4 Server-Bugs** aufgedeckt und belastet das System erheblich. Es fehlt jegliches Error-Rate-Limiting auf ESP- und Server-Seite.

---

## 1. Hardware-Diagnose (Root Cause)

### Error-Chronologie

| Zeitraum | Error Code | Beschreibung | Anzahl |
|----------|-----------|--------------|--------|
| ~20:15 (Burst) | 1011 | I2C_DEVICE_NOT_FOUND | 730 (in 34s) |
| einmalig | 1009 | I2C_CRC_FAILED | 1 |
| seit ~20:15 dauerhaft | 1007 | I2C_TIMEOUT | 640+ (und steigend) |

### Interpretation

1. **Phase 1** (1011): ESP32 scannt I2C-Bus, findet SHT31 nicht -> Device nicht erkannt
2. **Phase 2** (1009): Kurzer/instabiler Kontakt, CRC-Fehler -> möglicherweise Wackelkontakt
3. **Phase 3** (1007): Permanenter I2C-Timeout -> kein stabiler Kontakt zum Sensor

### Sofortmaßnahmen Hardware

| Prüfung | Detail |
|---------|--------|
| **VCC** | 3.3V am SHT31 messen (NICHT 5V!) |
| **GND** | Gemeinsame Masse ESP32 <-> SHT31 |
| **SDA** | GPIO 21 -> SHT31 SDA |
| **SCL** | GPIO 22 -> SHT31 SCL |
| **Pull-Ups** | 4.7kΩ an SDA und SCL nach 3.3V |
| **ADDR Pin** | GND = 0x44, VCC = 0x45 (Config muss passen) |
| **Lötstellen** | Kalte Lötstellen am Breakout-Board prüfen |

---

## 2. Server-Bugs (durch Error-Flut entdeckt)

### Bug 1: MultipleResultsFound (HOCH)

- **Ort:** `sensor_repo.py:757` -> `get_by_i2c_address()`
- **Ursache:** `scalar_one_or_none()` crasht wenn 2 Sensor-Configs dieselbe I2C-Adresse haben (sht31_temp + sht31_humidity teilen sich Adresse 68/0x44)
- **Impact:** `POST /api/v1/sensors/ESP_472204/0` schlägt fehl
- **Fix:** `scalar_one_or_none()` -> `.all()` oder `.first()`, Multi-Sub-Sensor-Logik

### Bug 2: Datetime Timezone Mismatch (HOCH)

- **Ort:** Sensor-Data-Processing
- **Ursache:** DB-Spalte `sensor_data.timestamp` ist `TIMESTAMP WITHOUT TIME ZONE`, Python übergibt timezone-aware datetimes
- **Impact:** 9x `DBAPIError: can't subtract offset-naive and offset-aware datetimes`
- **Fix:** Konsistent timezone-aware oder timezone-naive verwenden

### Bug 3: Audit-Log request_id Truncation (MITTEL)

- **Ort:** `audit_logs.request_id VARCHAR(36)`
- **Ursache:** MQTT Correlation-IDs können länger als 36 Zeichen sein (z.B. 44 Zeichen)
- **Impact:** `StringDataRightTruncationError` bei Audit-Log-Writes
- **Fix:** Migration `VARCHAR(36)` -> `VARCHAR(255)` (möglicherweise bereits gefixt)

### Bug 4: Heartbeat Schema Validation (MITTEL)

- **Ort:** `GpioStatusItem.owner` Pattern-Validierung
- **Ursache:** Pattern erlaubt `"bus/onewire/4"` nicht, obwohl ESP Bus-Pin-Reservierungen sendet
- **Impact:** Alle Heartbeats von ESP_472204 schlagen Validation fehl
- **Fix:** Owner-Pattern um Bus-Reservierungen erweitern

---

## 3. System-Impact der Error-Flut

### Kaskade pro Error

```
ESP32 I2C-Timeout
  -> MQTT publish (kaiser/god/esp/ESP_472204/system/error)
    -> Server error_handler
      -> audit_logs INSERT (PostgreSQL)
        -> WebSocket broadcast
          -> Frontend re-render
```

### Ressourcen-Belastung

| Ressource | Aktueller Wert | Normal | Bewertung |
|-----------|---------------|--------|-----------|
| PostgreSQL CPU | 34.67% | <10% | ERHÖHT (durch INSERT-Flut) |
| Frontend CPU | 49.75% | <15% | HOCH (WS-Broadcast-Rendering) |
| MQTT-Rate | ~51 msg/min | <5 msg/min | 10x ÜBERHÖHT |
| audit_logs | 98.4% von einem ESP | <10% | DOMINIERT |
| Projizierte DB-Wachstumsrate | ~144 MB/Tag | - | KRITISCH wenn unbehandelt |

### Fehlende Schutzmaßnahmen

- **Kein Error-Rate-Limiting** auf ESP32 (sendet jeden einzelnen I2C-Timeout)
- **Keine Error-Deduplication** auf Server (jeder Error = eigener DB-Eintrag + WS-Broadcast)
- **Kein Circuit-Breaker für Error-Handler** (DB/MQTT Circuit Breaker sind CLOSED, greifen nicht)

---

## 4. Infrastruktur-Status

| Service | Status | Anmerkung |
|---------|--------|-----------|
| el-servador | healthy | Verarbeitet Errors korrekt |
| mqtt-broker | healthy | Keine Überlastung |
| postgres | healthy | CPU erhöht durch INSERT-Flut |
| el-frontend | healthy | CPU erhöht durch WS-Broadcasts |
| pgAdmin | CRASH-LOOP | Unabhängiges Problem |
| Monitoring-Stack | healthy | Loki erfasst alles |
| Circuit Breaker (alle 3) | CLOSED | Nicht ausgelöst |

---

## 5. Empfehlungen (Priorisiert)

### P0 - Sofort (Hardware)

1. **Verkabelung prüfen** (SDA/SCL/VCC/GND, Pull-Ups)
2. **Serial-Monitor starten** für ESP-seitige I2C-Details
3. Falls Verkabelung OK: SHT31-Breakout tauschen (defekt?)

### P1 - Kurzfristig (Firmware)

4. **Error-Rate-Limiting auf ESP32** implementieren:
   - Exponential Backoff für wiederholte Errors (1s -> 2s -> 4s -> ... -> max 60s)
   - Max 1 Error-Report pro Minute pro error_code wenn identisch
   - Aggregierte Error-Counts im Heartbeat statt Einzel-Reports

### P2 - Kurzfristig (Server-Bugs)

5. **Bug 1 fixen:** `get_by_i2c_address()` Multi-Sensor-Logik
6. **Bug 2 fixen:** Timezone-Konsistenz in sensor_data
7. **Bug 3 fixen:** audit_logs.request_id VARCHAR(255)
8. **Bug 4 fixen:** GpioStatusItem.owner Pattern erweitern

### P3 - Mittelfristig (Architektur)

9. **Server-seitige Error-Deduplication** im Error-Handler
10. **WebSocket Error-Throttling** (max 1 Broadcast/Sekunde pro error_type pro Device)
11. **Audit-Log Retention/Cleanup** für Error-Events (automatisch nach 7 Tagen)

---

## 6. Einzelreports

| Report | Pfad |
|--------|------|
| System-Status | `.claude/reports/current/SYSTEM_STATUS_SHT31.md` |
| Server-Log-Analyse | `.claude/reports/current/SERVER_SHT31_ANALYSIS.md` |
| Auto-Ops Cross-Layer | `.claude/reports/current/AUTOOPS_SHT31_DIAGNOSIS.md` |
| **Dieser Bericht** | `.claude/reports/current/SHT31_CONSOLIDATED_REPORT.md` |

---

*Report generiert von: system-control + server-debug + auto-ops (sequenziell)*
