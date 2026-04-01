# Auftrag: FIX — P5 Server-LWT + ACK-Haertung

**Typ:** Bugfix (Server + Firmware)
**Datum:** 2026-03-31
**Prioritaet:** HIGH — Sicherheitsrelevant
**Geschaetzter Aufwand:** ~4-6h
**Abhaengigkeit:** FIX-P4-safety-offline-3bugs (Bug-1+3 committed)
**Reihenfolge:** Fix-1 → Fix-2 → Fix-3 → Fix-4 (einzeln committen)
**Agenten:** `server-dev` (Fix-1, Fix-2, Fix-3), `esp32-dev` (Fix-4)

---

## Ueberblick — 4 verifizierte Probleme

Die Timing-Analyse der Server-Offline-Erkennung hat vier konkrete Probleme identifiziert. Alle betreffen das Zusammenspiel zwischen dem ESP32-Heartbeat und dem Server-ACK — das Protokoll mit dem der ESP erkennt ob der Server noch lebt.

**So funktioniert das System aktuell:**

Der ESP sendet alle 60 Sekunden einen Heartbeat an den Server via MQTT (`HEARTBEAT_INTERVAL_MS = 60000` in `mqtt_client.h`). Der Server empfaengt den Heartbeat im `HeartbeatHandler`, verarbeitet ihn (DB-Updates, Metriken, WebSocket-Broadcast) und sendet am Ende einen ACK zurueck. Der ESP prueft auf dem Safety-Task (Core 1, alle ~10ms): Wenn seit mehr als 120 Sekunden kein ACK kam (`SERVER_ACK_TIMEOUT_MS = 120000` in `main.cpp`), gilt der Server als offline → P1 feuert → P4-Offline-Mode wird gestartet.

**Das Heartbeat-Intervall (60s) und der P1-Timeout (120s) bleiben unveraendert.** Die Heartbeats sollen NICHT haeufiger gesendet werden. Stattdessen wird die Zuverlaessigkeit der bestehenden Kommunikation verbessert und ein ereignisbasierter Erkennungskanal hinzugefuegt.

---

## Fix-1: Server-LWT einrichten (Server-Crash ~60s schneller erkennen)

### Problem

Der Python-MQTT-Client (paho-mqtt) verbindet sich zum Mosquitto-Broker OHNE Last Will and Testament (LWT). Wenn der FastAPI-Server-Prozess abstuerzt (aber der Broker weiterlaeuft), merkt der ESP das ERST nach 120 Sekunden ueber den P1-ACK-Timeout. In dieser Zeit laufen Aktoren unkontrolliert.

Das ist das kritischste Szenario: Server-Crash bei laufendem Broker. MQTT Keep-Alive bleibt gruen (der Broker lebt ja), aber der Server verarbeitet keine Heartbeats mehr und sendet keine ACKs.

### Loesung

Ein MQTT Last Will and Testament (LWT) wird beim Server-Connect konfiguriert. Der Broker publiziert das LWT automatisch wenn der Server-Client unerwartet disconnected (Crash, Kill -9, Netzwerkverlust). Der ESP subscribed auf dieses Topic und reagiert sofort — OHNE neuen Heartbeat, OHNE Polling. Das LWT ist rein ereignisbasiert und erzeugt keine zusaetzliche Netzwerklast.

**Wie MQTT LWT funktioniert:** Beim `connect()` uebergibt der Client dem Broker eine "letzte Nachricht" (Topic + Payload + QoS + Retain-Flag). Der Broker speichert diese. Wenn der Client die TCP-Verbindung verliert OHNE sich ordentlich mit `disconnect()` abzumelden, publiziert der Broker diese Nachricht automatisch. Der Broker erkennt den Verbindungsverlust ueber sein eigenes Keep-Alive (typisch 1.5x des `keepalive`-Werts, bei 60s also ~90s).

