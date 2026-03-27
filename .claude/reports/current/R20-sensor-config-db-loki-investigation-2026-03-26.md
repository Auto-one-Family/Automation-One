# R20 — Sensor-Config DB & Loki Investigation

> **Datum:** 2026-03-26
> **ESP:** ESP_EA5484
> **Auslöser:** Hardware-Test-Probleme (OneWire-Overwrite, SHT31 0x45 nicht erkannt, Subzone-Drift, I2C-Crash)
> **Quellen:** DB-Inspector, Server-Debug (Docker-Logs), Code-Analyse (3 parallele Agents)

---

## Teil 1: Datenbank-Zustand

### 1.1 Sensor-Configs ESP_EA5484

| id (UUID) | gpio | sensor_type | sensor_name | onewire_address | i2c_address | interface_type | subzone_id | is_active | notes |
|---|---|---|---|---|---|---|---|---|---|
| ... | 0 | sht31_temp | SHT31 Temperature | NULL | 68 (0x44) | I2C | innen | true | Nur 0x44, kein 0x45 |
| ... | 0 | sht31_humidity | SHT31 Humidity | NULL | 68 (0x44) | I2C | innen | true | Multi-Value-Split |
| ... | 4 | ds18b20 | DS18B20 Temp | 28FF641F7FCCBAE1 | NULL | ONEWIRE | au_en | true | Nur 1 DS18B20, kein zweiter |

**Befunde:**
- **Kein zweiter DS18B20** in der DB — nur eine Zeile mit Adresse `28FF641F7FCCBAE1`
- **Kein SHT31 mit i2c_address=69 (0x45)** — nur Adresse 68 (0x44)
- `onewire_address` ist korrekt gesetzt für den einen DS18B20
- `i2c_address` ist korrekt gesetzt für die SHT31-Sensoren
- Keine gelöschten/orphaned Einträge

### 1.2 Subzone-Zustand

| id | name | zone_id | assigned_gpios | sensor_count | assigned_sensor_config_ids |
|---|---|---|---|---|---|
| au_en | Außen | zelt-... | [4] | 1 | **[]** |
| innen | Innen | zelt-... | [0] | 2 | **[]** |
| ... | (weitere) | ... | [] | 0 | [] |

**Befunde:**
- **INKONSISTENZ:** `sensor_count=1` in "Außen", aber `assigned_sensor_config_ids=[]` — der Counter wird hochgezählt, die UUID-Arrays bleiben leer
- **Transliterations-Bug (NB9 bestätigt):** Subzone-Slug `au_en` statt `aussen` — Umlaute werden falsch transliteriert (ä→a_e statt ä→ae)
- `assigned_gpios` stimmt mit den tatsächlichen sensor_configs überein
- Keine verwaisten Subzones (ohne Sensoren) außer leeren Default-Subzones

### 1.3 Sensor-Data Verteilung

| sensor_type | gpio | onewire_address | i2c_address | data_count | first_reading | last_reading |
|---|---|---|---|---|---|---|
| sht31_temp | 0 | NULL | 68 | ~2400 | 2026-03-25 | 2026-03-26 |
| sht31_humidity | 0 | NULL | 68 | ~2400 | 2026-03-25 | 2026-03-26 |
| ds18b20 | 4 | 28FF... | NULL | ~1200 | 2026-03-25 | 2026-03-26 |

- **Keine verwaisten sensor_data-Rows** (alle haben gültige sensor_config-Zuordnung)
- sensor_data verwendet `ondelete="SET NULL"` auf esp_id — historische Daten bleiben nach Delete erhalten

### 1.4 Audit-Trail

**I2C Error-Kaskade (3 Zyklen dokumentiert):**
```
16:41 → 1016 (I2C_BUS_RECOVERY_STARTED) → 1018 (I2C_BUS_RECOVERED) → 1013 (I2C_WRITE_FAILED) → 1014 (I2C_BUS_ERROR) → 8072 (WDT Reboot)
16:52 → gleiche Kaskade
16:58 → gleiche Kaskade
17:00 → Stabiler Betrieb
```

**NB8 Desync bestätigt:**
- `simulation_config` in device_metadata zuletzt um 16:35:02 aktualisiert
- SHT31-Sensoren um 16:35:50 angelegt
- simulation_config seitdem nie nachgeführt

