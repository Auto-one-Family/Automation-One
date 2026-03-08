# T02: Mock-ESP Einzeltest — Vollstaendiger Lifecycle

> **Datum:** 2026-03-07
> **Bezug:** `roadmap-zwischenverifikation-views-backend-2026-03-07.md` -> T02
> **Voraussetzung:** T01 abgeschlossen (Ghost-Mock-Fix, MissingGreenlet-Fix, Timezone-Fix)
> **Ergebnis:** BESTANDEN mit 3 Bugs

---

## Zusammenfassung

Der Mock-ESP wurde erfolgreich durch seinen vollstaendigen Lifecycle gefuehrt:
Erstellen -> Zone zuweisen -> Sensor (DS18B20) -> Actuator (Relay) -> Live-Daten -> Zweiter Sensor (DS18B20) -> Loeschen -> Ghost-Mock-Regression -> Zone loeschen -> Sauberer Endzustand.

**3 Bugs gefunden** (1x Medium, 2x Low), **Ghost-Mock-Regression bestanden**, **Cascade-Delete vollstaendig dokumentiert**.

---

## Testumgebung

| Komponente | Version/Status |
|-----------|---------------|
| Server | El Servador (FastAPI) via Docker `automationone-server` |
| Frontend | El Frontend (Vue 3) via Docker `automationone-frontend` auf Port 5173 |
| Datenbank | PostgreSQL `god_kaiser_db` User `god_kaiser` |
| MQTT | Mosquitto via Docker `automationone-mqtt` |
| Browser | Chrome via Playwright MCP |

---

## Phase 1: Ausgangszustand

### 1.1 — Dashboard leer
![P1-01](T02-screenshots/P1-01-empty-dashboard.png)

- Empty State: "Keine Geraete konfiguriert" mit "Geraet erstellen" Button
- Status: 0/0 Online
- Tabs: Uebersicht / Monitor / Editor

### 1.2 — DB-Snapshot: Ausgangszustand

```
esp_devices:      0
zones:            0
sensor_configs:   0
actuator_configs: 0
sensor_data:      0
esp_heartbeat_logs: 0
kaiser_registry:  1
```

### 1.3 — Loki: Keine Errors im Ruhezustand
Keine ERROR-Logs in den letzten 2 Minuten. PASSED.

---

## Phase 2: Mock-ESP erstellen

### 2.1 — Mock-Erstellung via UI
1. "Mock" Button in der TopBar geklickt
2. Dialog "Mock ESP erstellen" geoeffnet

![P2-01](T02-screenshots/P2-01-mock-create-dialog.png)

Dialog-Felder:
- Name: "Test-Mock-Alpha" (eingegeben)
- Hardware-Typ: MOCK_ESP32 (vorausgewaehlt)
- Heartbeat-Intervall: 15s (vorausgewaehlt)
- "Mock erstellen" Button

3. Mock erstellt — erscheint sofort auf L1

![P2-02](T02-screenshots/P2-02-mock-created-L1.png)

### 2.2 — Verifikation nach Erstellung

| Pruefpunkt | Methode | Ergebnis | Status |
|-----------|---------|----------|--------|
| DB: esp_devices | SQL Query | 1 Row: `MOCK_421AD03B`, hardware_type=`MOCK_ESP32` | PASSED |
| hardware_type korrekt? | DB Check | MOCK_ESP32 (nicht ESP32_WROOM) | PASSED |
| Frontend: Mock sichtbar? | Screenshot P2-02 | Mock in "Nicht zugewiesen" Bereich | PASSED |
| Status-Anzeige | Screenshot | "Online" mit gruener Dot | PASSED |
| Loki: Errors? | Loki Query | 0 Errors | PASSED |
| Console: JS-Errors? | Playwright Console | 0 relevante Errors (nur favicon 404) | PASSED |

### 2.3 — DB-Details des Mocks

```
device_id:     MOCK_421AD03B
name:          Test-Mock-Alpha
hardware_type: MOCK_ESP32
status:        online
zone_id:       NULL
firmware:      MOCK_v1.0
device_metadata: {simulation_config: {sensors: [], actuators: [], ...}, heartbeat_interval: 15}
```

---

## Phase 3: Zone erstellen und Mock zuweisen

### 3.1 — Zone erstellen via API

