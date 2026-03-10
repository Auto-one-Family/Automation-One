# Analyse C: Logging & Rueckverfolgbarkeit — Config Mismatch Loop

**Datum:** 2026-03-10
**Typ:** Code-Analyse (kein Fix, nur Dokumentation des IST-Zustands)
**Zusammenhang:** Analyse C von 3 (A = Firmware-Logik, B = Server-Kommunikation, C = Logging)

---

## C1: ESP Serial Logging

### C1-01: Heartbeat-Generierung

| Aspekt | IST-Zustand |
|--------|-------------|
| **Payload-Logging** | `LOG_D("Published: topic")` in `mqtt_client.cpp:~698-762` — NUR auf DEBUG-Level |
| **sensor_count / actuator_count** | Im Payload eingebaut (Zeile 725-726), aber NICHT explizit geloggt |
| **Erster Heartbeat** | `LOG_I("Initial heartbeat sent for ESP registration")` in `main.cpp:808` — OHNE Payload-Inhalt |
| **Folge-Heartbeats** | **Komplett stumm auf INFO-Level** |
| **MQTT-Publish-Ergebnis** | Nicht geloggt (kein Erfolg/Fehler-Check nach publish()) |

**Luecke:** Heartbeat-Payload (sensor_count, actuator_count, gpio_status) wird nie auf INFO geloggt. Bei Config Mismatch Loop kann man im Serial-Log nicht sehen, welche Counts der ESP meldet.
**Diagnose-Wert:** HIGH — sensor_count/actuator_count sind die Trigger-Werte fuer den Mismatch.

### C1-02: Config-Push-Empfang

| Aspekt | IST-Zustand |
|--------|-------------|
| **Eingangs-Log** | `LOG_I("MQTT message received: <topic>")` — Topic sichtbar, Payload NICHT |
| **Sensor Neu vs. Update** | `sensor_manager.cpp:256` "Updating existing sensor on GPIO X" vs. `:543` "Configured GPIO sensor '...' on GPIO X" — **unterscheidbar** |
| **Actuator-Config** | Geloggt bei Anlage, aber kein removeActuator()-Log vor Neuanlage |
| **config_response** | Existiert (`config_response.cpp:121-124`), loggt `"CFGRESP: success=N failed=N"` auf INFO |
| **Empfangener Payload** | NICHT geloggt — nur Topic |

**Bug-Sichtbarkeit im Config-Empfang:**

| Bug | Sichtbar im Serial? | Details |
|-----|---------------------|---------|
| Bug 1 (Sensor-Akkumulation) | Teilweise | "Updating" vs. "Configured new" sichtbar, aber kein Zaehler der Gesamtanzahl nach Verarbeitung |
| Bug 3 (Actuator Count Drift) | Nicht direkt | Kein Log bei removeActuator() vor Neuanlage, kein actuator_count nach Verarbeitung |

**Luecke:** Empfangener Config-Payload wird nicht geloggt. sensor_count/actuator_count NACH Verarbeitung werden nicht geloggt.
**Diagnose-Wert:** HIGH — ohne Post-Processing-Count kann man nicht verifizieren ob die Config korrekt angewendet wurde.

### C1-03: Actuator-Boot vs. Sensor-Boot

| Aspekt | Sensoren | Aktoren |
|--------|----------|---------|
| **NVS-Load** | `loadSensorConfig()` aufgerufen (main.cpp:2081-2100) | **NICHT aufgerufen** (loadActuatorConfig() existiert in config_manager.cpp:2202, wird nie gecallt) |
| **Boot-Log** | `"Loaded N sensor configs from NVS"` + jeder Sensor einzeln | `"Actuator Manager initialized (waiting for MQTT configs)"` |
| **POST-SETUP** | `"Active Sensors: N"` (main.cpp:2151) | **Kein "Active Actuators: N"** |
| **Count nach Boot** | sensor_count > 0 (aus NVS) | actuator_count = 0 (immer) |

**Luecke:** Die Abwesenheit des "Loaded N actuator configs from NVS" Patterns ist im Serial-Log **direkt erkennbar** — aber nur wenn man weiss wonach man sucht.
**Diagnose-Wert:** HIGH fuer Bug 2 — dies ist der **einzige Ort** wo Bug 2 direkt sichtbar ist.

