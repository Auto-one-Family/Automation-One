# Auftrag: ANALYSE + FIX — P5 Server-LWT, ACK-Haertung und P1-False-Positive-Schutz

**Ziel-Repo:** auto-one (Server + Firmware)
**Typ:** Analyse (Block A-C) + Fix (Block D-F)
**Prioritaet:** HIGH — Sicherheitsrelevant, direkte Folge der P4-Timing-Analyse
**Datum:** 2026-03-31
**Geschaetzter Aufwand:** ~6-8h (Analyse ~2h, Fixes ~4-6h)
**Abhaengigkeit:** FIX-P4-safety-offline-3bugs (Bug-1+3 COMMITTED, Bug-2 in working tree)
**Reihenfolge:** Block A-C (Analyse) → Block D → Block E → Block F (Fixes einzeln committen)

---

## Hintergrund

Die Timing-Analyse der Server-Offline-Erkennung (2026-03-31) hat drei strukturelle Schwaechen identifiziert, die das P1/P4-Safety-System in bestimmten Szenarien unzuverlaessig machen:

### Problem 1: Server hat kein eigenes LWT

Der Python-MQTT-Client (`paho-mqtt`) verbindet sich zum Mosquitto-Broker OHNE Last Will and Testament. Das bedeutet: Wenn der FastAPI-Server-Prozess crashed (aber der Broker weiterlaeuft), erfaehrt der ESP das ERST nach 120s via P1-ACK-Timeout. In dieser Zeit laufen Aktoren (Pumpen, Ventile) unkontrolliert.

Mit einem Server-LWT wuerde der Broker den ESP innerhalb von ~60-90s informieren (MQTT Keep-Alive des Server-Clients erkennt den toten Prozess → LWT wird publiziert → ESP reagiert sofort).

**Erkennungszeit-Verbesserung:** 120s → ~60-90s (Halbierung)

### Problem 2: Heartbeat-ACK ist QoS 0 und kommt NACH DB-Arbeit

Der Server sendet den Heartbeat-ACK mit QoS 0 (fire-and-forget, keine Zustellgarantie) und erst NACH der kompletten Heartbeat-Verarbeitung (DB-Updates, Metriken, WebSocket-Broadcasts). Das erzeugt zwei Risiken:

1. **Verlorene ACKs:** QoS 0 garantiert keine Zustellung. Bei kurzem Netzwerk-Flapping oder Broker-Lastspitze kann ein ACK verloren gehen.
2. **Verzoegerte ACKs:** Wenn die DB langsam ist (z.B. Vacuum laeuft, Disk-IO-Spitze), kommt der ACK spaeter. Bei 60s Heartbeat-Intervall und 120s Timeout reichen schon 2 verzoegerte+verlorene ACKs fuer einen P1-Trigger.

**Folge:** P1 kann bei FUNKTIONIERENDEM Server feuern (False Positive). Der ESP schaltet Aktoren ab obwohl der Server eigentlich lebt.

### Problem 3: Heartbeat-Handler sendet nicht immer ACK

Die Analyse zeigt: Bei Validation-Fehlern, Topic-Parse-Fehlern oder Discovery-Rate-Limiting sendet der Heartbeat-Handler KEINEN ACK. Der ESP interpretiert das korrekt als "Server antwortet nicht" — aber der Grund ist nicht "Server down" sondern "Server verarbeitet Heartbeat nicht korrekt".

**Folge:** Ein Bug im Heartbeat-Handler oder ein unbekanntes ESP-Discovery-Szenario kann P1 triggern.

---

## Block A: Analyse — Server-MQTT-Verbindung (IST-Zustand)

### A1: Server-MQTT-Connect untersuchen

**Suche die Stelle wo der Python-MQTT-Client sich zum Broker verbindet.**

Zu dokumentieren:
- **Connect-Funktion:** Welche Datei, welche Funktion? Vermutlich in `client.py` oder `mqtt_service.py`.
- **paho-mqtt Version:** Welche Version wird verwendet? (`requirements.txt` oder `pyproject.toml`)
- **Connect-Parameter:** Wird `will_set()` VOR `connect()` aufgerufen? (Muss VOR connect kommen, paho-mqtt Requirement)
- **Clean Session:** Wird `clean_session=True` oder `False` gesetzt?
- **Keepalive:** Welcher Wert? (Vermutlich 60s aus `config.py`)
- **Reconnect-Verhalten:** Was passiert wenn der Broker kurz weg ist? Automatischer Reconnect? Backoff?
- **LWT aktuell:** Wird `will_set()` irgendwo aufgerufen? Wenn ja, mit welchem Topic/Payload?

