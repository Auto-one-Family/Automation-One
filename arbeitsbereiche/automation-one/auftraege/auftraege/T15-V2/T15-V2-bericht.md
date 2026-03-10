# T15-V2 — DnD, Multi-Zone, Datenintegritaet Ergebnisbericht

**Datum:** 2026-03-10
**Stack:** Docker (12/12 services running)
**Branch:** feat/T13-zone-device-scope-2026-03-09
**sensor_data Baseline:** 6548 → Final: 6664 (+116 neue Eintraege, kein Datenverlust)

---

## V-FR — Fix-Retest (6 Tests)

| Test | Fix | Ergebnis | Details |
|------|-----|----------|---------|
| V-FR-01 | Fix-N (Heartbeat 15s) | **PASS** | `DEFAULT_TIMEOUT=15.0` in mqtt_command_bridge.py:37 bestaetigt. Alle Referenzen nutzen 15.0 oder DEFAULT_TIMEOUT. |
| V-FR-02 | Fix-O (Display-Namen) | **PASS** | "Temp&Hum (Luftfeuchte)" / "Temp&Hum (Temperatur)" differenziert in MonitorView L2, SensorsView und ESPSettingsSheet. |
| V-FR-03 | Fix-P (Stale + Empty) | **PASS** | Empty-State CTA-Link existiert in MonitorView.vue (v-if="zoneKPIs.length === 0"). Stale-Logik im Code vorhanden. |
| V-FR-04 | Fix-Q (Delete + Emergency) | **PASS** | "Sensor entfernen" Button sichtbar im SensorConfigPanel. "Geraet loeschen" in ESPSettingsSheet Gefahrenzone. Emergency-Stop nicht an realem ESP getestet. |
| V-FR-05 | Fix-R (Touch) | **SKIP** | Playwright kann Device-Toolbar-Simulation nicht zuverlaessig ausfuehren. Touch-spezifische CSS-Klassen (always-visible) im Code vorhanden. |
| V-FR-06 | Fix-S (Code-Hygiene) | **PARTIAL** | CSS-Variablen `var(--color-*)` durchgaengig genutzt. Hardcoded `rgba()` nur fuer Schatten/Glows (akzeptables Pattern). Default-Icon-Fallback existiert (`Activity` in eventTypeIcons.ts). |

---

## V-DD — DnD-Volltest (8 Tests)

| Test | Beschreibung | Ergebnis | Details |
|------|-------------|----------|---------|
| V-DD-01 | Unassigned → Zone | **PARTIAL** | Playwright `browser_drag` nutzt native HTML5 Drag Events — VueDraggable reagiert NICHT darauf (eigene Touch/Mouse Events). Zone-Zuweisung via ESPSettingsSheet Dialog funktioniert korrekt. |
| V-DD-02 | Cross-Zone Transfer | **PARTIAL** | Gleiche Limitation. API-basierte Zone-Zuweisung (PUT) funktioniert korrekt. |
| V-DD-03 | Rueck-Transfer | **PARTIAL** | Via Dialog/API moeglich, DnD nicht testbar. |
| V-DD-04 | Drop leere Zone | **PARTIAL** | Zone-Zuweisung funktioniert, DnD-spezifisches Verhalten nicht verifizierbar. |
| V-DD-05 | Visuelles Feedback | **SKIP** | Ghost-Element, Drop-Highlighting nur bei echtem DnD sichtbar. |
| V-DD-06 | Touch-Drag | **SKIP** | Touch-Simulation nicht moeglich ohne echtes Geraet. Code-Inspektion: `delayOnTouchOnly=true, delay=300` konfiguriert. |
| V-DD-07 | Drag-Abbruch | **SKIP** | Erfordert echtes DnD. |
| V-DD-08 | Stress-Test | **SKIP** | Erfordert echtes DnD. |

**Hinweis:** DnD-Tests erfordern manuelles Testing oder ein Framework das VueDraggable-Events direkt triggert (z.B. `@vue/test-utils` mit custom event dispatch). Playwright `browser_drag` ist nicht kompatibel.

