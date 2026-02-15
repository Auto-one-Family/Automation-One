# Wokwi CI-Expansion – Entwicklerbefehle v3 (Verifiziert)

**Datum**: 2026-02-06  
**Projekt**: AutomationOne Framework – "El Trabajante"  
**Wokwi-Plan**: Hobby (200 min/Monat, Self-Hosted NICHT verfügbar)  
**Verifiziert gegen**: Aktuellen System-Stand (27 Pfade, 12 Kategorien)

---

## Was bereits implementiert ist (ÜBERSPRINGEN)

| Phase | Was | Status |
|-------|-----|--------|
| 0.3 | MQTT-Traffic Capture + Serial pro Szenario | ✅ erledigt |
| 0.6 | Makefile-Targets (wokwi-ensure-mqtt, wokwi-status, etc.) | ✅ erledigt |
| 1.1 | ACTIVE_CATEGORIES: 08-onewire, 09-hardware + CI-Jobs + Makefile | ✅ erledigt |
| 2.1 | ACTIVE_CATEGORIES: 09-pwm, 10-nvs, gpio + SKIP_SCENARIOS + CI-Jobs + Makefile | ✅ erledigt |

**Korrigierte Zahlen** (verifiziert):
- 09-pwm: **18 Szenarien** (nicht 15 wie im alten Plan)
- Aktive Szenarien gesamt: ~135 (nicht ~142)

---

## Verbleibende Arbeit – Reihenfolge

| # | Befehl | Priorität | Abhängig von |
|---|--------|-----------|-------------|
| 0.1 | Budget prüfen (manuell) | 🔴 Sofort | - |
| 0.2 | Tiered CI-Triggering | 🔴 BLOCKER | 0.1 |
| 0.4 | Core-Jobs 01-07 → Python-Runner | 🟡 Hoch | 0.2 |
| 0.5 | Dokumentation ERWEITERN | 🟢 Normal | 0.4 |
| 3.1 | PWM MQTT-Injection aktivieren | 🟢 Normal | 0.4 |
| 3.2 | Kat. 01-07 Szenario-Evaluation | 🟢 Normal | 0.4 |
| 3.3 | Retry-Logik + JUnit XML | 🟡 Hoch | 0.4 |
| 4.1 | BMP280 Custom-Chip + I2C komplett | 🟢 Optional | 3.3 |
| 5.1 | Konsistenz-Check + Integrationstest | 🟢 Final | alle |

---

## Budget-Realität (aktueller Stand)

```
KRITISCH: Ohne Tiered Triggering verbraucht JEDER Push ~50-60 min!
Das sind nur ~3-4 Runs/Monat mit dem Hobby-Plan (200 min).

         Aktuell (OHNE Tiered)          Nach Phase 0.2 (MIT Tiered)
         ─────────────────────          ───────────────────────────
Push:    ALLE ~135 Szenarien (~50 min)  Quick-Check (~5 min, Boot+Sensor)
PR:      ALLE ~135 Szenarien (~50 min)  Full-Run (~50 min, alle Kategorien)
Manual:  N/A                            Scope wählbar

Runs/Mo: ~3-4 (Budget sofort erschöpft) ~20-30 Quick + 2-3 Full
```

---

## Phase 0.1 – Budget prüfen (MANUELL)

```
MANUELLER SCHRITT – Kein Agent-Befehl.

1. Öffne https://wokwi.com/ci im Browser
2. Logge dich mit dem Account ein, zu dem der WOKWI_CLI_TOKEN gehört
3. Prüfe:
   - Hobby-Plan aktiv? (erwartet)
   - Wieviel Simulationszeit ist diesen Monat noch übrig?
   - Wieviel wurde diesen Monat bereits verbraucht?

WICHTIG: Bis Phase 0.2 implementiert ist, jeden unnötigen Push vermeiden!
Jeder CI-Run verbraucht aktuell ~50-60 min (kein Tiered Triggering).

ERGEBNIS NOTIEREN: ___________________________
```

---

## Phase 0.2 – Tiered CI-Triggering (KRITISCHER BLOCKER)

