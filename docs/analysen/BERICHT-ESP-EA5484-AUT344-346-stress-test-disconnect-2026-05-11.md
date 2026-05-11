# Stack-Analyse: ESP_EA5484 — Stress-Test AUT 344–346 (ON/OFF), „Disconnected“-Ereignisse und verbleibende Probleme

**Auswertungsdatum:** 2026-05-11 (UTC, Zeiten aus Docker/Loki wie erfasst)  
**Gerät:** ESP_EA5484 (`192.168.0.161`)  
**Kontext:** Viele Ein-/Ausschaltbefehle zur Validierung der Implementierung rund um **AUT 344–346** (u. a. Intent-Outcomes über Publish-Queue, Lifecycle-Stufen, Queue-Pressure / Shedding auf der Firmware).

---

## 1. Kurzfassung

Es liegen **zwei klar getrennte Ursachen** für „Disconnected“-Wahrnehmung vor:

1. **Kontrollierter Hinweis „Server offline“ (`graceful_shutdown`)**  
   Die Firmware empfängt `kaiser/god/server/status` mit `offline` und Grund `graceful_shutdown`, fährt Safety-P5/P4 an und startet die 30s-Grace — **ohne** sofortigen MQTT-Transportabbruch. Das korreliert mit **Docker-Neustart des Servers** (`INFO: Shutting down` im `automationone-server`-Log). Das ist **kein Regressionsbeweis** gegen AUT 344–346, sondern erwartetes Verhalten bei Deploy/Restart.

2. **Echter MQTT-Transportfehler (später in derselben Session)**  
   Nach anhaltender Last zeigen Logs **Sensor-Publish-Fehler**, dann **`Writing didn't complete … errno=119`**, **`write_timeout_silent`**, **`MQTT_EVENT_DISCONNECTED`**, Reconnect-Versuche mit **`ESP_FAIL`** und **`errno=113`** (Verbindungsabbruch). Der Broker meldet parallel **`disconnected: exceeded timeout`**, der Server ein **`LWT … unexpected_disconnect`**. Das ist **Backpressure / Zeitüberschreitung auf dem Schreibpfad**, konsistent mit hoher **COMM-Queue-Pressure** (`fill` 6–7, `hwm` 7–8, **`shed` bis 47**, **`drop=0`**).

Die AUT-Änderungen wirken **stabiler als frühere Sessions** (kein `errno=11` „No more processes“ in diesem Trace; Shedding zählt hoch, aber Drops bleiben 0). **Verbleibend:** Lifecycle-Stufen können bei Druck **nicht** in die Publish-Queue (Warnung `outcome_publish_ok`), während das Outcome selbst oft schon **`safePublish`/`publish`** erreicht — Server-seitig fallen weiterhin **Lifecycle-Payloads ohne `event_type`** und **`intent_outcome`-Parsing-Warnungen** auf. Zusätzlich: **leere `broadcast/emergency`-Payload** auf dem ESP als Parse-Error, **`session taken over`** am Broker (doppelte Client-ID / zweiter Connect).

---

## 2. Methodik (Stack, wie ausgewertet)

| Schicht | Quelle |
|--------|--------|
| Firmware | Von dir bereitgestelltes Seriellog (ESP, `[INC-EA5484]`, COMM/MQTT/SAFETY) |
| Docker | `docker ps`, `docker logs automationone-server`, `docker logs automationone-mqtt` |
| Loki | `http://127.0.0.1:3100/loki/api/v1/query_range`, Labels `compose_service` (`mqtt-broker`, `el-servador`) |
| Prometheus | `http://127.0.0.1:9090/api/v1/query` auf `queue_pressure_event_total{esp_id="ESP_EA5484"}` (Zählerstand nach Server-Restart nur Teilmenge) |

---

## 3. Zeitliche Korrelation (Wall-Clock, UTC 2026-05-11)

| Zeit (UTC) | Quelle | Ereignis |
|------------|--------|----------|
| 15:00:08 | Mosquitto | `session taken over` → neuer TCP-Port, alter Session-Abbruch |
| 15:02:55 | Mosquitto + Server `lwt_handler` | `exceeded timeout` + LWT `unexpected_disconnect` |
| 15:32:17 | Mosquitto | Neuer Connect nach längerer Unterbrechung |
| 15:32:54 | Mosquitto | Erneut `session taken over` |
| 15:32:54 | Server | LWT `unexpected_disconnect` |
| 15:32:34 | Server | Sensor stale ~1887–1889 s (Folge vorheriger Auszeit) |
| 15:33:28–15:34:13 | Server | `intent_outcome missing intent_id` / `unknown` flow+outcome |
| 15:33:42–15:33:49 | Server | `Dropping malformed … Missing event_type` |
| 15:35:29–15:35:51 | Server | `Queue pressure … shed_count=42…47`, `hwm=8` |
| 15:37:23 | Mosquitto + Server | `exceeded timeout` + LWT |
| 15:38:29 | Mosquitto | Wiederhergestellter Connect |
| 15:38:55–15:38:56 | Server | Queue pressure erneut (`shed_count` 1–2 nach frischem Connect) |

