# Beleg — EC/pH On-Demand-Messung IST-Stand-Aufdeckung

**Finding-ID:** ec-ph-ondemand  
**Run-ID:** run-ec-ph-ondemand-2026-05-09  
**Datum:** 2026-05-09  
**Erstellt von:** @automation-experte (Life-Repo)  
**Linear-Issue:** [AUT-305](https://linear.app/autoone/issue/AUT-305/auftragstypanalyse-ecph-on-demand-messung-vollstaendige-ist-stand)  
**Kategorie:** tracing-gap  
**Auftragstyp:** auftragstyp:analyse  

---

## 1. Symptom-Liste (verbatim, Robin 09.05.2026)

1. **pH-Sensor:** laeuft "ziemlich gut" — funktional ok, aber in Gesamtpipeline noch nicht end-to-end verifiziert.
2. **EC-Sensor — 08.05.:** In hartem Leitungswasser hat EC `0` gemessen → **ESP disconnected**. "Weitgehend gefixt" — Fix-Stand und Wirkungs-Verifikation muss TM-seitig geklaert werden (Logs zeigen).
3. **EC-Sensor — 09.05.:** Klick auf "Messen"-Button im Monitor → **haeufig Fehler-Anzeige**, gemessener Wert kommt **gar nicht an**.
4. **Timing-Bug:** ESP hat einen **5-Sekunden-Timeout**, der vom Server-System (oder Frontend?) **nicht respektiert** wird → Race-Condition / vorzeitiger Abbruch / falsches ACK-Handling.
5. **Eingewoehnungs-Effekt:** Erste Messung nach Eintauchen in neue Loesung liefert oft sehr hohen Wert; erst nach ca. 5–10 s Stabilisierungszeit folgt der korrekte Wert. Hat das System eine Idee davon, oder verarbeitet es den ersten Wert blind?

---

## 2. Eingebettetes IoT-Wissen (aus Hub-Reads, verifizierter Architektur-Stand)

**Quellen:** Hub C3 (Sensorik/Kalibrierung), Hub C4 (Fertigation/pH-EC), Hub C1 (MQTT/Echtzeit-Protokoll), MEMORY.md (Architektur-Stand 2026-04-26 / T17-V4 2026-03-10), Recherche-Bericht dfrobot-dfr0300 (2026-05-08).

**HINWEIS:** Alle folgenden Aussagen stammen aus dem verifizierten Life-Repo-Architekturstand. TM muss gegen den aktuellen Auto-one-Code verifizieren.

### 2.1 Firmware-Schicht

- **applyLocalConversion() in `sensor_manager.cpp:60–87`:** Analoge Sensoren (pH, EC, moisture) → **RAW ADC Passthrough `(float)raw_value`**. Kein physikalischer Wert auf Firmware-Seite. Server konvertiert.
- **ValueCache** (20 Slots, 5 min Stale): Speichert immer `processed_value`, auch offline.
- **requiresCalibration():** `strncmp("soil", 4)` — pH und EC fallen unter `CALIBRATION_REQUIRED_SENSOR_TYPES`. Verhalten bei fehlendem Kalibrier-Status waehrend On-Demand: **ungeklaert** (TM aufzudecken).
- **ESP-5s-Timeout (Robins Beobachtung):** Mechanismus (task delay? xTaskNotifyWait? callback timeout?) und Code-Stelle sind **nicht aus Life-Doku ableitbar** — TM per Code-Suche aufdecken.
- **ESP-IDF MQTT `disable_clean_session = 0` (`mqtt_client.cpp:335`):** `clean_session = true`. Bei Disconnect: Broker loescht Session + ausstehende QoS-2-Pakete. Jedes offene On-Demand-Command ist nach Reconnect verloren. Server haelt 15s-Future offen (CommandBridge), ESP empfaengt Command nach Reconnect nie mehr.
- **ADC2 bei WiFi gesperrt:** GPIOs 0, 2, 4, 12–15, 25–27. Falls EC/pH auf ADC2-Pins liegen → Hardware-Designfehler. Recherche-Empfehlung 2026-05-08: GPIO 35 (ADC1) fuer EC, GPIO 36 (ADC1) fuer pH. TM verifiziert im aktuellen Setup.
- **GPIO 0 = I2C-Konvention:** Firmware routet gpio=0 ueber I2C-Bus, kein analogRead(0). EC/pH muessen GPIO != 0 haben.
- **DFRobot DFR0300 V2 Settling-Time:** Hersteller-Spec min. 800 ms nach Eintauchen. Das System hat davon bisher keine Idee (kein Warte-Mechanismus in bekanntem Architekturstand).
- **Disconnect-Trigger 08.05.:** EC=0 in hartem Wasser → ESP disconnected. Ursache (WDT durch blockierenden ADC-Read? Stack-Overflow? Crash-Loop?) nur via Logs/Crash-Dump aufklaerbar.
- **Firmware Sensor-Manager:** Statisches Array `SensorConfig sensors_[MAX_SENSORS]` (10 Slots). Keine Map. Linearer Lookup via `findSensorConfig()` (3 Varianten: GPIO, GPIO+onewire, GPIO+i2c). Mehrere Sensoren pro GPIO grundsaetzlich moeglich.

### 2.2 Server-Schicht

- **P4-GUARD:** `CALIBRATION_REQUIRED_SENSOR_TYPES = {"ph", "ec", "moisture", "soil_moisture"}`. Server-Verhalten bei fehlendem Kalibrier-Status + On-Demand-Wert: **ungeklaert** (verwerfen? persistieren? Warning?).
- **MQTTCommandBridge:** asyncio.Future-basiert, `DEFAULT_TIMEOUT = 15.0s`, Fallback FIFO-Matching. Ob CommandBridge fuer den "Messen"-Button genutzt wird, ist **nicht aus Life-Doku ableitbar** (TM per Code-Suche). 15s-Server-Timeout vs. 5s-ESP-Timeout ist der wahrscheinlichste Race-Candidate.
- **VIRTUAL-Filter (FW-02):** `build_combined_config()` in `config_builder.py` filtert `interface_type='VIRTUAL'` raus (6 Callpoints, ein Filter). VPD wird nie an ESP gepusht. EC/pH sind nicht VIRTUAL — Grenzfall trotzdem pruefen.
- **Persistenz:** `sensor_data`, UNIQUE Constraint `uq_sensor_data_esp_gpio_type_timestamp`. Insert via `ON CONFLICT DO NOTHING`. Bei Sub-1s-Doppel-Messungen → zweite Messung wird still verworfen. Welcher `data_source`-Wert fuer On-Demand-Werte: **ungeklaert**.
- **6 Config-Push-Aufrufer** (sensors.py:766/1058/1203, actuators.py:628/1170, heartbeat_handler.py:1312) — nur Heartbeat hat 120s Cooldown. CRUD-Ops kein Debounce.
- **263 REST-Endpoints, 31 Router-Dateien.** Messen-Endpunkt: noch nicht inventarisiert fuer On-Demand-Sensor-Trigger.

### 2.3 Frontend-Schicht

- **sensorId-Format:** Alle 6 Widgets nutzen 3-teilige IDs `espId:gpio:sensorType`. Legacy-Fallback fuer 2-teilige IDs in allen Parsern.
- **WS-Event SensorDataEvent:** `sensor.store.ts:121–123` matcht nur `gpio + sensor_type`. EC und pH auf demselben ESP → Live-Update trifft ersten Treffer. Fehlend im Event: `config_id`, `onewire_address`, `i2c_address`.
- **sensor_data Metadata:** Aktuell nur `{"raw_mode": true}`. Fehlend: i2c_address, onewire_address → historische Werte nicht nach physischem Sensor differenzierbar.
- **"Messen"-Button im Monitor:** ob REST-Call oder WS-Trigger, Endpunkt, Error-Anzeige-Logik (HTTP-Status vs. CommandBridge-Timeout) — **nicht aus Life-Doku ableitbar** (TM per Code-Suche).

### 2.4 MQTT-Schicht

- **Topic-Schema:** `kaiser/{kaiser_id}/esp/{esp_id}/sensor/{gpio}/data` fuer Sensor-Daten. On-Demand-Command-Topic: **nicht aus Life-Doku ableitbar** (vermutlich `…/system/command` oder `…/sensor/{gpio}/command`).
- **QoS-Regeln (kanonisch):** Actuator Command = QoS 2, no retain. Sensor On-Demand: **nicht spezifiziert**.
- **34 Topics gesamt** (verifiziert AUT-175 E5, 2026-04-26). 11 ESP-Subscriptions (`main.cpp:823–846`). Ob ein On-Demand-Sensor-Topic dabei ist: **nicht aus Life-Doku ableitbar**.
- **Heartbeat:** Intervall 60s, ACK QoS 0. Server-LWT existiert nicht. CONFIG_PUSH_COOLDOWN=45s fuer CRUD-Ops.
- **ORPHANED Topics:** `sensor/batch` + `subzone/status` (Builder vorhanden, kein Publish-Aufruf, kein Server-Handler). Relevant falls On-Demand ueber batch laeuft.

### 2.5 C4 Fertigation — Kontext

- **Inflow vs. Runoff-Trennung:** Nur ueber zwei Sensor-Konfigurationen + Benennung, kein dediziertes Schema-Feld.
- **Kalibrierung in der Oberflaeche lueckenhaft** (C4-Hub §4): Kalibrierdaten eher per API/DB, kein gebahnter UI-Pfad fuer alle Szenarien.
- **EC-Sensor-Wissen aus Recherche 2026-05-08:** DFR0300 V2, AC-Anregung on-board, K=1.0. Tempkomp-Koeffizient in DFRobot_EC.cpp = 0.0185 (aeltere AutomationOne-Doku zitierte 0.02). Server-seitige Konvertierung empfohlen.

---

## 3. Relevante C-Hub-Verweise

| Hub | Cluster | Relevante Sektionen |
|-----|---------|---------------------|
| hub-sensorik-kalibrierung-hardware.md | C3 | §4 Kalibrier-Guard, §5 applyLocalConversion, §6 WS-Event, §8 UNIQUE Constraints |
| hub-fertigation-ph-ec-gaertner.md | C4 | §2 Inflow/Runoff, §4 Operator-Realitaet (Kalibrierung lueckenhaft) |
| hub-mqtt-echtzeit-protokoll.md | C1 | §3 QoS-Regeln, §5 Subscriptions, §6 CommandBridge/Config-Push, §8 Offene Luecken |
| hub-nvs-persistenz-safety-offline.md | C2 | (NVS-Persistenz Sensor-Schema, Safety-Boot-Sequenz) |

---

## 4. Search-vor-Create-Protokoll

Folgende Suchen wurden in Linear durchgefuehrt vor Issue-Erstellung:

| Suchbegriff | Ergebnis |
|-------------|----------|
| "ec on-demand timeout" | 0 Treffer |
| "ec messen button error" | 0 Treffer |
| "ec disconnect leitungswasser" | 0 Treffer |
| "ph ec calibration on demand" | 0 Treffer |
| "ec timeout messen sensor" | 0 Treffer |
| Projekt "pH/EC Fertigation Datenpfad" komplett | 10 Issues, alle Done (AUT-11/12/13/14/15/16/287/288/294/295) |

**Kein bestehendes offenes Issue gefunden.** Neues Issue AUT-305 angelegt.

---

## 5. Linear-Issue

- **ID:** AUT-305
- **URL:** https://linear.app/autoone/issue/AUT-305/auftragstypanalyse-ecph-on-demand-messung-vollstaendige-ist-stand
- **Status:** Backlog
- **Labels:** tracing-gap, auftragstyp:analyse
- **Projekt:** pH/EC Fertigation Datenpfad
- **Prioritaet:** High

---

## 6. Erwartetes Lieferobjekt vom TM

IST-Stand-Dokument: `.claude/reports/current/auto-debugger-runs/run-ec-ph-ondemand-2026-05-09/IST-stand-ec-ph-ondemand-2026-05-09.md`

Inhalt: End-to-End-Sequenzdiagramm + Layer-Inventar + Antworten auf 5 Symptome + Hardware-Verifikation + Trennung Bugs/Findings/Hardware-Limitierungen. Keine Implementierung.

---

*Erstellt: 2026-05-09 | @automation-experte (Life-Repo) | Hub-Reads: C1, C3, C4*
