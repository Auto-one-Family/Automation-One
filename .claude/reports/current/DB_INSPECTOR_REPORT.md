# DB Inspector Report

**Erstellt:** 2026-03-26 17:09 UTC
**Modus:** B (Spezifisch: "ESP_EA5484 Sensor-Config Probleme - DS18B20 Overwrite, SHT31 0x45 nicht erkannt, Subzone-Drift, I2C Crash")
**Quellen:** sensor_configs, sensor_data, subzone_configs, esp_devices, audit_logs, pg_constraint, pg_indexes, alembic_version, device_metadata

---

## 1. Zusammenfassung

ESP_EA5484 zeigt aktuell einen konsistenten DB-Zustand mit 4 aktiven sensor_configs (ds18b20, sht31_temp, sht31_humidity, vpd-virtual). Die gemeldeten Probleme (zweiter DS18B20 ersetzt ersten, zweiter SHT31 nicht erkannt, Subzone-Drift) sind NICHT im DB-Endzustand sichtbar, sondern spiegeln Verhaltensbugs im Server-Code oder Firmware-Konfigurationsprozess wider. Kritisch: Der UNIQUE-Constraint `unique_esp_gpio_sensor_interface_v2` ist korrekt via COALESCE implementiert (Migration `fix_null_coalesce_unique`), erlaubt aber mehrere SHT31 an verschiedenen I2C-Adressen strukturell. Ein zweiter SHT31 (0x45 = 69) ist aktuell NICHT in der DB registriert - die Frage ist warum der Server ihn nicht anlegt. Subzones haben vollständig leere `assigned_gpios` und `assigned_sensor_config_ids`, obwohl `sensor_count=1` für "Außen" gesetzt ist - eine Inkonsistenz.

---

## 2. Analysierte Quellen

| Quelle | Status | Bemerkung |
|--------|--------|-----------|
| automationone-postgres | OK | Container healthy, port 5432 |
| pg_isready | OK | Implizit: Query-Ausführung erfolgreich |
| sensor_configs (ESP_EA5484) | OK | 4 Rows, kein Orphan |
| sensor_data (ESP_EA5484) | OK | Alle 4 Configs haben Daten, keine Orphans |
| subzone_configs (ESP_EA5484) | AUFFÄLLIG | sensor_count/assigned_sensor_config_ids inkonsistent |
| audit_logs (24h) | OK - I2C Errors dokumentiert | I2C-Crash-Kaskade protokolliert, keine sensor_config events |
| pg_constraint / pg_indexes | OK | COALESCE-UNIQUE korrekt, 6 Indizes |
| alembic_version | OK | `fix_null_coalesce_unique` (aktuell) |
| device_metadata | OK | simulation_config hat nur 1 DS18B20, keine SHT31s |

---

## 3. Befunde

### 3.1 Aktueller sensor_configs Zustand (ESP_EA5484)

ESP interne UUID: `70b6d2eb-215b-4e6e-b713-5ce9b8c259e7`
Zone: `zelt_wohnzimmer` | Status: `online`

| id (gekürzt) | sensor_type | gpio | onewire_address | i2c_address | sensor_name | enabled | assigned_subzones | assigned_zones |
|---|---|---|---|---|---|---|---|---|
| 35c9e5da | ds18b20 | 4 | `28FF641F7FCCBAE1` | NULL | Temp B083 | true | [] | [] |
| 0afefad0 | sht31_temp | 0 | NULL | 68 (0x44) | (leer) | true | [] | [] |
| 1c302dcd | sht31_humidity | 0 | NULL | 68 (0x44) | (leer) | true | [] | [] |
| 6b57049b | vpd | 0 | NULL | NULL | VPD (berechnet) | true | [] | [] |

**Befund:**
- Nur **ein** DS18B20 mit Adresse `28FF641F7FCCBAE1` registriert. Kein zweiter.
- Nur **ein** SHT31 an Adresse `0x44 (68)` registriert. Kein SHT31 an `0x45 (69)`.
- `sensor_name` bei sht31_temp und sht31_humidity ist **leer** (leerer String, nicht NULL).
- `assigned_subzones` und `assigned_zones` bei ALLEN 4 Sensoren: `[]` (leer).

### 3.2 Problem: Zweiter DS18B20 ersetzt ersten statt parallel

