# AutomationOne — Testinfrastruktur Phasenplan Index

> **Erstellt:** 2026-02-21
> **Aktualisiert:** 2026-03-02 (Phase 4 erweitert: 5 Subphasen 4A-4E, Quick Action Ball + Alert-Config + Component Tab IN 4A integriert, 3 neue Recherchen, 32 Alerts verifiziert)
> **Ordner:** `.claude/reports/current/testrun-phasen/`

---

## Dokumente

| Datei | Inhalt | Impl-Status |
|-------|--------|-------------|
| [00_MASTER_PLAN.md](./00_MASTER_PLAN.md) | Gesamtplan, Ressourcen-Inventar, **Logging-Infrastruktur**, MCP-Integration, **Wokwi MCP Server**, **Closed-Loop-Architektur**, 16+ Papers, **3 neue Recherchen** | Referenz (aktualisiert 2026-03-02) |
| [PHASE_0_ERROR_TAXONOMIE.md](./PHASE_0_ERROR_TAXONOMIE.md) | Error-Taxonomie, Test-Codes 6000-6099, 32 Grafana-Alerts, KI Stufe 1 | ✅ **ABGESCHLOSSEN** |
| [PHASE_1_WOKWI_SIMULATION.md](./PHASE_1_WOKWI_SIMULATION.md) | 10 Error-Injection, CI/CD, **Wokwi MCP Server Integration**, Agent-Driven SIL-Testing | ✅ **ABGESCHLOSSEN** + MCP-Extension |
| [PHASE_2_PRODUKTIONSTESTFELD.md](./PHASE_2_PRODUKTIONSTESTFELD.md) | Docker-Stack, ESP32, Frontend (Wizard + Zeitreihen + Sidebar FERTIG), Chaos Engineering, **Wokwi MCP Debugging** | ⚠️ **Code fertig, Deploy offen** |
| [PHASE_3_KI_ERROR_ANALYSE.md](./PHASE_3_KI_ERROR_ANALYSE.md) | Rule-based (Stufe 1 ✅ via 32 Alerts), Isolation Forest (Stufe 2 — AI Model existiert, Service STUB), **LLM + KG RCA (Stufe 3)**, **Self-Healing-Bridge**, **NetworkX KG**, Signal-Coverage-Luecke | ⚠️ **Stufe 1 aktiv, Stufe 2+3 offen** |
| [PHASE_4_INTEGRATION.md](./PHASE_4_INTEGRATION.md) | **5 Subphasen:** 4A Notification-Stack + Quick Action Ball + Alert-Config (~50-65h, 8 Bloecke), 4B Unified Alert Center (ISA-18.2), 4C Plugin-System, 4D Diagnostics Hub, 4E Hardware-Test 2. **~80-110h Gesamtaufwand.** Error-Reports, Dashboards, Closed-Loop, Frontend Tool-Integration | ⚠️ **~15%, Planung komplett** |
| [OPS_READINESS.md](./OPS_READINESS.md) | Operationale Readiness, Metriken-Check, Readiness-Matrix | Aktualisiert |
| [PHASE_0_2_COMPLETION_REPORT.md](./PHASE_0_2_COMPLETION_REPORT.md) | Vollstaendige Verifikation aller implementierten Dateien | Aktualisiert |

---

## Phasen-Reihenfolge

```
Phase 0 (Fundament)        ✅ DONE (32 Alerts, 27+ Metriken)
  ├──► Phase 0.5 (CI/CD)   ⚠️ 4/8 GRUEN
  ├──► Phase 1 (Wokwi)     ✅ DONE (7/7) ──────────────────────────────────────┐
  └──► Phase 2 (Produktion) ⚠️ Code done ──► Phase 3 (KI) ⚠️ 35% ──┐         │
                                                                      │         │
                              Voraussetzungen (~30h):                 │         │
                              Logging Fix + Loki + Logic Engine       │         │
                              + Mock-Trockentest                      │         │
                                         │                            │         │
                                         ▼                            ▼         ▼
                              Phase 4A (Notification + QAB + Alert-Config, ~50-65h)
                              ├── Gruppe 1: Email-Service + Inbox + Grafana (4A.1-4A.3)
                              ├── Gruppe 2: Quick Action Ball (4A.4-4A.6, nach 4A.1-4A.3)
                              └── Gruppe 3: Alert-Config + Component Tab (4A.7-4A.8, nach 4A.4)
                                         │
                              Phase 4B (Alert Center, 15-20h)
                                         │
                              Phase 4C (Plugins, 15-20h)  ←─┐
                              Phase 4D (Diagnostics, 20-25h) │ parallel
                              Phase 4E (HW-Test 2, 10-15h) ──┘
```

## Cross-Referenzen