```
@esp32-dev (Edit Mode)

## Kontext

KRITISCHER BLOCKER: Aktuell laufen bei JEDEM Push ALLE ~135 Szenarien 
(~50-60 min). Mit dem Hobby-Plan (200 min/Monat) sind das nur ~3-4 Runs.
Die Tiered-CI-Strategie reduziert Push-Runs auf ~5 min (Quick-Check) 
und reserviert Full-Runs für PRs und manuelle Dispatches.

Die Extended-Kategorien (08-onewire, 09-hardware, 09-pwm, 10-nvs, gpio) 
sind bereits in ACTIVE_CATEGORIES und haben CI-Jobs – aber ohne Tiered 
Triggering laufen sie bei JEDEM Push mit.

## Vorbereitung

Lies und analysiere ZUERST:
- .github/workflows/wokwi-tests.yml (KOMPLETT – verstehe die aktuelle 
  Trigger-Section, alle Jobs, deren Dependencies, und Concurrency-Settings)
- docs/wokwi-self-hosted-evaluation.md (Budget-Kontext, Self-Hosted=Nein)

Identifiziere:
- Wie wird der Workflow aktuell getriggert? (push? PR? paths?)
- Gibt es bereits path-Filter?
- Gibt es bereits workflow_dispatch Input-Parameter?
- Welche Jobs existieren und wie hängen sie zusammen (needs:)?
- Welcher Job ist test-summary und was steht in dessen needs-Array?

Erstelle dir eine mentale Zuordnung aller Jobs zu Tiers:
  QUICK (bei jedem Push):  boot-tests, sensor-tests
  CORE (bei PR + manual):  actuator-tests, zone-tests, emergency-tests, 
                            config-tests, sensor-flow-tests, actuator-flow-tests, 
                            combined-flow-tests
  EXTENDED (bei PR + manual): onewire-tests, hardware-tests, nvs-tests, 
                               gpio-tests, pwm-tests

## Aufgabe

In .github/workflows/wokwi-tests.yml:

### 1. Trigger-Section ersetzen

ERSETZE die aktuelle `on:` Section durch:

```yaml
on:
  push:
    branches: [master, main, develop, 'feature/**']
    paths:
      - 'El Trabajante/**'
      - 'tests/wokwi/**'
      - 'scripts/run-wokwi-tests.py'
      - '.github/workflows/wokwi-tests.yml'
  pull_request:
    branches: [master, main]
    paths:
      - 'El Trabajante/**'
      - 'tests/wokwi/**'
  workflow_dispatch:
    inputs:
      test_scope:
        description: 'Test scope to run'
        required: true
        default: 'full'
        type: choice
        options:
          - quick
          - core
          - full
          - category
      test_category:
        description: 'Category for scope=category (z.B. 08-onewire)'
        required: false
        type: string
```

### 2. Concurrency einfügen (verhindert parallele Runs, spart Budget)

Füge direkt nach der `on:` Section hinzu:
```yaml
concurrency:
  group: wokwi-${{ github.ref }}
  cancel-in-progress: true
```

### 3. Budget-Kommentar am Anfang des Workflows

```yaml
# =================================================================
# Wokwi Budget: Hobby-Plan (200 min/Monat)
# Self-Hosted: NICHT verfügbar (Enterprise-only)
#
# Tiered CI-Triggering:
#   Push (auto):          scope=quick  (~5 min,  01-boot + 02-sensor)
#   PR auf master (auto): scope=full   (~50 min, alle Kategorien)
#   Manual dispatch:       scope=wählbar (quick/core/full/category)
#
# Budget-Schätzung: ~20-30 Quick-Checks + 2-3 Full-Runs pro Monat
# =================================================================
```

### 4. Scope-Detection Job (NACH build-firmware einfügen)

```yaml
determine-scope:
  runs-on: ubuntu-latest
  outputs:
    scope: ${{ steps.scope.outputs.scope }}
    run_quick: ${{ steps.categories.outputs.run_quick }}
    run_core: ${{ steps.categories.outputs.run_core }}
    run_extended: ${{ steps.categories.outputs.run_extended }}
  steps:
    - name: Determine test scope
      id: scope
      run: |
        if [ "${{ github.event_name }}" = "workflow_dispatch" ]; then
          SCOPE="${{ github.event.inputs.test_scope }}"
        elif [ "${{ github.event_name }}" = "pull_request" ]; then
          SCOPE="full"
        else
          SCOPE="quick"
        fi
        echo "scope=$SCOPE" >> $GITHUB_OUTPUT
        echo "📋 Test scope: $SCOPE"
    
    - name: Set category flags
      id: categories
      run: |
        SCOPE="${{ steps.scope.outputs.scope }}"
        
        # Quick: immer (Boot + Sensor)
        echo "run_quick=true" >> $GITHUB_OUTPUT
        
        # Core: bei core, full, oder category
        if [ "$SCOPE" = "core" ] || [ "$SCOPE" = "full" ] || [ "$SCOPE" = "category" ]; then
          echo "run_core=true" >> $GITHUB_OUTPUT
        else
          echo "run_core=false" >> $GITHUB_OUTPUT
        fi
        
        # Extended: nur bei full oder category
        if [ "$SCOPE" = "full" ] || [ "$SCOPE" = "category" ]; then
          echo "run_extended=true" >> $GITHUB_OUTPUT
        else
          echo "run_extended=false" >> $GITHUB_OUTPUT
        fi
        
        echo "📊 Quick: true | Core: $([ "$SCOPE" = "core" ] || [ "$SCOPE" = "full" ] && echo true || echo false) | Extended: $([ "$SCOPE" = "full" ] && echo true || echo false)"
```

### 5. Bedingte Job-Ausführung

Füge jedem Test-Job das passende `if:` Conditional und `determine-scope` 
in `needs:` hinzu:

**QUICK-Tier** (boot-tests, sensor-tests):
```yaml
if: needs.determine-scope.outputs.run_quick == 'true'
needs: [build-firmware, determine-scope]
```

**CORE-Tier** (actuator-tests, zone-tests, emergency-tests, config-tests,
sensor-flow-tests, actuator-flow-tests, combined-flow-tests):
```yaml
if: needs.determine-scope.outputs.run_core == 'true'
needs: [build-firmware, determine-scope]
```

**EXTENDED-Tier** (onewire-tests, hardware-tests, nvs-tests, gpio-tests, 
pwm-tests):
```yaml
if: needs.determine-scope.outputs.run_extended == 'true'
needs: [build-firmware, determine-scope]
```

### 6. test-summary Job anpassen

Der test-summary Job muss mit übersprungenen Jobs umgehen können.
Ersetze das `needs:` Array durch alle Jobs UND füge `if: always()` hinzu:

```yaml
test-summary:
  runs-on: ubuntu-latest
  if: always()
  needs: [determine-scope, boot-tests, sensor-tests, actuator-tests, 
          zone-tests, emergency-tests, config-tests, sensor-flow-tests,
          actuator-flow-tests, combined-flow-tests, onewire-tests, 
          hardware-tests, nvs-tests, gpio-tests, pwm-tests]
