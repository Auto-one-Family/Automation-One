# T09-Fix-B — Backend: API-Absicherung, Mock-Defaults und Daten-Hygiene

**Datum:** 2026-03-08
**Prioritaet:** HOCH
**Schicht:** El Servador (FastAPI + SQLAlchemy + PostgreSQL)
**Bugs:** NB-T09-07, NB-T09-08, NB-T09-02, NB-T09-01, NB-T09-04
**Voraussetzung:** Fix1 (Sensor-Config-Pipeline) ist implementiert
**Referenz:** `.claude/reports/current/T09-verify/T09-verifikation-bericht-2026-03-08.md`

---

> **[VERIFY-PLAN 2026-03-08] KRITISCHER BEFUND:**
> **ALLE 4 primaeren Bugs (NB-T09-07, NB-T09-08, NB-T09-02, NB-T09-01) sind im aktuellen Code BEREITS GEFIXT.**
> Dieser Plan basiert auf einem veralteten Codebase-Snapshot (vor Fix1-Implementierung).
> Einziger offener Punkt: Stats-Endpunkt (sensors.py:1275) gibt bei Multi-Value-Sensoren
> aggregierte Stats ueber alle sensor_types auf demselben GPIO — semantisch falsch, aber kein Crash.
> Bug 5 (NB-T09-04, Delete-404) bleibt offen zur Untersuchung.
> **Empfehlung:** Diesen Auftrag als weitgehend erledigt markieren. Nur Stats-Endpunkt und Delete-404 als Restaufgaben behandeln.

---

## Ueberblick: Das Kernproblem

~~Seit Fix1 erzeugt das Backend korrekt separate `sensor_config`-Eintraege fuer Multi-Value-Sensoren (SHT31 → 2 Eintraege, BMP280 → 2 Eintraege). Die **Erzeugung** funktioniert. Aber mehrere Lese- und Loesch-Operationen sind noch auf das alte Modell "1 GPIO = 1 Sensor" ausgelegt und crashen oder liefern falsche Ergebnisse, wenn mehrere sensor_configs denselben GPIO teilen (alle I2C-Sensoren haben gpio=0 als Fallback).~~

~~Zusaetzlich: Mock-Defaults fuer Humidity sind falsch, und Soft-Delete von Devices hinterlaesst Orphaned sensor_configs die den Health-Check stoeren.~~

**[VERIFY-PLAN] KORREKTUR:** Alle beschriebenen Crash-Szenarien und Hygiene-Probleme sind im aktuellen Code bereits behoben. `get_by_esp_and_gpio()` delegiert crash-sicher an `get_all_by_esp_and_gpio()`, Soft-Delete bereinigt sensor_configs physisch, Health-Check filtert deleted Devices, und Mock-Defaults nutzen per-Subtyp `None`-Delegation. Verbleibende semantische Probleme: Stats-Endpunkt aggregiert ueber alle sensor_types auf einem GPIO.

---

## Bug 1: 500 Internal Server Error — MultipleResultsFound (NB-T09-07) — ~~HOCH~~ BEREITS GEFIXT

> **[VERIFY-PLAN] STATUS: BEREITS GEFIXT** — `get_by_esp_and_gpio()` (sensor_repo.py Zeile 44-64) delegiert seit Fix1 crash-sicher an `get_all_by_esp_and_gpio()` und gibt das erste Ergebnis mit Warning-Log zurueck. Kein `scalar_one_or_none()` mehr.

### IST-Zustand

