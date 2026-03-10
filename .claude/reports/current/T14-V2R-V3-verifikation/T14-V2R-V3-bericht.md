# T14-V2R + V3 Verifikation — Ergebnisbericht

**Datum:** 2026-03-09 16:10 UTC
**Agent:** AutoOps (Claude Opus 4.6)
**Stack:** Docker (12/12 healthy)
**Branch:** feat/T13-zone-device-scope-2026-03-09

## Zusammenfassung

### V2R — Bug-Verifikation (10 Tests)

| Test | Bug | Fix | Ergebnis | Finding |
|------|-----|-----|----------|---------|
| V2R-01 | BUG-1 zone/ack | Fix-A | **PARTIAL** | Server-Code korrekt, ESP-Firmware sendet kein zone/ack |
| V2R-02 | BUG-2 Orphan | Fix-A | **PASS** | 3 Transfers, 0 Orphans |
| V2R-03 | BUG-3 Reset DB | Fix-B | **PASS** | Subzones physisch geloescht nach Reset |
| V2R-04 | BUG-4 Timeout | Fix-B | **PASS** | ack_received=false, DB trotzdem aktualisiert, HTTP 200 |
| V2R-05 | BUG-5 Delete DB | Fix-C | **FAIL** | session.commit() fehlt in subzone API endpoint |
| V2R-06 | BUG-6 Sichtbarkeit | Fix-C | **PASS** | Leere aktive Zone sichtbar, deleted unsichtbar |
| V2R-07 | BUG-7 Confirm | Fix-D | **PASS** | Custom-Dialog, Abbrechen + Bestaetigen funktioniert |
| V2R-08 | BUG-8 PATCH | Fix-D | **PASS** | 200 bei validem PATCH, 400 bei leerem Body |
| V2R-09 | BUG-9 /reactivate | Fix-D | **PASS** | archived→active=200, active→active=400 |
| V2R-10 | BUG-10 zone_name | Fix-D | **PASS** | esp_devices.zone_name automatisch synchronisiert |

**V2R Gesamt: 8/10 PASS, 1 PARTIAL, 1 FAIL**

### V3 — Subzone-Management (5 Tests)

| Test | Ergebnis | Finding |
|------|----------|---------|
| V3.1 Zaehler korrekt | **FAIL** | Subzone-Chips nicht sichtbar — Data-Flow-Gap |
| V3.2 GPIO-0 Filter | **PASS** | Code filtert GPIO 0 korrekt (Zeile 185 subzone_service.py) |
| V3.3 Zaehler nach Aenderung | **BLOCKED** | Durch V3.1 blockiert |
| V3.4 Leere Subzone | **BLOCKED** | Durch V3.1 blockiert |
| V3.5 Wokwi-ESP Subzone | **BLOCKED** | Durch V3.1 blockiert |

**V3 Gesamt: 1/5 PASS, 1 FAIL, 3 BLOCKED**

### Gesamtergebnis

**V2R + V3: 9/15 PASS, 1 PARTIAL, 1 FAIL, 1 FAIL, 3 BLOCKED**

**BLOCKER VORHANDEN — Nicht bereit fuer V4**

---

## Screenshots-Index

| Nr | Datei | Inhalt |
|----|-------|--------|
| S08 | S08-confirm-dialog.png | Confirm-Dialog mit z-index-Bug sichtbar |
| S09 | S09-zone-deleted.png | L1 nach Zone-Loeschung — "V2R Delete Me" weg |
| S10 | S10-cleanup-endstate.png | L1 Endzustand = Ausgangszustand |
| S11 | S11-esp-settings-subzone-section.png | ESPSettingsSheet "Geraete nach Subzone" — alles "Keine Subzone" |

---

## Findings

### FINDING-V2R-01 (MEDIUM) — ESP-Firmware sendet kein zone/ack

- **Test:** V2R-01
- **IST:** ESP32 empfaengt zone/assign ueber MQTT, aber sendet kein zone/ack zurueck. Server-seitiger Fix-A Code (zone_ack_handler.py mit resolve_ack()) ist korrekt implementiert.
- **SOLL:** ESP32 antwortet auf zone/assign mit zone/ack.
- **Root Cause:** ESP32 Firmware (main.cpp) hat zwar zone/assign Subscription und rudimentaeres Parsing, aber die handleZoneAssign()-Logik sendet nie ein ACK.
- **Empfehlung:** ESP32-Firmware Fix: nach Zone-Verarbeitung ein zone/ack JSON publishen (aehnlich wie heartbeat_ack).

### FINDING-V2R-05 (CRITICAL) — Subzone DELETE: session.commit() fehlt

- **Test:** V2R-05
- **IST:** `DELETE /api/v1/subzone/devices/{esp_id}/subzones/{subzone_id}` gibt HTTP 200 zurueck, Subzone bleibt in DB.
- **SOLL:** Subzone wird physisch aus der DB geloescht.
- **Root Cause:** `El Servador/god_kaiser_server/src/api/v1/subzone.py` — remove_subzone() Endpoint ruft `service.remove_subzone()` auf. Der Service macht `session.delete()` + `session.flush()` (Zeile 269 subzone_service.py), aber der Endpoint committed nie die Session. Im Gegensatz dazu: `zone.py` hat korrekt `await db.commit()` (Zeile 89).
- **Fix:** In `subzone.py` nach `service.remove_subzone()` ein `await session.commit()` einfuegen.
- **Empfehlung:** Audit aller API-Endpoints auf fehlende commits.

