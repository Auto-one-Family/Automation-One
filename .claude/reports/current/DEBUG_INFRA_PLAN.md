# AutomationOne Debug-Infrastruktur Plan

**Stand:** 2026-02-12
**Ziel:** Maximale Debug-Effektivität durch bessere Infra + konsolidierte Agenten

---

## Übersicht

Der Plan hat zwei Teile: Erst die Infrastruktur bauen (Phasen 1–4), dann die Agenten darauf aufsetzen (Phase 5). Jede Phase ist in sich abgeschlossen und testbar.

```
Phase 1: Monitoring immer an → Historische Logs für alle Agenten
Phase 2: MQTT-Traffic persistieren → Lücke im Datenpfad schließen
Phase 3: System-Health-Aggregator → Schnelle Orientierung bei jedem Debug-Start
Phase 4: Playwright-Zugang → Frontend-Blindspot eliminieren
Phase 5: Agent-Konsolidierung → 13 Agenten → auto-ops mit 3 Rollen
```

Siehe vollständigen Plan: Download oder `.claude/reports/current/DEBUG_INFRA_PLAN.md`
