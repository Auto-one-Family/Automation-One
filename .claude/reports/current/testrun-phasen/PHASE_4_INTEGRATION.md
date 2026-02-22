# Phase 4: Integration — Beide Spuren verbinden

> **Voraussetzung:** [Phase 1](./PHASE_1_WOKWI_SIMULATION.md) + [Phase 2](./PHASE_2_PRODUKTIONSTESTFELD.md) + [Phase 3](./PHASE_3_KI_ERROR_ANALYSE.md) abgeschlossen
> **Nutzt:** Alle vorherigen Phasen
> **Master-Plan:** [00_MASTER_PLAN.md](./00_MASTER_PLAN.md) Abschnitt "PHASE 4"

---

## Ziel

Wokwi-Regressionstests und Produktionstestfeld nutzen dieselben Error-Reports und Dashboards. Feedback-Loop zwischen beiden Spuren etabliert. Einheitlicher Blick auf den Systemzustand.

---

## Schritt 4.1: Gemeinsame Error-Reports

### Ist-Zustand nach Phase 1-3

| Quelle | Error-Format | Wo gespeichert |
|--------|-------------|----------------|
| Wokwi CI/CD | Serial-Log + GitHub Actions Artifacts | `.log` Dateien, GitHub |
| Produktion ESP32 | Error-Codes via MQTT → Server | `audit_log` Tabelle (PostgreSQL) |
| Grafana Alerts | PromQL/LogQL → Alert-State | Grafana Alert Manager |
| Isolation Forest | Anomaly-Scores | `ai_predictions` Tabelle (PostgreSQL) |

### Vereinheitlichung

**Problem:** Wokwi-Fehler sind in CI/CD-Logs, Produktionsfehler in der DB. Kein einheitlicher Blick.

**Loesung:** Error-Report-Format das beide Quellen abdeckt.

**Datei:** `.claude/reference/testing/ERROR_REPORT_FORMAT.md`

```markdown
# Unified Error Report Format

## Felder
| Feld | Typ | Beschreibung |
|------|-----|-------------|
| source | enum | "wokwi" \| "production" \| "ci_cd" |
| error_code | int | Error-Code aus Phase 0 Taxonomie (1000-6099) |
| severity | enum | "info" \| "warning" \| "error" \| "critical" |
| timestamp | ISO 8601 | Zeitpunkt des Fehlers |
| esp_id | string | ESP-ID oder "WOKWI_SIM" |
| scenario | string? | Wokwi-Szenario-Name (nur fuer source=wokwi) |
| description | string | Fehlerbeschreibung |
| serial_pattern | string? | Gesuchtes Serial-Pattern |
| resolution | string? | Wie behoben (auto/manual/false_positive) |
| correlation_id | uuid? | Fuer Cross-Layer-Korrelation |
```

### Agent-Integration

**Agent:** `test-log-analyst`
**Skill:** `/test-log-analyst`

Der `test-log-analyst` Agent kann bereits:
- pytest Output parsen
- Vitest Output parsen
- Wokwi Test Logs analysieren

**Erweiterung:** test-log-analyst soll das Unified Error Report Format nutzen um Wokwi-Ergebnisse UND Produktions-Audit-Logs in dasselbe Format zu bringen.

**Agent:** `meta-analyst`

Der `meta-analyst` Agent korreliert dann:
```
Wokwi-Report (test-log-analyst)
        │
        └──────────────┬─────────────────────────┐
                       │                          │
              ┌────────┴────────┐        ┌───────┴────────┐
              │ Produktions-     │        │ AI-Predictions │
              │ Audit-Logs       │        │ (Phase 3)      │
              └────────┬────────┘        └───────┬────────┘
                       │                          │
              ┌────────┴──────────────────────────┘
              │
     ┌────────┴────────┐
     │ meta-analyst    │
     │ Cross-Report    │
     │ Korrelation     │
     └─────────────────┘
```

---

## Schritt 4.2: Dashboard-Konsolidierung

### Neue Grafana-Dashboards

**Existierendes Dashboard:** Operations (Prometheus + Loki) — bleibt unveraendert.

**Neue Dashboards (3 Stueck):**

#### Dashboard A: Sensor-Daten (NEU)

| Panel | Datenquelle | Visualisierung |
|-------|-------------|----------------|
| Live Sensor-Werte | Prometheus (`god_kaiser_sensor_value`) | Stat panels per Sensor |

