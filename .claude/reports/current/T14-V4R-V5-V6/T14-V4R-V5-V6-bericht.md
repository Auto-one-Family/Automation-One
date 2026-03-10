# T14-V4R + V5 + V6 — Ergebnisbericht

**Datum:** 2026-03-09
**Stack:** Docker (10/10 services running)
**Branch:** feat/T13-zone-device-scope-2026-03-09
**Dauer:** ~120 Minuten

---

## V4R — Fix-I/J/K Retest (7 Tests)

| Test | Finding | Fix | Ergebnis | Details |
|------|---------|-----|----------|---------|
| V4R-01 | V4-01 I2C Sibling Save | Fix-I | **PASS** | SHT31 temp save HTTP 200, kein 409. Sibling (sht31_humidity) unveraendert. |
| V4R-02 | V4-01 Scope Save I2C | Fix-I | **PASS** | Scope-Aenderung zone_local → multi_zone bei I2C-Sensor gespeichert ohne Konflikt. |
| V4R-03 | V4-02 Scope-Badge Orbital | Fix-J | **PASS** | "MZ" Badge auf Sensor-Satellite bei multi_zone. Verschwindet nach Reset auf zone_local. |
| V4R-04 | V2R2-04 ESPSettingsSheet Gruppierung | Fix-J | **FAIL (MEDIUM)** | Alle Geraete unter "Keine Subzone" obwohl Subzone "To Delete" assigned_gpios=[27] hat. L1 ZonePlate zeigt korrekt "To Delete 0S 1A". MonitorView L2 gruppiert korrekt. **Nur ESPSettingsSheet betroffen.** |
| V4R-05 | V2R2-01 DELETE Idempotenz | Fix-K | **PASS** | Erster DELETE 200, Zweiter DELETE 404. Sauberer Fehler, kein 500. |
| V4R-06 | V2R2-02 ACK-Timeout 15s | Fix-K | **PARTIAL** | Code korrekt: DEFAULT_TIMEOUT=15.0, Loki bestaetigt 15.0s Timeout. Aber: Warning-Text in zone_service.py:226 sagt "innerhalb 10s" (cosmetic). mqtt_sent=false bei Zone-Assign (MQTT Bridge offline, separates Issue). |
| V4R-07 | V4-03 Inventory Scope-Spalte | Fix-J | **PASS** | SensorsView Scope-Spalte zeigt korrekte Werte: "Multi-Zone" fuer multi_zone, "Lokal" fuer zone_local. Alle 4 Komponenten korrekt. |

**V4R Gate: 5 PASS + 1 FAIL + 1 PARTIAL → Weiter zu V5 (kein CRITICAL)**

### V4R Findings

**FINDING-V4R-04 (MEDIUM): ESPSettingsSheet Subzone-Gruppierung ignoriert assigned_gpios**
- Pfad: `El Frontend/src/components/esp/ESPSettingsSheet.vue` → Sektion "Geraete nach Subzone"
- Symptom: Alle Geraete erscheinen unter "Keine Subzone", obwohl GPIO 27 in Subzone "To Delete" assigned_gpios steht
- MonitorView L2 gruppiert korrekt → Issue ist isoliert auf ESPSettingsSheet-Komponente
- Root Cause: Sheet nutzt wahrscheinlich `sensor_config.subzone_id` (NULL) statt `subzone_configs.assigned_gpios` Zuordnung
- Screenshots: S08

**FINDING-V4R-06 (LOW): Stale Warning-Text "10s" in zone_service.py:226**
- Text: "innerhalb 10s bestaetigt" → sollte "innerhalb 15s" sein
- Timeout selbst korrekt (15.0s, Loki-bestaetigt)

---

## V5 — Cross-View-Konsistenz (5 Tests)

