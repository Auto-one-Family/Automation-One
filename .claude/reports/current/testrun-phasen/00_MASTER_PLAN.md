# AutomationOne — Phasenplan Testinfrastruktur

> **Erstellt:** 2026-02-21
> **Erstellt von:** Automation-Experte (Life-Repo)
> **Zweck:** Ueberblick ueber den Aufbau der Testinfrastruktur mit zwei parallelen Spuren (Wokwi-Simulation + Produktionstestfeld), gemeinsamer Error-Taxonomie und phasenweiser Fertigstellung.
> **Charakter:** Offen und flexibel — Phasen geben Richtung, nicht starre Deadlines.

---

## Gesamtbild: Zwei Spuren, ein Error-System

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                    TESTINFRASTRUKTUR — ZWEI SPUREN                         ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                            ║
║  SPUR A: WOKWI-SIMULATION (SIL)        SPUR B: PRODUKTIONS-TESTFELD      ║
║  ┌────────────────────────────┐         ┌────────────────────────────┐     ║
║  │ Laeuft unabhaengig         │         │ Echter ESP32 + Sensoren   │     ║
║  │ Kein echter ESP32 noetig   │         │ Docker-Stack vollstaendig │     ║
║  │ 163 Szenarien vorhanden    │         │ Monitoring aktiv          │     ║
║  │ CI/CD-integrierbar         │         │ KI-Error-Analyse aktiv    │     ║
║  │ Firmware-Regression        │         │ Frontend vollstaendig     │     ║
║  └──────────────┬─────────────┘         └──────────────┬────────────┘     ║
║                 │                                       │                  ║
║                 └───────────────┬───────────────────────┘                  ║
║                                 │                                          ║
║                    ┌────────────┴────────────┐                             ║
║                    │  GEMEINSAME ERROR-       │                             ║
║                    │  TAXONOMIE & HANDLING    │                             ║
║                    │                          │                             ║
║                    │  Error-Codes: 1000-5699  │                             ║
║                    │  Severity: info→critical │                             ║
║                    │  Kategorien: 6 Typen     │                             ║
║                    │  Grafana-Alerts: 28+     │                             ║
║                    │  KI: 3-Stufen-Strategie  │                             ║
║                    └─────────────────────────┘                             ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

---

## Ressourcen-Inventar: Was existiert, was wird genutzt, was fehlt

### Infrastruktur (vorhanden und aktiv)

| Ressource | Status | Details |
|-----------|--------|---------|
| Docker-Stack (13 Services) | **12/13 healthy** | Core (4) + Monitoring (7) + DevTools (1) + Hardware (1). Mosquitto-Exporter unhealthy — kein Einfluss |
| PostgreSQL | **Laeuft** | 19 Tabellen, Alembic Migrations, ai_predictions vorbereitet |
| Mosquitto MQTT | **Laeuft** | Port 1883 + 9001 (WS), allow_anonymous (Testmodus) |
| Grafana | **Laeuft** | 26 Panels, 8 Alert-Regeln, Auto-Refresh 10s |
| Prometheus | **Laeuft** | 15 Gauges, 2 Counters, 1 Histogram, 7 Scrape-Jobs |
| Loki + Promtail | **Laeuft** | Zentrale Log-Aggregation, 7d Retention, JSON-Logs |
| cAdvisor | **Laeuft** | Container-Ressourcen-Monitoring |

### Software-Stack (vorhanden)

| Schicht | Fortschritt | Testlauf-Readiness |
|---------|-------------|-------------------|
| El Servador (FastAPI) | 95% | 95% bereit — ~170 Endpoints, 12 MQTT-Handler, 9 Sensor-Libraries |
| El Trabajante (ESP32) | 90% | 92% bereit — Full Boot bestanden, 163 Wokwi-Szenarien |
| El Frontend (Vue3) | 85% | 90% bereit — 97 Komponenten, 9 Pinia Stores, WebSocket stabil |

### Test-Suite (vorhanden)

| Suite | Tool | Umfang | Status |
|-------|------|--------|--------|
| Backend Unit | pytest | 759 Tests (109 Dateien) | GRUEN |
| Frontend Unit | Vitest | 1118 Tests (64 Dateien) | GRUEN |
| Firmware Native | Unity | 22 Tests | GRUEN |
| Wokwi Simulation | pytest + Wokwi | 163 Szenarien | GRUEN |
| E2E Backend | pytest + Docker | Stack-abhaengig | Manuell |
| E2E Frontend | Playwright | Stack-abhaengig | Manuell |

### MCP-Server (10 aktiv im auto-one Repo)

