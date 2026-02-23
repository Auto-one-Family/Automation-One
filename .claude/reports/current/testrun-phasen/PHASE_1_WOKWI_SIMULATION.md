# Phase 1: Wokwi-Simulation (SIL) stabilisieren

> **Voraussetzung:** [Phase 0](./PHASE_0_ERROR_TAXONOMIE.md) abgeschlossen (Error-Taxonomie + Test-Codes 6000-6099)
> **Parallel zu:** [Phase 2](./PHASE_2_PRODUKTIONSTESTFELD.md) (laeuft unabhaengig)
> **Nachfolger:** [Phase 4](./PHASE_4_INTEGRATION.md) (nach Phase 1+2+3)
> **Master-Plan:** [00_MASTER_PLAN.md](./00_MASTER_PLAN.md) Abschnitt "PHASE 1"

---

## Ziel

Wokwi-Szenarien als dauerhaft laufende Regressionstests. Error-Injection-Szenarien hinzufuegen. CI/CD voll automatisiert. Wokwi-Reports nutzen die gemeinsame Error-Taxonomie aus Phase 0.

---

## Ist-Zustand (verifiziert)

| Komponente | Status | Pfad |
|-----------|--------|------|
| Wokwi-Szenarien | 163 vorhanden | `El Trabajante/tests/wokwi/scenarios/` (13 Kategorien) |
| CI/CD Pipeline | Push + PR + Manual Dispatch | `.github/workflows/wokwi-tests.yml` |
| Pipeline-Jobs | 15 Jobs, 42 CI-Szenarien | Boot, Sensor, MQTT, Actuator, Zone, Emergency, Config, GPIO, I2C, NVS, PWM, Combined |
| HAL-Pattern | Implementiert | `El Trabajante/src/drivers/hal/igpio_hal.h` + `esp32_gpio_hal.h` |
| Native Unity Tests | 22 Tests, GRUEN | TopicBuilder (12) + GPIOManager (10) |
| Seed-Script | Vorhanden | `scripts/seed_wokwi_esp.py` |

**CI/CD Trigger (aktuell korrekt):**
```yaml
on:
  push:
    paths: ['El Trabajante/**', '.github/workflows/wokwi-tests.yml']
  pull_request:
    paths: ['El Trabajante/**', '.github/workflows/wokwi-tests.yml']
  workflow_dispatch:  # Manual
```

---

## Schritt 1.1: Error-Injection-Szenarien erstellen

### Motivation

Die bestehenden 163 Szenarien testen Normal-Betrieb. Fehler-Szenarien testen die Resilienz der Firmware. Diese nutzen die Error-Codes aus Phase 0.

### Neue Szenarien (Ordner: `tests/wokwi/scenarios/11-error-injection/`)

| # | Szenario-Datei | Fehlertyp | Erwarteter Error-Code | Verifikation |
|---|---------------|-----------|----------------------|-------------|
| 1 | `error_sensor_timeout.yaml` | Sensor-Read-Timeout simulieren | 1040 | Serial: `SENSOR_READ_FAILED` |
| 2 | `error_mqtt_disconnect.yaml` | MQTT-Verbindung trennen waehrend Betrieb | 3011 | Serial: `MQTT_CONNECT_FAILED` + Reconnect |
| 3 | `error_gpio_conflict.yaml` | Zwei Sensoren auf gleichem GPIO | 1002 | Serial: `GPIO_CONFLICT` |
| 4 | `error_watchdog_trigger.yaml` | Task blockiert → Watchdog greift | 4070 | Serial: `WATCHDOG_TIMEOUT` oder Safe-Mode |
| 5 | `error_config_invalid_json.yaml` | Ungueltige Config via MQTT senden | ConfigErrorCode (string) | Serial: `JSON_PARSE_ERROR` |

