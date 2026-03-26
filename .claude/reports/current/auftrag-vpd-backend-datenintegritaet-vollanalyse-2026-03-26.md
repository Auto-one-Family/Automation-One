# VPD-Backend-Datenintegritaet — Vollanalyse und Fixes

> **Typ:** Analyse + Bugfix (Backend — 3 offene Problembereiche + DB-Cleanup)
> **Erstellt:** 2026-03-26 | **Ueberarbeitet:** 2026-03-26 (Verifikation gegen Live-Code)
> **Prioritaet:** CRITICAL
> **Geschaetzter Aufwand:** ~2-3h (Analyse + Fixes + DB-Cleanup + Verifikation)
> **Abhaengigkeit:** Keine
> **Betroffene Schicht:** El Servador (Backend)

---

## Ueberblick

Drei Debug-Reports (DB Inspector, Server Debug, Frontend Debug) haben urspruenglich 5 Backend-VPD-Probleme identifiziert. Nach Verifikation gegen den aktuellen Code-Stand sind **2 davon bereits geloest**:

| # | Problem | Status |
|---|---------|--------|
| ~~P4~~ | ~~VPD-Broadcast sendet UUID statt device_id~~ | **BEREITS GEFIXT** — `sensor_handler.py:697` nutzt bereits `esp_device.device_id` |
| ~~P5~~ | ~~Sensor-Duplikate (NULL-in-UNIQUE)~~ | **BEREITS GEFIXT** — COALESCE-Index (Migration existiert), `create_if_not_exists()` aktiv, `i2c_address` via Registry aufgeloest |

**Verbleibende 3 offene Probleme:**

| # | Problem | Schwere |
|---|---------|---------|
| P1 | Scheduler erzeugt VPD=0 (VIRTUAL nicht gefiltert) | CRITICAL |
| P2 | Pi-Enhanced Processor gibt processed=0.0 zurueck | HIGH |
| P3 | VPD-Hook prueft quality nicht vor Berechnung | HIGH |

---

## Vorbedingungen (VOR Beginn pruefen)

Bevor die Fixes implementiert werden, diese beiden Checks ausfuehren:

```sql
-- 1. Existieren noch VPD-Duplikat-Rows in sensor_configs?
-- (P5-Migration sollte neue verhindert haben, aber alte koennten noch da sein)
SELECT esp_id, gpio, sensor_type, COUNT(*) as cnt
FROM sensor_configs
WHERE sensor_type = 'vpd'
GROUP BY esp_id, gpio, sensor_type
HAVING COUNT(*) > 1;

-- 2. Wie viele VPD=0 Rows existieren noch in sensor_data?
-- (Fuer DB-Cleanup am Ende relevant)
SELECT COUNT(*) as vpd_zero_count
FROM sensor_data
WHERE sensor_type = 'vpd'
  AND raw_value = 0.0
  AND sensor_metadata::text LIKE '%raw_mode%';
```

Falls Check 1 Duplikate findet: Aeltere Row pro Gruppe loeschen (`sensor_data`-FK ist SET NULL, also sicher).

---

## Systemkontext: Wie VPD in AutomationOne funktioniert

### VPD-Daten-Pipeline (korrekte Version)

VPD (Vapor Pressure Deficit) ist ein berechneter Wert, KEIN physischer Sensor. Die korrekte Pipeline:

```
SHT31 (I2C, gpio=0, i2c=0x44) sendet via MQTT
    -> sensor_handler.py empfaengt
    -> expand_multi_value() splittet in sht31_temp + sht31_humidity
    -> Beide werden als sensor_data-Rows gespeichert
    -> Nach jedem Save: _try_compute_vpd() Hook (Zeile 501)
    -> vpd_calculator.py: Magnus-Tetens-Formel (SVP = 0.6108 * exp(17.27*T/(T+237.3)))
    -> VPD = SVP - (SVP * RH/100)
    -> Ergebnis wird als sensor_data-Row gespeichert:
       sensor_type='vpd', processing_mode='computed', interface_type='VIRTUAL'
    -> WebSocket-Broadcast an Frontend (Zeile 697, device_id korrekt)
```

### Kritische Architektur-Fakten

