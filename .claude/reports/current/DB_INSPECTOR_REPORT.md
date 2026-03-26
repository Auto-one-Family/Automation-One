# DB Inspector Report

**Erstellt:** 2026-03-26T09:50:00+00:00
**Modus:** B (Spezifisch: "VPD-Backend-Datenintegritaets-Vorbedingungschecks")
**Quellen:** `sensor_data`, `sensor_configs`, `esp_devices.device_metadata`

---

## 1. Zusammenfassung

Von 664 VPD-Eintraegen in `sensor_data` haben **135 den Wert 0.0 kPa** (20.3%, gestiegen von 17.7% beim letzten Check). Seit dem vorigen Report ist **auch MOCK_24557EC6 vom Scheduler-Bug betroffen** (31 neue Null-Eintraege, aktiv seit 09:26 Uhr). Das doppelte Schreibpfad-Problem aus dem vorherigen Bericht besteht ungefixed weiter. Zusaetzlich wurden doppelte SHT31-Configs fuer MOCK_24557EC6 gefunden (4 Rows statt 2 erwartet) sowie `sht31_temp` mit `quality=error` in `sensor_configs.sensor_metadata`. Handlungsbedarf ist hoch — das Problem verschlimmert sich aktiv.

---

## 2. Analysierte Quellen

| Quelle | Status | Bemerkung |
|--------|--------|-----------|
| `automationone-postgres` | OK | Container healthy, Up 3 hours, Port 5432 erreichbar |
| `sensor_data` | analysiert | 664 VPD-Eintraege gesamt (+145 seit letztem Check) |
| `sensor_configs` | analysiert | 6 Configs fuer MOCK_24557EC6, davon 4 SHT31 (2 doppelt) |
| `esp_devices.device_metadata` | analysiert | Beide Mock-Devices mit VPD-VIRTUAL in simulation_config |

---

## 3. Befunde

### Check 1: VPD-Duplikate in sensor_configs

**Query:**
```sql
SELECT esp_id, gpio, sensor_type, COUNT(*) as cnt
FROM sensor_configs
WHERE sensor_type = 'vpd'
GROUP BY esp_id, gpio, sensor_type
HAVING COUNT(*) > 1;
```

**Ergebnis:** 0 Rows

**Bewertung:** Keine VPD-Duplikate in `sensor_configs`. Jeder ESP hat genau einen VPD-Eintrag. Dieser Check ist sauber.

---

### Check 2: VPD=0 Rows in sensor_data

**Query:**
```sql
SELECT COUNT(*) as vpd_zero_count
FROM sensor_data
WHERE sensor_type = 'vpd'
  AND raw_value = 0.0
  AND sensor_metadata::text LIKE '%raw_mode%';
```

**Ergebnis:**

| vpd_zero_count |
|----------------|
| 134            |

**Bewertung:** Kritisch. 134 Null-Werte mit `raw_mode`-Metadata sind Scheduler-Artefakte. Hinweis: Gesamtzahl der korrupten Rows ist 135 (1 Eintrag hat leicht abweichende Metadata-Struktur). Das Problem akkumuliert weiter.

---

### Check 3: VPD-Gesamtstatistik

**Query:**
```sql
SELECT processing_mode, COUNT(*), MIN(raw_value), MAX(raw_value), AVG(raw_value)
FROM sensor_data
WHERE sensor_type = 'vpd'
GROUP BY processing_mode;
```

**Ergebnis:**

| processing_mode | count | min    | max    | avg_value |
|-----------------|-------|--------|--------|-----------|
| computed        | 529   | 0.2749 | 1.1898 | 1.0113    |
| raw             | 135   | 0      | 0      | 0.0000    |

**Bewertung:** Hoch. 135 von 664 VPD-Eintraegen (20.3%) sind Null-Werte mit `processing_mode=raw`. Der korrekte Pfad liefert `processing_mode=computed`. Die korrupten Werte stammen vom Scheduler-Job, der den VIRTUAL-Sensor als regulaeren Simulator behandelt.

Aufschluesselung nach Device:

