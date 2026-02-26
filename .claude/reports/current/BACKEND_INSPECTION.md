# Backend Inspection Report

**Datum:** 2026-02-25T21:35:00+01:00
**Systemstatus:** degraded
**ESP-Geraete im Einsatz:** 1 real (ESP_472204), 1 mock (MOCK_0954B2B1)

---

## Systemstatus-Zusammenfassung

Quelle: `docker compose ps` (debug-status.ps1 lief als Hintergrundprozess, daher Docker-native Daten verwendet)

| Service | Container | State | Health | Uptime |
|---------|-----------|-------|--------|--------|
| alloy | automationone-alloy | running | healthy | ~1h |
| cadvisor | automationone-cadvisor | running | healthy | ~1h |
| el-frontend | automationone-frontend | running | healthy | ~24min |
| el-servador | automationone-server | running | healthy | ~1h |
| grafana | automationone-grafana | running | healthy | ~1h |
| loki | automationone-loki | running | healthy | ~1h |
| mosquitto-exporter | automationone-mosquitto-exporter | running | (none) | ~1h |
| mqtt-broker | automationone-mqtt | running | healthy | ~1h |
| mqtt-logger | automationone-mqtt-logger | running | (none) | ~1h |
| pgadmin | automationone-pgadmin | **RESTARTING** | (none) | Crash loop |
| postgres | automationone-postgres | running | healthy | ~1h |
| postgres-exporter | automationone-postgres-exporter | running | healthy | ~1h |
| prometheus | automationone-prometheus | running | healthy | ~1h |

**Kritisch:** `pgadmin` befindet sich in einem Restart-Loop (ExitCode 1, ~44s-Zyklus). Betrieb der Core-Services nicht beeintraechtigt.

---

## Fehler / Bugs / Warnungen

| # | Level | Quelle | Beschreibung | Kontext | Timestamp |
|---|-------|--------|--------------|---------|-----------|
| 1 | ERROR | Loki `el-servador` / `src.core.exception_handlers` | **UnhandledException: MultipleResultsFound** in `sensor_repo.get_by_i2c_address()` | `POST /api/v1/sensors/ESP_472204/0` - `scalar_one_or_none()` liefert 2 Zeilen (sht31_temp + sht31_humidity haben beide I2C-Adresse 68). Traceback: `sensors.py:1575` → `sensor_repo.py:757` | 2026-02-25 20:11:36 |
| 2 | ERROR | Loki `el-servador` / `src.mqtt.handlers.config_handler` | **Config FAILED on ESP_472204: actuator** - "Actuator config array is empty" (MISSING_FIELD) | Server sendete Sensor-Config (2 Items OK), aber Actuator-Config schlaegt fehl. Kein Actuator in `actuator_configs` fuer ESP_472204 registriert - Config-Request enthaelt leeres Array | 2026-02-25 20:05:49 |
| 3 | ERROR | MQTT `kaiser/god/esp/ESP_472204/system/error` | **ESP_472204 sendet Error 1007 (I2C_TIMEOUT) in Dauerschleife** - "sht31 read timeout" | ~1x/Sek, seit mind. 2h. Uptime-Delta zwischen Meldungen: ~1166ms. SHT31 antwortet nicht auf I2C-Bus (Adresse 0x44 = dezimal 68). Heap normal (199904 bytes frei), WiFi stabil (RSSI -53) - Hardware-Problem. DB: 1275 Eintraege in 2h | 2026-02-25 19:22 - laufend |
| 4 | WARNING | Loki `el-servador` / `src.mqtt.handlers.heartbeat_handler` | **GPIO count mismatch fuer ESP_472204**: reported=3, actual=2 | ESP meldet 3 GPIOs im Heartbeat, Server zaehlt nur 2 sensor_configs. Jeder Heartbeat-Zyklus (60s) | 2026-02-25 20:05 - laufend |
| 5 | WARNING | Loki `el-servador` / `src.mqtt.handlers.heartbeat_handler` | **GPIO owner-Validierung schlaegt fehl**: `input_value='bus/onewire/4'` passt nicht auf Pattern `^(sensor\|actuator\|system)$` | Pydantic `GpioStatusItem.owner` erwartet Enum-Wert, ESP sendet Bus-Pfad-Format. Jeder Heartbeat-Zyklus | 2026-02-25 20:05 - laufend |
| 6 | WARNING | DB `audit_logs` | **LWT empfangen** - "Last Will Testament received - device disconnected unexpectedly" | ESP_472204 hatte einen ungeplanten Disconnect (vermutlich I2C-Watchdog). Reboot erkennbar an seq:17 im aktuellen Heartbeat | 2026-02-25 20:16:18 |
| 7 | WARNING | DB `audit_logs` | **Device Timeout** fuer ESP_472204 und MOCK_0954B2B1 (je 1x heute) | "Device timed out - no heartbeat for 300s" - nach Neustart / Stack-Restart | 2026-02-25 19:05 |
| 8 | INFO / Anomalie | DB `sensor_data` | **Keine aktuellen Sensor-Daten** - Tabelle hat nur 1 Eintrag gesamt (vom 2026-02-23) | Obwohl ESP_472204 online und konfiguriert ist (sht31_temp + sht31_humidity, config_status=applied), werden keine Sensor-Messwerte gespeichert. Ursache: I2C-Timeout blockiert die Messungen | laufend |
| 9 | INFO | DB `pgadmin` | **pgadmin Crash-Loop** (ExitCode 1) | Nicht-kritisch fuer Produktion, aber Admin-Tool nicht erreichbar | laufend |

