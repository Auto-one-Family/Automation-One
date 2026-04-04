# Server-Tiefenanalyse (Paket 2)

Dieser Ordner enthaelt die Artefakte fuer die paketbasierte Komplettanalyse der Server-Schicht (El Servador).

## Paketstruktur (analog ESP32)

1. `paket-01-server-modul-und-service-inventar.md`
2. `paket-02-server-device-und-sensor-ingestion-pipeline.md`
3. `paket-03-server-command-und-actuator-pipeline.md`
4. `paket-04-server-logic-engine-und-regel-lebenszyklus.md`
5. `paket-05-server-safety-und-failure-handling.md`
6. `paket-06-server-runtime-states-und-betriebsmodi.md`
7. `paket-07-server-integrationsbild-und-contract-ownership.md`

## Zielbild

- Backend-End-to-End-Pfade (Ingestion, Command, Logic, Safety, Recovery) sind durchgaengig dokumentiert.
- Jede kritische Schnittstelle hat klare Contract-Ownership und testbare Akzeptanzkriterien.
- Fragile Stellen sind priorisiert und in Folgeaufgaben fuer Datenbank, Frontend und Gesamtintegration ueberfuehrt.

## Arbeitsregeln

- Keine `copy.md` als Source of Truth.
- Pro Paket ein Hauptartefakt mit expliziten Inputs/Outputs, States, Persistenz und Safety.
- Analyse zuerst, Implementierung spaeter im getrennten Code-Repository.
