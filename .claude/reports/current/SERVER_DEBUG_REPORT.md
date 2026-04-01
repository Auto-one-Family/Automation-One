# Server Debug Report

**Erstellt:** 2026-04-01
**Modus:** B (Spezifisch: "Datenbankverbindungs-Probleme und SystemMonitor-bezogene Fehler")
**Quellen:** Docker logs el-servador (200 Zeilen), Docker logs postgres (100 Zeilen), docker compose ps, Quellcode-Analyse debug.py, sensor_handler.py, schemas/debug_db.py

---

## 1. Zusammenfassung

Zwei klar isolierte Bugs gefunden. Bug #1 ist der Hauptverursacher der 500-Fehler im System Monitor: In `debug.py:2235` wird ein `datetime`-Objekt via `.isoformat()` als `str` an asyncpg weitergegeben — asyncpg erwartet aber eine `datetime`-Instanz. Bug #2 ist ein VPD-Duplicate-Key-Fehler in `sensor_handler.py`: beide SHT31-Readings (Temp + Humidity) triggern gleichzeitig `_try_compute_vpd()` und versuchen denselben VPD-Eintrag mit identischem Timestamp doppelt zu schreiben. Beide Bugs sind aktiv und reproduzierbar. Handlungsbedarf sofort bei Bug #1.

---

## 2. Analysierte Quellen

| Quelle | Status | Bemerkung |
|--------|--------|-----------|
| `docker logs el-servador` | FEHLER gefunden | 2x kritischer Stack-Trace sichtbar |
| `docker logs postgres` | FEHLER gefunden | Duplicate-Key-Violation, fehlerhafte Queries |
| `docker compose ps` | OK | Alle 12 Services healthy/running |
| `src/api/v1/debug.py` | BUG | Zeile 2235: `.isoformat()` statt datetime-Objekt |
| `src/schemas/debug_db.py` | OK | TIME_SERIES_TABLES korrekt definiert |
| `src/mqtt/handlers/sensor_handler.py` | BUG | Zeile 526-546: Race Condition bei VPD-Berechnung |

---

## 3. Befunde

### 3.1 BUG-1: `debug.py:2235` — datetime wird als String an asyncpg übergeben (System Monitor kaputt)

- **Schwere:** CRITICAL
- **Datei:Zeile:** `El Servador/god_kaiser_server/src/api/v1/debug.py:2235`
- **Detail:** In der Funktion `query_table()` wird der automatische Zeitfilter fuer Time-Series-Tabellen (sensor_data, actuator_history, logic_execution_history, audit_logs) als ISO-String uebergeben: `params[param_name] = cutoff.isoformat()`. asyncpg mit dem PostgreSQL-asyncpg-Dialekt kann einen `str` nicht als `TIMESTAMP WITH TIME ZONE` binden — es erwartet eine `datetime`-Instanz.
- **Evidenz aus Docker-Log:**
  ```
  asyncpg.exceptions.DataError: invalid input for query argument $1:
  '2026-03-31T08:28:35.438416+00:00'
  (expected a datetime.date or datetime.datetime instance, got 'str')
  [SQL: SELECT COUNT(*) FROM actuator_history WHERE timestamp >= $1]
  [parameters: ('2026-03-31T08:28:35.438416+00:00',)]
  ```
  Traceback zeigt: `File "/app/src/api/v1/debug.py", line 2285, in query_table`
- **Root Cause:** `cutoff = datetime.now(timezone.utc) - timedelta(hours=24)` erzeugt ein korrektes datetime-Objekt, aber `.isoformat()` konvertiert es zu einem String. asyncpg akzeptiert bei prepared statements mit `$1` keine Strings fuer Timestamp-Spalten.
- **Konkreter Fix:**
  ```python
  # debug.py Zeile 2235 — VORHER (falsch):
  params[param_name] = cutoff.isoformat()

  # NACHHER (korrekt):
  params[param_name] = cutoff
  ```

### 3.2 BUG-2: `sensor_handler.py` — VPD Duplicate Key Violation (PostgreSQL-Error alle ~30 Sekunden)

- **Schwere:** HIGH
- **Datei:Zeile:** `El Servador/god_kaiser_server/src/mqtt/handlers/sensor_handler.py:526` (VPD-Hook) und `677-692` (`_try_compute_vpd`)
- **Detail:** Wenn ein ESP-Geraet gleichzeitig `sht31_temp` und `sht31_humidity` in einer MQTT-Nachricht sendet, werden beide Readings parallel verarbeitet. Beide loesen den VPD-Hook aus. Beide rufen `_try_compute_vpd()` auf, finden den Partner-Wert bereits in der DB und versuchen, denselben VPD-Eintrag mit identischem `(esp_id, gpio=0, sensor_type='vpd', timestamp)` zu inserieren. Der zweite INSERT schlaegt mit Unique-Constraint-Verletzung fehl.
- **Evidenz aus PostgreSQL-Log:**
  ```
  ERROR:  duplicate key value violates unique constraint "uq_sensor_data_esp_gpio_type_timestamp"
  DETAIL:  Key (esp_id, gpio, sensor_type, "timestamp")=
    (63f776d4-d0fc-4191-b4e3-58c1d77ebb4d, 0, vpd, 2026-04-01 08:28:17+00) already exists.
  ```
  Tritt zweimal pro Sensor-Intervall auf (sichtbar um 08:28:16 und 08:28:47).