1. **simulation_config:** JSON-Feld in `esp_devices.device_metadata`. Enthaelt Sensor-Konfigurationen fuer den Simulator/Scheduler. Wird von `rebuild_simulation_config()` in `esp_repo.py` (Zeile 855) aus `sensor_configs` aufgebaut.

2. **SHT31 Multi-Value:** `MULTI_VALUE_SENSORS` Map in `sensor_type_registry.py` (Zeile 88) definiert `sht31 -> [sht31_temp, sht31_humidity]`. `_try_compute_vpd()` wird nach JEDEM Sub-Type-Save aufgerufen — also zweimal pro SHT31-Messzyklus.

3. **VPD-Config-Erstellung:** Nutzt bereits `create_if_not_exists()` aus `sensor_repo.py:45` (Zeile 669 in sensor_handler.py). Duplikat-Schutz durch COALESCE-UNIQUE-Index ist aktiv.

4. **Quality-Variable in sensor_handler.py:** Wird initial bei Zeile 249 gesetzt. Bei Pi-Enhanced-Verarbeitung kann sie bei Zeile 282 (success) oder Zeile 300 (failure) ueberschrieben werden. Der fuer P3 relevante Bug-Flow ist: Pi-Enhanced antwortet mit `processed_value=0.0, quality="error"` → Zeile 282 setzt `quality = pi_result.quality` = `"error"` → VPD-Hook bei Zeile 501 nutzt diesen Wert OHNE quality-Check.

---

## P1: Scheduler erzeugt VPD=0 (CRITICAL)

### IST-Zustand

Der Simulation-Scheduler in `services/simulation/scheduler.py` erstellt regulaere Sensor-Jobs fuer ALLE Eintraege in `simulation_config.sensors` — inklusive VPD-Sensoren mit `interface_type=VIRTUAL`. Die Methode `_start_sensor_jobs_from_db()` (Zeile 315) iteriert ueber alle Sensor-Eintraege ohne Filterung auf `interface_type`.

Wenn der VPD-Eintrag in `simulation_config.sensors` kein `base_value`-Feld hat (nur `raw_value` ist gesetzt), faellt `_calculate_sensor_value()` (Zeile 886, der relevante Fallback ist bei Zeile 911: `base_value = sensor_config.get("base_value", 0.0)`) auf 0.0 zurueck. Das Ergebnis: VPD=0 wird via MQTT published, von `sensor_handler.py` als gueltiger Rohdatenpunkt akzeptiert, und in `sensor_data` gespeichert mit `processing_mode='raw'`, `sensor_metadata={"raw_mode": true}`.

**Beweis aus der DB:**
- 519 VPD-Eintraege gesamt, davon 92 mit `raw_value=0.0` (17.7%)
- Alle 92 Null-Werte haben `processing_mode='raw'` und `sensor_metadata={"raw_mode": true}`
- Die korrekten VPD-Werte haben `processing_mode='computed'` und `sensor_metadata={"source_temp_type": ..., "source_rh_type": ...}`
- Zeitreihe zeigt: VPD=0 erscheint zeitlich VOR oder getrennt von SHT31-Daten (anderer Codepfad)

**Beweis aus simulation_config:**
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

**Sekundaereffekt:** Der Scheduler ueberschreibt auch `sensor_configs.sensor_metadata.latest_value` mit 0.0. Dadurch liefert die REST-API fuer den VPD-Sensor `latest_value=0.0` statt den korrekten berechneten Wert.

### SOLL-Zustand

VIRTUAL-Sensoren (VPD und zukuenftige berechnete Sensoren) duerfen NIEMALS vom Scheduler als regulaere Sensor-Jobs behandelt werden. Sie werden ausschliesslich event-driven berechnet (z.B. VPD nach SHT31-Messung).

### Fix-Strategie (3 Ebenen — alle umsetzen, Reihenfolge beachten)

Die Reihenfolge ist wichtig: Ebene 3 (Quelle) zuerst, dann Ebene 1 (Registry), dann Ebene 2 (Guard). Wenn VIRTUAL-Sensoren gar nicht erst in `simulation_config` landen, braucht der Scheduler sie nicht zu filtern. Ebene 1+2 sind defense-in-depth.

