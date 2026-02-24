# Git Commit Plan
**Erstellt:** 2026-02-24
**Branch:** fix/ci-pipelines → origin/fix/ci-pipelines (up to date)
**Ungepushte Commits:** 0
**Änderungen gesamt:** 6 modified, 1 untracked, 0 staged

---

## Commit 1: fix(docker): add --no-root to poetry install to avoid missing README in build

**Was:** Der Dockerfile-Build scheiterte in CI weil `poetry install` versucht, das Projekt-Package
selbst zu installieren — dafür braucht es eine `README.md` die im Build-Stage nicht vorhanden ist.
`--no-root` weist Poetry an, nur die Dependencies zu installieren, nicht das Package selbst.

**Dateien:**
- `El Servador/Dockerfile` – `--no-root` zu `poetry install` hinzugefügt + erklärender Kommentar

**Befehle:**
```bash
git add "El Servador/Dockerfile"
git commit -m "fix(docker): add --no-root to poetry install to avoid missing README in build"
```

---

## Commit 2: fix(ci): improve MQTT health check reliability in test pipelines

**Was:** Beide CI-Pipelines (esp32-tests, server-tests) hatten einen fehlerhaften MQTT-Health-Check
der immer `exit 0` zurückgab (`|| exit 0` am Ende). Der neue Health-Check testet tatsächlich ob
Mosquitto erreichbar ist (korrekte `mosquitto_pub` Syntax ohne falschen Fallback). Zusätzlich wurde
in server-tests ein expliziter Wait-Step (30s Retry-Loop) + `mosquitto-clients` Installation
hinzugefügt damit die Mosquitto-Connection vor den Integration-Tests stabil ist.

**Dateien:**
- `.github/workflows/esp32-tests.yml` – Health-Cmd korrigiert, Interval 10s→5s, Retries 5→10
- `.github/workflows/server-tests.yml` – Health-Cmd korrigiert + `apt install mosquitto-clients` + 30s Wait-Step

**Befehle:**
```bash
git add .github/workflows/esp32-tests.yml .github/workflows/server-tests.yml
git commit -m "fix(ci): improve MQTT health check reliability in test pipelines"
```

---

## Commit 3: fix(server): make GPIO pin reservation board-aware (WROOM vs C3)

**Was:** Der GPIO-Validierungsservice reservierte Pins 0, 1, 2, 3, 12 fälschlicherweise als
nicht nutzbar. Boot-Strapping-Pins (0, 2, 12, 15) werden nur beim Boot abgetastet und sind
zur Laufzeit frei. UART-Pins (1, 3) sind optional konfigurierbar. Nur Flash-SPI-Pins (6–11)
sind wirklich nicht nutzbar. Außerdem war die Reservierung nicht board-aware — XIAO ESP32-C3
braucht andere reservierte Pins (18=USB D-, 19=USB D+).

Änderungen:
- `constants.py`: `GPIO_RESERVED_ESP32_WROOM` auf Flash-SPI-Only {6-11} korrigiert (war {0,1,2,3,6-11,12})
- `gpio_validation_service.py`: Board-spezifische Sets WROOM+C3, Legacy-Alias für Backward-Compat,
  neue Methode `_get_system_reserved_pins(board_model)`, Validation nutzt jetzt board-aware Set

**Dateien:**
- `El Servador/god_kaiser_server/src/core/constants.py` – GPIO_RESERVED_ESP32_WROOM korrigiert + Kommentare
- `El Servador/god_kaiser_server/src/services/gpio_validation_service.py` – Board-aware pin sets + neue Methode

**Befehle:**
```bash
git add "El Servador/god_kaiser_server/src/core/constants.py"
git add "El Servador/god_kaiser_server/src/services/gpio_validation_service.py"
git commit -m "fix(server): make GPIO pin reservation board-aware (WROOM vs C3)"
```

---

## Commit 4: chore(reports): update git health report and add frontend playwright fix report

**Was:** Zwei Report-Dateien — aktualisierter Git-Health-Report (2026-02-24, major rewrite +325/-98)
und ein neuer Report zur Frontend-Playwright-Fix-Session (bisher untracked).

**Dateien:**
- `.claude/reports/current/GIT_HEALTH_REPORT.md` – Major update (325 insertions, 98 deletions)
- `.claude/reports/current/FRONTEND_PLAYWRIGHT_FIX.md` – Neuer Report (neu, bisher untracked)

**Befehle:**
```bash
git add .claude/reports/current/GIT_HEALTH_REPORT.md
git add .claude/reports/current/FRONTEND_PLAYWRIGHT_FIX.md
git commit -m "chore(reports): update git health report and add frontend playwright fix report"
```

---

## Abschluss

**Nach allen Commits:**
```bash
# Status prüfen
git status
# Erwartung: nothing to commit, working tree clean

# Push
git push origin fix/ci-pipelines
```

---

## Zusammenfassung

| # | Commit | Dateien | Typ |
|---|--------|---------|-----|
| 1 | `fix(docker): add --no-root to poetry install to avoid missing README in build` | 1 | fix |
| 2 | `fix(ci): improve MQTT health check reliability in test pipelines` | 2 | fix |
| 3 | `fix(server): make GPIO pin reservation board-aware (WROOM vs C3)` | 2 | fix |
| 4 | `chore(reports): update git health report and add frontend playwright fix report` | 2 | chore |

**Reihenfolge-Begründung:**
1. Docker-Fix (Build-Infrastruktur) zuerst — Voraussetzung für CI-Runs
2. CI-Workflows — bauen auf Docker-Fix auf, sind Fix-Gruppe zusammen
3. Server-Code — inhaltlich unabhängig, aber logisch nach Infra/CI
4. Reports — zuletzt, reine Dokumentation

**Hinweise:**
- Alle Commits gehen direkt auf `fix/ci-pipelines` (kein Force-Push nötig)
- Die GPIO-Änderung ist ein echtes Fix (Pins 0,1,2,3,12 waren fälschlicherweise blockiert)
- `SYSTEM_RESERVED_PINS` bleibt als Legacy-Alias erhalten → kein Breaking Change
- Nach dem Push: PR #14 (fix/ci-pipelines → master) ist bereit zum Merge