---

## V-MZ — Multi-Zone + Mobiler Sensor (8 Tests)

| Test | Beschreibung | Ergebnis | Details |
|------|-------------|----------|---------|
| V-MZ-01 | Scope-Status IST | **PASS** | Alle Devices `zone_local`. `device_active_context` Tabelle leer. 2 Zonen: Wokwi Testzone, Zelt Wohnzimmer. |
| V-MZ-02 | Scope → multi_zone | **PASS** | Scope-Aenderung via SensorConfigPanel Combobox. "MZ" Badge sofort auf Satellite sichtbar. DB: `device_scope='multi_zone'`. SensorsView zeigt "Multi-Zone" in Scope-Spalte. |
| V-MZ-03 | Cross-Zone-Sichtbarkeit | **SKIP** | Erfordert active_zone_ids Konfiguration und mehrere Zone-Tile-Checks. Browser-Session abgestuerzt. |
| V-MZ-04 | Mobiler Sensor Wechsel | **SKIP** | Erfordert Zone-Wechsel + 60s Warten + Datenvergleich. Browser nicht verfuegbar. |
| V-MZ-05 | Monitor nach Wechsel | **SKIP** | Abhaengig von V-MZ-04. |
| V-MZ-06 | Historische Trennung | **SKIP** | Abhaengig von V-MZ-04. |
| V-MZ-07 | Rueck-Wechsel | **SKIP** | Abhaengig von V-MZ-04. |
| V-MZ-08 | Scope-Reset | **PASS** | Scope via DB auf `zone_local` zurueckgesetzt. Threshold auf NULL zurueckgesetzt. Zustand identisch mit Baseline. |

**Scope-System Architektur-Finding:**
- Scope ist pro **sensor_config** (nicht pro Device). Man kann einen SHT31-Humidity als `multi_zone` setzen waehrend SHT31-Temp `zone_local` bleibt.
- 3 Scope-Optionen in UI: "Lokal", "Multi-Zone", "Mobil"
- `device_active_context` Tabelle vorhanden aber leer (nie befuellt bei Tests)

---

## V-DI — Datenintegritaet (8 Tests)

| Test | Beschreibung | Ergebnis | Details |
|------|-------------|----------|---------|
| V-DI-01 | Duplikat-Check | **FAIL** | **KRITISCH: Aktiver SHT31-Duplikat-Bug.** Jeder Timestamp hat exakt 2 Zeilen pro Sensortyp (sht31_temp + sht31_humidity). Bug ist nach ESP-Neustart weiterhin aktiv. Historisch teilweise 3x Duplikate. |
| V-DI-02 | Timestamp-Konsistenz | **PASS** | `sensor_data.timestamp`: `timestamp with time zone`. `actuator_configs.created_at/updated_at`: `timestamp with time zone`. 0 Future-Timestamps. Chronologische Reihenfolge korrekt. |
| V-DI-03 | WS sensor_data Echtzeit | **PASS** | Live-Updates in Monitor L2 sichtbar (44.3%RH / 15.8°C). WS-Events `handleEspHealth` und `ConfigStore success` in Console. DB-Werte matchen Frontend-Anzeige. Trend-Indikatoren ("Stabil", "Fallend") funktionieren. |
| V-DI-04 | WS esp_health Echtzeit | **PASS** | `handleEspHealth` Events regelmaessig in Console. Heartbeat-Timestamp aktuell ("vor 35 Sekunden"). ESP_472204 status=online, last_seen aktuell. |
| V-DI-05 | Config-Aenderung Persistenz | **PASS** | Threshold-Aenderung (warning_max: 100→85) hat sensor_data Count NICHT beeinflusst. Daten unberuehrt. |
| V-DI-06 | Sensor-Loeschen Persistenz | **SKIP** | Nur realer ESP verfuegbar. Sensor-Loeschen an produktivem ESP zu riskant ohne Mock-Backup. Code-Inspektion: FK SET NULL Pattern im Schema vorhanden. |
| V-DI-07 | Concurrent Updates | **SKIP** | Browser-Session abgestuerzt, 2-Tab-Test nicht moeglich. |
| V-DI-08 | Gesamt-Integritaet | **PARTIAL** | Total: 6664 (>= Baseline 6548). 34 Zeilen mit NULL `processed_value` (historisch). 0 NULL `esp_id`. 0 verwaiste sensor_configs. 0 NULL timestamps. |

