---
paths:
  - "**"
---
# Allgemeine Entwicklungsregeln

## Verbotene Aktionen (immer beachten)
- NIE bestehende Dateien loeschen ohne explizite Anweisung
- NIE die Git-History umschreiben (kein force-push, kein rebase auf main)
- NIE Umgebungsvariablen oder Secrets in versionierte Dateien schreiben
- NIE automatisch deployen — nur auf explizite Anweisung

## Code-Stil-Grundregeln
- Python: ruff als Formatter und Linter, Type Hints pflicht
- TypeScript: strict mode, keine any-Casts ohne Begruendung
- Vue: Composition API mit `<script setup>`, Props typisiert
- C++ (ESP32): platformio, keine Arduino-IDE-Eigenheiten
- Commit-Messages: Conventional Commits (feat/fix/chore/refactor/docs/test)

## Aenderungs-Prinzip
- Eine logische Aenderung pro Commit
- Tests muessen nach jeder Aenderung gruen sein
- Build-Verifikation: `pio run` (ESP32), `pytest` (Server), `npm run build` (Frontend)
- Bei Unsicherheit: nachfragen statt annehmen