| MCP-Server | Primaerer Nutzen fuer Testinfrastruktur |
|------------|----------------------------------------|
| **Serena** | Semantische Code-Analyse — Symbol-Suche ueber Python/TypeScript/C++ fuer Impact-Analyse bei Aenderungen |
| **Playwright** | Frontend-Inspektion — Live-Browser-Steuerung fuer E2E-Debugging und UI-Verifikation |
| **Docker** | Container-Management — Status, Logs, Exec fuer Stack-Diagnose |
| **Database** | PostgreSQL-Abfragen — Schema-Inspektion, Query-Debugging, sensor_data Validierung |
| **Git** | Branch-Management — Diff-Analyse, Feature-Branch-Isolation fuer Testarbeit |
| **GitHub** | CI/CD-Status — Pipeline-Ergebnisse, PR-Reviews |
| **Context7** | Library-Docs — Aktuelle API-Referenz fuer FastAPI, Vue, Arduino |
| **Sequential Thinking** | Strukturierte Analyse — Komplexe Debug-Szenarien mehrstufig durchdenken |
| **Sentry** | Error-Tracking — Production-Error-Analyse (spaeter relevant) |
| **Filesystem** | Config-Zugriff — System-Konfigurationen ausserhalb Sandbox |

**MCP-Einschraenkung:** Subagenten (13 Debug/Dev-Agents) haben KEINEN MCP-Zugriff. Sie arbeiten mit Grep/Glob/Read/Bash. MCP-Tools sind nur im Hauptkontext verfuegbar. Das bedeutet: Komplexe Diagnosen die MCP erfordern (Serena-Symbolsuche, Playwright-Inspektion, DB-Queries) muessen im Hauptkontext oder ueber auto-ops orchestriert werden.

### Claude Code Agent-System (auto-one Repo)

| Kategorie | Agents | Testinfrastruktur-Rolle |
|-----------|--------|------------------------|
| Debug (4) | esp32-debug, server-debug, mqtt-debug, frontend-debug | Log-Analyse pro Schicht, Report-Erstellung |
| Dev (4) | esp32-dev, server-dev, mqtt-dev, frontend-dev | Pattern-konforme Implementierung |
| System (2) | system-control, db-inspector | Stack-Operationen, DB-Inspektion |
| Meta (2) | meta-analyst, agent-manager | Cross-Report-Korrelation |
| Test (1) | test-log-analyst | Test-Failure-Analyse |
| auto-ops (3) | auto-ops, backend-inspector, frontend-inspector | Autonome Cross-Layer-Diagnose |

### Error-System (vorhanden)

| Komponente | Status | Details |
|-----------|--------|---------|
| ESP32 Error-Codes | **Definiert** | 1000-4999 (error_codes.h) |
| Server Error-Codes | **Definiert** | 5000-5699 (constants.py) |
| Severity-Stufen | **Aktiv** | info, warning, error, critical |
| Fehler-Kategorien | **Aktiv** | sensor, actuator, mqtt, system, config, safety |
| Audit-Log-Tabelle | **Laeuft** | event_type, severity, correlation_id, error_code |
| Grafana-Alerts | **8 aktiv** | 5 Critical + 3 Warning |
| Error-Code-Referenz | **Dokumentiert** | `.claude/reference/errors/ERROR_CODES.md` |

### Was FEHLT (identifizierte Luecken)

| Luecke | Bereich | Prioritaet | Ergaenzungshinweis |
|--------|---------|------------|-------------------|
| Kalibrierungs-Wizard UI | Frontend | HOCH | Server-API existiert (`POST /sensors/calibrate`), nur Frontend-Wizard fehlt |
| Historische Zeitreihen-View | Frontend | HOCH | Chart.js vorhanden, eigene View als Komponente fehlt |
| Analyse-Profile UI | Frontend | MITTEL | Dashboard fuer Datenerfassungs-Steuerung |
| Benutzer-Management UI | Frontend | NIEDRIG | Admin-Panel (JWT/RBAC funktioniert bereits) |
| Erweiterte Grafana-Alert-Regeln | Monitoring | HOCH | 8 Regeln aktiv, 20+ empfohlen fuer Testlauf |
| Isolation Forest Service | Backend | MITTEL | scikit-learn verfuegbar, ai_predictions-Tabelle bereit |
| MQTT-ACL | Security | NIEDRIG (fuer Testlauf) | Vorlage existiert, fuer Produktion MUSS |
| Incident-Management-Prozess | Operations | NIEDRIG | Wer macht was bei Ausfall |

---

## PHASE 0: FUNDAMENT — Gemeinsame Error-Taxonomie

> **Ziel:** Einheitliches Fehlersystem das BEIDE Spuren nutzen — egal ob Wokwi-Simulation oder echtes Testfeld.
> **Aufwand:** Konfiguration + Alert-Regeln, minimal neuer Code.

### 0.1 Error-Taxonomie konsolidieren

Die Error-Taxonomie ist bereits zweistufig definiert:

