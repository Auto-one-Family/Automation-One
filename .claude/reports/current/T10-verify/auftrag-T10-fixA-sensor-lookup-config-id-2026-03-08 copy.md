# Auftrag T10-Fix-A: Backend Sensor-Lookup per config_id statt (gpio, sensor_type)

> **Bezug:** T10-Verifikationsbericht Phase 4, 8, 11 — NB-T10-02, NB-T10-03, NB-T09-07 REGRESSION
> **Prioritaet:** ~~KRITISCH — blockiert Sensor-Bearbeitung und -Abfrage komplett~~ [KORREKTUR: Crash-Bug (scalar_one_or_none) ist BEREITS gefixt. Verbleibend: HOCH — deprecated Caller geben bei Multi-Value nur 1. Sensor zurueck (stiller Datenverlust)]
> **Bereich:** El Servador (Backend) — ~~sensor_repo.py, sensors.py (API), debug.py~~ [KORREKTUR: sensor_service.py (4x), sensors.py (1x), config_handler.py (1x), sensor_scheduler_service.py (1x), sensor_repo.py:get_calibration (1x). debug.py/health_check.py/sensor_handler.py sind NICHT betroffen]
> **Datum:** 2026-03-08

---

## Problem (IST)

### Bug NB-T10-02: GET /api/v1/sensors/{device_id}/{gpio} gibt 500
~~Wenn mehrere Sensoren auf derselben GPIO liegen (z.B. 2x SHT31 auf GPIO 0 mit I2C 0x44 und 0x45), crasht die Query:~~
```
sqlalchemy.orm.exc.MultipleResultsFound: Multiple rows were found when exactly one was expected
```
~~**Ursache:** `sensor_repo.py` nutzt `scalar_one_or_none()` fuer eine Query auf `(esp_id, gpio)`.~~

**[KORREKTUR verify-plan 2026-03-08]:** Dieser Bug ist **BEREITS GEFIXT**. `get_by_esp_and_gpio()` in `sensor_repo.py:44-64` delegiert jetzt zu `get_all_by_esp_and_gpio()` und returned `configs[0]` mit Warning. GET-Endpoint `sensors.py:391-469` akzeptiert optional `?sensor_type=` und nutzt `get_all_by_esp_and_gpio()` als Fallback. **KEIN 500-Error mehr.** Verbleibendes Problem: ohne `?sensor_type=` wird nur der ERSTE Sensor zurueckgegeben (stiller Datenverlust statt Crash).

### Bug NB-T10-03: POST /api/v1/sensors/{device_id}/{gpio} gibt 500
~~Identische Root Cause wie NB-T10-02.~~

**[KORREKTUR verify-plan 2026-03-08]:** Dieser Bug ist **BEREITS GEFIXT**. POST-Endpoint `sensors.py:477-686` hat vollstaendiges Multi-Value-Splitting mit I2C-aware 4-Way-Lookups (`get_by_esp_gpio_type_and_i2c()`, `get_by_esp_gpio_and_type()`). **KEIN 500-Error mehr.**

### Bug NB-T09-07 REGRESSION: 150x MultipleResultsFound in 30 Minuten
~~Der Health-Check ruft periodisch `get_by_esp_and_gpio()` auf.~~

**[KORREKTUR verify-plan 2026-03-08]:** Health-Endpoint `health.py:229-251` nutzt `count_by_esp()`, **NICHT** `get_by_esp_and_gpio()`. Kein Sensor-Lookup, kein Crash-Risiko. Die 150 Errors stammten aus der ALTEN Version (vor T08-Fix).

### Gemeinsame Root Cause (historisch — mittlerweile gefixt)
~~In `sensor_repo.py` existiert eine Methode (wahrscheinlich `get_by_esp_and_gpio(esp_id, gpio)`) die `scalar_one_or_none()` nutzt.~~

**[KORREKTUR verify-plan 2026-03-08]:** `get_by_esp_and_gpio()` nutzt KEIN `scalar_one_or_none()` mehr. Die Methode ist als DEPRECATED markiert und delegiert zu `get_all_by_esp_and_gpio()`. Das Problem (esp_id, gpio) nicht eindeutig bei I2C ist korrekt beschrieben, die Loesung aber bereits implementiert:

| sensor_type | gpio | i2c_address | config_id |
|-------------|------|-------------|-----------|
| sensor_type | gpio | i2c_address | ~~config_id~~ id (UUID PK) |
|-------------|------|-------------|-----------|
| sht31_temp | 0 | ~~0x44~~ 68 | ~~cfg_aaa...~~ uuid4() |
| sht31_humidity | 0 | ~~0x44~~ 68 | ~~cfg_bbb...~~ uuid4() |
| sht31_temp | 0 | ~~0x45~~ 69 | ~~cfg_ccc...~~ uuid4() |
| sht31_humidity | 0 | ~~0x45~~ 69 | ~~cfg_ddd...~~ uuid4() |
| bmp280_temp | 0 | ~~0x76~~ 118 | ~~cfg_eee...~~ uuid4() |
| bmp280_pressure | 0 | ~~0x76~~ 118 | ~~cfg_fff...~~ uuid4() |

**[KORREKTUR verify-plan]:** `config_id` Feld existiert NICHT in SensorConfig. PK ist `id` (UUID). `i2c_address` ist Integer, nicht String.

Alle 6 Sensoren liegen auf GPIO 0. Ein Lookup per `(esp_id, gpio=0)` liefert 6 Treffer → `scalar_one_or_none()` crasht.

---

## SOLL-Zustand

### Strategie: ~~config_id (UUID)~~ `id` (UUID PK) als primaerer Identifier fuer Einzel-Lookups

**[KORREKTUR verify-plan]:** ~~Die `config_id` (Format `cfg_{uuid}`)~~ Das Feld `id` (UUID, Primary Key) ist der eindeutige Identifier jeder Sensor-Konfiguration. Kein separates `config_id`-Feld vorhanden. `BaseRepository.get_by_id()` existiert bereits.

### ~~1. Neuer Lookup: `get_by_config_id(config_id: str)`~~ [BEREITS VORHANDEN als `BaseRepository.get_by_id()`]

**[KORREKTUR verify-plan]:** Methode existiert bereits in `base_repo.py:70`:
```python
# base_repo.py — EXISTIERT BEREITS
async def get_by_id(self, id: uuid.UUID) -> T | None:
    result = await self.session.execute(select(self.model).where(self.model.id == id))
    return result.scalar_one_or_none()
```
Wird bereits im DELETE-Endpoint genutzt: `sensor_repo.get_by_id(config_id)` (sensors.py:934). Separate `get_by_config_id()` ist redundant.

### ~~2. Bestehender Lookup `get_by_esp_and_gpio()` anpassen~~ [BEREITS IMPLEMENTIERT]

**[KORREKTUR verify-plan]:** Methode ist bereits angepasst:
- `get_by_esp_and_gpio()` (sensor_repo.py:44-64) — DEPRECATED, delegiert zu `get_all_by_esp_and_gpio()`, returned `configs[0]` mit Warning
- `get_all_by_esp_and_gpio()` (sensor_repo.py:66-82) — gibt `list[SensorConfig]` zurueck

```python
# sensor_repo.py — EXISTIERT BEREITS (Zeile 66-82)
async def get_all_by_esp_and_gpio(self, esp_id: uuid.UUID, gpio: int) -> list[SensorConfig]:
    # [KORREKTUR] esp_id ist uuid.UUID, NICHT str
    stmt = select(SensorConfig).where(SensorConfig.esp_id == esp_id, SensorConfig.gpio == gpio)
    result = await self.session.execute(stmt)
    return list(result.scalars().all())
```

### ~~3. Spezifischer Lookup fuer Health-Check / Multi-Sensor-Abfragen~~ [BEREITS IMPLEMENTIERT]

**[KORREKTUR verify-plan]:** Methode existiert bereits (sensor_repo.py:84-107). Zusaetzlich existieren 4-Way-Lookups:
- `get_by_esp_gpio_type_and_i2c()` (Zeile 881-919) — fuer I2C
- `get_by_esp_gpio_type_and_onewire()` (Zeile 841-879) — fuer OneWire

```python
# sensor_repo.py — EXISTIERT BEREITS (Zeile 84-107)
async def get_by_esp_gpio_and_type(
    self, esp_id: uuid.UUID, gpio: int, sensor_type: str
    # [KORREKTUR] KEIN i2c_address Parameter — separate 4-Way-Methode dafuer
) -> Optional[SensorConfig]:
    stmt = select(SensorConfig).where(
        SensorConfig.esp_id == esp_id,  # [KORREKTUR] uuid.UUID, nicht str
        SensorConfig.gpio == gpio,
        func.lower(SensorConfig.sensor_type) == sensor_type.lower(),
    )
    result = await self.session.execute(stmt)
    return result.scalar_one_or_none()
```

