# Analyse: Server-/Broker-Offline-Erkennung — Timing aller Safety-Mechanismen

**Repo:** AutomationOne (auto-one)  
**Schichten:** Firmware (El Trabajante) + Server (El Servador), kein Frontend  
**Typ:** IST-Dokumentation (kein Code geändert)  
**Datum:** 2026-03-31  
**Quellen:** Direkt aus dem Stand des Repos zum Analysezeitpunkt (Zeilenangaben beziehen sich auf diese Version).

---

## Executive Summary

| Mechanismus | Rolle | Kritische Konstante(n) |
|-------------|--------|-------------------------|
| MQTT Keep-Alive / TCP | Broker-Erreichbarkeit | ESP: `keepalive = 60` (`main.cpp` MQTT-Config), Server-Paho: `MQTT_KEEPALIVE` Default **60** (`config.py`) |
| SAFETY-P1 | Server-Lebendigkeit bei **aufrechter** MQTT-Verbindung | `SERVER_ACK_TIMEOUT_MS = 120000` (`main.cpp`) |
| SAFETY-P4 | Offline-Hysterese + lokale Rules | `OFFLINE_ACTIVATION_DELAY_MS = 30000` (`offline_mode_manager.h`), Rule-Eval **alle 5 s** (`safety_task.cpp`) |
| ESP-LWT (Broker→Server) | Server sieht ESP-Ausfall schnell | Topic `.../system/will`, QoS 1, retain — **ESP-seitig** konfiguriert |
| Server-MQTT-LWT | — | **Nicht konfiguriert** — `MQTTClient.connect()` setzt kein Last Will |

---

## Block A — Heartbeat-Kette ESP → Server → ESP

### A1 ESP-seitiger Heartbeat-Sender

| Aspekt | IST |
|--------|-----|
| Intervall | `HEARTBEAT_INTERVAL_MS = 60000` in `mqtt_client.h` (60 s) |
| Auslösung | `MQTTClient::loop()` ruft `publishHeartbeat()` auf — **Communication Task Core 0**, Tick `vTaskDelay(50 ms)` (`communication_task.cpp`) |
| Erster Heartbeat | Nach Connect: `onMqttConnectCallback()` → `publishHeartbeat(true)` (force), ebenfalls initial in Setup-Pfad dokumentiert (`main.cpp` Kommentar „Initial heartbeat“) |
| Payload | JSON mit `esp_id`, `seq`, Zone-Felder, `ts`, `uptime`, `heap_free`, `wifi_rssi`, Sensor-/Aktor-Counts, `wifi_ip`, `gpio_status[]`, `config_status` (Diagnose, nicht „minimal“) |
| Topic | `TopicBuilder::buildSystemHeartbeatTopic()` → Schema `kaiser/{kaiser}/esp/{esp}/system/heartbeat` |
| QoS | `publish(..., 0)` — **QoS 0** (`mqtt_client.cpp` `publishHeartbeat`) |
| Bedingung | `publishHeartbeat` wird von `loop()` nur aufgerufen wenn verbunden (ESP-IDF: implizit über gebundenen Client; PubSub: `if (isConnected())` vor `publishHeartbeat`) |

### A2 Server: Empfang und ACK

