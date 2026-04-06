# Auftrag F07: Monitor, Live-Ansichten, Historie und Degradation

> **Typ:** Analyseauftrag  
> **Erstellt:** 2026-04-05  
> **Bereich:** AutomationOne / El Frontend / F07  
> **Prioritaet:** P1

## Relevantes Wissen (kompakt und verbindlich)
- Monitor ist in L1/L2/L3 routebasiert und kombiniert Snapshot + Live-Overlay.
- Sensorpfade sind staerker live-gebunden als Aktorpfade; diese Asymmetrie beeinflusst Operatorvertrauen.
- Degradation muss sichtbar sein (connected, stale, reconnecting), sonst entstehen Fehlentscheidungen.
- Historie und Livewert muessen getrennt bleiben, damit Ursache und Lage nicht vermischt werden.

## IST-Befund
- L1/L2/L3 sind technisch sauber, inklusive Kontextwechsel und defensive Fallbacks.
- Live-Sensorueberlagerung funktioniert; Aktorpfad wirkt snapshot-lastiger.
- WS-Degradation wird nicht ueberall gleich explizit kommuniziert.

## SOLL-Zustand
- Einheitliches Live-vs-History-Vertragsmodell je Widget/Card.
- Sichtbares Connectivity-/Degradation-Banner in kritischen Monitorzustaenden.
- Konsistente Recovery nach Reconnect ohne stillen Zustandsdrift.

## Analyseauftrag
1. Fuere je Ebene L1/L2/L3 den Datenpfad auf: REST-Basis, Live-Overlay, Fallback.
2. Kennzeichne fuer jede Karte, ob sie live, snapshot oder hybrid ist.
3. Definiere Degradation-UX fuer WS/API-Ausfall.
4. Erstelle Recovery-Triggerkatalog (wann refetch, wann nur delta).

## Scope
- **In Scope:** MonitorView, relevante Karten/Charts, Kontextwechsel, Degradation.
- **Out of Scope:** neue Chart-Library oder komplettes Monitor-Redesign.

## Nachweise
- Tabelle `Komponente -> Datenmodus -> Risiko bei Ausfall -> Sollanzeige`.
- Mindestens ein belegter Stoerfall mit Nutzerwirkung und Recovery.

## Akzeptanzkriterien
- Live-/Snapshot-Status ist fuer alle Kernkarten eindeutig.
- Degradation wird nicht versteckt, sondern handlungsorientiert angezeigt.
- Recovery verursacht keine unerklaerte Spruenge im Lagebild.

## Tests/Nachweise
- E2E: Monitor mit WS disconnect/reconnect.
- Integration: Zonewechsel unter Last ohne stale Leakage.