### 4. API-Endpoints anpassen

**[KORREKTUR verify-plan]:** Alle drei Punkte sind BEREITS implementiert:

**GET /api/v1/sensors/{device_id}/{gpio}:** ~~MUSS eine LISTE zurueckgeben~~
- [BEREITS SAFE] sensors.py:391-469 — akzeptiert `?sensor_type=` Query-Param, nutzt `get_all_by_esp_and_gpio()` als Fallback
- **Offen:** UX-Entscheidung ob Liste statt single-response returned werden soll (aktuell: 1. Sensor mit Warning)

**POST /api/v1/sensors/{device_id}/{gpio}:** ~~Request-Body MUSS config_id enthalten~~
- [BEREITS SAFE] sensors.py:477-686 — Multi-Value-Splitting mit 4-Way-Lookups

**DELETE /api/v1/sensors/{esp_id}/{config_id}:**
- [BEREITS IMPLEMENTIERT] sensors.py:892-1017 — nutzt `get_by_id(config_id)` (UUID PK)

**Health-Check:** ~~Muss get_by_esp_and_gpio() nutzen~~
- [NICHT BETROFFEN] health.py nutzt `count_by_esp()` — kein Sensor-Lookup

### 5. Alle Aufrufer pruefen — TATSAECHLICHE verbleibende Caller

**[KORREKTUR verify-plan]:** ~~Health-Check, WebSocket-Handler~~ sind NICHT betroffen. Die echten Caller:

| Datei | Zeile | Methode | Risiko | Empfohlener Fix |
|-------|-------|---------|--------|-----------------|
| `sensor_service.py` | 86 | `get_sensor_config()` | HOCH | → `get_by_esp_gpio_and_type()` mit sensor_type Param |
| `sensor_service.py` | 129 | `create_or_update_config()` | HOCH | → `get_by_esp_gpio_and_type()` |
| `sensor_service.py` | 198 | `delete_config()` legacy | MITTEL | → `get_by_id()` (preferred path existiert bereits) |
| `sensor_service.py` | 530 | `trigger_measurement()` | MITTEL | → sensor_type Parameter hinzufuegen |
| `sensors.py` | 1281 | `get_sensor_stats()` Fallback | MITTEL | → `get_all_by_esp_and_gpio()` + Iteration (Commit c96f776 hat sensor_type im Stats-Query ergaenzt, aber Lookup noch deprecated) |
| `config_handler.py` | 366 | Config-Failure | MITTEL | → payload enthaelt sensor_type, nutzen |
| `sensor_scheduler_service.py` | 377 | Scheduled Measurement | MITTEL | → sensor_type aus Job-Metadata |
| `gpio_validation_service.py` | 373 | GPIO-Konflikt | NIEDRIG | Intentional — pruefen ob GPIO belegt |
| `sensor_repo.py` | 600 | `get_calibration()` | NIEDRIG | → sensor_type Parameter hinzufuegen |

---

## Was NICHT gemacht wird

- Kein Frontend-Code aendern (das ist T10-Fix-C)
- Keine DELETE-Logik aendern (das ist T10-Fix-B)
- Keine neuen DB-Spalten oder Migrationen — ~~config_id existiert bereits~~ [KORREKTUR: `config_id` existiert NICHT als DB-Feld. PK `id` (UUID) wird direkt als Identifier genutzt. Keine Migration noetig.]
- Keine Aenderungen an der Sensor-Erstellung (AddSensorModal) — das funktioniert korrekt

---

## Akzeptanzkriterien

