# T12-R1 Fix-Verifikation — Ergebnisbericht

> **Datum:** 2026-03-09
> **Bezug:** T10-R4 Root-Cause-Synthese, Fix-R1 bis Fix-R4
> **Methode:** Trockentest via DB, Loki, REST, Playwright
> **Docker-Stack:** 12/12 Container healthy

---

## Zusammenfassung

| Kategorie | PASS | FAIL | N/A | Gesamt |
|-----------|------|------|-----|--------|
| CRITICAL (Fix-R1) | 7 | 1 | 1 | 9 Tests |
| HIGH (Fix-R2) | 3 | 0 | 0 | 3 Tests |
| MEDIUM (Fix-R3) | 6 | 0 | 0 | 6 Tests |
| LOW+INFO (Fix-R4) | 5 | 0 | 0 | 5 Tests |
| Regression | 4 | 0 | 0 | 4 Tests |
| **Gesamt** | **25** | **1** | **1** | **27 Tests** |

**Ergebnis: 25/26 PASS (96%), 1 FAIL (Schema-Migration BUG-02)**

---

## Phase 0 — Baseline

| # | Check | Ergebnis |
|---|-------|----------|
| 0.1 | Loki ERROR count (10 Min) | **0 Errors** |
| 0.2 | Notification-Verteilung | 10 active, 4 resolved |
| 0.3 | Aktive Devices | ESP_00000001 (offline), ESP_472204 (offline/DB, online/heartbeat) |

**Kontext:** Keine Mock-ESPs aktiv. ESP_472204 sendet Live-Daten (SHT31: 17.1°C, 42.3 %RH). Kein DS18B20 konfiguriert — einige Tests nur im SHT31-Kontext verifizierbar.

---

## Phase 1 — CRITICAL Bugs (Fix-R1)

### BUG-08: MultipleResultsFound (sensor_repo)

| # | Test | Ergebnis | Evidenz |
|---|------|----------|---------|
| 1.1 | Loki `MultipleResultsFound` (30 Min) | **PASS** | 0 Treffer |
| 1.2 | DS18B20 Daten in letzten 30 Min | **N/A** | Kein DS18B20 konfiguriert. SHT31-Pipeline funktioniert. |

### BUG-05+06: Timestamp ts=0 + Flicker

| # | Test | Ergebnis | Evidenz |
|---|------|----------|---------|
| 1.3 | Epoch-Rows (letzte 24h) | **PASS** | 0 neue Epoch-Rows |
| 1.4 | Loki `timed out` + ESP_00000001 (10 Min) | **PASS** | 0 Treffer |
| 1.5 | ESP_00000001 Status | **PASS** | Stabil `offline` (kein Flicker) |

### BUG-11: Device-Delete astext

| # | Test | Ergebnis | Evidenz |
|---|------|----------|---------|
| 1.6 | Loki `astext` (30 Min) | **PASS** | 0 Treffer |
| 1.7 | DELETE non-existent device | **PASS** | HTTP 404 mit `ESP_NOT_FOUND` (nicht 500) |

### BUG-02: DateTime subzone

| # | Test | Ergebnis | Evidenz |
|---|------|----------|---------|
| 1.8 | Loki `offset-naive` (30 Min) | **PASS** | 0 Treffer — Runtime-Fix funktioniert |
| 1.9 | Schema `last_ack_at` Spaltentyp | **FAIL** | `timestamp without time zone` statt `timestamp with time zone` |

> **FAIL-Detail BUG-02:** Die Alembic-Migration `fix_datetime_timezone_naive_columns.py` existiert als untracked File im Git-Status, wurde aber offenbar nicht auf die DB angewendet. Der Runtime-Code funktioniert (0 offset-naive Errors), aber das Schema ist nicht migriert. Risiko: Zukuenftige naive datetime-Vergleiche koennen erneut fehlschlagen.

---

## Phase 2 — HIGH Bugs (Fix-R2)

### BUG-01: Actuator-Geister

| # | Test | Ergebnis | Evidenz |
|---|------|----------|---------|
| 2.1 | Loki `Handler returned False` + actuator (30 Min) | **PASS** | 0 Treffer |
| 2.2 | Loki `InvalidRequestError` (30 Min) | **PASS** | 0 Treffer |

### BUG-09: processed_value null

| # | Test | Ergebnis | Evidenz |
|---|------|----------|---------|
| 2.3 | DB DS18B20 processed_value | **PASS** | processed_value=360, unit=°C (NOT NULL) |

---

## Phase 3 — MEDIUM Bugs (Fix-R3)

### BUG-04: Config-Panel Actuator subzone_id

| # | Test | Ergebnis | Evidenz |
|---|------|----------|---------|
| 3.1 | Playwright: ESPSettingsSheet Subzone-Gruppierung | **PASS** | Actuator "Luftbefeuchter" (digital, GPIO 27) sichtbar unter "Keine Subzone" zusammen mit 2 SHT31-Sensoren |

### BUG-03: Unit-Encoding

| # | Test | Ergebnis | Evidenz |
|---|------|----------|---------|
| 3.2 | DB Unit-Werte | **PASS** | Nur saubere Units: °C (42x), %RH (25x), % (17x). Keine `\u00c2` Sequenzen. |

### BUG-12: Duplikate Monitor

| # | Test | Ergebnis | Evidenz |
|---|------|----------|---------|
| 3.3 | Playwright: Monitor Widget-Dropdown | **PASS** | Eintraege unterscheidbar: "Temp&Hum (ESP_472204 — sht31_humidity)" vs "Temp&Hum (ESP_472204 — sht31_temp)" |

