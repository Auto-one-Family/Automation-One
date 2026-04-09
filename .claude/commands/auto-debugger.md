---
description: Startet auto-debugger mit Steuerdatei (Incident oder Artefakt-Verbesserung)
argument-hint: path zur Steuerdatei, z. B. .claude/auftraege/auto-debugger/inbox/STEUER-….md
---

# /auto-debugger

## Aufgabe

0. Arbeitsbranch: **`auto-debugger/work`** — vor Start `git checkout auto-debugger/work` (siehe Agent `.claude/agents/auto-debugger.md` Abschnitt 0a). **Kein** `git push` / Force-Operationen durch den Agenten; **Bash/Git** nur im dort erlaubten Umfang (Branch prüfen/wechseln, Status, read-only log/diff).

1. Lies die **Steuerdatei** aus dem Argument `path` (repo-relativ oder absolut zum Workspace).
2. Validiere die Pflichtfelder gemaess `.claude/skills/auto-debugger/SKILL.md`.
3. Starte den Workflow mit dem Agenten **auto-debugger** (`.claude/agents/auto-debugger.md`): Incident-Artefakte, Korrelation, Pakete, **/verify-plan-Gate** vor Implementierung aus `TASK-PACKAGES.md` (Chat-Block **OUTPUT FÜR ORCHESTRATOR** laut Skill `verify-plan`), **`VERIFY-PLAN-REPORT.md`** im Run-Ordner, danach **Post-Verify:** `TASK-PACKAGES.md` mutieren und **`SPECIALIST-PROMPTS.md`** rollenweise — **ohne** eigene Produkt-Implementierung durch den Orchestrator in dieser Phase.

## Beispiel

```text
/auto-debugger .claude/auftraege/auto-debugger/inbox/STEUER-obs-ist-2026-04-09.md
```

Alternativ im Chat: `@.claude/auftraege/auto-debugger/inbox/STEUER-….md` und Agent **auto-debugger** auswaehlen.

## Verweise

- Skill: `.claude/skills/auto-debugger/SKILL.md`
- Vorlage: `.claude/auftraege/auto-debugger/STEUER-VORLAGE.md`
- Konzept: `docs/analysen/KONZEPT-auto-debugger-frontend-flow-api-alertcenter-2026-04-09.md`