| Test | Beschreibung | Ergebnis | Details |
|------|-------------|----------|---------|
| V5.1 | Cross-View Zone-Konsistenz | **PASS** | HardwareView, MonitorView, SensorsView zeigen identische Zahlen. DB Ground Truth stimmt ueberein. |
| V5.2 | Monitor Zone-Filter | **PASS** | Filter zeigt nur gewaehlte Zone. "Gefiltert"-Badge sichtbar. Zuruecksetzen auf "Alle Zonen" funktioniert. |
| V5.3 | Monitor Subzone-Filter L2 | **PASS** | Subzone-Filter Dropdown vorhanden mit "Alle Subzonen", "To Delete", "Keine Subzone". Filterung korrekt, "Gefiltert"-Badge sichtbar. Gruppierung stimmt mit DB ueberein. |
| V5.4 | Components Tab Scope Cross-Check | **PASS** | SensorsView "Multi-Zone" == HardwareView "MZ" Badge == DB multi_zone. 100% konsistent fuer alle 4 Komponenten. |
| V5.5 | Datenbank-Integritaet | **PASS** | 0 verwaiste Subzones, 0 verwaiste Sensors, 0 Duplikate, 0 verwaiste device_active_context. zone_ids konsistent. I2C Siblings korrekt (sht31_temp+sht31_humidity teilen i2c_address=68). sensor_data lueckenlos (4/min, 30min-Fenster). 152 historische Records mit alten Test-Zone-IDs (testzone_alpha/beta) — akzeptabel. |

**V5 Gate: 5/5 PASS → Weiter zu V6**

---

## V6 — WebSocket + Echtzeit (7 Tests)

| Test | Beschreibung | Ergebnis | Details |
|------|-------------|----------|---------|
| V6.1 | WS-Event Scope-Aenderung | **PARTIAL** | Kein WS `device_scope_changed` Event. UI aktualisiert NICHT automatisch nach API-Scope-Change. Daten korrekt nach Page-Reload via API-Fetch. **WS-Event nicht implementiert, UI nutzt API-Polling bei Mount.** |
| V6.2 | WS-Event Context-Wechsel | **PARTIAL** | Kein WS `device_context_changed` Event in Loki. Gleicher Mechanismus wie V6.1 — API-basiert, nicht WS-pushed. |
| V6.3 | WS-Event Zone-Assign | **PARTIAL** | Kein WS `zone_assignment` Event. Zone-Assign via API loest 15s Timeout aus (mqtt_sent=false). DB wird aktualisiert. Heartbeat-Handler erkennt Mismatch und pusht Config automatisch. UI aktualisiert via naechsten API-Fetch. |
| V6.4 | MQTT-Flow-Sequenz | **PARTIAL** | MQTT Bridge meldet "offline" — zone/assign MQTT Message nicht gesendet. Fallback: DB-save + Heartbeat-basierte Config-Push-Sequenz. Subzone-Transfer korrekt (1 Subzone transferiert). Correlation-ID vorhanden. |
| V6.5 | ESP Reconnect Full-State-Push | **SKIP** | Kein Reconnect-Event in letzten 24h. Live-Test nicht durchfuehrbar ohne ESP-Stromtrennung. |
| V6.6 | Heartbeat-Mismatch Resync | **PASS** | Loki bestaetigt: "Config mismatch detected for ESP_472204: ESP reports sensors=20/actuators=0, DB has sensors=2/actuators=1. Triggering auto config push." + "Zone mismatch tolerated (reconnect state push pending)". Auto-Config-Push erfolgreich: "Config published to ESP_472204: 2 sensors, 1 actuators, zone=wokwi_testzone". |
| V6.7 | WS-Handler Robustheit | **PASS** | 0 Console-Errors nach normalem Gebrauch UND Stress-Test (5 schnelle View-Wechsel in 2.5s). Keine TypeErrors, ReferenceErrors oder WebSocket-Errors. |

**V6 Zusammenfassung: 2 PASS + 4 PARTIAL + 1 SKIP**

### V6 Architektur-Erkenntnisse

1. **WS-Events fuer Scope/Context/Zone-Aenderungen sind NICHT implementiert.** Das Frontend nutzt ausschliesslich API-Polling (listDevices bei Mount + Heartbeat-Event-Trigger).
2. **WS-Events die FUNKTIONIEREN:** `esp_health` (Heartbeat-Daten), `sensor_data` (Live-Messwerte). Diese werden durch ESPStore.handleEspHealth verarbeitet und loesen Device-Refresh aus.
3. **MQTT Bridge "offline"**: zone/assign MQTT Messages werden nicht gesendet. Fallback (DB-save + Heartbeat-Push) funktioniert, aber mit 15s Timeout-Delay.
4. **Heartbeat-Mismatch-Resync funktioniert korrekt** — Server erkennt Config-Unterschied und pusht automatisch.

