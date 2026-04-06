# Auftrag F06: Hardware, Konfigurationspanels, DnD und Finalitaet

> **Typ:** Analyseauftrag  
> **Erstellt:** 2026-04-05  
> **Bereich:** AutomationOne / El Frontend / F06  
> **Prioritaet:** P1

## Relevantes Wissen (kompakt und verbindlich)
- HardwareView ist operativer Konfigurations-Hub mit 3-Level-Navigation.
- `SensorConfigPanel` und `ActuatorConfigPanel` gehoeren fachlich in den Hardware-Kontext.
- DnD/Assignment-Flows sind wirksam, aber koennen bei Optimistik/Mehrfachevents doppelte Signale erzeugen.
- Kommandopfad muss Finalitaet statt nur Dispatch zeigen.

## IST-Befund
- Panel- und Triggerkette ist klar implementiert.
- Optimistische Anzeige kann als terminal fehlinterpretiert werden.
- Mock-vs-Real Persistenz ist nicht immer gleich stark.
- Toast-Noise bei bestimmten Assignment-Flows vorhanden.

## SOLL-Zustand
- Einheitliches Endzustandsmodell je Aktion: `accepted/pending/terminal`.
- Mock-Interaktionen sind als simuliert markiert und nicht mit realer Persistenz verwechselbar.
- DnD-Rueckmeldungen sind dedupliziert und kausal nachvollziehbar.

## Analyseauftrag
1. End-to-End-Ketten fuer Sensor-, Aktor- und Zone/Subzone-Aktionen dokumentieren.
2. Pro Aktion den echten Terminalnachweis definieren.
3. Mock-vs-Real-Drift je Pfad erfassen.
4. DnD-Reihenfolge und Nebenwirkungen als Ereigniskette absichern.

## Scope
- **In Scope:** HardwareView, Panels, Assignment, Command-Feedback, DnD-Flows.
- **Out of Scope:** Firmware-Protokollneudesign.

## Nachweise
- Sequenz je Kernaktion: `Klick -> API/WS -> Store -> sichtbarer Endzustand`.
- Tabelle `Aktion -> aktuelle Rueckmeldung -> fehlende Finalitaet -> Risiko`.

## Akzeptanzkriterien
- Keine Kernaktion endet mit "gruen", wenn nur ACK vorliegt.
- Mock-Pfade sind sichtbar als nicht-persistent gekennzeichnet.
- DnD-Flow besitzt eindeutige, nicht doppelte Rueckmeldung.

## Tests/Nachweise
- E2E: Zone/Subzone Assignment inkl. Timeout/Partial/Failure.
- Integration: Command-Lifecycle bis terminale Anzeige.
