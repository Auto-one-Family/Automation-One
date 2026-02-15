# ESP32-Debug Infrastruktur-Analyse

**Erstellt:** 2026-02-04
**Zweck:** Vollständige Dokumentation der esp32-debug Arbeitsumgebung

---

## 1. Session-System

### 1.1 Start-Script

- **Pfad:** `scripts/debug/start_session.sh`
- **Version:** 3.0 (Robuste ESP32-Optionen, Server-Handling)
- **Usage:** `./scripts/debug/start_session.sh [session-name] [--with-server] [--mode MODE]`

**Parameter:**

| Parameter | Beschreibung | Beispiel |
|-----------|--------------|----------|
| `session-name` | Session-Identifikator | `boot-test`, `sensor-debug` |
| `--with-server` | Server automatisch starten | Optional |
| `--mode MODE` | Test-Modus | `boot`, `config`, `sensor`, `actuator`, `e2e` |

**Modi mit Beschreibung:**

| Modus | MODE_DESCRIPTION | Report-Suffix |
|-------|------------------|---------------|
| `boot` | Boot-Sequenz (WiFi, MQTT, Heartbeat) | `ESP32_BOOT_REPORT.md` |
| `config` | Konfigurationsfluss (Zone Assignment, Config Push) | `ESP32_CONFIG_REPORT.md` |
| `sensor` | Sensor-Datenfluss (Readings, Validation) | `ESP32_SENSOR_REPORT.md` |
| `actuator` | Aktor-Steuerung (Commands, Status) | `ESP32_ACTUATOR_REPORT.md` |
| `e2e` | End-to-End Hardware Test (Boot → Sensor → Actuator → Commands) | `ESP32_E2E_REPORT.md` |

### 1.2 Verzeichnisstruktur

```
logs/
├── current/                  # Aktive Session (wird bei Start geleert)
│   ├── STATUS.md             # Script erstellt (Session-Kontext für Agents)
│   ├── esp32_serial.log      # User erstellt (pio device monitor | tee)
│   ├── god_kaiser.log        # Symlink zu Server-Log (oder Kopie auf Windows)
│   ├── mqtt_traffic.log      # Script erstellt (mosquitto_sub Capture)
│   ├── server_console.log    # Script erstellt (bei --with-server)
│   └── .session_info         # Script erstellt (Shell-Variablen)
│
└── archive/                  # Abgeschlossene Sessions
    └── YYYY-MM-DD_HH-MM_session-name/
        ├── STATUS.md
        ├── esp32_serial.log
        ├── god_kaiser.log
        ├── mqtt_traffic.log
        └── server_console.log
```

**Wer erstellt was:**

| Datei | Ersteller | Methode |
|-------|-----------|---------|
| `STATUS.md` | Script | `cat > STATUS.md << EOF` |
| `esp32_serial.log` | User | `pio device monitor \| tee esp32_serial.log` |
| `god_kaiser.log` | Script | `ln -sf` Symlink (oder `cp` Fallback) |
| `mqtt_traffic.log` | Script | `mosquitto_sub -t "kaiser/#" -v > mqtt_traffic.log` |
| `server_console.log` | Script | Nur bei `--with-server` |
| `.session_info` | Script | Shell-Variablen Export |

**Persistenz:**

- `logs/current/` wird bei jedem Script-Start **komplett geleert** (`.log`, `.md`, `.session_info`)
- Archivierung erfolgt durch `stop_session.sh` nach `logs/archive/[session-id]/`

---

## 2. ESP32 Serial Log

### 2.1 Format-Spezifikation

