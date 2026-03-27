# DB Inspector Report — FW-01 NVS-Delete-Bug

**Erstellt:** 2026-03-26
**Modus:** B (Spezifisch: "FW-01 NVS-Delete-Bug + OneWire-Scan-Fix — DB-Konsistenz-Prüfung")
**Quellen:** esp_devices, sensor_configs, actuator_configs, sensor_data, pg_indexes, pg_constraint, alembic_version

---

## 1. Zusammenfassung

Die Datenbank ist in einem grundsätzlich stabilen Zustand. CASCADE-Delete für `esp_devices -> sensor_configs/actuator_configs` funktioniert korrekt — alle 6 gelöschten Mock-Devices haben 0 verwaiste Configs. Es wurden jedoch **zwei strukturelle Probleme** gefunden: (1) Ein Duplikat in `sensor_configs` auf `MOCK_24557EC6` (zwei SHT31-Konfigurationen mit unterschiedlichen I2C-Adressen 0x44/0x45 für denselben GPIO), und (2) der UNIQUE Constraint `unique_esp_gpio_sensor_interface_v2` existiert nur als Index, nicht als formaler Constraint-Eintrag in `pg_constraint`. In Bezug auf den FW-01-Bug (Sensoren tauchen nach Reboot wieder auf) zeigt die DB-Seite keine aktiven Duplikate auf real-devices — die Ursache liegt im ESP-seitigen NVS-Verhalten, nicht in der DB.

---

## 2. Analysierte Quellen

| Quelle | Status | Bemerkung |
|--------|--------|-----------|
| automationone-postgres Container | OK | Up, healthy |
| pg_isready | OK | Accepting connections |
| esp_devices | OK | 11 Devices analysiert (5 aktiv, 6 deleted) |
| sensor_configs | WARNUNG | 16 Einträge, 2 Duplikate auf MOCK_24557EC6 |
| actuator_configs | OK | 2 Einträge, keine Orphans |
| sensor_data | OK | 20 Typ-Device-Kombinationen, keine Duplikat-Problematik |
| pg_indexes / pg_constraint | WARNUNG | UNIQUE als Index vorhanden, fehlt in pg_constraint |
| alembic_version | OK | `fix_null_coalesce_unique` (aktuell) |

---

## 3. Befunde

### 3.1 CASCADE-Verhalten — OK

- **Schwere:** Niedrig (positiver Befund)
- **Detail:** Alle 6 Devices mit `status='deleted'` und gesetztem `deleted_at` haben exakt 0 verknüpfte `sensor_configs` und 0 `actuator_configs`. Die FK-Constraints `ON DELETE CASCADE` haben beim Soft-Delete korrekt gewirkt.
- **Evidenz:**
  ```
  MOCK_RULE0DR561OK | deleted | 2026-03-11 09:56:58 | sensor_count: 0 | actuator_count: 0
  MOCK_HYSTRI8BX55Z | deleted | 2026-03-11 09:57:01 | sensor_count: 0 | actuator_count: 0
  MOCK_SEQ7M4BQYYO  | deleted | 2026-03-11 09:57:07 | sensor_count: 0 | actuator_count: 0
  MOCK_RULEEL660ZL3 | deleted | 2026-03-11 09:57:29 | sensor_count: 0 | actuator_count: 0
  MOCK_HYSTEKVZEGKQ | deleted | 2026-03-11 09:57:32 | sensor_count: 0 | actuator_count: 0
  MOCK_SEQ89ZLJWE8  | deleted | 2026-03-11 09:57:38 | sensor_count: 0 | actuator_count: 0
  ```
- **Hinweis:** Die gelöschten Devices haben jedoch noch `sensor_data`-Einträge (wegen `ON DELETE SET NULL`). Das ist erwartetes Verhalten für historische Daten.

---

### 3.2 Duplikate in sensor_configs (MOCK_24557EC6) — MITTEL

- **Schwere:** Mittel
- **Detail:** `MOCK_24557EC6` (f259c9a3-...) hat **4 SHT31-Einträge** (2x sht31_temp, 2x sht31_humidity) auf GPIO 0 mit unterschiedlichen I2C-Adressen (68 = 0x44, 69 = 0x45). Dies ist kein technischer Fehler (der UNIQUE Constraint erlaubt es, da verschiedene i2c_address-Werte), aber es zeigt einen Konfigurationsfehler aus einer früheren Session.
- **Evidenz:**
  ```
  GPIO 0 | sht31_humidity | i2c=68 | created 2026-03-10 | config_status: active
  GPIO 0 | sht31_humidity | i2c=69 | created 2026-03-10 | config_status: active
  GPIO 0 | sht31_temp     | i2c=68 | created 2026-03-10 | config_status: active
  GPIO 0 | sht31_temp     | i2c=69 | created 2026-03-10 | config_status: active
  ```