**Timing-Verbesserung:** Server-Crash → Broker erkennt nach ~90s (1.5x keepalive=60) → publiziert LWT → ESP reagiert sofort. Vorher: 120s P1-Timeout. Nachher: ~90s Server-LWT. Und: Beim kontrollierten Server-Shutdown sendet der Server die Offline-Nachricht explizit (innerhalb von Sekunden).

### Fix-1a: Server — LWT beim Connect setzen

**Datei:** `god_kaiser_server/src/mqtt/client.py`, Methode `connect()` (ca. Zeile 235). Die Datei `mqtt_service.py` existiert nicht — nur `client.py`.

**Schritt 1 — Topic definieren:** Das Server-Status-Topic muss ueber den TopicBuilder laufen (keine hardcoded Topics im Projekt). In der Datei `god_kaiser_server/src/core/constants.py` gibt es bereits MQTT-Topic-Templates. Dort ein neues Template hinzufuegen:

```python
# constants.py — neues Topic-Template
MQTT_TOPIC_SERVER_STATUS = "kaiser/{kaiser_id}/server/status"
```

In `god_kaiser_server/src/mqtt/topics.py` eine Build-Methode hinzufuegen, analog zu den bestehenden Methoden wie `build_lwt_topic()`. Das korrekte Pattern (wie bei allen anderen Build-Methoden in topics.py) verwendet `constants.get_topic_with_kaiser_id()` — **kein** direktes `get_kaiser_id()` + f-string:

```python
@staticmethod
def build_server_status_topic() -> str:
    """Topic fuer Server-Online/Offline-Status (LWT)."""
    return constants.get_topic_with_kaiser_id(constants.MQTT_TOPIC_SERVER_STATUS)
```

**Hinweis:** Es existiert bereits ein `MQTT_TOPIC_KAISER_STATUS` in `constants.py` (Zeile ~66) — das ist ein ANDERES Topic (Kaiser-Status, nicht Server-Status). Kein Namenskonflikt, aber beim Lesen darauf achten.

**Schritt 2 — LWT beim Connect setzen:** VOR dem `client.connect()` Aufruf muss `will_set()` konfiguriert werden. Das ist ein paho-mqtt Requirement: `will_set()` muss VOR `connect()` stehen. In `client.py` ist die konkrete Stelle direkt VOR `self.client.connect(broker, port, keepalive)` (ca. Zeile 275).

```python
import json, time
from .topics import TopicBuilder

server_status_topic = TopicBuilder.build_server_status_topic()

# LWT: Broker sendet diese Nachricht wenn der Server unerwartet disconnected
client.will_set(
    topic=server_status_topic,
    payload=json.dumps({
        "status": "offline",
        "timestamp": int(time.time()),
        "reason": "unexpected_disconnect"
    }),
    qos=1,
    retain=True
)

# Danach normal connecten
client.connect(broker_host, broker_port, keepalive=60)
```

**Warum QoS 1:** Das LWT MUSS zugestellt werden. Es ist eine sicherheitsrelevante Nachricht. QoS 0 koennte verloren gehen.

**Warum Retain:** Damit ein ESP der NACH dem Server-Crash (re)connected sofort die letzte Status-Nachricht bekommt, nicht erst beim naechsten Event.

**Schritt 3 — Online-Status bei Connect publizieren:** Im `on_connect`-Callback, NACH erfolgreichem Connect:

```python
def on_connect(client, userdata, flags, rc):
    if rc == 0:
        server_status_topic = TopicBuilder.build_server_status_topic()
        client.publish(
            server_status_topic,
            json.dumps({
                "status": "online",
                "timestamp": int(time.time())
            }),
            qos=1,
            retain=True  # Ueberschreibt das retained "offline" vom LWT
        )
```

### Fix-1b: Server — Graceful Shutdown

Bei einem kontrollierten Server-Shutdown (Docker Stop, SIGTERM) ruft paho-mqtt `disconnect()` auf. Laut MQTT-Spezifikation wird das LWT bei einem sauberen Disconnect NICHT gesendet. Das ist korrekt — aber der ESP muss trotzdem erfahren dass der Server jetzt offline geht.

