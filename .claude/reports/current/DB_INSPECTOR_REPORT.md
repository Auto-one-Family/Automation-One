# DB Inspector Report

**Erstellt:** 2026-03-25
**Modus:** B (Spezifisch: "actuator_states Konsistenz nach INV-1c Refactoring + allgemeiner DB-Status")
**Quellen:** esp_devices, sensor_configs, sensor_data, actuator_configs, actuator_states, actuator_history, esp_heartbeat_logs, audit_logs, zones, subzone_configs, pg_stat_activity, pg_stat_user_tables, alembic_version

---

## 1. Zusammenfassung

Die Datenbank ist erreichbar und migriert auf Head (`add_sensor_data_dedup`). Der kritischste Befund ist, dass beide `actuator_states`-Eintraege noch den alten State `idle` tragen — nach dem INV-1c Refactoring haetten diese `off` (oder `unknown`) sein sollen. Aktive Sensordaten (SHT31, MOCK_T18V6LOGIC) laufen heute ein. Sieben veraltete Mock-Devices belegen Tabellenplatz, sind aber als `deleted` oder `offline` markiert und unkritisch. Kein Datenverlust, keine Orphan-Records.

---

## 2. Analysierte Quellen

| Quelle | Status | Bemerkung |
|--------|--------|-----------|
| automationone-postgres (Container) | OK | Up 33 min, healthy |
| god_kaiser_db (psql-Verbindung) | OK | Verbindung erfolgreich |
| alembic_version | OK | `add_sensor_data_dedup` (HEAD) |
| esp_devices | OK | 10 Eintraege (2 real, 8 mock) |
| sensor_data | OK | 5094 Eintraege, heute aktiv |
| actuator_states | WARNUNG | `idle` State existiert noch (sollte `off`/`unknown` sein) |
| actuator_history | OK | 291 Eintraege, command_types korrekt (ON/OFF) |
| esp_heartbeat_logs | INFO | 1271 Eintraege, letzte von 2026-03-12 |
| sensor_configs | OK | 10 Eintraege, keine Orphans |
| actuator_configs | OK | 2 Eintraege, keine Orphans |

---

## 3. Befunde

### 3.1 actuator_states: Veraltete `idle`-States (INV-1c Fokus)

- **Schwere:** Mittel
- **Detail:** Beide Eintraege in `actuator_states` tragen `state = 'idle'`. Nach dem INV-1c Refactoring sollten die gueltigen States `on`, `off`, `pwm` oder `unknown` sein. `idle` ist ein Pre-Refactoring-Wert und koennte im Frontend oder in API-Responses zu Inkonsistenzen fuehren, wenn der neue Code nur neue State-Werte erwartet.
- **Evidenz:**
  ```
  gpio | actuator_type | state | last_command    | data_source  | last_command_timestamp
  27   | relay         | idle  | (null)          | production   | 2026-03-11 11:58:18+00
  27   | pump          | idle  | EMERGENCY_STOP  | mock         | 2026-03-11 07:58:07+00
  ```
- **Bewertung:** Die actuator_history zeigt korrekte `command_type`-Werte (`ON`, `OFF`, `EMERGENCY_STOP`). Das Problem liegt nur in den persistierten `state`-Werten in `actuator_states`, nicht in der History.

### 3.2 Keine alten `active`-States gefunden

- **Schwere:** Keine
- **Detail:** Es gibt keine `state = 'active'` Eintraege. Nur `idle` ist als veralteter State vorhanden (kein `active`).
- **Evidenz:** `SELECT DISTINCT state FROM actuator_states` gibt nur `idle` zurueck.

### 3.3 Stale Mock-Devices (7 Stueck)

- **Schwere:** Niedrig
- **Detail:** 7 Mock-Devices sind seit dem 2026-03-11 inaktiv (>14 Tage). 6 davon haben `status = 'deleted'`, einer hat `status = 'offline'`. Die geloeschten Devices belegen noch Tabelleneintraege.
- **Evidenz:**
  ```
  MOCK_HYSTEKVZEGKQ | deleted | 2026-03-11
  MOCK_RULEEL660ZL3 | deleted | 2026-03-11
  MOCK_SEQ89ZLJWE8  | deleted | 2026-03-11
  MOCK_SEQ7M4BQYYO  | deleted | 2026-03-11
  MOCK_RULE0DR561OK | deleted | 2026-03-11
  MOCK_HYSTRI8BX55Z | deleted | 2026-03-11
  MOCK_24557EC6     | offline | 2026-03-11
  ```
- **Hinweis:** Der `orphaned_mock_cleanup`-Job im MaintenanceService wuerde diese bereinigen, ist aber laut SKILL.md standardmaessig deaktiviert.

### 3.4 Aktive Sensor-Daten heute

- **Schwere:** Keine (positiver Befund)
- **Detail:** 122 sensor_data-Eintraege heute (2026-03-25), beide vom selben ESP (`c24e4fe9` = MOCK_T18V6LOGIC, `status = online`). Sensortypen: `sht31_temp` und `sht31_humidity`. Neueste Messung: 2026-03-25 09:33:32 UTC.

### 3.5 Heartbeat-Logs: Keine neuen Eintraege seit 2026-03-12