**Ebene 3 — rebuild_simulation_config (Quelle, ZUERST):**

In `esp_repo.py`, `rebuild_simulation_config()` (Zeile 855), beim Iterieren der `sensor_configs`:
```python
if cfg.interface_type and cfg.interface_type.upper() == "VIRTUAL":
    continue  # Virtual sensors are event-driven, never scheduled
```

Dies verhindert, dass VPD-Eintraege ueberhaupt in `simulation_config.sensors` landen. Existierende VPD-Eintraege in `simulation_config` werden beim naechsten `rebuild_simulation_config()`-Aufruf entfernt.

**Ebene 1 — Registry (Infrastruktur):**

In `sensor_type_registry.py` ein neues Set definieren:
```python
VIRTUAL_SENSOR_TYPES: set[str] = {"vpd"}
# Berechnete Sensoren, die NIEMALS vom Scheduler als Job behandelt werden.
# Werden ausschliesslich event-driven erzeugt (z.B. VPD nach SHT31-Messung).
```

**Ebene 2 — Scheduler (Guard, defense-in-depth):**

In `_start_sensor_jobs_from_db()` (Zeile 315), nach der `sensor_type`-Extraktion:
```python
from src.sensors.sensor_type_registry import VIRTUAL_SENSOR_TYPES

if sensor_type.lower() in VIRTUAL_SENSOR_TYPES:
    logger.debug(f"[{esp_id}] Skipping VIRTUAL sensor {sensor_type} on GPIO {gpio}")
    continue
```

Gleicher Guard in `add_sensor_job()` (Zeile 552).

---

## P2: Pi-Enhanced Processor gibt processed=0.0 zurueck (HIGH)

### IST-Zustand

Fuer `MOCK_24557EC6` hat der SHT31-Sensor auf `gpio=0, i2c_address=68` die Option `pi_enhanced=True` in `sensor_configs`. Der `SHT31TemperatureProcessor` wird aufgerufen, empfaengt `raw=22.0`, gibt aber `processed_value=0.0, quality=error` zurueck.

**Log-Evidenz:**
```
[Pi-Enhanced] SUCCESS: esp_id=MOCK_24557EC6, gpio=0, sensor_type='sht31_temp'
  raw=22.0 -> processed=0.0 C, quality=error
```

Der VPD-Hook `_try_compute_vpd()` verwendet dann `processed_value=0.0` als Temperatur-Eingabe und berechnet VPD(T=0.0degC, RH=55%) = 0.2749 kPa — mathematisch korrekt fuer T=0, aber physikalisch falsch weil die Temperatur tatsaechlich 22 Grad ist.

**Bug-Flow im Detail:**
1. Pi-Enhanced Processor antwortet mit `{processed_value: 0.0, quality: "error"}`
2. sensor_handler.py Zeile 280: `pi_result` ist nicht None (Processor gab Ergebnis zurueck)
3. Zeile 282: `processed_value = pi_result.processed_value` → 0.0
4. Zeile 282: `quality = pi_result.quality` → "error"
5. Zeile 501: VPD-Hook-Bedingung `sensor_type in ("sht31_temp", ...)` → True
6. `_try_compute_vpd(trigger_value=processed_value=0.0)` wird aufgerufen → VPD mit T=0 berechnet

**Nebenbefund:** Es gibt fuer `MOCK_24557EC6` auf `gpio=0` eventuell noch doppelte SHT31-Configs (i2c=68 und i2c=69). Pruefen ob die P5-Migration diese bereits bereinigt hat.

### SOLL-Zustand

1. Der Pi-Enhanced Processor muss fuer `raw=22.0` den Wert `processed=22.0` (oder einen korrekt verarbeiteten Wert nahe 22.0) mit `quality=good` zurueckgeben.
2. Falls ein Pi-Enhanced Processor einen Fehler zurueckgibt (quality=error), darf der VPD-Hook diesen fehlerhaften Wert NICHT fuer die VPD-Berechnung verwenden (siehe P3).

### Analyse-Schritte