Die **Firmware-Uptime** (`uptime_ms` in deinem Log) ist **nicht** 1:1 mit UTC zu verknüpfen; die **Broker- und Server-Zeilen** sind die autoritative Wall-Clock-Korrelation.

---

## 4. Ereignis A: „Disconnected“ durch Server-`graceful_shutdown` (kein MQTT-Bug)

### 4.1 Firmware-Beleg

```text
[97305] … [BOOT] [MQTTIN] … kaiser/god/server/status … "status": "offline" …
[97308] … [SAFETY-P5] Server OFFLINE (reason: graceful_shutdown)
[97336] … [SAFETY-P4] disconnect notified (path=P5)
[97347] … [SAFETY-P4] Disconnect — 30s grace timer started (t_ms=97347)
[105499] … [SAFETY-P4] Reconnected during grace period - back ONLINE
```

Interpretation: **P5** wertet den **Status-Topic** aus, **P4** startet Grace; MQTT bleibt zunächst verbunden, bis andere Pfade greifen. Das erklärt UI/„Disconnected“-Gefühl ohne dass der Stack „zerbricht“.

### 4.2 Server-/Infra-Beleg

```text
docker logs automationone-server … 
INFO:     Shutting down
```

`docker ps` zeigte während der Auswertung **`automationone-server` … Up 6 minutes** — passend zu einem **kurzen Neustart** in genau diesem Fenster.

**Fazit:** Dieses „Offline“ ist **operativ** (Deploy/Stop), nicht AUT-344–346-falsch.

---

## 5. Ereignis B: Stress-Test — Queue-Pressure, Lifecycle-Warnungen, dann harter MQTT-Abbruch

### 5.1 Firmware: Shedding und „Outcome ok, Lifecycle-Queue voll“

Wiederholt:

```text
[WARNING] [INTENT] [INC-EA5484] Lifecycle chain-stage enqueue failed: outcome_publish_ok
[INFO]    [COMM] queue_pressure entered_pressure fill=6 hwm=7 shed=… drop=0
```

**Technische Einordnung (Code):** Nach erfolgreichem Outcome-Publish ruft die Firmware `recordIntentChainStage(..., "outcome_publish_ok", …)` auf. Die Stufe wird per `queuePublish` auf das Lifecycle-Topic gelegt. Schlägt **nur** diese Queue zu, erscheint exakt diese Warnung — **das Outcome ist bereits raus**, die **Diagnose-Lifecycle-Zeile** fehlt.

Referenz (Firmware):

```748:754:/home/robin/autoone/El Trabajante/src/tasks/intent_contract.cpp
        if (command_flow) {
            recordIntentChainStage(active_metadata,
                                   "outcome_publish_ok",
                                   flow,
                                   code,
                                   "outcome publish delivered");
        }
```

```644:648:/home/robin/autoone/El Trabajante/src/tasks/intent_contract.cpp
        if (!queuePublish(lifecycle_topic, payload.c_str(), 1, false, true, nullptr)) {
            LOG_W(IC_TAG, "[INC-EA5484] Lifecycle chain-stage enqueue failed: " + String(stage));
        }
```

Das bestätigt: **AUT-56 / Queue-Pfad** schützt das Outcome; unter Last fehlen sekundäre Lifecycle-Publishes — **erwartbar**, aber serverseitig weiterhin als „malformed“ / fehlende Felder sichtbar, wenn **andere** oder **teilweise** Payloads ankommen (siehe 5.3).

### 5.2 Firmware: Sensor-Publish scheitert, dann Write-Timeout und Disconnect

```text
[184705] [ERROR] [SENSOR] Sensor Manager: Failed to publish sensor data for GPIO 4
…
E (240727) MQTT_CLIENT: Writing didn't complete in specified timeout: errno=119
… classified=write_timeout_silent
… MQTT_EVENT_DISCONNECTED … managed reconnect … ESP_FAIL … errno=113 …
```

Das ist die **klassische Eskalation**: Datenpfad (Sensoren) verliert Publishes → MQTT-Client blockiert/verhungert auf Schreiben → Broker sieht **Keepalive/PING nicht rechtzeitig** → **`exceeded timeout`**.

### 5.3 Mosquitto-Beleg

```text
2026-05-11T15:37:23Z: Client ESP_EA5484 [192.168.0.161:52615] disconnected: exceeded timeout.
```

### 5.4 Server-Beleg (LWT + Queue-Pressure)

```text
2026-05-11 15:37:23 - … lwt_handler … LWT received: ESP ESP_EA5484 … unexpected_disconnect …
2026-05-11 15:35:29 - … queue_pressure_handler … entered_pressure … shed_count=42 … hwm=8 …
```

Die **`shed_count`-Werte** (Server) und die **monoton steigenden `shed=`** (Firmware) sind **dieselbe Lastsignatur**.

---

## 6. Weitere auffällige Punkte (nicht primär AUT 344–346, aber relevant)

### 6.1 `session taken over` (Broker)

