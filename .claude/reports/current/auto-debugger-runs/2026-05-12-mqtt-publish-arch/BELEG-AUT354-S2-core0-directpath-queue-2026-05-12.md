# BELEG: AUT-354 (S2) — Core-0-Direktpfad-Inventar + Queue-Diskrepanz (8 vs. 15)

**Issue:** AUT-354 (Sub von AUT-353)  
**Datum:** 2026-05-12  
**Scope:** El Trabajante (ESP-IDF-Pfad, `MQTT_USE_PUBSUBCLIENT` ausgeschlossen — vgl. Skill **esp32-development** §0 Stack-Anker: Standard-Backend `esp_mqtt_client`, Env `esp32_dev`)  
**Repo-Stand:** Verifiziert gegen `publish_queue.h`, `mqtt_client.cpp`, `mqtt_client.h`, `communication_task.cpp`, `intent_contract.cpp`, `actuator_manager.cpp`, `health_monitor.cpp`, `config_response.cpp`

**Linear-Pfaderfüllung:** identischer Inhalt zusätzlich als `S2-direktpfad-inventar-2026-05-12.md` (AUT-354 Issue-Body).

---

## 1. Queue-Diskrepanz 8 vs. 15 — geklärt

| Quelle | Aussage |
|--------|---------|
| **Kanonscher Code** | `PUBLISH_QUEUE_SIZE = 8` in `El Trabajante/src/tasks/publish_queue.h` (eine Queue `g_publish_queue`, `xQueueCreate(PUBLISH_QUEUE_SIZE, sizeof(PublishRequest))`). |
| **Historischer Wert „15“** | Frühere Dimensionierung; im Header dokumentiert: 15 Slots verbrauchten ~33 kB Heap und verhinderten wiederholt die Erstellung der Communication-Task auf realen Geräten → Reduktion auf **8** (AUT-344 Kommentar im selben Header). |
| **Irreführende Artefakte** | Noch „15“ in älteren Planungs-MDs unter `.claude/auftraege/Auto_One_Architektur/esp32/` und `architektur-autoone/paket-01-esp32-modul-inventar.md` (wird mit Repo-IST abgeglichen). Forensik `BELEG-F1-COMM-QUEUE-EXHAUSTION-2026-05-11.md` stellt die Diskrepanz als offene Frage — **Antwort:** eine Queue, Tiefe **8**; Log-HWM=8 = vollständig gefüllte Queue, nicht „15“. |

**Fazit für AUT-344 / Server-Telemetrie:** `queue_capacity` in Heartbeat/queue_pressure ist **8**; jede Doku oder Analyse, die `g_publish_queue`-Tiefe **15** nennt, ist veraltet.

---

## 2. Drei Wege zum Broker (vereinfacht)

1. **Core-1- oder Callback-gestützt:** `MQTTClient::publish()` erkennt `xPortGetCoreID() == 1` oder `g_in_mqtt_event_callback` → `tryQueuePublish()` → `g_publish_queue` (max. 8 Einträge).
2. **Core-0-Drain:** `MQTTClient::processPublishQueue()` zieht aus `g_publish_queue` und ruft `esp_mqtt_client_publish()` auf (verbraucht keinen zusätzlichen App-Queue-Slot; Daten waren bereits eingereiht).
3. **Core-0-Direktpfad:** `MQTTClient::publish()` auf Core 0 **ohne** Callback-Flag → sofort `esp_mqtt_client_publish()` — **kein** Slot in `g_publish_queue`.

Zusätzlich **ohne** Umweg über `publish()`:

- `MQTTClient::publishSessionAnnounce()` ruft `esp_mqtt_client_publish()` direkt auf (Session-Handshake aus **MQTT_EVENT_CONNECTED**-Handler / IDF-MQTT-Task — **kein** `g_publish_queue`-Slot, Kontext ≠ Comm-Task).

---

## 3. Inventar: alle `esp_mqtt_client_publish`-Aufrufe (`mqtt_client.cpp`)

| # | Funktion / Kontext | Zeile (ca.) | Rolle |
|---|-------------------|-------------|--------|
| A | `MQTTClient::publish()` — Zweig Core 0, nicht in MQTT-Callback | ~699 | Haupt-Direktpfad für alle `publish()`/`safePublish()`-Aufrufe von Core 0. |
| B | `MQTTClient::processPublishQueue()` — Drain-Schleife | ~1242 | Entleert `g_publish_queue` → IDF-Outbox. |
| C | `MQTTClient::publishSessionAnnounce()` | ~1368 | Direkt; bypass `publish()`-Core-Router. |

Subscribe/Unsubscribe nutzen andere APIs — nicht Teil Publish-Inventar.

