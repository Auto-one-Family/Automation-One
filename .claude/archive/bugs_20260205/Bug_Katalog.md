# 📋 AutomationOne Bug-Katalog

**Stand:** 2026-02-02 17:15  
**Letzte Verifikation:** E2E-Test Session mit ESP_472204

---

## Übersicht

| Bug-ID | Komponente | Status | Priorität | Kurzbeschreibung |
|--------|------------|--------|-----------|------------------|
| BUG-001 | Server | ✅ ERLEDIGT | - | WebSocket API Mismatch |
| BUG-002 | System | ✅ ERLEDIGT | - | Zone-Assignment Flow |
| BUG-003 | Daten | 🗑️ ARTEFAKT | - | Alte Test-ESPs in DB |
| BUG-004 | ESP32 | ⏳ OFFEN | Mittel | GPIO 13 Config-Problem |
| BUG-005 | ESP32 | ✅ GEFIXT | - | NVS-Error alle 60s |
| BUG-006 | Server | ⏳ OFFEN | Hoch | Device Not Found bei Commands |
| BUG-007 | MQTT | ⏳ OFFEN | Mittel | Retained Emergency-Stop Messages |
| BUG-008 | ESP32 | ⏳ OFFEN | Hoch | Actuator Commands werden ignoriert |
| BUG-009 | ESP32 | ✅ GEFIXT | - | System-Commands nicht implementiert |
| BUG-010 | Server | ✅ GEFIXT | - | Config-Endpoint sendet leere `{}` |
| BUG-011 | Server | ✅ GEFIXT | - | Feld-Mapping Server↔ESP falsch |
| BUG-012 | ESP32 | ⏳ OFFEN | Niedrig | Einmaliger NVS-Error beim Boot |
| BUG-ONEWIRE-001 | Server+ESP32 | ✅ GEFIXT | - | OneWire ROM-Code wird nicht an ESP32 gesendet |

**Statistik:** 8 erledigt/gefixt, 5 offen (davon 2 hoch, 2 mittel, 1 niedrig)

---

## ✅ Erledigte Bugs

### BUG-001: WebSocket API Mismatch
| Feld | Wert |
|------|------|
| **Komponente** | Server (WebSocket) |
| **Status** | ✅ ERLEDIGT |
| **Beschreibung** | WebSocket-Manager API-Signatur stimmte nicht mit Aufrufstellen überein |
| **Fix-Location** | `El Servador/god_kaiser_server/src/websocket/manager.py` |
| **Verifiziert** | Ja |

---

### BUG-002: Zone-Assignment Flow
| Feld | Wert |
|------|------|
| **Komponente** | System (ESP↔Server) |
| **Status** | ✅ ERLEDIGT |
| **Beschreibung** | Zone-Assignment funktionierte nicht korrekt |
| **Fix-Location** | Zone-Handler ESP + Server |
| **Verifiziert** | Ja |

---

### BUG-003: Alte Test-ESPs in DB
| Feld | Wert |
|------|------|
| **Komponente** | Datenbank |
| **Status** | 🗑️ ARTEFAKT |
| **Beschreibung** | Verwaiste ESP_00000001 und andere Test-Devices in DB |
| **Aktion** | Manuelles Cleanup empfohlen |
| **Notiz** | Kein Code-Bug, nur Daten-Artefakt |

---

### BUG-005: NVS-Error alle 60 Sekunden
| Feld | Wert |
|------|------|
| **Komponente** | ESP32 Firmware |
| **Status** | ✅ GEFIXT |
| **Beschreibung** | `nvs_open failed: NOT_FOUND` erschien bei jedem Heartbeat (alle 60s) |
| **Root Cause** | `getSubzoneCount()` öffnete NVS-Namespace bei jedem Aufruf |
| **Fix** | Caching-Lösung mit `subzone_count_cache_` + `subzone_count_initialized_` |
| **Fix-Location** | `El Trabajante/src/services/config/config_manager.cpp:1013-1069` |
| **Verifiziert** | 2026-02-02, 10+ Heartbeats ohne wiederholenden Error |

---

### BUG-009: System-Commands nicht implementiert
| Feld | Wert |
|------|------|
| **Komponente** | ESP32 Firmware |
| **Status** | ✅ GEFIXT |
| **Beschreibung** | ESP reagierte nicht auf `status`, `diagnostics`, `get_config` Commands |
| **Fix** | Handler in main.cpp implementiert (Zeilen 974-1160) |
| **Topic** | `kaiser/god/esp/{esp_id}/system/command` |
| **Response-Topic** | `kaiser/god/esp/{esp_id}/system/command/response` |
| **Verifiziert** | 2026-02-02, alle 3 Commands getestet und funktional |