| device_id       | processing_mode | count | min    | max    |
|-----------------|-----------------|-------|--------|--------|
| MOCK_24557EC6   | computed        | 104   | 0.2749 | 0.2749 |
| MOCK_24557EC6   | raw             | 31    | 0      | 0      |
| MOCK_T18V6LOGIC | computed        | 425   | 1.1898 | 1.1898 |
| MOCK_T18V6LOGIC | raw             | 104   | 0      | 0      |

Zeitfenster der korrupten Daten:
- MOCK_T18V6LOGIC: 2026-03-26 08:32 - 09:26 (104 Eintraege, bereits gestoppt oder veraendert)
- MOCK_24557EC6: 2026-03-26 09:26 - 09:44 (**aktuell aktiv**, 31 Eintraege und wachsend)

---

### Check 4: Doppelte SHT31-Configs fuer MOCK_24557EC6

**Query:**
```sql
SELECT sc.id, sc.esp_id, sc.gpio, sc.sensor_type, sc.i2c_address, sc.onewire_address
FROM sensor_configs sc
JOIN esp_devices ed ON sc.esp_id = ed.id
WHERE ed.device_id = 'MOCK_24557EC6'
  AND sc.sensor_type LIKE 'sht31%';
```

**Ergebnis:**

| id (kurz)   | gpio | sensor_type    | i2c_address |
|-------------|------|----------------|-------------|
| 432216c2... |    0 | sht31_temp     | 68          |
| c615f0cc... |    0 | sht31_humidity | 69          |
| 7a392afc... |    0 | sht31_temp     | 69          |
| 90264011... |    0 | sht31_humidity | 68          |

**Bewertung:** Mittel bis Hoch. Es existieren 4 SHT31-Sensor-Configs statt der erwarteten 2. Beachte: Die I2C-Adressen sind vertauscht/doppelt:
- `sht31_temp` an Adresse 68 UND 69
- `sht31_humidity` an Adresse 68 UND 69

Dies ist konsistent mit dem bekannten Bug NB8 (Dual-Storage Desync): `device_metadata.simulation_config` und `sensor_configs` laufen auseinander. Die VPD-Berechnung nimmt den zuerst gefundenen sht31_temp-Wert — bei doppelten Configs kann dies zu Race-Conditions beim VPD-Compute-Hook fuehren.

Kritischer Nebenbefund: `sht31_temp` mit `i2c_address=68` hat `latest_value=0.0` und `latest_quality=error` in `sensor_configs.sensor_metadata`, obwohl `raw_value=22.0` in `sensor_data` korrekt ankommt. Die 0.0 in `sensor_configs` entsteht vermutlich durch einen fehlerhaften Update-Pfad beim doppelten Config-Eintrag.

---

### Check 5: VPD mit T=0 berechnet (Werte 0.27-0.28 fuer MOCK_24557EC6)

**Query:**
```sql
SELECT COUNT(*), MIN(raw_value), MAX(raw_value)
FROM sensor_data sd
JOIN esp_devices ed ON sd.esp_id = ed.id
WHERE ed.device_id = 'MOCK_24557EC6'
  AND sd.sensor_type = 'vpd'
  AND sd.raw_value BETWEEN 0.27 AND 0.28;
```

**Ergebnis:**

| count | min    | max    |
|-------|--------|--------|
| 103   | 0.2749 | 0.2749 |

**Bewertung:** Hoch. 103 VPD-Werte von MOCK_24557EC6 liegen exakt bei 0.2749 kPa. Das ist kein zufaelliger Wert — es ist das Ergebnis der VPD-Berechnung wenn Temperatur nahe 0°C oder ein falscher Temp-Wert verwendet wird. Zur Verifikation:

```
VPD(T=0, RH=55) = 0.6108 * exp(17.27 * 0 / (0 + 237.3)) * (1 - 0.55) = 0.6108 * 1.0 * 0.45 = 0.2749 kPa
```

**Root Cause besteatigt:** Der VPD-Calculator verwendet den `sht31_temp`-Wert mit `i2c_address=68` (Duplicate-Config mit `latest_value=0.0`). Obwohl der korrekte sht31_temp-Sensor 22°C meldet, greift der Calculator auf den fehlerhaften Config-Eintrag zu und berechnet VPD(T=0, RH=55) = 0.2749 kPa statt VPD(T=22, RH=55) = 1.1898 kPa.