1. ~~**GET /api/v1/sensors/{device_id}/0** gibt bei 6 I2C-Sensoren auf GPIO 0 eine Liste mit 6 Eintraegen zurueck (kein 500)~~ [KORREKTUR: Kein 500 mehr — BEREITS GEFIXT. Aktuell: returned 1. Sensor. Offen: Liste zurueckgeben?]
2. ~~**POST /api/v1/sensors/config/{config_id}** (oder aehnlich) aktualisiert genau EINEN Sensor per UUID (kein 500)~~ [KORREKTUR: POST-Endpoint bereits multi-value-safe. DELETE per UUID existiert bereits.]
3. ~~**Health-Check** laeuft 30 Minuten ohne `MultipleResultsFound`-Fehler im Log~~ [KORREKTUR: Health-Check nutzt `count_by_esp()`, NICHT betroffen.]
4. **Bestehende Tests** bleiben gruen (108+ Tests) — [BESTAETIGT: weiterhin relevant]
5. **Kein `scalar_one_or_none()`** auf Queries die (esp_id, gpio) ohne sensor_type/i2c_address als Filter nutzen — [BESTAETIGT: sensor_repo.py gefixt, aber `get_by_i2c_address()` Zeile 796-816 nutzt noch `scalar_one_or_none()` auf (esp_id, i2c_address) — Crash-Risiko bei gleicher Adresse auf 2 GPIOs]
6. **Neuer Test:** `test_get_sensors_multiple_i2c_same_gpio()` — [BESTAETIGT: weiterhin relevant fuer Regression-Sicherung]
7. **[NEU] Alle 9 deprecated `get_by_esp_and_gpio()` Caller migriert** — Kein Caller nutzt mehr die deprecated Methode

---

## Betroffene Dateien (geschaetzt)

| Datei | Aenderung | Status |
|-------|-----------|--------|
| ~~`sensor_repo.py`~~ | ~~`get_by_config_id()` NEU, `get_by_esp_and_gpio()` → Liste, `get_by_esp_gpio_and_type()` NEU~~ | **BEREITS IMPLEMENTIERT** — alle 3 Methoden existieren |
| ~~`sensors.py` (API)~~ | ~~GET-Endpoint Liste, POST/PUT per config_id~~ | **BEREITS IMPLEMENTIERT** — GET/POST/DELETE multi-value-safe |
| ~~`debug.py`~~ | ~~Mock-Sensor-Abfragen anpassen~~ | **NICHT BETROFFEN** — nur Actuator-Lookups |
| ~~`health_check.py`~~ | ~~Iteration ueber Liste statt single lookup~~ | **NICHT BETROFFEN** — nutzt `count_by_esp()` |
| ~~`sensor_handler.py`~~ | ~~Pruefen ob Lookup-Aufrufe betroffen~~ | **NICHT BETROFFEN** — nutzt 4-Way-Lookups |
| Tests | Neue Tests fuer Multi-I2C-Szenario | **OFFEN** |

**[KORREKTUR verify-plan] Korrigierte Datei-Liste (tatsaechlich betroffene Dateien):**

| Datei | Pfad | Aenderung |
|-------|------|-----------|
| `sensor_service.py` | `src/services/sensor_service.py` | 4 Stellen: deprecated `get_by_esp_and_gpio()` → typ-spezifische Lookups |
| `sensors.py` (API) | `src/api/v1/sensors.py` | Zeile 1281: Stats-Endpoint Fallback anpassen |
| `config_handler.py` | `src/mqtt/handlers/config_handler.py` | Zeile 366: Config-Failure per sensor_type |
| `sensor_scheduler_service.py` | `src/services/sensor_scheduler_service.py` | Zeile 377: Scheduled Measurement |
| `sensor_repo.py` | `src/db/repositories/sensor_repo.py` | `get_calibration()` Zeile 600, `get_by_i2c_address()` Zeile 796 |
| Tests | `tests/` | Regression-Tests fuer alle migrierten Caller |

---

## /verify-plan Ergebnis (2026-03-08, Re-Verify Update)

**Plan:** Backend Sensor-Lookup von (gpio, sensor_type) auf config_id umstellen
**Geprueft:** 8 Dateien, 0 Agents, 0 Services, 4 Endpoints, 6 Repo-Methoden
**Letzter Commit:** `c96f776 fix(server): add sensor_type filter to sensor stats query`

### KRITISCH: Plan basiert auf veraltetem IST-Zustand

Der Plan beschreibt Bugs und Loesungen die **BEREITS implementiert** sind. Die Root-Cause-Analyse ist korrekt, aber ~70% der vorgeschlagenen Aenderungen existieren schon. Der Plan muss grundlegend ueberarbeitet werden.

### ⚠️ Korrekturen noetig

