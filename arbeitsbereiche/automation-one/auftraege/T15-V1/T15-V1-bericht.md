# T15-V1 — Monitor Deep-Dive Ergebnisbericht

**Datum:** 2026-03-09
**Stack:** Docker 12/12 Services healthy
**Branch:** feat/T13-zone-device-scope-2026-03-09
**sensor_data Baseline:** 6546 → Final: 6546 (kein Datenverlust)
**Loki Errors (Baseline):** 0

---

## V-LM — Fix-L/M Retest (4 Tests)

| Test | Beschreibung | Fix | Ergebnis |
|------|-------------|-----|----------|
| V-LM-01 | ESPSettingsSheet Subzone-Gruppierung | Fix-L | **PASS** |
| V-LM-02 | I2C GPIO-0 Behandlung | Fix-L | **PASS** |
| V-LM-03 | Timeout-Text 15s | Fix-M | **FAIL** |
| V-LM-04 | MQTT Bridge Diagnose-Logging | Fix-M | **PARTIAL** |

### V-LM-01: ESPSettingsSheet Subzone-Gruppierung via assigned_gpios — PASS

**DB Ground Truth:**
- Subzone "To Delete": assigned_gpios = [27], assigned_sensor_config_ids = []
- Sensoren: Temp&Hum (sht31_humidity, gpio=0), Temp&Hum (sht31_temp, gpio=0)
- Aktoren: Luftbefeuchter (digital, gpio=27)

**ESPSettingsSheet (S02b):**
- "To Delete": Luftbefeuchter (digital, GPIO 27, AUS) — via assigned_gpios[27] ✅
- "Keine Subzone": Temp&Hum (Luftfeuchte, GPIO 0, 41.4 %RH), Temp&Hum (Temperatur, GPIO 0, 18.6 °C) ✅

**MonitorView L2 Gegenprobe (S03):**
- Identische Gruppierung: Aktoren "To Delete" = Luftbefeuchter, Sensoren "Keine Subzone" = SHT31 ✅

`getEffectiveSubzoneId()` in ESPSettingsSheet.vue:195,244,257 korrekt implementiert.

### V-LM-02: I2C GPIO-0 Behandlung — PASS

- SHT31 Sensoren (gpio=0, i2c_address=0x44) korrekt unter "Keine Subzone"
- Keine Subzone hat GPIO 0 in assigned_gpios (0 Zeilen)
- GPIO 0 wird in der Zuordnungslogik korrekt ignoriert ✅

### V-LM-03: Timeout-Text 15s — FAIL

**Code-Stand:**
- `mqtt_command_bridge.py:37`: `DEFAULT_TIMEOUT: float = 15.0` ✅
- `mqtt_command_bridge.py:64`: Docstring "Default 15s" ✅
- `zone_service.py:200`: `ack_timeout = self.command_bridge.DEFAULT_TIMEOUT` ✅

**FINDING (HIGH): heartbeat_handler.py verwendet noch timeout=10.0**
- `heartbeat_handler.py:1368`: `timeout=10.0` ❌
- `heartbeat_handler.py:1402`: `timeout=10.0` ❌
- Loki bestaetigt: `ACK timeout for ESP_472204 zone (..., timeout=10.0s)` alle 2 Minuten

**Fix:** `10.0` → `MQTTCommandBridge.DEFAULT_TIMEOUT` oder `15.0` in heartbeat_handler.py:1368+1402

### V-LM-04: MQTT Bridge Diagnose-Logging — PARTIAL

**Code vorhanden:**
- `_is_connected()` (Zeile 196) ✅
- `_get_client_state()` (Zeile 202) ✅
- Startup-Log: "MQTTCommandBridge initialized (client_connected=%s)" (Zeile 45) ✅
- ACK-Timeout-Logging mit correlation_id und timeout-Wert ✅

**Loki-Befund:**
- ACK-Timeout-Warnings sichtbar (15 Eintraege in 12h) ✅
- Startup-Log nicht in Loki-Window (Server-Start >11h her, ausserhalb Query-Range)
- Kein Send-Failure mit `_get_client_state()` sichtbar (MQTT online)

---

## V-ML1 — Monitor L1 Deep-Dive (8 Tests)

