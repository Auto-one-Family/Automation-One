# Server Debug Report: SHT31 / ESP_472204

**Erstellt:** 2026-02-25
**Modus:** B (Spezifisch: "ESP_472204 SHT31 - Error Code 1007 I2C_TIMEOUT Flut, keine Sensor-Daten")
**Quellen:** `logs/server/god_kaiser.log` (17.000+ Zeilen, 6 Server-Starts), PostgreSQL-DB-Queries

---

## 1. Zusammenfassung

Der ESP_472204 sendet seit 20:05:53 Uhr im Sekundentakt Error Code 1007 (`I2C_TIMEOUT`) an den Server - insgesamt **640 Eintraege** allein fuer 1007, plus 730 fuer Code 1011 (`I2C_DEVICE_NOT_FOUND`). Der Server verarbeitet alle Errors korrekt (DB-Speicherung + WS-Broadcast), hat aber keinen serverseitigen Fehler im Zusammenhang mit dem Error-Flood. **Kein Sensor-Datenpunkt wurde je gespeichert** (`data_count = 0`, `last_data = NULL`). Die Root-Cause liegt ausschliesslich auf der Hardware-Seite: Der SHT31 antwortet nicht auf dem I2C-Bus. Zusaetzlich wurden **drei Server-Bugs** identifiziert, die nicht mit dem I2C-Problem zusammenhaengen, aber im Log sichtbar sind.

---

## 2. Analysierte Quellen

| Quelle | Status | Bemerkung |
|--------|--------|-----------|
| `logs/server/god_kaiser.log` | OK | 17.000+ Zeilen, 6 Server-Starts am 2026-02-25 |
| PostgreSQL `esp_devices` | OK | ESP_472204 online, zone=echt |
| PostgreSQL `sensor_configs` | OK | 2 Eintraege: sht31_temp + sht31_humidity, GPIO=0 |
| PostgreSQL `sensor_data` | OK | 0 Datenpunkte fuer ESP_472204, beide Sensoren |
| PostgreSQL `sensor_type_defaults` | OK | SHT31 korrekt registriert (sht31_temp, sht31_humidity) |
| `error_handler.py` | OK (Quellcode) | WS-Broadcast + DB-Speicherung bestätigt |
| `error_codes.py` (Server) | OK | Code 1007 = I2C_TIMEOUT definiert, Code 1009 = I2C_CRC_FAILED |
| Loki | Nicht geprüft (Fallback auf lokale Logs) | |

---

## 3. Befunde

### 3.1 Befund: Error Code 1007 - I2C_TIMEOUT Flut (HAUPT-BEFUND)

- **Schwere:** Kritisch (Hardware-Problem)
- **Detail:** ESP_472204 sendet Error 1007 (`I2C_TIMEOUT` = "I2C operation timed out - sensor not responding") im Takt von ca. 1x/Sekunde. Das bedeutet: Der SHT31 antwortet nie auf dem I2C-Bus. Die Firmware retried und scheitert dauerhaft.
- **Zeitraum:** 2026-02-25 20:05:53 bis 20:21:12 (mindestens 15 Minuten aktiv - Log-Ende)
- **Anzahl:** 640 Eintraege mit error_code=1007 fuer ESP_472204
- **Server-Verhalten:** KORREKT. Der `error_handler` speichert jeden Error in die DB und broadcastet via WebSocket. Kein Server-seitiger Fehler durch die Flut.
- **Evidenz:**
  ```
  "Error event saved: id=47883757-..., esp_id=ESP_472204, error_code=1007, severity=error"
  (ab 20:05:53, jede Sekunde)
  ```

### 3.2 Befund: Error Code 1011 - I2C_DEVICE_NOT_FOUND (Phase 2)

- **Schwere:** Kritisch (Hardware-Problem)
- **Detail:** Zuvor (ab ca. 20:15:26) wurden 730 Eintraege mit Code 1011 (`I2C_DEVICE_NOT_FOUND`) gespeichert. Der I2C-Bus-Scan findet den SHT31 nicht (Adresse 0x44 = decimal 68). Die Firmware-Initialisierung schlaegt fehl.
- **Bedeutung:** 1011 tritt bei der Initialisierung auf, 1007 beim Lesezyklus. Zwei unterschiedliche Fehlermodi - beides zeigt denselben Root-Cause: SHT31 nicht ansprechbar.
- **Evidenz:**
  ```
  "Error event saved: id=85ab6dc8-..., esp_id=ESP_472204, error_code=1011, severity=warning"
  (20:15:26, ca. 730x)
  ```