**Implementierte Commands:**
| Command | Response-Felder |
|---------|-----------------|
| `status` | esp_id, state, uptime, heap_free, wifi_rssi, sensor_count, actuator_count, zone_id |
| `diagnostics` | Wie status + heap_min, chip_model, flash_size, sdk_version, wifi_mac, boot_count |
| `get_config` | zone{}, sensors[], actuators[] |

---

### BUG-010: Config-Endpoint sendet leere Payload
| Feld | Wert |
|------|------|
| **Komponente** | Server (API) |
| **Status** | ✅ GEFIXT |
| **Beschreibung** | `POST /api/v1/esp/devices/{id}/config` sendete `{}` statt Sensor/Actuator-Config |
| **Root Cause** | `ESPConfigUpdate` Schema hatte keine `sensors`/`actuators` Felder |
| **Fix** | Neues Schema `ESPDeviceConfigRequest` mit korrekten Feldern |
| **Fix-Location** | `El Servador/god_kaiser_server/src/api/v1/esp.py:602-693` |
| **Verifiziert** | 2026-02-02, Config-Payload korrekt auf MQTT publiziert |

---

### BUG-011: Feld-Mapping Server↔ESP falsch
| Feld | Wert |
|------|------|
| **Komponente** | Server (Schemas) |
| **Status** | ✅ GEFIXT |
| **Beschreibung** | Frontend sendet `type`/`name`, ESP erwartet `sensor_type`/`sensor_name` |
| **Fix** | Dual-Format Support + Transformation in neuen Schemas |
| **Fix-Location** | `El Servador/god_kaiser_server/src/schemas/esp.py` (+180 Zeilen) |
| **Verifiziert** | 2026-02-02 |

**Mapping-Tabelle:**
| Frontend-Format | ESP-Format | Status |
|-----------------|------------|--------|
| `type` | `sensor_type` | ✅ |
| `name` | `sensor_name` | ✅ |
| `type` | `actuator_type` | ✅ |
| `name` | `actuator_name` | ✅ |
| `type: "digital"` | `actuator_type: "relay"` | ✅ (Bonus-Fix) |

---

### BUG-ONEWIRE-001: OneWire ROM-Code wird nicht an ESP32 gesendet
| Feld | Wert |
|------|------|
| **Komponente** | Server + ESP32 |
| **Status** | ✅ GEFIXT |
| **Beschreibung** | OneWire-Sensoren (DS18B20) konnten nicht konfiguriert werden |
| **Symptom** | `Invalid OneWire ROM-Code length (expected 16, got 0)` auf ESP32 |
| **Root Cause** | Drei gekoppelte Bugs: Schema ohne Feld, to_esp_format() sendet nicht, ESP32 extrahiert nicht |
| **Verifiziert** | 2026-02-03 |

**Root Cause Analyse:**
| Bug | Komponente | Problem |
|-----|------------|---------|
| Bug-A | Server Schema | `ESPSensorConfigItem` hatte kein `onewire_address` Feld |
| Bug-B | Server Config-Push | `to_esp_format()` sendete `onewire_address` nicht |
| Bug-C | ESP32 JSON-Parsing | `parseAndConfigureSensorWithTracking()` extrahierte `onewire_address` nicht |

**Fix-Locations:**
| Datei | Änderung |
|-------|----------|
| `schemas/esp.py:738-742` | Feld `onewire_address` zu `ESPSensorConfigItem` hinzugefügt |
| `schemas/esp.py:744-772` | `to_esp_format()` erweitert um `onewire_address` zu senden |
| `main.cpp:2068-2071` | JSON-Extraktion für `onewire_address` hinzugefügt |

**AUTO_ Prefix Handling:**
- Server speichert teilweise `AUTO_<16hex>` (z.B. `AUTO_B9421D7633DF3991`)
- `to_esp_format()` entfernt `AUTO_` Prefix automatisch
- ESP32 empfängt reine 16 Zeichen (z.B. `B9421D7633DF3991`)

**Detaillierte Analyse:** `.claude/reports/current/ONEWIRE_BUG_ANALYSIS.md`

---

## ⏳ Offene Bugs

### BUG-004: GPIO 13 Config-Problem
| Feld | Wert |
|------|------|
| **Komponente** | ESP32 Firmware |
| **Status** | ⏳ OFFEN |
| **Priorität** | Mittel |
| **Beschreibung** | Konfiguration von GPIO 13 funktioniert nicht korrekt |
| **Symptom** | [Noch zu dokumentieren] |
| **Vermutung** | GPIO 13 ist auf manchen Boards für Flash/Boot reserviert |
| **Nächster Schritt** | Analyse welche GPIOs auf ESP32-WROOM reserviert sind |

---

### BUG-006: Device Not Found bei Commands
| Feld | Wert |
|------|------|
| **Komponente** | Server |
| **Status** | ⏳ OFFEN |
| **Priorität** | **Hoch** |
| **Beschreibung** | Server meldet "Device not found" obwohl ESP online ist |
| **Symptom** | Actuator-Commands werden nicht ausgeführt |
| **Vermutung** | Race-Condition oder Cache-Problem bei Device-Lookup |
| **Nächster Schritt** | Server-Logs analysieren wenn Fehler auftritt |

