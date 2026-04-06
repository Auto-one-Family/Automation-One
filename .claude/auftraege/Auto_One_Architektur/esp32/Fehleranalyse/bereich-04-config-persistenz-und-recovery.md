# Bereich 04 - Config, Persistenz und Recovery (IST-Revision 2026-04-05)

> Fokus: Config-Apply, Queue/Retry-Verhalten, NVS-Konsistenz und lokale Recoveryfaehigkeit.

## 1) Was war veraltet?

- Die alte Fassung war als FA-Sammlung ohne verbindliche 4-Block-Revisionsstruktur dokumentiert.
- Config-Fehler, Persistenzdrift und Recovery-Abhaengigkeiten waren nicht als priorisierte Cluster zusammengefuehrt.

## 2) Was ist jetzt der IST-Stand?

- `FA-CFG-001`: JSON-Parse im zentralen Config-Queue-Pfad (`processConfigUpdateQueue`, `El Trabajante/src/tasks/config_update_queue.cpp`) schliesst terminal ab (`JSON_PARSE_ERROR`, Intent `failed`, Pending-Clear); ohne vollstaendigen negativen Abschluss bleiben u.a. Config-Admission-Reject (`shouldAcceptCommand`, nur `intent_outcome` `rejected`, kein `ConfigResponseBuilder::publishError`) und stille Fehler bei `saveAppliedGeneration`/`saveScopeGeneration`, wenn `cfg_pending` nicht geoeffnet werden kann, obwohl der Apply als `persisted` durchlief.
- `FA-CFG-002`: Queue-Overflow vor erfolgreichem Enqueue (`xQueueSend`/`queueConfigUpdateWithMetadata`) bleibt ohne deterministischen lokalen Requeue-Pfad fuer dieselbe Push-Nachricht (Server-Retry; `cfg_pending`/`replayPendingIntents` nur fuer zuvor enqueued Intents).
- `FA-CFG-003`: RAM/NVS-Drift bei Offline-Rules bleibt als Reboot-Risiko bestehen (laufzeitliche Zustaende vs. Blob, `setPersistenceDrift`/`saveOfflineRulesToNVS` in `El Trabajante/src/services/safety/offline_mode_manager.cpp` mildern, beseitigen die Luecke nicht vollstaendig).
- `FA-CFG-004`: Persistenz-Repair kann bei Save-Fail inkonsistente Zustandslagen hinterlassen (z.B. `saveSystemConfig` nach State-Repair in `El Trabajante/src/main.cpp` scheitert -> erneut `STATE_SAFE_MODE_PROVISIONING` mit manuellem Eingriff).
- `FA-CFG-005`: Recovery bei zentralen Config-Fehlern bleibt stark serverabhaengig.

## 3) Welche Restluecken bleiben?

- **P0:** `FA-CFG-001`, `FA-CFG-003` (vollstaendiger negativer Contract ausserhalb des JSON-Parse-Hauptpfads + Konsistenz ueber Neustart).
- **P1:** `FA-CFG-002`, `FA-CFG-004` (Queue- und Repair-Determinismus).
- **P2:** `FA-CFG-005` (lokale Selbstheilung ohne externen Push).

## 4) Was wurde in der Datei konkret angepasst?

- Einheitliches IST-Revisionsformat eingefuehrt.
- Bestehende `FA-CFG-*` Punkte in priorisierte Restluecken ueberfuehrt.
- Klare Abnahmekriterien fuer Config-/Persistenzvertrag ergaenzt.
- IST-Stand gegen aktuelle Firmware (`config_update_queue.cpp`, `main.cpp`, `offline_mode_manager.cpp`, `command_admission.cpp`) abgeglichen.

## Abnahmekriterien (Schritt bestanden/nicht bestanden)

- **Bestanden**, wenn Parse/Queue/Persistenz/Recovery als getrennte Risikoebenen priorisiert sind.
- **Nicht bestanden**, wenn wesentliche Config-Fehlerpfade ohne terminale Bewertung verbleiben (der reine JSON-Parse im zentralen Config-Queue gilt hier als abgedeckt).