Dies ist ein **neues, bisher unbekanntes Problem** zusaetzlich zum Scheduler-Bug: Der Duplikat-Config-Bug erzeugt auch falsch berechnete VPD-Werte (nicht nur Null-Werte).

---

### Check 6: VPD in simulation_config

**Query:**
```sql
SELECT ed.device_id, ed.device_metadata->'simulation_config'->'sensors'
FROM esp_devices ed
WHERE ed.device_metadata::text LIKE '%vpd%'
LIMIT 5;
```

**Ergebnis (komprimiert):**

**MOCK_T18V6LOGIC simulation_config.sensors:**
```json
{
  "cfg_b346e10b-...": {
    "sensor_type": "vpd", "gpio": 0, "name": "VPD (berechnet)",
    "interface_type": "VIRTUAL", "device_scope": "zone_local", "quality": "good"
    // KEIN base_value, KEIN raw_mode -> Scheduler-Job faellt auf 0.0 zurueck
  },
  "cfg_93b13bbf-...": {"sensor_type": "sht31_humidity", "gpio": 21, "base_value": 55.0, ...},
  "cfg_5d627dad-...": {"sensor_type": "sht31_temp", "gpio": 21, "base_value": 22.0, ...}
}
```

**MOCK_24557EC6 simulation_config.sensors:**
```json
{
  "cfg_36cbb17e-...": {
    "sensor_type": "vpd", "gpio": 0, "name": "VPD (berechnet)",
    "interface_type": "VIRTUAL", "device_scope": "zone_local",
    "raw_value": 0.2749  // hat raw_value, aber kein base_value -> trotzdem Scheduler-Job
  },
  "cfg_432216c2-...": {"sensor_type": "sht31_temp", "gpio": 0, "i2c_address": 68, "base_value": 22.0, ...},
  "cfg_c615f0cc-...": {"sensor_type": "sht31_humidity", "gpio": 0, "i2c_address": 69, "base_value": 55.0, ...},
  "cfg_7a392afc-...": {"sensor_type": "sht31_temp", "gpio": 0, "i2c_address": 69, "base_value": 22.0, ...},  // DUPLIKAT
  "cfg_90264011-...": {"sensor_type": "sht31_humidity", "gpio": 0, "i2c_address": 68, "base_value": 55.0, ...}  // DUPLIKAT
}
```

**Bewertung:** Hoch. Beide simulation_configs enthalten VPD-VIRTUAL-Eintraege ohne VIRTUAL-Schutz-Flag, was den Scheduler-Bug aktiviert. MOCK_24557EC6 hat zusaetzlich 4 SHT31-Eintraege statt 2 in der simulation_config, was mit den doppelten `sensor_configs`-Rows uebereinstimmt (NB8-Bug bestaetigt).

---

## 4. Extended Checks (eigenstaendig durchgefuehrt)

| Check | Ergebnis |
|-------|----------|
| Container `automationone-postgres` | healthy, Up 3 hours |
| VPD Zeitfenster MOCK_T18V6LOGIC raw=0 | 08:32-09:26 Uhr (104 Eintraege, aktuell gestoppt) |
| VPD Zeitfenster MOCK_24557EC6 raw=0 | 09:26-09:44 Uhr (**aktiv wachsend**, 31 Eintraege) |
| sht31_temp latest_value MOCK_24557EC6 | 0.0 mit quality=error (Duplikat-Config-Artefakt) |
| VPD(T=0, RH=55) Formelverifikation | 0.2749 kPa - bestaetigt falsche Temp-Quelle |
| VPD-Gesamtkorruption | 20.3% (gestiegen von 17.7% beim letzten Check) |
| simulation_config Struktur | Beide Devices: VIRTUAL ohne Guard, MOCK_24557EC6: 4 SHT31-Eintraege |

---

## 5. Bewertung & Empfehlung

### Root Cause - Zwei unabhaengige Bugs

**Bug A - Scheduler-Bug (bekannt, ungefixed):**
`scheduler.py:_start_sensor_jobs_from_db` filtert VIRTUAL-Sensoren nicht. VPD-VIRTUAL-Eintraege in `simulation_config` werden zu regulaeren Scheduler-Jobs, die alle 30s `raw_value=0` publishen. Betroffen: beide Devices. Erzeugt `processing_mode=raw, raw_value=0` Eintraege.