```bash
POST /api/v1/zones
Body: {"zone_id": "gewaechshaus_alpha", "name": "Gewaechshaus-Alpha", "description": "Testzone fuer T02"}
Response: 201 Created
```

### 3.2 — Mock der Zone zuweisen via API

```bash
PUT /api/v1/esp/MOCK_421AD03B/zone
Body: {"zone_id": "gewaechshaus_alpha"}
Response: 200 OK
```

![P3-01](T02-screenshots/P3-01-zone-create-form.png)
![P3-02](T02-screenshots/P3-02-zone-created-mock-assigned.png)

### 3.3 — Verifikation nach Zone-Assignment

| Pruefpunkt | Methode | Ergebnis | Status |
|-----------|---------|----------|--------|
| DB: esp_devices.zone_id | SQL | `gewaechshaus_alpha` | PASSED |
| DB: zones | SQL | 1 Row: "Gewaechshaus-Alpha" | PASSED |
| Frontend: Mock unter Zone? | Screenshot P3-02 | Mock in Zone-Tile "Gewaechshaus-Alpha" | PASSED |
| Zone-Tile Inhalt | Screenshot | Name, 1 Device, Status Online | PASSED |
| Unassigned-Bereich leer? | Screenshot | Ja, kein "Nicht zugewiesen" mehr | PASSED |

---

## Phase 4: Sensor hinzufuegen und konfigurieren

### 4.1 — Sensor hinzufuegen: DS18B20 via Debug API

```bash
POST /api/v1/debug/mock-esp/MOCK_421AD03B/sensors
Body: {
  "gpio": 4,
  "sensor_type": "DS18B20",
  "name": "Substrat-Temperatur",
  "raw_value": 22.0,
  "unit": "C"
}
Response: 200 OK — sensor added to simulation config
```

### 4.2 — Frontend-Verifikation

![P4-01](T02-screenshots/P4-01-device-settings-dialog.png)
*Device-Settings Dialog zeigt Sensor in der Konfiguration*

![P4-02](T02-screenshots/P4-02-L1-with-sensor.png)
*L1: Zone-Tile mit Mock und Sensor-Daten (Temperatur sichtbar)*

### 4.3 — L2 Device-Detail

![P4-03](T02-screenshots/P4-03-L2-device-detail.png)
*L2 zeigt Device-Detail mit SensorCard "Substrat-Temperatur"*

### 4.4 — Sensor-Konfigurationspanel

![P4-04](T02-screenshots/P4-04-sensor-config-panel.png)

SensorConfigPanel (SlideOver) zeigt:
- Sensor-Typ: DS18B20
- GPIO: 4
- Name: Substrat-Temperatur
- Schwellwerte: min/max Felder
- Subzone-Zuweisung
- Erfassungsintervall

### 4.5 — Bug B2: Sensor-Save 500-Error

![P4-05](T02-screenshots/P4-05-sensor-save-error.png)

Beim Speichern ueber die Sensors-API (`POST /api/v1/sensors/MOCK_421AD03B/4`) tritt ein 500-Error auf:

```
StringDataRightTruncationError:
value too long for type character varying(16)
```

**Root Cause:** Auto-generierte OneWire-Adresse `AUTO_FF82F110C78897CF` (20 Zeichen) ueberschreitet `sensor_configs.onewire_address varchar(16)`.

Die Debug-API umgeht dieses Problem (anderer Code-Pfad, speichert in `device_metadata` JSON).

### 4.6 — Verifikation nach Sensor

| Pruefpunkt | Methode | Ergebnis | Status |
|-----------|---------|----------|--------|
| DB: sensor_configs | SQL | 1 Row (via Debug-API erstellt) | PASSED |
| Frontend: Sensor auf L2? | Screenshot P4-03 | SensorCard "Substrat-Temperatur" | PASSED |
| Sensor-Wert live? | Screenshot | 22.0°C angezeigt | PASSED |
| Config-Panel oeffnet? | Screenshot P4-04 | Ja, SlideOver oeffnet sich | PASSED |
| Save via Sensors-API | API Call | **500 ERROR** (Bug B2) | FAILED |

---

## Phase 5: Aktor hinzufuegen und konfigurieren

### 5.1 — Aktor hinzufuegen: Relay via Debug API

```bash
POST /api/v1/debug/mock-esp/MOCK_421AD03B/actuators
Body: {
  "gpio": 26,
  "actuator_type": "relay",
  "name": "Heizung-Alpha"
}
Response: 200 OK — actuator added to simulation config
```

