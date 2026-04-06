# Auftrag F14: Tests, Tooling, Qualitaetsnetz und Contract-Parity

> **Typ:** Analyseauftrag  
> **Erstellt:** 2026-04-05  
> **Bereich:** AutomationOne / El Frontend / F14  
> **Prioritaet:** P0

## Relevantes Wissen (kompakt und verbindlich)
- Ohne belastbares Testnetz kehren P0/P1-Fehler bei jedem Refactor zurueck.
- E2E muss kritische Nutzerreisen (Editor, Admin, Notifications, Auth, Hardware, Monitor) abdecken.
- Mock-vs-Real-Drift bei REST/WS verfalscht Testwahrheit.
- CI braucht Parity-Gates, sonst bleibt Contract-Drift unentdeckt.

## IST-Befund
- Gute Tiefe in Hardware/Auth/Logic-Tests.
- P0-Luecken fuer Editor, Admin-Ops, Notifications.
- Nachweisbare Contract-Drifts zwischen API/Types und Mocks.

## SOLL-Zustand
- Priorisiertes Testprogramm fuer P0/P1-Kernreisen.
- Automatische Parity-Gates fuer REST-Endpoints und WS-Eventlisten.
- Heatmap-gesteuerte Ausbauplanung, damit Luecken sichtbar bleiben.

## Analyseauftrag
1. Testabdeckung F01-F13 als Heatmap finalisieren.
2. P0/P1-Reisen in konkrete Testfaelle mit Input/Erwartung/Endzustand schneiden.
3. REST- und WS-Parity-Checks als CI-fail-fast designen.
4. Reihenfolgeplan T1..Tn mit Aufwand und Blockern definieren.

## Scope
- **In Scope:** `tests/unit`, `tests/e2e`, `tests/mocks`, vitest/playwright configs.
- **Out of Scope:** serverseitiges Integrationstest-Framework.

## Nachweise
- Parity-Matrix `API client|types -> mock handlers/events`.
- Priorisierte Aufgabenliste mit P0/P1-Kennzeichnung und Aufwand.

## Akzeptanzkriterien
- Jeder identifizierte P0/P1-Risikobereich hat mindestens einen konkreten Testauftrag.
- CI scheitert bei Contract-Drift in definierten Kernvertraegen.
- Kritische End-to-End-Reisen sind automatisiert nachweisbar.

## Tests/Nachweise
- E2E: editor/admin/notifications als P0.
- Static/Unit: endpoint/event parity tests.
