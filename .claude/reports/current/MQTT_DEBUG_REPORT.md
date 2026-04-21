# MQTT Debug Report – ESP_EA5484

**Erstellt:** 2026-04-21 ~06:50 UTC  
**Modus:** B – Spezifisch: "Verbindungsabbrüche, Topic/Schema-Probleme, ACK/Config-Race"  
**Quellen:** `logs/server/god_kaiser.log`, Docker `docker compose ps`, Repo-Code-Analyse  

---

## 1. Zusammenfassung

ESP_EA5484 ist **aktuell online und stabil** (Heartbeat alle 60s, Sensordaten fließen). Gestern (2026-04-20) traten jedoch **mindestens 12 Disconnect-Events** (LWT) auf. Jeder Reconnect scheitert an denselben drei strukturellen Problemen: (1) Pydantic-Validation auf `session/announce` schlägt fehl → SessionAnnounce-State wird nie registriert; (2) Zone-ACK-Timeout beim State-Push → Zone wird nach Reconnect nie korrekt persistiert; (3) `intent_outcome` sendet ESP ohne Pflichtfeld `flow` → ERROR-Level im Server. Alle drei Probleme sind **Code-Defekte** (Firmware-/Server-seitig), kein Infra-Problem.

---

## 2. Analysierte Quellen

| Quelle | Status | Bemerkung |
|--------|--------|-----------|
| `logs/server/god_kaiser.log` (EA5484-Filter) | ✅ 247 Einträge | Vollständig ausgewertet |
| `docker compose ps` | ✅ | Alle 13 Services healthy/up 14h |
| `docker compose logs mqtt-broker --tail=80` | ✅ | Nur healthcheck-Traffic, kein EA5484-Eintrag |
| `mosquitto_sub --retained-only system/will EA5484` | ⬜ Timeout (exit 27) | **Kein retained LWT vorhanden** – korrekt |
| `logs/mqtt/mqtt_traffic.log` | ❌ Nicht gefunden | Datei existiert nicht (kein mqtt-logger-File) |
| Loki API | ❌ curl-Fehler (PS Alias) | Nicht abgefragt (Loki container healthy, Alloy aktiv) |
| Repo-Code: `mqtt_client.cpp`, `heartbeat_handler.py`, `esp.py` | ✅ | Direkt gelesen |
| `ERROR_CODES.md` | ✅ | 1021, 4062, 3016 nachgeschlagen |

---

## 3. Befunde (priorisiert)

---

### FINDING 1 – SessionAnnounce Payload-Validation fehlschlägt bei JEDEM Reconnect

**Schwere:** 🔴 Hoch  
**Frequenz:** 10+ Vorkommen in 24h, tritt bei **jedem** Reconnect-Event auf  

**Symptom:**
```
WARNING heartbeat_handler.handle_session_announce:231
  Invalid session/announce payload for ESP_EA5484:
  2 validation errors for SessionAnnouncePayload
  reason  → Field required [type=missing]
  ts_ms   → Field required [type=missing]

WARNING mqtt.subscriber._execute_handler:393
  Handler returned False for topic kaiser/god/esp/ESP_EA5484/session/announce
```

**Zeitstempel (Auswahl):** 16:56:24, 18:05:23, 18:05:54, 23:06:21, 23:13:15, 23:18:35, 23:27:44, 23:30:44, 23:36:14, **06:33:52 (heute)**

**Ursache-Hypothese:**  
`SessionAnnouncePayload.from_payload()` in `esp.py` Zeile 742 normalisiert Legacy-Payloads. Wenn weder `ts_ms`, `boot_ts` noch `ts` im Payload vorhanden sind, bleibt `ts_ms_raw = None` → der Block `if ts_ms_raw is not None:` wird übersprungen → `normalized["ts_ms"]` wird **nicht gesetzt**. Pydantic wirft `ValidationError` (Subclass von `ValueError`), wird als WARNING geloggt. Das Feld `reason` wird zwar inferiert (`epoch > 1 → "reconnect"`), aber Pydantic zeigt beide Felder als fehlend – vermutlich weil `ts_ms` fehlt und Pydantic die weiteren Fehler sammelt.

