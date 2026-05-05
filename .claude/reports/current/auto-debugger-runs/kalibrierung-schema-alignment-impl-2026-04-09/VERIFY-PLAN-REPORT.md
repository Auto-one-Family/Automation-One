# VERIFY-PLAN-REPORT — Implementierungsplan Kalibrierung Bodenfeuchte

**Datum:** 2026-04-09  
**Plan:** `.claude/auftraege/auto-debugger/inbox/implementierungsplan-kalibrierungsflow-bodenfeuchte-schema-alignment-2026-04-09.md`  
**Run-Ordner:** `.claude/reports/current/auto-debugger-runs/kalibrierung-schema-alignment-impl-2026-04-09/`  
**Git (Orchestrierung):** Branch `auto-debugger/work` — verifiziert.

---

## /verify-plan Ergebnis (Zusammenfassung)

**Plan:** Schema-Alignment `linear_2point` vs. `MoistureSensorProcessor` (dry/wet), Frontend `moisture_2point`, Backend-Fallback optional, invert aus calibration, Pi-Enhanced-Tests.  
**Geprüft:** zentrale Pfade (Frontend/Backend), 1 API-Stelle, keine Docker-Pflicht für statische Verify.

### Bestätigt

- `El Frontend/src/composables/useCalibrationWizard.ts` nutzt an **zwei** Stellen `method: 'linear_2point'` (ca. Zeilen 361 und 560); Zielzeilen im Plan (~357–362, ~556–561) sind **inhaltlich korrekt**, Abweichung ±2 Zeilen.
- `calibration_service.finalize` verwendet `cal_session.method` und ruft `_compute_calibration(cal_session.method, …)` auf — Umstellung des **Start-Session**-Methods auf `moisture_2point` wirkt **end-to-end** ohne zusätzliche API-Änderung.
- `_compute_calibration` unterstützt **`moisture_2point`** → `_compute_moisture` mit `derived.type` `moisture_2point`, Keys `dry_value`, `wet_value`, `invert`.
- Öffentliche API `El Servador/god_kaiser_server/src/api/v1/calibration_sessions.py`: `method: str = Field(default="linear_2point", max_length=30)` — **`moisture_2point` ist zulässig** (kein Ausschluss-Enum).
- `resolve_calibration_for_processor` liefert bei kanonischem Payload den Inhalt von **`derived`** flach an den Processor — passt zu `MoistureSensorProcessor.process(calibration=…)`.
- `MoistureSensorProcessor.process` nutzt **`dry_value`/`wet_value`**; sonst Defaults 3200/1500; **`invert` aktuell nur aus `params`**, nicht aus `calibration` — Plan-Nebenbefund **bestätigt**.
- `sensor_handler`: Pi-Enhanced-Pfad und `resolve_calibration_for_processor` existieren (Zeilen ~269 ff., ~1299); exakte Zeilen können sich um wenige Positionen verschieben — **Pattern bestätigt**.
- Tests: `tests/unit/test_moisture_processor.py`, `tests/integration/test_moisture_mqtt_flow.py` — **vorhanden** (Plannamen korrekt).

### Korrekturen / Deltas zum Plan

| Thema | Plan | System (IST) |
|--------|------|----------------|
| `useCalibration`-Delegation | Kopfkommentar: Delegation an `useCalibration` | **Kein** Import von `useCalibration` in `useCalibrationWizard.ts` — nur Kommentar; Kommentar **bereinigen** (PKG-2). |
| Zeilen sensor_handler | ~269–307, ~1297–1307 | `pi_enhanced`/`raw_mode` ab ~269; `resolve_calibration_for_processor` ~1299 — **leicht andere Zeilennummern**, gleiche Logik. |
| PKG-3 Pflicht | Ggf. großer Backend-Eingriff | Wenn PKG-2 **`moisture_2point`** setzt, ist **3A bereits durch bestehenden Code abgedeckt**; **3B** nur für Alt-Sessions oder wenn `linear_2point` beibehalten werden muss. |

### Fehlende Vorbedingungen

- [ ] Keine Blocker für statische Umsetzung; Laufzeit-Stack (Docker/MQTT) nur für **Integrationstest PKG-5** nötig.

### Ergänzungen

- **Entscheidungsmatrix:** Primär **nur Frontend** (`moisture_2point`); Backend **3B** als Absicherung für bestehende DB-Sessions mit `linear_2point` + moisture.
- **`sensor_type_registry.py`:** Pfad `El Servador/god_kaiser_server/src/sensors/sensor_type_registry.py` — für Normalisierung `soil_moisture` ↔ `moisture` bei PKG-3 prüfen.
- **Firmware** `sensor_manager.cpp`: nur Referenz IST-Bericht; **kein Pflicht-Change** laut Plan.

### Zusammenfassung für TM

Der Plan ist **ausführbar**. Hauptfix: Frontend auf **`moisture_2point`**; Backend ist bereits **3A-fähig**. Zusätzlich **PKG-4** (invert aus `calibration`) und **PKG-5** (Integration). optionales **3B** nur bei Migrationsbedarf.

---

## OUTPUT FÜR ORCHESTRATOR (auto-debugger) — eingebettet

### PKG → Delta

| PKG | Delta (Pfad, Testbefehl/-pfad, Reihenfolge, Risiko, HW-Gate, verworfene Teile) |
|-----|-----------------------------------------------------------------------------------|
| PKG-1 | Kein Delta — Inventar in diesem Report; Zeilen `useCalibrationWizard` 361/560 statt 357–362/556–561. |
| PKG-2 | `El Frontend/src/composables/useCalibrationWizard.ts`; Verify: `npx vue-tsc --noEmit`; Risiko: niedrig. |
| PKG-3 | **Geschärft:** 3A oft **kein Code** nach PKG-2; 3B nur bei Bedarf `calibration_service.py` + Tests. Verify: `poetry run pytest tests/unit/test_calibration_payloads.py` + moisture-Tests. |
| PKG-4 | `moisture.py` invert aus calibration; Verify: `pytest tests/unit/test_moisture_processor.py`. |
| PKG-5 | `test_moisture_mqtt_flow.py` erweitern; ggf. Stack für Integration. |
| PKG-6 | `docs/analysen/FIX-…md` oder Addendum; `useCalibration.ts` Kommentar. |

### PKG → empfohlene Dev-Rolle

| PKG | Rolle |
|-----|--------|
| PKG-1 | — (erledigt) |
| PKG-2 | frontend-dev |
| PKG-3 | server-dev |
| PKG-4 | server-dev |
| PKG-5 | server-dev |
| PKG-6 | server-dev + frontend-dev (Doku/Kommentar) |

### Cross-PKG-Abhängigkeiten

- PKG-2 → PKG-3: Nach Frontend-Umstellung **prüfen**, ob Backend-Änderung nötig; wenn nur `moisture_2point`, **finalize** bereits korrekt.
- PKG-4 → PKG-5: Processor-Verhalten vor MQTT-Integrationstest konsistent halten.

### BLOCKER

- Keine.
