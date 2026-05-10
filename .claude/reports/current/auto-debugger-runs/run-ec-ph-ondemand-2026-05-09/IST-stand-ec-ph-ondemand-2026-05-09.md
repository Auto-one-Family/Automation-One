# IST-Stand: EC/pH On-Demand-Messung

**Run-ID:** run-ec-ph-ondemand-2026-05-09  
**Linear:** AUT-305  
**Datum:** 2026-05-09  
**Auftragstyp:** Analyse (kein Code-Output)  
**Methode:** Vollständiger Code-Read aller 4 Schichten (ESP32, Server, Frontend, MQTT)  

---

## 1. End-to-End-Sequenzdiagramm

```
Frontend (SensorCard.vue)            Server                  MQTT Broker           ESP32
        |                               |                         |                    |
        | POST /v1/sensors/{esp}/{gpio} |                         |                    |
        |         /measure              |                         |                    |
        |-----------------------------→ |                         |                    |
        |                               | sensor_service.         |                    |
        |                               | trigger_measurement()   |                    |
        |                               | [10s cooldown check]    |                    |
        |                               | publisher.              |                    |
        |                               | publish_sensor_command()|                    |
        |                               | QoS 2 →                 |                    |
        |                               |------ sensor/{gpio}  →→→|                    |
        |                               |        /command         |                    |
        |   HTTP 200 {success, req_id}  |                         |→ sensor/+/command →|
        |←-----------------------------|                         |                    |
        |                               |                         |  queueSensorCommand|
        |                               |                         |  → Core 1          |
        |                               |                         |  handleSensorCommand|
        |                               |                         |  mutex wait ≤10s   |
        |                               |                         |  triggerManualMeasure|
        |                               |                         |  ADC-Sampling      |
        |                               |                         |  publishSensorReading|
        |                               |                         |←←← sensor/{gpio}  ←|
        |                               |                         |        /data QoS 1  |
        | WS: sensor_data event         |                         |                    |
        | → last_read, raw_value update |← sensor_handler        |                    |
        | → finality check: success     |   store to DB           |                    |
        |←-----------------------------|   WS broadcast          |                    |
        |                               |                         |                    |
        |                               |                         |←←← sensor/{gpio}  ←|
        |                               |                         |        /response    |
        |                               |                         |        QoS 1        |
        | WS: calibration_measurement   |← CalibrationResponse   |                    |
        |     _received                 |   Handler               |                    |
        |←-----------------------------|                         |                    |
```

**Wichtig:** Es gibt ZWEI parallele MQTT-Pfade aus dem ESP nach oben:
- `sensor/{gpio}/data` → standard `sensor_handler` → WS `sensor_data` event
- `sensor/{gpio}/response` → `CalibrationResponseHandler` → WS `calibration_measurement_received`

`SensorCard.vue` (AUT-298) monitort nur `sensor_data` (via `last_read`/`raw_value`-Änderungen). Die 10s-Finality-Watch hängt damit ausschließlich am `sensor/{gpio}/data`-Pfad.

---

## 2. Layer-Inventar

### 2.1 ESP32-Firmware

| Komponente | Datei:Zeile | Funktion |
|---|---|---|
| `triggerManualMeasurement()` | `sensor_manager.h:131` | Entry-Point, `timeout_ms=5000` default |
| `handleSensorCommand()` | `main.cpp:4345–4430` | MQTT-Command-Parser, Dispatcher auf Core 1 |
| `manual_measure_busy_[]` | `sensor_manager.h:188`, `sensor_manager.cpp:1578` | Per-Sensor busy flag (AUT-303) |
| Mutex-Wait | `sensor_manager.cpp:1597–1605` | `g_sensor_mutex`, Timeout 10s (`kManualSensorMutexWaitMs`) |
| 5s-Guard | `sensor_manager.cpp:1619–1622` | POST-HOC (kein Abbruch, nur Markierung) |
| `applyLocalConversion()` | `sensor_manager.cpp:159–186` | EC/pH → raw ADC passthrough (`(float)raw_value`) |
| ADC2-Konflikt-Guard | `sensor_manager.cpp:1701–1705` | `return 0` wenn WiFi+ADC2 |
| `VALUE_CACHE_STALE_MS` | `sensor_manager.h:196` | 5 Minuten Cache-Ablauf |
| `operating_mode "on_demand"` | `sensor_manager.cpp:1402–1404` | Überspringt periodische Messung |
| Response-Publish | `main.cpp:4365–4405` | Publiziert auf `sensor/{gpio}/response` (nur wenn `request_id` gesetzt) |
| MQTT Subscription | `main.cpp:676–678` | Wildcard `sensor/+/command`, QoS 2 |
| `clean_session=true` | `mqtt_client.cpp:335` | Pendant QoS-2-Commands gehen bei Disconnect verloren |

