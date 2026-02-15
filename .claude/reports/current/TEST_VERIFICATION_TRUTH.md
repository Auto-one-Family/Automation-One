# Test-Engine Verifizierung - Single Source of Truth

**Version:** 1.1
**Datum:** 2026-02-06
**Methode:** Direkte Datei-Analyse via Glob, Bash, Read - keine Übernahme aus vorherigen Reports
**Auftrag:** Auftrag 9 (Plan Mode)

---

## Executive Summary

Diese Analyse löst alle Widersprüche zwischen TEST_ENGINE_AUDIT.md und Wokwi-Review auf. Alle Zahlen wurden durch direktes Zählen der Dateien verifiziert.

| Datenpunkt | TEST_ENGINE_AUDIT | Wokwi-Review | **VERIFIZIERT** |
|------------|-------------------|--------------|-----------------|
| Wokwi Gesamt-Szenarien | 163 | 182 | **163** |
| CI-aktive Szenarien | 32 | 32 | **~135** (nach Skip-Filter) |
| 08-stress | 10 | - | **EXISTIERT NICHT** |
| 08-onewire | - | 29 | **29 (korrekt)** |
| 09-regression | 18 | - | **EXISTIERT NICHT** |
| 09-hardware | - | 9 | **9 (korrekt)** |
| Frontend Test-Dateien | 4 | - | **10** (5 Unit + 5 E2E) |
| Backend E2E Dateien | 2 | - | **6** |
| Backend Gesamt | 105 | - | **124** |

---

## 1. Wokwi-Szenarien (VERIFIZIERT)

### 1.1 Ordner-Struktur (exakt)

**Methode:** `ls -la "El Trabajante/tests/wokwi/scenarios/"` + Bash-Loop pro Ordner

| Ordner | YAML-Dateien | Geprüft am | Bemerkung |
|--------|--------------|------------|-----------|
| 01-boot | 2 | 2026-02-06 | boot_full, boot_safe_mode |
| 02-sensor | 5 | 2026-02-06 | heartbeat, ds18b20_read, analog_flow, dht22_full_flow, ds18b20_full_flow |
| 03-actuator | 7 | 2026-02-06 | led_on, pwm, status_publish, emergency_clear, binary_full_flow, pwm_full_flow, timeout_e2e |
| 04-zone | 2 | 2026-02-06 | zone_assignment, subzone_assignment |
| 05-emergency | 3 | 2026-02-06 | broadcast, esp_stop, stop_full_flow |
| 06-config | 2 | 2026-02-06 | sensor_add, actuator_add |
| 07-combined | 2 | 2026-02-06 | combined_sensor_actuator, multi_device_parallel |
| **08-i2c** | **20** | 2026-02-06 | **NICHT in ACTIVE_CATEGORIES - Stufe 4** |
| 08-onewire | 29 | 2026-02-06 | Stufe 1 - Quick Wins |
| 09-hardware | 9 | 2026-02-06 | Stufe 1 - Quick Wins |
| 09-pwm | 18 | 2026-02-06 | Stufe 2 - 15 passive, 3 skip |
| 10-nvs | 40 | 2026-02-06 | Stufe 2 - 35 CI-fähig, 5 skip |
| gpio | 24 | 2026-02-06 | Stufe 2 - kein numerisches Präfix! |
| **GESAMT** | **163** | 2026-02-06 | Stimmt mit TEST_ENGINE_AUDIT überein |

### 1.2 Namensdiskrepanz AUFGELÖST

| Behauptetes Ordner | TEST_ENGINE_AUDIT | Wokwi-Review | **REALITÄT** |
|--------------------|-------------------|--------------|--------------|
| 08-stress | 10 Szenarien | - | **EXISTIERT NICHT** |
| 08-i2c | - | - | **20 Szenarien (existiert)** |
| 08-onewire | - | 29 | **29 Szenarien (existiert)** |
| 09-regression | 18 Szenarien | - | **EXISTIERT NICHT** |
| 09-hardware | - | 9 | **9 Szenarien (existiert)** |
| 09-pwm | - | - | **18 Szenarien (existiert)** |