---

## 4. Inventar: typische Core-0-Direktpfad-Auslöser (kein `g_publish_queue`-Slot)

Ausführungskontext ist die **Communication-Task** (Core 0, 50 ms-Tick), sofern nicht anders vermerkt.

| Pfad | Modul / Funktion | Mechanismus |
|------|------------------|-------------|
| P1 | `mqtt_client.cpp` → `MQTTClient::loop()` → `publishHeartbeat()` / `publishHeartbeatMetrics()` | Ruft `publish(...)` auf Core 0 auf → Direkt-IDF (QoS 0). |
| P2 | `communication_task.cpp` → `handleQueuePressureHysteresis()` | `mqttClient.publish(queue_pressure, …)` — im Code ausdrücklich: kein Queue-Slot (PKG-01a). |
| P3 | `communication_task.cpp` → `handleActuatorStatusPublish()` → `ActuatorManager::publishAllActuatorStatus()` | Pro Aktor `mqttClient.publish(..., QoS 0)` — Direktpfad auf Core 0. |
| P4 | `MQTTClient::processPublishQueue()` → `processIntentOutcomeOutbox()` (zu Beginn von `processPublishQueue`) | Replay nutzt `safePublish` → auf Core 0 `publish()` → **Direkt** (bis zu 2 Nachrichten pro Tick, siehe `intent_contract.cpp`). |
| P5 | `main.cpp` und weitere Handler, die von **Core 0** aus `mqttClient.publish`/`safePublish` aufrufen | Gleicher Router: kein Queue-Slot, sofern nicht Core 1 / Callback. (Umfang: viele MQTT-Antwortpfade in `main.cpp` bei MQTT-Event-Verarbeitung auf Core 0; bei Callback setzt IDF-Pfad `g_in_mqtt_event_callback` → dann **Enqueue** statt Direkt.) |
| P6 | `ConfigResponseBuilder`, `HealthMonitor`, `intent_contract` (Lebenszyklus-Publish), `sensor_manager` **wenn** Aufruf auf Core 0 und nicht im Callback | Gehen durch `publish()`/`safePublish()` → bei Core 0 direkt. |

**Wichtig für Last- und OUTBOX-Modelle:** Direktpfade und Drain teilen sich die **ESP-IDF-MQTT-Outbox** (vom App-Queue-Druck getrennt; siehe AUT-326).

---

## 5. Kommunikations-Tick-Reihenfolge (IST, korrigiert ggü. älterem Diagramm)

Reihenfolge in `communication_task.cpp` (`communicationTaskFunction`, operational):

1. `wifiManager.loop()`
2. `mqttClient.loop()` — enthält u. a. `publishHeartbeat()` (**Direkt**)
3. `mqttClient.checkRegistrationTimeout()`
4. `mqttClient.processPublishQueue()` — `processIntentOutcomeOutbox()` + max. **1** Drain pro Tick (`PUBLISH_DRAIN_BUDGET_PER_TICK = 1`, ggf. gedrosselt bei Write-Timeout)
5. `handleActuatorStatusPublish()` (**Direkt**, alle Aktoren)
6. `handleQueuePressureHysteresis()` (**Direkt**)

*(Früheres Diagramm im Run `BELEG-MQTT-PUB-ARCH` setzte `processPublishQueue` vor Heartbeat; **IST** ist Heartbeat zuerst in `loop()`, danach expliziter Drain im Task.)*

---

## 6. Größen-Audit (`PublishRequest` × `PUBLISH_QUEUE_SIZE`)

| Komponente | Größe (Byte, grob) |
|------------|---------------------|
| `topic[128]` | 128 |
| `payload[1536]` | 1536 |
| `IntentMetadata` (2×64 char + 6× uint32) | 152 |
| Sonst (`qos`, `retain`, `critical`, `attempt`, `next_retry_ms`, Padding) | ≈ 16–32 |
| **Summe pro Slot** | **≈ 1832–1880** (Header nennt „~2180 B“ inkl. Alignment/Reserve — mit `sizeof(PublishRequest)` im Build verifizieren) |
| **Queue-Gesamt (8 Slots)** | **≈ 15–18 kB** Heap nur für `g_publish_queue`-Puffer (konsistent mit Kommentar „8 × ~2180 B ≈ 18 KB“) |

`PUBLISH_QUEUE_SHED_WATERMARK = 6` = 75 % von 8 (Backpressure vor „voll“).

---

## 7. Ergebnistabelle — Core-0-Direktpfade (`esp_mqtt_client_publish` ohne `g_publish_queue`-Slot)

