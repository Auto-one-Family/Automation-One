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
| Grafana | **Laeuft** | 26 Panels, **26 Alert-Regeln** (Phase 0 ERLEDIGT), Auto-Refresh 10s |
| Prometheus | **Laeuft** | **27 Metriken** (15 alt + 12 Phase-0 neu), 7 Scrape-Jobs |
| Loki + Promtail | **Laeuft** | Zentrale Log-Aggregation, 7d Retention, JSON-Logs |
| cAdvisor | **Laeuft** | Container-Ressourcen-Monitoring |

### Software-Stack (vorhanden)

| Schicht | Fortschritt | Testlauf-Readiness | Phase-0/1/2 Updates |
|---------|-------------|-------------------|---------------------|
| El Servador (FastAPI) | 97% | **98% bereit** — ~170 Endpoints, 12 MQTT-Handler, 9 Sensor-Libraries, **27 Prometheus-Metriken**, **Handler-Integration komplett** | Phase 0: ✅ Metriken + Handler FERTIG |
| El Trabajante (ESP32) | 92% | **95% bereit** — Full Boot bestanden, **173 Wokwi-Szenarien** (163 + 10 Error-Injection), 12 Test-Error-Codes | Phase 1: ✅ Error-Injection FERTIG |
| El Frontend (Vue3) | 90% | **93% bereit** — 129 Komponenten, 13 Pinia Stores, WebSocket stabil, **CalibrationWizard + SensorHistoryView FERTIG** | Phase 2: ✅ Frontend-Code FERTIG (Sidebar-Links fehlen) |

### Test-Suite (vorhanden)

| Suite | Tool | Umfang | Status |
|-------|------|--------|--------|
| Backend Unit | pytest | 759 Tests (109 Dateien) | GRUEN |
| Frontend Unit | Vitest | 1118 Tests (64 Dateien) | GRUEN |
| Firmware Native | Unity | 22 Tests | GRUEN |
| Wokwi Simulation | pytest + Wokwi | **173 Szenarien** (163 + 10 Error-Injection) | GRUEN |
| Wokwi CI/CD | wokwi-tests.yml | **52 CI-Szenarien** (16 Jobs + Nightly), **inkl. Error-Injection** | KONFIGURIERT |
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

### Error-System (vorhanden — Phase 0 ABGESCHLOSSEN)

| Komponente | Status | Details |
|-----------|--------|---------|
| ESP32 Error-Codes | **Definiert** | 1000-4999 (error_codes.h) + **6000-6050 Test-Codes** |
| Server Error-Codes | **Definiert** | 5000-5699 (error_codes.py) + **TestErrorCodes(IntEnum) 6000-6050** |
| Severity-Stufen | **Aktiv** | info, warning, error, critical |
| Fehler-Kategorien | **Aktiv** | sensor, actuator, mqtt, system, config, safety, **test** |
| Audit-Log-Tabelle | **Laeuft** | event_type, severity, correlation_id, error_code |
| Grafana-Alerts | **26 aktiv** | 5 Critical + 3 Warning + 3 Infrastructure + 5 Sensor + 4 Device + 6 Application |
| Prometheus-Metriken | **27 aktiv** | 15 alt + **12 Phase-0 neu**, alle Handler-integriert |
| Error-Code-Referenz | **Dokumentiert** | `.claude/reference/errors/ERROR_CODES.md` (inkl. Sektion 19: Test-Codes) |
| Wokwi-Error-Mapping | **Dokumentiert** | `.claude/reference/testing/WOKWI_ERROR_MAPPING.md` |

### Was FEHLT (identifizierte Luecken — aktualisiert 2026-02-23)