**Erklärung:** TEST_ENGINE_AUDIT hat falsche Ordnernamen verwendet. Es gibt ZWEI 08-* Ordner (08-i2c, 08-onewire) und ZWEI 09-* Ordner (09-hardware, 09-pwm).

### 1.3 CI-aktive Szenarien (exakt)

**Quelle:** `scripts/run-wokwi-tests.py` Zeile 48-64

```python
ACTIVE_CATEGORIES = [
    "01-boot",        # 2
    "02-sensor",      # 5
    "03-actuator",    # 7
    "04-zone",        # 2
    "05-emergency",   # 3
    "06-config",      # 2
    "07-combined",    # 2
    "08-onewire",     # 29 (Stufe 1)
    "09-hardware",    # 9  (Stufe 1)
    "09-pwm",         # 18 (Stufe 2)
    "10-nvs",         # 40 (Stufe 2)
    "gpio",           # 24 (Stufe 2)
]
# NICHT AKTIV: "08-i2c" (20 Szenarien) - Stufe 4 wegen Custom-Chip
```

### 1.4 Skip-Szenarien (exakt)

**Quelle:** `scripts/run-wokwi-tests.py` Zeile 68-83

| Kategorie | Skip-Szenarien | Grund |
|-----------|---------------|-------|
| 10-nvs | 5 | Persistence-Tests benötigen Reboot |
| 09-pwm | 3 | MQTT-Injection (pwm_duty_percent_50, pwm_e2e_dimmer, pwm_e2e_fan_control) |
| **TOTAL SKIP** | **8** | |

### 1.5 Finale Berechnung

```
Gesamt Szenarien:        163
- 08-i2c (nicht aktiv):  -20
- 10-nvs Skip:           -5
- 09-pwm Skip:           -3
================================
CI-AKTIV:                135 Szenarien
```

### 1.6 Korrektur der Dokumente

| Datenpunkt | TEST_ENGINE_AUDIT | Wokwi-Review | **VERIFIZIERT** |
|------------|-------------------|--------------|-----------------|
| Wokwi Gesamt | 163 | 182 | **163** (Audit korrekt) |
| "08-stress" | 10 | - | **0** (existiert nicht) |
| "09-regression" | 18 | - | **0** (existiert nicht) |
| 08-onewire | nicht gelistet | 29 | **29** (Review korrekt) |
| 09-hardware | nicht gelistet | 9 | **9** (Review korrekt) |
| 08-i2c | nicht gelistet | nicht gelistet | **20** (beide falsch) |
| gpio | nicht gelistet | 24 | **24** (Review korrekt) |

---

## 2. CI-Workflow Analyse (VERIFIZIERT)

### 2.1 Wokwi-Tests CI-Jobs

**Quelle:** `.github/workflows/wokwi-tests.yml`

| Job-Name | Szenarien | Kategorie | Timeout |
|----------|-----------|-----------|---------|
| build-firmware | 0 | - | 10min |
| boot-tests | 2 | 01-boot | 15min |
| sensor-tests | 2 | 02-sensor | 15min |
| mqtt-connection-test | 1 | legacy | 15min |
| actuator-tests | 4 | 03-actuator | 15min |
| zone-tests | 2 | 04-zone | 15min |
| emergency-tests | 2 | 05-emergency | 15min |
| config-tests | 2 | 06-config | 15min |
| sensor-flow-tests | 3 | 02-sensor (E2E) | 15min |
| actuator-flow-tests | 3 | 03-actuator (E2E) | 20min |
| combined-flow-tests | 3 | 05/07 | 20min |
| nvs-tests | 35 | 10-nvs (alle minus 5 skip) | 45min |
| gpio-extended-tests | 24 | gpio | 30min |
| pwm-extended-tests | 15 | 09-pwm (minus 3 skip) | 25min |
| onewire-tests | 29 | 08-onewire | 35min |
| hardware-tests | 9 | 09-hardware | 15min |
| test-summary | 0 | - | - |