1. Den `SHT31TemperatureProcessor` finden. **Korrekter Pfad:** `src/sensors/sensor_libraries/active/temperature.py` (Klasse beginnt ca. Zeile 392). Das Verzeichnis `services/pi_enhanced/` existiert NICHT.
2. Analysieren WARUM raw=22.0 zu processed=0.0, quality=error fuehrt. Moegliche Ursachen:
   - Kalibrierungs-Koeffizienten fehlen oder sind falsch initialisiert
   - Mock-Device hat keine echten Kalibrierungsdaten → Processor faellt auf Default=0 zurueck
   - Off-by-one in der Berechnung
   - Division durch Null oder unerwarteter Typ
3. Pruefen ob der Processor fuer Mock-Devices ueberhaupt sinnvoll ist. Mock-Devices liefern bereits simulierte Werte — Pi-Enhanced Verarbeitung ist fuer echte Rohdaten gedacht, die kalibriert oder korrigiert werden muessen. Bei Mocks ist das kontraproduktiv.

### Fix-Strategie

**Fix A (Guard im VPD-Hook — sofort, siehe P3):**
Quality-Check vor VPD-Berechnung verhindert, dass fehlerhafte Pi-Enhanced-Ergebnisse zu falschen VPD-Werten fuehren. Das ist der sofortige Schutz, unabhaengig davon ob P2 selbst geloest wird.

**Fix B (Kern-Fix im Pi-Enhanced Processor):** Je nach Root Cause:
- Falls Kalibrierungsdaten fehlen: Sinnvolle Defaults setzen ODER Pi-Enhanced fuer nicht-kalibrierte Sensoren ueberspringen (Passthrough: `processed = raw, quality = "good"`)
- Falls Mock-spezifisch: Pi-Enhanced Processing fuer Mock-Devices generell deaktivieren — Mock-Werte sind bereits "verarbeitet", Pi-Enhanced macht bei Simulationsdaten keinen Sinn

**Fix C (DB-Cleanup):** Falls noch doppelte SHT31-Configs fuer MOCK_24557EC6 existieren (Vorbedingung-Check 1), die aeltere Row pro Gruppe loeschen.

---

## P3: VPD-Hook prueft quality nicht vor Berechnung (HIGH)

### IST-Zustand

In `sensor_handler.py` (Zeile 501) ist die VPD-Hook-Bedingung:

```python
if sensor_type in ("sht31_temp", "sht31_humidity"):
    await self._try_compute_vpd(...)
```

Der `trigger_value` wird als `processed_value` uebergeben (falls Pi-Enhanced aktiv, sonst `raw_value`). Es gibt KEINE Pruefung ob `quality == "error"`. Wenn der Pi-Enhanced Processor `processed=0.0, quality=error` zurueckgibt (P2-Szenario), wird der fehlerhafte Wert direkt fuer die VPD-Berechnung verwendet.

**Wie quality an diese Stelle kommt:**
Die Variable `quality` wird bei Zeile 249 initial gesetzt. Bei Pi-Enhanced-Verarbeitung wird sie bei Zeile 282 ueberschrieben: `quality = pi_result.quality`. Im P2-Szenario ist `pi_result.quality = "error"` — das ist der Wert der bei Zeile 501 anliegt. Dies ist NICHT der else-Branch (Zeile 300) der greift wenn Pi-Enhanced NICHT aktiv ist.

### SOLL-Zustand

Die VPD-Berechnung darf NUR mit Werten ausgefuehrt werden, deren quality NICHT "error" ist. Valide quality-Werte fuer VPD-Berechnung sind: "good", "fair", "calibrated". Bei "error", "unknown" oder fehlender quality soll der VPD-Hook abbrechen und loggen warum.

### Fix

An der Aufrufstelle von `_try_compute_vpd()` (Zeile 501):

```python
if sensor_type in ("sht31_temp", "sht31_humidity"):
    if quality == "error":
        logger.warning(
            f"Skipping VPD computation: {sensor_type} quality=error "
            f"(esp={esp_id}, gpio={gpio}, value={trigger_value})"
        )
    else:
        await self._try_compute_vpd(...)
```

**Die `quality`-Variable ist an dieser Stelle verfuegbar** — sie wird bei Zeile 249 gesetzt und ggf. bei Zeile 282 (Pi-Enhanced success) oder Zeile 300 (Pi-Enhanced nicht aktiv) ueberschrieben. In beiden Faellen ist sie vor Zeile 501 definiert.