### 2.2 Server

| Komponente | Datei:Zeile | Funktion |
|---|---|---|
| REST-Endpoint | `api/v1/sensors.py:1739–1793` | `POST /v1/sensors/{esp_id}/{gpio}/measure` |
| `trigger_measurement()` | `sensor_service.py:546–626` | Cooldown-Check + Publisher-Aufruf |
| Cooldown-Guard | `sensor_service.py:37–42, 601–610` | 10s pro `(esp_id, gpio)`, Modul-Level-Dict |
| `publish_sensor_command()` | `mqtt/publisher.py:111–159` | Fire-and-Forget, QoS 2, gibt `request_id` zurück |
| `CalibrationResponseHandler` | `mqtt/handlers/calibration_response_handler.py` | Empfängt `sensor/{gpio}/response` → WS broadcast |
| Calibration-Guard | `core/config_builder.py:211, 1027` | Betrifft NUR Offline-Threshold-Rules, NICHT On-Demand-Wert |
| `data_source` | `db/repositories/sensor_repo.py:374` | On-Demand: `"production"` (identisch zu Continuous) |
| AUT-299 EC-Fix 08.05. | `services/calibration_service.py` | ATC-Richtung fix: `multiply` statt `divide` |
| `MeasurementBusyError` | `sensor_service.py` | HTTP 429 bei aktivem Cooldown |
| CommandBridge | `services/mqtt_command_bridge.py:60` | 15s asyncio.wait_for — **NICHT** für Sensor-Commands genutzt |

### 2.3 Frontend

| Komponente | Datei:Zeile | Funktion |
|---|---|---|
| `SensorCard.vue` Measure-Button | `components/devices/SensorCard.vue:307–341` | Primärer Button im /sensors-Tab, 10s Timeout + Finality-Watch (AUT-298) |
| `SensorValueCard.vue` Measure-Button | `components/esp/SensorValueCard.vue:85–112` | Älterer Pfad, kein Timeout, nur 2s busy |
| `EditSensorModal.vue` Measure-Button | `components/esp/EditSensorModal.vue:207–220` | Nutzt `espStore.setSensorValue` — **abweichender Pfad** |
| `SensorSatellite.vue` | `components/esp/SensorSatellite.vue` | Kein Measure-Button — reine Wertanzeige |
| `triggerMeasurement()` API | `api/sensors.ts:222–230` | `POST /sensors/{espId}/{gpio}/measure` |
| 10s-Frontend-Timeout | `SensorCard.vue:317` | `setTimeout(() => { measureState = 'error' }, 10_000)` |
| Finality-Watch | `SensorCard.vue:285–303` | Überwacht `last_read`-Änderungen nach Trigger-Zeit |
| WS-Matching | `shared/stores/sensor.store.ts:120–144` | Hierarchie: `config_id` > `gpio+sensor_type` > address |

### 2.4 MQTT

| Topic | Richtung | QoS | Zweck |
|---|---|---|---|
| `kaiser/god/esp/{id}/sensor/{gpio}/command` | Server→ESP | 2 | On-Demand-Trigger |
| `kaiser/god/esp/{id}/sensor/{gpio}/data` | ESP→Server | 1 | Messwert (periodic + on-demand) |
| `kaiser/god/esp/{id}/sensor/{gpio}/response` | ESP→Server | 1 | Outcome (nur wenn `request_id` gesetzt) |

---

## 3. Antworten auf die 5 Symptome

### Symptom 1: pH — "läuft ziemlich gut"

**Diagnose: Kein systemisches Problem im Code-Pfad identifiziert.**

pH ist ein analoger Sensor: ESP liefert 12-bit ADC-Rohwert (0–4095) per `(float)raw_value` Passthrough. Server-seitige pH-Library konvertiert in pH-Einheiten. Der Messfluß ist identisch zu EC. Die verbleibenden Robustheitsfragen (ADC2-Pin, Settling-Time) gelten für pH genauso — siehe Symptom 5 und Hardware-Abschnitt.

### Symptom 2: EC=0 in hartem Leitungswasser → ESP disconnected (08.05.)