| Aspekt | IST |
|--------|-----|
| Handler | `HeartbeatHandler.handle_heartbeat` — `heartbeat_handler.py` |
| Topic | `kaiser/.../esp/{esp_id}/system/heartbeat` (via `TopicBuilder.parse_heartbeat_topic`) |
| Verarbeitung | DB: Gerät suchen/anlegen, `last_seen`, Metadaten, optional Heartbeat-History (`ESPHeartbeatRepository`), Metriken, WebSocket `esp_health` |
| ACK immer? | **Nein.** z. B. Topic-Parse-Fehler, Payload-Validation-Fehler → **kein** ACK; erfolgreiche Pfade rufen `_send_heartbeat_ack` auf (u. a. `pending_approval`, `rejected`, `online`). Rate-limited Discovery: `return True` **ohne** ACK (`_discover_new_device` → `None`) |
| ACK-Topic | `TopicBuilder.build_heartbeat_ack_topic(esp_id)` |
| ACK-QoS | **QoS 0** (`_send_heartbeat_ack`: `mqtt_client.publish(..., qos=0)`) |
| ACK-Payload | `status`, `config_available`, `server_time` (Unix) |
| Timing | ACK **nach** DB-Commit / Verarbeitungsschritten im selben async Handler — **kein** separates „sofortiges“ ACK vor schwerer Arbeit; bei Exception im `try` um `handle_heartbeat`: **kein** ACK |
| ACK-Publish-Fehler | Geloggt als Warning, Heartbeat gilt trotzdem oft als „verarbeitet“ |

**Server-seitiger Heartbeat-Timeout (ESP als offline):** `HEARTBEAT_TIMEOUT_SECONDS = 300` — Hintergrundjob markiert Geräte offline (**kein** direkter Einfluss auf ESP-P1/P4).

### A3 ESP: ACK-Empfang und P1-Timeout

| Aspekt | IST |
|--------|-----|
| Subscription | In `subscribeToAllTopics()` — bei **jedem** Connect/Reconnect (`onMqttConnectCallback` → `subscribeToAllTopics`) |
| ACK-Verarbeitung | `routeIncomingMessage` in `main.cpp`: `g_last_server_ack_ms.store(millis())`, `offlineModeManager.onServerAckReceived()`, ggf. `g_server_timeout_triggered` zurücksetzen |
| P1-Check | `checkServerAckTimeout()` in **Safety Task Core 1**, alle **~10 ms** Schleifeniteration (`vTaskDelay(10)`), aber Logik nur wenn Bedingungen erfüllt |
| Timeout-Wert | `SERVER_ACK_TIMEOUT_MS = 120000` — **nicht** zur Laufzeit aus NVS, fest im Code |
| Bedingung | `mqttClient.isConnected() && g_last_server_ack_ms > 0 && !g_server_timeout_triggered` — bei **MQTT getrennt** läuft **kein** P1-Timeout (sinnvoll: P4/MQTT-Pfad) |
| Start `last_ack` | Bei **jedem** MQTT-Connect: `onMqttConnectCallback` setzt `g_last_server_ack_ms = millis()` und `g_server_timeout_triggered = false` — **nicht** „erst nach erstem ACK“; P1 startet theoretisch 120 s nach Connect, **aber** erstes gültiges Heartbeat/Server-Verhalten liefert üblicherweise zeitnah ACK |
| millis()-Wrap | Abfrage `millis() - g_last_server_ack_ms > SERVER_ACK_TIMEOUT_MS` mit unsigned-Arithmetik — **Wraparound-sicher** im üblichen Sinne |

---

## Block B — MQTT Keep-Alive und Disconnect

### B1 Keep-Alive und LWT (ESP)

| Stack | Keep-Alive setzen | LWT |
|-------|-------------------|-----|
| ESP-IDF (`!MQTT_USE_PUBSUBCLIENT`) | `mqtt_cfg.keepalive = config.keepalive` (`mqtt_client.cpp`), Wert aus `main.cpp`: `mqtt_config.keepalive = 60` | Topic: Heartbeat-Topic mit `/heartbeat` → `/will`, Payload JSON `status`, `esp_id`, `reason`, `timestamp`; **QoS 1**, **retain true** |
| PubSubClient | `mqtt_.setKeepAlive(config.keepalive)` | Gleiches LWT-Muster in `connectToBroker`/`attemptMQTTConnection` |

**Hinweis PING-Intervall:** Im Code ist nur der **Keep-Alive-Parameter 60 s** gesetzt. Die exakte PINGREQ-Periode ist **implementationsabhängig** (ESP-IDF MQTT-Client vs. PubSubClient). Für Abschätzungen wird oft **≈ 1,5 × keepalive** bis zum Verbindungsabbruch bei totem Broker (MQTT-Spezifikation) herangezogen — **exakte** Sekundenwerte hier nicht im Anwendungscode verankert.

