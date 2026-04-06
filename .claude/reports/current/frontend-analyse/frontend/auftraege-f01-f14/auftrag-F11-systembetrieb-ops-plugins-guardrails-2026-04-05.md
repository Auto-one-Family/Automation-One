# Auftrag F11: Systembetrieb, Ops, Diagnostics und Plugins

> **Typ:** Analyseauftrag  
> **Erstellt:** 2026-04-05  
> **Bereich:** AutomationOne / El Frontend / F11  
> **Prioritaet:** P1

## Relevantes Wissen (kompakt und verbindlich)
- `SystemMonitor` ist Ops-Hub mit mehreren Tabs und hoher Betriebsrelevanz.
- Admin-Bereiche sind routingseitig geschuetzt, aber Transparenz ueber Nebenwirkungen ist entscheidend.
- Plugin-Ausfuehrung und Lasttests brauchen Guardrails, sonst steigt Betriebsrisiko.
- Legacy-Einstiege erzeugen Bedien- und Diagnoserisiken trotz funktionierender Redirects.

## IST-Befund
- Tab-Struktur und Datenpfade sind breit und weitgehend konsistent.
- Rechtekontrolle ist vorhanden.
- Schwachstellen liegen in Laufzeittransparenz, Datenfrischekommunikation und operativem Redirect-Ballast.

## SOLL-Zustand
- Klare Ops-Lifecycle-Anzeige (initiiert, running, partial, success, failed) fuer riskante Aktionen.
- Guardrails fuer Lasttests/Config-Changes mit expliziter Risiko- und Impact-Anzeige.
- Reduzierte Legacy-Einstiege und konsistente Redirect-Semantik.

## Analyseauftrag
1. Ops-Hauptreisen erfassen: Events, Logs, DB, Diagnostics, Plugins, LoadTest, Email.
2. Nebenwirkungs- und Risiko-Hotspots pro Reise benennen.
3. Plugin-Execution-Lifecycle mit Execution-ID und Statuskanal spezifizieren.
4. Guardrails fuer Lasttest/System-Config als UX-Standard formulieren.

## Scope
- **In Scope:** SystemMonitorView, Ops-Views, zugehoerige Stores/APIs.
- **Out of Scope:** Serverbetrieb/Deployment-Stack ausserhalb Frontend.

## Nachweise
- Matrix `Ops-Aktion -> Side Effect -> aktuelle Transparenz -> Risiko`.
- Liste aller Legacy-Redirects mit Priorisierung fuer Aufraeumen.

## Akzeptanzkriterien
- Kritische Ops-Aktionen haben sichtbaren Laufzeitstatus.
- Lasttest-/Config-Pfade besitzen klare Schutzmechanismen.
- Redirect-Ballast ist in klaren Decommission-Schritten geplant.

## Tests/Nachweise
- E2E: Admin-Ops-Reise mit Fehlerpfad.
- Integration: Plugin execution status flow.
