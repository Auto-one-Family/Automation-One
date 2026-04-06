# Paket 03: ESP32 Sensorhandling End-to-End Tiefenanalyse (P1.3)

> **Stand:** 2026-04-05  

## 1) Ziel, Scope, Quellen

Dieses Dokument analysiert den kompletten Firmware-Sensorpfad in `El Trabajante` von Konfigurationsaufnahme bis MQTT-Publish inkl. Fehler- und Recovery-Verhalten.

- Modus: Read-only Analyse, keine Firmware-Codeaenderung.
- Fokus: Registrierung, Messzyklus, Validierung, Cache, Publish, Offline/Safety-Auswirkung.
- P1.2-Delta Pflichtbezug:
  - Queue-Overflow in Sensor-/Publish-Pfaden moeglich.
  - Config-Parse-Fehler ohne durchgaengige negative Rueckmeldung.
  - Legacy-No-Task-Pfad hat andere Timing-/Isolationseigenschaften.
  - OFFLINE_ACTIVE plus `server_override` fuer Rule-Eval beachten.

Primarquellen:
- `El Trabajante/src/services/sensor/sensor_manager.*`
- `El Trabajante/src/models/sensor_registry.*`
- `El Trabajante/src/drivers/i2c_bus.*`
- `El Trabajante/src/drivers/i2c_sensor_protocol.*`
- `El Trabajante/src/drivers/onewire_bus.*`
- `El Trabajante/src/tasks/safety_task.cpp`
- `El Trabajante/src/tasks/sensor_command_queue.*`
- `El Trabajante/src/tasks/command_admission.*`
- `El Trabajante/src/tasks/intent_contract.*`
- `El Trabajante/src/tasks/publish_queue.*`
- `El Trabajante/src/services/communication/mqtt_client.*`
- `El Trabajante/src/services/safety/offline_mode_manager.*`
- `El Trabajante/src/main.cpp`

Hinweis zu Entry-Points aus Auftragsrahmen:
- `sensor_factory.*` und `sensor_drivers/isensor_driver.h` existieren aktuell, sind aber inhaltlich leer (kein aktiver Pfad).

## 2) Block A - Sensorinventar und Pfadklassifikation

### 2.1 Sensorlandkarte (IST)

| Sensorklasse | Aktive Typen | Owner-Module | Nominaler Pfadstatus |
|---|---|---|---|
| Analog (ADC) | `ph`, `ec`, `moisture` | `sensor_manager`, `gpio_manager` | Aktiv, single-value |
| Digital (GPIO-Digitalread) | aktuell kein registrierter Typ | `sensor_manager::readRawDigital()` | Infrastruktur vorhanden, derzeit nicht genutzt |
| I2C (single-value) | generischer Fallback-Pfad vorhanden | `sensor_manager`, `i2c_bus` | Technisch vorhanden, praktisch von Multi-Value ueberlagert |
| I2C (multi-value) | `sht31`, `bmp280`, `bme280` inkl. temp/humidity/pressure Varianten | `sensor_manager`, `sensor_registry`, `i2c_sensor_protocol`, `i2c_bus` | Aktiv, dedupliziert je I2C-Adresse pro Zyklus |
| OneWire | `ds18b20` | `sensor_manager`, `onewire_bus`, `onewire_utils` | Aktiv, mit Retry + Special-Value-Guards |

### 2.2 Registry-/Mapping-Kern

- `sensor_registry` normalisiert ESP-Typen auf Server-Typen (`getServerSensorType`).
- Multi-Value-Geraete:
  - `sht31` -> `sht31_temp`, `sht31_humidity`
  - `bmp280` -> `bmp280_pressure`, `bmp280_temp`
  - `bme280` -> `bme280_pressure`, `bme280_temp`, `bme280_humidity`
- I2C-Adressen koennen per Config-Payload uebersteuert werden (`i2c_address`), Registry liefert nur Default.

## 3) Block B - Mess-/Verarbeitungszyklus im Detail

## FW-SENSOR-FLOW-001 - Sensor Config Ingestion und Registrierung

1. **Sensorklasse:** alle (Meta-Flow)
2. **Registrierung/Init:**
   - MQTT Config Topic kommt auf Core 0 an (`routeIncomingMessage`).
   - `command_admission` (CONFIG) + Pflicht-`correlation_id`; bei Fehlen Contract-Error ohne Enqueue.
   - Enqueue in `g_config_update_queue` (100 ms Timeout, Queue-Tiefe 5).
   - Core 1 `processConfigUpdateQueue()` parsed einmalig und ruft `handleSensorConfig()`.
   - `parseAndConfigureSensorWithTracking()` validiert Felder, Modus, Intervalle und ruft `sensorManager.configureSensor()`.
