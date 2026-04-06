# Auftrag F07: MonitorView, Live- und Historienpfade

## Ziel
Lege offen, wie Monitor-Liveansichten Daten beziehen, Zustand wechseln und Fehler sichtbar machen.

## IST-Wissen aus dem Frontend
- MonitorView arbeitet auf mehreren Ebenen (Zone, Sensor, Dashboard-Kontext).
- Daten kommen hybrid aus REST-Loads und WS-Liveupdates.
- Empty/Error/Loading-Strategien sind nicht ueberall gleich.

## Scope
- `El Frontend/src/views/MonitorView.vue`
- `El Frontend/src/components/monitor/**`
- Monitor-relevante Karten/Charts (`components/devices/**`, `components/charts/**`)

## Analyseaufgaben
1. Kartiere L1/L2/L3-Navigation und Kontextwechselwirkungen.
2. Trenne Live-Streams sauber von Historienabfragen.
3. Dokumentiere Loading/Error/Empty je Monitor-Hauptzustand.
4. Pruefe Auswirkungen von Zone-/DeviceContext-Wechseln.

## Pflichtnachweise
- Context-Wechsel -> API/Store-Refresh -> sichtbare Monitor-Aenderung.
- Liveevent -> Card/Chart -> Alert/Statussignal.

## Akzeptanzkriterien
- Jeder Monitor-Hauptpfad hat Datenquelle, Aktualisierungsregel und Fehlerverhalten.
- UX-Risiken bei Latenz/Disconnect sind priorisiert.

## Report
`.claude/reports/current/frontend-analyse/report-frontend-F07-monitor-live-ansichten-2026-04-05.md`
