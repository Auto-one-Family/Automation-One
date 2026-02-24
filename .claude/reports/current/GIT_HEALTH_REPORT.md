# Git & GitHub Health Report
**Erstellt:** 2026-02-24 15:30 CET
**Branch:** fix/ci-pipelines
**Analyst:** git-health Skill (Read-Only)

---

## Schnellübersicht

| Bereich | Status | Details |
|---------|--------|---------|
| Ungepushte Commits | 🟢 | 0 – Branch in sync mit origin |
| Offene PRs | 🟡 | 6 offen (1 OPEN + 1 OPEN + 4 DRAFT) |
| CI Status (PR #14) | 🔴 | 3 Failures: Backend E2E, E2E, Unit Tests |
| Secrets-Sicherheit | 🟡 | .env.ci getrackt (OK, CI-only), MQTT anonymous |
| .gitignore Abdeckung | 🟢 | Vollständig |
| Mosquitto Auth | 🔴 | allow_anonymous true (Prod + CI!) |
| Repo-Hygiene | 🔴 | 248 ARCHIV-Dateien inkl. 23MB Logs getrackt, Bot-Branches, 1 Stash |
| Docker Stack | 🟡 | 12/13 Services healthy, Image vor letztem Commit |

---

## 1. Git-Konfiguration

### Remote
```
origin  https://github.com/Auto-one-Family/Automation-One.git (fetch/push)
User:   VibeCodeBeginner <rh@11growers.com>
```

### Lokale Branches (5)

| Branch | Alter | Letzter Commit |
|--------|-------|----------------|
| **fix/ci-pipelines** ← aktuell | 9 min | `fix(ci): fix all 4 red CI pipelines` |
| feature/frontend-consolidation | 55 min | `ci: fix nightly GPIO/hardware tests with MQTT injection` |
| master | 30 Std | `Merge pull request #8: fix(ci) + frontend-consolidation Phase 2` |
| backup/frontend-consolidation-full | 9 Tage | `chore(backup): full WIP state` |
| feature/phase2-wokwi-ci | 13 Tage | `WIP: frontend components, design system, tests` |

### Remote Branches (11)

| Branch | Alter | Typ |
|--------|-------|-----|
| origin/master | 30 Std | main |
| origin/fix/ci-pipelines | 12 min | aktiv |
| origin/feature/frontend-consolidation | 59 min | aktiv |
| origin/claude/frontend-phase3-analysis-7IL3I | 22 Std | Bot (Claude) |
| origin/claude/improve-logging-infrastructure-aXF7I | 22 Std | Bot (Claude) |
| origin/claude/optimize-autoops-performance-S0dO6 | 22 Std | Bot (Claude) |
| origin/cursor/automatisierungs-engine-berpr-fung-1c86 | 2 Tage | Bot (Cursor) |
| origin/cursor/dashboard-neue-struktur-23ef | 2 Tage | Bot (Cursor) |
| origin/cursor/frontend-ux-konsolidierung-8829 | 24 Std | Bot (Cursor) |
| origin/cursor/testinfrastruktur-berarbeitung-2f8b | 2 Tage | Bot (Cursor) |

> **Hinweis:** 6 Bot-generierte Branches (3x Claude, 4x Cursor) – alle mit open PRs verknüpft (DRAFT).

### Tags (4)
```
backup/vor-konsolidierung-20260223
archive/backup-frontend-consolidation-full
archive/feature-phase2-wokwi-ci
pre-consolidation-backup
```
> Nur Backup-Tags, kein semantisches Versioning (z.B. v1.0.0).

### Git Hooks
Keine aktiven Hooks (nur .sample-Dateien).

### Stash
```
stash@{0}: WIP on feature/frontend-consolidation: f823af6
  ci: fix nightly GPIO/hardware tests with MQTT injection + exclude visual-regression
```
> ⚠️ Aktiver Stash – potenziell wichtige WIP-Änderungen.

---

## 2. Arbeitsverzeichnis

| Datei | Status | Kategorie |
|-------|--------|-----------|
| `.claude/reports/current/FRONTEND_PLAYWRIGHT_FIX.md` | Untracked | Report |

Keine staged oder modified Dateien. Branch ist sauber.

---

## 3. Secrets & Sicherheit

### 3a. .gitignore Abdeckung – Checkliste

| Pattern | Vorhanden | Notiz |
|---------|-----------|-------|
| `.env`, `.env.*`, `*.env` | ✅ | Explizit pro Komponente |
| `*.key`, `*.pem`, `*.crt` | ✅ | Mit Ausnahme `ca.crt` |
| `docker-compose.override.yml` | ✅ | Korrekt als local-only markiert |
| `*.db`, `*.sqlite`, `*.sqlite3` | ✅ | |
| `*.log` | ✅ | Mit gitkeep-Struktur |
| `node_modules/` | ✅ | |
| `__pycache__/`, `*.pyc` | ✅ | |
| `.pio/`, `build/` | ✅ | |
| `backups/*.sql*` | ❌ | Kein Backup-Pattern (kein `backups/` Ordner vorhanden – unkritisch) |
| `secrets*`, `credentials*` | ❌ | Kein explizites Pattern, aber `pr-checks.yml` scannt danach |

### 3b. Getrackte .env-Dateien (Inventar)

| Datei | Getrackt | Zweck | Sicherheit |
|-------|----------|-------|------------|
| `.env.ci` | ✅ | CI-Konfiguration (ci_password, ci_test_secret) | ✅ OK – dokumentiert als CI-only, kein Prod-Secret |
| `.env.example` | ✅ | Template für Entwickler | ✅ Nur Platzhalter |
| `El Frontend/.env.development` | ✅ | Frontend Dev-Config | ⚠️ Prüfen ob echte Werte |
| `El Servador/.env.example` | ✅ | Server Template | ✅ Nur Platzhalter |
| `El Servador/god_kaiser_server/.env.example` | ✅ | Server Template | ✅ Nur Platzhalter |

> **Getrackte private Keys / Zertifikate:** Keine gefunden.

### 3c. Docker Credentials

```
docker-compose.ci.yml:    POSTGRES_PASSWORD: ci_password          ← CI-only, OK
docker-compose.ci.yml:    JWT_SECRET_KEY: ci_test_secret_key...   ← CI-only, OK
docker-compose.e2e.yml:   POSTGRES_PASSWORD: e2e_test_password    ← E2E-only, OK
docker-compose.yml:       POSTGRES_PASSWORD: ${POSTGRES_PASSWORD} ← Aus .env, OK
docker-compose.yml:       JWT_SECRET_KEY: ${JWT_SECRET_KEY}       ← Aus .env, OK
```

### 3d. Mosquitto Auth – KRITISCH

```
docker/mosquitto/mosquitto.conf:26:   allow_anonymous true   ← Produktion
.github/mosquitto/mosquitto.conf:16:  allow_anonymous true   ← CI
```

> 🔴 **KRITISCH (Produktion):** `allow_anonymous true` erlaubt jeden MQTT-Publish ohne Auth.
> Korrekte Konfiguration ist auskommentiert aber vorhanden. Muss für Prod aktiviert werden.

---

## 4. CI/CD Pipelines

### Workflow Übersicht (8 Workflows)

| Workflow | Trigger | Branches | Besonderheit |
|----------|---------|----------|--------------|
| `backend-e2e-tests.yml` | push/PR | main, master, develop | Docker compose + Alembic |
| `esp32-tests.yml` | push/PR | main, master, develop | PlatformIO + Native Unity |
| `frontend-tests.yml` | push/PR | main, master, develop | Vitest + Build + Playwright |
| `playwright-tests.yml` | push/PR | main, master, develop | E2E Browser-Tests |
| `pr-checks.yml` | PR (alle) | alle | Label + Sensitive File Check |
| `security-scan.yml` | push/PR + cron Mo 6 Uhr | master, main | Trivy Docker Image Scan |
| `server-tests.yml` | push/PR | main, master, develop | pytest unit + integration |
| `wokwi-tests.yml` | push/PR + cron tägl. 3 Uhr | alle Branches | Wokwi ESP32 Simulation |

### Verwendete Secrets

| Secret | Workflow | Zweck |
|--------|----------|-------|
| `GITHUB_TOKEN` | pr-checks.yml | Label-Automation |
| `WOKWI_CLI_TOKEN` | wokwi-tests.yml | Wokwi CI License |

> ✅ Minimal-Secrets-Prinzip eingehalten. Keine externen Dienste außer Wokwi.

### Action Version Pins
Alle Actions nutzen `@v4` / `@v5` / `@0.28.0` Pins – kein `@main`/`@latest`.

### CI Status PR #14 (fix/ci-pipelines → master)

| Check | Status |
|-------|--------|
| Backend E2E Tests | 🔴 FAIL |
| E2E Tests (Playwright) | 🔴 FAIL |
| Unit Tests (server-tests) | 🔴 FAIL |
| Integration Tests | ⏳ Pending |
| Build Check | 🟢 PASS |
| E2E Test Summary | 🟢 PASS |
| Unit Tests (esp32) | 🟢 PASS |
| Lint & Format Check | 🟢 PASS |
| TypeScript Check | 🟢 PASS |
| Test Summary | 🟢 PASS |
| Validate PR | 🟢 PASS |
| Label PR | 🟢 PASS |

> ⚠️ Branch heißt "fix all 4 red CI pipelines" aber 3 Checks sind noch rot.

---

## 5. Offene Pull Requests (6)

| PR | Titel | Branch | State | Base |
|----|-------|--------|-------|------|
| #14 | fix(ci): fix all 4 red CI pipelines | fix/ci-pipelines | OPEN | master |
| #13 | Add customizable dashboard with GridStack widget system | claude/frontend-phase3-analysis-7IL3I | OPEN | master |
| #12 | Frontend UX konsolidierung | cursor/frontend-ux-konsolidierung-8829 | **DRAFT** | ? |
| #11 | Dashboard neue struktur | cursor/dashboard-neue-struktur-23ef | **DRAFT** | ? |
| #10 | Automatisierungs-engine überprüfung | cursor/automatisierungs-engine-berpr-fung-1c86 | **DRAFT** | ? |
| #9 | Testinfrastruktur überarbeitung | cursor/testinfrastruktur-berarbeitung-2f8b | **DRAFT** | ? |

> **PR #13:** 1 Commit – `feat(frontend): Phase 3 - widget dashboard, DnD improvements, component split`
> ⚠️ PR #13 und PR #14 könnten den gleichen Bereich (Dashboard/Frontend) berühren → Merge-Konflikt möglich.

### Merge-Historie master (letzte 10 Merges)
```
a5324b8 Merge pull request #8: fix(ci) + frontend-consolidation Phase 2
c907f79 Merge pull request #5 from Auto-one-Family/feature/frontend-consolidation
9986ef0 Merge cursor/projekt-design-konsolidierung
38fde57 Merge cursor/playwright-css-testkonzept
f077cf4 Merge claude/review-agent-structure
d5d2df9 Merge master: sync PR#3 merge commit
...
```
Strategie: **Merge Commits** (kein Squash, kein Fast-Forward).

---

## 6. Branch-Schutz & Strategie

### Conventional Commits
13/20 letzter Commits folgen dem Schema → **65%**. Nicht-konform:
- `docs: update REST_ENDPOINTS...` (kein Scope in Klammern)
- Merge-Commits (nicht konformierbar)

### Fehlende Konfigurationen

| Feature | Status |
|---------|--------|
| CODEOWNERS | ❌ Nicht konfiguriert |
| Dependabot | ❌ Nicht konfiguriert |
| PR Template | ❌ Nicht vorhanden (in pr-checks.yml referenziert aber Datei fehlt?) |
| Branch Protection Rules | ⚠️ Unbekannt (nur über GitHub UI prüfbar) |
| Semantic Versioning | ❌ Keine v1.x.x Tags |

---

## 7. Docker Stack (lokaler Stand)

```
12 Services running (alle healthy):
- automationone-alloy       (grafana/alloy:v1.13.1)
- automationone-cadvisor    (cadvisor:v0.49.1)
- automationone-frontend    (auto-one-el-frontend)
- automationone-grafana     (grafana:11.5.2)
- automationone-loki        (loki:3.4)
- automationone-mosquitto-exporter
- automationone-mqtt        (eclipse-mosquitto:2)
- automationone-mqtt-logger (eclipse-mosquitto:2)
- automationone-postgres    (postgres:16-alpine)
- automationone-postgres-exporter
- automationone-prometheus  (prometheus:v3.2.1)
- automationone-server      (auto-one-el-servador)
```

> ℹ️ **13. Service (devtools/pgadmin)** nicht gestartet – erwartet mit `--profile devtools`.
> 🕐 Container `el-servador` gebaut: **2026-02-24 11:11 CET**
> 🕐 Letzter Commit auf fix/ci-pipelines: **2026-02-24 15:03 CET**
> → Docker läuft 3h46min **vor** dem letzten Commit. Bei bind-gemounteten Quellen kein Problem, bei kompilierten Artefakten ggf. veraltet.

`docker-compose.override.yml` aktiv (local-only, nicht getrackt): Monitoring-Profile deaktiviert (alle Monitoring-Services starten ohne `--profile`).

---

## 8. Repo-Hygiene

### Größe
```
.git/ Verzeichnis: 82 MB
Loose Objects:     13.50 MiB (2316 Objekte)
Pack-Files:        42.69 MiB (9848 Objekte, 5 Packs)
```
> 🟡 82 MB ist noch handhbar, aber `git gc` wäre sinnvoll (2316 lose Objekte, 5 Packs statt 1).

### Große getrackte Dateien (⚠️ Binary im Repo!)

| Datei | Größe | Typ | Tracked |
|-------|-------|-----|---------|
| `mosquitto-installer.exe` | **24.7 MB** | Windows Installer Binary | ✅ getrackt – PROBLEM |
| `ARCHIV/growy-frontend/growy-frontend-liste.txt` | 2.8 MB | Text-Datei (Dateiliste) | ✅ getrackt |
| `ARCHIV/growy-frontend/package-lock.json` | 220 KB | npm lockfile (Legacy) | ✅ getrackt |
| `El Frontend/tests/e2e/css/__screenshots__/` | 5× 352 KB | Playwright Snapshots | ✅ getrackt (erwartet) |
| `El Frontend/package-lock.json` | 176 KB | npm lockfile | ✅ getrackt (erwartet) |
| `ARCHIV/growy-frontend/logs/combined.log` | 23 MB | Log | ❌ NICHT getrackt (.gitignore greift) |
| `backups/automationone_20260215_123312.sql` | 1.7 MB | DB-Backup | ❌ NICHT getrackt (korrekt) |

> 🔴 **`mosquitto-installer.exe` (24.7 MB) ist getrackt** – ein Windows-Binary hat im Git-Repo nichts verloren.
> ✅ ARCHIV-Logs (23MB, 16MB, 4MB) sind NICHT getrackt – .gitignore funktioniert korrekt.
> ⚠️ **248 Dateien in `ARCHIV/growy-frontend/` getrackt** – Legacy-Frontend-Quellcode, Docs, und Build-Config.

### Konfiguration
```
.gitattributes: LF-Normalisierung für alle Quell-Dateitypen (py, ts, vue, json, cpp, ...)
                CRLF für .bat/.cmd
                Binary für PNG/JPG/PDF/BIN/ELF
Submodules:    Keine
LFS:           Nicht konfiguriert
```

---

## Bewertung

### 🔴 KRITISCH

1. **Mosquitto `allow_anonymous true`** (docker/mosquitto/mosquitto.conf)
   - Jeder kann MQTT publizieren/subscriben ohne Auth
   - Sofort fixen: `allow_anonymous false` + `password_file` aktivieren
   - Betrifft Produktion (IoT-Gewächshaus!)

2. **PR #14 CI-Failures** – 3 von 8 Checks rot
   - Backend E2E Tests, E2E Tests (Playwright), Unit Tests schlagen fehl
   - Branch-Name verspricht "fix all 4 red CI pipelines" – noch nicht vollständig

### 🟡 WICHTIG

3. **6 offene PRs – PR-Backlog**
   - 4 DRAFT PRs von Cursor/Claude-Bots ohne Aktivität
   - PR #13 (Claude GridStack) und PR #14 (CI-Fix) können kollidieren
   - DRAFTs entweder mergen, schließen oder in echte PRs umwandeln

4. **Bot-Branches (7 Remote)**
   - 3x `claude/*` und 4x `cursor/*` Branches ohne Owner
   - Sollten nach Entscheidung (merge/close) gelöscht werden

5. **Aktiver Stash** – WIP von feature/frontend-consolidation
   - `stash@{0}`: Änderungen zur MQTT-Injection + nightly-Test-Fixes
   - Prüfen ob diese Änderungen in fix/ci-pipelines geflossen sind

6. **Docker Image vor letztem Commit gebaut**
   - `el-servador` Image: 11:11, letzter Commit: 15:03
   - Falls CI-Fix Änderungen am Server-Code enthält: `docker compose up -d --build el-servador`

7. **Kein Dependabot** – Dependency-Updates nicht automatisiert
   - Python, npm und Actions-Packages werden nicht überwacht

### 🟢 GUT

- ✅ Vollständige .gitignore Abdeckung (LF, PEM, Key, SQLite, Build)
- ✅ Keine echten Secrets getrackt (.env.ci ist bewusst CI-only)
- ✅ Trivy Security Scans für Docker-Images (weekly + PRs)
- ✅ Sensitive File Check in pr-checks.yml
- ✅ Action Version Pins (@v4, nicht @main)
- ✅ .gitattributes LF-Normalisierung korrekt konfiguriert
- ✅ 65% Conventional Commits (13/20 Commits)
- ✅ 12 Docker Services healthy

### 📋 EMPFEHLUNGEN (priorisiert)

1. **[SOFORT] MQTT Auth aktivieren** – `allow_anonymous false` in mosquitto.conf
2. **[HEUTE] PR #14 CI-Failures debuggen** – Backend E2E + Playwright + Unit Tests analysieren
3. **[HEUTE] `mosquitto-installer.exe` (24.7 MB) aus Git entfernen** – `git rm --cached mosquitto-installer.exe` + in .gitignore aufnehmen
4. **[DIESE WOCHE] PR-Backlog aufräumen** – 4 Draft-PRs schließen oder aktivieren
5. **[DIESE WOCHE] Bot-Branches bereinigen** – 7 cursor/claude Remote-Branches löschen
6. **[DIESE WOCHE] Stash auflösen** – WIP prüfen und entweder committen oder verwerfen
7. **[DIESE WOCHE] ARCHIV-Verzeichnis strategisch prüfen** – 248 getrackte Dateien: Alles ins Archiv oder aus Repo entfernen?
8. **[OPTIONAL] git gc ausführen** – Repo von 5 Packs auf 1 komprimieren
9. **[OPTIONAL] Dependabot einrichten** – `.github/dependabot.yml` für npm + pip + actions
10. **[OPTIONAL] CODEOWNERS erstellen** – Automatisches Reviewer-Assignment
11. **[OPTIONAL] Semantisches Versioning** – v1.0.0, v1.1.0 Tags einführen
