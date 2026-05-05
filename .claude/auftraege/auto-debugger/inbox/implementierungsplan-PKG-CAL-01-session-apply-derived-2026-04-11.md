# Implementierungsplan — PKG-CAL-01: Session → Finalize/Apply → `calibration_data.derived` → `resolve_calibration_for_processor` → Pi-Enhanced Moisture

**Datum:** 2026-04-11  
**Paket-ID:** `PKG-CAL-01`  
**Bezug:** `.claude/reports/current/incidents/ANALYSE-feuchte-kalib-sensorwechsel-2026-04-11/TASK-PACKAGES.md` (Abschnitt PKG-CAL-01), `docs/analysen/BERICHT-analyse-feuchte-kalibrierung-sensorwechsel-gpio-handling-2026-04-11.md`  
**Repo-Branch (Pflicht):** `auto-debugger/work` — keine Commits auf `master` ohne separates Review.

---

## 1. Vorbedingung — Ziel-GPIO ESP_EA5484 (BLOCKER-Gate)

**Evidenz (IST):** Laut Analysebericht existieren für **ESP_EA5484** parallele Telemetrie-Pfade (**GPIO 32 und 33**), **kalibrierte Sessions** mit Status **APPLIED** sind historisch auf **GPIO 32** gebucht, während **`sensor_configs` keine `moisture`-Zeile** für dieses Gerät zeigt — siehe `docs/analysen/BERICHT-analyse-feuchte-kalibrierung-sensorwechsel-gpio-handling-2026-04-11.md` (Evidence-Register, Geräte-Vergleich EA5484).

**Regel für diesen Plan:** Es darf **keine** produktive Umsetzung von PKG-CAL-01 „für EA5484“ starten, solange nicht **eine** der folgenden Varianten dokumentiert und operationalisiert ist:

| Variante | Bedeutung |
|----------|-----------|
| **A — Entscheidung 32** | Produkt/Operator legt fest: Feuchte-Kanal für EA5484 ist **GPIO 32**; Wizard, Sessions und `sensor_configs` nutzen **dieselbe** `(esp_id, gpio)`-Tupel-Logik. |
| **B — Entscheidung 33** | Entsprechend **GPIO 33** als einziger führender Feuchte-Kanal. |
| **C — BLOCKER: nur nach PKG-HW-01** | Keine Festlegung 32 vs. 33: Umsetzung PKG-CAL-01 nur als **generische** Server-Härtung/Tests **ohne** gerätespezifische Abnahme für EA5484; EA5484-Endabnahme explizit an **PKG-HW-01** (Config-Telemetrie-Kohärenz) gekoppelt. |

**Empfehlung aus TASK-PACKAGES / BERICHT:** Reihenfolge **PKG-HW-01 → (optional PKG-HW-02) → PKG-CAL-01**; ohne GPIO-Klarheit ist die **fachliche Verifikation** von Kalibrier-Fixes für EA5484 nicht belastbar.

---

## 2. IST — Datenfluss Session-Punkte → gespeicherte `calibration_data`

### 2.1 Sammlung und Session-Modell

- **Punkte:** REST `POST …/calibration/sessions/{id}/points` persistiert in `CalibrationSession.calibration_points` (JSONB, Struktur `{"points": [...], "history": [...]}`) — Modell `El Servador/god_kaiser_server/src/db/models/calibration_session.py` (`calibration_points`, `calibration_result`).
- **API-Antwort:** `SessionResponse` in `El Servador/god_kaiser_server/src/api/v1/calibration_sessions.py` spiegelt `calibration_points` und `calibration_result` (Pydantic v2, `Optional[dict]`).

### 2.2 Finalize — Berechnung und Kanonische Hülle

