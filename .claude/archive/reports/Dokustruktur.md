# AutomationOne - Dokumentations-Inventur

> **Aktualisiert:** 2026-02-01
> **Zweck:** Vollständige Übersicht aller Markdown-Dokumentation im Projekt

---

## Übersicht

| Kategorie | Anzahl Dateien | Beschreibung |
|-----------|----------------|--------------|
| `.claude/` (KI-Agent Doku) | 21 | Hauptdokumentation, Commands, Reports |
| `El Frontend/Docs/` | ~85 | Frontend-Dokumentation, UI, System Flows |
| `El Servador/` (Server) | ~23 | Server-Dokumentation, Tests |
| `El Trabajante/docs/` (ESP32) | ~20 | ESP32-Firmware-Dokumentation |
| Root-Verzeichnis | ~8 | Projekt-README, Hierarchie |
| ARCHIV (Legacy) | ~60 | Alte Frontend-Dokumentation |
| Library READMEs (ignorieren) | ~40 | PlatformIO/venv Dependencies |

**Relevante Projekt-Dokumentation:** ~210 Dateien (exkl. Dependencies)
**Gesamtzahl .md Dateien:** 272

---

## 1. `.claude/` - KI-Agent Dokumentation (21 Dateien)

### 1.1 Hauptdokumente

| Datei | Größe | Beschreibung |
|-------|-------|--------------|
| `CLAUDE.md` | 74K | **Hauptdokumentation** - ESP32, Server, Architektur |
| `CLAUDE_SERVER.md` | 90K | **Server-spezifische KI-Dokumentation** |
| `CLAUDE_FRONTEND.md` | 32K | **Frontend-spezifische KI-Dokumentation** |
| `README.md` | 16K | Übersicht `.claude/` Ordner |
| `TEST_WORKFLOW.md` | 38K | Test-Infrastruktur Details |
| `Test_PLAN.md` | 21K | Test-Strategie |
| `WORKFLOW_PATTERNS.md` | 18K | Code-Patterns und Beispiele |
| `ARCHITECTURE_DEPENDENCIES.md` | 9,5K | Modul-Abhängigkeiten |

### 1.2 `.claude/commands/` - Slash Commands

```
commands/
├── README.md                    4,0K   Slash Commands Übersicht
├── esp32/
│   ├── build.md                 2,5K   /esp32:build
│   ├── test.md                  1,8K   /esp32:test
│   └── test-category.md         3,0K   /esp32:test-category
├── integration/
│   └── full-test.md             9,6K   /integration:full-test
└── server/
    ├── Datenbanken.md           3,2K   /server:Datenbanken
    └── test.md                  1,6K   /server:test
```

### 1.3 `.claude/reports/` - Test & Bug Reports

| Datei | Größe | Beschreibung |
|-------|-------|--------------|
| `Storage_Manager_API_Audit_Report.md` | 19K | Storage Manager Audit |
| `Dokustruktur.md` | 14K | Diese Datei |
| `E2E_BUG_REPORT.md` | 8,6K | E2E Bug Report |

#### Bug-Tracking Ordner

```
reports/BugsFound/
├── Esp32_Frimware.md     51 Bytes   ESP32 Firmware Bugs
├── Frontend.md           0 (leer)    Frontend Bugs
└── Server.md             0 (leer)    Server Bugs
```

---

## 2. `El Frontend/Docs/` - Frontend Dokumentation (~85 Dateien)

### 2.1 Hauptdokumente

| Datei | Größe | Beschreibung |
|-------|-------|--------------|
| `Developer_Onboarding.md` | 46K | Entwickler-Einführung |
| `DASHBOARD_UI_ANALYSE.md` | 24K | Dashboard UI Analyse |
| `Codebase_Analysis_Extended.md` | 21K | Erweiterte Codebase-Analyse |
| `DEBUG_ARCHITECTURE.md` | 19K | Debug-Architektur |
| `FRONTEND_EVENT_SYSTEM_BERICHT.md` | 17K | Event-System Bericht |
| `System_Flows_Analysis_Report.md` | 17K | System Flows Analyse |
| `dashboard-analysis.md` | 16K | Dashboard Analyse |
| `system-monitor-analysis.md` | 15K | System Monitor |
| `toast-analysis.md` | 13K | Toast Analyse |
| `websocket-analysis.md` | 12K | WebSocket Analyse |
| `ui-patterns-analysis.md` | 16K | UI Patterns |
| `correlation-analysis.md` | 9,2K | Korrelations-Analyse |
| `APIs.md` | 9,2K | API-Referenz |

