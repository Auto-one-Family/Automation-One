---
# Steuerdatei fuer auto-debugger (YAML-Frontmatter)
run_mode: incident
incident_id: INC-2026-04-09-dockerlog-obs-triage
run_id: dockerlog-obs-triage-2026-04-09
order: incident_first
target_docs: []
scope: |
  Ziel: Unter .claude/reports/current/incidents/INC-2026-04-09-dockerlog-obs-triage/ eine schlanke,
  wiederfindbare Incident-Dokumentation anlegen (README.md oder index.md als Einstieg).

  Ausgangslage (aus Docker-Log-Auswertung Stand 2026-04-09): AutoOps-Stichprobe 9/9; in der ERROR-Breitensuche
  keine strengen Server-/Frontend-/Postgres-ERROR-Treffer — das als Kontext nennen, ohne gruene Behauptungen
  zu erweitern, die nicht aus dieser Auswertung stammen.

  Drei Befundklassen strikt trennen (keine Vermischung in einer flachen ERROR-Suche):
  (A) Echte MQTT-Geraete-Signale auf …/system/error inkl. Code 6016 (EMERGENCY_PARSE_ERROR / EmptyInput) und
  zugehoerige intent_outcome bzw. kritische Drops — mit Topics/ESP-IDs aus dem vorliegenden Bericht, soweit genannt;
  (B) Operationaler Observability-Stack-Laerm: fehlendes Grafana-Plugin-Provisioning-Verzeichnis; Alloy: Tailer auf
  tote/entfernte Container-IDs („No such container“ / dead container);
  (C) Schein-Fehler: Loki-Query-Text mit Literal „error“, JSON-Labels, Alert-Text in DB-INSERTs — klar als Nicht-Signal
  markieren.

  Optional kurz: cAdvisor-DMI-/Windows-Hinweise als erwartbar einordnen (Prioritaet niedrig, keine Produkt-Stoerung).

  Lieferobjekt dieses Laufs: nur Incident-Ordner + index/README — keine docs/analysen/-Dateien (folgen in STEUER-02/03).
forbidden: |
  Keine Secrets; keine Pfade oder Repo-Namen ausserhalb der Auto-one-Wurzel.
  Keine Breaking Changes an REST/MQTT/WebSocket/DB; kein git push, kein force-push, kein force-merge durch Agenten.
  Code-Aenderungen in diesem Lauf: keine — nur Markdown-Artefakte unter .claude/reports/current/incidents/...
  Bash/PowerShell nur fuer eingeschraenktes Git: Branch pruefen (auto-debugger/work), status, read-only log/diff;
  Befehle mit Semikolon verketten, nicht && .
  Keine gruenen Behauptungen zu Playwright/vue-tsc ohne nachweisbare lokale Voraussetzungen.
  Keine Verweise auf Strategie-Repositorys oder externe Projektverzeichnisse.
done_criteria: |
  Ordner .claude/reports/current/incidents/INC-2026-04-09-dockerlog-obs-triage/ existiert mit README.md oder index.md:
  Symptom, Zeitfenster der Auswertung, betroffene Container/Topics/ESP-IDs (paraphrasiert, keine Secrets).
  Trennung A/B/C aus scope ist im Text explizit und an mindestens je einem Beispiel pro Klasse belegt
  (6016-Pfad; Grafana-Plugins-Verzeichnis; Alloy Container-ID; Klasse C mit Kurzbeispiel-Typ).
  Optional: Timeline-Datei oder Abschnitt „Evidenz“ mit paraphrasierten Log-Zeilen — keine vollstaendigen Dumps.
---

# Steuerlauf 1/4 — Incident: Docker-Log-Triage vs. Observability-Rauschen

**Agent:** `auto-debugger`  
**Modus:** `incident`  
**Incident-ID:** `INC-2026-04-09-dockerlog-obs-triage`  
**Run-ID:** `dockerlog-obs-triage-2026-04-09`

## Ziel (ein Satz)

Incident-Artefakt als **feste Referenz** fuer Signal (A) vs. Stack-Laerm (B) vs. Schein-Fehler (C) **vor** den IST-Dokumenten unter `docs/analysen/`.

## Eingrenzung

- Nur `.claude/reports/current/incidents/...` — **keine** `docs/analysen/`-Bearbeitung in diesem Lauf.
- Branch `auto-debugger/work` vor Git-Operationen verifizieren; bei diesem Lauf typischerweise nur lesende Git-Nutzung.

## Abnahme (messbar)

README/index vollstaendig nach `done_criteria` im Frontmatter; A/B/C klar getrennt.

## Runbook (imperativ)

1. `git branch --show-current` pruefen; bei Bedarf `git checkout auto-debugger/work` (Working Tree sauber halten).
2. Ordner `.claude/reports/current/incidents/INC-2026-04-09-dockerlog-obs-triage/` anlegen.
3. `README.md` oder `index.md` schreiben: Metadaten (Datum, Auswertungskontext), Ausgangslage (Stichprobe), dann Abschnitte **A**, **B**, **C** mit den konkreten Beispielen aus der Docker-Log-Auswertung (6016, Topics, Grafana-Pfad, Alloy, Loki/DB-Scheinfehler).
4. Optional: kurze `TIMELINE.md` oder Abschnitt Zeitfenster — nur wenn aus dem Material sinnvoll.
5. STOP — naechster Schritt: STEUER-02 (IST-Hauptdokument).

---

## Agent-Prompt (Copy-Paste)

```text
@auto-debugger @.claude/auftraege/auto-debugger/inbox/STEUER-01-incident-dockerlog-obs-triage-2026-04-09.md
Bitte nur Incident-Ordner und README/index gemaess Steuerdatei; keine docs/analysen/-Aenderungen in diesem Lauf.
```