| Test | Beschreibung | Ergebnis | Finding |
|------|-------------|----------|---------|
| V-ML1-01 | Zone-Tiles Vollstaendigkeit | **PASS** | |
| V-ML1-02 | KPI-Inhalte | **PASS** | |
| V-ML1-03 | Layout + Design-Qualitaet | **PASS** | |
| V-ML1-04 | Aktive Automatisierungen | **PASS** | |
| V-ML1-05 | Empty State | **PARTIAL** | Kein Link zu HardwareView |
| V-ML1-06 | Loading State | **PASS** | |
| V-ML1-07 | Error State | **PASS** | |
| V-ML1-08 | Keyboard-Accessibility | **PASS** | |

### V-ML1-01: Zone-Tiles Vollstaendigkeit — PASS

- DB: 2 aktive Zonen (Wokwi Testzone, Zelt Wohnzimmer) + 9 deleted
- UI: 2 Zone-Tiles sichtbar. Deleted Zones korrekt ausgeblendet ✅
- Zone-Filter Dropdown: "Alle Zonen", "Zelt Wohnzimmer", "Wokwi Testzone" ✅

### V-ML1-02: KPI-Inhalte — PASS

**Wokwi Testzone:**
- "Alarm" Badge (rot) — Geraet offline ✅
- "Geraet offline" Warnung ✅
- Temperatur: 22.5 °C (DB: ds18b20 Wasser) ✅
- 0/1 online, 1/1 Sensoren, 0 Aktoren ✅ (DB: 1 ESP offline, 1 sensor, 0 actuators)
- "vor 10 Stunden" Timestamp ✅

**Zelt Wohnzimmer:**
- "Alles OK" Badge (gruen) ✅
- Temperatur: 18.6 °C, Luftfeuchte: 41.4 %RH ✅
- 1/1 online, 2/2 Sensoren, 1 Aktor ✅ (DB: 1 ESP online, 2 sensors, 1 actuator)
- "vor 10 Stunden" Timestamp ✅

### V-ML1-03: Layout + Design-Qualitaet — PASS

- Tiles einheitlich breit (volle Content-Breite) ✅
- Alarm-Zone (Wokwi) hat roten linken Border, OK-Zone (Zelt) neutral ✅
- Schriftgroessen lesbar, kein Text abgeschnitten ✅
- Hover-Effekt: cursor=pointer auf Tiles ✅
- Konsistente Abstande zwischen Tiles ✅

### V-ML1-04: Aktive Automatisierungen — PASS

- Sektion "Aktive Automatisierungen (0)" vorhanden ✅
- Empty State: "Keine aktiven Automatisierungen" mit Link "Zum Regeln-Tab" ✅
- Dashboards-Sektion darunter: "Cross-Zone Temperatur-Vergleich (2 Widgets)" ✅

### V-ML1-05: Empty State — PARTIAL

- Code: `MonitorView.vue:1744` — `<div v-if="zoneKPIs.length === 0">`
- Empty State zeigt Icon + Text "Keine Zonen vorhanden." ✅
- **FINDING (LOW):** Kein Link/Button "Zonen in HardwareView erstellen"
- Fuer L2 Empty State: "Keine Sensoren oder Aktoren" mit "Zur Uebersicht" Link vorhanden

### V-ML1-06: Loading State — PASS

- `MonitorView.vue:1680`: `<BaseSkeleton v-if="espStore.isLoading" text="Lade Zonen..." full-height />`
- BaseSkeleton-Komponente importiert und verwendet ✅
- L2 hat eigenen Loading State: "Lade Zonendaten..." ✅

### V-ML1-07: Error State — PASS

- `MonitorView.vue:1681-1687`: ErrorState-Komponente mit:
  - `title="Fehler beim Laden der Geraete"` ✅
  - `:message="espStore.error"` ✅
  - `show-retry` + `@retry="espStore.fetchAll()"` ✅
- Klar unterscheidbar von Empty State (ErrorState vs monitor-view__empty) ✅
- Ready-Gate Pattern: Loading → Error → Content ✅

### V-ML1-08: Keyboard-Accessibility — PASS

- Zone-Tiles sind native `<button>` Elemente ✅
- Focus-Visible Outline sichtbar (iridescent/purple Border) — Screenshot S23 ✅
- Tab-Navigation erreicht Tiles ✅
- Enter/Space loest Click-Handler aus (native Button-Behavior) ✅

