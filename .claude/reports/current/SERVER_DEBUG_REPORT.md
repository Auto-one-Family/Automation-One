# Server Debug Report

**Erstellt:** 2026-03-26 09:25 UTC
**Modus:** B (Spezifisch: "VPD=0 Problem — Root-Cause-Analyse")
**Quellen:** docker logs el-servador (600 Zeilen), sensor_data DB, sensor_configs DB, esp_devices.device_metadata, vpd_calculator.py, sensor_handler.py, sensor_type_registry.py, simulation/scheduler.py

---

## 1. Zusammenfassung

Es gibt **zwei unabhaengige VPD=0 Bugs** mit unterschiedlichen Root-Causes und unterschiedlichen betroffenen Devices. Bug A betrifft `MOCK_24557EC6`: Der `SHT31TemperatureProcessor` (Pi-Enhanced) gibt `processed_value=0.0, quality=error` fuer raw=22.0 zurueck. Die VPD-Hook `_try_compute_vpd` verwendet diesen falschen `processed_value=0.0` als Temperatur-Eingabe und berechnet VPD(T=0°C, RH=55%) = 0.2749 kPa — physikalisch falsch, aber nicht 0. Bug B betrifft `MOCK_T18V6LOGIC`: Der Simulation-Scheduler erzeugt einen regulaeren MQTT-Sensor-Job fuer den VIRTUAL-VPD-Sensor (gpio=0), weil `_start_sensor_jobs_from_db()` VIRTUAL-Sensoren nicht ausfiltert. Da der VPD-Eintrag in `simulation_config.sensors` kein `base_value`-Feld hat, gibt `_calculate_sensor_value()` 0.0 zurueck — VPD=0 wird als echter Sensor-Datenpunkt in die DB geschrieben. Handlungsbedarf: **Kritisch (Bug B)** und **Hoch (Bug A)**.

---

## 2. Analysierte Quellen

| Quelle | Status | Bemerkung |
|--------|--------|-----------|
| `docker logs el-servador` | OK | 600 Zeilen analysiert, Pi-Enhanced Logs gefunden |
| `sensor_data` Tabelle (PostgreSQL) | OK | VPD=0 fuer beide Devices bestaetigt |
| `sensor_configs` Tabelle | OK | pi_enhanced=True nur fuer MOCK_24557EC6/sht31_temp/i2c=68 |
| `esp_devices.device_metadata` | OK | simulation_config VPD-Eintraege analysiert |
| `vpd_calculator.py` | OK | Berechnung mathematisch korrekt — nicht der Fehler |
| `sensor_handler.py` | OK | VPD-Hook und Pi-Enhanced-Pfad vollstaendig analysiert |
| `simulation/scheduler.py` | OK | Zweiter VPD-Codepfad identifiziert |

---

## 3. Befunde

### 3.1 Bug A — Pi-Enhanced Processor gibt processed=0.0 fuer sht31_temp (MOCK_24557EC6)

- **Schwere:** Hoch
- **Device:** `MOCK_24557EC6`, gpio=0, sensor_type=`sht31_temp`, i2c_address=68
- **Detail:** `SHT31TemperatureProcessor` wird aufgerufen (sensor_configs.pi_enhanced=True fuer diesen Eintrag). Der Processor empfaengt raw=22.0 und gibt `processed_value=0.0, quality=error` zurueck. Die VPD-Hook `_try_compute_vpd` (sensor_handler.py Zeile ~506) wird mit `trigger_value=processed_value=0.0` aufgerufen — sie prueft nicht ob quality=="error". VPD(T=0°C, RH=55%) = 0.2749 kPa wird korrekt berechnet, ist aber physikalisch falsch.
- **Schluessel-Log-Evidenz:**
  ```
  [Pi-Enhanced] SUCCESS: esp_id=MOCK_24557EC6, gpio=0, sensor_type='sht31_temp'
    raw=22.0 -> processed=0.0 C, quality=error
  VPD computed and saved: esp_id=MOCK_24557EC6, vpd=0.2749 kPa (T=0.0C, RH=55.0%)
  ```
- **DB-Evidenz:**
  ```
  sensor_type=sht31_temp | raw_value=22 | processed_value=0 | processing_mode=pi_enhanced | quality=error
  ```
