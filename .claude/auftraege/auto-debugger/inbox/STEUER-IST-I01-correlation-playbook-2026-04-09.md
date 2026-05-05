---
run_mode: artefact_improvement
incident_id: ""
run_id: ist-i01-correlation-playbook-2026-04-09
order: incident_first
no_chat_questions: true
allow_user_escalation: false
target_docs:
  - docs/analysen/IST-observability-correlation-contracts-2026-04-09.md
  - docs/debugging/logql-queries.md
  - El Servador/god_kaiser_server/src/core/request_context.py
  - El Servador/god_kaiser_server/src/mqtt/subscriber.py
scope: |
  Neues oder erweitertes Markdown **„Correlation ID Playbook“** (Zielpfad z. B. `docs/debugging/correlation-id-playbook.md`
  ODER additive Abschnitte in `docs/debugging/logql-queries.md` — im Lauf per verify-plan gegen bestehende Doku-Struktur prüfen).

  Mindestinhalt (IST § I, Punkt 1):
  (1) Abschnitt REST-`X-Request-ID` / UUID vs. MQTT-synthetische CID — Namensschema und Verwechslungswarnung.
  (2) Drei Copy-Paste-LogQL-Szenarien (z. B. REST-Audit, MQTT-Handler mit CID, Gerät+Zeitfenster) — ohne Secrets.
  (3) Verweise auf `request_context.py` und `subscriber.py` (repo-relative Pfade).

  Optional: @auto-debugger starten, um TASK-PACKAGES + VERIFY-PLAN-REPORT unter run_id zu erzeugen, dann **updatedocs**
  oder manuelle Doku-PR auf **auto-debugger/work**.
forbidden: |
  Keine Secrets; keine Änderung an REST/MQTT/Produktcode in diesem Auftrag (reine Doku).
  Keine Behauptungen grüner Playwright/vue-tsc ohne lokale Ausführung.
  Kein Commit auf master; Doku-Commits nur auf auto-debugger/work.
done_criteria: |
  Ein merge-fähiger Doku-Stand: Playbook erfüllt (1)(2)(3); Links zu Quellfiles stimmen; `logql-queries.md` bei Integration
  weiterhin konsistent; bei auto-debugger-Lauf: VERIFY-PLAN-REPORT zeigt Pfad-/Anchor-Korrektheit.
---

# STEUER — I01 Correlation ID Playbook (Dokumentation)

**IST-Referenz:** `docs/analysen/IST-observability-correlation-contracts-2026-04-09.md` § I, Punkt 1.

## Schritte

1. `git checkout auto-debugger/work` && `git branch --show-current`
2. Skill **verify-plan**: Zielpfad(e) und bestehende `docs/debugging/*` gegen Repo prüfen.
3. **updatedocs** (Skill) **oder** **auto-debugger** mit dieser Steuerdatei → dann Inhalt schreiben.
4. Kein pytest — Doku-only.

## Zuständige Agenten

| Phase | Agent / Skill |
|--------|----------------|
| Orchestrierung (optional) | **auto-debugger** |
| Reality-Check Pfade | **verify-plan** |
| Umsetzung Doku | **updatedocs** oder manuell mit **server-development**-Skill als Leitlinie (nur Text/Links) |
| Code lesen zur Zitiergenauigkeit | **server-debug** (read-only Kontext) — optional |

## Chat-Start

```text
@.claude/auftraege/auto-debugger/inbox/STEUER-IST-I01-correlation-playbook-2026-04-09.md
Zuerst verify-plan auf Zielpfad, dann Correlation Playbook schreiben; Branch auto-debugger/work.
```