### 1.5 UNIQUE Constraint Verifikation

**Index:** `unique_esp_gpio_sensor_interface_v2`
```sql
CREATE UNIQUE INDEX unique_esp_gpio_sensor_interface_v2
ON sensor_configs (esp_id, gpio, sensor_type, COALESCE(onewire_address,''), COALESCE(i2c_address::text,''))
```

**Bewertung:** Der DB-Constraint ist **korrekt** — COALESCE löst das NULL!=NULL Problem. Zwei DS18B20 mit verschiedenen onewire_addresses auf demselben GPIO wären erlaubt. Zwei SHT31 mit verschiedenen i2c_addresses ebenfalls.

**Das Problem liegt NICHT im DB-Constraint, sondern im Applikations-Code (siehe Teil 3).**

---

## Teil 2: Server-Log-Analyse

### 2.1 Sensor-Config CRUD Events

- **Endpoint:** `POST /api/v1/sensors/{esp_id}/{gpio}` — ist zugleich Create UND Update (kein separates PUT)
- Laufzeit ~30-50ms pro Operation
- Nach jeder CRUD-Operation wird automatisch Config-Push ausgelöst
- **Auffällig:** Für GPIO 0 (SHT31-Adds) erscheint kein "Sensor created"-Log, nur HTTP 200 → deutet auf Update statt Insert

### 2.2 Config-Push Inhalt

Der MQTT-Payload enthält **beide Adress-Felder:**
```json
{
  "sensors": [
    {
      "gpio": 4,
      "sensor_type": "ds18b20",
      "interface_type": "ONEWIRE",
      "onewire_address": "28FF641F7FCCBAE1",
      "i2c_address": 0,
      "sample_interval_ms": 30000
    },
    {
      "gpio": 0,
      "sensor_type": "sht31_temp",
      "interface_type": "I2C",
      "onewire_address": "",
      "i2c_address": 68
    }
  ]
}
```

**Topic:** `kaiser/god/esp/{esp_id}/config` (QoS 2)

`strip_auto_prefix` wird auf onewire_address angewendet (`AUTO_28FF...` → `28FF...`).

### 2.3 OneWire-Scan Events

- **4 Scan-Timeouts** (504, jeweils 10019ms) zwischen 13:05 und 13:10
- Korreliert mit I2C-Error-Zeitfenster — ESP war in Reboot-Phase nicht erreichbar
- Danach normal (~250ms)
- **Scan-Flow:** Frontend → `POST /v1/sensors/esp/{esp_id}/onewire/scan?pin=4` → MQTT Command an ESP → ESP scannt Bus → Ergebnis zurück per MQTT
- Scan-Ergebnisse werden **nicht automatisch** in die DB geschrieben

### 2.4 Subzone-Änderungen

- Zuordnung ist **GPIO-basiert**, nicht sensor_config-UUID-basiert
- `assigned_sensor_config_ids` ist für alle Subzones `[]` — wird nie befüllt
- Server sendet bei jedem Heartbeat automatisch alle Subzones per MQTT (Full-State-Push)
- **Kein automatisches Subzone-Umhängen** beim Sensor-Hinzufügen — nur der angegebene GPIO wird der Subzone zugewiesen

### 2.5 I2C Error Trail

**85+ WARNING-Einträge** (13:39–14:03 Uhr):
```
"Multiple configs for esp=f259c9a3... gpio=0 type=sht31_temp: 2 results.
OneWire/I2C without address? Returning first match."
```

**Interpretation:** Der Server findet beim Lookup **zwei** sensor_configs für `(esp_id, gpio=0, sensor_type=sht31_temp)` — vermutlich ein Überbleibsel aus einem früheren Duplikations-Versuch. Die Warning bestätigt den Lookup-Bug: `scalar_one_or_none` findet multiple Results und greift auf "first match" zurück.

**Server-Reaktion auf I2C-Errors:** Alle Events werden gespeichert, aber **kein Auto-Recovery** existiert. Keine automatische Deaktivierung fehlerhafter Sensoren.

### 2.6 Löschungs-Verhalten

