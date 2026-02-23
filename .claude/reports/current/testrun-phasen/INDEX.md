# AutomationOne — Testinfrastruktur Phasenplan Index

> **Erstellt:** 2026-02-21
> **Ordner:** `.claude/reports/current/testrun-phasen/`

---

## Dokumente

| Datei | Inhalt | Status |
|-------|--------|--------|
| [00_MASTER_PLAN.md](./00_MASTER_PLAN.md) | Gesamtplan mit Ressourcen-Inventar, wissenschaftlicher Fundierung, MCP-Integration | Referenz |
| [PHASE_0_ERROR_TAXONOMIE.md](./PHASE_0_ERROR_TAXONOMIE.md) | Error-Taxonomie konsolidieren, Test-Codes 6000-6099, Grafana-Alerts 8→28+, KI Stufe 1 | Fundament |
| [PHASE_1_WOKWI_SIMULATION.md](./PHASE_1_WOKWI_SIMULATION.md) | Error-Injection-Szenarien, CI/CD Nightly, Wokwi-Error-Mapping | Parallel zu Phase 2 |
| [PHASE_2_PRODUKTIONSTESTFELD.md](./PHASE_2_PRODUKTIONSTESTFELD.md) | Docker-Stack, ESP32 flashen, Frontend-Luecken (Wizard + Zeitreihen), Chaos Engineering | Parallel zu Phase 1 |
| [PHASE_3_KI_ERROR_ANALYSE.md](./PHASE_3_KI_ERROR_ANALYSE.md) | Rule-based (Stufe 1), Isolation Forest (Stufe 2), LLM-Analyse (Stufe 3 spaeter) | Braucht Phase 2 |
| [PHASE_4_INTEGRATION.md](./PHASE_4_INTEGRATION.md) | Error-Reports vereinheitlichen, Dashboards, Feedback-Loop, konsolidierter Status | Braucht Phase 1+2+3 |

---

## Phasen-Reihenfolge

```
Phase 0 (Fundament)
  ├──► Phase 1 (Wokwi)  ──────────────────────► Phase 4 (Integration)
  └──► Phase 2 (Produktion) ──► Phase 3 (KI) ──┘
```

## Cross-Referenzen

| Von | Nach | Warum |
|-----|------|-------|
| Phase 0 → Phase 1 | Error-Codes + Test-Codes 6000-6099 | Wokwi-Szenarien nutzen Error-Taxonomie |
| Phase 0 → Phase 2 | Grafana-Alerts (28+) | Produktion nutzt Alerts fuer Monitoring |
| Phase 1 → Phase 4 | Wokwi-Error-Mapping | Integration braucht Wokwi-Reports |
| Phase 2 → Phase 3 | Sensordaten fliessen | Isolation Forest braucht echte Daten |
| Phase 2 → Phase 4 | Produktions-Audit-Logs | Integration braucht Produktions-Reports |
| Phase 3 → Phase 4 | AI-Predictions | Integration zeigt Anomalien im Dashboard |
| Phase 4 → Phase 1 | Feedback-Loop | Produktionsfehler werden Wokwi-Regression |
