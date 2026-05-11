# TASK-PACKAGES — INC-OUTBOX-2026-05-10

**Status:** Nach verify-plan — bereit zur Implementierung  
**Incident:** INC-OUTBOX-2026-05-10  
**Linear:** AUT-326 (P0/Urgent), AUT-303 (High/In Review)  
**Branch:** `auto-debugger/work`

---

## PKG-01 — ESP32: MQTT Outbox Expiry-Timeout verkürzen

**Schicht:** El Trabajante (ESP32 Firmware)  
**Agent:** `esp32-dev`  
**Priorität:** P0 — verhindert Heap-Stau im OUTBOX  
**Linear:** AUT-326

### Scope
Datei: `El Trabajante/sdkconfig.defaults`

### Änderung
```
# Vorher (letzte Zeile):
CONFIG_MQTT_TASK_STACK_SIZE=10240

# Nachher (ergänzen):
CONFIG_MQTT_TASK_STACK_SIZE=10240
# AUT-326: Reduce from 30s default → 10s; prevents OUTBOX heap exhaustion
# during PUBACK-delayed bursts (TCP send-buffer pressure after reconnect).
CONFIG_MQTT_OUTBOX_EXPIRED_TIMEOUT_MS=10000
```

### Begründung
Default-Timeout ist 30s. Bei TCP-Sendebuffer-Druck (bekanntes INC-EA5484-Muster) 
kommen PUBACKs mit Sekunden-Verzögerung. 6+ QoS-1-Nachrichten à ~500B × 30s 
Haltezeit = anhaltender OUTBOX-Druck → Heap-Fragmentierung → malloc(46) scheitert.  
10s deckt normale Netzwerk-Latenzen (< 1s) + Reconnect-Window (< 10s) ab.

### Risiko
LOW: Betrifft nur Retry-Fenster für nicht-bestätigte QoS-1 Nachrichten. Auf 
gesunden Verbindungen kommt PUBACK in < 100ms → keine Auswirkung auf Zuverlässigkeit.

### Akzeptanzkriterien
- [ ] `cd "El Trabajante" && pio run -e esp32_dev` Exit-Code 0
- [ ] `El Trabajante/sdkconfig.defaults` enthält `CONFIG_MQTT_OUTBOX_EXPIRED_TIMEOUT_MS=10000`
- [ ] Post-Build-Verifikation Schlüssel: `grep OUTBOX ".pio/build/esp32_dev/config/sdkconfig"` → zeigt `CONFIG_MQTT_OUTBOX_EXPIRED_TIMEOUT_MS=10000`
- [ ] Kein anderer Build-Flag in sdkconfig.defaults geändert

---

## PKG-02 — ESP32: intent_outcome nicht-terminal → QoS 0

**Schicht:** El Trabajante (ESP32 Firmware)  
**Agent:** `esp32-dev`  
**Priorität:** P0 — reduziert OUTBOX-Last um ~50% pro Mess-Sequenz  
**Linear:** AUT-326, AUT-303 (Fix 3)

### Scope
Datei: `El Trabajante/src/tasks/intent_contract.cpp`

### Änderung (Zeile ~751)

**Vorher:**
```cpp
    String topic = TopicBuilder::buildIntentOutcomeTopic();
    bool ok = mqttClient.safePublish(topic, payload, 1);
```

**Nachher:**
```cpp
    String topic = TopicBuilder::buildIntentOutcomeTopic();
    // AUT-326: Non-terminal stages (accepted/processing) need no delivery guarantee.
    // QoS 0 = no OUTBOX slot; reduces OUTBOX pressure during burst measurements.
    uint8_t qos = isTerminalOutcome(normalized_outcome) ? 1 : 0;
    bool ok = mqttClient.safePublish(topic, payload, qos);
```