**K1 — KRITISCH: `config_id` existiert NICHT als Feld im SensorConfig Model**
- Plan sagt: `config_id` (Format `cfg_{uuid}`) als primaerer Identifier
- System sagt: SensorConfig hat `id` (UUID, Primary Key) — kein `config_id` Feld
- Pfad: `El Servador/god_kaiser_server/src/db/models/sensor.py:52-57`
- Empfehlung: Entweder neues Feld `config_id` hinzufuegen (braucht Alembic Migration) ODER `id` (UUID) direkt als Identifier nutzen. DELETE-Endpoint nutzt bereits `id` als Path-Parameter `config_id` — das ist nur ein Parameter-Name, KEIN DB-Feld.

**K2 — KRITISCH: `get_by_esp_and_gpio()` ist BEREITS crash-safe**
- Plan sagt: Methode nutzt `scalar_one_or_none()` und crasht bei Multi-GPIO
- System sagt: Methode delegiert seit Vorfix zu `get_all_by_esp_and_gpio()` und returned `configs[0]` (Zeile 44-64 in sensor_repo.py)
- Empfehlung: Kein Fix noetig fuer Crash. ABER: die Methode ist als DEPRECATED markiert und gibt bei Multi-Value nur den ersten Sensor zurueck — das ist semantisch falsch fuer manche Caller.

**K3 — BEREITS IMPLEMENTIERT: `get_all_by_esp_and_gpio()` existiert**
- Plan sagt: Diese Methode NEU erstellen (Zeile 66-82 im Plan)
- System sagt: Existiert bereits in sensor_repo.py:66-82, identisch zum Plan
- Empfehlung: Aus Plan streichen

**K4 — BEREITS IMPLEMENTIERT: `get_by_esp_gpio_and_type()` existiert**
- Plan sagt: Diese Methode NEU erstellen (Zeile 82-96 im Plan)
- System sagt: Existiert bereits in sensor_repo.py:84-107
- Empfehlung: Aus Plan streichen. Zusaetzlich: Plan schlaegt `i2c_address` Parameter vor — tatsaechlich existieren separate 4-Way-Lookups: `get_by_esp_gpio_type_and_i2c()` (Zeile 881) und `get_by_esp_gpio_type_and_onewire()` (Zeile 841)

**K5 — GET-Endpoint BEREITS multi-value-safe**
- Plan sagt: `GET /api/v1/sensors/{device_id}/{gpio}` crasht mit 500
- System sagt: Endpoint nutzt bereits `?sensor_type=` Query-Parameter und `get_all_by_esp_and_gpio()` Fallback (sensors.py:434-445). Kein Crash, returned ersten Sensor mit Warning.
- Empfehlung: Aus Plan streichen oder auf "Liste zurueckgeben statt erstem Sensor" einschraenken

**K6 — POST-Endpoint BEREITS multi-value-safe**
- Plan sagt: `POST /api/v1/sensors/{device_id}/{gpio}` crasht mit 500
- System sagt: Endpoint hat vollstaendiges Multi-Value-Splitting mit I2C-aware 4-Way-Lookups (sensors.py:528-624)
- Empfehlung: Aus Plan streichen

**K7 — DELETE-Endpoint BEREITS per UUID**
- Plan sagt: Neuer Endpoint `PUT/DELETE /api/v1/sensors/config/{config_id}` noetig
- System sagt: `DELETE /{esp_id}/{config_id}` existiert bereits mit `get_by_id(config_id)` Lookup (sensors.py:892-1017)
- Empfehlung: Aus Plan streichen

**K8 — `sensor_handler.py` ist NICHT betroffen**
- Plan sagt: "Pruefen ob Lookup-Aufrufe betroffen"
- System sagt: sensor_handler.py nutzt bereits 4-Way-Lookups (`get_by_esp_gpio_type_and_i2c`, `get_by_esp_gpio_type_and_onewire`, `get_by_esp_gpio_and_type`) — KEIN `get_by_esp_and_gpio()` Aufruf
- Empfehlung: Aus Plan streichen

**K9 — `debug.py` ist NICHT betroffen (Sensoren)**
- Plan sagt: "Mock-Sensor-Abfragen anpassen"
- System sagt: debug.py:1366 ruft nur `actuator_repo.get_by_esp_and_gpio()` auf, NICHT `sensor_repo`. Kein Sensor-Lookup in debug.py.
- Empfehlung: Aus Plan streichen

