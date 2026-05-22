# SPECIALIST-PROMPTS — Kalibrierung Bodenfeuchte Schema-Alignment

**Run:** `kalibrierung-schema-alignment-impl-2026-04-09`  
**TASK-PACKAGES:** gleicher Ordner, `TASK-PACKAGES.md`  
**Nach Verify:** PKG-3 ggf. nur Regression/3B — siehe `VERIFY-PLAN-REPORT.md`

---

## Rolle: frontend-dev (PKG-2)

### Scope

- `El Frontend/src/composables/useCalibrationWizard.ts`: bei `sensor_type` **moisture** / **soil_moisture** an beiden `calibrationApi.startSession`-Aufrufen `method: 'moisture_2point'` setzen (aktuell `'linear_2point'`).
- Kopfkommentar (Zeilen 1–13): irreführenden Hinweis auf Delegation an `useCalibration` entfernen oder an IST anpassen — **kein** `useCalibration`-Import erzwingen, wenn kein Shared-Code genutzt wird.

### IST / SOLL

- **IST:** `method: 'linear_2point'` → Backend `finalize` → `derived.type` `linear_2point` (slope/offset), Processor erwartet dry/wet.
- **SOLL:** `method: 'moisture_2point'` → `derived` mit `dry_value`/`wet_value` laut `calibration_service._compute_moisture`.

### Git (Pflicht)

- Arbeitsbranch: **`auto-debugger/work`**. Vor Änderungen: `git checkout auto-debugger/work` und `git branch --show-current` verifizieren.
- Commits nur auf diesem Branch; nicht auf `master`; kein `git push --force` auf Shared-Remotes.

### Pattern-Reuse (Pflicht)

- Nächstliegende Implementation: bestehende `calibrationApi.startSession`-Payloads in derselben Datei; Typen `CalibrationSensorType` unverändert nutzen.
- Keine parallele Kalibrier-API.

### Frontend-Alert-Pfad / Backend-Observability (Pflicht)

- **Nicht im Scope:** ISA-/Notification-/Drawer-Pfade. Keine Änderungen an Alert-Center, WebSocket-Events oder Stores für dieses Paket.

### Verify-Befehl (Pflicht)

```text
cd "c:\Users\robin\Documents\PlatformIO\Projects\Auto-one\El Frontend" && npx vue-tsc --noEmit
```

Optional: gezielter Vitest-Test für `startSession`-Mock (siehe TASK-PACKAGES PKG-2).

### Fehler-Register (Pflicht bei Code)

- Einträge in `.claude/reports/current/auto-debugger-runs/kalibrierung-schema-alignment-impl-2026-04-09/FEHLER-REGISTER.md` — pro Fehler Evidenz → Hypothese → Minimalfix → gleicher Verify-Befehl erneut.

---

## Rolle: server-dev (PKG-3 bis PKG-6)

### Scope

- **PKG-3:** Prüfen, ob nach PKG-2 noch Code nötig ist. Falls Alt-Sessions `linear_2point` + moisture: Variante **3B** in `calibration_service.py` (`_compute_calibration` oder Merge nach `_compute_linear_2point`) — genau **eine** kanonische Quelle für dry/wet im `derived`.
- **PKG-4:** `El Servador/god_kaiser_server/src/sensors/sensor_libraries/active/moisture.py`: `invert` aus `calibration` lesen, wenn nicht in `params`; Priorität dokumentieren (z. B. params überschreibt calibration).
- **PKG-5:** `tests/integration/test_moisture_mqtt_flow.py` (oder Unit nahe MQTT-Pfad) erweitern — Pi-Enhanced, `resolve_calibration_for_processor`, keine Default-Kennlinie nach echter Session-Derived-Form.
- **PKG-6:** kurzes Doku-Addendum unter `docs/analysen/`; optional `useCalibration.ts` Deprecation-Hinweis.

### IST / SOLL

- **IST:** `finalize` ruft `_compute_calibration(method, …)`; `resolve_calibration_for_processor` liefert `derived` flach; Processor braucht dry/wet; invert nur params.
- **SOLL:** Processor sieht nach Feuchte-Kalibrierung immer dry/wet; invert konsistent mit persistiertem `derived`.

### Git (Pflicht)

- Arbeitsbranch: **`auto-debugger/work`**. Vor Änderungen: `git checkout auto-debugger/work` und `git branch --show-current` verifizieren.
- Commits nur auf diesem Branch; nicht auf `master`; kein `git push --force` auf Shared-Remotes.

### Pattern-Reuse (Pflicht)

- Backend: bestehende `_compute_moisture`, `build_canonical_calibration_result`, Tests in `test_moisture_processor.py` / `test_calibration_payloads.py` erweitern — keine neue Hilfsschicht ohne Analogfall.

### Frontend-Alert-Pfad / Backend-Observability (Pflicht)

- Keine Observability-Umbauten; Logging nur nach bestehendem JSON-/Key-Muster falls nötig.

### Verify-Befehl (Pflicht)

Minimal nach Änderungen:

```text
cd "c:\Users\robin\Documents\PlatformIO\Projects\Auto-one\El Servador\god_kaiser_server" && poetry run pytest tests/unit/test_moisture_processor.py tests/unit/test_calibration_payloads.py -q --tb=short
```

Integration PKG-5:

```text
cd "c:\Users\robin\Documents\PlatformIO\Projects\Auto-one\El Servador\god_kaiser_server" && poetry run pytest tests/integration/test_moisture_mqtt_flow.py -q --tb=short
```

### Fehler-Register (Pflicht bei Code)

- Wie oben; bei rotem pytest zuerst einen Eintrag, dann Fix, dann gleicher Befehl.

---

## Übergabe-Reihenfolge

1. **frontend-dev** PKG-2 abschließen (vue-tsc grün).  
2. **server-dev** PKG-3 — nur falls nach Review noch 3B nötig; sonst Regression-Tests.  
3. **server-dev** PKG-4 → PKG-5 → PKG-6.