### Begründung
`isTerminalOutcome()` (line 64-68) unterscheidet korrekt: "accepted" und "processing" 
sind nicht-terminal. Nur finale Outcomes (applied/failed/expired) benötigen QoS-1-Garantie.  
Pro Messung: 1 nicht-terminaler Publish → kein OUTBOX-Slot. Bei 2 Messungen = 2 Slots weniger 
unter TCP-Druck. Direkte OUTBOX-Druckreduzierung.

Der Server erwartet laut CommandBridge das finale `applied`/`failed` — intermediäre stages 
sind informational. Verlust von `accepted` im Worst Case (QoS 0 dropped): Server wartet 
weiter bis Timeout, dann kommt `applied` via QoS 1. Kein Datenverlust.

### Pattern-Reuse
`safePublish(topic, payload, qos)` — Signatur bereits 3-parameter, QoS-Argument existiert.
`isTerminalOutcome()` — static function, bereits im selben scope (line 64) aufrufbar.

### Risiko
MEDIUM: Server-Monitoring für intent_outcome `accepted` könnte diese Stage seltener sehen 
(bei Drop). Functional risk: KEINER — `applied`/`failed` bleiben QoS 1.

### Akzeptanzkriterien
- [ ] Vorab-Grep: `grep -n "safePublish.*1)" src/tasks/intent_contract.cpp` — alle weiteren Stellen prüfen
- [ ] `cd "El Trabajante" && pio run -e esp32_dev` Exit-Code 0
- [ ] `isTerminalOutcome(normalized_outcome)` korrekt eingebunden (static function, selber TU, Zeile 64)
- [ ] Keine anderen Änderungen in intent_contract.cpp

---

## PKG-03 — Server: heartbeat_handler.py — Commit lokalen Fix

**Schicht:** El Servador (Python Server)  
**Agent:** `server-dev` (oder direkt via Commit)  
**Priorität:** HIGH — Reconnect-Delay fehlt noch auf Growy2  
**Linear:** Kein eigenes Issue — Teil des bekannten INC-EA5484-Fixes

### Scope
Datei: `El Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py`

### IST-Diff (git diff zeigt lokale Änderungen)
```python
# Neue Konstante mit Kommentar (Zeile ~78):
# INC-EA5484: ESP needs time to finish QoS handshakes for 12 bootstrap subscriptions
# before zone/assign arrives. Without delay, TCP send buffer fills (EAGAIN) and
# MQTT client freezes until broker keepalive timeout (90s).
STATE_PUSH_RECONNECT_DELAY_SECONDS = 3.0

# Neuer Sleep-Call in _handle_reconnect_state_push (Zeile ~2424):
await asyncio.sleep(STATE_PUSH_RECONNECT_DELAY_SECONDS)
```

### Aktion
Lokale Änderungen sind korrekt. Commit + Push → Growy2 pull + Docker-Rebuild.
Server hat auf growy2 einen defekten manuellen Fix (Konstante 2×). Lokale Version 
hat korrekte Implementierung (1× mit Kommentar + sleep call).

### Akzeptanzkriterien
- [ ] `cd "El Servador/god_kaiser_server" && ruff check .` clean (kein Error)
- [ ] Genau 1× `STATE_PUSH_RECONNECT_DELAY_SECONDS = 3.0` in der Datei
- [ ] `await asyncio.sleep(STATE_PUSH_RECONNECT_DELAY_SECONDS)` in `_handle_reconnect_state_push`
- [ ] Auf growy2: `docker compose build --no-cache el-servador && docker compose up -d el-servador` (NICHT `--pull=never`, das ist kein gültiges Flag)

---

## Reihenfolge

```
PKG-01 (sdkconfig, 1 line) → parallel mit PKG-02 (intent_contract.cpp, 2 lines)
PKG-03 (server commit) → unabhängig, kann parallel laufen
Build-Verify PKG-01+02: pio run -e esp32_dev
Lint-Verify PKG-03: ruff check
```

*Vor Implementierung: verify-plan Gate obligatorisch*