- **Auswirkung auf FW-01:** Direkt keine, da MOCK_24557EC6 ein Mock-Device ist. `sensor_data` zeigt nur 1 aktiven Datenstrom pro Typ (nicht 2), d.h. der Server schreibt nicht doppelt.
- **Empfehlung:** Die älteren Einträge mit i2c=69 (created 2026-03-10 20:24:54, config-IDs: `7a392afc`, `c615f0cc`) können nach User-Bestätigung bereinigt werden.

---

### 3.3 UNIQUE Constraint — Implementierung als reiner Index

- **Schwere:** Niedrig (technische Beobachtung)
- **Detail:** Der Constraint `unique_esp_gpio_sensor_interface_v2` ist in `pg_indexes` vorhanden, aber nicht in `pg_constraint` (Typ 'u'). Dies bedeutet er wurde per `CREATE UNIQUE INDEX` statt `ADD CONSTRAINT ... UNIQUE` angelegt. Funktional identisch, aber atypisch für Alembic-verwaltete Schemata.
- **Evidenz:**
  ```sql
  -- pg_constraint liefert 0 Rows für Typ 'u' auf sensor_configs
  -- pg_indexes liefert:
  unique_esp_gpio_sensor_interface_v2 |
    UNIQUE (esp_id, gpio, sensor_type,
            COALESCE(onewire_address, ''),
            COALESCE(i2c_address::text, ''))
  ```
- **Auswirkung auf FW-01:** Der Constraint schützt korrekt gegen echte Duplikate (gleicher ESP + GPIO + Typ + Adresse). Die Duplikate in 3.2 existieren weil sie unterschiedliche i2c_address haben — das ist Intention des Constraints.
- **Hinweis:** `COALESCE(onewire_address, '')` ist korrekt für den OneWire-Fall im FW-01-Kontext (verhindert NULL-Duplikate bei OneWire-Scan).

---

### 3.4 Verwaiste sensor_configs (Orphans) — OK

- **Schwere:** Niedrig (positiver Befund)
- **Detail:** Alle 16 `sensor_configs`-Einträge sind über `esp_id` (UUID) einem existierenden Device in `esp_devices` zugeordnet. Keine echten Orphans.
- **Evidenz:** LEFT JOIN liefert 0 Zeilen mit `ed.device_id IS NULL`.

---

### 3.5 ESP-Devices Übersicht

| device_id | status | hardware_type | zone | last_seen |
|-----------|--------|---------------|------|-----------|
| ESP_EA5484 | online | ESP32_WROOM | zelt_wohnzimmer | 2026-03-26 13:40 (heute) |
| MOCK_24557EC6 | online | MOCK_ESP32 | mock_zone | 2026-03-26 13:39 (heute) |
| MOCK_T18V6LOGIC | online | MOCK_ESP32 | mock_zone | 2026-03-26 13:39 (heute) |
| ESP_472204 | offline | ESP32_WROOM | zelt_wohnzimmer | 2026-03-12 (2 Wochen alt) |
| ESP_00000001 | offline | ESP32_WROOM | mock_zone | 2026-03-12 (2 Wochen alt) |
| MOCK_RULE*, MOCK_HYST*, MOCK_SEQ* (6x) | deleted | MOCK_ESP32 | (keine) | 2026-03-11 |

**Beobachtung:** `ESP_472204` (Zelt Agent Updated) und `ESP_00000001` sind seit 2 Wochen offline. Dies ist relevant für FW-01 — diese Devices haben `sensor_configs` im Status `applied` (nicht `active`), was auf einen unvollständigen Config-Push hinweisen kann.

---

### 3.6 sensor_configs für offline ESP-Devices

| esp_id | gpio | sensor_type | config_status |
|--------|------|-------------|---------------|
| ESP_472204 | 0 | sht31_humidity | applied |
| ESP_472204 | 0 | sht31_temp | applied |
| ESP_00000001 | 4 | ds18b20 | applied |

**Detail:** Status `applied` bedeutet: Config wurde in DB geschrieben, aber keine Bestätigung vom ESP erhalten. Bei Reboot ohne NVS-Delete würde ESP_472204 die alte Config aus NVS laden und könnte mit DB-Stand divergieren — das ist genau der FW-01-Bug.

