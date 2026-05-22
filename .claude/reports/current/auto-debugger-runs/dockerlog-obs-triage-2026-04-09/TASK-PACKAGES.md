# TASK-PACKAGES — Run `dockerlog-obs-triage-2026-04-09`

**Steuerlauf:** `STEUER-04-taskpackages-obs-followup-dockerlog-2026-04-09.md`  
**Modus:** `artefact_improvement`  
**IST-Basis:** `docs/analysen/IST-docker-log-triage-observability-signal-vs-noise-2026-04-09.md`, `docs/analysen/IST-observability-correlation-contracts-2026-04-09.md`  
**Aktueller Git-Branch (Orchestrator):** `auto-debugger/work` — **Soll für Produkt-/Compose-Commits:** `auto-debugger/work` (für **diesen** Run: PKG-01 = **kein** Repo-Commit).

**Entscheidung:** Der IST setzt für Grafana-Plugin-Provisioning auf **Doku-first**; optionaler leerer Ordner `docker/grafana/provisioning/plugins/` nur nach **evidenzbasierter** Ops-Entscheidung und separatem Gate — **nicht** spekulativ in diesem Lauf. Daher **ein** Paket ohne Codeänderung.

---

## PKG-01 — Kein Code — empfohlene menschliche DevOps-Aktion (Observability / Deploy)

**Owner:** Mensch (Operator / DevOps) — kein automatisierter Dev-Agent.

**Risiko:** Niedrig (Lesen/Neustart; keine API-/Schema-Änderung).

**Ziel:** Nach Deploy oder Stack-Recreate **Klasse B** (Alloy/Grafana/cAdvisor) von **Klasse A** (Produkt/MQTT/Firmware) trennen — dieselbe Methodik wie im IST §2–3; keine flache „ERROR“-Liste als RCA.

**Akzeptanzkriterien**

1. **Compose-Konfiguration gültig:** `docker compose config` beendet ohne Fehler (im Projektroot `Auto-one`; Profil `monitoring` wie bei Stack-Nutzung).
2. **Stack-Sicht:** `docker compose --profile monitoring ps` — relevante Services (u. a. `grafana`, `alloy`, `loki`) im erwarteten Zustand (running/healthy je nach Healthcheck).
3. **Bei wiederholtem Alloy-„No such container“ / toter Container-ID (IST P1):** Alloy-Container **einmal** sauber neu starten (`docker compose --profile monitoring restart alloy` o. ä. — entsprechend lokaler Compose-Version), **nicht** als Firmware-Root-Cause werten.
4. **Grafana-Log (optional):** Wenn weiterhin **Warnungen** zu fehlendem/unerwartetem Pfad unter `/etc/grafana/provisioning/plugins/` stören: IST §4.1 — **Default bleibt Doku-first**; Repo-Änderung (leerer Ordner + `.gitkeep`) **nur** als **folgender**, separater Lauf mit `verify-plan` und Branch `auto-debugger/work`, **nicht** Teil von PKG-01.
5. **Abnahme Robin:** Klassen **A/B/C** und Trennung in `IST-docker-log-triage` bzw. Incident-`README` wiederfindbar; keine Vermischung bei flacher ERROR-Suche — im IST bestätigt.

**Verify (menschlich, nach Umgebung)**

- `docker compose config`
- `docker compose --profile monitoring ps`
- Bei Bedarf: `docker compose --profile monitoring logs --tail 80 grafana` und `… alloy` — nur zur **Klasseneinteilung** (B vs. A), nicht als alleiniger Produkt-Beweis.

**Tests:** Keine pytest/vitest in PKG-01 — trifft nicht zu.

---

## Keine weiteren Pakete in diesem Run

Follow-ups aus `IST-observability-correlation-contracts` Abschnitt I (Parse-Error-Correlation, Dashboards, Server-Code) sind **gesonderte** Aufträge / STEUER — nicht Teil von STEUER-04 (Observability-Dockerlog-Follow-up nach abgeschlossenem IST).
