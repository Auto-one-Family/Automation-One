# VERIFY-PLAN-REPORT — feuchte-wizard-nachweis-messkette-2026-04-10

**Gebundener Ordner:** `.claude/reports/current/auto-debugger-runs/feuchte-wizard-nachweis-messkette-2026-04-10/`  
**Geprüfter Plan:** `TASK-PACKAGES.md` (Nachweis-Lauf) + Steuerdatei `STEUER-feuchte-wizard-nachweis-messkette-2026-04-10.md`  
**Datum:** 2026-04-10  

## Zusammenfassung

Der Nachweis-Plan ist **ausführbar**, sofern lokaler Stack + ESP verfügbar sind. Korrekturen betreffen vor allem **Log-Pfade**, **Agent-Namen**, **MQTT-Log-Ort** und **Abgleich BERICHT ↔ aktueller Code** (kein Blocker für den Plan selbst; erhöht aber die Interpretationssicherheit).

---

## /verify-plan Ergebnis (fachlich)

**Geprüft:** Pfade (Run-Ordner, Server-Code), Agent-Namen, MQTT/Log-Doku, WS-Event-Namen, DB-Modell.

### Bestätigt

- Run-Ausgabeordner `.claude/reports/current/auto-debugger-runs/feuchte-wizard-nachweis-messkette-2026-04-10/` entspricht Steuerfeld `run_id`.  
- `CalibrationResponseHandler` existiert unter `El Servador/god_kaiser_server/src/mqtt/handlers/calibration_response_handler.py`; Log-Präfix `CalibrationResponseHandler:`.  
- `Measurement triggered … request_id:` in `sensor_service.py` (ca. Zeilen 600–603).  
- WS-Events `calibration_measurement_received` / `calibration_measurement_failed` in `WEBSOCKET_EVENTS.md` und Code.  
- Tabelle `sensor_data` / Model `SensorData` im Backend.  
- `useCalibrationWizard.ts` implementiert Request-Korrelation (`matchesActiveMeasurementRequest`).

### Korrekturen (gegenüber Steuer-/BERICHT-Text)

| Thema | Plan/BERICHT sagt | System sagt |
|--------|-------------------|-------------|
| Server-Log-Pfad | implizit „god_kaiser.log“ | Host: `logs/server/god_kaiser.log` (Bind-Mount); siehe `LOG_LOCATIONS.md` |
| MQTT-Datei-Log | implizit lokale mqtt-Datei | Kein Bind-Mount `logs/mqtt/` für Broker; **docker logs** / Loki |
| Agent-Name | „server-debugger“ | **`server-debug`** — `.claude/agents/server/server-debug-agent.md` |
| H2 Fallback | BERICHT: DB latest bei fehlendem raw | Aktueller Handler: **kein** DB-Fallback; `calibration_measurement_failed` |
| H1 Frontend | BERICHT: kein ID-Match | Aktueller Code: **Match** über `measurementCorrelationCandidates` |

### Fehlende Vorbedingungen

- [ ] Backend + MQTT-Broker + ESP **online**  
- [ ] Kalibrierwizard-Session gestartet (für `session_id` in WS bei aktiver Session)  
- [ ] Log-Zugriff (Host-Datei oder Docker/Loki)  

### Ergänzungen

- Für Windows: `Select-String` oder `rg` auf `logs/server/god_kaiser.log`; JSON-Zeilen ggf. nach `message` filtern.  
- Regression: Abgleich **deployter** Commit mit `EVIDENZ-LAGEBILD.md` (Drift zu BERICHT).

---

## OUTPUT FÜR ORCHESTRATOR (auto-debugger) — Spiegel für Chat

Der folgende Block entspricht der verbindlichen Chat-Ausgabe (Post-Verify: `TASK-PACKAGES.md` / `SPECIALIST-PROMPTS.md` sind konsistent).

```markdown
## OUTPUT FÜR ORCHESTRATOR (auto-debugger)

### PKG → Delta
| PKG | Delta (Pfad, Testbefehl/-pfad, Reihenfolge, Risiko, HW-Gate, verworfene Teile) |
|-----|-----------------------------------------------------------------------------------|
| PKG-01 | Keine Pfadänderung; Verify: Notizen pro Klick mit `request_id`; HW-Gate: ESP online. |
| PKG-02 | Log-Pfad verbindlich: `logs/server/god_kaiser.log`; Verify: `rg "Measurement triggered\|CalibrationResponseHandler" "logs/server/god_kaiser.log"`; Docker-Alternative dokumentiert. |
| PKG-03 | Kein `logs/mqtt/`-File-Trace; Broker über `docker compose logs mqtt-broker` / Loki / `make mqtt-sub`. |
| PKG-04 | Kein Code; manueller WS-Export in CORRELATION-MAP. |
| PKG-05 | Tabelle `sensor_data` bestätigt; nur lokale DB. |

### PKG → empfohlene Dev-Rolle
| PKG | Rolle (z. B. server-dev, frontend-dev, esp32-dev, mqtt-dev) |
|-----|---------------------------------------------------------------|
| PKG-01 | Operator / frontend-debug (Beobachtung) |
| PKG-02 | server-debug |
| PKG-03 | mqtt-debug |
| PKG-04 | frontend-debug |
| PKG-05 | db-inspector |

### Cross-PKG-Abhängigkeiten
- PKG-02 → PKG-01: Server-`request_id` sinnvoll erst nach notiertem REST-`request_id` aus PKG-01.
- PKG-03/PKG-04 → PKG-01: gleiche zeitliche Session wie Repro.

### BLOCKER
- Kein laufender Stack oder kein ESP: keine echten Traces — Nachbedingung: Dev-Stack laut AGENTS.md / Makefile.
- MQTT ohne Broker-Log-Zugriff: BLOCKER bis `make mqtt-sub` oder Loki verfügbar.
- BERICHT §3/§5 teilweise veraltet zu Repo-HEAD (H1/H2) — Evidenzinterpretation nur nach Commit-Abgleich (`EVIDENZ-LAGEBILD.md`).
```