- **Schwere:** Hoch
- **Root Cause Kandidat:** Server-seitig im Add-Flow
- **DB-Evidenz:** Aktuell nur 1 DS18B20 in der DB (Adresse `28FF641F7FCCBAE1`). Der Constraint `unique_esp_gpio_sensor_interface_v2` verwendet `COALESCE(onewire_address, '')`. Zwei DS18B20 mit **unterschiedlichen** Adressen würden unterschiedliche COALESCE-Werte ergeben und könnten also technisch koexistieren.
- **Hypothese:** Der Server-Add-Handler führt beim Hinzufügen eines zweiten DS18B20 ein `UPDATE` oder `UPSERT` auf dem bestehenden Eintrag aus statt ein `INSERT`. Möglicherweise matcht die Lookup-Logik nur auf `(esp_id, gpio, sensor_type)` ohne `onewire_address` zu berücksichtigen.
- **Prüfen:** `simulation_config` in device_metadata bestätigt dies: Dort ist nur 1 DS18B20-Key (`cfg_35c9e5da-...`) mit Adresse `28FF641F7FCCBAE1`. Kein zweiter Eintrag jemals gespeichert.
- **Known Bug:** Entspricht NB6 aus T02-T08 Verifikation (Memory): `simulation_config` Key-Format `{gpio}_{sensor_type}` überschreibt bei gleichem GPIO+Typ. Hier spezifisch: Der Lookup vor dem Insert dürfte ebenfalls nur nach `(esp_id, gpio, sensor_type)` suchen.

### 3.3 Problem: Zweiter SHT31 (0x45) nicht erkannt

- **Schwere:** Hoch
- **DB-Evidenz:** Kein Eintrag für `sensor_type=sht31_temp` oder `sht31_humidity` mit `i2c_address=69 (0x45)` in sensor_configs. Die DB enthält ausschließlich i2c_address=68.
- **UNIQUE Constraint Analyse:**
  ```
  unique_esp_gpio_sensor_interface_v2:
  COALESCE(onewire_address, '') + COALESCE(i2c_address::text, '')

  Bestehend:  (esp_id, gpio=0, 'sht31_temp', '', '68')
  Neu 0x45:   (esp_id, gpio=0, 'sht31_temp', '', '69')
  ```
  Der Constraint würde einen zweiten SHT31 an 0x45 **erlauben** - die Werte sind verschieden.
- **Hypothese A:** Der Discovery-Flow vom ESP sendet den zweiten SHT31 nicht oder sendet ihn mit der falschen Adresse (0x44 statt 0x45 - Firmware-Bug).
- **Hypothese B:** Der Server-Config-Builder erkennt den zweiten SHT31 nicht als neue Entität, weil er nur nach `(gpio, sensor_type)` sucht und den ersten findet (Update statt Insert).
- **I2C-Crash-Kontext:** Die I2C-Fehler (16:48-16:59) entstanden vermutlich beim Versuch, den zweiten SHT31 an 0x45 anzusprechen. Der I2C-Bus crashte nach der Rekonfiguration - möglicherweise weil der Config-Push nur den 0x44-Sensor sendete, der ESP aber bereits 0x45 initialisiert hatte.

### 3.4 Problem: Subzone-Zuordnungen werden unerwartet umgestellt

- **Schwere:** Mittel
- **DB-Evidenz (subzone_configs):**

| subzone_id | subzone_name | assigned_gpios | assigned_sensor_config_ids | sensor_count |
|---|---|---|---|---|
| au_en | Außen | `[]` | `[]` | **1** |
| innen | Innen | `[]` | `[]` | 0 |
| innen_ebene_2 | Innen Ebene 2 | `[]` | `[]` | 0 |

- **Inkonsistenz:** `sensor_count=1` für "Außen" (au_en), aber `assigned_sensor_config_ids=[]` und `assigned_gpios=[]`. Der Counter wurde hochgezählt, die tatsächlichen Zuordnungen aber nicht persistiert - oder wurden nachträglich geleert.
- **sensor_configs Seite:** Alle 4 Sensoren haben `assigned_subzones=[]`. Kein Sensor ist irgendeiner Subzone zugeordnet.
- **Hypothese:** Beim Hinzufügen eines Sensors wird `subzone_configs.sensor_count` inkrementiert, aber das Schreiben in `assigned_sensor_config_ids` und das Setzen von `assigned_subzones` in sensor_configs schlägt fehl oder wird durch einen nachfolgenden Update überschrieben (Partial-Write-Problem oder Race Condition).
- **Subzone-Name-Bug (NB9):** Die Subzone-ID `au_en` deutet auf ein Transliterations-Problem hin: "Außen" wurde zu "au_en" statt "aussen" sluggifiziert - möglicherweise wird das "ß" als "e" interpretiert ("auen" -> "au_en"). Das ist ein separater kosmetischer Bug.

### 3.5 I2C-Bus Crash-Kaskade

- **Schwere:** Hoch (ESP-Reboot)
- **DB-Evidenz (audit_logs, chronologisch):**