**Erwartete Dateien:** `god_kaiser_server/src/mqtt/client.py`, `god_kaiser_server/src/config.py`

### A2: Heartbeat-ACK-Pfade vollstaendig dokumentieren

**Dokumentiere ALLE Pfade durch `handle_heartbeat()` und markiere welche einen ACK senden und welche nicht.**

Fuer JEDEN `return`-Pfad in `handle_heartbeat()`:
- Wird `_send_heartbeat_ack()` aufgerufen? Ja/Nein
- Welcher Status wird im ACK gesendet? (`online`, `pending_approval`, `rejected`, etc.)
- Welcher Fehler fuehrt zu diesem Pfad? (Parse-Fehler, Validation, Discovery, Rate-Limit)

**Ziel:** Eine vollstaendige Tabelle aller Exit-Pfade mit ACK/kein-ACK Markierung.

**Erwartete Dateien:** `god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py`

### A3: QoS-Level des ACK-Publishes

**Dokumentiere den QoS-Level von `_send_heartbeat_ack()`:**

- Welcher QoS-Level wird beim `mqtt_client.publish()` fuer den ACK verwendet?
- Welcher QoS-Level hat der ESP beim Subscribe auf das ACK-Topic? (`subscribeToAllTopics()`)
- Stimmen beide ueberein? (Effektiver QoS = min(Publish-QoS, Subscribe-QoS))

---

## Block B: Analyse — P1-Timeout-Berechnung

### B1: Worst-Case-Szenario durchrechnen

**Rechne den schlimmsten Fall fuer einen P1-False-Positive durch:**

```
t=0     Letzter gültiger ACK empfangen
t=60s   Heartbeat gesendet → ACK verloren (QoS 0, Netzwerk-Jitter)
t=120s  Heartbeat gesendet → ACK verzögert (DB unter Last, 5s Verarbeitungszeit)
        P1-Check: millis() - last_ack_ms = 120000 → TRIGGER!
        Aber: ACK ist unterwegs (kommt 5s später)
```

**Fragen:**
- Wie oft sendet der ESP Heartbeats? (verifiziert: 60s = `HEARTBEAT_INTERVAL_MS`)
- Wie oft prueft P1 den Timeout? (vermutlich: jede Safety-Task-Iteration, ~10ms)
- Gibt es ein Hysterese/Debounce bei P1? Oder feuert er sofort beim ersten Timeout?
- Gibt es einen Zaehler ("N verpasste ACKs statt 1 Timeout")? Wenn nein: Schon ein verlorener ACK bringt P1 naeher an den Trigger.

### B2: Recovery nach P1-Trigger

**Was passiert wenn P1 faelschlich gefeuert hat und danach ein ACK kommt?**

- Wird `g_server_timeout_triggered` zurueckgesetzt?
- Wird P4 sofort abgebrochen oder laeuft die Grace Period weiter?
- Was passiert mit dem Aktor-Zustand? Wird er wiederhergestellt?

---

## Block C: Analyse — ESP LWT-Topic verifizieren

### C1: ESP-LWT vs. Server-LWT Topics

**Dokumentiere das bestehende ESP-LWT und pruefe auf Topic-Kollisionen:**

- ESP-LWT-Topic: `kaiser/{k}/esp/{e}/system/will` (aus Analyse bekannt)
- Geplantes Server-LWT-Topic: Muss ein ANDERES Topic sein. Vorschlag: `kaiser/{k}/server/status`
- Pruefe: Gibt es bereits Topics mit `server` im Pfad? Oder im TopicBuilder?

---

## Block D: Fix — Server-LWT einrichten (Prioritaet 1)

### D1: Server-LWT beim MQTT-Connect konfigurieren

**Datei: Server-MQTT-Connect (vermutlich `client.py` oder `mqtt_service.py`)**

**VOR** dem `connect()`-Aufruf muss `will_set()` aufgerufen werden:

```python
# [KORREKTUR verify-plan] kaiser_id via get_kaiser_id() aus src/core/constants.py holen.
# TopicBuilder-Pattern: MQTT_TOPIC_SERVER_STATUS in constants.py definieren +
# TopicBuilder.build_server_status_topic() in topics.py hinzufuegen (api-rules: kein Hardcoding).
# Analoges Muster: build_lwt_topic() in topics.py:164.
# Hinweis: "kaiser/{kaiser_id}/status" (MQTT_TOPIC_KAISER_STATUS) existiert bereits in
# constants.py:66 — neues "server/status" Topic ist kein Konflikt, aber TM beachten.

from ..core.constants import get_kaiser_id
SERVER_STATUS_TOPIC = f"kaiser/{get_kaiser_id()}/server/status"  # TODO: TopicBuilder verwenden

client.will_set(
    topic=SERVER_STATUS_TOPIC,
    payload=json.dumps({
        "status": "offline",
        "timestamp": int(time.time()),
        "reason": "unexpected_disconnect"
    }),
    qos=1,      # QoS 1 — LWT MUSS zugestellt werden
    retain=True  # Retained — ESP bekommt Status auch nach Reconnect
)

client.connect(broker_host, broker_port, keepalive=60)
```

### D2: Server-Online-Status bei erfolgreichem Connect publizieren

**NACH** erfolgreichem Connect (im `on_connect`-Callback):

```python
def on_connect(client, userdata, flags, rc):
    if rc == 0:
        # Server ist online — ueberschreibt ggf. altes retained "offline"
        client.publish(
            SERVER_STATUS_TOPIC,
            json.dumps({
                "status": "online",
                "timestamp": int(time.time()),
                "version": APP_VERSION  # optional
            }),
            qos=1,
            retain=True
        )
```

### D3: Graceful Shutdown — "offline" explizit senden

Beim kontrollierten Server-Shutdown (SIGTERM, Docker Stop) sollte der Server VOR dem Disconnect eine explizite "offline"-Nachricht senden. Das Broker-LWT greift nur bei unkontrolliertem Disconnect (Crash, Kill -9). Bei `client.disconnect()` wird das LWT NICHT gesendet (MQTT-Spezifikation).

```python
def on_shutdown():
    client.publish(
        SERVER_STATUS_TOPIC,
        json.dumps({
            "status": "offline",
            "timestamp": int(time.time()),
            "reason": "graceful_shutdown"
        }),
        qos=1,
        retain=True
    )
    client.disconnect()
```

**Einbindung:** [KORREKTUR verify-plan] FastAPI nutzt `lifespan` Context Manager (NICHT Signal-Handler).
Shutdown-Hook gehört in den shutdown-Teil von `lifespan()` in `src/main.py:88` (nach dem `yield`).
`@app.on_event("shutdown")` ist deprecated. Signal-Handler separat NICHT nötig — lifespan reicht.

### D4: ESP — Server-Status-Topic subscriben und auswerten

**Firmware-Aenderung: ESP subscribed auf Server-Status-Topic**

**Datei: `src/main.cpp`** (in `subscribeToAllTopics()`)

Neues Topic subscriben:
```cpp
// Server-Status-Topic (LWT)
// [KORREKTUR verify-plan] TopicBuilder verwenden (firmware-rules.md: Hardcoded Topics VERBOTEN).
// TopicBuilder::buildServerStatusTopic() muss in topic_builder.cpp/h hinzugefuegt werden.
// Analoges Pattern: TopicBuilder::buildSystemHeartbeatAckTopic() in topic_builder.cpp.
// Ausserdem: Log-Counter "All 11 MQTT topics subscribed" → 12 aktualisieren (main.cpp:201).
mqttClient.subscribe(TopicBuilder::buildServerStatusTopic(), 1);  // QoS 1
```

**Datei: `src/main.cpp`** (in `routeIncomingMessage()`)

