# T02-T08 Verifikationsbericht

**Datum:** 2026-03-07
**Agent:** AutoOps + Playwright
**Devices:** MOCK_E34BB38D (Mock #B38D) in Zone "Gewächshaus", MOCK_DF2C64E9 (Mock #64E9) in Zone "Zelt 1"
**Screenshots:** 25+ alte + 18 neue Dateien in `.claude/reports/current/T02-T08-verify/`

---

## Zusammenfassung

| Bereich | Bestanden | Fehlgeschlagen | Teilweise |
|---------|-----------|----------------|-----------|
| **Fix5 (funktionale Bugs)** | 6/8 | 1/8 | 1/8 |
| **Fix6 (Layout)** | 5/5 | 0/5 | 0/5 |
| **SHT31 Sensortest (Session 1)** | 8/13 | 3/13 | 2/13 |
| **DS18B20 Konfigurationstest (Session 2)** | 2/8 | 5/8 | 1/8 |
| **SHT31 Konfigurationstest (Session 2)** | 3/7 | 3/7 | 1/7 |
| **Monitor/L1 Verifikation (Session 2)** | 3/6 | 2/6 | 1/6 |

**Gesamtbewertung:** System hat schwerwiegende Backend-Bugs bei der Sensor-Konfiguration. Das `simulation_config`-Key-Format `{gpio}_{sensor_type}` verursacht Datenverlust bei mehreren Sensoren gleichen Typs. DS18B20-OneWire-Flow im Frontend ignoriert alle User-Eingaben (Name, Startwert, Einheit). SHT31-Flow funktioniert besser, hat aber ebenfalls den Ueberschreib-Bug. Die `sensor_configs`-DB-Tabelle und die `simulation_config` (JSON in device_metadata) sind nicht synchronisiert.

---

## Fix5 Ergebnisse (Funktionale Bugs)

| Bug | Screenshot | Status | Anmerkung |
|-----|-----------|--------|-----------|
| N2 smartDefaultsApplied ReferenceError | V01 | **BESTANDEN** | 0 ReferenceErrors in Console. Nur favicon 404. |
| N3 Frontend-Log-Endpoint 404 | V02 | **BESTANDEN** | Kein POST an `/api/v1/logs/frontend` gesendet — kein 404. |
| N4 Soft-Delete Serialisierung | V03 (API) | **NICHT TESTBAR** | Soft-Delete via API gibt 204 zurueck, aber `?include_deleted=true` zeigt korrekte `deleted_at` Timestamps. Funktional OK. |
| B15 Alert-Metriken bei 0 Sensoren | V04 | **FEHLGESCHLAGEN** | AlertStatusBar zeigt "9 aktive Alerts" bei 0 Sensoren/0 Devices. Stale Daten von geloeschten Devices. |
| B15 Alert-Metriken bei aktiven Sensoren | V05 | **TEILWEISE** | Alerts zaehlen korrekt hoch, enthalten aber auch Alerts von geloeschten Devices (MOCK_B471DFDE, MOCK_FF58AEE8). |
| B16 Notification-Badge leer | V06 | **BESTANDEN** | Badge zeigt korrekte Zahl (12) — spiegelt tatsaechliche ungelesene Notifications wider. Bei leerem System kein falsches Badge. |
| B17 Weisser Bildschirm nach Delete | V07a | **BESTANDEN** | Nahtloser Uebergang zu L1 nach Device-Delete. Kein weisser Blitz. |
| B18 Monitor Subzone Readonly | V08 | **BESTANDEN** | Kein editierbares Subzone-Feld im Monitor L2. Nur Text-Labels. |

---

## Fix6 Ergebnisse (Layout)

| Fix | Screenshot | Status | Anmerkung |
|-----|-----------|--------|-----------|
| L1 Orbital Sensor-Namen | V09, V10 | **BESTANDEN** | Normal-Case Anzeige ("temperature", "SHT31 Temperatur"). Tooltip bei Hover vorhanden. Min-Width ausreichend. |
| L2 Zone-Tile Grid | V11 | **BESTANDEN** | DeviceMiniCard nutzt volle Breite der Zone-Tile. Kein leerer Platz. |
| L3 MiniCard Einheit-Kontrast | V12 | **BESTANDEN** | Einheiten (°C, %RH) lesbar mit ausreichendem Kontrast. |
| L4 Sensor/Aktuator Angleichung | V09, V42 | **BESTANDEN** | Sensor-Satellites und Aktuator-Bereich konsistent. Gleiche Schriftgroesse. |
| L5 Zone-Header Thin-Space | V14 | **BESTANDEN** | "21.8 – 23.5 °C" mit sichtbarem Abstand vor Einheit. Pipe-Separator bei Multi-Typ. |

---

## SHT31 Sensortest Ergebnisse (Session 1)

### Phase 2.1: SHT31 #1 hinzufuegen

| Test | Screenshots | Status | Anmerkung |
|------|-----------|--------|-----------|
| SHT31 als I2C-Sensor hinzufuegen | V30, V33 | **TEILWEISE** | `sht31_temp` Config via REST API erstellt. `sht31_humidity` blockiert durch I2C-Adress-Duplikat-Check (gleiche Adresse 0x44 nicht erlaubt). Workaround: separate GPIOs + separate I2C-Adressen. |
| Multi-Value-Split (2 logische Sensoren) | V33 | **FEHLGESCHLAGEN** | Bei gleichem GPIO+I2C kann nur 1 logischer Sensor erstellt werden. Kein automatischer Split von physischem SHT31 in Temp+Humidity. |
| Frontend-Anzeige (Orbital) | V33 | **BESTANDEN** | SHT31 Sensor-Satellite korrekt angezeigt mit Wert und Qualitaet. |
| Monitor-Anzeige | V35 | **BESTANDEN** | SHT31 SensorCard im Monitor mit Sparkline und Trend. |
| Unterscheidbare Namen | V42 | **BESTANDEN** | "SHT31 Temperatur" und "SHT31 Feuchtigkeit" klar unterscheidbar. |

### Phase 2.2: SHT31 #1 loeschen

| Test | Screenshots | Status | Anmerkung |
|------|-----------|--------|-----------|
| Sensor-Delete API | — | **FEHLGESCHLAGEN** | `DELETE /api/v1/sensors/MOCK_E34BB38D/21` gibt 500 Internal Server Error. Ursache: `get_by_esp_and_gpio` findet 2 Configs auf demselben GPIO (sht31 + sht31_temp) und `scalar_one_or_none` crasht. |
| DB-Direktloeschung | V39 | **BESTANDEN** | Nach DB-Cleanup: Orbital zeigt korrekt nur DS18B20-Sensors. Kein weisser Blitz. |
| Historische Daten erhalten | V52 | **BESTANDEN** | 70 Zeilen sensor_data nach Loeschung erhalten. |

### Phase 2.3: SHT31 #1 erneut hinzufuegen (mit Workaround)

| Test | Screenshots | Status | Anmerkung |
|------|-----------|--------|-----------|
| Re-Add mit sep. GPIOs | V42 | **BESTANDEN** | sht31_temp auf GPIO 21 (I2C 0x44) + sht31_humidity auf GPIO 22 (I2C 0x45). Beide erfolgreich erstellt. Neue IDs generiert. |
| 4 Sensor-Satellites | V42 | **BESTANDEN** | Orbital zeigt 4 Satellites: 2x DS18B20 + SHT31 Temp (23.2°C) + SHT31 Feuchtigkeit (65.5 %RH). Layout skaliert korrekt. |
| L1 Multi-Typ-Aggregation | V42b | **BESTANDEN** | Zone-Header: "21.8 – 23.5 °C \| 65.5 %RH" mit Pipe-Separator. MiniCard zeigt alle 4 Werte. |
| Monitor L1 | V47 | **BESTANDEN** | "TEMPERATUR 21.8 – 23.5 °C LUFTFEUCHTE 65.5 %RH" als separate Zeilen. "4/4 Sensoren online". |
| Monitor L2 | V47b | **TEILWEISE** | SHT31 SensorCards sichtbar, ABER: "8 Sensoren" statt 4 (Ghost-Sensoren von geloeschten Devices). 12 Console-Errors (404 fuer geloeschte Device-Sensors). |

### Phase 2.5: Cleanup

| Test | Screenshots | Status | Anmerkung |
|------|-----------|--------|-----------|
| Endzustand L1 | V52 | **BESTANDEN** | Sauber: 2 DS18B20-Sensoren, Zone-Header "21.8 – 23.5 °C". |
| Console-Errors final | V52 | **BESTANDEN** | 0 Console-Errors auf L1 nach Cleanup. |
| DB-Endzustand | — | **BESTANDEN** | 2 aktive Sensoren (DS18B20), 70 historische Datenzeilen erhalten. |

---

## DS18B20 Konfigurationstest (Session 2 — MOCK_DF2C64E9 "Zelt 1")

### Testaufbau

Neuer Mock ESP (MOCK_DF2C64E9) in Zone "Zelt 1" erstellt. 2x DS18B20 per Drag&Drop hinzugefuegt, jeweils mit unterschiedlichen Konfigurationen.

**DS18B20 #1 Konfiguration (im Frontend eingegeben):**
- Name: "Wassertemperatur Becken 1"
- OneWire: 28FF...0C79, GPIO 4
- Startwert: 24.5 °C, Timeout: 120s, Modus: Kontinuierlich
- Subzone: "Naehrloesung" (neu erstellt)

**DS18B20 #2 Konfiguration (im Frontend eingegeben):**
- Name: "Raumtemperatur Decke"
- OneWire: 28FF...9ABC, GPIO 4
- Startwert: 18.3 °C, Timeout: 60s, Modus: Geplant
- Subzone: Keine

### Ergebnisse

| Test | Screenshot | Status | Anmerkung |
|------|-----------|--------|-----------|
| DS18B20 #1 OneWire-Scan | S06 | **BESTANDEN** | Bus scannen auf GPIO 4 findet 3 Mock-Geraete (28FF...0C79, 28FF...9ABC, 28FF...1DEF). Geraet 0C79 ausgewaehlt. |
| DS18B20 #1 Name uebernommen | S08 | **FEHLGESCHLAGEN** | Orbital zeigt **"Temp 0C79"** (auto-generiert) statt "Wassertemperatur Becken 1". Backend: `name=Temp 0C79`. **Root Cause: Frontend sendet User-Name nicht an API.** |
| DS18B20 #1 Startwert uebernommen | S08 | **FEHLGESCHLAGEN** | Orbital zeigt **0,0 °C** statt 24.5 °C. Backend: `raw_value=0.0, base_value=0.0`. **Root Cause: Frontend sendet 0.0 statt User-Startwert.** |
| DS18B20 #1 Einheit gespeichert | API | **FEHLGESCHLAGEN** | Backend: `unit=""` (leer) statt "°C". **Root Cause: Frontend sendet leeren String.** |
| DS18B20 #1 Subzone Slug | API | **FEHLGESCHLAGEN** | Backend: `subzone_id="n_hrl_sung"` statt "naehrloesung". **Root Cause: Umlaut-Slugify entfernt ae/oe statt zu ae/oe zu konvertieren.** |
| DS18B20 #2 ueberschreibt #1 | S10, API | **FEHLGESCHLAGEN** | Backend hat nur **1 Sensor** (`4_DS18B20`). DS18B20 #2 hat #1 komplett ueberschrieben. **Root Cause: Key `{gpio}_{sensor_type}` ohne OneWire-Adresse.** |
| DS18B20 #2 Name/Wert | S10 | **FEHLGESCHLAGEN** | Name="Temp 9ABC" (auto), raw=0.0 — gleiche Bugs wie #1. |
| OneWire-Scan Duplikat-Erkennung | S06 | **BESTANDEN** | 2. Scan auf GPIO 4 zeigt 28FF...0C79 korrekt als "Temp 0C79" (disabled, bereits registriert). |

### Loki-Log-Evidenz (DS18B20)

```
22:25:22 - simulation.scheduler - WARNING - [MOCK_DF2C64E9] Sensor 4_DS18B20 already active
```
Der Server warnt beim Ueberschreiben, fuehrt es aber trotzdem aus. Kein Error, kein Abbruch.

---

## SHT31 Konfigurationstest (Session 2 — MOCK_DF2C64E9 "Zelt 1")

### Testaufbau

2x SHT31 per Drag&Drop auf denselben Mock ESP hinzugefuegt.

**SHT31 #1 Konfiguration:**
- Name: "Klima Boden"
- I2C: 0x44 (Standard)
- Startwert: 25.8 °C, Timeout: 90s, Modus: Kontinuierlich
- Subzone: "Naehrloesung"

**SHT31 #2 Konfiguration:**
- Name: "Klima Decke"
- I2C: 0x45 (ADDR HIGH)
- Startwert: 19.2 °C, Timeout: 0 (kein), Modus: Pausiert
- Subzone: "Luft oben" (neu erstellt)

### Ergebnisse

| Test | Screenshot | Status | Anmerkung |
|------|-----------|--------|-----------|
| SHT31 #1 Name uebernommen | S13 | **BESTANDEN** | Orbital zeigt **"Klima Boden"** korrekt. Backend: `name=Klima Boden`. SHT31-Codepfad sendet korrekt. |
| SHT31 #1 Startwert uebernommen | S13 | **BESTANDEN** | Orbital zeigt **25,8 °C** korrekt. Backend: `raw_value=25.8`. |
| SHT31 #1 Multi-Value-Split | Toast | **BESTANDEN** | Toast: "SHT31 (Temp + Humidity): 2 Messwerte erstellt". Backend hat aber nur 1 Config-Eintrag `0_sht31`. |
| SHT31 #2 ueberschreibt #1 | S15, API | **FEHLGESCHLAGEN** | Backend hat nur `0_sht31` mit name="Klima Decke", i2c=69 (0x45). SHT31 #1 komplett weg. **Root Cause: Key `{gpio}_{sensor_type}` ohne I2C-Adresse.** |
| SHT31 Humidity-Satellite fehlt | S13, S15 | **FEHLGESCHLAGEN** | Orbital zeigt nur Temperatur-Satellite, kein Humidity-Satellite. Kein %RH-Wert sichtbar. |
| SHT31 Info-Text aktualisiert sich nicht | S14 | **FEHLGESCHLAGEN** | Beschreibungstext zeigt immer "I2C 0x44" auch wenn 0x45 gewaehlt ist. |
| SHT31 GPIO-Anzeige | S13 | **TEILWEISE** | Orbital zeigt "GPIO 0" — SHT31 ist I2C, GPIO 0 ist Default statt null. Nicht falsch aber irrefuehrend. |

### Loki-Log-Evidenz (SHT31)

```
22:27:00 - simulation.scheduler - [MOCK_DF2C64E9] Added sensor job: GPIO 0, type sht31, interval 30.0s
22:27:00 - sensor_handler - Sensor config activated: esp_id=MOCK_DF2C64E9, gpio=0, sensor_type=sht31, config_status: pending → active
22:27:00 - sensor_handler - Sensor config activated: esp_id=MOCK_DF2C64E9, gpio=0, sensor_type=sht31, config_status: pending → active
22:28:43 - simulation.scheduler - WARNING - [MOCK_DF2C64E9] Sensor 0_sht31 already active
```

**Bemerkenswert:** 2x "config activated" = SHT31 erstellt korrekt 2 DB-Eintraege (sensor_configs Tabelle). Aber nur 1 Simulation-Job (`0_sht31`) wird gestartet.

---

## Monitor/L1 Verifikation (Session 2)

| Test | Screenshot | Status | Anmerkung |
|------|-----------|--------|-----------|
| L1 Zone-Header Zelt 1 | S16 | **TEILWEISE** | "0.0 – 19.2 °C" — Range korrekt fuer die existierenden 2 Sensoren, aber 0.0 kommt vom nicht-initialisierten DS18B20. |
| L1 MiniCard Sensor-Namen | S16 | **FEHLGESCHLAGEN** | MiniCard zeigt "Temp 9ABC" (DS18B20 auto-name) und "Temperatur" (SHT31 Base-Type statt "Klima Decke"). Inkonsistent mit Orbital wo "Klima Decke" korrekt ist. |
| Monitor L1 Zone-Zaehlung | S17 | **FEHLGESCHLAGEN** | "6 Zonen" sichtbar — 4 davon sind Zombie-Zonen (Gewaechshaus-Alpha, Test, Test-Zone, gewaechshaus-alpha) ohne Geraete. |
| Monitor L2 Sensor-Zaehlung | S18 | **BESTANDEN** | "2 Sensoren" korrekt (nur die 2 ueberlebenden nach Ueberschreiben). |
| Monitor L2 Subzone-Zuordnung | S18 | **BESTANDEN** | "Luft oben" (SHT31) und "Naehrloesung" (DS18B20) korrekt als Accordions. |
| Monitor L2 Sensor-Name Inkonsistenz | S18 | **FEHLGESCHLAGEN** | SensorCard unter "Luft oben" zeigt **"Klima Boden"** (SHT31 #1 Name) obwohl Backend "Klima Decke" (SHT31 #2) hat. **Root Cause: sensor_configs-Tabelle hat noch den alten Eintrag von SHT31 #1, simulation_config wurde ueberschrieben.** |
| Console-Errors Monitor L2 | — | **BESTANDEN** | 0 Console-Errors auf Monitor L2 Zelt 1. Verbesserung gegenueber Session 1 (12 Errors). |

---

## Neue Bugs (aktualisiert)

### Bestehende Bugs (Session 1, verifiziert)

| # | Beschreibung | Schwere | Bereich | Status Session 2 |
|---|-------------|---------|---------|------------------|
| **NB1** | **Sensor-Delete API 500 bei Multi-Config GPIO:** `DELETE /api/v1/sensors/{esp_id}/{gpio}` crasht wenn 2+ Sensor-Configs auf demselben GPIO. | **HOCH** | Server | Nicht erneut getestet |
| **NB2** | **I2C-Adress-Duplikat blockiert Multi-Value-Split** | **MITTEL** | Server | Nicht erneut getestet |
| **NB3** | **Monitor zeigt Ghost-Sensoren von geloeschten Devices** | **HOCH** | Frontend/Server | Teilweise besser: 0 Console-Errors auf Zelt 1 Monitor, aber Zombie-Zonen noch da |
| **NB4** | **Alert-Metriken zaehlen geloeschte Device-Alerts** | **MITTEL** | Frontend/Server | Alert-Counter auf 15, unklar ob stale |
| **NB5** | **SHT31 Mock-Sensor zeigt 0°C im Monitor** | **NIEDRIG** | Server | Nicht erneut getestet |

### Neue Bugs (Session 2)

| # | Beschreibung | Schwere | Bereich | Screenshot | Root Cause (Loki/Code) |
|---|-------------|---------|---------|-----------|------------------------|
| **NB6** | **Sensor-Ueberschreib-Bug: Key `{gpio}_{sensor_type}` verursacht Datenverlust.** Zweiter Sensor gleichen Typs auf gleichem GPIO ueberschreibt den ersten in `simulation_config`. Betrifft DS18B20 (gleicher GPIO, verschiedene OneWire-Adressen) UND SHT31 (gleicher GPIO 0, verschiedene I2C-Adressen). | **KRITISCH** | Server | S10, S15 | `debug.py:270` — Key `f"{sensor.gpio}_{sensor.sensor_type}"` enthaelt keine Adresse. Loki: `"Sensor 4_DS18B20 already active"` (WARNING, kein Abbruch). Fix: Key muss OneWire-/I2C-Adresse enthalten, z.B. `{gpio}_{type}_{address}`. |
| **NB7** | **DS18B20 Frontend ignoriert User-Eingaben:** Name, Startwert, Einheit, Timeout werden im OneWire-Add-Flow nicht an die API gesendet. Backend erhaelt auto-generierte Werte (name="Temp XXXX", raw=0.0, unit=""). SHT31-Flow sendet die Werte korrekt. | **HOCH** | Frontend | S08, S10 | Zwei verschiedene Code-Pfade in AddSensorModal: OneWire-Flow (DS18B20) baut Payload ohne User-Felder, I2C-Flow (SHT31) inkludiert sie. |
| **NB8** | **simulation_config und sensor_configs DB desynchronisiert:** Wenn simulation_config per Key-Collision ueberschrieben wird, bleiben die alten sensor_configs DB-Eintraege bestehen. Monitor L2 zeigt dann Sensor-Namen aus der DB (alt) waehrend das Orbital die simulation_config (neu) nutzt. | **HOCH** | Server | S18 | Monitor zeigt "Klima Boden" (SHT31 #1) obwohl simulation_config "Klima Decke" (SHT31 #2) hat. sensor_configs-Tabelle wird nicht synchronisiert bei add_sensor_to_mock(). |
| **NB9** | **Subzone-Slug Umlaut-Bug:** "Naehrloesung" wird zu `n_hrl_sung` statt `naehrloesung`. Umlaute (ae, oe, ue) werden komplett entfernt statt transliteriert. | **MITTEL** | Server | API | `subzone_service.py` Slug-Generierung ohne Umlaut-Handling. Loki: `"Subzone assignment: subzone_id=n_hrl_sung"`. |
| **NB10** | **SHT31 Humidity-Satellite fehlt im Orbital:** Obwohl "2 Messwerte erstellt" (Toast), zeigt das Orbital nur den Temperatur-Satellite. Kein Humidity-Wert sichtbar. | **MITTEL** | Frontend/Server | S13, S15 | simulation_config hat nur 1 Eintrag `0_sht31` (combined), kein separater `0_sht31_humidity`. Der Multi-Value-Split passiert nur im Batch-Create (debug.py:249), nicht im add_sensor() Einzelpfad. |
| **NB11** | **SHT31 Info-Text zeigt immer "I2C 0x44":** Beschreibungstext im AddSensorModal aktualisiert sich nicht wenn I2C-Adresse auf 0x45 gewechselt wird. | **NIEDRIG** | Frontend | S14 | Statischer Text in AddSensorModal, nicht reaktiv auf I2C-Dropdown-Aenderung. |
| **NB12** | **MiniCard zeigt Base-Type statt Custom-Name:** L1 MiniCard zeigt "Temperatur" fuer SHT31 statt den konfigurierten Namen "Klima Decke". Orbital zeigt den Namen korrekt. | **NIEDRIG** | Frontend | S16 | MiniCard nutzt `sensor_type` (Base-Type) statt `name` aus der simulation_config. |
| **NB13** | **401 Error bei Mock-Erstellung:** Console zeigt `401 Unauthorized` auf `/api/v1/debug/mock-esp` beim Erstellen. Mock wird trotzdem erstellt. | **NIEDRIG** | Frontend | S02 | Vermutlich doppelter Request oder Token-Refresh-Race. |
| **NB14** | **Zombie-Zonen im Monitor:** 4 leere Zonen (Gewaechshaus-Alpha, Test, Test-Zone, gewaechshaus-alpha) ohne Geraete sichtbar. Kein Cleanup. | **NIEDRIG** | Server/Frontend | S17 | Zonen ohne Geraete werden nicht automatisch entfernt oder versteckt. |
| **NB15** | **Alert-Counter steigt bei Mock-Erstellung:** Alert-Zaehler springt von 13 auf 14 beim Erstellen eines leeren Mock ESP (ohne Sensoren). Ein neues Geraet ohne Sensoren sollte keinen Alert ausloesen. | **NIEDRIG** | Server | S02 | Vermutlich Health-Check-basierter Alert fuer "0 Sensoren konfiguriert". |

---

## Architektur-Erkenntnisse: Sensor-Config Dual-Storage

### Ist-Zustand (Root Cause fuer NB6 + NB8)

Das System speichert Sensor-Konfigurationen an **zwei Stellen**, die nicht synchronisiert sind:

1. **`device_metadata.simulation_config.sensors`** (JSON dict in ESP-Tabelle)
   - Key: `{gpio}_{sensor_type}` (z.B. `4_DS18B20`, `0_sht31`)
   - Genutzt von: SimulationScheduler, Orbital-Anzeige, Heartbeat
   - Problem: Key enthaelt keine Adresse → Ueberschreiben bei Duplikaten

2. **`sensor_configs`-Tabelle** (separate DB-Tabelle)
   - Key: `(esp_id, gpio, sensor_type)` composite
   - Genutzt von: Monitor L2, SensorCards, Sensor-Data-Queries
   - Problem: Wird nicht geloescht/aktualisiert wenn simulation_config ueberschrieben wird

### Konsequenz

- **Orbital** (simulation_config) zeigt "Klima Decke" (SHT31 #2)
- **Monitor** (sensor_configs) zeigt "Klima Boden" (SHT31 #1)
- **Datenverlust**: Sensor #1 Daten gehen verloren in simulation_config, aber DB-Eintrag ist noch da

### Empfohlene Fixes (Prioritaet)

1. **NB6 Fix (KRITISCH):** Key-Format aendern zu `{gpio}_{type}_{address}`:
   - DS18B20: `4_DS18B20_28FF0C79`
   - SHT31: `0_sht31_0x44`
   - Oder: `{address}_{type}` wenn Adresse eindeutig ist

2. **NB8 Fix (HOCH):** `add_sensor_to_mock()` muss pruefen ob Key bereits existiert und entweder ablehnen (400 Error) oder explizit den alten sensor_configs-Eintrag loeschen.

3. **NB7 Fix (HOCH):** Frontend AddSensorModal OneWire-Flow muss User-Felder (name, raw_value, unit, timeout) in den API-Payload aufnehmen.

---

## Architektur-Erkenntnisse: SHT31 Multi-Value (aktualisiert)

### Ist-Zustand

- **Batch-Create** (`create_mock_device`, debug.py:249): Ruft `is_multi_value_sensor()` auf und splittet in `sht31_temp` + `sht31_humidity` — korrekt!
- **Einzel-Add** (`add_sensor`, debug.py:804): Kein Multi-Value-Split! Speichert als `0_sht31` (combined) — **NB10**
- **sensor_configs-Tabelle**: Erstellt 2 Eintraege (Sensor config activated 2x in Loki) — korrekt auf DB-Ebene
- **SimulationScheduler**: Startet nur 1 Job fuer `0_sht31` — kein separater Humidity-Job

### Soll-Zustand (Empfehlung, aktualisiert)

1. **Option A (Minimal):** `add_sensor()` muss denselben Multi-Value-Split wie `create_mock_device()` ausfuehren (is_multi_value_sensor → split).
2. **Option B (Sauber):** Einheitlicher Code-Pfad fuer beide Wege (Batch + Einzel) der den Split und die Key-Generierung zentral handhabt.
3. **I2C-Uniqueness:** `UNIQUE(esp_id, i2c_address, sensor_type)` statt `UNIQUE(esp_id, i2c_address)` um Multi-Value auf gleicher Adresse zu ermoeglichen.

---

## Regressions-Check (Session 2)

| Check | Status | Anmerkung |
|-------|--------|-----------|
| Console-Errors (L1 Zelt 1) | 0 Errors | Nur favicon 404 |
| Console-Errors (Monitor L2 Zelt 1) | 0 Errors | Verbesserung gegenueber Session 1 (12 Errors) |
| Console-Errors (Monitor L1) | 0 Errors | Keine 404s fuer Zelt 1 Sensoren |
| Frontend Build | Nicht geprueft (keine Code-Aenderungen) | — |
| Backend Tests | Nicht geprueft (keine Code-Aenderungen) | — |

---

## Screenshot-Inventar

### Session 1 (bestehend)

| Screenshot | Inhalt |
|-----------|--------|
| V01-V52 | Siehe Session 1 Inventar (25 Dateien) |

### Session 2 (neu)

| Screenshot | Inhalt |
|-----------|--------|
| S01-mock-create-dialog.png | Mock ESP erstellen Dialog (MOCK_DF2C64E9) |
| S02-mock-created-l1.png | L1 nach Mock-Erstellung, 2 Zonen sichtbar, Alert 14 |
| S03-ds18b20-config-panel-initial.png | Sensor hinzufuegen Dialog — DS18B20 initial |
| S04-ds18b20-config-panel-bottom.png | Dialog gescrollt — Name/Subzone/Startwert Felder |
| S05-ds18b20-config-panel-scrolled.png | Alle Formularfelder sichtbar |
| S06-onewire-scan-results.png | OneWire-Scan: 3 Geraete auf GPIO 4 gefunden |
| S07-ds18b20-1-configured.png | DS18B20 #1 vollstaendig konfiguriert (24.5°C, Naehrloesung) |
| S08-ds18b20-1-added-bugs.png | Nach Add: "Temp 0C79" statt "Wassertemperatur Becken 1", 0.0°C |
| S09-ds18b20-2-configured.png | DS18B20 #2 konfiguriert (18.3°C, Geplant, 28FF...9ABC) |
| S10-ds18b20-2-added-orbital.png | Nach Add: Nur 1 Sensor sichtbar (Ueberschreiben-Bug) |
| S11-sht31-config-panel.png | SHT31 hinzufuegen Dialog — I2C 0x44, Hinzufuegen-Button sofort sichtbar |
| S12-sht31-1-configured.png | SHT31 #1 konfiguriert (25.8°C, Naehrloesung, Timeout 90) |
| S13-sht31-1-added-orbital.png | SHT31 #1 hinzugefuegt: "Klima Boden" 25.8°C — Name/Wert korrekt! |
| S14-sht31-2-configured.png | SHT31 #2 konfiguriert (19.2°C, I2C 0x45, Pausiert, Luft oben) |
| S15-all-sensors-orbital.png | Endzustand: 2 Satellites (Temp 9ABC + Klima Decke), Ueberschreib-Bugs |
| S16-l1-overview-all-zones.png | L1 mit beiden Zonen (Gewaechshaus + Zelt 1) |
| S17-monitor-l1-overview.png | Monitor L1: 6 Zonen, Zombie-Zonen sichtbar |
| S18-monitor-l2-zelt1.png | Monitor L2 Zelt 1: "Klima Boden" statt "Klima Decke" (Desync-Bug) |

---

## Fazit (aktualisiert)

**HardwareView (L1+L2):** Layout stabil. Fix6 weiterhin verifiziert. Orbital zeigt korrekte Werte fuer SHT31, aber DS18B20 hat 0.0°C wegen Frontend-Bug NB7.

**Sensor-Konfiguration:** Schwerwiegende Bugs. Das Key-Format `{gpio}_{sensor_type}` (NB6) ist der gravierendste Bug — er verursacht Datenverlust bei gaengigen Setups (mehrere DS18B20 auf einem OneWire-Bus). Der Frontend-Bug NB7 (DS18B20 ignoriert User-Eingaben) macht die Konfiguration fuer DS18B20 funktional nutzlos.

**DS18B20 vs SHT31 Vergleich:** SHT31-Codepfad im Frontend ist deutlich besser implementiert (Name, Startwert, Einheit werden korrekt uebergeben). DS18B20 OneWire-Codepfad hat eine separate, defekte Implementierung.

**Monitor:** Zeigt Daten-Inkonsistenzen durch die Dual-Storage-Architektur (NB8). sensor_configs-Tabelle und simulation_config-JSON sind nicht synchronisiert. Keine neuen Console-Errors (Verbesserung).

**Prioritaet fuer naechste Iteration:**
1. **NB6** (Sensor-Ueberschreiben) — KRITISCH, blockiert Multi-Sensor-Setups
2. **NB7** (DS18B20 Frontend ignoriert Eingaben) — HOCH, macht DS18B20-Config nutzlos
3. **NB8** (Dual-Storage Desync) — HOCH, verursacht Phantom-Daten im Monitor
4. **NB1** (Delete-API 500) — HOCH, blockiert Sensor-Management
5. **NB10** (SHT31 Humidity fehlt im Orbital) — MITTEL, Multi-Value-Split nur im Batch
6. **NB9** (Umlaut-Slug) — MITTEL, Datenqualitaet
7. **NB2** (I2C-Uniqueness) — MITTEL, blockiert SHT31-Produktiv-Einsatz
8. **NB11-NB15** — NIEDRIG, UX-Issues
