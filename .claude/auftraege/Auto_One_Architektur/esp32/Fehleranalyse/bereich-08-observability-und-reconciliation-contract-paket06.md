# Bereich 08 - Observability und Reconciliation-Contract (IST-Revision 2026-04-04)

> Fokus: Messbarkeit kritischer Negativpfade und harter Reconciliation-Abschlussvertrag.

## 1) Was war veraltet?

- Die alte Version war als FA-Sammlung ohne einheitliches IST-Revisionsschema aufgebaut.
- Beobachtbarkeit, Persistenzdrift und Reconciliation-Lifecycle waren nicht als konsolidierte Prioritaetslage getrennt.

## 2) Was ist jetzt der IST-Stand?

- `FA-OBS-001`: Command-Queue-Drops sind nicht durchgaengig terminal abgeschlossen.
- `FA-OBS-002`: Parse-Fails im Config-Worker sind observability-seitig nicht in allen Zweigen hart abgeschlossen.
- `FA-OBS-003`: Outbox-Full ist nur teilweise durchgaengig eventseitig erklaerbar.
- `FA-OBS-004`: Persistenzdrift ist nicht in jedem Pfad verpflichtend als Degraded-Vertrag verankert.
- `FA-OBS-005`: Reconciliation-Sitzung hat keinen harten Session-Lifecycle mit abschliessbarer Done-Definition.

## 3) Welche Restluecken bleiben?

- **P0:** `FA-OBS-002`, `FA-OBS-004`.
- **P1:** `FA-OBS-001`, `FA-OBS-003`, `FA-OBS-005`.

## 4) Was wurde in der Datei konkret angepasst?

- Auf das einheitliche 4-Block-IST-Format umgestellt.
- Observability- und Reconciliation-Risiken als priorisierte Cluster zusammengefuehrt.
- Abnahmekriterien fuer terminale Sichtbarkeit und Sessionabschluss ergaenzt.

## Abnahmekriterien (Schritt bestanden/nicht bestanden)

- **Bestanden**, wenn Parse/Drop/Drift/Reconciliation jeweils als eigener Risiko- und Messbarkeitsblock priorisiert sind.
- **Nicht bestanden**, wenn Reconciliation weiterhin ohne harte Abschlusskriterien dokumentiert bleibt.