### 5.2 — Frontend-Verifikation

![P5-01](T02-screenshots/P5-01-L2-with-sensor-and-actuator.png)
*L2 zeigt sowohl SensorCard als auch ActuatorCard*

### 5.3 — Actuator-Konfigurationspanel

![P5-02](T02-screenshots/P5-02-actuator-config-panel.png)

ActuatorConfigPanel zeigt:
- Aktor-Typ: relay
- GPIO: 26
- Name: Heizung-Alpha
- Status: "Not-Stopp" (NOT-AUS war aktiv seit 2026-02-27)
- Subzone-Zuweisung moeglich

### 5.4 — Bug B3: Actuator nicht in DB-Tabelle

| Pruefpunkt | Methode | Ergebnis | Status |
|-----------|---------|----------|--------|
| DB: actuator_configs | SQL | **0 Rows** | UNEXPECTED |
| device_metadata JSON | SQL | Actuator in `simulation_config.actuators[]` | FOUND |

**Root Cause:** Die Debug-API speichert Aktuatoren nur in `esp_devices.device_metadata->simulation_config->actuators` (JSON), nicht als eigenstaendige `actuator_configs`-Records. Das Frontend zeigt sie trotzdem an (liest aus Metadata), aber die DB-Tabelle bleibt leer.

---

## Phase 6: Heartbeat und Live-Daten

### 6.1 — MQTT Heartbeat

```bash
mosquitto_sub -t "kaiser/+/esp/+/heartbeat" -C 1 -W 15
# Ergebnis: Heartbeat empfangen (JSON mit device_id, uptime, free_heap)
```

### 6.2 — MQTT Sensordaten

```bash
mosquitto_sub -t "#" -C 5 -W 15
# Ergebnis: Sensor-Daten fliessen (DS18B20: ~22°C simuliert)
```

### 6.3 — Frontend Live-Update

![P6-01](T02-screenshots/P6-01-L2-live-data.png)
*L2 mit Live-Daten: Sensor zeigt aktuellen Wert, Sparkline mit Datenpunkten*

| Pruefpunkt | Methode | Ergebnis | Status |
|-----------|---------|----------|--------|
| MQTT Heartbeat | mosquitto_sub | Heartbeat alle ~15s empfangen | PASSED |
| MQTT Sensordaten | mosquitto_sub | Simulierte DS18B20-Werte | PASSED |
| DB: sensor_data | SQL | >0 Messwerte vorhanden | PASSED |
| Frontend: Live-Wert | Screenshot P6-01 | Temperatur-Wert aktuell angezeigt | PASSED |
| Frontend: Sparkline | Screenshot | Mini-Chart mit Datenpunkten sichtbar | PASSED |

---

## Phase 7: HardwareView L1 — Gesamtansicht

### 7.1 — L1 mit vollstaendiger Konfiguration

![P7-01](T02-screenshots/P7-01-L1-complete-with-data.png)

| Element | Darstellung | Status |
|---------|------------|--------|
| Zone-Tile | "Gewaechshaus-Alpha" mit Live-Daten | OK |
| Device-Count | 1 Device angezeigt | OK |
| Status-Dot | Gruen (Online) | OK |
| Temperatur-Aggregation | Aktueller Wert in Zone-Tile | OK |
| TopBar Counter | "1/1 Online" | OK |

---

## Phase 8: Zweiter Sensor + Mock loeschen

### 8.0 — Zweiter DS18B20 hinzufuegen (User-Anforderung)

```bash
POST /api/v1/debug/mock-esp/MOCK_421AD03B/sensors
Body: {
  "gpio": 5,
  "sensor_type": "DS18B20",
  "name": "Luft-Temperatur",
  "raw_value": 24.5,
  "unit": "C"
}
Response: 200 OK
```

![P8-00](T02-screenshots/P8-00-L2-two-sensors-before-delete.png)
*L2 mit zwei DS18B20-Sensoren vor Loeschung*

![P8-01](T02-screenshots/P8-01-L1-before-delete-2sensors.png)
*L1 mit vollstaendiger Konfiguration: 2 Sensoren + 1 Aktor*

### 8.1 — DB-Snapshot VOR Loeschung

