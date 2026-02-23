# Branch-Konsolidierung Analyse — 2026-02-23

## Zusammenfassung

- **Branches gesamt:** 12 (3 lokal, 8 remote-only, 1 lokal+remote tracking)
- **Davon lokal:** 3 (feature/frontend-consolidation, feature/phase2-wokwi-ci, backup/frontend-consolidation-full)
- **Davon remote-only:** 6 (improve-logging, optimize-autoops, automatisierungs-engine, dashboard-neue-struktur, frontend-ux, testinfrastruktur)
- **Bereits gemergt:** 1 (cursor/dashboard-neue-struktur-23ef → feature/frontend-consolidation)
- **Uncommittete Änderungen:** GESICHERT in Stash `backup-vor-konsolidierung-20260223`
- **Stash-Einträge:** 1 (42 files, 2427 insertions, 892 deletions)
- **Unpushed Commits:** 16 auf feature/frontend-consolidation

## Branch-Übersicht

| Branch | L/R/Beide | Commits vs master | Commits vs feature | Kategorie | Aktion |
|--------|-----------|-------------------|-------------------|-----------|--------|
| `master` | Beide | 0 (Basis) | — | Basis | BEHALTEN |
| `feature/frontend-consolidation` | Beide | 16 ahead | HEAD | Frontend+Infra | ZIEL-BRANCH |
| `origin/cursor/dashboard-neue-struktur-23ef` | Remote | 13 | 0 (merged) | Frontend | LÖSCHEN (merged) |
| `origin/cursor/frontend-ux-konsolidierung-8829` | Remote | 27 | 14 neue | Frontend UX | **MERGE** |
| `origin/claude/optimize-autoops-performance-S0dO6` | Remote | 1 | 1 | AutoOps | **MERGE** |
| `origin/claude/improve-logging-infrastructure-aXF7I` | Remote | 1 | 1 | Logging | **MERGE** (Konflikte lösen) |
| `origin/cursor/automatisierungs-engine-berpr-fung-1c86` | Remote | 17 | 17 | CI/Tests/Security | **CHERRY-PICK** (selektiv) |
| `origin/cursor/testinfrastruktur-berarbeitung-2f8b` | Remote | 11 | 11 | Tests/CI | SKIP (Subset von automatisierungs-engine) |
| `feature/phase2-wokwi-ci` | Lokal | 1 WIP | 1 | Frontend+Tests | ARCHIV→TAG |
| `backup/frontend-consolidation-full` | Lokal | 1 WIP | 1 | Backup | ARCHIV→TAG |

## Empfohlene Merge-Strategie

### Reihenfolge:

1. **Uncommittete Änderungen committen** — 63 modified files enthalten Quick-Wins (Logger, Promtail, Wokwi-Scenarios, CI)
2. **Push** — 16 unpushed commits + neuer Commit synchronisieren
3. **Merge: `origin/cursor/frontend-ux-konsolidierung-8829`** — 14 neue Frontend-UX-Commits. Baut auf dashboard-neue-struktur auf (bereits gemergt). Geringstes Konfliktrisiko.
4. **Merge: `origin/claude/optimize-autoops-performance-S0dO6`** — 1 Commit, 13 Dateien, komplett selbstständig (nur autoops Code)
5. **Merge: `origin/claude/improve-logging-infrastructure-aXF7I`** — 1 Commit, 41 Dateien. Konflikte bei logger.ts und logging_config.py erwartet (Working-Tree Quick-Wins vs. Branch-Logging)
6. **Cherry-Pick von `origin/cursor/automatisierungs-engine-berpr-fung-1c86`** — Nur wertvolle Commits:
   - `4c3109a` fix(security): python-multipart CVE-Fix
   - `646d2ee` fix(ci): mosquitto healthchecks
   - `23db52a` fix(ci): backend-e2e server crash
   - `dec62ea` fix(ci): playwright tests
   - `9cbf68c` feat(ci): frontend Dockerfile
   - `e0502a2` fix(ci): structural improvements
   - `2dba2c8` feat(wokwi): error-injection scenarios + CI job
   - `de027da` fix(lint): ruff/black config
   - Skip: `479d889`, `49ca035`, `07a01fc`, `526c94f`, `21b238b` (überlappen mit bestehenden Änderungen oder sind obsolet)

### Begründung Cherry-Pick vs. Merge:

