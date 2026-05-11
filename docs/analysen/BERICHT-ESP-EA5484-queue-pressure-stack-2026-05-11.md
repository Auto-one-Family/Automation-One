# Stack-Analyse: ESP_EA5484 — Queue Pressure, MQTT-Transport und Korrelation mit Broker/Server/DB

**Datum der Auswertung:** 2026-05-11  
**Gerät:** ESP_EA5484 (IP laut Broker-Log: 192.168.0.161)  
**Ziel:** Vollständige, logbasierte Beschreibung der beobachteten Probleme über Firmware, Mosquitto, FastAPI-Server, Observability (Loki/Prometheus) und PostgreSQL.

---

## 1. Kurzfassung

Beim schnellen Ein- und Ausschalten eines Aktors zeigt die Firmware **COMM-Queue-Pressure** (Füllstände typisch 6–8, HWM bis 8, ohne Shed/Drop in den gezeigten Druckphasen). Später führt die Last zu **voller Publish-Queue** (Sensor-Publishes werden verworfen), **TCP-Schreibfehler** (`errno=11`, Meldung „No more processes“ im ESP-IDF-Log) und **MQTT-Disconnect**. Auf dem Broker erscheint **„exceeded timeout“** für denselben Client. Server-seitig folgen **LWT-/Timeout-Ereignisse**, **Sensor-Stale-Warnungen**, teils **fehlgeschlagene Publishes** („MQTT client not connected“) sowie **Intent-Outcome-Parsing-Warnungen**. Prometheus bestätigt **29 empfangene `entered_pressure`- und 28 `recovered`-Events** auf dem Topic `kaiser/+/esp/+/system/queue_pressure` für `ESP_EA5484`. PostgreSQL zeigt in 6 Stunden **14 `offline`-Outcomes (LWT-Flow)** für dieselbe ESP-ID neben erfolgreichen Kommando-Pfaden.

**Abgrenzung LWT:** LWT funktioniert als Signal; das aktuelle Problem ist **Ressourcen-/Durchsatz-Engpass** auf dem ESP (Queue + Netzwerk-Stack), nicht fehlendes LWT.

---

## 2. Untersuchte Komponenten und Methodik

| Komponente | Methode |
|------------|---------|
| **Docker** | `docker ps` — laufende Services (Server, MQTT, Loki, Prometheus, Grafana, Alloy, Postgres, …). |
| **Mosquitto** | `docker logs automationone-mqtt --since 2h`; Loki `query_range` mit `{compose_service="mqtt-broker"} \|= "ESP_EA5484"`. |
| **el-servador** | `docker logs automationone-server --since 3h \| grep EA5484`; Loki `{compose_service="el-servador"} \|= "EA5484"`. |
| **Prometheus** | `http://127.0.0.1:9090/api/v1/query` für `queue_pressure_event_total`, `god_kaiser_mqtt_queued_messages`, `god_kaiser_mqtt_messages_total`, `god_kaiser_mqtt_errors_total`. |
| **Loki** | `http://127.0.0.1:3100/loki/api/v1/query_range` (Labels u. a. `compose_service`, `compose_project=auto-one`). |
| **PostgreSQL** | `docker exec automationone-postgres psql …` — Aggregationen auf `command_outcomes` (letzte 6 h, `esp_id = ESP_EA5484`). |
| **`/home/robin/.claude`** | Verzeichnis geprüft: vorhandene Plugin-/Marketplace-Agenten sind überwiegend **Code-Review, SDK, Feature-Dev**; für diese Live-Telemetrie-Auswertung wurden die Stack-Tools direkt genutzt (kein separates Claude-Subagent-Run erforderlich). |

---

## 3. Problembelege (exakt nach Quelle)

### 3.1 Firmware (Seriell / ESP-Log, von dir bereitgestellt)

**3.1.1 MQTT-/SDK-Konfiguration (Outbox-Größe, Puffer)**  
Logzeile (Auszug):

- `[MQTT] [FIX2-VERIFY] MQTT cfg: out_buffer=8192 buffer=8192 OUTBOX=16384(sdkconfig) …`

**3.1.2 Publish-Queue (8 Slots) und Queue-Pressure**  
- `[SYNC] Publish queue created (8 slots)`  
- Wiederholt: `[COMM] queue_pressure entered_pressure fill=6 hwm=7 shed=0 drop=0` bis `fill=7 hwm=8` / `fill=6 hwm=8` — **Druck ohne Shed/Drop in diesen Phasen**, aber hohe Auslastung nahe Kapazitätsgrenze der COMM-Pipeline.