**Loesung:** VOR dem Disconnect explizit "offline" publizieren.

FastAPI nutzt den `lifespan` Context Manager fuer Startup/Shutdown. Der Shutdown-Code gehoert in den Teil NACH dem `yield` in der `lifespan()`-Funktion. Die Datei ist `god_kaiser_server/src/main.py`, die `lifespan()` Funktion (ca. Zeile 88).

**NICHT** `@app.on_event("shutdown")` verwenden — das ist deprecated in FastAPI.
**NICHT** einen separaten Signal-Handler registrieren — `lifespan` reicht.

```python
# In der lifespan() Funktion, NACH dem yield (= Shutdown-Phase):
server_status_topic = TopicBuilder.build_server_status_topic()
mqtt_client.publish(
    server_status_topic,
    json.dumps({
        "status": "offline",
        "timestamp": int(time.time()),
        "reason": "graceful_shutdown"
    }),
    qos=1,
    retain=True
)
# Dann mqtt_client.disconnect()
```

### Fix-1c: Firmware — Server-Status-Topic subscriben und auswerten

**Datei: `src/utils/topic_builder.h` und `src/utils/topic_builder.cpp`**

Neue Methode hinzufuegen, analog zu den bestehenden build-Methoden:

```cpp
// topic_builder.h — neue Deklaration
static const char* buildServerStatusTopic();

// topic_builder.cpp — Implementierung
const char* TopicBuilder::buildServerStatusTopic() {
    // Pattern: kaiser/{kaiser_id}/server/status
    // Analog zu buildSystemHeartbeatAckTopic(), aber mit "server/status" statt "esp/{esp_id}/..."
    static char buffer[128];
    snprintf(buffer, sizeof(buffer), "kaiser/%s/server/status", kaiser_id_);
    return buffer;
}
```

**Datei: `src/main.cpp`** — In `subscribeToAllTopics()`:

```cpp
// Neue Subscription (Nr. 12) — Server-Status (LWT)
mqttClient.subscribe(TopicBuilder::buildServerStatusTopic(), 1);  // QoS 1
```

**Wichtig:** Der Log-Zaehler am Ende von `subscribeToAllTopics()` sagt aktuell "All 11 MQTT topics subscribed" — auf 12 aktualisieren.

**Datei: `src/main.cpp`** — In `routeIncomingMessage()`, neuer Handler:

```cpp
// Server-Status (LWT) — SAFETY-P5
if (topic.indexOf("/server/status") >= 0) {
    const char* status = doc["status"] | "unknown";

    if (strcmp(status, "offline") == 0) {
        const char* reason = doc["reason"] | "unknown";
        LOG_W(TAG, "[SAFETY-P5] Server OFFLINE (reason: %s)", reason);

        // Gleiche Rule-Count-Logik wie bei P1 und MQTT-Disconnect (Bug-1/3 Pattern):
        // - Mit Offline-Rules → P4 uebernimmt (kein sofortiges Abschalten)
        // - Ohne Offline-Rules → sofort safe state
        if (offlineModeManager.getOfflineRuleCount() > 0) {
            LOG_W(TAG, "[SAFETY-P5] %d offline rules — delegating to P4",
                  offlineModeManager.getOfflineRuleCount());
        } else {
            actuatorManager.setAllActuatorsToSafeState();
            LOG_W(TAG, "[SAFETY-P5] No offline rules — safe state immediately");
        }
        offlineModeManager.onDisconnect();

    } else if (strcmp(status, "online") == 0) {
        LOG_I(TAG, "[SAFETY-P5] Server ONLINE");

        // P1-Timer zuruecksetzen — verhindert dass P1 nach Server-Neustart
        // faelschlich feuert bevor der erste Heartbeat-ACK kommt
        g_last_server_ack_ms.store(millis());

        // g_server_timeout_triggered MUSS auch zurueckgesetzt werden.
        // Ohne diesen Reset: Wenn P1 bereits gefeuert hat und dann server/status="online"
        // ankommt, bleibt g_server_timeout_triggered=true haengen.
        // Das gleiche Pattern wie im heartbeat_ack Handler (main.cpp, ca. Zeile 1221-1224).
        if (g_server_timeout_triggered.load()) {
            g_server_timeout_triggered.store(false);
            LOG_I(TAG, "[SAFETY-P5] P1 timeout cleared via server online status");
        }

        // P4-Recovery falls gerade in DISCONNECTED/RECONNECTING
        offlineModeManager.onServerAckReceived();
    }
    return;
}
```

