---
description: Startet auto-debugger mit Linear-Issue (primär) oder Steuerdatei (legacy)
argument-hint: "Linear-Issue-ID (z. B. AUT-209) oder legacy @inbox/STEUER-….md"
---

# /auto-debugger

## Aufgabe

0. Arbeitsbranch: **`auto-debugger/work`** — vor Start `git checkout auto-debugger/work` (siehe Agent `.claude/agents/auto-debugger.md` Abschnitt 0a). **Kein** `git push` / Force-Operationen durch den Agenten; **Bash/Git** nur im dort erlaubten Umfang.

1. **Primärer Eingang (Linear):** Linear-Issue mit Label `auto-debugger` + Status `In Progress`. Lese `scope`, `forbidden`, `done_criteria` aus dem Issue-Body.  
   **Fallback (legacy):** Steuerdatei aus dem Argument `path` — Inbox ist eingefroren (Lesepfad); keine neuen STEUER-MDs schreiben.

2. Validiere Pflichtfelder gemäß `.claude/skills/auto-debugger/SKILL.md` Sektion 2.

3. Führe **Analyse-Schwerpunkt** aus (Docker → Loki → Prometheus → DB → Traces) gemäß Agent Sektion **0d**.

4. Pro Finding:
   - **Search-vor-Create** in Linear (`list_issues` + Schlüsselwörter aus Symptom + Layer)
   - **Linear-Issue** anlegen/erweitern mit Kategorie-Label (aus `0e`), Fix-Anker, Schicht, Konsolidierungs-Hinweis
   - **Beleg-MD** unter `.claude/reports/current/auto-debugger-runs/<run_id>/BELEG-<finding-id>-<YYYY-MM-DD>.md` (Vorlage: `BELEG-VORLAGE.md`)

5. Bei `TASK-PACKAGES.md`: **/verify-plan-Gate** vor Implementierung (Chat-Block **OUTPUT FÜR ORCHESTRATOR**), **`VERIFY-PLAN-REPORT.md`** schreiben, dann **Post-Verify:** `TASK-PACKAGES.md` mutieren + **`SPECIALIST-PROMPTS.md`** rollenweise — **ohne** eigene Produkt-Implementierung.

6. **Konsolidierungs-Regel** (Sektion 8) und **Rollen-Trennung** (Sektion 9) in Agent beachten — kein Code-Change direkt.

## Beispiele

```text
# Primär: Linear-Issue als Steuerung
/auto-debugger AUT-209

# Legacy: Steuerdatei (historisch, eingefroren)
/auto-debugger .claude/auftraege/auto-debugger/inbox/STEUER-obs-ist-2026-04-09.md
```

Alternativ im Chat: `AUT-209 abarbeiten` und Agent **auto-debugger** auswählen.

## Verweise

- Agent: `.claude/agents/auto-debugger.md`
- Skill: `.claude/skills/auto-debugger/SKILL.md`
- Beleg-Vorlage: `.claude/auftraege/auto-debugger/BELEG-VORLAGE.md`
- Legacy-Inbox: `.claude/auftraege/auto-debugger/inbox/` (Lesepfad, eingefroren)
- Konzept: `docs/analysen/KONZEPT-auto-debugger-frontend-flow-api-alertcenter-2026-04-09.md`
