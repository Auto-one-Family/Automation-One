# AutomationOne — Testinfrastruktur Phasenplan Index

> **Erstellt:** 2026-02-21
> **Aktualisiert:** 2026-02-23 (Forschungs-Update: Wokwi MCP, Agent-Driven Testing, 16 Papers, Closed-Loop-Architektur)
> **Ordner:** `.claude/reports/current/testrun-phasen/`

---

## Dokumente

| Datei | Inhalt | Impl-Status |
|-------|--------|-------------|
| [00_MASTER_PLAN.md](./00_MASTER_PLAN.md) | Gesamtplan, Ressourcen-Inventar, **Logging-Infrastruktur**, MCP-Integration, **Wokwi MCP Server**, **Closed-Loop-Architektur**, 16 Papers | Referenz (aktualisiert) |
| [PHASE_0_ERROR_TAXONOMIE.md](./PHASE_0_ERROR_TAXONOMIE.md) | Error-Taxonomie, Test-Codes 6000-6099, 26 Grafana-Alerts, KI Stufe 1 | ✅ **ABGESCHLOSSEN** |
| [PHASE_1_WOKWI_SIMULATION.md](./PHASE_1_WOKWI_SIMULATION.md) | 10 Error-Injection, CI/CD, **Wokwi MCP Server Integration**, Agent-Driven SIL-Testing | ✅ **ABGESCHLOSSEN** + MCP-Extension |
| [PHASE_2_PRODUKTIONSTESTFELD.md](./PHASE_2_PRODUKTIONSTESTFELD.md) | Docker-Stack, ESP32, Frontend (Wizard + Zeitreihen FERTIG), Chaos Engineering, **Wokwi MCP Debugging** | ⚠️ **Code fertig, Deploy offen** |
| [PHASE_3_KI_ERROR_ANALYSE.md](./PHASE_3_KI_ERROR_ANALYSE.md) | Rule-based (Stufe 1), Isolation Forest (Stufe 2), **LLM + Knowledge Graph RCA (Stufe 3)**, **MQTT-Trace-Analyse** | 🔲 **OFFEN** (wissenschaftlich fundiert) |
| [PHASE_4_INTEGRATION.md](./PHASE_4_INTEGRATION.md) | Error-Reports, Dashboards, **Closed-Loop Agent-Architektur**, **Multi-Agent Feedback-Loop** | 🔲 **OFFEN** (wissenschaftlich fundiert) |
| [OPS_READINESS.md](./OPS_READINESS.md) | Operationale Readiness, Metriken-Check, Readiness-Matrix | Aktualisiert |
| [PHASE_0_2_COMPLETION_REPORT.md](./PHASE_0_2_COMPLETION_REPORT.md) | Vollstaendige Verifikation aller implementierten Dateien | Aktualisiert |

---

## Phasen-Reihenfolge

```
Phase 0 (Fundament)        ✅ DONE
  ├──► Phase 0.5 (CI/CD)   ⚠️ 4/8 GRUEN
  ├──► Phase 1 (Wokwi)     ✅ DONE ──────────────► Phase 4 (Integration) 🔲
  └──► Phase 2 (Produktion) ⚠️ Code done ──► Phase 3 (KI) 🔲 ──┘
```

## Cross-Referenzen

| Von | Nach | Warum |
|-----|------|-------|
| Phase 0 → Phase 1 | Error-Codes + Test-Codes 6000-6099 | Wokwi-Szenarien nutzen Error-Taxonomie |
| Phase 0 → Phase 0.5 | CI/CD-Basis | Phase 0.5 braucht Phase 0 Error-Codes fuer Tests |
| Phase 0 → Phase 2 | Grafana-Alerts (26) | Produktion nutzt Alerts fuer Monitoring |
| Phase 1 → Phase 4 | Wokwi-Error-Mapping + **Wokwi MCP** | Integration braucht Wokwi-Reports + MCP-Feedback |
| Phase 1 (MCP) → Phase 3 | Wokwi MCP Serial-Output | KI-Error-Analyse nutzt MCP-gesteuerte Simulation fuer Anomalie-Validierung |
| Phase 1 (MCP) → Phase 4 | Closed-Loop Agent | Agent-Driven Testing nutzt Wokwi MCP direkt |
| Phase 2 → Phase 3 | Sensordaten fliessen | Isolation Forest braucht echte Daten |
| Phase 2 → Phase 4 | Produktions-Audit-Logs | Integration braucht Produktions-Reports |
| Phase 3 → Phase 4 | AI-Predictions + **KG-RCA** | Integration zeigt Anomalien + kausale Graphen |
| Phase 4 → Phase 1 | Feedback-Loop | Produktionsfehler werden Wokwi-Regression |
| **Masterplan** → Alle | Wokwi MCP Server, Closed-Loop-Architektur, 16 Papers | Wissenschaftliche Fundierung + MCP-Config |

## Wissenschaftliche Fundierung (Ueberblick)

| Themenfeld | Papers | Primaer-Phase |
|------------|--------|---------------|
| Testinfrastruktur & SIL | Kalimuthu, Balan, Presti, Yu | Phase 1, Phase 2 |
| Anomalie-Erkennung | Phan, Devi, Chirumamilla | Phase 3 Stufe 2 |
| Agent-Driven Testing | Naqvi, Chan & Alalfi, Abtahi | Phase 1 MCP, Phase 4 |
| Causal Graph RCA | LLMs-DCGRCA, TAAF, FVDebug, TRAIL | Phase 3 Stufe 3 |
| Multi-Agent Debugging | TraceCoder | Phase 4 |

**Vollstaendige Paper-Tabelle:** [00_MASTER_PLAN.md](./00_MASTER_PLAN.md) Abschnitt "Wissenschaftliche Fundierung"