| Luecke | Bereich | Prioritaet | Status |
|--------|---------|------------|--------|
| ~~Kalibrierungs-Wizard UI~~ | ~~Frontend~~ | ~~HOCH~~ | ✅ **ERLEDIGT** — CalibrationWizard.vue + CalibrationStep.vue + calibration.ts + CalibrationView.vue |
| ~~Historische Zeitreihen-View~~ | ~~Frontend~~ | ~~HOCH~~ | ✅ **ERLEDIGT** — SensorHistoryView.vue + TimeRangeSelector.vue |
| **Sidebar-Navigation** | Frontend | **HOCH** | ❌ Links zu /calibration und /sensor-history fehlen in Sidebar.vue |
| Analyse-Profile UI | Frontend | MITTEL | Offen — Dashboard fuer Datenerfassungs-Steuerung |
| Benutzer-Management UI | Frontend | NIEDRIG | Offen — Admin-Panel (JWT/RBAC funktioniert bereits) |
| ~~Erweiterte Grafana-Alert-Regeln~~ | ~~Monitoring~~ | ~~HOCH~~ | ✅ **ERLEDIGT** — 26 Regeln aktiv (8 alt + 18 Phase-0 neu) |
| ~~Handler-Integration Metriken~~ | ~~Backend~~ | ~~KRITISCH~~ | ✅ **ERLEDIGT** — Alle 12 Update-Funktionen in Handlern integriert |
| Isolation Forest Service | Backend | MITTEL | Offen — ai_prediction.py Model FEHLT, ai_repo.py/ai_service.py sind Stubs |
| Grafana Deployment-Verifikation | Monitoring | MITTEL | Offen — 26 Alerts definiert, Grafana-Reload nach Deployment steht aus |
| MQTT-ACL | Security | NIEDRIG (fuer Testlauf) | Offen — Vorlage existiert, fuer Produktion MUSS |
| Incident-Management-Prozess | Operations | NIEDRIG | Offen — Wer macht was bei Ausfall |

---

## LOGGING-INFRASTRUKTUR — Wo was geloggt wird und wie Agenten es erreichen

> **Kritisch fuer Testlauf-Vorbereitung.** Jeder Debug-Agent muss wissen wo seine Logs liegen.

### Uebersicht: Log-Quellen und Zugriffspfade

| Quelle | Speicherort | Format | Rotation | Docker-Mount | Loki-Label | Agent |
|--------|------------|--------|----------|--------------|------------|-------|
| **Server (God Kaiser)** | `logs/server/god_kaiser.log` | JSON | RotatingFile 10MB × 10 | `./logs/server:/app/logs` | `compose_service="el-servador"` | server-debug |
| **PostgreSQL** | `logs/postgres/postgresql-YYYY-MM-DD.log` | Text | Daily + 50MB | `./logs/postgres:/var/log/postgresql` | `compose_service="postgres"` | db-inspector |
| **MQTT Broker** | stdout (kein Datei-Log) | Text | Docker json-file 10m × 3 | Kein Mount | `compose_service="mqtt-broker"` | mqtt-debug |
| **Frontend** | stdout (Browser-Console) | JSON | Docker json-file 5m × 3 | Kein Mount | `compose_service="el-frontend"` | frontend-debug |
| **ESP32 Serial (Wokwi)** | `logs/wokwi/serial/` | Text | Pro Test | Kein Mount | Nicht in Loki | esp32-debug |
| **ESP32 Serial (Real)** | `logs/current/esp32_serial.log` | Text | Manuell | Kein Mount | `compose_service="esp32-serial-logger"` (Hardware-Profil) | esp32-debug |
| **Wokwi Reports** | `logs/wokwi/reports/` | JSON/XML | Pro Test | Kein Mount | Nicht in Loki | test-log-analyst |
| **CI/CD** | GitHub Actions Artifacts | Text | Per Run | Kein Mount | Nicht in Loki | test-log-analyst (via `gh` CLI) |

### Server-Logging Detail

**Config:** `El Servador/god_kaiser_server/src/core/config.py` (LoggingSettings, Zeile 159-186)

| Setting | Default | ENV-Variable |
|---------|---------|-------------|
| Level | INFO | `LOG_LEVEL` |
| Format | json | `LOG_FORMAT` |
| File Path | logs/god_kaiser.log | `LOG_FILE_PATH` |
| Max Bytes | 10MB | `LOG_FILE_MAX_BYTES` |
| Backup Count | 10 | `LOG_FILE_BACKUP_COUNT` |

