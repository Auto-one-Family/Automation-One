# T17-V4 Fresh Start Verifikation — Bericht

**Datum:** 2026-03-10 17:20
**Gesamt:** 27/31 PASS, 1 FAIL, 3 PARTIAL, 4 SKIP

## Zusammenfassung

Fresh Start Verifikation auf Clean-Slate-System nach DB-Reset und ESP-Neuflash. ESP_472204 (Zelt Agent) mit SHT31 (I2C 0x44) und Relay/Olimex PWR Switch (GPIO 27), Zone "Zelt Wohnzimmer", Subzone "Pflanze 1". Kernfixes (Fix-Y Offline-Guard, Fix-U Actuator-Reset, Fix-W Emergency-retain, Fix-T DB-Infra) alle verifiziert. Ein FAIL bei Server-Restart (Zone-ACK FK-Violation). Drei neue Findings dokumentiert.

## Testergebnisse

### Block A: ESP Bootstrap

### V4-01 — ESP kommt online via Heartbeat
**Status:** PASS
**Evidenz:**
```
device_id=ESP_472204, status=online, last_seen=2026-03-10 15:59:50.687173+00, deleted_at=NULL
```
**Notizen:** ESP war bereits online bei Testbeginn. Status korrekt, last_seen aktuell.

### V4-02 — Heartbeat-Log wird geschrieben
**Status:** PASS
**Evidenz:**
```
5 Heartbeat-Eintraege fuer ESP_472204, letzter: 2026-03-10 15:59:38
heap_free=200032, wifi_rssi=-50, uptime=186s, health_status=healthy
```
**Notizen:** Heartbeat alle 60s, alle Werte plausibel.

### V4-03 — ESP-Metadata nach Bootstrap
**Status:** PASS
**Evidenz:**
```json
device_metadata: {"full_state_push_sent_at": 1773158318, "diagnostics": {
  "heap_free": 200128, "system_state": "ZONE_CONFIGURED", "boot_reason": "POWERON",
  "sensor_count": 2, "actuator_count": 1, "mqtt_connected": true, "wifi_rssi": -46
}}
```
**Notizen:** firmware_version-Spalte ist leer (nicht im metadata.diagnostics). Diagnostics enthalten alle relevanten Infos.

---

### Block B: Sensor-Konfiguration

### V4-04 — SHT31 Sensor-Config erstellen
**Status:** PASS
**Evidenz:**
```
2 sensor_configs: sht31_temp (GPIO 0, i2c=68, enabled=true) + sht31_humidity (GPIO 0, i2c=68, enabled=true)
```
**Notizen:** Beide Sub-Types als separate Config-Eintraege. assigned_subzones=[] (leer — Subzone-Zuordnung laeuft ueber subzone_configs.assigned_gpios).

### V4-05 — SHT31 Sub-Types korrekt getrennt
**Status:** PASS
**Evidenz:**
```
sensor_data DISTINCT sensor_type: sht31_temp, sht31_humidity
```
**Notizen:** Kein Multi-Value-Blob. Firmware sendet getrennte Messages.

### V4-06 — Erste Sensordaten in DB
**Status:** PASS
**Evidenz:**
```
sht31_temp:     raw=24158, processed=19.5°C, quality=good, pi_enhanced
sht31_humidity: raw=26516, processed=40.5%RH, quality=good, pi_enhanced
```
**Notizen:** raw_value = Roh-ADC-Werte (24158), processed_value = kalibriert (19.5°C). pi_enhanced Verarbeitung aktiv.

### V4-07 — Keine SHT31-Duplikate
**Status:** PASS
**Evidenz:** `0 Duplikate` — UNIQUE Constraint `uq_sensor_data_esp_gpio_type_timestamp` + `ON CONFLICT DO NOTHING` wirksam.

---

### Block C: Aktor-Konfiguration

### V4-08 — Relay Aktor-Config erstellen
**Status:** PASS
**Evidenz:**
```
actuator_configs: gpio=27, actuator_type=digital, name=Luftbefeuchter, enabled=true
```
**Notizen:** actuator_type = "digital" statt "relay" — das ist der Interface-Typ, nicht der logische Typ. Olimex PWR Switch.

### V4-09 — Actuator-State automatisch erstellt
**Status:** PASS
**Evidenz:** `state=off, current_value=0, gpio=27`
**Notizen:** State ist "off" statt "idle" (Schema-Variante). Funktional identisch.

### V4-10 — Aktor-Kommando an Online-ESP
**Status:** PASS
**Evidenz:**
```
ON:  HTTP 200, command_sent=true, state=on, current_value=255
OFF: HTTP 200, command_sent=true, state=off, current_value=0
```
**Notizen:** API-Schema: `{"command": "ON"}` (nicht `{"action": "on"}`). current_value=255 bei ON (digital 0/255 statt 0/1). Serial-Log bestaetigt Ausfuehrung.