Neuer Handler fuer Server-Status:
```cpp
if (topic.endsWith("/server/status")) {
    // JSON parsen: {"status": "online"/"offline", "timestamp": ..., "reason": ...}
    const char* status = doc["status"] | "unknown";

    if (strcmp(status, "offline") == 0) {
        LOG_W(TAG, "[SAFETY-P5] Server reported OFFLINE via LWT (reason: %s)",
              doc["reason"] | "unknown");

        // P4 triggern — gleiche Logik wie P1, aber schneller
        if (offlineModeManager.getOfflineRuleCount() > 0) {
            LOG_W(TAG, "[SAFETY-P5] Delegating to P4 (%d rules)",
                  offlineModeManager.getOfflineRuleCount());
        } else {
            actuatorManager.setAllActuatorsToSafeState();
            LOG_W(TAG, "[SAFETY-P5] No offline rules — safe state immediately");
        }
        offlineModeManager.onDisconnect();  // P4 State Machine starten

    } else if (strcmp(status, "online") == 0) {
        LOG_I(TAG, "[SAFETY-P5] Server reported ONLINE");
        g_last_server_ack_ms.store(millis());  // P1-Timer zuruecksetzen
        // [KORREKTUR verify-plan] g_server_timeout_triggered MUSS auch zurueckgesetzt werden.
        // Analoges Pattern: main.cpp:1221-1224 (heartbeat_ack handler).
        // Ohne Reset: Wenn P1 bereits gefeuert hat und server/status="online" ankommt,
        // bleibt g_server_timeout_triggered=true haengen bis naechster Heartbeat-ACK.
        if (g_server_timeout_triggered.load()) {
            g_server_timeout_triggered.store(false);
            LOG_I(TAG, "[SAFETY-P5] P1 timeout cleared via server online status");
        }
        // Falls P4 gerade in DISCONNECTED/RECONNECTING → Recovery
        offlineModeManager.onServerAckReceived();
    }
}
```

**Wichtig:** Der `"online"`-Pfad setzt `g_last_server_ack_ms` zurueck — das verhindert dass P1 nach Server-Neustart faelschlich feuert bevor der erste Heartbeat-ACK kommt.

### Akzeptanzkriterien Block D

- [ ] Server publiziert `kaiser/{k}/server/status = "online"` (retained, QoS 1) bei Connect
- [ ] Server-LWT: `kaiser/{k}/server/status = "offline"` (retained, QoS 1) bei unerwartetem Disconnect
- [ ] Graceful Shutdown: "offline" explizit gesendet VOR `client.disconnect()`
- [ ] ESP subscribed auf `kaiser/{k}/server/status` (QoS 1) in `subscribeToAllTopics()`
- [ ] ESP reagiert auf "offline" → P4 getriggert (mit Rule-Count-Guard wie Bug-1/3)
- [ ] ESP reagiert auf "online" → P1-Timer Reset + P4-Recovery
- [ ] Emergency-Stop bleibt unveraendert
- [ ] Build: `pio run -e esp32_dev` + `pio run -e seeed_xiao_esp32c3`
- [ ] Server-Start: Server-Status retained auf Broker sichtbar (`mosquitto_sub -t 'kaiser/+/server/status' -v`)

---

## Block E: Fix — Heartbeat-ACK auf QoS 1 (Prioritaet 2)

### E1: ACK-Publish QoS hochstufen

**Datei: `god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py`**, `_send_heartbeat_ack()`

IST (vermutlich):
```python
await self.mqtt_client.publish(ack_topic, json.dumps(ack_payload), qos=0)
```

SOLL:
```python
await self.mqtt_client.publish(ack_topic, json.dumps(ack_payload), qos=1)
```

**Begruendung:** QoS 1 garantiert mindestens eine Zustellung. Bei 60s Heartbeat-Intervall ist ein ACK alle 60s — die zusaetzliche QoS-1-Handshake-Last (ein PUBACK pro ACK) ist vernachlaessigbar. Dafuer eliminiert es eine ganze Klasse von False-Positive-P1-Triggern.

**Moegliche Nebenwirkung:** QoS 1 kann zu Duplikaten fuehren (ACK wird zweimal zugestellt). Das ist unkritisch — der ESP setzt `g_last_server_ack_ms = millis()` einfach zweimal auf denselben Wert.

### E2: ACK-Timing optimieren — ACK VOR DB-Arbeit senden

**Datei: `heartbeat_handler.py`**, `handle_heartbeat()`

Die aktuelle Reihenfolge ist:
1. Payload parsen
2. DB-Updates (Device, Metadata, Heartbeat-History)
3. Metriken aktualisieren
4. WebSocket-Broadcast
5. **ACK senden** ← erst am Ende