---

## Cross-Layer-Befunde

| # | Zeitpunkt | Layer A | Layer B | Korrelation | Root Cause |
|---|-----------|---------|---------|-------------|------------|
| 1 | 20:11:36 | **REST API** `POST /api/v1/sensors/ESP_472204/0` → HTTP 500 | **DB** `sensor_configs`: 2 Eintraege (sht31_temp, sht31_humidity) mit identischer I2C-Adresse 68 fuer ESP_472204 | `sensor_repo.get_by_i2c_address()` erwartet max. 1 Ergebnis (scalar_one_or_none), findet 2 → MultipleResultsFound | **Server-Bug:** `get_by_i2c_address()` behandelt Multi-Sensor-I2C-Adressen (SHT31 = Temperatur + Feuchte auf einer Adresse) nicht korrekt |
| 2 | 19:22 - laufend | **ESP_472204 MQTT** `system/error`: 1007 (I2C_TIMEOUT) ~1x/Sek | **DB** `sensor_data`: 0 Eintraege letzte 5 Minuten (nur 1 Eintrag gesamt) | ESP kann SHT31 nicht lesen → keine Sensor-Messwerte publiziert → keine Daten in sensor_data | **Hardware-Problem:** SHT31-Sensor antwortet nicht auf I2C-Bus. Physische Verbindung oder Sensor defekt |
| 3 | 20:05:49 | **MQTT config_handler**: Config FAILED "actuator config array is empty" | **DB** `actuator_configs`: 0 Eintraege fuer ESP_472204 | Frontend/User sendete Config-Anfrage fuer ESP_472204 inclusive Actuator-Slot, aber kein Actuator konfiguriert | **Fehler-Handling:** Config-Handler meldet MISSING_FIELD obwohl leeres Actuator-Array ein gueltiger Zustand ist (kein Actuator konfiguriert) |
| 4 | 20:05 - laufend | **Heartbeat** GPIO reported=3, actual=2 | **DB** `sensor_configs`: sht31_temp + sht31_humidity, beide auf gpio=0, I2C | ESP zaehlt intern 3 Komponenten (vermutlich: SHT31 als 1 Einheit + 2 separate Values oder OneWire-Bus-Eintrag) | **Schema-Mismatch:** ESP zaehlt GPIOs anders als Server (ESP zaehlt Bus-Eintraege, Server zaehlt sensor_config-Zeilen) |
| 5 | 20:05 - laufend | **Heartbeat** GpioStatusItem owner=`'bus/onewire/4'` | **Server** Pydantic-Model erwartet `^(sensor\|actuator\|system)$` | ESP sendet Bus-Pfad-Strings als GPIO-Owner, Server-Schema erlaubt nur 3 Enum-Werte | **Schema-Mismatch:** ESP-Firmware sendet erweiterte Owner-Formate, Server-Pydantic-Model wurde nicht angepasst |

---

## ESP-Device-Status

| device_id | status | last_seen | age_sec | Sensor | Interface | I2C-Addr | GPIO | config_status |
|-----------|--------|-----------|---------|--------|-----------|----------|------|---------------|
| ESP_472204 | online | 2026-02-25 20:32:29 UTC | ~24s | sht31_humidity | I2C | 68 | 0 | applied |
| ESP_472204 | online | (gleich) | ~24s | sht31_temp | I2C | 68 | 0 | applied |
| MOCK_0954B2B1 | online | 2026-02-25 20:31:59 UTC | ~53s | (keine) | - | - | - | - |

**Hinweis:** MOCK_0954B2B1 hat keine sensor_configs eingetragen, laeuft aber stabil (Heartbeat OK).

---

## Sensor-Data-Freshness

| Zeitraum | esp_id | count | latest |
|----------|--------|-------|--------|
| Letzte 5 Minuten | (alle) | **0** | - |
| Letzte 1 Stunde | (alle) | **0** | - |
| Gesamt | - | **1** | 2026-02-23 20:03:20 |

**Bewertung:** Kritisch. Seit 2026-02-23 werden keine Sensor-Messwerte in die Datenbank geschrieben. Ursache: ESP_472204 kann den SHT31 nicht lesen (I2C-Timeout), daher keine Daten-Publish auf MQTT-Sensor-Topic.

---

## Heartbeat-Freshness (letzte 10 Minuten)

| device_id | count | latest |
|-----------|-------|--------|
| MOCK_0954B2B1 | 10 | 2026-02-25 20:28:59 UTC |
| ESP_472204 | 10 | 2026-02-25 20:28:26 UTC |

Beide Geraete senden Heartbeats regelmaessig (60s-Intervall). Konnektivitaet ist intakt.