**TOTAL in CI:** 17 Jobs, davon 15 Test-Jobs + build + summary

### 2.2 Makefile-Widerspruch AUFGELÖST

**Quelle:** `Makefile`

| Stelle | Behauptung | Realität |
|--------|------------|----------|
| Zeile 50 (Kommentar) | "32 CI scenarios" | **FALSCH** - veraltet |
| Zeile 210 (wokwi-test-full) | führt 24 Szenarien aus | **24 Kern-Szenarien** |
| Zeile 278 (wokwi-test-extended) | "~135 scenarios" | **KORREKT** |

**Erklärung:**
- `wokwi-test-full` = 24 Kern-Szenarien (01-boot bis 07-combined)
- `wokwi-test-extended` = ~135 Szenarien (alle ACTIVE_CATEGORIES minus Skips)
- Der Kommentar "32 CI scenarios" ist veraltet und sollte korrigiert werden

---

## 3. Frontend Tests (VERIFIZIERT)

### 3.1 Test-Dateien (exakt)

**Methode:** `Glob("El Frontend/tests/**/*.test.ts")` + `Glob("El Frontend/tests/**/*.spec.ts")`

| Datei | Pfad | Typ |
|-------|------|-----|
| formatters.test.ts | El Frontend/tests/unit/utils/ | Unit |
| auth.test.ts | El Frontend/tests/unit/stores/ | Unit |
| useToast.test.ts | El Frontend/tests/unit/composables/ | Unit |
| useWebSocket.test.ts | El Frontend/tests/unit/composables/ | Unit |
| esp.test.ts | El Frontend/tests/unit/stores/ | Unit |
| **UNIT TOTAL** | | **5 Dateien** |

| Datei | Pfad | Typ |
|-------|------|-----|
| auth.spec.ts | El Frontend/tests/e2e/scenarios/ | Playwright E2E |
| device-discovery.spec.ts | El Frontend/tests/e2e/scenarios/ | Playwright E2E |
| sensor-live.spec.ts | El Frontend/tests/e2e/scenarios/ | Playwright E2E |
| actuator.spec.ts | El Frontend/tests/e2e/scenarios/ | Playwright E2E |
| emergency.spec.ts | El Frontend/tests/e2e/scenarios/ | Playwright E2E |
| **E2E TOTAL** | | **5 Dateien** |

**FRONTEND GESAMT:** 10 Test-Dateien (5 Unit + 5 E2E)

### 3.2 Korrektur

| Dokument | Behauptung | **VERIFIZIERT** |
|----------|------------|-----------------|
| TEST_ENGINE_AUDIT | 4 | **10** |
| Phase 4 Verifikation | 3 | **10** |
| Playwright existiert? | "0 (noch nicht erstellt)" | **5 Dateien existieren!** |

---

## 4. Backend Tests (VERIFIZIERT)

### 4.1 Verzeichnis-Struktur

**Methode:** Glob + Sub-Agent Exploration

| Verzeichnis | Test-Dateien | conftest.py? |
|-------------|-------------|--------------|
| e2e/ | 6 | Ja |
| esp32/ | 24 | Ja |
| integration/ | 43 | Nein |
| unit/ | 51 | Ja |
| **GESAMT** | **124** | 4 conftest.py |

### 4.2 E2E-Tests (exakt)

| Datei | Pfad | test_ Funktionen |
|-------|------|------------------|
| test_actuator_alert_e2e.py | tests/e2e/ | 7 |
| test_actuator_direct_control.py | tests/e2e/ | 6 |
| test_logic_engine_real_server.py | tests/e2e/ | 12 |
| test_real_server_scenarios.py | tests/e2e/ | 11 |
| test_sensor_workflow.py | tests/e2e/ | 9 |
| test_websocket_events.py | tests/e2e/ | 7 |
| **E2E TOTAL** | | **6 Dateien, 52 Funktionen** |