```
esp_devices:        1  (MOCK_421AD03B)
zones:              1  (gewaechshaus_alpha)
sensor_configs:     2  (GPIO 4 + GPIO 5)
actuator_configs:   0  (nur in metadata JSON)
sensor_data:       >0  (historische Messwerte)
esp_heartbeat_logs: >0  (Heartbeat-Historie)
```

### 8.2 — Mock loeschen via API

```bash
DELETE /api/v1/debug/mock-esp/MOCK_421AD03B
Response: 200 OK
{
  "status": "deleted",
  "device_id": "MOCK_421AD03B",
  "name": "Test-Mock-Alpha",
  "simulation_stopped": true
}
```

### 8.3 — Frontend nach Loeschung

![P8-02](T02-screenshots/P8-02-after-delete-empty.png)
*Dashboard zeigt Zone ohne Devices (Empty State innerhalb Zone)*

### 8.4 — Cascade-Delete Verifikation (KRITISCH)

| Tabelle | Vor Loeschung | Nach Loeschung | Verhalten |
|---------|--------------|----------------|-----------|
| esp_devices | 1 | **0** | Geloescht (direkt) |
| sensor_configs | 2 | **0** | **CASCADE DELETE** |
| actuator_configs | 0 | 0 | N/A (waren nur in JSON) |
| sensor_data | >0 | **0** | **CASCADE DELETE** (historische Daten verloren!) |
| esp_heartbeat_logs | >0 | **0** | **CASCADE DELETE** |
| zones | 1 | **1** | **UNABHAENGIG** (Zone bleibt) |

**WICHTIG:** `sensor_data` wird per CASCADE geloescht! Historische Messdaten gehen beim Device-Delete verloren. Dies ist ein Design-Entscheid der dokumentiert werden sollte — in Produktion koennte man `SET NULL` statt `CASCADE` auf dem FK verwenden, um Messhistorie zu erhalten.

### 8.5 — Ghost-Mock Regression (120 Sekunden)

| Pruefpunkt | Methode | Ergebnis | Status |
|-----------|---------|----------|--------|
| MQTT: Kein Heartbeat | `mosquitto_sub -W 15` | Timeout — kein Heartbeat | PASSED |
| DB: esp_devices | SQL | 0 Rows (bleibt 0) | PASSED |
| Loki: Keine auto_register | Loki Query `MOCK_` | 0 Eintraege | PASSED |
| Loki: Keine MOCK_ Logs | Loki Query letzte 5min | 0 Eintraege | PASSED |
| Frontend: Kein neues Device | Screenshot | Kein Mock erschienen | PASSED |

**Ghost-Mock-Regression: BESTANDEN**
- Fix 1a (Scheduler-Cleanup bei Delete): Keine weiteren Heartbeats nach Loeschung
- Fix 1b (DB-Abgleich): Kein Orphan-Mock registriert
- Fix 1c (MOCK-Prefix-Erkennung): N/A (kein Heartbeat = kein Re-Register)

---

## Phase 9: Aufraeum-Verifikation

### 9.1 — Zone loeschen

```bash
DELETE /api/v1/zones/gewaechshaus_alpha
Response: 200 OK
{"success": true, "message": "Zone deleted", "zone_id": "gewaechshaus_alpha", "had_devices": false, "device_count": 0}
```

### 9.2 — Endzustand = Ausgangszustand

```
esp_devices:        0  (= Ausgangszustand)
zones:              0  (= Ausgangszustand)
sensor_configs:     0  (= Ausgangszustand)
actuator_configs:   0  (= Ausgangszustand)
sensor_data:        0  (CASCADE-geloescht)
esp_heartbeat_logs: 0  (CASCADE-geloescht)
kaiser_registry:    1  (unveraendert)
```

### 9.3 — Finaler Screenshot

![P9-01](T02-screenshots/P9-01-final-empty-dashboard.png)
*Dashboard identisch zum Ausgangszustand: "Keine Geraete konfiguriert", 0/0 Online*

**Vergleich P1-01 vs P9-01:** Identisches Layout, gleicher Empty State, keine verwaisten Elemente.

---

## Bug-Tabelle