~~`sensor_repo.py` (ca. Zeile 44–57), Funktion `get_by_esp_and_gpio()`:~~
**[VERIFY-PLAN] KORREKTUR:** Die Funktion steht in sensor_repo.py Zeile 44-64 (nicht 44-57) und ist BEREITS crash-sicher:
```python
# sensor_repo.py Zeile 44-64 (AKTUELLER Code — BEREITS GEFIXT)
async def get_by_esp_and_gpio(self, esp_id: uuid.UUID, gpio: int) -> Optional[SensorConfig]:
    """DEPRECATED: Prefer get_all_by_esp_and_gpio() or get_by_esp_gpio_and_type()"""
    configs = await self.get_all_by_esp_and_gpio(esp_id, gpio)
    if len(configs) > 1:
        logger.warning(
            "Multiple configs for esp=%s gpio=%s: %s. Returning first.",
            esp_id, gpio, [c.sensor_type for c in configs],
        )
    return configs[0] if configs else None
```

~~**Warum das crasht:**~~ **[VERIFY-PLAN] KORREKTUR:** Der Crash existiert NICHT mehr. Die Funktion gibt bei Multi-Value-Sensoren das erste Ergebnis zurueck. Der GPIO-Fallback in `sensors.py` Zeile 132 (`gpio if gpio is not None else 0`) ist eine reine Lese-Konvertierung fuer die Response und verursacht keine Crashes.

**Loki-Nachweis:**
```
2026-03-08 00:11:09 - Unhandled exception: MultipleResultsFound -
  Multiple rows were found when one or none was required
```

**Betroffene Endpunkte:**
- ~~`GET /api/v1/sensors/{esp_id}/{gpio}`~~ — [Korrektur] BEREITS GEFIXT! Nutzt seit Fix1 `get_all_by_esp_and_gpio()` mit sicherem Fallback (sensors.py Zeile 433-445). Crasht NICHT.
- `GET /api/v1/sensors/{esp_id}/{gpio}/stats` (Zeile 1275, nicht 1270) — nutzt `get_by_esp_and_gpio()` → ~~CRASHT~~ **[VERIFY-PLAN] CRASHT NICHT MEHR** (crash-safe Delegation). ABER: Stats werden ueber ALLE sensor_types auf dem GPIO aggregiert — semantisch falsch fuer Multi-Value-Sensoren. **Einziger verbleibender Fix-Bedarf.**
- `get_calibration()` in sensor_repo.py Zeile 585-603 (nicht 593) — nutzt `get_by_esp_and_gpio()` → ~~CRASHT~~ **[VERIFY-PLAN] CRASH-SICHER** (gibt erstes Ergebnis zurueck)
- `sensor_service.py` Zeile 86, 129, 198, 530 — alle nutzen `get_by_esp_and_gpio()` → ~~CRASHEN~~ **[VERIFY-PLAN] CRASH-SICHER** (aber semantisch: gibt bei Multi-Value-GPIO immer erstes Ergebnis)
- `config_handler.py` Zeile 366 — **[VERIFY-PLAN] CRASH-SICHER**
- `gpio_validation_service.py` Zeile 373 — **[VERIFY-PLAN] CRASH-SICHER**
- `sensor_scheduler_service.py` Zeile 377 — **[VERIFY-PLAN] CRASH-SICHER**

### SOLL-Zustand

~~**Option A (empfohlen): get_by_esp_and_gpio() crash-sicher machen**~~

**[VERIFY-PLAN] BEREITS IMPLEMENTIERT.** Der exakt beschriebene Fix steht bereits in sensor_repo.py Zeile 44-64. `get_all_by_esp_and_gpio()` ist in Zeile 66-82 (nicht 59-75), `get_by_esp_gpio_and_type()` in Zeile 84-107 (nicht 77-100).

**Verbleibender SOLL-Zustand:** Stats-Endpunkt (sensors.py Zeile 1275) sollte `sensor_type` als Query-Parameter akzeptieren und an `get_stats()` weiterreichen, damit Multi-Value-Sensoren korrekte per-Typ Stats liefern statt gemischte Aggregation.

**Option B: Neuen Endpunkt per config_id bevorzugen**
Langfristig sollten alle Sensor-Abfragen per `config_id` (UUID) laufen, nicht per GPIO. Ein neuer Endpunkt:
```python
@router.get("/sensors/{esp_id}/config/{config_id}")
async def get_sensor_by_config_id(esp_id: str, config_id: UUID):
    config = await sensor_repo.get_by_id(config_id)
    if not config or config.esp_id != esp_id:
        raise HTTPException(404)
    return config
```