### 4.3 Korrektur

| Dokument | Behauptung | **VERIFIZIERT** |
|----------|------------|-----------------|
| TEST_ENGINE_AUDIT (Gesamt) | 105 | **124** |
| Phase 4 Verifikation (Gesamt) | 114 | **124** |
| TEST_ENGINE_AUDIT (E2E) | 2 | **6** |
| Phase 4 Verifikation (E2E) | 5 | **6** |

**Erklärung für Diskrepanz:** Neue E2E-Dateien wurden seit den Reports hinzugefügt (Git Status zeigt `??` für neue untracked Dateien).

---

## 5. diagram.json Bauteile (VERIFIZIERT)

### 5.1 Alle Bauteile

**Quelle:** `El Trabajante/diagram.json`

| Part-ID | Typ | GPIO-Verbindung | Für welche Tests |
|---------|-----|-----------------|------------------|
| esp | wokwi-esp32-devkit-v1 | - | Alle |
| temp1 | wokwi-ds18b20 | GPIO 4 (DQ) | OneWire, Sensor-Tests |
| led1 | wokwi-led (green) | GPIO 5 | Actuator-Tests |
| dht22 | wokwi-dht22 | GPIO 15 (SDA) | Sensor-Tests |
| pot_analog | wokwi-potentiometer | GPIO 34 | Analog-Sensor-Tests |
| led_red | wokwi-led (red) | GPIO 13 | Actuator-Tests |
| led_blue | wokwi-led (blue) | GPIO 14 | Actuator-Tests |
| btn_emergency | wokwi-pushbutton (red) | GPIO 27 | Emergency-Tests |
| r1 | wokwi-resistor (4.7k) | Pullup für DS18B20 | - |
| r2, r_led_red, r_led_blue | wokwi-resistor (220) | LED Vorwiderstände | - |

**Fehlende Bauteile für 08-i2c:**
- BMP280 (I2C Sensor) - benötigt Custom-Chip
- SHT30 (I2C Sensor) - benötigt Custom-Chip

**Dies erklärt warum 08-i2c nicht in ACTIVE_CATEGORIES ist.**

---

## 6. MQTT-Injection in Wokwi (VERIFIZIERT)

### 6.1 Injection-Mechanismus

**Quelle:** Analyse von Szenario-YAML + CI-Workflow

1. **Szenario-YAML definiert NUR:**
   ```yaml
   steps:
     - wait-serial: "MQTT connected successfully"
     - wait-serial: "heartbeat"
     - wait-serial: "Actuator"
   ```

2. **CI-Workflow führt MQTT-Injection EXTERN aus:**
   ```bash
   # Wokwi im Hintergrund starten
   wokwi-cli . --timeout 90000 --scenario ... 2>&1 | tee test.log &
   WOKWI_PID=$!

   # Warten bis ESP32 bereit (25s)
   sleep 25

   # MQTT-Command injizieren
   docker exec mosquitto-${{ github.job }} mosquitto_pub \
     -t "kaiser/god/esp/ESP_00000001/actuator/5/command" \
     -m '{"command":"ON","value":1.0}'

   wait $WOKWI_PID
   ```

### 6.2 Datenfluss

```
Szenario-YAML (wait-serial Assertions)
  -> Python-Runner ODER CI-Workflow startet Wokwi
    -> MQTT-Broker: Docker Container (eclipse-mosquitto:2)
      -> Injection: mosquitto_pub via docker exec
        -> ESP32-Simulation empfängt über MQTT
          -> Assertion: Serial-Output wird auf wait-serial geprüft
```

---

## 7. Agent-Zugriff (VERIFIZIERT)

### 7.1 Agent-Fähigkeitsmatrix

**Quelle:** Direkte Analyse aller `.claude/agents/*.md` Dateien