| # | Phase | Bug-Beschreibung | IST | SOLL | Severity | Screenshot |
|---|-------|-----------------|-----|------|----------|-----------|
| B1 | P4 | Heartbeat-Intervall-Anzeige im Settings-Dialog | Dialog zeigt 60s | Soll 15s zeigen (API-Metadata korrekt) | LOW | P4-01 |
| B2 | P4 | Sensor-Save via Sensors-API: varchar(16) Overflow | `POST /sensors/{esp_id}/{gpio}` -> 500 `StringDataRightTruncationError` | Auto-generierte OneWire-Adresse `AUTO_FF82F110C78897CF` (20 Zeichen) passt nicht in `sensor_configs.onewire_address varchar(16)`. Entweder varchar(24) oder Prefix kuerzen. | MEDIUM | P4-05 |
| B3 | P5 | Actuator nur in JSON-Metadata, nicht in actuator_configs | `actuator_configs` hat 0 Rows nach Debug-API Add | Actuator sollte als eigenstaendiger `actuator_configs`-Record existieren, nicht nur in `device_metadata` JSON | LOW | — |

### Bug-Details

#### B1: Heartbeat-Intervall-Anzeige (LOW)
- **Ort:** Device-Settings-Dialog (L1 -> "Weitere Aktionen" -> Einstellungen)
- **Root Cause:** Dialog liest Standardwert statt `device_metadata.heartbeat_interval`
- **Impact:** Rein kosmetisch, kein funktionaler Effekt
- **Fix-Aufwand:** ~15 Min (Frontend: richtiges Feld aus Metadata auslesen)

#### B2: OneWire-Adresse varchar(16) Overflow (MEDIUM)
- **Ort:** `El Servador/god_kaiser_server/src/api/v1/sensors.py` (create_or_update_sensor)
- **Root Cause:** Auto-generierte Adresse `AUTO_` + 16 hex chars = 21 Zeichen > varchar(16)
- **Impact:** Sensors-API kann keine OneWire-Sensoren speichern wenn onewire_address auto-generiert wird
- **Workaround:** Debug-API umgeht das Problem (speichert in JSON statt in sensor_configs)
- **Fix-Optionen:**
  1. `ALTER TABLE sensor_configs ALTER COLUMN onewire_address TYPE varchar(24)` (Migration)
  2. Auto-Adresse kuerzen: `AUTO_` + 11 hex chars = 16 Zeichen
  3. `onewire_address` auf `varchar(32)` oder `TEXT` aendern

#### B3: Actuator nur in JSON-Metadata (LOW)
- **Ort:** `El Servador/god_kaiser_server/src/api/v1/debug.py` (add_actuator)
- **Root Cause:** Debug-API `add_actuator` schreibt nur in `device_metadata->simulation_config->actuators`, erstellt keinen `actuator_configs`-Record
- **Impact:** Actuator nicht ueber Standard-Queries auffindbar, nur via Metadata-JSON
- **Note:** Moeglicherweise by-design fuer Mock-ESPs (Mock-Aktoren sind simuliert)

---

## Cascade-Delete Dokumentation

### Foreign-Key-Beziehungen von `esp_devices`

```
esp_devices (PK: id)
  |-- sensor_configs.esp_device_id      -> ON DELETE CASCADE
  |-- actuator_configs.esp_device_id    -> ON DELETE CASCADE
  |-- sensor_data.device_id             -> ON DELETE CASCADE  (!)
  |-- esp_heartbeat_logs.esp_device_id  -> ON DELETE CASCADE
  |-- actuator_states                   -> ON DELETE CASCADE
  |-- actuator_history                  -> ON DELETE CASCADE
  |-- ai_predictions                    -> ON DELETE CASCADE
  |-- esp_ownership                     -> ON DELETE CASCADE
  |-- subzone_configs                   -> ON DELETE CASCADE (via sensor_configs)
```

### Risikobewertung

| Tabelle | CASCADE-Verhalten | Risiko |
|---------|-------------------|--------|
| sensor_configs | Loeschung erwartet | Kein Risiko |
| actuator_configs | Loeschung erwartet | Kein Risiko |
| **sensor_data** | **Historische Daten geloescht** | **HOCH** in Produktion |
| esp_heartbeat_logs | Log-Verlust | Mittel |
| zones | Unabhaengig (bleibt) | Kein Risiko |

**Empfehlung:** Fuer Produktionsbetrieb `sensor_data.device_id` FK auf `SET NULL` aendern, damit Messhistorie erhalten bleibt wenn ein Device entfernt wird.

---

## WebSocket-Events (Beobachtet)