```

Im Summary-Step: Prüfe den Scope und zeige nur relevante Job-Ergebnisse:
```yaml
- name: Test Summary
  run: |
    echo "## 📊 Wokwi Test Summary" >> $GITHUB_STEP_SUMMARY
    echo "**Scope:** ${{ needs.determine-scope.outputs.scope }}" >> $GITHUB_STEP_SUMMARY
    echo "" >> $GITHUB_STEP_SUMMARY
    # ... bestehende Summary-Logik, ergänzt um Scope-Info
```

WICHTIG:
- build-firmware Job NICHT ändern (kein Conditional, läuft immer)
- Bestehende Job-Logik (Steps, Artifacts) NICHT ändern
- Nur `if:`, `needs:`, und die Trigger-Section werden geändert
- Falls ein Job bereits `needs: [build-firmware]` hat, erweitere auf 
  `needs: [build-firmware, determine-scope]`
- Teste mental: Push auf feature-Branch → nur boot-tests + sensor-tests
  PR auf master → alle Jobs

Dateien zu bearbeiten:
- .github/workflows/wokwi-tests.yml
```

---

## Phase 0.4 – Core-Jobs 01-07 auf Python-Runner umstellen

```
@esp32-dev (Edit Mode)

## Kontext

Die Core-Jobs (01-07) nutzen noch rohe wokwi-cli for-loops mit `|| true` 
die Fehler verschlucken. Die Extended-Jobs (08+) nutzen bereits den 
Python-Runner. Jetzt müssen die Core-Jobs nachgezogen werden.

Betrifft diese Jobs (verifiziert noch auf for-loops):
- boot-tests
- sensor-tests
- actuator-tests
- zone-tests
- emergency-tests
- config-tests
- sensor-flow-tests
- actuator-flow-tests
- combined-flow-tests

Der Python-Runner hat BEREITS: async/parallel Execution, JSON-Reports, 
korrekte Exit-Codes, MQTT-Capture, Serial-pro-Szenario, Skip-Listen, 
Timeout-Mapping.

## Vorbereitung

Lies und verstehe ZUERST:
- .github/workflows/wokwi-tests.yml (KOMPLETT – finde jeden der 9 Jobs,
  verstehe deren aktuelle for-loop-Struktur)
- scripts/run-wokwi-tests.py (CLI-Argumente, ACTIVE_CATEGORIES – 
  prüfe dass alle Kategorien 01-07 enthalten sind)

Für JEDEN der 9 Jobs identifiziere:
- Welche Szenarien werden explizit aufgerufen?
- Welche Kategorie entspricht dem Job? (Mapping unten)
- Nutzt der Job MQTT? (Docker-Mosquitto Start-Step vorhanden?)
- Hat der Job bereits das Tiered-Trigger `if:` aus Phase 0.2?

Job → Kategorie Mapping:
  boot-tests          → --category 01-boot         (QUICK-Tier)
  sensor-tests        → --category 02-sensor        (QUICK-Tier)
  actuator-tests      → --category 03-actuator      (CORE-Tier)
  zone-tests          → --category 04-zone          (CORE-Tier)
  emergency-tests     → --category 05-emergency     (CORE-Tier)
  config-tests        → --category 06-config        (CORE-Tier)
  sensor-flow-tests   → --category 02-sensor        (CORE-Tier, prüfe ob eigene Kategorie)
  actuator-flow-tests → --category 03-actuator      (CORE-Tier, prüfe ob eigene Kategorie)
  combined-flow-tests → --category 07-combined       (CORE-Tier)

ACHTUNG: sensor-flow-tests und actuator-flow-tests könnten Szenarien 
aus der gleichen Kategorie wie sensor-tests bzw. actuator-tests sein.
PRÜFE ob sie eigene Szenario-Ordner haben oder ob der Python-Runner 
sie bereits über die Hauptkategorie abdeckt. Falls Duplikate → 
Jobs zusammenlegen oder einen entfernen.

## Aufgabe

In .github/workflows/wokwi-tests.yml:

1. Für JEDEN der 9 Jobs:

   ERSETZE den gesamten Test-Run-Step (for-loop + || true + tee) durch:
   ```yaml
   - name: Run Tests
     env:
       WOKWI_CLI_TOKEN: ${{ secrets.WOKWI_CLI_TOKEN }}
     run: |
       export PATH="$HOME/.wokwi/bin:$PATH"
       python scripts/run-wokwi-tests.py \
         --category $CATEGORY \
         --parallel 2 \
         --verbose
   ```
   
   Wobei $CATEGORY der jeweilige Kategorie-Name aus dem Mapping ist.

2. Artifact-Upload Steps in jedem Job vereinheitlichen:
   ```yaml
   - name: Upload Serial Logs
     if: always()
     uses: actions/upload-artifact@v4
     with:
       name: wokwi-serial-${{ github.job }}
       path: logs/wokwi/serial/
       retention-days: 7
       if-no-files-found: ignore
   
   - name: Upload MQTT Logs
     if: always()
     uses: actions/upload-artifact@v4
     with:
       name: wokwi-mqtt-${{ github.job }}
       path: logs/wokwi/mqtt/
       retention-days: 7
       if-no-files-found: ignore
   
   - name: Upload Test Report
     if: always()
     uses: actions/upload-artifact@v4
     with:
       name: wokwi-report-${{ github.job }}
       path: logs/wokwi/reports/
       retention-days: 7
       if-no-files-found: ignore
   ```

3. ENTFERNE aus allen umgestellten Jobs:
   - Alle manuellen for-loops über Szenario-Dateien
   - Alle `|| true` Suffixe
   - Alle manuellen `tee` Pipes

4. BEIBEHALTEN in allen Jobs:
   - Wokwi CLI Installation Step
   - Firmware-Download Step
   - Docker-Mosquitto-Start-Steps (wo MQTT gebraucht wird)
   - Die `if:` Conditionals aus Phase 0.2 (Tiered Triggering)
   - Die `needs:` mit determine-scope

5. Duplikate prüfen:
   Falls sensor-flow-tests die gleiche Kategorie 02-sensor nutzt wie 
   sensor-tests → zusammenlegen oder sensor-flow-tests entfernen
   (der Python-Runner führt ALLE Szenarien der Kategorie aus).
   Gleiches für actuator-flow-tests vs. actuator-tests.

WICHTIG:
- ACTIVE_CATEGORIES enthält bereits 01-boot bis 07-combined (verifiziert)
- Der Python-Runner braucht Python 3.8+ (auf ubuntu-latest vorhanden)
- Falls Jobs zusammengelegt werden: test-summary needs-Array anpassen

Dateien zu bearbeiten:
- .github/workflows/wokwi-tests.yml
```