**3.1.3 Erster Konfigurationsfehler (Aktor vor Config)**  
- `ACTUATOR COMMAND FAILED` / `No actuator configured on GPIO 25` — **erwartbar**, wenn Kommando vor NVS-Config eintrifft (stimmt mit Server-Log überein).

**3.1.4 Publish-Queue voll → Sensor-Drops**  
- `[MQTT] Publish queue full — dropping: kaiser/god/esp/ESP_EA5484/sensor/0/data`  
- Analog für `sensor/4/data`  
- `[SENSOR] Failed to publish sensor data for GPIO 0` / `GPIO 4`  
- `[ERRTRAK] [3012] [COMMUNICATION] Failed to publish sensor data`  

**3.1.5 TCP-/MQTT-Transportfehler und Disconnect**  
- `TRANSPORT_BASE: tcp_write error, errno=No more processes`  
- `MQTT_CLIENT: Writing failed: errno=11`  
- `sock_errno=11 (No more processes)` — klassisch **lwIP/ESP-IDF-Ressourcenknappheit** (häufig in Verbindung mit zu vielen gleichzeitigen TCP-/MQTT-Arbeiten oder erschöpften internen Strukturen), nicht „falsches“ LWT.

**3.1.6 Reconnect-Schleife und Circuit Breaker**  
- `managed reconnect request failed: ESP_FAIL`  
- `sock_errno=113 (Software caused connection abort)`  
- `CircuitBreaker [MQTT]: Failure threshold reached → OPEN`  
- `MQTT publish blocked by Circuit Breaker (Service DOWN)`  

**Interpretation:** Nach dem initialen Schreibfehler entkoppelt sich der Client vom stabilen Pfad; Reconnects scheitern wiederholt, bis der Circuit Breaker greift.

---

### 3.2 Mosquitto (Docker-Log, Host `automationone-mqtt`)

**Relevantester Einzeiler (Korrelation mit Firmware-Timeout/Disconnect):**

```text
2026-05-11T15:02:55Z: Client ESP_EA5484 [192.168.0.161:54675] disconnected: exceeded timeout.
```

Derselbe Zeitstempel **15:02:55Z** taucht server-seitig als LWT auf (siehe 3.3).  
**Hinweis zur Konfiguration** (`docker/mosquitto/mosquitto.conf`): u. a. `max_inflight_messages 10`, `max_keepalive 300` — Broker-seitig gibt es bewusste Grenzen für parallele QoS-1/2-Inflight; die Meldung **`exceeded timeout`** bezieht sich auf **Client-seitigen Keepalive/Netzwerk-Timeout** aus Sicht des Brokers, konsistent mit „ESP antwortet nicht rechtzeitig“ während interner Blockade.

**Loki-Abfrage** `{compose_service="mqtt-broker"} |= "ESP_EA5484"` lieferte u. a. die Disconnect-Zeile und Subscribe-/Client-Zeilen im selben Fenster.

---

### 3.3 el-servador (Docker-Log, Auszüge)

Aus `docker logs automationone-server` (gefiltert, letzte relevante Treffer):

- LWT: `LWT received: ESP ESP_EA5484 disconnected unexpectedly (reason: unexpected_disconnect, … flapping=True)` — mehrfach, u. a. **2026-05-11 15:02:55** (Passung zu Mosquitto).  
- Heartbeat/Sensorpfad: `Device ESP_EA5484 timed out`; `Sensor stale: ESP ESP_EA5484 GPIO … no data for … (timeout: 180s)` — **Folge** aus fehlenden Sensor-Publishes nach Disconnect.  
- `Cannot publish: MQTT client not connected` — Server-eigener MQTT-Client kurz nicht verbunden (Nebenwirkung von Broker-/Netzwerkereignissen oder Neustart).  
- Aktor vor Config (UI/API): `Actuator command failed: esp_id=ESP_EA5484, gpio=25, command=ON, error=Actuator not configured on GPIO 25` — **konsistent** mit Firmware-Log vor Config-Push.  
- Intent-Pipeline: `Dropping malformed intent_outcome/lifecycle payload … Missing event_type`; `intent_outcome missing intent_id normalized` — **separates Datenformat-/Client-Thema**, tritt zeitlich in der gleichen Testsession auf und sollte nicht mit Outbox verwechselt werden, verschärft aber Diagnose-Lärm in Loki.

---

### 3.4 Prometheus (Metriken, Stand Abfrage 2026-05-11)

**Queue-Pressure-Zähler (Server empfängt ESP-Events auf `queue_pressure`):**