### 3.3 Befund: Error Code 1009 (Einzelfall)

- **Schwere:** Niedrig
- **Detail:** 1 Eintrag mit Code 1009 (`I2C_CRC_FAILED`) um 20:06:40. Einmaliger CRC-Fehler mitten in der 1007-Flut. Deutet auf einen kurzzeitigen Moment hin, wo I2C-Kommunikation partiell funktionierte, aber die Pruefsumme nicht stimmte.
- **Evidenz:**
  ```
  "Error event saved: id=18feaff7-..., esp_id=ESP_472204, error_code=1009, severity=error"
  ```

### 3.4 Befund: SHT31 hat NIE Daten geliefert

- **Schwere:** Kritisch
- **Detail:** Die DB-Abfrage bestaetigt: `data_count = 0`, `last_data = NULL` fuer beide Sensor-Eintraege (sht31_temp und sht31_humidity). Der sensor_handler hat in der gesamten Session KEINEN einzigen Datenpunkt empfangen.
- **Sensor-Handler-Logs fuer ESP_472204:** Keine einzigen Eintraege. Der `sensor_handler` wurde nie aufgerufen - der ESP sendet ausschliesslich Error-Events, keine Sensor-Daten.
- **DB-Evidenz:**
  ```sql
  ESP_472204 | 0 | sht31_temp     | 0 | NULL
  ESP_472204 | 0 | sht31_humidity | 0 | NULL
  ```

### 3.5 Befund: Heartbeat - GPIO Owner Validation Failure (WARNING, dauerhaft)

- **Schwere:** Mittel
- **Detail:** Jeder Heartbeat von ESP_472204 scheitert an der Pydantic-Validierung. Das ESP sendet `owner: "bus/onewire/4"` fuer ein GPIO-Status-Item. Der Server erwartet laut `GpioStatusItem`-Schema: `pattern='^(sensor|actuator|system)$'`. Der Wert `bus/onewire/4` entspricht keinem erlaubten Wert.
- **Frequenz:** Alle 60 Sekunden, kontinuierlich (11:22 bis 20:21, ueber 9 Stunden)
- **Zusatz-Warning:** GPIO count mismatch: ESP reportet `reported=3`, Server sieht `actual=2`.
- **Ursache:** ESP meldet im gpio_status einen I2C/OneWire-Bus-Pin als eigene GPIO-Reservation. Das Schema erlaubt diesen owner-Typ nicht.
- **Evidenz:**
  ```
  "GPIO status item 0 validation failed for ESP_472204: 1 validation error for GpioStatusItem
  owner: String should match pattern '^(sensor|actuator|system)$'
  [input_value='bus/onewire/4']"

  "GPIO count mismatch for ESP_472204: reported=3, actual=2"
  ```

### 3.6 Befund: Sensor Stale Warnings (Maintenance)

- **Schwere:** Niedrig (Folge-Symptom)
- **Detail:** Der `sensor_health` Maintenance-Job meldet alle ~60 Sekunden, dass GPIO 0 (sht31) "stale" ist - "no data for never (timeout: 180s)". Das ist korrekt und erwartet, weil nie Daten ankamen.
- **Evidenz:**
  ```
  "Sensor stale: ESP ESP_472204 GPIO 0 (sht31) - no data for never (timeout: 180s)"
  (ab 11:21:28, jede Minute)
  ```

### 3.7 Befund: Actuator Config FAILED (Dauerhaft, jeder Server-Neustart)

