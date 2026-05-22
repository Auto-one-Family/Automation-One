# VERIFY-PLAN-REPORT — REF-02 Observability-Stack-Ops

**Run-ID:** `dockerlog-triage-ref02-ops-2026-04-10`  
**Datum:** 2026-04-10  
**Gate:** verify-plan (gegen geplanten optionalen PKG-01 + bestehende Compose/Doku)

## 1. Geprüfte Pfade (Repo-Ist)

| Referenz | Ergebnis |
|----------|----------|
| `docker-compose.yml` → `grafana.volumes` | `./docker/grafana/provisioning` → `/etc/grafana/provisioning:ro` — **bestätigt** |
| `docker-compose.yml` → `alloy` | Service `alloy`, Container-Name `automationone-alloy`, Config-Bind `docker/alloy/config.alloy`, Docker-Socket — **bestätigt** |
| `docker/grafana/provisioning/` | Enthält `alerting/`, `dashboards/`, `datasources/` — **kein** Unterordner `plugins/` — **bestätigt** |

## 2. Compose-Validierung

**Befehl:** `docker compose --profile monitoring config`  
**Ergebnis:** Exit **0** (Konfiguration gültig; Grafana-/Alloy-Services im Profil `monitoring` aufgelöst).

## 3. Delta zum optionalen PKG-01 (`.gitkeep` unter `provisioning/plugins/`)

- **Technisch:** Ein leerer Host-Ordner `docker/grafana/provisioning/plugins/` würde unter dem bestehenden Bind in `/etc/grafana/provisioning/plugins/` erscheinen — **kein** Compose-Delta nötig.
- **Steuerung:** STEUER-REF-02 verlangt das PKG nur bei **konkreter Grafana-Logzeile** und nach **verify-plan**. Ohne wiederkehrende Log-Evidenz: **keine** Umsetzung — konsistent mit IST §4.1 (Doku-first).

## 4. BLOCKER

- Keine technischen Blocker für die **Doku-Erweiterung** (DOCKER_REFERENCE §5.6).
- **BLOCKER für PKG-01-Implementierung:** Fehlende wiederkehrende Grafana-Logzeile / Ops-Evidenz im Steuerlauf — Nachbedingung: Log-Snippet oder Ticket-Referenz, dann PKG-01 aktivieren.

---

## OUTPUT FÜR ORCHESTRATOR (auto-debugger)

### PKG → Delta

| PKG | Delta (Pfad, Testbefehl/-pfad, Reihenfolge, Risiko, HW-Gate, verworfene Teile) |
|-----|-----------------------------------------------------------------------------------|
| PKG-01 | **Keine Repo-Änderung in REF-02.** Optionaler Ordner `docker/grafana/provisioning/plugins/.gitkeep` **zurückgestellt** bis Evidenz. Verify für spätere Umsetzung: `docker compose --profile monitoring config` (Exit 0). Pfade Compose: `grafana` + `alloy` wie oben — keine Abweichung. |

### PKG → empfohlene Dev-Rolle

| PKG | Rolle (z. B. server-dev, frontend-dev, esp32-dev, mqtt-dev) |
|-----|---------------------------------------------------------------|
| PKG-01 | **DevOps / Repo-Pflege** (kein server-dev/frontend-dev/esp32-dev) — nur wenn Evidenz vorliegt: Ordner + `.gitkeep`, Branch `auto-debugger/work`. |

### Cross-PKG-Abhängigkeiten

- Keine — PKG-01 steht allein und ist derzeit **nicht** zur Ausführung freigegeben.

### BLOCKER

- PKG-01: Fehlende wiederkehrende Grafana-Provisioning-Warnung als Evidenz (messbare Nachbedingung für Mini-PKG).
