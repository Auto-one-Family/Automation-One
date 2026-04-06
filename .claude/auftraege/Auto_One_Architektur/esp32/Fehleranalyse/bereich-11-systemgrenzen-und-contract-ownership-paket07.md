# Bereich 11 - Systemgrenzen und Contract-Ownership (IST-Revision 2026-04-04, gegen Code/Matrix verifiziert 2026-04-05)

> Fokus: Autoritaetsgrenzen zwischen Firmware, Server, DB und UI.

## 1) Was war veraltet?

- Die alte Version war als FA-Liste ohne einheitliches IST-Revisionsschema aufgebaut.
- Ownership-, Drift- und UI-Vertragsrisiken waren nicht als konsolidierte Prioritaetslage zusammengefuehrt.

## 2) Was ist jetzt der IST-Stand?

- `FA-BND-001`: ONLINE-Autoritaet ist fachlich klar; REST-Aktorik erzwingt strikt `ESPDevice.is_online` (`status == "online"`), waehrend Config-Push im Default (`offline_behavior` warn) auch bei nicht-`online` publizieren und brokerseitig queueen kann — Grenzpfad zur Liveness-Semantik bleibt.
- `FA-BND-002`: Error-Code-Ownership ist benannt, Rollout-/Migrationskollisionen bleiben offen.
- `FA-BND-003`: Drift-Ownership ist definiert, operativer Eskalationspfad bleibt unvollstaendig.
- `FA-BND-004`: UI ist abgeleitete Sicht, Unsicherheitskommunikation ist nicht voll kontraktiert.
- `FA-BND-005`: Config-SoT-Konflikte zwischen desired und applied bleiben operativ offen (Firmware trackt u.a. `applied_gen*` in `El Trabajante/src/tasks/config_update_queue.cpp`; serverseitig fehlt weiter ein verbindlicher Konflikt-Endworkflow).

## 3) Welche Restluecken bleiben?

- **P0 (nur FA-BND-*):** `FA-BND-001` — im Gesamtbericht Paket 06/07 gekoppelt mit `FA-E2E-004`.
- **P1:** `FA-BND-002` (dort mit `FA-INT-002`), `FA-BND-003` (mit `FA-OBS-004`), `FA-BND-005` (mit `FA-CFG-004`).
- **P2:** `FA-BND-004`.

Hinweis: Prioritaetsstufen sind an `gesamtbericht-paket06-paket07-fehlerkatalog.md` (Matrix und Abschnitt 2) angeglichen; frueher in diesem Bereich als P0 gefuehrte `FA-BND-003`/`FA-BND-005` sind dort P1.

## 4) Was wurde in der Datei konkret angepasst?

- Auf das einheitliche 4-Block-IST-Format umgestellt.
- Alle `FA-BND-*` Punkte als Ownership-Risiken mit Prioritaet konsolidiert.
- Abnahmekriterien fuer Autoritaets- und SoT-Klarheit ergaenzt.
- IST-Zeilen zu `FA-BND-001`/`FA-BND-005` und die Prioritaetsliste in Abschnitt 3 an Code (`actuators.py`, `esp_service.py`, `esp.py`, `config_update_queue.cpp`) und an die Paket-06/07-Gesamtmatrix angeglichen.

## Abnahmekriterien (Schritt bestanden/nicht bestanden)

- **Bestanden**, wenn ONLINE-, Drift- und Config-Ownership klar priorisiert und getrennt dokumentiert sind.
- **Nicht bestanden**, wenn Systemgrenzen ohne klare Owner-/Eskalationsregeln verbleiben.

