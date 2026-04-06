# Auftrag F08: Custom Dashboard Editor, Widgets, GridStack und Persistenz

> **Typ:** Analyseauftrag  
> **Erstellt:** 2026-04-05  
> **Bereich:** AutomationOne / El Frontend / F08  
> **Prioritaet:** P0

## Relevantes Wissen (kompakt und verbindlich)
- Editor folgt local-first plus server-sync; dadurch sind Persistenzketten und Flush-Punkte kritisch.
- GridStack-Events treiben AutoSave und Replays; jede Luecke erzeugt silent desync.
- Widget-Registry ist zentral, aber Identitaetsregeln muessen fachlich eindeutig bleiben.
- Finale Nutzerwahrheit ist nur gueltig, wenn Reload denselben Zustand reproduziert.

## IST-Befund
- End-to-End-Lebenszyklus ist stark, aber mit klaren Risikostellen.
- `setZoneScope` zeigt Risiko fuer unvollstaendige Persistenzkette.
- Debounce-Fenster kann letzte Aenderungen verlieren.
- Dedup-Logik nach Namen kann fachlich verschiedene Layouts vereinen.

## SOLL-Zustand
- Jede Editoraktion durchlaeuft dieselbe persistente Kette (local, API, replay).
- Safe-Flush bei Unmount/Navigation verhindert Datenverlust.
- Layout-Identitaet ist robust gegen Namensgleichheit.

## Analyseauftrag
1. Persistenzmatrix erstellen: `Aktion -> local write -> api sync -> replay`.
2. Alle nicht-kanonischen Mutationen identifizieren (direkte Seiteneffekte ohne Save-Pipeline).
3. Debounce-/Flush-Verhalten unter Stoerfall (crash, close, route change) pruefen.
4. Identity-Regeln fuer Layouts fachlich haerten und Backward-Pfad vorschlagen.

## Scope
- **In Scope:** CustomDashboardView, dashboard.store, widget config flow, replay.
- **Out of Scope:** kompletter Editor-Umbau.

## Nachweise
- Mindestens ein reproduzierbarer Desync-Fall mit Ursache/Wirkung.
- Sequenzdiagramm fuer Add/Configure/Save/Reload pro Widget.

## Akzeptanzkriterien
- Scope/Layout-Aenderungen sind nach Reload konsistent.
- Kein stiller Verlust letzter Aenderung bei Navigation.
- Dedup-Regeln loeschen keine fachlich verschiedenen Dashboards.

## Tests/Nachweise
- E2E: create -> configure -> reload parity.
- Integration: unmount flush und retry sync.