### 2.2 `El Frontend/Docs/Next Steps/` - Planungsdokumente

| Datei | Größe | Beschreibung |
|-------|-------|--------------|
| `2.Logging.md` | 143K | **Größte Datei** - Logging-Implementierung |
| `ACTUATOR_PLAN.md` | 100K | Aktor-System Plan |
| `AAA_Safety_Ecosystem_Improvement/Analyse_IST_Zustand.md` | 60K | Safety Ecosystem |
| `ESP_LIFECYCLE_FULL_ANALYSIS.md` | 42K | ESP Lifecycle Analyse |
| `2.GPIO_STATUS_PHASE1_IMPLEMENTATION.md` | 40K | GPIO Status Phase 1 |
| `AAAPlan.md` | 35K | Hauptplan |
| `ACTUATOR_SYSTEM_ANALYSE.md` | 31K | Aktor-System Analyse |
| `1.Wokwiki.md` | 27K | Wokwi Integration |
| `3.LogicEngine.md` | 21K | Logic Engine Plan |
| `4.CI_Pipeline.md` | 21K | CI/CD Pipeline |
| `Bugs_Found.md` | 17K | Gefundene Bugs |
| `00Readme.md` | 5,5K | Next Steps Übersicht |

#### `Frontend complete implementation/`

| Datei | Größe | Beschreibung |
|-------|-------|--------------|
| `BACKEND_API_REFERENCE.md` | 122K | **Sehr große Datei** - Backend API Referenz |
| `Phase 3/Phase3_Logic_Tests_and_analysis.md` | 65K | Phase 3 Logic Tests |
| `Phase_2_Core_Services/Backend_Analyse_VERIFIED.md` | 59K | Backend Analyse Verified |
| `Phase_2_Core_Services/Backend_Analyse.md` | 51K | Backend Analyse |
| `AAA_Frontend_Containers_für_Phasen.md` | 47K | Frontend Containers |
| `Phase1_.../Phase_1_Frontend.md` | 47K | Phase 1 Frontend |
| `Phase_2_Core_Services/Phase_2_Frontend.md` | 33K | Phase 2 Frontend |
| `AAABugbot_integration_guide.md` | 7,0K | BugBot Integration |
| `AAAManagereinführung.md` | 2,6K | Manager Einführung |

### 2.3 `El Frontend/Docs/System Flows/` - System-Ablaufdiagramme (14 Flows)

| Datei | Größe | Beschreibung |
|-------|-------|--------------|
| `10-subzone-safemode-pin-assignment-flow.md` | 78K | Subzone/SafeMode Flow |
| `07-error-recovery-flow.md` | 57K | Error Recovery Flow |
| `13-logic-engine-flow.md` | 41K | Logic Engine Flow |
| `04-05-runtime-config-flow.md` | 34K | Runtime Config Flow |
| `09-sensor-library-flow.md` | 34K | Sensor Library Flow |
| `14-satellite-cards-flow.md` | 31K | Satellite Cards Flow |
| `02-sensor-reading-flow.md` | 31K | Sensor Reading Flow |
| `03-actuator-command-flow.md` | 31K | Actuator Command Flow |
| `12-user-management-flow.md` | 29K | User Management Flow |
| `11-authentication-authorization-flow.md` | 26K | Auth Flow |
| `01-boot-sequence.md` | 21K | Boot Sequence Flow |
| `06-mqtt-message-routing-flow.md` | 19K | MQTT Routing Flow |
| `08-zone-assignment-flow.md` | 16K | Zone Assignment Flow |

### 2.4 `El Frontend/Docs/UI/` - UI-Komponenten Dokumentation