**JSON-Log-Format:**
```json
{"timestamp": "2026-02-01 10:23:45", "level": "INFO", "logger": "src.mqtt.handlers.sensor_handler", "message": "...", "request_id": "abc123"}
```

**Agent-Zugriff:** `server-debug` liest `logs/server/god_kaiser.log` direkt per Read-Tool.

### MQTT Broker Detail

**Config:** `docker/mosquitto/mosquitto.conf` (Zeile 42-54)
- Log Destination: `stdout` (KEIN File-Log seit Mosquitto v3.1)
- Log Types: error, warning, notice, information, subscribe, unsubscribe
- **MQTT-Payload-Inhalte werden NICHT geloggt** — nur Connection-Events

**Agent-Zugriff:** `mqtt-debug` nutzt `docker compose logs mqtt-broker` oder Loki-Query `{compose_service="mqtt-broker"}`. Fuer Message-Inhalte: `mosquitto_sub -h localhost -t "kaiser/#" -v`

### PostgreSQL Detail

**Config:** `docker/postgres/postgresql.conf` (Zeile 9-34)
- Slow Query Threshold: 100ms (`log_min_duration_statement`)
- Logged: INSERT/UPDATE/DELETE/DDL (`log_statement=mod`)
- Log Prefix: `%t [%p] %u@%d` (Timestamp + PID + user@db)

**Agent-Zugriff:** `db-inspector` liest `logs/postgres/postgresql-YYYY-MM-DD.log` direkt.

### ESP32 Serial Detail

**Firmware Logger:** `El Trabajante/src/utils/logger.h` + `logger.cpp`
- Log Levels: DEBUG, INFO, WARNING, ERROR, CRITICAL
- Circular Buffer (50 Eintraege, 128 Byte pro Message)
- Macros: `LOG_DEBUG()`, `LOG_INFO()`, `LOG_WARNING()`, `LOG_ERROR()`, `LOG_CRITICAL()`

**Capture-Methoden:**
| Methode | Befehl | Kontext |
|---------|--------|---------|
| Wokwi CLI | `wokwi-cli . --serial-log-file output.log` | Simulation |
| PlatformIO Monitor | `pio device monitor > serial.log 2>&1` | Echter ESP (PowerShell!) |
| Docker Serial Bridge | Hardware-Profil starten | Promtail → Loki |

**Agent-Zugriff:** `esp32-debug` liest `logs/current/esp32_serial.log`. Bei Wokwi: `logs/wokwi/serial/`.

### Frontend Detail

**Logger:** `El Frontend/src/utils/logger.ts` — `createLogger(namespace)` → `console.debug/info/warn/error`
- Kein File-basiertes Logging
- Global Error Handler in `main.ts`: `app.config.errorHandler`
- Log Viewer API: `GET /api/v1/logs` (Server-Logs via REST)

**Agent-Zugriff:** `frontend-debug` nutzt `docker compose logs el-frontend`. Browser-Console ist Blind Spot — User muss Infos liefern.

### Loki/Promtail Integration

**Promtail Config:** `docker/promtail/config.yml`
- Docker Service Discovery → Container mit Label `auto-one`
- Pipeline-Stages extrahieren `level`, `logger`, `component` Labels
- Health-Check/Metrics-Logs werden gefiltert

**Verfuegbare Loki-Labels:**
```
{compose_service="el-servador"}                    # Server
{compose_service="el-servador", level="ERROR"}     # Nur Server-Errors
{compose_service="el-frontend"}                     # Frontend
{compose_service="mqtt-broker"}                     # MQTT
{compose_service="postgres"}                        # PostgreSQL
{compose_service="esp32-serial-logger"}             # ESP32 (Hardware-Profil)
```

**Loki-Query per curl:**
```bash
curl -s "http://localhost:3100/loki/api/v1/query_range" \
  --data-urlencode 'query={compose_service="el-servador"} |= "ERROR"' \
  --data-urlencode 'limit=50'
```

### Session-Script und Agent-Log-Hierarchie