**Definition Zeile:** `MQTTClient::publish()` auf **Core 0** und **nicht** `g_in_mqtt_event_callback` → direkter IDF-Publish (`mqtt_client.cpp` ~695–706). Zusätzlich: `publishSessionAnnounce()` (eigener `esp_mqtt_client_publish`, kein App-Queue-Slot — läuft im **MQTT-Connect-Event**-Kontext, nicht im Comm-Task).

**Topics:** Schema `kaiser/{kaiser_id}/esp/{esp_id}/…` über `TopicBuilder` (Ausnahme historisch: `session/announce` in `publishSessionAnnounce()` hardcodiert mit `kaiser/god/...` — Skill-Hinweis esp32-development).

| Direktpfad (Auslöser) | Topic (Muster) | Payload-Größe (Orientierung) | Frequenz / Trigger | QoS | „Kritisch“ (`isCriticalPublishTopic`) |
|----------------------|----------------|------------------------------|-------------------|-----|--------------------------------------|
| Kern-Heartbeat | `…/system/heartbeat` | typ. **~400–900 B** (`payload.reserve(768)`; Obergrenze `< PUBLISH_PAYLOAD_MAX_LEN` 1536, sonst Skip + Zähler) | **60 s** nach Registration (`HEARTBEAT_INTERVAL_MS`); **5 s** Retry vor ACK (`HEARTBEAT_REGISTRATION_RETRY_MS`) | 0 | Nein |
| Heartbeat-Metriken (nur `ENABLE_METRICS_SPLIT`) | `…/system/heartbeat/metrics` (TopicBuilder) | typ. **~350–600 B** (`reserve(512)`); Hard-Limit wie HB `<1536` | Nach **Änderung** der Metrik-Snapshots oder spätestens alle **5** Heartbeat-Takte (`METRICS_MAX_SKIP_COUNT` = 5) → im Normalbetrieb bis zu **~5 min** ohne Änderung | 0 | Nein |
| queue_pressure (PKG-01a) | `…/system/queue_pressure` | **<192 B** gebaut (`reserve(192)`, kleines JSON) | Nur bei **Hysterese** ENTER/RECOVERED (50 ms Tick; kein Dauerfeuer) | 0 | Nein |
| Actuator-Status (alle Aktoren) | `…/actuator/{gpio}/status` | typ. **~280–450 B** pro GPIO (`buildStatusPayload`) | Alle **30 s** (`ACTUATOR_STATUS_INTERVAL_MS`); **× Anzahl** aktiver Aktoren **hintereinander** im selben Tick | 0 | Nein |
| Intent-Outcome **Replay** (`processIntentOutcomeOutbox`) | `…/system/intent_outcome` | abhängig von JSON (Reason-Text); **< MQTT-Paketlimit** / NVS-Eintrag | Bis zu **2** Versuche pro Comm-Tick (`processed < 2` in `intent_contract.cpp`) solange Outbox nicht leer | 0 | **Ja** (Substring `intent_outcome`; Shed-Logik betrifft Core-1-Pfad) |
| Intent-Outcome **Live** (`publishIntentOutcome` → `safePublish`) | `…/system/intent_outcome` | wie Replay | Ereignisgetrieben (nach Commands, Fehlerpfaden) | 0 | Ja |
| Intent-Outcome-Lifecycle | `…/system/intent_outcome/lifecycle` | kleiner JSON-Chain-Stage | Burst möglich; auf Core 1 i. d. R. **Queue**; Core 0 direkt nur wenn Aufrufer auf Core 0 | 0 | **Nein** (explizit von `isCriticalPublishTopic` ausgenommen, AUT-331) |
| Config-Antworten | `…/config_response`, ggf. Fehlertopic | variabel (JSON) | Nach Config-Push / Validierung | **1** (`ConfigResponseBuilder::safePublish`) | **Ja** (enthält `config_response`) |
| Actuator **response** / **alert** | `…/actuator/{gpio}/response`, `…/alert` | typ. **~200–400 B** | Nach Befehlsausführung / Alarm | 0 (`safePublish`) | Ja (`/response`, `/alert`) |
| HealthMonitor-Diagnostik | `…/system/diagnostics` (TopicBuilder) | `getSnapshotJSON()` — typ. **~200–500 B** | **60 s**-Intervall im `HealthMonitor::loop()` — dieser Loop läuft im **Safety-Task (Core 1)** → Publish geht in die **Publish-Queue**, **nicht** Core-0-Direkt | 0 | Nein |
| Health-Snapshot bei Watchdog-Timeout | `…/system/diagnostics` | wie oben | Selten; `handleWatchdogTimeout()` wird vom **Comm-Task (Core 0)** aufgerufen → **Direktpfad** | 0 | Nein |
| Diverse `main.cpp`-Antworten (Zone/Subzone/System-Command, Emergency, …) | jeweils TopicBuilder | variabel | MQTT-Event-getrieben; **im** `MQTT_EVENT_DATA`-Callback ist `g_in_mqtt_event_callback` gesetzt → **Enqueue**, kein Core-0-Direktpfad | meist 0 oder 1 | gemäß Topic (viele `/response` → Ja) |
| **session/announce** | `kaiser/god/esp/{id}/session/announce` | **<320 B** (Stack-`char payload[320]`) | Bei **MQTT_EVENT_CONNECTED** (Reconnect) | 0 | Nein |
| **Queue-Drain** (`processPublishQueue`) | diverse (Sensor-Daten, …) | ≤ `PUBLISH_PAYLOAD_MAX_LEN` − 1 pro Slot | Max. **1** Nachricht / 50 ms Tick (`PUBLISH_DRAIN_BUDGET_PER_TICK`); bei Write-Timeout ggf. gedrosselt | gemäß eingereihtem `PublishRequest` | gemäß eingereihtem Flag `critical` |

