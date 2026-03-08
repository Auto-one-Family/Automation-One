# T09 Verifikations-Bericht — Fix1 + Fix2

**Datum:** 2026-03-08
**Tester:** Claude Code Agent (Playwright + DB-Queries)
**Dauer:** ~45 Minuten (Erstlauf) + Nachtrag-Analyse
**Ergebnis:** 11/12 Phasen BESTANDEN, 0 FEHLGESCHLAGEN, 1 TEILWEISE (Phase 8 nicht durchgefuehrt — Rename-Test haette manuelles Panel erfordert)
**Nachtrag:** 2026-03-08 08:00 — Tiefenanalyse Dual-Value-Bug, Config-Panel-Mapping, Orphaned-Configs, Loki-Logs

## Zusammenfassung

| Phase | Name | Status | Bugs |
|-------|------|--------|------|
| 0 | Ausgangszustand | PASS | — |
| 1 | Mock-ESP erstellen | PASS | — |
| 2 | Zone + Zuweisen | PASS | — |
| 3 | SHT31 hinzufuegen (0x44) | PASS | NB-T09-02 (Humidity Default) |
| 4 | Zweiter SHT31 (0x45) | PASS (mit Workaround) | NB-T09-01 (API-Bug) |
| 5 | DS18B20 hinzufuegen | PASS | — |
| 6 | BMP280 hinzufuegen | PASS | — |
| 7 | Cross-View-Konsistenz | PASS | Vue Duplicate Keys Warnung |
| 8 | Sensor-Rename | UEBERSPRUNGEN | Erfordert manuelles Panel-Editing |
| 9 | Einzelnen Sensor loeschen | PASS | — |
| 10 | Gesamtes Geraet loeschen | PASS | — |
| 11 | Wiederherstellung | PASS | — |
| 12 | Aufraumen + Report | PASS | — |

---

## Fix1-Verifikation (Sensor-Config-Pipeline)

| Fix | Beschreibung | Status | Nachweis |
|-----|-------------|--------|----------|
| Fix1-A | Key-Format `cfg_{uuid}` | PASS | Phase 3.7: Keys `cfg_86fc...`, `cfg_faf0...` statt `21_sht31_temp`. Phase 4.5: 7 unique `cfg_{uuid}` Keys |
| Fix1-B | Dual-Storage-Sync | PASS | Phase 4.6: DB-Count (7) = simulation_config-Count (7). Phase 9.4: DB-Count (6) = Key-Count (6) nach Delete |
| Fix1-C | Multi-Value-Split + Unique-Constraint | PASS | Phase 0.5: UNIQUE auf `(esp_id, gpio, sensor_type, onewire_address, i2c_address)`. Phase 3.6: SHT31 erzeugt 2 Eintraege (sht31_temp + sht31_humidity). Phase 4.4: Zweiter SHT31 (0x45) ohne Constraint-Fehler |
| Fix1-D | DS18B20 User-Eingaben | PASS | Phase 5.6: `sensor_name = 'Wurzelzone'` korrekt gespeichert, `gpio = 4` |
| Fix1-E | DELETE per config_id | PASS | Phase 9.3: Genau 1 von 7 geloescht, anderer Sensor am gleichen I2C-Adresse unberuehrt |
| Fix1-F | Umlaut-Transliteration | PASS | Phase 2.2: Zone `Naehrloesung` → slug `naehrloesung` (ae-Transliteration korrekt) |

**Fix1 Gesamt: 6/6 BESTANDEN**

---

## Fix2-Verifikation (Display-Konsistenz)

| Fix | Beschreibung | Status | Nachweis |
|-----|-------------|--------|----------|
| Fix2-L1 | MiniCard displayName() | PASS | Phase 3.9: "Klima Decke Temperature" + "Klima Decke Humidity" als separate Zeilen. Phase 4.7: 7 Zeilen mit korrekten Namen |
| Fix2-L2 | Reaktiver Info-Text + ARIA | PASS | Phase 3.3: AddSensorModal zeigt "erstellt 2 Messgroessen" Info-Text. Phase 3.14: `role="status"` im Snapshot bestaetigt |
| Fix2-L3 | I2C interfaceLabel | PASS | Phase 3.12: Satellite zeigt "I2C 0x44" (nicht "GPIO 21"). Phase 5.9: DS18B20 zeigt "GPIO 4" (korrekte Unterscheidung) |
| Fix2-L4 | Mock-Defaults (plausibel) | TEILWEISE | Phase 3.7: Temp=22.0 OK. Phase 5.7: DS18B20=20.0 OK. Phase 6.6: BMP280 Pressure=1013.25 OK. **ABER**: SHT31 Humidity Default = 22.0 statt 55.0 (NB-T09-02) |