**Diagnose: Zwei separate Ursachen.**

**Ursache A — EC=0-Wert:** Der Bug war bekannt (AUT-299). Die EC-Kalibrierung hatte die ATC-Richtung invertiert: Server-Code in `calibration_service.py` dividierte statt zu multiplizieren. Fix committed 2026-05-08. EC=0 kann auch entstehen wenn der Sensor auf einem **ADC2-Pin** liegt und WiFi aktiv ist — der Firmware-Guard gibt dann still `return 0` zurück ohne Fehler-Log auf Applikationsebene (`LOG_E` geht in den Serial-Monitor, aber kein MQTT-Event).

**Ursache B — Disconnect:** Der ESP-Disconnect ist durch den verfügbaren Code-Stand **nicht kausal erklärbar**. Mögliche Kandidaten: WDT durch blockierenden ADC-Read (ADC2+WiFi → interne ESP-IDF-Exception?), Stack-Overflow bei Mesh von Mutex-Wait + Messung, oder ein unabhängiger MQTT-Keepalive-Timeout. Für finale Klärung: Serial-Log vom 08.05. analysieren (esp32-debug).

### Symptom 3: "Messen"-Button → häufig Fehler-Anzeige, Wert kommt nicht an

**Diagnose: Mehrere Failure-Pfade, zwei besonders wahrscheinlich.**

**Failure-Pfad 1 — Race zwischen ESP-Mutex und Frontend-Timeout (KRITISCH):**
```
Frontend 10s-Timeout (SensorCard.vue:317)
      vs.
ESP: g_sensor_mutex-Wait ≤10s (kManualSensorMutexWaitMs)
   + ADC-Sampling-Zeit (n Samples mit Warmup)
   + Publish-Zeit
```
Worst-case: Periodic-Measurement hält Mutex gerade, On-Demand-Request wartet 10s, Messung läuft dann an, WS-Daten kommen bei **>10s Gesamtdauer** nach dem Frontend-Timeout an. Frontend zeigt "Fehler", obwohl Messung erfolgreich war und Wert in DB landet.

**Failure-Pfad 2 — MQTT-Connectivity (PUBLISH_SKIPPED):**
Wenn ESP kurz disconnected ist: `result.publish_ok = false` → `sensor/{gpio}/data` wird NICHT gepublished → Frontend erhält kein `sensor_data` WS-Event → 10s Timeout → Fehler. Der Wert ist im ValueCache des ESP vorhanden, aber nie persistiert.

**Failure-Pfad 3 — Server Busy (HTTP 429):**
Zweiter Klick innerhalb 10s Cooldown-Fenster → `MeasurementBusyError` → HTTP 429 → `catch`-Block in `SensorCard.vue:334` → Toast "Messung fehlgeschlagen", kein Retry.

**Failure-Pfad 4 — SensorValueCard.vue-Bug:**
In `SensorValueCard.vue`: kein Timeout, kein Finality-Check. Toast "Messung gestartet" erscheint bei HTTP 200, unabhängig ob Wert je ankommt. Bei Connectivity-Problemen: Button wird nach 2s wieder aktiv, kein Fehler sichtbar. **Divergentes Verhalten** je nach dem welche Vue-Komponente gerade gerendert wird.

### Symptom 4: 5s-Timeout vom Server nicht respektiert — Race Condition

**Diagnose: Konzeptionelles Missverständnis zwischen zwei verschiedenen Timeouts.**

Der **5000ms-Default** im Firmware-Parameter `triggerManualMeasurement(gpio, timeout_ms=5000)` ist ein **Post-hoc-Guard** (kein aktiver Abbruch). Der Code prüft NACH der Messung ob `elapsed > timeout_ms` und markiert das Ergebnis mit `timeout_reached = true`. Die Messung selbst wird nicht abgebrochen.

Der **10s-Mutex-Wait** (`kManualSensorMutexWaitMs`) ist der echte Blocking-Timeout auf ESP-Seite.

Der **Server sendet keinen `timeout_ms`-Wert im Payload** (publisher.py:138–145 — kein `timeout_ms`-Feld). Der ESP nutzt immer den Default von 5s als Markierung.

Der **Frontend-Timeout** (10s in SensorCard.vue) ist unabhängig vom ESP-Timeout und bezieht sich auf den Eingang des `sensor_data` WS-Events, nicht auf die ESP-Messdauer.

