# SPECIALIST-PROMPTS — ANALYSE-feuchte-kalib-sensorwechsel-2026-04-11

**Git-Pflicht:** Nur Commits auf Branch **`auto-debugger/work`**, nicht auf `master`. Vor Start: `git checkout auto-debugger/work` und `git pull` falls Team remote pflegt.

**Fehler-Register:** Jeder Build-/Test-Fehler einzeln in `.claude/reports/current/incidents/ANALYSE-feuchte-kalib-sensorwechsel-2026-04-11/FEHLER-REGISTER.md` nachführen; nächster PKG-Schritt erst nach grünem Verify-Schritt zum selben Fix.

---

## server-dev — PKG-HW-01 (nach Verify-Stand)

**Scope:** `El Servador/god_kaiser_server/src/api/v1/sensors.py` (`delete_sensor`), `ESPService.send_config`, MQTT-Config-Builder; ggf. Abgleich mit `sensor_handler` wenn Verhalten „Daten ohne Config“ geändert werden soll.

**Kontext:** Postgres zeigt **ESP_EA5484** ohne `moisture` in `sensor_configs`, aber laufende `sensor_data` für `moisture` — Delete-/Sync-Pfad und Operator-Erwartung klären.

**Deliverables:** Minimal-invasive Änderung (falls überhaupt): z. B. härtere Logs, Metrik, oder Guard — gemäß TASK-PACKAGES nach Verify.

**Verify:**

```text
cd "El Servador/god_kaiser_server" && poetry run pytest tests/integration/test_calibration_session_routes.py -q --tb=short
```

**Pattern-Reuse:** Bestehende Delete-Pipeline erweitern, kein zweiter paralleler Endpunkt.

**Alert-Pfad:** N/A (kein NotificationRouter-Fokus).

---

## frontend-dev — PKG-HW-02

**Scope:** Sensor-Anlage nach Delete — GPIO-Belegung (`ESPConfigPanel.vue`, Stores), WS `sensor_config_deleted`.

**Kontext:** Nutzer beobachtet „PIN belegt“ / abgebrochene Flows nach Sensorwechsel.

**Verify:**

```text
cd "El Frontend" && npx vue-tsc --noEmit
```

---

## server-dev — PKG-CAL-01

**Scope:** `calibration_payloads.py`, Calibration-Session-Apply → `sensor_configs.calibration_data`, Integrationstests.

**Verify:** siehe TASK-PACKAGES `PKG-CAL-01`.

---

## esp32-dev — PKG-CAL-02 (optional, nach Server-Klarheit)

**Scope:** Mutex Wizard vs. kontinuierlich, ein aktiver Feuchte-GPIO — nur wenn Server-Evidence „zwei GPIOs“ bestätigt.

**Verify:** `cd "El Trabajante" && pio run -e esp32_dev` (ESP32 DevKit / WROOM; Seeed XIAO: `seeed_xiao_esp32c3`)

---

## mqtt-dev — nur bei Topic/Schema-Änderung

Abgleich `.claude/reference/api/MQTT_TOPICS.md` vor Publish-Änderungen.