---

## V-ML2 — Monitor L2 Deep-Dive (12 Tests)

| Test | Beschreibung | Ergebnis | Finding |
|------|-------------|----------|---------|
| V-ML2-01 | Subzone-Accordion Struktur | **PASS** | |
| V-ML2-02 | Accordion Smart-Defaults | **PASS** | |
| V-ML2-03 | Aggregationszeile | **PASS** | |
| V-ML2-04 | SensorCard Inhalte | **PARTIAL** | Beide SHT31 heissen "Temp&Hum" |
| V-ML2-05 | Stale-Visualisierung | **PARTIAL** | Timestamp orange, Card selbst kein visuelles Stale-Feedback |
| V-ML2-06 | ActuatorCard Monitor-Mode | **PASS** | |
| V-ML2-07 | Subzone-Filter Dropdown | **PASS** | |
| V-ML2-08 | Subzone-Eingabefeld entfernt? | **PASS** | |
| V-ML2-09 | SHT31 Duplikat-Check | **PASS** | |
| V-ML2-10 | Link Monitor → Hardware | **PASS** | |
| V-ML2-11 | Layout-Gesamtqualitaet | **PASS** | |
| V-ML2-12 | Cross-View Subzone-Konsistenz | **PASS** | |

### V-ML2-01: Subzone-Accordion Struktur — PASS

- 2 Sensor-Accordions: "To Delete" (leer) + "Keine Subzone" (2 Cards) ✅
- 2 Aktor-Accordions: "To Delete" (1 Card) + "Keine Subzone" (leer) ✅
- Accordion-Headers sind klickbare Buttons mit Chevron ✅
- Leere Subzone zeigt: "Keine Sensoren zugeordnet — Sensoren in der Hardware-Ansicht hinzufuegen" ✅

### V-ML2-02: Accordion Smart-Defaults — PASS

- 1 benannte Subzone + "Keine Subzone" = 2 total (≤4)
- Alle Accordions standardmaessig geoeffnet ✅
- Code: `MonitorView.vue:1374` — ">4 named subzones: only first named + Keine Subzone open"

### V-ML2-03: Aggregationszeile — PASS

- "Keine Subzone" Header: "41.4%RH · 18.6°C" ✅
- Keine 0-Werte, keine Duplikate ✅
- "To Delete" Sensor-Accordion: keine Aggregation (korrekt, 0 Sensoren)

### V-ML2-04: SensorCard Inhalte — PARTIAL

**Card 1 (SHT31 Humidity):**
- Name: "Temp&Hum" — OK aber nicht unterscheidbar ⚠️
- Wert: 41.4 %RH ✅
- Qualitaet: "OK" (gruen) ✅
- Trend: "Steigend" mit Pfeil ✅
- Sparkline: Vorhanden (Mini-Chart sichtbar) ✅
- ESP-Quelle: "ESP_472204" ✅
- Subzone: "Keine Subzone" ✅
- Timestamp: "vor 10 Stunden" (orange, mit Uhr-Icon) ✅

**Card 2 (SHT31 Temp):**
- Name: "Temp&Hum" — identisch mit Card 1 ⚠️
- Wert: 18.6 °C ✅
- Qualitaet: "OK" (gruen) ✅
- Trend: "Fallend" mit Pfeil ✅
- Sparkline: Vorhanden ✅
- Timestamp: "vor 10 Stunden" ✅

**FINDING (MEDIUM):** Beide SHT31-Cards heissen "Temp&Hum" — nicht unterscheidbar ohne Wert/Einheit. DB `sensor_name` ist "Temp&Hum" fuer beide. UI sollte sensor_type-Suffix zeigen (z.B. "Temp&Hum (Temperatur)" / "Temp&Hum (Feuchtigkeit)").

### V-ML2-05: Stale-Visualisierung — PARTIAL