**K10 — `health_check.py` existiert NICHT am erwarteten Ort**
- Plan sagt: `health_check.py (oder aehnlich)` anpassen
- System sagt: `autoops/plugins/health_check.py` existiert, nutzt aber KEIN `get_by_esp_and_gpio()`. `health_service.py` und `health.py` ebenfalls nicht betroffen.
- Empfehlung: Aus Plan streichen

**K11 — `i2c_address` Typ-Diskrepanz**
- Plan sagt: `i2c_address` als String (`"0x44"`, `"0x45"`)
- System sagt: `i2c_address` ist `Mapped[Optional[int]]` (Integer, z.B. 68 fuer 0x44, 69 fuer 0x45)
- Empfehlung: Im Plan Integer-Werte verwenden

**K12 — `esp_id` Typ-Diskrepanz in Code-Samples (NEU bei Re-Verify)**
- Plan sagt: `esp_id: str` in allen neuen Methoden-Signaturen
- System sagt: Alle Repo-Methoden nutzen `esp_id: uuid.UUID` (uuid aus sqlalchemy.dialects.postgresql)
- Empfehlung: Code-Samples im Plan mit `uuid.UUID` korrigieren. Die API-Layer Konversion (`str` → `uuid.UUID`) erfolgt ueber `ESPRepository.get_by_device_id()` das `device_id: str` akzeptiert und `ESPDevice.id` (UUID) zurueckgibt.

**K13 — Commit c96f776 teilweise Fix fuer Stats-Endpoint (NEU bei Re-Verify)**
- Kuerzlicher Commit hat `sensor_type` Filter in `get_stats()` Query ergaenzt (sensors.py:1296-1302)
- ABER: Der Lookup VOR der Stats-Query (sensors.py:1281) nutzt noch `get_by_esp_and_gpio()` als Fallback — kann falschen Sensor adressieren
- Empfehlung: Caller-Migration fuer sensors.py:1281 weiterhin noetig, hat aber geringeres Risiko als vorher (Stats-Daten sind jetzt wenigstens korrekt gefiltert)

### ✅ Bestaetigt

- Root-Cause-Analyse korrekt: `(esp_id, gpio)` ist NICHT eindeutig bei I2C/Multi-Value
- `config_id` (= UUID Primary Key `id`) als Identifier fuer Einzel-Lookups ist der richtige Ansatz
- Akzeptanzkriterium 5 (kein `scalar_one_or_none` auf non-unique queries) ist relevant — es gibt noch `get_by_i2c_address()` in sensor_repo.py:796-816 das `scalar_one_or_none()` nutzt und bei mehreren SHT31 auf verschiedenen GPIOs crashen kann
- UniqueConstraint `unique_esp_gpio_sensor_interface` (esp_id, gpio, sensor_type, onewire_address, i2c_address) existiert korrekt

### Tatsaechlich verbleibende `get_by_esp_and_gpio()` Caller (DEPRECATED-Methode)

Diese Stellen nutzen noch die deprecated Methode und bekommen nur den ERSTEN Sensor zurueck — semantisch falsch bei Multi-Value:

| Datei | Zeile | Kontext | Risiko |
|-------|-------|---------|--------|
| `sensor_service.py` | 86 | `get_sensor_config()` | HOCH — returned nur 1. Sensor |
| `sensor_service.py` | 129 | `create_or_update_config()` | HOCH — findet nur 1. Sensor beim Update |
| `sensor_service.py` | 198 | `delete_sensor_config()` | MITTEL — Loeschlogik per GPIO |
| `sensor_service.py` | 530 | `trigger_measurement()` | MITTEL — sendet Measurement nur fuer 1. Sensor |
| `sensors.py` | 1281 | `get_sensor_stats()` Fallback | MITTEL — Stats fuer falschen Sensor |
| `config_handler.py` | 366 | Config-Failure-Update | MITTEL — updated nur 1. Sensor-Status |
| `sensor_scheduler_service.py` | 377 | Scheduled Measurement | MITTEL — Scheduled nur 1. Sensor |
| `gpio_validation_service.py` | 373 | GPIO-Konflikt-Check | NIEDRIG — intentional: pruefen ob GPIO belegt |
| `sensor_repo.py` | 600 | `get_calibration()` | NIEDRIG — Calibration nur fuer 1. Sensor |

### ⚠️ Neuer Bug: `get_by_i2c_address()` (sensor_repo.py:796-816)

