# AutomationOne — Testinfrastruktur Phasenplan Index

> **Erstellt:** 2026-02-21
> **Aktualisiert:** 2026-02-23 (Status-Update nach Implementierung)
> **Ordner:** `.claude/reports/current/testrun-phasen/`

---

## Dokumente

| Datei | Inhalt | Impl-Status |
|-------|--------|-------------|
| [00_MASTER_PLAN.md](./00_MASTER_PLAN.md) | Gesamtplan, Ressourcen-Inventar, **Logging-Infrastruktur**, MCP-Integration | Referenz (aktualisiert) |
| [PHASE_0_ERROR_TAXONOMIE.md](./PHASE_0_ERROR_TAXONOMIE.md) | Error-Taxonomie, Test-Codes 6000-6099, 26 Grafana-Alerts, KI Stufe 1 | ✅ **ABGESCHLOSSEN** |
| [PHASE_1_WOKWI_SIMULATION.md](./PHASE_1_WOKWI_SIMULATION.md) | 10 Error-Injection-Szenarien, CI/CD Nightly (52 Jobs), Wokwi-Error-Mapping | ✅ **ABGESCHLOSSEN** |
| [PHASE_2_PRODUKTIONSTESTFELD.md](./PHASE_2_PRODUKTIONSTESTFELD.md) | Docker-Stack, ESP32, Frontend (Wizard + Zeitreihen FERTIG), Chaos Engineering | ⚠️ **Code fertig, Deploy offen** |
| [PHASE_3_KI_ERROR_ANALYSE.md](./PHASE_3_KI_ERROR_ANALYSE.md) | Rule-based (Stufe 1), Isolation Forest (Stufe 2), LLM-Analyse (Stufe 3 spaeter) | 🔲 **OFFEN** |
| [PHASE_4_INTEGRATION.md](./PHASE_4_INTEGRATION.md) | Error-Reports vereinheitlichen, Dashboards, Feedback-Loop | 🔲 **OFFEN** |
| [OPS_READINESS.md](./OPS_READINESS.md) | Operationale Readiness, Metriken-Check, Readiness-Matrix | Aktualisiert |
| [PHASE_0_2_COMPLETION_REPORT.md](./PHASE_0_2_COMPLETION_REPORT.md) | Vollstaendige Verifikation aller implementierten Dateien | Aktualisiert |

---

## Phasen-Reihenfolge

```
Phase 0 (Fundament)     ✅ DONE
  ├──► Phase 1 (Wokwi)  ✅ DONE ──────────────► Phase 4 (Integration) 🔲
  └──► Phase 2 (Produktion) ⚠️ Code done ──► Phase 3 (KI) 🔲 ──┘
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