**Race-Window (konkret):**
```
t=0:  Frontend sendet POST → HTTP 200 → Frontend startet 10s-Timer
t=0:  Server publiziert MQTT QoS-2-Command → ESP empfängt
t=0:  ESP queued in g_sensor_cmd_queue → Core 1 verarbeitet
t=0..10s: ESP wartet auf g_sensor_mutex (Periodic-Messung hält Mutex)
t=10s: Frontend-Timeout feuert → "Kein Messwert erhalten"
t=10s: ESP erhält Mutex, startet Messung (zu spät für Frontend)
t=11..15s: ESP misst, publiziert Daten
```
Die `sensor_data` WS-Daten kommen NACH dem Frontend-Timeout an und aktualisieren den Store still — der Wert landet in der DB und im UI-Store, aber Frontend hat bereits "Fehler" angezeigt.

### Symptom 5: Eingewöhnungs-Effekt (erste Messung nach Eintauchen falsch)

**Diagnose: Kein Settling-Time-Mechanismus im System vorhanden. Hardware-Limitation.**

DFRobot DFR0300 V2 benötigt mindestens 800ms Stabilisierungszeit nach Eintauchen in eine neue Lösung. Weder Firmware noch Server noch Frontend haben eine Warming-Up-Logik:

- **ESP:** `triggerManualMeasurement()` misst sofort nach Empfang des Commands (kein Delay, kein Warmup-Sample)
- **Server:** `sensor_service.trigger_measurement()` hat keinen `warmup_delay_ms`-Parameter
- **Frontend:** Kein "Bitte warten..." nach Eintauchen-Hinweis

Das System hat keine Idee vom physikalischen Zustand des Sensors. Der erste Wert wird blind verarbeitet, als wäre er stabil.

---

## 4. Hardware-Verifikation

### ADC-Pin-Konflikt (WiFi + ADC2)

Die Firmware hat einen expliziten Guard in `sensor_manager.cpp:1701–1705`:
```cpp
if (gpio_manager_->isADC2Pin(gpio)) {
    if (WiFi.isConnected() || WiFi.getMode() != WIFI_OFF) {
        LOG_E(TAG, "GPIO X is on ADC2 - cannot read while WiFi is active!");
        return 0;  // Silent zero — kein MQTT-Fehler-Event
    }
}
```

**ADC2-Pins (gesperrt wenn WiFi aktiv):** GPIO 0, 2, 4, 12, 13, 14, 15, 25, 26, 27

**ADC1-Pins (sicher):** GPIO 32–39

Die Firmware hat **keine hardcodierten GPIO-Nummern für EC/pH** — die GPIOs kommen aus der Server-Config (NVS). Ob der produktive ESP_6B27C8 pH/EC auf ADC1 oder ADC2 hat, ist **nur in der DB verifizierbar** (Tabelle `sensor_configs`, Spalte `gpio`).

**User-Hand erforderlich:** DB-Query `SELECT gpio, sensor_type FROM sensor_configs JOIN esp_devices ON ... WHERE device_id = 'ESP_6B27C8'` — dann prüfen ob GPIO in der ADC2-Liste liegt.

---

## 5. Trennliste: Bugs / Findings / Hardware-Limitierungen

### Bugs (Code-Defekte, behebbar)

| ID | Schwere | Symptom | Root Cause | Datei:Zeile |
|---|---|---|---|---|
| **BUG-1** | KRITISCH | Fehler-Anzeige obwohl Messung erfolgreich | ESP-Mutex-Wait ≤10s + ADC-Zeit > Frontend-Timeout 10s → Race | `SensorCard.vue:317` vs `sensor_manager.cpp:1597` |
| **BUG-2** | HOCH | SensorValueCard zeigt nie Fehler bei fehlendem Wert | Kein Timeout, kein Finality-Check — nur 2s busy | `SensorValueCard.vue:88–112` |
| **BUG-3** | MITTEL | EditSensorModal nutzt anderen Code-Pfad | `espStore.setSensorValue` statt `sensorsApi.triggerMeasurement` — verhält sich anders | `EditSensorModal.vue:207–220` |
| **BUG-4** | MITTEL | On-Demand-Daten nicht unterscheidbar von periodischen | `data_source = "production"` für beide Typen | `sensor_repo.py:374`, `sensor_handler.py:434` |
| **BUG-5** | NIEDRIG | 5s-Timeout ist kein echter Abbruch | Post-hoc-Guard, kein `vTaskDelay`-Abbruch | `sensor_manager.cpp:1619` |