### B2 Disconnect-Handling (Kurz)

**ESP-IDF-Pfad (`MQTT_EVENT_DISCONNECTED`):**

1. `g_mqtt_connected = false`
2. `offlineModeManager.onDisconnect()` — nur wenn `mode_ == ONLINE` → **DISCONNECTED**, Start 30-s-Grace
3. `xTaskNotify(..., NOTIFY_MQTT_DISCONNECTED)` → Safety Task: bei **0** Offline-Rules sofort `setAllActuatorsToSafeState()`, bei Rules **nur** Log (P4)
4. Reconnect: **automatisch** durch ESP-IDF-Client (`reconnect()` explizit leer)

**PubSubClient-Pfad:** `handleDisconnection()` — zuerst Safe-State-Logik (analog), dann `onDisconnect()`, dann `reconnect()` mit Backoff `RECONNECT_BASE_DELAY_MS` (1 s) exponentiell bis max **60 s**.

**Re-Subscribe:** Wie dokumentiert: `onMqttConnectCallback` → `subscribeToAllTopics()` bei jedem Connect.

**Doppel-Aufruf Safe-State (ESP-IDF):** `onDisconnect` + Notify können **beide** Safe-State anstoßen — bei idempotentem `setAllActuatorsToSafeState` unkritisch.

### B3 LWT Server-seitig und „Server-LWT“

| Frage | IST |
|-------|-----|
| ESP-LWT auf dem Server? | Ja — `lwt_handler.py`, DB offline, Aktuator-Reset server-seitig, WebSocket |
| Eigenes LWT des FastAPI-/Python-MQTT-Clients? | **Nein** — `client.py` `connect()` ohne `will_set` / keine Will-Payload |

**Folge:** Ein reiner **Server-Prozess-Crash** ohne Broker-Ausfall wird auf dem ESP **nicht** über MQTT-Disconnect sichtbar — nur über **P1 (120 s)** solange MQTT zum Broker steht.

---

## Block C — P4 State Machine und Safety-Task

### C1 Zustände und Übergänge

**States** (`offline_mode_manager.h`): `ONLINE`, `DISCONNECTED`, `OFFLINE_ACTIVE`, `RECONNECTING`.

| Übergang | Trigger (IST) |
|----------|----------------|
| → DISCONNECTED | `onDisconnect()` nur von **ONLINE**; Call-Sites: **MQTT disconnect** (`mqtt_client.cpp` ESP-IDF; PubSub `handleDisconnection`), **P1** nach Timeout (`checkServerAckTimeout` ruft **immer** `onDisconnect()` am Ende auf — auch wenn schon Safe-State gesetzt) |
| DISCONNECTED → ONLINE | `onReconnect()` wenn Reconnect **vor** Ablauf der 30 s Grace; oder `onServerAckReceived()` während DISCONNECTED (ACK vor Grace-Ende) |
| DISCONNECTED → OFFLINE_ACTIVE | `checkDelayTimer()` wenn `millis() - disconnect_timestamp_ms_ >= 30000` |
| OFFLINE_ACTIVE → RECONNECTING | `onReconnect()` wenn vorher `OFFLINE_ACTIVE` |
| RECONNECTING → ONLINE | `onServerAckReceived()` → `deactivateOfflineMode()` |

**Doppeltes `onDisconnect`:** Zweiter Aufruf wirkt nur wenn noch `ONLINE` — danach **no-op**.

### C2 Safety-Task

| Parameter | Wert |
|-----------|------|
| Core | **1** |
| Priorität | **5** |
| Stack | **8192** Bytes |
| P1 | `checkServerAckTimeout()` |
| P4 `checkDelayTimer` | Jede Iteration (10 ms Schleife) |
| Rule-Eval | Nur wenn `isOfflineActive()`: alle **5 s** (`OFFLINE_EVAL_INTERVAL_MS`) |
| Steuerung Aktoren | `offlineModeManager.evaluateOfflineRules()` → `actuatorManager.controlActuatorBinary` (direkt, nicht über separate Queue) |

