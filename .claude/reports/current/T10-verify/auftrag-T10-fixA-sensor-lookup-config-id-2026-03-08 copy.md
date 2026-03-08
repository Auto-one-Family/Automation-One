# Auftrag T10-Fix-A: Backend Sensor-Lookup per config_id statt (gpio, sensor_type)

> **Bezug:** T10-Verifikationsbericht Phase 4, 8, 11 — NB-T10-02, NB-T10-03, NB-T09-07 REGRESSION
> **Prioritaet:** KRITISCH — blockiert Sensor-Bearbeitung und -Abfrage komplett
> **Bereich:** El Servador (Backend) — sensor_repo.py, sensors.py (API), debug.py
> **Datum:** 2026-03-08

---

## Problem (IST)

### Bug NB-T10-02: GET /api/v1/sensors/{device_id}/{gpio} gibt 500
Wenn mehrere Sensoren auf derselben GPIO liegen (z.B. 2x SHT31 auf GPIO 0 mit I2C 0x44 und 0x45), crasht die Query:
```
sqlalchemy.orm.exc.MultipleResultsFound: Multiple rows were found when exactly one was expected
```
**Ursache:** `sensor_repo.py` nutzt `scalar_one_or_none()` fuer eine Query auf `(esp_id, gpio)`. Bei I2C-Sensoren teilen sich ALLE Sensoren GPIO 0 — die Query ist NICHT eindeutig.

### Bug NB-T10-03: POST /api/v1/sensors/{device_id}/{gpio} gibt 500
Identische Root Cause wie NB-T10-02. Beim Sensor-Rename oder Config-Update wird der gleiche nicht-eindeutige Lookup verwendet.

### Bug NB-T09-07 REGRESSION: 150x MultipleResultsFound in 30 Minuten
Der Health-Check ruft periodisch `get_by_esp_and_gpio()` auf. Bei jedem Durchlauf crasht die Query fuer jedes Device mit mehreren I2C-Sensoren. In 30 Minuten wurden 150 Fehler-Logs gemessen.

### Gemeinsame Root Cause
In `sensor_repo.py` existiert eine Methode (wahrscheinlich `get_by_esp_and_gpio(esp_id, gpio)`) die `scalar_one_or_none()` nutzt. Diese Methode geht davon aus, dass (esp_id, gpio) eindeutig ist. Das stimmt NICHT fuer I2C-Sensoren:

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

### Strategie: config_id (UUID) als primaerer Identifier fuer Einzel-Lookups

Die `config_id` (Format `cfg_{uuid}`) ist der eindeutige Identifier jeder Sensor-Konfiguration. Ueberall wo ein EINZELNER Sensor adressiert wird, MUSS `config_id` verwendet werden — nicht (gpio, sensor_type).

### 1. Neuer Lookup: `get_by_config_id(config_id: str)`

```python
# sensor_repo.py — NEUER primaerer Lookup
async def get_by_config_id(self, config_id: str) -> SensorConfig | None:
    """Lookup per config_id (UUID) — immer eindeutig."""
    stmt = select(SensorConfig).where(SensorConfig.config_id == config_id)
    result = await self.session.execute(stmt)
    return result.scalar_one_or_none()
```

Das ist der EINZIGE Lookup der `scalar_one_or_none()` nutzen darf — weil `config_id` per Definition eindeutig ist.

### 2. Bestehender Lookup `get_by_esp_and_gpio()` anpassen

Diese Methode MUSS eine Liste zurueckgeben, nicht ein einzelnes Ergebnis:

```python
# sensor_repo.py — BESTEHENDE Methode AENDERN
async def get_by_esp_and_gpio(self, esp_id: str, gpio: int) -> list[SensorConfig]:
    """Alle Sensoren auf diesem GPIO — gibt IMMER eine Liste zurueck."""
    stmt = select(SensorConfig).where(
        SensorConfig.esp_id == esp_id,
        SensorConfig.gpio == gpio
    )
    result = await self.session.execute(stmt)
    return list(result.scalars().all())
```

KEIN `scalar_one_or_none()` hier — denn (esp_id, gpio) ist NICHT eindeutig bei I2C.

