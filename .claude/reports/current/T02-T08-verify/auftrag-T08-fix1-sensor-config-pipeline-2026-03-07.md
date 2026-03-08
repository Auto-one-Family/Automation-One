# Auftrag T08-Fix1: Sensor-Konfigurations-Pipeline — Key-Kollision, Dual-Storage-Sync, Multi-Value-Split, Delete-API

> **Bezug:** T02-T08 Verifikationsbericht (NB1, NB2, NB3, NB4, NB6, NB7, NB8, NB9, NB10, NB13, NB14, NB15)
> **Prioritaet:** KRITISCH — Blockiert Multi-Sensor-Setups und macht DS18B20-Konfiguration funktional nutzlos
> **Bereich:** El Servador (FastAPI/Python) + El Frontend (Vue 3 + TypeScript)
> **Datum:** 2026-03-07

---

## Kontext

AutomationOne hat 3 Schichten:
- **El Trabajante** (ESP32 Firmware) — Sensoren auslesen, Aktoren schalten
- **El Servador** (FastAPI/Python Backend) — Zentrale Verarbeitung, PostgreSQL, MQTT, Logic Engine
- **El Frontend** (Vue 3 + TypeScript Dashboard) — Visualisierung, Konfiguration

Die Sensor-Konfiguration durchlaeuft eine **Pipeline**: User konfiguriert im Frontend (AddSensorModal) → Frontend sendet an Backend-API → Backend speichert in DB (sensor_configs) UND in device_metadata.simulation_config (JSON) → SimulationScheduler startet Mock-Daten-Jobs → Frontend zeigt Ergebnis an.

Diese Pipeline hat **schwerwiegende Bugs**, die bei gaengigen Setups (mehrere DS18B20 auf einem OneWire-Bus, SHT31 Multi-Value) zu Datenverlust fuehren. Der Bericht zeigt: Ein zweiter DS18B20 ueberschreibt den ersten komplett, ein zweiter SHT31 ueberschreibt den ersten komplett, die Delete-API crasht bei Multi-Config, und der DS18B20-Frontend-Flow ignoriert alle User-Eingaben.

**Design-Prinzip 1 — Single Source of Truth:** Die Datenbank (PostgreSQL, Tabelle `sensor_configs`) ist die **einzige autoritative Quelle** fuer Sensor-Konfigurationen. Die `simulation_config` (JSON in `device_metadata.simulation_config.sensors`) ist ein **Write-Through Cache** fuer den SimulationScheduler — ein abgeleitetes Artefakt das jederzeit aus der DB regeneriert werden kann und muss. Wenn beide auseinanderlaufen, ist die DB korrekt und die simulation_config wird via `rebuild_simulation_config()` neu aufgebaut.

**Design-Prinzip 2 — Physischer vs. logischer Sensor:** Ein physischer Sensor (z.B. SHT31) kann mehrere logische Sensoren erzeugen (sht31_temp + sht31_humidity). Die Firmware splittet bereits korrekt (2 MQTT-Messages pro Lesung). Das Backend muss diesen Split nachbilden: 1 physischer Sensor = N logische `sensor_configs` in der DB. Das Dict `MULTI_VALUE_SENSORS` definiert die Aufspaltung. Die Firmware nutzt einen I2C-Cache um den physischen Sensor nur einmal pro Zyklus zu lesen (siehe `auftrag-multivalue-sensor-deduplizierung.md`).

**Design-Prinzip 3 — Sensor-Daten sind unverlierbar:** Sensordaten (Zeitreihen in `sensor_data`) werden NIEMALS geloescht, auch nicht bei Sensor- oder Device-Loeschung. Sie sind historisch wertvoll fuer Anomalie-Erkennung, Langzeit-Trends und Kalibrierungs-Referenz. Kein CASCADE DELETE auf sensor_data.

**GPIO-0-Konvention:** I2C-Sensoren (SHT31, BMP280, BME280) nutzen den I2C-Bus (Standard: SDA=GPIO 21, SCL=GPIO 22). Im System wird `gpio=0` als Default fuer I2C gespeichert — das bedeutet "kein dedizierter GPIO-Pin, I2C-Bus wird global geteilt". GPIO 0 ist ein ESP32 Strapping Pin und wird NIEMALS physisch als Sensor-Pin genutzt. Im UI sollte fuer I2C-Sensoren die I2C-Adresse (z.B. "0x44") angezeigt werden, nicht "GPIO 0".

---

## Reihenfolge und Abhaengigkeiten

Die Bugs haben kausale Zusammenhaenge. Die Reihenfolge ist entscheidend:

```
Fix A: Key-Format aendern (NB6)          ← GRUNDLAGE fuer alles
  │
  ├── Fix B: Dual-Storage-Sync (NB8)     ← Braucht neues Key-Format
  │     └── Fix E: Alert Cleanup (NB4, NB14, NB15)  ← Braucht saubere DB
  │
  ├── Fix C: Multi-Value-Split (NB10, NB2) ← Braucht neues Key-Format + Alembic-Migration
  │
  ├── Fix D: Delete-API (NB1, NB3)       ← Braucht eindeutige Keys (DB-IDs aus Fix A)
  │
  └── Fix F: DS18B20 Frontend (NB7)      ← Unabhaengig, aber Fix A muss zuerst
        └── Fix G: Subzone Slug (NB9)    ← Unabhaengig
              └── Fix H: Auth Race (NB13) ← Unabhaengig
```

### Alembic-Migration-Sequenz

Fix C erfordert eine Alembic-Migration (UNIQUE-Constraint aendern). Diese Migration muss VOR dem Deploy des neuen Codes laufen. Empfohlene Reihenfolge:

1. **Alembic-Migration erstellen und ausfuehren** (Fix C: Constraint-Aenderung)
2. **Backend deployen** (Fix A + B + C + D + E)
3. **Frontend deployen** (Fix F + G + H)
4. **Startup-Reconciliation** laufen lassen (Fix B: simulation_configs rebuilden)

Die Migration ist rueckwaertskompatibel — der neue Constraint `UNIQUE(esp_id, i2c_address, sensor_type)` ist lockerer als der alte `UNIQUE(esp_id, i2c_address)`. Bestehende Daten verletzen den neuen Constraint nicht.

---

## Fix A: Sensor-Key-Format aendern (NB6) — KRITISCH

### IST

Die `simulation_config.sensors` (JSON-Dict in device_metadata) nutzt den Key `{gpio}_{sensor_type}`:
- DS18B20 auf GPIO 4: `4_DS18B20`
- SHT31 auf GPIO 0: `0_sht31`

**Problem:** Wenn zwei DS18B20 auf demselben OneWire-Bus (GPIO 4) liegen, haben beide den Key `4_DS18B20`. Der zweite ueberschreibt den ersten. Gleiches bei zwei SHT31 mit verschiedenen I2C-Adressen (beide Key `0_sht31`).