- **automatisierungs-engine:** 319 geänderte Dateien, massive Backend-Reformatierung (ruff/black). Ein vollständiger Merge würde hunderte Konflikte verursachen. Cherry-Pick der wertvollen CI/Security-Commits ist sicherer.
- **frontend-ux:** Saubere 14 Commits die auf dem bereits gemergten dashboard-neue-struktur aufbauen. Merge ist hier richtig.
- **improve-logging:** 1 Commit mit sowohl ESP32-Firmware als auch Server-Logging. Merge mit manueller Konfliktlösung bei 2-3 Dateien.

## Potenzielle Konflikte

| Datei | Branches | Risiko | Lösung |
|-------|----------|--------|--------|
| `El Frontend/src/utils/logger.ts` | Working-Tree + improve-logging | HOCH | Working-Tree Quick-Win behalten, ESP32-Logger-Verbesserungen von improve-logging übernehmen |
| `El Servador/.../logging_config.py` | Working-Tree + improve-logging | MITTEL | Beide Änderungen kombinieren |
| `El Frontend/src/views/DashboardView.vue` | frontend-ux + automatisierungs-engine | MITTEL | frontend-ux priorisieren (neuere UX) |
| `El Servador/.../api/v1/__init__.py` | improve-logging + automatisierungs-engine | NIEDRIG | improve-logging priorisieren |
| `El Servador/.../mqtt/subscriber.py` | improve-logging + automatisierungs-engine | NIEDRIG | improve-logging priorisieren |
| `.github/workflows/*.yml` | Working-Tree + automatisierungs-engine | HOCH | Working-Tree behalten, CI-Fixes cherry-picken |
| `docker/promtail/config.yml` | Working-Tree + improve-logging | MITTEL | Working-Tree Quick-Win behalten |

## Quick-Wins Status (VOR Konsolidierung)

| Quick-Win | Datei | Status | Quelle |
|-----------|-------|--------|--------|
| Frontend JSON Logger | `El Frontend/src/utils/logger.ts` | ✅ Im Working-Tree | Uncommitted |
| Server Noise Reduction | `El Servador/.../logging_config.py` | ✅ Im Working-Tree | Uncommitted |
| Promtail MQTT Drop | `docker/promtail/config.yml` | ✅ Im Working-Tree | Uncommitted |
| Serial Logger Service | `docker/esp32-serial-logger/serial_logger.py` | ✅ Existiert | Committed (master) |
| CI/CD pr-checks Fix | `.env.ci` + Workflows | ✅ Im Working-Tree | Uncommitted |
| TypeScript Fix | `El Frontend/src/views/SensorHistoryView.vue` | ✅ Im Working-Tree | Uncommitted |
| Wokwi Counter Fix | `.github/workflows/wokwi-tests.yml` | ✅ Im Working-Tree | Uncommitted |

**Alle 7 Quick-Wins sind vorhanden. 6 davon sind noch uncommittet!**

## Risiken

1. **Uncommittete Quick-Wins:** 6 von 7 Quick-Wins sind nur im Working-Tree. MÜSSEN zuerst committed werden.
2. **improve-logging Merge-Konflikte:** logger.ts und logging_config.py haben sowohl Working-Tree-Änderungen als auch Branch-Änderungen. Manuelle Lösung nötig.
3. **automatisierungs-engine Größe:** 319 Dateien. Cherry-Pick einzelner Commits kann Dependency-Probleme verursachen (z.B. ruff config ohne den formatierten Code).
4. **frontend-ux könnte Breaking Changes einführen:** 14 Commits mit View-Umstrukturierung. Nach Merge TypeScript-Check nötig.
5. **16 unpushed Commits:** Lange offline-Divergenz vom Remote. Push vor Merge-Operationen.

## Entscheidung: feature/phase2-wokwi-ci

**WICHTIG:** `docker/esp32-serial-logger/serial_logger.py` und `docker/promtail/config.yml` **existieren NICHT** auf diesem Branch (`git show feature/phase2-wokwi-ci:docker/esp32-serial-logger/serial_logger.py` → fatal). Der Branch wurde von einem älteren Stand abgezweigt, bevor diese Dateien hinzugefügt wurden. Ein Merge würde sie theoretisch behalten (feature/frontend-consolidation hat sie), aber der Branch enthält 1 WIP-Commit mit 109 Dateien, die größtenteils in `feature/frontend-consolidation` oder `frontend-ux` bereits vorhanden sind. → **Als Tag archivieren, NICHT mergen.**