### C1-04: Serial-Log-Zugang

| Zugangsweg | Verfuegbar? |
|------------|-------------|
| Physische USB-Verbindung (115200 baud) | Ja |
| Wokwi-Terminal (Simulation) | Ja |
| Serial-to-MQTT Bridge | **Nein — existiert nicht** |
| MQTT-basierter Logger | **Nein** — Logger schreibt nur via `Serial.printf()` |
| Error-Events via MQTT | Ja — `errorTrackerMqttCallback` sendet ERROR/CRITICAL strukturiert |

**Blinder-Fleck-Bewertung:**

| Information | Nur ueber Serial? |
|-------------|-------------------|
| Heartbeat-Payload (sensor_count, actuator_count) | Ja (und dort nur auf DEBUG) |
| Sensor/Actuator Boot-Sequenz | Ja |
| Config-Verarbeitungsdetails (neu vs. update) | Ja |
| GPIO-Konflikte, I2C-Fehler | Ja |
| NVS-Load-Ergebnisse | Ja |
| WiFi/MQTT-Verbindungsaufbau | Ja |

**Fazit C1:** ESP Serial ist der **informationsreichste Logging-Kanal**, aber **remote nicht zugaenglich**. Kein MQTT-basierter Log-Stream. Heartbeat-Payload auf INFO stumm.

---

## C2: MQTT-Logger Service

### C2-01: Topic-Subscriptions

| Aspekt | IST-Zustand |
|--------|-------------|
| **Service-Definition** | `docker-compose.override.yml:25-42` — **NUR in Override-Datei** (lokal, .gitignore) |
| **Image** | `eclipse-mosquitto:2` mit `entrypoint: mosquitto_sub` |
| **Subscribe-Pattern** | `kaiser/#` — **Wildcard auf gesamten Namespace** |
| **Payload-Logging** | Voller Payload via `-F "%I %t %p"` |

**Topic-Abdeckung:**

| Topic | Geloggt? |
|-------|----------|
| `kaiser/+/esp/+/system/heartbeat` | Ja |
| `kaiser/+/esp/+/system/heartbeat/ack` | Ja |
| `kaiser/+/esp/+/sensor/+/config` | Ja |
| `kaiser/+/esp/+/actuator/+/config` | Ja |
| `kaiser/+/esp/+/zone/assign` | Ja |
| `kaiser/+/esp/+/zone/ack` | Ja |
| `kaiser/+/esp/+/config/response` | Ja |
| `$SYS/#` (Mosquitto System) | **Nein** |

**Luecke:** Service existiert NUR in `docker-compose.override.yml` — in CI oder bei frischem Checkout nicht verfuegbar.
**Diagnose-Wert:** MEDIUM — Verfuegbarkeit sollte im Haupt-Stack sichergestellt sein.

### C2-02: Output-Format

| Aspekt | IST-Zustand |
|--------|-------------|
| **Format** | Text: `%I %t %p` = ISO8601-Timestamp + Topic + Payload |
| **Beispiel** | `2026-03-10T14:23:01+0000 kaiser/env1/esp/ESP_472204/sensor/4/config {"sensor_type":"ph","gpio":4,...}` |
| **Direction** | **Nicht erkennbar** — keine Richtungs-Annotation |
| **Strukturierung** | Kein JSON — roher Textstream |

**Loki-Pipeline:**

| Schritt | IST-Zustand |
|---------|-------------|
| Log-Erfassung | Docker json-file Treiber → Alloy via Docker-Socket |
| Alloy-Stage | **Kein dedizierter `stage.match` fuer `mqtt-logger`** in `docker/alloy/config.alloy` |
| Loki-Zustellung | `http://loki:3100/loki/api/v1/push` |

**Loki-Labels:**

