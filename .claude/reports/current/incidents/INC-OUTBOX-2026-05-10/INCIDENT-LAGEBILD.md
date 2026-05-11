# INCIDENT-LAGEBILD — INC-OUTBOX-2026-05-10

**Datum:** 2026-05-10  
**Linear-Parent:** AUT-325 (pH/EC Fertigation Datenpfad)  
**Linear-Issues:** AUT-326 (P0/Urgent), AUT-303 (High/In Review)  
**Branch:** `auto-debugger/work`  
**Symptom:** ESP_698EB4 crasht nach jeder Mess-Session mit Guru Meditation Error → LWT → offline

---

## 1. Kausalkette (evidenzbasiert)

```
User klickt Measure-Button
  → Server publiziert sensor/33/command (QoS 2, ACK-driven CommandBridge)
  → ESP empfängt Command → Safety-Task führt ADC-Messung durch
  → ESP publiziert nach Messung (alle QoS 1):
      [1] sensor/33/data             (~200B payload)
      [2] system/intent_outcome accepted  (~500B)
      [3] system/intent_outcome applied   (~500B)
  → ESP-IDF MQTT-OUTBOX hält alle QoS-1-Nachrichten bis PUBACK vom Broker
  
Bei TCP-Sendebuffer-Druck (bekannt: INC-EA5484, EAGAIN auf Core 0):
  → PUBACK verzögert sich → OUTBOX akkumuliert
  → 2. Messung rasch danach: 3 weitere OUTBOX-Einträge
  → Heap-Fragmentierung + viele ausstehende Einträge → malloc(46B) scheitert
  → outbox_enqueue(46): Memory exhausted  ×10
  → Aufrufender Code in ESP-IDF prüft Fehlercode nicht
  → NULL-Pointer-Dereference → Guru Meditation Error (LoadProhibited)
  → Reboot → LWT → ESP offline
```

**Heap-Status 108s vor Crash:** 49260 B free, max_alloc=38900 B (49s before crash = heavily fragmented)

---

## 2. Code-Evidenz (repo-verifiziert)

| Datei | Stelle | Befund |
|-------|--------|--------|
| `El Trabajante/src/tasks/intent_contract.cpp:751` | `mqttClient.safePublish(topic, payload, 1)` | Alle intent_outcomes QoS 1 — auch nicht-terminale (accepted/processing) |
| `El Trabajante/src/tasks/intent_contract.cpp:64-68` | `isTerminalOutcome()` | "accepted" und "processing" sind nicht-terminal |
| `El Trabajante/sdkconfig.defaults` | fehlt `MQTT_OUTBOX_EXPIRED_TIMEOUT_MS` | Default 30s — stauende Nachrichten bleiben 30s im OUTBOX |
| `El Trabajante/src/services/communication/mqtt_client.cpp:346-348` | `mqtt_cfg.out_buffer_size = 8192` | TCP-Sendebuffer (nicht OUTBOX) |
| `El Trabajante/src/tasks/publish_queue.h:19` | `PUBLISH_QUEUE_SIZE = 8` | Intern OK — Engpass liegt im ESP-IDF OUTBOX, nicht im eigenen Queue |
| `El Servador/…/heartbeat_handler.py` | lokal diff: +const+sleep | Reconnect-Delay noch nicht committed/deployed |

### AUT-303-Status (In Review)
- `sensor_manager.cpp:1578` — `manual_measure_busy_[sensor_index]` **bereits implementiert** ✅
- `intent_contract.cpp` intent_outcome als non-critical: **noch nicht implementiert** ← Teil von PKG-02

---

## 3. Resilienz-Check

**Betrifft:** Reconnect-Lifecycle, MQTT-Outbox, TCP-Sendebuffer

- Nach Reconnect: STATE_PUSH sendet zone/assign (commit + sleep in heartbeat_handler.py lokal vorhanden, aber nicht deployed)
- OUTBOX-Expiry: Default 30s → bei burst nach Reconnect können 6-8 Nachrichten für 30s auf PUBACK warten
- NULL-Deref: Liegt in ESP-IDF MQTT-Stack → unfixbar ohne Update; einziger Weg: OUTBOX nie erschöpfen

---

## 4. Hypothesen-Status

| Hypothese | Status |
|-----------|--------|
| QoS-2 für sensor/data oder intent_outcome | ❌ WIDERLEGT — beide QoS 1 |
| TCP-Sendebuffer-Druck → PUBACK-Delay → OUTBOX-Stau | ✅ BESTÄTIGT (INC-EA5484 Muster, beleg F2) |
| Heap-Erschöpfung durch payload-Größe | ✅ WAHRSCHEINLICH (49260→fragmented über 108s bursts) |
| ESP-IDF NULL-Deref bei outbox_enqueue-Fehler | ✅ BESTÄTIGT (Backtrace, EXCVADDR=0) |

---

## 5. Beleg-Referenz

`.claude/reports/current/auto-debugger-runs/run-ec-ph-ondemand-2026-05-09/BELEG-EC-LIVEBEFUND-2026-05-10.md`  
F1 (Guru Meditation), F2 (OUTBOX Exhaustion), Zeilen 26–111

---

*Erstellt: 2026-05-10 | Branch: auto-debugger/work*
