# DB Inspector Report

**Erstellt:** 2026-03-01 ~13:20 UTC
**Aktualisiert:** 2026-03-01 (BUG-015 + BUG-016 Cleanup)
**Modus:** A (Allgemeine Analyse) + B (Spezifisch: BUG-015 + BUG-016 Cleanup)
**Quellen:** esp_devices, sensor_configs, sensor_data, actuator_configs, actuator_states, actuator_history, cross_esp_logic, logic_execution_history, esp_heartbeat_logs, subzone_configs, audit_logs, token_blacklist, pg_stat_user_tables, pg_stat_user_indexes, alembic

---

## 1. Zusammenfassung

Die Datenbank ist erreichbar und stabil. Alle 19 Tabellen vorhanden, DB-Groesse 12 MB. **BUG-015 und BUG-016 wurden erfolgreich behoben:** Die verwaiste Logic Rule "Test Temperatur Rule" wurde geloescht, und der zone_name "testneu" wurde auf "Testneu" normalisiert. Verbleibende offene Befunde: `actuator_states` hat Dead Tuples ohne VACUUM, `esp_devices` wird mit massiven Sequential Scans abgefragt, `actuator_configs` ist leer trotz aktiver States, DS18B20 liefert dauerhaft raw_value=0.0, und Alembic Version-Tracking fehlt.

---

## 2. Analysierte Quellen

| Quelle | Status | Bemerkung |
|--------|--------|-----------|
| automationone-postgres | OK | Container healthy, Up 4h |
| pg_isready | OK | Accepting connections on :5432 |
| Alle 19 Tabellen | OK | Vollstaendig vorhanden |
| Alembic via Container | EINGESCHRAENKT | `alembic current` gibt keine Ausgabe, `alembic heads` zeigt `b2c3d4e5f6a7 (head)` - `alembic_version` Tabelle fehlt in DB |
| Server /api/v1/health | AUTH REQUIRED | Health-Detail-Endpoint benoetigt Auth-Token (OK) |
| Server /docs | OK | Server erreichbar unter localhost:8000 |

---

## 3. Befunde

### 3.1 [BEHOBEN] BUG-015: Logic Rule - Phantom Device-IDs

- **Schwere:** Kritisch -> BEHOBEN
- **Detail:** Die Logic Rule `Test Temperatur Rule` referenzierte in `trigger_conditions` das Device `MOCK_TEMP01` und in `actions` das Device `MOCK_RELAY01`. Beide existierten NICHT in `esp_devices`. Die Rule war disabled und wurde nie ausgefuehrt.
- **Fix:** `DELETE FROM cross_esp_logic WHERE id = '131b1750-a31b-4df3-8ab5-6c1bef2316c9'`
- **Ergebnis:**
  ```
  DELETE 1
  Verification: 0 rows returned for id = '131b1750-a31b-4df3-8ab5-6c1bef2316c9'
  ```

### 3.2 [BEHOBEN] BUG-016: Zone-Name-Inkonsistenz

- **Schwere:** Niedrig -> BEHOBEN
- **Detail:** Zone `testneu` hatte zwei verschiedene `zone_name`-Schreibweisen: `Testneu` (MOCK_57A7B22F) und `testneu` (MOCK_98D427EA). Normalisiert auf PascalCase `Testneu`.
- **Fix:** `UPDATE esp_devices SET zone_name = 'Testneu' WHERE zone_id = 'testneu' AND zone_name != 'Testneu'`
- **Ergebnis:**
  ```
  UPDATE 1
  Verification:
  MOCK_57A7B22F | testneu | Testneu  (unveraendert)
  MOCK_98D427EA | testneu | Testneu  (aktualisiert von 'testneu')
  ```

### 3.3 actuator_states - Dead Tuples ohne VACUUM (MITTEL)

