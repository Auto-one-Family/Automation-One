# VERIFY-PLAN-REPORT — I06 Alloy correlation_id Structured Metadata

**Run-ID:** `ist-i06-alloy-correlation-metadata-2026-04-09`  
**Steuerdatei:** `.claude/auftraege/auto-debugger/inbox/STEUER-IST-I06-alloy-correlation-metadata-2026-04-09.md`  
**Branch:** `auto-debugger/work`  
**Datum:** 2026-04-10

## Zusammenfassung

| Prüfpunkt | Ergebnis |
|-----------|----------|
| `docker/alloy/config.alloy` | Existiert; el-servador-Pipeline nutzt `stage.regex` auf strukturierte Textzeilen + Structured Metadata (`logger`, `request_id`). |
| Server-Logformat (stdout) | Text: `YYYY-MM-DD HH:MM:SS - logger - LEVEL - [request_id] - message` (`logging_config.py`); kein separates JSON in Docker-Default. |
| Strategie | **Entscheidung A (Alloy-Zusatzparser):** `\bcorrelation_id=` aus dem Feld `message` extrahieren → Structured Metadata `correlation_id` (kein Loki-Label). **Kein** paralleles Pflicht-JSON-Logging für Docker nötig; JSON-Dateilogs bleiben unverändert. |
| Validierung | `docker run … grafana/alloy:v1.13.1 validate /etc/alloy/config.alloy` → Exit 0. |
| Doku | `docs/debugging/logql-queries.md` um Beispielquery ergänzt; `IST-observability-correlation-contracts-2026-04-09.md` Abschnitt I.6 + Inkonsistenzliste aktualisiert. |

## Abgleich Plan ↔ Repo

- **Pfade:** `docker/alloy/config.alloy`, `docs/debugging/logql-queries.md`, `docs/analysen/IST-observability-correlation-contracts-2026-04-09.md` — gültig.
- **Risiko Hochkardinalität:** `correlation_id` nur als Structured Metadata (wie `request_id`), nicht als Label — entspricht Risiko-Register H und Steuerdatei `forbidden`.
- **Semantik:** `request_id` (Metadata) = ContextVar (REST-UUID **oder** MQTT-CID); `correlation_id` (Metadata) = nur wenn die **Message** ein explizites `correlation_id=…` enthält — kann gleich oder unterschiedlich sein; Runbook `correlation-id-playbook.md` bleibt maßgeblich.

## OUTPUT FÜR ORCHESTRATOR (auto-debugger) — Snapshot nach Umsetzung

### PKG → Delta

| PKG | Delta |
|-----|--------|
| PKG-01 | **Erledigt:** `config.alloy` — zweites `stage.regex` mit `source = "message"`, `\bcorrelation_id=(?P<correlation_id>…)`; `stage.structured_metadata` um `correlation_id` erweitert; Header-Kommentar bereinigt. |

### PKG → empfohlene Dev-Rolle

| PKG | Rolle |
|-----|--------|
| PKG-01 | Ops/DevOps-Review optional (`system-control`); technische Änderung in Repo bereits durchgeführt. |

### Cross-PKG-Abhängigkeiten

- keine

### BLOCKER

- keine

## Folgeempfehlung (optional)

- Nach Deploy: einmal Grafana Explore prüfen, ob Zeilen mit `correlation_id=` in der Message das Metadata-Feld zeigen (Loki-Version/Feature „structured metadata“ vorausgesetzt).
