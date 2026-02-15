# DB Cleanup Report

**Erstellt:** 2026-02-15 16:25 CET
**Modus:** Cleanup mit Preserve kritischer Daten
**Backup:** `backups/pre_cleanup_20260215.sql` (226 KB)

---

## 1. Zusammenfassung

Vollständiges Database-Cleanup durchgeführt. Alle transiente/Mock-Daten gelöscht, MQTT Retained Messages bereinigt. Kritische Daten (User, Sensor-Definitionen, Schema) vollständig erhalten. DB-Größe von **39 MB → 8.4 MB** reduziert.

---

## 2. Was wurde ERHALTEN (kritisch)

| Tabelle | Rows | Status | Grund |
|---------|------|--------|-------|
| `user_accounts` | 1 (admin) | ✅ Intakt | User-Login & JWT-Auth |
| `sensor_type_defaults` | 11 | ✅ Intakt | Alle 11 Sensor-Prozessor-Definitionen |
| Schema (19 Tabellen) | - | ✅ Intakt | Alle Tabellen, Indizes, Constraints |
| `library_metadata` | 0 | ✅ Intakt | Leer, Struktur erhalten |
| `system_config` | 0 | ✅ Intakt | Leer, Struktur erhalten |
| `kaiser_registry` | 0 | ✅ Intakt | Leer, Struktur erhalten |
| `cross_esp_logic` | 0 | ✅ Intakt | Leer, Struktur erhalten |

### Erhaltene Sensor-Prozessoren (sensor_type_defaults)

| Sensor Type | Mode | Prozessor |
|-------------|------|-----------|
| bmp280_pressure | continuous | BMP280PressureProcessor |
| bmp280_temp | continuous | BMP280TemperatureProcessor |
| co2 | continuous | CO2Processor |
| ds18b20 | continuous | DS18B20Processor |
| ec | on_demand | ECSensorProcessor |
| flow | continuous | FlowProcessor |
| light | continuous | LightProcessor |
| moisture | continuous | MoistureSensorProcessor |
| ph | on_demand | PHSensorProcessor |
| sht31_humidity | continuous | SHT31HumidityProcessor |
| sht31_temp | continuous | SHT31TemperatureProcessor |

---

## 3. Was wurde GELÖSCHT

| Tabelle | Gelöschte Rows | Freigegebener Speicher | Beschreibung |
|---------|---------------|----------------------|-------------|
| `sensor_data` | 235 | ~21 MB | Mock-Sensordaten (DS18B20 Temp) |
| `esp_heartbeat_logs` | 146 | ~9 MB | Mock-ESP Heartbeat Time-Series |
| `token_blacklist` | 7 | ~48 kB | Abgelaufene JWT-Tokens |
| `audit_logs` | 6 | minimal | Mock-Device Discovery/Approval Events |
| `sensor_configs` | 1 | minimal | Mock-Sensor Config (GPIO 4 DS18B20) |
| `esp_devices` | 2 | ~208 kB | MOCK_25045525 + MOCK_E1BD1447 |
| **Gesamt** | **397 Rows** | **~30 MB** | |

---

## 4. MQTT Retained Messages bereinigt

### ESP_00000001 (Ghost-Device, nicht in DB)
- `kaiser/god/esp/ESP_00000001/system/command/response` → ✅ cleared
- `kaiser/god/esp/ESP_00000001/system/will` → ✅ cleared
- `kaiser/god/esp/ESP_00000001/zone/ack` → ✅ cleared
- `kaiser/god/esp/ESP_00000001/config_response` → ✅ cleared
- `kaiser/god/esp/ESP_00000001/actuator/5/status` → ✅ cleared
- `kaiser/god/esp/ESP_00000001/actuator/5/response` → ✅ cleared
- `kaiser/god/esp/ESP_00000001/actuator/5/alert` → ✅ cleared
- `kaiser/god/esp/ESP_00000001/onewire/scan_result` → ✅ cleared

### MOCK_25045525 + MOCK_E1BD1447 (gelöschte Mock-ESPs)
- Heartbeat, LWT, Sensor-Data Topics → ✅ cleared

---

## 5. Status nach Cleanup

### DB-Metriken

| Metrik | Vorher | Nachher | Delta |
|--------|--------|---------|-------|
| DB-Größe | 39 MB | 8.4 MB | **-78%** |
| Tabellen | 19 | 19 | 0 |
| ESP-Devices | 2 (online) | 2 (pending_approval) | Neu-registriert |
| Sensor Data | 231 | 0 | Clean |
| Heartbeat Logs | 143 | 0 | Clean |
| User Accounts | 1 | 1 | Erhalten |
| Sensor Defaults | 11 | 11 | Erhalten |

### SimulationScheduler Auto-Re-Registration

Die Mock-ESPs haben sich automatisch neu als `pending_approval` registriert:
- `MOCK_25045525` → pending_approval (frisch)
- `MOCK_E1BD1447` → pending_approval (frisch)

Dies ist korrektes Verhalten - die ESPs müssen erneut approved werden.

---

## 6. VACUUM Status

`VACUUM FULL ANALYZE` durchgeführt → Speicher physisch freigegeben, Statistiken aktualisiert.

---

## 7. Nächste Schritte

1. **Mock-ESPs approven** wenn gewünscht (Dashboard → Pending Devices → Approve)
2. **Server-Neustart optional** um Simulation sauber zu initialisieren
3. **Backup verfügbar** unter `backups/pre_cleanup_20260215.sql` falls Rollback nötig

---

_Report generiert von db-inspector | 2026-02-15 16:25 CET_