> **[VERIFY-PLAN] Dashboard A Korrektur:**
> - `god_kaiser_sensor_value` Metrik existiert NICHT (siehe Phase 0 Korrektur) → muss in Phase 0 implementiert werden
> - PostgreSQL als Grafana-Datenquelle existiert NICHT in datasources.yml → muss hinzugefuegt werden
> - Aktuell nur 2 Datenquellen: Prometheus + Loki
> - Dashboard `system-health.json` existiert bereits als Referenz-Pattern
| Temperatur-Verlauf 24h | PostgreSQL (sensor_data) | Time Series |
| pH-Verlauf 24h | PostgreSQL (sensor_data) | Time Series |
| Sensor-Health | Prometheus | Traffic light |
| Anomalie-Score | PostgreSQL (ai_predictions) | Gauge |

**Datei:** `docker/grafana/provisioning/dashboards/sensor-data.json`

**Datenquelle PostgreSQL konfigurieren:**

```yaml
# docker/grafana/provisioning/datasources/datasources.yml
- name: PostgreSQL
  type: postgres
  access: proxy
  url: postgres:5432
  database: god_kaiser
  user: god_kaiser
  secureJsonData:
    password: password
  jsonData:
    sslmode: disable
    timescaledb: false
```

#### Dashboard B: Error-Analyse (NEU)

| Panel | Datenquelle | Visualisierung |
|-------|-------------|----------------|
| Error-Heatmap | Prometheus (error counters) | Heatmap |
| Error-Trend 7d | Prometheus | Time Series |
| Active Alerts | Grafana Alerting | Alert list |
| AI-Anomalien | PostgreSQL (ai_predictions) | Table |
| Error-Code-Verteilung | PostgreSQL (audit_log) | Pie chart |
| Recovery-Status | PostgreSQL (ai_predictions.resolved_at) | Bar gauge |

**Datei:** `docker/grafana/provisioning/dashboards/error-analysis.json`

#### Dashboard C: Test-Status (NEU)

| Panel | Datenquelle | Visualisierung |
|-------|-------------|----------------|
| CI/CD Pipeline Status | GitHub API (gh CLI) | External link |
| Wokwi Test Results (letzter Run) | JSON import | Table |
| Backend Unit Tests | pytest XML | Stat |
| Frontend Unit Tests | Vitest XML | Stat |
| Firmware Native Tests | Unity XML | Stat |
| Error-Injection Coverage | Wokwi scenarios | Gauge |

**HINWEIS:** Dashboard C ist komplexer weil es CI/CD-Daten braucht die nicht nativ in Grafana verfuegbar sind. Optionen:
1. **Einfach:** Manuelle Links zu GitHub Actions Runs
2. **Mittel:** JSON-Datei die CI/CD-Pipeline updatet → Grafana liest JSON
3. **Komplex:** GitHub API Datasource Plugin

**Empfehlung fuer Testlauf:** Option 1 (Links) + lokale Test-Ergebnisse als JSON

### Implementierung

**Agent:** Hauptkontext (Grafana-Dashboards sind JSON-Dateien, kein Agent noetig)

**Pattern:** Bestehende Dashboards unter `docker/grafana/provisioning/dashboards/` als Referenz

**Verifikation:**
```bash
# Dashboard-Dateien validieren
python -c "import json; json.load(open('docker/grafana/provisioning/dashboards/sensor-data.json'))"
python -c "import json; json.load(open('docker/grafana/provisioning/dashboards/error-analysis.json'))"

# Grafana neu laden (ACHTUNG: docker compose restart ist hook-blocked!)
docker compose up -d --force-recreate grafana

# Dashboards in Grafana sichtbar
curl -s -u admin:Admin123# http://localhost:3000/api/search?query=sensor | python -m json.tool
```

---

## Schritt 4.3: Feedback-Loop etablieren

### Produktionsfehler → Wokwi-Regressionsszenario

```
1. Produktion: ESP32 meldet Error-Code 1040 (SENSOR_READ_FAILED)
   │
2. Server: Audit-Log + AI-Prediction (Anomalie erkannt)
   │
3. Grafana: Alert feuert → Operator wird benachrichtigt
   │
4. Analyse: Ursache identifiziert (z.B. Sensor-Timeout bei hoher Last)
   │
5. Fix: Firmware-Patch oder Server-Logik-Anpassung
   │
6. Wokwi: Neues Regressionsszenario erstellt
   │   Datei: tests/wokwi/scenarios/11-error-injection/regression_1040_sensor_timeout.yaml
   │
7. CI/CD: Regressionsszenario laeuft bei jedem Push
   │
8. Verifikation: Fix besteht Regression → Deploy in Produktion
```

