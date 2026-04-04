# Bereich 04 - Config, Persistenz und Recovery (IST-Revision 2026-04-04)

> Fokus: Config-Apply, Queue/Retry-Verhalten, NVS-Konsistenz und lokale Recoveryfaehigkeit.

## 1) Was war veraltet?

- Die alte Fassung war als FA-Sammlung ohne verbindliche 4-Block-Revisionsstruktur dokumentiert.
- Config-Fehler, Persistenzdrift und Recovery-Abhaengigkeiten waren nicht als priorisierte Cluster zusammengefuehrt.

## 2) Was ist jetzt der IST-Stand?

- `FA-CFG-001`: Parse-Fails sind weiterhin nicht in allen Zweigen mit garantiertem negativem Abschluss beschrieben.
- `FA-CFG-002`: Queue-Overflow bleibt ohne deterministischen lokalen Requeue-Pfad.
- `FA-CFG-003`: RAM/NVS-Drift bei Offline-Rules bleibt als Reboot-Risiko bestehen.
- `FA-CFG-004`: Persistenz-Repair kann bei Save-Fail inkonsistente Zustandslagen hinterlassen.
- `FA-CFG-005`: Recovery bei zentralen Config-Fehlern bleibt stark serverabhaengig.

## 3) Welche Restluecken bleiben?

- **P0:** `FA-CFG-001`, `FA-CFG-003` (terminaler Error-Contract + Konsistenz ueber Neustart).
- **P1:** `FA-CFG-002`, `FA-CFG-004` (Queue- und Repair-Determinismus).
- **P2:** `FA-CFG-005` (lokale Selbstheilung ohne externen Push).

## 4) Was wurde in der Datei konkret angepasst?

- Einheitliches IST-Revisionsformat eingefuehrt.
- Bestehende `FA-CFG-*` Punkte in priorisierte Restluecken ueberfuehrt.
- Klare Abnahmekriterien fuer Config-/Persistenzvertrag ergaenzt.

## Abnahmekriterien (Schritt bestanden/nicht bestanden)

- **Bestanden**, wenn Parse/Queue/Persistenz/Recovery als getrennte Risikoebenen priorisiert sind.
- **Nicht bestanden**, wenn Config-Fehlerpfade ohne terminale Bewertung verbleiben.