| Ebene | Bereich | Codes | Beispiel |
|-------|---------|-------|---------|
| Firmware | sensor | 1000-1099 | `1001: SENSOR_READ_FAILED` |
| Firmware | actuator | 1100-1199 | `1101: ACTUATOR_TIMEOUT` |
| Firmware | mqtt | 2000-2099 | `2001: MQTT_CONNECT_FAILED` |
| Firmware | system | 3000-3099 | `3001: WATCHDOG_RESET` |
| Firmware | config | 3100-3199 | `3101: NVS_READ_FAILED` |
| Firmware | safety | 4000-4099 | `4001: EMERGENCY_STOP_TRIGGERED` |
| Server | general | 5000-5099 | `5001: DB_CONNECTION_LOST` |
| Server | mqtt | 5100-5199 | `5101: MQTT_HANDLER_EXCEPTION` |
| Server | sensor | 5200-5299 | `5201: CALIBRATION_INVALID` |
| Server | logic | 5300-5399 | `5301: RULE_EVALUATION_FAILED` |
| Server | actuator | 5400-5499 | `5401: ACTUATOR_CONFLICT` |
| Server | safety | 5500-5599 | `5501: RATE_LIMIT_EXCEEDED` |

**Ergaenzungshinweis:** Noch nicht abgedeckt sind Test-spezifische Fehler (z.B. Wokwi-Simulation-Timeout, Mock-ESP-Konfigurationsfehler). Ein optionaler Block 6000-6099 koennte Testinfrastruktur-Fehler abdecken. MUSS!!

### 0.2 Grafana-Alert-Regeln erweitern

Aktuelle 8 Regeln → Ziel: 28+ Regeln fuer den Testlauf.

**Neue Regeln (Empfehlung, kein Code noetig — nur `alert-rules.yml` erweitern):**

| Alert | PromQL / LogQL | Severity | Kategorie |
|-------|---------------|----------|-----------|
| Sensor Value Out of Range | `sensor_value > MAX or < MIN` (pro Typ) | WARNING | sensor |
| Sensor Drift 3-Sigma | `abs(value - avg_24h) > 3 * stddev_24h` | WARNING | sensor |
| Heartbeat Gap | `time() - last_heartbeat > 120` | WARNING | device |
| Error Cascade | `increase(errors_total[60s]) > 3` | CRITICAL | system |
| DB Query Slow | `histogram_quantile(0.95, db_query_duration) > 1` | WARNING | data |
| WebSocket Disconnects | `ws_disconnects_total > 5 in 5min` | WARNING | application |
| MQTT Message Backlog | `mqtt_queued_messages > 1000` | WARNING | connectivity |
| Container Restart | `container_restarts > 0 in 10min` | WARNING | operations |
| Disk Usage High | `disk_usage_percent > 80` | WARNING | operations |
| ESP Boot-Loop | `boot_count > 3 in 10min` | CRITICAL | device |

Kann das Direkt mit Agenten verknüpft werden, der alle alerts immer genau im überblick hält und genau zusammefässt und ist es bereits in stufe 0.3 integriert? dass es automatisiert abläuft, aber gut strukturiert für jedes event und für die die relevant miteinander zusammenhängen.

### 0.3 KI-Error-Analyse Stufe 1 aktivieren

**Sofort nutzbar (0 Code, nur Konfiguration):**

```
Stufe 1: RULE-BASED (Grafana Alerting)
├── PromQL-Regeln fuer Metriken-basierte Anomalien
├── LogQL-Regeln fuer Log-Pattern-Matching
├── Schwellwerte aus bestehender Forschung:
│   └── pH: 0.0-14.0, EC: 0-5000 uS/cm, Temp: -40-85°C
│   └── (Referenz: wissen/iot-automation/esp32-sensor-kalibrierung-ph-ec.md)
└── Alert-Notification an Grafana-Dashboard (kein externer Kanal noetig fuer Testlauf)
```

**Wissenschaftliche Basis:**
- Sensor-Plausibilitaetsgrenzen aus `ki-error-analyse-iot.md` (PLAUSIBILITY_RANGES)
- Isolation Forest als naechster Schritt bestaetigt durch Phan & Nguyen (2025): Score 0.464 vs. LSTM 0.263, 600x schneller
- Self-Healing-Erweiterung moeglich (Devi et al. 2024): Isolation Forest → automatische Recovery-Entscheidung

---

## PHASE 1: SPUR A — Wokwi-Simulation (SIL) stabilisieren

> **Ziel:** Wokwi-Szenarien als dauerhaft laufende Regressionstests. Unabhaengig vom echten Testfeld.
> **Vorteil:** Kein ESP32 noetig, keine Hardware-Abhaengigkeit, CI/CD-integrierbar.

### 1.1 Bestehende Wokwi-Infrastruktur