- **Schwere:** Mittel
- **Detail:** Bei jedem der 6 Server-Neustarts meldet der `config_handler` einen Fehler: `Config FAILED on ESP_472204: actuator - Actuator config array is empty`. Der ESP antwortet auf die Sensor-Konfiguration erfolgreich (2 Items), aber die Aktor-Config ist leer. Server sendet trotzdem eine Aktor-Config und bekommt eine leere Bestaetigung zurueck.
- **Anzahl:** 8 ERROR-Eintraege ueber den gesamten Tag (bei jedem Boot und manuellem Config-Push)
- **Evidenz:**
  ```
  "Config FAILED on ESP_472204: actuator - Actuator config array is empty
   (Error: MISSING_FIELD)"
  ```

### 3.8 Befund: Audit-Log Truncation Bug (Server-Bug)

- **Schwere:** Mittel (Server-Bug)
- **Detail:** Wenn der `config_handler` den Config-Fehler in die `audit_logs` Tabelle schreibt, scheitert der INSERT wegen `StringDataRightTruncationError: value too long for type character varying(36)`. Das Feld `request_id` in der DB ist auf 36 Zeichen begrenzt (typische UUID-Laenge), aber der gesendete Wert ist `unknown:config_response:no-seq:1772015906245` (44 Zeichen). Die Correlation-ID fuer MQTT-Messages ohne Sequence-Nummer ist zu lang fuer das Schema.
- **Anzahl:** 5 ERROR-Eintraege
- **Evidenz:**
  ```
  ERROR config_handler: Failed to store config response in audit log:
  StringDataRightTruncationError: value too long for type character varying(36)
  [... request_id='unknown:config_response:no-seq:1772015906245' ...]
  ```

### 3.9 Befund: MultipleResultsFound Bug (Server-Bug)

- **Schwere:** Hoch (Server-Bug, unhandled exception)
- **Detail:** `POST /api/v1/sensors/ESP_472204/0` um 20:11:36 loest einen `general_exception_handler`-Fehler aus: `MultipleResultsFound - Multiple rows were found when one or none was required`. Stack-Trace zeigt: `sensor_repo.get_by_i2c_address()` ruft `scalar_one_or_none()` auf, findet aber 2 Datensaetze. Ursache: In der DB existieren 2 `sensor_configs` fuer ESP_472204 mit GPIO=0 und I2C-Adresse=68 (hex 0x44): einmal `sht31_temp` und einmal `sht31_humidity`. Die Methode `get_by_i2c_address` erwartet maximal einen Eintrag pro Adresse, beruecksichtigt aber nicht, dass der SHT31 zwei Sensor-Typen auf derselben I2C-Adresse hat.
- **Root Cause:** `sensor_repo.py:757` - `scalar_one_or_none()` auf einem Query, der mehrere Zeilen zurueckgibt.
- **DB-Evidenz:**
  ```
  ESP_472204 | 0 | sht31_humidity | i2c_address=68 | id=991677fe...
  ESP_472204 | 0 | sht31_temp     | i2c_address=68 | id=f235c73a...
  ```
- **Code-Location:** `El Servador/god_kaiser_server/src/api/v1/sensors.py:1575` -> `sensor_repo.get_by_i2c_address()`
- **Evidenz im Log:**
  ```
  ERROR: Unhandled exception: MultipleResultsFound - Multiple rows were found when one or none was required
  File "/app/src/api/v1/sensors.py", line 1575, in _validate_i2c_config
      existing_with_address = await sensor_repo.get_by_i2c_address(esp_id, i2c_address)
  File "/app/src/db/repositories/sensor_repo.py", line 757, in get_by_i2c_address
      return result.scalar_one_or_none()
  ```

### 3.10 Befund: DBAPIError - Timezone Mismatch Bug (Server-Bug, global)

- **Schwere:** Hoch (Server-Bug, unhandled exception)
- **Detail:** 9 Eintraege im `general_exception_handler` wegen `DBAPIError: can't subtract offset-naive and offset-aware datetimes`. Ein Query auf `sensor_data` mit Zeitraum-Filter uebergibt timezone-aware `datetime`-Objekte an eine Spalte vom Typ `TIMESTAMP WITHOUT TIME ZONE`. Betrifft mehrere ESPs (mindestens ESP_472204 und eine andere UUID). Tritt bei API-Abfragen mit `start_time`/`end_time`-Parametern auf.
- **Code-Location:** `sensor_data` SELECT-Query mit `timestamp >= $2` und `timestamp <= $3`, timestamp-Werte mit `tzinfo` vs. naive Spalte.
- **Anzahl:** 9 unhandled exceptions, davon mindestens 1 mit ESP_472204-Bezug
- **Evidenz:**
  ```
  ERROR: Unhandled exception: DBAPIError - ... TypeError: can't subtract offset-naive
  and offset-aware datetimes
  [SQL: SELECT sensor_data ... WHERE sensor_data.timestamp >= $2::TIMESTAMP WITHOUT TIME ZONE]
  ```