| Agent | Bash | Tests starten | Wokwi-Logs | pytest | Reports |
|-------|:---:|:---:|:---:|:---:|:---:|
| esp32-debug | - | - | indirekt | - | Ja |
| esp32-dev | Ja | pio run | Ja | - | Ja |
| server-debug | - | - | - | - | Ja |
| server-dev | Ja | pytest | - | Ja | Ja |
| frontend-debug | - | - | - | - | Ja |
| frontend-dev | Ja | npm | - | - | Ja |
| mqtt-debug | - | - | - | - | Ja |
| mqtt-dev | Ja | beide | Ja | Ja | Ja |
| system-control | Ja | alle | Ja | Ja | Ja |
| system-manager | Ja | - | - | - | Ja |
| db-inspector | Ja | - | - | - | Ja |
| meta-analyst | - | - | - | - | Ja |

### 7.2 Zugriffs-Lücken

- **Debug-Agents:** Kein Bash-Zugriff, können nur Logs LESEN
- **Wokwi-Logs:** Nur esp32-dev, mqtt-dev, system-control können Wokwi starten/lesen
- **pytest:** Nur server-dev, mqtt-dev, system-control können pytest ausführen

---

## 8. Log-Infrastruktur (VERIFIZIERT)

### 8.1 Existierende Log-Pfade

**Methode:** `ls -la logs/` + Unterverzeichnisse

| Pfad | Existiert | Inhalt |
|------|:---------:|--------|
| logs/ | Ja | Root-Verzeichnis |
| logs/current/ | Ja | esp32_serial.log (~10 MB) |
| logs/archive/ | Ja | 30+ archivierte Sessions |
| logs/server/ | Ja | god_kaiser.log (7.4 MB) |
| logs/mqtt/ | Ja | mosquitto.log (227 KB) |
| logs/postgres/ | Ja | postgresql.log (1.1 MB) |
| logs/wokwi/ | Ja | **LEER** (nur .gitkeep) |
| logs/frontend/ | **NEIN** | **EXISTIERT NICHT** |

### 8.2 Test-Output Routing

| Suite | stdout | Datei | CI-Artifact | Agent-lesbar |
|-------|:---:|:---:|:---:|:---:|
| pytest (Server) | Ja | junit-*.xml | EnricoMi | Ja |
| vitest (Frontend) | Ja | junit-results.xml | EnricoMi | Ja |
| Playwright | Ja | HTML Report | 30 Tage | HTML |
| Wokwi | Ja | *.log | 7 Tage | Ja |

---

## 9. Makefile-Targets (VERIFIZIERT)

### 9.1 Wokwi-Test-Targets

**Quelle:** `Makefile` Zeile 188-282

| Target | Befehl | Szenarien | MQTT nötig |
|--------|--------|-----------|:---------:|
| wokwi-build | `pio run -e wokwi_simulation` | 0 | Nein |
| wokwi-test-boot | wokwi-cli boot_full.yaml | 1 | Ja |
| wokwi-test-quick | boot + heartbeat | 2 | Ja |
| wokwi-test-full | 24 Kern-Szenarien (hardcoded) | 24 | Ja |
| wokwi-test-runner | Python run-wokwi-tests.py | ACTIVE_CATEGORIES | Ja |
| wokwi-test-onewire | --category 08-onewire | 29 | Ja |
| wokwi-test-hardware | --category 09-hardware | 9 | Ja |
| wokwi-test-nvs-all | --category 10-nvs | 35 | Ja |
| wokwi-test-gpio-all | --category gpio | 24 | Ja |
| wokwi-test-pwm-all | --category 09-pwm | 15 | Ja |
| wokwi-test-extended | --parallel 4 (alle ACTIVE) | ~135 | Ja |

### 9.2 Korrektur nötig

| Stelle | Problem | Korrektur |
|--------|---------|-----------|
| Makefile Zeile 50 | Sagt "32 CI scenarios" | Sollte "24 core CI scenarios" sagen |

---

## 10. Referenz-Dokumente Cross-Check

### 10.1 SYSTEM_OPERATIONS_REFERENCE.md

