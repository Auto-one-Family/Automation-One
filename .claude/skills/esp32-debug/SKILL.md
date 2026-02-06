---
name: esp32-debug
description: |
  ESP32 Serial-Log Analyst für AutomationOne Debug-Sessions.
  Verwenden bei: Boot-Sequenz-Analyse, SafeMode-Trigger, GPIO-Konflikte,
  Sensor/Actuator-Probleme, WiFi/MQTT-Connectivity, Watchdog-Events,
  NVS-Persistenz, Boot-Loop-Detection, Circuit-Breaker-Status.
  NICHT verwenden für: Server-Logs, MQTT-Broker-Level, Frontend, Datenbank.
  Abgrenzung: server-debug für Server, mqtt-debug für Broker, db-inspector für DB.
allowed-tools: Read, Grep, Glob
---

# ESP32 Debug Skill

> **Fokus:** Firmware-Fehler, Boot-Probleme, Hardware-Issues, Sensor/Actuator-Kommunikation
> **Log-Quelle:** `logs/current/esp32_serial.log`
> **Error-Codes:** 1000-4999 (ESP32-spezifisch)

---

## 0. Quick Reference - Debugging-Fokus

| Problem | Sektion | Grep-Pattern |
|---------|---------|--------------|
| **Boot hängt** | [Boot-Sequenz](#boot-sequenz) | `grep -E "STEP|Phase|ERROR"` |
| **SafeMode** | [SafeMode-Trigger](#safemode-trigger) | `grep -i "safe.mode\|boot.loop"` |
| **GPIO-Fehler** | [Error-Codes](#error-code-vollreferenz) | `grep -E "1001\|1002\|GPIO"` |
| **Sensor-Problem** | [Datenfluss](#datenfluss-sensor--server) | `grep -E "1040\|1041\|sensor"` |
| **MQTT offline** | [Circuit-Breaker](#circuit-breaker) | `grep -i "circuit\|MQTT\|3011"` |
| **Watchdog** | [Error-Codes](#watchdog-4070-4072) | `grep -E "4070\|4071\|watchdog"` |

---

## 1. Debug-Fokus & Abgrenzung

### Mein Bereich ✅

- Boot-Sequenz-Analyse (16 Schritte, main.cpp)
- SafeMode-Trigger (5 verschiedene Auslöser)
- GPIO-Konflikte und Hardware-Fehler (1000-1999)
- Sensor/Actuator Initialisierung und Runtime-Probleme
- WiFi/MQTT Connectivity (3000-3999)
- Watchdog-Events (4070-4072)
- NVS Persistenz-Probleme (2001-2005)
- Boot-Loop Detection (5× reboot in <60s)
- Circuit Breaker Status (MQTT: 5 failures → 30s OPEN)

### NICHT mein Bereich ❌

| Symptom | Weiterleiten an |
|---------|----------------|
| Server-Logs (`god_kaiser.log`) | `server-debug` |
| MQTT-Broker-Level (Topics, QoS) | `mqtt-debug` |
| Frontend Build/Runtime | `frontend-debug` |
| Datenbank (PostgreSQL) | `db-inspector` |

---

## 2. Boot-Sequenz (main.cpp)

> Exakte Reihenfolge aus main.cpp mit STEP-Kommentaren

| # | Zeile | Modul | Was passiert | Fehler wenn... |
|---|-------|-------|-------------|----------------|
| 1 | 131-142 | Serial | UART 115200 bps, Wokwi +500ms | Kein Output |
| 2 | 147-152 | Boot Banner | Chip Model, CPU Freq, Heap | - |
| 3 | 179-242 | Boot-Button | GPIO 0 long-press 10s = Factory Reset | Factory Reset |
| 4 | 245-248 | GPIO Safe-Mode | `gpioManager.initializeAllPinsToSafeMode()` | 1001-1006 |
| 5 | 251-255 | Logger | `logger.begin()`, LOG_INFO | - |
| 6 | 258-263 | Storage | NVS-Access Layer (`storageManager.begin()`) | 2001-2005 |
| 7 | 266-278 | Config | `loadAllConfigs()` | 2010-2014 |
| 8 | 280-308 | Defensive Repair | Inconsistent state check | SafeMode |
| 9 | 310-357 | Boot-Loop Detect | 5× in <60s → SafeMode | SafeMode |
| 10 | 359-405 | Watchdog Init | Provisioning: 300s / Production: 60s | 4070 bei Timeout |
| 11 | 433-546 | Provisioning | Keine Config → AP-Mode | Portal oder LED-Blink |
| 12 | 552-562 | Skip Check | Skip WiFi/MQTT bei SAFE_MODE | - |
| 13 | 567-577 | Error Tracker | `begin()`, TopicBuilder init | - |
| 14 | 600-674 | WiFi | CB: 10 failures → 60s timeout | 3001-3005, Provisioning Portal |
| 15 | 676+ | MQTT | CB: 5 failures → 30s timeout | 3010-3016 |

**KRITISCH:** Schritt 4 (GPIO Safe-Mode) kommt VOR Config-Load!
Das bedeutet: Alle Pins starten in sicherem Zustand, egal was die Config sagt.

---

## 3. SafeMode-Trigger (5 Auslöser)

| Trigger | Zeile | Bedingung | Ergebnis |
|---------|-------|-----------|----------|
| Boot-Button 10s | 179-237 | GPIO 0 gedrückt 10s | NVS löschen, Neustart |
| Boot-Loop | 338-357 | 5× reboot in <60s | SafeMode-State (Infinite Loop) |
| Inconsistent State | 292-308 | provisioning-safe + valid config | Repair/SafeMode |
| WiFi Failure | 615-671 | Keine Verbindung | Provisioning Portal |
| AP-Mode Failure | 517-545 | Portal kann nicht starten | LED 4× blink → Halt |

### Diagnose-Workflow SafeMode

```
1. Serial Output prüfen → Wo bleibt der Boot hängen?
2. NVS-Content prüfen → Sind Configs korrupt?
3. Boot-Counter prüfen → Boot-Loop (>5 in <60s)?
4. GPIO 0 Status → Versehentlich gedrückt?
5. LED-Blink-Pattern? → 3×=Provision-Fail, 4×=AP-Mode-Fail, 5×=WiFi-Fail
```

---

## 4. Datenfluss: Sensor → Server

**WICHTIG:** Server-zentrische Architektur. Kein lokaler Ring-Buffer!

```
Sensor Hardware
↓ (analogRead/digitalRead/I2C/OneWire)
Sensor Manager → JSON Payload
↓
MQTT Publish (QoS 1) → topic: kaiser/{id}/esp/{esp_id}/sensor/{gpio}/data
↓
[Wenn Broker offline → KEIN lokaler Buffer]
[Daten gehen VERLOREN bis Reconnect]
```

### NVS Persistenz (was gespeichert wird)

| Namespace | Inhalt |
|-----------|--------|
| `wifi_config` | SSID, Password, Server-Address, MQTT-Port |
| `zone_config` | Zone-Zuordnung (kaiser_id, zone_id, master_zone_id) |
| `system_config` | ESP-ID, current_state, boot_count, last_boot_time |
| `sensors_config` | Sensor-Definitionen (GPIO, Type, Interval) |
| `actuators_config` | Actuator-Definitionen (GPIO, Type, Safety) |

**NICHT gespeichert:** Sensor-Messwerte, Aktuator-States (flüchtig!)

---

## 5. Error-Code Vollreferenz (1000-4999)

### Hardware (1000-1999)

| Range | Kategorie | Häufigste | Debug-Aktion |
|-------|-----------|-----------|--------------|
| 1001-1006 | GPIO | RESERVED(1001), CONFLICT(1002) | Pin-Belegung prüfen |
| 1007-1019 | I2C | TIMEOUT(1007), BUS_STUCK(1015) | Verkabelung, Pull-ups 4.7kΩ |
| 1020-1029 | OneWire | NO_DEVICES(1021), INVALID_ROM(1023-1025) | Sensor angeschlossen? |
| 1030-1032 | PWM | CHANNEL_FULL(1031) | Max PWM-Channels erreicht |
| 1040-1043 | Sensor | READ_FAILED(1040), TIMEOUT(1043) | Hardware defekt? |
| 1050-1053 | Actuator | SET_FAILED(1050), CONFLICT(1053) | GPIO-Kollision? |
| 1060-1063 | DS18B20 | SENSOR_FAULT(1060), OUT_OF_RANGE(1062) | Verkabelung, Sensor |

### Service (2000-2999)

| Range | Kategorie | Häufigste |
|-------|-----------|-----------|
| 2001-2005 | NVS | INIT_FAILED(2001), WRITE_FAILED(2003) |
| 2010-2014 | Config | LOAD_FAILED(2012), INVALID(2010) |
| 2020-2021 | Logger | BUFFER_FULL(2021) |
| 2030-2032 | Storage | INIT_FAILED(2030) |
| 2500-2506 | Subzone | ASSIGN_FAILED(2500), GPIO_CONFLICT(2501) |

### Communication (3000-3999)

| Range | Kategorie | Häufigste |
|-------|-----------|-----------|
| 3001-3005 | WiFi | CONNECT_FAILED(3003), TIMEOUT(3002), NO_SSID(3005) |
| 3010-3016 | MQTT | CONNECT_FAILED(3011), BUFFER_FULL(3015), PAYLOAD_INVALID(3016) |
| 3020-3023 | HTTP | TIMEOUT(3023) |
| 3030-3032 | Network | UNREACHABLE(3030), DNS_FAILED(3031) |

### Application (4000-4999)

| Range | Kategorie | Häufigste |
|-------|-----------|-----------|
| 4001-4003 | State Machine | INVALID_TRANSITION(4002), STUCK(4003) |
| 4010-4012 | Operation | TIMEOUT(4010), FAILED(4011) |
| 4020-4022 | Command | INVALID(4020), PARSE_FAILED(4021) |
| 4030-4032 | Payload | INVALID(4030), TOO_LARGE(4031) |
| 4040-4042 | Memory | FULL(4040), ALLOCATION(4041) |
| 4050-4052 | System | INIT_FAILED(4050), SAFE_MODE(4052) |
| 4060-4062 | Task | FAILED(4060), QUEUE_FULL(4062) |
| 4070-4072 | Watchdog | WDT_TIMEOUT(4070), FEED_BLOCKED(4071) |
| 4200-4202 | Approval | DEVICE_REJECTED(4200), APPROVAL_TIMEOUT(4201), APPROVAL_REVOKED(4202) |

---

## 6. Error-Meldung an Server

Topic: `kaiser/{kaiser_id}/esp/{esp_id}/system/error` (QoS 1)

```json
{
  "error_code": 1002,
  "severity": "error",
  "message": "GPIO 21 conflict",
  "timestamp": 1707158400
}
```

### Severity-Mapping

| Level | Bedeutung | Aktion |
|-------|-----------|--------|
| `info` | Informational | Dokumentieren |
| `warning` | Degraded aber funktional | Beobachten |
| `error` | Feature nicht verfügbar | Untersuchen |
| `critical` | System-Level Problem | Sofort handeln |

---

## 7. Circuit Breaker auf ESP32

| Breaker | Modul | Threshold | Recovery | Half-Open |
|---------|-------|-----------|----------|-----------|
| MQTT | mqtt_client.cpp | 5 failures | 30s | 10s |
| WiFi | wifi_manager.cpp | 10 failures | 60s | - |

### Serial-Output bei CB-Events

```
[MQTT] Circuit Breaker: CLOSED → OPEN (5 failures)
[MQTT] Circuit Breaker: OPEN → HALF_OPEN (30s elapsed)
[MQTT] Circuit Breaker: HALF_OPEN → CLOSED (test success)
```

### CB-State Impact

| State | Reconnect-Verhalten | Watchdog-Feed |
|-------|---------------------|---------------|
| CLOSED | Normal (Backoff) | ✅ Erlaubt |
| OPEN | Blockiert (30s) | ⚠️ Mit Warning |
| HALF_OPEN | Sofort versuchen | ✅ Erlaubt |

---

## 8. Log-Location & Analyse

### Primäre Quelle

`logs/current/esp32_serial.log`

- Format: Plain Text mit Prefix-Tags `[MQTT]`, `[WiFi]`, `[GPIO]`, etc.
- Capture via: Session-Script `start_session.sh`
- Level: `[DEBUG]`, `[INFO]`, `[WARNING]`, `[ERROR]`, `[CRITICAL]`

### Grep-Patterns

```bash
# Boot-Probleme
grep -iE "boot|safe.mode|factory.reset" esp32_serial.log

# GPIO-Konflikte
grep -iE "gpio|pin|conflict|1001|1002" esp32_serial.log

# MQTT-Connectivity
grep "\[MQTT\]" esp32_serial.log

# WiFi-Probleme
grep "\[WiFi\]" esp32_serial.log

# Error-Codes (4-stellig)
grep -E "error.code.*[0-9]{4}|Error [0-9]{4}" esp32_serial.log

# Watchdog
grep -iE "watchdog|wdt|4070|4071" esp32_serial.log

# Circuit Breaker
grep -iE "circuit|breaker" esp32_serial.log

# Provisioning
grep -iE "provisioning|ap.mode|portal" esp32_serial.log
```

---

## 9. Diagnose-Workflows

### ESP bootet nicht

```
1. Serial Monitor prüfen → Wo stoppt der Output?
2. Boot-Banner vorhanden? → Ja: Hardware OK, Nein: Flash korrupt
3. SafeMode-Message? → Welcher Trigger? (Boot-Loop, Inconsistent, WiFi-Fail)
4. Boot-Loop? → Counter in NVS prüfen (>5 in <60s)
5. LED-Blink-Pattern? → 3×=Provision, 4×=AP-Mode, 5×=WiFi
```

### Sensor liefert keine Daten

```
1. Sensor konfiguriert? → NVS sensors_config
2. GPIO korrekt? → Kein Conflict (1002)?
3. Hardware OK? → READ_FAILED (1040)?
4. Bus initialisiert? → I2C(1010)/OneWire(1020)
5. MQTT connected? → Circuit Breaker Status
6. Topic korrekt? → sensor/{gpio}/data
```

### ESP geht offline

```
1. WiFi stabil? → grep [WiFi] in Serial
2. MQTT Circuit Breaker? → OPEN state?
3. Watchdog? → 4070 im Serial
4. Power-Problem? → Heap/Stack Overflow?
5. Boot-Loop? → 5× in <60s
```

### Actuator reagiert nicht

```
1. Actuator konfiguriert? → NVS actuators_config
2. GPIO reserviert? → gpioManager.requestPin() erfolgt?
3. MQTT Command empfangen? → Serial-Log prüfen
4. SafetyController blockiert? → Emergency-Stop aktiv?
5. Command-Payload gültig? → 4030 PAYLOAD_INVALID?
```

---

## 10. Cross-Layer Weiterleitung

| ESP32-Symptom | Weiterleiten an | Grund |
|---------------|-----------------|-------|
| MQTT publish failed trotz WiFi OK | `mqtt-debug` | Broker-Level Problem |
| Config push kommt nicht an | `server-debug` | Server-Handler Problem |
| Sensor-Daten nicht im Frontend | `frontend-debug` | WebSocket/Pinia Problem |
| Daten nicht in DB obwohl Server empfängt | `db-inspector` | Persistence Problem |

---

## 11. Referenzen

| Wann | Datei | Zweck |
|------|-------|-------|
| **IMMER zuerst** | `logs/current/STATUS.md` | Session-Kontext, erwartete Patterns |
| **IMMER** | `logs/current/esp32_serial.log` | Analyse-Quelle |
| Bei Error-Codes | `.claude/reference/errors/ERROR_CODES.md` | Code-Interpretation |
| Bei MQTT-Topics | `.claude/reference/api/MQTT_TOPICS.md` | Topic-Schema |
| Bei Boot/Flows | `.claude/reference/patterns/COMMUNICATION_FLOWS.md` | Boot-Sequenzen |
| Bei Firmware-Details | `.claude/skills/esp32-development/SKILL.md` | Code-Locations |

---

## 12. Report-Template

```markdown
# ESP32 Debug Report

**Session:** [aus STATUS.md]
**Modus:** [BOOT/CONFIG/SENSOR/ACTUATOR/E2E]
**Erstellt:** [Datum Uhrzeit]
**Log-Quelle:** `logs/current/esp32_serial.log`

---

## Zusammenfassung

| Prüfpunkt | Status | Timestamp | Details |
|-----------|--------|-----------|---------|
| Boot-Banner | ✅/❌ | [ms] | [Firmware-Version] |
| WiFi-Verbindung | ✅/❌ | [ms] | [IP oder Fehler] |
| MQTT-Verbindung | ✅/❌ | [ms] | [OK oder rc=X] |
| Registration | ✅/❌ | [ms] | [Bestätigt/Timeout] |
| [Modus-spezifisch] | ✅/❌ | [ms] | [...] |

**Gesamtstatus:** ✅ Erfolgreich / ⚠️ Mit Warnings / ❌ Fehlgeschlagen

---

## Errors & Warnings

### [ERROR] Einträge

| # | Timestamp | Code | Kategorie | Message |
|---|-----------|------|-----------|---------|
| 1 | [ms] | [code] | [HARDWARE/SERVICE/COMM/APP] | [message] |

### [WARNING] Einträge

| # | Timestamp | Message | Bewertung |
|---|-----------|---------|-----------|
| 1 | [ms] | [message] | [Kritisch/Akzeptabel] |

---

## Findings

### Finding 1: [Titel]

**Log-Zeilen:**
```
[relevante Zeilen aus dem Log]
```

**Analyse:** [Was bedeutet das?]

**Empfehlung:** [Was tun?]

---

## Nächste Schritte

1. [ ] [Empfehlung basierend auf Findings]
2. [ ] [Weitere Empfehlung]
```

---

## Regeln

1. **Log-Warte-Verhalten:** Wenn `esp32_serial.log` fehlt oder leer → STOPPE und melde
2. **Dokumentations-Pflicht:** JEDER `[ERROR]` und `[CRITICAL]` Eintrag MUSS dokumentiert werden
3. **Pattern-Quelle:** NUTZE Patterns aus STATUS.md (vom Session-Script generiert)
4. **Abgrenzung:** ANALYSIERE NUR `esp32_serial.log`, nicht Server- oder MQTT-Logs

---

*Kompakter Skill für ESP32-Debug. Details in ERROR_CODES.md und esp32-development SKILL.md*
