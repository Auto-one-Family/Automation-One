---
name: git-health
description: |
  Git & GitHub Vollanalyse für AutomationOne.
  Prüft Repository-Zustand, CI/CD Pipelines, Branch-Protection,
  Secrets-Handling, .gitignore Abdeckung, sensible Dateien,
  Repo-Hygiene und Wartungsstatus.
  Verwenden bei: git-health, Git prüfen, Repo-Check, GitHub Status,
  CI Pipeline prüfen, gitignore prüfen, Secrets-Check, Branch-Status
allowed-tools: Read, Grep, Glob, Bash
user-invocable: true
---

# /git-health – Git & GitHub Vollanalyse

> Modus: EDIT (immer)
> Output: `.claude/reports/current/GIT_HEALTH_REPORT.md`
> Rolle: Vollständige Analyse des Git/GitHub-Zustands ohne Änderungen

## Kern-Prinzip

Du prüfst den gesamten Git- und GitHub-Zustand des Projekts. Du änderst NICHTS – keine Dateien, keine Git-Config, keine Commits, keine Pushes. Du führst nur lesende Befehle aus und schreibst den Report.

## Ablauf

### Phase 1: Git-Grundzustand

```bash
# Identität & Config
git config --list --show-origin | grep -E "(user\.|remote\.|branch\.|core\.|push\.|pull\.)"

# Remotes
git remote -v

# Alle Branches mit letzter Aktivität
git for-each-ref --sort=-committerdate refs/heads/ --format='%(refname:short) | %(committerdate:relative) | %(subject)' | head -20

# Remote-Branches
git branch -r

# Aktueller Branch + Ahead/Behind
git status -sb

# Letzte 15 Commits
git log --oneline -15

# Unpushed Commits (KRITISCH)
git log --oneline @{u}..HEAD 2>/dev/null || echo "Kein Upstream konfiguriert"

# Tags
git tag -l --sort=-creatordate | head -10

# Aktive Hooks (keine .sample)
ls .git/hooks/ 2>/dev/null | grep -v ".sample"

# Stash
git stash list
```

Dokumentiere:
- Remote-URLs
- Alle Branches mit Alter und letztem Commit
- Anzahl ungepushter Commits (⚠️ wenn > 0)
- Aktive Hooks
- Offene Stashes

### Phase 2: Arbeitsverzeichnis-Status

```bash
# Vollständiger Status
git status

# Modified aber nicht staged
git diff --name-only

# Staged
git diff --cached --name-only

# Untracked
git ls-files --others --exclude-standard
```

Dokumentiere als Tabelle:
| Datei | Status | Kategorie |
|-------|--------|-----------|
| pfad  | Modified/Staged/Untracked | Agent/Skill/Config/Code/Doc |

### Phase 3: Secrets & Sensible Dateien

#### 3a: .gitignore Abdeckung

```bash
# Alle .gitignore Dateien finden und lesen
find . -name ".gitignore" -not -path "./.git/*" -exec echo "=== {} ===" \; -exec cat {} \;

# Globale gitignore
git config --global core.excludesfile 2>/dev/null && cat "$(git config --global core.excludesfile)" 2>/dev/null || echo "Keine globale gitignore"
```

Prüfe ob diese Patterns vorhanden sind:
- [ ] `.env`, `.env.*`, `*.env` (Umgebungsvariablen)
- [ ] `*.key`, `*.pem`, `*.crt` (Zertifikate)
- [ ] `*.secret`, `credentials*`, `secrets*` (Credentials)
- [ ] `*.db`, `*.sqlite` (Datenbanken)
- [ ] `*.log` (Logs)
- [ ] `node_modules/` (Dependencies)
- [ ] `__pycache__/`, `*.pyc` (Python Cache)
- [ ] `.pio/`, `build/` (Build-Artefakte)
- [ ] `docker-compose.override.yml` (lokale Docker-Overrides)
- [ ] `backups/*.sql*` (DB-Backups)

#### 3b: Getrackte sensible Dateien (KRITISCH)