Das **aktuelle Repo-Code** (`mqtt_client.cpp` L1232–1248) sendet `reason` und `ts_ms`. Die Datei ist aber als **modified** markiert (`git status: M El Trabajante/...mqtt_client.cpp`) – d.h. das deployed Firmware-Image ist älter und sendet noch kein `ts_ms`/`boot_ts`/`reason`.

**Evidenz:**
- `input_value={'esp_id': 'ESP_EA5484', ...3', 'handover_epoch': 1}` – kein `ts_ms` oder `reason`
- Alle Fehler zeigen `handover_epoch: 1` → reboot-Epoch (Firmware-Counter resettet sich bei jedem Disconnect)
- `El Servador/god_kaiser_server/src/schemas/esp.py` L737–738: `reason` und `ts_ms` sind `Field(...)` (required)
- `from_payload()` L761–769: `ts_ms_raw = None` wenn Payload keines von `ts_ms`, `boot_ts`, `ts` enthält

**Konsequenz:**  
`handle_session_announce` gibt `False` zurück → `_register_session_connected()` wird nie aufgerufen → handover_epoch tracking bricht → Reconnect-Statistiken inkonsistent.

**Fix-Empfehlung:**

Option A – Server-seitiger Fallback in `from_payload()` (sofort, kein Firmware-Flash):
```python
# El Servador/god_kaiser_server/src/schemas/esp.py, Zeile ~769
if ts_ms_raw is not None:
    ...
    normalized["ts_ms"] = ts_ms
else:
    # Fallback: kein Timestamp vorhanden → 0 ist valide (ge=0)
    normalized["ts_ms"] = 0
```

Option B – Firmware re-flashen mit aktuellem `mqtt_client.cpp` (empfohlen mittel-/langfristig):  
Datei: `El Trabajante/src/services/communication/mqtt_client.cpp` – Änderungen committen und ESP32 neu flashen. Der aktuelle Code in git sendet bereits `reason` und `ts_ms`.

---

### FINDING 2 – Zone-ACK-Timeout beim Reconnect-State-Push (bei JEDEM Reconnect)

**Schwere:** 🔴 Hoch  
**Frequenz:** 4 bestätigte Timeouts (16:56:40, 18:06:10, 23:06:37, 23:28:00)

**Symptom:**
```
WARNING mqtt_command_bridge.send_and_wait_ack:162
  ACK timeout for ESP_EA5484 zone (correlation_id=..., timeout=15.0s, elapsed_ms=15001)

WARNING heartbeat_handler._handle_reconnect_state_push:2013
  Zone ACK timeout during state push for ESP_EA5484: No ACK for ESP_EA5484 zone within 15.0s
```

**Ursache-Hypothese:**  
`_handle_reconnect_state_push()` wird als Background-Task nach dem Heartbeat-DB-Write gestartet (L547–550). Es sendet `zone/assign` via `MQTTCommandBridge.send_and_wait_ack()` (Timeout 15s). Das ESP antwortet nicht mit `zone/ack` innerhalb dieser Zeit.  

Mögliche Ursachen (Reihenfolge nach Wahrscheinlichkeit):
1. **Registration Gate noch geschlossen:** Das Gate öffnet nach Heartbeat-ACK (oder nach 10s Timeout). `zone/ack` ist ein System-Response und **bypassed** das Gate – ABER wenn die `session/announce` Verarbeitung fehlschlägt (Finding 1), könnte der Reconnect-State intern inkonsistent sein und das ESP `zone/assign` Subscription nicht bereit haben.
2. **Subscription-Timing:** ESP subscribed `zone/assign` Topic erst nach Bootstrap-Phase. Der State-Push kommt zu früh (sofort nach erstem Heartbeat).
3. **Offline-Buffer Replay blockiert:** Nach Reconnect läuft `pauseForAnnounceAck()` (AUT-69). Wenn der Announce-Guard-Timeout (300ms) noch aktiv ist, werden Antworten möglicherweise verzögert.