### Betroffene Dateien
1. `god_kaiser_server/src/db/repositories/sensor_repo.py` — Zeile 44-64 (`get_by_esp_and_gpio` — **BEREITS GEFIXT**) + Zeile 585-603 (`get_calibration` — **CRASH-SICHER**)
2. `god_kaiser_server/src/api/v1/sensors.py` — Zeile 132 (gpio-Fallback, nur Lese-Konvertierung, kein Crash) und Zeile 1275 (stats-Endpunkt — **kein Crash, aber semantisch falsch: aggregiert ueber alle sensor_types auf GPIO**)
3. `god_kaiser_server/src/services/sensor_service.py` — Zeile 86, 129, 198, 530 — **ALLE CRASH-SICHER** (aber semantisch: gibt erstes Ergebnis bei Multi-Value)
4. `god_kaiser_server/src/mqtt/handlers/config_handler.py` — Zeile 366 — **CRASH-SICHER**
5. `god_kaiser_server/src/services/gpio_validation_service.py` — Zeile 373 — **CRASH-SICHER**
6. `god_kaiser_server/src/services/sensor_scheduler_service.py` — Zeile 377 — **CRASH-SICHER**

### Akzeptanzkriterien
- [x] ~~`GET /sensors/{esp_id}/0` gibt 200~~ [VERIFY-PLAN: BEREITS GEFIXT]
- [x] `GET /sensors/{esp_id}/0/stats` gibt 200 bei Multi-Value-Sensoren (nicht 500) — [VERIFY-PLAN: CRASH-SICHER durch Delegation, gibt 200]
- [x] Kein `MultipleResultsFound` in den Logs — [VERIFY-PLAN: BEREITS GEFIXT, scalar_one_or_none entfernt]
- [ ] Stats-Endpunkt liefert per-sensor_type Stats statt gemischte Aggregation — **einziger offener Punkt**
- [x] Bestehende Single-Value-Sensor-Abfragen funktionieren weiterhin — [VERIFY-PLAN: unveraendert]
- [x] Alle 8+ Aufrufer von `get_by_esp_and_gpio` sind crash-sicher — [VERIFY-PLAN: BEREITS GEFIXT]

---

## Bug 2: Orphaned sensor_configs nach Soft-Delete (NB-T09-08) — ~~HOCH~~ BEREITS GEFIXT

> **[VERIFY-PLAN] STATUS: KOMPLETT GEFIXT.**
> 1. `delete_mock_device()` (esp_repo.py Zeile 788-799) loescht sensor_configs + actuator_configs PHYSISCH beim Soft-Delete.
> 2. `sensor_health.py` Zeile 227 filtert bereits `device.deleted_at is not None`.
> Beide Fixes sind implementiert — keine Code-Aenderungen noetig.

### IST-Zustand

~~Wenn ein Device soft-deleted wird (`deleted_at` Timestamp gesetzt), bleiben seine sensor_configs in der DB erhalten.~~ **[VERIFY-PLAN] KORREKTUR:** `delete_mock_device()` loescht sensor_configs physisch (Zeile 794-796: `delete(SensorConfig).where(SensorConfig.esp_id == device.id)`). sensor_configs verwaisen NICHT mehr. Der Health-Check filtert zusaetzlich deleted Devices aus.

**DB-Nachweis:**
```sql
SELECT sc.esp_id, COUNT(*)
FROM sensor_configs sc
JOIN esp_devices ed ON sc.esp_id = ed.id
WHERE ed.deleted_at IS NOT NULL
GROUP BY sc.esp_id;
-- Ergebnis: MOCK_3917D1BC = 6, MOCK_4B2668C2 = 3
```