**Hinweis QoS:** Skill-Tabelle (esp32-development) und `MQTT_TOPICS.md` können divergieren — **maßgeblich** sind die `publish`/`safeSubscribe`-Aufrufe im Repo (hier: intent_outcome und Actuator-Status bewusst **QoS 0**, AUT-54/AUT-326).

---

## 8. Bottleneck bei `errno=11` (EAGAIN) vs. Publish-Queue

Drei getrennte Ebenen:

1. **`g_publish_queue` (8 Slots):** Begrenzt, wie viele Publishes vom **Core 1** (und aus dem MQTT-Data-Callback auf Core 0) **vor** dem Comm-Task serialisiert werden können. Voll → Shed/Drop (`tryQueuePublish`), Telemetrie in Heartbeat (`publish_queue_*`).
2. **ESP-IDF MQTT-Outbox:** Alle erfolgreichen Enqueues in den IDF-Client (Direkt **und** Drain) landen hier; `msg_id == -2` = Outbox voll (`PUBLISH_OUTBOX_FULL` / AUT-326 Kontext).
3. **TCP-Socket / LWIP (`errno=11` EAGAIN):** „Would block“ beim **non-blocking** Send — tritt auf, wenn der **Kernel-Sendepuffer** die Daten nicht schnell genug aufnimmt. Das ist **kein** FreRTOS-`g_publish_queue`-Slot-Problem, korreliert aber mit **zu vielen schnellen** `esp_mqtt_client_publish`-Aufrufen (Direktpfad-Bursts + Drain + QoS-1-PUBACK-Druck).

**Antwort auf AUT-344-Frage „welcher Queue ist der Bottleneck?“:** Unter schnellem Schalten + viel Telemetrie ist typischerweise zuerst der **Transport** (EAGAIN / Write-Timeout) oder die **IDF-Outbox** sichtbar; die **8er App-Queue** ist ein **vorgelagerter** Drossel für Core-1-Traffic und spiegelt sich in `queue_pressure`/4062 — aber **nicht** jede `errno=11`-Kette geht über Queue-Full.

---

## 9. Konkurrenz Direktpfad vs. Queue-Drain

Alle Pfade (Direkt, Drain, Session-Announce) teilen sich **denselben MQTT-Client** und damit **dieselbe TCP/TLS-Session** und IDF-interne Outbox. **Konkurrenz** entsteht, wenn im selben kurzen Zeitfenster viele Nachrichten eingespeist werden — z. B. Heartbeat + **N** Actuator-Status-Publishes + **1** Drain + Outbox-Replays. Der **Drain-Budget** von **1**/Tick ist eine bewusste Entlastung für genau diese Überlagerung (`mqtt_client.cpp`, Kommentar AUT-54).

---

## 10. Erfolgskriterien AUT-354 S2

- [x] Vollständige Liste der `esp_mqtt_client_publish`-Stationen im MQTT-Client.
- [x] Abgrenzung Direktpfad vs. `g_publish_queue` vs. Drain.
- [x] Klärung 8 vs. 15: **eine Queue, aktuell 8**; 15 = historisch / veraltete Doku.
- [x] Größenordnung Queue-Heap nachvollziehbar.
- [x] Tick-Reihenfolge mit Codezeilen verifiziert.
- [x] Linear-Tabelle: Direktpfad · Topic · Payload · Frequenz · QoS · Kritisch-Flag.

**Nächste sinnvolle Schritte (nicht S2):** AUT-355 (Kalibrierung nach Metrics-Split); veraltete „15“-Markdowns unter `.claude/auftraege/Auto_One_Architektur/esp32/` optional per `/updatedocs` bereinigen.