---

## 4. Extended Checks (eigenständig durchgeführt)

| Check | Ergebnis |
|-------|----------|
| DB: `sensor_data` fuer ESP_472204 | 0 Datenpunkte, beide Sensoren, last_data=NULL |
| DB: `sensor_configs` fuer ESP_472204 | 2 Eintraege: sht31_temp + sht31_humidity, GPIO=0, i2c_address=68 |
| DB: `sensor_type_defaults` fuer SHT31 | Korrekt registriert: `sht31_temp`, `sht31_humidity`, timeout=180s |
| DB: `esp_devices` fuer ESP_472204 | status=online, last_seen=20:20:21, zone_id=echt |
| Circuit Breaker Status | Alle 3 Breaker CLOSED (closed=3, open=0) bei jedem Server-Start |
| Circuit Breaker Aktivierung durch 1007-Flut | KEINE. Der error_handler schreibt direkt in DB ohne Breaker-Pfad |
| Sensor-Handler-Logs | 0 Eintraege fuer ESP_472204 - SHT31 hat nie Daten gesendet |
| error_handler WebSocket-Broadcast | Aktiv: jeder Error wird per WS-Broadcast als `error_event` ans Frontend gesendet |
| Server-Neustarts am 2026-02-25 | 6 Neustarts (10:38, 11:28, 11:31, 12:59, 15:07, 19:05) |
| Audit-Log DB-Feld `request_id` VARCHAR(36) | Zu kurz fuer MQTT-Correlation-IDs ohne Sequence (`unknown:config_response:no-seq:...`) |
| I2C-Adresse SHT31 in DB | 0x44 = decimal 68, zweimal eingetragen (sht31_temp + sht31_humidity) |

---

## 5. Bewertung & Empfehlung

### Root Cause (SHT31 Problem)

Der SHT31 Sensor ist **physisch nicht erreichbar**. Die I2C-Adresse 0x44 antwortet nicht auf dem I2C-Bus. Das ist ein **Hardware-Problem** - nicht ein Server-Problem. Moegliche Ursachen:
1. SHT31 nicht korrekt verkabelt (SDA/SCL/VCC/GND)
2. Fehlende Pull-up-Widerstaende (4.7kΩ an SDA und SCL benoetigt)
3. SHT31 defekt
4. Falsche Stromversorgung (3.3V benoetigt, kein 5V-toleranter Eingang)
5. I2C-Adresse: SHT31 kann 0x44 (ADDR=GND) oder 0x45 (ADDR=VCC) sein - Adresspin pruefen

**Der Server arbeitet korrekt:** Er empfaengt die Errors, speichert sie in die DB, broadcastet sie ans Frontend. Kein Circuit-Breaker ausgeloest. Keine serverseitigen Fehler durch die Error-Flut.

### Server-Bugs (unabhaengig vom I2C-Problem)

#### Bug 1 (HOCH): MultipleResultsFound in `sensor_repo.get_by_i2c_address()`

**Datei:** `El Servador/god_kaiser_server/src/db/repositories/sensor_repo.py:757`

Das SHT31 ist ein Multi-Wert-Sensor (Temperatur + Feuchtigkeit) und erzeugt legitimerweise zwei `sensor_configs`-Eintraege auf derselben I2C-Adresse. Die Methode `get_by_i2c_address()` verwendet `scalar_one_or_none()`, was bei Multi-Wert-Sensoren fehlschlaegt.

**Fix:** `scalar_one_or_none()` durch `scalars().first()` ersetzen, oder die Query auf "existiert eine Konfiguration mit dieser Adresse bei einem anderen GPIO?" beschraenken.

