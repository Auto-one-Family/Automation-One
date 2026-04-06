# Paket 03: ESP32 Sensor Fehler-/Recovery-Matrix (P1.3)

> **Stand:** 2026-04-05  

## 1) Ziel

Fehlerbild -> Detection -> Lokalreaktion -> Publish-Auswirkung -> Offline/Safety-Auswirkung -> Recovery-Bedingung.

Scope: Sensorpfad, Sensor-Commands, Sensor-Publish, rule-relevante Cache- und Config-Pfade.

## 2) Matrix

| Fehlerklasse | Detection (wo/wie) | Lokalreaktion | Auswirkung auf Publish | Auswirkung auf Offline/Safety | Recovery-Bedingung |
|---|---|---|---|---|---|
| Timeout (OneWire Read) | `sensor_manager` (`readRawOneWire` Retry exhausted) | Messung invalid, ErrorTracker Event | kein Sensorpublish fuer diesen Zyklus | Cache bleibt alt, spaeter NaN moeglich -> Rule-Skip | naechster erfolgreicher Read, CB ggf. von HALF_OPEN/CLOSED |
| Timeout (I2C requestFrom) | `i2c_bus` command/register protocol | Fehlerlog + ggf. Bus-Recovery | kein Publish fuer betroffenen Wert/Device | stale cache -> NaN nach 5 min -> Rule-Skip | erfolgreicher Bus-Recovery und Read |
| CRC-Fehler (SHT31 interleaved CRC) | `i2c_bus::validateInterleavedCRC` | ERROR_I2C_CRC_FAILED, Read als fail | kein Publish fuer Read | wie oben, keine frischen Werte | valide Folgemessung |
| CRC-Fehler (OneWire Scratchpad) | `onewire_bus::readRawTemperature` | Read fail + ErrorTracker | kein Publish | stale/NaN Risiko fuer Offline-Rules | naechster fehlerfreier OneWire-Read |
| DS18B20 Sensor Fault (-127C) | `sensor_manager` special-value guard | `valid=false`, `quality=error`, hard fail | Wert wird nicht publiziert | kein Cache-Update fuer neuen Wert | physischer Sensor/BUS wieder ok |
| DS18B20 Power-on 85C erstread | `sensor_manager` first-reading guard | Retry-Read nach Delay | bei Erfolg normal publish, bei Retry-fail kein publish | bei Retry-fail stale/NaN Risiko | erfolgreicher Folgeread |
| Out-of-range DS18B20 | `sensor_manager` range check | `quality=suspect` | publish erfolgt mit suspect | Offline-Rules nutzen `processed_value`, nicht `quality`; potenzielles Blindspot | serverseitige Plausibilisierung oder naechste gute Messung |
| NaN / unavailable Sensorwert im Rule-Eval | `offline_mode_manager` (`isnan(getSensorValue)`) | Rule wird fuer Zyklus geskippt | kein direkter Publish-Effekt | Aktorzustand bleibt unveraendert (hysterese freeze) | frischer Cachewert vor stale timeout |
| Queue full (sensor command queue) | `queueSensorCommand` | Drop: `LOG_W` + `ERROR_TASK_QUEUE_FULL`; Core0 `publishIntentOutcome` `QUEUE_FULL` | kein on-demand publish/response fuer gedroppten Command | indirekt: kein frischer Wert fuer Offline-Eval | Queue entlastet; Command erneut senden |
| Queue full (publish queue Core1->Core0) | `queuePublish` returns false / MQTT warn log | Drop + CB failure count++ | Sensordatenverlust (QoS greift nicht, da nie gesendet) | Value-Cache bleibt lokal vorhanden, Offline-Rules laufen weiter | Queue wieder frei, weitere Publishes erfolgreich |
| MQTT outbox full (-2) | `esp_mqtt_client_publish` return -2 | Drop + CB failure count++ | Sensorpublish verloren | lokaler Cache bleibt; Server sieht Luecken | Broker/Outbox entlastet |
| MQTT disconnected beim publish | `sensor_manager.publishSensorReading` via `isConnected()` | publish skip, nur cache update | kein Sensorpublish | Offline-Rules weiter moeglich durch Cache | reconnect + ACK |
| Config payload zu gross | `routeIncomingMessage` (`CONFIG_PAYLOAD_MAX_LEN`) | reject + `config_response` error | keine neue Sensorconfig | Sensorpfad bleibt auf alter Konfig | valider, kleinerer Config-Push |
| Config queue full | `queueConfigUpdateWithMetadata` / `main.cpp` nach failed enqueue | Drop + warning; Core0 `config_response` QUEUE_FULL + Intent-Outcome | keine Config-Aenderung wirksam | kann stale Rules/Sensorintervalle erhalten | erneuter Config-Push |
| Config JSON parse fail (Queue worker) | `processConfigUpdateQueue` deserialize fail | Handler werden nicht aufgerufen | kein `config_response` guaranteed (bekannte Luecke) | Konfig bleibt alt, Server evtl. ohne negatives Signal | erneuter gueltiger Push |
| Command admission reject (Sensor, Core0) | `shouldAcceptCommand` in `routeIncomingMessage` | kein Enqueue; Intent-Outcome `rejected` | kein Sensor-Command-Execute | kein Cache-Refresh durch Command | Registration/State/Recovery-Intent anpassen |
| Intent TTL/Epoch expired (Core1) | `processSensorCommandQueue` vor Execute | Skip + Outcome `expired` | kein Execute | wie fehlgeschlagene Messung fuer Operatorfluss | neuer Command mit frischem Intent |
| I2C address conflict bei Registrierung | `sensor_manager.configureSensor` | Konfig abgelehnt | kein Sensorpublish fuer neuen Sensor | kein Beitrag zu Rule-Eval | Konflikt beseitigt + neuer Push |
| OneWire duplicate ROM oder bus conflict | `sensor_manager.configureSensor` | Konfig abgelehnt | kein Publish fuer neuen Sensor | kein neuer Cacheeintrag | korrekte ROM/pin Konfig |
| ADC2+WiFi Konflikt bei Analogread | `sensor_manager.readRawAnalog` | Read liefert 0/fail-similar Verhalten | potentiell ungueltige/fehlende Publishes je Typ | Rule-Eval kann unbrauchbare/fehlende Werte sehen | Sensor auf ADC1 oder WiFi-off Testmodus |
| Sensor Circuit Breaker OPEN | `sensor_manager.performAllMeasurements` failure counter >=10 | Sensor wird bis Probeintervall uebersprungen | keine Publishes fuer Sensor waehrend OPEN | Cache altert aus -> NaN -> Rule-Skip | Probe nach 5 min erfolgreich -> CLOSED |

## 3) Mindestfehlerklassen-Abdeckung

- Timeout: abgedeckt (OneWire, I2C).
- CRC/Bus-Fehler: abgedeckt (SHT31 CRC, OneWire CRC, I2C bus error/recovery).
- NaN/ungueltiger Wert: abgedeckt (Value-cache stale/NaN, DS18 fault/out-of-range).
- Queue full: abgedeckt (sensor command, config queue, publish queue, outbox full).
- Config-Inkonsistenz: abgedeckt (payload oversize, parse-fail, queue-drop, Konfliktfehler).

## 4) Kritische Beobachtungsluecken (Prioritaet)

1. Sensor command queue full ist per Intent-Outcome + Log/ErrorTracker sichtbar; dedizierter MQTT-NACK pro GPIO bleibt optional.
2. Config parse-fail im Queue-Worker hat keine durchgaengige negative Server-Rueckmeldung.
3. Offline-Evaluator nutzt keine `quality`-Sperrlogik; nur NaN/stale und calibration guards.
4. Publish queue/outbox Drops sind logbasiert sichtbar, aber ohne dediziertes Delivery-Metrik-Contract.