**Bug B - Duplikat-Config-Bug (neu identifiziert, KRITISCH):**
MOCK_24557EC6 hat 4 SHT31-Configs statt 2 in `sensor_configs` (und in `simulation_config`). Der VPD-Calculator greift auf den ersten gefundenen `sht31_temp`-Eintrag (i2c_address=68) zu, dessen `sensor_configs.sensor_metadata.latest_value=0.0` ist (Fehler-State). Damit berechnet er VPD(T=0, RH=55)=0.2749 kPa fuer alle 103 computed-Werte statt dem korrekten 1.1898 kPa. Dies ist ein stiller Datenfehler ohne `processing_mode=raw`-Kennung — nicht durch simple Null-Filterung erkennbar.

### Schweregrad-Zusammenfassung

| # | Befund | Schwere | Impact |
|---|--------|---------|--------|
| B | MOCK_24557EC6: 103 VPD-Werte mit T=0 berechnet (0.2749 statt ~1.19 kPa) | **Kritisch** | Stille Datenverfaelschung, nicht filterbar |
| A | Scheduler erzeugt VPD=0 Eintraege fuer beide Devices (135 Rows, aktiv wachsend) | Hoch | Akkumulation korrupter Daten |
| C | Doppelte SHT31-Configs (4 statt 2) fuer MOCK_24557EC6 | Hoch | Ursache fuer Bug B |
| D | `sht31_temp` i2c_address=68 mit latest_value=0.0 und quality=error | Mittel | Symptom von Bug B |
| E | VPD fehlt VIRTUAL-Klassifikation in Registry | Mittel | Strukturelle Ursache fuer Bug A |

### Empfohlene Fix-Reihenfolge

**Schritt 1 - Sofort (Code-Fix Bug A, Scheduler-Guard):**

Datei: `El Servador/god_kaiser_server/src/services/simulation/scheduler.py`

```python
# In _start_sensor_jobs_from_db, nach sensor_type Extraktion:
if sensor_config.get("interface_type", "").upper() == "VIRTUAL":
    logger.debug(f"[{esp_id}] Skipping VIRTUAL sensor {sensor_type}:GPIO{gpio}")
    continue
```

**Schritt 2 - Sofort (Code-Fix Bug B, Duplikat-Config-Ursache):**

Duplikat-SHT31-Configs in `sensor_configs` und `simulation_config` fuer MOCK_24557EC6 entfernen. Korrekte Konfiguration: 1x sht31_temp (i2c_address=68), 1x sht31_humidity (i2c_address=68).

**Schritt 3 - DB-Cleanup (nach Code-Fix, benoetigt User-Bestaetigung):**

```sql
-- Preview korrupte Null-Werte (Scheduler-Artefakte):
SELECT COUNT(*) FROM sensor_data
WHERE sensor_type = 'vpd' AND raw_value = 0.0 AND processing_mode = 'raw';
-- Ergebnis: 135 Eintraege

-- Preview falsch berechnete VPD-Werte fuer MOCK_24557EC6:
SELECT COUNT(*) FROM sensor_data sd
JOIN esp_devices ed ON sd.esp_id = ed.id
WHERE ed.device_id = 'MOCK_24557EC6'
  AND sd.sensor_type = 'vpd'
  AND sd.raw_value BETWEEN 0.27 AND 0.28;
-- Ergebnis: 103 Eintraege
```

Nach Bestaetigung und Code-Fix ausfuehren (via Cleanup-Workaround mit bash -c):

```sql
-- DELETE 1: Scheduler-Artefakte (beide Devices)
DELETE FROM sensor_data
WHERE sensor_type = 'vpd' AND raw_value = 0.0 AND processing_mode = 'raw';

-- DELETE 2: Falsch berechnete VPD-Werte fuer MOCK_24557EC6
DELETE FROM sensor_data sd
USING esp_devices ed
WHERE sd.esp_id = ed.id
  AND ed.device_id = 'MOCK_24557EC6'
  AND sd.sensor_type = 'vpd'
  AND sd.raw_value BETWEEN 0.27 AND 0.28;
```

**Gesamtbereinigung:** 238 korrupte VPD-Rows (135 Null + 103 falsch berechnet = 35.8% der 664 VPD-Eintraege).