**Konsequenz (kritisch):**  
Bei Timeout wirft `send_and_wait_ack()` eine Exception. In `_handle_reconnect_state_push()` L2014 wird der `catch` ausgeführt. **`metadata["full_state_push_sent_at"]` wird NICHT persistiert** (L2010 nur nach erfolgreichem ACK). Beim nächsten Reconnect hat der Cooldown-Check (L1983) `last_push=0` → triggert erneuten Push → Endlosschleife bei häufigen Reconnects.

**Evidenz:**
- Alle 4 Timeouts exakt nach 15.000–15.002ms (= MQTTCommandBridge.DEFAULT_TIMEOUT)
- Korreliert immer mit SessionAnnounce-Fehler (Finding 1) wenige Sekunden früher
- `heartbeat_handler.py` L1951–2013 Logik bestätigt: cooldown wird erst nach ACK gesetzt

**Fix-Empfehlung:**

`El Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py`:
1. **Delay vor State-Push** einbauen: Kurze Wartezeit (z.B. 2–3s) vor `zone/assign` senden, um ESP-Subscription-Readiness abzuwarten:
```python
# _handle_reconnect_state_push(), nach L1989 (Cooldown-Check)
await asyncio.sleep(2.0)  # ESP subscription readiness buffer
```
2. **Timeout erhöhen** oder **Retry hinzufügen** in `_handle_reconnect_state_push()` für Zone-ACK (aktuell single-shot 15s):
```python
# Option: 2 Retries mit je 15s Timeout
for attempt in range(3):
    try:
        await _command_bridge.send_and_wait_ack(...)
        break
    except Exception:
        if attempt == 2:
            raise
        await asyncio.sleep(5.0)
```

---

### FINDING 3 – Config PARTIAL_SUCCESS + COMMIT_FAILED nach langer Offline-Zeit (GPIO 4 DS18B20)

**Schwere:** 🟡 Mittel  
**Frequenz:** Gebündelt am 2026-04-20 15:45–15:48 (nach ~2843s offline)

**Symptom:**
```
WARNING config_handler.handle_config_ack:130
  Contract violation normalized on config_response:
  esp_id=ESP_EA5484 raw_status=partial_success raw_type=sensor raw_error_code=None

WARNING config_handler.handle_config_ack:183
  ⚠️ Config PARTIAL SUCCESS on ESP_EA5484: sensor - 3 OK, 1 failed - 3 configured, 1 failed

INFO config_handler._process_config_failures:481
  Processing config failure: ESP_EA5484 sensor GPIO 4 - CONFIG_FAILED

INFO error_handler:201  error_code=1021, severity=error
  → ONEWIRE_NO_DEVICES (DS18B20 Sensor, GPIO 4)

INFO intent_outcome_handler:113
  flow=config intent_id=... outcome=failed
```

**Ursache-Hypothese:**  
Beim Config-Push unmittelbar nach Reconnect (server sendet Config in `state_adoption_service.start_reconnect_cycle()`) ist der OneWire-Bus auf GPIO 4 noch nicht bereit. DS18B20 benötigt nach Power-On/Boot einige hundert Millisekunden bis Sekunden für Device-Discovery. Config kommt zu früh → `ONEWIRE_NO_DEVICES` → `CONFIG_FAILED`. Parallel schlägt der `system`-Teil mit `COMMIT_FAILED` fehl.

Das DS18B20 **funktioniert später einwandfrei** (heute 06:41–06:43: `raw=302.0 → 18.88°C, quality=good`).

**Evidenz:**
- `error_code=1021` = `ONEWIRE_NO_DEVICES` (`sensor_manager.cpp:418`)
- Tritt nur nach langer Offline-Zeit (~2843s) auf, nicht bei kurzen Reconnects
- Folge-Config-Pushes für dieselben GPIOs erfolgreich

**Konsequenz:**  
`config_applied=False` für GPIO 4 bleibt im DB, bis nächster Config-Push erfolgreich. Sensor sendet aber trotzdem Daten (läuft im ESP ohne expliziten Config-ACK weiter). Lediglich Server-seitig als "pending" markiert.