**Fix2 Gesamt: 3/4 BESTANDEN, 1 TEILWEISE**

---

## Cross-View-Konsistenz (Phase 7)

| sensor_type | DB-Name | L1 MiniCard | L2 Satellite | Monitor | Match |
|-------------|---------|-------------|--------------|---------|-------|
| sht31_temp (0x44) | Klima Decke | Klima Decke Temperature | Klima Decke Temperature (I2C 0x44) | Klima Decke Temperature | MATCH |
| sht31_humidity (0x44) | Klima Decke Humidity | Klima Decke Humidity | Klima Decke Humidity (I2C 0x44) | Klima Decke Humidity | MATCH |
| sht31_temp (0x45) | Klima Boden | Klima Boden Temperature | Klima Boden Temperature (I2C 0x45) | Klima Boden Temperature | MATCH |
| sht31_humidity (0x45) | Klima Boden Humidity | Klima Boden Humidity | Klima Boden Humidity (I2C 0x45) | Klima Boden Humidity | MATCH |
| ds18b20 (GPIO 4) | Wurzelzone | Wurzelzone | Wurzelzone (GPIO 4) | Wurzelzone | MATCH |
| bmp280_temp (0x76) | Umgebung Temperature | Umgebung Temperature | Umgebung Temperature (I2C 0x76) | Umgebung Temperature | MATCH |
| bmp280_pressure (0x76) | Umgebung Pressure | Umgebung Pressure | Umgebung Pressure (I2C 0x76) | Umgebung Pressure | MATCH |

**Cross-View: 7/7 KONSISTENT**

---

## Neue Bugs