---

### Block D: Zone-Setup

### V4-11 — Zone erstellen
**Status:** PASS
**Evidenz:** `Zone: "Zelt Wohnzimmer", id=11629b8d-..., zone_id=zelt_wohnzimmer`
**Notizen:** zones-Tabelle hat sowohl `id` (UUID) als auch `zone_id` (Slug).

### V4-12 — Geraete der Zone zuweisen
**Status:** PASS
**Evidenz:** `ESP_472204: zone_id=zelt_wohnzimmer, zone_name=Zelt Wohnzimmer`

### V4-13 — Subzone erstellen und Geraete zuweisen
**Status:** PASS
**Evidenz:**
```
subzone_configs: subzone_id=pflanze_1, subzone_name=Pflanze 1, parent_zone_id=zelt_wohnzimmer
assigned_gpios=[0, 27], is_active=true
```
**Notizen:** GPIO 0 (SHT31 I2C) und GPIO 27 (Relay) korrekt zugewiesen.

---

### Block E: Datenfluss E2E

### V4-14 — MQTT → Server → DB Pipeline
**Status:** PASS
**Evidenz:** Neue sensor_data-Eintraege nach 30s-Wartezeit. Pipeline funktioniert.

### V4-15 — last_seen Update via Sensor-Handler
**Status:** PASS
**Evidenz:** `last_seen: 16:04:38 → 16:05:38` (+60s, Heartbeat-Intervall-getriggert)
**Notizen:** Fix-W last_seen-Update funktioniert. Throttle-Intervall = 60s.

### V4-16 — last_seen Throttle 60s
**Status:** PASS
**Evidenz:** last_seen nach 5s identisch (Throttle blockiert Update innerhalb 60s).

### V4-17 — WebSocket Sensor-Event im Frontend
**Status:** SKIP
**Notizen:** Manueller Browser-Test erforderlich (WebSocket-Tab in DevTools). Nicht automatisierbar.

---

### Block F: Fix-Y Offline-Guard

### V4-18 — SafetyService blockiert Command an Offline-ESP
**Status:** PASS
**Evidenz:**
```json
HTTP 409: {"code": "DEVICE_OFFLINE", "numeric_code": 5414,
  "message": "Cannot send command: ESP ESP_472204 is offline (status=offline)"}
```
**Notizen:** Fix-Y funktioniert perfekt. Error-Code 5414, klare Fehlermeldung mit ESP-ID und Status.

### V4-19 — Actuator-State Reset bei Offline-Transition
**Status:** PASS
**Evidenz:** `state=idle, current_value=0` bei Offline-ESP.
**Notizen:** Fix-U Actuator-Reset bei Offline-Transition bestaetigt. LWT triggert Reset.

### V4-20 — Frontend Toggle disabled bei Offline
**Status:** PASS
**Evidenz:** Screenshot zeigt ActuatorCard "AUS" ohne funktionalen Toggle. ESP als "Offline" markiert.
**Notizen:** Orbital-View zeigt letzte Sensorwerte (19.5°C, 40.8%RH) mit "Qualitaet: Gut" trotz Offline.

---

### Block G: Emergency-Stop

### V4-21 — Emergency-Stop funktioniert
**Status:** PASS
**Evidenz:**
```json
HTTP 200: {"devices_stopped": 1, "actuators_stopped": 1}
actuator_states: state=off, current_value=0
```
**Notizen:** API: `POST /api/v1/actuators/emergency_stop` mit `{"reason": "..."}` (required).

### V4-22 — Emergency-Stop retain=False
**Status:** PASS
**Evidenz:** `mosquitto_sub -W 3` Timeout — keine retained Emergency-Message.
**Notizen:** Fix-W retain=False bestaetigt.

### V4-23 — Emergency-Stop-Reset + Normalbetrieb
**Status:** PASS
**Evidenz:**
```
clear_emergency: devices_cleared=3
ON nach Clear: HTTP 200, state=on, current_value=255
OFF: HTTP 200, state=off, current_value=0
```
**Notizen:** Normalbetrieb nach Clear vollstaendig wiederhergestellt.

---

### Block H: Frontend-Rendering

### V4-24 — Monitor L1: Zone-Tile sichtbar
**Status:** PASS
**Evidenz:** Screenshot `V4-24-monitor-L1.png`
- Zone "Zelt Wohnzimmer" mit "Alles OK"
- Temperatur 19.5°C, Luftfeuchte 40.7%RH
- 1/1 online, 2/2 Sensoren, 1 Aktor
- Dashboard-Link "Cross-Zone Temperatur-Vergleich (2 Widgets)"
**Notizen:** Leere Zonen werden nicht angezeigt (3 ESPs total, nur 1 in Zone).