---

## Phase 0.5 – Dokumentation ERWEITERN (nicht neu schreiben)

```
@esp32-dev (Edit Mode)

## Kontext

Section 5.3 in SYSTEM_OPERATIONS_REFERENCE existiert bereits mit Token-Setup, 
CLI-Befehle, Makefile-Targets und Troubleshooting. Sie muss nur um die 
neuen Features erweitert werden: Retry-Logik, JUnit XML, Budget-Hinweis, 
Tiered CI-Triggering.

Die Agent-Docs und LOG_LOCATIONS brauchen ebenfalls Ergänzungen für 
Wokwi-spezifische Informationen (falls noch nicht vorhanden).

## Vorbereitung

Lies ZUERST den aktuellen Stand dieser Dateien:
- .claude/reference/testing/SYSTEM_OPERATIONS_REFERENCE.md (Section 5.3 – 
  was steht schon drin? Was fehlt?)
- .claude/agents/esp32-debug.md (gibt es schon einen "Wokwi Simulation Mode"?)
- .claude/agents/meta-analyst.md (gibt es schon Wokwi als Datenquelle?)
- .claude/reference/debugging/LOG_LOCATIONS.md (gibt es schon Wokwi-Pfade?)

Vergleiche den IST-Stand mit dem SOLL:

### SOLL in Section 5.3 (ergänze was FEHLT):
- [ ] Token-Setup (vermutlich schon da)
- [ ] CLI-Befehle (vermutlich schon da)
- [ ] Python Test-Runner mit --retries und --no-retry
- [ ] Makefile-Targets (vermutlich schon da)
- [ ] Budget-Hinweis: Hobby 200 min/Monat, Tiered CI-Triggering
- [ ] Tiered Triggering Erklärung: quick/core/full Scopes
- [ ] workflow_dispatch Nutzung
- [ ] JUnit XML Report-Pfad
- [ ] Troubleshooting (vermutlich schon da)
- [ ] Bekannte Limitationen (vermutlich schon da)

### SOLL in esp32-debug.md:
- [ ] Wokwi Simulation Mode Abschnitt mit Limitation-Adjustments

### SOLL in meta-analyst.md:
- [ ] Wokwi Simulation Logs als Datenquelle

### SOLL in LOG_LOCATIONS.md:
- [ ] Wokwi Log-Pfade Tabelle

## Aufgabe

Für JEDE der 4 Dateien:
1. Lies den aktuellen Inhalt
2. Identifiziere was FEHLT (vs. SOLL-Liste oben)
3. ERGÄNZE nur das Fehlende – bestehenden Inhalt NICHT überschreiben

### Teil A: Section 5.3 erweitern

Ergänze NUR die fehlenden Punkte. Wahrscheinlich fehlen:

1. Budget-Hinweis:
   ```
   #### Budget (Hobby-Plan)
   - 200 CI-Minuten/Monat, Self-Hosted nicht verfügbar
   - Tiered CI-Triggering aktiv:
     - Push: scope=quick (~5 min, 01-boot + 02-sensor)
     - PR auf master: scope=full (~50 min, alle Kategorien)
     - Manual: workflow_dispatch mit wählbarem Scope
   - Lokales Testen vor Push empfohlen: `make wokwi-test-boot`
   ```

2. Retry-Logik Dokumentation:
   ```
   # Mit Retry (default: 2 Retries)
   python scripts/run-wokwi-tests.py --category 01-boot --verbose
   
   # Ohne Retry (für Debugging)
   python scripts/run-wokwi-tests.py --category 01-boot --no-retry
   
   # Custom Retries
   python scripts/run-wokwi-tests.py --retries 3
   ```

3. JUnit XML:
   ```
   JUnit Reports: `logs/wokwi/reports/junit_{timestamp}.xml`
   Wird automatisch generiert und in GitHub Actions als Test-Report angezeigt.
   ```

### Teil B, C, D: Agent-Docs + LOG_LOCATIONS

Prüfe ob die Wokwi-Ergänzungen schon existieren. Falls nicht:

esp32-debug.md – "Wokwi Simulation Mode":
- DS18B20=22.5°C konstant, SHT31 fehlt, BMP280 Custom-Chip nötig
- PWM nicht physisch messbar, NVS keine Persistence, WiFi via Gateway
- Erkennung: Log-Pfad enthält `logs/wokwi/`

meta-analyst.md – Wokwi als Datenquelle:
- Serial/MQTT/Report Pfade, CI Artifacts, Cross-Layer Korrelation

LOG_LOCATIONS.md – Wokwi Pfade:
- logs/wokwi/serial/{kat}/{szenario}.log
- logs/wokwi/mqtt/{kat}/{szenario}.log
- logs/wokwi/reports/test_report_{ts}.json + junit_{ts}.xml

Dateien zu bearbeiten (NUR wo Ergänzungen nötig):
- .claude/reference/testing/SYSTEM_OPERATIONS_REFERENCE.md
- .claude/agents/esp32-debug.md
- .claude/agents/meta-analyst.md
- .claude/reference/debugging/LOG_LOCATIONS.md
```