Diese Methode nutzt `scalar_one_or_none()` mit Filter `(esp_id, i2c_address)`. Wenn ein SHT31 (0x44) auf GPIO 21 UND GPIO 22 angeschlossen wird, existieren 2 Eintraege mit gleicher I2C-Adresse → Crash. Sollte im Plan ergaenzt werden.

### 📋 Fehlende Vorbedingungen

- [ ] Entscheidung: `config_id` als neues DB-Feld (Alembic Migration noetig) ODER `id` (UUID PK) direkt nutzen? DELETE-Endpoint nutzt bereits `id` als "config_id" Path-Parameter.

### 💡 Ergaenzungen

- `sensor_service.py` fehlt komplett in der Datei-Liste — hat 4 betroffene Stellen (mehr als jede andere Datei)
- `config_handler.py` fehlt in der Datei-Liste — hat 1 betroffene Stelle
- `sensor_scheduler_service.py` fehlt in der Datei-Liste — hat 1 betroffene Stelle
- `gpio_validation_service.py` sollte geprueft werden — intentional oder Bug?
- Neuer `get_by_config_id()` ist trivial: entspricht `BaseRepository.get_by_id()` das bereits von `base_repo.py` geerbt wird. Separate Methode nur noetig wenn `config_id` als separates Feld existiert.

### Korrigierte Datei-Liste

| Datei | Vollstaendiger Pfad | Aenderung |
|-------|---------------------|-----------|
| `sensor_service.py` | `src/services/sensor_service.py` | 4 Stellen: `get_by_esp_and_gpio()` → `get_by_esp_gpio_and_type()` oder `get_all_by_esp_and_gpio()` |
| `sensors.py` (API) | `src/api/v1/sensors.py` | Zeile 1281: `get_sensor_stats()` Fallback → `get_all_by_esp_and_gpio()` mit Liste |
| `config_handler.py` | `src/mqtt/handlers/config_handler.py` | Zeile 366: Config-Failure per sensor_type disambiguieren |
| `sensor_scheduler_service.py` | `src/services/sensor_scheduler_service.py` | Zeile 377: Scheduled Measurement per sensor_type |
| `sensor_repo.py` | `src/db/repositories/sensor_repo.py` | `get_calibration()` Zeile 600 anpassen, `get_by_i2c_address()` pruefen |
| ~~`debug.py`~~ | — | **NICHT BETROFFEN** (nur Actuator-Lookups) |
| ~~`health_check.py`~~ | — | **NICHT BETROFFEN** (kein Sensor-Lookup) |
| ~~`sensor_handler.py`~~ | — | **NICHT BETROFFEN** (nutzt bereits 4-Way-Lookups) |
| Tests | `tests/` | Neue Tests fuer Multi-I2C + Regression-Tests fuer korrigierte Caller |

### Zusammenfassung fuer TM (Re-Verify Update 2026-03-08)

Der Plan beschreibt ein reales Problem, aber der **IST-Zustand ist bereits ~70% gefixt**. Die Repo-Methoden (`get_all_by_esp_and_gpio`, `get_by_esp_gpio_and_type`, 4-Way-Lookups) existieren alle bereits. GET/POST/DELETE-Endpoints sind bereits multi-value-safe. Die tatsaechliche Arbeit liegt bei den **9 deprecated `get_by_esp_and_gpio()` Callern** in `sensor_service.py` (4x), `sensors.py` (1x), `config_handler.py` (1x), `sensor_scheduler_service.py` (1x), `gpio_validation_service.py` (1x), `sensor_repo.py` (1x). Die Dateien `debug.py`, `health_check.py` und `sensor_handler.py` sind NICHT betroffen.

**Entscheidungen fuer TM:**
1. `config_id` existiert NICHT als DB-Feld → `id` (UUID PK) direkt nutzen (empfohlen, keine Migration noetig)
2. GET `/{esp_id}/{gpio}` ohne `?sensor_type=` → Liste zurueckgeben oder weiterhin 1. Sensor?
3. `gpio_validation_service.py:373` — intentional oder Bug? (gibt bei Multi-Value nur 1. Sensor fuer Konflikt-Check)

**Geschaetzter Aufwand (korrigiert):** ~30% des Original-Plans — nur Caller-Migration, keine neuen Methoden/Endpoints noetig.