### 3. Spezifischer Lookup fuer Health-Check / Multi-Sensor-Abfragen

```python
# sensor_repo.py — fuer gezielte Abfragen mit Disambiguierung
async def get_by_esp_gpio_and_type(
    self, esp_id: str, gpio: int, sensor_type: str,
    i2c_address: str | None = None
) -> SensorConfig | None:
    """Lookup mit voller Disambiguierung — eindeutig bei I2C."""
    stmt = select(SensorConfig).where(
        SensorConfig.esp_id == esp_id,
        SensorConfig.gpio == gpio,
        SensorConfig.sensor_type == sensor_type
    )
    if i2c_address is not None:
        stmt = stmt.where(SensorConfig.i2c_address == i2c_address)
    result = await self.session.execute(stmt)
    return result.scalar_one_or_none()
```

### 4. API-Endpoints anpassen

**GET /api/v1/sensors/{device_id}/{gpio}:**
- MUSS eine LISTE zurueckgeben (nicht ein einzelnes Objekt)
- Oder: Neuer Endpoint `GET /api/v1/sensors/config/{config_id}` fuer Einzel-Abfrage

**POST /api/v1/sensors/{device_id}/{gpio}** (Config-Update):
- Request-Body MUSS `config_id` enthalten
- Lookup per `get_by_config_id(config_id)` statt per (device_id, gpio)
- Alternativ: Neuer Endpoint `PUT /api/v1/sensors/config/{config_id}`

**Health-Check:**
- Muss `get_by_esp_and_gpio()` (Liste) nutzen und ueber alle Sensoren iterieren
- KEIN `scalar_one_or_none()` im Health-Check-Pfad

### 5. Alle Aufrufer pruefen

Jede Stelle die `get_by_esp_and_gpio()` aufruft und ein einzelnes Ergebnis erwartet, muss angepasst werden:
- Wenn Einzel-Sensor gemeint → `get_by_config_id()` verwenden
- Wenn alle Sensoren auf GPIO gemeint → Liste verarbeiten
- Health-Check, WebSocket-Handler, Scheduler — alle pruefen

---

## Was NICHT gemacht wird

- Kein Frontend-Code aendern (das ist T10-Fix-C)
- Keine DELETE-Logik aendern (das ist T10-Fix-B)
- Keine neuen DB-Spalten oder Migrationen — config_id existiert bereits
- Keine Aenderungen an der Sensor-Erstellung (AddSensorModal) — das funktioniert korrekt

---

## Akzeptanzkriterien

1. **GET /api/v1/sensors/{device_id}/0** gibt bei 6 I2C-Sensoren auf GPIO 0 eine Liste mit 6 Eintraegen zurueck (kein 500)
2. **POST /api/v1/sensors/config/{config_id}** (oder aehnlich) aktualisiert genau EINEN Sensor per UUID (kein 500)
3. **Health-Check** laeuft 30 Minuten ohne `MultipleResultsFound`-Fehler im Log (vorher: 150 Errors)
4. **Bestehende Tests** bleiben gruen (108+ Tests)
5. **Kein `scalar_one_or_none()`** auf Queries die (esp_id, gpio) ohne sensor_type/i2c_address als Filter nutzen
6. **Neuer Test:** `test_get_sensors_multiple_i2c_same_gpio()` — erstellt 4 SHT31-Configs auf GPIO 0 mit 2 verschiedenen I2C-Adressen, prueft dass GET alle 4 zurueckgibt

---

## Betroffene Dateien (geschaetzt)

| Datei | Aenderung |
|-------|-----------|
| `sensor_repo.py` | `get_by_config_id()` NEU, `get_by_esp_and_gpio()` → Liste, `get_by_esp_gpio_and_type()` NEU |
| `sensors.py` (API) | GET-Endpoint Liste, POST/PUT per config_id |
| `debug.py` | Mock-Sensor-Abfragen anpassen |
| `health_check.py` (oder aehnlich) | Iteration ueber Liste statt single lookup |
| `sensor_handler.py` | Pruefen ob Lookup-Aufrufe betroffen |
| Tests | Neue Tests fuer Multi-I2C-Szenario |
