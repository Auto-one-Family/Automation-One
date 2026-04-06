# Auftrag F09: Logic UI, Regelmodell und Ausfuehrungsfeedback

> **Typ:** Analyseauftrag  
> **Erstellt:** 2026-04-05  
> **Bereich:** AutomationOne / El Frontend / F09  
> **Prioritaet:** P0

## Relevantes Wissen (kompakt und verbindlich)
- Logic-UI muss zwischen Konfiguration angenommen und Regel wirksam unterscheiden.
- Metadaten wie `priority` und `cooldown_seconds` steuern Konflikt-/Arbitrationsverhalten fachlich direkt.
- Konfliktfaelle muessen als Endzustand sichtbar werden, nicht nur als impliziter Fehler.
- Undo/Redo deckt oft Graph, nicht zwingend Rule-Metadaten.

## IST-Befund
- Rule-CRUD ist funktional stabil.
- Kritische Persistenzluecke fuer `priority`/`cooldown_seconds` im Save-Pfad.
- ACK-/Wirksamkeitsfeedback ist nicht sauber zweistufig modelliert.
- Validation-Rueckmeldung ist eher global statt feld-/knotenpraezise.

## SOLL-Zustand
- Vollstaendiges Regelmodell ist in State, Payload und UI konsistent.
- Pro Regelinstanz klares Pending->Terminal-Feedback inkl. Konfliktgrund.
- Validation wird auf konkrete Knoten/Felder gemappt.

## Analyseauftrag
1. Feldflussmatrix erstellen: `Template -> Editor -> Payload -> Persistenz -> Sichtbarkeit`.
2. Luecken im Rule-Metadatenpfad isolieren und priorisieren.
3. Finalitaetsmodell fuer Regelaktivierung und Ausfuehrung entwerfen.
4. Konflikt-/Arbitrationsfaelle als explizite UI-Endzustaende definieren.

## Scope
- **In Scope:** LogicView, rule components, logic.store, logic types/events.
- **Out of Scope:** serverseitige Rule-Engine-Rewrite.

## Nachweise
- Mindestens ein Belegfall fuer verlorene Metadaten.
- Nachweis je Pfad fuer ACK-Signal und terminales Wirksamkeitssignal.

## Akzeptanzkriterien
- `priority`/`cooldown_seconds` sind durchgaengig persistiert.
- Operator sieht eindeutig: angenommen, pending, wirksam/fehlgeschlagen.
- Konfliktgruende sind im UI nachvollziehbar.

## Tests/Nachweise
- Unit: Rule payload mapping.
- E2E: template -> save -> reload -> execution feedback parity.