**Loki-Evidenz:**
```
simulation.scheduler - WARNING - [MOCK_DF2C64E9] Sensor 4_DS18B20 already active
simulation.scheduler - WARNING - [MOCK_DF2C64E9] Sensor 0_sht31 already active
```
Der Server warnt, fuehrt das Ueberschreiben aber trotzdem aus.

### SOLL

Key-Format aendern zu **`sensor_config_id` aus der Datenbank** (Primary Key, UUID oder auto-increment ID).

**Warum DB-ID statt `{gpio}_{type}_{address}`:**

| Kriterium | Composite Natural Key (`{gpio}_{type}_{address}`) | DB-ID (Surrogate Key) |
|-----------|---------------------------------------------------|----------------------|
| Eindeutigkeit | Manuell sicherstellen (Adress-Parsing noetig) | **Automatisch garantiert** durch DB |
| Kopplung | An Hardware-Details gebunden (GPIO, Typ, Adresse) | **Entkoppelt** — Key aendert sich nie |
| Zukunftssicherheit | Neuer Sensor-Typ = neues Key-Format | **Universell** — funktioniert fuer jeden Sensor |
| Migration | Alte Keys muessen geparst/migriert werden | Alte Keys einmalig ersetzen |
| Parsing-Fehler | Trennzeichen `_` auch in Sensor-Typen (z.B. `sht31_temp`) = mehrdeutig | **Kein Parsing noetig** |
| Referenz-Integritaet | Keine FK-Beziehung moeglich | **FK zu sensor_configs.id** moeglich |

Die simulation_config.sensors wird zu einem Dict mit DB-IDs als Keys:
```python
# VORHER (fehlerhaft):
simulation_config.sensors = {
    "4_DS18B20": {...},      # Key kollidiert bei 2. DS18B20 auf GPIO 4
    "0_sht31": {...},        # Key kollidiert bei 2. SHT31
}

# NACHHER (korrekt):
simulation_config.sensors = {
    "cfg_a1b2c3d4": {...},   # DS18B20 #1 (Adresse 28FF0C79)
    "cfg_e5f6g7h8": {...},   # DS18B20 #2 (Adresse 28FF1A3B)
    "cfg_i9j0k1l2": {...},   # SHT31 Temp (0x44)
    "cfg_m3n4o5p6": {...},   # SHT31 Humidity (0x44)
}
```

Jeder Eintrag enthaelt weiterhin `sensor_type`, `gpio`, `address` etc. als Felder im Value-Objekt — aber der **Key** ist die DB-ID, nicht eine fragile Kombination aus Hardware-Feldern.

### Wo aendern

1. **Key-Generierungs-Funktion** (vermutlich in `debug.py` bei `add_sensor_to_mock()`):
   - Aktuell: `f"{sensor.gpio}_{sensor.sensor_type}"` → ERSETZEN durch `str(sensor_config.id)` oder `f"cfg_{sensor_config.id}"`
   - Die sensor_config muss ZUERST in der DB angelegt werden (um die ID zu haben), DANN wird der Key fuer simulation_config daraus abgeleitet

2. **SimulationScheduler** (wo simulation_config.sensors gelesen wird):
   - Muss mit neuen Keys (DB-IDs) umgehen
   - Braucht KEIN Parsing mehr — der Key ist ein opaker Identifier
   - Sensor-Metadaten (type, gpio, address) stehen im Value-Objekt

3. **Alle Stellen die simulation_config.sensors per Key referenzieren:**
   - Suche im Backend nach `f"{` + `sensor_type` oder `_DS18B20` oder `_sht31`
   - Suche nach Stellen die den Key parsen um gpio/type zu extrahieren → diese muessen stattdessen die Value-Felder lesen

4. **Migration bestehender Keys** (einmalig beim naechsten Start):
   ```python
   def migrate_simulation_config_keys(device):
       """Migriert alte Keys ({gpio}_{type}) zu DB-IDs. Idempotent."""
       old_sensors = device.metadata.simulation_config.get("sensors", {})
       if not old_sensors:
           return
       # Pruefen ob bereits migriert (Keys sehen aus wie IDs, nicht wie gpio_type)
       first_key = next(iter(old_sensors))
       if first_key.startswith("cfg_") or not "_" in first_key:
           return  # Bereits migriert oder leer
       # Alten Zustand komplett verwerfen, aus DB rebuilden (Fix B)
       rebuild_simulation_config(device.id)
   ```

### Validierung nach dem Fix

```
1. Zwei DS18B20 auf GPIO 4 mit verschiedenen OneWire-Adressen erstellen
   → simulation_config.sensors hat 2 Eintraege mit verschiedenen Keys (DB-IDs)
   → Kein WARNING "already active" in Loki
2. Zwei SHT31 (0x44, 0x45) erstellen
   → simulation_config.sensors hat 4 Eintraege (2x temp, 2x humidity)
   → Jeder Key ist eine DB-ID, kein gpio_type Composite
3. Bestehende Daten: Nach Migration keine alten Keys mehr in simulation_config
```

---

## Fix B: Dual-Storage-Synchronisation (NB8) — HOCH

### IST

Das System speichert Sensor-Konfigurationen an **zwei Stellen**:

1. **`sensor_configs`-Tabelle** (PostgreSQL) — Autoritative Quelle
   - Genutzt von: Monitor L2, SensorCards, Sensor-Data-Queries
   - Composite Key: `(esp_id, gpio, sensor_type)`

2. **`device_metadata.simulation_config.sensors`** (JSON in esp_devices-Tabelle)
   - Genutzt von: SimulationScheduler, Orbital-Anzeige, Heartbeat
   - Key: `{gpio}_{sensor_type}` (fehlerhaft, siehe Fix A)

Wenn `add_sensor_to_mock()` aufgerufen wird, schreibt es in die simulation_config. Wenn dabei ein Key kollidiert, wird der alte Eintrag ueberschrieben — aber der alte `sensor_configs` DB-Eintrag bleibt bestehen.