| Komponente | Status | Details |
|-----------|--------|---------|
| Wokwi-Szenarien | **163 vorhanden** | Full Boot, MQTT, Heartbeat, Zone Assignment |
| CI/CD Pipeline | **Vorhanden** | `wokwi-tests.yml` (Manual Dispatch) |
| pytest Integration | **Vorhanden** | Wokwi-Tests als pytest-Szenarien |
| HAL-Pattern | **Implementiert** | `igpio_hal.h` / `esp32_gpio_hal.h` — Hardware-Abstraktion fuer Testbarkeit |

### 1.2 Erweiterungsplan

**A. Wokwi-Szenarien mit Error-Injection:**

Die Wokwi-Simulation kann dieselbe Fehler-Taxonomie nutzen wie das Produktionstestfeld:

| Fehlertyp | Wokwi-Simulation | Error-Code |
|-----------|-------------------|------------|
| Sensor-Ausfall | Sensor-Pin nicht verbinden / Timeout simulieren | 1001 |
| WiFi-Unterbrechung | WiFi-Verbindung in Simulation trennen | 2001 |
| MQTT-Nachrichtenverlust | Broker-Response verzoegern | 2002 |
| Speicher-Knappheit | Heap-Grenzen reduzieren | 3002 |
| Watchdog-Trigger | Endlosschleife in Task simulieren | 3001 |

**Referenz:** Yu et al. (2024) identifiziert 5 Fault-Injection-Kategorien (Network Latency, Service Crash, Resource Exhaustion, Message Loss, Security Attack) — alle in Wokwi simulierbar.

**B. CI/CD-Automatisierung:**

```
Aktuell: wokwi-tests.yml (Manual Dispatch)
   ↓
Ziel: Automatischer Trigger bei Push/PR auf El Trabajante/**
   ↓
Ergaenzung: Nightly-Run fuer Full-Suite (163+ Szenarien)
```

**Referenz:** Kalimuthu (2025) empfiehlt SIL-Tests automatisch in CI/CD, HIL-Tests manuell oder periodisch.

**C. Wokwi ↔ Error-Taxonomie Mapping:**

Wokwi-Test-Reports sollten dieselben Error-Codes und Severity-Stufen verwenden wie der Produktions-Stack. Das ermoeglicht:
- Vergleichbare Fehlerberichte zwischen Simulation und Produktion
- Gemeinsame Grafana-Dashboards fuer Error-Statistiken
- test-log-analyst Agent kann beide Quellen analysieren

Wichtig: Dennoch beide Systeme immer klar voneinander trennen.

### 1.3 Wokwi-spezifische Ressourcen

| Ressource | Pfad / Ort | Status |
|-----------|-----------|--------|
| Wokwi-Szenarien | `tests/wokwi/` (auto-one Repo) | 163 Szenarien |
| HAL-Interface | `igpio_hal.h` (Firmware) | Implementiert |
| CI/CD Pipeline | `.github/workflows/wokwi-tests.yml` | Manual Dispatch |
| pytest-Wokwi-Config | `tests/wokwi/conftest.py` | Konfiguriert |
| Seed-Script | `scripts/seed_wokwi_esp.py` | Testdaten-Generator |

---

## PHASE 2: SPUR B — Produktionstestfeld aufbauen

> **Ziel:** Echter ESP32 mit echten Sensoren, vollstaendiger Docker-Stack, Monitoring, KI-Error-Analyse.
> **Vorteil:** Reale Betriebsbedingungen, echte Sensordaten, End-to-End-Validierung.

### 2.1 Hardware-Setup

| Komponente | Minimum fuer Testlauf | Status |
|-----------|----------------------|--------|
| ESP32 DevKit | 1 Stueck | Vorhanden (anzunehmen) |
| DS18B20 Temperatursensor | 1 Stueck | Vorhanden (anzunehmen) |
| pH-Sensor + Sonde | Optional fuer Kalibrierungs-Test | Vorhanden (anzunehmen) |
| WiFi-Netzwerk | Lokales Netzwerk, ESP32 erreichbar | Vorhanden |
| Host-Rechner | Docker-faehig, Ports frei | Vorhanden (Windows 11, Docker Desktop) |

**Ergaenzungshinweis:** Exaktes Hardware-Inventar sollte Robin bestaetigen. Das System ist so gebaut dass es mit einem einzigen ESP32 und einem DS18B20 als Minimalsetup starten kann.

### 2.2 Stack-Start-Sequenz

