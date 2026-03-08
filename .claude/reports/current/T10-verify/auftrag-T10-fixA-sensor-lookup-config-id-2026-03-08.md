# Auftrag T10-Fix-A: Backend Sensor-Lookup per config_id statt (gpio, sensor_type)

> **Bezug:** T10-Verifikationsbericht Phase 4, 8, 11 — NB-T10-02, NB-T10-03, NB-T09-07 REGRESSION
> **Prioritaet:** HOCH — ~~blockiert~~ [KORREKTUR: kein 500-Crash mehr, aber Silent-Data-Corruption bei Multi-Value-Sensor-Updates]
> **Bereich:** El Servador (Backend) — sensor_service.py (HAUPTZIEL), sensors.py (API), sensor_scheduler_service.py, config_handler.py, sensor_repo.py
> **Datum:** 2026-03-08

---

## Problem (IST)

### Bug NB-T10-02: GET /api/v1/sensors/{device_id}/{gpio} ~~gibt 500~~ gibt FALSCHEN Sensor

> **[KORREKTUR verify-plan]:** Der 500-Crash wurde BEREITS gefixt.
> `get_by_esp_and_gpio()` gibt jetzt `configs[0]` mit Warning zurueck.
> Der GET-Endpoint (sensors.py:391) nutzt sogar `get_all_by_esp_and_gpio()` + `?sensor_type=`.
> **Verbleibendes Problem:** Ohne `?sensor_type=` wird der ERSTE Sensor zurueckgegeben —
> das kann der falsche sein (z.B. sht31_humidity statt sht31_temp).

### Bug NB-T10-03: POST /api/v1/sensors/{device_id}/{gpio} ~~gibt 500~~ aktualisiert FALSCHEN Sensor

> **[KORREKTUR verify-plan]:** Kein 500-Crash mehr, aber Silent-Data-Corruption:
> `sensor_service.py:129` ruft `get_by_esp_and_gpio()` auf und aktualisiert den
> ERSTEN Treffer. Bei 4 SHT31-Sensoren auf GPIO 0 wird immer derselbe aktualisiert.

### Bug NB-T09-07 REGRESSION: ~~150x MultipleResultsFound~~ BEREITS BEHOBEN

> **[KORREKTUR verify-plan]:** Der Health-Check (`sensor_health.py`) nutzt
> `get_latest_readings_batch_by_config()` mit (esp_id, gpio, sensor_type) Keys.
> Er ruft `get_by_esp_and_gpio()` NICHT auf. Kein Crash, kein falsches Ergebnis.
> **Dieser Bug ist NICHT reproduzierbar im aktuellen Code.**

### Gemeinsame Root Cause

> **[KORREKTUR verify-plan]:** Die urspruengliche Root Cause (`scalar_one_or_none()` Crash) wurde BEREITS gefixt.
> `get_by_esp_and_gpio()` in `sensor_repo.py:44-64` ruft intern `get_all_by_esp_and_gpio()` auf
> und gibt `configs[0]` mit Warning zurueck. Es crasht NICHT mehr mit 500.
>
> **Tatsaechliches verbleibendes Problem:** Die Methode gibt bei Multi-Value-Sensoren
> BLIND den ERSTEN Treffer zurueck. Aufrufer (z.B. `sensor_service.py:129`) aktualisieren
> dadurch den FALSCHEN Sensor. Das ist ein **Silent-Data-Corruption-Bug**, kein 500-Crash.

In `sensor_repo.py` existiert die Methode `get_by_esp_and_gpio(esp_id, gpio)` die bei Multi-Value-Sensoren den ERSTEN Treffer zurueckgibt (mit Warning-Log). Aufrufer die ein spezifisches Ergebnis erwarten, arbeiten mit dem FALSCHEN Sensor:

| sensor_type | gpio | i2c_address | config_id |
|-------------|------|-------------|-----------|
| sht31_temp | 0 | 0x44 | cfg_aaa... |
| sht31_humidity | 0 | 0x44 | cfg_bbb... |
| sht31_temp | 0 | 0x45 | cfg_ccc... |
| sht31_humidity | 0 | 0x45 | cfg_ddd... |
| bmp280_temp | 0 | 0x76 | cfg_eee... |
| bmp280_pressure | 0 | 0x76 | cfg_fff... |