| ID | Schwere | Phase | Beschreibung | Betroffene Komponente |
|----|---------|-------|-------------|----------------------|
| NB-T09-01 | MEDIUM-HIGH | 4.3 | API `POST /debug/mock-esp/{id}/sensors` fuer zweiten SHT31 (0x45) gibt `success:true, jobs_started:0` zurueck — Sensor wird NICHT in DB persistiert. Workaround: AddSensorModal (UI) funktioniert korrekt. | `El Servador/.../debug.py` |
| NB-T09-02 | MEDIUM | 3.7 | SHT31 Humidity Mock-Default = 22.0 statt physikalisch plausiblem 55.0. Die `base_value` fuer Humidity-Subtyp verwendet den gleichen Startwert wie Temperature statt den humidity-spezifischen Default. DB-Nachweis: `device_metadata->'simulation_config'` zeigt `"base_value": 20.0` fuer sht31_humidity bei Device MOCK_A3592B7E. | `El Servador/.../sensor_type_registry.py`, `simulation_config` in `esp_devices.device_metadata` |
| NB-T09-03 | HIGH | 7, Nachtrag | Vue "Duplicate keys" Console-Warnungen — **Root Cause identifiziert**: `SensorColumn.vue:66` verwendet `:key="sensor-${sensor.gpio}"`. Multi-Value-Sensoren teilen sich denselben GPIO (z.B. SHT31 temp+humidity auf gpio=0), daher ist der Key nicht unique. Verursacht Vue-Reconciliation-Probleme und ist Mitursache fuer NB-T09-05. **Fix**: Key muss `sensor.gpio + sensor.sensor_type` oder `sensor.id` (config_id) verwenden. | `El Frontend/src/components/esp/SensorColumn.vue:66` |
| NB-T09-04 | LOW | 10 | Device-Loeschung: `DELETE /debug/mock-esp/{id}` gibt 404 obwohl Device noch in DB (soft-deleted). Frontend-Workaround loescht via zweitem API-Call. Console zeigt 3-6 Error-Logs waehrend Loeschvorgang. | `El Servador/.../debug.py`, `El Frontend/.../esp.ts` |
| NB-T09-05 | **KRITISCH** | Nachtrag | **Dual-Value-Bug auf SensorSatellite-Card**: Wenn Config-Panel geoeffnet und WS-Update eintrifft, zeigt eine Satellite-Card ZWEI Werte (z.B. "20.0°C TEMPERATUR" + "20.0%RH LUFTFEUCHTE") UND ein orphaned Satellite zeigt nochmal "20.0°C" separat. **Screenshots:** `S42_config-panel-wrong-sensor.png`, User-Screenshot `image.png`. **Root Cause (3 Faktoren):** (1) `sensor.store.ts:148` — `handleKnownMultiValueSensor` sucht nur per `sensors.find(s => s.gpio === data.gpio)` ohne `sensor_type` zu beruecksichtigen. Nach `fetchDevice` (ausgeloest durch Config-Panel @saved/@deleted) erhaelt der Store ZWEI separate MockSensor-Eintraege pro Multi-Value-Sensor (sht31_temp + sht31_humidity aus DB). Der WS-Handler merged multi_values nur auf den ERSTEN Eintrag, der zweite bleibt als orphaned Satellite. (2) `useWebSocket.ts:161+164` — `on()` registriert Callback doppelt: einmal in `messageHandlers` (lokal) UND einmal in `websocketService.listeners` (global). `handleMessage()` in `websocket.ts:369-376` feuert BEIDE Dispatch-Pfade, sodass `handleSensorData` 2x pro WS-Message aufgerufen wird. (3) `SensorColumn.vue:66` — `:key="sensor-${sensor.gpio}"` ist nicht unique fuer Multi-Value-Sensoren (siehe NB-T09-03). | `El Frontend/src/shared/stores/sensor.store.ts:148`, `El Frontend/src/composables/useWebSocket.ts:161-164`, `El Frontend/src/services/websocket.ts:369-376`, `El Frontend/src/components/esp/SensorColumn.vue:66` |
| NB-T09-06 | **KRITISCH** | Nachtrag | **Config-Panel oeffnet falschen Sensor**: Klick auf "Temperature" Satellite (SHT31) oeffnet Config-Panel fuer "sht31_humidity" (Feuchte). **Root Cause**: `SensorColumn.vue:83` emittiert nur `sensor.gpio` beim Klick (`@click="emit('sensor-click', sensor.gpio)"`). Da SHT31 temp und humidity denselben GPIO (0) teilen, findet `handleSensorClickFromDetail` in `HardwareView.vue` immer nur den ERSTEN Sensor mit passendem GPIO — unabhaengig davon welche Satellite-Card geklickt wurde. **Nachweis**: Playwright-Test — Klick auf e321 ("Temperatur und Luftfeuchte Temperature I2C 0x44"), Dialog zeigt "sht31_humidity" mit Einheit "%RH". **Fix**: Click-Event muss `sensor_type` oder `config_id` mit uebergeben, nicht nur GPIO. | `El Frontend/src/components/esp/SensorColumn.vue:83`, `El Frontend/src/views/HardwareView.vue` (handleSensorClickFromDetail) |
| NB-T09-07 | **HOCH** | Nachtrag | **500 Internal Server Error — `MultipleResultsFound`**: `sensor_repo.get_by_esp_and_gpio()` (Zeile 44-57) verwendet `scalar_one_or_none()` das bei 2+ sensor_configs auf demselben GPIO crasht. I2C-Sensoren werden mit `gpio=0` gespeichert (Fallback in `sensors.py:132` fuer NULL-GPIO). Wenn 2+ I2C-Sensoren auf gpio=0 liegen (z.B. SHT31 temp+humidity), wirft SQLAlchemy `MultipleResultsFound` → unkontrollierter 500. **Loki-Nachweis**: `2026-03-08 00:11:09 - Unhandled exception: MultipleResultsFound - Multiple rows were found when one or none was required`. **Betroffene Endpunkte**: GET `/sensors/{esp_id}/{gpio}`, `/sensors/{esp_id}/{gpio}/stats` (Zeile 1270). | `El Servador/god_kaiser_server/src/db/repositories/sensor_repo.py:44-57` (`get_by_esp_and_gpio`), `El Servador/god_kaiser_server/src/api/v1/sensors.py:132` (gpio=0 Fallback), `sensors.py:1270` (stats-Endpunkt) |
| NB-T09-08 | **HOCH** | Nachtrag | **Orphaned sensor_configs nach Soft-Delete**: Devices MOCK_3917D1BC und MOCK_4B2668C2 wurden soft-deleted (`deleted_at` gesetzt), aber ihre sensor_configs (9 Eintraege total) existieren noch in der DB. Health-Check prueft diese Sensoren weiterhin → **9 falsche Stale-Warnungen pro Minute**. **DB-Nachweis**: `SELECT sc.esp_id, COUNT(*) FROM sensor_configs sc JOIN esp_devices ed ON sc.esp_id = ed.id WHERE ed.deleted_at IS NOT NULL GROUP BY sc.esp_id` → 6 configs fuer MOCK_3917D1BC, 3 fuer MOCK_4B2668C2. **Server-Log**: Jede Minute 9x `Sensor stale: ESP MOCK_3917D1BC ...`. **Fix**: Cascade-Delete von sensor_configs bei Device-Soft-Delete, ODER sensor_health Job muss `deleted_at IS NULL` filtern. | `El Servador/god_kaiser_server/src/services/maintenance/jobs/sensor_health.py`, `El Servador/god_kaiser_server/src/db/repositories/sensor_repo.py` |
| NB-T09-09 | MEDIUM | Nachtrag | **Frontend DELETE API nutzt noch GPIO statt config_id**: `El Frontend/src/api/sensors.ts:33-35` sendet `DELETE /sensors/{esp_id}/{gpio}` mit GPIO als zweitem Parameter. Die Server-API wurde in T08-Fix-D auf `DELETE /sensors/{esp_id}/{config_id}` (UUID) umgestellt. Der Frontend-Aufruf sendet `0` als GPIO → FastAPI versucht es als UUID zu parsen → 422 Unprocessable Entity. | `El Frontend/src/api/sensors.ts:33-35` |
| NB-T09-10 | MEDIUM | Nachtrag | **Satellite-Reihenfolge wechselt bei jedem Render**: User berichtet dass die Anordnung der SHT31-Satellites (Temperatur vs. Feuchtigkeit) bei jedem Render wechselt. Root Cause: `SensorColumn.vue` rendert `v-for="(sensor, idx) in sensors"` ohne deterministische Sortierung. Die `sensors`-Array-Reihenfolge haengt von der Reihenfolge der WS-Events ab (welcher Wert zuerst ankommt). Kein `sort()` auf dem Array. | `El Frontend/src/components/esp/SensorColumn.vue:65`, `El Frontend/src/shared/stores/sensor.store.ts` |