**Script:** `scripts/debug/start_session.sh`
- Erstellt Symlinks in `logs/current/` fuer schnellen Agent-Zugriff
- Exportiert optional Loki-Queries zu `*_loki_*.log`
- Generiert `STATUS.md` Zusammenfassung

**Agent-Log-Zuordnung (aus LOG_ACCESS_REFERENCE.md):**

| Agent | Primaere Quelle | Fallback |
|-------|----------------|----------|
| `server-debug` | `logs/server/god_kaiser.log` | `docker compose logs el-servador` |
| `mqtt-debug` | `docker compose logs mqtt-broker` | Loki `{compose_service="mqtt-broker"}` |
| `esp32-debug` | `logs/current/esp32_serial.log` | User-Capture |
| `frontend-debug` | `docker compose logs el-frontend` | Browser Console (User liefert) |
| `test-log-analyst` | `logs/wokwi/reports/` | `gh run view --log` |
| `db-inspector` | `logs/postgres/postgresql-*.log` | MCP Database Server |

---

## PHASE 0: FUNDAMENT — Gemeinsame Error-Taxonomie

> **Ziel:** Einheitliches Fehlersystem das BEIDE Spuren nutzen — egal ob Wokwi-Simulation oder echtes Testfeld.
> **Status: ✅ PHASE 0 ABGESCHLOSSEN** (2026-02-23 verifiziert)
> **Aufwand:** Konfiguration + Alert-Regeln, minimal neuer Code.

### 0.1 Error-Taxonomie konsolidieren ✅ ERLEDIGT

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

**✅ ERLEDIGT:** Test-Error-Block 6000-6099 implementiert. 12 Test-Codes in `TestErrorCodes(IntEnum)` (Python) und `#define ERROR_TEST_*` (C++). Dokumentiert in ERROR_CODES.md Sektion 19.

### 0.2 Grafana-Alert-Regeln erweitern ✅ ERLEDIGT

~~Aktuelle 8 Regeln → Ziel: 28+ Regeln fuer den Testlauf.~~
**Aktuell: 26 Alert-Regeln aktiv** (8 alt + 18 Phase-0 neu). 2 Regeln begruendet weggelassen (Node Exporter fehlt, cAdvisor-Bug).

**Implementierte Regeln (Empfehlung, kein Code noetig — nur `alert-rules.yml` erweitern):**

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

**Agent-Verknuepfung:** auto-ops Plugin (`/auto-ops:ops-diagnose`) aggregiert Grafana-Alert-Status und korreliert zusammenhaengende Events. System-Health Skill hat Eskalationsmatrix.

### 0.3 KI-Error-Analyse Stufe 1 aktivieren ✅ KONFIGURIERT

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
> **Status: ✅ PHASE 1 ABGESCHLOSSEN** (2026-02-23 verifiziert)
> **Vorteil:** Kein ESP32 noetig, keine Hardware-Abhaengigkeit, CI/CD-integrierbar.

### 1.1 Bestehende Wokwi-Infrastruktur ✅ ERWEITERT

| Komponente | Status | Details |
|-----------|--------|---------|
| Wokwi-Szenarien | **173 vorhanden** | 163 Normal + **10 Error-Injection** (Kategorie 11) |
| CI/CD Pipeline | **Erweitert** | Push/PR + Manual + **Nightly (cron 03:00 UTC)** |
| CI/CD Jobs | **16 Jobs, 52 Szenarien** | Inkl. **JOB 16: error-injection-tests** |
| pytest Integration | **Vorhanden** | Wokwi-Tests als pytest-Szenarien |
| HAL-Pattern | **Implementiert** | `igpio_hal.h` / `esp32_gpio_hal.h` — Hardware-Abstraktion fuer Testbarkeit |
| Error-Mapping | **Dokumentiert** | `.claude/reference/testing/WOKWI_ERROR_MAPPING.md` |

### 1.2 Erweiterungsplan ✅ IMPLEMENTIERT

**A. Wokwi-Szenarien mit Error-Injection:** ✅ 10 Szenarien erstellt

Die Wokwi-Simulation nutzt dieselbe Fehler-Taxonomie wie das Produktionstestfeld:

