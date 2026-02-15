---
name: git-commit
description: |
  Analysiert Git-Changes und bereitet saubere Commits vor.
  Gruppiert Änderungen logisch, schlägt Staging-Reihenfolge vor,
  formuliert Conventional Commit Messages.
  Verwenden bei: git-commit, Commit vorbereiten, Changes analysieren,
  Änderungen committen, was wurde geändert, Staging-Plan
allowed-tools: Read, Grep, Glob, Bash
user-invocable: true
---

# /git-commit – Change-Analyse & Commit-Vorbereitung

> Modus: EDIT (immer)
> Output: `.claude/reports/current/GIT_COMMIT_PLAN.md`
> Rolle: Analysiert alle Änderungen, gruppiert sie logisch, bereitet Staging und Commits vor

## Kern-Prinzip

Du analysierst ALLE aktuellen Änderungen im Arbeitsverzeichnis (modified, staged, untracked). Du gruppierst sie in logische Commits, schlägst eine Reihenfolge vor, und formulierst menschenverständliche Conventional Commit Messages. Du führst KEINE Git-Befehle aus die den Zustand ändern – kein add, kein commit, kein push.

Der User liest deinen Plan, prüft ihn, und führt die Befehle selbst aus.

## Ablauf

### Phase 1: Änderungen erfassen

```bash
# Vollständiger Status
git status

# Modified (nicht staged) – mit Diff-Statistik
git diff --stat

# Staged – mit Diff-Statistik
git diff --cached --stat

# Untracked
git ls-files --others --exclude-standard

# Aktueller Branch + Upstream-Status
git status -sb

# Letzte 5 Commits für Kontext
git log --oneline -5
```

### Phase 2: Änderungen verstehen

Für JEDE geänderte Datei:

```bash
# Diff der Datei lesen (modified)
git diff -- <datei>

# Diff der Datei lesen (staged)
git diff --cached -- <datei>
```

Für JEDE ungetrackte Datei:
```bash
# Erste 30 Zeilen lesen
head -30 <datei>
```

Kategorisiere jede Änderung:

| Kategorie | Conventional Prefix | Beschreibung |
|-----------|-------------------|--------------|
| Neue Funktion | `feat` | Neue Funktionalität hinzugefügt |
| Bugfix | `fix` | Fehler behoben |
| Dokumentation | `docs` | Nur Doku-Änderungen |
| Refactoring | `refactor` | Code-Umbau ohne Funktionsänderung |
| Konfiguration | `chore` | Build, Config, Dependencies |
| Tests | `test` | Tests hinzugefügt/geändert |
| CI/CD | `ci` | Pipeline-Änderungen |
| Styling | `style` | Formatierung, Whitespace |
| Performance | `perf` | Performance-Verbesserung |

Bestimme den Scope aus dem Dateipfad:

| Pfad-Pattern | Scope |
|-------------|-------|
| `.claude/agents/*` | `agents` |
| `.claude/skills/*` | `skills` |
| `.claude/rules/*` | `rules` |
| `.claude/reference/*` | `docs` |
| `.claude/reports/*` | `reports` |
| `.claude/CLAUDE.md` | `routing` |
| `El Servador/**` | `server` |
| `El Trabajante/**` | `firmware` |
| `El Frontend/**` | `frontend` |
| `docker-compose*.yml` | `docker` |
| `docker/**` | `docker` |
| `Makefile` | `build` |
| `.github/**` | `ci` |
| `.gitignore` | `git` |
| `.env*` | `config` |
| `scripts/**` | `scripts` |
| `logs/**` | `logging` |

### Phase 3: Logische Gruppierung

Gruppiere Änderungen die **zusammen committed werden sollten**:

Regeln für Gruppierung:
1. **Eine logische Einheit pro Commit** – Änderungen die dasselbe Problem lösen oder dasselbe Feature implementieren
2. **Doku mit Code** – Wenn Code und zugehörige Doku geändert wurden, gehören sie zusammen
3. **Config separat** – `.env`, `docker-compose`, `Makefile` Änderungen einzeln committen wenn sie eigenständig sind
4. **Agents/Skills zusammen** – Neuer Agent + zugehöriger Skill + CLAUDE.md Update = ein Commit
5. **Reihenfolge beachten** – Infrastruktur vor Features, Config vor Code

Reihenfolge-Priorität:
1. Infrastruktur & Config (docker, .env, Makefile)
2. Datenbank-Migrations
3. Core-Code (Server, Firmware, Frontend)
4. Agent/Skill-Definitionen
5. Dokumentation & Referenzen
6. Reports & Logs
7. Cleanup & Formatting