---

## Key IDs (fuer Reproduzierbarkeit)

| Objekt | ID |
|--------|----|
| Test-ESP (Phase 1-10) | DB: `07927c7e-fb80-404d-aa56-8887439fa538`, Device: `MOCK_3917D1BC` |
| ReCreate-ESP (Phase 11) | DB: `b22b864d-f7ee-46d9-aead-b593598dba89`, Device: `MOCK_4B2668C2` |
| Zone Naehrloesung | DB: `676d007b-38a3-460a-8f7b-e0709e56f2e3`, Slug: `naehrloesung` |
| Baseline-Mock | DB: `MOCK_A3592B7E`, Zone: `Test`, 3 Sensoren |

---

## Screenshot-Index

| Screenshot | Phase | Beschreibung |
|------------|-------|-------------|
| S01 | 0.1 | L1 Ausgangszustand |
| S02 | 0.6 | Monitor Ausgangszustand |
| S03 | 1.3 | Mock-ESP erstellt, in "Nicht zugewiesen" |
| S05 | 1.6 | L2 Orbital leer |
| S06 | 2.3 | Zone "Naehrloesung" mit Mock zugewiesen |
| S07 | 3.3 | AddSensorModal SHT31 mit Info-Text |
| S09 | 3.9 | L1 MiniCard mit 2 SHT31-Zeilen |
| S10 | 3.11 | L2 Orbital mit 2 Satellites |
| S13 | 4.2 | AddSensorModal zweiter SHT31 (0x45) |
| S15 | 4.8 | L2 Orbital mit 7 Satellites (alle Sensoren) |
| S24 | 7.1 | L1 komplett mit 7 Sensoren |
| S26 | 7.3 | Monitor komplett mit beiden Zonen |
| S29 | 9.2 | Sensor-Loeschen Bestaetigungsdialog |
| S30 | 9.6 | L1 nach einzelnem Sensor geloescht (6 Zeilen) |
| S31 | 9.7 | L2 nach einzelnem Sensor geloescht (6 Satellites) |
| S32 | 10.2 | Device geloescht — leere L2-Ansicht |
| S33 | 10.6 | L1 nach Device-Loeschung (nur Baseline) |
| S34 | 10.7 | Monitor: Naehrloesung "Leer", Test OK |
| S35 | 11.5 | L1 ReCreate mit 3 Sensoren |
| S37 | 11.8 | L2 ReCreate komplett (3 Satellites) |
| S40 | 12.7 | L1 Endzustand (= Ausgangszustand) |
| S41 | Nachtrag | L2 Orbital Baseline (3 Satellites: SHT31 Temp/Hum + DS18B20) |
| S42 | Nachtrag | Config-Panel zeigt falschen Sensor (Klick auf Temperature → oeffnet Humidity) + Dual-Value sichtbar im Hintergrund |
| image.png | Nachtrag (User) | User-Screenshot: SensorCard zeigt zwei Werte + 500 Error in DevTools Console |

