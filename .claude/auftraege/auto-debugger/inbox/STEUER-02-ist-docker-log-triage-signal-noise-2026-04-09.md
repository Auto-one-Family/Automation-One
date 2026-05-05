---
# Steuerdatei fuer auto-debugger (YAML-Frontmatter)
run_mode: artefact_improvement
incident_id: INC-2026-04-09-dockerlog-obs-triage
run_id: dockerlog-obs-triage-2026-04-09
order: incident_first
target_docs:
  - docs/analysen/IST-docker-log-triage-observability-signal-vs-noise-2026-04-09.md
scope: |
  Voraussetzung: Incident-Ordner aus STEUER-01 existiert und enthaelt die Trennung A/B/C — Inhalt hier konsistent
  fortsetzen, nicht widersprechen.

  Ziel: docs/analysen/IST-docker-log-triage-observability-signal-vs-noise-2026-04-09.md als **Single Source of Truth**
  fuer diese Docker-Log-Auswertung (Stand 2026-04-09) erstellen oder vollstaendig ausformulieren.

  Inhaltliche Pflichtelemente:
  - Kurzmethodik: strenge Muster (gezielte Klassen A/B/C) vs. flache Breitensuche „ERROR“ — und warum Letzteres
    Signal und Rauschen vermischt.
  - Tabelle oder strukturierte Abschnitte **Signal vs. Nicht-Signal** mit Verweis auf Incident-Evidenz
    (.claude/reports/current/incidents/INC-2026-04-09-dockerlog-obs-triage/).
  - Prioritaeten: **P0** Produktpfad 6016 (EMERGENCY_PARSE_ERROR / EmptyInput) auf …/system/error klaeren —
    inkl. intent_outcome/kritische Drops; **P1** Alloy/Grafana-Befunde bereinigen oder dokumentieren (Compose/Mount
    vs. reine Doku — mit begruendeter Empfehlung); **P2** cAdvisor-Windows-Hinweise als erwartbar markieren.
  - Naechste Schritte: Firmware/Broadcast-Emergency vs. Alloy/Grafana-Neustart vs. fehlendes Grafana-Plugin-Provisioning
    — ohne Codeaenderung in diesem Lauf, ausser ausdruecklich in STEUER-04.
  - Explizite Verweise auf Repo-Stellen im Checkout: MQTT-Handler, Alert-/Correlation-Konzept — soweit auffindbar,
    ohne Secrets.

  Keine Wiederholung des gesamten Rohlogs; Querverweise auf Incident statt Copy-Paste von Secrets.
forbidden: |
  Keine Secrets; keine Breaking Changes an REST/MQTT/WebSocket/DB ohne separates Gate.
  Code-Aenderungen nur auf Branch auto-debugger/work; in diesem Lauf **bevorzugt reine Doku** unter docs/analysen/.
  kein git push, kein force-push, kein force-merge durch Agenten.
  Bash/PowerShell nur eingeschraenkt: Branch pruefen, checkout auto-debugger/work, status, read-only log/diff;
  Befehle mit Semikolon verketten, nicht && .
  Keine Pfade ausserhalb der Auto-one-Wurzel; keine Verweise auf Strategie-Repositorys.
  Keine gruenen Behauptungen zu Playwright/vue-tsc ohne nachweisbare lokale Voraussetzungen.
done_criteria: |
  Datei docs/analysen/IST-docker-log-triage-observability-signal-vs-noise-2026-04-09.md existiert und enthaelt:
  messbare Abschnitte zu Methodik, Prioritaeten P0–P2, Signal-vs.-Rauschen-Matrix, und eine klare Aussage ob
  Alloy/Grafana nur **Dokumentations-Follow-up** oder **konkrete Compose-Mount-/Ordner-Anpassung** empfohlen wird
  — mit kurzer Begruendung aus den Befunden (nicht spekulativ).
  Verweise auf Incident INC-2026-04-09-dockerlog-obs-triage sind gesetzt.
  Repo-Stellen (MQTT-Handler, Correlation/Alert-Konzept) genannt, soweit im Tree gefunden — sonst „nicht gefunden“
  ehrlich vermerkt.
---

# Steuerlauf 2/4 — IST-Dokument: Signal vs. Observability-Rauschen

**Agent:** `auto-debugger`  
**Modus:** `artefact_improvement`  
**Incident-ID (Querverweis):** `INC-2026-04-09-dockerlog-obs-triage`  
**Run-ID:** `dockerlog-obs-triage-2026-04-09`

## Ziel (ein Satz)

**Hauptlieferobjekt** der Auswertung: ein IST-Markdown unter `docs/analysen/`, das A/B/C methodisch festzurren und P0–P2 handlungsleitend macht.

## Eingrenzung

- Zuerst Incident-README aus STEUER-01 lesen; dann IST-Datei schreiben.
- Fachlich: drei Ebenen nie in einer flachen ERROR-Suche mischen.

## Abnahme (messbar)

Siehe `done_criteria` im Frontmatter; insbesondere **explizite** Entscheidung Doku-only vs. Compose-Anpassung fuer Grafana/Alloy.

## Runbook (imperativ)

1. Branch `auto-debugger/work` verifizieren.
2. Incident-Ordner `INC-2026-04-09-dockerlog-obs-triage` lesen — Faktenbasis.
3. `docs/analysen/IST-docker-log-triage-observability-signal-vs-noise-2026-04-09.md` anlegen oder erweitern: alle Pflichtelemente aus `scope`.
4. Im Repo nach MQTT-Handler-Stellen und Observability-/Alert-Dokumentation suchen; fundierte Verweise setzen.
5. STOP — naechster Schritt: STEUER-03 (Correlation-Contracts).

---

## Agent-Prompt (Copy-Paste)

```text
@auto-debugger @.claude/auftraege/auto-debugger/inbox/STEUER-02-ist-docker-log-triage-signal-noise-2026-04-09.md
Bitte IST-Hauptdokument unter docs/analysen/ gemaess Steuerdatei; Incident STEUER-01 als Quelle nutzen.
```
