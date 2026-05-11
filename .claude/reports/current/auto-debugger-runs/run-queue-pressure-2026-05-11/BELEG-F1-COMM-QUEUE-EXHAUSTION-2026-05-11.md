# BELEG F1 — Firmware: Aktor-Burst COMM-Queue-Erschöpfung (ESP_EA5484)

**Run-ID:** run-queue-pressure-2026-05-11
**Datum:** 2026-05-11
**Gerät:** ESP_EA5484 (192.168.0.161)
**Finding-ID:** F1-COMM-QUEUE-EXHAUSTION
**Kategorie:** error
**Schicht:** Firmware (El Trabajante)

---

## Symptome (log-gestützt)

```
[SYNC] Publish queue created (8 slots)
[COMM] queue_pressure entered_pressure fill=6 hwm=7 shed=0 drop=0
[COMM] queue_pressure entered_pressure fill=7 hwm=8 shed=0 drop=0
[COMM] queue_pressure entered_pressure fill=6 hwm=8 shed=0 drop=0
[MQTT] Publish queue full — dropping: kaiser/god/esp/ESP_EA5484/sensor/0/data
[SENSOR] Failed to publish sensor data for GPIO 0
[ERRTRAK] [3012] [COMMUNICATION] Failed to publish sensor data
TRANSPORT_BASE: tcp_write error, errno=No more processes
MQTT_CLIENT: Writing failed: errno=11
managed reconnect request failed: ESP_FAIL
CircuitBreaker [MQTT]: Failure threshold reached → OPEN
```

**Prometheus-Belege:**
- `queue_pressure_event_total{esp_id="ESP_EA5484", event="entered_pressure"}` = 29
- `queue_pressure_event_total{esp_id="ESP_EA5484", event="recovered"}` = 28

**PostgreSQL-Belege (command_outcomes, letzte 6h):**
- offline: 14, failed: 8, success: 32, applied: 33

---

## Kausalkette

1. Schnelles Ein-/Ausschalten Aktor (GPIO 25) erzeugt pro Befehl mindestens 4 ausgehende Publishes:
   - `system/intent_outcome` accepted (QoS 1, Core-0-Callback)
   - `actuator/{gpio}/response` (kritisch, safePublish, Core-1)
   - `system/intent_outcome` applied/failed (kritisch, Core-1)
   - optional `system/intent_outcome/lifecycle`-Stufen (kritisch, Core-1)
   - optional `actuator/{gpio}/status` (nicht-kritisch, QoS 1)
   - parallel: `sensor/0/data` (Telemetrie, nicht-kritisch)

2. Die COMM-Queue (Publish-Queue, **8** Slots, SSOT `El Trabajante/src/tasks/publish_queue.h` `PUBLISH_QUEUE_SIZE`) füllt sich unter Burst-Last bis HWM=8 (konsistent mit Queue-Tiefe; veraltete Architektur-MDs mit „15“ → AUT-362 / AUT-354).

3. TCP/MQTT-Stack kann nicht mehr schreiben → errno=11 (EAGAIN: keine freien Ressourcen im TCP-Stack)

4. Circuit Breaker MQTT erreicht Failure Threshold → OPEN

5. Broker sieht Keepalive-Ausfall → "exceeded timeout" → LWT

6. Server empfängt LWT → offline-Outcome in command_outcomes (14× in 6h)

---

## Abgrenzung zu bestehenden Issues

- **AUT-326** (P0/KRITISCH, OUTBOX Exhaustion, In Progress): Deckt OUTBOX-Crash-Pfad ab.
  Dieses Finding ist spezifisch auf COMM-Queue-Pressure unter Aktor-Burst (kein Crash, keine NULL-Deref).
- **AUT-303** (Busy-Flag ESP-seitig, In Review): Deckt On-Demand-Mess-Burst ab.
  Dieses Finding ist Aktor-Command-Burst (nicht Sensor-Mess-Trigger).
- **AUT-55** (Outbox-Kapazität, Done): Allgemeines Backpressure-Konzept implementiert.

**Eigenständige Dimension:** Aktor-spezifische Publish-Burst-Kausalität unter schnellem Schalten.

---

## Kanonische Codepfade

- `El Trabajante/src/tasks/publish_queue.*` — Queue-Tiefe, Drop-Semantik
- `El Trabajante/src/services/communication/mqtt_client.cpp` — safePublish, Circuit Breaker
- `El Trabajante/src/error_handling/circuit_breaker.*` — OPEN/HALF_OPEN/CLOSED
- Server: `El Servador/god_kaiser_server/src/mqtt/handlers/queue_pressure_handler.py`

---

## Offene Fragen (TM-Entscheidungs-Block)

1. ~~Die Analyse zeigt `fill=6..8` für die Queue, die Architektur-Doku nennt g_publish_queue Tiefe=15.~~ **Beantwortet (AUT-362, 2026-05-12):** Es gibt eine einzige `g_publish_queue`; kanonische Tiefe ist **8** (`PUBLISH_QUEUE_SIZE` in `publish_queue.h`). „15“ war historische Dimensionierung (AUT-344); alte Planungs-MDs waren veraltet.
2. Sind safePublish-Retries Teil des Problem-Pfads oder ein Schutz-Mechanismus?
3. Sollen nicht-kritische Publishes (sensor/data) unter Aktor-Burst aktiv zurückgestellt werden (Koaleszenz)?