- **Hard-Delete** auf sensor_configs (kein Soft-Delete)
- **sensor_data bleibt erhalten** (SET NULL auf esp_id FK)
- Subzone assigned_gpios wird bereinigt (GPIO entfernt, aber nur wenn kein anderer Sensor auf diesem GPIO bleibt)
- **Config-Push wird sofort** nach Delete ausgelöst (ohne gelöschten Sensor)
- Maintenance-Jobs für sensor_data Retention sind disabled (unlimited)

---

## Teil 3: Root-Cause-Analyse (Code)

### ROOT CAUSE 1 (KRITISCH): Falscher Duplikat-Check für OneWire-Sensoren

**Dateien:**
- `El Servador/god_kaiser_server/src/api/v1/sensors.py` Zeilen 783–785
- `El Servador/god_kaiser_server/src/db/repositories/sensor_repo.py` Zeilen 138–176

**Problem:** Der Single-Value-Sensor-Lookup verwendet:
```python
existing = await sensor_repo.get_by_esp_gpio_and_type(
    esp_device.id, gpio, request.sensor_type  # ← NUR (esp_id, gpio, sensor_type)
)
```

Für einen zweiten DS18B20 mit **anderer** `onewire_address` auf demselben GPIO wird der erste DS18B20 als "existing" gefunden. Der Update-Pfad (Zeilen 860–905) aktualisiert `sensor_name`, `enabled`, `sample_interval_ms` etc., aber **`onewire_address` und `i2c_address` werden NICHT aktualisiert**.

**Ergebnis:** Der zweite DS18B20 überschreibt den ersten (Name, Settings) aber behält die alte Adresse. Es wird nie ein zweiter DB-Eintrag angelegt.

**Fix:** Für `interface_type == "ONEWIRE"` muss der Lookup auf `get_by_esp_gpio_type_and_onewire(esp_id, gpio, sensor_type, onewire_address)` umgestellt werden (diese Methode existiert bereits in sensor_repo.py, Zeilen 1068–1106, wird aber nicht im CRUD-Flow verwendet). Zusätzlich muss im Update-Pfad `existing.onewire_address` explizit gesetzt werden.

### ROOT CAUSE 2 (KRITISCH): Gleicher Bug für I2C-Sensoren

**Gleicher Lookup-Bug für SHT31:** `get_by_esp_gpio_and_type(esp_id, 0, "sht31_temp")` findet den ersten SHT31 (0x44) und würde den zweiten (0x45) als Update behandeln — aber da i2c_address im Update-Pfad nicht aktualisiert wird, bleibt 0x44 stehen.

**Zusätzlich:** In den Logs erscheint **kein POST mit i2c_address=69** — das Frontend überträgt die I2C-Adresse möglicherweise gar nicht korrekt (NB7 bestätigt: AddSensorModal ignoriert User-Inputs für bestimmte Flows).

### ROOT CAUSE 3 (HOCH): ESP32 `findSensorConfig()` nur GPIO-basiert

**Datei:** `El Trabajante/src/services/sensor/sensor_manager.cpp` Zeilen 1438–1444

```cpp
SensorConfig* SensorManager::findSensorConfig(uint8_t gpio) {
    for (uint8_t i = 0; i < sensor_count_; i++) {
        if (sensors_[i].gpio == gpio) {   // ← Nur GPIO-Lookup!
            return &sensors_[i];
        }
    }
    return nullptr;
}
```

Selbst wenn der Server korrekt zwei DS18B20 mit verschiedenen Adressen senden würde, findet der ESP beim Reconfigure-Pfad immer nur den ersten Sensor auf einem GPIO und überschreibt ihn mit `*existing = config`.

**Fix:** `findSensorConfig` muss für OneWire nach ROM-Code, für I2C nach Adresse suchen.

### ROOT CAUSE 4 (MITTEL): SIM_-Platzhalter-Adressen

**Server:** Wenn keine `onewire_address` angegeben wird, generiert der Server `SIM_<12hex>` (16 Zeichen).
**ESP:** Prüft `length() != 16` → passt. Aber `hexStringToRom("SIM_A1B2C3D4E5F6")` schlägt fehl weil `SIM_` kein gültiger Hex-String ist. `strip_auto_prefix` in config_mapping behandelt nur `AUTO_`-Prefix, nicht `SIM_`.

### ROOT CAUSE 5 (MITTEL): Subzone-Desync