> **[VERIFY-PLAN] Error-Code-Korrekturen:**
> - Szenario 4: 3001 ist WIFI_INIT_FAILED, korrekt: 4070 (WATCHDOG_TIMEOUT)
> - Szenario 5: "3100+" existiert nicht. ESP32 Config-Errors sind string-basiert (ConfigErrorCode enum)
| 6 | `error_actuator_timeout.yaml` | Actuator-Timeout ueberschritten | 1050 | Serial: `ACTUATOR_SET_FAILED` oder Timeout |
| 7 | `error_emergency_cascade.yaml` | Emergency → Clear → Emergency rapid | 4000+ | Serial: Emergency-State korrekt |
| 8 | `error_i2c_bus_stuck.yaml` | I2C-Device antwortet nicht | 1014/1015 | Serial: `I2C_BUS_ERROR` + Recovery |
| 9 | `error_nvs_corrupt.yaml` | NVS-Read schlaegt fehl | 2001 | Serial: `NVS_INIT_FAILED` → Safe-Mode |
| 10 | `error_heap_pressure.yaml` | Viele Sensoren gleichzeitig konfigurieren | 4040 | Serial: `MEMORY_FULL` oder Heap-Warnung |

> **[VERIFY-PLAN] Szenario 10: 3002 ist WIFI_CONNECT_TIMEOUT, korrekt: 4040 (MEMORY_FULL)**

### Szenario-Format (Pattern beibehalten)

```yaml
# Pattern aus bestehenden Szenarien:
name: error_sensor_timeout
timeout: 90000
steps:
  - wait-serial: "Phase 5: Actuator System READY"
  - pause: 5000
  # Error-Injection hier
  - set-control:
      part: ...
      ...
  - wait-serial: "SENSOR_READ_FAILED"
  - wait-serial: "Error Code: 1040"
```

### Agent/Skill fuer Implementierung

**Skill:** `/esp32-development`
**Agent:** `esp32-dev`

Workflow:
1. Bestehende Szenarien analysieren (`tests/wokwi/scenarios/01-boot/boot_full.yaml` als Referenz)
2. Error-Injection-Mechanismen identifizieren (Wokwi Control-API)
3. Szenarien einzeln erstellen und lokal testen

### Verifikation

```bash
# Neue Szenarien zaehlen
ls -la "El Trabajante/tests/wokwi/scenarios/11-error-injection/" | wc -l

# Lokal testen (pro Szenario)
cd "El Trabajante" && wokwi-cli . --timeout 90000 --scenario tests/wokwi/scenarios/11-error-injection/error_sensor_timeout.yaml
```

---

## Schritt 1.2: CI/CD Pipeline erweitern

### Ist-Zustand

Die CI/CD Pipeline (`wokwi-tests.yml`) hat bereits Push/PR-Trigger. Was fehlt:

| Luecke | Loesung |
|--------|---------|
| Error-Injection-Jobs fehlen | Neuen Job `error-injection-tests` hinzufuegen |
| Nightly Full-Suite fehlt | `schedule: cron` Trigger ergaenzen |
| Test-Summary zaehlt nur 24 Szenarien | Auf 34+ aktualisieren |

### Neue CI/CD Erweiterungen

**A. Nightly-Run Trigger hinzufuegen:**

```yaml
on:
  push:
    paths: ['El Trabajante/**', '.github/workflows/wokwi-tests.yml']
  pull_request:
    paths: ['El Trabajante/**', '.github/workflows/wokwi-tests.yml']
  workflow_dispatch:
  schedule:
    - cron: '0 3 * * *'  # Nightly um 03:00 UTC
```

**B. Neuer Job: Error-Injection Tests:**

```yaml
  # JOB 16: Error-Injection Tests
  error-injection-tests:
    runs-on: ubuntu-latest
    needs: build-firmware
    timeout-minutes: 20
    steps:
      # ... Standard-Setup (Checkout, Download Firmware, Start Mosquitto, Install Wokwi CLI)
      - name: Run Error Injection Tests
        env:
          WOKWI_CLI_TOKEN: ${{ secrets.WOKWI_CLI_TOKEN }}
        run: |
          export PATH="$HOME/.wokwi/bin:$PATH"
          cd "El Trabajante"
          for scenario in tests/wokwi/scenarios/11-error-injection/*.yaml; do
            name=$(basename "$scenario" .yaml)
            echo "=== Running: $name ==="
            timeout 120 wokwi-cli . --timeout 90000 --scenario "$scenario" \
              2>&1 | tee "${name}.log" || true
          done
```