```bash
# Suche nach potenziell sensiblen getrackten Dateien
git ls-files | grep -iE "(\.env$|\.env\.|secret|password|\.pem|\.key|\.crt|\.p12|\.pfx|credential|token\.json|auth\.json|\.htpasswd|id_rsa|id_ed25519)"

# Prüfe auf Hardcoded Secrets in getrackten Dateien
git grep -l "password\s*=" -- "*.yml" "*.yaml" "*.json" "*.toml" "*.cfg" "*.ini" 2>/dev/null | grep -v node_modules | grep -v .git
git grep -l "PRIVATE KEY" -- . 2>/dev/null | grep -v node_modules | grep -v .git
```

#### 3c: Sensible Dateien Inventar

```bash
# Alle potenziell sensiblen Dateien (getrackt + ungetrackt)
find . -not -path "./.git/*" -not -path "*/node_modules/*" -not -path "*/__pycache__/*" \
  \( -name "*.env" -o -name ".env*" -o -name "*.pem" -o -name "*.key" -o -name "*.crt" \
     -o -name "*.secret" -o -name "credentials*" -o -name "*.token" \) 2>/dev/null
```

Für jede gefundene Datei dokumentiere:
| Datei | Getrackt | In .gitignore | Zweck | Gebraucht von |
|-------|----------|---------------|-------|---------------|

**SICHERHEITSREGEL:** NIEMALS echte Passwörter, Keys oder Tokens im Report zeigen.

#### 3d: Docker-Secrets Prüfung

```bash
# Hardcoded Credentials in docker-compose Dateien
grep -n "PASSWORD\|SECRET\|TOKEN\|API_KEY\|CREDENTIAL" docker-compose*.yml 2>/dev/null

# Mosquitto Auth-Status
grep -n "allow_anonymous\|password_file\|acl_file" docker/mosquitto/mosquitto.conf 2>/dev/null
grep -n "allow_anonymous\|password_file\|acl_file" .github/mosquitto/mosquitto.conf 2>/dev/null

# .env.example Vollständigkeitscheck
cat .env.example 2>/dev/null
```

### Phase 4: CI/CD Pipeline

```bash
# Workflow-Dateien
ls -la .github/workflows/ 2>/dev/null

# Jeden Workflow lesen
for f in .github/workflows/*.yml .github/workflows/*.yaml; do
  [ -f "$f" ] && echo "=== $(basename $f) ===" && cat "$f"
done 2>/dev/null

# Referenzierte Secrets finden
grep -rn "secrets\." .github/workflows/ 2>/dev/null

# GitHub-Konfigurationsdateien
cat .github/labeler.yml 2>/dev/null
cat .github/dependabot.yml 2>/dev/null
cat .github/CODEOWNERS 2>/dev/null
cat CODEOWNERS 2>/dev/null
cat .github/pull_request_template.md 2>/dev/null
```

Pro Workflow dokumentiere:
| Workflow | Trigger | Branches | Tests | Secrets |
|----------|---------|----------|-------|---------|

Prüfe:
- [ ] Actions mit Version-Pins? (z.B. `@v4` statt `@main`)
- [ ] Caching konfiguriert?
- [ ] Secrets minimal gehalten?
- [ ] Sensitive File Check in PRs?

### Phase 5: Branch-Schutz & Strategie

```bash
# Merge-Historie auf master
git log --oneline --merges master -10 2>/dev/null

# Commit-Konventionen prüfen (letzte 20 Commits)
git log --oneline -20 | grep -E "^[a-f0-9]+ (feat|fix|docs|chore|refactor|test|ci|style|perf|build)\(" | wc -l
git log --oneline -20
```

Dokumentiere:
- Merge-Strategie (Fast-Forward vs. Merge-Commits vs. Squash)
- Conventional Commits Einhaltung (Anteil der letzten 20)
- CODEOWNERS Status
- PR-Template Status
- Empfehlung für Branch Protection Rules

### Phase 6: Repo-Hygiene