- `sensor_count` wird inkrementiert, aber `assigned_sensor_config_ids[]` bleibt leer
- Zuordnung erfolgt nur über `assigned_gpios` (GPIO-basiert, nicht Sensor-UUID-basiert)
- Alle Sensoren auf einem GPIO teilen dieselbe Subzone — bei OneWire (mehrere Sensoren auf einem GPIO) ist das korrekt, aber die UUID-Zuordnung fehlt

---

## Teil 4: Zusammenfassung — Problem → Root Cause Mapping

| Problem | Root Cause | Schwere | Betroffene Dateien |
|---|---|---|---|
| **R20-01:** Zweiter DS18B20 ersetzt ersten | RC1: `get_by_esp_gpio_and_type()` ohne onewire_address + RC3: ESP `findSensorConfig()` nur GPIO | KRITISCH | sensors.py:783, sensor_repo.py:160, sensor_manager.cpp:1438 |
| **R20-02:** SHT31 0x45 nicht erkannt | RC2: Gleicher Lookup-Bug + Frontend überträgt i2c_address nicht (NB7) | KRITISCH | sensors.py:783, AddSensorModal (Frontend) |
| **R20-03:** Subzone-Drift | RC5: assigned_sensor_config_ids nie befüllt, sensor_count inkonsistent | MITTEL | subzone_service.py |
| **R20-04:** I2C-Crash-Kaskade | ESP versucht unkonfiguriertes Gerät (0x45) zu initialisieren → Bus-Blockade → Recovery-Loop → WDT Reboot | HOCH | sensor_manager.cpp (I2C init) |

---

## Teil 5: Fix-Empfehlungen (Priorisiert)

### P1 — Server Sensor-CRUD Lookup (RC1 + RC2)
```
sensors.py: Für ONEWIRE → get_by_esp_gpio_type_and_onewire() nutzen
sensors.py: Für I2C → get_by_esp_gpio_type_and_i2c() nutzen (oder erstellen)
sensors.py: Update-Pfad (Z.860-905) → onewire_address + i2c_address explizit setzen
```

### P2 — ESP32 findSensorConfig (RC3)
```
sensor_manager.cpp: findSensorConfig() → für ONEWIRE nach ROM-Code, für I2C nach Adresse suchen
sensor_manager.cpp: configureSensor() Update-Pfad → ROM/Adress-basiert statt GPIO-basiert
```

### P3 — Frontend AddSensorModal (RC2 Ergänzung)
```
AddSensorModal: I2C-Adresse und OneWire-Adresse korrekt aus User-Input übertragen
OneWire-Flow: Scan-Ergebnis (ROM-Code) muss in POST-Request als onewire_address mitgegeben werden
```

### P4 — Subzone-Konsistenz (RC5)
```
subzone_service.py: assigned_sensor_config_ids befüllen wenn assign_subzone() aufgerufen wird
subzone_service.py: sensor_count mit tatsächlichen sensor_configs synchronisieren
```

### P5 — SIM_-Prefix (RC4)
```
config_mapping.py: strip_auto_prefix auch für SIM_-Prefix
ODER: ESP sensor_manager.cpp: SIM_-Adressen als "kein ROM-Code" erkennen und überspringen
```

---

## Anhang: Bereits existierende (aber ungenutzte) Infrastruktur

| Was | Wo | Status |
|---|---|---|
| `get_by_esp_gpio_type_and_onewire()` | sensor_repo.py:1068–1106 | Existiert, wird im CRUD nicht genutzt |
| COALESCE-UNIQUE-Index | DB Migration | Korrekt, würde parallele Sensoren erlauben |
| `onewire_address` im Config-Push | config_mapping.py:244–276 | Seit BUG-ONEWIRE-CONFIG-001 gefixt |
| ESP ROM-Code-Parsing | sensor_manager.cpp:424–576 | Funktioniert, Lookup davor ist das Problem |

**Fazit:** Die DB-Struktur und der Config-Push sind bereits korrekt vorbereitet. Die Bugs sitzen ausschließlich in der Applikationslogik (Server-Lookup + ESP-Lookup + Frontend-Übertragung). Die Fixes sind chirurgisch — es müssen nur die richtigen Lookup-Methoden an den richtigen Stellen verwendet werden.
