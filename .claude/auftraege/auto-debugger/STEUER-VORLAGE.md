---
# Steuerdatei fuer auto-debugger (YAML-Frontmatter — von Claude/Code auslesbar)
run_mode: artefact_improvement   # incident | artefact_improvement | both
incident_id: ""                 # bei incident/both: z. B. INC-2026-04-09-001
run_id: ""                      # optional: Slug fuer .claude/reports/current/auto-debugger-runs/<run_id>/
order: incident_first           # bei both: incident_first | artefact_first
target_docs:
  - docs/analysen/IST-observability-correlation-contracts-2026-04-09.md
scope: |
  Beschreibung, was bearbeitet wird (z. B. nur additive Abschnitte, Korrelation, Verweise auf Codepfade).
forbidden: |
  Harte Grenzen: keine Secrets; keine Breaking Changes an REST/MQTT/WS/DB ohne separates Gate;
  keine direkten Commits auf master im Rahmen dieses Laufs (nur Branch auto-debugger/work); …
done_criteria: |
  Messbar: z. B. alle P0-Luecken aus Steuerdatei geschlossen oder als BLOCKER dokumentiert.
---

# Steuerdatei — auto-debugger

> Datei nach `inbox/STEUER-<kurz-id>-<YYYY-MM-DD>.md` kopieren und Felder ausfuellen.  
> **Norm:** Jeder strukturierte Lauf beginnt mit dieser Datei; freies Chatten ohne sie nur zur Klaerung.  
> **Git:** Arbeitsbranch für auto-debugger ist **`auto-debugger/work`** — vor dem Lauf `git checkout auto-debugger/work`.

## Felder (Kurzuebersicht)

| Feld | Pflicht | Beschreibung |
|------|---------|--------------|
| `run_mode` | ja | `incident` \| `artefact_improvement` \| `both` |
| `incident_id` | bei incident/both | Ordner `.claude/reports/current/incidents/<id>/` |
| `run_id` | nein | Ausgabeordner fuer Pakete/Verify im Artefakt-Modus |
| `target_docs` | ja* | Repo-relative Pfade zu Markdown-Zielen; *bei incident leer nur mit Begruendung in `scope` |
| `scope` | ja | Inhaltliche Grenzen |
| `forbidden` | ja | Verbotenes |
| `done_criteria` | ja | Abnahme |
| `order` | bei both | `incident_first` (Default) oder `artefact_first` |

## Inhaltliche Notizen (optional)

<!-- Freitext: Symptom, Links zu Logs (ohne Secrets), betroffene esp_id, … -->
