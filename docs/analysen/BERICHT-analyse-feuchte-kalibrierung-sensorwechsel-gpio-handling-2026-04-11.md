# Analysebericht: Feuchte-Kalibrierung vs. Sensorwechsel / GPIO-Handling

**Datum:** 2026-04-10 / 2026-04-11  
**Steuerlauf:** `.claude/auftraege/auto-debugger/inbox/STEUER-analyse-feuchte-kalibrierung-sensorwechsel-gpio-handling-2026-04-11.md`  
**Incident-ID:** `ANALYSE-feuchte-kalib-sensorwechsel-2026-04-11`  
**Run-ID:** `feuchte-kalib-sensorwechsel-2026-04-11`  
**Repo-Branch (Analyse):** `auto-debugger/work`

---

## Executive Summary

Die **Referenz-Kurve „ruhig trocken“** ist für **ESP_6B27C8** am **GPIO 33** in den letzten Stunden **quantitativ** plausibel: **`processed_value`** schwankt nur in einem schmalen Band (**STDDEV ≈ 3,4 %** über ~2 h, Stichprobe Postgres). **ESP_EA5484** zeigt im **gleichen Zeitfenster** auf **GPIO 32** eine **extreme Varianz** (**STDDEV ≈ 283**, Werte von **0 bis 918**), auf **GPIO 33** ebenfalls hohe Schwankung (**STDDEV ≈ 82**). Parallel existiert in **`sensor_configs` keine `moisture`-Zeile** für **ESP_EA5484**, während **`sensor_data`** weiterhin frische Feuchte-Zeilen liefert — das ist **kein** reines Kalibrier-Rechenproblem, sondern zuerst ein **Konsistenzproblem zwischen Gerätetelemetrie, DB-Config und Kalibrier-Session-Historie** (CLUSTER A), bevor CLUSTER B (Kennlinie, Invert, Mutex) scharf bewertet werden kann.

Der **Server-Delete-Pfad** ist im Code **vollständig** beschrieben (DB → `send_config` → WS `sensor_config_deleted`). Der **Ingest ohne Config** ist ebenfalls **explizit** (`Sensor config not found … Saving data without config.`). Die empfohlene **Umsetzungsreihenfolge** ist **PKG-HW-*** vor **PKG-CAL-***, begründet durch die aktuelle Evidence.

---

## IST–SOLL je Cluster

| Cluster | IST (Evidence) | SOLL / Zielbild |
|---------|----------------|-----------------|
| **A — Delete / GPIO / Config-Push** | `DELETE …/sensors/{esp_id}/{config_id}` ruft u. a. `send_config` und broadcastet `sensor_config_deleted` (`sensors.py`). EA5484: **keine** `moisture`-Config, aber **laufende** `sensor_data` | Nach Sensorwechsel: **eine** konsistente Config-Zeile pro physischem Kanal; ESP erhält Payload, der zu DB passt; kein stilles „Halb-Zombie“-Zustand |
| **A — Ingest ohne Config** | `sensor_handler` loggt WARN und speichert ohne Pi-Enhanced | Operator sieht **eindeutig**, dass Daten **ohne** Kalibrierpfad laufen — oder Ingest wird unterbunden/flagged |
| **B — Kalibrierung** | Sessions für EA5484 **APPLIED** auf **GPIO 32**; aktuelle Config **ohne** moisture; 6B27C8 Feuchte-Config auf **33** | Nach Apply: `calibration_data` mit nutzbarem **`derived`** für Processor; **ein** GPIO als führend für Wizard und Live-Daten |
| **B — Stabilität** | STDDEV 6B27C8/33 niedrig; EA5484/32 extrem hoch | Nach Fix: STDDEV im definierten Fenster vergleichbar mit Referenz **oder** BLOCKER dokumentiert (HW) |

---

## Paketübersicht

| ID | Titel | Abhängigkeit | Akzeptanz (kurz) | Verify (Repo) |
|----|-------|----------------|------------------|---------------|
| **PKG-HW-01** | Delete → MQTT-Config / Telemetrie-Kohärenz | — | Reproduzierbarer Zustand DB↔MQTT; Klärung „Daten ohne Config“ | `pytest tests/integration/test_calibration_session_routes.py -q`; `pio run -e esp32_dev` bei FW-Touch (WROOM; XIAO: `seeed_xiao_esp32c3`) |
| **PKG-HW-02** | GPIO-Reuse / UI-State | sinnvoll nach HW-01 | Kein falscher „PIN belegt“ nach Delete | `npx vue-tsc --noEmit`; Vitest |
| **PKG-CAL-01** | Session → `calibration_data` → Processor | **nach** GPIO-Klarheit EA5484 | `derived` nutzbar für MoistureProcessor | pytest Calibration; `ruff` auf geänderte Dateien |
| **PKG-CAL-02** | Stabilität / Mutex / Rohwert | nach HW | Regression STDDEV oder dokumentierter BLOCKER | pytest selektiv; Soak-Protokoll |