---

## Phase 3.1 – PWM MQTT-Injection Szenarien prüfen und aktivieren

```
@esp32-dev (Edit Mode)

## Kontext

3 PWM-Szenarien sind in SKIP_SCENARIOS (verifiziert): pwm_duty_percent_50, 
pwm_duty_percent_100, pwm_e2e_dimmer. Wokwi unterstützt MQTT-Injection 
nativ über set-control in YAML.

## Vorbereitung

Lies ZUERST:
- tests/wokwi/scenarios/09-pwm/pwm_duty_percent_50.yaml
- tests/wokwi/scenarios/09-pwm/pwm_duty_percent_100.yaml
- tests/wokwi/scenarios/09-pwm/pwm_e2e_dimmer.yaml
- Mindestens 2-3 funktionierende MQTT-Szenarien in 
  tests/wokwi/scenarios/03-actuator/ als Referenz für set-control Format

Für jede der 3 Dateien prüfe:
a) Enthält sie bereits set-control Steps mit part-id: "mqtt"?
b) Oder fehlt die MQTT-Injection komplett?
c) Was erwartet das Szenario als Serial Output nach der Injection?

## Aufgabe

1. FALL A – set-control Steps bereits vorhanden:
   → Entferne die 3 aus SKIP_SCENARIOS in run-wokwi-tests.py
   → Fertig

2. FALL B – Keine set-control Steps, aber Szenarien erwarten MQTT:
   → Ergänze die fehlenden set-control Steps in den YAML-Dateien
   → Nutze das exakte Format aus den funktionierenden 03-actuator Szenarien
   → MQTT-Topic: kaiser/god/esp/ESP_00000001/actuator/{gpio}/command
   → Payload: {"command": "PWM", "value": 0.0-1.0}
   → Danach: Entferne aus SKIP_SCENARIOS

3. FALL C – Szenarien grundlegend anders strukturiert:
   → Dokumentiere was gefunden wurde, erstelle keinen Workaround

Dateien zu prüfen/bearbeiten:
- tests/wokwi/scenarios/09-pwm/pwm_duty_percent_50.yaml
- tests/wokwi/scenarios/09-pwm/pwm_duty_percent_100.yaml
- tests/wokwi/scenarios/09-pwm/pwm_e2e_dimmer.yaml
- scripts/run-wokwi-tests.py (SKIP_SCENARIOS)
```

---

## Phase 3.2 – Nicht-aktive Szenarien in Kategorien 01-07 evaluieren