```
Schritt 1: Docker-Stack hochfahren
   $ docker compose up -d                          # Core: PostgreSQL + Mosquitto + Server + Frontend
   $ docker compose --profile monitoring up -d      # + Monitoring (Grafana, Prometheus, Loki...)

Schritt 2: Testdaten laden
   $ .venv/Scripts/python.exe scripts/seed_wokwi_esp.py   # Mock-ESP Registrierung

Schritt 3: ESP32 flashen und verbinden
   - PlatformIO: Firmware kompilieren und flashen
   - Captive Portal: WiFi-Credentials + Server-IP konfigurieren
   - MQTT-Verbindung: ESP32 connected → Heartbeat sichtbar in Grafana

Schritt 4: Verifizieren
   - http://localhost:8000/docs        → Swagger UI (API)
   - http://localhost:5173             → Frontend
   - http://localhost:3000             → Grafana
   - http://localhost:8000/health/ready → Readiness-Check
```

**Startup-Order (erzwungen durch Docker health-checks):**
```
postgres + mqtt-broker (parallel)
     ↓ (beide healthy)
  el-servador
     ↓
  el-frontend
```

### 2.3 Kritischer Pfad — Was muss funktionieren

| # | Anforderung | Aktueller Stand | Was fehlt |
|---|-------------|----------------|-----------|
| 1 | Sensordaten fliessen E2E | **95% bereit** | ESP32 muss konfiguriert sein + in DB registriert |
| 2 | Kalibrierung | **80% bereit** | Frontend-Wizard fehlt — Workaround: Swagger UI (`POST /sensors/calibrate`) |
| 3 | Live-Daten im Frontend | **90% bereit** | WebSocket stabil, historische Zeitreihen-View fehlt |
| 4 | Logic Engine | **95% bereit** | End-to-End implementiert, Safety-System aktiv |
| 5 | Safety-System | **100% bereit** | Emergency-Stop, ConflictManager, RateLimiter, LoopDetector |

### 2.4 Frontend-Vervollstaendigung

Das Frontend ist die primaere Luecke fuer ein vollstaendiges Testfeld:

| UI-Komponente | Prioritaet | Abhaengigkeit | Beschreibung |
|---------------|-----------|---------------|-------------|
| Kalibrierungs-Wizard | **HOCH** | Server-API existiert | 2-Punkt pH/EC-Kalibrierung im Browser. Aktuell nur via Swagger moeglich |
| Zeitreihen-Chart-View | **HOCH** | Chart.js vorhanden | Historische Sensordaten als Zeitreihe. Aktuelle Werte werden schon angezeigt, historisch fehlt |
| Analyse-Profile Dashboard | **MITTEL** | Backend-API existiert | Datenerfassungs-Steuerung (welche Sensoren, wie oft, welches Profil) |
| Admin/User-Management | **NIEDRIG** | JWT/RBAC funktioniert | Benutzer anlegen/loeschen im Browser statt API |
| Mobile-Responsive | **NIEDRIG** | Tailwind CSS vorhanden | Smartphone-Nutzung im Gewaechshaus |

**Ergaenzungshinweis:** Fuer den ERSTEN Testlauf reichen Kalibrierungs-Wizard und Zeitreihen-View. Der Rest kann iterativ nachgezogen werden.

### 2.5 Chaos Engineering (nach Basis-Stabilitaet)

Nachdem der Basis-Stack laeuft, kann Chaos Engineering die Resilienz testen — direkt auf dem Docker-Stack:

| Fehlertyp | Docker-Befehl | Was wird getestet | AutomationOne-Aequivalent |
|-----------|---------------|-------------------|--------------------------|
| Service Crash | `docker pause automationone-server` | Server-Ausfall | Circuit Breaker, Offline-Buffer |
| Network Latency | `tc qdisc add dev eth0 root netem delay 500ms` | MQTT-Latenz | Reconnect-Backoff, QoS |
| Resource Exhaustion | `docker update --memory 128m automationone-server` | RAM-Limit | Heap-Management |
| Message Loss | MQTT QoS 0 unter Last | Nachrichtenverlust | Offline-Buffer, Retry |
| DB-Ausfall | `docker stop automationone-postgres` | DB nicht erreichbar | Graceful Degradation |

**Referenz:** Yu et al. (2024) — Chaos Engineering ist effektiver als statisches Load-Testing fuer IoT-Resilienz.

---

## PHASE 3: KI-Error-Analyse aktivieren

> **Ziel:** Automatisierte Fehlererkennung die im Hintergrund mitlaeuft — in beiden Spuren nutzbar.
> **Stufen:** Rule-based → Statistisch → LLM-basiert (inkrementell).

### 3.1 Stufe 1: Rule-Based (sofort, 0 Code)

| Was | Wie | Wo |
|-----|-----|-----|
| Sensor-Plausibilitaet | PromQL: Wert ausserhalb physikalischer Grenzen | Grafana alert-rules.yml |
| Drift-Erkennung | PromQL: Wert weicht >3sigma vom 24h-Mittel ab | Grafana alert-rules.yml |
| Heartbeat-Luecken | PromQL: ESP offline ohne LWT | Grafana alert-rules.yml |
| Error-Kaskaden | PromQL: 3+ Errors innerhalb 60s | Grafana alert-rules.yml |
| Log-Pattern-Matching | LogQL: Bekannte Fehlermuster in Loki | Grafana alert-rules.yml |