### Akzeptanzkriterien Fix-1

- [ ] Server publiziert `kaiser/{k}/server/status = {"status":"online"}` (retained, QoS 1) bei jedem Connect
- [ ] Server-LWT konfiguriert: `kaiser/{k}/server/status = {"status":"offline","reason":"unexpected_disconnect"}` (retained, QoS 1)
- [ ] Graceful Shutdown: `{"status":"offline","reason":"graceful_shutdown"}` gesendet VOR disconnect (in lifespan nach yield)
- [ ] Topic ueber TopicBuilder (Server: `build_server_status_topic()`, Firmware: `buildServerStatusTopic()`)
- [ ] ESP subscribed auf Server-Status-Topic (QoS 1, Subscription Nr. 12)
- [ ] ESP reagiert auf "offline": P4 mit Rule-Count-Guard
- [ ] ESP reagiert auf "online": P1-Timer + `g_server_timeout_triggered` Reset + P4-Recovery
- [ ] Emergency-Stop bleibt komplett unveraendert
- [ ] Verifizierung: `mosquitto_sub -t 'kaiser/+/server/status' -v` zeigt retained Status nach Server-Start

### Build-Verifikation Fix-1

```bash
# Firmware
cd "El Trabajante"
pio run -e esp32_dev
pio run -e seeed_xiao_esp32c3

# Server
cd "El Servador/god_kaiser_server"
# Manuell: Server starten, Status auf Broker pruefen, Server stoppen, LWT pruefen
```

---

## Fix-2: Heartbeat-ACK auf QoS 1 hochstufen

### Problem

Der Server sendet den Heartbeat-ACK aktuell mit QoS 0 (fire-and-forget). QoS 0 bietet keine Zustellgarantie — bei kurzem Netzwerk-Jitter oder Broker-Lastspitze kann die Nachricht verloren gehen.

Bei einem Heartbeat-Intervall von 60 Sekunden und einem P1-Timeout von 120 Sekunden sind nur ~2 ACK-Zyklen Puffer. Wenn EIN ACK verloren geht und der naechste sich um wenige Sekunden verzoegert, kann P1 bei einem FUNKTIONIERENDEN Server feuern (False Positive). Der ESP schaltet dann Aktoren ab obwohl nichts kaputt ist.

### Loesung

**Datei:** `god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py`, Methode `_send_heartbeat_ack()`

Der QoS-Level im `publish()`-Aufruf von 0 auf 1 aendern:

IST:
```python
await self.mqtt_client.publish(ack_topic, json.dumps(ack_payload), qos=0)
```

SOLL:
```python
await self.mqtt_client.publish(ack_topic, json.dumps(ack_payload), qos=1)
```

**Warum das sicher ist:** QoS 1 garantiert mindestens eine Zustellung. Bei 60s Intervall ist ein ACK pro Minute — die zusaetzliche Last durch den QoS-1-Handshake (ein PUBACK-Paket, 4 Bytes) ist vernachlaessigbar. QoS 1 kann zu Duplikaten fuehren (ACK wird zweimal zugestellt) — das ist unkritisch, der ESP setzt `g_last_server_ack_ms = millis()` einfach zweimal auf denselben Wert.

### Akzeptanzkriterien Fix-2

- [ ] `_send_heartbeat_ack()` nutzt `qos=1`
- [ ] Kein funktionaler Unterschied im Normalbetrieb
- [ ] ESP-Serial zeigt weiterhin ACK-Empfang nach Heartbeat