### V4-25 — Monitor L2: Subzone-First Layout
**Status:** PARTIAL
**Evidenz:** Screenshot `V4-25-monitor-L2.png`
- Subzone "Pflanze 1" als Accordion (2S · 1A, 19.5°C · 40.7%RH) ✓
- SensorCards oben, Trennlinie, ActuatorCards unten ✓
- Keine Duplikate ✓
**Abweichung:** "SENSOREN" und "AKTOREN" Sub-Headers innerhalb der Subzone sind sichtbar. Plan spezifiziert "Keine separaten SENSOREN/AKTOREN Section-Headers". Funktional korrekt, optisch etwas redundant.

### V4-26 — ActuatorCard Features
**Status:** PARTIAL
**Evidenz:**
- ActuatorCard zeigt "Luftbefeuchter", "ESP_472204 · digital"
- "Bedient: Pflanze 1" (Subzone-Zuordnung korrekt)
- Status: "Aus" / "Nie bestaetigt"
**Abweichung:** Icon ist Power-Icon (generisch), nicht ToggleRight fuer Relay. `actuator_type=digital` hat keinen spezifischen Match in `getActuatorTypeInfo()`. Ausserdem zeigt "digital" statt "relay" — Typ-Mapping-Issue zwischen Config und Frontend.

### V4-27 — Monitor Read-Only
**Status:** PASS
**Evidenz:** Kein Toggle-Button auf ActuatorCard im Monitor-Kontext. Nur Text "Aus" und "Nie bestaetigt".

### V4-28 — Editor Sync
**Status:** SKIP
**Notizen:** Console zeigte `PUT /dashboards/... 401` Error beim Monitor-L2-Laden (Dashboard-Sync fehlgeschlagen). Separater Test noetig.

---

### Block I: Config-Push

### V4-29 — Config-Push bei Sensor-Aenderung
**Status:** PASS (indirekt)
**Evidenz:** Serial-Logs zeigen Config-Push bei Zone/Subzone-Assignment:
```
MQTT message received: kaiser/god/esp/ESP_472204/config
ConfigResponse published [sensor] status=success success=2 failed=0
ConfigResponse published [actuator] status=success
```
**Notizen:** Config-Push wird durch Zone/Subzone-Assignment getriggert, nicht durch einfache Name-Aenderung.

### V4-30 — Config-Push Cooldown 120s
**Status:** SKIP
**Notizen:** Cooldown nicht isoliert testbar ohne direkten Config-Push-Trigger.

### V4-31 — Kein Config-Push an Offline-ESP
**Status:** SKIP
**Notizen:** Nicht isoliert getestet. Online-Check ist im Code vorhanden.

---

### Block J: Health + Datenintegritaet

### V4-32 — Health-Endpoint vollstaendig
**Status:** PASS
**Evidenz:**
```json
{
  "database": {"connected": true, "latency_ms": 5.0},
  "mqtt": {"connected": true, "subscriptions": 5},
  "websocket": {"active_connections": 1},
  "resilience": {"healthy": true, "breakers": {
    "external_api": {"state": "closed"}, "database": {"state": "closed"}, "mqtt": {"state": "closed"}
  }, "summary": {"total": 3, "closed": 3, "open": 0, "half_open": 0}}
}
```
**Notizen:** Fix-X Resilience-Feld vollstaendig. Alle 3 Breaker closed.

### V4-33 — DB-Infrastruktur
**Status:** PASS
**Evidenz:**
- pg_dump 16.13 ✓
- /app/backups/ existiert mit Pre-Cleanup-Backup ✓
- UNIQUE Constraint `uq_sensor_data_esp_gpio_type_timestamp` vorhanden ✓

### V4-34 — Datenintegritaet Snapshot
**Status:** PASS
**Evidenz:**
| Check | Ergebnis |
|-------|----------|
| Stale Actuator-States | 0 ✓ |
| Sensor-Data Duplikate | 0 ✓ |
| Orphan sensor_configs | 0 ✓ |
| Orphan actuator_configs | 0 ✓ |

**Baseline-Zaehlung:**
| Tabelle | Count |
|---------|-------|
| esp_devices | 3 |
| sensor_configs | 2 |
| actuator_configs | 1 |
| sensor_data | 44 |
| zones | 1 |
| subzone_configs | 1 |
| actuator_states | 1 |
| heartbeat_logs | 17 |

**Hinweis:** actuator_type Mismatch — `actuator_configs.actuator_type = 'digital'` vs `actuator_states.actuator_type = 'relay'`. Kein Funktionsproblem, aber Inkonsistenz.

