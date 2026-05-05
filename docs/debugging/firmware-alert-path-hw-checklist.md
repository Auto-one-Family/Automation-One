# Firmware: Alert- / Error-Pfad — Hardware-Checkliste (PKG-05)

**Zweck:** Abnahme-Hinweise für Änderungen an **Error-/MQTT-Alert-Pfaden** auf dem ESP32. **Kein** Ersatz für Code-Review oder Server-Contract-Tests.

**Referenz:** `El Trabajante/src/error_handling/error_tracker.cpp`, MQTT-Publish-Pfade, NVS-Outbox bei Intent-Outcomes.

## Vor dem Merge (safety-relevante Änderungen)

1. **Build:** `pio run -e esp32_dev` (ESP32 DevKit / WROOM-32; Seeed XIAO: `seeed_xiao_esp32c3`) — Exit-Code 0. Env-Name `seeed` existiert in `platformio.ini` nicht.
2. **Wokwi / CI:** Regression sinnvoll für Logik ohne I/O; **nicht** ausreichend für finale Abnahme, wenn GPIO, Watchdog, NVS oder Timing betroffen sind.
3. **Hardware (Referenz-ESP):**
   - Kaltstart und MQTT-Reconnect: mindestens ein Zyklus mit realem Broker.
   - Bewusst fehlerhafte Payload / disconnect: prüfen, ob erwartete Logs und Server-Seite keine unbehandelten Exceptions zeigen.
4. **Kein Arduino `String` neu einführen** — Projektregel; Refactors am Error-Pfad nur mit Heap-/Fragmentierungs-Risiko-Abschätzung.

## Nicht-Ziele

- Keine „verifiziert auf Hardware“-Behauptung nur aus Simulation oder Agenten-Text ohne Lauf auf Referenz-Hardware.