```bash
# Repo-Größe
du -sh .git/
git count-objects -vH

# Top 10 größte Dateien im Repo
git rev-list --objects --all | git cat-file --batch-check='%(objecttype) %(objectname) %(objectsize) %(rest)' 2>/dev/null | awk '/^blob/ {print substr($0,6)}' | sort -rnk2 | head -10

# Große getrackte Dateien (>1MB)
find . -not -path "./.git/*" -not -path "*/node_modules/*" -type f -size +1M -exec ls -lh {} \; 2>/dev/null

# Stale Branches (lokal, ohne Commits in den letzten 30 Tagen)
git for-each-ref --sort=committerdate refs/heads/ --format='%(refname:short) %(committerdate:iso8601)' | while read branch date; do
  if [ "$(date -d "$date" +%s 2>/dev/null || date -j -f "%Y-%m-%d" "$date" +%s 2>/dev/null)" -lt "$(date -d '30 days ago' +%s 2>/dev/null || echo 0)" ]; then
    echo "STALE: $branch ($date)"
  fi
done 2>/dev/null

# Submodules
cat .gitmodules 2>/dev/null || echo "Keine Submodules"

# LFS
git lfs ls-files 2>/dev/null || echo "LFS nicht konfiguriert"

# .gitattributes
cat .gitattributes 2>/dev/null || echo "Keine .gitattributes"
```

### Phase 7: Report schreiben

Schreibe den Report nach `.claude/reports/current/GIT_HEALTH_REPORT.md`:

```markdown
# Git & GitHub Health Report
**Erstellt:** [Timestamp]
**Branch:** [aktueller Branch]
**Analyst:** git-health Skill (Read-Only)

## Schnellübersicht

| Bereich | Status | Details |
|---------|--------|---------|
| Ungepushte Commits | 🔴/🟢 | [Anzahl] |
| Secrets-Sicherheit | 🔴/🟢 | [Getrackte Secrets?] |
| .gitignore Abdeckung | 🔴/🟡/🟢 | [Fehlende Patterns] |
| CI/CD Pipeline | 🔴/🟡/🟢 | [Workflows, Status] |
| Repo-Hygiene | 🔴/🟡/🟢 | [Größe, Stale Branches] |

## 1. Git-Konfiguration
[Remotes, Branches, Config]

## 2. Arbeitsverzeichnis
[Modified, Staged, Untracked als Tabelle]

## 3. Secrets & Sicherheit

### 3a. .gitignore Abdeckung
[Checkliste der Pattern-Prüfung]

### 3b. Getrackte sensible Dateien
[KRITISCH wenn Funde]

### 3c. Sensible Dateien Inventar
[Tabelle aller sensiblen Dateien mit Tracking-Status]

### 3d. Docker-Secrets
[Hardcoded Credentials? Auth-Status?]

## 4. CI/CD Pipeline
[Workflow-Tabelle, Secrets, Action-Versions]

## 5. Branch-Schutz
[Protection Rules, CODEOWNERS, Merge-Strategie]

## 6. Repo-Hygiene
[Größe, große Dateien, Stale Branches, LFS]

## Bewertung

### 🔴 KRITISCH
[Was sofort behoben werden muss]

### 🟡 WICHTIG
[Was bald angegangen werden sollte]

### 🟢 GUT
[Was korrekt konfiguriert ist]

### 📋 EMPFEHLUNGEN
1. [Priorisierte Empfehlung]
2. [...]
```

## Regeln

1. Du ÄNDERST keine Dateien, keine Git-Config
2. Du commitest NICHTS, du pushst NICHTS, du stagest NICHTS
3. Du zeigst KEINE echten Passwörter, Keys oder Tokens
4. Jede Aussage mit dem Befehl belegen der sie erzeugt hat
5. Wenn ein Befehl fehlschlägt: Fehler dokumentieren, weitermachen
6. Report IMMER nach `.claude/reports/current/GIT_HEALTH_REPORT.md`

## Quick Reference

| Aspekt | Detail |
|--------|--------|
| Trigger | git-health, Repo-Check, Git prüfen |
| Input | Kein Input nötig |
| Output | `.claude/reports/current/GIT_HEALTH_REPORT.md` |
| Tools | Read, Grep, Glob, Bash (nur lesend) |
| Modus | Edit |
| Schreibt Dateien | Ja (nur den Report) |