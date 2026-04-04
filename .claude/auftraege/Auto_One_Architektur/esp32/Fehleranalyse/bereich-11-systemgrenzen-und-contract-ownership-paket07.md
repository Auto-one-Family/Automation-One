# Bereich 11 - Systemgrenzen und Contract-Ownership (IST-Revision 2026-04-04)

> Fokus: Autoritaetsgrenzen zwischen Firmware, Server, DB und UI.

## 1) Was war veraltet?

- Die alte Version war als FA-Liste ohne einheitliches IST-Revisionsschema aufgebaut.
- Ownership-, Drift- und UI-Vertragsrisiken waren nicht als konsolidierte Prioritaetslage zusammengefuehrt.

## 2) Was ist jetzt der IST-Stand?

- `FA-BND-001`: ONLINE-Autoritaet ist fachlich klar, aber in Grenzpfaden nicht voll technisch erzwungen.
- `FA-BND-002`: Error-Code-Ownership ist benannt, Rollout-/Migrationskollisionen bleiben offen.
- `FA-BND-003`: Drift-Ownership ist definiert, operativer Eskalationspfad bleibt unvollstaendig.
- `FA-BND-004`: UI ist abgeleitete Sicht, Unsicherheitskommunikation ist nicht voll kontraktiert.
- `FA-BND-005`: Config-SoT-Konflikte zwischen desired und applied bleiben operativ offen.

## 3) Welche Restluecken bleiben?

- **P0:** `FA-BND-001`, `FA-BND-003`, `FA-BND-005`.
- **P1:** `FA-BND-002`.
- **P2:** `FA-BND-004`.

## 4) Was wurde in der Datei konkret angepasst?

- Auf das einheitliche 4-Block-IST-Format umgestellt.
- Alle `FA-BND-*` Punkte als Ownership-Risiken mit Prioritaet konsolidiert.
- Abnahmekriterien fuer Autoritaets- und SoT-Klarheit ergaenzt.

## Abnahmekriterien (Schritt bestanden/nicht bestanden)

- **Bestanden**, wenn ONLINE-, Drift- und Config-Ownership klar priorisiert und getrennt dokumentiert sind.
- **Nicht bestanden**, wenn Systemgrenzen ohne klare Owner-/Eskalationsregeln verbleiben.

