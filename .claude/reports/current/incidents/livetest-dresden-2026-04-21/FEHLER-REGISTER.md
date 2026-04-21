# FEHLER-REGISTER — Live-Hartetest Dresden 2026-04-21

> **Linear:** AUT-108  
> **Branch:** auto-debugger/work  
> **Letzte Aktualisierung:** 2026-04-21

---

## Ampel-Scorecard

| Bereich | Ampel | Fixes committed |
|---------|-------|----------------|
| P0 — Infra/Docker | GRUEN | — |
| P1 — Sensor-Latenz (Fokus A) | GRUEN | — |
| P2 — Aktor-Antwortzeit (Fokus B) | GELB | PKG-01 (QoS) |
| P3 — LWT & Reconnect (Fokus C) | GELB → GRUEN* | PKG-02 (kein Fix nötig) |
| P4 — Logic-Engine (Fokus D) | GRUEN | — |

*LWT-Handler war bereits korrekt implementiert. P3 gilt nach HT-C1-Durchführung als GRUEN.

**Gesamt: GELB** (3 Fixes committed; 3 manuelle Tests + 1 User-Klärung ausstehend; seeed-Build verifiziert 67% Flash)

---

## P0 — Infra & Stack-Zustand

| ID | Befund | Schwere | Status |
|----|--------|---------|--------|
| P0-01 | 13/13 Docker-Services healthy/running | INFO | GRUEN |
| P0-02 | Issue nennt 14 Services, compose.yml definiert 13 | INFO | Kein Defekt |
| P0-03 | Git: 2 unstaged Lint-Fixes beim Start | NIEDRIG | BEHOBEN (71e8e648) |
| P0-04 | seeed_xiao_esp32c3-Env Flash: 1318228/1966080 bytes (67%) — min_spiffs.csv korrekt | INFO | GRUEN (kein Overflow) |

---

## P1 — Sensor-Latenz (Fokus A)

| ID | Befund | Schwere | Status |
|----|--------|---------|--------|
| P1-01 | Sensor-Publish 30s, DB-Persist <1s, Frontend synchron — SOLL <2s erfüllt | INFO | GRUEN |
| P1-02 | Heartbeat-Intervall 60s (Firmware) vs. SOLL 30s (Issue) | INFO | OFFEN (Robin-Klärung PKG-05) |

---

## P2 — Aktor-Antwortzeit (Fokus B)

| ID | Befund | Schwere | Status |
|----|--------|---------|--------|
| P2-01 | Kein Actuator-Toggle im Lauf-1-Fenster — E2E-Latenz nicht gemessen | INFO | OFFEN (HT-B1 manuell) |
| P2-02 | QoS-Mismatch: ESP subscribed Safety-Topics mit QoS 1, SOLL QoS 2 | MITTEL | BEHOBEN (705a060a, main.cpp:620-636) |
| P2-03 | Frontend: WS-Trennung während Actuator-Bestätigung → false Timeout-Toast | NIEDRIG | OFFEN (future sprint) |
| P2-04 | Live-Test: `GPIO 25 OFF` ohne terminale Rückmeldung (`correlation_id=96d3a5a1-9058-4f02-b734-779ea330b663`) durch `Publish queue full` + MQTT-CB OPEN; `actuator/25/response` wurde verworfen | MITTEL | BEHOBEN (working tree, `publish_queue.cpp`: kritische Publishes verdrängen non-critical Eintrag) |

---

## P3 — LWT & Reconnect (Fokus C)

| ID | Befund | Schwere | Status |
|----|--------|---------|--------|
| P3-01 | LWT-Handler vollständig implementiert (main.py:297) — Befund aus Lauf-2 war falsch | INFO | KEIN FIX NÖTIG |
| P3-02 | Poller-False-Positive bei 07:30-07:31 (knappes Timing, kein echter Disconnect) | NIEDRIG | DOKUMENTIERT |
| P3-03 | HT-C1: Disconnect-Simulation noch nicht durchgeführt | INFO | OFFEN (manuell durch Robin) |
| P3-04 | Heizungs-Live-Test (P3): NUR nach 11-Punkte-Checkliste AUT-102 | KRITISCH | GESPERRT bis HT-C1 |

---

## P4 — Logic-Engine (Fokus D)

| ID | Befund | Schwere | Status |
|----|--------|---------|--------|
| P4-01 | TestTimmsRegen: 29x gefeuert, immer persist_noop_skip (korrekt) | INFO | GRUEN |
| P4-02 | intent_outcome seq=489 ohne `flow`-Key — server-seitig rejected | NIEDRIG | BEHOBEN (e594d32c) |
| P4-03 | Dry-Run Bodenfeuchte-Regel noch nicht durchgeführt | INFO | OFFEN (HT-D1 manuell) |

---

## Zusätzliche Befunde

| ID | Befund | Schwere | Status |
|----|--------|---------|--------|
| ADD-01 | 4 retained Topics bei ESP_00000001 (zone/ack, subzone/ack, onewire/scan_result, command/response) | NIEDRIG | OFFEN (PKG-04, User-OK nötig) |
| ADD-02 | JWT 401 bei Langzeit-Session (07:39:19Z) — Frontend Token-Refresh korrekt implementiert | INFO | BEOBACHTEN |
| ADD-03 | Docker-Log-Spam: `intent_outcome/lifecycle` mit fehlendem `event_type` führte zu Handler-ERROR + Subscriber-Warnung | NIEDRIG | BEHOBEN (working tree, malformed Payloads jetzt Warning + Drop ohne Handler-Fail) |

---

## Ausstehende manuelle Tests

| Test | Fokus | Durchführung | Erwartung |
|------|-------|-------------|-----------|
| HT-B1 | Aktor-Latenz | Frontend Actuator-Toggle, Zeitmessung | E2E < 500ms |
| HT-C1 | LWT-Disconnect | `docker compose stop mqtt-broker` 30s | lwt_handler im Log <2s |
| HT-D1 | Logic-Engine | Bodenfeuchte-Schwellwert triggern | Regel feuert <1s |
| HT-F1 | Frontend HAR | Browser DevTools 10min L2 OrbitalView | WS-Frames sauber |

---

## Commits auf auto-debugger/work

| Commit | Beschreibung | PKG |
|--------|-------------|-----|
| 71e8e648 | style(server): remove unused variables (ruff lint) | PKG-06 |
| 705a060a | fix(esp32): use QoS 2 for safety-critical MQTT subscriptions | PKG-01 |
| e594d32c | fix(server): tolerate missing flow field in intent_outcome (legacy firmware compat) | PKG-03 |
