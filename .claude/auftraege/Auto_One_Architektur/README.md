# Architektur-Analyse AutomationOne

Dieser Ordner enthaelt die schrittweise, paketbasierte Komplettanalyse der AutomationOne-Architektur.

## Dokumente
- `roadmap-komplettanalyse.md` - Vollstaendige Analyse-Roadmap mit Reihenfolge, Paketen, Deliverables und Abnahmekriterien
- `auftrag-P1.1-esp32-modul-inventar-komplettanalyse-2026-04-03.md` - Erster operativer Auftrag fuer P1.1 (ESP32 Modul-Inventar als Startpunkt)
- `auftrag-P1.2-esp32-runtime-lifecycle-state-model-2026-04-03.md` - Folgeauftrag fuer P1.2 (Runtime-Lifecycle und State-Model)
- `auftrag-P1.3-esp32-sensorhandling-end-to-end-2026-04-03.md` - Folgeauftrag fuer P1.3 (Sensorhandling End-to-End)
- `auftrag-P1.4-esp32-speicheranalyse-ram-nvs-2026-04-03.md` - Folgeauftrag fuer P1.4 (Speicheranalyse RAM vs NVS)
- `auftrag-P1.5-esp32-safety-operationen-2026-04-03.md` - Folgeauftrag fuer P1.5 (Safety-Operationen Firmware)
- `auftrag-P1.6-esp32-netzwerk-und-kommunikationshandling-2026-04-03.md` - Folgeauftrag fuer P1.6 (Netzwerk- und Kommunikationshandling)
- `auftrag-P1.7-esp32-integrationsbild-2026-04-03.md` - Folgeauftrag fuer P1.7 (ESP32-Integrationsbild und Systemgrenzen)
- `auftrag-P2.1-server-modul-und-service-inventar-2026-04-03.md` - Startauftrag fuer P2.1 (Server Modul-/Service-Inventar)
- `auftrag-P2.2-server-device-und-sensor-ingestion-pipeline-2026-04-03.md` - Folgeauftrag fuer P2.2 (Device- und Sensor-Ingestion)
- `auftrag-P2.3-server-command-und-actuator-pipeline-2026-04-03.md` - Folgeauftrag fuer P2.3 (Command-/Actuator-Pipeline)
- `auftrag-P2.4-server-logic-engine-und-regel-lebenszyklus-2026-04-03.md` - Folgeauftrag fuer P2.4 (Logic Engine und Regel-Lifecycle)
- `auftrag-P2.5-server-safety-und-failure-handling-2026-04-03.md` - Folgeauftrag fuer P2.5 (Safety und Failure-Handling)
- `auftrag-P2.6-server-runtime-states-und-betriebsmodi-2026-04-03.md` - Folgeauftrag fuer P2.6 (Runtime States und Betriebsmodi)
- `auftrag-P2.7-server-integrationsbild-und-contract-ownership-2026-04-03.md` - Abschlussauftrag fuer P2.7 (Server-Integrationsbild)

## ESP32 Artefakte (Paket 01)
- `esp32/paket-01-esp32-modul-inventar.md` - Modul-Landkarte mit Kritikalitaetsranking und Hand-off
- `esp32/paket-01-esp32-abhaengigkeitskarte.md` - Knoten/Kanten, High-Coupling und Fragilitaetsstellen
- `esp32/paket-01-esp32-contract-seedlist.md` - Seed-Contracts fuer Sensor, Commands, Config, Heartbeat

## ESP32 Artefakte (Paket 02)
- `esp32/paket-02-esp32-runtime-lifecycle-state-model.md` - Runtime-Zustaende, Uebergangslogik, Degraded-/Recovery-Pfade
- `esp32/paket-02-esp32-trigger-matrix.md` - Trigger -> Guard -> Action -> Next-State Modell
- `esp32/paket-02-esp32-core-interaktionsbild.md` - Core0/Core1 Ownership und Queue-Disziplin
- `esp32/paket-02-esp32-degraded-recovery-szenarien.md` - optionaler Szenario-Katalog fuer Verifikation und Recovery-Tests

## ESP32 Artefakte (Paket 03)
- `esp32/paket-03-esp32-sensorhandling-end-to-end.md` - End-to-End Sensorpfad von Config bis Publish inkl. Hand-off
- `esp32/paket-03-esp32-sensor-contract-matrix.md` - Sensor-Contracts (Topics, QoS, Payloadfelder, Guards)
- `esp32/paket-03-esp32-sensor-fehler-recovery-matrix.md` - Fehlerklassen mit Detection, Recovery und Safety-Auswirkung
- `esp32/paket-03-esp32-sensor-timing-und-lastprofil.md` - optionale Timing-/Lastprofil-Vertiefung

## ESP32 Artefakte (Paket 04)
- `esp32/paket-04-esp32-speicherkarte-ram-vs-nvs.md` - Speicherobjekte nach RAM/NVS/abgeleitet inkl. Risiken
- `esp32/paket-04-esp32-schreib-und-restore-strategie.md` - NVS-Schreibpfade, Guardrails und Restore-Strategie
- `esp32/paket-04-esp32-reboot-powerloss-konsistenzanalyse.md` - Konsistenzbewertung fuer Reboot- und Power-Loss-Szenarien

## Server Artefakte (Paket 2)
- `server/README.md` - Struktur und Regeln fuer die Server-Tiefenanalyse
- `server/paket-01-server-modul-und-service-inventar.md` - Modulkarte, Ownership und Kritikalitaet
- `server/paket-02-server-device-und-sensor-ingestion-pipeline.md` - Ingestion-End-to-End inkl. Contract-Checks
- `server/paket-03-server-command-und-actuator-pipeline.md` - Command-Lifecycle inkl. ACK/NACK/Recovery
- `server/paket-04-server-logic-engine-und-regel-lebenszyklus.md` - Regel-Lifecycle und Laufzeitkonsistenz
- `server/paket-05-server-safety-und-failure-handling.md` - Failure-Matrix und Degraded-Mode-Regeln
- `server/paket-06-server-runtime-states-und-betriebsmodi.md` - Runtime-State-Machine und Transitionen
- `server/paket-07-server-integrationsbild-und-contract-ownership.md` - Integrationsgrenzen und Contract-Ownership

## Hinweis zur Dateihaushaltung
- Arbeitsdateien mit Suffix `copy.md` gelten nicht als Source of Truth.
- Verbindlich sind die Dateien ohne `copy` im jeweiligen Paketordner.

## Zielbild
- Jede Systemkomponente einzeln verstehen (ESP32, Server, Datenbank, Frontend)
- Danach alle Zusammenhaenge im Gesamtsystem klar dokumentieren
- Analyse so strukturieren, dass Ergebnisse direkt in Architektur-/Betriebsdokumente ueberfuehrt werden koennen