**Server-Log-Nachweis:** Jede Minute 9x:
```
Sensor stale: ESP MOCK_3917D1BC GPIO 0 sensor_type sht31_temp ...
Sensor stale: ESP MOCK_3917D1BC GPIO 0 sensor_type sht31_humidity ...
...
```
Das sind 9 falsche Warnungen pro Minute fuer Devices die gar nicht mehr existieren.

### SOLL-Zustand

~~**Fix 1: Health-Check Job filtern (sofort wirksam)**~~
**[VERIFY-PLAN] BEREITS IMPLEMENTIERT.** sensor_health.py Zeile 227 hat exakt diesen Fix:
```python
# sensor_health.py Zeile 227 (AKTUELLER Code — BEREITS GEFIXT):
if device.status == "offline" or device.deleted_at is not None:
    offline_esp_ids.add(esp_uuid)
```

~~**Fix 2: Cascade-Cleanup bei Soft-Delete (nachhaltig)**~~
**[VERIFY-PLAN] BEREITS IMPLEMENTIERT.** `delete_mock_device()` in esp_repo.py Zeile 771-806 loescht bereits physisch:
```python
# esp_repo.py Zeile 788-799 (AKTUELLER Code — BEREITS GEFIXT):
# Cleanup: Delete sensor_configs and actuator_configs for this device.
from ..models.sensor import SensorConfig
from ..models.actuator import ActuatorConfig

await self.session.execute(
    delete(SensorConfig).where(SensorConfig.esp_id == device.id)
)
await self.session.execute(
    delete(ActuatorConfig).where(ActuatorConfig.esp_id == device.id)
)
```

[Korrektur bestaetig] `sensor_data.esp_id` hat `ondelete="SET NULL"` (sensor.py Zeile 303) — korrekt. `SensorConfig.esp_id` hat `ondelete="CASCADE"` (sensor.py Zeile 62). Historische sensor_data bleiben erhalten.

### Betroffene Dateien
1. `god_kaiser_server/src/services/maintenance/jobs/sensor_health.py` — Zeile 227 — **BEREITS GEFIXT** (`or device.deleted_at is not None` ist da)
2. `god_kaiser_server/src/db/repositories/esp_repo.py` — Zeile 771-806 (nicht 771-793) — **BEREITS GEFIXT** (physischer Delete von sensor_configs + actuator_configs)
3. `god_kaiser_server/src/db/repositories/sensor_repo.py` — `get_enabled()` (Zeile 137-146, nicht 130-139) filtert NICHT nach Device-Status — korrekt, da der Health-Check-Loop dies selbst handhabt

### Akzeptanzkriterien
- [x] Nach Device-Soft-Delete: 0 Stale-Warnungen — **[VERIFY-PLAN] GEFIXT** (sensor_configs werden physisch geloescht + Health-Check filtert deleted Devices)
- [x] Health-Check prueft nur aktive Devices — **[VERIFY-PLAN] GEFIXT** (Zeile 227)
- [x] Bestehende aktive Sensoren korrekt geprueft — **[VERIFY-PLAN] unveraendert**
- [x] `sensor_data` bleibt erhalten — **[VERIFY-PLAN] bestaetig** (SET NULL FK, kein Cascade)

### Sofort-Bereinigung (einmalig)
Nach dem Fix die 9 verwaisten sensor_configs der T09-Test-Devices bereinigen:
```sql
-- Pruefe zuerst:
SELECT sc.id, sc.esp_id, sc.sensor_type, ed.deleted_at
FROM sensor_configs sc
JOIN esp_devices ed ON sc.esp_id = ed.id
WHERE ed.deleted_at IS NOT NULL;

-- Dann loeschen:
DELETE FROM sensor_configs
WHERE esp_id IN (
  SELECT id FROM esp_devices WHERE deleted_at IS NOT NULL
);
```

---

## Bug 3: SHT31 Humidity Mock-Default falsch (NB-T09-02) — ~~MITTEL~~ BEREITS GEFIXT

### IST-Zustand