**Fix-Empfehlung:**

Firmware-seitig: In `sensor_manager.cpp` bei OneWire-Init einen kurzen Retry-Loop (z.B. 3x mit 500ms Delay) einbauen bevor `ONEWIRE_NO_DEVICES` gemeldet wird. Alternativ: Config-Response für DS18B20 erst senden wenn Bus bereit.

Server-seitig: Config-Push bei Reconnect um 2–5s verzögern (hilft auch für Finding 2):
```python
# El Servador/.../state_adoption_service.py oder heartbeat_handler.py
# Verzögerung vor Config-Push nach sehr langer Offline-Zeit
if offline_seconds > 300:
    await asyncio.sleep(3.0)
```

---

### FINDING 4 – intent_outcome sendet fehlendes Pflichtfeld `flow` (ERROR-Level)

**Schwere:** 🟡 Mittel  
**Frequenz:** 2 ERROR-Einträge (16:57:22, 18:21:43)

**Symptom:**
```
WARNING intent_outcome_handler.handle_intent_outcome:70
  intent_outcome missing intent_id normalized: esp_id=ESP_EA5484
  correlation_id=b604385a-... seq=22 ts=1776704242

ERROR intent_outcome_handler.handle_intent_outcome:80
  Invalid intent_outcome payload (permanent, not retrying):
  Missing required field: flow
  topic=kaiser/god/esp/ESP_EA5484/system/intent_outcome
```

Beide Events hatten vorher gescheiterte kritische Publishes:
- `intent_id=critical_pub_5122926_1774 outcome=failed` (Publish-Pfad)
- `intent_id=emergency_22488892_2083 outcome=failed` (Emergency-Befehl)
- `error_code=4062` = `TASK_QUEUE_FULL` / MQTT-Publish-Backpressure

**Ursache-Hypothese:**  
Firmware sendet `system/intent_outcome` ohne Pflichtfeld `flow`. Dieser Pfad wird aus dem Offline-Buffer nach Reconnect geflasht. Ältere Firmware-Version hatte das `flow`-Feld in `intent_outcome`-Payloads noch nicht implementiert. Server-seitig ist `flow` required und es gibt kein Legacy-Fallback.

**Konsequenz:**  
Server markiert als `permanent failure, not retrying`. Intent-Tracking für diese Events ist verloren. Bei emergency-Befehl besonders kritisch – kein Nachweis ob der Befehl verarbeitet wurde.

**Evidenz:**
- `intent_outcome_handler.py` Zeile 70 + 80
- `error_code=4062` (MQTT_PUBLISH_BACKPRESSURE) deutet auf Queue-Pressure vor den Disconnect-Events
- Betrifft kritische Intent-IDs (`critical_pub_*`, `emergency_*`)

**Fix-Empfehlung:**

Server-seitig Fallback hinzufügen in `intent_outcome_handler.py`:
```python
# El Servador/god_kaiser_server/src/mqtt/handlers/intent_outcome_handler.py
flow = payload.get("flow")
if not flow:
    # Infer from intent_id pattern for legacy payloads
    intent_id = payload.get("intent_id", "")
    if intent_id.startswith("critical_pub_") or intent_id.startswith("emergency_"):
        flow = "publish"  # best-effort inference
    else:
        flow = "unknown"
    logger.warning("intent_outcome missing flow, inferred: %s", flow)
```

Firmware-seitig: `flow`-Feld zu allen intent_outcome-Payloads hinzufügen (Pflicht, nicht optional).

---

### FINDING 5 – Scheduler-Job `sensor_schedule_ESP_EA5484_X not found` (WARNING-Storm)

**Schwere:** 🟢 Niedrig (funktionale Auswirkung keine, aber Noise)  
**Frequenz:** 10+ Vorkommen für GPIOs 0, 4, 32, 33

**Symptom:**
```
WARNING scheduler.remove_job:362
  Job sensor_schedule_ESP_EA5484_32 not found
```