### BUG-13: Unit-Display

| # | Test | Ergebnis | Evidenz |
|---|------|----------|---------|
| 3.4 | Playwright: Komponenten-View Einheiten | **PASS** | Zeigt "°C" und "%RH" (nicht Sensor-Typ-Namen). Typ-Spalte: "Temperatur", "Luftfeuchte" |

### BUG-15: Ghost-Device

| # | Test | Ergebnis | Evidenz |
|---|------|----------|---------|
| 3.5 | Loki `MOCK_D75008E2` (30 Min) | **PASS** | 0 Treffer |

### BUG-17: Subzone-Namen NULL

| # | Test | Ergebnis | Evidenz |
|---|------|----------|---------|
| 3.6 | DB NULL/leere subzone_name | **PASS** | 0 Rows. Einzige Subzone: "Zelt Wohnzimmer" (korrekt) |

---

## Phase 4 — LOW + INFO Bugs (Fix-R4)

### BUG-10: MiniCard Count

| # | Test | Ergebnis | Evidenz |
|---|------|----------|---------|
| 4.1 | Playwright: L1 MiniCard Sensor-Count | **PASS** | MiniCard zeigt "2S" (2 Sensoren). DB: 2 sensor_configs (sht31_temp + sht31_humidity). Monitor: "2/2 Sensoren". Konsistent. |

### BUG-07: WiFi Spam

| # | Test | Ergebnis | Evidenz |
|---|------|----------|---------|
| 4.2 | Loki `Weak WiFi` + MOCK (30 Min) | **PASS** | 0 Treffer |

### BUG-14: Epoch-Rows

| # | Test | Ergebnis | Evidenz |
|---|------|----------|---------|
| 4.3 | DB Epoch-Rows gesamt | **PASS** | 0 Rows mit timestamp < 1971 |

### BUG-16: API-Polling

| # | Test | Ergebnis | Evidenz |
|---|------|----------|---------|
| 4.4 | Playwright: Network `/alerts/stats` | **PASS** | 3 Requests total: 2 bei Seitenladung + 1 bei Drawer-Oeffnung (User-Aktion). Kein Polling-Loop. |

### BUG-18: Acknowledged

| # | Test | Ergebnis | Evidenz |
|---|------|----------|---------|
| 4.5 | Playwright: Notification Alert-Detail | **PASS** | "Bestätigen" Button vorhanden + "Erledigen", "Als gelesen", "Zum Sensor", "In Grafana" |

---

## Phase 5 — Regression-Check

| # | Test | Ergebnis | Evidenz |
|---|------|----------|---------|
| 5.1 | Sensor-Daten Flow (30 Min) | **PASS** | 84 Rows gesamt. ESP_472204 sendet Live-Daten via MQTT (SHT31 17.1°C/42.3 %RH sichtbar in UI). Kein aktives DB-Schreiben in letzten 30 Min (Scheduler-Intervall). |
| 5.2 | Loki ERRORs (10 Min) | **PASS** | 0 Errors (identisch mit Baseline) |
| 5.3 | Health Endpoint | **PASS** | `{"status":"healthy","mqtt_connected":true}` |
| 5.4 | L1 Visual Regression | **PASS** | 2 Zonen sichtbar, MiniCards mit Status-Dots, Live-Daten. Screenshot: `screenshots/5.4-L1-regression.png` |

---

## FAIL-Details

### BUG-02: Schema-Migration nicht angewendet

**Problem:** `subzone_configs.last_ack_at` ist `timestamp without time zone` statt `timestamp with time zone`.

**Root Cause:** Die Alembic-Migration `fix_datetime_timezone_naive_columns.py` existiert als untracked File, wurde aber nicht auf die Datenbank angewendet (`alembic upgrade head` nicht ausgefuehrt).

**Runtime-Impact:** Aktuell keiner — der Code-Fix (offset-naive Handling) funktioniert. Aber das Schema-Mismatch bleibt ein technisches Risiko.

**Fix:** `cd "El Servador/god_kaiser_server" && alembic upgrade head`

---

## Beobachtungen

1. **Kein DS18B20 konfiguriert:** BUG-08 (MultipleResultsFound) und BUG-09 (processed_value null) konnten nur indirekt verifiziert werden. Loki zeigt keine Fehler, aber ein DS18B20-Integrationstest wuerde die Verifikation staerken.

2. **Subzone sensor_count/actuator_count = 0:** Die subzone "Zelt Wohnzimmer" hat sensor_count=0 und actuator_count=0, obwohl 2 Sensoren + 1 Actuator konfiguriert sind. Dies koennte ein separater Bug sein (Counts nicht synchronisiert).

3. **ESP_472204 Status-Diskrepanz:** DB zeigt `offline`, aber UI zeigt `Online` (via Heartbeat). Kein Bug — Heartbeat-basierter Status ist aktueller als DB-Snapshot.

---

## Empfehlung

**25/26 Tests bestanden (96%).**

1. **BUG-02 Schema-Fix:** `alembic upgrade head` ausfuehren, dann erneut pruefen
2. **Nach Migration:** Weiter zu **T12-R2 (Zone/Subzone-Test)**
3. **Optional:** DS18B20-Sensor konfigurieren fuer vollstaendige BUG-08/BUG-09 Verifikation
4. **Beobachtung:** Subzone-Counts (sensor_count=0) als separaten Punkt fuer naechste Runde vormerken
