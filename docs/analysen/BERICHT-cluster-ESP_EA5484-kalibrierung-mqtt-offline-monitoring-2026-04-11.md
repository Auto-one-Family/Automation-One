# Bericht: Cluster ESP_EA5484 — Kalibrierung (UI), Bodenfeuchte-Schwankungen, MQTT/TLS-Offline

**Gerät:** `ESP_EA5484` (MAC-Endung EA:54:84, ESP32 Dev/WROOM im Kontext deiner Logs)  
**Bezug:** `auto-debugger`-Orchestrierung (Agent `.claude/agents/auto-debugger.md`) — Analyse ohne Produktcode-Änderung in diesem Bericht  
**Quellen:** Serial-Auszug (User), `docker logs automationone-server` / `automationone-mqtt`, PostgreSQL `sensor_configs`, Loki `/ready` (Abfrage-Syntax/Labels: siehe Abschnitt Monitoring)

---

## 1. Executive Summary

| Frage | Kurzantwort |
|-------|-------------|
| Ist das Gerät wegen **„zu vielen Sensoren“** offline gegangen? | **Unwahrscheinlich als Hauptursache.** Heap bleibt mit ~41–57 kB frei / max alloc ~38.9 kB stabil; kein typisches OOM-Muster. |
| Warum **MQTT/TLS-Timeout** und **LWT**? | **Transport/Keepalive/Blockade:** zuerst `Writing didn't complete … errno=119` (Schreib-Timeout laut MQTT-Client), danach Disconnect, Reconnect mit `ESP_ERR_ESP_TLS_CONNECTION_TIMEOUT`. Mosquitto meldete **`exceeded timeout`** für den Client — konsistent mit **nicht rechtzeitigem MQTT-Verkehr** (Netz, Broker-Last, oder **längere Blockaden** auf dem ESP). |
| Warum **schwankende Bodenfeuchte** trotz Kalibrierung? | Server-Logs zeigen **extreme Rohwert-Sprünge** auf **demselben GPIO 32** (z. B. 2111 → 3706 → 1430) **innerhalb kurzer Zeit** → **Messgröße / Verkabelung / ADC-Randbedingungen**, nicht die Anzahl paralleler Sensoren. Zusätzlich zeigt die Firmware **`raw=4095` (saturiert)** — **offener/fehlerhafter ADC-Pfad** in Messmomenten. |
| ERRTRAK nach Fix? | **`[3014] [COMMUNICATION]`** — erwartungsgemäß nach PKG-01 (kein 6014/UNKNOWN mehr). |

---

## 2. Zeitliche Korrelation (Serial ↔ Server ↔ Broker)

### 2.1 Serial (User-Auszug, gekürzt)

1. Regelmäßige Heartbeat-ACKs, Config-Reloads, **manuelle Messung GPIO 32** (`sensor/32/command`, `timeout_ms=5000`).
2. **`ADC rail on GPIO 32: raw=4095`** während manueller Messung.
3. Kurz darauf: **`MQTT_CLIENT: Writing didn't complete in specified timeout: errno=119`**, `MQTT_EVENT_ERROR`, **`MQTT_EVENT_DISCONNECTED`**, CircuitBreaker, **`ERRTRAK [3014] [COMMUNICATION]`**, SafePublish-Retry-Fails, Publish-Skips.
4. Reconnect-Versuche: **`esp-tls: select() timeout`**, `ESP_ERR_ESP_TLS_CONNECTION_TIMEOUT`, erneute Disconnects.
5. Nach **30 s Grace:** **`OFFLINE_ACTIVE`**, Offline-Regeln für Aktor GPIO 25.
6. Throttle: **`Error 3014: 2 occurrences suppressed in last 60s`** (F8-Verhalten).

### 2.2 Server (`docker logs automationone-server`, gefiltert)

Relevante Kette (Zeitstempel **Container-Uhr**, bei dir im Sample **2026-04-10 ~22:41–22:44** — bei Abweichung zur Wanduhr: Container/Systemzeit prüfen):

- Normale Sensorverarbeitung **ESP_EA5484** (SHT31 auf GPIO 0, DS18B20 GPIO 4, **Feuchte GPIO 32**).
- **Feuchte Rohwerte schwanken stark**, z. B.:
  - `raw=2111` → `processed=64.1 %` quality **good**
  - `raw=3706` → `processed=0.0 %` quality **poor**
  - `raw=1430` → `processed=100.0 %` quality **poor**
  - Kalibrier-Session: `raw=1822` → `processed=81.1 %` quality **fair**