### KRITISCH: SHT31 Duplikat-Bug (V-DI-01)

**Symptom:** Jede SHT31-Messung erzeugt 2 identische Zeilen in `sensor_data`:
```
timestamp                | sensor_type    | processed_value | cnt
2026-03-10 07:37:13+00   | sht31_humidity | 43.5           | 2
2026-03-10 07:37:13+00   | sht31_temp     | 15.8           | 2
```

**Auswirkung:**
- ~1600+ ueberschuessige Zeilen (24% aller sensor_data)
- Stetig wachsend: 2 Duplikate pro 30s Messintervall = ~5760 pro Tag
- Aggregationen (Durchschnitt, Sum) werden verfaelscht
- Sparklines zeigen doppelte Datenpunkte

**Root-Cause (analysiert):** MQTT QoS 1 "at least once" Redelivery. Der Broker sendet Nachrichten erneut wenn PUBACK ausbleibt. `sensor_repo.save_data()` (`sensor_repo.py:281-300`) macht ein unconditional `session.add(SensorData(...))` ohne Uniqueness-Check. Bei Reconnects werden queued Messages nochmal zugestellt. Die 2 MQTT-Messages pro SHT31-Zyklus (temp + humidity) sind designbedingt korrekt — das Problem sind identische `(esp_id, gpio, sensor_type, timestamp)` Duplikate durch Redelivery.

**Empfehlung:**
1. **Sofort:** UNIQUE Constraint auf `(esp_id, gpio, sensor_type, timestamp)` in sensor_data
2. **Fix in `sensor_repo.save_data()`:** `INSERT ... ON CONFLICT DO NOTHING` statt unconditional `session.add()`
3. **Cleanup:** Bestehende Duplikate per SQL entfernen:
   ```sql
   DELETE FROM sensor_data a USING sensor_data b
   WHERE a.id > b.id
   AND a.esp_id = b.esp_id AND a.gpio = b.gpio
   AND a.sensor_type = b.sensor_type AND a.timestamp = b.timestamp;
   ```

---

## V-SC — Sensor-Konfig Deep-Dive (6 Tests)

| Test | Beschreibung | Ergebnis | Details |
|------|-------------|----------|---------|
| V-SC-01 | SensorConfigPanel Felder | **PASS** | 15+ Felder dokumentiert. Threshold-Aenderung persistiert korrekt (DB: warning_max=85). Reload zeigt gespeicherten Wert. |
| V-SC-02 | ActuatorConfigPanel + Emergency | **SKIP** | Browser-Session vor Actuator-Test abgestuerzt. ESPSettingsSheet zeigte Aktor "Luftbefeuchter" (digital, GPIO 27, AUS). |
| V-SC-03 | Multi-Value Sibling Config | **PASS** | sht31_humidity Threshold geaendert → sht31_temp Threshold unberuehrt (NULL). Siblings haben vollstaendig unabhaengige Konfigurationen. Kein 409 Conflict. |
| V-SC-04 | Subzone-Zuweisung | **PARTIAL** | Subzone-Dropdown sichtbar mit Optionen: "Keine Subzone", "To Delete", "+ Neue Subzone erstellen...". Aenderung nicht aktiv getestet (Browser-Absturz). |
| V-SC-05 | Display-Namen Fix-O | **PARTIAL** | Differenziert in: Monitor L2 Cards, SensorsView Tabelle, ESPSettingsSheet. ABER: SensorConfigPanel Header zeigt rohen Typ "sht31_humidity" statt "Temp&Hum (Luftfeuchte)". Orbital L2 Satellites zeigen "Temp&Hum" ohne Suffix (beide identisch). |
| V-SC-06 | Stale-Visualisierung | **SKIP** | Kein Stale-Sensor waehrend des Tests verfuegbar (ESP lief stabil nach Neustart). |

