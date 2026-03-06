# DB Calibration Schema Analysis — Phase D Kalibrierung

**Erstellt:** 2026-03-06  
**Kontext:** Phase D IST-Analyse Kalibrierung pro Sensortyp  
**Basis:** db-inspector Skill, Docker exec in PostgreSQL  
**Quelle:** PHASE_D_KALIBRIERUNG_IST_ANALYSE_BERICHT.md

---

## 1. Zusammenfassung

Die Spalte `sensor_configs.calibration_data` ist als **JSON** (nicht JSONB) definiert, nullable, und wurde **nicht per Migration** eingeführt, sondern über `Base.metadata.create_all` beim initialen Schema-Setup. In der aktuellen Datenbank existieren **keine echten Kalibrierungsdaten** — 4 von 13 Sensoren speichern den JSON-Literal `null`, 9 haben SQL NULL. Die erwarteten Keys pro Sensortyp sind aus den Sensor-Libraries ableitbar und werden dokumentiert.

---

## 2. Schema-Definition (aus DB)

### 2.1 Spalte calibration_data

| Attribut | Wert |
|----------|------|
| **Tabelle** | `sensor_configs` |
| **Spalte** | `calibration_data` |
| **PostgreSQL-Typ** | `json` (nicht `jsonb`) |
| **Nullable** | Ja |
| **Default** | — |

### 2.2 Vollständige sensor_configs-Struktur (relevant)

```
calibration_data | json | nullable
```

### 2.3 Herkunft

- **Keine Alembic-Migration** für `calibration_data`
- Spalte stammt aus dem SQLAlchemy-Model `SensorConfig` (`src/db/models/sensor.py`)
- Schema wird via `Base.metadata.create_all` erzeugt (DATABASE_AUTO_INIT, `session.py`, `create_db.py`)

---

## 3. Beispiel-Daten (DB-Abfrage)

### 3.1 Sensoren mit calibration_data gesetzt

```sql
SELECT esp_id, gpio, sensor_type, calibration_data
FROM sensor_configs
WHERE calibration_data IS NOT NULL
LIMIT 10;
```

**Ergebnis (4 Zeilen):**

| esp_id | gpio | sensor_type   | calibration_data |
|--------|------|---------------|------------------|
| 6c38462b-121d-42d5-8ca9-b8967191ddd1 | 0 | sht31_temp     | null (JSON) |
| 6c38462b-121d-42d5-8ca9-b8967191ddd1 | 0 | sht31_humidity | null (JSON) |
| c5145c28-d080-4065-93e9-f75b42733234 | 0 | sht31_temp     | null (JSON) |
| c5145c28-d080-4065-93e9-f75b42733234 | 0 | sht31_humidity | null (JSON) |

**Hinweis:** `calibration_data IS NOT NULL` trifft auf Zeilen zu, in denen der JSON-Wert `null` gespeichert ist (nicht SQL NULL). Es gibt **keine Zeilen mit tatsächlichen Kalibrierungsparametern**.

### 3.2 Statistik

```sql
SELECT COUNT(*) as total, COUNT(calibration_data) as with_calibration
FROM sensor_configs;
```

| total | with_calibration |
|-------|------------------|
| 13    | 4                |

- **9 Sensoren:** `calibration_data` = SQL NULL  
- **4 Sensoren:** `calibration_data` = JSON `null` (explizit gespeichert)  
- **0 Sensoren:** echte Kalibrierungsdaten (slope, offset, dry_value, etc.)

---

## 4. Tatsächliche Keys/Strukturen in calibration_data

### 4.1 Aus Code (Sensor-Libraries)

Da keine echten Kalibrierungsdaten in der DB vorliegen, stammen die Strukturen aus den Backend-Sensor-Libraries:

| sensor_type | Keys | Beschreibung |
|-------------|------|--------------|
| **ph** | `slope`, `offset` | 2-Punkt-Linear: pH = slope * voltage + offset |
| **ec** | `slope`, `offset` | 2-Punkt-Linear: EC = slope * voltage + offset |
| **moisture**, **soil_moisture** | `dry_value`, `wet_value` | ADC-Werte für trocken/nass |
| **temperature**, **ds18b20**, **sht31_temp**, **bme280_temp**, **bmp280_temp** | `offset` | 1-Punkt-Offset |
| **sht31_humidity**, **bme280_humidity** | `offset` | 1-Punkt-Offset |
| **light**, **co2**, **pressure** | `offset` | 1-Punkt-Offset |

### 4.2 Optionale Metadaten (aus Phase-D-Bericht)

| Key | Typ | Verwendung |
|-----|-----|------------|
| `calibrated_at` | ISO8601 string | Zeitstempel der Kalibrierung |
| `method` | string | z.B. "linear", "offset" |
| `points` | int | Anzahl Kalibrierpunkte (z.B. bei DS18B20) |
| `point1_raw`, `point1_ref`, `point2_raw`, `point2_ref` | float | Roh- und Referenzwerte (pH/EC) |

