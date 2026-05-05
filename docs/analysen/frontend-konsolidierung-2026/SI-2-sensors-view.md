# SI-2 SensorsView — Pro-Sensor-Detail, WS-Match-Bug

> **Issue:** [AUT-236](https://linear.app/autoone/issue/AUT-236)
> **Parent:** AUT-230 (Frontend-Konsolidierung 2026, Strang 2 von 8)
> **Datum:** 2026-05-06
> **Modus:** Read-only Evidenzanalyse — keine Implementierung

## Executive Summary

Der WS-Match-Bug (NB6 — gpio+sensor_type als alleinige Match-Schluessel) ist auf Store-Ebene bereits teilweise behoben: `matchSensorToEvent()` in `sensor.store.ts` priorisiert `config_id`, dann Adressen, dann legacy-fallback. Das Server-Broadcast sendet `config_id`, `i2c_address`, `onewire_address` — aber nur wenn ein `sensor_config`-Eintrag gefunden wird. Fehlt der Eintrag (z.B. unbekannter Sensor), entfaellt `config_id` im Broadcast, und der Legacy-Pfad greift. Das ist der verbleibende Risikopfad.

`sensor_health`-Matching bleibt rein GPIO-basiert (kein `sensor_type`, kein `config_id`) — unkritisch solange pro GPIO nur ein Stale-Status existiert, aber ein latenter Bug fuer Multi-Sensor-GPIO-Szenarien.

Kalibrierungs-Statusanzeige ist in `SensorValueCard` zentralisiert, aber nur fuer `calibration_data.calibrated_at` plus Intervalltage — kein einheitliches "Kalibrierung erforderlich"-Flag fuer pH/EC/soil_moisture an der Oberflaeche.

VPD ist sauber aus dem Config-Push-Dropdown herausgehalten (`getSensorTypeOptions()` filtert value-types inklusive `vpd` nicht direkt, aber da VPD kein MULTI_VALUE_DEVICES-Eintrag ist und `getDeviceTypeFromSensorType('vpd')` null liefert, erscheint es als single-value Option — das ist ein aktiver Defekt in `getSensorTypeOptions`).

`SensorStatsResponse` liefert kein `unit`-Feld. Frontend-Stellen die Stats-Unit benoetigen fallen auf `getSensorUnit(sensorType)` zurueck — inkonsistent ueber drei Konsumenten.

---

## 1. WS-Bug-Analyse

### 1a. Match-Logik in sensor.store.ts

| Stelle | Datei:Zeile | Match-Felder | Problem |
|--------|-------------|-------------|---------|
| `matchSensorToEvent()` — Primary | `shared/stores/sensor.store.ts:122-123` | `config_id` (both sides) | Nur wirksam wenn Server config_id mitsendet UND Sensor-Objekt config_id traegt |
| `matchSensorToEvent()` — Address layer | `shared/stores/sensor.store.ts:135-143` | `gpio + sensor_type + i2c_address` oder `gpio + sensor_type + onewire_address` | Korrekt, aber greift nur wenn Event die Felder enthaelt |
| `matchSensorToEvent()` — Legacy | `shared/stores/sensor.store.ts:143` | `gpio + sensor_type` only, first-match | Erster Treffer gewinnt: bei 2x DS18B20 auf gleichem GPIO trifft immer Sensor[0] |
| `handleKnownMultiValueSensor()` Fallback | `shared/stores/sensor.store.ts:239` | `gpio` only (find first by gpio) | Fasst alle sensor_types eines Geraets unter einem Sensor-Eintrag zusammen |
| `handleSensorHealth()` | `shared/stores/sensor.store.ts:373` | `gpio` only | Kein `sensor_type`, kein `config_id` — bei Multi-Sensor-GPIO kein eindeutiger Ziel-Sensor |

### 1b. Server-Broadcast in sensor_handler.py

Der Server sendet (Zeile 564-583 in `sensor_handler.py`):

```python
{
    "config_id": str(sensor_config.id) if sensor_config else None,
    "i2c_address": i2c_address if i2c_address else None,
    "onewire_address": onewire_address if onewire_address else None,
}
```

`config_id` ist `None` wenn kein `sensor_config`-Eintrag gefunden wird (Warnung "Saving data without config"). In diesem Fall faellt das Frontend auf legacy `gpio+sensor_type` zurueck.

VPD-Broadcast (Zeile 862-878) sendet weder `config_id` noch Adressfelder — VPD landet auf `gpio=0`, und da VPD-Sensor-Objekte `config_id` besitzen wenn `create_if_not_exists` greift, wuerde config_id-Match funktionieren, aber der Broadcast liefert sie nicht mit.

### 1c. SensorDataEvent-Typdefinition

`websocket-events.ts` Zeile 43-60: `SensorDataEvent.data` enthaelt bereits `config_id?: string`, `i2c_address?: number`, `onewire_address?: string` — korrekt definiert, optional. Keine Luecke im Typ.

Die interne `SensorDataPayload`-Schnittstelle in `sensor.store.ts` (Zeile 34-47) spiegelt dieselben optionalen Felder. Typ-Konsistenz ist gegeben.

### 1d. Kanonische Loesung

**Server-Seite (minimal):** Der VPD-Broadcast sollte `config_id` mitsenden. Das Server-Suchen-Pattern (`create_if_not_exists`) stellt sicher, dass ein `sensor_config`-Eintrag existiert — dessen UUID koennte abgefragt und mitgesendet werden.

**Frontend-Seite (minimal):** `handleSensorHealth()` sollte analog zu `matchSensorToEvent()` um `sensor_type`-Match erweitert werden, damit bei Multi-Sensor-GPIO das korrekte Sensor-Objekt aktualisiert wird.

**Vollstaendige Loesung:** Server sendet `config_id` in allen sensor_data-Broadcasts ohne Ausnahme (auch wenn kein sensor_config-Eintrag — dann null, und Frontend nutzt Address-Fallback). Das Frontend-`matchSensorToEvent()` ist dann bereits korrekt.

---

## 2. Sensortyp-Matrix (9 Kerntypen)

| Typ | Anzeige-Komponente | Unit-Quelle | Decimals | Multi-Value | Besonderheit |
|-----|--------------------|-------------|----------|-------------|-------------|
| **DS18B20** | `SensorValueCard.vue`, `SensorCard.vue`, `DeviceMiniCard.vue` (via `groupSensorsByBaseType`) | `SENSOR_TYPE_CONFIG['DS18B20'].unit` = `°C` | 1 | Nein — aber `supportsMultipleOnSamePin: true` (OneWire) | `requiresAddressScanning: true`; Adress-Match in sensor.store notwendig |
| **SHT31** | `SensorValueCard.vue` (pro sub-type), `DeviceMiniCard.vue` (via `MULTI_VALUE_DEVICES.sht31`) | Sub-type: `sht31_temp` → `°C`, `sht31_humidity` → `%RH` | 1 je | Ja — `MULTI_VALUE_DEVICES.sht31`: `[sht31_temp, sht31_humidity]` | I2C 0x44/0x45; VPD-Trigger: `sht31_temp`-Event startet `_try_compute_vpd()` |
| **BME280** | `SensorValueCard.vue` (pro sub-type), `groupSensorsByBaseType` | `bme280_temp` → `°C`, `bme280_humidity` → `%RH`, `bme280_pressure` → `hPa` | 1 je | Ja — `MULTI_VALUE_DEVICES.bme280` (3 Werte) | I2C 0x76/0x77; `BME280_CONFIG` wird post-hoc in `MULTI_VALUE_DEVICES` injiziert |
| **BMP280** | `SensorValueCard.vue` (pro sub-type) | `bmp280_temp` → `°C`, `bmp280_pressure` → `hPa` | 1 je | Ja — `MULTI_VALUE_DEVICES.bmp280` (2 Werte) | I2C 0x76/0x77; kein Humidity-Wert |
| **pH** | `SensorValueCard.vue`, `SensorCard.vue` | `SENSOR_TYPE_CONFIG['pH'].unit` = `pH` | 2 | Nein | `recommendedMode: 'on_demand'`; `supportsOnDemand: true`; Kalibrierung typisch noetig |
| **EC** | `SensorValueCard.vue`, `SensorCard.vue` | `SENSOR_TYPE_CONFIG['EC'].unit` = `µS/cm` | 0 | Nein | `recommendedMode: 'on_demand'`; Kalibrierung typisch noetig |
| **soil_moisture** | `SensorValueCard.vue`, `SensorCard.vue` | `SENSOR_TYPE_CONFIG['soil_moisture'].unit` = `%` | 0 | Nein | Alias `moisture` existiert parallel in `SENSOR_TYPE_CONFIG`; `recommendedGpios: [32,33,34,35,36,39]` |
| **VPD** | `SensorCard.vue` (via `VIRTUAL_SENSOR_META`), `DeviceMiniCard` (via groupSensorsByBaseType, gpio=0) | `SENSOR_TYPE_CONFIG['vpd'].unit` = `kPa` | 2 | Nein | VIRTUAL (`interface_type='VIRTUAL'`); kein `recommendedMode`; Server-computed; gpio=0; `getSensorAggCategory('vpd')` gibt `'other'` — VPD erscheint nicht in KPI-Aggregation |
| **GPIO-0-Sensoren** | Abhaengig von `sensor_type` am gpio=0 (VPD ist der einzige bekannte Typ) | `SENSOR_TYPE_CONFIG[sensor_type]?.unit` | Typ-abhaengig | Nein | gpio=0 ist Server-Konvention fuer virtuelle Sensoren; kein echter ESP-GPIO |

### Ergaenzende Befunde pro Typ

**DS18B20:** `SENSOR_TYPE_CONFIG` enthaelt sowohl `DS18B20` (Uppercase) als auch `ds18b20` (Lowercase) mit identischem Inhalt. `getSensorTypeOptions()` dedupliziert korrekt per `addedLowercase`-Set, bevorzugt lowercase. Keine Inkonsistenz im Config-System, aber doppelter Datensatz ist Wartungsaufwand.

**SHT31:** `BASE_TYPE_TO_DEVICE` kennt `SHT31`, `sht31`, `sht31_temp`, `sht31_humidity`. Uppercase-Varianten `SHT31` und `SHT31_humidity` in `SENSOR_TYPE_CONFIG` dienen als Backward-Compat fuer API/DB, die Mixed-Case senden. `getSensorTypeOptions()` filtert diese korrekt heraus.

**BME280:** `BME280_CONFIG` wird mit `MULTI_VALUE_DEVICES['bme280'] = BME280_CONFIG` registriert (Zeile 975 in sensorDefaults.ts) — das ist ein Mutable-Side-Effect auf Modul-Level. Reihenfolge-abhaengig, aber funktional sicher bei SSR-freiem SPA.

**soil_moisture vs moisture:** Beide Schluessel in `SENSOR_TYPE_CONFIG` mit identischer Konfiguration. `getSensorAggCategory` prueft `lower.includes('moisture') || lower.includes('soil')` — beide treffen korrekt auf `'moisture'`. Doppelter Eintrag sollte zusammengefuehrt werden.

---

## 3. Kalibrierungs-Status-Befund

### Komponenten-Inventar

| Komponente | Datei | Was angezeigt wird |
|------------|-------|--------------------|
| `SensorValueCard` | `components/esp/SensorValueCard.vue:182-202` | `calibrationStatus` computed: prueft `calibration_data.calibrated_at` + `calibration_interval_days`. Zeigt "Kalibrierung fällig (vor N Tagen)" oder "Kalibriert vor N Tagen" |
| `SensorValueCard` Detail-Row | `components/esp/SensorValueCard.vue:405-407` | Zeigt `calibration_interval_days` als "N Tage" im Detail-Bereich |
| `SensorConfigPanel` | `components/esp/SensorConfigPanel.vue:216,253,365` | Liest und schreibt `calibration_interval_days`; kein visueller Status-Indikator |
| `EditSensorModal` | `components/esp/EditSensorModal.vue:33,66,108,177,297` | `calibration_interval_days` als editierbares Feld |
| `CalibrationView` / `CalibrationWizard` | `views/CalibrationView.vue`, `components/calibration/CalibrationWizard.vue` | Separater Workflow fuer Kalibrierungsschritte |

### Befund

Es gibt **keine einheitliche "Kalibrierung erforderlich"-Badge** fuer pH, EC oder soil_moisture an der Komponenten-Oberfläche. `SensorValueCard` berechnet Faelligkeit nur wenn `calibration_data.calibrated_at` gesetzt ist — wenn ein Sensor nie kalibriert wurde, zeigt keine Komponente einen Hinweis. Die drei Typen pH/EC/soil_moisture haben in `SENSOR_TYPE_CONFIG` kein `calibrationRequired: true`-Flag.

**Kanon-Empfehlung:** `SensorTypeConfig` um `requiresCalibration?: boolean` erweitern, `SensorValueCard` um "Noch nicht kalibriert"-State fuer Typen mit diesem Flag. Kein neuer Komponent noetig — `SensorValueCard` ist bereits der kanonische Ort.

---

## 4. VPD/VIRTUAL-Befund

### getSensorTypeOptions() und VPD

`getSensorTypeOptions()` (sensorDefaults.ts Zeile 735-775) filtert value-types (`sht31_temp`, `sht31_humidity` etc.) und device-keys (`sht31`, `bme280`) aus dem Dropdown heraus. `vpd` ist:
- Kein Eintrag in `MULTI_VALUE_DEVICES`
- Kein Wert in `valueTypeSet` (der Set der value-types aus MULTI_VALUE_DEVICES)
- `getDeviceTypeFromSensorType('vpd')` gibt `null` zurueck

**Ergebnis: `vpd` erscheint als auswaehlbare Single-Value-Option in `getSensorTypeOptions()`**. Das bedeutet, ein Nutzer koennte beim manuellen Sensor-Hinzufuegen `vpd` als Typ auswaehlen — obwohl VPD ein server-berechneter VIRTUAL-Sensor ist.

### Config-Push-Filter

Es gibt keinen expliziten Filter in `getSensorTypeOptions()` der `interface_type === 'VIRTUAL'` oder `'vpd'` ausschliesst. Der Filter laeuft allein ueber `MULTI_VALUE_DEVICES` und `BASE_TYPE_TO_DEVICE`.

### VPD-Anzeige

`SensorCard.vue` (Zeile 144): `const virtualMeta = computed(() => VIRTUAL_SENSOR_META[props.sensor.sensor_type] ?? null)` — zeigt zusaetzliche Metadaten (Quellen, Formel) fuer VIRTUAL-Sensoren an. `getSensorAggCategory('vpd')` gibt `'other'` (Zeile 1446) — VPD wird korrekt von der Zone-KPI-Aggregation ausgeschlossen.

**Defekt:** `getSensorTypeOptions()` filtert `vpd` nicht aus. Fix: `vpd` in eine `VIRTUAL_SENSOR_TYPES`-Constant aufnehmen und in `getSensorTypeOptions()` exclusion-set ergaenzen.

---

## 5. Stats-Endpoint Unit-Befund

### SensorStatsResponse — fehlendes unit-Feld

`SensorStatsResponse` (schemas/sensor.py Zeile 757-766) enthaelt:
- `esp_id`, `gpio`, `sensor_type`, `stats: SensorStats`, `time_range`
- **Kein `unit`-Feld**

`SensorStats` (Zeile 728-754) enthaelt nur statistische Werte: `min_value`, `max_value`, `avg_value`, `std_dev`, `reading_count`, `quality_distribution`. Keine Unit.

### Frontend-Fallback-Stellen

| Stelle | Datei | Fallback-Logik |
|--------|-------|----------------|
| Gauge-Widget Unit | `shared/stores/dashboard.store.ts:1224` | `SENSOR_TYPE_CONFIG[s.sensor_type]?.unit` |
| Spot-Gauge Unit | `shared/stores/dashboard.store.ts:1257` | `SENSOR_TYPE_CONFIG[s.sensorType]?.unit` |
| Monitor Gauge-Widget | `views/MonitorView.vue:514` | `getSensorUnit(found.sensor_type) !== 'raw' ? getSensorUnit(...) : (found.unit || '')` |
| Monitor Zone-Aggregation | `views/MonitorView.vue:634` | `getSensorUnit(sensor.sensor_type) !== 'raw' ? getSensorUnit(...) : (sensor.unit || '')` |
| Logic-Condition Labels | `types/logic.ts:259` | `getSensorUnit(sc.sensor_type)` |

Alle Stellen fallen auf `getSensorUnit(sensorType)` zurueck, was `SENSOR_TYPE_CONFIG[sensorType]?.unit ?? 'raw'` ist. Das funktioniert fuer alle bekannten Typen, scheitert aber fuer unbekannte/custom Typen die nur im DB-Datensatz eine Unit tragen. Da Stats-Response `sensor_type` zurueckgibt, koennte der Server die Unit mitliefern.

**Kanon-Empfehlung:** `SensorStatsResponse` um `unit: str` erweitern (aus `sensor_config.sensor_metadata.get('latest_unit')` oder `get_unit_for_sensor_type(sensor_type)`). Frontend dann primaer Response-Unit nutzen, Fallback auf `getSensorUnit` beibehalten.

---

## 6. Server-Touchpoints

| Touchpoint | Datei | Aktueller Zustand | Fehlend / Risiko |
|------------|-------|--------------------|-----------------|
| WS `sensor_data` Broadcast | `mqtt/handlers/sensor_handler.py:564-583` | Sendet `config_id`, `i2c_address`, `onewire_address` wenn `sensor_config` gefunden | `config_id = None` wenn kein sensor_config-Eintrag (unbekannter Sensor); VPD-Broadcast (Zeile 862-878) sendet keine `config_id` |
| VPD-Broadcast | `mqtt/handlers/sensor_handler.py:851-878` | Sendet `esp_id`, `gpio=0`, `sensor_type=vpd`, `value`, `unit=kPa`, `quality`, `timestamp` | Kein `config_id` — obwohl VPD SensorConfig-Eintrag via `create_if_not_exists` besitzt |
| `GET /{esp_id}/{gpio}/stats` | `api/v1/sensors.py:1586-1676` | Gibt `SensorStatsResponse` zurueck mit `sensor_type` | Kein `unit`-Feld in Response |
| `sensor_health` WS Event | `types/index.ts` SensorHealthEvent | `data` enthaelt `esp_id`, `gpio`, `sensor_type`, `status` | Frontend-Handler (`sensor.store.ts:373`) matcht nur auf `gpio`, ignoriert `sensor_type` |
| Stats `?sensor_type=` Query-Param | `api/v1/sensors.py:1599-1602` | Optional; ohne den Param wird bei Multi-Value-GPIO der erste Config-Eintrag verwendet | Frontend muss `sensor_type` beim Stats-Aufruf mitgeben fuer korrekte Multi-Value-Stats |

---

## 7. Follow-up-Vorschlaege (priorisiert)

| Prio | Titel | Betroffene Agenten | Aufwand |
|------|-------|-------------------|---------|
| P1 | VPD-Broadcast um `config_id` erweitern | `server-dev` | Klein: `sensor_repo.get_by_esp_gpio_and_type(esp_device.id, 0, 'vpd')` vor Broadcast, UUID mitgeben |
| P1 | `getSensorTypeOptions()` VIRTUAL-Typen herausfiltern | `frontend-dev` | Klein: `const VIRTUAL_SENSOR_TYPES = new Set(['vpd'])`, in filter-condition ergaenzen |
| P2 | `handleSensorHealth()` um `sensor_type`-Match erweitern | `frontend-dev` | Klein: `findIndex(s => s.gpio === event.gpio && s.sensor_type === event.sensor_type)` |
| P2 | `SensorStatsResponse` um `unit: str` erweitern | `server-dev` | Klein: Pydantic-Field ergaenzen, `get_unit_for_sensor_type(sensor.sensor_type)` als Wert |
| P3 | `SensorTypeConfig` um `requiresCalibration?: boolean` erweitern und `SensorValueCard` um "nicht kalibriert"-State | `frontend-dev` | Mittel: pH/EC/soil_moisture flaggen, SensorValueCard anpassen |
| P3 | `moisture` und `soil_moisture` in `SENSOR_TYPE_CONFIG` konsolidieren (Duplikat entfernen) | `frontend-dev` | Klein: Pruefe ob externe Konsumenten `moisture` als Key verwenden, dann Alias oder Entfernung |
| P4 | Frontend Stats-Konsumenten auf Response-Unit umstellen (nicht mehr nur SENSOR_TYPE_CONFIG) | `frontend-dev` | Klein-Mittel: 5 Stellen in dashboard.store + MonitorView + logic.ts |

---

## Datei-Referenzen (SSOT)

- `El Frontend/src/shared/stores/sensor.store.ts` — WS-Match-Logik, alle drei Handler
- `El Frontend/src/types/websocket-events.ts:43-60` — SensorDataEvent Typdefinition
- `El Frontend/src/utils/sensorDefaults.ts:89-638` — SENSOR_TYPE_CONFIG (alle 9 Typen + Aliases)
- `El Frontend/src/utils/sensorDefaults.ts:900-975` — MULTI_VALUE_DEVICES Registry
- `El Frontend/src/utils/sensorDefaults.ts:735-775` — getSensorTypeOptions() (VPD-Luecke)
- `El Frontend/src/utils/sensorDefaults.ts:684` — getSensorUnit() als Unit-Fallback
- `El Frontend/src/composables/useSensorId.ts` — 3-teilige IDs `espId:gpio:sensorType`
- `El Frontend/src/composables/useSensorOptions.ts:78` — sensorId-Format `${deviceId}:${s.gpio}:${s.sensor_type}`
- `El Frontend/src/components/esp/SensorValueCard.vue:182-202` — Kalibrierungs-Status-Berechnung
- `El Frontend/src/components/devices/SensorCard.vue:144` — VIRTUAL_SENSOR_META Anzeige
- `El Servador/god_kaiser_server/src/mqtt/handlers/sensor_handler.py:564-583` — WS-Broadcast (Sensor-Data)
- `El Servador/god_kaiser_server/src/mqtt/handlers/sensor_handler.py:851-878` — WS-Broadcast (VPD)
- `El Servador/god_kaiser_server/src/schemas/sensor.py:728-766` — SensorStats / SensorStatsResponse (kein unit-Feld)
- `El Servador/god_kaiser_server/src/api/v1/sensors.py:1586-1676` — GET stats Endpoint
