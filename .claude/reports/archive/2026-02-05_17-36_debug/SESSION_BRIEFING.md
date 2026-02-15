# Session Briefing - End-to-End Provisioning Test

**Timestamp:** 2026-02-05T17:47:00+01:00
**Ziel:** Kompletter End-to-End-Test des Provisioning-Flows mit ESP32-WROOM + SHT31
**Hardware:** 1× ESP32-WROOM (esp32dev), 1× SHT31 an I2C (Adresse 0x44)

---

## 1. Systemzustand

### 1.1 Docker Services

| Container | Image | Status | Health | Ports | Uptime |
|-----------|-------|--------|--------|-------|--------|
| automationone-server | auto-one-el-servador | Up | healthy | 8000:8000 | 16 min |
| automationone-postgres | postgres:16-alpine | Up | healthy | 5432:5432 | 16 min |
| automationone-mqtt | eclipse-mosquitto:2 | Up | healthy | 1883:1883, 9001:9001 | 16 min |
| automationone-frontend | auto-one-el-frontend | Up | healthy | 5173:5173 | 16 min |

**Ergebnis:** Alle 4 Services healthy

### 1.2 Server Health

```json
{"status":"healthy","mqtt_connected":true}
```

- Server operational
- MQTT-Verbindung aktiv
- Maintenance-Jobs laufen (Health-Checks alle 30s/60s)

### 1.3 Datenbank

- **Status:** Frisch initialisiert
- **ESP-Devices:** 0 (leer)
- **User:** Admin erstellt (16:47:32 UTC)
- **Credentials:** god_kaiser / god_kaiser_db / password

### 1.4 Alembic-Migrations-Status

```
HEAD: 950ad9ce87bb
```

**Letzte Migration:** `Add i2c_address to sensor unique constraint`
- Ermöglicht mehrere I2C-Sensoren am gleichen Bus mit unterschiedlichen Adressen
- Relevanz für SHT31: Unterstützt 0x44 und 0x45

**Status:** Auf HEAD - alle Migrationen angewendet

---

## 2. Codebase-Readiness für SHT31-Test

### 2.1 ESP32-Seite (El Trabajante)

| Komponente | Status | Datei |
|------------|--------|-------|
| I2C Bus Manager | Implementiert | `src/drivers/i2c_bus.cpp` |
| SHT31 Protocol Definition | Implementiert | `src/drivers/i2c_sensor_protocol.cpp:21` |
| SensorConfig mit i2c_address | Implementiert | `src/models/sensor_types.h:46` |
| SensorReading mit i2c_address | Implementiert | `src/models/sensor_types.h:94` |

**SHT31 Protocol Details:**
- Sensor-Type: `"sht31"`
- Command: `0x24 0x00` (High Repeatability, No Clock Stretching)
- Measurement Delay: 20ms
- Response: 6 Bytes (temp_msb, temp_lsb, crc, hum_msb, hum_lsb, crc)
- CRC-8 Polynomial: 0x31
- Default I2C-Adressen: 0x44 (ADDR Pin LOW), 0x45 (ADDR Pin HIGH)

### 2.2 Server-Seite (El Servador)

| Komponente | Status | Datei |
|------------|--------|-------|
| SHT31 Temperature Processor | Implementiert | `sensor_libraries/active/temperature.py` |
| SHT31 Humidity Processor | Implementiert | `sensor_libraries/active/humidity.py` |
| I2C-Address in DB-Schema | Implementiert | Alembic 950ad9ce87bb |
| Heartbeat Handler (Pending Detection) | Implementiert | `mqtt/handlers/heartbeat_handler.py` |

### 2.3 Provisioning-Flow Status

| Phase | Implementiert | Bemerkung |
|-------|---------------|-----------|
| ESP sendet Heartbeat | Ja | Unregistriertes Gerät → `pending_approval` |
| Server erkennt neues Gerät | Ja | Tracking in Memory + DB |
| Admin sieht Pending Devices | Ja | GET `/esp/devices/pending` |
| Admin approved Device | Ja | POST `/esp/devices/{id}/approve` |
| Server sendet Config | Ja | Via MQTT nach Approval |
| ESP bestätigt Config | Ja | `config_response` Topic |

---

## 3. Relevante REST-Endpoints für den Test

### 3.1 Authentication

| Endpoint | Method | Beschreibung |
|----------|--------|--------------|
| `/api/v1/auth/login` | POST | Login (admin/password) |
| `/api/v1/auth/me` | GET | User-Info verifizieren |

### 3.2 Provisioning-Flow

| Endpoint | Method | Auth | Beschreibung |
|----------|--------|------|--------------|
| `/api/v1/esp/devices/pending` | GET | Operator | **Pending Devices auflisten** |
| `/api/v1/esp/devices/{esp_id}/approve` | POST | Operator | **Device genehmigen** |
| `/api/v1/esp/devices/{esp_id}/reject` | POST | Operator | Device ablehnen |

**Approval Request Body:**
```json
{
  "name": "Gewächshaus Sensor 1",
  "zone_id": "greenhouse",
  "zone_name": "Gewächshaus"
}
```

### 3.3 Nach Approval