- Daten 39000s alt (>>120s Threshold)
- Timestamp "vor 10 Stunden" in Orange mit Uhr-Icon ✅
- Console: "Sensor stale: ESP_472204" Warnings ✅
- CSS-Klasse `.monitor-zone-tile__activity--stale` existiert (fuer Zone-Tiles)
- CSS-Klasse `.sensor-detail__stale-badge` existiert (fuer Detail-View)
- **FINDING (LOW):** SensorCard in L2 zeigt "OK" Badge trotz 10h Stale-Daten. Timestamp in Orange ist der einzige visuelle Hinweis. Card-Opacity/Border aendert sich nicht. Fuer Endanwender moeglicherweise verwirrend.

### V-ML2-06: ActuatorCard Monitor-Mode — PASS

- Name: "Luftbefeuchter" ✅
- Typ: "ESP_472204 · digital" ✅
- Bedient: "To Delete" ✅
- Zustand: "Aus" ✅
- **KEIN Toggle-Button** sichtbar ✅ (Monitor = readonly)
- Kein PWM-Badge (nicht PWM-Typ, N/A)

### V-ML2-07: Subzone-Filter Dropdown — PASS

- Dropdown: "Alle Subzonen" (default), "To Delete", "Keine Subzone" ✅
- Filter "To Delete" gewaehlt → nur "To Delete" Accordions sichtbar ✅
- "Gefiltert" Badge erscheint ✅ (Screenshot S46)
- Zuruecksetzen auf "Alle Subzonen" → alle Accordions wieder sichtbar ✅

### V-ML2-08: Subzone-Eingabefeld entfernt? — PASS

- Kein Textfeld mit Check/X Buttons in Accordions ✅
- Kein "+ Subzone hinzufuegen" Button ✅
- Monitor ist korrekt readonly

### V-ML2-09: SHT31 Duplikat-Check — PASS

- 2 SensorCards fuer SHT31 (genau 2, nicht 4) ✅
- DB: 2 sensor_configs (sht31_temp + sht31_humidity) ✅
- Kein Duplikat-Bug (B1 scheint nicht mehr zu existieren fuer physischen ESP)

### V-ML2-10: Link Monitor → Hardware — PASS

- "Hardware-Konfiguration" Link im Zone-Header → `/hardware/echter_esp` ✅
- "In der Uebersicht anzeigen" Link in Breadcrumb → `/hardware/echter_esp` ✅
- Beide Links navigieren zur korrekten Zone

### V-ML2-11: Layout-Gesamtqualitaet — PASS

- Cards volle Breite innerhalb Content-Bereich ✅
- Konsistente Abstande zwischen Sektionen ✅
- Accordion-Headers klar gestylt mit Chevron ✅
- Text lesbar, kein Overflow ✅
- Sektionen (Sensoren, Aktoren, Regeln, Dashboards) gut getrennt ✅
- Sidebar mit Cross-Zone Temperatur-Vergleich ✅

### V-ML2-12: Cross-View Subzone-Konsistenz — PASS

- MonitorView L2 == ESPSettingsSheet Gruppierung ✅
- "To Delete": Nur Luftbefeuchter (GPIO 27 via assigned_gpios) ✅
- "Keine Subzone": Beide SHT31 Sensoren (GPIO 0, I2C) ✅
- DB ist Ground Truth, beide Views stimmen ueberein ✅

---

## Gesamt: 18/24 PASS (+5 PARTIAL, +1 FAIL)

| Block | PASS | PARTIAL | FAIL | SKIP | Total |
|-------|------|---------|------|------|-------|
| V-LM | 2 | 1 | 1 | 0 | 4 |
| V-ML1 | 7 | 1 | 0 | 0 | 8 |
| V-ML2 | 10 | 2 | 0 | 0 | 12 |
| **Gesamt** | **19** | **4** | **1** | **0** | **24** |

---

## Findings (priorisiert)

### HIGH

**F-H1: heartbeat_handler.py timeout=10.0 statt 15.0**
- **Datei:** `El Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py`
- **Zeilen:** 1368, 1402
- **IST:** `timeout=10.0`
- **SOLL:** `timeout=MQTTCommandBridge.DEFAULT_TIMEOUT` oder `timeout=15.0`
- **Auswirkung:** Loki zeigt `timeout=10.0s` in ACK-Timeout-Warnings. Fix-M war unvollstaendig.
- **Fix:** 2 Zeilen aendern, kein Seiteneffekt