#### Bug 2 (HOCH): DBAPIError - Timezone-Naive vs. Timezone-Aware datetime

**Datei:** `sensor_data`-Query-Pfad (API-Layer oder Repository)

Die `sensor_data` Tabelle nutzt `TIMESTAMP WITHOUT TIME ZONE`, aber der Python-Code uebergibt `datetime`-Objekte mit `tzinfo`.

**Fix:** Alle datetime-Parameter vor dem DB-Query per `.replace(tzinfo=None)` auf naive darstellen, oder die DB-Spalte auf `TIMESTAMP WITH TIME ZONE` migrieren.

#### Bug 3 (MITTEL): Audit-Log Truncation - `request_id` VARCHAR(36) zu kurz

**Datei:** `El Servador/god_kaiser_server/src/db/models/audit_log.py` + Migration

MQTT Correlation-IDs ohne Sequence-Nummer haben das Format `unknown:config_response:no-seq:1772015906245` (44 Zeichen), das Datenbankfeld `request_id` ist `VARCHAR(36)`.

**Fix:** Entweder das DB-Feld auf `VARCHAR(128)` oder `TEXT` erweiterern (Alembic-Migration noetig), oder die Correlation-ID fuer `request_id` auf 36 Zeichen kuerzen/abschneiden.

### Heartbeat Schema Bug (Bekannt)

**Datei:** `El Servador/god_kaiser_server/src/schemas/esp.py` - `GpioStatusItem.owner`

Das ESP sendet `owner: "bus/onewire/4"` fuer I2C/OneWire-Bus-Pins. Das Schema erlaubt nur `(sensor|actuator|system)`. Dieser Owner-Typ ist fuer Systembus-Reservierungen benoetigt.

**Fix:** Schema um `"bus"` als gueltigen owner-Typ erweitern: `pattern='^(sensor|actuator|system|bus)$'`. Oder die ESP-Firmware aendern, sodass Bus-Pins als `owner: "system"` gemeldet werden.

---

## 6. Error-Code Luecke in Referenz-Dokumentation

**Befund:** Error Code `1007` (`I2C_TIMEOUT`) und `1009` (`I2C_CRC_FAILED`) sind **nicht** in der Referenzdatei `.claude/reference/errors/ERROR_CODES.md` dokumentiert (Tabelle Section 2: I2C Errors stoppt bei 1014, Section 15 zeigt Synchronisations-Status). Sie sind aber in `error_codes.py` korrekt definiert:

```python
I2C_TIMEOUT = 1007       # "I2C operation timed out - sensor not responding"
I2C_CRC_FAILED = 1009    # (implizit)
```

Die ERROR_CODES.md Liste geht nur bis 1014 (`I2C_BUS_ERROR`) fuer I2C-Errors. Die Codes 1007, 1008, 1009 fehlen in der Dokumentation (obwohl sie in der Firmware und im Server-Code vorhanden sind).

**Empfehlung:** ERROR_CODES.md um I2C-Codes 1007-1009 erganzen.

---

## 7. Zusammenfassung der Probleme (priorisiert)

| Prioritaet | Problem | Bereich | Handlungsbedarf |
|------------|---------|---------|-----------------|
| P0 | SHT31 antwortet nicht auf I2C-Bus | **Hardware** | Verkabelung pruefen, Pullups pruefen, Sensor tauschen |
| P1 | `MultipleResultsFound` bei `get_by_i2c_address()` | **Server-Bug** | sensor_repo.py:757 fixen |
| P1 | Timezone-Mismatch bei sensor_data Queries | **Server-Bug** | datetime-Behandlung in Repository/API fixen |
| P2 | Audit-Log `request_id` VARCHAR(36) zu kurz | **Server-Bug** | DB-Migration auf VARCHAR(128) oder TEXT |
| P2 | Heartbeat `owner: "bus/onewire/4"` wird abgelehnt | **Schema-Bug** | GpioStatusItem schema erweitern |
| P3 | ERROR_CODES.md fehlen I2C-Codes 1007-1009 | **Doku-Luecke** | Referenz erganzen |