| Metrik | Labels | Wert |
|--------|--------|------|
| `queue_pressure_event_total` | `esp_id="ESP_EA5484"`, `event="entered_pressure"` | **29** |
| `queue_pressure_event_total` | `esp_id="ESP_EA5484"`, `event="recovered"` | **28** |

Die Differenz **29 vs. 28** ist plausibel, wenn zum Abfragezeitpunkt eine Druckphase noch nicht mit `recovered` abgeschlossen war oder ein Event verloren ging — für die Aussage „häufige Druckphasen“ reicht der Zählerstand.

**Server-MQTT-Warteschlange:** `god_kaiser_mqtt_queued_messages` war zum Abfragezeitpunkt **0** (kein akkumulierter Server-Backlog).

**Nachrichtenrate (10-Minuten-Fenster, exemplarisch):**  
`rate(god_kaiser_mqtt_messages_total[10m])` — `received ≈ 0.42/s`, `published ≈ 0.06/s` (Richtgröße für Server-Last; nicht direkt ESP-Outbox).

**Fehlerzähler Server-Publish/Receive:** `god_kaiser_mqtt_errors_total` = **0** für beide Richtungen (kein anhaltender Server-seitiger Publish-Fehlerzähler im gleichen Fenster).

---

### 3.5 Loki

- **Mosquitto:** siehe 3.2; Einträge mit `ESP_EA5484` und `exceeded timeout` abfragbar.  
- **el-servador:** Treffer mit `EA5484` zu LWT, Intent-Outcome, Sensor-Stale (Zeitstempel in Nanosekunden im JSON der API).  
- **Hinweis Log-Level:** In `docker-compose.pi.yml` ist für `el-servador` `LOG_LEVEL: WARNING` gesetzt. Der `QueuePressureHandler` loggt **`Queue pressure event` auf INFO**. Deshalb kann **Loki für genau diese Zeile leer sein**, während **Prometheus-Zähler trotzdem steigen** — das ist erwartetes Verhalten, kein „fehlendes“ Event auf dem Bus.

---

### 3.6 PostgreSQL (`command_outcomes`, letzte 6 Stunden)

Abfrage: Aggregation nach `esp_id`, `outcome` (alle ESPs in Fenster; dominant EA5484).

Für **`ESP_EA5484`** (gleiches Fenster):

| outcome | count |
|---------|------:|
| applied | 33 |
| success | 32 |
| offline | 14 |
| failed | 8 |
| persisted | 8 |
| accepted | 3 |

Aufschlüsselung nach `outcome` / `flow` (Auszug):

- `offline` + `lwt`: **14** — **direkter DB-Beleg** für wiederholte Offline-/LWT-Pfade parallel zu vielen erfolgreichen `command`/`actuator_response`-Pfaden.  
- `failed` + `command`: 6; `failed` + `actuator_response`: 1; `failed` + `contract`: 1.

**Fazit DB:** Die Datenbank spiegelt **instabile MQTT-Sitzungen** und weiterhin **hohe Kommandoaktivität** wider; sie ist kein Engpass, sondern **Persistenz der Symptome**.

---

## 4. Kausale Kette (plausibel, loggestützt)

1. **Hohe Frequenz** an Aktor-Kommandos (+ QoS-Ack-Pfad, Health, Sensor-Takt) füllt die **COMM-/Publish-Queues** auf dem ESP (`queue_pressure`, später `Publish queue full`).  
2. Der **TCP/MQTT-Stack** kann nicht mehr zeitnah schreiben → `errno=11` / Write-Fail → **Disconnect**.  
3. Der **Broker** sieht den Client als nicht mehr lebendig → **`exceeded timeout`**.  
4. **LWT** und **Sensor-Stale** auf dem Server sowie **`offline`-Outcomes** in Postgres sind **Folgeerscheinungen**.  
5. **LWT ist kein Bug**, sondern korrektes Signal; das Kernproblem ist **ESP-seitige Überlastung / Ressourcenerschöpfung** unter Burst.

---

## 5. Abgrenzungen

- **Server-Outbox vs. ESP-OUTBOX:** In den Logs bezieht sich „OUTBOX=16384“ auf **ESP-IDF MQTT Client intern**; `god_kaiser_mqtt_queued_messages` misst die **Server-Warteschlange** — aktuell ohne Anhaltspunkt für Server-Backlog.  
- **Intent-Outcome / lifecycle:** Eigene Warnungen (fehlendes `event_type` etc.) — **nicht** identisch mit MQTT-Outbox-Druck, aber in Loki/Server-Logs sichtbar und sollte separat bereinigt werden.