---

## Fix-3: ACK frueh senden — VOR DB-Arbeit

### Problem

Der Heartbeat-Handler verarbeitet den Heartbeat in dieser Reihenfolge:
1. Payload parsen und validieren
2. DB-Updates (Device-Status, Metadata, Heartbeat-History)
3. Metriken aktualisieren
4. WebSocket-Broadcast
5. ACK senden ← **erst am Ende**

Wenn die DB langsam ist (Vacuum, Disk-IO-Spitze, Lock-Contention), verzoegert sich der ACK. Das traegt zum P1-False-Positive-Risiko bei — der Server lebt, aber der ACK kommt zu spaet.

### Loesung

**Datei:** `god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py`, Methode `handle_heartbeat()`

Den ACK-Publish nach vorne ziehen — direkt NACH erfolgreicher Payload-Validierung, BEVOR die DB-Arbeit beginnt. Der ACK signalisiert dem ESP "Server lebt und hat deinen Heartbeat empfangen". Ob die DB-Updates danach erfolgreich sind, ist fuer den ESP irrelevant.

SOLL-Reihenfolge:
1. Payload parsen und validieren
2. **ACK senden** ← sofort nach Validierung
3. DB-Updates
4. Metriken
5. WebSocket-Broadcast

**Analyse-Schritt VOR Implementierung:** Der ACK-Payload enthaelt moeglicherweise Felder die erst NACH DB-Arbeit verfuegbar sind (z.B. `config_available` — ob neue Config bereitsteht). Pruefe was `_send_heartbeat_ack()` als Payload sendet:
- Wenn der Payload nur `status`, `server_time` und statische Infos enthaelt → ACK kann sofort gesendet werden
- Wenn der Payload `config_available` oder aehnliches enthaelt das vom DB-Zustand abhaengt → den fruehen ACK mit `config_available: false` senden ODER dieses Feld weglassen (der Config-Push-Mechanismus funktioniert unabhaengig vom ACK)

### Akzeptanzkriterien Fix-3

- [ ] ACK wird gesendet BEVOR DB-Updates starten (nach erfolgreicher Payload-Validierung)
- [ ] Der ACK-Payload ist entweder unveraendert ODER fehlende DB-abhaengige Felder sind dokumentiert
- [ ] Kein funktionaler Unterschied fuer den ESP
- [ ] Server-Log-Reihenfolge: ACK-Send → DB-Updates (nicht umgekehrt)

---

## Fix-4: Fehler-ACK bei Validation-Fehlern

### Problem

Der Heartbeat-Handler hat mehrere Code-Pfade die OHNE ACK zurueckkehren:
- Topic-Parse-Fehler
- Payload-Validation-Fehler (fehlende Felder, falsches Format)
- Discovery-Rate-Limiting (neues Geraet, Rate-Limit greift)
- Unerwartete Exception im try-Block

In allen diesen Faellen bekommt der ESP KEINEN ACK. Er interpretiert das korrekt als "Server antwortet nicht" — aber der Grund ist nicht "Server down" sondern "Heartbeat hatte ein Problem". Nach 120s feuert P1 trotzdem → False Positive.

### Loesung

**Datei:** `god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py`

**Schritt 1 — Neue Methode `_send_heartbeat_error_ack()`:**

```python
async def _send_heartbeat_error_ack(self, esp_id: str, error: str):
    """ACK trotz Fehler senden — verhindert P1-False-Positive.

    Der ESP braucht nur die Bestaetigung dass der Server lebt.
    Ob der Heartbeat korrekt verarbeitet wurde ist fuer P1 irrelevant.
    """
    ack_topic = TopicBuilder.build_heartbeat_ack_topic(esp_id)
    ack_payload = {
        "status": "error",
        "error": error,
        "server_time": int(time.time())
    }
    try:
        await self.mqtt_client.publish(
            ack_topic, json.dumps(ack_payload), qos=1
        )
        logger.warning(
            f"Sent error ACK for {esp_id}: {error}"
        )
    except Exception as e:
        logger.error(f"Failed to send error ACK for {esp_id}: {e}")
```