| Label | Gesetzt? | Wert |
|-------|----------|------|
| `compose_service` | Ja | `mqtt-logger` |
| `container` | Ja | `automationone-mqtt-logger` |
| `stream` | Ja | `stdout` |
| `compose_project` | Ja | `auto-one` |
| `level` | **Nein** | Kein Parsing |
| `topic` | **Nein** | Kein Parsing |
| `esp_id` | **Nein** | Kein Parsing |
| `direction` | **Nein** | Nicht implementiert |

**Luecke:** Ohne `topic`/`esp_id`-Labels muss jede Loki-Query mit `|=` Textsuche arbeiten — langsam und fehleranfaellig.
**Diagnose-Wert:** MEDIUM — Alloy-Stage mit Label-Extraktion wuerde Queries massiv beschleunigen.

### C2-03: Config-Push-Sichtbarkeit

| Aspekt | Sichtbar? | Details |
|--------|-----------|---------|
| Config-Push (Server→ESP) | **Ja** | Topic + voller JSON-Payload |
| Config-Response (ESP→Server) | **Ja** | Topic + Payload (falls ESP sendet) |
| Payload-Rekonstruktion | **Ja** | Voller JSON im Log — gpio, sensor_type, i2c_address etc. |

**Beispiel-Loki-Query fuer Config-Push-Messages:**
```logql
{compose_service="mqtt-logger"} |= "ESP_472204" |= "config" |~ "sensor|actuator"
```

**Fazit C2:** MQTT-Logger ist der **vollstaendigste Audit-Trail** — alle Messages mit vollem Payload. Schwaechen: keine strukturierten Labels, kein Direction-Feld, nur in Override-Datei.

---

## C3: Server-seitiges Logging

### C3-01: Heartbeat-Handler Logging

**Logger:** `god_kaiser.mqtt.handlers.heartbeat_handler`
**Datei:** `El Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py`

**Log-Zeilen im Mismatch-Pfad:**

| Zeile | Level | Message | Variablen |
|-------|-------|---------|-----------|
| ~267 | INFO | `"ESP %s heartbeat processed"` | esp_id |
| ~270 | INFO | `"Boot count: %d"` | boot_count |
| ~747 | WARNING | `"ZONE_MISMATCH for ESP %s"` | esp_id |
| ~1254 | INFO | `"Config mismatch detected for ESP_%s: ESP reports sensors=%d/actuators=%d, DB has sensors=%d/actuators=%d. Triggering auto config push."` | esp_id, esp_sensors, esp_actuators, db_sensors, db_actuators |

**Mismatch-Logging Detail:**
- **WAS:** Alle 4 Counts werden geloggt (ESP-reported vs. DB-expected)
- **WARUM:** Implizit — man sieht den Unterschied in den Zahlen
- **WAS GEPUSHT WIRD:** Nur Counts via `config_builder.py:248` ("2 sensors, 1 actuators, zone=zone_a")
- **Payload:** NICHT geloggt — weder auf INFO noch DEBUG

**Log-Flooding-Bewertung:**

| Szenario | Messages/Stunde | Level |
|----------|----------------|-------|
| Config-Mismatch-Loop (30s Heartbeat) | **480 INFO** pro ESP | INFO |
| Zone-Mismatch (WARNING vor Cooldown) | **120 WARNING** pro ESP | WARNING |
| Gesamt bei 3 ESPs im Loop | **1800 Messages/h** | Mixed |

**Luecke:** Kein Cooldown/Dedup fuer Mismatch-Logging. Zone-Mismatch WARNING liegt VOR dem MQTT-Cooldown-Guard (Zeile 761-768) — MQTT-Push wird auf 60x/h gebremst, aber WARNING erscheint bei jedem der 120 Heartbeats/h.
**Diagnose-Wert:** HIGH — Log-Flooding kann andere wichtige Messages verdraengen.

### C3-02: MQTTCommandBridge Logging

**Logger:** `god_kaiser.mqtt_command_bridge`
**Datei:** `El Servador/god_kaiser_server/src/services/mqtt_command_bridge.py`

