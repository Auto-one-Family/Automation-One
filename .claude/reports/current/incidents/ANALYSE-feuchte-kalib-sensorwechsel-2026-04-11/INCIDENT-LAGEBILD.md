# INCIDENT-LAGEBILD — ANALYSE-feuchte-kalib-sensorwechsel-2026-04-11

**Steuerlauf:** `STEUER-analyse-feuchte-kalibrierung-sensorwechsel-gpio-handling-2026-04-11.md`  
**Modus:** `both` (`incident_first`)  
**Branch (IST):** `auto-debugger/work`  
**Letzte Aktualisierung:** 2026-04-10 (Orchestrator-Lauf, Evidence-Zeitfenster DB/MQTT-nahe UTC)

---

## 1. Kurzbeschreibung

Am laufenden Stack sollen **instabile kalibrierte Feuchte** (v. a. **ESP_EA5484**, Altlast pH→Feuchte, mehrere GPIOs) und **Randprobleme beim Sensorwechsel** (Delete, GPIO-Reuse, „PIN belegt“, Config-Push) **getrennt** als Pakete **PKG-CAL-*** vs. **PKG-HW-*** beschrieben werden. Dieser Lauf liefert **repo- und DB-verifizierte** IST-Evidenz; keine fiktiven Log-Zitate.

---

## 2. IST-Fakten (Postgres, `automationone-postgres`)

| Gerät | `sensor_configs` (Feuchte) | Befund |
|-------|---------------------------|--------|
| **ESP_6B27C8** | **Eine** Zeile: GPIO **33**, `moisture`, `calibration_data` **NULL** in Abfrage (Spalte vorhanden, Inhalt leer/NULL je nach Cast) | Stabilere Zeitreihe auf **GPIO 33** (siehe §3) |
| **ESP_EA5484** | **Keine** `moisture`-Zeile | Nur GPIO 0 (SHT/VPD), GPIO 4 (DS18B20) — **Persistenz ohne Feuchte-Config** |

**Kalibrier-Sessions (Auszug):**

- **ESP_EA5484:** mehrere Sessions **GPIO 32**, `moisture`, Status **APPLIED** (u. a. 2026-04-10 09:33–11:15 UTC).
- **ESP_6B27C8:** Sessions u. a. **GPIO 32** `moisture` APPLIED/REJECTED; aktuelle **Config** zeigt Feuchte auf **GPIO 33** — **GPIO-Drift** zwischen Session-Historie und aktuellem Config-Snapshot.

**sensor_data (Feuchte, letzte ~2 h, Stichprobe):**

| Gerät | GPIO | STDDEV(`processed_value`) | MIN–MAX | n |
|-------|------|---------------------------|---------|---|
| ESP_6B27C8 | 33 | **~3.37** | 0–22.6 | 42 |
| ESP_EA5484 | 32 | **~283** | 0–918 | 241 |
| ESP_EA5484 | 33 | **~82** | 38.6–396 | 82 |

**Interpretation:** **6B27C8 / 33** entspricht der **Soll-Beobachtung** (ruhige Kurve). **EA5484 / 32** zeigt **pathologische Schwankung** im selben Zeitfenster; **33** ebenfalls deutlich volatiler als Referenz — passt zur Nutzerhypothese „Wechsel / Altlast / zweiter Kanal“.

---

## 3. Cluster-Zuordnung (nicht vermischen)

### CLUSTER A — GPIO / Delete / Config-Push / UI

- **A1:** `DELETE /api/v1/sensors/{esp_id}/{config_id}` implementiert Pipeline: DB-Delete → Subzone-Cleanup wenn GPIO leer → `rebuild_simulation_config` → Scheduler → **`esp_service.send_config`** → WS `sensor_config_deleted` (`El Servador/god_kaiser_server/src/api/v1/sensors.py`).
- **A2:** MQTT-Ingest ohne Config: `sensor_handler` warnt **`Sensor config not found … Saving data without config.`** und speichert Roh-/Fallback-Pfad — **kein Pi-Enhanced** ohne `sensor_config` (`sensor_handler.py` § Lookup).
- **A3:** **ESP_EA5484** liefert **weiter Feuchte** auf **32 und 33**, obwohl **`sensor_configs` keine `moisture`** enthält — **Drift** zwischen Gerät/Topic-Historie und DB-Config (align mit Baseline-Bericht `BERICHT-feuchte-baseline-neues-esp-gpio33-live-verifikation-2026-04-11.md`).

### CLUSTER B — Kalibrierung / Processor / Stabilität

- **B1:** `resolve_calibration_for_processor` liefert nutzbare Kalibrierung nur aus **`derived`** oder Legacy-Flat (`calibration_payloads.py`).
- **B2:** `CalibrationResponseHandler` ersetzt **kein** fehlendes `raw` aus DB-Zeilen (Wizard vs. kontinuierlich) — relevant für Messketten-Nachweis.
- **B3:** Kontrast **kalibrierte Sessions (EA5484, GPIO 32)** vs. **fehlende Config-Zeile** + **extreme `processed_value`-Spannweite** legt nahe: Teile der Kette arbeiten **ohne** konsistente `sensor_configs.calibration_data` / **doppelter GPIO** / falscher Verarbeitungszweig.

---

## 4. Pattern-Scan (Pflicht — nächste bestehende Implementierung)

| Thema | Repo-Verweis (Analogfall) |
|-------|---------------------------|
| Sensor löschen + MQTT-Config | `sensors.py` `delete_sensor` (ab ~1125), `sensor_service.delete_config` |
| Ingest ohne Config | `mqtt/handlers/sensor_handler.py` (Lookup + Warning) |
| Kalibrierung Session | `calibration_response_handler.py`, `tests/integration/test_calibration_session_routes.py` |
| Processor-Kalibrierung | `services/calibration_payloads.resolve_calibration_for_processor`, Aufruf in `sensor_service.process_reading` |
| Frontend-Wizard | `composables/useCalibrationWizard.ts`, `api/calibration.ts` |

---

## 5. ISA-18.2 / Router-Hinweis

NotificationRouter/DB-Notifications **vs.** WS `error_event` — bei dieser Analyse **keine** Root-Cause-Zuordnung über Dedup-Titel; Evidence aus **DB + Handler-Pfad**.

---

## 6. Eingebrachte Erkenntnisse (additiv)

| Timestamp | Inhalt |
|-----------|--------|
| 2026-04-10 | Lagebild initial: Postgres-Stichproben ESP_6B27C8 / ESP_EA5484; STDDEV-Vergleich 2h-Fenster; Pattern-Scan-Pfade gesetzt; Korrelation zu Baseline-Bericht GPIO32/33. |