```
@esp32-dev (Plan Mode)

## Kontext

Kategorien 01-07 haben zusammen ~135 Szenarien. Davon liefen bisher nur 
~26 in CI (19%). Seit die Core-Jobs den Python-Runner nutzen (Phase 0.4), 
werden automatisch ALLE Szenarien einer Kategorie ausgeführt. Die Frage 
ist ob das sicher ist oder ob manche in SKIP_SCENARIOS müssen.

BUDGET-HINWEIS: Mehr aktive Szenarien in 01-boot oder 02-sensor erhöhen 
den Quick-Check (~5 min aktuell). Prüfe den Impact.

## Vorbereitung

Lies ZUERST:
- Alle .yaml Dateien in tests/wokwi/scenarios/01-boot/ bis 07-combined/
- .github/workflows/wokwi-tests.yml (die alten for-loop-Versionen 
  im git log, um zu sehen welche Szenarien vorher explizit liefen)
- scripts/run-wokwi-tests.py (SKIP_SCENARIOS aktueller Stand)

## Aufgabe

1. Vergleiche für jede Kategorie 01-07:
   a) Alle .yaml Dateien im Szenario-Ordner
   b) Szenarien die vor der Python-Runner-Umstellung explizit in CI liefen

2. Für jede NICHT vorher aktive Szenario-Datei prüfe:
   - Braucht es MQTT? (enthält set-control mit part-id: "mqtt")
   - Spezielle Hardware-Anforderungen?
   - Timeout angemessen?
   - Dateiname enthält "experimental", "wip", "draft"?

3. Erstelle `docs/wokwi-scenario-evaluation.md`:
   
   | Szenario | Kategorie | MQTT? | Vorher in CI? | Empfehlung |
   |----------|-----------|-------|---------------|-----------|

4. Zusammenfassung mit Budget-Impact:
   - Wie viele sofort aktivierbar?
   - Welche brauchen Fixes?
   - Welche permanent skippen?
   - Quick-Check-Zeit-Änderung (01-boot + 02-sensor)?
   - Full-Run-Zeit-Änderung?

WICHTIG: Plan Mode – keine Code-Änderungen.

Output:
- docs/wokwi-scenario-evaluation.md
```

---

## Phase 3.3 – Retry-Logik + JUnit XML im Python-Runner

```
@esp32-dev (Edit Mode)

## Kontext

Wokwi-Tests können durch Netzwerk-Timeouts oder Timing-Probleme 
fehlschlagen. Bei nur ~3-4 vollen Runs/Monat (Hobby-Plan) ist jeder 
verschwendete Run teuer. Retry-Logik reduziert Flaky-Failures.
JUnit XML ermöglicht native GitHub Actions Test-Reporting (PR-Checks).

## Vorbereitung

Lies ZUERST:
- scripts/run-wokwi-tests.py (KOMPLETT – verstehe die gesamte Pipeline: 
  Szenario-Discovery → Execution → Reporting)
- .github/workflows/wokwi-tests.yml (test-summary Job)

Identifiziere:
- Die exakte Funktion die ein einzelnes Szenario ausführt
- Wie der Exit-Code von wokwi-cli verarbeitet wird
- Wie der JSON-Report am Ende generiert wird
- Wo CLI-Argumente geparst werden (argparse)
- Gibt es bereits Retry-Ansätze oder JUnit-Code?

## Aufgabe

### Teil A: Retry-Logik

In scripts/run-wokwi-tests.py:

1. Neue Konfigurationskonstanten:
   ```python
   MAX_RETRIES = 2           # 3 Versuche gesamt
   RETRY_DELAY_SECONDS = 5
   RETRY_ON_EXIT_CODES = {42, 1}  # 42=Wokwi Timeout, 1=allg. Fehler
   ```

2. Neue CLI-Argumente:
   --retries N (default: 2)
   --no-retry (disable für Debugging)

3. Wrapper-Funktion um die bestehende Szenario-Ausführung:
   - Erfolg: sofort zurück (mit Log wenn Retry nötig war)
   - Fehler + Retries übrig: warte RETRY_DELAY_SECONDS, wiederhole
   - Fehler + keine Retries: letztes Ergebnis zurück

4. Im JSON-Report pro Szenario ergänzen:
   - "attempts": Anzahl Versuche
   - "retried": true/false

5. Summary-Ausgabe:
   - "X scenarios passed (Y on retry)"
   - "Z scenarios failed after N retries"

### Teil B: JUnit XML Output

In scripts/run-wokwi-tests.py:

1. Neue Funktion `generate_junit_xml(results, output_path)`:
   - Nur xml.etree.ElementTree (stdlib, keine Dependencies)
   - Gruppiert nach Kategorie → testsuite Elements
   - Pro Szenario: testcase mit name, classname, time
   - Fehler: failure Element mit Exit-Code + Log-Tail (5000 Zeichen)
   - Skip: skipped Element mit Grund

2. Aufruf am Ende (neben JSON-Report):
   ```python
   junit_path = f"logs/wokwi/reports/junit_{timestamp}.xml"
   generate_junit_xml(all_results, junit_path)
   ```

### Teil C: GitHub Actions Test Reporter

In .github/workflows/wokwi-tests.yml im test-summary Job:

```yaml
- name: Download all reports
  uses: actions/download-artifact@v4
  with:
    pattern: wokwi-report-*
    merge-multiple: true
    path: reports/

- name: Publish Test Results
  if: always()
  uses: dorny/test-reporter@v1
  with:
    name: Wokwi Test Results
    path: 'reports/**/junit_*.xml'
    reporter: java-junit
    fail-on-error: false
```

Prüfe ob der Workflow `permissions: checks: write` hat (braucht dorny).
Falls nicht, ergänze:
```yaml
permissions:
  checks: write
  contents: read
```

Dateien zu bearbeiten:
- scripts/run-wokwi-tests.py
- .github/workflows/wokwi-tests.yml (test-summary Job + permissions)
```

---

## Phase 4.1 – BMP280 Custom-Chip + I2C komplett