```text
2026-05-11T15:32:54Z: Client ESP_EA5484 [192.168.0.161:57022] disconnected: session taken over.
2026-05-11T15:32:54Z: New client connected from 192.168.0.161:52615 as ESP_EA5484 …
```

Zwei Verbindungen mit **derselben Client-ID** — typisch **Reconnect vor vollständigem Broker-Cleanup** oder **zweites Gerät/Testclient**. Das erzeugt **zusätzliche** Disconnect-Noise unabhängig von Intent-Logik.

### 6.2 Leere Emergency-Broadcast (Firmware-Fehler)

```text
[105530] [MQTTIN] len=0 tail=kaiser/broadcast/emergency
[105533] [ERROR] Broadcast emergency parse error: EmptyInput …
```

Der Server sollte **keine leeren Retained/Will-Payloads** auf diesem Topic erzeugen; die Firmware sollte **len=0** tolerant ignorieren (Policy `reject_no_stop` ist ok, aber Log-Lärm und verwirrende Korrelation).

### 6.3 NVS `Preferences begin(): nvs_open failed: NOT_FOUND`

Einmaliger Boot-Hinweis — separater Konfigurations-Namespace, **kein** direkter MQTT-Disconnect-Trigger in diesem Trace.

### 6.4 Server: `system/will` Handler `returned False`

Loki / Server-Log (Auszug): `Handler returned False for topic …/system/will` — **LWT-Verarbeitung** lief in mindestens einem Fall in einen Fehlerpfad (SQL/Handler). Das sollte **einmalig** untersucht werden, weil es **DB/Handler** betrifft, nicht die ESP-Toggle-Schleife.

---

## 7. Verbleibende Probleme (präzise, logbelegt)

| # | Problem | Warum es wichtig ist | Beleg |
|---|---------|----------------------|--------|
| 1 | **Transport-Timeout unter Dauerlast** | UI/API sehen LWT/offline; Aktor geht in Safe State | Firmware `errno=119`, `MQTT_EVENT_DISCONNECTED`; Mosquitto `exceeded timeout`; Server LWT 15:37:23 |
| 2 | **Lifecycle-Stufen verlieren Queue-Slots** | Observability/Intent-Trace lückenhaft; Server verwirrt durch andere Payloads | Firmware `Lifecycle chain-stage enqueue failed: outcome_publish_ok`; Server `Missing event_type` / `intent_outcome missing intent_id` |
| 3 | **Sensor-Publishes brechen vor MQTT-Disconnect** | „Stale“-Alarme, schlechte Regelqualität während Stress | Firmware `Failed to publish sensor data`; Server `Sensor stale` |
| 4 | **`session taken over`** | Zusätzliche Disconnects, schwer zu debuggen | Mosquitto 15:00:08, 15:32:54 |
| 5 | **Leerer `broadcast/emergency`** | Parse-Errors, Safety-Log-Noise | Firmware `len=0` + `EmptyInput` |
| 6 | **Prometheus-Zähler nach Server-Restart** | Summen „seit Beginn“ sind nicht die Session-Gesamtheit | `queue_pressure_event_total` zeigt nur kleine Post-Restart-Werte; Session-Peak aus **Server-Log** (`shed_count=47`) |

---

## 8. Fazit zu AUT 344–346

- **Funktional:** Viele ON/OFF-Zyklen laufen durch; **Shedding** arbeitet (`shed` hoch, **`drop=0`** auf COMM-Pressure-Logs). Outcomes erreichen den Broker oft trotzdem (`outcome_publish_ok`-Pfad).
- **Nicht gelöst:** Extreme Toggle-Rate füllt weiterhin die **End-to-End-Publish-Pipeline** so, dass **Sensoren** und **MQTT-Schreib-Timeouts** kollidieren — das ist **Durchsatz-/Priorisierungs-Thema** (Sensoren vs. Intent vs. Lifecycle), nicht „ein fehlendes if“.
- **„Disconnected“:** Teilweise **Server-Restart** (`graceful_shutdown`), teilweise **echter Netzwerk-/MQTT-Timeout** nach Lastspitze — in Logs **trennbar**.

---

## 9. Empfohlene nächste Schritte (kurz)

1. **Rate-Limit / Debounce** für identische Aktor-Kommandos (API/UI) unter Lasttests — reduziert realistische Worst-Cases.  
2. **Priorität:** Sensor-Publish bei COMM-Pressure weiter absenken oder **QoS/Intervall** dynamisch (bereits teils Richtung Shedding — ausbauen).  
3. **Broker:** Ursache **`session taken over`** finden (nur ein Client pro `client_id`, Reconnect-Timing).  
4. **Server:** Leere Emergency-Payloads unterbinden; `system/will`-Handler-Fehler (SQL) beheben.  
5. **Contract:** Lifecycle-Payload und `intent_outcome` so angleichen, dass bei verworfenen Chain-Stufen **keine** halb-leeren Messages mehr serverseitig ankommen — oder Server tolerant machen **ohne** `unknown`-Intent-Flood.

---

*Ende des Berichts.*
