# .technical-manager/ — Navigation

> TM-Workspace fuer den Technical Manager (Entscheidungs-Orchestrator).
> Der TM implementiert keinen Code, sondern analysiert, priorisiert und formuliert Auftraege.

---

## Verzeichnisstruktur

```
.technical-manager/
├── TECHNICAL_MANAGER.md    ← Session-Router: Prioritaeten, offene Epics, Entscheidungen
├── README.md               ← Diese Datei (Navigation)
├── inbox/                  ← Eingehende Auftraege, Roadmaps, User-Notizen
│   └── roadmap-*.md        ← Roadmap-Fragmente die noch eingeordnet werden muessen
├── reports/                ← TM-eigene Analyse-Reports
│   ├── SPRINT-*.md         ← Sprint-Plaene und Status
│   ├── SYNTHESE-*.md       ← Konsolidierte Implementierungsplaene
│   ├── A1-*, A2-*, A3-*    ← Schicht-spezifische Analysen (ESP32, Server, Frontend)
│   └── strategic/          ← Langfristige Strategie (KI-Integration etc.)
└── archive/                ← Abgeschlossene Reports, chronologisch sortiert
    └── YYYY-MM-DD_HH-MM_thema/
```

---

## Wie Linear und verify-plan einzuordnen sind

**Linear** ist der **Issue-Tracker** fuer alle Arbeitspakete:
- Team: AutoOne (AUT-*)
- Projekte gruppieren zusammengehoerige Issues
- Jedes Issue hat einen zugewiesenen Agenten im Beschreibungstext
- Abhaengigkeiten und Reihenfolge sind in Linear verlinkt

**verify-plan** ist das **Qualitaetsgate** zwischen Plan und Umsetzung:
- Laeuft nach Issue-Erstellung, vor Implementierung
- Prueft: Existieren referenzierte Pfade? Sind Test-Befehle korrekt? Gibt es Breaking-Changes?
- Output: Korrekturen an Issues (Pfade, Tests, Kriterien)
- Kein Code wird geschrieben — nur Plan-Validierung

**Workflow:** TM erstellt Issues → verify-plan prueft → TM korrigiert Issues → Dev-Agent implementiert

---

## Beziehung zu anderen Repo-Bereichen

| Bereich | Pfad | TM-Nutzung |
|---------|------|------------|
| Agent-Definitionen | `.claude/agents/*.md` | Lesen: welcher Agent kann was |
| Skills | `.claude/skills/*/SKILL.md` | Lesen: Skill-Trigger und -Ablauf |
| Referenzen | `.claude/reference/` | Lesen: TM_WORKFLOW, API-Docs, Error-Codes |
| Rules (path-scoped) | `.claude/rules/*.md` | Lesen: Schicht-spezifische Regeln |
| Auftraege | `.claude/auftraege/` | Schreiben: Steuerdateien fuer auto-debugger |
| Reports (Agents) | `.claude/reports/current/` | Lesen: Agent-Outputs, konsolidierte Berichte |
| Analyse-Docs | `docs/analysen/` | Schreiben: TM-Analysen und Fixplaene |

---

## Quick Reference: TM-Entscheidungspfade

1. **Einfacher Bug, eine Schicht** → Fast-Track (direkt Issue + Dev-Agent)
2. **Unklare Ursache, mehrere Schichten** → F1 Test-Flow (system-control → Debug → Meta)
3. **Kritischer Incident** → auto-debugger (Steuerdatei → TASK-PACKAGES → verify-plan)
4. **Neues Feature / Analyse** → Analysepfad (Inventur → Defektkatalog → Fixplan → Issues)

Details: `.claude/reference/TM_WORKFLOW.md`