Wenn ein SHT31-Sensor als Mock erstellt wird, erhalten BEIDE Sub-Typen (sht31_temp + sht31_humidity) denselben `base_value` fuer die Simulation. Die Humidity bekommt `22.0` (oder `20.0`) — den gleichen Wert wie Temperature.

**DB-Nachweis:**
```json
// simulation_config fuer MOCK_A3592B7E:
{
  "cfg_a13fce3c": { "sensor_type": "sht31_temp", "base_value": 20.0, "unit": "°C" },
  "cfg_9e679530": { "sensor_type": "sht31_humidity", "base_value": 20.0, "unit": "%RH" }
  //                                                  ^^^^^^^^^ FALSCH! Sollte 55.0 sein
}
```

**Screenshot-Nachweis (S26):** Monitor zeigt Zone "Naehrloesung" mit "LUFTFEUCHTE 22.0%RH" — physikalisch unplausibel als Default (typische Raumluftfeuchte: 40–60%).

### SOLL-Zustand

[Korrektur] Die `SENSOR_TYPE_MOCK_DEFAULTS`-Tabelle in `sensor_type_registry.py` (Zeile 153-181) hat BEREITS die korrekten Werte! `sht31_humidity` hat `raw_value: 55.0`, `bmp280_pressure` hat `raw_value: 1013.25`, etc. Die Tabelle muss NICHT geaendert werden.

~~**Das eigentliche Problem:**~~ **[VERIFY-PLAN] BEREITS GEFIXT.** Beide Stellen uebergeben bereits `None` fuer Multi-Value Sub-Typen:

**`add_sensor()` (debug.py Zeile 863-867) — AKTUELLER Code:**
```python
# Per-subtype default: pass None so each sub-type gets its own
# plausible default from SENSOR_TYPE_MOCK_DEFAULTS (e.g., temp=22, humidity=55)
resolved_raw = get_mock_default_raw_value(sensor_type, None)
```

**`create_mock_esp()` (debug.py Zeile 296-299) — AKTUELLER Code:**
```python
# Per-subtype default for multi-value sensors (e.g., temp=22, humidity=55)
raw_for_default = None if is_multi_value else orig_sensor.raw_value
resolved_raw = get_mock_default_raw_value(sensor_type, raw_for_default)
```

**Hinweis:** Bereits BESTEHENDE Mock-Devices in der DB haben moeglicherweise noch die alten falschen Werte (z.B. humidity=20.0 statt 55.0). Beim naechsten `rebuild_simulation_config()` oder Neu-Erstellen werden die korrekten Defaults gezogen. Bestehende fehlerhafte DB-Eintraege koennen manuell oder per Migration korrigiert werden.

### Betroffene Dateien
1. `god_kaiser_server/src/sensors/sensor_type_registry.py` — Defaults-Tabelle ist KORREKT (Zeile 153-181), NICHT aendern
2. `god_kaiser_server/src/api/v1/debug.py` — **BEREITS GEFIXT**: Zeile 867 (`add_sensor`) und Zeile 298-299 (`create_mock_esp`) nutzen `None` fuer Multi-Value Sub-Typen

### Akzeptanzkriterien
- [x] Neuer SHT31-Mock: sht31_temp `base_value = 22.0`, sht31_humidity `base_value = 55.0` — **[VERIFY-PLAN] GEFIXT**
- [x] Neuer BMP280-Mock: bmp280_temp `base_value = 22.0`, bmp280_pressure `base_value = 1013.25` — **[VERIFY-PLAN] GEFIXT**
- [x] Neuer BME280-Mock: 3 verschiedene Defaults (22.0 / 55.0 / 1013.25) — **[VERIFY-PLAN] GEFIXT**
- [ ] Bestehende Mocks in DB: moeglicherweise noch alte fehlerhafte Werte — **manuelle Bereinigung oder Neuerstellen noetig**
- [x] DS18B20 und andere Single-Value-Sensoren: Defaults unveraendert — **[VERIFY-PLAN] unveraendert**