```
@esp32-dev (Edit Mode)

## Kontext

Die 20 Szenarien in 08-i2c/ brauchen einen BMP280 auf dem I2C-Bus. 
Wokwi hat keinen nativen BMP280 → Custom-Chip über die Chips API. 
wokwi-cli kompiliert .chip.c automatisch zu WebAssembly.

VORBEDINGUNG: `El Trabajante/chips/` und `El Trabajante/diagrams/` 
existieren noch NICHT – müssen erstellt werden.

Budget-Impact: +20 Szenarien → ~155 total. I2C-Tests laufen nur im 
scope=full (Extended-Tier). Quick-Check bleibt unverändert.

## Vorbereitung

Lies ZUERST:
- https://docs.wokwi.com/chips-api/getting-started (Chips API)
- https://docs.wokwi.com/chips-api/i2c (I2C API)
- El Trabajante/wokwi.toml (bestehende Konfiguration)
- El Trabajante/diagram.json (ESP32 Pin-Layout, bestehende Bauteile)
- El Trabajante/platformio.ini (welche BMP280-Library? Adafruit? Bosch?)
- tests/wokwi/scenarios/08-i2c/ (2-3 Dateien öffnen – erwartete Outputs)
- scripts/run-wokwi-tests.py (gibt es bereits CATEGORY_DIAGRAM oder 
  einen --diagram-file Mechanismus?)

Referenz-Projekt: https://wokwi.com/projects/394841903979791361

## Aufgabe

### Teil A: Verzeichnisse und Custom-Chip

1. Erstelle Verzeichnisse:
   ```bash
   mkdir -p "El Trabajante/chips/bmp280"
   mkdir -p "El Trabajante/diagrams"
   ```

2. Erstelle `El Trabajante/chips/bmp280/bmp280.chip.json`:
   - Name: "BMP280 Pressure/Temperature Sensor"
   - Author: "AutomationOne"
   - Pins: VCC, GND, SCL, SDA
   - I2C Adresse: 118 (0x76)
   - Controls: temperature (-40..85, default 22.5), 
     pressure (300..1100, default 1013.25)

3. Erstelle `El Trabajante/chips/bmp280/bmp280.chip.c`:
   - #include "wokwi-api.h"
   - I2C-Device auf 0x76, Callbacks: connect, read, write, disconnect
   - Register-Map: 
     0xD0=Chip-ID (0x58), 0xF3=Status (0x00), 
     0xF4=ctrl_meas, 0xF5=config,
     0xF7-0xF9=Pressure (20-bit), 0xFA-0xFC=Temperature (20-bit),
     0x88-0x9F=Kalibrationsdaten
   - attr_init für temperature/pressure Controls
   - Kalibrationsdaten mathematisch konsistent mit der BMP280-Library

### Teil B: I2C Diagramm

1. Erstelle `El Trabajante/diagrams/diagram_i2c.json`:
   - Kopiere diagram.json als Basis
   - Füge hinzu: type "chip-bmp280", id "bmp280"
   - Verbindungen: VCC→3V3, GND→GND.1, SDA→GPIO21, SCL→GPIO22

2. Erweitere `El Trabajante/wokwi.toml`:
   ```toml
   [[chip]]
   name = 'bmp280'
   binary = 'chips/bmp280/bmp280.chip.wasm'
   ```

### Teil C: Python-Runner erweitern

In scripts/run-wokwi-tests.py:

1. ACTIVE_CATEGORIES:
   ```python
   "08-i2c",  # 20 Szenarien, Custom-Chip + diagram_i2c.json
   ```

2. CATEGORY_DIAGRAM Dict (neu oder bestehenden Mechanismus erweitern):
   ```python
   CATEGORY_DIAGRAM = {
       "08-i2c": "diagrams/diagram_i2c.json",
   }
   ```
   In der wokwi-cli Aufruf-Funktion: --diagram-file Flag hinzufügen 
   wenn Kategorie in CATEGORY_DIAGRAM.

3. CATEGORY_TIMEOUTS:
   ```python
   "08-i2c": {"default": 90000, "i2c_full_flow_bmp280": 120000},
   ```

### Teil D: CI-Job + Makefile

In .github/workflows/wokwi-tests.yml:

Neuer Job `i2c-tests`:
- --category 08-i2c, timeout-minutes: 25
- Setup-Steps vom Pattern der bestehenden Extended-Jobs
- Tiered: `if: needs.determine-scope.outputs.run_extended == 'true'`
- test-summary needs erweitern

Im Makefile:
```makefile
wokwi-test-i2c: wokwi-build
	@echo "🔌 Running 08-i2c tests (20 Szenarien, Custom-Chip)..."
	python scripts/run-wokwi-tests.py --category 08-i2c --verbose
```

Dateien zu erstellen:
- El Trabajante/chips/bmp280/bmp280.chip.json
- El Trabajante/chips/bmp280/bmp280.chip.c
- El Trabajante/diagrams/diagram_i2c.json

Dateien zu bearbeiten:
- El Trabajante/wokwi.toml
- scripts/run-wokwi-tests.py
- .github/workflows/wokwi-tests.yml
- Makefile
```

---

## Phase 5.1 – Konsistenz-Check + Integrationstest

