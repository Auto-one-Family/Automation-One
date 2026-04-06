# Auftrag F10: Inventar, Wissensbasis und Kalibrierung

> **Typ:** Analyseauftrag  
> **Erstellt:** 2026-04-05  
> **Bereich:** AutomationOne / El Frontend / F10  
> **Prioritaet:** P1

## Relevantes Wissen (kompakt und verbindlich)
- `/sensors` ist Wissens- und Inventarbereich, nicht primarer Konfigurationsraum.
- Tiefe Geraetekonfiguration gehoert in HardwareView; diese Trennung verhindert Kontextfehler.
- Kalibrierung ist ein eigener Admin-Flow mit zustandsbasierter Rueckmeldung.
- Inventar wirkt als Bruecke zwischen technischer Konfiguration, Monitoring und Kontextwissen.

## IST-Befund
- Rollenabgrenzung SensorsView vs. HardwareView ist klar und korrekt umgesetzt.
- Inventarfluesse (Filter, Detail, Metadaten, Kontext) sind nachvollziehbar.
- Kalibrierung hat priorisierte Risiken: Sensortypfilter, Auth-Mode-Klarheit, Teilzustandsfeedback.

## SOLL-Zustand
- Typvalidierte, fehlertolerante Kalibrierung mit klaren Vorpruefungen.
- Eindeutige Sichtbarkeit der aktiven Auth-Strategie (JWT/API-Key) im Kalibrierfluss.
- Robustere Nutzerfuehrung bei Abbruch, Resume und Teilfehlern.

## Analyseauftrag
1. Inventarfluesse Ende-zu-Ende dokumentieren inkl. Deep-Link-Rueckwege.
2. Kalibrierungs-State-Machine und Fehlerzweige komplett erfassen.
3. Sensorauswahl gegen Typ/GPIO-Regeln pruefen und Luecken markieren.
4. Draft-/Resume-Konzept fuer Kalibrierung (z. B. sessionStorage) bewerten.

## Scope
- **In Scope:** SensorsView, Inventory-Komponenten/Store, CalibrationView/Flow.
- **Out of Scope:** neue Kalibrieralgorithmen im Backend.

## Nachweise
- Rollenbeleg: `SensorsView ohne ConfigPanel`, `HardwareView mit ConfigPanel`.
- Tabelle `Kalibrierungsschritt -> Validierung -> Fehlerausgabe -> Recovery`.

## Akzeptanzkriterien
- Keine untypisierte Sensorauswahl im Kalibrierpfad.
- Auth-Mode ist vor Start der Kalibrierung sichtbar.
- Abbruch-/Wiederaufnahmeverhalten ist definiert und testbar.

## Tests/Nachweise
- E2E: Kalibrierung success/fail/retry.
- Integration: Inventar-Detail und Kontext speichern/laden.
