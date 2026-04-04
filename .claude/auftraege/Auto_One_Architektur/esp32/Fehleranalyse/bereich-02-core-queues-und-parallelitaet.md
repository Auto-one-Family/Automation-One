# Bereich 02 - Core, Queues und Parallelitaet (IST-Revision 2026-04-04)

> Fokus: Core0/Core1-Interaktion, Queue-Verhalten und Last-/Race-Risiken.

## 1) Was war veraltet?

- Die alte Version war als unstrukturierte FA-Liste ohne explizites IST-Delta aufgebaut.
- Queue-Risiken waren dokumentiert, aber nicht als priorisierte Restluecken je Wirkungsebene konsolidiert.

## 2) Was ist jetzt der IST-Stand?

- `FA-COR-001`: Command-Drops bei voller Sensor-/Actuator-Queue sind weiterhin kritischer Kernbefund.
- `FA-COR-002`: Publish-Drops im Core1->Core0-Pfad bleiben observability-kritisch.
- `FA-COR-003`: Config-Queue-Overflow/Timeout erzeugt weiterhin Konfigurationsdrift-Risiko.
- `FA-COR-004`: Legacy-Single-Thread-Pfad bleibt nicht aequivalent zum Dual-Core-Modell.
- `FA-COR-005`: Emergency-Priorisierung ist vorhanden, Nachlauf-/Flush-Semantik bleibt als Restluecke.

## 3) Welche Restluecken bleiben?

- **P0:** `FA-COR-003` (Config-Determinismus unter Queue-Druck).
- **P1:** `FA-COR-001`, `FA-COR-002`, `FA-COR-005` (terminale Abschluss- und Kausalitaetsluecken).
- **P2:** `FA-COR-004` (Reproduzierbarkeit zwischen Legacy und RTOS-Betrieb).

## 4) Was wurde in der Datei konkret angepasst?

- Auf das verbindliche 4-Block-IST-Format vereinheitlicht.
- Alle bestehenden `FA-COR-*` Befunde in priorisierte Cluster ueberfuehrt.
- Explizite Abnahmekriterien fuer Core/Queue-Fokus ergaenzt.

## Abnahmekriterien (Schritt bestanden/nicht bestanden)

- **Bestanden**, wenn alle `FA-COR-*` Punkte mit Prioritaet und Wirkungsebene erfasst sind.
- **Nicht bestanden**, wenn Queue-/Emergency-Risiken ohne klare Priorisierung verbleiben.