Alle 6 Sensoren liegen auf GPIO 0. Ein Lookup per `(esp_id, gpio=0)` liefert 6 Treffer → `scalar_one_or_none()` crasht.

---

## SOLL-Zustand

### Strategie: id (UUID PK) als primaerer Identifier fuer Einzel-Lookups

> **[KORREKTUR verify-plan]:** Es gibt KEIN Feld `config_id` im SensorConfig-Model.
> Der Primary Key ist `id` (Typ `uuid.UUID`, generiert via `uuid.uuid4()`).
> Das Format ist eine Standard-UUID (z.B. `a1b2c3d4-...`), NICHT `cfg_{uuid}`.
> Die API nutzt zwar den Parameternamen `config_id` in URLs (z.B. `DELETE /{esp_id}/{config_id}`),
> aber das mappt auf `SensorConfig.id` in der DB.
> `BaseRepository.get_by_id(id: uuid.UUID)` existiert bereits und macht genau diesen Lookup.

Die `id` (UUID PK) ist der eindeutige Identifier jeder Sensor-Konfiguration. Ueberall wo ein EINZELNER Sensor adressiert wird, MUSS `id` verwendet werden — nicht (gpio, sensor_type).

### 1. ~~Neuer Lookup: `get_by_config_id()`~~ ENTFAELLT

> **[KORREKTUR verify-plan]:** Dieser Lookup ist NICHT noetig.
> `BaseRepository.get_by_id(id: uuid.UUID)` (Datei `base_repo.py:70`) macht genau das:
> `select(Model).where(Model.id == id)` → `scalar_one_or_none()`.
> `SensorRepository` erbt von `BaseRepository[SensorConfig]` und hat `get_by_id()` bereits.
> Der DELETE-Endpoint nutzt es schon: `sensor_repo.get_by_id(config_id)` (sensors.py:934).
>
> **Aktion:** Statt neuen Lookup → bestehenden `get_by_id()` ueberall dort nutzen,
> wo bisher `get_by_esp_and_gpio()` fuer Einzel-Sensor-Zugriff steht.

### 2. ~~Bestehender Lookup `get_by_esp_and_gpio()` anpassen~~ BEREITS ERLEDIGT

> **[KORREKTUR verify-plan]:** Die Listen-Methode existiert BEREITS:
> - `get_all_by_esp_and_gpio()` (sensor_repo.py:66-82) — gibt `list[SensorConfig]` zurueck
> - `get_by_esp_and_gpio()` (sensor_repo.py:44-64) — Wrapper, gibt `configs[0]` mit Warning zurueck
>
> **Tatsaechliche Aktion:** `get_by_esp_and_gpio()` ist als DEPRECATED markiert.
> Alle Aufrufer muessen auf `get_all_by_esp_and_gpio()` (Liste) oder
> `get_by_esp_gpio_and_type()` (Einzel mit sensor_type) oder `get_by_id()` (PK) migriert werden.
> Danach `get_by_esp_and_gpio()` loeschen oder als Alias belassen.

### 3. ~~Spezifischer Lookup fuer Health-Check / Multi-Sensor-Abfragen~~ BEREITS VORHANDEN

> **[KORREKTUR verify-plan]:** Diese Methoden existieren BEREITS in sensor_repo.py:
> - `get_by_esp_gpio_and_type(esp_id, gpio, sensor_type)` — Zeile 84-107
>   (OHNE i2c_address Parameter, da sensor_type allein reicht fuer SHT31 temp vs humidity)
> - `get_by_esp_gpio_type_and_i2c(esp_id, gpio, sensor_type, i2c_address)` — Zeile 876-914
>   (4-way Lookup fuer 2x SHT31 auf verschiedenen I2C-Adressen)
> - `get_by_esp_gpio_type_and_onewire(esp_id, gpio, sensor_type, onewire_address)` — Zeile 836-874
>   (4-way Lookup fuer mehrere DS18B20 auf demselben OneWire-Bus)
>
> **Signatur-Unterschied:** Plan nutzt `esp_id: str`, Realitaet: `esp_id: uuid.UUID`.
> Alle Repository-Methoden erwarten die DB-interne UUID, NICHT die device_id-String.
>
> **Health-Check ist BEREITS korrekt:** `sensor_health.py` nutzt
> `get_latest_readings_batch_by_config()` mit (esp_id, gpio, sensor_type) Keys.