Die optimale Reihenfolge waere:
1. Payload parsen
2. **ACK senden** ← sofort nach erfolgreicher Validierung
3. DB-Updates
4. Metriken
5. WebSocket-Broadcast

**Begruendung:** Der ACK signalisiert dem ESP "Server lebt und hat deinen Heartbeat empfangen". Das ist unabhaengig davon ob die DB-Updates erfolgreich sind. Ein frueh gesendeter ACK verhindert P1-False-Positives bei langsamer DB.

**Analyse-Frage:** Pruefe ob der ACK-Payload Informationen enthaelt die erst NACH den DB-Updates verfuegbar sind (z.B. `config_available`). Wenn ja: Entweder den ACK in zwei Phasen teilen (sofortiger "alive"-ACK + spaeterer "config"-Push) oder den fruehen ACK mit `config_available=false` senden.

### Akzeptanzkriterien Block E

- [ ] `_send_heartbeat_ack()` nutzt QoS 1 statt QoS 0
- [ ] ACK wird frueh im Handler gesendet (nach Validation, vor DB-Arbeit)
- [ ] Kein funktionaler Unterschied fuer den ESP (gleicher ACK-Payload oder akzeptabler Unterschied)
- [ ] Server-Tests: `pytest tests/unit/test_heartbeat_handler.py` — [KORREKTUR verify-plan] Datei existiert NICHT. Muss neu erstellt werden oder diesen Check skippen.

---

## Block F: Fix — Fehler-ACK bei Validation-Fehlern (Prioritaet 3)

### F1: Immer einen ACK senden — auch bei Fehlern

**Datei: `heartbeat_handler.py`**, alle `return`-Pfade ohne ACK

Aktuell: Bei Topic-Parse-Fehler, Payload-Fehler oder Discovery-Rate-Limiting wird `return True` (oder `return`) ausgefuehrt OHNE ACK. Der ESP bemerkt nichts — bis P1 nach 120s feuert.

**Loesung:** Einen Error-ACK senden der dem ESP sagt "Ich lebe, aber dein Heartbeat hatte ein Problem":

```python
async def _send_heartbeat_error_ack(self, esp_id: str, error: str):
    """Send ACK even when heartbeat processing fails — prevents P1 false positive."""
    ack_topic = TopicBuilder.build_heartbeat_ack_topic(esp_id)
    ack_payload = {
        "status": "error",
        "error": error,
        "server_time": int(time.time())
    }
    try:
        await self.mqtt_client.publish(ack_topic, json.dumps(ack_payload), qos=1)
    except Exception as e:
        logger.error(f"Failed to send error ACK for {esp_id}: {e}")
```

**Firmware-Anpassung:** Der ESP-ACK-Handler in `main.cpp` (routeIncomingMessage) muss den `"error"`-Status akzeptieren. Er muss `g_last_server_ack_ms` trotzdem aktualisieren — der Server lebt ja, auch wenn er den Heartbeat nicht verarbeiten konnte.

```cpp
// In routeIncomingMessage, heartbeat_ack handler:
const char* status = doc["status"] | "unknown";
g_last_server_ack_ms.store(millis());  // P1-Timer IMMER zuruecksetzen bei jedem ACK

if (strcmp(status, "error") == 0) {
    LOG_W(TAG, "[HEARTBEAT] Server ACK with error: %s", doc["error"] | "unknown");
    // Kein P1-Trigger, Server lebt — aber Problem loggen
}
```

### F2: Stellen identifizieren die einen Error-ACK brauchen

**Aus der Analyse bekannte Pfade OHNE ACK:**

1. Topic-Parse-Fehler → `_send_heartbeat_error_ack(esp_id_from_topic, "topic_parse_error")`
2. Payload-Validation-Fehler → `_send_heartbeat_error_ack(esp_id, "payload_validation_error")`
3. Discovery-Rate-Limiting → `_send_heartbeat_error_ack(esp_id, "discovery_rate_limited")`
4. Exception im try-Block → `_send_heartbeat_error_ack(esp_id, "internal_error")`

