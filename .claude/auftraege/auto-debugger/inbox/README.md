# auto-debugger Inbox — ARCHIV (eingefroren)

> **Status:** Eingefroren ab 2026-04-29 (AUT-209).  
> **Neue Steuerung:** Linear-Issue mit Label `auto-debugger` + Status `In Progress`.  
> **Dieser Ordner ist Lesepfad** — keine neuen STEUER-*.md mehr hier ablegen.

---

## Historische Steuerdateien (Lesezugriff)

Die vorhandenen `STEUER-*.md`-Dateien bleiben als historische Referenz erhalten und sind weiter lesbar. Sie können für Archiv-Lookups und Nachvollziehbarkeit genutzt werden, aber `auto-debugger` schreibt **keine neuen** Steuerdateien mehr in diesen Ordner.

## Neue Steuerung

```
1. TM legt Linear-Issue an (Label: auto-debugger, Status: In Progress)
2. Issue-Body enthält: scope, forbidden, done_criteria
3. auto-debugger liest Issue → führt Analyse durch → erstellt Findings als Linear-Issues
4. Findings-Output: Linear-Issue (Search-vor-Create) + BELEG-MD
```

## Beleg-MD-Ablageort

`.claude/reports/current/auto-debugger-runs/<run_id>/BELEG-<finding-id>-<YYYY-MM-DD>.md`

Vorlage: `.claude/auftraege/auto-debugger/BELEG-VORLAGE.md`

## Referenzen

- Agent: `.claude/agents/auto-debugger.md`
- Skill: `.claude/skills/auto-debugger/SKILL.md`
- Linear: Issues mit Label `auto-debugger`