| Methode | Level | Was wird geloggt | Luecke |
|---------|-------|------------------|--------|
| `send_and_wait_ack()` | INFO | Topic, Correlation-ID, command_type, esp_id | Kein Payload |
| `resolve_ack()` | INFO | Correlation-ID, ACK empfangen | **Keine Roundtrip-Duration** |
| Timeout | WARNING | Correlation-ID, esp_id, command_type (~Zeile 124-126) | Keine Retry-Info |
| Fallback-FIFO | DEBUG | FIFO-Matching genutzt | Nur auf DEBUG sichtbar |

**Fix-N Diagnose-Logging:**
- `_is_connected()` und `_get_client_state()` hinzugefuegt
- Wird bei Verbindungsproblemen geloggt
- Erscheint in Loki wenn aktiv

**Luecke:** Keine ACK-Roundtrip-Duration (Zeitspanne zwischen Send und ACK-Empfang). Wertvolle Metrik fuer Latenz-Erkennung.
**Diagnose-Wert:** MEDIUM — Duration wuerde Netzwerk-Probleme vs. ESP-Verarbeitungsprobleme unterscheidbar machen.

### C3-03: Config-Push-Content Logging

| Aspekt | IST-Zustand |
|--------|-------------|
| **Zusammenfassung** | `"2 sensors, 1 actuators, zone=zone_a"` (config_builder.py:248) — **Ja** |
| **Voller Payload** | **NICHT geloggt** — auf keinem Level |
| **DEBUG-Level Details** | **Nicht vorhanden** — kein DEBUG-Log mit Payload |
| **Rekonstruierbarkeit aus Server-Logs** | **Nein** — man weiss WIE VIELE, aber nicht WELCHE Sensoren/Aktoren |

**Luecke:** Groesster blinder Fleck im Server-Logging. Ohne Payload kann man nicht verifizieren ob die richtigen Configs gepusht wurden.
**Diagnose-Wert:** HIGH — bei Bug 1 (Sensor-Akkumulation) muesste man den MQTT-Logger konsultieren um zu sehen was genau gepusht wurde.

**Fazit C3:** Server loggt den Mismatch gut (alle 4 Counts), aber nie den Push-Inhalt. Log-Flooding-Risiko bei persistentem Loop. CommandBridge gut instrumentiert ausser Duration.

---

## C4: Prometheus-Metriken

### C4-01: MQTT-bezogene Metriken

**Quelle: FastAPI-Server** (`src/core/metrics.py`)

| Metrik | Typ | Labels | Zeile |
|--------|-----|--------|-------|
| `god_kaiser_mqtt_connected` | Gauge | — | :74 |
| `god_kaiser_mqtt_messages_total` | Counter | `direction` (received/published) | :79 |
| `god_kaiser_mqtt_errors_total` | Counter | `direction` (received/published) | :85 |
| `god_kaiser_mqtt_queued_messages` | Gauge | — | :206 |

**Quelle: Mosquitto-Exporter** (Port 9234, `sapcc/mosquitto-exporter:0.8.0`)

| Metrik | Typ | Labels |
|--------|-----|--------|
| `broker_clients_connected` | Gauge | job="mqtt-broker" |
| `broker_messages_received` | Counter | job="mqtt-broker" |
| `broker_messages_sent` | Counter | job="mqtt-broker" |
| `broker_messages_stored` | Gauge | job="mqtt-broker" |
| `broker_publish_messages_dropped` | Counter | job="mqtt-broker" |

**Config Mismatch Loop Sichtbarkeit:** Indirekt ueber `broker_messages_received`/`broker_messages_sent` als Traffic-Spike erkennbar, aber **kein ESP-Label** — nicht zuordenbar zu welchem ESP der Loop laeuft.

### C4-02: Heartbeat-bezogene Metriken

| Metrik | Typ | Labels | Vorhanden? |
|--------|-----|--------|------------|
| `god_kaiser_esp_last_heartbeat` | Gauge | `esp_id` | Ja |
| `god_kaiser_esp_boot_count` | Gauge | `esp_id` | Ja |
| `god_kaiser_esp_errors_total` | Counter | `esp_id` | Ja |
| `god_kaiser_esp_safe_mode` | Gauge | `esp_id` | Ja |
| `god_kaiser_esp_online` | Gauge | — | Ja |
| Config-Push-Count pro ESP | — | — | **NEIN** |
| ACK-Timeout-Count pro ESP | — | — | **NEIN** |
| Mismatch-Count pro ESP | — | — | **NEIN** |
| Config-Loop-Detection | — | — | **NEIN** |