### 4. API-Endpoints anpassen

> **[KORREKTUR verify-plan]:** IST-Zustand der Endpoints:

**GET /api/v1/sensors/{esp_id}/{gpio}** (sensors.py:391-469):
- BEREITS Multi-Value-faehig: akzeptiert `?sensor_type=` Query-Parameter
- Ohne sensor_type: `get_all_by_esp_and_gpio()` + Warning + gibt ersten zurueck
- Kein 500-Crash mehr, aber falsche Daten moeglich ohne `?sensor_type=`
- **Empfehlung:** Wenn KEIN sensor_type und mehrere Sensoren auf GPIO → Liste zurueckgeben (Breaking Change) ODER 400 mit Hinweis auf sensor_type-Parameter

**POST /api/v1/sensors/{esp_id}/{gpio}** (sensors.py:477):
- Ruft `sensor_service.create_or_update_config()` auf
- Dort: `get_by_esp_and_gpio()` → aktualisiert BLIND den ERSTEN Treffer
- **Fix noetig:** Request-Body MUSS `sensor_type` oder besser die UUID `id` enthalten
- Alternativ: Neuer Endpoint `PUT /api/v1/sensors/{sensor_id}` (per UUID PK)

**DELETE /api/v1/sensors/{esp_id}/{config_id}** (sensors.py:892):
- BEREITS per UUID PK (config_id = SensorConfig.id). Kein Fix noetig.

**GET /api/v1/sensors/{esp_id}/{gpio}/stats** (sensors.py:1275):
- Nutzt NOCH `get_by_esp_and_gpio()` → falscher Sensor bei Multi-Value
- **Fix noetig:** sensor_type Query-Parameter hinzufuegen

**Health-Check** (`services/maintenance/jobs/sensor_health.py`):
- BEREITS korrekt: nutzt `get_latest_readings_batch_by_config()` mit sensor_type-Key
- Kein Fix noetig

### 5. Alle Aufrufer pruefen

> **[KORREKTUR verify-plan]:** Vollstaendige Aufrufer-Liste aus Grep-Analyse:

Jede Stelle die `get_by_esp_and_gpio()` aufruft und ein einzelnes Ergebnis erwartet, muss angepasst werden:
- Wenn Einzel-Sensor gemeint → `get_by_id()` (PK) oder `get_by_esp_gpio_and_type()` verwenden
- Wenn alle Sensoren auf GPIO gemeint → `get_all_by_esp_and_gpio()` (Liste) verarbeiten

**Aufrufer in Produktion (IST-Zustand):**

| Datei | Zeile | Methode | Problem | Fix |
|-------|-------|---------|---------|-----|
| `sensor_service.py` | 86 | `get_config()` | Gibt BLIND ersten Treffer zurueck | → `get_by_esp_gpio_and_type()` oder `get_by_id()` |
| `sensor_service.py` | 129 | `create_or_update_config()` | Update auf falschen Sensor | → sensor_type-basierter Lookup |
| `sensor_service.py` | 198 | (weiterer Lookup) | Gleiches Problem | → wie oben |
| `sensor_service.py` | 530 | `trigger_measurement()` | Falscher Sensor getriggert | → `get_by_esp_gpio_and_type()` |
| `sensor_scheduler_service.py` | 377 | Scheduled Measurement | Falscher Sensor geprueft | → `get_by_esp_gpio_and_type()` |
| `gpio_validation_service.py` | 373 | GPIO-Konfliktpruefung | Bei I2C: erster Sensor = "belegt" → KORREKT fuer GPIO-Check | Evtl. OK (GPIO ist belegt egal welcher Sensor) |
| `config_handler.py` | 366 | Config-Failure-Handling | Falscher Sensor config_status=failed | → sensor_type aus Failure-Payload nutzen |
| `sensors.py` | 1275 | `get_sensor_stats()` | Stats vom falschen Sensor | → sensor_type Query-Param hinzufuegen |
| `sensor_repo.py` | 600 | `get_calibration()` | Kalibrierung vom falschen Sensor | → sensor_type Parameter hinzufuegen |