---

## DB-Cleanup nach allen Fixes

Nach Implementierung der Fixes muessen die historischen Fehlerdaten bereinigt werden:

```sql
-- 1. VPD=0 Rows loeschen (vom Scheduler erzeugt)
-- Zuerst Anzahl pruefen:
SELECT COUNT(*) FROM sensor_data
WHERE sensor_type = 'vpd'
  AND raw_value = 0.0
  AND sensor_metadata::text LIKE '%raw_mode%';
-- Erwartung: ~92 Rows (Stand Debug-Report)

-- Dann loeschen:
DELETE FROM sensor_data
WHERE sensor_type = 'vpd'
  AND raw_value = 0.0
  AND sensor_metadata::text LIKE '%raw_mode%';

-- 2. sensor_metadata.latest_value fuer VPD-Sensoren
-- KEIN manueller Fix noetig — nach dem Scheduler-Fix (P1) wird der naechste
-- korrekte VPD-Compute den latest_value automatisch aktualisieren.

-- 3. VPD mit falschem Temperatur-Input (P2, T=0 statt T=22)
-- Nur relevant fuer MOCK_24557EC6, nur wenn P2 gefixt wird:
SELECT COUNT(*), MIN(raw_value), MAX(raw_value)
FROM sensor_data
WHERE sensor_type = 'vpd'
  AND device_id = (SELECT id FROM esp_devices WHERE device_id = 'MOCK_24557EC6')
  AND raw_value BETWEEN 0.27 AND 0.28;
-- Falls Rows vorhanden und P2 gefixt: loeschen, da mit falschem T=0 berechnet.
```

---

## Reihenfolge der Fixes

| Schritt | Problem | Aktion | Aufwand |
|---------|---------|--------|---------|
| 1 | P1 Ebene 3 | `rebuild_simulation_config()` VIRTUAL-Filter | ~5min |
| 2 | P1 Ebene 1 | `VIRTUAL_SENSOR_TYPES` Set in Registry | ~5min |
| 3 | P1 Ebene 2 | Guards in `_start_sensor_jobs_from_db()` + `add_sensor_job()` | ~10min |
| 4 | P3 | Quality-Guard vor `_try_compute_vpd()` | ~10min |
| 5 | P2 | Pi-Enhanced Processor analysieren und fixen | ~1-2h |
| 6 | — | DB-Cleanup (VPD=0 Rows + ggf. falsche VPD-Werte) | ~15min |
| 7 | — | Verifikation (Server-Logs, DB-Queries, Frontend pruefen) | ~30min |

P1 und P3 sind schnelle Guards (je wenige Zeilen Code). P2 erfordert die tiefste Analyse.

---

## Relevante Dateien

| Bereich | Datei | Pfad im auto-one Repo |
|---------|-------|----------------------|
| Scheduler | `scheduler.py` | `El Servador/god_kaiser_server/src/services/simulation/scheduler.py` |
| — `_start_sensor_jobs_from_db()` | Zeile 315 | |
| — `add_sensor_job()` | Zeile 552 | |
| — `_calculate_sensor_value()` | Zeile 886 (base_value-Fallback bei Zeile 911) | |
| VPD-Hook | `sensor_handler.py` | `El Servador/god_kaiser_server/src/mqtt/handlers/sensor_handler.py` |
| — `_try_compute_vpd()` Aufruf | Zeile 501 | |
| — VPD-Config via `create_if_not_exists()` | Zeile 669 | |
| — VPD-Broadcast (bereits korrekt) | Zeile 697, Broadcast Zeile 716-732 | |
| — `quality` initial gesetzt | Zeile 249 | |
| — `quality` Pi-Enhanced-Ueberschreibung | Zeile 282 (success) / 300 (nicht aktiv) | |
| VPD-Formel | `vpd_calculator.py` | `El Servador/god_kaiser_server/src/services/vpd_calculator.py` |
| Sensor-Registry | `sensor_type_registry.py` | `El Servador/god_kaiser_server/src/sensors/sensor_type_registry.py` |
| — `MULTI_VALUE_SENSORS` | Zeile 88 | |
| Rebuild Config | `esp_repo.py` | `El Servador/god_kaiser_server/src/db/repositories/esp_repo.py` |
| — `rebuild_simulation_config()` | Zeile 855 | |
| **Pi-Enhanced Processor** | `temperature.py` | `El Servador/god_kaiser_server/src/sensors/sensor_libraries/active/temperature.py` |
| — `SHT31TemperatureProcessor` | ca. Zeile 392 | |
| Mock-Erstellung | `debug.py` | `El Servador/god_kaiser_server/src/api/v1/debug.py` |
| — SHT31-Config-Block | Zeile 305-323 | |
| Mock-Simulation | `scheduler.py` | (gleiche Datei wie oben) |
| — SHT31-Config-Block | Zeile 1224-1238 | |

