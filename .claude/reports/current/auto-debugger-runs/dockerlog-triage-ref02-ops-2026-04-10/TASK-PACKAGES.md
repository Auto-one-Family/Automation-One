# TASK-PACKAGES — REF-02 Observability-Stack-Ops

**Run-ID:** `dockerlog-triage-ref02-ops-2026-04-10`  
**Steuerdatei:** `.claude/auftraege/auto-debugger/inbox/STEUER-INC-dockerlog-triage-REF-02-observability-stack-ops-2026-04-10.md`  
**Branch:** `auto-debugger/work` (Commits nur dort)

## Abgeschlossen (Doku)

| PKG | Inhalt | Owner | Status |
|-----|--------|-------|--------|
| — | Additiver Abschnitt in `.claude/reference/infrastructure/DOCKER_REFERENCE.md` §5.6 (Klasse B vs. A, Runbook, Verweis IST §3–4) | Doku / Orchestrator | **erledigt** |

## PKG-01 (optional, derzeit nicht umgesetzt — Doku-only empfohlen)

**Ziel:** Leerer Ordner `docker/grafana/provisioning/plugins/` mit `.gitkeep`, falls Grafana wiederholt Warnungen zu fehlendem optionalen Provisioning-Pfad loggt.

**IST-Abgleich:** `docker-compose.yml` Service `grafana`: Bind `./docker/grafana/provisioning` → `/etc/grafana/provisioning:ro`. Unter `docker/grafana/provisioning/` existieren u. a. `alerting/`, `dashboards/`, `datasources/` — **kein** `plugins/` (per `Glob`, Stand REF-02).

**Entscheidung dieses Laufs:** **Keine** Repo-Änderung. Begründung: Steuerdatei verlangt PKG nur bei **konkreter Grafana-Logzeile + Gate**; im Steuerlauf liegt **keine** wiederkehrende Ops-Evidenz vor. Default bleibt **Doku-first** (vgl. `docs/analysen/IST-docker-log-triage-observability-signal-vs-noise-2026-04-09.md` §4.1).

**Akzeptanzkriterien (falls später aktiviert):**

- Vor Merge: Skill `verify-plan` durchlaufen; `VERIFY-PLAN-REPORT.md` im gleichen Run-Ordner oder Nachfolge-Run.
- Verify: `docker compose --profile monitoring config` → Exit 0.
- Änderungen und Commits nur auf Branch `auto-debugger/work`.
- Keine Änderung an `docker-compose.yml` für dieses Mini-PKG (Mount bleibt; nur Host-Verzeichnis ergänzen).

**Abhängigkeiten:** Keine.

---

*Nach Verify ggf. PKG-01 von „deferred“ auf „ready“ setzen und `SPECIALIST-PROMPTS.md` anpassen.*