- **Ursachenkette:**
  1. MOCK_24557EC6 sensor_configs: pi_enhanced=True fuer sht31_temp (gpio=0, i2c_address=68)
  2. `_trigger_pi_enhanced_processing()` laeuft durch, gibt processed=0.0, quality=error zurueck
  3. Da pi_result nicht None ist (Processor gab Ergebnis zurueck), wird processed_value=0.0 gesetzt
  4. VPD-Hook-Bedingung: `if sensor_type in ("sht31_temp", "sht31_humidity")` ist True
  5. `_try_compute_vpd(trigger_value=processed_value=0.0)` berechnet VPD mit T=0°C

### 3.2 Bug B — Scheduler erstellt Sensor-Job fuer VIRTUAL VPD-Sensor (MOCK_T18V6LOGIC)

- **Schwere:** Kritisch
- **Device:** `MOCK_T18V6LOGIC`, gpio=0, sensor_type=`vpd`
- **Detail:** Wenn `_try_compute_vpd()` erstmals erfolgreich laeuft, schreibt sie den VPD-Wert in `simulation_config.sensors` (sensor_handler.py Zeilen 682-693). Beim naechsten Scheduler-Lauf iteriert `_start_sensor_jobs_from_db()` ueber alle `simulation_config.sensors`-Eintraege inklusive VPD. Da `interface_type="VIRTUAL"` nicht ausgefiltert wird, startet ein regulaerer `_sensor_job` fuer gpio=0/vpd. `_calculate_sensor_value()` findet kein `base_value` im VPD-Eintrag (nur `raw_value` ist gesetzt) -> Fallback: `base_value = sensor_config.get("base_value", 0.0)` = 0.0. Das MQTT-Publish sendet VPD=0 als normalen Sensor-Datenpunkt.
- **DB-Evidenz (Zeitreihe 5 Min, MOCK_T18V6LOGIC):**
  ```
  09:16:31.164 | gpio=0 | vpd | raw=0     | processed=0     | quality=good  <- Scheduler-Job
  09:16:31.167 | gpio=0 | vpd | raw=1.189 | processed=1.189 | quality=good  <- sensor_handler Hook
  ```
  VPD=0 erscheint zeitlich VOR oder getrennt von SHT31-Daten — anderer Codepfad.
- **simulation_config-Evidenz:**
  ```json
  "cfg_b346e10b-...": {
    "sensor_type": "vpd",
    "gpio": 0,
    "interface_type": "VIRTUAL",
    "raw_value": 1.1898,
    "quality": "good"
    // KEIN "base_value" Feld -> _calculate_sensor_value gibt 0.0 zurueck
  }
  ```
- **Ursachenkette:**
  1. `_try_compute_vpd()` schreibt VPD-Eintrag in simulation_config.sensors (sensor_handler.py ~682-693)
  2. `_start_sensor_jobs_from_db()` filtert VIRTUAL-Sensoren nicht aus (scheduler.py ~342-381)
  3. Job `mock_MOCK_T18V6LOGIC_sensor_0_vpd` wird gestartet
  4. `_calculate_sensor_value()`: kein `base_value` -> 0.0 als Fallback (scheduler.py Zeile 911)
  5. Scheduler publisht VPD=0 via MQTT
  6. sensor_handler verarbeitet als normalen Sensor-Datenpunkt (processing_mode=raw)
  7. VPD=0 wird in sensor_data gespeichert

### 3.3 Nebenbefund — MOCK_24557EC6 hat doppelte SHT31-Configs auf gpio=0

- **Schwere:** Mittel
- **Detail:** In sensor_configs existieren fuer MOCK_24557EC6 auf gpio=0 zwei sht31_temp-Eintraege (i2c=68 und i2c=69) und zwei sht31_humidity-Eintraege. Nur i2c=68 hat pi_enhanced=True. Das erzeugt unterschiedliche VPD-Ergebnisse je nach I2C-Lookup-Reihenfolge.
- **DB-Evidenz:**
  ```
  sht31_temp  | gpio=0 | i2c=68 | pi_enhanced=True   <- erzeugt processed=0.0
  sht31_temp  | gpio=0 | i2c=69 | pi_enhanced=False  <- erzeugt processed=22.0
  ```

### 3.4 vpd_calculator.py — Keine Bugs