**Code-Location:** [logger.cpp:168-173](El Trabajante/src/utils/logger.cpp#L168-L173)

```cpp
void Logger::writeToSerial(LogLevel level, const char* message) {
  unsigned long timestamp = millis();
  const char* level_str = getLogLevelString(level);

  // Format: [timestamp] [LEVEL] message
  Serial.printf("[%10lu] [%-8s] %s\n", timestamp, level_str, message);
}
```

**Exaktes Format:**

```
[  timestamp] [LEVEL   ] message
```

| Feld | Format | Beschreibung |
|------|--------|--------------|
| Timestamp | `%10lu` | 10-stellig, rechtsbündig, Millisekunden seit Boot |
| Level | `%-8s` | 8 Zeichen, linksbündig, Leerzeichen-padded |
| Message | `%s` | Variabler Text |

### 2.2 Log-Levels

**Code-Location:** [logger.h:9-15](El Trabajante/src/utils/logger.h#L9-L15)

```cpp
enum LogLevel {
  LOG_DEBUG = 0,
  LOG_INFO = 1,
  LOG_WARNING = 2,
  LOG_ERROR = 3,
  LOG_CRITICAL = 4
};
```

**Level-Strings:** [logger.cpp:145-154](El Trabajante/src/utils/logger.cpp#L145-L154)

| Enum | String | Breite |
|------|--------|--------|
| `LOG_DEBUG` | `"DEBUG"` | 8 chars (padded) |
| `LOG_INFO` | `"INFO"` | 8 chars (padded) |
| `LOG_WARNING` | `"WARNING"` | 8 chars (padded) |
| `LOG_ERROR` | `"ERROR"` | 8 chars (padded) |
| `LOG_CRITICAL` | `"CRITICAL"` | 8 chars (padded) |

### 2.3 Beispiel-Zeilen

```
[       100] [INFO    ] Logger: Log level changed to INFO
[      1234] [INFO    ] WiFi connected! IP: 192.168.1.100
[      1250] [INFO    ] WiFi RSSI: -45 dBm
[      2500] [INFO    ] MQTT connected!
[      3000] [WARNING ] MQTT PORT FALLBACK to 1883
[      5000] [ERROR   ] MQTT connection failed, rc=-2
[     10000] [CRITICAL] Watchdog timeout detected
```

### 2.4 Macros für Logging

**Code-Location:** [logger.h:99-103](El Trabajante/src/utils/logger.h#L99-L103)

```cpp
#define LOG_DEBUG(msg) logger.debug(msg)
#define LOG_INFO(msg) logger.info(msg)
#define LOG_WARNING(msg) logger.warning(msg)
#define LOG_ERROR(msg) logger.error(msg)
#define LOG_CRITICAL(msg) logger.critical(msg)
```

---

## 3. Boot-Sequenz Patterns

### 3.1 Boot-Banner

**Code-Location:** [main.cpp:147-149](El Trabajante/src/main.cpp#L147-L149)

```cpp
Serial.println("\n╔════════════════════════════════════════╗");
Serial.println("║  ESP32 Sensor Network v4.0 (Phase 2)  ║");
Serial.println("╚════════════════════════════════════════╝");
```

**Exakter Output:**
```
╔════════════════════════════════════════╗
║  ESP32 Sensor Network v4.0 (Phase 2)  ║
╚════════════════════════════════════════╝
Chip Model: ESP32-WROOM-32
CPU Frequency: 240 MHz
Free Heap: 285000 bytes
```

**KRITISCH:** Boot-Banner MUSS als erstes erscheinen. Fehlt es, liegt ein Firmware-Problem vor.

### 3.2 WiFi-Verbindung

**Code-Location:** [wifi_manager.cpp](El Trabajante/src/services/communication/wifi_manager.cpp)

| Status | Exakter Pattern | Code-Line |
|--------|-----------------|-----------|
| ✅ SUCCESS | `[INFO    ] WiFi connected! IP: X.X.X.X` | :149 |
| ✅ SUCCESS | `[INFO    ] WiFi RSSI: -XX dBm` | :150 |
| 🔴 FAILURE | `[ERROR   ] ╔════════════════════════════════════════╗` | :103 |
| 🔴 FAILURE | `[ERROR   ] ║  ❌ WIFI CONNECTION FAILED            ║` | :104 |
| ⚠️ TIMEOUT | `[ERROR   ] Status Code: X` | :107 |
| ⚠️ TIMEOUT | `[ERROR   ] Reason: SSID not found` | :108 |

**WiFi Status Codes:** [wifi_manager.cpp:172-191](El Trabajante/src/services/communication/wifi_manager.cpp#L172-L191)

| Code | Bedeutung | Häufige Ursache |
|------|-----------|-----------------|
| `WL_NO_SSID_AVAIL` | SSID nicht gefunden | Falsche SSID, Router aus |
| `WL_CONNECT_FAILED` | Verbindung fehlgeschlagen | Falsches Passwort |
| `WL_DISCONNECTED` | Getrennt | Signal zu schwach |

**Erwartete Zeit:** < 20 Sekunden nach Boot (Timeout: 20s)

### 3.3 MQTT-Verbindung

**Code-Location:** [mqtt_client.cpp](El Trabajante/src/services/communication/mqtt_client.cpp)

| Status | Exakter Pattern | Code-Line |
|--------|-----------------|-----------|
| ✅ SUCCESS | `[INFO    ] MQTT connected!` | :241 |
| 🔴 FAILURE | `[ERROR   ] MQTT connection failed, rc=X` | :275 |
| ⚠️ FALLBACK | `[WARNING ] ╔════════════════════════════════════════╗` | :210 |
| ⚠️ FALLBACK | `[WARNING ] ║  ⚠️  MQTT PORT FALLBACK               ║` | :211 |
| ✅ FALLBACK OK | `[INFO    ] ✅ Port-Fallback successful! Connected on port 1883` | :225 |

**MQTT Return Codes (rc):** [mqtt_client.cpp:903-924](El Trabajante/src/services/communication/mqtt_client.cpp#L903-L924)

| rc | Bedeutung |
|----|-----------|
| `-4` | MQTT_CONNECTION_TIMEOUT |
| `-3` | MQTT_CONNECTION_LOST |
| `-2` | MQTT_CONNECT_FAILED |
| `-1` | MQTT_DISCONNECTED |
| `1` | MQTT_CONNECT_BAD_PROTOCOL |
| `2` | MQTT_CONNECT_BAD_CLIENT_ID |
| `3` | MQTT_CONNECT_UNAVAILABLE |
| `4` | MQTT_CONNECT_BAD_CREDENTIALS |
| `5` | MQTT_CONNECT_UNAUTHORIZED |

**Erwartete Zeit:** < 5 Sekunden nach WiFi

### 3.4 Registration Gate

**Code-Location:** [mqtt_client.cpp:726-738](El Trabajante/src/services/communication/mqtt_client.cpp#L726-L738)

| Status | Exakter Pattern | Code-Line |
|--------|-----------------|-----------|
| ⏳ WAITING | `[INFO    ] Registration gate closed - awaiting heartbeat ACK` | :253 |
| ✅ SUCCESS | `[INFO    ] ╔════════════════════════════════════════╗` | :733 |
| ✅ SUCCESS | `[INFO    ] ║  REGISTRATION CONFIRMED BY SERVER     ║` | :734 |
| ✅ SUCCESS | `[INFO    ] Gate opened - publishes now allowed` | :736 |
| ⚠️ TIMEOUT | `[WARNING ] Registration timeout - opening gate (fallback)` | :506 |

**Registration Timeout:** 10 Sekunden (Fallback öffnet Gate automatisch)

### 3.5 Heartbeat

**Code-Location:** [mqtt_client.cpp:659-721](El Trabajante/src/services/communication/mqtt_client.cpp#L659-L721)

**Heartbeat Payload Schema:**

```json
{
  "esp_id": "ESP_XXXXXXXX",
  "zone_id": "zone_1",
  "master_zone_id": "master_1",
  "zone_assigned": true,
  "ts": 1735818000,
  "uptime": 12345,
  "heap_free": 45000,
  "wifi_rssi": -45,
  "sensor_count": 2,
  "actuator_count": 1,
  "gpio_status": [...],
  "gpio_reserved_count": 3,
  "config_status": {...}
}
```

**MQTT Topic:** `kaiser/god/esp/{esp_id}/system/heartbeat`

**Interval:** 30 Sekunden (HEARTBEAT_INTERVAL_MS)

---

## 4. Error-Codes

### 4.1 Ranges

**Code-Location:** [error_codes.h:7-13](El Trabajante/src/models/error_codes.h#L7-L13)

| Range | Kategorie | Beispiele |
|-------|-----------|-----------|
| **1000-1999** | HARDWARE | GPIO, I2C, OneWire, Sensor, Actuator, PWM |
| **2000-2999** | SERVICE | NVS, Config, Logger, Storage, Subzone |
| **3000-3999** | COMMUNICATION | WiFi, MQTT, HTTP, Network |
| **4000-4999** | APPLICATION | State, Operation, Command, Watchdog |

### 4.2 Häufige Error-Codes

| Code | Name | Beschreibung | Typische Lösung |
|------|------|--------------|-----------------|
| 1002 | GPIO_CONFLICT | GPIO bereits in Verwendung | Anderen GPIO wählen |
| 1011 | I2C_DEVICE_NOT_FOUND | I2C-Gerät antwortet nicht | Verkabelung prüfen |
| 1021 | ONEWIRE_NO_DEVICES | Keine OneWire-Geräte gefunden | Pull-up 4.7kΩ prüfen |
| 1060 | DS18B20_SENSOR_FAULT | -127°C gelesen | Sensor defekt/getrennt |
| 1061 | DS18B20_POWER_ON_RESET | 85°C gelesen | Erste Messung, warten |
| 3002 | WIFI_CONNECT_TIMEOUT | WiFi Timeout | SSID/Passwort prüfen |
| 3011 | MQTT_CONNECT_FAILED | MQTT Broker nicht erreichbar | Broker-IP prüfen |
| 4070 | WATCHDOG_TIMEOUT | System-Hang erkannt | ESP32 Reset |

### 4.3 Format im Log

```
[      5000] [ERROR   ] Error 1011: I2C device not found at address 0x44
[      5100] [ERROR   ] MQTT connection failed, rc=-2
```

**Helper-Funktion:** [error_codes.h:238-385](El Trabajante/src/models/error_codes.h#L238-L385)

```cpp
const char* getErrorDescription(uint16_t error_code);
const char* getErrorCodeRange(uint16_t error_code);  // → "HARDWARE", "SERVICE", etc.
```

---

## 5. STATUS.md Struktur

### 5.1 Generierung

**Code-Location:** [start_session.sh:444-865](scripts/debug/start_session.sh#L444-L865)

Das Script generiert STATUS.md mit dynamischen Variablen:
- `$SESSION_ID`
- `$TEST_MODE`
- `$MODE_DESCRIPTION`
- `$SERVER_STATUS`
- `$MQTT_STATUS`

### 5.2 Sections

| Section | Inhalt |
|---------|--------|
| **Session-Info** | Session-ID, Startzeit, Server/MQTT Status |
| **Log-Dateien Tabelle** | Pfade, Format, Agent-Zuordnung |
| **Report-Ausgabe** | Report-Pfade pro Agent mit `$TEST_MODE` |
| **Test-Modus** | Fokus und erwartete Patterns für aktuellen Modus |
| **Phase 1-4** | BOOT, MQTT, Server, Zone Assignment Patterns |
| **Phase 5-8** | Nur bei E2E-Modus: Sensor, Actuator, Commands, Checklist |
| **Agent-Aktivierung** | Kopierfertige Befehle für jeden Agent |
| **Finale Checkliste** | Manuelle Prüfpunkte nach Analyse |

### 5.3 Was der Agent extrahieren muss

1. **Aktueller Modus:** `## 📋 Test-Modus: ${TEST_MODE}`
2. **Report-Pfad:** `.claude/reports/current/ESP32_${TEST_MODE}_REPORT.md`
3. **Erwartete Patterns:** Tabellen unter "Phase 1-4" Sections
4. **Fokus-Beschreibung:** `> **Fokus:** ${MODE_DESCRIPTION}`

### 5.4 Beispiel-Auszug

```markdown
## 📋 Test-Modus: BOOT

> **Fokus:** Boot-Sequenz (WiFi, MQTT, Heartbeat)
> **Patterns:** Verifiziert gegen AutomationOne-Code (2026-02-02)

### Phase 1: BOOT-Sequenz

#### Boot-Banner (Kritisch - MUSS erscheinen)

```
╔════════════════════════════════════════╗
║  ESP32 Sensor Network v4.0 (Phase 2)  ║
╚════════════════════════════════════════╝
```

**Code-Location:** `El Trabajante/src/main.cpp:140-145`
```

---

## 6. Report-Verzeichnis

### 6.1 Struktur

```
.claude/reports/
├── current/           # Aktuelle Session (vom Script geleert)
│   ├── .gitkeep
│   └── ESP32_BOOT_REPORT.md  (Beispiel)
│
├── archive/           # Abgeschlossene Sessions (von stop_session.sh)
│   ├── .gitkeep
│   └── YYYY-MM-DD_HH-MM_session-name/
│       ├── ESP32_BOOT_REPORT.md
│       ├── SERVER_BOOT_REPORT.md
│       └── MQTT_BOOT_REPORT.md
│
├── BugsFound/         # Bug-Dokumentation (manuell)
│   ├── Bug_Katalog.md
│   ├── Esp32_Firmware.md
│   ├── Frontend.md
│   ├── Server.md
│   └── Userbeobachtungen.md
│
└── README.md          # Report-Template und Anleitung
```

### 6.2 Pfad-Konvention

```
.claude/reports/current/ESP32_[MODUS]_REPORT.md
```

Beispiele:
- `ESP32_BOOT_REPORT.md`
- `ESP32_CONFIG_REPORT.md`
- `ESP32_SENSOR_REPORT.md`
- `ESP32_ACTUATOR_REPORT.md`
- `ESP32_E2E_REPORT.md`

### 6.3 Report-Template

**Code-Location:** [.claude/reports/README.md](.claude/reports/README.md)

```markdown
# [AGENT] Report

**Datum:** [YYYY-MM-DD HH:MM]
**Modus:** [z.B. BOOT, SENSOR, E2E]
**Log-Quelle:** [Pfad zur analysierten Log-Datei]

---

## Zusammenfassung

| Prüfpunkt | Status | Details |
|-----------|--------|---------|
| ... | ✅/⚠️/❌ | ... |

**Gesamtstatus:** ✅ OK / ⚠️ Warnings / ❌ Fehler

---

## Findings

### Finding 1: [Titel]
**Log-Zeile:** `[relevanter Auszug]`
**Bedeutung:** [Interpretation]
**Empfehlung:** [Nächster Schritt]

---

## Nächste Schritte

1. [Empfehlung]
2. [Empfehlung]
```

### 6.4 Archivierung

- **Wer:** `stop_session.sh` Script
- **Wann:** Bei Session-Ende
- **Wohin:** `archive/[session-id]/`
- **Was:** Alle Reports aus `current/` werden verschoben

---

## 7. Referenz-Dateien

### 7.1 Inventar

| Datei | Pfad | Wann lesen |
|-------|------|------------|
| Error-Codes | `.claude/reference/errors/ERROR_CODES.md` | Bei `[ERROR]` im Log |
| Log-Locations | `.claude/reference/debugging/LOG_LOCATIONS.md` | Bei Format-Fragen |
| MQTT Topics | `.claude/reference/api/MQTT_TOPICS.md` | Bei Topic-Pattern-Analyse |
| Communication Flows | `.claude/reference/patterns/COMMUNICATION_FLOWS.md` | Bei Sequenz-Analyse |
| REST Endpoints | `.claude/reference/api/REST_ENDPOINTS.md` | Bei API-Debugging |
| WebSocket Events | `.claude/reference/api/WEBSOCKET_EVENTS.md` | Bei WS-Debugging |
| Architecture | `.claude/reference/patterns/ARCHITECTURE_DEPENDENCIES.md` | Bei System-Verständnis |
| CI Pipeline | `.claude/reference/debugging/CI_PIPELINE.md` | Bei Build-Problemen |
| Access Limitations | `.claude/reference/debugging/ACCESS_LIMITATIONS.md` | Bei Berechtigungsfragen |
| Test Workflow | `.claude/reference/testing/TEST_WORKFLOW.md` | Bei Test-Ausführung |
| System Operations | `.claude/reference/testing/SYSTEM_OPERATIONS_REFERENCE.md` | Bei Befehls-Referenz |
| ESP32 Skill | `.claude/skills/esp32-development/SKILL.md` | Bei Firmware-Details |

### 7.2 Priorität für esp32-debug

| Priorität | Datei | Grund |
|-----------|-------|-------|
| 1 | `logs/current/STATUS.md` | Session-Kontext, erwartete Patterns |
| 2 | `logs/current/esp32_serial.log` | Hauptanalyse-Quelle |
| 3 | `.claude/reference/errors/ERROR_CODES.md` | Error-Interpretation |
| 4 | `.claude/reference/api/MQTT_TOPICS.md` | Topic-Verifikation |

---

## 8. Zusammenfassung für Agent-Optimierung

### Der esp32-debug Agent braucht:

**Input:**

| Datei | Warum | Priorität |
|-------|-------|-----------|
| `logs/current/STATUS.md` | Session-Kontext, Modus, erwartete Patterns | **IMMER ZUERST** |
| `logs/current/esp32_serial.log` | Hauptanalyse-Quelle | **IMMER** |
| `.claude/reference/errors/ERROR_CODES.md` | Bei `[ERROR]` oder `[CRITICAL]` im Log | Bei Bedarf |
| `.claude/reference/api/MQTT_TOPICS.md` | Bei MQTT-Topic-Problemen | Bei Bedarf |

**Wissen (im Agent eingebettet):**

1. **Log-Format:** `[%10lu] [%-8s] %s\n` (Timestamp 10-stellig, Level 8 Zeichen)
2. **Log-Levels:** DEBUG, INFO, WARNING, ERROR, CRITICAL
3. **Error-Code Ranges:** 1000-1999 HARDWARE, 2000-2999 SERVICE, 3000-3999 COMM, 4000-4999 APP
4. **Boot-Banner Regex:** `╔═+╗.*ESP32 Sensor Network.*╚═+╝`
5. **WiFi Success Pattern:** `WiFi connected! IP:`
6. **MQTT Success Pattern:** `MQTT connected!`
7. **Registration Pattern:** `REGISTRATION CONFIRMED BY SERVER`

**Pattern-Matching Regeln:**

1. Suche nach Log-Level im Format `[LEVEL   ]` (8 Zeichen)
2. Timestamp ist Millisekunden seit Boot (aufsteigend)
3. Bei `[ERROR]` → Error-Code extrahieren falls vorhanden
4. Bei MQTT-Fehler → `rc=X` Return-Code interpretieren
5. Bei WiFi-Fehler → Status-Code und Reason extrahieren

**Output:**

| Output | Pfad | Format |
|--------|------|--------|
| Report | `.claude/reports/current/ESP32_${TEST_MODE}_REPORT.md` | Markdown nach Template |

### Der Agent braucht NICHT:

1. **Boot-Sequenz Patterns** → STATUS.md liefert bereits verifizierte Patterns mit Code-Locations
2. **Server/MQTT Log Analyse** → Andere Agents (server-debug, mqtt-debug)
3. **Bash-Zugriff** → Nur Read, Grep, Glob Tools
4. **Code-Änderungen** → Nur Analyse und Reporting

---

## 9. Workflow für esp32-debug

```
1. STATUS.md LESEN
   └─► Modus extrahieren (BOOT/CONFIG/SENSOR/ACTUATOR/E2E)
   └─► Erwartete Patterns für diesen Modus identifizieren
   └─► Report-Pfad bestimmen

2. esp32_serial.log ANALYSIEREN
   └─► Boot-Banner suchen (KRITISCH)
   └─► WiFi-Verbindung prüfen (SUCCESS/FAILURE)
   └─► MQTT-Verbindung prüfen (SUCCESS/FAILURE/FALLBACK)
   └─► Registration-Gate prüfen
   └─► Modus-spezifische Patterns prüfen

3. ERRORS IDENTIFIZIEREN
   └─► Nach [ERROR] und [CRITICAL] suchen
   └─► Error-Code extrahieren
   └─► Mit ERROR_CODES.md interpretieren

4. REPORT SCHREIBEN
   └─► Pfad: .claude/reports/current/ESP32_${TEST_MODE}_REPORT.md
   └─► Template befolgen
   └─► Findings mit Log-Zeilen dokumentieren
   └─► Empfehlungen geben
```

---

## 10. Code-Locations Quick Reference

### Boot-Sequenz

| Event | Datei | Zeile |
|-------|-------|-------|
| Boot-Banner | `main.cpp` | 147-152 |
| Logger Init | `logger.cpp` | 32-38 |
| GPIO Init | `main.cpp` | 170-200 |
| WiFi Begin | `wifi_manager.cpp` | 49-61 |
| WiFi Connect | `wifi_manager.cpp` | 66-169 |
| MQTT Begin | `mqtt_client.cpp` | 71-82 |
| MQTT Connect | `mqtt_client.cpp` | 87-279 |
| Heartbeat | `mqtt_client.cpp` | 659-721 |
| Registration Gate | `mqtt_client.cpp` | 726-738 |

### Error Handling

| Event | Datei | Zeile |
|-------|-------|-------|
| Error Definitions | `error_codes.h` | 1-396 |
| Error Descriptions | `error_codes.h` | 238-385 |
| Error Range Helper | `error_codes.h` | 388-394 |

### Logging

| Event | Datei | Zeile |
|-------|-------|-------|
| Log Levels Enum | `logger.h` | 9-15 |
| Level Strings | `logger.cpp` | 145-154 |
| Serial Output Format | `logger.cpp` | 168-173 |
| Buffer Management | `logger.cpp` | 176-193 |

---

*Generiert: 2026-02-04*
*Zweck: Spezialisierung des esp32-debug Agenten*