- **Schwere:** Mittel
- **Detail:** `actuator_states` hat 0 Live-Rows (leer nach autovacuum-Statistik), aber 19 Dead Tuples. `last_autovacuum = NULL` - autovacuum hat diese Tabelle nie aufgeraeumt. Bei SELECT zeigt die Tabelle aber 2 gueltige Rows (GPIO 13 + 18, Device MOCK_95A49FCB, beide `off`). Die Diskrepanz zwischen pg_stat (0 live) und tatsaechlichem Inhalt deutet darauf hin, dass die Statistiken veraltet sind und ein ANALYZE/VACUUM benoetigen.
- **Evidenz:**
  ```
  pg_stat_user_tables:
  relname         | n_dead_tup | n_live_tup | last_autovacuum
  actuator_states |         19 |          0 | NULL

  Tatsaechlicher Inhalt:
  GPIO 13 | pump | off | MOCK_95A49FCB | EMERGENCY_STOP
  GPIO 18 | pump | off | MOCK_95A49FCB | EMERGENCY_STOP
  (2 Rows vorhanden)
  ```

### 3.4 esp_devices - Massiver Sequential Scan (HOCH)

- **Schwere:** Hoch
- **Detail:** `esp_devices` wird mit 7.231 Sequential Scans bei nur 4 Live-Rows extrem haeufig full-table-gescannt. Bei der aktuellen Datenmenge (4 Devices) kein Performance-Problem, aber das Muster deutet auf fehlende oder nicht genutzte Filter-Indizes hin. Der `ix_esp_devices_status` Index wird nicht genutzt (idx_scan = 0). Wahrscheinliche Ursache: Die Logic Engine und andere Services holen regelmaessig alle ESPs per `SELECT *` ohne WHERE-Klausel.
- **Evidenz:**
  ```
  esp_devices: seq_scan=7231, seq_tup_read=27762, idx_scan=25
  cross_esp_logic: seq_scan=1192 (Logic Engine pollt Rules regelmaessig)

  Ungenutzte Indizes auf esp_devices (idx_scan=0):
  - ix_esp_devices_status
  - ix_esp_devices_zone_id
  - ix_esp_devices_kaiser_id
  - ix_esp_devices_master_zone_id
  - esp_devices_mac_address_key
  ```

### 3.5 Stale Mock-Devices (NIEDRIG)

- **Schwere:** Niedrig
- **Detail:** 3 von 4 Mock-Devices sind offline und seit mehr als 24h nicht mehr gesehen. MOCK_57A7B22F seit 44.5h, MOCK_0CBACD10 seit 42.6h, MOCK_98D427EA seit 29.7h. Nur MOCK_95A49FCB ist aktiv online. Die offline Devices haben noch gueltige sensor_configs (`pending` status) und historische sensor_data.
- **Evidenz:**
  ```
  MOCK_57A7B22F | offline | last_seen: 2026-02-27 16:44 | 44.5h offline
  MOCK_0CBACD10 | offline | last_seen: 2026-02-27 18:40 | 42.6h offline
  MOCK_98D427EA | offline | last_seen: 2026-02-28 07:31 | 29.7h offline

  sensor_configs mit pending-Status (offline Devices):
  - Temp 0C79 (DS18B20, MOCK_0CBACD10) -> pending
  - SHT31_0 (SHT31, MOCK_0CBACD10)    -> pending
  ```

### 3.6 actuator_configs Tabelle leer - aber actuator_states/history vorhanden (MITTEL)

- **Schwere:** Mittel
- **Detail:** `actuator_configs` hat 0 Eintraege, aber `actuator_states` zeigt 2 aktive Pump-States (GPIO 13+18, MOCK_95A49FCB) und `actuator_history` hat 21 Eintraege (EMERGENCY_STOP, ON, OFF). Das bedeutet: Aktuatoren laufen ohne persistente Config-Eintraege. Die `actuator_states` FK geht auf `esp_devices` (not `actuator_configs`), daher kein FK-Fehler. Aber die fehlenden Configs koennen dazu fuehren, dass Config-bezogene API-Endpunkte keine Daten zurueckliefern.
- **Evidenz:**
  ```
  actuator_configs: 0 Rows
  actuator_states:  2 Rows (pump GPIO 13+18, MOCK_95A49FCB, beide "off")
  actuator_history: 21 Rows (alle erfolgreich)
    EMERGENCY_STOP: 16x
    ON:              3x
    OFF:             2x
  Last command: EMERGENCY_STOP 2026-03-01 13:11:48
  ```