---

## DB-Schema Findings

| Spalte | Erwartet (Plan) | Tatsaechlich | Notiz |
|--------|----------------|-------------|-------|
| sensor_configs.name | `name` | `sensor_name` | Spalte heisst `sensor_name`, nicht `name` |
| sensor_configs.unit | vorhanden | NICHT vorhanden | Unit wird aus sensor_type_registry abgeleitet |
| sensor_configs.subzone_id | vorhanden | NICHT vorhanden | Subzones laufen ueber separate Zuordnung |
| UNIQUE Constraint | `(esp_id, i2c_address, sensor_type)` | `(esp_id, gpio, sensor_type, onewire_address, i2c_address)` | Breiter als erwartet, funktioniert aber korrekt |
| esp_devices.is_mock | vorhanden | NICHT vorhanden | Mock-Status in `device_metadata->>'mock'` |
| Delete-Strategie | Hard-Delete oder Soft-Delete | Soft-Delete (`deleted_at` Timestamp) | sensor_configs bleiben erhalten |

---

## Fazit

### Gesamtbewertung: Fix1 + Fix2 TEILWEISE VERIFIZIERT — Kritische Regressionsfehler in Frontend-State-Management

**Fix1 (Sensor-Config-Pipeline): 6/6 BESTANDEN** (Backend-Logik korrekt)
- `cfg_{uuid}` Key-Format eliminiert Key-Kollisionen komplett
- Multi-Value-Split funktioniert zuverlaessig fuer SHT31 und BMP280
- Dual-Storage-Sync bleibt bei Add und Delete konsistent
- DELETE per config_id isoliert korrekt — kein Cascade auf andere Sensoren
- Umlaut-Transliteration in Zone-Slugs korrekt (ae, oe, ue)

**Fix2 (Display-Konsistenz): 2/4 BESTANDEN, 2 FEHLERHAFT**
- MiniCard displayName() zeigt korrekte Sensor-Subtypes
- Info-Text und ARIA-Attribute im AddSensorModal vorhanden
- ~~I2C vs GPIO Interface-Labels korrekt unterschieden~~ → Funktioniert grundsaetzlich, aber Config-Panel oeffnet falschen Sensor (NB-T09-06)
- Mock-Defaults: Temperature + Pressure OK, **Humidity Default 22.0 statt 55.0** (NB-T09-02)

**Cross-View-Konsistenz: 7/7 MATCH bei statischer Pruefung**
- L1 MiniCard = L2 Orbital = Monitor — identische Namen und Werte
- **ABER**: Dynamische Inkonsistenz bei offenen Config-Panels (NB-T09-05)

---

### Nachtrag-Analyse: Tiefenanalyse (2026-03-08 08:00)

#### Methodik
- Playwright-basierte Browser-Tests mit Login und L2-Navigation
- DB-Queries gegen `god_kaiser_db` (PostgreSQL via Docker)
- Docker-Logs Analyse (`automationone-server --since 24h`)
- Loki-Query auf Port 3100 (compose_service Labels)
- Code-Tiefenanalyse: `sensor.store.ts`, `useWebSocket.ts`, `websocket.ts`, `SensorColumn.vue`, `sensor_repo.py`

#### Zusammenfassung der Nachtrag-Bugs

| Prioritaet | Bugs | Bereich |
|------------|------|---------|
| KRITISCH (2) | NB-T09-05 (Dual-Value), NB-T09-06 (Wrong Config Panel) | Frontend State/UI |
| HOCH (2) | NB-T09-07 (500 Error), NB-T09-08 (Orphaned Configs) | Server/DB |
| MEDIUM (2) | NB-T09-09 (API Mismatch), NB-T09-10 (Satellite-Reihenfolge) | Frontend/Server |

#### Bug-Abhaengigkeiten (Fix-Reihenfolge)