**NICHT betroffen (bereits korrekt):**
- `sensor_handler.py` — nutzt `get_by_esp_gpio_and_type()` ✅
- `sensor_health.py` — nutzt `get_latest_readings_batch_by_config()` ✅
- `sensors.py:391` GET — nutzt `get_all_by_esp_and_gpio()` + `?sensor_type=` ✅
- `sensors.py:892` DELETE — nutzt `get_by_id()` (PK) ✅

---

## Was NICHT gemacht wird

- Kein Frontend-Code aendern (das ist T10-Fix-C)
- Keine DELETE-Logik aendern (das ist T10-Fix-B)
- Keine neuen DB-Spalten oder Migrationen — PK `id` (UUID) existiert bereits (NICHT `config_id`)
- Keine Aenderungen an der Sensor-Erstellung (AddSensorModal) — das funktioniert korrekt

---

## Akzeptanzkriterien

1. **GET /api/v1/sensors/{esp_id}/0** gibt bei 6 I2C-Sensoren auf GPIO 0 korrekte Daten zurueck (mit `?sensor_type=` oder als Liste)
2. **POST /api/v1/sensors/{esp_id}/{gpio}** oder neuer `PUT /api/v1/sensors/{sensor_id}` aktualisiert genau EINEN Sensor per UUID PK
3. **Health-Check** laeuft 30 Minuten ohne Fehler (**[KORREKTUR: IST bereits der Fall** — nutzt batch_by_config])
4. **Bestehende Tests** bleiben gruen (108+ Tests)
5. **Keine Aufrufe mehr** von `get_by_esp_and_gpio()` in Produktion (deprecated Methode vollstaendig abgeloest)
6. **Neuer Test:** `test_get_sensors_multiple_i2c_same_gpio()` — erstellt 4 SHT31-Configs auf GPIO 0 mit 2 verschiedenen I2C-Adressen, prueft dass GET alle 4 zurueckgibt

---

## Betroffene Dateien (verifiziert)

> **[KORREKTUR verify-plan]:** Vollstaendig korrigierte Datei-Liste aus Codebase-Analyse.
> Pfade relativ zu `El Servador/god_kaiser_server/src/`.

| Datei | Pfad | Aenderung | Status |
|-------|------|-----------|--------|
| `sensor_repo.py` | `db/repositories/sensor_repo.py` | ~~NEU: get_by_config_id~~, ~~get_all_by_esp_and_gpio~~, ~~get_by_esp_gpio_and_type~~ — ALLES EXISTIERT BEREITS. **Fix:** `get_calibration()` (Z.600) braucht sensor_type Param | Teilweise erledigt |
| `sensor_service.py` | `services/sensor_service.py` | **FEHLTE IM PLAN.** 4 Aufrufe von `get_by_esp_and_gpio()` migrieren (Z.86, 129, 198, 530) | **KRITISCH** |
| `sensors.py` (API) | `api/v1/sensors.py` | `get_sensor_stats()` (Z.1275): sensor_type Query-Param hinzufuegen | Teilweise |
| `sensor_scheduler_service.py` | `services/sensor_scheduler_service.py` | **FEHLTE IM PLAN.** Z.377: → `get_by_esp_gpio_and_type()` | Fix noetig |
| `gpio_validation_service.py` | `services/gpio_validation_service.py` | **FEHLTE IM PLAN.** Z.373: Pruefe ob OK (GPIO-Level-Check, nicht Sensor-spezifisch) | Bewertung noetig |
| `config_handler.py` | `mqtt/handlers/config_handler.py` | **FEHLTE IM PLAN.** Z.366: sensor_type aus Failure-Payload nutzen | Fix noetig |
| `debug.py` | `api/v1/debug.py` | Mock-Sensor-Abfragen pruefen | Zu pruefen |
| ~~`health_check.py`~~ | `services/maintenance/jobs/sensor_health.py` | ~~Iteration ueber Liste~~ BEREITS korrekt (batch_by_config) | **KEIN FIX NOETIG** |
| ~~`sensor_handler.py`~~ | `mqtt/handlers/sensor_handler.py` | ~~Pruefen ob betroffen~~ Nutzt bereits `get_by_esp_gpio_and_type()` | **KEIN FIX NOETIG** |
| Tests | `tests/` | Neue Tests fuer Multi-I2C-Szenario, bestehende Test-Mocks aktualisieren |  |