**C. Test-Summary aktualisieren:**

Die `test-summary` Job muss die neuen Error-Injection-Logs einbeziehen und den Test-Counter erhoehen.

### Agent/Skill fuer Implementierung

**Agent:** Hauptkontext (CI/CD YAML ist keine Agent-Aufgabe — direkte Datei-Bearbeitung)

**Datei:** `.github/workflows/wokwi-tests.yml`

### Verifikation

```bash
# YAML-Syntax validieren
python -c "import yaml; yaml.safe_load(open('.github/workflows/wokwi-tests.yml'))"

# Pipeline manuell triggern (nach Push)
gh workflow run "Wokwi ESP32 Tests"
```

---

## Schritt 1.3: Wokwi ↔ Error-Taxonomie Mapping

### Ziel

Wokwi-Test-Reports verwenden dieselben Error-Codes und Severity-Stufen wie der Produktions-Stack. Das ermoeglicht:
- `test-log-analyst` Agent kann beide Quellen analysieren
- Vergleichbare Reports zwischen Simulation und Produktion
- Gemeinsame Metriken in Phase 4 (Dashboard-Konsolidierung)

### Mapping-Tabelle

Erstelle eine Mapping-Datei die Error-Codes zu Wokwi-Szenarien zuordnet:

**Datei:** `.claude/reference/testing/WOKWI_ERROR_MAPPING.md`

| Error-Code | Wokwi-Szenario | Serial-Pattern | Severity |
|-----------|---------------|----------------|----------|
| 1040 | `error_sensor_timeout.yaml` | `SENSOR_READ_FAILED` | warning |

> **[VERIFY-PLAN] Mapping: 1001 ist GPIO_RESERVED, korrekt: 1040 (SENSOR_READ_FAILED)**
| 1002 | `error_gpio_conflict.yaml` | `GPIO_CONFLICT` | error |
| 1014 | `error_i2c_bus_stuck.yaml` | `I2C_BUS_ERROR` | warning |
| 1040 | `error_sensor_timeout.yaml` | `SENSOR_READ_FAILED` | warning |
| 1050 | `error_actuator_timeout.yaml` | `ACTUATOR_SET_FAILED` | warning |
| 2001 | `error_nvs_corrupt.yaml` | `NVS_INIT_FAILED` | error |
| 3011 | `error_mqtt_disconnect.yaml` | `MQTT_CONNECT_FAILED` | error |
| 6000 | (CI Timeout) | `WOKWI_TIMEOUT` | error |
| 6001 | `error_watchdog_trigger.yaml` | `BOOT_INCOMPLETE` | critical |
| 6010 | (Assertion in pytest) | `ASSERTION_FAILED` | error |

### Agent/Skill

**Skill:** `/updatedocs` (Referenz-Dok erstellen)

### Verifikation

```bash
# Mapping-Datei existiert und hat Eintraege
wc -l ".claude/reference/testing/WOKWI_ERROR_MAPPING.md"
```

---

## Schritt 1.4: Lokale Wokwi-Test-Optimierung

### Bekannte Einschraenkungen (aus MEMORY.md)

| Problem | Workaround |
|---------|-----------|
| Wokwi CLI schreibt keine Logs nativ | `--serial-log-file` Option oder `\| Tee-Object` (PowerShell) |
| `wokwi-cli run` existiert NICHT | Korrekt: `wokwi-cli . --timeout 90000` |
| MQTT "Connection reset by peer" lokal | 3 Voraussetzungen: kein lokaler Mosquitto, Docker Port published, Firewall offen |
| NVS NOT_FOUND bei frischem Start | ERWARTET — kein Bug |

### Makefile-Targets pruefen

**Bekannte Bugs (aus MEMORY.md):**
- `make wokwi-test-nvs` Echo sagt 35, tatsaechlich 40 Szenarien
- `make wokwi-test-pwm` Echo sagt 15, tatsaechlich 18
- `make wokwi-test-extended` Echo sagt ~135, tatsaechlich ~163
- `make wokwi-test-full` Echo sagt 23, tatsaechlich 22

**Aktion:** Makefile-Echos korrigieren

**Datei:** `Makefile` (Wokwi-Targets)

---