**Schritt 2 — An allen return-Pfaden OHNE ACK aufrufen:**

Gehe `handle_heartbeat()` Zeile fuer Zeile durch. Bei jedem `return`-Statement das NICHT vorher `_send_heartbeat_ack()` aufruft, stattdessen `_send_heartbeat_error_ack()` aufrufen:

| Pfad | Fehler | Error-ACK moeglich? |
|------|--------|---------------------|
| Topic-Parse-Fehler | Topic-Format kaputt | NUR wenn `esp_id` aus dem Topic extrahierbar ist. Wenn nicht → kein ACK (akzeptabel, extrem selten) |
| Payload-Validation-Fehler | Fehlende/falsche Felder | Ja — `esp_id` ist aus Payload oder Topic bekannt |
| Discovery-Rate-Limiting | Neues Geraet, Cooldown | Ja — `esp_id` bekannt |
| Exception im try-Block | Unerwarteter Fehler | Ja — `esp_id` im except-Scope verfuegbar |

**Schritt 3 — Firmware: `"error"`-Status im ACK-Handler akzeptieren:**

**Datei: `src/main.cpp`** — Im bestehenden heartbeat_ack Handler in `routeIncomingMessage()`:

Der ESP setzt aktuell `g_last_server_ack_ms` nur bei bestimmten Status-Werten. Der P1-Timer muss bei JEDEM ACK zurueckgesetzt werden — auch bei `"error"`. Der Server lebt ja, auch wenn er den Heartbeat nicht korrekt verarbeiten konnte.

```cpp
// Im heartbeat_ack Handler:
// P1-Timer IMMER zuruecksetzen, unabhaengig vom Status-Feld
g_last_server_ack_ms.store(millis());

const char* status = doc["status"] | "unknown";
if (strcmp(status, "error") == 0) {
    LOG_W(TAG, "[HEARTBEAT] Server ACK with error: %s",
          doc["error"] | "unknown");
    // Server lebt → kein P1-Trigger. Problem wird nur geloggt.
}
// Restliche Status-Behandlung (online, pending_approval, rejected) bleibt unveraendert
```

**Pruefe:** Der bestehende ACK-Handler setzt `g_last_server_ack_ms` moeglicherweise erst NACH einer Status-Pruefung (z.B. nur bei `"online"`). Wenn ja → nach vorne ziehen, BEVOR der Status ausgewertet wird.

### Akzeptanzkriterien Fix-4

- [ ] `_send_heartbeat_error_ack()` existiert im Heartbeat-Handler
- [ ] Alle `return`-Pfade ohne vorheriges `_send_heartbeat_ack()` rufen stattdessen `_send_heartbeat_error_ack()` auf (ausser wenn `esp_id` nicht bestimmbar)
- [ ] ESP akzeptiert `"error"` im ACK-Status und setzt trotzdem P1-Timer zurueck
- [ ] Error-ACK nutzt QoS 1
- [ ] Kein neuer periodischer Traffic — Error-ACKs kommen NUR bei echten Problemen

### Build-Verifikation Fix-4

```bash
# Firmware
cd "El Trabajante"
pio run -e esp32_dev
pio run -e seeed_xiao_esp32c3
```

---

## Aenderungstabelle