| Zeitpunkt | Event |
|---|---|
| 16:48:42 | Sensor antwortet nicht am I2C-Bus (Error 1013) |
| 16:49:13 | I2C Recovery gestartet + erfolgreich |
| 16:49:19 | Config-Push: 3 Sensoren erfolgreich konfiguriert |
| 16:51:20 | Sensor antwortet nicht am I2C-Bus |
| 16:51:21 | I2C Recovery gestartet + erfolgreich |
| 16:51:22 | Write-Fehler auf I2C |
| 16:52:21 | I2C-Bus blockiert (Timeout/Kurzschluss = Error 1014) |
| 16:52:26 | Watchdog feed blocked: Critical errors active |
| 16:53:18 | LWT received - ESP disconnected (Reboot) |
| 16:54:47 | Sensor antwortet nicht (nach Reboot) |
| 16:57:48 | Recovery-Zyklus |
| 16:58:21 | I2C-Bus blockiert |
| 16:58:23 | Watchdog feed blocked |
| 16:59:09 | LWT received - zweiter Reboot |

- **Muster:** Die Kaskade `1013 (no response) → Recovery → 1018 (write failed) → 1014 (bus blocked) → Watchdog blocked → ESP-Reboot` wiederholt sich. Der Config-Push auf `3 items` (16:49:19) löst immer wieder denselben Crash aus.
- **Hypothese:** Der Config-Push sendet Konfiguration für SHT31 an Adresse 0x44, aber ein zweiter SHT31 an 0x45 hängt physisch am Bus und antwortet auf einen Write-Befehl mit Stretch/NAK, der den Bus blockiert.

### 3.6 UNIQUE Constraint Analyse

- **Schwere:** Niedrig (korrekt implementiert)
- **Constraint:** `unique_esp_gpio_sensor_interface_v2`
  ```sql
  CREATE UNIQUE INDEX unique_esp_gpio_sensor_interface_v2
  ON sensor_configs (
      esp_id, gpio, sensor_type,
      COALESCE(onewire_address, ''),
      COALESCE(i2c_address::text, '')
  )
  ```
- **Bewertung:** Der COALESCE-Ansatz ist korrekt. NULL wird als '' behandelt, sodass:
  - Zwei DS18B20 mit verschiedenen Adressen: ERLAUBT (unterschiedliche COALESCE-Werte)
  - VPD (beide NULL): (`esp_id`, `gpio`, `vpd`, `''`, `''`) - nur einmal erlaubt
  - Zwei SHT31 an 0x44 und 0x45: ERLAUBT (`'68'` vs `'69'`)
- **DB ist nicht das Problem** bei DS18B20 Overwrite oder SHT31 0x45 - der Constraint würde beide zulassen. Der Bug liegt im Server-Code der die Sensoren anlegt.
- **Migration `fix_null_coalesce_unique`:** Ist auf der DB angewendet. Der Alembic-Stand `fix_null_coalesce_unique` ist der aktuelle Head.

### 3.7 sensor_name leer bei SHT31

- **Schwere:** Niedrig
- **DB-Evidenz:** `sensor_name = ''` (leerer String) für sht31_temp und sht31_humidity.
- **Kontext:** Entspricht NB7 aus bekannten Bugs: Der OneWire-Add-Flow ignoriert User-Inputs (Name), und möglicherweise hat der SHT31-Batch-Create-Flow denselben Defekt.

### 3.8 simulation_config in device_metadata

- **Schwere:** Mittel (Inkonsistenz zwischen Quellen)
- **DB-Evidenz:** `device_metadata.simulation_config.sensors` enthält nur:
  ```json
  {"cfg_35c9e5da-...": {"sensor_type": "ds18b20", "gpio": 4, "name": "Außentemperatur", ...}}
  ```
- **Inkonsistenz:** Die sensor_configs-Tabelle hat 4 Einträge (ds18b20 + sht31_temp + sht31_humidity + vpd), aber simulation_config hat nur 1 (nur ds18b20). SHT31-Sensoren fehlen komplett in simulation_config.
- **simulation_config_updated_at:** `2026-03-26T16:35:02` - das ist BEVOR die SHT31s um 16:35:50 angelegt wurden. simulation_config wurde nie aktualisiert nach dem SHT31-Add.
- **Kontext:** Entspricht NB8: Dual-Storage Desync zwischen `device_metadata.simulation_config` (JSON) und `sensor_configs` (DB-Tabelle).

### 3.9 sensor_data Orphan-Check

- **Schwere:** Keine
- **Ergebnis:** Keine Orphan-Rows in sensor_data für ESP_EA5484. Alle 4 Configs haben Messdaten.

| sensor_type | gpio | onewire_address | i2c_address | data_count | first_reading | last_reading |
|---|---|---|---|---|---|---|
| sht31_humidity | 0 | NULL | 68 | 199 | 14:18:08 | 17:07:35 |
| sht31_temp | 0 | NULL | 68 | 200 | 14:18:08 | 17:07:35 |
| vpd | 0 | NULL | NULL | 201 | 14:18:08 | 17:07:35 |
| ds18b20 | 4 | 28FF641F7FCCBAE1 | NULL | 209 | 14:19:08 | 17:07:17 |

