---
# Steuerdatei fuer auto-debugger (YAML-Frontmatter)
run_mode: artefact_improvement
incident_id: INC-2026-04-09-dockerlog-obs-triage
run_id: dockerlog-triage-ref02-ops-2026-04-10
order: incident_first
no_chat_questions: true
allow_user_escalation: false
target_docs:
  - .claude/reference/infrastructure/DOCKER_REFERENCE.md
  - docs/analysen/IST-docker-log-triage-observability-signal-vs-noise-2026-04-09.md
scope: |
  **Problemklasse B (Operational):** Grafana-, Alloy-, cAdvisor-Meldungen duerfen **nicht** als ESP-/MQTT-Root-Cause
  gewertet werden (siehe `INCIDENT-LAGEBILD.md` §2, `CORRELATION-MAP.md` Kette B).

  **IST im Repo:** `docker-compose.yml` mountet `./docker/grafana/provisioning` → `/etc/grafana/provisioning:ro`.
  Unter `docker/grafana/provisioning/` existieren u. a. `alerting/`, `dashboards/`, `datasources/` — **kein** Ordner
  `plugins/`. Grafana kann optional Warnungen zu fehlendem Plugin-Provisioning loggen (Betriebslärm).

  **Ziel:**
  1. **DOCKER_REFERENCE.md** (additiv): Kurzabschnitt „Monitoring-Profil: Triage B vs. Produkt A“ — Alloy „No such
     container“ nach Recreate/Prune als Deploy-Lifecycle; Grafana-Provisioning-Warnungen; cAdvisor/machine-id auf
     Windows — jeweils mit Verweis auf `IST-docker-log-triage` §3–4, **ohne** Compose zu aendern, solange nicht evidenzbasiert.
  2. **Optional (nur nach konkreter Grafana-Logzeile + Gate):** TASK-PACKAGES unter
     `.claude/reports/current/auto-debugger-runs/dockerlog-triage-ref02-ops-2026-04-10/` — ein kleines PKG
     „`docker/grafana/provisioning/plugins/.gitkeep`“ zur Befriedigung optionaler Provisioning-Pfade; **vorher**
     Skill **`verify-plan`** (Pfade, keine Breaking Changes am Grafana-Image-Mount).

  3. **Runbook (Doku):** Reihenfolge bei Stack-Updates — `docker compose ps`; bei Alloy-Tailer-Fehlern auf alte
     Container-IDs ggf. Neustart `automationone-alloy` oder sauberes `down`/`up` des Monitoring-Profils; **nicht** als
     Firmware-Fix verkaufen.

  Ausgabe-Artefakte bei aktivem Code/Ordner-PKG: `TASK-PACKAGES.md`, `SPECIALIST-PROMPTS.md` (Git-/Pattern-/Verify-Pflichtbloecke
  laut Agent `auto-debugger` §0a), `VERIFY-PLAN-REPORT.md`, bei Code `FEHLER-REGISTER.md`.
forbidden: |
  Keine Secrets. Keine Aenderung an Produkt-MQTT-Handlern, Firmware oder Frontend aus diesem Steuerlauf.
  Keine Compose-Aenderung ohne verify-plan und ohne Abgleich mit bestehender `docker-compose.yml` (Service `grafana`, `alloy`).
  Kein `git push` / force durch Agenten; Branch `auto-debugger/work` fuer Repo-Aenderungen.
  Kein Spekulieren: Ordner `plugins/` nur anlegen, wenn IST oder Ops-Evidenz wiederkehrende Grafana-Meldungen zeigt.
done_criteria: |
  DOCKER_REFERENCE.md enthaelt einen nachvollziehbaren Abschnitt zur **Klassifikation B** (Observability) vs. **A** (Produkt),
  mit Verweis auf Incident/IST.
  Entweder (a) **kein** Repo-Ordner-PKG — dann ist das in TASK-PACKAGES oder im IST als „Doku-only empfohlen“ dokumentiert,
  **oder** (b) `.gitkeep` unter `docker/grafana/provisioning/plugins/` nach VERIFY-PLAN-REPORT und gruenem
  `docker compose --profile monitoring config` (Exit 0).
  Alloy/Grafana-Runbook in Doku kurz wiederfindbar (Checkliste: ps, logs tail, Neustart-Option).
---

# STEUER — REF-02: Observability-Stack (Klasse B) — Doku + optionales Mini-PKG

**Bezug:** `INC-2026-04-09-dockerlog-obs-triage`  
**Agent:** `auto-debugger`  
**Modus:** `artefact_improvement`  
**Run-ID:** `dockerlog-triage-ref02-ops-2026-04-10`

## Kurzbegründung

Alloy- und Grafana-Logs sind **operativ**; sie erfordern Deploy-Disziplin, nicht ESP-Code. Dieses Steuerfile bündelt
Referenz-Doku und optional ein kleines, verify-gegates Repo-Mini-Paket.

## Runbook (imperativ)

1. Branch `auto-debugger/work` pruefen.
2. DOCKER_REFERENCE.md lesen; additiven Abschnitt einplanen.
3. Entscheidung: nur Doku **oder** PKG — gemaess Evidenz in `scope`.
4. Bei PKG: Run-Ordner anlegen, verify-plan, TASK-PACKAGES/SPECIALIST-PROMPTS/VERIFY-PLAN-REPORT/FEHLER-REGISTER wie Skill.

## Agent-Prompt (Copy-Paste)

```text
@auto-debugger @.claude/auftraege/auto-debugger/inbox/STEUER-INC-dockerlog-triage-REF-02-observability-stack-ops-2026-04-10.md
Bitte REF-02: DOCKER_REFERENCE erweitern; optionales Grafana-plugins-PKG nur nach verify-plan und Evidenz.
```