- **Bestehende Behandlung:** In `_try_compute_vpd` wird `if vpd_data is None: return` als Duplicate-Guard verwendet (Zeile 694-696). Das greift aber nicht: `sensor_repo.save_data()` schluckt den Fehler nicht intern und gibt nicht `None` zurueck — die PostgreSQL-Exception propagiert. Sie wird weiter oben durch `except Exception as e: logger.debug(...)` auf Debug-Level unterdruckt. Der Fehler ist auf Anwendungsebene "silent", erzeugt aber regelmaeßig ERROR-Logs auf PostgreSQL-Seite und Rollback-Kosten.
- **Fix-Optionen:**
  - **Option A (empfohlen):** VPD-Hook nur beim `sht31_temp`-Trigger ausfuehren, `sht31_humidity`-Ast entfernen. In `sensor_handler.py:526` Bedingung von `if sensor_type in ("sht31_temp", "sht31_humidity"):` zu `if sensor_type == "sht31_temp":` aendern. Eliminiert die Race Condition vollstaendig, kein Datenverlust.
  - **Option B:** In `sensor_repo.save_data()` ein `INSERT ... ON CONFLICT DO NOTHING` ergaenzen.

### 3.3 INFO: Frontend 404 bei `GET /api/v1/debug/db/actuator_history/{record_id}`

- **Schwere:** MEDIUM (Folge-Fehler von BUG-1)
- **Detail:** Das Frontend ruft `getRecord('actuator_history', '36f25972-4290-4ac7-9414-8229ebc0e188')` auf und erhaelt 404. Das ist kein eigenstaendiger Server-Bug — die Record-ID existiert nicht in der DB, weil der Table-Query-Endpoint durch BUG-1 kaputt war und keine validen IDs geladen werden konnten. Nach Behebung von BUG-1 sollte sich dieses Problem von selbst loesen.
- **Evidenz:**
  ```
  [FRONTEND] [PromiseRejection] Request failed with status code 404
  (url: http://localhost:5173/system-monitor)
  database.ts:46 → getRecord → loadRecord (database.store.ts:130)
  ```

### 3.4 WARNING: I2C sensor config not found (DS18B20 auf gpio=4)

- **Schwere:** LOW / Bekannt
- **Detail:** `I2C sensor config not found: esp_id=ESP_EA5484, gpio=4, type=ds18b20, addr=0x44. Saving data without config.` — DS18B20 ist ein OneWire-Sensor, wird aber mit `i2c_address=68` (0x44, SHT31-Adresse) im Metadata gefuehrt. Daten werden trotzdem korrekt gespeichert (`processing_mode=raw_conversion`). Kein kritischer Fehler, aber Hinweis auf falsche Sensorconfig-Metadaten im device_metadata JSON.

---

## 4. Extended Checks (eigenstaendig durchgefuehrt)

| Check | Ergebnis |
|-------|----------|
| `docker compose ps` | Alle 12 Services healthy/running. Kein Container-Problem. |
| PostgreSQL-Logs | Keine Connection-Fehler. Verbindung stabil. Checkpoint normal. |
| Server liveness (aus Logs) | `GET /api/v1/health/live` → 200 (0.3ms) |
| `TIME_SERIES_TABLES` (debug_db.py:156) | Korrekt definiert: sensor_data, actuator_history, logic_execution_history, audit_logs |
| VPD-Save-Pfad sensor_handler.py:526 | Hook feuert bei sht31_temp UND sht31_humidity — Race Condition bestaetigt |
| `if vpd_data is None` Guard (Zeile 694) | Greift nicht — Exception propagiert vor dem Return |
| MQTT-Pipeline sonstig | Normal: Pi-Enhanced OK, sht31_temp/humidity werden korrekt verarbeitet |

---

## 5. Bewertung & Empfehlung

### Root Causes

**BUG-1 (CRITICAL):** `debug.py:2235` — `cutoff.isoformat()` muss `cutoff` (datetime-Objekt) sein. asyncpg akzeptiert keine Strings fuer Timestamp-Parameter in prepared statements. Jede Abfrage auf allen Time-Series-Tabellen im System Monitor schlaegt fehl.

**BUG-2 (HIGH):** `sensor_handler.py:526` — VPD-Computation-Hook feuert bei beiden SHT31-Sensor-Typen. Race Condition bei gleichzeitiger Verarbeitung erzeugt regelmaessige Duplicate-Key-Violations in PostgreSQL. Empfehlung: VPD nur beim `sht31_temp`-Trigger berechnen.

### Nächste Schritte (nach Prioritaet)

1. **CRITICAL — Sofort:** `debug.py:2235`: `cutoff.isoformat()` → `cutoff`. Eine Zeile, minimales Risiko.
2. **HIGH — Zeitnah:** `sensor_handler.py:526`: VPD-Hook-Bedingung von `in ("sht31_temp", "sht31_humidity")` zu `== "sht31_temp"` aendern.
3. **LOW — Optional:** DS18B20-Sensorconfig-Metadaten: `i2c_address=68` bei OneWire-Sensor ist inhaltlich falsch (kein Blocker, Daten werden korrekt gespeichert).