---

### BUG-007: Retained Emergency-Stop Messages
| Feld | Wert |
|------|------|
| **Komponente** | MQTT Broker |
| **Status** | ⏳ OFFEN |
| **Priorität** | Mittel |
| **Beschreibung** | Alte Emergency-Stop Messages bleiben als Retained im Broker |
| **Symptom** | ESPs gehen beim Connect sofort in Emergency-Stop |
| **Betroffene Topics** | `kaiser/god/esp/{esp_id}/actuator/emergency`, `kaiser/broadcast/emergency` |
| **Workaround** | Manuelles Clearen der Retained Messages |
| **Nächster Schritt** | Server sollte beim Start Retained Messages clearen |

**Cleanup-Befehl:**
```bash
mosquitto_pub -h localhost -t "kaiser/broadcast/emergency" -r -n
mosquitto_pub -h localhost -t "kaiser/god/esp/ESP_472204/actuator/emergency" -r -n
```

---

### BUG-008: Actuator Commands werden ignoriert
| Feld | Wert |
|------|------|
| **Komponente** | ESP32 Firmware |
| **Status** | ⏳ OFFEN |
| **Priorität** | **Hoch** |
| **Beschreibung** | ESP empfängt Actuator-Commands aber führt sie nicht aus |
| **Symptom** | Command auf MQTT sichtbar, aber Actuator-Status ändert sich nicht |
| **Topic** | `kaiser/god/esp/{esp_id}/actuator/{gpio}/command` |
| **Abhängigkeit** | Möglicherweise mit BUG-006 oder BUG-007 zusammenhängend |
| **Nächster Schritt** | Serial-Log während Command analysieren |

**Test-Command:**
```bash
mosquitto_pub -h localhost -t "kaiser/god/esp/ESP_472204/actuator/26/command" \
  -m '{"command": "ON", "value": 1.0, "timestamp": 1234567890}'
```

---

### BUG-012: Einmaliger NVS-Error beim Boot (NEU)
| Feld | Wert |
|------|------|
| **Komponente** | ESP32 Firmware |
| **Status** | ⏳ OFFEN |
| **Priorität** | **Niedrig** |
| **Beschreibung** | Einmaliger `nvs_open failed: NOT_FOUND` Error beim Boot |
| **Entdeckt** | 2026-02-02 |

**Log-Auszug:**
```
16:51:48.235 > [      5445] [INFO    ] MQTT connected!
16:51:48.256 > [  5470][E][Preferences.cpp:50] begin(): nvs_open failed: NOT_FOUND
16:51:48.269 > [      5482] [INFO    ] Initial heartbeat sent for ESP registration
```

| Feld | Wert |
|------|------|
| **Zeitpunkt** | 5470ms nach Boot, direkt nach MQTT-Connect |
| **Auswirkung** | Keine - System funktioniert trotzdem |
| **Unterschied zu BUG-005** | Tritt nur EINMAL auf (nicht alle 60s) |
| **Vermutung** | Eine Funktion versucht ein Subzone-Namespace zu öffnen das nicht existiert |
| **Nächster Schritt** | Code-Analyse: Was passiert zwischen MQTT-Connect (5445ms) und Heartbeat (5482ms)? |

**Mögliche Kandidaten:**
1. `sendInitialHeartbeat()` ruft eventuell `getSubzoneCount()` auf BEVOR Cache initialisiert
2. Irgendeine andere Funktion die Subzone-Config lesen will

---

## Bug-Prioritäten Übersicht

### 🔴 Hoch (blockiert Funktionalität)
- **BUG-006:** Device Not Found
- **BUG-008:** Actuator Commands ignoriert

### 🟡 Mittel (eingeschränkte Funktionalität)
- **BUG-004:** GPIO 13 Config
- **BUG-007:** Retained Emergency-Stop

### 🟢 Niedrig (kosmetisch/nicht blockierend)
- **BUG-012:** Einmaliger NVS-Error beim Boot

---

## Empfohlene Reihenfolge

1. **BUG-006 + BUG-008** zusammen analysieren (wahrscheinlich zusammenhängend)
2. **BUG-007** fixen (Retained Messages clearen)
3. **BUG-004** analysieren (GPIO-Reservierungen)
4. **BUG-012** wenn Zeit ist (niedrige Priorität)

---

## Archivierte Test-Reports

| Datum | Report | Inhalt |
|-------|--------|--------|
| 2026-02-02 | `E2E_FIX_VERIFICATION_REPORT.md` | BUG-005, 009, 010, 011 Verifikation |

---

*Katalog gepflegt von: Technical Manager*  
*Letzte Aktualisierung: 2026-02-02 17:15*