**Konsequenz (aus Screenshots bewiesen):**
- **Orbital** (liest simulation_config): zeigt "Klima Decke" (SHT31 #2, neu)
- **Monitor** (liest sensor_configs): zeigt "Klima Boden" (SHT31 #1, alt)
- User sieht zwei verschiedene Namen fuer denselben Sensor je nach View

### SOLL

**Die DB (sensor_configs) ist die Single Source of Truth.** Die simulation_config ist ein **Write-Through Cache** — ein abgeleitetes Artefakt das aus der DB berechnet wird.

**Warum Dual-Storage ueberhaupt existiert:** Der SimulationScheduler braucht schnellen, synchronen Zugriff auf die Sensor-Konfiguration um Mock-Daten-Jobs zu starten/stoppen. Die simulation_config (JSON in device_metadata) dient als In-Memory-Cache fuer den Scheduler. Die DB (sensor_configs) ist die autoritative Quelle fuer ALLE anderen Konsumenten (Monitor, Orbital, API-Responses). Deshalb darf die simulation_config NIEMALS direkt beschrieben werden — sie wird immer aus der DB ABGELEITET.

**Architektur-Pattern: Write-Through Cache mit Rebuild-Funktion**

```
Schreibvorgang (Add/Update/Delete Sensor):
  1. sensor_configs DB → INSERT/UPDATE/DELETE (autoritativ)
  2. rebuild_simulation_config(device_id) → Cache aus DB neu ableiten
  3. SimulationScheduler → Jobs anpassen (start/stop/update)

Lesevorgang:
  Monitor, Orbital, API → lesen aus sensor_configs DB (autoritativ)
  SimulationScheduler   → liest aus simulation_config JSON (Cache)
```

### Drei Massnahmen (alle PFLICHT)

**Massnahme 1: `rebuild_simulation_config(device_id)` als zentrale Funktion**

```python
async def rebuild_simulation_config(device_id: str, db: AsyncSession):
    """Baut simulation_config komplett aus sensor_configs DB-Eintraegen neu auf.

    PFLICHT nach jedem Create/Update/Delete auf sensor_configs.
    Idempotent — kann jederzeit sicher aufgerufen werden.
    """
    configs = await sensor_config_repo.get_active_by_device(db, device_id)
    new_sensors = {}
    for cfg in configs:
        key = f"cfg_{cfg.id}"  # DB-ID als Key (Fix A)
        new_sensors[key] = {
            "sensor_type": cfg.sensor_type,
            "name": cfg.name,
            "raw_value": cfg.raw_value,
            "unit": cfg.unit,
            "gpio": cfg.gpio,
            "i2c_address": cfg.i2c_address,
            "onewire_address": cfg.onewire_address,
            "interface_type": cfg.interface_type,
            "mode": cfg.mode,
            "subzone_id": str(cfg.subzone_id) if cfg.subzone_id else None,
        }

    device = await esp_device_repo.get(db, device_id)
    device.metadata.simulation_config["sensors"] = new_sensors
    await db.commit()
```

**Warum rebuild statt inkrementell:** Inkrementelle Updates (nur den einen geaenderten Eintrag anpassen) sind fehleranfaellig — wenn ein vorheriger Update fehlschlug, ist der Cache dauerhaft inkonsistent. Ein vollstaendiger Rebuild ist idempotent und selbstheilend: Egal was vorher schiefging, nach dem Rebuild stimmt der Cache mit der DB ueberein. Die Performance ist unkritisch (typisch <10 Sensoren pro Device).

**Massnahme 2: Jeden Schreibvorgang durch rebuild absichern**

Alle Stellen die sensor_configs aendern muessen anschliessend `rebuild_simulation_config()` aufrufen:
- `add_sensor()` / `add_sensor_to_mock()` → nach DB-Insert: rebuild
- `delete_sensor()` → nach DB-Delete: rebuild
- `update_sensor()` → nach DB-Update: rebuild
- `create_mock_device()` → nach Batch-Insert aller Sensoren: rebuild (einmal am Ende, nicht pro Sensor)

**NICHT** die simulation_config direkt beschreiben. Die simulation_config wird NUR durch `rebuild_simulation_config()` geschrieben.

**Massnahme 3: Duplikat-Schutz in der DB (nicht im Cache)**

```python
# VOR dem Insert: Pruefen ob Sensor mit gleicher physischer Identitaet existiert
existing = await sensor_config_repo.find_by_physical_identity(
    db, esp_id=esp_id, gpio=gpio, sensor_type=sensor_type,
    i2c_address=i2c_address, onewire_address=onewire_address
)
if existing:
    raise HTTPException(
        status_code=409,  # Conflict
        detail=f"Sensor {sensor_type} an Adresse {i2c_address or onewire_address} "
               f"auf GPIO {gpio} existiert bereits (ID: {existing.id})"
    )
```

Die Pruefung findet auf DB-Ebene statt (nicht im Cache), weil die DB die Single Source of Truth ist. HTTP 409 (Conflict) ist semantisch korrekt — der Client versucht eine Ressource zu erstellen die bereits existiert.

**Optional aber empfohlen: Startup-Reconciliation**

Beim Service-Start einmalig alle Devices durchgehen und `rebuild_simulation_config()` aufrufen. Das heilt eventuelle Inkonsistenzen die durch Crashes oder unvollstaendige Updates entstanden sind:

```python
# In startup.py oder lifespan handler:
async def reconcile_simulation_configs(db: AsyncSession):
    """Einmalig beim Start: Alle simulation_configs aus DB rebuilden."""
    devices = await esp_device_repo.get_all_with_mock_flag(db)
    for device in devices:
        await rebuild_simulation_config(device.device_id, db)
    logger.info(f"Reconciled simulation_config for {len(devices)} devices")
```

### Validierung

```
1. SHT31 #1 erstellen (0x44)
   → sensor_configs: 2 DB-Eintraege (temp + humidity)
   → simulation_config: 2 Eintraege (via rebuild)
   → Keys sind DB-IDs (cfg_xxx)
2. SHT31 #2 auf gleicher Adresse (0x44) versuchen
   → HTTP 409 Conflict (nicht stillschweigendes Ueberschreiben)
3. SHT31 #2 auf anderer Adresse (0x45) erstellen
   → sensor_configs: 4 DB-Eintraege
   → simulation_config: 4 Eintraege (via rebuild)
4. Orbital und Monitor zeigen IDENTISCHE Sensor-Namen
   (weil beide jetzt aus derselben DB-Quelle lesen bzw. daraus abgeleitet werden)
5. Service neustarten → simulation_config stimmt weiterhin mit DB ueberein (Reconciliation)
```

---

## Fix C: Multi-Value-Split im Einzel-Add-Pfad (NB10, NB2) — MITTEL

### IST

**Batch-Create** (vermutlich `create_mock_device()` in `debug.py`): Ruft `is_multi_value_sensor()` auf und splittet SHT31 in `sht31_temp` + `sht31_humidity`. Erstellt 2 Eintraege in simulation_config. **Korrekt.**

**Einzel-Add** (vermutlich `add_sensor()` in `debug.py` oder `sensor_service.py`): Kein Multi-Value-Split. Speichert als `0_sht31` (combined). SimulationScheduler startet nur 1 Job. **Orbital zeigt nur Temperatur-Satellite, kein Humidity-Satellite.**

Der User sieht im Toast "SHT31 (Temp + Humidity): 2 Messwerte erstellt" — das ist korrekt fuer die sensor_configs-Tabelle (2 DB-Eintraege). Aber die simulation_config hat nur 1 Eintrag (`0_sht31`), und der SimulationScheduler startet nur 1 Job.

**Zusaetzlich (NB2):** Die I2C-Adress-Uniqueness-Constraint (`UNIQUE(esp_id, i2c_address)`) blockiert den Multi-Value-Split, weil SHT31 Temp und SHT31 Humidity dieselbe I2C-Adresse haben. Das ist physikalisch korrekt — ein SHT31 hat EINE Adresse und liefert ZWEI Messwerte.

### SOLL

`add_sensor()` muss denselben Multi-Value-Split wie `create_mock_device()` ausfuehren:

1. Pruefen: `is_multi_value_sensor(sensor_type)` → True fuer sht31, bme280
2. Wenn True: 2 (oder 3) Eintraege erstellen:
   - `sht31_temp` (sensor_type=temperature, name="{user_name} Temperatur")
   - `sht31_humidity` (sensor_type=humidity, name="{user_name} Feuchtigkeit")
3. In simulation_config: 2 separate Keys (neues Format aus Fix A)
4. SimulationScheduler: 2 separate Jobs

**I2C-Uniqueness (NB2):**
Der Constraint muss angepasst werden: `UNIQUE(esp_id, i2c_address, sensor_type)` statt `UNIQUE(esp_id, i2c_address)`. Zwei logische Sensoren (temperature + humidity) auf derselben I2C-Adresse (0x44) muessen moeglich sein.

### Wo aendern

1. **`add_sensor()` Funktion** (vermutlich `debug.py` oder `sensor_service.py`):
   Multi-Value-Check einbauen, analog zu `create_mock_device()`. Die Logik muss identisch sein — eine gemeinsame Funktion extrahieren die BEIDE Pfade nutzen:

   ```python
   # Zentrales Multi-Value-Dict — EINE Stelle, EINE Wahrheit
   # Dieses Dict existiert vermutlich bereits im Backend (aus auftrag-device-sensor-lifecycle-fix)
   MULTI_VALUE_SENSORS = {
       "sht31":  [("sht31_temp", "temperature", "°C"), ("sht31_humidity", "humidity", "%")],
       "bmp280": [("bmp280_temp", "temperature", "°C"), ("bmp280_pressure", "pressure", "hPa")],
       "bme280": [("bme280_temp", "temperature", "°C"), ("bme280_humidity", "humidity", "%"),
                  ("bme280_pressure", "pressure", "hPa")],
   }

   def is_multi_value_sensor(sensor_type: str) -> bool:
       """True wenn der Basis-Typ mehrere logische Sensoren erzeugt."""
       return sensor_type.lower() in MULTI_VALUE_SENSORS

   def expand_multi_value(base_type: str, user_name: str, **common_fields):
       """Expandiert einen Basis-Typ in N logische sensor_configs.

       Beispiel: expand_multi_value("sht31", "Klima Boden", gpio=0, i2c_address="0x44")
       → [SensorConfigCreate(sensor_type="sht31_temp", name="Klima Boden Temperatur", ...),
          SensorConfigCreate(sensor_type="sht31_humidity", name="Klima Boden Feuchtigkeit", ...)]
       """
       sub_types = MULTI_VALUE_SENSORS[base_type.lower()]
       configs = []
       for sub_type, measurement, default_unit in sub_types:
           configs.append(SensorConfigCreate(
               sensor_type=sub_type,
               name=f"{user_name} {measurement.capitalize()}" if user_name else sub_type,
               unit=default_unit,
               **common_fields,
           ))
       return configs
   ```

   **Warum gemeinsame Funktion:** `create_mock_device()` (Batch) und `add_sensor()` (Einzel) muessen exakt denselben Split durchfuehren. Duplizierte Logik fuehrt unweigerlich zu Drift — genau das hat den aktuellen Bug verursacht.

2. **DB-Constraint:** Alembic-Migration fuer `UNIQUE(esp_id, i2c_address, sensor_type)`

   **Warum der alte Constraint falsch ist:** `UNIQUE(esp_id, i2c_address)` verbietet zwei logische Sensoren auf derselben I2C-Adresse. Aber ein SHT31 an Adresse 0x44 produziert physikalisch ZWEI Messwerte (Temperatur + Feuchtigkeit). Im Backend sind das 2 sensor_configs mit derselben i2c_address aber verschiedenem sensor_type. Der alte Constraint blockiert das.

   **Alembic-Migration (konkreter Ablauf):**

   ```python
   """Change UNIQUE constraint on sensor_configs for multi-value I2C sensors.

   Revision ID: xxxx
   """

   def upgrade():
       # 1. Alten Constraint droppen (Name im Code oder DB pruefen!)
       op.drop_constraint(
           "uq_sensor_configs_esp_id_i2c_address",  # EXAKTEN Namen aus DB lesen
           "sensor_configs",
           type_="unique"
       )
       # 2. Neuen Constraint anlegen (mit sensor_type als zusaetzliche Spalte)
       op.create_unique_constraint(
           "uq_sensor_configs_esp_i2c_type",
           "sensor_configs",
           ["esp_id", "i2c_address", "sensor_type"]
       )

   def downgrade():
       # ACHTUNG: Downgrade nur moeglich wenn keine Multi-Value-Duplikate existieren!
       op.drop_constraint("uq_sensor_configs_esp_i2c_type", "sensor_configs", type_="unique")
       op.create_unique_constraint(
           "uq_sensor_configs_esp_id_i2c_address",
           "sensor_configs",
           ["esp_id", "i2c_address"]
       )
   ```

   **WICHTIG:** Den exakten Namen des bestehenden Constraints aus der Datenbank lesen (`\d sensor_configs` in psql oder `SELECT constraint_name FROM information_schema.table_constraints WHERE table_name = 'sensor_configs'`). Alembic braucht den exakten Namen um ihn zu droppen. Wenn der Constraint keinen expliziten Namen hat (auto-generiert), den auto-generierten Namen verwenden.

   **Bestehende Daten pruefen:** Vor der Migration sicherstellen dass keine Duplikate existieren die den neuen Constraint verletzen wuerden:
   ```sql
   SELECT esp_id, i2c_address, sensor_type, COUNT(*)
   FROM sensor_configs
   WHERE i2c_address IS NOT NULL
   GROUP BY esp_id, i2c_address, sensor_type
   HAVING COUNT(*) > 1;
   -- Muss 0 Zeilen zurueckgeben
   ```

3. **SimulationScheduler:** Muss fuer Multi-Value-Sensoren separate Jobs starten (wird automatisch korrekt wenn `rebuild_simulation_config()` aus Fix B die expandierten sensor_configs in die simulation_config schreibt — jeder logische Sensor bekommt seinen eigenen Eintrag mit eigener DB-ID als Key)

### SHT31-Fachkontext (fuer den Entwickler)

Der SHT31 ist ein Sensirion I2C-Sensor der **pro Lesung 6 Bytes** liefert: 2 Bytes Temperatur + CRC + 2 Bytes Feuchtigkeit + CRC. Es ist physikalisch EIN Sensor an EINER Adresse (0x44 oder 0x45), der ZWEI Messwerte produziert. Die Firmware (El Trabajante) splittet diese Werte bereits und sendet 2 MQTT-Messages:
```
sensor/data → {"sensor_id": "sht31_temp", "value": 22.5, "unit": "°C"}
sensor/data → {"sensor_id": "sht31_hum",  "value": 65.2, "unit": "%"}
```
Das Backend muss diesen Split nachbilden: Ein physischer SHT31 = 2 logische sensor_configs.

### Validierung

```
1. SHT31 per Drag&Drop hinzufuegen
2. Orbital zeigt 2 Satellites: Temperatur + Feuchtigkeit
3. Monitor zeigt 2 SensorCards
4. simulation_config hat 2 Eintraege (sht31_temp + sht31_humidity)
5. Zweiten SHT31 (0x45) hinzufuegen → 4 Satellites, 4 SensorCards
```

---

## Fix D: Sensor-Delete-API (NB1, NB3) — HOCH

### IST

`DELETE /api/v1/sensors/{esp_id}/{gpio}` crasht mit **500 Internal Server Error** wenn 2+ Sensor-Configs auf demselben GPIO existieren. Die Ursache: `get_by_esp_and_gpio()` nutzt `scalar_one_or_none()` und erhaelt 2 Ergebnisse (z.B. sht31_temp + sht31_humidity auf GPIO 0, oder 2 DS18B20 auf GPIO 4).

Zusaetzlich (NB3): Der Monitor zeigt Ghost-Sensoren von geloeschten Devices. Das deutet darauf hin dass die Delete-Pipeline nicht alle abhaengigen Daten aufraeumt.

### Technische Ursache des 500-Errors

SQLAlchemy's `scalar_one_or_none()` gibt genau 1 Ergebnis zurueck oder None. Wenn die Query 2+ Ergebnisse findet (z.B. `sht31_temp` + `sht31_humidity` auf demselben GPIO), wirft sie `MultipleResultsFound` — ein unbehandelter Exception der zum 500 Internal Server Error wird.

```python
# AKTUELL (fehlerhaft):
config = await db.execute(
    select(SensorConfig)
    .where(SensorConfig.esp_id == esp_id, SensorConfig.gpio == gpio)
).scalar_one_or_none()
# → MultipleResultsFound bei SHT31 (2 Configs auf GPIO 0) oder 2 DS18B20 auf GPIO 4
```

### SOLL

**Empfehlung: DELETE per sensor_config_id (Option A)**

```
DELETE /api/v1/sensors/{esp_id}/{sensor_config_id}
```

**Warum Option A und nicht Option B oder C:**

| Kriterium | Option A (per ID) | Option B (per GPIO, alle loeschen) | Option C (per GPIO + Adresse) |
|-----------|-------------------|-----------------------------------|-------------------------------|
| Eindeutigkeit | **Immer eindeutig** (DB Primary Key) | Loescht potentiell ungewollt | Parsing noetig, Adress-Format variiert |
| Granularitaet | **Einzelnen Sensor loeschen** | Alles-oder-nichts pro GPIO | Einzeln, aber komplex |
| Konsistenz mit Fix A | **Perfekt** — gleiche DB-IDs ueberall | Braucht GPIO-Logik | Braucht Adress-Logik |
| Frontend-Aufwand | ID ist bereits im Frontend verfuegbar (API-Response) | Minimal | Zusaetzliches Routing |
| Multi-Value-Handling | Explizit: User loescht temp ODER humidity ODER beides | Implizit: Loescht alles auf GPIO | GPIO + Adresse = immer noch mehrdeutig bei Multi-Value |

**Fuer Multi-Value-Sensoren (SHT31, BMP280, BME280) zusaetzlich:** Wenn der User einen Multi-Value-Sensor "als Ganzes" loeschen will (z.B. "SHT31 an 0x44 komplett entfernen"), sollte das Frontend BEIDE sensor_config_ids (temp + humidity) in separaten DELETE-Requests oder einem Batch-Delete senden. Alternativ: Ein convenience Endpoint `DELETE /api/v1/sensors/{esp_id}/by-address/{i2c_address}` der alle Configs mit dieser Adresse loescht. Das ist ZUSAETZLICH zu Option A, nicht stattdessen.

### Delete-Pipeline (vollstaendig)

```python
async def delete_sensor_config(esp_id: str, config_id: int, db: AsyncSession):
    """Loescht eine sensor_config und raeumt alle Abhaengigkeiten auf."""

    # 1. sensor_config laden (404 wenn nicht gefunden)
    config = await sensor_config_repo.get_by_id(db, config_id)
    if not config or config.esp_id != esp_id:
        raise HTTPException(404, f"SensorConfig {config_id} nicht gefunden")

    # 2. sensor_config loeschen (DB) — sensor_data Zeilen BEHALTEN (kein CASCADE)
    await sensor_config_repo.delete(db, config_id)

    # 3. simulation_config aus DB rebuilden (Fix B)
    #    → entfernt den geloeschten Sensor automatisch aus dem Cache
    await rebuild_simulation_config(esp_id, db)

    # 4. SimulationScheduler benachrichtigen → Job stoppen
    await simulation_scheduler.stop_sensor_job(esp_id, f"cfg_{config_id}")

    # 5. WebSocket-Event an Frontend senden
    await ws_manager.broadcast(esp_id, {
        "type": "sensor_config_deleted",
        "config_id": config_id,
        "esp_id": esp_id,
    })

    # 6. sensor_data Zeilen BEWUSST NICHT loeschen
    #    → Historische Daten sind wertvoll (Anomalie-Erkennung, Langzeit-Trends)
    #    → Referenz-Integritaet: sensor_data.sensor_config_id wird "orphaned"
    #       Das ist akzeptabel — wie ein "Archiv" ehemaliger Sensoren
```

**Warum sensor_data behalten:** Sensordaten sind Zeitreihen die nie reproduzierbar sind. Ein Sensor der letzte Woche lief und jetzt geloescht wird — seine Daten sind historisch relevant (Trends, Anomalie-Baseline, Kalibrierungs-Referenz). Kein CASCADE DELETE auf sensor_data.

### Ghost-Sensor-Cleanup (NB3)

Nach Device-Delete bleiben Sensor-Referenzen in Frontend-Stores. Drei Stellen pruefen und fixen:

1. **Monitor-Store / espStore:** Muss auf das WebSocket-Event `sensor_config_deleted` reagieren und den Sensor aus dem lokalen State entfernen. Wenn kein solches Event existiert: auf `device_updated` reagieren und Sensor-Liste neu laden.

2. **API-Endpoints fuer Monitor-Daten:** Query muss `sensor_configs.deleted_at IS NULL` oder `sensor_configs` JOIN auf existierende Eintraege filtern. Geloeschte Configs duerfen NICHT in API-Responses auftauchen.

3. **WebSocket-Event:** `sensor_config_deleted` (siehe Pipeline oben) MUSS implementiert werden. Das Frontend muss darauf reagieren, sonst bleiben Ghost-Sensoren bis zum naechsten Page-Reload sichtbar.

### Validierung

```
1. SHT31 erstellen (2 logische Sensoren: sht31_temp config_id=42, sht31_humidity config_id=43)
2. DELETE /api/v1/sensors/{esp_id}/42 → 200 OK (Temperatur geloescht)
3. sensor_configs: 1 Eintrag (nur humidity bleibt)
4. simulation_config: 1 Eintrag (nur humidity, via rebuild)
5. Monitor aktualisiert sich live (kein Ghost fuer Temperatur)
6. sensor_data Zeilen fuer config_id=42 weiterhin vorhanden
7. DELETE /api/v1/sensors/{esp_id}/43 → 200 OK (Humidity geloescht)
8. sensor_configs: 0 Eintraege, simulation_config: 0 Eintraege
```

---

## Fix E: Alert/Notification Stale Data (NB4, NB14, NB15) — MITTEL

### IST

1. **NB4:** AlertStatusBar zeigt "9 aktive Alerts" bei 0 Sensoren/0 Devices. Alerts von geloeschten Devices werden mitgezaehlt.
2. **NB14:** Monitor zeigt 6 Zonen, davon 4 Zombie-Zonen ohne Geraete (Gewaechshaus-Alpha, Test, Test-Zone, gewaechshaus-alpha).
3. **NB15:** Alert-Counter springt von 13 auf 14 beim Erstellen eines leeren Mock ESP. Ein Geraet ohne Sensoren sollte keinen Alert erzeugen.

### SOLL

**Alerts:**
- Alert-Query muss `deleted_at IS NULL` auf dem zugehoerigen Device pruefen
- Beim Device-Delete: Alle offenen Alerts dieses Devices automatisch resolven (Status → "resolved", Grund: "Device geloescht")
- Alert bei Mock-Erstellung ohne Sensoren: Kein Alert erzeugen fuer "0 Sensoren konfiguriert" — das ist ein normaler Zustand bei neuen Devices

**Zombie-Zonen:**
- Zonen ohne Geraete im Monitor als "Leer" kennzeichnen oder ausblenden
- ODER: Zone-Cleanup-API die leere Zonen entfernt
- Die 4 Zombie-Zonen (Gewaechshaus-Alpha, Test, Test-Zone, gewaechshaus-alpha) sollten geloescht oder konsolidiert werden koennen

### Wo aendern

1. **Alert-Service:** Query mit JOIN auf esp_devices WHERE deleted_at IS NULL
2. **Alert-Pipeline:** Device-Delete-Event → alle offenen Alerts resolven
3. **Mock-Create:** Keinen "health check" Alert bei 0 Sensoren — das ist erwarteter Zustand
4. **Monitor L1:** Leere Zonen entweder filtern oder am Ende anzeigen (wie im Screenshot S17 — Zombie-Zonen erscheinen am Ende, das ist akzeptabel wenn sie als "Leer" markiert sind)

### Validierung

```
1. Bei 0 Devices: AlertStatusBar zeigt 0 oder ist ausgeblendet
2. Device loeschen → zugehoerige Alerts werden "resolved"
3. Mock erstellen ohne Sensoren → kein neuer Alert
4. Zombie-Zonen: Entweder ausblendbar oder explizit als "Leer" markiert
```

---

## Fix F: DS18B20 Frontend AddSensorModal — User-Eingaben uebernehmen (NB7) — HOCH

### IST

Der DS18B20 OneWire-Add-Flow im Frontend **ignoriert alle User-Eingaben**:

| Feld | User gibt ein | Backend erhaelt | Beweis |
|------|--------------|-----------------|--------|
| Name | "Wassertemperatur Becken 1" | "Temp 0C79" (auto-generiert) | Screenshot S08 |
| Startwert | 24.5 | 0.0 | Screenshot S08, API |
| Einheit | "°C" | "" (leerer String) | API-Response |
| Timeout | 120 | (Default) | API-Response |
| Subzone | "Naehrloesung" | Nicht uebernommen | API-Response |

Der SHT31-Add-Flow funktioniert korrekt — Name "Klima Boden", Startwert 25.8°C werden uebernommen (Screenshot S13). Das bedeutet: **Zwei verschiedene Code-Pfade** im AddSensorModal — der OneWire-Pfad ist defekt.

### SOLL

Der OneWire-Add-Flow muss dieselben Felder an die API senden wie der I2C-Flow:
- `name`: User-Eingabe (Fallback: auto-generierter Name)
- `raw_value` / `base_value`: User-Startwert
- `unit`: "°C" (oder User-Eingabe)
- `timeout`: User-Eingabe
- `subzone_id`: Ausgewaehlte Subzone
- `mode`: "continuous" / "scheduled" / "paused"

### Wo aendern

**`AddSensorModal.vue`** (oder die Komponente die das "Sensor hinzufuegen" Modal rendert):

**Das Problem ist ein fehlender Payload-Mapping-Schritt im OneWire-Flow.** Der I2C-Flow baut das API-Payload korrekt aus den Formularfeldern zusammen. Der OneWire-Flow ueberspringt diesen Schritt und sendet nur die Bus-Scan-Daten (Adresse, auto-generierter Name) direkt an die API — die User-Eingaben (Name, Startwert, Einheit, Subzone) werden ignoriert.

**Loesung: Gemeinsame `buildSensorPayload()`-Funktion** die BEIDE Flows nutzen:

```typescript
// Gemeinsame Funktion fuer I2C UND OneWire
function buildSensorPayload(formData: SensorFormData): SensorConfigCreate {
  return {
    sensor_type: formData.sensorType,
    name: formData.name || formData.autoGeneratedName,  // User-Name mit Fallback
    raw_value: formData.startValue ?? 0.0,
    unit: formData.unit || getDefaultUnit(formData.sensorType),
    gpio: formData.gpio,
    i2c_address: formData.i2cAddress ?? null,
    onewire_address: formData.onewireAddress ?? null,
    interface_type: formData.interfaceType,
    subzone_id: formData.subzoneId ?? null,
    timeout: formData.timeout ?? 120,
    mode: formData.mode ?? "continuous",
  };
}

// I2C-Flow nutzt buildSensorPayload() → FUNKTIONIERT BEREITS
// OneWire-Flow MUSS AUCH buildSensorPayload() nutzen → AKTUELL DEFEKT
```

**Konkreter Fix im OneWire-Flow:**
1. Den Codepfad finden der nach dem Bus-Scan (`onewire_scan` oder aehnlich) die gefundenen Devices anzeigt
2. Wenn der User ein Device auswaehlt und "Hinzufuegen" klickt: Die Formularfelder (name, startValue, unit, subzone, timeout) muessen in das Payload-Objekt einfliessen
3. `buildSensorPayload()` nutzen statt ein Minimal-Objekt mit nur Adresse und Auto-Name zu senden
4. Fallback fuer Auto-Name beibehalten: `"Temp {last4_of_onewire_address}"` wenn kein Name eingegeben

### DS18B20-Fachkontext

DS18B20 sind OneWire-Sensoren. Mehrere DS18B20 koennen am selben GPIO-Pin haengen (OneWire-Bus). Jeder hat eine eindeutige 64-bit ROM-Adresse (z.B. 28FF...0C79). Der OneWire-Scan findet alle Geraete auf dem Bus. Der User waehlt eines aus, gibt Name/Subzone/Startwert ein, und das Frontend sendet die Konfiguration ans Backend. Das Backend muss die OneWire-Adresse als Teil des Keys verwenden (Fix A).

### Validierung

```
1. DS18B20 hinzufuegen mit Name "Wassertemperatur Becken 1", Startwert 24.5, Subzone "Naehrloesung"
2. Orbital zeigt "Wassertemperatur Becken 1" (nicht "Temp 0C79")
3. Orbital zeigt 24.5 °C (nicht 0.0 °C)
4. API: name="Wassertemperatur Becken 1", raw_value=24.5, unit="°C"
```

---

## Fix G: Subzone-Slug Umlaut-Transliteration (NB9) — MITTEL

### IST

Subzone-Name "Naehrloesung" wird zu Slug `n_hrl_sung` — Umlaute (ae, oe, ue) werden komplett entfernt statt transliteriert.

### SOLL

Umlaut-Transliteration VOR dem Slugify:
- ä → ae, ö → oe, ü → ue, ß → ss
- Dann erst lowercase + replace non-alnum mit underscore

Ergebnis: "Naehrloesung" → `naehrloesung`, "Nährlösung" → `naehrloesung`

### Warum der aktuelle Code falsch transliteriert

Falls das Backend `python-slugify` oder `Unidecode` nutzt: Diese Libraries transliterieren ä→a, ö→o, ü→u (NICHT ä→ae). Das ist beabsichtigt — Unidecode ist sprachneutral und behandelt Umlaute als diakritische Zeichen, nicht als deutsche Buchstabenpaare. Finnisch, Tuerkisch und andere Sprachen nutzen dieselben Zeichen mit anderer Transliteration.

Falls kein Library genutzt wird und ein eigener Regex `[^a-z0-9]` zum Entfernen verwendet wird: Das loescht Umlaute komplett (ä, ö, ü sind nicht in `[a-z0-9]`).

### Wo aendern

**`subzone_service.py`** (oder wo der Slug generiert wird):

Die Loesung ist ein **deutscher Pre-Processing-Schritt VOR dem Slugify**. Das ist die anerkannte Best Practice fuer deutschsprachige Systeme — egal ob `python-slugify`, `Unidecode` oder eigener Regex danach kommt.

```python
import re

def transliterate_german(text: str) -> str:
    """Deutsche Umlaute VOR dem Slugify ersetzen.

    Muss VOR jeder anderen Transliteration/Slugify-Funktion aufgerufen werden,
    weil Unidecode/python-slugify ae→a statt ae→ae machen.
    """
    replacements = {
        'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'ß': 'ss',
        'Ä': 'Ae', 'Ö': 'Oe', 'Ü': 'Ue',
    }
    for char, replacement in replacements.items():
        text = text.replace(char, replacement)
    return text

def slugify(name: str) -> str:
    """Erzeugt einen URL/ID-sicheren Slug aus einem deutschen Namen."""
    name = transliterate_german(name)
    name = name.lower().strip()
    name = re.sub(r'[^a-z0-9]+', '_', name)  # Nicht-alphanumerisch → Unterstrich
    name = re.sub(r'_+', '_', name)           # Mehrfach-Unterstriche zusammenfassen
    name = name.strip('_')                     # Fuehrende/abschliessende Unterstriche entfernen
    return name
```

**Migration bestehender Slugs:** Bestehende fehlerhafte Slugs (z.B. `n_hrl_sung`) muessen einmalig korrigiert werden. Entweder per Alembic data migration oder per Admin-API:
```sql
-- Nur zur Diagnose: Welche Slugs sind betroffen?
SELECT id, name, slug FROM subzone_configs
WHERE slug != expected_slugify(name);
-- Dann: Slugs aus Namen neu generieren (in Python, nicht in SQL)
```

### Validierung

```
"Nährlösung"       → "naehrloesung"
"Gewächshaus Alpha" → "gewaechshaus_alpha"
"Lüft oben"        → "lueft_oben"
"Große Straße"     → "grosse_strasse"
"Test-Zone 1"      → "test_zone_1"
"Already ASCII"    → "already_ascii"
```

---

## Fix H: Auth Race bei Mock-Erstellung (NB13) — NIEDRIG

### IST

Console zeigt `401 Unauthorized` auf `POST /api/v1/debug/mock-esp` beim Erstellen. Mock wird trotzdem erstellt. Das deutet auf ein **Token-Refresh-Race** hin: Der Request geht raus mit abgelaufenem Token → 401 → Interceptor refresht Token → Retry mit neuem Token → 201 Created. Der 401 ist ein Artefakt des Refresh-Zyklus, kein echter Authentifizierungsfehler.

### Technische Ursache

Das klassische Problem bei Axios-Interceptors mit Token-Refresh:

```
Zeitlinie:
  t0: Token laeuft ab
  t1: Request A geht raus (mit abgelaufenem Token) → 401
  t2: Interceptor startet Token-Refresh
  t3: Request B geht raus (BEVOR Refresh fertig) → 401 (zweiter 401!)
  t4: Refresh kommt zurueck → neuer Token
  t5: Request A wird mit neuem Token retried → 201
  t6: Request B wird mit neuem Token retried → 201
```

Ohne Queue werden bei parallelen Requests MEHRERE Refresh-Calls gleichzeitig ausgeloest, und die 401-Errors fluten die Console.

### SOLL: Promise-Queue Pattern

Das bewaehrte Pattern (verwendet u.a. von `axios-auth-refresh`): Ein `isRefreshing`-Flag und eine `failedQueue` die alle 401-Requests parkt bis der Refresh abgeschlossen ist.

```typescript
// In api.ts oder http-client.ts

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: Error) => void;
}> = [];

function processQueue(error: Error | null, token: string | null) {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token!);
    }
  });
  failedQueue = [];
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Nur bei 401 und wenn es kein Retry ist
    if (error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    // Wenn bereits ein Refresh laeuft: Request in Queue parken
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      }).then((token) => {
        originalRequest.headers.Authorization = `Bearer ${token}`;
        return api(originalRequest);
      });
    }

    // Erster 401: Refresh starten
    originalRequest._retry = true;
    isRefreshing = true;

    try {
      const { accessToken } = await authStore.refreshAccessToken();
      processQueue(null, accessToken);  // Alle geparkten Requests freigeben
      originalRequest.headers.Authorization = `Bearer ${accessToken}`;
      return api(originalRequest);
    } catch (refreshError) {
      processQueue(refreshError as Error, null);  // Alle geparkten Requests rejecten
      authStore.logout();  // Token nicht erneuerbar → Logout
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);
```

**Warum dieses Pattern robust ist:**
- **Genau EIN Refresh** pro abgelaufenem Token (kein Race zwischen parallelen Requests)
- **Alle wartenden Requests** werden automatisch mit dem neuen Token retried
- **Kein 401 in der Console** — der Interceptor faengt den 401 ab bevor er in der Console erscheint
- **Graceful Degradation:** Wenn der Refresh fehlschlaegt (z.B. Refresh-Token auch abgelaufen), werden alle Requests sauber rejected und der User wird ausgeloggt

**Wo aendern:** Die Datei die den Axios-Client konfiguriert (vermutlich `api.ts`, `http-client.ts` oder `axios.ts` im Frontend). Pruefen ob bereits ein Interceptor existiert — wenn ja, um das Queue-Pattern erweitern, nicht einen zweiten Interceptor hinzufuegen.

**Alternative:** Falls der Aufwand zu gross ist oder der bestehende Interceptor schwer zu modifizieren: Die Library `axios-auth-refresh` (npm) implementiert exakt dieses Pattern und kann als Drop-in ergaenzt werden. Abwaegen ob eine zusaetzliche Dependency akzeptabel ist.

### Validierung

```
1. Token manuell ablaufen lassen (z.B. kurze Lebensdauer im Dev-Config)
2. Mock erstellen → 0 Console-401-Errors
3. Mehrere API-Calls gleichzeitig (z.B. Mock erstellen + Sensor hinzufuegen)
   → Genau 1 Refresh-Call, nicht 2+
4. Refresh-Token abgelaufen → sauberer Redirect zu Login (nicht endloser 401-Loop)
```

---

## Was NICHT gemacht wird

- Keine Layout-Aenderungen (das ist T08-Fix2)
- Kein Redesign des AddSensorModal (nur den OneWire-Payload-Bug fixen)
- Keine Aenderung am Orbital-Layout
- Keine neuen Sensor-Typen hinzufuegen
- Kein Refactoring ueber die Bug-Fixes hinaus (kein "Verbesserungs"-Scope-Creep)
- Keine Aenderung am Monitor-Layout
- Keine Aenderung an der Firmware (El Trabajante) — nur Backend (El Servador) + Frontend (El Frontend)
- Keine Aenderung am MQTT-Topic-Format oder MQTT-Handler (sensor_handler)
- Die `rebuild_simulation_config()` Funktion ersetzt NICHT den SimulationScheduler — sie baut nur den Cache (simulation_config JSON) neu auf. Der Scheduler liest weiterhin aus diesem Cache

---

## Akzeptanzkriterien

### Fix A: Key-Format
- [ ] simulation_config Keys sind DB-IDs (Format `cfg_{id}`), NICHT `{gpio}_{type}`
- [ ] 2 DS18B20 auf GPIO 4 → 2 separate Eintraege in simulation_config mit verschiedenen DB-ID-Keys
- [ ] 2 SHT31 (0x44, 0x45) → 4 separate Eintraege (2x temp, 2x humidity), jeder mit eigener DB-ID
- [ ] Kein "already active" WARNING in Loki bei verschiedenen Adressen
- [ ] Bestehende simulation_configs werden beim naechsten Start migriert (alte Keys → DB-IDs via rebuild)
- [ ] Kein Code parst simulation_config-Keys um gpio/type zu extrahieren (stattdessen Value-Felder lesen)

### Fix B: Dual-Storage-Sync
- [ ] `rebuild_simulation_config()` existiert als zentrale Funktion
- [ ] JEDER Schreibvorgang auf sensor_configs ruft `rebuild_simulation_config()` auf (add, delete, update)
- [ ] simulation_config wird NIRGENDS direkt geschrieben (nur via rebuild)
- [ ] Duplikat-Erkennung per DB-Query (nicht per Cache-Lookup) → HTTP 409 bei Konflikt
- [ ] Orbital und Monitor zeigen identische Sensor-Namen (weil beide aus DB abgeleitet)
- [ ] Nach Service-Neustart: simulation_config stimmt mit DB ueberein (Startup-Reconciliation)

### Fix C: Multi-Value-Split
- [ ] `is_multi_value_sensor()` und `expand_multi_value()` als gemeinsame Funktionen (Batch + Einzel nutzen beide)
- [ ] SHT31 per Einzel-Add → 2 sensor_configs (temp + humidity) in DB UND 2 Eintraege in simulation_config
- [ ] Alembic-Migration: `UNIQUE(esp_id, i2c_address)` → `UNIQUE(esp_id, i2c_address, sensor_type)`
- [ ] Migration-Downgrade funktioniert (falls keine Multi-Value-Duplikate existieren)
- [ ] SimulationScheduler startet 2 separate Jobs pro SHT31

### Fix D: Delete-API
- [ ] DELETE Endpoint nutzt `sensor_config_id` (nicht GPIO) als Identifier
- [ ] `scalar_one_or_none()` ist durch ID-basierte Query ersetzt (kein `MultipleResultsFound` moeglich)
- [ ] sensor_data Zeilen ERHALTEN nach Delete (kein CASCADE DELETE)
- [ ] WebSocket-Event `sensor_config_deleted` wird gesendet
- [ ] Frontend-Store reagiert auf das Event (kein Ghost-Sensor nach Delete)
- [ ] Convenience-Endpoint fuer Multi-Value-Batch-Delete existiert (optional aber empfohlen)

### Fix E: Alert Cleanup
- [ ] Alert-Query JOINt auf esp_devices und filtert `deleted_at IS NULL`
- [ ] Device-Delete → zugehoerige offene Alerts automatisch auf "resolved" gesetzt
- [ ] Mock-Create ohne Sensoren → kein neuer Alert (leerer Health-Check ist kein Fehler)
- [ ] Zombie-Zonen: Entweder als "Leer" visuell markiert ODER filterbar ODER automatisch bereinigt

### Fix F: DS18B20 Frontend
- [ ] OneWire-Add-Flow sendet ALLE User-Felder an API: name, raw_value, unit, timeout, subzone_id, mode
- [ ] Payload-Konstruktion nutzt dieselbe Funktion wie der I2C-Flow (DRY)
- [ ] API-Response enthaelt User-Name (nicht auto-generierten "Temp 0C79")
- [ ] API-Response enthaelt User-Startwert (nicht 0.0)
- [ ] API-Response enthaelt Unit "°C" (nicht leerer String)
- [ ] Fallback: Wenn kein Name eingegeben → auto-generierter Name als Default

### Fix G: Subzone Slug
- [ ] `transliterate_german()` wird VOR dem Slugify aufgerufen
- [ ] "Nährlösung" → "naehrloesung" (nicht "n_hrl_sung")
- [ ] "Gewächshaus Alpha" → "gewaechshaus_alpha"
- [ ] "Große Straße" → "grosse_strasse"
- [ ] Bestehende fehlerhafte Slugs koennen nachtraeglich korrigiert werden

### Fix H: Auth Race
- [ ] Axios-Interceptor hat `isRefreshing` Flag + `failedQueue` Array
- [ ] Bei abgelaufenem Token: Genau 1 Refresh-Call (nicht N bei N parallelen Requests)
- [ ] Mock erstellen → 0 Console-401-Errors
- [ ] Refresh-Token abgelaufen → sauberer Redirect zu Login (kein Endlos-Loop)

### Gesamtsystem
- [ ] Ruff check bestanden (Backend)
- [ ] TypeScript Build ohne Errors (Frontend)
- [ ] Bestehende E2E-Tests gruen
- [ ] Alembic-Migration laeuft fehlerfrei (upgrade + downgrade getestet)
- [ ] Kein Silent Failure: Jeder catch-Block hat mindestens ein `logger.warning()` oder `console.warn()`