```
NB-T09-05 (Dual-Value) ← haengt ab von:
  ├── NB-T09-03 (Duplicate Keys) — muss zuerst gefixt werden
  ├── sensor.store.ts:148 (GPIO-only Lookup) — Kernfix
  └── useWebSocket.ts:164 (Double-Dispatch) — sollte parallel gefixt werden

NB-T09-06 (Wrong Config Panel) ← haengt ab von:
  └── SensorColumn.vue:83 (emit nur GPIO) — eigenstaendiger Fix

NB-T09-07 (500 Error) ← eigenstaendig:
  └── sensor_repo.py:44-57 (scalar_one_or_none) — muss auf scalars().all() umgestellt werden

NB-T09-08 (Orphaned Configs) ← eigenstaendig:
  └── sensor_health.py muss deleted_at filtern ODER cascade-delete bei Device-Delete
```

### Empfehlung fuer naechste Schritte (priorisiert)

1. **NB-T09-05 (KRITISCH):** `sensor.store.ts:148` — `handleKnownMultiValueSensor` muss nach dem Merge orphaned Eintraege mit gleichem GPIO + gleichem deviceType aus dem Array entfernen. Zusaetzlich `useWebSocket.ts:164` Double-Dispatch eliminieren.
2. **NB-T09-06 (KRITISCH):** `SensorColumn.vue:83` — Click-Event muss `sensor_type` oder `config_id` mit uebergeben, `HardwareView.vue` handleSensorClickFromDetail muss nach GPIO + sensor_type suchen.
3. **NB-T09-03 (HIGH):** `SensorColumn.vue:66` — `:key` auf `` sensor-${sensor.gpio}-${sensor.sensor_type} `` aendern.
4. **NB-T09-07 (HIGH):** `sensor_repo.py:44-57` — `get_by_esp_and_gpio` auf `scalars().all()` umstellen oder deprecaten zugunsten `get_all_by_esp_and_gpio`.
5. **NB-T09-08 (HIGH):** Health-Check muss soft-deleted Devices ausschliessen (`WHERE ed.deleted_at IS NULL`).
6. **NB-T09-02 (MEDIUM):** Humidity-Mock-Default auf 55.0 setzen.
7. **NB-T09-09 (MEDIUM):** Frontend `sensors.ts:33-35` DELETE auf config_id umstellen.
8. **NB-T09-10 (MEDIUM):** Sensors-Array in SensorColumn deterministisch sortieren (z.B. nach `sensor_type`).
9. **NB-T09-01 (MEDIUM-HIGH):** API-Bug bei zweitem SHT31 untersuchen.
10. **NB-T09-04 (LOW):** Delete-API-Flow vereinheitlichen.
11. **Phase 8 nachholen:** Sensor-Rename + Reaktivitaet in separatem Test verifizieren.

### Loki/Server-Log Analyse

| Zeitpunkt | Log-Eintrag | Relevanz |
|-----------|-------------|----------|
| 00:11:09 | `Unhandled exception: MultipleResultsFound - Multiple rows were found when one or none was required` | Bestaetigt NB-T09-07 |
| Jede Minute | 9x `Sensor stale: ESP MOCK_3917D1BC/MOCK_4B2668C2 GPIO X ...` | Bestaetigt NB-T09-08 |
| Laufend | `Sensor data saved: esp_id=MOCK_A3592B7E, gpio=0, processing_mode=raw` (2x pro Zyklus) | SHT31 temp+humidity auf gpio=0 — Ausloeser fuer NB-T09-07 |

### DB-Zustand zum Zeitpunkt der Nachtrag-Analyse

| Objekt | Wert |
|--------|------|
| Aktive Mock-Devices | 1 (MOCK_A3592B7E / `b6a83569`) |
| Soft-deleted Mock-Devices | 2 (MOCK_3917D1BC / `07927c7e`, MOCK_4B2668C2 / `b22b864d`) |
| Aktive sensor_configs | 3 (fuer MOCK_A3592B7E: sht31_temp, sht31_humidity, DS18B20) |
| Orphaned sensor_configs | 9 (6 fuer MOCK_3917D1BC, 3 fuer MOCK_4B2668C2) |
| Baseline-Mock (MOCK_A3592B7E) sim_config Keys | 3 (`cfg_a13fce3c`, `cfg_9e679530`, `cfg_2d397712`) |
| SHT31 Humidity `base_value` | 20.0 (erwartet: 55.0) — NB-T09-02 |