```
@esp32-dev (Edit Mode)

## Kontext

Alle Phasen abgeschlossen. Konsistenz prüfen, Tiered Triggering 
verifizieren, finalen Status dokumentieren.

## Vorbereitung

Lies ZUERST:
- .github/workflows/wokwi-tests.yml (KOMPLETT)
- docker/mosquitto/mosquitto.conf
- .github/mosquitto/mosquitto.conf
- scripts/run-wokwi-tests.py (finaler Stand)
- Makefile (alle wokwi-* Targets)

## Aufgabe

### Teil A: Konsistenz

1. MQTT-Broker Config vereinheitlichen:
   - Vergleiche docker/mosquitto/ mit .github/mosquitto/
   - Falls Unterschiede: eine Config, beide Pfade zeigen darauf

2. Rohe wokwi-cli Aufrufe finden und eliminieren:
   - `grep -n "wokwi-cli" .github/workflows/wokwi-tests.yml`
   - Alles muss über Python-Runner laufen

3. Tiered-Trigger verifizieren:
   - ALLE Quick-Tier Jobs haben `run_quick == 'true'`?
   - ALLE Core-Tier Jobs haben `run_core == 'true'`?
   - ALLE Extended-Tier Jobs haben `run_extended == 'true'`?
   - test-summary mit `if: always()` und allen Jobs in needs?
   - determine-scope Job vorhanden und korrekt?

### Teil B: Integrationstest

```bash
make wokwi-status
make wokwi-list
make wokwi-test-boot
make wokwi-test-onewire
make wokwi-test-hardware
make wokwi-test-nvs-all
make wokwi-test-gpio-all
make wokwi-test-pwm-all
make wokwi-test-i2c       # falls Phase 4.1 fertig
```

Reports prüfen:
- logs/wokwi/reports/test_report_*.json
- logs/wokwi/reports/junit_*.xml
- logs/wokwi/serial/*/
- logs/wokwi/mqtt/*/

### Teil C: Status dokumentieren

Erstelle `docs/wokwi-ci-status.md`:

| Metrik | Wert |
|--------|------|
| Szenarien gesamt | X |
| Szenarien in CI (full scope) | Y |
| Szenarien in CI (quick scope) | Z |
| Szenarien geskippt | N (mit Gründen) |
| CI-Coverage (full) | Y/X (%) |
| Quick-Check-Zeit | ~N min |
| Full-Run-Zeit | ~N min |
| Wokwi-Plan | Hobby (200 min/Monat) |
| Self-Hosted | Nein (Enterprise-only) |
| Quick-Checks/Monat | ~N |
| Full-Runs/Monat | ~N |
| Tiered Triggering | Aktiv (quick/core/full) |
| Retry-Logik | Aktiv (2 Retries) |
| JUnit XML | Aktiv (dorny/test-reporter) |
| Custom-Chips | BMP280 (I2C) |
| Letzte Aktualisierung | YYYY-MM-DD |

### Teil D: Bei Fehlern

- Flaky Tests → SKIP_SCENARIOS + "flaky, TODO: fix"
- Timeout → CATEGORY_TIMEOUTS anpassen
- MQTT → wokwi-ensure-mqtt prüfen
- Custom-Chip → chips/bmp280/ prüfen

Dateien zu prüfen/bearbeiten:
- docker/mosquitto/mosquitto.conf
- .github/mosquitto/mosquitto.conf
- .github/workflows/wokwi-tests.yml
- Makefile
- docs/wokwi-ci-status.md (NEU)
```

---

## Zusammenfassung

| # | Befehl | Status | Priorität |
|---|--------|--------|-----------|
| 0.1 | Budget prüfen (manuell) | ⏳ | 🔴 Sofort |
| **0.2** | **Tiered CI-Triggering** | **❌ FEHLT** | **🔴 BLOCKER** |
| 0.3 | MQTT-Capture + Serial/Szenario | ✅ erledigt | - |
| **0.4** | **Core-Jobs 01-07 → Python-Runner** | **⚠️ ausstehend** | **🟡 Hoch** |
| **0.5** | **Dokumentation erweitern** | **⚠️ teilweise** | **🟢 Normal** |
| 0.6 | Makefile-Targets | ✅ erledigt | - |
| 1.1 | OneWire + Hardware | ✅ erledigt | - |
| 2.1 | PWM + NVS + GPIO | ✅ erledigt | - |
| **3.1** | **PWM MQTT-Injection** | **⏳ ausstehend** | **🟢 Normal** |
| **3.2** | **Kat. 01-07 Evaluation** | **⏳ ausstehend** | **🟢 Normal** |
| **3.3** | **Retry + JUnit XML** | **⏳ ausstehend** | **🟡 Hoch** |
| **4.1** | **BMP280 + I2C komplett** | **⏳ ausstehend** | **🟢 Optional** |
| **5.1** | **Konsistenz + Integration** | **⏳ ausstehend** | **🟢 Final** |

**Nächste Schritte (in dieser Reihenfolge):**
1. ⏳ Phase 0.1 – Budget manuell prüfen
2. ❌ Phase 0.2 – Tiered CI-Triggering (KRITISCH)
3. ⚠️ Phase 0.4 – Core-Jobs umstellen
4. Dann: 3.3 → 0.5 → 3.1 → 3.2 → 4.1 → 5.1