**Fazit C4:** Heartbeat-Timestamp und Boot-Count pro ESP vorhanden. **Keine einzige Metrik** fuer Config-Push, ACK-Timeout, oder Mismatch-Detection. Config Mismatch Loop ist in Prometheus **nicht direkt erkennbar**.

---

## C5: Luecken-Analyse und blinde Flecken

### C5-01: Logging-Luecken-Matrix

| Schritt | ESP Serial | MQTT-Logger | Server-Log | Prometheus |
|---------|-----------|-------------|------------|------------|
| **ESP baut Heartbeat** | LOG_D nur auf DEBUG (Payload nicht auf INFO) | — | — | — |
| **ESP sendet Heartbeat** | LOG_D "Published: topic" (DEBUG) | Topic + voller Payload | — | `broker_messages_sent` (kein ESP-Label) |
| **Server empfaengt Heartbeat** | — | Topic + voller Payload | INFO "ESP %s heartbeat processed" | `god_kaiser_esp_last_heartbeat{esp_id}` |
| **Server macht DB-Query** | — | — | NICHT GELOGGT | — |
| **Server erkennt Mismatch** | — | — | INFO "Config mismatch detected... sensors=%d/%d, actuators=%d/%d" | NICHT GELOGGT |
| **Server sendet Config-Push** | — | Topic + voller JSON-Payload | INFO "2 sensors, 1 actuators" (nur Counts) | `god_kaiser_mqtt_messages_total{direction=published}` (kein Topic-Label) |
| **ESP empfaengt Config-Push** | LOG_I "MQTT message received: topic" (kein Payload) | Topic + voller JSON-Payload | — | — |
| **ESP verarbeitet Config** | LOG_I "Updating existing" / "Configured new" (einzeln) | — | — | — |
| **ESP Post-Processing Count** | NICHT GELOGGT | — | — | — |
| **ESP sendet config_response** | LOG_I "CFGRESP: success=N failed=N" | Topic + Payload | — | — |
| **Server empfaengt ACK** | — | Topic + Payload | INFO "ACK received, correlation_id=..." | — |
| **Server ACK-Timeout** | — | — | WARNING "ACK timeout for ESP %s" | NICHT GELOGGT |

**Kritische Luecken (Zellen ohne Logging):**

| Luecke | Wo fehlt es? | Kritikalitaet | Begruendung |
|--------|-------------|---------------|-------------|
| DB-Query-Ergebnis | Server-Log | HIGH | Man sieht den Mismatch, aber nicht die DB-Werte die dazu fuehrten |
| Mismatch-Erkennung | Prometheus | HIGH | Kein Counter = keine Dashboard-Alerts |
| Config-Push-Payload | Server-Log | HIGH | Nur Counts, nie Inhalt — MQTT-Logger noetig |
| ESP Post-Processing Count | ESP Serial | HIGH | sensor_count/actuator_count NACH Verarbeitung nie geloggt |
| ACK-Timeout | Prometheus | HIGH | Kein Counter fuer Dashboard/Alerting |
| Heartbeat-Payload | ESP Serial (INFO) | MEDIUM | Nur auf DEBUG — im Normalbetrieb unsichtbar |
| Config-Push-Empfangs-Payload | ESP Serial | MEDIUM | Topic geloggt, Payload nicht |

### C5-02: Root-Cause-Diagnostik ohne Serial

Angenommen: Nur Zugang zu Loki und Prometheus (kein physischer ESP-Zugang).

**Bug 1 (Sensor-Akkumulation):**
- **Diagnostizierbar:** Teilweise
- **Wie:** Loki-Query auf Heartbeat-Messages zeigt steigende sensor_count ueber Zeit:
  ```logql
  {compose_service="mqtt-logger"} |= "heartbeat" |= "ESP_472204" | json | sensor_count > 0
  ```
  Problem: MQTT-Logger loggt rohen Payload-Text, kein JSON-Parsing in Loki ohne Alloy-Stage.
  Alternative: Server-Log zeigt "Config mismatch... ESP reports sensors=N" — wenn N steigt, ist Akkumulation sichtbar.