### 3.7 DS18B20 Sensor - Dauerhaft raw_value=0.0 (MITTEL)

- **Schwere:** Mittel
- **Detail:** Alle 896 DS18B20-Messwerte von MOCK_0CBACD10 haben `raw_value=0.0`. Die Qualitaet ist als `good` markiert, `processed_value` ist NULL. Dies deutet darauf hin, dass der Mock-Generator fuer DS18B20 keinen realistischen Wert liefert (immer 0 statt z.B. 20-25 Grad C). Der letzte Wert ist von 2026-02-27 (Device offline seit dann).
- **Evidenz:**
  ```
  sensor_type | avg_value | device        | records
  DS18B20     | 0.00      | MOCK_0CBACD10 | 896
  (alle 896 Werte: raw_value=0, quality=good, processed_value=NULL)
  SHT31       | 22.00     | beide ESPs    | 2030  (normal)
  ```

### 3.8 Alembic Version-Tracking fehlt (MITTEL)

- **Schwere:** Mittel
- **Detail:** Die Tabelle `alembic_version` existiert nicht in der Datenbank. `alembic current` gibt keine Ausgabe, `alembic heads` zeigt `b2c3d4e5f6a7 (head)`. Das bedeutet: Alembic kann den aktuellen Schema-Stand nicht tracken, da kein Versions-Eintrag gesetzt wurde. Das Schema koennte durch direkte DDL-Befehle oder einen alternativen Migration-Pfad erstellt worden sein. Eine versehentliche `alembic upgrade head` koennte alle Migrationen erneut ausfuehren - oder scheitern.
- **Evidenz:**
  ```
  \dt -> keine alembic_version Tabelle in public schema
  alembic current -> keine Ausgabe (exit 0)
  alembic heads -> b2c3d4e5f6a7 (head) vorhanden
  ```

---

## 4. Extended Checks (eigenstaendig durchgefuehrt)

| Check | Ergebnis |
|-------|----------|
| docker compose ps postgres | healthy, Up 4h, Port 5432 erreichbar |
| pg_isready | OK - accepting connections |
| curl localhost:8000/docs | OK - Server laeuft, Swagger UI erreichbar |
| curl localhost:8000/api/v1/health/detailed | Auth required (erwartet) |
| alembic current | Keine Ausgabe - alembic_version fehlt in DB |
| alembic heads | b2c3d4e5f6a7 (head) definiert |
| Orphaned sensor_configs | 0 gefunden (FK CASCADE intakt) |
| Orphaned sensor_data | 0 gefunden (FK CASCADE intakt) |
| Heartbeat-Logs > 7 Tage | 0 (alle innerhalb Retention) |
| Token Blacklist expired | 0 (alle 38 Tokens noch valid) |
| BUG-015 DELETE cross_esp_logic | DELETE 1 - erfolgreich |
| BUG-016 UPDATE esp_devices zone_name | UPDATE 1 - erfolgreich |

---

## 5. Datenvolumen-Uebersicht

| Tabelle | Groesse | Live Rows | Bemerkung |
|---------|---------|-----------|-----------|
| sensor_data | 1808 kB | 2.926 | 4 Tage Daten, 2 ESPs |
| esp_heartbeat_logs | 912 kB | 1.422 | 4 Tage, nur MOCK_95A49FCB aktiv |
| audit_logs | 240 kB | 41 | 2026-02-26 bis 2026-03-01 |
| esp_devices | 208 kB | 4 | 3 offline, 1 online |
| actuator_history | 176 kB | 21 | alle erfolgreich |
| sensor_configs | 112 kB | 3 | 1 applied, 2 pending |
| actuator_states | 112 kB | 2 | beide pump, state=off |
| cross_esp_logic | 80 kB | 0 | BEHOBEN: verwaiste Rule geloescht |
| logic_execution_history | 56 kB | 0 | leer |
| subzone_configs | 48 kB | 0 | leer |
| kaiser_registry | 56 kB | 0 | leer |
| system_config | 32 kB | 0 | leer |
| **GESAMT** | **12 MB** | | Normal fuer Entwicklungs-DB |

