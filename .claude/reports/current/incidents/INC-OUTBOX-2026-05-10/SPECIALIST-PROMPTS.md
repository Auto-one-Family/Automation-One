# SPECIALIST-PROMPTS — INC-OUTBOX-2026-05-10

**Nach verify-plan. Branch: `auto-debugger/work`**

---

## PROMPT: esp32-dev (PKG-01 + PKG-02)

```
Du bist esp32-dev. Branch: auto-debugger/work (NICHT master).

## Kontext
INC-OUTBOX-2026-05-10: ESP32 crasht nach Messungen mit Guru Meditation Error.
Root Cause: ESP-IDF MQTT OUTBOX erschöpft durch ausstehende QoS-1-PUBACK-Handshakes
bei TCP-Sendebuffer-Druck. outbox_enqueue() scheitert → NULL-Deref in ESP-IDF-Stack.
Linear: AUT-326 (P0/Urgent).

## PKG-01 — sdkconfig.defaults: OUTBOX Timeout verkürzen

**Datei:** `El Trabajante/sdkconfig.defaults`

**Lese zuerst** die Datei vollständig (4 Zeilen).

**Ändere:** Ergänze am Ende (nach `CONFIG_MQTT_TASK_STACK_SIZE=10240`):
```
# AUT-326: Reduce OUTBOX expiry from 30s default to 10s.
# Prevents heap exhaustion when PUBACK is delayed by TCP send-buffer pressure.
# 10s still covers realistic reconnect windows (< 10s). Non-critical data loss accepted.
CONFIG_MQTT_OUTBOX_EXPIRED_TIMEOUT_MS=10000
```

## PKG-02 — intent_contract.cpp: Nicht-terminale Outcomes auf QoS 0

**Datei:** `El Trabajante/src/tasks/intent_contract.cpp`

**Schritt 1 — Vorab-Grep:**
Führe aus: `grep -n "safePublish" src/tasks/intent_contract.cpp`
Dokumentiere alle Treffer im FEHLER-REGISTER falls weitere Stellen gefunden.

**Schritt 2 — Lese** Zeilen 640-760 der Datei.

**Schritt 3 — Ändere Zeile ~751:**

Vorher (exakt):
```cpp
    bool ok = mqttClient.safePublish(topic, payload, 1);
```

Nachher:
```cpp
    // AUT-326: Non-terminal outcomes (accepted/processing) need no delivery guarantee.
    // QoS 0 = no OUTBOX slot; reduces OUTBOX pressure during measurement bursts.
    uint8_t outcome_qos = isTerminalOutcome(normalized_outcome) ? 1 : 0;
    bool ok = mqttClient.safePublish(topic, payload, outcome_qos);
```

`isTerminalOutcome()` ist in dieser Datei bereits bei Zeile 64 als static function definiert
und direkt aufrufbar. Keine weiteren Includes nötig.

## Verify

```bash
cd "El Trabajante" && pio run -e esp32_dev
```
Erwartung: Exit-Code 0, keine Errors.

Post-Build (nach pio run, falls .pio-Cache vorhanden):
```bash
grep OUTBOX ".pio/build/esp32_dev/config/sdkconfig" 2>/dev/null || echo "sdkconfig not cached"
```

## Fehler-Register

Datei: `.claude/reports/current/incidents/INC-OUTBOX-2026-05-10/FEHLER-REGISTER.md`
Pro Build-Fehler: ID, Evidenz (eine Zeile), Hypothese, Minimalfix, Verify.
Nächsten Fehler erst angehen wenn vorheriger grün verifiziert.

## Git-Pflicht
Commits nur auf Branch `auto-debugger/work`. Nicht auf master.
Commit-Message: `fix(firmware): AUT-326 MQTT OUTBOX Expiry + QoS-0 non-terminal outcomes`
```

---

## PROMPT: server-dev / Direkter Commit (PKG-03)

PKG-03 erfordert keinen Dev-Agent — die Änderungen sind bereits im lokalen Working-Tree korrekt.

**Aktion (direkt durch Orchestrator oder Robin):**

```bash
# Verify lokal:
cd "El Servador/god_kaiser_server" && ruff check .

# Commit:
git add "El Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py"
git commit -m "fix(server): INC-EA5484 STATE_PUSH_RECONNECT_DELAY — Konstante + sleep in _handle_reconnect_state_push"

# Deploy auf growy2:
# 1. git pull auf growy2
# 2. docker compose build --no-cache el-servador
# 3. docker compose up -d el-servador
# HINWEIS: --pull=never ist KEIN gültiges Flag (Fehler: strconv.ParseBool)
```

**Akzeptanz:**
- `ruff check .` clean
- Genau 1× `STATE_PUSH_RECONNECT_DELAY_SECONDS = 3.0` in der Datei
- `await asyncio.sleep(STATE_PUSH_RECONNECT_DELAY_SECONDS)` in `_handle_reconnect_state_push`

---

## Live-Verifikation nach Flash (Robin, manuell)

1. ESP flashen mit neuem Build
2. Serial Monitor öffnen
3. On-Demand EC/pH Messung 2× schnell hintereinander triggern
4. **Erwartung Serial:** Keine `OUTBOX: outbox_enqueue(xx): Memory exhausted` Meldungen
5. **Erwartung:** Kein Guru Meditation Error nach 10-20s
6. **Erwartung Serial:** intent_outcome "accepted" erscheint (auch ohne PUBACK-Garantie bei QoS 0 fire-and-forget)
7. **Erwartung Loki/Server:** Kein LWT-Disconnect für ESP_698EB4

**B-OUTBOX Gates (aus AUT-326):**
- B-OUTBOX-01: `pio run -e esp32_dev` Exit-Code 0 ✓ (Build-Gate)
- B-OUTBOX-02: Nach 2 aufeinanderfolgenden Messungen KEIN "Memory exhausted" im Serial
- B-OUTBOX-03: Nach 10 Messungen in 5 Minuten KEIN Guru Meditation Error
- B-OUTBOX-04: LWT-Event bleibt aus (kein unerwarteter Disconnect)