### Workflow-Integration

**Naming-Konvention fuer Regressions-Szenarien:**
```
regression_{error_code}_{kurzbeschreibung}.yaml

Beispiele:
- regression_1040_sensor_timeout_under_load.yaml
- regression_3011_mqtt_reconnect_after_broker_restart.yaml
- regression_5301_db_connection_pool_exhaustion.yaml
```

### Agent-Workflow fuer Feedback-Loop

1. **Fehler erkannt:** `auto-ops` (Operations-Rolle) → Alert-Analyse
2. **Root-Cause:** `meta-analyst` → Cross-Layer-Korrelation
3. **Fix implementieren:** Passender Dev-Agent (esp32-dev / server-dev / frontend-dev)
4. **Regression erstellen:** `esp32-dev` → Wokwi-Szenario
5. **Verifizieren:** `test-log-analyst` → CI/CD-Ergebnis pruefen

---

## Schritt 4.4: Konsolidierter Systemzustand

### System-Status-Seite

Eine zentrale Uebersicht die den Zustand beider Spuren zeigt:

**Option A: Grafana Home Dashboard**

```
┌─────────────────────────────────────────────────────────────┐
│                    AutomationOne Status                     │
├─────────────────────────────┬───────────────────────────────┤
│   SPUR A: WOKWI (SIL)      │   SPUR B: PRODUKTION          │
│                             │                               │
│   CI/CD: ✓ GRUEN           │   Stack: ✓ 12/13 healthy      │
│   Szenarien: 173/173 pass  │   ESP32: ✓ 1 online           │
│   Error-Injection: 10/10   │   Sensoren: ✓ 3 aktiv         │
│   Letzter Run: vor 2h      │   Anomalien: 0 unresolved     │
│                             │   Alerts: 0 firing            │
├─────────────────────────────┴───────────────────────────────┤
│   GEMEINSAM                                                 │
│   Error-Codes definiert: 112 (1000-6099)                    │
│   Grafana-Alerts: 28 aktiv, 0 firing                        │
│   AI-Predictions: 47 total, 2 unresolved                    │
│   Letzte Anomalie: vor 45min (resolved: auto)               │
└─────────────────────────────────────────────────────────────┘
```

### auto-ops Integration

**Erweiterung des auto-ops Plugins:**

Das auto-ops Plugin soll den konsolidierten Status auf Anfrage ausgeben koennen:

**Skill:** `/auto-ops:ops-diagnose`

Erweiterte Diagnose umfasst:
1. Docker-Stack Status (bestehend)
2. Wokwi CI/CD Status (NEU: letzter Pipeline-Run via `gh run list`)
3. AI-Prediction Status (NEU: unresolved count)
4. Grafana Alert Status (NEU: firing alerts)

---

## Akzeptanzkriterien Phase 4

| # | Kriterium | Verifikation |
|---|-----------|-------------|
| 1 | Error-Report-Format dokumentiert | `.claude/reference/testing/ERROR_REPORT_FORMAT.md` existiert |
| 2 | Sensor-Daten Dashboard in Grafana | Dashboard "Sensor Data" sichtbar |
| 3 | Error-Analyse Dashboard in Grafana | Dashboard "Error Analysis" sichtbar |
| 4 | Test-Status Dashboard oder Links | Dashboard "Test Status" sichtbar |
| 5 | PostgreSQL als Grafana-Datenquelle | datasources.yml hat PostgreSQL |
| 6 | Feedback-Loop Konvention dokumentiert | Regression-Szenario Naming in README |
| 7 | meta-analyst kann beide Quellen korrelieren | Cross-Report mit Wokwi + Produktion |
| 8 | auto-ops zeigt konsolidierten Status | /ops-diagnose output enthaelt alle Spuren |

---

## Gesamtuebersicht: Phasen-Abhaengigkeiten

```
Phase 0: Error-Taxonomie (FUNDAMENT)
  │
  ├──► Phase 1: Wokwi-Simulation (PARALLEL)
  │       │
  │       │   ┌──────────────────────────────────┐
  │       └──►│                                  │
  │           │      Phase 4: Integration        │
  ├──► Phase 2: Produktionstestfeld (PARALLEL)   │
  │       │   │  - Gemeinsame Error-Reports      │
  │       │   │  - Dashboard-Konsolidierung       │
  │       └──►│  - Feedback-Loop                 │
  │           │  - Konsolidierter Status          │
  └──► Phase 3: KI-Error-Analyse ──────────────►│
          │                                      │
          │   (braucht Sensordaten aus Phase 2)   │
          └──────────────────────────────────────┘
```