- **Kalibrierungsflow:** viele **`POST /api/v1/sensors/ESP_EA5484/32/measure`** in wenigen Sekunden (Burst), **`CalibrationResponseHandler`** mit Session `5600ca82-…`, danach **`User aborted calibration flow`** (DELETE Session), **neue Session** `24b72132-…`.
- **LWT:** `ESP_EA5484 disconnected unexpectedly (reason: unexpected_disconnect)` → Gerät **offline** serverseitig.

### 2.3 MQTT-Broker (`docker logs automationone-mqtt`)

- `Client ESP_EA5484 [172.19.0.1:54244] disconnected: **exceeded timeout**` — klassisch **Keepalive/Ping nicht rechtzeitig** oder **Socket hängt** (Netz oder Client blockiert).

---

## 3. Fehler- und Warnungs-Inventar („Cluster“)

### 3.1 Firmware / Serial (ESP-IDF + App)

| # | Quelle | Level | Text / Code | Einordnung |
|---|--------|-------|-------------|------------|
| 1 | SENSOR | WARN | `ADC rail on GPIO 32: raw=4095 (disconnected or saturated)` | ADC-Eingang hochohmig/kurz offen oder falsch beschaltet; kein SW-Bug allein. |
| 2 | MQTT_CLIENT (IDF) | ERROR | `Writing didn't complete in specified timeout: errno=119` | Schreib-Timeout auf dem Socket (ESP-IDF-Meldung); oft Vorbote des Broker-Disconnects — **errno-Zahl plattform-/LWIP-spezifisch**, nicht blind mit POSIX-`ETIMEDOUT` gleichsetzen. |
| 3 | mqtt_client.cpp | ERROR | `MQTT_EVENT_ERROR type=1`, `TCP transport error: 0 (esp_err=ESP_OK)` | Transportfehler-Pfad; `ESP_OK` irreführend, trotzdem Fehlerkontext. |
| 4 | MQTT | WARN | `MQTT_EVENT_DISCONNECTED` | Verbindungsabbruch. |
| 5 | CBREAKER | WARN | `CircuitBreaker [MQTT]: Failure recorded` | Erwartet nach Disconnect. |
| 6 | ERRTRAK | ERROR | `[3014] [COMMUNICATION] MQTT connection lost` | Korrekte Zuordnung (nach ErrorTracker-Baseline-Fix). |
| 7 | MQTT / SAFETY | WARN | `SafePublish failed after retry` | Kein Publish bei abgebrochener Session. |
| 8 | SAFETY-P4 | WARN | Disconnect-Grace 30s → `OFFLINE_ACTIVE` | Policy bei MQTT-Verlust mit Offline-Regeln. |
| 9 | SENSOR | WARN | `MQTT not connected, skipping publish` | Folgezustand. |
| 10 | esp-tls / TRANSPORT / MQTT_CLIENT | ERROR | `select() timeout`, `Failed to open a new connection: 32774`, `Error transport connect` | Reconnect scheitert — Netz/Broker/Timing. |
| 11 | mqtt_client.cpp | ERROR | `esp_err=ESP_ERR_ESP_TLS_CONNECTION_TIMEOUT` | TLS-Handshake/Netz nicht rechtzeitig fertig. |
| 12 | ERRTRAK | WARN | `Error 3014: N occurrences suppressed in last 60s` | Rate-Limit (gewollt). |

### 3.2 Server / Datenpfad

| # | Quelle | Level | Inhalt | Einordnung |
|---|--------|-------|--------|------------|
| 13 | sensor_handler | INFO | Feuchte: große `raw`-Sprünge, `quality=poor` bei Randwerten | **Kalibrierung linear**, aber **Eingangssignal instabil** → Ausreißer werden „korrekt“ auf 0%/100% abgebildet. |
| 14 | calibration_service | INFO | `User aborted calibration flow` | Operator/UI — kein Crash. |
| 15 | sensor_service / publisher | INFO | Häufung `Sensor command published: measure … GPIO 32` | **Burst** manueller Messungen — Lastspitze MQTT + ESP-Arbeit. |
| 16 | lwt_handler | WARN | `unexpected_disconnect` | Stimmt mit Broker-Timeout überein. |