### Phase 4: Commit-Plan schreiben

Schreibe den Plan nach `.claude/reports/current/GIT_COMMIT_PLAN.md`:

```markdown
# Git Commit Plan
**Erstellt:** [Timestamp]
**Branch:** [aktueller Branch]
**Ungepushte Commits:** [Anzahl] (vor diesem Plan)
**Änderungen gesamt:** [X] modified, [Y] untracked, [Z] staged

---

## Commit [N]: [type]([scope]): [kurze Beschreibung]

**Was:** [Menschenverständliche Erklärung was diese Änderung tut und warum]

**Dateien:**
- `pfad/zur/datei1` – [was wurde geändert]
- `pfad/zur/datei2` – [was wurde geändert]

**Befehle:**
```bash
git add pfad/zur/datei1 pfad/zur/datei2
git commit -m "[type]([scope]): [message]"
```

---

## Commit [N+1]: ...

[Nächster Commit analog]

---

## Abschluss

**Nach allen Commits:**
```bash
# Status prüfen
git status

# Push
git push origin [branch]
```

**Zusammenfassung:**
| # | Commit | Dateien | Typ |
|---|--------|---------|-----|
| 1 | `[type]([scope]): [msg]` | [Anzahl] | [feat/fix/docs/...] |
| 2 | ... | ... | ... |

**Hinweise:**
- [Besonderheiten, Warnungen, Abhängigkeiten zwischen Commits]
```

## Sonderfälle

### Bereits gestaged Dateien

Wenn Dateien bereits gestaged sind:
- Prüfe ob die Staging-Gruppierung sinnvoll ist
- Falls nicht: Empfehle `git reset HEAD <datei>` zum Unstagen
- Im Plan explizit markieren: "BEREITS STAGED"

### Große Anzahl Änderungen (>20 Dateien)

- Gruppiere aggressiver
- Maximal 8-10 Commits pro Plan
- Lieber ein etwas gröberer Commit als 20 Micro-Commits

### Merge-Konflikte

```bash
git diff --name-only --diff-filter=U 2>/dev/null
```

Falls Konflikte: STOPP. Dokumentiere welche Dateien betroffen sind und dass Konflikte zuerst gelöst werden müssen.

### Untracked Verzeichnisse

Bei neuen Verzeichnissen (z.B. `.claude/skills/verify-plan/`):
- Gesamtes Verzeichnis als eine Einheit behandeln
- `git add pfad/zum/verzeichnis/` statt einzelne Dateien

## Commit-Message Regeln

Format: `type(scope): kurze beschreibung in Imperativ`

- **Englisch** (Projekt-Konvention aus den letzten Commits ableiten)
- **Imperativ** ("add" nicht "added", "fix" nicht "fixed")
- **Max 72 Zeichen** in der ersten Zeile
- **Kein Punkt** am Ende
- **Scope** aus der Pfad-Tabelle oben ableiten
- Bei mehreren Scopes: Den dominanten nehmen

Gute Beispiele:
```
feat(skills): add verify-plan skill for TM plan validation
docs(reference): update REST endpoint documentation
chore(docker): add monitoring stack configuration
fix(server): resolve MQTT reconnection timeout
refactor(agents): rename agent files to kebab-case
```

Schlechte Beispiele:
```
update files                          ← Kein Typ, kein Scope, nichtssagend
feat: added new stuff                 ← Kein Scope, Vergangenheit, vage
fix(server): Fix the bug in server.   ← Großbuchstabe, Punkt, welcher Bug?
```

## Regeln

1. Du führst KEIN `git add`, `git commit`, `git push` aus
2. Du änderst KEINE Dateien außer dem Commit-Plan
3. Du liest JEDEN Diff vollständig um die Änderung zu verstehen
4. Commit-Messages müssen die Änderung für einen Menschen erklären der den Diff NICHT sieht
5. Reihenfolge muss Abhängigkeiten respektieren
6. Report IMMER nach `.claude/reports/current/GIT_COMMIT_PLAN.md`

## Quick Reference

| Aspekt | Detail |
|--------|--------|
| Trigger | git-commit, Commit vorbereiten, Changes analysieren |
| Input | Kein Input nötig (liest Git-Status) |
| Output | `.claude/reports/current/GIT_COMMIT_PLAN.md` |
| Tools | Read, Grep, Glob, Bash (nur lesend) |
| Modus | Edit |
| Schreibt Dateien | Ja (nur den Commit-Plan) |