| Fehlertyp | Wokwi-Simulation | Error-Code |
|-----------|-------------------|------------|
| Sensor-Ausfall | Sensor-Pin nicht verbinden / Timeout simulieren | 1001 |
| WiFi-Unterbrechung | WiFi-Verbindung in Simulation trennen | 2001 |
| MQTT-Nachrichtenverlust | Broker-Response verzoegern | 2002 |
| Speicher-Knappheit | Heap-Grenzen reduzieren | 3002 |
| Watchdog-Trigger | Endlosschleife in Task simulieren | 3001 |

**Referenz:** Yu et al. (2024) identifiziert 5 Fault-Injection-Kategorien (Network Latency, Service Crash, Resource Exhaustion, Message Loss, Security Attack) — alle in Wokwi simulierbar.

**B. CI/CD-Automatisierung:** ✅ KONFIGURIERT

```
✅ ERLEDIGT: Push/PR + Manual + Nightly (cron 03:00 UTC)
   - 16 Jobs, 52 CI-Szenarien
   - Error-Injection als JOB 16 integriert
   - test-summary Job zaehlt alle Jobs
```

**Referenz:** Kalimuthu (2025) empfiehlt SIL-Tests automatisch in CI/CD, HIL-Tests manuell oder periodisch.

**C. Wokwi ↔ Error-Taxonomie Mapping:**

Wokwi-Test-Reports sollten dieselben Error-Codes und Severity-Stufen verwenden wie der Produktions-Stack. Das ermoeglicht:
- Vergleichbare Fehlerberichte zwischen Simulation und Produktion
- Gemeinsame Grafana-Dashboards fuer Error-Statistiken
- test-log-analyst Agent kann beide Quellen analysieren

Wichtig: Dennoch beide Systeme immer klar voneinander trennen.

### 1.3 Wokwi-spezifische Ressourcen ✅ AKTUALISIERT

| Ressource | Pfad / Ort | Status |
|-----------|-----------|--------|
| Wokwi-Szenarien | `El Trabajante/tests/wokwi/scenarios/` (14 Kategorien) | **173 Szenarien** |
| Error-Injection | `El Trabajante/tests/wokwi/scenarios/11-error-injection/` | **10 Szenarien** |
| HAL-Interface | `El Trabajante/src/drivers/hal/igpio_hal.h` | Implementiert |
| CI/CD Pipeline | `.github/workflows/wokwi-tests.yml` | Push/PR + Manual + **Nightly** |
| pytest-Wokwi-Config | `tests/wokwi/conftest.py` | Konfiguriert |
| Seed-Script | `scripts/seed_wokwi_esp.py` | Testdaten-Generator |
| Error-Mapping | `.claude/reference/testing/WOKWI_ERROR_MAPPING.md` | **Dokumentiert** |

### 1.4 Wokwi-Logging fuer Testlauf

**Wo Wokwi-Logs landen:**

| Log-Typ | Pfad | Format | Erstellt durch |
|---------|------|--------|---------------|
| Serial-Output | `logs/wokwi/serial/<kategorie>/<szenario>_<timestamp>.log` | Text | `wokwi-cli --serial-log-file` |
| MQTT-Capture | `logs/wokwi/mqtt/<kategorie>/<szenario>_<timestamp>.log` | Text | `mosquitto_sub` im Makefile |
| Test-Report | `logs/wokwi/reports/test_report_<timestamp>.json` | JSON | pytest |
| JUnit-Report | `logs/wokwi/reports/junit_<timestamp>.xml` | XML | pytest (CI) |
| Error-Injection | `logs/wokwi/error-injection/error_*.log` | Text | Error-Injection-Szenarien |

**Agent-Zugriff:**
- `esp32-debug`: Liest `logs/wokwi/serial/` fuer Serial-Analyse
- `test-log-analyst`: Liest `logs/wokwi/reports/` fuer Test-Ergebnisse, `gh run view --log` fuer CI
- `mqtt-debug`: Liest `logs/wokwi/mqtt/` fuer MQTT-Nachrichten waehrend Simulation

---

## PHASE 2: SPUR B — Produktionstestfeld aufbauen

