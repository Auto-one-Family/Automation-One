# Phase 1: Wokwi-Simulation — Implementierungsbericht

> **Status:** IMPLEMENTIERT
> **Datum:** 2026-02-21
> **Agent:** Agent-Manager (Modus 2)
> **Abhaengigkeit:** Phase 0 (Error-Taxonomie) — VORAUSSETZUNG

---

## Zusammenfassung

Alle 4 Schritte der Phase 1 wurden implementiert:

| Schritt | Was | Status | Dateien |
|---------|-----|--------|---------|
| 1.1 | 10 Error-Injection-Szenarien | FERTIG | `El Trabajante/tests/wokwi/scenarios/11-error-injection/*.yaml` |
| 1.2 | CI/CD Pipeline erweitert | FERTIG | `.github/workflows/wokwi-tests.yml` |
| 1.3 | WOKWI_ERROR_MAPPING.md | FERTIG | `.claude/reference/testing/WOKWI_ERROR_MAPPING.md` |
| 1.4 | Makefile-Echo-Bug gefixt | FERTIG | `Makefile` |

---

## Gegenpruefungsergebnis (Codebase-Check)

### a) Wokwi-Szenarien
- **163 YAML-Szenarien** vorhanden (jetzt 173 mit Error-Injection)
- **14 Kategorien** (01-boot, 02-sensor, 03-actuator, 04-zone, 05-emergency, 06-config, 07-combined, 08-i2c, 09-pwm, 09-hardware, 10-nvs, gpio, **11-error-injection**)

### b) YAML-Pattern (verifiziert)
```yaml
name: <Szenario-Name>
version: 1
steps:
  - wait-serial: "<Exakter Serial-Text>"
  - delay: <ms>
  - set-control:
      part-id: "mqtt"
      control: "inject"
      value: |
        {
          "topic": "kaiser/god/esp/ESP_00000001/<path>",
          "payload": { ... }
        }
  - wait-serial: "<Error-Pattern>"
```

### c) Error-Codes (alle in error_codes.h verifiziert)

| Szenario | Code | Verifiziert |
|----------|------|-------------|
| 1: Sensor Timeout | 1040 SENSOR_READ_FAILED | error_codes.h Zeile 55 |
| 2: MQTT Disconnect | 3011 MQTT_CONNECT_FAILED | error_codes.h Zeile 112 |
| 3: GPIO Conflict | 1002 GPIO_CONFLICT | error_codes.h Zeile 18 |
| 4: Watchdog | 4070 WATCHDOG_TIMEOUT | error_codes.h Zeile 159 [VERIFY-PLAN] |
| 5: Invalid JSON | ConfigErrorCode::JSON_PARSE_ERROR | error_codes.h Zeile 174 [VERIFY-PLAN] |
| 6: Actuator Timeout | 1050 ACTUATOR_SET_FAILED | error_codes.h Zeile 60 |
| 7: Emergency Cascade | 4001+ (STATE_INVALID) | error_codes.h Zeile 131 |
| 8: I2C Bus Stuck | 1014 I2C_BUS_ERROR | error_codes.h Zeile 28 |
| 9: NVS Corrupt | 2001 NVS_INIT_FAILED | error_codes.h Zeile 83 |
| 10: Heap Pressure | 4040 MEMORY_FULL | error_codes.h Zeile 146 [VERIFY-PLAN] |

---

## Schritt 1.1: Error-Injection-Szenarien (FERTIG)

**Ordner:** `El Trabajante/tests/wokwi/scenarios/11-error-injection/`

| # | Datei | Fehlertyp | Error-Code | Serial-Pattern |
|---|-------|-----------|------------|---------------|
| 1 | `error_sensor_timeout.yaml` | Sensor ohne physisches Device | 1040 | SENSOR_READ_FAILED |
| 2 | `error_mqtt_disconnect.yaml` | MQTT-Betrieb validieren | 3011 | Published, heartbeat |
| 3 | `error_gpio_conflict.yaml` | Zwei Sensoren gleicher GPIO | 1002 | conflict |
| 4 | `error_watchdog_trigger.yaml` | System-Stress mit vielen Devices | 4070 | heartbeat |
| 5 | `error_config_invalid_json.yaml` | Malformed JSON via MQTT | ConfigErrorCode | JSON_PARSE_ERROR |
| 6 | `error_actuator_timeout.yaml` | Actuator mit kurzem Timeout | 1050 | timeout |
| 7 | `error_emergency_cascade.yaml` | Emergency-Clear-Emergency rapid | 4000+ | EMERGENCY-STOP, de-energized |
| 8 | `error_i2c_bus_stuck.yaml` | I2C an nicht-existenter Adresse | 1014/1015 | I2C |
| 9 | `error_nvs_corrupt.yaml` | Factory-Reset via MQTT | 2001 | NVS |
| 10 | `error_heap_pressure.yaml` | 8 Sensoren + 6 Aktuatoren | 4040 | heartbeat |

**[VERIFY-PLAN] Korrekturen eingearbeitet:**
- Szenario 4: 4070 (WATCHDOG_TIMEOUT), NICHT 3001
- Szenario 5: ConfigErrorCode (string-basiert), NICHT 3100+
- Szenario 10: 4040 (MEMORY_FULL), NICHT 3002