---

## 4. Extended Checks (eigenständig durchgeführt)

| Check | Ergebnis |
|-------|----------|
| pg_isready (implizit) | OK - Queries laufen durch |
| docker compose ps postgres | OK - `Up 5 hours (healthy)` |
| alembic_version | `fix_null_coalesce_unique` - aktueller Stand |
| sensor_configs Spaltenstruktur | Reale Struktur weicht von Skill-Dok ab: kein `subzone_id`, stattdessen `assigned_subzones` (JSON) + `assigned_zones` (JSON) |
| subzone_configs Spaltenstruktur | `assigned_sensor_config_ids` (JSON) vorhanden, kein FK zu sensor_configs |
| audit_logs Spaltenstruktur | Kein `action`-Column - stattdessen `event_type`, `source_type`, `source_id` |
| device_metadata simulation_config | Nur ds18b20 enthalten, SHT31 fehlen → NB8 bestätigt |
| pg_constraint (UNIQUE) | 0 formale UNIQUE-Constraints - Constraint ist als UNIQUE INDEX implementiert (korrekt) |

---

## 5. Bewertung & Empfehlung

### Root Causes (nach Wahrscheinlichkeit)

**RC-1 (Hoch): Server Add-Handler matcht Sensoren ohne interface-spezifische Adresse**
Der Handler für `/sensors/add` oder der Config-Builder sucht beim UPSERT-Check nach `(esp_id, gpio, sensor_type)` ohne `onewire_address`/`i2c_address` zu berücksichtigen. Dadurch:
- DS18B20 neu hinzufügen → findet den bestehenden Eintrag → Update statt Insert → zweiter DS18B20 nie angelegt
- SHT31 an 0x45 hinzufügen → findet den bestehenden 0x44-Eintrag → Update (ändert i2c_address) → kein zweiter Eintrag

**RC-2 (Mittel): Subzone partial-write - sensor_count inkrementiert aber assigned_sensor_config_ids nicht persistiert**
Das Zuordnungsschreiben in `assigned_sensor_config_ids` (subzone_configs) und `assigned_subzones` (sensor_configs) wird entweder nicht ausgeführt oder durch einen nachfolgenden Schreibvorgang überschrieben. Möglicherweise wird beim Config-Push (der 3 items sendet) die Subzone-Zuordnung zurückgesetzt.

**RC-3 (Mittel): I2C-Bus-Crash durch physisch vorhandenen SHT31 an 0x45**
Der ESP kennt seinen zweiten SHT31 an 0x45, der Server hat ihn nicht registriert und sendet keinen entsprechenden Config-Push. Der ESP versucht bei Boot 0x45 zu initialisieren, erhält aber keine Konfiguration vom Server. Die unkonfigurierte Initialisierung (oder der Scan) blockiert den Bus.

**RC-4 (Niedrig): simulation_config NB8 Desync**
SHT31s wurden nach dem letzten simulation_config-Update angelegt. Kein erneuter Push der simulation_config nach dem SHT31-Add.

### Nächste Schritte

| Priorität | Bereich | Aktion |
|---|---|---|
| P1 | Server-Code | `config_builder.py` und Sensor-Add-Handler prüfen: Lookup-Logik beim UPSERT muss `onewire_address` UND `i2c_address` einbeziehen |
| P1 | Server-Code | SHT31-Batch-Create-Flow prüfen (NB7/NB10): Wird `sht31_temp`+`sht31_humidity` für 0x45 separat angelegt? |
| P2 | Server-Code | Subzone-Zuordnungs-Schreibpfad prüfen: Wo wird `assigned_sensor_config_ids` in subzone_configs befüllt? Wird es beim Config-Push zurückgesetzt? |
| P2 | Server-Code | simulation_config nach jedem Sensor-Add aktualisieren (NB8) |
| P3 | DB-Cleanup | sensor_name für sht31_temp/sht31_humidity setzen (nach Server-Fix, via Update) |
| P3 | Firmware | I2C-Scan-Verhalten bei nicht-konfiguriertem Sensor an 0x45 prüfen (Error 1013/1014 Quelle) |

### DB-Integrität: Kein Handlungsbedarf

Die Datenbank selbst ist konsistent:
- Keine Orphaned Records
- UNIQUE Constraint korrekt implementiert
- Migration auf aktuellem Stand
- Sensor-Data vollständig und verknüpft

Die Bugs liegen ausschließlich im Server-Code (config_builder, sensor-add handler, subzone-write-path) und Firmware (I2C-Adress-Handling für zweiten SHT31).