### 3.3 Infrastruktur

| # | Quelle | Text | Einordnung |
|---|--------|------|------------|
| 17 | Mosquitto | `disconnected: exceeded timeout` | Broker-seitig: Client als „tot“ erkannt. |

**Hinweis:** Nicht jedes Ereignis ist ein „Bug“ — viele Zeilen sind **Folgewirkungen** eines ersten Transport-Timeouts (#2/#17).

---

## 4. Bodenfeuchte: Warum schwankend trotz Kalibrierung?

### 4.1 IST in der DB (GPIO 32)

Kalibrierung ist **vorhanden** und **finalisiert** (`calibration_session_finalize`), Methode **`linear_2point`**, z. B. Trockenpunkt `raw≈3695 → 0%`, Nasspunkt `raw≈1493 → 100%`, daraus abgeleitete Steigung/Offset.

### 4.2 Warum die Anzeige trotzdem „springt“

- Die **Server-Pipeline** mappt **Roh-ADC linear** auf %; wenn der **Rohwert** zwischen Messungen **physikalisch** stark variiert (Kabel, Kontakt, Versorgung, **WiFi-/I2C-Nebenstellen**, kapazitive Kopplung, falsche Referenz), **muss** die Prozentanzeige springen — die Kalibrierung macht das Signal nicht „magnetisch stabil“.
- **`raw=4095`** auf dem ESP bedeutet praktisch **„kein gültiger Messwert“** (saturiert) — das erklärt auch **Ausreißer** in Richtung Rand der Kalibrierkurve.
- **Anzahl Sensoren:** Mit **5 Konfigurationseinträgen** (inkl. berechnetem VPD) und üblichen Intervallen ist das System **nicht** automatisch überlastet; die beobachteten **Rohwert-Sprünge** sind **nicht** durch „4 echte Sensoren + 1 virtuell“ allein erklärbar ohne Hardware-Signalproblem.

**Empfehlung (Hardware):** GPIO 32 nur mit **geeignetem Spannungsteiler / Sensor-Modul**, kurze Kabel, gemeinsame Masse, ggf. **Mittelwert** in Software (separates Feature) — nicht Teil dieses Berichts.

---

## 5. Ist die Kalibrierung über UI die direkte Offline-Ursache?

**Kausal eher indirekt:**

1. Die UI/API löst **viele manuelle Messungen** und **MQTT-Sensor-Commands** in kurzer Zeit aus (Server-Log).
2. Parallel laufen **Heartbeat, Subscriptions, ggf. Config-Pushes** — MQTT bleibt voll.
3. Der ESP zeigt **Schreib-Timeout** und der Broker **„exceeded timeout“** → typisch für **Keepalive-Verlust** oder **Socket-Stall** (Netz **oder** Client blockiert länger als erlaubt).

**Hypothesen (priorisiert):**

| Prio | Hypothese | Stützung |
|------|-----------|----------|
| H1 | **Netz/Broker/TLS** (WLAN instabil, Broker-CPU, Docker-Host NAT `172.19.0.1`) | TLS-Timeout, Mosquitto-Timeout |
| H2 | **Client-seitige Blockade** (längere ADC-/Sensorpfade, viele gleichzeitige Aktionen) erhöht Risiko für verpasste Keepalives | Burst `measure`, manuelle Messung mit Warnung |
| H3 | **Reine Sensoranzahl** | Kein Heap-Collapse in den Logs; **schwach** |

---

## 6. Monitoring-Stack (Loki / „letzte 20 Minuten“)

- **Loki** antwortet `ready` auf `http://localhost:3100/ready`.
- **Repo-Ist (Labels, kein Raten):** Log-Ingest läuft über **Grafana Alloy**, nicht mehr über die aktive Promtail-YAML. Die Pipeline und die **indexierten Stream-Labels** sind in `docker/alloy/config.alloy` beschrieben und gesetzt: **`compose_service`**, **`container`**, **`stream`**, **`compose_project`** (Docker-Discovery + `discovery.relabel`, vgl. Kommentar „Label Strategy“ und Regeln ab `discovery.relabel "containers"`). Die Datei `docker/promtail/config.yml` ist **archiviert** (Kopfkommentar: durch Alloy ersetzt, nur Referenz).
- **Zuordnung Compose-Service ↔ Container-Name (`container`-Label):** In `docker-compose.yml` heißen die Compose-**Services** `el-servador` ( `container_name: automationone-server` ) und `mqtt-broker` ( `container_name: automationone-mqtt` ). Alloy setzt `compose_service` aus dem Compose-Service-Namen, `container` aus dem Docker-Containernamen (ohne führendes `/`).
- **Typische Fehlerquelle für `parse error` / leere Treffer:** Ein Label **`container_name`** existiert in dieser Pipeline **nicht** — ein Selektor `{container_name="…"}` ist schlecht wartbar bzw. führt je nach Client/Shell zu Syntaxproblemen. In `docs/plans/Debug.md` steht historisch noch `container_name=` in Beispielen; für **dieses** Stack-IST gelten **`container`** oder **`compose_service`**.
- **Beispiel LogQL (ein Fenster, beide Dienste):** Stream-Union über die beiden Compose-Services:
  - `{compose_service=~"el-servador|mqtt-broker"}`
  - Alternativ über Docker-Namen: `{container=~"automationone-server|automationone-mqtt"}`
- **Beispiel-Aufruf (PowerShell, Instant-Query, Limit):**  
  `curl.exe -sG 'http://localhost:3100/loki/api/v1/query' --data-urlencode 'query={compose_service=~"el-servador|mqtt-broker"}' --data-urlencode 'limit=200'`  
  Für ein **Zeitfenster** (z. B. letzte 25 Minuten) `loki/api/v1/query_range` mit `start`/`end` in **Nanosekunden** nutzen oder in Grafana Explore denselben Selektor einsetzen.
- Eine **frühere schnelle curl/LogQL-Variante** in der Episode scheiterte plausibel an **falschem Labelnamen** (`container_name` o. Ä.) und/oder **Shell-Escaping** der Anführungszeichen — nicht daran, dass Loki `/ready` gesund meldet.
- **Pragmatischer IST-Check in deiner Umgebung:** `docker logs automationone-server --since 25m` und `docker logs automationone-mqtt --since 25m` (wie oben) bleibt **zuverlässig**, falls Alloy/Loki nicht erreichbar ist oder kein `query_range`-Zeitfenster gesetzt wurde.
- **Grafana/Prometheus:** Für diesen Bericht **keine** zusätzlichen PromQL-Abfragen ausgeführt; empfehlenswert für Follow-up: `up`, MQTT-Exporter, Container-CPU, **WLAN-RSSI** (falls ihr ESP-Metriken exportiert).

---

## 7. Abgleich mit `auto-debugger.md` (Rolle dieses Berichts)

- **Orchestrierung:** Dieser Bericht ist ein **Lagebild / Querschnitt** (Incident-artig), **ohne** neues `incidents/<id>/`-Ordner-Set anzulegen — du kannst ihn bei Bedarf in einen formalen Run verlinken.
- **Git-Branch:** Keine Codeänderung in diesem Schritt; für Fixes weiterhin **`auto-debugger/work`** laut Agentenregel.
- **Nächste technische Schritte (Vorschlag, nicht ausgeführt):**  
  - WLAN/Router-Log, Broker-Log zum exakten Disconnect-Zeitfenster.  
  - Hardware: GPIO-32-Kette und **4095**-Ereignis eliminieren.  
  - Optional: Server-seitig **Entschärfung** der Kalibrier-UI (Rate-Limit manueller `measure`, sequenzielle Session) — **eigenes TASK-Paket + verify-plan**.

---

## 8. Quellenhinweise (Repo / Commands)

- Firmware MQTT-Fehlerpfad: `El Trabajante/src/services/communication/mqtt_client.cpp` (ca. `MQTT_EVENT_ERROR`, Disconnect).
- I2C-Kommando-Fehler `Wire.endTransmission` → NACK: `El Trabajante/src/drivers/i2c_bus.cpp` (nicht Hauptthema dieses Clusters, aber parallel auf anderem ESP relevant).
- Server Kalibrierung: `src/mqtt/handlers/calibration_response_handler.py`, `src/services/calibration_service.py`, Mess-API `POST .../sensors/{esp}/{gpio}/measure`.

---

## 9. Repo-Verifikation — Measure-Burst (Frontend → REST → MQTT)

**Kontext:** Steuerlauf `STEUER-artefact-ea5484-calibration-measure-burst-mqtt-load-2026-04-11.md` — Pfade relativ zum Repo-Root. **Git-Soll:** `auto-debugger/work` für Folge-Implementierung.

| Schicht | Symbol / Route | Pfad (Repo) | Kurzbeschreibung |
|--------|------------------|---------------|------------------|
| **REST** | `trigger_measurement` | `El Servador/god_kaiser_server/src/api/v1/sensors.py` (`@router.post("/{esp_id}/{gpio}/measure")`, ab ca. Zeile 1649) | Authentifizierung `OperatorUser`, Delegation an `SensorService.trigger_measurement`. |
| **Service** | `SensorService.trigger_measurement` | `El Servador/god_kaiser_server/src/services/sensor_service.py` (ab ca. Zeile 535) | Validiert ESP online + Sensor enabled; ruft `publisher.publish_sensor_command(..., command="measure")` auf; persistiert Intent. |
| **MQTT** | `MQTTPublisher.publish_sensor_command` | `El Servador/god_kaiser_server/src/mqtt/publisher.py` (ab ca. Zeile 108) | Logzeile **`Sensor command published: {command} to {esp_id}/sensor/{gpio}`**; QoS aus `QOS_SENSOR_COMMAND` (**2**, `El Servador/god_kaiser_server/src/core/constants.py` ca. Zeile 209). |
| **Frontend API** | `sensorsApi.triggerMeasurement` | `El Frontend/src/api/sensors.ts` (`POST` ``/sensors/${espId}/${gpio}/measure``, ab ca. Zeile 222) | Zentraler HTTP-Client; Dateikommentar verweist auf `sensors.py` **1649–1695** (`trigger_measurement`) — Stand nach PKG-01. |
| **Kalibrier-UI** | `triggerLiveMeasurement` | `El Frontend/src/composables/useCalibrationWizard.ts` (`triggerLiveMeasurement`) | Startet ggf. Kalibrier-Session, dann `sensorsApi.triggerMeasurement`; nach PKG-01: **ca. 2 s** Sperre nach HTTP-Ende wie `SensorValueCard` (`setTimeout` im `finally`) plus `isMeasuring`-Guard — **kein** serverseitiges Rate-Limit. |
| **Kalibrier-UI** | `@request-measurement` | `El Frontend/src/components/calibration/CalibrationWizard.vue` / `CalibrationStep.vue` | Button **„Messung starten“** / **„Erneut versuchen“** emittiert `request-measurement` → `triggerLiveMeasurement`; UI-Sperre entspricht dem Composable (HTTP-in-flight + Cooldown). |
| **Gerätekarte** | `handleTriggerMeasurement` | `El Frontend/src/components/esp/SensorValueCard.vue` (ab ca. Zeile 78) | Ebenfalls `sensorsApi.triggerMeasurement`; **2 s** Sperre nach Abschluss — gleiches Muster wie Kalibrier-Wizard seit PKG-01. |

**Lücken / Hinweise:** Kein dediziertes Rate-Limiting oder Throttling-Middleware auf `POST …/measure` im Server-Tree gefunden (Stand Repo-Prüfung dieses Laufs). **Kausalität Burst ↔ MQTT-Offline:** weiter nur im Verbund mit Transport-Hypothesen (siehe §5 und STEUER `STEUER-incident-ea5484-mqtt-transport-keepalive-tls-2026-04-11.md`). **Nacharbeit:** PKG-01 (Frontend-Cooldown + `sensors.ts`-Kommentar) auf Branch `auto-debugger/work` — historische Logs in §2 können **vor** dieser Änderung entstanden sein.

**Artefakt-Ordner (Umsetzungsplan):** `.claude/reports/current/auto-debugger-runs/ea5484-calibration-measure-burst-2026-04-11/` (`TASK-PACKAGES.md`, `VERIFY-PLAN-REPORT.md`, `SPECIALIST-PROMPTS.md`).

---

*Bericht erstellt im Kontext deiner Konfigurationsänderungen und der bereitgestellten Logs; Container-Zeitstempel ggf. mit Host-UTC abgleichen.*
