# BELEG F5 — Firmware: Circuit Breaker blockiert Recovery nach errno=11

**Run-ID:** run-queue-pressure-2026-05-11
**Datum:** 2026-05-11
**Finding-ID:** F5-CIRCUIT-BREAKER-RECOVERY
**Kategorie:** error
**Schicht:** Firmware (El Trabajante)

---

## Symptom

```
TRANSPORT_BASE: tcp_write error, errno=No more processes
MQTT_CLIENT: Writing failed: errno=11
managed reconnect request failed: ESP_FAIL
CircuitBreaker [MQTT]: Failure threshold reached → OPEN
```

Nach errno=11 öffnet der Circuit Breaker. Danach:
- Alle weiteren Publish-Versuche werden sofort geblockt (Circuit Breaker OPEN)
- Der ESP kann keinen Reconnect-Heartbeat publizieren (auch kritische Publishes via safePublish blockiert?)
- Broker-Timeout verlängert sich, weil ESP keine Keepalive/Heartbeat mehr senden kann
- Server sieht `flapping=True` (mehrfach im Docker-Log belegt)

**Mosquitto-Beleg:**
```
2026-05-11T15:02:55Z: Client ESP_EA5484 [192.168.0.161:54675] disconnected: exceeded timeout
```

**Server-Beleg:**
```
ESP ESP_EA5484 disconnected unexpectedly (flapping=True)  -- mehrfach
Device ESP_EA5484 timed out
```

---

## Kausalkette

1. Queue-Druck → errno=11 (TCP EAGAIN) → MQTT Write Fail
2. Circuit Breaker MQTT zählt Failure → Threshold → OPEN
3. Im OPEN-Zustand: alle Publishes geblockt, inkl. Heartbeat-QoS-0-Publish
4. ESP sendet keinen Keepalive mehr → Broker-Timeout (exceeded timeout)
5. LWT ausgelöst → Server offline-Erkennung → flapping=True
6. Flapping-Erkennung verhindert evtl. schnelle Reregistrierung

---

## Kanonische Codepfade

- `El Trabajante/src/error_handling/circuit_breaker.*` — OPEN/HALF_OPEN/CLOSED-Logik
- `El Trabajante/src/services/communication/mqtt_client.*` — safePublish, Heartbeat-Publish
- `El Trabajante/src/tasks/communication_task.*` — Publish-Queue-Drain (Core 0)

---

## Offene Fragen (TM-Entscheidungs-Block)

1. Schließt der Circuit Breaker den Heartbeat-Publish ein? Oder hat Heartbeat eine
   Ausnahme-Spur (direkt via esp_mqtt_client, nicht über g_publish_queue)?
   -> Entscheidend ob CB-OPEN Keepalive unterbricht.
2. Wann öffnet der CB wieder (HALF_OPEN)? Nach welchem Timeout/Zähler?
3. Soll Heartbeat/Keepalive explizit vom Circuit Breaker ausgenommen werden?
   Das würde den Broker-Timeout-Pfad durchbrechen, hat aber Risiken (CB verliert Schutzfunktion).

---

## Abgrenzung zu bestehenden Issues

- **AUT-326** (OUTBOX Exhaustion, P0): Behandelt Crash durch NULL-Pointer-Deref.
  Dieses Finding ist der CB-Recovery-Blockade-Pfad NACH dem ersten errno=11 (kein Crash).
- **AUT-57** (SafePublish Retry-Strategie, Done): Betrifft Retry-Logik bei Flap.
  Dieses Finding betrifft CB-OPEN-Phase (Retries gar nicht erst versucht).

Eigenständige Dimension: Circuit-Breaker-Semantik für Heartbeat unter Queue-Druck.