---

## Block D — Szenarien (Timing aus Code; wo nötig Annahme nach MQTT-Üblich)

### D1 WiFi kurzer Ausfall (< 30 s)

```
t=0        WiFi/MQTT bricht zusammen → typisch MQTT_EVENT_DISCONNECTED (nach TCP/Keepalive)
t≈0+       offlineModeManager.onDisconnect() → DISCONNECTED (30 s Grace)
           + Safety-Notify: Safe-State wenn keine Rules
t<30s      WiFi/MQTT wieder online → MQTT_EVENT_CONNECTED → onReconnect():
           - Wenn noch DISCONNECTED: sofort ONLINE (Grace abgebrochen)
t≈30s+     Erstes Heartbeat/ACK möglich — P4-Regeln nicht aktiv gewesen
```

**Erwartung:** Kein `OFFLINE_ACTIVE`, wenn Reconnect innerhalb 30 s und ACK/State wie vorgesehen.

### D2 MQTT-Broker crashed

```
t=0        Broker weg
t≈?        TCP/MQTT erkennt Timeout — typisch in der Größenordnung keepalive-bedingt
           (exakter Wert nicht im App-Code fixiert)
t≈?+0      MQTT disconnect → wie D1: Grace 30 s, dann OFFLINE_ACTIVE
t≈+30s     checkDelayTimer → activateOfflineMode()
t≈+30s…35s Erste Rule-Eval (nächstes 5-s-Fenster nach isOfflineActive)
```

**Korrektur zur Ziel-Erwartung im ursprünglichen Plan:** „OFFLINE_ACTIVE nach ~30 s“ ist nur korrekt **ab erkanntem MQTT-Disconnect**, nicht ab Broker-Crash. **Gesamt** = Disconnect-Erkennung + **30 s**.

### D3 Server-Prozess crashed (Broker läuft)

```
t=0        FastAPI/Handler tot, Broker ok, MQTT zum ESP steht
t=0…120s   Heartbeats gehen zum Broker; **kein** ACK (kein Consumer oder Exception vor ACK)
t=120s     checkServerAckTimeout → P1: Safe-State **oder** Delegation an P4 bei Rules;
           offlineModeManager.onDisconnect() (DISCONNECTED + 30 s Grace)
t=150s     OFFLINE_ACTIVE möglich (wenn nicht vorher reconnect/ACK)
```

**120 s unkontrolliert?** Solange der Server keine Befehle verarbeitet und kein ACK sendet, bleibt die **Server-Zentrierung** aus — lokale Rules greifen erst nach P4-Flow. Ob Aktoren „unkontrolliert“ sind, hängt von **letztem Server-Zustand** und **Hardware** ab; P1 setzt bei **0** Offline-Rules sofort Safe-State.

**P1 konfigurierbar?** Nein (nur Code-Konstante).

### D4 Netzwerk-Partition / Router hängt

Wie D2/D1: sobald MQTT den Transport als tot erkennt → gleiche P4-Kette. Zeit bis Disconnect = abhängig von TCP/MQTT-Timeouts und Keep-Alive.

### D5 Server überlastet / hängt

| Situation | Erkennung |
|-----------|-----------|
| Handler kommt nicht zum ACK | Kein ACK → nach 120 s **P1** |
| Handler blockiert **vor** Subscription/Consumer | Kann komplexer sein (Broker queued); langfristig ebenfalls **kein** ACK → P1 |
| Teil-System hängt (nur DB), Handler sendet ACK trotzdem | ESP sieht **weiterhin** ACK → **P1 feuert nicht**, obwohl „Server“ fachlich untauglich |