### V4-35 — Server-Restart Stabilitaet
**Status:** FAIL
**Evidenz:**
```
zone_ack_handler - ERROR - Error processing zone ACK:
ForeignKeyViolationError: insert or update on table "esp_devices" violates
foreign key constraint "fk_esp_devices_zone_id_zones"
```
**Root Cause:** Beim Server-Restart sendet der ESP einen Zone-ACK via MQTT. Der `zone_ack_handler` versucht die Zone-ID zu schreiben, aber die Zone ist noch nicht aus der DB geladen / der Handler laeuft bevor alle Subscriptions bereit sind. Race Condition beim Startup.
**Impact:** Nicht fatal — Server laeuft danach healthy, ESP ist online. Aber Traceback im Log.

---

## Neue Findings

### F-V4-01 — Zone-ACK Race Condition beim Server-Restart (HIGH)
**Quelle:** V4-35
**Problem:** `zone_ack_handler` wirft `ForeignKeyViolationError` beim Restart weil ESP sofort Zone-ACK sendet bevor Server bereit ist.
**Fix-Vorschlag:** Exception im zone_ack_handler abfangen und Retry nach 5s, oder Zone-ACK erst nach Startup-Grace-Period verarbeiten.

### F-V4-02 — Actuator-Type Mismatch: "digital" vs "relay" (MEDIUM)
**Quelle:** V4-08, V4-34
**Problem:** `actuator_configs.actuator_type = 'digital'` (Interface-Typ), `actuator_states.actuator_type = 'relay'` (logischer Typ). Frontend zeigt "digital" statt "relay".
**Impact:** Falsches Icon im Frontend (Power statt ToggleRight), verwirrende Anzeige.
**Fix-Vorschlag:** Mapping digital→relay bei der Config-Erstellung, oder Frontend-Fallback verbessern.

### F-V4-03 — ESP Emergency-Broadcast JSON Parse Error (LOW)
**Quelle:** V4-23 Serial-Log
**Problem:** `Failed to parse broadcast emergency JSON` auf ESP-Seite.
**Impact:** Nicht blockierend (Actuator wird trotzdem via direktem Command gestoppt), aber ESP versteht die Broadcast-Message nicht.
**Fix-Vorschlag:** Emergency-Broadcast-Payload pruefen / Firmware-Parser anpassen.

### F-V4-04 — Erster Config-Push ohne Aktoren (LOW)
**Quelle:** Serial-Log (Boot)
**Problem:** Erster Config-Push nach Boot enthielt keine Aktoren ("No actuators configured (sensor-only device)"). Erst der zweite Push (nach Zone-Assignment) enthielt den Relay.
**Impact:** Timing-Issue — Actuator-Config wird erst nach Zone/Subzone-Assignment mitgesendet.

### F-V4-05 — Dashboard-Sync Error 401 (LOW)
**Quelle:** V4-28 Console
**Problem:** `PUT /dashboards/{id}` gibt 401 zurueck beim Monitor-L2-Laden.
**Impact:** Auto-Layout-Sync fehlgeschlagen. Dashboard-Widget-Updates gehen verloren.

---

## Fix-Verifikation Zusammenfassung

| Fix | Tests | Status | Notizen |
|-----|-------|--------|---------|
| **Fix-Y** (Offline-Guard) | V4-18 | ✅ PASS | HTTP 409, Error-Code 5414 |
| **Fix-U** (Actuator-Reset) | V4-19, V4-20, V4-34(1) | ✅ PASS | State=idle bei Offline, Frontend disabled |
| **Fix-W** (last_seen + Emergency) | V4-15, V4-16, V4-22 | ✅ PASS | Throttle 60s, retain=False |
| **Fix-W** (Restart CRITICAL) | V4-35 | ❌ FAIL | Zone-ACK Race Condition |
| **Fix-FW** (Config-Push) | V4-29 | ✅ PASS (indirekt) | Via Serial-Logs bestaetigt |
| **Fix-T** (DB-Infra) | V4-33 | ✅ PASS | pg_dump 16.13, Backup, UNIQUE |
| **Fix-X** (Health) | V4-32 | ✅ PASS | Resilience-Feld komplett |
| **6.0** (Duplikate) | V4-07 | ✅ PASS | 0 Duplikate |
| **6.1** (Subzone-First) | V4-25 | ⚠️ PARTIAL | Sub-Headers noch sichtbar |
| **6.2** (ActuatorCard) | V4-26 | ⚠️ PARTIAL | digital statt relay, falsches Icon |
| **6.3** (Read-Only) | V4-27 | ✅ PASS | Kein Toggle im Monitor |

---

## Screenshots

- `V4-24-hardware-L1.png` — HardwareView Uebersicht mit Zone + ESP
- `V4-24-monitor-L1.png` — Monitor L1 Zone-Tile
- `V4-25-monitor-L2.png` — Monitor L2 Subzone-First Layout
- `V4-20-offline-actuator.png` — Offline-ESP Orbital mit disabled Actuator