| Datei | Größe | Beschreibung |
|-------|-------|--------------|
| `Dashboard.md` | 83K | Dashboard View |
| `Benutzer.md` | 60K | Benutzer View |
| `Vision.md` | 60K | Vision/Roadmap |
| `Datenbank.md` | 37K | Datenbank View |
| `02-Individual-Views-Summary.md` | 37K | Views Summary |
| `Tests.md` / `Tests/README.md` | 34K/33K | Tests View |
| `System.md` / `System/README.md` | 30K/29K | System View |
| `Audit.md` | 28K | Audit View |
| `UserManagementView-Documentation.md` | 25K | User Management |
| `Logs.md` / `Logs/README.md` | 25K/24K | Logs View |
| `06-Components-Library.md` | 22K | Components Library |
| `Logik.md` | 21K | Logic View |
| `01-MockEspView.md` | 19K | Mock ESP View |
| `Sensoren.md` / `Sensoren/README.md` | 18K/17K | Sensoren View |
| `MQTT.md` | 16K | MQTT View |
| `Aktoren.md` | 15K | Aktoren View |

### 2.5 Weitere Frontend-Unterordner

```
El Frontend/Docs/
├── Bugs_and_Phases/
│   ├── Bugs_Found.md              13K
│   ├── Sensor_Flow_Bug_Analysis.md 24K
│   └── Whatstodo.md               13K
├── database-audit/
│   ├── CHANGES.md                  6,0K
│   ├── audit_logs-analysis.md      4,0K
│   ├── esp_devices-analysis.md     2,6K
│   ├── actuator_configs-analysis.md 2,0K
│   └── sensor_configs-analysis.md  2,1K
└── phase1-analysis/
    ├── 00-synthese-bericht.md      9,3K
    ├── 04-unified-event-list.md    14K
    ├── 05-navigation-deep-linking.md 14K
    ├── 06-ui-patterns.md           13K
    ├── 02-filter-mechanism.md      12K
    └── ...
```

---

## 3. `El Servador/` - Server Dokumentation (~18 relevante Dateien)

### 3.1 `El Servador/docs/`

| Datei | Größe | Beschreibung |
|-------|-------|--------------|
| `SENSOR_IMPLEMENTATION_PHASE_2_3.md` | 53K | Sensor Implementation |
| `AUTHENTICATION_AUDIT.md` | 21K | Authentication Audit |
| `ESP32_TESTING.md` | 20K | ESP32 Test Framework |
| `ARCHITECTURE_DEPENDENCIES.md` | 19K | Architektur Dependencies |
| `codebase-analysis-report.md` | 14K | Codebase Analyse |
| `MQTT_TEST_PROTOCOL.md` | 11K | MQTT Test Protokoll |
| `TEST_COVERAGE_ANALYSIS.md` | 11K | Test Coverage |

### 3.2 `El Servador/god_kaiser_server/`

| Datei | Größe | Beschreibung |
|-------|-------|--------------|
| `.claude/Plan.md` | 116K | Server Plan (sehr groß) |
| `.claude/CODEBASE_ANALYSIS.md` | 34K | Server Codebase Analyse |
| `tests/Logic_deep_Hardware_TEST_SCENARIOS.md` | 65K | Logic Hardware Tests |
| `docs/MOCK_ESP_SENSOR_SIMULATION.md` | 22K | Mock ESP Simulation |
| `PRODUCTION_READINESS.md` | 17K | Production Readiness |
| `HARDWARE_VALIDATION_TEST_PLAN_REVIEW.md` | 16K | Hardware Validation |
| `FIX_MQTT_PROBLEM.md` | 3,6K | MQTT Problem Fix |
| `README.md` | 468 Bytes | Server README |

### 3.3 Root-Level Server Docs

| Datei | Größe | Beschreibung |
|-------|-------|--------------|
| `README.md` | 6,2K | El Servador README |
| `TEST_SETUP.md` | 2,8K | Test Setup Anleitung |

---

## 4. `El Trabajante/docs/` - ESP32 Firmware Dokumentation (~20 relevante Dateien)

### 4.1 Hauptdokumente

| Datei | Größe | Beschreibung |
|-------|-------|--------------|
| `Mqtt_Protocoll.md` | 125K | **MQTT-Spezifikation** (größte ESP32-Doku) |
| `System_Overview.md` | 100K | Codebase-Analyse |
| `API_REFERENCE.md` | 93K | **Modul-API-Referenz** |
| `MQTT_CLIENT_API.md` | 41K | MQTT-Client-API |
| `SERVER_ANMELDEPROZESS_ANALYSE.md` | 33K | Server Anmeldeprozess |
| `ESP32_ANMELDEPROZESS_ANALYSE.md` | 32K | ESP32 Anmeldeprozess |
| `NVS_KEYS.md` | 15K | NVS-Speicher-Keys |
| `Roadmap.md` | 5,0K | Phasen-Status |