---

## 6. Schema-Integritaet (Foreign Keys)

Alle Foreign Keys intakt. Cascade-Deletes korrekt konfiguriert.

| FK-Beziehung | Status | Cascade |
|---|---|---|
| sensor_configs -> esp_devices | OK | DELETE CASCADE |
| sensor_data -> esp_devices | OK | DELETE CASCADE |
| actuator_configs -> esp_devices | OK | DELETE CASCADE |
| actuator_states -> esp_devices | OK | DELETE CASCADE |
| actuator_history -> esp_devices | OK | DELETE CASCADE |
| esp_heartbeat_logs -> esp_devices | OK | DELETE CASCADE |
| logic_execution_history -> cross_esp_logic | OK | DELETE CASCADE |
| subzone_configs -> esp_devices(device_id) | OK | DELETE CASCADE |

**Auffaelligkeit:** `subzone_configs` referenziert `esp_devices(device_id)` (VARCHAR), alle anderen FKs referenzieren `esp_devices(id)` (UUID). Dies ist kein Fehler (device_id hat UNIQUE-Constraint), aber architektonisch inkonsistent.

---

## 7. Bewertung und Empfehlung

### Cleanup-Status

| Bug | Beschreibung | Status |
|-----|-------------|--------|
| BUG-015 | Logic Rule mit Phantom Device-IDs | BEHOBEN - DELETE 1 |
| BUG-016 | Zone-Name Inkonsistenz testneu/Testneu | BEHOBEN - UPDATE 1 |

### Root Causes (verbleibende Befunde)

1. **actuator_configs leer:** Pump-Aktuatoren auf MOCK_95A49FCB haben States und History, aber keine Config-Eintraege. Die Configs wurden entweder nie erstellt oder wurden geloescht (19 Dead Tuples in actuator_states staemmen moeglicherweise von geloeschten Config-Datensaetzen).

2. **Alembic ohne Version-Tracking:** Das Schema wurde vermutlich direkt (per SQLAlchemy `create_all()`) erstellt, nicht per `alembic upgrade head`. Die Migration-History in den Python-Files existiert, ist aber nicht in der DB eingespielt.

3. **DS18B20 immer 0.0:** Mock-Generator-Bug oder Feature - der MockDataService liefert fuer DS18B20 keine simulierten Temperaturwerte.

### Naechste Schritte (verbleibende Befunde)

| Prioritaet | Massnahme | Zustaendigkeit |
|---|---|---|
| HOCH | actuator_configs fuer MOCK_95A49FCB anlegen (GPIO 13+18, Pump-Typ) | Dev-Agent oder System-Control |
| MITTEL | Alembic Version-Tracking reparieren: `alembic stamp head` im Container ausfuehren (BESTAETIGUNG NOETIG) | Manuelle Operation |
| MITTEL | VACUUM auf `actuator_states` und `cross_esp_logic`: `VACUUM ANALYZE actuator_states; VACUUM ANALYZE cross_esp_logic;` | Kann ausgefuehrt werden (nicht destruktiv) |
| NIEDRIG | DS18B20 Mock-Wert pruefen: MockDataService konfigurieren um realistische Temperaturwerte zu senden | Dev-Agent (server-dev) |

### Was KEIN Problem ist

- Alle FKs sind intakt, keine echten Orphaned Records
- Heartbeat-Logs innerhalb 7-Tage-Retention (0 alte Eintraege)
- Connection Pool normal (1 active, 8 idle)
- Index-Nutzung fuer aktive Queries in Ordnung (sensor_data, sensor_configs)
- Token Blacklist sauber (0 abgelaufene Tokens)
- Gesamtgroesse 12 MB - kein Retention-Problem