---

## 6. Empfehlungen (kurz, technisch)

1. **Firmware:** Publish-Pfad entlasten unter Burst (z. B. **Koaleszieren** von Sensor-Publishes, **niedrigere Priorität** von Telemetrie vs. Aktor-ACK, **QoS/Topic-Reduktion**, ggf. **größere Queue** nur nach RAM-Budget; **Rate-Limit** für Aktor-Kommandos auf ESP-Seite).  
2. **Lasttest:** Prometheus-Panel für `queue_pressure_event_total{esp_id="ESP_EA5484"}` und `rate(...)` über Grafana; Korrelation mit `mosquitto` „exceeded timeout“.  
3. **Server:** Bei Pi-Prod optional `LOG_LEVEL=INFO` temporär für Queue-Pressure-Zeilen in Loki — oder dediziertes **WARNING**-Log im Handler, wenn Loki-Korrelation ohne Prometheus gewünscht ist.  
4. **Broker:** Keepalive/Inflight sind dokumentiert; Änderungen nur mit ESP-Verhalten abstimmen.

---

## 7. Referenz: Relevante Codepfade (Server)

- Queue-Pressure-Handler: `El Servador/god_kaiser_server/src/mqtt/handlers/queue_pressure_handler.py` (Prometheus + optional INFO-Log).  
- Topic-Pattern: `TopicBuilder` in `src/mqtt/topics.py` (`parse_queue_pressure_topic`).  
- Registrierung in `src/main.py` — Subscription `kaiser/+/esp/+/system/queue_pressure`.

---

## 8. Vertiefung: Letzte ~30 Minuten vor dem „exceeded timeout“ (Stack-Rekonstruktion)

**Zeitbasis:** Mosquitto- und Server-Logs (`docker logs … --since 35m`), Fenster **2026-05-11 ca. 14:33–15:03 UTC** (endet am dokumentierten Disconnect **15:02:55Z**). Die folgende Tabelle fasst die **Broker-seitig sichtbaren** Ereignisse für `ESP_EA5484` zusammen.

### 8.1 Mosquitto: Session-Verlauf (Kernpunkte)

| Zeit (UTC) | Ereignis | IP | Interpretation |
|------------|----------|-----|----------------|
| 14:45:51 | Connect | 192.168.178.61 | Gerät im Heimnetz; `k60` Keepalive. |
| 14:46:35 / 14:48:34 / 14:50:52 | `disconnected: session taken over` → sofort neuer Connect | .178.61 | **Gleiche Client-ID von zwei TCP-Sitzungen** (z. B. zweiter Prozess, Hotspot+LAN, oder schnelle Doppel-Verbindung) — erzeugt Verbindungs-Chaos unabhängig von Aktor-Tasten. |
| 14:49:21 | `connection closed by client` | .178.61 | Expliziter Client-Abbruch/Reconnect. |
| 14:55:29 | `exceeded timeout` | .178.61 | Erster **Keepalive-/I/O-Timeout** auf dieser IP (ca. 4 min nach letztem stabilen Connect-Zyklus). |
| 14:59:52 | Neuer Connect | **192.168.0.161** | Gerät erscheint im **anderen Subnetz** (passt zur Angabe im Berichtkopf); frische Session. |
| 15:00:08 | `session taken over` | .0.161 | **Zwei parallele Verbindungen derselben Client-ID** vom gleichen Host (Ports 52459 und 54675) — der Broker kickt die ältere Sitzung; typisch für doppelten MQTT-Stack oder Race beim Umschalten. |
| 15:02:55 | `exceeded timeout` | .0.161:54675 | **Finaler Ausfall** der in Abschnitt 3.2/3.3 korrelierten Session (Keepalive nicht bedient während der ESP intern blockiert/überlastet ist). |

**Korrelation mit deinem Ablauf (Flash-Erase → Aktor „unkonfiguriert“ → erneut gespeichert):**  
Im Server-Log steht **2026-05-11 15:00:21** explizit: Aktorbefehl **ON GPIO 25** mit Fehler *Actuator not configured on GPIO 25* — das passt zu einem **leeren NVS nach Erase**, bevor die Aktor-Definition erneut über die API/UI persistiert wurde. Kurz danach (15:00:45–15:00:56) tauchen **Lifecycle-/intent_outcome-Warnungen** auf (fehlendes `event_type`, normalisiertes `intent_id`); das sind **parallele Contract-/Client-Themen**, verschärfen aber die sichtbare Last auf derselben Session.