### 4.2 `Dynamic Zones and Provisioning/`

| Datei | Größe | Beschreibung |
|-------|-------|--------------|
| `PROVISIONING_DESIGN.md` | 34K | Provisioning Design |
| `ANALYSIS.md` | 31K | Analyse |
| `INTEGRATION_GUIDE.md` | 28K | Integration Guide |
| `PROVISIONING.md` | 17K | AP-Mode, Zero-Touch |
| `DYNAMIC_ZONES_IMPLEMENTATION.md` | 15K | Zone-System |

### 4.3 `system-flows/` (9 Flows)

| Datei | Größe | Beschreibung |
|-------|-------|--------------|
| `01-boot-sequence.md` | 47K | Boot Sequence |
| `09-subzone-management-flow.md` | 45K | Subzone Management |
| `06-mqtt-message-routing-flow.md` | 45K | MQTT Routing |
| `07-error-recovery-flow.md` | 41K | Error Recovery |
| `04-runtime-sensor-config-flow.md` | 40K | Sensor Config |
| `05-runtime-actuator-config-flow.md` | 40K | Actuator Config |
| `03-actuator-command-flow.md` | 34K | Actuator Command |
| `02-sensor-reading-flow.md` | 31K | Sensor Reading |
| `08-zone-assignment-flow.md` | 31K | Zone Assignment |
| `README.md` | 9,4K | Flows Übersicht |

### 4.4 `tests/wokwi/` - Wokwi Tests

```
tests/wokwi/
├── README.md                      9,8K   Wokwi-Test Dokumentation
├── PHASE1_VALIDATION_REPORT.md    14K    Phase 1 Validation
└── scenarios/
    ├── 08-onewire/README.md       6,9K
    ├── 09-hardware/README.md      4,9K
    ├── 10-nvs/README.md           12K
    └── gpio/README.md             3,9K
```

### 4.5 Weitere

| Datei | Größe | Beschreibung |
|-------|-------|--------------|
| `CHANGELOG.md` | 21K | Versionshistorie (Phase 1-9) |
| `test/_archive/README.md` | 5,2K | Archivierte Tests |

---

## 5. Root-Verzeichnis Dokumentation

| Datei | Größe | Beschreibung |
|-------|-------|--------------|
| `KI_INTEGRATION_IMPLEMENTATION.md` | 140K | **Größte Root-Datei** |
| `Hierarchie.md` | 40K | System-Hierarchie |
| `README.md` | 33K | Projekt-README |
| `LOGIC_SYSTEM_ANALYSE_ARCHIV.md` | 24K | Logic System Archiv |
| `BUGBOT.md` | 8,7K | BugBot Dokumentation |

---

## 6. ARCHIV - Legacy Dokumentation (~60 Dateien)

> **Hinweis:** `ARCHIV/growy-frontend/` enthält alte Frontend-Dokumentation.
> Diese sind für aktive Entwicklung nicht mehr relevant.

### Größte archivierte Dokumente

| Datei | Größe | Beschreibung |
|-------|-------|--------------|
| `README_frontend.md` | 391K | Altes Frontend README |
| `umbau.md` | 57K | Umbau-Dokumentation |
| `UPDATE_FRONTEND.md` | 49K | Frontend Updates |
| `ServerFrontend.md` | 34K | Server-Frontend |
| `SERVER_ENTWICKLER_ANFORDERUNG.md` | 33K | Server-Anforderungen |
| `Frontend_Auswertung.md` | 29K | Frontend-Auswertung |

---

## 7. Quick Reference - Was suche ich wo?