**F-H2: Persistente Zone-ACK-Timeouts alle 2 Minuten**
- Loki: `ACK timeout for ESP_472204 zone` alle 2 Min seit Stunden
- Ursache: Heartbeat-Handler versucht Zone-State-Push, ESP ACKt nie
- Moeglicherweise: ESP-Firmware implementiert kein Zone-ACK, oder MQTT-Topic nicht korrekt
- **Empfehlung:** Untersuchen warum ESP_472204 nie Zone-ACK sendet

### MEDIUM

**F-M1: SHT31 SensorCards nicht unterscheidbar**
- Beide Cards heissen "Temp&Hum" — Nutzer muss Wert/Einheit lesen
- DB `sensor_name` ist "Temp&Hum" fuer beide Siblings
- **IST:** "Temp&Hum" + "Temp&Hum"
- **SOLL:** "Temp&Hum (Temperatur)" + "Temp&Hum (Feuchtigkeit)" oder UI zeigt sensor_type

### LOW

**F-L1: Empty State (L1) ohne Link zu HardwareView**
- "Keine Zonen vorhanden." — nur Text, kein Call-to-Action
- **SOLL:** Button "Zonen in der Hardware-Ansicht erstellen" → `/hardware`

**F-L2: Stale-Visualisierung auf SensorCards unzureichend**
- Timestamp "vor 10 Stunden" in Orange ist einziger Hinweis
- "OK" Quality-Badge bleibt gruen trotz 10h Stale-Daten
- Card selbst hat keine reduzierte Opacity oder Warning-Border
- Detail-View hat `.sensor-detail__stale-badge` — Card-View nicht

### Bekannte Roadmap-Items (bestaetigt)

- [x] P2: Accordion Smart-Defaults — **implementiert** (Code vorhanden, ≤4 = alle offen)
- [x] P3: Link Monitor → Hardware — **vorhanden** (2 Links: Header + Breadcrumb)
- [ ] P4: PWM-Badge auf ActuatorCard — **nicht testbar** (kein PWM-Aktor vorhanden)
- [x] U3: Sparkline — **vorhanden** (Mini-Charts in SensorCards)
- [x] U9: Aggregationszeile 0-Werte — **korrekt** (keine 0er in Aggregation)
- [x] U10: Timestamps auf SensorCards — **alle vorhanden** ("vor 10 Stunden")
- [x] B1: SHT31 Duplikate — **nicht vorhanden** (genau 2 Cards fuer physischen ESP)
- [x] B2: Subzone-Eingabefeld — **entfernt** (kein Input im Monitor)
- [ ] F4: ActuatorCard informativ — **minimal** (Name + Typ + Bedient + Aus)

---

## Screenshots

| Nr | Datei | Inhalt |
|----|-------|--------|
| S01 | S01-HardwareView-L1.png | HardwareView Ausgangszustand |
| S02 | S02-ESPSettingsSheet-SubzoneGruppierung.png | Settings Sheet Oberteil |
| S02b | S02b-ESPSettingsSheet-GeraeteNachSubzone.png | Geraete nach Subzone Sektion |
| S03 | S03-MonitorView-L2-ZeltWohnzimmer.png | Monitor L2 Vollansicht |
| S10 | S10-MonitorView-L1-Vollansicht.png | Monitor L1 mit Zone-Tiles |
| S23 | S23-ZoneTile-FocusVisible.png | Focus-Visible Outline auf Tile |
| S30 | S30-MonitorView-L2-Vollansicht.png | Monitor L2 Detail-Ansicht |
| S46 | S46-SubzoneFilter-ToDelete.png | Subzone-Filter aktiv |
| S70 | S70-MonitorL1-Endzustand.png | Endzustand == Ausgangszustand |

---

## Naechster Schritt

1. **Fix-Auftrag F-H1:** heartbeat_handler.py timeout=10.0 → 15.0 (2 Zeilen, trivial)
2. **Investigate F-H2:** Warum ACKt ESP_472204 nie auf Zone-Push? (ESP-Firmware oder MQTT-Topic)
3. **Fix-Auftrag F-M1:** SHT31 sensor_name Differenzierung (DB oder UI-Suffix)
4. **Backlog F-L1+F-L2:** Empty State Link + Stale Card Visualisierung (Phase 1 Roadmap)
5. **Monitor-Editor Phase 3+4** kann fortgesetzt werden — MonitorView ist funktional stabil