### FINDING-V2R-07-UX (LOW) — z-index: Confirm-Dialog hinter SlideOver-Backdrop

- **Test:** V2R-07
- **IST:** Wenn ZoneSettingsSheet (SlideOver) offen ist und der Confirm-Dialog erscheint, fangen die SlideOver-Backdrop pointer-events ab. Buttons im Confirm-Dialog sind nicht klickbar.
- **SOLL:** Confirm-Dialog hat hoechsten z-index und ist vollstaendig interaktiv.
- **Root Cause:** `.slide-over-backdrop` hat hoeheren z-index als `.confirm-dialog`.
- **Empfehlung:** z-index des Confirm-Dialogs erhoehen oder SlideOver-Backdrop temporaer deaktivieren.

### FINDING-V3-01 (HIGH) — Subzone-Chips: Data-Flow-Gap

- **Test:** V3.1
- **IST:** Subzone-Chips sind im ZonePlate.vue implementiert (Zeile 457-525), werden aber NICHT angezeigt. `device.subzone_id` ist nach Seitenladung immer `null`.
- **SOLL:** Subzone-Chips zeigen Subzone-Namen mit Sensor/Aktor-Zaehlern.
- **Root Cause:** Die Device-API (`GET /api/v1/esp/devices`) liefert kein `subzone_id` Feld. `device.subzone_id` wird NUR durch WebSocket `subzone_assignment` Events gesetzt (zone.store.ts Zeile 260). Nach Page-Refresh geht die Zuordnung verloren.
- **Daten vorhanden:** `subzone_configs` Tabelle hat korrekte Zuordnungen. Subzone-API (`GET /api/v1/subzone/devices/{esp_id}/subzones`) liefert korrekte Daten mit sensor_count/actuator_count.
- **Empfehlung:** Option A: Device-API um subzone_id erweitern. Option B: Frontend laedt Subzone-Daten separat und merged sie in die Device-Objekte beim Seitenstart.
- **Blockiert:** V3.3, V3.4, V3.5

---

## MQTT-Flow-Analyse (V2R-01)

- zone/assign Timestamp: Gesendet via MQTT bei API-Call
- zone/ack Timestamp: **NIE empfangen** (ESP sendet kein ACK)
- resolve_ack(): Nicht aufgerufen (kein ACK zum Resolven)
- Server-Code: `zone_ack_handler.py` korrekt implementiert mit `resolve_ack()`
- `mqtt_command_bridge.py`: `send_and_wait_ack()` wartet 10s, gibt MQTTACKTimeoutError
- DB wird trotzdem aktualisiert (Fix-B bestaetig)
- Response: `{"ack_received": false, "warning": "ACK-Timeout..."}`

## Datenintegritaet

| Metrik | Wert |
|--------|------|
| sensor_data Baseline | ~4650 |
| sensor_data Endstand | 4697 (>= Baseline, kein Verlust) |
| Verwaiste Subzones | 0 |
| Subzones mit falscher parent_zone_id | 0 |
| Active Zones am Ende | 2 (echter_esp, wokwi_testzone) |
| ESPs in Original-Zonen | Ja |

## API-Endpoint Referenz (verifiziert)

| Endpoint | Methode | Status |
|----------|---------|--------|
| `/api/v1/zones` | POST | OK (Create) |
| `/api/v1/zones/{zone_id}` | PATCH | OK (Rename/Update) |
| `/api/v1/zones/{zone_id}` | DELETE | OK (Soft-Delete) |
| `/api/v1/zones/{zone_id}/archive` | POST | OK (Validierung: keine Devices) |
| `/api/v1/zones/{zone_id}/reactivate` | POST | OK (archived→active) |
| `/api/v1/zone/devices/{esp_id}/assign` | POST | OK (Zone-Zuordnung) |
| `/api/v1/subzone/devices/{esp_id}/subzones` | GET | OK (Subzone-Liste) |
| `/api/v1/subzone/devices/{esp_id}/subzones/{subzone_id}` | DELETE | BUG (kein commit) |

## Naechster Schritt

### Blocker beheben (vor V4):

1. **CRITICAL — Fix-E: Subzone DELETE commit** (5 min)
   - Datei: `El Servador/god_kaiser_server/src/api/v1/subzone.py`
   - Nach `service.remove_subzone()` einfuegen: `await session.commit()`

2. **HIGH — Fix-F: Subzone Data-Flow** (30-60 min)
   - Option A: Device-API um `subzone_id`/`subzone_name` Felder erweitern
   - Option B: ESP Store laedt Subzone-Daten bei `fetchDevices()` und merged sie
   - Beides erfordert: Frontend-Store-Aenderung + API-Anpassung

3. **MEDIUM — Fix-G: ESP32 zone/ack** (15-30 min)
   - ESP32 Firmware: `handleZoneAssign()` muss zone/ack publishen
   - Pattern: Analog zu heartbeat_ack — JSON mit esp_id, status, timestamp

4. **LOW — Fix-H: Confirm-Dialog z-index** (5 min)
   - ConfirmDialog z-index > SlideOver-Backdrop z-index

### Nach Fixes: V2R-Retest fuer Fix-E + V3-Retest fuer Fix-F
### Dann: V4 Multi-Zone Device Scope
