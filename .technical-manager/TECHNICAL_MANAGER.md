# Technical Manager — Session-Router

> **Letzte Aktualisierung:** 2026-04-15
> **Aktiver Analyseauftrag:** Monitor L2 Layout & Sensor-Card Fixes (Linear-Projekt)
> **Sprint:** W16/2026 — Bodenfeuchte-Kalibrierung Abschluss (parallel)

---

## Aktuelle Prioritaeten

| # | Thema | Status | Linear-Projekt | Naechster Schritt |
|---|-------|--------|----------------|-------------------|
| 1 | Bodenfeuchte-Kalibrierung W16 | 6 PARTIAL-Pakete offen | Bodenfeuchte-Kalibrierung | Sprint-Pakete abschliessen |
| 2 | Monitor L2 Layout-Fixes | 12 Issues angelegt | Monitor L2 Layout & Sensor-Card Fixes | verify-plan Phase 1 Quick Wins |
| 3 | pH/EC Fertigation Datenpfad | Backlog | pH/EC Fertigation Datenpfad | Wartet auf W16-Abschluss |

---

## Offene Epics (Linear)

- **AUT-23 bis AUT-34:** Monitor L2 Layout & Sensor-Card Fixes (12 Issues, 6 Cluster)
  - Phase 1 Quick Wins: AUT-26, AUT-28, AUT-30
  - Phase 2 Strukturell: AUT-23, AUT-24, AUT-27, AUT-29, AUT-31, AUT-32
  - Phase 3 Architektur: AUT-25, AUT-33, AUT-34

---

## Letzte Entscheidungen

| Datum | Entscheidung | Begruendung |
|-------|-------------|-------------|
| 2026-04-15 | Layout-Analyse als vollstaendiger Analysepfad (nicht Fast-Track) | Mehrere Schichten betroffen (CSS, Vue, Store, Formatierung), Mock vs. Real Abgrenzung noetig |
| 2026-04-15 | 12 Issues statt 5 grosse | Anti-KI-Regel: lieber 3 kleine Issues als 1 Mega-Issue |
| 2026-04-15 | TM-Workflow-Ueberarbeitung gestartet | 10 Schwachstellen identifiziert, Workflow muss Linear + verify-plan integrieren |

---

## Workflow-Referenzen

| Dokument | Pfad | Inhalt |
|----------|------|--------|
| TM Workflow (erweitert) | `.claude/reference/TM_WORKFLOW.md` | F1/F2/Fast-Track/auto-debugger + Linear + verify-plan |
| Agent-Uebersicht | `.claude/agents/Readme.md` + `.claude/CLAUDE.md` | 14 Agents + 1 Orchestrator |
| Verifikationskriterien | `.claude/CLAUDE.md` (Tabelle) | Build-Checks pro Schicht |
| Eskalationsmatrix | `.claude/reference/TM_WORKFLOW.md` (Abschnitt Eskalation) | Was tun bei Cross-Layer, Agent-Fehler, Docker-Ausfall |
| Issue-Template | `.claude/reference/TM_WORKFLOW.md` (Abschnitt Issue-Template) | Pflichtfelder fuer Linear-Issues |

---

## Aktiver Kontext (fuer naechste Session)

- **Monitor L2 Analyse** ist abgeschlossen: 4 Dokumente unter `docs/analysen/frontend/`, 12 Linear-Issues
- **Naechster Schritt:** verify-plan auf Phase-1-Issues (AUT-26, AUT-28, AUT-30) laufen lassen
- **Agent-Zuweisung:** Alle Issues → `frontend-dev` nach verify-plan Freigabe
- **W16 Sprint:** 6 PARTIAL-Pakete (E-P1, E-P2, E-P8, F-P4, F-P7, F-P8) parallel abarbeiten
- **TM-Workflow:** Ueberarbeitung laeuft — TECHNICAL_MANAGER.md, README.md, TM_WORKFLOW.md werden aktualisiert

---

## Metriken (ab 2026-04-15)

| Paket | F1-Zyklen | Erster Agent korrekt? | Schaetzung vs. Real |
|-------|-----------|----------------------|---------------------|
| Monitor L2 Layout | 1 (Analyse direkt) | Ja (frontend-dev) | Noch offen |

---

*Dieses Dokument wird bei jedem Session-Start gelesen und nach jeder Entscheidung aktualisiert.*
