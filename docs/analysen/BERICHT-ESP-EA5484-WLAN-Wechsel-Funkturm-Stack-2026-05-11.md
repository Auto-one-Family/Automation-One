# Stack-Analyse: ESP_EA5484 — WLAN-Wechsel („Funkturm“ / 192.168.178.x), Seriellog, Loki, Prometheus, PostgreSQL

**Auswertungsdatum:** 2026-05-11  
**Gerät:** ESP_EA5484  
**Linear:** **AUT-444** ist im Workspace **nicht vorhanden** (Linear: „Entity not found“). Der thematische Block **AUT-344 bis AUT-350** deckt Queue-Pressure, LWT, Lifecycle-Lücken und verwandte Befunde ab; **AUT-347** beschreibt explizit die Lifecycle-Chain-Stage unter Queue-Druck ([AUT-347](https://linear.app/autoone/issue/AUT-347/tracing-gap-f2-lifecycle-chain-stage-enqueue-failed-intent-trace)).

**Fokus-Zeitfenster (Stack, Wall-Clock):** ca. **letzte 60 Minuten** vor Auswertung — in Loki/DB dominieren Ereignisse zwischen **~16:10 UTC und 16:26 UTC** (MQTT-Broker, Server, `command_outcomes`). Das passt zu „letzte 20 Minuten intensiv anderem Netz / Router-Wechsel“ in Kombination mit Rückkehr auf **192.168.178.61**.

---

## 0. Prüfstand: „AUT-344–347 erledigt“ vs. Linear vs. Code (genau)

**Hinweis:** Nach erneuter Abfrage (2026-05-11) zeigen **AUT-344, AUT-345, AUT-346, AUT-347** in Linear weiterhin **`status: Backlog`**, `completedAt: null`. Wenn du die Tickets operativ als erledigt führst, sollten sie in Linear auf **Done** gesetzt werden, sonst driftet die Nachverfolgung.

Unabhängig davon ist hier die **sachliche Codeprüfung** (Repository `autoone`), wo die Kette **tatsächlich** noch bricht — unabhängig vom Ticket-Status:

| Issue | Linear-Status (API) | Ist im Code adressiert? | Verbleibende Lücke (präzise) |
|--------|---------------------|-------------------------|-----------------------------|
| **AUT-345** | Backlog | **Ja** — `QueuePressureHandler`: `entered_pressure` wird mit **`logger.warning`** geloggt (sichtbar bei `LOG_LEVEL=WARNING`). Siehe `god_kaiser_server/src/mqtt/handlers/queue_pressure_handler.py` (Zeilen 11–12, 108–109). | Keine funktionale Lücke mehr für Loki-Sichtbarkeit dieses Events; nur noch Alerting/Runbooks. |
| **AUT-344** | Backlog | **Teilweise** — Publish-Queue **8 Slots** ist **bewusst** dokumentiert (`publish_queue.h`: Speicher-Tradeoff vs. 15 Slots); **Shed-Watermark 6**, kritische vs. nicht-kritische Publishes; Outbox-volle Pfade in `mqtt_client.cpp` mit defensiver Logik. | Unter extremer Last tritt weiterhin **`errno=11` / TCP-Schreibpfad** auf — das liegt **unterhalb** der Anwendungs-Queue im **lwIP/IDF-Stack**. Symptom bleibt im Seriellog reproduzierbar. |
| **AUT-346** | Backlog | **Nein (Kernpfad offen)** — `MQTTClient::publish()` prüft **`circuit_breaker_.allowRequest()` zuerst** (ca. Zeile 558–562), **bevor** `is_heartbeat` ermittelt wird (ca. 565–566). `publishHeartbeat()` ruft am Ende **`publish(heartbeat_topic, …)`** auf (ca. 1463–1464). | **Herzschlag-JSON** wird bei **CB OPEN** weiterhin **ganz normal blockiert**. Zusätzlich: Broker-**`exceeded timeout`** betrifft primär den **MQTT-Protokoll-Keepalive** der IDF-Client-Task — wenn der gesamte Schreibpfad blockiert ist, ist auch **PINGREQ** gefährdet. Das ist die in AUT-346 beschriebene **Selbstverstärkung**, im Code **nicht** durch eine CB-Ausnahme für Heartbeat/Keepalive aufgelöst. |
| **AUT-347** | Backlog | **Teilweise** — `recordIntentChainStage` baut ein **vollständiges** `event_doc` inkl. **`event_type`** / `intent_chain_stage_v1` und nutzt `queuePublish(..., critical=true)` (`intent_contract.cpp` ca. 644–648). | Wenn die Queue **vollständig voll** ist, schlägt **Enqueue** fehl → nur **`LOG_W` „Lifecycle chain-stage enqueue failed“** — es gibt **keinen** separaten, serverseitig auswertbaren **Marker** (`chain_stage_dropped` o. ä.) wie in den AUT-347-Akzeptanzkriterien skizziert. Server-Warnungen **`Missing event_type`** können weiterhin aus **anderen**/älteren Pfaden oder Teilpayloads stammen; Dedup/`tracing_degraded` ist in den Handlern **nicht** als erledigt erkennbar. |

**Kernaussage:** Selbst wenn AUT-344–347 „bearbeitet“ wurden, ist die **End-to-End-Kette unter Last + Flap** im vorliegenden Seriellog und im **aktuellen Firmware-Stand** weiterhin **an AUT-346 (CB vor Heartbeat-Erkennung)** und an **Transport/Wi‑Fi** gebrochen; **AUT-347** ist nur über **kritisches queuePublish** abgefedert, nicht über **verlustfreie Observability**.

---

## 1. Kurzfassung

Der Wechsel auf einen anderen Router und zurück korreliert im Stack **nicht** mit einem „mystischen“ Server-Bug, sondern mit **mehrschichtiger Instabilität**:

1. **Layer-2/3 (Wi‑Fi):** Im Seriellog erscheinen **AUTH_FAIL (202)**, später **NOT_AUTHED (6)** unmittelbar nach einem MQTT-Schreib-Timeout — das ist **klassisches WPA/Association-Flapping**, nicht „MQTT ohne Grund“.
2. **Transportschicht:** **`Writing didn't complete …` / `write_timeout_silent`**, **`errno=11` („No more processes“ / EAGAIN-Pfad im IDF-Log)** und **`errno=113`** passen zu **TCP/MQTT-Backpressure** und Reconnect-Races — deckungsgleich mit [AUT-344](https://linear.app/autoone/issue/AUT-344/error-firmware-aktor-burst-comm-queue-erschopfung-unter-schnellem) und [AUT-346](https://linear.app/autoone/issue/AUT-346/error-firmware-circuit-breaker-mqtt-open-blockiert-heartbeatkeepalive).
3. **Broker:** Loki zeigt für dieselbe Client-ID **`session taken over`** mehrfach hintereinander sowie **`disconnected: exceeded timeout`** — konsistent mit [AUT-332](https://linear.app/autoone/issue/AUT-332/p1high-firmware-session-takeover-replay-als-additiver-outbox) / [AUT-343](https://linear.app/autoone/issue/AUT-343/aut-338-s5-mqtt-clientcpp-sauberer-disconnect-vor-reconnect-session).
4. **Bootstrap nach Reconnect:** Firmware meldet **`Registration pending (no heartbeat ACK), skipping publish`** und bricht mit **POWERON_RESET** ab, bevor der ACK-Pfad wieder vollständig durchlaufen ist — das erklärt „kommt nicht richtig online“, obwohl TCP/MQTT teilweise wieder steht.

**Fazit:** In „dem anderen Netz“ kann es stabil wirken, wenn **Weniger Last**, **anderes NTP**, **kein session-taken-over** und **kein Wi‑Fi-Reason-6** auftreten. Auf **Funkturm** zeigt der Stack dieselbe **Last + Recovery-Schwäche** wie in den Linear-Issues beschrieben.

### 1a. End-to-End-Fehlerkette (wo es **jetzt noch** bricht)

Die folgende Kette ist **unabhängig von der Linear-Ticketnummer** die kausale Ordnung aus **Seriellog + Loki + DB**; an den markierten Gliedern ist der Stand **nach** den im Repo sichtbaren AUT-344/345-Teilfixes **noch fehlerhaft oder unvollständig**:

1. **Eingangslast** — viele `actuator/…/command` + Sensorzyklus + Config → **`g_publish_queue` füllt** (HWM 7–8 im Log). *(AUT-344: Shed/8-Slot reduziert Schaden, eliminiert Sättigung nicht.)*
2. **Schicht darunter** — voll belasteter TCP/MQTT-Task → **`tcp_write` / errno 11** oder **Schreib-Timeout** (errno 119). *Restbruch: lwIP/IDF, nicht nur Anwendungsqueue.*
3. **`MQTTClient::publish()`** — bei voller Queue: **`circuit_breaker_.recordFailure()`** (z. B. Zeile 618–620 bei fehlgeschlagenem Enqueue). Fehler summieren sich zum **CB OPEN**.
4. **🔴 Restbruch AUT-346 (Firmware):** Solange **`!allowRequest()`**, schlägt **`publish()` sofort fehl`** — **vor** der Heartbeat-Erkennung. → **`publishHeartbeat()`** kann **kein** App-Heartbeat mehr senden; parallel steigt das Risiko, dass der **Broker** wegen fehlendem Verkehr **`exceeded timeout`** meldet (Loki).
5. **Wi‑Fi-Kopplung** — im Seriellog direkt nach MQTT-Disconnect **`NOT_AUTHED (6)`** → Link-Layer bricht mit — **orthogonal**, verstärkt aber Reconnect (`ESP_FAIL`, errno 113).
6. **🔴 Restbruch Bootstrap:** Nach erneutem `MQTT_EVENT_CONNECTED` laufen **viele SUBSCRIBES**; **`registration_confirmed_`** bleibt **false**, bis **`heartbeat/ack`** da ist. Sensorpfad: **`Registration pending … skipping publish`** (Gate **fail-closed**). Wenn der Server durch **LWT-Flapping** oder Last **langsam** antwortet, bleibt das Gerät **fachlich offline**, obwohl TCP „connected“ ist.
7. **Broker** — parallele Sessions → **`session taken over`** (AUT-332/343-Thema); zusätzlich **`exceeded timeout`**.
8. **Server/DB** — **LWT** → `command_outcomes` **offline**; optional **`system/will` Handler returned False`** (AUT-350) → **Statuspfad inkonsistent**.

**Kürzeste präzise Antwort auf „wo genau noch fehlerhaft?“:**  
**(A)** `mqtt_client.cpp`: **Circuit Breaker vor Heartbeat-Unterscheidung** + Heartbeat nur über **`publish()`**.  
**(B)** `publish_queue` / lwIP: **Sättigung trotz 8-Slot-Design**.  
**(C)** **Registrierungs-Gate** nach Flapping: **ACK-Verzögerung** → Sensoren gesperrt.  
**(D)** Broker: **Session-Takeover** + **Keepalive-Timeout**.  
**(E)** Server: **LWT-Handler-Fehlerpfad** (separat).

---

## 2. Linear-Bezug (AUT-344 … AUT-350, Schwerpunkt AUT-347)

**Siehe Abschnitt 0** für den Abgleich „Ticket vs. Code“. Die Tabelle ordnet weiterhin **Symptom ↔ Issue** zu:

| Issue | Kurzinhalt | Bezug zu diesem Vorfall |
|--------|------------|-------------------------|
| **AUT-344** | Aktor-Burst → COMM-Queue → errno=11 → Disconnect | Seriellog: `queue_pressure` fill 6–8; zweite Session: `errno=11`, `tcp_write error` — **lwIP-Schicht** bleibt außerhalb der Queue-Mitigation |
| **AUT-345** | Loki sichtbar bei WARNING | **Im Code erledigt** (Handler loggt `entered_pressure` als WARNING) |
| **AUT-346** | Circuit Breaker OPEN blockiert Publishes inkl. Heartbeat → Broker-Timeout | **Im kritischen Pfad noch offen:** `publish()` blockiert vor Heartbeat-Erkennung (siehe 0 und 1a) |
| **AUT-347** | Lifecycle unter Druck | **Nur teilweise:** kritisches `queuePublish`, aber **kein** expliziter Drop-Marker / Server-Dedup laut Code-Review |
| **AUT-348** | Sensor-Publishes brechen vor MQTT-Disconnect | Loki: Sensor stale 205–234 s um 16:23 UTC |
| **AUT-349** | Leerer `broadcast/emergency` | Mosquitto-Log zeigt Subscriptions auf `broadcast/emergency` (Payload-Länge nicht in jeder Zeile) |
| **AUT-350** | `system/will` Handler `returned False` | Loki 16:17:14 — siehe Abschnitt 5 |

---

## 3. Seriellog — chronologische Treiber (von dir geliefert)

### 3.1 Boot / Netz / Zeit

- **SSID `Funkturm`**, Broker **`192.168.178.60`**, ESP-IP **`192.168.178.61`** — Zielnetz **192.168.178.0/24**.
- Direkt nach Connect: **`Reason: 202 - AUTH_FAIL`**, danach erfolgreicher Connect — **einmaliger Auth-Fehlschlag** (falsches Passwort, PMF, 4-Way-Handshake-Timeout oder Router-Antwort verzögert).
- **NTP Primary `192.168.0.39`** liegt **nicht** im gleichen Subnetz wie das aktive WLAN **178.x**. Ergebnis: **NTP Boot Wait elapsed**, erst später Sync (nach erneutem Wi‑Fi-Connect) **erfolgreich** — bis dahin unsichere Zeitstempel auf dem Gerät.

### 3.2 Erste kritische Phase (~109 s Uptime)

1. Große **MQTT-Config** vom Server (`CFG_IN` ~1705 Byte) wird verarbeitet — legitimer **Publish-/ACK-Sturm**.
2. **`MQTT_CLIENT: Writing didn't complete in specified timeout: errno=0`** → Klassifizierung **`write_timeout_silent`**, **`last_errno=119`** (ETIMEDOUT) im verwalteten Reconnect-String.
3. **`MQTT_EVENT_DISCONNECTED`** unmittelbar gefolgt von **`WiFi … Reason: 6 - NOT_AUTHED`** — **Wi‑Fi fällt aus / verliert Authentisierung**, nicht nur „MQTT hat gekündigt“.
4. Wi‑Fi reconnectet schnell (**gleiche IP 192.168.178.61**), NTP sync **OK**.
5. **`esp_mqtt_client_reconnect` → `ESP_FAIL`** mehrfach, Backoff — **MQTT-Stack nicht bereit** trotz `wifi_connected=true`.
6. Parallel: **`Sensor Manager: MQTT not connected, skipping publish`**.
7. Später erneut TCP: **`Software caused connection abort`**, **`errno=113`**, dann **`MQTT_EVENT_CONNECTED`**, Subscription-Sturm, aber **`Registration pending (no heartbeat ACK), skipping publish`** über **~24 s** — Gate/Server-ACK fehlt, Sensoren bleiben stumm.
8. **`POWERON_RESET`** — harter Neustart (extern oder Watchdog/Reset-Leitung; im Snippet kein Guru-Text).

### 3.3 Zweite Boot-Session (nach Reset)

- Wieder **`AUTH_FAIL 202`** beim ersten Versuch.
- **`queue_pressure`** bei Aktor ON/OFF (**fill 6–7, hwm 8, shed=0, drop=0**).
- **`TRANSPORT_BASE: tcp_write error, errno=No more processes`** / **`Writing failed: errno=11`** — deckungsgleich mit **AUT-344 / AUT-346**.
- Gleiche **`ESP_FAIL`**, **`errno=113`**, Grace → **OFFLINE_ACTIVE**, erneute Disconnect-Schleife, erneuter **POWERON_RESET**.

### 3.4 Nebenbefunde (Firmware)

- **`Preferences begin(): nvs_open failed: NOT_FOUND`** — separater NVS-Namespace, **kein** direkter Netzwerk-Crash-Trigger.
- **`MQTTIN`/`CFG_IN` Zeilen verzahnt** (zwei Tasks schreiben UART) — erschwert Lesen, kein funktionaler Hauptbefund.

---

## 4. Loki (letzte ~1 h) — Korrelation mit Seriellog

Abfrage: `{compose_service=~"mqtt-broker|el-servador"} |= "EA5484"` (Auszug, **Wall-Clock UTC**).

### 4.1 IP-Wechsel = Router-/Subnetz-Wechsel (Beleg)

- **`192.168.0.161`** — `disconnected: exceeded timeout` um **16:06:48 UTC**.
- Später durchgehend **`192.168.178.61`** — Connects/Disconnects ab **~16:10 UTC**.

Das bestätigt die Nutzerhypothese **WLAN gewechselt**: zwei **unterschiedliche Client-IP-Subnetze** im Broker-Log.

### 4.2 Mosquitto (ESP_EA5484)

- Mehrfach: **`disconnected: session taken over`** (z. B. **16:11:25**, **16:12:35**, **16:13:36**) — **zwei TCP-Sessions mit gleicher MQTT Client-ID** oder Reconnect bevor die alte Session vollständig beendet ist ([AUT-332](https://linear.app/autoone/issue/AUT-332/p1high-firmware-session-takeover-replay-als-additiver-outbox)).
- **`disconnected: exceeded timeout`** (**16:21:18**, **16:23:43**) — Broker-seitiger **Keepalive/PINGREQ**-Timeout, typisch wenn der Client **schreibblockiert** oder **nicht mehr draint** ([AUT-346](https://linear.app/autoone/issue/AUT-346/error-firmware-circuit-breaker-mqtt-open-blockiert-heartbeatkeepalive)).
- Zwischendurch **`connection closed by client`** (**16:18:49**) — sauberer ESP-seitiger Close, dazu passend **LWT** mit `flapping` laut Server-Log.

### 4.3 Server (`el-servador`)

- **LWT / unexpected_disconnect** mit **`flapping=True`** in dichter Folge (**16:11–16:23 UTC**) — konsistent mit Takeover + Timeout.
- **Queue pressure** (`entered_pressure`, fill 6–7, hwm 7–9; teils **shed_count=9, drop_count=9** um **16:03 UTC**) — Server empfängt die Druck-Metriken von der Firmware.
- **Sensor stale** um **16:23:10 UTC** (GPIO 0 / 4, teils **205–234 s**) — Telemetrie-Ausfall **nach** instabiler MQTT-Phase ([AUT-348](https://linear.app/autoone/issue/AUT-348/error-f3-sensor-publishes-brechen-5-min-vor-mqtt-disconnect-shed)).
- **Zone assignment ACK timeout** (**16:14:29**) — ESP war zu diesem Zeitpunkt **nicht zuverlässig subscribed/ACK-fähig**.
- **`Handler returned False for topic …/system/will`** (**16:17:14**) — [AUT-350](https://linear.app/autoone/issue/AUT-350/error-f6-systemwill-handler-returned-false-lwt-db-inkonsistenz-bei); **DB-Pfad für LWT** mindestens einmal fehlgeschlagen.
- **`intent_outcome` / lifecycle** Warnungen (**15:33–16:03 UTC** im Fenster) — passend zu **AUT-347** (Lifecycle-Enqueue unter Last).

---

## 5. Prometheus (Stand Abfrage)

- `queue_pressure_event_total{esp_id="ESP_EA5484"}` — Instant-Query lieferte **keine** Roh-Zeitreihe im ersten Call (leeres `result`); **`increase(...[1h])`** zeigte für **`entered_pressure`** ≈ **74** und **`recovered`** ≈ **73** — **hohe Druckfrequenz** in der betrachteten Stunde (Zähler inkrementieren trotz kurzem Docker-Restart der Stack-Metrik-Seite; Aussage: **viele Pressure-Zyklen**, nicht „ein einzelner Spike“).

---

## 6. PostgreSQL (`command_outcomes`, letzte ~2 h)

Stichprobe (`esp_id = 'ESP_EA5484'`, absteigend nach `created_at`):

- Abwechselnd **`lwt` / `offline` / `LWT_DISCONNECT`** und **`command` / `applied`** sowie **`actuator_response` / `success`** — das Gerät **arbeitet Befehle ab**, fällt aber **wiederholt** in **LWT-Pfade** (Broker/Transport).
- Zeitlich dicht an Loki: z. B. **16:21:18**, **16:23:43** UTC als **`lwt`**-Zeilen.

---

## 7. Problemliste (präzise, mit Belegpfad)

| # | Problem | Beleg |
|---|---------|--------|
| P1 | **Wi‑Fi-Instabilität** (Auth-Fail, NOT_AUTHED) verschärft MQTT | Seriellog: `202 AUTH_FAIL`, `6 NOT_AUTHED` nach Write-Timeout |
| P2 | **NTP-Konfiguration** primär auf **192.168.0.39** während Betrieb in **178.x** — Boot-Zeit unsicher | Seriellog: NTP Boot Wait / falsches Subnetz |
| P3 | **MQTT-Schreibpfad-Timeout / errno=11** unter Last | Seriellog; Loki `exceeded timeout` |
| P4 | **`session taken over`** — zusätzliche Disconnects | Loki Mosquitto 16:11–16:13 |
| P5 | **Reconnect `ESP_FAIL` / errno 113** — Recovery hängt | Seriellog |
| P6 | **Gate „kein heartbeat ACK“** nach Teil-Reconnect | Seriellog: `Registration pending…` |
| P7 | **Sensor stale** serverseitig | Loki 16:23:10 |
| P8 | **LWT-Handler False** | Loki 16:17:14 — AUT-350 |
| P9 | **Intent/Lifecycle-Datenlücken unter Last** | Loki ältere Fenster + AUT-347 |

---

## 8. Einordnung: „Warum ging es im anderen Netz besser?“

Plausible, **logisch konsistente** Erklärung ohne Spekulation über „Router-Marke“:

- **Weniger UDP/TCP-Latenz**, **kein Auth-Flap**, **kein paralleler Client** mit gleicher ID → **kein session taken over**.
- **NTP im gleichen Subnetz** erreichbar → sauberere Zeit → weniger Randeffekte in Timeouts/Logging.
- **Geringere Last** (kein Stress-Toggle) → COMM-Queue bleibt unter **`entered_pressure`**.

Das aktuelle Seriellog zeigt dagegen **Kombination aus Last (Aktor-Burst)** + **Wi‑Fi-Reason-6** + **MQTT-Transportfehlern** — das ist **mehr als ein einzelner Bug**.

---

## 9. Empfohlene nächste Schritte (kurz, operativ — nach Codeprüfung priorisiert)

1. **Firmware (P0, AUT-346):** In `mqtt_client.cpp` **`allowRequest()` erst nach Heartbeat-/System-Response-Erkennung** werten **oder** Heartbeat (und ggf. minimaler MQTT-PING-Pfad) **vor** dem CB-Gate führen — sonst bleibt die Selbstverstärkung **CB OPEN → kein App-Heartbeat → Broker-Timeout** bestehen.  
2. **Linear-Disziplin:** Wenn AUT-344–347 wirklich abgeschlossen sind, Tickets auf **Done** setzen; wenn nicht, **Backlog** beibehalten — aktuell widerspricht der API-Stand der „erledigt“-Angabe.  
3. **Router „Funkturm“:** PMF, WPA2/WPA3, Kanal, SSID-Kollisionen; **NOT_AUTHED (6)** im AP-Log.  
4. **Firmware NTP:** Primary **nicht** fest auf fremdes Subnetz (`192.168.0.39` bei `192.168.178.x`).  
5. **MQTT Client-ID / Reconnect:** [AUT-343](https://linear.app/autoone/issue/AUT-343/aut-338-s5-mqtt-clientcpp-sauberer-disconnect-vor-reconnect-session) — **`session taken over`** reduzieren.  
6. **AUT-347 (Observability):** Bei fehlgeschlagenem Lifecycle-Enqueue **explizites Ersatzsignal** (Topic/Marker oder eingebettete Stage im Outcome), damit der Server **nicht** auf halbleeren Traffic schließen muss.  
7. **Server:** [AUT-350](https://linear.app/autoone/issue/AUT-350/error-f6-systemwill-handler-returned-false-lwt-db-inkonsistenz-bei) — LWT-Handler darf **nicht** still `False` liefern.

---

*Ende des Berichts.*