**Plausibilitaets-Grenzen (aus ki-error-analyse-iot.md):**

```python
PLAUSIBILITY_RANGES = {
    "temperature": (-40, 85),      # DS18B20 Messbereich
    "humidity": (0, 100),           # Physikalische Grenze
    "ph": (0, 14),                  # pH-Skala
    "ec": (0, 10000),              # uS/cm, typisch 0-5000
    "soil_moisture": (0, 100),     # Prozent
    "pressure": (300, 1100),       # hPa
    "co2": (0, 5000),             # ppm
    "light": (0, 200000),         # Lux
    "flow": (0, 100)              # L/min
}
```

### 3.2 Stufe 2: Statistische Anomalie-Detektion (~1 Woche Aufwand)

| Komponente | Beschreibung | Abhaengigkeit |
|-----------|-------------|---------------|
| Isolation Forest Service | Python-Service mit scikit-learn auf sensor_data | Sensordaten muessen fliessen |
| Sliding-Window-Analyse | 1h, 24h, 7d Fenster fuer Trend-Erkennung | Genuegend historische Daten |
| Korrelations-Check | Verwandte Sensoren vergleichen (z.B. Temp ↔ Feuchtigkeit) | Mindestens 2 Sensoren aktiv |
| ai_predictions-Tabelle | Ergebnisse in bestehende DB-Tabelle schreiben | Schema existiert bereits |

**Wissenschaftliche Basis:**
- Phan & Nguyen (2025): Isolation Forest ueberlegen bei Sensordaten (Score 0.464, 600x schneller als LSTM)
- Devi et al. (2024): Isolation Forest kann von Erkennung zu Recovery erweitert werden
- Chirumamilla et al. (2025): Hybrid-Pipeline (Autoencoder → Isolation Forest → LSTM) als Langzeitstrategie

**Ergaenzungshinweis:** Isolation Forest arbeitet unsupervised — kein gelabeltes Training noetig. Kann sofort mitlaufen sobald Sensordaten in der DB sind. Erste sinnvolle Ergebnisse nach wenigen Stunden Datensammlung.

### 3.3 Stufe 3: LLM-basierte Root-Cause-Analyse (spaeter)

| Komponente | Beschreibung | Voraussetzung |
|-----------|-------------|---------------|
| Claude API Integration | Strukturierte Logs → Root-Cause-Bericht | API-Key, Kostenbudget |
| Timeline-Rekonstruktion | Automatische Ereigniskette aus correlation_id | Audit-Logs muessen fliessen |
| Fix-Vorschlaege | Basierend auf Error-Code-Referenz | Error-Codes vollstaendig dokumentiert |

**Wissenschaftliche Basis:**
- AIOps-Forschung zeigt: 89% korrekte Erstdiagnose ohne fehler-spezifisches Training (Zero-Shot LLM-Diagnose)
- LEAT Framework (2025): LLM-Enhanced Anomaly Transformer kombiniert Transformer-Architektur mit LLM-Interpretation

**Ergaenzungshinweis:** Stufe 3 braucht KEINE GPU und KEINEN Jetson. Claude API laeuft remote. Der Jetson ist fuer lokale ML-Inferenz (Stufe 2 im Dauerbetrieb) gedacht — ist aber fuer den Testlauf nicht noetig weil scikit-learn auf dem FastAPI-Server laeuft.

---

## PHASE 4: INTEGRATION — Beide Spuren verbinden

> **Ziel:** Wokwi-Regressionstests und Produktionstestfeld nutzen dieselben Error-Reports und Dashboards.

### 4.1 Gemeinsame Error-Reports

```
Wokwi-Szenario fehlgeschlagen          Produktions-ESP meldet Fehler
        │                                        │
        └──────────────┬─────────────────────────┘
                       │
              ┌────────┴────────┐
              │ test-log-analyst│
              │ Agent           │
              └────────┬────────┘
                       │
              ┌────────┴────────┐
              │ Einheitliches   │
              │ Error-Report    │
              │ Format          │
              └────────┬────────┘
                       │
              ┌────────┴────────┐
              │ meta-analyst    │
              │ Cross-Report    │
              │ Korrelation     │
              └─────────────────┘
```

### 4.2 Dashboard-Konsolidierung