3. **Messzyklus:** noch keiner, nur Setup.
4. **Datenverarbeitung:** Typnormalisierung (`sensor_type.toLowerCase`, Registry-Mapping), Interface-spezifische Felder (`onewire_address`, `i2c_address`).
5. **Publish:** Config-Response aggregiert ueber `ConfigResponseBuilder` (bei parse-failure in Queue-Pfad aktuell Luecke).
6. **Cache/Persistenz:** `configManager.saveSensorConfig()` in NVS.
7. **Fehlerpfade:** fehlende Pflichtfelder, Typkonflikte, GPIO-Konflikte, Bus nicht initiiert, I2C-Adresskonflikt, OneWire-ROM invalid/duplicate.
8. **Safety/Offline:** fehlerhafte Registrierung fuehrt zu fehlendem Sensorwert im Value-Cache -> Offline-Rules koennen NaN sehen.
9. **P1.2 Delta:** parse-fail in `processConfigUpdateQueue()` erzeugt aktuell kein garantiert negatives `config_response`.

## FW-SENSOR-FLOW-002 - Kontinuierliche Single-Value Messung (Analog/OneWire)

1. **Sensorklasse:** analog + OneWire single-value.
2. **Registrierung/Init:** ueber Flow-001, Sensor liegt als aktiver Eintrag in `sensors_[]`.
3. **Messzyklus:**
   - Core 1 `safetyTask` ruft alle 10 ms `sensorManager.performAllMeasurements()`.
   - Pro Sensor Guard: `active`, `operating_mode` (`continuous` only), Intervall `measurement_interval_ms`.
4. **Datenverarbeitung:**
   - Analog: `readRawAnalog()` mit ADC2/WiFi-Konfliktguard.
   - OneWire: ROM-Validierung, Bus-Statuscheck, bis zu 3 Reads mit Retry, Special-Value-Guards:
     - `-127C` Fault -> invalid/error.
     - Erste `85C` nach Boot -> Retrypfad.
     - Range-Check -> `quality=suspect` statt sofort Drop.
   - Lokale Preview-Konversion (`applyLocalConversion`) fuer MQTT-`value`/`unit`.
5. **Publish:** `publishSensorReading()` zu `sensor/{gpio}/data`, QoS 1.
6. **Cache/Persistenz:** Value-Cache wird immer aktualisiert, auch wenn MQTT offline ist.
7. **Fehlerpfade:** OneWire timeout/CRC/fault, analog read guard failures (GPIO0, ADC2 mit WiFi), CB-OPEN bei 10 Fehlern.
8. **Safety/Offline:** Offline-Rules lesen `getSensorValue()`; stale >5 min liefert NaN.
9. **Besonderheit:** `last_reading` wird vor Messversuch gesetzt (Backoff bei Fehler, kein sofortiges Flood-Retry).

## FW-SENSOR-FLOW-003 - Kontinuierliche Multi-Value I2C Messung

1. **Sensorklasse:** I2C multi-value (`sht31`, `bmp280`, `bme280`).
2. **Registrierung/Init:**
   - I2C-Bus muss initiiert sein.
   - Adresskonflikte gegen fremden Device-Typ werden abgelehnt.
   - BME/BMP erhalten Init-Sequenz (`ctrl_meas`, bei BME zusaetzlich `ctrl_hum`).
3. **Messzyklus:**
   - In `performAllMeasurements()`: dedup je I2C-Adresse pro Zyklus.
   - Ein I2C-Read erzeugt mehrere `SensorReading` (temp/humidity/pressure).
4. **Datenverarbeitung:**
   - Protokollbasiert ueber `i2c_sensor_protocol`:
     - Command-based (SHT31) mit Conversion-Wait und CRC.
     - Register-based (BMP/BME) Burst-Read.
   - `extractRawValue()` je value_type aus Bytepuffern.
5. **Publish:** je extrahiertem Wert eigener Publish (gleiches GPIO, unterschiedlicher `sensor_type`).
6. **Cache/Persistenz:** Value-Cache pro `(gpio, sensor_type)`.
7. **Fehlerpfade:** Busfehler, Timeout, unvollstaendige Reads, CRC fail, Recovery-Limit erreicht.
8. **Safety/Offline:** bei Read-Fails bleibt letzter Cachewert ggf. bis stale-time aktiv; danach NaN -> Rule-Skip.
9. **Lastprofil:** Multi-Value reduziert Buslast ggü. Einzelreads, aber erzeugt Publish-Bursts pro Messintervall.

## FW-SENSOR-FLOW-004 - On-Demand Sensor Command