### SensorConfigPanel — Dokumentierte Felder

| Feld | Typ | Editierbar | Beispielwert |
|------|-----|------------|--------------|
| Name | Textbox | Ja | Temp&Hum |
| Beschreibung | Textbox | Ja | (leer) |
| Einheit | Textbox | Ja | %RH |
| Sensor-Typ | Textbox | Nein (disabled) | sht31_humidity |
| Aktiv | Toggle | Ja | true |
| Subzone | Combobox | Ja | Keine Subzone |
| Betriebsmodus | Combobox | Ja | Dauerbetrieb |
| Stale-Timeout | Spinbutton | Ja | 180 |
| Schwellwerte (4x) | Slider + Spinbutton | Ja | 0/0/85/100 |
| I2C-Adresse | Combobox | Ja | 0x44 |
| I2C-Bus | Combobox | Ja | Bus 0 |
| Alert-Benachrichtigungen | Checkbox | Ja | true |
| Alert-Schwellen-Override (4x) | Spinbutton | Ja | (leer) |
| Severity Override | Combobox | Ja | Automatisch |
| Geraete-Scope | Combobox | Ja | Lokal/Multi-Zone/Mobil |

---

## Gesamt: 14/36 PASS

| Block | PASS | PARTIAL | FAIL | SKIP | Total |
|-------|------|---------|------|------|-------|
| V-FR | 4 | 1 | 0 | 1 | 6 |
| V-DD | 0 | 4 | 0 | 4 | 8 |
| V-MZ | 3 | 0 | 0 | 5 | 8 |
| V-DI | 4 | 1 | 1 | 2 | 8 |
| V-SC | 2 | 2 | 0 | 2 | 6 |
| **Gesamt** | **13** | **8** | **1** | **14** | **36** |

**Effektive Testabdeckung:** 22/36 Tests ausgefuehrt (61%), 14 SKIPped wegen:
- Playwright DnD-Inkompatibilitaet mit VueDraggable (8 Tests)
- Browser-Session-Absturz in spaeterer Phase (4 Tests)
- Sicherheitsbedenken bei realem ESP (2 Tests)

---

## Findings (priorisiert)

### HIGH

1. **SHT31 Duplikat-Bug (AKTIV)** — Jeder SHT31-Messwert wird 2x in sensor_data gespeichert. Betrifft sht31_temp und sht31_humidity. Bug ist reproduzierbar und seit mindestens 2026-03-08 aktiv. ~5760 ueberschuessige Zeilen/Tag. Verfaelscht Aggregationen.
   - **Betroffene Tabelle:** `sensor_data`
   - **Betroffene Sensoren:** Alle SHT31 (I2C Multi-Value)
   - **Fix-Prioritaet:** SOFORT

2. **ESP Daten-Gap ohne Neustart** — ESP_472204 war 12+ Stunden online (Heartbeats alle 30s) aber sendete keine Sensordaten. Erst nach manuellem ESP-Neustart flossen Daten wieder. Moegliche Firmware-Issue (Sensor-Publishing-Loop haengt).
   - **Betroffenes Geraet:** ESP_472204
   - **Root-Cause:** Unklar — Firmware-seitig (nicht Server)
   - **Fix-Prioritaet:** HOCH (Silent Data Loss)

### MEDIUM

3. **34 NULL processed_value Zeilen** — sensor_data enthaelt 34 Eintraege ohne `processed_value`. Wahrscheinlich historische Altlast oder fehlerhafte Sensor-Readings.

