# ESP32 Architektur - Gesamtuebersicht

> **Bereich:** Auto One Architektur / ESP32  
> **Stand:** 2026-04-04  
> **Ziel:** Ein eindeutiger Einstiegspunkt fuer die komplette Architektur- und Fehleranalyse-Dokumentation.

---

## Struktur

### Paketdokumente (01-07)

1. `paket-01-esp32-modul-inventar.md`  
2. `paket-01-esp32-abhaengigkeitskarte.md`  
3. `paket-01-esp32-contract-seedlist.md`  
4. `paket-02-esp32-runtime-lifecycle-state-model.md`  
5. `paket-02-esp32-trigger-matrix.md`  
6. `paket-02-esp32-core-interaktionsbild.md`  
7. `paket-02-esp32-degraded-recovery-szenarien.md`  
8. `paket-03-esp32-sensorhandling-end-to-end.md`  
9. `paket-03-esp32-sensor-contract-matrix.md`  
10. `paket-03-esp32-sensor-fehler-recovery-matrix.md`  
11. `paket-03-esp32-sensor-timing-und-lastprofil.md`  
12. `paket-04-esp32-reboot-powerloss-konsistenzanalyse.md`  
13. `paket-04-esp32-schreib-und-restore-strategie.md`  
14. `paket-04-esp32-speicherkarte-ram-vs-nvs.md`  
15. `paket-05-esp32-safety-katalog-und-priorisierung.md`  
16. `paket-05-esp32-safety-policy-und-entscheidungsregeln.md`  
17. `paket-05-esp32-safety-wirksamkeit-fehlerbilder.md`  
18. `paket-06-esp32-netzwerk-state-machine-und-betriebsmodi.md`  
19. `paket-06-esp32-mqtt-flow-ack-nack-retry-contract.md`  
20. `paket-06-esp32-observability-und-reconciliation-contract.md`  
21. `paket-07-esp32-end-to-end-integrationskatalog.md`  
22. `paket-07-esp32-systemgrenzen-und-contract-ownership.md`  
23. `paket-07-esp32-integrationsrisiken-und-umsetzungsfahrplan.md`

### Fehleranalyse (konsolidierte Zielstruktur)

Ordner: `Fehleranalyse/`

- `README.md`
- `bereich-01-state-und-dokumentkonsistenz.md`
- `bereich-02-core-queues-und-parallelitaet.md`
- `bereich-03-kommunikation-und-topic-contracts.md`
- `bereich-04-config-persistenz-und-recovery.md`
- `bereich-05-safety-und-failsafe-kette.md`
- `bereich-05-reboot-powerloss-und-speicherkonsistenz-paket04.md`
- `bereich-06-safety-policy-und-wirksamkeit-paket05.md`
- `bereich-07-netzwerk-state-machine-und-betriebsmodi-paket06.md`
- `bereich-08-observability-und-reconciliation-contract-paket06.md`
- `bereich-09-end-to-end-integrationskatalog-paket07.md`
- `bereich-10-integrationsrisiken-und-umsetzungsfahrplan-paket07.md`
- `bereich-11-systemgrenzen-und-contract-ownership-paket07.md`
- `gesamtbericht-paket04-paket05-fehlerkatalog.md`
- `gesamtbericht-paket06-paket07-fehlerkatalog.md`

---

## Lesereihenfolge fuer komplette Architektur

1. Paket 01 (Inventar, Abhaengigkeiten, Seed-Contracts)  
2. Paket 02 (State/Trigger/Core-Interaktion)  
3. Paket 03 (Sensor-End-to-End + Fehler/Last)  
4. Paket 04 (Persistenz, Reboot/Powerloss, RAM/NVS)  
5. Paket 05 (Safety-Katalog, Policy, Wirksamkeit)  
6. Paket 06 (Netzwerk, MQTT-Contract, Observability/Reconciliation)  
7. Paket 07 (E2E-Integration, Ownership, Integrationsfahrplan)  
8. Fehleranalyse-Bereiche 01-11 und beide Gesamtberichte

---

## Aufraeumregel

- Dateinamen sind kanonisch ohne `copy`.
- Zwischenauftraege und historische Einzel-Analyseauftraege gehoeren nicht in die aktive Zielstruktur.
- Diese `README.md` ist der verbindliche Einstiegspunkt fuer den aktuellen Architekturstand.