- **Service:** `CalibrationService.finalize` in `El Servador/god_kaiser_server/src/services/calibration_service.py`: aus `COLLECTING` werden Punkte mit Rollen **`dry`** und **`wet`** verlangt; `_compute_calibration(method, sensor_type, points)` liefert das **`derived`**-Rohobjekt.
- **Feuchte-Pfad:** Für `method in ("linear_2point", "linear")` und normalisiertem `sensor_type == "moisture"` wird **`_compute_moisture_from_role_points`** verwendet (nicht `_compute_linear_2point`) — damit ist das finalize-Ergebnis für Feuchte bereits die **dry/wet/invert**-Form, nicht slope/offset.
- **Persistenz Session:** `build_canonical_calibration_result(...)` aus `El Servador/god_kaiser_server/src/services/calibration_payloads.py` schreibt **`calibration_result`** als kanonisches Objekt `{method, points, derived, metadata}` via `repo.set_result`.

### 2.3 Apply — Schreiben auf `sensor_configs`

- **Service:** `CalibrationService.apply` (gleiche Datei): bei `FINALIZING` wird `canonicalize_calibration_data(cal_session.calibration_result, …)` aufgerufen; das Ergebnis wird **`sensor.calibration_data`** zugewiesen (`SensorConfig` in `El Servador/god_kaiser_server/src/db/models/sensor.py`, Spalte `calibration_data: Optional[dict]` JSON).

### 2.4 Laufzeit Ingest / Pi-Enhanced

- **`sensor_service.process_reading`:** `El Servador/god_kaiser_server/src/services/sensor_service.py` — wenn keine Kalibrierung übergeben: `get_config` → `resolve_calibration_for_processor(config.calibration_data)` → `processor.process(...)`.
- **`sensor_handler` (Pi-Enhanced):** `El Servador/god_kaiser_server/src/mqtt/handlers/sensor_handler.py` — gleiches Muster: `resolve_calibration_for_processor(sensor_config.calibration_data)` vor `processor.process`.

---

## 3. SOLL — `derived` und `resolve_calibration_for_processor`

### 3.1 Erwartung `MoistureSensorProcessor.process`

- **Implementierung:** `El Servador/god_kaiser_server/src/sensors/sensor_libraries/active/moisture.py` — für **kalibrierte** lineare Feuchte-Umrechnung werden **`dry_value`** und **`wet_value`** im übergebenen `calibration`-Dict erwartet; optional **`invert`** (wenn nicht durch `params["invert"]` überschrieben).

### 3.2 Ableitung aus DB-Payload

- **`resolve_calibration_for_processor`:** `El Servador/god_kaiser_server/src/services/calibration_payloads.py` — wenn `derived` ein **nicht-leeres** `dict` ist, wird **ausschließlich `derived`** als flaches Dict an den Processor zurückgegeben; leeres `derived` bei kanonischer Hülle → **`None`** (Processor läuft dann effektiv ohne Kalibrierung / Defaults).

### 3.3 SOLL-Kriterium PKG-CAL-01

Nach erfolgreichem **Apply** muss für **`sensor_type` Feuchte** (normalisiert `moisture`) die persistierte **`calibration_data`** so beschaffen sein, dass `resolve_calibration_for_processor(...)` mindestens **`dry_value`** und **`wet_value`** liefert (und damit `MoistureSensorProcessor.process` `metadata.calibrated == True` erreichen kann — siehe Regression in `tests/unit/test_calibration_payloads.py::test_moisture_processor_uses_canonical_calibration_via_resolver`).

**Hinweis Invert:** `_compute_moisture_from_role_points` setzt `invert` aus `dry_raw > wet_raw`. Doppelte Invert-Logik (Kennlinie + zusätzlich vertauschte Rollen) ist explizit über **Tests** abzusichern — Akzeptanzkriterium 2 in TASK-PACKAGES.

---

## 4. Umsetzungsschritte (nummeriert, Backend-only)