- **Bewertung:** Die Berechnung ist mathematisch korrekt.
- **Verifikation:** calculate_vpd(0.0, 55.0) = 0.2749 kPa — entspricht genau dem Log-Wert.
- **Validierungslogik:** Gibt None zurueck wenn humidity < 0 oder > 100, oder temp < -40 oder > 80. T=0.0°C ist ein gueltiger Wert — daher kein None-Guard.

---

## 4. Extended Checks (eigenstaendig durchgefuehrt)

| Check | Ergebnis |
|-------|----------|
| `curl /health/live` | 200 OK, Server lauft |
| `docker compose ps` | Alle Services running/healthy |
| `sensor_data WHERE sensor_type='vpd' DESC LIMIT 20` | VPD=0 und VPD=1.1898 abwechselnd fuer MOCK_T18V6LOGIC; VPD=0.2749 fuer MOCK_24557EC6 |
| `sensor_data WHERE device='MOCK_24557EC6' AND sensor_type='sht31_temp'` | processed_value=0, processing_mode=pi_enhanced, quality=error — bestaetigt |
| `sensor_configs WHERE device='MOCK_24557EC6'` | pi_enhanced=True nur fuer i2c_address=68 |
| `device_metadata simulation_config MOCK_T18V6LOGIC` | VPD-Eintrag hat raw_value aber kein base_value |
| `device_metadata simulation_config MOCK_24557EC6` | VPD-Eintrag hat raw_value=0.2749 aber kein base_value |
| Zeitreihen-Analyse MOCK_T18V6LOGIC (5 Min) | VPD=0 erscheint zeitlich isoliert, nicht als Folge von SHT31-Daten |

---

## 5. Bewertung & Empfehlung

### Root Cause A — Pi-Enhanced gibt processed=0.0 weiter, VPD-Hook prueft quality nicht

**Betroffene Dateien:**
- `El Servador/god_kaiser_server/src/mqtt/handlers/sensor_handler.py` (VPD-Hook, ~Zeile 501-515)
- `El Servador/god_kaiser_server/src/services/pi_enhanced/` (SHT31TemperatureProcessor)

**Fix 1 (Guard in VPD-Hook, sofort umsetzbar):**
In `_try_compute_vpd()` pruefen ob der aktuell verarbeitete Sensor quality=="error" hat, bevor VPD berechnet wird. Der `trigger_value` wird an der Aufrufstelle direkt aus `processed_value` uebergeben — dort ist die quality bereits bekannt.

**Fix 2 (Pi-Enhanced Processor reparieren, Kern-Fix):**
`SHT31TemperatureProcessor` sollte fuer raw=22.0 nicht processed=0.0 zurueckgeben. Ursache im Processor noch nicht untersucht (ausserhalb dieses Scopes).

### Root Cause B — Scheduler filtert VIRTUAL-Sensoren nicht aus

**Betroffene Datei:**
- `El Servador/god_kaiser_server/src/services/simulation/scheduler.py` (~Zeile 342-381, Methode `_start_sensor_jobs_from_db`)

**Fix (ein-zeilig, sofort umsetzbar):**
```python
# In _start_sensor_jobs_from_db(), nach sensor_type = sensor_config.get("sensor_type", "GENERIC"):
if sensor_config.get("interface_type") == "VIRTUAL":
    logger.debug(f"[{esp_id}] Skipping VIRTUAL sensor {sensor_type} on GPIO {gpio}")
    continue
```

### Prioritaetsreihenfolge

| # | Bug | Datei | Aufwand | Impact |
|---|-----|-------|---------|--------|
| 1 | Bug B: VIRTUAL-Filter in Scheduler | scheduler.py | ~2 Zeilen | Stoppt VPD=0 fuer MOCK_T18V6LOGIC |
| 2 | Bug A Guard: quality-Check in VPD-Hook | sensor_handler.py | ~3 Zeilen | Verhindert falsche VPD bei Pi-Enhanced-Fehler |
| 3 | Pi-Enhanced Processor debuggen | pi_enhanced/ SHT31Processor | Offen | Eigentliche Ursache fuer processed=0.0 |
| 4 | Duplikat sht31_temp Configs MOCK_24557EC6 | DB-Cleanup | Datenkorrektur | Konsistenz sicherstellen |