Das ist eine **fundamentale Lücke** der ACK-Heuristik: ACK bestätigt nicht „vollständige Server-Gesundheit“.

---

## Block E — Normalbetrieb: Nachrichtenlast (Schätzung)

### E1 Periodische MQTT-Nachrichten (pro ESP, Richtung ESP→Broker/Server)

| Typ | Intervall (typ.) | QoS | Anmerkung |
|-----|------------------|-----|-----------|
| MQTT PINGREQ/PINGRESP | ~analog keepalive | — | Protokoll, nicht in App-Logik |
| Heartbeat | 60 s | 0 | |
| Heartbeat-ACK (Server→ESP) | pro Heartbeat | 0 | |
| Sensordaten | pro Sensor `measurement_interval_ms` (Default **30 s** je Sensor in Config) | 1 | `publishSensorReading` |
| Aktuator-Status (Broadcast) | 30 s | (siehe `publishAllActuatorStatus`) | `ACTUATOR_STATUS_INTERVAL_MS` |
| Heap-Log (COMM) | 60 s | — | nur Serial-Log, kein MQTT |

Heartbeat und Sensor **nicht** zwingend phasenverschoben — können in derselben 50-ms-Comm-Task-Iteration zusammenfallen (**Lastspitzen** möglich).

### E2 Skalierung (grobe Formel)

Pro ESP und Minute (N = Sensoranzahl mit Default 30 s):

- Heartbeats: **1**
- ACKs: **1**
- Sensor-Publishes: **N × (60 / 30) = 2N** (wenn alle 30 s)
- Aktuator-Status: **2**

**Beispiel N=3:** ≈ 1+1+6+2 = **10 MQTT-Anwendungsnachrichten/min** (+ Protokoll-PINGs).

Skalierung **10 / 30 / 50 ESPs** (gleiche Annahme): **100 / 300 / 500** Anwendungsmessages/min (linear).

**Datenvolumen:** Heartbeat-Payload ist **groß** (GPIO-Array, Diagnose) — exakte Bytes von Build/Config abhängig; für Bandbreitenbudget Heartbeat **dominant**.

**DB-Writes Server:** Pro erfolgreichem Heartbeat-Pfad mindestens Device-Update + ggf. History — keine lineare Skalierung ohne Lasttests.

### E3 Überlappende Timer

Kein expliziter Phase-Offset zwischen Heartbeat (60 s) und Sensor (30 s) im Code — **asynchron** über verschiedene Zähler/`millis()`.

---

## Timing-Diagramme (kompakt)

### D1 Kurzer WiFi-Ausfall

```
WiFi/MQTT down ──► DISCONNECTED + Safe(0 rules) ──► reconnect <30s ──► ONLINE
```

### D2 Broker down

```
Broker weg ──► [TCP/MQTT timeout] ──► DISCONNECTED ──► +30s ──► OFFLINE_ACTIVE ──► Rules alle 5s
```

### D3 Server tot, Broker ok

```
MQTT ok ──► keine ACKs ──► 120s P1 ──► Safe/Delegate + DISCONNECTED ──► +30s ──► OFFLINE_ACTIVE
```

---

## Konstanten-Tabelle (Auszug)

| Name | Wert | Datei (ungefähre Zeile) |
|------|------|-------------------------|
| `SERVER_ACK_TIMEOUT_MS` | 120000 | `main.cpp` ~106 |
| `HEARTBEAT_INTERVAL_MS` | 60000 | `mqtt_client.h` ~195 |
| `mqtt_config.keepalive` | 60 | `main.cpp` ~1866 |
| `OFFLINE_ACTIVATION_DELAY_MS` | 30000 | `offline_mode_manager.h` ~24 |
| `OFFLINE_EVAL_INTERVAL_MS` | 5000 | `safety_task.cpp` ~98 |
| `HEARTBEAT_TIMEOUT_SECONDS` (Server DB) | 300 | `heartbeat_handler.py` ~46 |
| `RECONNECT_BASE_DELAY_MS` / `MAX` | 1000 / 60000 | `mqtt_client.cpp` ~42–43 |
| `ACTUATOR_STATUS_INTERVAL_MS` | 30000 | `communication_task.cpp` ~36 |
| Server `mqtt.keepalive` Default | 60 | `config.py` ~40 |