---

## Agents & Skills (Zusammenfassung)

| Schritt | Agent/Skill | Aufgabe |
|---------|-------------|---------|
| 4.1 | `test-log-analyst` / `/test-log-analyst` | Error-Report-Format nutzen |
| 4.1 | `meta-analyst` | Cross-Report-Korrelation (Wokwi + Produktion) |
| 4.2 | Hauptkontext | Grafana-Dashboards erstellen |
| 4.2 | `system-control` | PostgreSQL Datasource konfigurieren |
| 4.3 | `esp32-dev` | Regressions-Szenarien erstellen |
| 4.3 | `test-log-analyst` | CI/CD-Ergebnis verifizieren |
| 4.4 | `/auto-ops:ops-diagnose` | Konsolidierter Status |
| Ende | `/verify-plan` | Phase 4 gegen Codebase verifizieren |

---

## /verify-plan Ergebnis (Phase 4)

**Plan:** Error-Reports vereinheitlichen, 3 Dashboards, Feedback-Loop, konsolidierter Status
**Geprueft:** 3 Dashboard-Pfade, 2 Datenquellen, 5 Agent-Referenzen, 1 Report-Format

### Bestaetigt
- Grafana Dashboard-Provisioning funktioniert (dashboards.yml + Ordner korrekt)
- Bestehendes Dashboard `system-health.json` als Pattern vorhanden
- Datasources-Provisioning korrekt (Prometheus + Loki konfiguriert)
- Agent-Referenzen korrekt (test-log-analyst, meta-analyst, esp32-dev, auto-ops)
- Feedback-Loop Workflow logisch konsistent
- Error-Report-Format sinnvoll designed
- Regressions-Szenario Naming-Konvention konsistent mit Wokwi-Patterns

### Korrekturen noetig

**PostgreSQL Datenquelle:**
- Plan referenziert PostgreSQL als Grafana-Datasource → existiert NICHT in datasources.yml
- Muss hinzugefuegt werden (URL: `postgres:5432`, User: `god_kaiser`, DB: `god_kaiser_db`)
- Korrekte Credentials: Password ist `password` (NICHT `gk_secure_2024`)

**Dashboard A abhaengig von Phase 0:**
- `god_kaiser_sensor_value` Metrik existiert NICHT → Dashboard A Sensor-Panels funktionieren erst nach Phase 0 Metrik-Implementierung

**Docker restart hook-blocked:**
- `docker compose restart grafana` → korrigiert zu `docker compose up -d --force-recreate grafana`

**ERROR_REPORT_FORMAT.md:**
- Datei existiert noch nicht (erwartet — wird erstellt)

### Fehlende Vorbedingungen
- [ ] Phase 0 abgeschlossen (Metriken fuer Dashboard A)
- [ ] Phase 1 + 2 + 3 abgeschlossen (Daten fuer alle Dashboards)
- [ ] PostgreSQL Datasource in Grafana konfigurieren
- [ ] ERROR_REPORT_FORMAT.md erstellen

### Zusammenfassung
Plan ist gut strukturiert und referenziert alle Vorgaenger-Phasen korrekt. **3 Korrekturen** noetig: PostgreSQL-Datasource fehlt in Grafana, `god_kaiser_sensor_value` Metrik existiert noch nicht, docker restart hook-blocked. Der Plan ist ausfuehrbar sobald Phase 0-3 abgeschlossen sind.

---

## Endresultat

Nach Phase 4 ist die Testinfrastruktur komplett:

| Komponente | Status |
|-----------|--------|
| Error-Taxonomie (1000-6099) | Vollstaendig, dokumentiert, in Grafana |
| Wokwi-Simulation (SIL) | 173+ Szenarien, CI/CD automatisiert, Nightly |
| Produktionstestfeld | ESP32 + Sensoren, E2E verifiziert, Chaos-getestet |
| KI-Error-Analyse | Stufe 1 (Rule-based) + Stufe 2 (Isolation Forest) aktiv |
| Dashboards | 4 Dashboards (Operations, Sensor, Error, Test) |
| Feedback-Loop | Produktion → Regression → Fix → Deploy |
| Agent-System | 13 Agents orchestriert, Reports konsolidiert |
