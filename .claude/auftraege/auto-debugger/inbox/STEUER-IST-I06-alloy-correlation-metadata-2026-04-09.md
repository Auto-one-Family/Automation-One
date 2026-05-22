---
run_mode: artefact_improvement
incident_id: ""
run_id: ist-i06-alloy-correlation-metadata-2026-04-09
order: incident_first
no_chat_questions: true
allow_user_escalation: false
target_docs:
  - docs/analysen/IST-observability-correlation-contracts-2026-04-09.md
  - docker/alloy/config.alloy
  - docs/debugging/logql-queries.md
scope: |
  Observability: `correlation_id` oder gleichwertige Korrelation in **Alloy** als Structured Metadata / Parser — **oder**
  einheitliches JSON-Logging serverseitig (Alternative im verify-plan wählen; nicht beides wild parallel ohne Doku).

  Akzeptanz:
  (1) Regex/Zusatzparser **oder** JSON-Log-Feld — konsistent dokumentiert.
  (2) `logql-queries.md` um mindestens eine Beispielquery ergänzt.
  (3) **Keine** neuen Loki-Labels mit hoher Kardinalität (IST Risiko-Register).

  Typischer Mix: **server-dev** (Log-Format) + Anpassung **config.alloy** + Doku; nach Änderung Monitoring-Stack kurz prüfen
  (system-control / Operator).
forbidden: |
  Keine Hochkardinalitäts-Labels in Loki; keine Secrets in Alloy-Regex; keine Breaking Changes am Server-JSON-Schema ohne Gate.
  Commits nur auf auto-debugger/work.
done_criteria: |
  Alloy-Config syntaktisch gültig (Compose-Stack startet oder `alloy` validate je nach Projekt-Standard); Doku aktualisiert;
  Beispiel-LogQL nachvollziehbar; server-tests unberührt oder grün.
---

# STEUER — I06 Alloy correlation_id Structured Metadata

**IST-Referenz:** § I Punkt 6; Inkonsistenz Alloy-Kommentar „future“.

## Schritte

1. **verify-plan**: `config.alloy` IST vs. geplanter Parser; Abgleich mit Server-Log-Zeilenformat.
2. Entscheidung A: nur Alloy-Parser vs. B: Server loggt strukturiert — in TASK-PACKAGES festhalten.
3. **server-dev** und/oder DevOps-artige Änderung an `config.alloy` (kein separater „alloy-dev“-Agent — **server-dev** + Datei `docker/alloy/`).
4. **updatedocs** oder Abschnitt in **logql-queries.md**.
5. Stack-Smoke: `docker compose --profile monitoring` (menschlich oder system-control).

## Zuständige Agenten

| Phase | Agent / Skill |
|--------|----------------|
| Gate | **verify-plan** |
| Server-Logs | **server-dev** |
| Alloy-Syntax / Mount | **system-control** (Review) + Repo-Edit wie oben |
| MQTT-Pipeline-Kontext | **mqtt-development** |
| Loki-Queries | **server-debug** (Lesen) |

## Chat-Start

```text
@.claude/auftraege/auto-debugger/inbox/STEUER-IST-I06-alloy-correlation-metadata-2026-04-09.md
verify-plan: Strategie Alloy vs JSON-Logs; dann Umsetzung ohne Hochkardinalitäts-Labels; logql-queries.md ergänzen.
```
