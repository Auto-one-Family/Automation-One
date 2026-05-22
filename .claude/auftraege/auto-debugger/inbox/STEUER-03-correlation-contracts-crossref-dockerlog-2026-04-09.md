---
# Steuerdatei fuer auto-debugger (YAML-Frontmatter)
run_mode: artefact_improvement
incident_id: INC-2026-04-09-dockerlog-obs-triage
run_id: dockerlog-obs-triage-2026-04-09
order: incident_first
target_docs:
  - docs/analysen/IST-observability-correlation-contracts-2026-04-09.md
scope: |
  Voraussetzung: STEUER-02 abgeschlossen — docs/analysen/IST-docker-log-triage-observability-signal-vs-noise-2026-04-09.md
  existiert als SSOT zur Docker-Log-Auswertung.

  Ziel: Datei docs/analysen/IST-observability-correlation-contracts-2026-04-09.md pruefen und **nur additiv**
  ergaenzen, falls sinnvoll: Querverweise auf Correlation und **Trennung** von
  (1) Geraete-MQTT-Fehlern auf …/system/error (z. B. 6016-Pfad) und
  (2) Collector-/Deploy-/Stack-Rauschen (Alloy-Tailer, Grafana-Provisioning, Schein-„error“ in Queries/DB-Text).

  Wenn keine inhaltliche Erweiterung noetig ist: kurzen Abschnitt „Abgleich 2026-04-09“ mit Verweis auf das IST-Triage-Dokument
  und **einem Satz** warum die Correlation-Contracts unveraendert bleiben — statt den gesamten Docker-Bericht zu wiederholen.

  Keine Duplikation des IST-docker-log-triage-Inhalts; nur Contracts schaerfer machen oder Cross-Links setzen.
forbidden: |
  Keine Secrets; keine Breaking Changes an REST/MQTT/WebSocket/DB.
  Keine grossflaechige Umschreibung der bestehenden Correlation-Contracts ohne fachliche Notwendigkeit — Praefenz: additive
  Unterabschnitte oder Querverweise.
  Code-Aenderungen ausserhalb von Markdown: nicht Ziel dieses Laufs.
  Branch auto-debugger/work fuer alle Commits; kein git push / force durch Agenten.
  Bash/PowerShell nur eingeschraenkt; Befehle mit Semikolon verketten, nicht && .
  Keine Pfade ausserhalb der Auto-one-Wurzel; keine Strategie-Repo-Verweise.
done_criteria: |
  docs/analysen/IST-observability-correlation-contracts-2026-04-09.md: entweder
  (a) additiv um Querverweise/Correlation zu MQTT system/error und Deploy-Lifecycle/Observability-Laerm ergaenzt, **oder**
  (b) unveraendert belassen **mit** kurzem Abgleich-Abschnitt und Begruendung + Link auf IST-docker-log-triage-... .
  Keine inhaltliche Widerspruechlichkeit zum IST-Triage-Dokument aus STEUER-02.
---

# Steuerlauf 3/4 — Correlation-Contracts: Querverbindung zur Docker-Triage

**Agent:** `auto-debugger`  
**Modus:** `artefact_improvement`  
**Run-ID:** `dockerlog-obs-triage-2026-04-09`

## Ziel (ein Satz)

Correlation-/Contract-Doku und **Geraete-Signal vs. Stack-Rauschen** sauber verknuepfen — minimal-invasiv.

## Eingrenzung

- Nur `IST-observability-correlation-contracts-2026-04-09.md`.
- Kein Ersatz fuer das Haupt-IST aus STEUER-02.

## Abnahme (messbar)

Siehe `done_criteria` — Variante (a) oder (b) dokumentiert.

## Runbook (imperativ)

1. Branch `auto-debugger/work` verifizieren.
2. `IST-observability-correlation-contracts-2026-04-09.md` und `IST-docker-log-triage-observability-signal-vs-noise-2026-04-09.md` lesen.
3. Entscheiden: additive Ergaenzung vs. Abgleich-Only — laut `scope` umsetzen.
4. STOP — naechster Schritt: STEUER-04 (optionale TASK-PACKAGES / Mini-Compose).

---

## Agent-Prompt (Copy-Paste)

```text
@auto-debugger @.claude/auftraege/auto-debugger/inbox/STEUER-03-correlation-contracts-crossref-dockerlog-2026-04-09.md
Bitte IST-observability-correlation-contracts gemaess Steuerdatei additiv oder mit Abgleich-Begruendung.
```