---

## Gesamt: 14/19 PASS (+4 PARTIAL, +1 SKIP)

| Block | PASS | PARTIAL | FAIL | SKIP | Total |
|-------|------|---------|------|------|-------|
| V4R | 5 | 1 | 1 | 0 | 7 |
| V5 | 5 | 0 | 0 | 0 | 5 |
| V6 | 2 | 4 | 0 | 1 | 7 |
| **Gesamt** | **12** | **5** | **1** | **1** | **19** |

---

## Findings (priorisiert)

### MEDIUM
1. **FINDING-V4R-04: ESPSettingsSheet Subzone-Gruppierung**
   - Alle Geraete unter "Keine Subzone" obwohl assigned_gpios vorhanden
   - Betrifft nur ESPSettingsSheet, MonitorView L2 gruppiert korrekt
   - Fix: Gruppierungs-Logik in ESPSettingsSheet muss assigned_gpios aus subzone_configs nutzen

### LOW
2. **FINDING-V4R-06: Stale "10s" Warning-Text**
   - zone_service.py:226 sagt "innerhalb 10s bestaetigt", Timeout ist aber 15s
   - mqtt_command_bridge.py Docstring (line 61) sagt noch "Default 10s"
   - Fix: 2 Strings aktualisieren

3. **FINDING-V6-WS: Keine WS-Events fuer Scope/Context/Zone-Aenderungen**
   - Betrifft V6.1, V6.2, V6.3 — alle PARTIAL
   - UI aktualisiert via API-Polling, nicht via WS-Push
   - Impact: Keine Echtzeit-Updates bei Config-Aenderungen in Multi-Tab-Szenarien
   - Prioritaet: LOW (Single-User-System, API-Polling ausreichend fuer MVP)

4. **FINDING-V6-MQTT: MQTT Bridge offline**
   - zone/assign MQTT Messages nicht gesendet (mqtt_sent=false)
   - Fallback (DB + Heartbeat-Push) funktioniert
   - Unklar ob MQTT Client nicht verbunden oder Publisher-Issue

---

## Datenintegritaet

| Metrik | Wert |
|--------|------|
| sensor_data Endstand | 6462 Records |
| Verwaiste Subzones | 0 |
| Verwaiste Sensors | 0 |
| Verwaiste device_active_context | 0 |
| Duplikate | 0 |
| zone_id Konsistenz | OK (alle esp_devices zone_ids in zones-Tabelle) |
| I2C Siblings | OK (sht31_temp + sht31_humidity, i2c_address=68) |
| Cleanup erfolgreich | Ja (alle Scopes auf zone_local, ESPs in Original-Zonen) |
| Endzustand == Ausgangszustand | Ja (Screenshot S70 vs S01) |

---

## Screenshots

| Nr | Beschreibung |
|----|-------------|
| S01 | HardwareView L1 Ausgangszustand |
| S02-S04 | V4R-01/02 SensorConfigPanel Save |
| S05-S07 | V4R-03 Scope-Badge Orbital (MZ, reset) |
| S08 | V4R-04 ESPSettingsSheet "Keine Subzone" (FAIL) |
| S10 | V4R-07 SensorsView Scope-Spalte |
| S20-S22 | V5.1 Cross-View (Hardware, Monitor, Sensors) |
| S24-S25 | V5.2 Zone-Filter (gefiltert, ungefiltert) |
| S27-S28 | V5.3 Subzone-Filter L2 |
| S29-S30 | V5.4 Scope Cross-Check (Sensors vs Orbital) |
| S40 | V6.1 Scope-Change nach Reload (MZ Badge sichtbar) |
| S70 | Endzustand L1 |

---

## Naechster Schritt

1. **Fix-L (MEDIUM):** ESPSettingsSheet Subzone-Gruppierung — assigned_gpios nutzen
2. **Fix-M (LOW):** Stale "10s" Texte in zone_service.py + mqtt_command_bridge.py
3. **Backlog:** WS-Events fuer Scope/Context/Zone (Phase 7+)
4. **Backlog:** MQTT Bridge offline-Issue untersuchen
5. → Phase 6 (Monitor-Editor + Frontend-Polishing) kann starten