- **Fehlend:** Was genau auf dem ESP passiert (welche Sensoren akkumulieren). Nur ueber Serial.

**Bug 2 (fehlender Actuator NVS-Load):**
- **Diagnostizierbar:** Ja — aus Server-Logs
- **Wie:** Nach jedem ESP-Reboot (erkennbar an `boot_count`-Aenderung) meldet der erste Heartbeat `actuators=0`:
  ```logql
  {compose_service="el-servador"} |= "Config mismatch" |= "actuators=0"
  ```
  Wenn `actuators=0` IMMER nach Reboot auftritt, ist Bug 2 bewiesen.
- **Fehlend:** Bestaetigung dass `loadActuatorConfig()` nicht aufgerufen wird — nur ueber Serial.

**Bug 3 (Actuator Count Drift):**
- **Diagnostizierbar:** Teilweise
- **Wie:** Heartbeat-ACK vom Server enthielt Config-Push → MQTT-Logger zeigt ob die gleiche Actuator-Config wiederholt gepusht wird. Server-Log zeigt wiederholte "Config mismatch... actuators=0/1".
- **Fehlend:** Was auf dem ESP bei removeActuator() passiert. Ob Actuator wirklich entfernt und neu angelegt wird — nur ueber Serial.

**Zusammenfassung:**

| Bug | Ohne Serial diagnostizierbar? | Noetige Quellen |
|-----|-------------------------------|-----------------|
| Bug 1 (Sensor-Akkumulation) | Teilweise — Trend sichtbar, Details nicht | Server-Log + MQTT-Logger |
| Bug 2 (fehlender NVS-Load) | Ja — Pattern erkennbar | Server-Log (Mismatch nach Reboot) |
| Bug 3 (Actuator Count Drift) | Teilweise — Wiederholung sichtbar, Ursache nicht | Server-Log + MQTT-Logger |

**NUR ueber Serial sichtbar:**
- Boot-Sequenz: Welche Sensor-Configs aus NVS geladen werden
- Actuator-Boot: Abwesenheit des `loadActuatorConfig()`-Aufrufs
- Config-Verarbeitungsdetails: Neu vs. Update pro Sensor
- GPIO-Konflikte und I2C-Bus-Fehler
- WiFi/MQTT-Verbindungsaufbau-Details
- Watchdog-Events und Stack-Traces bei Crashes

### C5-03: Empfehlungen fuer Logging-Verbesserungen

| # | Wo | Was | Diagnose-Wert | Sichtbar gemachter Bug/Problem |
|---|---|------|---------------|-------------------------------|
| 1 | ESP `publishHeartbeat()` | sensor_count + actuator_count auf **INFO** loggen | HIGH | Bug 1, Bug 2, Bug 3 — Heartbeat-Werte im Serial sichtbar |
| 2 | Server `metrics.py` | `god_kaiser_config_push_total{esp_id, config_type, status}` Counter | HIGH | Config Mismatch Loop direkt in Prometheus/Grafana sichtbar |
| 3 | Server `metrics.py` | `god_kaiser_ack_timeout_total{esp_id, command_type}` Counter | HIGH | ACK-Timeouts quantifizierbar, Alert-faehig |
| 4 | Server `config_builder.py` | Config-Push-Payload auf **DEBUG** loggen (voller JSON) | HIGH | Bug 1 — welche Sensoren genau gepusht werden |
| 5 | Server `metrics.py` | `god_kaiser_config_mismatch_total{esp_id}` Counter | HIGH | Loop-Frequenz messbar, Alerting moeglich |
| 6 | ESP Config-Handler | sensor_count + actuator_count **NACH** Verarbeitung loggen | HIGH | Bug 1, Bug 3 — Verifizierung ob Config korrekt angewendet |
| 7 | Server `heartbeat_handler.py:747` | Zone-Mismatch WARNING hinter Cooldown-Guard verschieben | MEDIUM | Log-Flooding-Reduktion von 120→60 WARNING/h |
| 8 | Alloy `config.alloy` | `stage.match` fuer `mqtt-logger` mit Label-Extraktion (topic, esp_id) | MEDIUM | Schnellere Loki-Queries, strukturierte Suche |
| 9 | Server `mqtt_command_bridge.py` | ACK-Roundtrip-Duration loggen (ms zwischen Send und ACK) | MEDIUM | Netzwerk-Latenz vs. ESP-Verarbeitungszeit unterscheidbar |
| 10 | Server `heartbeat_handler.py` | Mismatch-Logging mit Cooldown (max 1x pro ESP pro 5min) | MEDIUM | Log-Flooding-Reduktion von 480→12 INFO/h pro ESP |
| 11 | ESP `main.cpp` POST-SETUP | `"Active Actuators: N"` analog zu `"Active Sensors: N"` | LOW | Bug 2 — direkter Nachweis dass actuator_count=0 nach Boot |
| 12 | Docker `docker-compose.yml` | `mqtt-logger` Service in Haupt-Stack verschieben | LOW | Verfuegbarkeit in CI und bei frischem Checkout |