### 4.3 Beispiel-Strukturen (aus Code/Tests)

**pH (2-Punkt):**
```json
{"slope": -3.5, "offset": 21.34}
```

**EC (2-Punkt):**
```json
{"slope": 5000, "offset": -2000}
```

**Moisture:**
```json
{"dry_value": 3200, "wet_value": 1500}
```

**Temperatur (Offset):**
```json
{"offset": 0.5, "method": "offset"}
```

---

## 5. Migrations-Historie für calibration_data

**Ergebnis:** Es existiert **keine** Alembic-Migration, die `calibration_data` hinzufügt oder ändert.

- Durchsuchte Dateien: `alembic/versions/*.py`
- Suchbegriffe: `calibration`, `calibration_data`
- **Befund:** Spalte wurde nie per Migration eingeführt

**Herkunft:** Die Spalte ist Teil des initialen Schemas, das über `Base.metadata.create_all` aus dem SQLAlchemy-Model erzeugt wird. Das Model definiert:

```python
calibration_data: Mapped[Optional[dict]] = mapped_column(
    JSON,
    nullable=True,
    doc="Calibration parameters (offset, scale, etc.)",
)
```

---

## 6. Empfehlungen für Phase D

### 6.1 Schema

1. **JSON vs. JSONB:** Aktuell `json`. Für Abfragen/Indizes (z.B. `calibration_data->>'slope'`) wäre `jsonb` vorteilhaft. Migration optional, da aktuell keine JSON-Queries auf calibration_data laufen.
2. **Struktur-Validierung:** Kein DB-Constraint. Validierung erfolgt in den Sensor-Libraries. Für Phase D: Einheitliches Schema pro `sensor_type` dokumentieren und in API-Request/Response-Schemas abbilden.

### 6.2 Datenqualität

3. **JSON `null` vs. SQL NULL:** 4 Sensoren speichern explizit JSON `null`. Empfehlung: Beim Speichern entweder SQL NULL oder leeres Objekt `{}` verwenden, nicht JSON `null`, um Abfragen (`WHERE calibration_data IS NOT NULL`) eindeutig zu machen.
4. **Testdaten:** Für Phase-D-Entwicklung und -Tests Kalibrierungsdaten für ph, ec, moisture anlegen (z.B. über CalibrationWizard oder Debug-API).

### 6.3 Multi-Value-Sensoren (SHT31, BME280)

5. **update_calibration:** `SensorRepository.update_calibration(esp_id, gpio, calibration_data)` nutzt `get_by_esp_and_gpio`, das bei mehreren Sensoren pro GPIO nur den ersten zurückgibt. Für SHT31 (sht31_temp + sht31_humidity auf gleichem GPIO) muss `sensor_type` berücksichtigt werden. Empfehlung: `update_calibration` um `sensor_type` erweitern und `get_by_esp_gpio_and_type` verwenden.

### 6.4 Dokumentation

6. **Referenz:** calibration_data-Struktur pro sensor_type in `.claude/reference/` oder in der API-Dokumentation festhalten.
7. **Frontend:** `sensorDefaults.ts` und CalibrationWizard/SensorConfigPanel an dieselben Keys binden wie die Backend-Libraries.

### 6.5 Priorität für Phase D

| Priorität | Maßnahme |
|-----------|----------|
| Hoch | update_calibration für Multi-Value-Sensoren (sensor_type) korrigieren |
| Mittel | JSON `null`-Speicherung bereinigen oder vereinheitlichen |
| Niedrig | Optional: Migration von `json` auf `jsonb` |
| Niedrig | Test-Kalibrierungsdaten für ph/ec/moisture anlegen |

---

## 7. Referenzen

| Quelle | Pfad |
|--------|------|
| Phase D Bericht | `.claude/reports/current/PHASE_D_KALIBRIERUNG_IST_ANALYSE_BERICHT.md` |
| Sensor Model | `El Servador/god_kaiser_server/src/db/models/sensor.py` |
| Sensor Repo | `El Servador/god_kaiser_server/src/db/repositories/sensor_repo.py` |
| Calibration API | `El Servador/god_kaiser_server/src/api/sensor_processing.py` |
| Sensor Libraries | `El Servador/god_kaiser_server/src/sensors/sensor_libraries/active/` |
| db-inspector Skill | `.claude/skills/db-inspector/SKILL.md` |

---

## 8. Akzeptanzkriterien (erfüllt)

- [x] Schema von sensor_configs.calibration_data geprüft (json, nullable)
- [x] Beispiel-Query ausgeführt (4 Zeilen mit JSON null, 0 mit echten Daten)
- [x] Tatsächliche Keys/Strukturen aus Code dokumentiert (keine echten DB-Daten)
- [x] Migrations-Historie geprüft (keine Migration für calibration_data)
- [x] Empfehlungen für Phase D formuliert