> BUG-1 ist wahrscheinlich die Haupt-Ursache für Symptom 3 ("häufig Fehler-Anzeige").

### Findings (Architektur-Lücken, kein direkter Defekt)

| ID | Bereich | Beschreibung |
|---|---|---|
| **F-1** | ESP+Server | `clean_session=true` → QoS-2-Measure-Commands gehen bei Disconnect verloren. Server-seitig kein ACK-Wait (CommandBridge wird nicht genutzt). |
| **F-2** | Frontend | Drei voneinander abweichende Measure-Button-Implementierungen (SensorCard, SensorValueCard, EditSensorModal) — keine gemeinsame Composable-Schicht. |
| **F-3** | Server | `_measure_cooldown`-Dict ist unbounded (kein Cleanup bei ESP-Removal) — Modul-Level Memory-Growth bei vielen ESP-Einheiten. |
| **F-4** | Server+ESP | Server sendet keinen `timeout_ms`-Wert im Command-Payload → ESP nutzt immer Default 5000ms als Post-hoc-Marker, egal wie lange Messung wirklich dauert. |
| **F-5** | Frontend | `SensorCard.vue` Finality-Watch erkennt nicht ob das eingehende `sensor_data` WS-Event vom On-Demand-Trigger oder einer gleichzeitigen Periodic-Messung stammt. |

### Hardware-Limitierungen (nicht durch Code behebbar)

| ID | Sensor | Beschreibung | Empfehlung |
|---|---|---|---|
| **HW-1** | EC, pH | ADC2-Pins gesperrt wenn WiFi aktiv → `return 0` ohne App-Level-Error | GPIO 32–39 (ADC1) verwenden |
| **HW-2** | EC (DFR0300 V2) | Min. 800ms Settling-Time nach Eintauchen — System hat kein Warming-Up-Modell | Server-seitig `warmup_delay_ms`-Parameter + ESP-seitig pre-sample-Delay |
| **HW-3** | EC | Erster-Wert-Effekt: Erste Messung nach Lösungs-Wechsel liefert Mischkonzentration | Mindestens 2–3 Samples mit Abstand nehmen, Median verwenden |

---

## 6. Offene Unklarheiten (User-Hand oder Logs erforderlich)

| # | Frage | Warum offen | Klärungspfad |
|---|---|---|---|
| 1 | Liegen pH/EC-Sensoren auf ADC1 oder ADC2-Pins? | GPIO-Config nur in DB | DB-Query auf `sensor_configs` für ESP_6B27C8 |
| 2 | Was war Disconnect-Ursache 08.05.? | Kein Serial-Log analysiert | Serial-Log 08.05. → esp32-debug |
| 3 | Ist EC-AUT-299-Fix end-to-end wirksam? | Fix committed, aber live-verify offen | Messung mit bekannter Lösung (EC-Standard 1413 µS/cm) |
| 4 | Welcher Measure-Button wird von Robin genutzt? | Drei verschiedene Orte im UI | Klärung: /sensors-Tab (SensorCard) oder HardwareView (SensorValueCard)? |

---

## 7. Empfehlungen (für folgende Issue-Anlage)

Priorität für Folgemaßnahmen (ohne Scope hier zu öffnen):

1. **P0 — BUG-1:** Frontend-Timeout (10s) an ESP-Realzeiten anpassen oder Finality via `sensor/{gpio}/response` (nicht nur `sensor_data`) implementieren. Ziel: Konsistente User-Rückmeldung.
2. **P1 — BUG-2/3:** `SensorValueCard.vue` und `EditSensorModal.vue` auf gemeinsame Composable-Logik (SensorCard-Finality-Pattern) vereinheitlichen.
3. **P1 — HW-1:** ADC1-Pin-Verifikation für alle analogen Sensoren (DB-Query + ggf. Kabel-Änderung).
4. **P2 — HW-2/3:** Settling-Time-Support einführen: `warmup_delay_ms` im MQTT-Command-Payload + ESP-seitiger Pre-Sample-Delay.
5. **P2 — F-1:** Server-seitiger Command-Timeout via `calibration_response_handler` oder eigenen Tracking-Mechanismus (kein CommandBridge-Umbau nötig — bestehender `request_id`-Pfad nutzen).

---

*Erstellt: 2026-05-09 | TM-Analyse (4 parallele Code-Agenten: ESP32, Server, Frontend, MQTT) | AUT-305*