---

## Audit-Log-Zusammenfassung (letzte 2 Stunden)

| severity | event_type | count | latest |
|----------|------------|-------|--------|
| error | mqtt_error | **2005** | 20:31:35 |
| error | config_response | 2 | 20:05:49 |
| warning | device_offline | 2 | 19:05:00 |
| warning | lwt_received | 1 | 20:16:18 |
| info | config_response | 1 | 20:05:49 |

2005 `mqtt_error`-Events in 2h = ~16/min. Entspricht der I2C-Timeout-Rate von ~1/Sek auf dem Fehler-Topic.

---

## Duplikat-I2C-Adressen in sensor_configs

| esp_id | i2c_address | count | Eintraege |
|--------|-------------|-------|-----------|
| 3c4c4130-...9031 (ESP_472204) | 68 | **2** | sht31_temp + sht31_humidity |

Root Cause fuer Bug #1: Beide SHT31-Messwert-Konfigurationen teilen sich die I2C-Adresse 68. `get_by_i2c_address()` verwendet `scalar_one_or_none()` was bei 2 Treffern eine Exception wirft.

---

## Empfehlungen

### Prioritaet 1 (Kritisch - Hardware)
1. **SHT31-Sensor physisch pruefen**: I2C-Bus an ESP_472204 ueberpruefen. Kabel, Steckverbindungen, SDA/SCL-Leitungen, Pull-up-Widerstaende (4.7kΩ empfohlen). Sensor evtl. defekt (Power-On-Reset-Wert oder dauerhafter Timeout deutet auf Hardware-Ausfall hin). Alternativ: I2C-Bus-Recovery-Sequenz ausloesen.

### Prioritaet 2 (Server-Bug - BlockingException)
2. **`sensor_repo.get_by_i2c_address()` fixen**: `scalar_one_or_none()` auf `.first()` oder explizite Deduplication-Logik aendern. SHT31 und aehnliche Multi-Value-I2C-Sensoren registrieren mehrere `sensor_configs` auf derselben I2C-Adresse. Die Funktion muss das unterstuetzen.
   - Datei: `El Servador/god_kaiser_server/src/db/repositories/sensor_repo.py`, Zeile 757
   - Fix: `return result.scalars().first()` statt `return result.scalar_one_or_none()`

### Prioritaet 3 (Server-Bug - Schema-Mismatch GPIO Owner)
3. **Pydantic `GpioStatusItem.owner` Pattern erweitern**: Aktuelles Pattern `^(sensor|actuator|system)$` verbietet Bus-Pfad-Strings wie `'bus/onewire/4'`. Entweder Firmware aendern (Owner-String auf Enum-Werte beschraenken) oder Server-Schema um Bus-Formate erweitern.

### Prioritaet 4 (Config-Handler - Fehler-Handling)
4. **`config_handler` Actuator-Empty-Array als gueltig behandeln**: Wenn kein Actuator konfiguriert ist, sollte ein leeres `actuators`-Array kein MISSING_FIELD-Error ausloesen. Handler sollte zwischen "nicht gesendet" (Fehler) und "leer gesendet" (gueltig = keine Aktuatoren) unterscheiden.

### Prioritaet 5 (Dokumentation)
5. **Error Code 1007 in `ERROR_CODES.md` nachtragen**: Aktuell nur in `El Trabajante/src/models/error_codes.h` definiert (I2C_TIMEOUT), fehlt in der Reference-Dokumentation `.claude/reference/errors/ERROR_CODES.md`.

### Prioritaet 6 (Monitoring)
6. **pgadmin Crash-Loop untersuchen**: Container startet mit ExitCode 1. Nicht kritisch fuer Betrieb, aber Admin-Tool nicht verfuegbar. Logs pruefen: `docker compose logs pgadmin --tail=50`.

---

## Kausalkette (Root Cause Summary)

```
[HW] SHT31-Sensor defekt / I2C-Bus-Problem
  → ESP_472204 sendet 1007 (I2C_TIMEOUT) ~1x/Sek an MQTT broker
    → error_handler speichert ~1275 Events in 2h in audit_logs (mqtt_error)
      → KEIN Sensor-Messwert publiziert (sensor_data leer seit 2023-02-23)
        → Dashboard zeigt keine Echtzeit-Daten fuer ESP_472204

[Server-Bug] sensor_repo.get_by_i2c_address() scalar_one_or_none()
  → SHT31 erzeugt 2 sensor_configs (sht31_temp + sht31_humidity) auf I2C-Addr 68
    → POST /api/v1/sensors/ESP_472204/0 → MultipleResultsFound Exception → HTTP 500

[Schema-Mismatch] ESP sendet GPIO owner='bus/onewire/4'
  → Pydantic-Validation schlaegt bei jedem Heartbeat fehl (WARNING, kein Crash)
    → GPIO count mismatch (reported=3, actual=2) als Folge

[Config-Issue] Config-Request mit leerem Actuator-Array
  → config_handler interpretiert leer als fehlend → MISSING_FIELD Error
```

---

*Report generiert von Backend Inspector | AutomationOne*