1. **Sensorklasse:** alle konfigurierten Sensoren.
2. **Registrierung/Init:** Topic `sensor/+/command` subscribed; Core0: `command_admission` -> `queueSensorCommand` (Tiefe 10; Recovery-Intent optional `SendToFront` bis 20ms).
3. **Messzyklus:** Trigger durch Command `{ "command":"measure" }`, Ausfuehrung auf Core 1.
4. **Datenverarbeitung:** Core1: TTL/Epoch-Check, erneute `command_admission`, dann `triggerManualMeasurement()` wie kontinuierliche Messung.
5. **Publish:**
   - Messdaten normal ueber `sensor/{gpio}/data`.
   - Optional Command-Response auf `sensor/{gpio}/response` (QoS 1) bei `request_id`.
   - Intent-Outcomes (`accepted`/`rejected`/`QUEUE_FULL`/`expired`) parallel ueber Intent-Outbox.
6. **Cache/Persistenz:** wie Normalpfad.
7. **Fehlerpfade:** invalid topic/json, unbekannter command, admission reject, Queue full (Outcome+ErrorTracker), TTL/Epoch expired, Messfehler.
8. **Safety/Offline:** keine direkte Aktorik; indirekt relevant fuer Value-Cache-Aktualitaet.
9. **P1.2 Delta:** Queue-full und Admission sind serverseitig ueber Intent-Outcomes beobachtbar; Publish-Pfad bleibt drop-anfaellig.

## FW-SENSOR-FLOW-005 - Value-Cache zu Offline-Rule Evaluation

1. **Sensorklasse:** alle, aber rules fuer `ph/ec/moisture` lokal geblockt.
2. **Registrierung/Init:** Offline-Rules aus Config/NVS (`offline_mode_manager`).
3. **Messzyklus:** bei `OFFLINE_ACTIVE` alle 5 s `evaluateOfflineRules()` auf Core 1.
4. **Datenverarbeitung:**
   - `sensorManager.getSensorValue()` mit stale-check (5 min).
   - `NaN` -> Rule-Skip.
   - Time-filter + day-mask optional.
5. **Publish:** kein Sensorpublish hier; Aktorsteuerung via `actuatorManager`.
6. **Cache/Persistenz:** Rule `is_active` partiell in NVS gespiegelt; `server_override` nur transient in RAM.
7. **Fehlerpfade:** fehlende/schlechte Werte, calibration-required guard, actuator control fail.
8. **Safety/Offline:** zentraler Fallbackpfad; bei calibration-required wird Aktor erzwungen OFF.
9. **P1.2 Delta:** `server_override` ist explizit implementiert (server command in OFFLINE_ACTIVE setzt Rule-Bypass pro Aktor).

## FW-SENSOR-FLOW-006 - Publish Pipeline Core1 -> Core0 -> Broker -> Server

1. **Sensorklasse:** alle publizierenden Sensorreads.
2. **Registrierung/Init:** MQTT verbunden, Registration-Gate offen (oder Timeout-Fallback).
3. **Messzyklus:** Publish-Aufruf aus Sensorpfad auf Core 1.
4. **Datenverarbeitung:** Payload-Build inkl. `esp_id`, `seq`, `zone_id`, `subzone_id`, `raw`, `value`, `unit`, `quality`, `ts`, `time_valid`, `raw_mode`, optional Adresse.
5. **Publish:**
   - Core 1: enqueue `g_publish_queue` (Tiefe 15, non-blocking).
   - Core 0: `processPublishQueue()` ruft `esp_mqtt_client_publish`.
6. **Cache/Persistenz:** Sensor-Value-Cache wird vor MQTT-Check aktualisiert.
7. **Fehlerpfade:** queue full drop, MQTT outbox full (`msg_id=-2`), disconnected drop.
8. **Safety/Offline:** Offline-Regeln bleiben funktionsfaehig durch lokalen Cache trotz Publish-Ausfall.
9. **P1.2 Delta:** Drop-Risiko im Publish-Pfad bestaetigt.

## 4) Triggerquellen und Timing

- **Zyklisch:** `safetyTask` (10 ms Loop), darin Sensor-Intervall je Sensor (1..300 s aus Config).
- **Event-Trigger:**
  - Sensor command queue (`sensor/+/command`).
  - Config queue (Aenderung von Sensorparametern, Modus, Intervall, Adressen).
  - Offline evaluation timer (5 s) im OFFLINE_ACTIVE Overlay.
- **Guard-Zeiten und Timeouts:**
  - OFFLINE activation delay: 30 s.
  - OneWire retry delay: 100 ms, bis 3 Versuche.
  - I2C mutex timeout: 250 ms.
  - I2C recovery cooldown: 60 s, max 3 recoveries.
  - Value-Cache stale: 300000 ms.

