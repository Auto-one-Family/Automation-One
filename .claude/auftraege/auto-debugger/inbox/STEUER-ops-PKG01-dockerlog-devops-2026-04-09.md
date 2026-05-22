---
run_mode: artefact_improvement
incident_id: INC-2026-04-09-dockerlog-obs-triage
run_id: dockerlog-obs-triage-2026-04-09
order: incident_first
no_chat_questions: true
allow_user_escalation: false
target_docs:
  - docs/analysen/IST-docker-log-triage-observability-signal-vs-noise-2026-04-09.md
  - .claude/reports/current/auto-debugger-runs/dockerlog-obs-triage-2026-04-09/TASK-PACKAGES.md
scope: |
  STEUER-04 / PKG-01: Menschliche DevOps-Aktionen am Docker-Monitoring-Stack — **kein** Repo-Commit.

  Konkret (siehe TASK-PACKAGES.md PKG-01):
  - `docker compose config` und `docker compose --profile monitoring ps` im Projektroot.
  - Bei Alloy „No such container“ / alter Container-ID: kontrollierter `restart` des Alloy-Services — **Klasse B**
    (Operational), nicht als ESP/MQTT-RCA (Klasse A) fehldeuten.
  - Grafana-Warnung zu `/etc/grafana/provisioning/plugins/`: IST §4.1 — Default **Doku-first**; Repo-Ordner nur in
    separatem STEUER nach Evidenz + verify-plan.

  Keine Duplikation der Incident-Lagebeschreibung — Faktenbasis bleibt im Incident-Ordner und IST-Doku.
forbidden: |
  Keine Secrets. Keine Änderungen an Produktcode, docker-compose.yml oder Grafana-Provisioning in diesem Auftrag.
  Kein git commit. Kein Push. Branch-Disziplin für *andere* Aufträge: auto-debugger/work.
done_criteria: |
  Compose `config` exit 0; `ps` zeigt erwarteten Monitoring-Stack; bei Bedarf Alloy-Neustart dokumentiert (kurz).
  Operator bestätigt: Klassen A/B/C aus IST weiterhin anwendbar (keine flache ERROR-Liste als RCA).
---

# STEUER — Ops PKG-01 (Dockerlog / Observability)

**Bezug:** `STEUER-04-taskpackages-obs-followup-dockerlog-2026-04-09.md` (bereits abgearbeitet: Artefakte im Run-Ordner).

## Schritte (imperativ)

1. Terminal im Projektroot `Auto-one`.
2. `docker compose config` — muss fehlerfrei sein.
3. `docker compose --profile monitoring ps` — Services prüfen.
4. Nur bei Symptom aus IST (Alloy-Tailer): `docker compose --profile monitoring restart alloy` (oder Compose-Äquivalent).
5. STOP — kein Commit.

## Zuständige „Agenten“

| Rolle | Wer |
|--------|-----|
| **Ausführung** | **Mensch** (Robin / Operator) |
| **Kontext / Briefing** | Skill **system-control** (optional: Stack-Status, keine Codeänderung) |
| **auto-debugger** | Nicht erforderlich für PKG-01 (bereits dokumentiert) |
| **server-debug / mqtt-debug** | Nur bei späterer Ursachenanalyse **Klasse A**, nicht für diesen Ops-Schritt |

## Chat-Start (Copy-Paste)

```text
@system-control Kurz: Docker monitoring profile prüfen gemäß TASK-PACKAGES PKG-01 unter
.claude/reports/current/auto-debugger-runs/dockerlog-obs-triage-2026-04-09/ — kein Code.
```
