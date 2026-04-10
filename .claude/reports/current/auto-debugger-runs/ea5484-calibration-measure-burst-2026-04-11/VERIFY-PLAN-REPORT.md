# VERIFY-PLAN-REPORT — EA5484 Measure-Burst

**Datum:** 2026-04-11  
**Gebundener Ordner:** `.claude/reports/current/auto-debugger-runs/ea5484-calibration-measure-burst-2026-04-11/`  
**Eingabe:** `TASK-PACKAGES.md` (Entwurf → Post-Verify-Stand im gleichen Commit-Zyklus wie diese Datei)

## /verify-plan Ergebnis

**Plan:** Artefakt-Lauf liefert repo-verifizierte Measure-Kette und **ein** Umsetzungs-PKG (Frontend-Cooldown), Server-Limit zurückgestellt.  
**Geprüft:** 8 Codepfade, 0 Docker-Services (nicht angefordert), 1 REST-Endpoint, 1 MQTT-Publish-Pfad.

### Bestätigt

- `POST /api/v1/sensors/{esp_id}/{gpio}/measure` existiert als `trigger_measurement` in `El Servador/god_kaiser_server/src/api/v1/sensors.py` (Router ab ca. Zeile 1649).
- `SensorService.trigger_measurement` in `El Servador/god_kaiser_server/src/services/sensor_service.py` ruft `publish_sensor_command` mit `command="measure"` auf.
- `MQTTPublisher.publish_sensor_command` in `El Servador/god_kaiser_server/src/mqtt/publisher.py` erzeugt die Logzeile `Sensor command published: …`; QoS = `QOS_SENSOR_COMMAND` = **2** (`src/core/constants.py`).
- Frontend: `sensorsApi.triggerMeasurement` in `El Frontend/src/api/sensors.ts` (POST-Pfad korrekt).
- Kalibrier-Wizard: `useCalibrationWizard.ts` → `triggerLiveMeasurement` + `CalibrationWizard.vue` / `CalibrationStep.vue` Events.
- Referenz-Pattern: `SensorValueCard.vue` nutzt 2 s Sperre nach Mess-Trigger.
- Kein `rate_limit` / `throttle` auf Sensor-Measure-Route im Server-Tree gefunden (Prüfung per Keyword-Suche, kein Voll-Audit aller Middleware).

### Korrekturen nötig — **PKG-01 erledigt (Frontend)**

**Dokumentation (Frontend-Kommentar)** — umgesetzt  
- Plan/Artefakt verwies auf alten Kommentar `sensors.py:727-773`.  
- Mess-Route liegt bei ca. **1649–1695** in `sensors.py`.  
- `El Frontend/src/api/sensors.ts`: Kommentar angepasst; Kalibrier-Wizard-Cooldown wie `SensorValueCard` in `useCalibrationWizard.ts` (Vitest-Ergänzung).

### Fehlende Vorbedingungen

- [ ] Transport-Incident-STEUER abgearbeitet, bevor **PKG-02** (serverseitiges Limit) priorisiert wird.

### Ergänzungen

- Burst ↔ Offline **nur** mit Zeitleiste gegen Transport-Logs korrelieren (Steuer `scope`); kein `request_id`-Mix mit MQTT-CID ohne Evidence.
- QoS **2** auf Sensor-Commands verstärkt Broker-Arbeit bei Bursts — im Implementierungs-Review erwähnen, aber **nicht** ohne `mqtt-dev`-Paket ändern (Steuer `forbidden`).

### Zusammenfassung für TM

**PKG-01 (Frontend)** auf `auto-debugger/work` ist **umgesetzt**. Server-Rate-Limit bleibt **BACKLOG** mit BLOCKER auf Transport-STEUER.

---

## OUTPUT FÜR ORCHESTRATOR (auto-debugger)

### PKG → Delta

| PKG | Delta (Pfad, Testbefehl/-pfad, Reihenfolge, Risiko, HW-Gate, verworfene Teile) |
|-----|-----------------------------------------------------------------------------------|
| PKG-01 | Pfade bestätigt; Tests: `cd "El Frontend" && npx vitest run` + `npx vue-tsc --noEmit`; Kommentar-Fix `src/api/sensors.ts` + Wizard-Cooldown **erledigt**; keine HW-Gate; **verworfen:** sofortige serverseitige Limit-Änderung als gleichrangiges PKG. |
| PKG-02 | **BLOCKER:** Warten auf `STEUER-incident-ea5484-mqtt-transport-keepalive-tls-2026-04-11.md`; sonst keine Delta-Zeile für aktive Umsetzung. |

### PKG → empfohlene Dev-Rolle

| PKG | Rolle |
|-----|--------|
| PKG-01 | `frontend-dev` |
| PKG-02 | `server-dev` (nach Freigabe / Transport) |

### Cross-PKG-Abhängigkeiten

- PKG-02 → PKG-01: Server-Limit nur sinnvoll **ergänzend** nach Transport-Klärung; Frontend-Cooldown ist unabhängig und kann zuerst.

### BLOCKER

- Serverseitiges Rate-Limit (`PKG-02`) bis Abschluss / Einordnung Transport-Incident laut verknüpfter STEUER.