| Dashboard | Datenquelle | Inhalt |
|-----------|-------------|--------|
| Operations (existiert) | Prometheus + Loki | System-Health, Container, MQTT-Traffic |
| Sensor-Daten (NEU) | PostgreSQL sensor_data | Live-Werte + Historisch + Anomalien |
| Error-Analyse (NEU) | Grafana Alerts + ai_predictions | Error-Heatmap, Trends, Recovery-Status |
| Test-Status (NEU) | CI/CD + Wokwi-Results | Test-Ergebnisse beider Spuren |

### 4.3 Feedback-Loop

```
Produktion findet Fehler → Error-Code wird dokumentiert
        ↓
Wokwi-Szenario wird erstellt das den Fehler reproduziert
        ↓
Fix wird implementiert
        ↓
Wokwi-Regression bestaetigt Fix
        ↓
Fix wird in Produktion deployed
```

---

## Phasen-Uebersicht (Reihenfolge, nicht Zeitplan)

| Phase | Fokus | Voraussetzung | Aufwand-Indikation |
|-------|-------|---------------|-------------------|
| **0** | Error-Taxonomie + Grafana-Alerts erweitern | Stack laeuft | Konfiguration, kein Code |
| **1** | Wokwi-Simulation stabilisieren + CI/CD automatisieren | Phase 0 | Gering — Bestehendes erweitern |
| **2** | Produktionstestfeld aufbauen + Frontend-Luecken schliessen | Phase 0, Hardware | Mittel — Frontend-Arbeit |
| **3** | KI-Error-Analyse (Stufe 1 sofort, Stufe 2 iterativ) | Sensordaten fliessen | Stufe 1: Konfiguration, Stufe 2: ~1 Woche |
| **4** | Integration beider Spuren, Dashboards, Feedback-Loop | Phase 1+2+3 | Gering — Orchestrierung |

**Wichtig:** Phase 1 und Phase 2 laufen PARALLEL. Wokwi braucht keine echte Hardware. Das Produktionstestfeld braucht keine Wokwi-Szenarien. Beide teilen sich Phase 0 (Error-Taxonomie) und Phase 3 (KI-Error-Analyse).

---

## MCP-Integration: Wie MCP den Testprozess unterstuetzt

### Diagnose-Workflow mit MCP

```
Problem erkannt (Alert oder manuell)
    │
    ├──► Serena: Symbol-Suche → Wo ist der betroffene Code?
    ├──► Database: Query → Welche sensor_data-Eintraege sind betroffen?
    ├──► Docker: Logs → Was sagt der Container?
    ├──► Playwright: Screenshot → Was zeigt das Frontend?
    │
    ▼
Sequential Thinking: Strukturierte Analyse
    │
    ▼
auto-ops Plugin: Autonome Diagnose + Fix-Vorschlag
    │
    ├──► /ops-inspect-backend: ESP → MQTT → Server → DB durchpruefen
    ├──► /ops-inspect-frontend: Browser → Vue → API → Server → DB durchpruefen
    └──► /ops-diagnose: Cross-Layer-Korrelation
```

### MCP fuer Testfeld-Debugging

| Szenario | MCP-Server | Aktion |
|----------|-----------|--------|
| Sensor-Wert fehlt in DB | Database | `SELECT * FROM sensor_data WHERE esp_id=X ORDER BY timestamp DESC LIMIT 10` |
| Frontend zeigt falsche Daten | Playwright | Navigate zu Sensor-View, Screenshot, Console-Logs |
| MQTT-Nachricht kommt nicht an | Docker | `docker exec automationone-mqtt mosquitto_sub -t '#'` |
| Server-Error im Log | Docker | Container-Logs lesen, Loki-Query |
| Code-Aenderung Impact | Serena | `find_referencing_symbols` fuer betroffene Funktion |
| API-Endpoint Verhalten | Context7 | FastAPI-Docs fuer korrekte Parameter-Nutzung |

### MCP-Limitationen beachten

| Limitation | Auswirkung | Workaround |
|-----------|-----------|-----------|
| Subagenten haben KEINEN MCP-Zugriff | Debug-Agents koennen nicht direkt DB abfragen | Hauptkontext fuehrt MCP-Queries aus, Ergebnis an Agent weiterreichen |
| Playwright braucht laufendes Frontend | UI-Inspektion nur mit aktivem Stack | Frontend muss im Docker-Stack laufen |
| Serena braucht `.serena/project.yml` | LSP-Config muss korrekt sein | Config ist vorhanden (3 Sprachen konfiguriert) |
| Database MCP braucht DB-Verbindung | Query nur bei laufendem PostgreSQL | DB ist Teil des Core-Stacks |

---

## Wissenschaftliche Fundierung

Dieser Phasenplan stuetzt sich auf folgende Forschung:

| Paper | Kernaussage | Anwendung im Plan |
|-------|-------------|-------------------|
| Kalimuthu (2025) — DevOps IoT Deployment | Multi-Tiered Testing: Unit → SIL → HIL → System | Zwei-Spuren-Ansatz (Wokwi = SIL, Testfeld = HIL/System) |
| Yu et al. (2024) — Chaos Engineering IoT | Fault-Injection effektiver als statisches Load-Testing | Phase 2.5: Docker-basierte Chaos-Tests |
| Devi et al. (2024) — Self-Healing IoT | Isolation Forest fuer Erkennung UND Recovery | Phase 3: KI-Error-Analyse Stufe 2 |
| Phan & Nguyen (2025) — Anomaly Detection | Isolation Forest schlaegt LSTM bei Sensordaten | Phase 3: Algorithmus-Wahl bestaetigt |
| Chirumamilla et al. (2025) — Hybrid Pipeline | Autoencoder → Isolation Forest → LSTM | Langfrist-Strategie (Stufe 3 auf Jetson) |

**Zusammenfassungen:** `wissen/iot-automation/2025-devops-iot-deployment-hil-testing.md`, `wissen/iot-automation/2024-chaos-engineering-iot-resilience-testing.md`, `wissen/iot-automation/2024-self-healing-iot-isolation-forest.md`

---

## Ergaenzungshinweise (nicht-deterministisch)

Diese Punkte sind Beobachtungen und Empfehlungen — keine festen Vorgaben:

1. **Mosquitto-Exporter unhealthy** — Kein Einfluss auf Kernfunktion, aber sollte vor dem Testlauf gefixt werden damit MQTT-Metriken in Prometheus fliessen.

2. **MQTT-Skalierung kein Problem** — Forschung zeigt 8.900 msg/s pro Core (TBMQ-Paper). Mosquitto reicht fuer AutomationOne's aktuellen Umfang bei weitem.

3. **Frontend-Testabdeckung niedrig** — 10 Frontend-Test-Dateien vs. 97 Komponenten. Vitest-Tests sind gut (1118), aber Playwright E2E-Tests sollten fuer kritische Flows ergaenzt werden (Kalibrierung, Live-Daten, Rule-Builder).

4. **Wokwi → CI/CD Automatisierung** — Aktuell Manual Dispatch. Der Wechsel zu Push/PR-Trigger ist eine Konfigurationsaenderung in `wokwi-tests.yml`, kein Code.

5. **ai_predictions-Tabelle** — Schema existiert, ist leer. Perfekt vorbereitet fuer Isolation Forest-Ergebnisse. Kein DB-Migration noetig.

6. **auto-ops Plugin** — Ist die operative Implementierung von KI-Error-Analyse Stufe 1. Nutzt bereits Loki-Queries, Prometheus-Metriken und Error-Code-Referenz. Kann erweitert werden um Isolation Forest-Ergebnisse einzubeziehen.

7. **Security fuer Testlauf OK** — JWT_SECRET_KEY Default, DB-Credentials `god_kaiser/password`, MQTT anonymous — alles OK fuer internes Testfeld. Vor Produktion MUSS das geaendert werden.

8. **ESP32 ADC Non-Linearity** — Pi-Enhanced Processing loest das Problem serverseitig. Fuer den Testlauf mit analogen Sensoren (pH, EC) ist das relevant — Kalibrierung kompensiert den Rest.

---

## Verwandte Dateien

| Datei | Inhalt |
|-------|--------|
| `arbeitsbereiche/automation-one/systemueberblick-fuer-auto-one.md` | Vollstaendiger 7-Domain-Systemueberblick |
| `arbeitsbereiche/automation-one/STATUS.md` | Aktueller Entwicklungsstand |
| `arbeitsbereiche/automation-one/roadmap.md` | Entwicklungsplan |
| `wissen/iot-automation/ki-error-analyse-iot.md` | KI-Error-Analyse Architektur (4 Ebenen) |
| `wissen/iot-automation/grafana-prometheus-iot-monitoring.md` | Monitoring Best Practices |
| `wissen/iot-automation/mqtt-best-practices.md` | MQTT-Architektur |
| `wissen/iot-automation/fastapi-iot-backend-architektur.md` | Backend-Architektur |
| `wissen/iot-automation/esp32-sensor-kalibrierung-ph-ec.md` | Sensor-Kalibrierung |
| `wissen/iot-automation/2025-devops-iot-deployment-hil-testing.md` | Paper: DevOps + HIL |
| `wissen/iot-automation/2024-chaos-engineering-iot-resilience-testing.md` | Paper: Chaos Engineering |
| `wissen/iot-automation/2024-self-healing-iot-isolation-forest.md` | Paper: Self-Healing IoT |
| `wissen/datenanalyse/2025-anomaly-detection-comparison-sensor-data.md` | Paper: Isolation Forest vs. LSTM |
| `wissen/datenanalyse/2025-hybrid-lstm-autoencoder-iot-anomaly.md` | Paper: Hybrid-Pipeline |
