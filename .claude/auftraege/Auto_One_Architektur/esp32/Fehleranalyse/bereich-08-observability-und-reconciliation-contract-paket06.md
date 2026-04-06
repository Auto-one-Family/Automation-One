# Bereich 08 - Observability und Reconciliation-Contract (IST-Revision 2026-04-05)

> Fokus: Messbarkeit kritischer Negativpfade und harter Reconciliation-Abschlussvertrag.

## 1) Was war veraltet?

- Die alte Version war als FA-Sammlung ohne einheitliches IST-Revisionsschema aufgebaut.
- Beobachtbarkeit, Persistenzdrift und Reconciliation-Lifecycle waren nicht als konsolidierte Prioritaetslage getrennt.

## 2) Was ist jetzt der IST-Stand?

- `FA-OBS-001`: Command-Queue-Drops sind fuer die MQTT-gesteuerten Actuator-/Sensor- und Config-Push-Pfade bei Volllauf terminal ueber `publishIntentOutcome` bzw. Config-Fehlerantwort abgeschlossen (`main.cpp`); **weiterhin nicht terminal** u.a. Zone-/Subzone-Pfade bei `ConfigLaneGuard`-Drop (nur Log, Return), stilles Ueberschreiben aeltester `cfg_pending`-Eintraege ohne Intent-Outcome (`config_update_queue.cpp`), und bei der Publish-Queue nur **kritische** Drops mit Outcome (`publish_queue.cpp`).
- `FA-OBS-002`: Im zentralen Config-Update-Queue-Worker (`processConfigUpdateQueue`) sind JSON-Parse-, Leer-Payload- und zentrale Contract-Zweige observability-seitig mit `ConfigResponseBuilder::publishError` und `publishIntentOutcome` abgeschlossen; **ausserhalb** dieses Workers bleiben Lücken (z.B. Zone-Zuweisung: JSON-Parse nur `LOG_E` ohne Zone-ACK).
- `FA-OBS-003`: Kritische Intent-Outbox: bei voller Outbox Drop mit Log/Zaehler ohne garantierte MQTT-Sichtbarkeit; Publish-Drain mappt ESP-IDF-Fehler auf `publishIntentOutcome` wo ein Queue-Item mit Metadata vorliegt (`mqtt_client.cpp`); **nicht-kritische** Publish-Queue-Drops ohne Outcome — insgesamt nur teilweise durchgaengig eventseitig erklaerbar.
- `FA-OBS-004`: Persistenzdrift ist nicht in jedem Pfad verpflichtend als Degraded-Vertrag verankert (z.B. `PERSISTENCE_DRIFT`-Intent-Outcome im Offline-Manager nur fuer ausgewaehlte NVS-Pfade; andere Persistenzfehler nutzen andere Codes wie `COMMIT_FAILED`).
- `FA-OBS-005`: El Servador-Inbox-Replay (`replay_pending_events`) hat strukturierte Reconciliation-Sitzungen (`session_id`, `_reconciliation.phase`, Start-/End-Logs, Metriken); **fehlend** bleibt ein durchgaengiger Cross-Layer-/Firmware-Vertrag mit gemeinsamer, abschliessbarer Done-Definition (ESP-Outbox vs. Server-Inbox).

## 3) Welche Restluecken bleiben?

- **P0:** `FA-OBS-001`, `FA-OBS-004`.
- **P1:** `FA-OBS-002`, `FA-OBS-003`, `FA-OBS-005`.

## 4) Was wurde in der Datei konkret angepasst?

- Auf das einheitliche 4-Block-IST-Format umgestellt.
- Observability- und Reconciliation-Risiken als priorisierte Cluster zusammengefuehrt.
- Abnahmekriterien fuer terminale Sichtbarkeit und Sessionabschluss ergaenzt.
- IST-Bloecke Abschnitt 2 und Priorisierung Abschnitt 3 gegen Stand `El Trabajante/` und `El Servador/god_kaiser_server/src/mqtt/subscriber.py` verifiziert (2026-04-05).

## Abnahmekriterien (Schritt bestanden/nicht bestanden)

- **Bestanden**, wenn Parse/Drop/Drift/Reconciliation jeweils als eigener Risiko- und Messbarkeitsblock priorisiert sind.
- **Nicht bestanden**, wenn Reconciliation weiterhin ohne harte Abschlusskriterien dokumentiert bleibt.