---

## Interaktions-Matrix

| | MQTT disconnect | P1 Timeout | P4 Grace | Rules 5s |
|---|----------------|------------|----------|----------|
| **MQTT disconnect** | — | blockiert P1 (`!connected`) | startet Grace (wenn war ONLINE) | später OFFLINE_ACTIVE |
| **P1** | ruft `onDisconnect()` | — | startet Grace (wenn war ONLINE) | wie P4 |
| **ACK** | — | setzt `last_ack`, P4 `onServerAckReceived` | kann Grace abbrechen | Rules nur wenn offline aktiv |

---

## Lücken- und Risiko-Liste

1. **Server ohne LWT:** Crash mit laufendem Broker → max. **120 s** bis P1, nicht „Broker-Latenz“.
2. **ACK nicht gleich Server-Gesundheit:** ACK kann bei partiellem Ausfall/Logik-Fehler weitergehen.
3. **Heartbeat-Handler ohne ACK:** Validation-Fehler, Discovery rate-limited → ESP könnte **ohne** ACK bleiben → P1.
4. **Doppelte Safe-State-Pfade:** MQTT-Disconnect + P1 bei ungünstiger Reihenfolge theoretisch mehrfach — sollte idempotent sein.
5. **PubSub vs. ESP-IDF:** Unterschiedliche Reconnect-/Disconnect-Pfade (kein `NOTIFY` im PubSub-`handleDisconnection` — Safe-State dort **inline**).

---

## Empfehlungen (priorisiert, Aufwand grob)

1. **P1 konfigurierbar** (NVS/Config-Push): Mittel — erhöht Testbarkeit und Anpassung an Pumpen (hoch).
2. **Server-seitiges Will** auf dediziertem Topic (kleine Payload, QoS1): Mittel — verkürzt ESP-Erkennung **nur** wenn Broker läuft und Prozess stirbt (benötigt gesunden Will-Publish beim Shutdown).
3. **Heartbeat-ACK bei Validation-Fehler** (expliziter Fehler-ACK statt Stille): Niedrig–Mittel — vermeidet falsche P1-Triggers.
4. **Trennung Dokumentation ESP-IDF vs. PubSub** in Betriebshandbuch: Niedrig.

---

## Bewertungsfragen (Antworten)

| Frage | Antwort |
|-------|---------|
| Aktor >120 s unkontrolliert? | **Möglich**, wenn Serverlogik ausfällt aber ACK-Pfad noch „grün“ sendet, oder letzter Zustand gefährlich und weder P1 noch P4 greifen rechtzeitig. Mit **0** Rules feuert P1 Safe-State nach **120 s** bei fehlendem ACK. |
| Doppelte Abschaltungen? | Safe-State kann von Notify + P1/Disconnect mehrfach angestoßen werden — **absichtlich defense-in-depth**; keine zweite semantische „P4-Abschaltung“ nach erfolgreicher P1-Safe-State nötig. |
| P4 nie OFFLINE_ACTIVE obwohl Server weg? | Wenn **MQTT getrennt** und Reconnect schlägt fehl: State bleibt in Grace/Offline-Kette. Wenn **MQTT ok** und **ACKs** kommen (falsch-positiv): P4 kann **OFFLINE_ACTIVE** verzögern oder verhindern. |
| Reconnect sicher? | `onReconnect` + ACK synchronisiert P4 zurück; **instabiler Server** kann erneut ausfallen — dann wieder 120 s P1. |
| Server-LWT? | **Nein** — könnte theoretisch Erkennung verkürzen, ist aber mit Betrieb/Prozess-Lebenszyklus zu designen. |

---

*Ende des Berichts.*