| Von | Nach | Warum |
|-----|------|-------|
| Phase 0 → Phase 1 | Error-Codes + Test-Codes 6000-6099 | Wokwi-Szenarien nutzen Error-Taxonomie |
| Phase 0 → Phase 0.5 | CI/CD-Basis | Phase 0.5 braucht Phase 0 Error-Codes fuer Tests |
| Phase 0 → Phase 2 | Grafana-Alerts (32) | Produktion nutzt Alerts fuer Monitoring |
| Phase 1 → Phase 4 | Wokwi-Error-Mapping + **Wokwi MCP** | Integration braucht Wokwi-Reports + MCP-Feedback |
| Phase 1 (MCP) → Phase 3 | Wokwi MCP Serial-Output | KI-Error-Analyse nutzt MCP-gesteuerte Simulation fuer Anomalie-Validierung |
| Phase 1 (MCP) → Phase 4E | Closed-Loop Agent | Agent-Driven Testing nutzt Wokwi MCP direkt |
| Phase 2 → Phase 3 | Sensordaten fliessen | Isolation Forest braucht echte Daten |
| Phase 2 → Phase 4D | Produktions-Audit-Logs | Diagnostics Hub braucht Produktionsdaten |
| Phase 3 → Phase 4B | AI-Predictions + **KG-RCA** | Alert Center zeigt Anomalien + kausale Graphen |
| Phase 3 → Phase 4D | Isolation Forest Scores | Diagnostics Hub zeigt IF-Ergebnisse |
| Phase 4A → Phase 4B | Notification-Routing | Alert Center nutzt Notification-Stack fuer Email/WS |
| Phase 4B → Phase 4C | Alert-Actions | Plugin-System kann aus Alerts Actions triggern |
| Phase 4C → Phase 4D | Plugin-Status | Diagnostics Hub zeigt Plugin-Gesundheit |
| Phase 4D → Phase 4E | Diagnose-Tools bereit | HW-Test 2 nutzt volles Diagnose-Toolset |
| Phase 4E → Phase 1 | Feedback-Loop | Produktionsfehler werden Wokwi-Regression |
| **Masterplan** → Alle | Wokwi MCP Server, Closed-Loop-Architektur, 16+ Papers | Wissenschaftliche Fundierung + MCP-Config |
| **Phase 4A (Gruppe 1)** → Phase 4A (Gruppe 2+3) | Notification-Stack | Quick Action Ball + Alert-Config brauchen NotificationRouter aus 4A.1 |
| **Phase 4A (4A.8)** → Phase 4D | Runtime-Tracking-Daten | Diagnostics Hub nutzt Runtime/Maintenance-Daten aus Component Tab |

## Phase 4 Voraussetzungen

| # | Auftrag | Aufwand | Phase-Abhaengigkeit |
|---|---------|---------|---------------------|
| 1 | `auftrag-logging-multi-layer-fix.md` | ~4-5h | 4D (Diagnostics) |
| 2 | `auftrag-loki-pipeline-verifikation.md` | ~6-8h | 4D (Diagnostics) |
| 3 | `auftrag-logic-engine-volltest.md` | ~10-12h | 4C (Plugins) |
| 4 | `auftrag-mock-trockentest.md` | ~8-10h | 4E (HW-Test 2) |

## Wissenschaftliche Fundierung (Ueberblick)

| Themenfeld | Papers | Primaer-Phase |
|------------|--------|---------------|
| Testinfrastruktur & SIL | Kalimuthu, Balan, Presti, Yu | Phase 1, Phase 2 |
| Anomalie-Erkennung | Phan, Devi, Chirumamilla | Phase 3 Stufe 2 |
| Agent-Driven Testing | Naqvi, Chan & Alalfi, Abtahi | Phase 1 MCP, Phase 4E |
| Causal Graph RCA | LLMs-DCGRCA, TAAF, FVDebug, TRAIL | Phase 3 Stufe 3 |
| Multi-Agent Debugging | TraceCoder | Phase 4D |
| **Alert UX & ISA-18.2** | ISA-18.2/IEC 62682, ThingsBoard, PagerDuty | **Phase 4B** |
| **LLM Root-Cause** | Pedroso (2025), LEAT (2025), AetherLog (2024) | **Phase 3 Stufe 3, Phase 4D** |
| **FAB Usability** | Pibernik (2019), Umar (2024), Farooq (2025) | **Phase 4A (4A.4-4A.6)** |
| **Alert Fatigue IoT** | DIADEM-X (2025), RPM Alarm Classification (2023) | **Phase 4A (4A.7)** |

## Wissensbasis (Recherchen 2026-03)

| Datei | Inhalt |
|-------|--------|
| `wissen/datenanalyse/forschungsbericht-ki-monitoring-iot-2026-03.md` | 16 Papers Synthese, 11 Forschungsluecken |
| `wissen/iot-automation/iot-alert-email-notification-architektur-2026.md` | Alert UX + Email (Resend vs. SMTP) |
| `wissen/iot-automation/diagnostics-hub-plugin-system-hil-testing-recherche-2026.md` | Diagnostics + Plugin + HIL |
| `wissen/iot-automation/unified-alert-center-ux-best-practices.md` | Alert Center UX (Grafana/HA/PagerDuty) |
| `arbeitsbereiche/automation-one/auftrag-forschung-ki-monitoring-queries.md` | 5 Suchqueries fuer /forschung |
| `wissen/iot-automation/quick-action-ball-alert-management-recherche-2026.md` | FAB Patterns + Alert Management (31 Quellen) |
| `wissen/iot-automation/forschung-fab-alert-fatigue-papers-2026.md` | 11 Papers: FAB Usability + Alert Fatigue |

**Vollstaendige Paper-Tabelle:** [00_MASTER_PLAN.md](./00_MASTER_PLAN.md) Abschnitt "Wissenschaftliche Fundierung"