### 8.2 Was die Publish-Queue auf dem ESP **tatsächlich** füllt (kein Broker-„Spam“, sondern ESP-Ausgang)

Die gemessene **COMM-/Publish-Queue** (`PUBLISH_QUEUE_SIZE = 8`, Druck ab Füllstand ≥ 6 laut Firmware) ist die **Core-1 → Core-0-Warteschlange für ausgehende MQTT-Publishes** (`publish_queue.cpp` / `MQTTClient::publish`). In den Codepfaden gilt:

- **Alles, was während `routeIncomingMessage()` (MQTT `EVENT_DATA`-Callback auf Core 0) publisht**, wird **nicht** direkt in `esp_mqtt_client_publish` geschoben, sondern über **`queuePublish()`** — siehe `mqtt_client.cpp` (`g_in_mqtt_event_callback`).
- **Alles vom Safety-Task (Core 1)** — dazu gehören **Aktor-Ausführung**, Sensor-Mess-Schleife, Config-Queue — geht ebenfalls über **`queuePublish()`**.

**Wichtig:** Der Broker „füllt“ diese Queue nicht mit Bytes; **jeder schnelle ON/OFF vom Server erzeugt eine Kette von ESP-**Ausgangs**nachrichten** (QoS-1-Acks der Antworten laufen zusätzlich im ESP-IDF-Outbox).

#### Typische ausgehende Topics pro eingehendem `…/actuator/{gpio}/command` (God-Kaiser-Pfad)

1. **Im MQTT-Empfangskontext (Core 0, Callback):**  
   - `kaiser/god/esp/ESP_EA5484/system/intent_outcome` mit Outcome **`accepted`** (QoS 1) — in der Regel **nicht-kritisch** für die Shed-Logik, landet aber trotzdem in der **gleichen** 8-Slot-Queue, weil der Callback die Queue-Pflicht erzwingt.

2. **Im Safety-Task (Core 1), nach `processActuatorCommandQueue()`:**  
   - `…/actuator/{gpio}/response` — **kritisch** (`/response`), typisch **`safePublish`** (mehrere Versuche bei Druck).  
   - `…/system/intent_outcome` mit **`applied`** oder **`failed`** — für Command-Flows **kritisch** (terminale Outcomes).  
   - optional **`…/system/intent_outcome/lifecycle`** (Ketten-Stufen) — ebenfalls als **kritisch** eingereiht.  
   - bei **Erfolg** und Zustandswechsel zusätzlich **`…/actuator/{gpio}/status`** (QoS 1, **nicht** kritisch → wird bei hohem Füllstand **eher geshed**).

3. **Parallel (gleicher 10-ms-Safety-Loop):** `sensorManager.performAllMeasurements()` kann **`kaiser/god/esp/ESP_EA5484/sensor/{gpio}/data`** erzeugen — **nicht-kritisch**; unter Druck werden diese Publishes **zuerst verworfen** (exakt die im Firmware-Log genannten Drops auf `sensor/0/data`, `sensor/4/data`).

**Fazit zum „schnellen Schalten“:** Die **Trigger** sind die **eingehenden** Topics `kaiser/god/esp/ESP_EA5484/actuator/25/command` (vom Server/UI). Die **Queue-Pressure** entsteht durch die **summierte Ausgangsflut**: mehrere **QoS-1-Publishes pro Befehl** (Response + Intent + Lifecycle) × **Klickrate**, plus **Sensor-Telemetrie** und ggf. **SafePublish-Retries** — alles konkurriert um **8 Slots** und den **gemeinsamen TCP/MQTT-Schreibpfad**. Wenn der Stack dann `errno=11` / Schreibtimeout liefert, antwortet der Client **nicht** mehr zuverlässig auf Keepalive → Broker: **`exceeded timeout`**.

### 8.3 Abgrenzung: Was der Broker-Log *nicht* zeigt

Mosquitto listet in der Standardkonfiguration **keine PUBLISH-Payloads** pro Client. Die **Zuordnung einzelner Topics → Queue-Füllstand** folgt daher aus **Firmware-Implementierung** (`El Trabajante`: `mqtt_client.cpp`, `publish_queue.cpp`, `actuator_command_queue.cpp`, `intent_contract.cpp`, `safety_task.cpp`) plus den **symptomatischen** Firmware-Zeilen (Publish-Queue voll, Sensor-Drops) aus Abschnitt 3.1.

---

*Ende des Berichts (inkl. Vertiefung §8).*