| Stelle | Behauptung | Verifiziert | Korrektur |
|--------|------------|:-----------:|-----------|
| ~1404-1420 | "32 aktive CI-Tests" | NEIN | "24 Kern + ~111 Extended" |
| ~1308 | "Alle 24 CI-Szenarien" | JA | Korrekt für wokwi-test-full |

### 10.2 CI_PIPELINE.md

| Stelle | Behauptung | Verifiziert | Korrektur |
|--------|------------|:-----------:|-----------|
| Zeile 47 | "12 Jobs" für Wokwi | NEIN | Jetzt 17 Jobs |
| 135-148 | Job-Liste | FEHLT | Neue Jobs hinzufügen |

---

## 11. Offene Punkte

### 11.1 Nicht verifizierbar (ohne Netzwerk-Zugriff)

- [ ] `wokwi/wokwi-ci-server` auf Docker Hub (Self-Hosted Option)
- [ ] `wokwi/wokwi-ci-action@v1` auf GitHub (existiert die Action?)
- [ ] Letzter CI-Run Status (benötigt `gh run list`)

### 11.2 Noch zu klären

- [ ] Warum fehlt `logs/frontend/` Ordner?
- [ ] Warum sind 3 neue E2E-Dateien noch nicht committed?
- [ ] Wann wurde der Makefile-Kommentar "32 scenarios" geschrieben?

---

## 12. Empfohlene Report-Updates

### 12.1 TEST_ENGINE_AUDIT.md Korrekturen

| Section | Alter Wert | Korrekter Wert |
|---------|------------|----------------|
| Wokwi-Szenarien Tabelle | 08-stress: 10, 09-regression: 18 | Diese Ordner existieren NICHT |
| Wokwi-Szenarien Tabelle | fehlt: 08-i2c, 09-pwm | 08-i2c: 20, 09-pwm: 18 |
| Frontend Tests | 4 | 10 (5 Unit + 5 E2E) |
| Backend Gesamt | 105 | 124 |
| Backend E2E | 2 | 6 |

### 12.2 CI_PIPELINE.md Korrekturen

| Section | Alter Wert | Korrekter Wert |
|---------|------------|----------------|
| Wokwi Jobs | 12 | 17 (15 Test + build + summary) |
| Job-Liste | fehlt | nvs-tests, gpio-extended, pwm-extended, onewire-tests, hardware-tests |

### 12.3 Makefile Korrekturen

| Zeile | Korrektur |
|-------|-----------|
| 50 | "32 CI scenarios" -> "24 core CI scenarios (use wokwi-test-extended for ~135)" |

---

## 13. Zusammenfassung der Zahlen

### Test-Dateien (FINALE Zahlen)

| Komponente | Dateien | Test-Funktionen |
|------------|--------:|----------------:|
| **Backend Unit** | 51 | ~500+ |
| **Backend Integration** | 43 | ~300+ |
| **Backend ESP32** | 24 | ~150+ |
| **Backend E2E** | 6 | 52 |
| **Backend GESAMT** | **124** | ~1000+ |
| **Frontend Unit** | 5 | ~50+ |
| **Frontend E2E (Playwright)** | 5 | ~25+ |
| **Frontend GESAMT** | **10** | ~75+ |
| **Wokwi Szenarien** | **163** | - |
| **Wokwi CI-aktiv** | **~135** | - |

### CI-Jobs (FINALE Zahlen)

| Workflow | Jobs | Tests |
|----------|-----:|------:|
| server-tests.yml | 4 | Unit + Integration |
| esp32-tests.yml | 2 | ESP32 Mocks |
| frontend-tests.yml | 4 | Type-Check + Unit + Build |
| wokwi-tests.yml | 17 | ~135 Szenarien |
| playwright-tests.yml | 3 | 5 E2E Specs |
| **GESAMT** | **30** | |

---

*Erstellt: 2026-02-06 | Version: 1.1 | Methode: Direkte Datei-Analyse | Autor: Claude Code (Plan Mode)*