**Ursache-Hypothese:**  
API-Endpoint für Sensor-Update (`sensors.create_or_update_sensor`) versucht bestehenden Schedule-Job zu löschen, bevor dieser registriert wurde. Race Condition: Erster Config-Push nach Boot erstellt Scheduler-Jobs, aber API-Update kommt vor Config-Applied → kein Job vorhanden.

**Fix-Empfehlung:**

`El Servador/god_kaiser_server/src/core/scheduler.py` L362: Guard vor `remove_job()`:
```python
if scheduler.get_job(job_id) is not None:
    scheduler.remove_job(job_id)
# statt direkten remove_job() der eine Exception/WARNING wirft
```

---

### FINDING 6 – LWT-Timestamp = 0 (INFO)

**Schwere:** 🟢 Info  

Alle LWT-Messages haben `key=esp:esp_ea5484:reason:unexpected_disconnect:ts:0`. Das zeigt: ESP konfiguriert LWT zur MQTT-Connect-Zeit, zu diesem Zeitpunkt ist die Uhrzeit noch nicht synchronisiert (NTP noch nicht abgeschlossen) → `timestamp=0`. Der Terminal-Authority-Guard erkennt diese korrekt als stale. **Kein Bug**, aber ein Signal, dass NTP-Sync vor MQTT-Connect wünschenswert wäre.

**Retained LWT:** Kein retained LWT im Broker gefunden (mosquitto_sub timed out = keine Message) → ✅ sauber.

---

## 4. Extended Checks

| Check | Ergebnis |
|-------|----------|
| `docker compose ps` | Alle 13 Container healthy/running |
| `docker compose logs mqtt-broker --tail=80` | Nur healthcheck-Traffic, keine EA5484-Events |
| `mosquitto_sub --retained-only system/will EA5484` | Timeout (exit 27) = kein retained LWT ✅ |
| Server-Log grep EA5484 ERROR/WARNING | 247 Zeilen, 6 Kategorien identifiziert |
| Heartbeat-ACK Timing | 60s Intervall exakt, "Early ACK" Pattern korrekt |
| Broker-Config | Persistence true, max_inflight 20, auth anonymous |
| Loki-Verfügbarkeit | Container healthy, PS curl-Alias-Problem verhinderte Query |

---

## 5. Bewertung & Empfehlung

**Aktueller Zustand:** ESP_EA5484 online, stabil, alle Sensoren liefern Daten.

**Root Causes:**

| # | Root Cause | Ort | Priorität |
|---|------------|-----|-----------|
| 1 | `from_payload()` hat kein Fallback wenn `ts_ms_raw is None` | `El Servador/.../schemas/esp.py` L761-769 | **SOFORT** |
| 2 | Zone-ACK-Timeout: State-Push ohne Delay nach Reconnect | `El Servador/.../handlers/heartbeat_handler.py` L1991-2007 | **HOCH** |
| 3 | OneWire-Bus nicht bereit bei sofortigem Config-Push | `El Trabajante/src/sensor_manager.cpp` (Retry) | **MITTEL** |
| 4 | `intent_outcome` ohne `flow`-Feld (alt+neu) | `mqtt_client.cpp` + `intent_outcome_handler.py` | **MITTEL** |
| 5 | Scheduler `remove_job` ohne Existenz-Check | `El Servador/.../core/scheduler.py` L362 | **NIEDRIG** |

**Nächste Schritte:**
1. **Hotfix Server:** `esp.py` `from_payload()` – `ts_ms = 0` als Fallback wenn `ts_ms_raw is None`
2. **Hotfix Server:** `heartbeat_handler.py` `_handle_reconnect_state_push()` – 2s Delay vor Zone-Assign
3. **Firmware re-flashen** mit aktuellem `mqtt_client.cpp` (sendet `reason`, `ts_ms`, `boot_ts`)
4. **Server:** `intent_outcome_handler.py` – Legacy-Fallback für fehlendes `flow`-Feld
5. **Monitoring:** Loki-Query auf `session/announce` validation errors als Alert einrichten

---

*Keine Infrastruktur-Probleme gefunden. Alle Findings sind Code-Defekte mit konkreten Fixes.*