---

## Schritt 1.2: CI/CD Pipeline (FERTIG)

**Datei:** `.github/workflows/wokwi-tests.yml`

### Aenderungen:
1. **Nightly-Trigger:** `schedule: cron '0 3 * * *'` (03:00 UTC)
2. **Neuer Job:** `error-injection-tests` (JOB 16) — iteriert ueber alle `11-error-injection/*.yaml`
3. **test-summary erweitert:** `error-injection-tests` in `needs`, Coverage-Tabelle von 24 auf 34
4. **Error-Injection-Logs:** In Summary-Tabelle aufgenommen (10 Tests)
5. **Header-Kommentar:** 42 scenarios -> 52 scenarios, 15 jobs -> 16 jobs
6. **YAML validiert:** `python -c "import yaml; ..."` erfolgreich

### CI/CD Trigger (jetzt):
```yaml
on:
  push:
    paths: ['El Trabajante/**', '.github/workflows/wokwi-tests.yml']
  pull_request:
    paths: ['El Trabajante/**', '.github/workflows/wokwi-tests.yml']
  workflow_dispatch:
  schedule:
    - cron: '0 3 * * *'
```

---

## Schritt 1.3: WOKWI_ERROR_MAPPING.md (FERTIG)

**Datei:** `.claude/reference/testing/WOKWI_ERROR_MAPPING.md`

Enthalt:
- Vollstaendige Mapping-Tabelle: Error-Code -> Szenario -> Serial-Pattern -> Severity
- Test-Infrastruktur-Codes (6000-6099) Referenz
- Severity-Stufen Dokumentation
- Nutzungshinweise fuer test-log-analyst Agent

---

## Schritt 1.4: Makefile-Echo-Bug (FERTIG)

**Datei:** `Makefile`

| Zeile | Vorher | Nachher |
|-------|--------|---------|
| 68 (help) | `(23 tests)` | `(22 tests)` |
| 242 (wokwi-test-full) | `(22 tests)` | Bereits korrekt |

---

## Akzeptanzkriterien

| # | Kriterium | Status | Verifikation |
|---|-----------|--------|-------------|
| 1 | 10 Error-Injection-Szenarien erstellt | ERFUELLT | `ls 11-error-injection/*.yaml` = 10 Dateien |
| 2 | CI/CD Pipeline hat Error-Injection-Job | ERFUELLT | `grep error-injection wokwi-tests.yml` |
| 3 | Nightly-Trigger konfiguriert | ERFUELLT | `grep schedule wokwi-tests.yml` |
| 4 | WOKWI_ERROR_MAPPING.md existiert | ERFUELLT | Datei in `.claude/reference/testing/` |
| 5 | Makefile-Echo-Bugs behoben | ERFUELLT | help zeigt 22 |
| 6 | Lokal 1 Szenario OK | OFFEN | Manuell: `wokwi-cli . --scenario .../error_sensor_timeout.yaml` |
| 7 | CI/CD Pipeline gruen | OFFEN | Nach Push: `gh run list --workflow=wokwi-tests.yml` |

---

## Naechste Schritte

- **Lokal testen:** Mindestens `error_sensor_timeout.yaml` mit Wokwi CLI ausfuehren
- **Push + CI:** Pipeline triggern und gruenen Run verifizieren
- **Phase 4 Vorbereitung:** Error-Injection-Ergebnisse in Dashboard-Konsolidierung einplanen
- **Feedback-Loop:** Produktionsfehler als neue Wokwi-Szenarien zurueckfuehren

---

## Geaenderte Dateien (komplett)

| Datei | Aenderungstyp |
|-------|---------------|
| `El Trabajante/tests/wokwi/scenarios/11-error-injection/error_sensor_timeout.yaml` | NEU |
| `El Trabajante/tests/wokwi/scenarios/11-error-injection/error_mqtt_disconnect.yaml` | NEU |
| `El Trabajante/tests/wokwi/scenarios/11-error-injection/error_gpio_conflict.yaml` | NEU |
| `El Trabajante/tests/wokwi/scenarios/11-error-injection/error_watchdog_trigger.yaml` | NEU |
| `El Trabajante/tests/wokwi/scenarios/11-error-injection/error_config_invalid_json.yaml` | NEU |
| `El Trabajante/tests/wokwi/scenarios/11-error-injection/error_actuator_timeout.yaml` | NEU |
| `El Trabajante/tests/wokwi/scenarios/11-error-injection/error_emergency_cascade.yaml` | NEU |
| `El Trabajante/tests/wokwi/scenarios/11-error-injection/error_i2c_bus_stuck.yaml` | NEU |
| `El Trabajante/tests/wokwi/scenarios/11-error-injection/error_nvs_corrupt.yaml` | NEU |
| `El Trabajante/tests/wokwi/scenarios/11-error-injection/error_heap_pressure.yaml` | NEU |
| `.github/workflows/wokwi-tests.yml` | GEAENDERT (Nightly + Job 16 + Summary) |
| `.claude/reference/testing/WOKWI_ERROR_MAPPING.md` | NEU |
| `Makefile` | GEAENDERT (Echo-Bug Zeile 68) |