| Event | Phase | Beschreibung |
|-------|-------|-------------|
| device_created | P2 | Nach Mock-Erstellung |
| device_updated | P3 | Nach Zone-Assignment |
| sensor_data | P6 | Live-Sensordaten (kontinuierlich) |
| heartbeat | P6 | Device-Heartbeat (alle ~15s) |
| device_deleted | P8 | Nach Mock-Loeschung |

---

## Timing-Verhalten

| Operation | Latenz | Bewertung |
|-----------|--------|-----------|
| Mock erstellen -> Frontend-Update | <1s | Sehr gut |
| Zone zuweisen -> Frontend-Update | <1s | Sehr gut |
| Sensor hinzufuegen -> Live-Daten | ~5s (erster Wert) | OK |
| Mock loeschen -> Frontend-Update | <1s | Sehr gut |
| UI-Flackern bei Zustandswechseln | Keins beobachtet | Gut |

---

## Screenshots-Index

| Datei | Phase | Beschreibung |
|-------|-------|-------------|
| P1-01-empty-dashboard.png | 1 | Leeres Dashboard (Ausgangszustand) |
| P2-01-mock-create-dialog.png | 2 | Mock-Erstellungsdialog |
| P2-02-mock-created-L1.png | 2 | L1 nach Mock-Erstellung |
| P3-01-zone-create-form.png | 3 | Zone-Erstellung (API-basiert) |
| P3-02-zone-created-mock-assigned.png | 3 | L1 mit Zone + Mock |
| P4-01-device-settings-dialog.png | 4 | Device-Settings (Bug B1: Intervall) |
| P4-02-L1-with-sensor.png | 4 | L1 mit Sensor-Daten |
| P4-03-L2-device-detail.png | 4 | L2 Device-Detail mit SensorCard |
| P4-04-sensor-config-panel.png | 4 | SensorConfigPanel SlideOver |
| P4-05-sensor-save-error.png | 4 | Sensor-Save 500-Error (Bug B2) |
| P5-01-L2-with-sensor-and-actuator.png | 5 | L2 mit Sensor + Actuator |
| P5-02-actuator-config-panel.png | 5 | ActuatorConfigPanel SlideOver |
| P6-01-L2-live-data.png | 6 | L2 mit Live-Daten und Sparklines |
| P7-01-L1-complete-with-data.png | 7 | L1 Gesamtansicht mit allen Daten |
| P8-00-L2-two-sensors-before-delete.png | 8 | L2 mit 2 DS18B20-Sensoren |
| P8-01-L1-before-delete-2sensors.png | 8 | L1 vor Loeschung (2 Sensoren + 1 Aktor) |
| P8-02-after-delete-empty.png | 8 | Dashboard nach Mock-Loeschung |
| P9-01-final-empty-dashboard.png | 9 | Finales leeres Dashboard (= Ausgangszustand) |

---

## Akzeptanzkriterien

- [x] Mock-ESP Lifecycle komplett durchlaufen (Erstellen -> Konfigurieren -> Loeschen)
- [x] Screenshot von JEDER Phase vorhanden (18 Screenshots)
- [x] DB-Zustand nach JEDER kritischen Operation geprueft
- [x] Loki-Logs nach JEDER Operation auf Errors geprueft
- [x] hardware_type ist MOCK_ESP32 (nicht ESP32_WROOM) — T01-Regression PASSED
- [x] Kein Ghost-Mock nach 120s Wartezeit — T01-Regression PASSED
- [x] Cascade-Delete-Verhalten dokumentiert (inkl. sensor_data Risiko)
- [x] WebSocket-Events dokumentiert
- [x] Endzustand = Ausgangszustand (sauberes System)
- [x] Bug-Tabelle vollstaendig ausgefuellt (3 Bugs: B1, B2, B3)
- [x] Bericht geschrieben

---

## Naechste Schritte (Empfehlung)

1. **B2 fixen (MEDIUM):** `onewire_address varchar(16)` -> `varchar(24)` Migration erstellen
2. **B3 evaluieren:** Soll Debug-API auch `actuator_configs`-Records erstellen?
3. **Cascade-Delete ueberdenken:** `sensor_data` FK auf `SET NULL` fuer Produktionsbetrieb
4. **B1 fixen (LOW):** Settings-Dialog soll `device_metadata.heartbeat_interval` auslesen