| Ich suche... | Datei/Ordner |
|--------------|--------------|
| **ESP32 Entwicklung** | `.claude/CLAUDE.md` |
| **Server Entwicklung** | `.claude/CLAUDE_SERVER.md` |
| **Frontend Entwicklung** | `.claude/CLAUDE_FRONTEND.md` |
| **MQTT Protokoll (ESP32)** | `El Trabajante/docs/Mqtt_Protocoll.md` |
| **API Referenz (ESP32)** | `El Trabajante/docs/API_REFERENCE.md` |
| **API Referenz (Server)** | `El Frontend/Docs/Next Steps/.../BACKEND_API_REFERENCE.md` |
| **System Flows (Frontend)** | `El Frontend/Docs/System Flows/` (14 Flows) |
| **System Flows (ESP32)** | `El Trabajante/docs/system-flows/` (9 Flows) |
| **UI Dokumentation** | `El Frontend/Docs/UI/` |
| **Test-Strategie** | `.claude/Test_PLAN.md`, `.claude/TEST_WORKFLOW.md` |
| **Bug Reports** | `.claude/reports/BugsFound/` |
| **Slash Commands** | `.claude/commands/README.md` |
| **Wokwi Tests** | `El Trabajante/tests/wokwi/README.md` |
| **Logging** | `El Frontend/Docs/Next Steps/2.Logging.md` |
| **Logic Engine** | `El Frontend/Docs/Next Steps/3.LogicEngine.md` |
| **Provisioning** | `El Trabajante/docs/Dynamic Zones and Provisioning/` |
| **Developer Onboarding** | `El Frontend/Docs/Developer_Onboarding.md` |

---

## 8. Statistik nach Größe (Top 20)

| Rang | Datei | Größe |
|------|-------|-------|
| 1 | `ARCHIV/.../README_frontend.md` | 391K |
| 2 | `El Frontend/Docs/Next Steps/2.Logging.md` | 143K |
| 3 | `./KI_INTEGRATION_IMPLEMENTATION.md` | 140K |
| 4 | `El Trabajante/docs/Mqtt_Protocoll.md` | 125K |
| 5 | `El Frontend/Docs/Next Steps/.../BACKEND_API_REFERENCE.md` | 122K |
| 6 | `El Servador/god_kaiser_server/.claude/Plan.md` | 116K |
| 7 | `El Frontend/Docs/Next Steps/ACTUATOR_PLAN.md` | 100K |
| 8 | `El Trabajante/docs/System_Overview.md` | 100K |
| 9 | `El Trabajante/docs/API_REFERENCE.md` | 93K |
| 10 | `.claude/CLAUDE_SERVER.md` | 90K |
| 11 | `El Frontend/Docs/UI/Dashboard.md` | 83K |
| 12 | `El Frontend/Docs/System Flows/10-subzone-safemode...md` | 78K |
| 13 | `.claude/CLAUDE.md` | 74K |
| 14 | `El Servador/.../tests/Logic_deep_Hardware_TEST_SCENARIOS.md` | 65K |
| 15 | `El Frontend/Docs/Next Steps/.../Phase3_Logic_Tests...md` | 65K |
| 16 | `El Frontend/Docs/UI/Benutzer.md` | 60K |
| 17 | `El Frontend/Docs/UI/Vision.md` | 60K |
| 18 | `El Frontend/Docs/Next Steps/.../Analyse_IST_Zustand.md` | 60K |
| 19 | `El Frontend/Docs/Next Steps/.../Backend_Analyse_VERIFIED.md` | 59K |
| 20 | `El Frontend/Docs/System Flows/07-error-recovery...md` | 57K |

---

## 9. Leere/Ungenutzte Dateien

| Datei | Status |
|-------|--------|
| `.claude/reports/BugsFound/Frontend.md` | 0 Bytes - leer |
| `.claude/reports/BugsFound/Server.md` | 0 Bytes - leer |
| `El Frontend/Docs/Next Steps/AAA_Safety_Ecosystem_Improvement/Plan.md` | 0 Bytes - leer |
| `El Frontend/Docs/Next Steps/Frontend.../AAAEntwicklerbefehl.md` | 0 Bytes - leer |
| `El Frontend/Docs/Next Steps/Backend.../BugReport.md` | 0 Bytes - leer |
| `ARCHIV/growy-frontend/ZZZZ.md` | 0 Bytes - leer |

---

## 10. Wartungsempfehlungen

1. **Konsolidierung:** `.claude/Next Steps/` wurde zu `El Frontend/Docs/Next Steps/` migriert
2. **Leere Dateien:** 6 leere Dateien könnten entfernt oder befüllt werden
3. **ARCHIV:** 60 Legacy-Dateien (~700KB) könnten archiviert/entfernt werden
4. **Große Dateien:** 5 Dateien > 100K - evtl. aufteilen für bessere Übersicht
5. **Duplikate:** System Flows existieren sowohl in Frontend als auch ESP32 docs

---

**Letzte Aktualisierung:** 2026-02-01
