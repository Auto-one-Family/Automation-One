# Git Commit Plan
**Erstellt:** 2026-02-27
**Branch:** master (behind origin/master by 5 commits)
**Ungepushte Commits:** 0
**Aenderungen gesamt:** 1 modified, 2 untracked (1 report + 1 cache-dir)

---

## Situation

- **Lokal:** 1 modifizierte Datei + 1 neuer Report + 1 Playwright-MCP Cache-Verzeichnis
- **Remote:** 5 neue Commits (Frontend-Features + Docs)
- **Konflikte:** KEINE — Remote hat andere Dateien geaendert
- **Strategie:** Lokal committen → Pull (Fast-Forward) → Verifizieren

---

## Commit 1: chore(git): add playwright-mcp cache to gitignore

**Was:** `.playwright-mcp/` ist der Playwright MCP Server Cache (Console-Logs, Screenshots). Gehoert nicht ins Repo. Wird zur `.gitignore` hinzugefuegt.

**Dateien:**
- `.gitignore` — Eintrag `.playwright-mcp/` hinzufuegen

**Befehle:**
```bash
git add .gitignore
git commit -m "chore(git): add playwright-mcp cache to gitignore"
```

---

## Commit 2: docs(reports): update auftrag status and add dashboard reactivity bugfix spec

**Was:** Auftrag-Hauptdokument mit Block 1+2 als ERLEDIGT aktualisiert, Referenzpfad korrigiert. Neuer Auftrag fuer Dashboard-Reaktivitaet und Performance (Bug 3b/3c aus HW-Test).

**Dateien:**
- `.claude/reports/current/auftrag.md` — Block 1+2 ERLEDIGT markiert, Referenzpfad korrigiert
- `.claude/reports/current/auftrag-dashboard-reaktivitaet-performance.md` — Neuer Bugfix-Auftrag (3 Bugs, 4 Bloecke)

**Befehle:**
```bash
git add .claude/reports/current/auftrag.md .claude/reports/current/auftrag-dashboard-reaktivitaet-performance.md
git commit -m "docs(reports): update auftrag status and add dashboard reactivity bugfix spec"
```

---

## Nach den Commits: Pull

```bash
# Remote-Aenderungen holen (Fast-Forward, kein Merge noetig)
git pull origin master

# Status pruefen
git status
```

---

## Remote eingehend (5 Commits)

| Commit | Beschreibung |
|--------|-------------|
| `1c820aa` | docs(skills): update dashboard navigation references |
| `873444b` | feat(frontend): sensor grouping helpers |
| `4b74e0c` | feat(dashboard): DeviceMiniCard/UnassignedDropBar overhaul |
| `94f46f8` | feat(dashboard): zone aggregation, subzone chips, sorting |
| `caaea4b` | docs(reports): overview tab redesign task spec |

**Hinweise:**
- Kein Merge-Konflikt erwartet (Remote und Lokal aendern unterschiedliche Dateien)
- `.playwright-mcp/` wird nach dem gitignore-Commit nicht mehr als untracked angezeigt