| Endpoint | Method | Beschreibung |
|----------|--------|--------------|
| `/api/v1/esp/devices` | GET | Alle registrierten ESPs |
| `/api/v1/esp/devices/{esp_id}` | GET | ESP-Details |
| `/api/v1/esp/devices/{esp_id}/config` | POST | Sensor/Actuator-Config senden |
| `/api/v1/sensors` | GET | Alle Sensoren |
| `/api/v1/sensors/by-esp/{esp_id}` | GET | Sensoren nach ESP |
| `/api/v1/sensors/{sensor_id}/data` | GET | Sensor-Daten (historisch) |

---

## 4. Relevante MQTT-Topics für den Test

### 4.1 ESP → Server (Provisioning)

| Topic | QoS | Beschreibung |
|-------|-----|--------------|
| `kaiser/god/esp/{esp_id}/system/heartbeat` | 0 | Heartbeat (60s Intervall) |
| `kaiser/god/esp/{esp_id}/config_response` | 2 | Config-Bestätigung |

### 4.2 Server → ESP

| Topic | QoS | Beschreibung |
|-------|-----|--------------|
| `kaiser/god/esp/{esp_id}/system/heartbeat/ack` | 0 | Heartbeat ACK mit Status |
| `kaiser/god/esp/{esp_id}/config` | 2 | Sensor/Actuator-Konfiguration |

### 4.3 Sensor-Datenfluss (nach Config)

| Topic | QoS | Beschreibung |
|-------|-----|--------------|
| `kaiser/god/esp/{esp_id}/sensor/{gpio}/data` | 1 | Sensor-Rohdaten |

**Sensor-Data Payload (SHT31):**
```json
{
  "ts": 1735818000,
  "esp_id": "ESP_XXXXXXXX",
  "gpio": 21,
  "sensor_type": "sht31_temp",
  "raw": 25000,
  "raw_mode": true,
  "i2c_address": 68,
  "quality": "good"
}
```

**Hinweis:** i2c_address = 68 (dezimal) = 0x44 (hex)

---

## 5. Bekannte Risiken und Potenzielle Blocker

### 5.1 Kritisch

| Risiko | Beschreibung | Prüfung erforderlich |
|--------|--------------|---------------------|
| ESP32-Firmware nicht aktuell | SHT31-Support erst kürzlich hinzugefügt | `pio run` Build verifizieren |
| I2C-Verdrahtung | SDA/SCL vertauscht oder Pull-Ups fehlen | Hardware-Prüfung |

### 5.2 Mittel

| Risiko | Beschreibung | Workaround |
|--------|--------------|------------|
| WiFi-Konfiguration | ESP muss SSID/Passwort kennen | NVS-Config oder Hotspot-Mode |
| MQTT-Broker Adresse | ESP muss Server-IP kennen | NVS-Config |
| SHT31-Adresse Konflikt | Falls 0x45 statt 0x44 | ADDR-Pin prüfen |

### 5.3 Niedrig

| Risiko | Beschreibung |
|--------|--------------|
| Heap-Fragmentierung | Bei längerem Betrieb möglich |
| Watchdog-Timeout | Falls I2C-Read zu lange blockiert |

---

## 6. Empfohlene Test-Reihenfolge

### Phase 1: Vorbereitung

1. **Frontend öffnen:** http://localhost:5173
2. **Login:** admin / (Setup-Passwort)
3. **ESP32 flashen:** `pio run -t upload`
4. **ESP32 Serial Monitor:** `pio device monitor`

### Phase 2: Provisioning

5. **ESP32 bootet** → Heartbeats an Server
6. **Server-Logs beobachten:** Pending Device erkannt?
7. **Frontend:** Pending Devices prüfen (oder REST-API)
8. **Approve Device** mit Name/Zone

### Phase 3: Konfiguration

9. **Config-Push verifizieren:** ESP32 Serial Log
10. **Config-Response prüfen:** Server-Log

### Phase 4: Sensor-Daten

11. **SHT31-Messung starten:** Automatisch nach Config
12. **MQTT-Traffic beobachten:** `sensor/{gpio}/data` Topics
13. **Server-Processing:** Rohdaten → verarbeitete Werte
14. **Frontend:** Sensor-Daten anzeigen

### Phase 5: Verifikation

15. **DB prüfen:** Sensor-Einträge, Messwerte
16. **Historische Daten:** `/sensors/{id}/data` Endpoint
17. **Health-Status:** ESP online, Sensor aktiv

---

## 7. Monitoring-Befehle

```bash
# Server-Logs (live)
docker logs -f automationone-server

# MQTT-Traffic beobachten
mosquitto_sub -h localhost -t "kaiser/god/esp/#" -v

# DB-Abfragen
docker exec -it automationone-postgres psql -U god_kaiser -d god_kaiser_db

# ESP32 Serial
pio device monitor -b 115200
```

---

## 8. Zusammenfassung

| Aspekt | Status |
|--------|--------|
| Docker-Stack | Healthy |
| Datenbank | Frisch, leer, auf HEAD |
| Server | Operational, MQTT verbunden |
| ESP32 SHT31-Support | Code vorhanden |
| Server SHT31-Processing | Implementiert |
| Provisioning-Flow | Vollständig implementiert |
| REST-Endpoints | Dokumentiert |
| MQTT-Topics | Dokumentiert |

**System ist bereit für den End-to-End-Test.**

---

*Erstellt von: system-manager | Für: Technical Manager*