## Akzeptanzkriterien Phase 1

| # | Kriterium | Verifikation |
|---|-----------|-------------|
| 1 | 10 Error-Injection-Szenarien erstellt | `ls tests/wokwi/scenarios/11-error-injection/ \| wc -l` = 10 |
| 2 | CI/CD Pipeline hat Error-Injection-Job | `grep "error-injection" wokwi-tests.yml` findet Job |
| 3 | Nightly-Trigger konfiguriert | `grep "schedule" wokwi-tests.yml` findet cron |
| 4 | Wokwi-Error-Mapping Dokument existiert | `.claude/reference/testing/WOKWI_ERROR_MAPPING.md` vorhanden |
| 5 | Makefile-Echo-Bugs behoben | Tatsaechliche Szenarien-Anzahl == Echo-Zahl |
| 6 | Lokal: mindestens 1 Error-Injection-Szenario erfolgreich | `wokwi-cli . --scenario ...` gibt erwarteten Error-Code |
| 7 | CI/CD: Pipeline-Run erfolgreich | `gh run list --workflow=wokwi-tests.yml` zeigt gruenen Run |

---

## Uebergang zu Phase 4

Phase 1 liefert:
- Error-Injection-Szenarien mit Error-Code-Tagging
- CI/CD-Automatisierung mit Nightly-Runs
- Wokwi-Error-Mapping als Referenz

Dies wird in **[Phase 4: Integration](./PHASE_4_INTEGRATION.md)** verwendet fuer:
- Gemeinsame Error-Reports (Wokwi + Produktion)
- Test-Status-Dashboard in Grafana
- Feedback-Loop: Produktionsfehler → Wokwi-Regressionsszenario

---

## Agents & Skills (Zusammenfassung)

| Schritt | Agent/Skill | Aufgabe |
|---------|-------------|---------|
| 1.1 | `esp32-dev` / `/esp32-development` | Error-Injection-Szenarien erstellen |
| 1.2 | Hauptkontext | CI/CD Pipeline erweitern |
| 1.3 | `/updatedocs` | WOKWI_ERROR_MAPPING.md erstellen |
| 1.4 | Hauptkontext | Makefile-Bugs fixen |
| Ende | `/verify-plan` | Phase 1 gegen Codebase verifizieren |

---

## /verify-plan Ergebnis (Phase 1)

**Plan:** Error-Injection-Szenarien, CI/CD Nightly, Wokwi-Error-Mapping
**Geprueft:** 6 Pfade, 2 Agents, 1 Workflow, 10 Error-Codes

### Bestaetigt
- Wokwi-Szenarien: 13 Kategorien vorhanden ✅
- HAL-Pattern: igpio_hal.h + esp32_gpio_hal.h existieren ✅
- CI/CD Pipeline: wokwi-tests.yml hat Push/PR/Manual Trigger ✅
- Seed-Script: scripts/seed_wokwi_esp.py vorhanden ✅
- Makefile: wokwi-test-* Targets vorhanden ✅
- Agent-Referenzen (esp32-dev) korrekt ✅
- Ordner 11-error-injection existiert noch nicht (erwartet - wird erstellt) ✅

### Korrekturen noetig

**Error-Codes falsch:**
- Szenario 4: 3001 → korrekt 4070 (WATCHDOG_TIMEOUT) — korrigiert
- Szenario 5: "3100+" → existiert nicht, ESP32 nutzt string-basierte ConfigErrorCode — korrigiert
- Szenario 10: 3002 → korrekt 4040 (MEMORY_FULL) — korrigiert
- Mapping 1001 → korrekt 1040 (SENSOR_READ_FAILED) — korrigiert

### Fehlende Vorbedingungen
- [ ] Phase 0 abgeschlossen (Error-Taxonomie + Test-Codes 6000-6099)
- [ ] WOKWI_ERROR_MAPPING.md muss erstellt werden (existiert noch nicht)
- [ ] Makefile-Echo-Bugs muessen behoben werden

### Zusammenfassung
Plan ist strukturell korrekt. **4 Error-Code-Referenzen waren falsch — alle korrigiert.** Der Rest ist konsistent und ausfuehrbar nach Phase 0.