- **Schwere:** Niedrig (Information)
- **Detail:** Die 1271 Heartbeat-Logs enden am 2026-03-12. Seither werden keine neuen Heartbeats gespeichert. Das koennte bedeuten, dass der Heartbeat-Handler des aktiven Mock-ESPs keine Logs mehr schreibt, oder dass der entsprechende MQTT-Handler nach einem Neustart nicht mehr aktiv ist.
- **Evidenz:** `MAX(timestamp) = 2026-03-12 10:50:11` bei 1271 Gesamteintraegen, `COUNT(letzte 24h) = 0`.

### 3.6 Tabellen-Bloat: Einige Tabellen benoetigen VACUUM

- **Schwere:** Niedrig
- **Detail:** Mehrere Tabellen haben ein unguenstiges dead_tup-Verhaeltnis. PostgreSQL erledigt autovacuum automatisch, aber bei kleinen Tabellen mit vielen Updates sind die Prozentwerte hoch.
- **Evidenz:**
  ```
  cross_esp_logic:  40 tote Zeilen bei 1 live  -> 4000% dead_pct
  kaiser_registry:  16 tote Zeilen bei 0 live  -> 1600%
  esp_devices:      22 tote Zeilen bei 10 live -> 220%
  sensor_configs:   12 tote Zeilen bei 10 live -> 120%
  ```
- **Hinweis:** Autovacuum-Schwellenwerte beziehen sich auf absolute Zahlen — bei solch kleinen Tabellen (< 100 Zeilen) ist der prozentuale Wert optisch hoch, aber kein echtes Performance-Problem.

### 3.7 Keine Orphaned Records

- **Schwere:** Keine (positiver Befund)
- **Detail:** Alle sensor_configs und actuator_configs haben gueltige FK-Referenzen zu esp_devices. Kein sensor_data-Eintrag hat `esp_id = NULL`.

### 3.8 Migration auf HEAD

- **Schwere:** Keine (positiver Befund)
- **Detail:** `alembic_version = add_sensor_data_dedup` — entspricht dem dokumentierten HEAD im SKILL.md.

---

## 4. Tabellen-Uebersicht

| Tabelle | Eintraege | Groesse |
|---------|-----------|---------|
| sensor_data | 5094 | 3576 kB |
| esp_heartbeat_logs | 1271 | 1256 kB |
| audit_logs | 393 | 840 kB |
| esp_devices | 10 | 560 kB |
| actuator_history | 291 | 480 kB |
| sensor_configs | 10 | 384 kB |
| actuator_states | 2 | 152 kB |
| subzone_configs | 1 | 128 kB |
| actuator_configs | 2 | 96 kB |
| zones | 2 | 64 kB |
| cross_esp_logic | 1 | 80 kB |
| user_accounts | 1 | 64 kB |
| **Gesamt DB** | | **17 MB** |

---

## 5. Extended Checks (eigenstaendig durchgefuehrt)

| Check | Ergebnis |
|-------|----------|
| Container `automationone-postgres` | Up 33 min, healthy |
| DB-Groesse gesamt | 17 MB |
| Alembic version_num | `add_sensor_data_dedup` (HEAD korrekt) |
| Aktive Connections | 1 active, 10 idle (normal fuer dev) |
| Orphaned sensor_configs | 0 |
| Orphaned actuator_configs | 0 |
| sensor_data ohne ESP-Referenz (esp_id = NULL) | 0 |
| Heartbeat-Logs letzte 24h | 0 (kein neuer Heartbeat seit 2026-03-12) |

---

## 6. Bewertung & Empfehlung

### Root Cause (actuator_states idle-Problem)

Die `idle`-States in `actuator_states` stammen aus der Zeit vor dem INV-1c Refactoring und wurden nie durch einen DB-Migration-Step auf `off` umgeschrieben. Das neue Server-Modell schreibt korrekte Werte bei neuen Commands, aber die bestehenden Zeilen wurden nicht migriert.

### Naechste Schritte

1. **actuator_states bereinigen (Prioritaet: Mittel — erfordert Bestaetigung)**
   Pruefe ob der neue Code `idle` als gueltigen State akzeptiert oder ob es zu API-Fehlern fuehrt.
   Vorschau-Query (SELECT vor eventuellem UPDATE):
   ```sql
   SELECT id, state, actuator_type, gpio, data_source
   FROM actuator_states WHERE state = 'idle';
   ```
   Bei Bestaetigung: `UPDATE actuator_states SET state = 'off' WHERE state = 'idle';`

2. **Stale Mock-Devices (Prioritaet: Niedrig — erfordert Bestaetigung)**
   Die 6 `deleted` Mocks koennen bei Bestaetigung entfernt werden (CASCADE loescht sensor_configs etc. automatisch).
   ```sql
   SELECT device_id, status, last_seen FROM esp_devices
   WHERE device_id LIKE 'MOCK_%' AND status = 'deleted';
   ```

3. **Heartbeat-Logging pruefen (Prioritaet: Info)**
   Untersuchen warum MOCK_T18V6LOGIC seit dem 2026-03-12 keine Heartbeat-Logs mehr erzeugt, obwohl Sensor-Daten aktiv einlaufen. Relevant fuer den server-debug oder mqtt-debug Agent.

4. **autovacuum abwarten**
   Die Bloat-Werte bei `cross_esp_logic` und `kaiser_registry` sind kein akutes Problem — autovacuum wird diese bereinigen.