1. **Vorbedingung prüfen:** GPIO-Entscheidung für EA5484 gemäß Abschnitt 1 oder explizit Variante C wählen; Abhängigkeit **PKG-HW-01** im Run-Log vermerken.
2. **IST-Audit im Code:** In `calibration_service.py` bestätigen, dass alle produktiven Pfade für Feuchte-Sessions (`linear_2point` / `moisture_2point`) tatsächlich **`derived`** mit `dry_value`/`wet_value` erzeugen; Abweichungen nur nach dokumentiertem Bug-Befund ändern.
3. **Apply-Pfad:** Sicherstellen, dass nach `canonicalize_calibration_data` keine leeren `derived` für gültige Finalize-Ergebnisse entstehen; Fehlerfälle weiterhin **fail-closed** mit `CalibrationError` / Session `FAILED` (bestehendes Muster in `apply`).
4. **Sensor-Zuordnung:** Sicherstellen, dass `sensor_config_id` / `(esp_id, gpio)` der Session mit der **tatsächlich ingestierten** Konfiguration übereinstimmt (Querschnitt zu PKG-HW-01: keine Apply auf „falsches“ GPIO ohne dokumentierte Migration).
5. **Observability (minimal):** Bei Bedarf **strukturierte** Log-Zeile nach Apply (ohne Secrets): z. B. dass `resolve_calibration_for_processor` für die geschriebene Row **nicht** `None` liefert — nur wenn im Paket-Scope begründet; keine MQTT-Schema-Änderungen.
6. **Regelkonformheit:** `async def` für I/O-Routen, Pydantic v2 in API-Schemas, Exceptions in MQTT-Handlern nicht schlucken (`.cursor/rules/backend.mdc`).

---

## 5. Tests (konkrete Erweiterungen)

| Datei | Zweck |
|-------|--------|
| `El Servador/god_kaiser_server/tests/integration/test_calibration_session_routes.py` | Vollständiger Flow existiert (`test_calibration_session_full_route_flow`); **Erweiterung:** nach `apply` per DB- oder API-Lesepfad **`sensor_configs.calibration_data`** prüfen: kanonische Keys, **`derived` enthält `dry_value`/`wet_value`**, konsistent zu `finalize`-Response. |
| `El Servador/god_kaiser_server/tests/unit/test_calibration_payloads.py` | Bereits Canonical/Resolver-Regressionen; bei Schema-Anpassungen **bestehende** Tests erweitern statt Duplikate. |
| `El Servador/god_kaiser_server/tests/unit/test_calibration_service.py` | Optional: Einzelfälle für `_compute_calibration` / Feuchte-Rollen, wenn neue Zweige entstehen. |

---

## 6. Verify (identisch zu TASK-PACKAGES PKG-CAL-01)

Keine dokumentierte Abweichung — Befehle wie in `.claude/reports/current/incidents/ANALYSE-feuchte-kalib-sensorwechsel-2026-04-11/TASK-PACKAGES.md`:

```text
cd "El Servador/god_kaiser_server" && poetry run pytest tests/integration/test_calibration_session_routes.py -q
cd "El Servador/god_kaiser_server" && poetry run ruff check src/services/calibration_payloads.py src/mqtt/handlers/sensor_handler.py
```

Optional bei Änderungen an `calibration_service.py` / `sensor_service.py`: denselben `ruff check`-Aufruf um die **geänderten** Pfade erweitern (ein Befehl mit mehreren Pfaden).

---

## 7. Abgrenzung

- **PKG-CAL-02** (Stabilität, Mutex, Rohwert, `CalibrationResponseHandler`, Soak/STDDEV): **ausgeschlossen** — nicht im Scope dieses Plans.
- **Frontend-Wizard** / Firmware: nur soweit für **reine Backend-Verifikation** nötig; UI-Änderungen gehören zu **PKG-HW-02** bzw. eigenen Steuerdateien, nicht zu PKG-CAL-01 im Sinne von TASK-PACKAGES.

---

## 8. Querverweis (bereits beschlossene Muster, kein Doppel-Implementieren)

- `.claude/auftraege/auto-debugger/inbox/implementierungsplan-kalibrierungsflow-bodenfeuchte-schema-alignment-2026-04-09.md` — beschreibt die strategische **Option (a)** (Feuchte → `dry_value`/`wet_value` in `derived` / moisture_2point-Pfad). Der **aktuelle Code** in `calibration_service._compute_calibration` setzt `linear_2point` + `moisture` bereits auf `_compute_moisture_from_role_points` um; PKG-CAL-01 fokussiert auf **Persistenz, Zuordnung, Tests und GPIO-Vorbedingung**, nicht auf ein zweites paralleles Rechenmodell.

---

*Ende Implementierungsplan PKG-CAL-01.*