**Einschraenkung Pfad 1:** Bei Topic-Parse-Fehler ist `esp_id` moeglicherweise nicht extrahierbar. In diesem Fall kann KEIN gezielter ACK gesendet werden (das Topic ist ja kaputt). Das ist akzeptabel — dieser Fall sollte extrem selten sein.

### Akzeptanzkriterien Block F

- [ ] Neue Methode `_send_heartbeat_error_ack(esp_id, error)` im Heartbeat-Handler
- [ ] Alle return-Pfade ohne ACK senden jetzt einen Error-ACK (ausser wenn esp_id nicht bestimmbar)
- [ ] ESP akzeptiert `status: "error"` im ACK und setzt trotzdem `g_last_server_ack_ms`
- [ ] Error-ACK hat QoS 1
- [ ] Server-Log zeigt Error-ACK-Versand
- [ ] Kein funktionaler Unterschied im Normalbetrieb (Error-ACKs kommen nur bei echten Problemen)

---

## Aenderungstabelle

| Datei | Block | Aenderung |
|-------|-------|-----------|
| Server MQTT-Connect (`client.py` o.ae.) | D1-D3 | `will_set()` + "online" publish + Shutdown-Hook |
| `src/main.cpp` | D4 | Subscribe `server/status`, Handler fuer online/offline |
| `heartbeat_handler.py` `_send_heartbeat_ack` | E1 | QoS 0 → QoS 1 |
| `heartbeat_handler.py` `handle_heartbeat` | E2 | ACK-Senden frueh im Handler (nach Validation, vor DB) |
| `heartbeat_handler.py` (neu) | F1 | `_send_heartbeat_error_ack()` Methode |
| `heartbeat_handler.py` (alle return-Pfade) | F2 | Error-ACK an return-Pfaden ohne ACK |
| `src/main.cpp` (ACK-Handler) | F1 | `status: "error"` akzeptieren, trotzdem P1-Timer reset |

**Reihenfolge + Verifikation:**

| Schritt | Block | Build/Test |
|---------|-------|-----------|
| 1 | D (Server-LWT) | Server-Start + `mosquitto_sub` + ESP-Serial |
| 2 | E (ACK QoS+Timing) | Server-Tests + ESP-Serial (P1 nicht feuern bei langsamer DB) |
| 3 | F (Error-ACK) | Server-Tests + bewusst fehlerhaften Heartbeat senden |

**Was NICHT geaendert wird:**
- P1-Timeout-Wert (bleibt 120s) — Server-LWT macht ihn effektiv zum Fallback, nicht zur Primaererkennung
- P4 Grace Period (bleibt 30s)
- Heartbeat-Intervall (bleibt 60s)
- Emergency-Stop-Pfad
- ESP-LWT (bleibt unveraendert)
- Heartbeat-Payload-Format (abwaertskompatibel)

---

## Timing nach allen Fixes

### Erkennungszeiten (VORHER → NACHHER)

| Szenario | VORHER | NACHHER | Verbesserung |
|----------|--------|---------|-------------|
| Server-Crash (Broker ok) | 120s (P1) | ~60-90s (Server-LWT via Broker Keep-Alive) | ~30-60s schneller |
| Server-Hang (kein ACK) | 120s (P1) | 120s (P1, unveraendert — Server sendet kein LWT bei Hang) | — |
| Server-DB-Lag (langsamer ACK) | 120s (P1 False Positive!) | Kein P1-Trigger (ACK kommt frueh, QoS 1) | False Positive eliminiert |
| Heartbeat-Validation-Fehler | 120s (P1 False Positive!) | Kein P1-Trigger (Error-ACK) | False Positive eliminiert |
| Broker-Crash | Sofort (MQTT-Disconnect) | Sofort (unveraendert) | — |

### Neue Watchdog-Hierarchie (5 Ebenen)

```
Ebene 1: MQTT Keep-Alive (60s)     → Broker-Liveness            [bestehend]
Ebene 2: Server-LWT (retained)     → Schnelle Server-Crash-Erkennung  [NEU — Block D]
Ebene 3: Heartbeat + ACK (60s/QoS1)→ Server-Responsivitaet      [GEHAERTET — Block E]
Ebene 4: P1 ACK-Timeout (120s)     → Fallback bei Hang/Nicht-Erkennung [bestehend]
Ebene 5: P4 State Machine (30s)    → Koordinierter Offline-Mode  [bestehend]
```