| Datei | Fix | Aenderung |
|-------|-----|-----------|
| `god_kaiser_server/src/core/constants.py` | Fix-1a | `MQTT_TOPIC_SERVER_STATUS` Template |
| `god_kaiser_server/src/mqtt/topics.py` | Fix-1a | `build_server_status_topic()` |
| Server MQTT-Connect (vermutl. `client.py`) | Fix-1a | `will_set()` VOR `connect()`, "online" publish in `on_connect` |
| `god_kaiser_server/src/main.py` (lifespan) | Fix-1b | "offline" publish im Shutdown-Teil (nach yield) |
| `src/utils/topic_builder.h/.cpp` | Fix-1c | `buildServerStatusTopic()` |
| `src/main.cpp` (subscribeToAllTopics) | Fix-1c | Subscribe Nr. 12 + Zaehler-Update |
| `src/main.cpp` (routeIncomingMessage) | Fix-1c | Handler fuer `/server/status` |
| `heartbeat_handler.py` (`_send_heartbeat_ack`) | Fix-2 | `qos=0` → `qos=1` |
| `heartbeat_handler.py` (`handle_heartbeat`) | Fix-3 | ACK nach vorne ziehen (vor DB-Arbeit) |
| `heartbeat_handler.py` (neu) | Fix-4 | `_send_heartbeat_error_ack()` Methode |
| `heartbeat_handler.py` (return-Pfade) | Fix-4 | Error-ACK an allen Pfaden ohne regulaeren ACK |
| `src/main.cpp` (heartbeat_ack Handler) | Fix-4 | `g_last_server_ack_ms` immer setzen, `"error"` akzeptieren |

---

## Reihenfolge und Verifikation

| Schritt | Fix | Agent | Build/Test |
|---------|-----|-------|-----------|
| 1 | Fix-1 (Server-LWT) | `server-dev` + `esp32-dev` | Server-Start + `mosquitto_sub` + ESP-Serial |
| 2 | Fix-2 (ACK QoS) | `server-dev` | ESP-Serial: ACK weiterhin empfangen |
| 3 | Fix-3 (ACK frueh) | `server-dev` | ESP-Serial: ACK kommt schneller nach Heartbeat |
| 4 | Fix-4 (Error-ACK) | `server-dev` + `esp32-dev` | Absichtlich fehlerhaften Heartbeat senden, Error-ACK pruefen |

---

## Was NICHT geaendert wird

- **Heartbeat-Intervall bleibt 60s** — kein haeufigeres Senden
- **P1-Timeout bleibt 120s** — Server-LWT macht ihn zum Fallback statt zur Primaererkennung
- **P4 Grace Period bleibt 30s**
- **ESP-LWT bleibt unveraendert** (Topic: `.../system/will`)
- **Heartbeat-Payload-Format** — abwaertskompatibel, keine neuen Felder
- **Emergency-Stop-Pfad** — komplett unveraendert
- **Keine neuen periodischen Messages** — Server-LWT ist ereignisbasiert (Broker-mechanismus), Error-ACKs kommen nur bei Fehlern

---

## Timing nach allen Fixes

| Szenario | VORHER | NACHHER |
|----------|--------|---------|
| Server-Crash (Broker ok) | 120s (P1) | ~90s (Server-LWT, Broker erkennt toten Client nach ~1.5x keepalive=60) |
| Server graceful Shutdown | 120s (P1) | Sekunden (explizites "offline" vor disconnect) |
| Server-Hang (kein ACK) | 120s (P1) | 120s (P1 — Server sendet kein LWT bei Hang, unveraendert) |
| DB-Lag (langsamer ACK) | False Positive moeglich (P1) | Kein False Positive (ACK kommt frueh + QoS 1) |
| Heartbeat-Validation-Fehler | False Positive moeglich (P1) | Kein False Positive (Error-ACK) |
| Broker-Crash | Sofort (MQTT-Disconnect) | Sofort (unveraendert) |

### Watchdog-Hierarchie nach Fix

```
Ebene 1: MQTT Keep-Alive (60s)      → Broker-Liveness              [bestehend]
Ebene 2: Server-LWT (retained)      → Server-Crash-Erkennung       [NEU — Fix-1, ereignisbasiert]
Ebene 3: Heartbeat + ACK (60s/QoS1) → Server-Responsivitaet        [GEHAERTET — Fix-2/3/4]
Ebene 4: P1 ACK-Timeout (120s)      → Fallback bei Hang            [bestehend, jetzt Fallback]
Ebene 5: P4 State Machine (30s)     → Koordinierter Offline-Mode   [bestehend]
```