## 5) Verwerf-/Cache-/Retry-/Fehler-Markierungslogik

- **Verwerfen (Drop):**
  - Sensor command queue full: `queueSensorCommand` false, Log + ErrorTracker + Intent-Outcome `QUEUE_FULL` auf Core0.
  - Publish queue full (`queuePublish` false).
  - MQTT outbox full (`esp_mqtt_client_publish == -2`).
  - Ungueltige Sensor command topics/payloads.
  - DS18B20 fault (`-127C`) und bestimmte Retry-Fehler.
- **Cachen:**
  - Immer `updateValueCache()` vor MQTT publish check.
  - Offline eval arbeitet ausschliesslich auf Cache.
- **Retry/Backoff:**
  - DS18B20 Read retry.
  - I2C Bus-Recovery + retry bei Busfehlern.
  - Sensor Circuit-Breaker (OPEN/HALF_OPEN/CLOSED).
  - Messintervall-Backoff durch vorgezogenes `last_reading`.
- **Fehlerhaft markieren:**
  - `quality="error"` bei DS18B20 Faultfaellen.
  - `quality="suspect"` bei Out-of-range.
  - Sonst default `quality="good"` lokal; finale Guete serverseitig.

## 6) Legacy-No-Task Pfad (P1.2 Delta)

Im Legacy-Pfad ohne Task-Erzeugung entfaellt die saubere Core-Trennung (Core0/1 Queue-Disziplin). Dadurch:
- andere Latenzen fuer Command- und Messpfade,
- andere Race-Charakteristik als im dual-core Normalbetrieb,
- Analyseergebnisse dieses Dokuments gelten primaer fuer den regulären Task-Betrieb.

## 7) Block E - Hand-off Fragen fuer P1.4/P1.5/P1.6 (priorisiert)

1. **P1.4:** Soll Value-Cache (oder Teil davon) crash-resilient persistiert werden, um NaN-Luecken nach Reboot zu minimieren?
2. **P1.4:** Welche Sensorfelder muessen bei Config-Update atomar mit NVS committen (inkl. i2c/onewire Identitaet)?
3. **P1.4:** Ist die aktuelle NVS-Schreiblast aus Sensor-/Rule-Transitions langfristig flash-schonend genug?
4. **P1.5:** Ist Queue-full bei Sensor-Commands sicherheitsneutral oder braucht es zwingendes Error-Feedback?
5. **P1.5:** Wie lange darf ein Wert stale sein, bevor Rule-Eval aus Safety-Sicht nicht mehr tolerierbar ist?
6. **P1.5:** Sollte `quality=suspect` lokal bereits Rule-Sperren triggern statt nur serverseitig bewertet zu werden?
7. **P1.5:** Reicht der aktuelle calibration-guard fuer alle ADC-Typen, inkl. Alias-/Migrationsfaellen?
8. **P1.5:** Wie wird verhindert, dass `server_override` bei langen Flaps zu dauerhaftem Rule-Bypass wird?
9. **P1.6:** Braucht die Sensor command queue ein Ack/Nack Protokoll fuer sichere End-to-End Nachverfolgung?
10. **P1.6:** Soll publish queue backpressure adaptive Sampling-Intervalle triggern statt Drops?
11. **P1.6:** Ist Registration-Gate-Fallback (Timeout) fuer Sensor-telemetry verlustkritische Startphasen ausreichend?
12. **P1.6:** Soll `processPublishQueue()` Publish-Rueckgabecodes auswerten und gezielt retryen?
13. **P1.6:** Wie wird Contract-Drift bei Subscription-QoS (Heartbeat-ACK) zwischen Doku und Firmware vermieden?
14. **P1.6:** Braucht Core1->Core0 Publishpfad eine Priorisierung (z. B. sensor data vs. diagnostics)?
15. **P1.4/P1.5:** Welche Minimaldaten sind fuer deterministische Offline-Recovery nach Brownout erforderlich?

## 8) Kurzfazit

Der Sensorpfad ist technisch vollstaendig von Config-Ingestion bis Server-Publish vorhanden und fuer I2C/OneWire robust verhaertet. Die kritischsten Restluecken liegen nicht in der Grundfunktion, sondern in Beobachtbarkeit und Verlustsignalisierung: Publish-Queue/Outbox-Drops ohne dedizierten NACK, parse-fail ohne durchgaengigen negativen Config-ACK, sowie Contract-Drift-Risiken zwischen Doku und effektiver Subscription-Konfiguration (z. B. Heartbeat-ACK Default-QoS 0).