---

## Bug 4: API POST fuer zweiten SHT31 liefert jobs_started:0 (NB-T09-01) — ~~MITTEL-HOCH~~ BEREITS GEFIXT

> **[VERIFY-PLAN] STATUS: BEREITS GEFIXT.** Alle 3 Stellen nutzen I2C-aware Duplicate-Check.

### IST-Zustand

~~Der Debug-Endpunkt `POST /debug/mock-esp/{id}/sensors` gibt bei einem zweiten SHT31 (0x45, waehrend 0x44 bereits existiert) zurueck: `jobs_started: 0`~~

**[VERIFY-PLAN] KORREKTUR:** Der Duplicate-Check in `add_sensor()` (debug.py Zeile 870-878) ist BEREITS I2C-aware:
```python
# debug.py Zeile 870-878 (AKTUELLER Code — BEREITS GEFIXT):
i2c_addr = getattr(config, "i2c_address", None)
if i2c_addr is not None:
    existing = await sensor_repo.get_by_esp_gpio_type_and_i2c(
        device.id, config.gpio, sensor_type, i2c_addr
    )
else:
    existing = await sensor_repo.get_by_esp_gpio_and_type(
        device.id, config.gpio, sensor_type
    )
```

`sensors.py` `create_or_update_sensor()` (Zeile 549-556) hat denselben I2C-aware Check:
```python
# sensors.py Zeile 549-556 (AKTUELLER Code — BEREITS GEFIXT):
if request.i2c_address is not None:
    existing_vt = await sensor_repo.get_by_esp_gpio_type_and_i2c(
        esp_device.id, gpio, value_type, request.i2c_address
    )
else:
    existing_vt = await sensor_repo.get_by_esp_gpio_and_type(
        esp_device.id, gpio, value_type
    )
```

**`get_by_esp_gpio_type_and_i2c()`** steht in sensor_repo.py Zeile 876-914 (nicht 869-907).

### Betroffene Dateien
1. `god_kaiser_server/src/api/v1/debug.py` — Zeile 870-878 (`add_sensor`) — **BEREITS GEFIXT**
2. `god_kaiser_server/src/api/v1/sensors.py` — Zeile 549-556 (`create_or_update_sensor`) — **BEREITS GEFIXT**

### Akzeptanzkriterien
- [x] `POST /debug/mock-esp/{id}/sensors` mit SHT31 0x45 (wenn 0x44 existiert): `jobs_started: 2` — **[VERIFY-PLAN] GEFIXT**
- [x] DB zeigt 4 sensor_configs (2x 0x44 + 2x 0x45) — **[VERIFY-PLAN] GEFIXT**
- [x] Gleicher SHT31 nochmal (0x44 nochmal): `jobs_started: 0` (korrekt abgelehnt) — **[VERIFY-PLAN] GEFIXT**

---

## Bug 5: Device-Delete gibt 404 trotz existierendem Device (NB-T09-04) — NIEDRIG

### IST-Zustand

`DELETE /debug/mock-esp/{id}` gibt 404 zurueck, obwohl das Device in der DB existiert (nur mit `deleted_at` als NULL). Das Frontend kompensiert mit einem zweiten API-Call. Console zeigt 3–6 Error-Logs waehrend des Loeschvorgangs.

### Warum
[Korrektur] Die Code-Analyse zeigt dass der DELETE-Endpunkt (debug.py Zeile 482-516) korrekt implementiert ist:
1. `get_mock_device(esp_id)` filtert `hardware_type == "MOCK_ESP32"` UND `deleted_at IS NULL` — das ist RICHTIG fuer nicht-geloeschte Devices
2. `delete_mock_device()` (esp_repo.py Zeile 771-793) setzt `deleted_at` + `status = "deleted"`
3. Der Endpunkt gibt 204 zurueck (status_code in der Route-Deko)

