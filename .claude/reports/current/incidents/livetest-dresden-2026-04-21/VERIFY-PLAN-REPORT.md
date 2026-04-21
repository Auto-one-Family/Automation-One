# VERIFY-PLAN-REPORT — Live-Hartetest Dresden 2026-04-21

> **Gate:** verify-plan für TASK-PACKAGES.md  
> **Stand:** Lauf-3, 2026-04-21  
> **Resultat:** 2 Korrekturen, 1 Streichung, 3 bestätigt  

---

## Geprüfte Elemente

| Element | Anzahl |
|---------|--------|
| Dateipfade | 8 |
| Firmware-Files | 2 |
| Server-Python-Files | 3 |
| MQTT-Handler | 1 |
| Subscribe-Calls | 12 |

---

## PKG-01 — GRUEN (mit Korrektur)

**Befund:** QoS-Mismatch bestätigt. Fix-Datei ist **`El Trabajante/src/main.cpp`**, nicht `mqtt_client.cpp`.

**Code-Evidenz:**
```cpp
// main.cpp:619-636
mqttClient.queueSubscribe(TopicBuilder::buildConfigTopic(), 1, true);        // L620 → 2
mqttClient.queueSubscribe(TopicBuilder::buildSystemCommandTopic(), 1, true); // L621 → 2
mqttClient.queueSubscribe(TopicBuilder::buildBroadcastEmergencyTopic(), 1, true); // L622 → 2
// ...
mqttClient.queueSubscribe(actuator_wildcard, 1, true);  // L626 → 2
mqttClient.queueSubscribe(sensor_wildcard, 1, false);   // L636 → 2
```

**Risiko:** QoS-2-Queue-Druck (PUBREC/PUBREL/PUBCOMP) erhöht RAM-Last. Nach Flash beobachten.

**Korrektur in TASK-PACKAGES.md:** Betroffene Datei auf `main.cpp:620-636` präzisiert. ✅

---

## PKG-02 — VERWORFEN (kein Code-Fix nötig)

**Befund:** LWT-Handler vollständig implementiert und korrekt registriert.

**Code-Evidenz:**
```python
# main.py:297
_subscriber_instance.register_handler("kaiser/+/esp/+/system/will", lwt_handler.handle_lwt)
logger.info("LWT handler registered: kaiser/+/esp/+/system/will")
```

`lwt_handler.py` (397 Zeilen): Instant-Offline, Actuator-Reset, WS-Broadcast, Flapping-Schutz (FLAPPING_THRESHOLD=2, FLAPPING_WINDOW=300s).

**Warum kein LWT im Lauf-1:** Kein echter MQTT-Disconnect aufgetreten. Der "Offline"-State war ein Poller-False-Positive (~1s Timing-Jitter vor Heartbeat-Eingang). Korrekt: kein LWT published, kein `lwt_handler`-Log.

**Aktion:** Umgeschrieben zu HT-C1 (manueller Disconnect-Test). ✅

---

## PKG-03 — GRUEN (Scope-Korrektur)

**Befund:** `buildOutcomePayload()` setzt `flow` IMMER (Fallback `"unknown"`).

**Code-Evidenz:**
```cpp
// intent_contract.cpp:333
doc["flow"] = flow != nullptr ? flow : "unknown";
```

**Wahrscheinliche Ursache des Rejects:** Entweder Caller übergibt `nullptr`/`""` (→ `"unknown"` in JSON), oder Server-Validation lehnt `"unknown"` als Flow-Wert ab.

**Korrektur in TASK-PACKAGES.md:** Fix-Scope auf Caller-Analyse + Server-Validation präzisiert. ✅

---

## PKG-04 — GRUEN

Retained-Message-Anomalien bestätigt. User-Bestätigung für Broker-Cleanup erforderlich. ✅

---

## PKG-05 — GRUEN

HEARTBEAT_INTERVAL_MS=60000 in Firmware bestätigt. Robin-Klärung ob SOLL=30s korrekt ist. ✅

---

## PKG-06 — GRUEN

Unstaged Dateien bestätigt:
- `El Servador/god_kaiser_server/src/api/v1/logic.py`
- `El Servador/god_kaiser_server/src/services/logic/conditions/sensor_diff_evaluator.py`
Vor PKG-01 committen. ✅

---

## BLOCKER

| BLOCKER | Beschreibung |
|---------|-------------|
| PKG-01 Verifikation | Erfordert ESP32-Flash + Broker-Log-Verifikation nach Reconnect |
| HT-C1 | Manuelle mosquitto-Unterbrechung durch Robin |
| PKG-03 Wurzelursache | seq=489-Payload nicht vorliegend; ggf. zusätzliches Debug-Logging nötig |

---

## Entscheidung

**PKG-01 (esp32-dev):** IMPLEMENTIEREN — main.cpp:620-636, 5× QoS 1→2  
**PKG-02:** KEIN CODE-FIX — HT-C1 manuell durch Robin  
**PKG-03 (esp32-dev + server-dev):** CALLER-ANALYSE → dann Fix  
**PKG-04 (mqtt-dev):** IMPLEMENTIEREN nach User-Bestätigung  
**PKG-05:** KLÄRUNG durch Robin  
**PKG-06 (server-dev):** SOFORT committen (vor PKG-01)  