---

## Zusammenfassung: Logging-Abdeckung

```
ESP Serial  ████████░░░░░  (60%)
  + Sensor-Boot: Gut (NVS-Load + einzelne Configs)
  + Config-Verarbeitung: Gut (neu vs. update)
  - Heartbeat-Payload: Nur DEBUG
  - Actuator-Boot: Kein Count
  - Post-Processing-Count: Fehlt
  - Nicht remote zugaenglich

MQTT-Logger ██████████████  (95%)
  + Alle Topics via kaiser/# Wildcard
  + Voller Payload bei jeder Message
  + Config-Push und Config-Response sichtbar
  - Keine strukturierten Labels in Loki
  - Nur in docker-compose.override.yml
  - Keine Direction-Annotation

Server-Log  ██████░░░░░░░  (50%)
  + Mismatch-Erkennung: Alle 4 Counts
  + CommandBridge: Topic + Correlation-ID
  + ACK-Timeout: WARNING mit Details
  - Config-Push-Payload: Nie geloggt (nur Counts)
  - DB-Query-Ergebnis: Nicht geloggt
  - Log-Flooding: 480+ Messages/h bei Loop
  - Kein Cooldown/Dedup

Prometheus  ███░░░░░░░░░░  (20%)
  + Heartbeat-Timestamp pro ESP
  + MQTT connected/messages/errors (aggregiert)
  + Boot-Count pro ESP
  - Config-Push-Count: Fehlt
  - ACK-Timeout-Count: Fehlt
  - Mismatch-Count: Fehlt
  - Loop-Detection: Fehlt
  - Kein per-Topic/per-ESP Traffic-Label
```

---

## Quelldateien

| Datei | Relevanz |
|-------|----------|
| `El Trabajante/src/main.cpp` | Heartbeat, Boot-Sequenz, POST-SETUP |
| `El Trabajante/src/services/communication/mqtt_client.cpp` | publishHeartbeat(), MQTT-Callback |
| `El Trabajante/src/services/sensor/sensor_manager.cpp` | Config-Empfang, NVS-Load |
| `El Trabajante/src/services/actuator/actuator_manager.h` | begin(), kein NVS-Load |
| `El Trabajante/src/services/config/config_manager.cpp` | loadActuatorConfig() (nie aufgerufen) |
| `El Trabajante/src/utils/logger.h` | Logger-System (nur Serial) |
| `El Servador/.../mqtt/handlers/heartbeat_handler.py` | Mismatch-Erkennung, Metriken-Update |
| `El Servador/.../services/mqtt_command_bridge.py` | send_and_wait_ack(), ACK-Timeout |
| `El Servador/.../services/config_builder.py` | Config-Push-Zusammenfassung |
| `El Servador/.../core/metrics.py` | Alle Prometheus-Metriken |
| `docker-compose.override.yml` | MQTT-Logger Service |
| `docker/alloy/config.alloy` | Loki-Pipeline |
| `docker/prometheus/prometheus.yml` | Scrape-Jobs |