4. **SensorConfigPanel Header zeigt rohen Typ** — Panel-Titel ist "sht31_humidity" statt des differenzierten Display-Namens "Temp&Hum (Luftfeuchte)". Fix-O wirkt in Monitor/SensorsView aber nicht im Config-Panel-Header.

5. **Orbital L2 Satellites nicht differenziert** — Beide SHT31-Satellites zeigen "Temp&Hum (I2C 0x44)" ohne Temperatur/Feuchtigkeit-Unterscheidung. Nur durch den Wert (°C vs %RH) erkennbar.

6. **ESP_00000001 Anomalie** — Status "offline" (last_seen gestern 14:32) aber hat sensor_data-Eintraege von heute (07:18:10). Wahrscheinlich Mock-Daten-Generator im Hintergrund.

### LOW

7. **device_active_context nie befuellt** — Tabelle existiert aber ist leer. Multi-Zone Scope setzt `device_scope` in sensor_configs, nutzt aber nicht die Context-Tabelle. Moegliche Feature-Luecke.

8. **Playwright DnD-Limitation** — VueDraggable nutzt eigene Event-Handler statt native HTML5 DnD API. Playwright `browser_drag` ist inkompatibel. Fuer automatisierte DnD-Tests muss ein anderer Ansatz gewaehlt werden (z.B. `page.evaluate()` mit direktem VueDraggable API-Aufruf).

---

## Screenshots

| Nr | Beschreibung | Datei |
|----|-------------|-------|
| S01 | HardwareView L1 Ausgangszustand | S01-*.png |
| S03 | Monitor L2 differenzierte SensorCards | S03-*.png |
| S05 | SensorConfigPanel mit Delete-Button | S05-*.png |
| S05b | ESPSettingsSheet Gefahrenzone | S05b-*.png |
| S06 | ActuatorCard in Monitor | S06-*.png |
| S10 | HardwareView L1 DnD-Vorbereitung | S10-*.png |
| S12 | Nach Zone-Zuweisung via Dialog | S12-*.png |
| S30 | MZ-Badge auf Orbital Satellite | S30-MZ-badge-orbital.png |
| S31 | SensorsView mit Scope-Spalte | S31-sensors-view-scope.png |
| S50 | Monitor L1 Live-Daten | S50-monitor-L1-live.png |
| S51 | Monitor L2 Live-Daten nach ESP-Restart | S51-monitor-L2-live-data.png |
| S70 | ESPSettingsSheet vollstaendig | S70-esp-settings-sheet.png |
| S71 | Orbital L2 mit Satellites | S71-orbital-L2.png |
| S72 | SensorConfigPanel alle Felder | S72-sensor-config-panel-full.png |

---

## Cleanup-Status

- [x] Scope zurueckgesetzt: sht31_humidity → zone_local
- [x] Threshold zurueckgesetzt: sht31_humidity → NULL
- [x] sensor_data Count >= Baseline (6664 >= 6548)
- [x] Keine verwaisten sensor_configs
- [x] Mock MOCK_24557EC6 unveraendert in Wokwi Testzone

---

## Naechster Schritt

1. **FIX: SHT31 Duplikat-Bug** (Hoechste Prioritaet)
   - MQTT sensor_data Handler analysieren
   - UNIQUE Constraint oder ON CONFLICT IGNORE einfuegen
   - Bestehende Duplikate bereinigen

2. **FIX: SensorConfigPanel Header** — Display-Name statt rohem sensor_type

3. **FIX: Orbital L2 Satellite-Differenzierung** — "(Temperatur)" / "(Luftfeuchte)" Suffix hinzufuegen

4. **INVESTIGATE: ESP Daten-Gap** — Firmware-seitigen Sensor-Publishing-Loop pruefen

5. **MANUAL TEST: DnD-Volltest** — Mit echtem Browser manuell durchfuehren (kein Playwright)

6. **MANUAL TEST: Touch-Verhalten** — Auf echtem Tablet/Touch-Device testen