**Moegliche Ursachen fuer das beobachtete 404:**
- Das Device wurde bereits soft-deleted (z.B. durch einen vorherigen Call)
- Der `esp_id` Parameter stimmt nicht mit `device_id` in der DB ueberein (Format-Problem)
- Race Condition: Frontend sendet DELETE mehrfach

**Empfehlung:** Diesen Bug mit Debug-Logging verifizieren bevor Code geaendert wird. Die 3-6 Error-Logs in der Console koennten vom Frontend stammen (z.B. WebSocket-Disconnect-Events beim Loeschen).

### Betroffene Dateien
1. `god_kaiser_server/src/api/v1/debug.py` — Zeile 482-516 (DELETE-Endpunkt, Code sieht korrekt aus)
2. Ggf. Frontend-seitig: `El Frontend/src/api/esp.ts` — DELETE-Call pruefen

### Akzeptanzkriterien
- [ ] `DELETE /debug/mock-esp/{id}` gibt 200/204 bei existierendem Device
- [ ] Erneuter DELETE auf gleiches Device: 404 (bereits geloescht)
- [ ] Keine Error-Logs in Console beim normalen Loeschvorgang

---

## Fix-Reihenfolge (empfohlen)

**[VERIFY-PLAN] AKTUALISIERTE Reihenfolge:**
```
1. NB-T09-07 (500 Error)          ← BEREITS GEFIXT ✓
2. NB-T09-08 (Orphaned Configs)   ← BEREITS GEFIXT ✓
3. NB-T09-02 (Humidity Default)   ← BEREITS GEFIXT ✓ (bestehende DB-Eintraege ggf. manuell korrigieren)
4. NB-T09-01 (Debug-API)          ← BEREITS GEFIXT ✓
5. NB-T09-04 (Delete-404)         ← OFFEN — mit Debug-Logging verifizieren
6. Stats-Endpunkt Semantik        ← OFFEN — per-sensor_type Stats fuer Multi-Value
```

~~Bug 1 und 2 sind die dringendsten.~~ **[VERIFY-PLAN]** Nur Bug 5 (Delete-404) und der Stats-Endpunkt (semantische Korrektheit) sind noch offen.

---

## Was NICHT gemacht wird

- **Frontend-Aenderungen** — das ist Auftrag T09-Fix-A (separater Auftrag)
- **Neue Sensor-Typen** — nur bestehende Defaults korrigieren
- **sensor_data Migration** — historische Daten bleiben unberuehrt
- **MQTT-Topic-Aenderungen** — Topic-Struktur ist korrekt
- **Firmware-Aenderungen** — El Trabajante ist nicht betroffen
- **Neue REST-Endpunkte** (ausser ggf. `/sensors/{esp_id}/config/{config_id}` als Bonus)

---

## Testplan

**[VERIFY-PLAN] Testplan dient als REGRESSIONSTEST** — alle Fixes sind implementiert, Tests verifizieren Korrektheit:

1. Mock-ESP erstellen
2. SHT31 hinzufuegen (0x44) → DB: 2 configs, simulation_config: temp=22.0, humidity=55.0
3. `GET /sensors/{esp_id}/0` → 200 (Regressionstest)
4. `GET /sensors/{esp_id}/0/stats` → 200 (Regressionstest — kein Crash, ggf. gemischte Stats)
5. Zweiten SHT31 hinzufuegen (0x45) ueber Debug-API → `jobs_started: 2` (Regressionstest)
6. `GET /sensors/{esp_id}/0` → 200 mit 4 Sensoren
7. Device soft-deleten → `DELETE` gibt 204
8. Health-Check 1 Minute laufen lassen → 0 Stale-Warnungen fuer geloeschtes Device
9. DB pruefen: sensor_configs fuer geloeschtes Device physisch geloescht
10. Loki pruefen: Kein `MultipleResultsFound`, keine Orphaned-Stale-Warnungen
11. pytest: `cd "El Servador/god_kaiser_server" && pytest --tb=short -q` — alle Tests gruen
