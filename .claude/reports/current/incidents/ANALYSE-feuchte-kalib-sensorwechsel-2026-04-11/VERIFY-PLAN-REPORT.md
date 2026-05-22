# VERIFY-PLAN-REPORT — ANALYSE-feuchte-kalib-sensorwechsel-2026-04-11

**Skill:** `.claude/skills/verify-plan/SKILL.md`  
**Datum:** 2026-04-10  
**Gegenstand:** `TASK-PACKAGES.md` dieses Incidents + Steuerdatei `STEUER-analyse-feuchte-kalibrierung-sensorwechsel-gpio-handling-2026-04-11.md`

---

## 1. Pfad-Validierung

| Referenz | Status |
|----------|--------|
| `El Servador/god_kaiser_server/src/api/v1/sensors.py` | **OK** — `delete_sensor`, MQTT `send_config`, WS `sensor_config_deleted` |
| `El Servador/god_kaiser_server/src/mqtt/handlers/sensor_handler.py` | **OK** — „Sensor config not found … Saving data without config.“ |
| `El Servador/god_kaiser_server/src/services/calibration_payloads.py` | **OK** — `resolve_calibration_for_processor` |
| `El Servador/god_kaiser_server/tests/integration/test_calibration_session_routes.py` | **OK** — existiert |
| `El Frontend/src/composables/useCalibrationWizard.ts` | **OK** |
| `El Frontend/src/api/calibration.ts` | **OK** |
| `El Trabajante` + `pio run -e esp32_dev` | **Delta 2026-04-11:** `platformio.ini` hat **`[env:esp32_dev]`** (board `esp32dev`, WROOM-32) und **`seeed_xiao_esp32c3`** — Env-Name **`seeed` existiert nicht**; ältere Verify-Zeile war unzutreffend. |
| Incident-Pfad `.claude/reports/current/incidents/ANALYSE-feuchte-kalib-sensorwechsel-2026-04-11/` | **OK** |

---

## 2. Docker / Postgres (Live-Prüfung)

| Check | Ergebnis |
|-------|----------|
| Container `automationone-postgres` | **Up healthy** (Stichprobe 2026-04-10) |
| `esp_devices` enthält ESP_6B27C8, ESP_EA5484 | **OK** |

---

## 3. Korrekturen am Plan (Delta)

1. **pytest-Pfad:** Vollqualifiziert `tests/integration/test_calibration_session_routes.py` — korrekt; bei Teil-Runs `-k` wie in PKG-CAL-02 sparsam einsetzen (Laufzeit).  
2. **Vitest:** `npx vitest run --passWithNoTests` vermeidet leere-Suite-Fail in manchen Setups — optional durch `npx vitest run` ersetzen, wenn Tests für geänderte Komponenten existieren.  
3. **GPIO-Fokus EA5484:** TASK-PACKAGES muss explizit **32 vs. 33** als Entscheidungs-Vorbedingung führen — im Lagebild quantitativ belegt (unterschiedliche STDDEV).

---

## 4. BLOCKER

Keine technischen BLOCKER für **Analyse-Artefakte** und **Dokumentation**. Implementierung: erst nach Abnahme der Paket-Reihenfolge (HW vor CAL).

---

## 5. OUTPUT FÜR ORCHESTRATOR (auto-debugger) — verbindlich

```
=== OUTPUT FÜR ORCHESTRATOR (auto-debugger) ===

PKG-HW-01:
  Delta: Keine Pfadkorrektur; Delete-Pipeline in sensors.py verifiziert. Optional: Tests erweitern statt neue Dateien.
  Rolle: server-dev
  Abhängigkeiten: Keine upstream-BLOCKER
  BLOCKER: nein

PKG-HW-02:
  Delta: Frontend-Pfade OK; Verify vue-tsc + vitest
  Rolle: frontend-dev
  Abhängigkeiten: Schnittstelle zu WS sensor_config_deleted (bereits im Backend)
  BLOCKER: nein

PKG-CAL-01:
  Delta: calibration_payloads + Session-Tests existieren; GPIO-Zielgerät vor Fix klären (32 vs 33 EA5484)
  Rolle: server-dev
  Abhängigkeiten: Empfohlen nach PKG-HW-01 Evidence
  BLOCKER: nein (fachliche Vorbedingung GPIO)

PKG-CAL-02:
  Delta: pytest -k Filter kann groß sein — maxfail=3 gesetzt; bei CI voller Lauf laut Projekt
  Rolle: server-dev + ggf. esp32-dev
  Abhängigkeiten: PKG-HW-01/02 Erkenntnis
  BLOCKER: nein

Post-Verify TASK-PACKAGES: GPIO-Vorbedingung in PKG-CAL-01 Akzeptanzkriterien explizit ergänzt (erledigt in dieser REPORT-Version durch Verweis §3).
SPECIALIST-PROMPTS: unverändert gültig; Verify-Zeilen mit REPORT abgeglichen.
=== ENDE OUTPUT ===
```