**Empfohlene Reihenfolge:** **PKG-HW-01 → PKG-HW-02 (parallel möglich) → PKG-CAL-01 → PKG-CAL-02.** Begründung: Ohne klare **Config-/GPIO-Kohärenz** sind Kalibrier-Fixes nicht testbar (Evidenz EA5484).

---

## Evidence-Register

| Timestamp (UTC) | Quelle | Ausschnitt / Befund |
|-----------------|--------|---------------------|
| 2026-04-10 (Query-Zeitfenster) | Postgres `esp_devices` | Beide Geräte **ESP_6B27C8**, **ESP_EA5484** vorhanden |
| 2026-04-10 | Postgres `sensor_configs` | **6B27C8:** `moisture` nur **GPIO 33**. **EA5484:** **kein** `moisture` (nur 0/4) |
| 2026-04-10 | Postgres `sensor_data` (recent) | Feuchte für **beide** ESPs; EA5484 **GPIO 32+33** aktiv |
| 2026-04-10 | Postgres Aggregat 2h | **6B27C8/33:** STDDEV **~3,37**, n=42. **EA5484/32:** STDDEV **~283**, n=241. **EA5484/33:** STDDEV **~82**, n=82 |
| 2026-04-09–10 | Postgres `calibration_sessions` | EA5484: mehrere **APPLIED** **GPIO 32** `moisture` |
| — | Code | `sensors.py` Delete-Pipeline + `sensor_handler` Warnpfad |

**Hinweis:** Keine Secrets; keine erfundenen Log-Zeilen — Server-Log-Zitate können im Folgelauf mit **grep** auf `logs/` ergänzt werden.

---

## Geräte-Vergleich (Pflicht)

### ESP_6B27C8 (Referenz / „Soll-Kurve“)

- **Config:** `moisture` auf **GPIO 33** (einziger Feuchte-Eintrag in `sensor_configs`).
- **Stabilität:** STDDEV(`processed_value`) **≈ 3,37** (2 h, GPIO 33) — entspricht der **Soll-Beobachtung** „~20–25 % ruhig trocken“ (Werte in Stichprobe 0–22,6 %).

### ESP_EA5484 (Ist / Störfall)

- **Config:** **Keine** `moisture`-Zeile — **Drift** zur Kalibrier-Historie und zur Live-Telemetrie.
- **Kalibrier-Sessions:** **APPLIED** auf **GPIO 32** (mehrfach).
- **Stabilität:** **GPIO 32** STDDEV **≈ 283** (0–918) — **nicht** vergleichbar mit Referenz; **GPIO 33** ebenfalls volatil (**STDDEV ≈ 82**).

---

## Pattern-Verweise (Repo)

- Delete + MQTT: `El Servador/god_kaiser_server/src/api/v1/sensors.py` (`delete_sensor`).
- Ingest: `El Servador/god_kaiser_server/src/mqtt/handlers/sensor_handler.py`.
- Kalibrierung Antwort: `…/mqtt/handlers/calibration_response_handler.py`.
- Kalibrierung ableiten: `…/services/calibration_payloads.py` (`resolve_calibration_for_processor`).
- Frontend-Wizard: `El Frontend/src/composables/useCalibrationWizard.ts`, `El Frontend/src/api/calibration.ts`.

---

## Querverweis

- `docs/analysen/BERICHT-feuchte-baseline-neues-esp-gpio33-live-verifikation-2026-04-11.md` — **GPIO 32 vs. 33**, „Config nicht gefunden“, Pi-Enhanced nur mit Config.

---

## Nicht-Ziele

- Keine Schema-Änderungen an REST/MQTT ohne separates Design.
- Kein Mischen von CLUSTER A und B in **einem** Implementierungs-PR ohne Schnittstellen-Doku.
- Keine Secrets/externen privaten Repos.

---

## Artefakt-Pfade

| Artefakt | Pfad |
|----------|------|
| Lagebild / Pakete / Verify | `.claude/reports/current/incidents/ANALYSE-feuchte-kalib-sensorwechsel-2026-04-11/` |
| verify-plan Report | `…/VERIFY-PLAN-REPORT.md` |

---

## Frontend-Pfade (Pflicht, ohne Screenshots)

- **Hardware / GPIO:** `El Frontend/src/components/esp/ESPConfigPanel.vue` (GPIO-Belegung).
- **Kalibrierung:** `useCalibrationWizard.ts`, API `calibration.ts` — Wizard starten → Punkte → abschließen (vollständiger Routenname im Dev-Alltag: HardwareView / Sensor-Detail gemäß Projektnavigation).

---

*Ende Bericht (Orchestrator auto-debugger).*