> **Ziel:** Echter ESP32 mit echten Sensoren, vollstaendiger Docker-Stack, Monitoring, KI-Error-Analyse.
> **Status: ⚠️ IMPLEMENTIERUNG ABGESCHLOSSEN — DEPLOYMENT/HARDWARE-VERIFIKATION OFFEN**
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

### 2.3 Kritischer Pfad — Was muss funktionieren (aktualisiert 2026-02-23)

| # | Anforderung | Aktueller Stand | Was fehlt |
|---|-------------|----------------|-----------|
| 1 | Sensordaten fliessen E2E | **95% bereit** | ESP32 muss konfiguriert sein + in DB registriert |
| 2 | Kalibrierung | **95% bereit** | ✅ CalibrationWizard FERTIG — ❌ Sidebar-Link fehlt |
| 3 | Live-Daten im Frontend | **95% bereit** | ✅ SensorHistoryView FERTIG — ❌ Sidebar-Link fehlt |
| 4 | Logic Engine | **95% bereit** | End-to-End implementiert, Safety-System aktiv |
| 5 | Safety-System | **100% bereit** | Emergency-Stop, ConflictManager, RateLimiter, LoopDetector |

### 2.4 Frontend-Vervollstaendigung (aktualisiert 2026-02-23)

| UI-Komponente | Prioritaet | Status | Dateien |
|---------------|-----------|--------|---------|
| ~~Kalibrierungs-Wizard~~ | ~~HOCH~~ | ✅ **FERTIG** | `CalibrationWizard.vue`, `CalibrationStep.vue`, `calibration.ts`, `CalibrationView.vue` |
| ~~Zeitreihen-Chart-View~~ | ~~HOCH~~ | ✅ **FERTIG** | `SensorHistoryView.vue`, `TimeRangeSelector.vue` |
| **Sidebar-Links** | **HOCH** | ❌ **FEHLT** | `/calibration` und `/sensor-history` nicht in `Sidebar.vue` |
| Analyse-Profile Dashboard | MITTEL | Offen | Datenerfassungs-Steuerung |
| Admin/User-Management | NIEDRIG | Offen | JWT/RBAC funktioniert bereits |
| Mobile-Responsive | NIEDRIG | Offen | Tailwind CSS vorhanden |

**Fuer den ERSTEN Testlauf:** Kalibrierungs-Wizard und Zeitreihen-View sind FERTIG. **Einzige Frontend-Luecke: Sidebar-Navigation.**

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

## Phasen-Uebersicht (Reihenfolge, nicht Zeitplan) — aktualisiert 2026-02-23

| Phase | Fokus | Status | Verbleibend |
|-------|-------|--------|-------------|
| **0** | Error-Taxonomie + Grafana-Alerts erweitern | ✅ **ABGESCHLOSSEN** | Grafana-Deployment-Verifikation (Reload) |
| **1** | Wokwi-Simulation stabilisieren + CI/CD automatisieren | ✅ **ABGESCHLOSSEN** | Makefile-Echo (22→52), lokaler/CI Test-Run |
| **2** | Produktionstestfeld aufbauen + Frontend-Luecken schliessen | ⚠️ **CODE FERTIG** | Sidebar-Links, Deployment, Hardware-Verifikation |
| **3** | KI-Error-Analyse (Stufe 1 sofort, Stufe 2 iterativ) | 🔲 **OFFEN** | ai_prediction Model + Repo + Service |
| **4** | Integration beider Spuren, Dashboards, Feedback-Loop | 🔲 **OFFEN** | Braucht Phase 2+3 |

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

3. **Frontend-Testabdeckung niedrig** — 10 Frontend-Test-Dateien vs. 129 Komponenten. Vitest-Tests sind gut (1118), aber Playwright E2E-Tests sollten fuer kritische Flows ergaenzt werden (Kalibrierung, Live-Daten, Rule-Builder).

4. ~~**Wokwi → CI/CD Automatisierung** — Aktuell Manual Dispatch.~~ ✅ **ERLEDIGT** — Push/PR + Nightly konfiguriert.

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