---

### 3.7 GPIO-Konflikte — OK

- **Schwere:** Niedrig (positiver Befund)
- **Detail:** Kein einziger Fall, in dem ein GPIO gleichzeitig in `sensor_configs` und `actuator_configs` für dasselbe Device belegt ist. GPIO 27 auf ESP_472204 und MOCK_24557EC6 ist nur in `actuator_configs`.

---

### 3.8 sensor_data — Keine NVS-Bug-Spuren auf Real-Devices

- **Schwere:** Niedrig (positiver Befund für aktive Devices)
- **Detail:** `ESP_EA5484` (heute aktiv) hat saubere sensor_data ohne Duplikat-Datenpunkte. `ESP_472204` und `ESP_00000001` haben letzte Daten vom 2026-03-11/12, was mit ihrem offline-Status übereinstimmt.
- **Auffälligkeit:** `sensor_data` enthält 9 Zeilen für deleted Devices mit `esp_id IS NOT NULL` (SET NULL greift nur bei FK-Deletion, nicht bei Soft-Delete). Diese Historien-Daten sind korrekt und nicht bereinigungswürdig.

---

## 4. Extended Checks (eigenständig durchgeführt)

| Check | Ergebnis |
|-------|----------|
| `docker compose ps postgres` | healthy, Up |
| `pg_isready` | Accepting connections |
| Aktive Connections | 12 Connections auf god_kaiser_db |
| DB Gesamtgröße | 23 MB (unkritisch) |
| sensor_data Tabellengroesse | 9,3 MB (größte Tabelle, expected) |
| Alembic Version | `fix_null_coalesce_unique` (aktuell) |
| Orphaned sensor_data (esp_id=NULL) | 0 Zeilen |

---

## 5. FW-01 spezifische Bewertung

### Bezug zum Bug: "Sensoren tauchen nach Reboot wieder auf"

Die DB-Analyse zeigt: **Das Problem liegt nicht in der Datenbankstruktur, sondern im Ablauf zwischen ESP-NVS und Server.**

**DB-seitige Lage:**
- `sensor_configs` werden korrekt gelöscht wenn vom Backend angewiesen
- CASCADE funktioniert
- UNIQUE Constraint schützt gegen Neuanlage von echten Duplikaten
- Der `config_status='applied'` auf offline Devices ist ein Signal: Der Server hat die Löschung in DB vorgenommen, aber der ESP hat NVS-seitig noch die alte Config

**Relevante DB-seitige Verbesserungspunkte:**

1. **ESP_472204 / ESP_00000001 mit `config_status='applied'`:** Wenn diese Devices wieder online kommen, sollten sie einen config-push erhalten. Der DB-Zustand ist korrekt (Configs vorhanden), aber ohne NVS-Delete auf dem ESP würde der Reboot die DB-gelöschten Sensoren wiederherstellen.

2. **MOCK_24557EC6 Duplikate (i2c_address 68 vs 69):** Dies ist ein Überrest aus Testläufen. Bereinigung empfohlen nach Bestätigung.

---

## 6. Bewertung & Empfehlung

- **Root Cause (DB-Perspektive):** Kein DB-seitiger Root Cause für den FW-01-Bug gefunden. Die Datenbank-Integrität ist intakt. Der Bug liegt im ESP-NVS-Management (Sensoren werden in NVS gespeichert und bei Reboot ohne Backend-Abgleich restauriert).

- **DB-Zustand:** Gut. CASCADE, Foreign Keys, UNIQUE Constraint alle funktional.

- **Handlungsbedarf:**

  | Aktion | Priorität | Voraussetzung |
  |--------|-----------|---------------|
  | Duplikate MOCK_24557EC6 (i2c=69) bereinigen | Niedrig | User-Bestätigung |
  | ESP_472204 / ESP_00000001 config_status prüfen nach Reconnect | Mittel | ESP muss online sein |
  | UNIQUE Constraint formal als CONSTRAINT (nicht nur Index) anlegen | Niedrig | Migration, Dev-Agent |

- **Nächste Schritte:** Der FW-01-Fix (NVS-Delete beim Sensor-Delete + OneWire-Scan-Fix) adressiert das richtige Problem. DB-seitig ist keine Änderung erforderlich. Die `config_status`-Spalte könnte für ein post-reconnect config-push Mechanismus genutzt werden — Devices mit `status='applied'` und ESP wieder `online` sollten automatisch einen Re-Config-Trigger erhalten.