---

## Was NICHT geaendert werden darf

- `vpd_calculator.py` — Die Magnus-Tetens-Formel ist mathematisch korrekt.
- `expand_multi_value()` — Der SHT31-Split-Mechanismus funktioniert korrekt.
- Bestehende `sensor_data`-Rows mit `processing_mode='computed'` — Das sind die KORREKTEN VPD-Werte.
- Die VPD-Broadcast-Logik (Zeile 697, 716-732) — **BEREITS KORREKT**, nutzt `esp_device.device_id`.
- Die `sensor_configs` UNIQUE-Constraint-Logik — **BEREITS KORREKT** (COALESCE-Index + `create_if_not_exists()`).
- `sensor_repo.py:create_if_not_exists()` — **BEREITS KORREKT**, wird fuer VPD-Config-Erstellung genutzt.
- Die regulaere Sensor-Broadcast-Logik (ca. Zeile 479 in sensor_handler.py) — funktioniert korrekt.

---

## Akzeptanzkriterien

### P1 — Scheduler VIRTUAL-Filter
- [ ] `VIRTUAL_SENSOR_TYPES` Set in `sensor_type_registry.py` definiert mit mindestens `{"vpd"}`
- [ ] `rebuild_simulation_config()` schliesst Sensoren mit `interface_type='VIRTUAL'` aus
- [ ] `_start_sensor_jobs_from_db()` ueberspringt Sensoren deren `sensor_type` in `VIRTUAL_SENSOR_TYPES` ist
- [ ] `add_sensor_job()` hat den gleichen Guard
- [ ] Kein Scheduler-Job fuer `vpd` laeuft (pruefbar via APScheduler Job-Liste oder Logs)
- [ ] `sensor_configs.sensor_metadata.latest_value` fuer VPD-Sensoren wird nicht mehr vom Scheduler ueberschrieben

### P2 — Pi-Enhanced Processor
- [ ] Root Cause identifiziert und dokumentiert (warum raw=22.0 -> processed=0.0 in `SHT31TemperatureProcessor`)
- [ ] Fix implementiert: Processor gibt fuer raw=22.0 einen korrekten processed-Wert zurueck
- [ ] ODER: Pi-Enhanced wird fuer Mock-Devices deaktiviert (falls Processor nur fuer echte Kalibrierungsdaten sinnvoll ist)

### P3 — Quality-Guard
- [ ] VPD-Hook in `sensor_handler.py` (Zeile 501) prueft `quality` vor Berechnung
- [ ] Bei `quality="error"`: VPD wird NICHT berechnet, Warning geloggt
- [ ] Valide qualities fuer VPD: "good", "fair", "calibrated"

### DB-Cleanup
- [ ] Alle VPD=0 Rows mit `sensor_metadata` containing `raw_mode` geloescht
- [ ] Falls P2 gefixt: Falsche VPD-Werte fuer MOCK_24557EC6 (berechnet mit T=0) geloescht
- [ ] `sensor_configs.sensor_metadata.latest_value` fuer VPD-Sensoren zeigt korrekten berechneten Wert (automatisch nach P1-Fix)

### Keine Regression
- [ ] Andere Sensor-Typen (sht31_temp, sht31_humidity, DS18B20 etc.) funktionieren unveraendert
- [ ] Regulaere Sensor-Broadcasts und Scheduler-Jobs fuer physische Sensoren laufen normal
- [ ] pytest laeuft ohne neue Fehler
