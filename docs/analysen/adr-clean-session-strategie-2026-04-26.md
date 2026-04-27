# ADR — MQTT clean_session Strategie

**Datum:** 2026-04-26
**Status:** AKZEPTIERT (dokumentiert bestehende Praxis)
**Kontext:** AUT-189 MQTT-03 Verifikation
**Entscheider:** TM (Empfehlung) → Robin (finaler Entscheid)

---

## Kontext

Die ESP32-Firmware (ESP-IDF MQTT-Client) setzt beim Verbindungsaufbau:

```cpp
// El Trabajante/src/services/communication/mqtt_client.cpp:335
esp_mqtt_client_config_t mqtt_cfg = {};
mqtt_cfg.disable_clean_session = 0;   // clean_session = true
```

`disable_clean_session = 0` bedeutet: Das Disable-Flag ist inaktiv → **clean_session ist aktiv (true)**.

Konsequenz: Bei jedem MQTT-Disconnect löscht der Mosquitto-Broker die ESP-Session vollständig — inklusive aller ausstehenden QoS-1/QoS-2-Nachrichten in der Server→ESP-Richtung.

Diese Einstellung wurde nie dokumentiert und war bisher ein undokumentierter Legacy-Default aus der initialen ESP-IDF-Konfiguration.

---

## Problem

Config-Pushs an ESP32 werden mit QoS 2 versendet:

```
Actuator command: QoS 2
Config-Push:      QoS 2
Emergency stop:   QoS 2
```

Bei `clean_session=true` gilt: Wenn die Verbindung zwischen Server→ESP zum Zeitpunkt des Publishs unterbrochen ist oder kurz danach abbricht, löscht der Broker die unzugestellte Nachricht zusammen mit der Session. De-facto wird QoS 2 bei Disconnect zu QoS 0 degradiert.

---

## Entscheidung

**`clean_session=true` (Status quo) wird beibehalten.**

---

## Begründung

Fünf aktive Kompensationsmechanismen decken das Verlust-Risiko hinreichend ab:

| # | Mechanismus | Maximale Lücke |
|---|-------------|---------------|
| 1 | **Heartbeat-State-Push** — Server sendet vollständigen Config-State mit jedem Heartbeat-ACK (Cooldown ~120 s). Stärkster Kompensator. | ~120 s |
| 2 | **Config-Push-Cooldown** — CRUD-Ops triggern Config-Push; bei Reconnect innerhalb des Cooldown wird ein weiterer Push ausgelöst. | Abhängig von Reconnect-Zeitpunkt |
| 3 | **MQTTCommandBridge ACK-Wait** — Wartet `DEFAULT_TIMEOUT=15 s` auf ACK; bei Timeout wird der Caller informiert. | Sofort erkennbar |
| 4 | **`actuator_states`-DB-Tabelle** — Persistierter letzter Zustand; nach ESP-Reconnect kann Server fehlende State adoptieren. | Unlimitiert (persistiert) |
| 5 | **WS-Broadcast nach Reconnect** — Dashboard erhält Status-Update, Operator sieht Divergenzen. | ~60 s bis nächster Heartbeat |

---

## Abgewogene Alternative: `clean_session=false`

| Aspekt | Vorteil | Nachteil |
|--------|---------|---------|
| QoS-2-Garantie | Broker hält ausstehende Nachrichten vor, auch nach Disconnect | Broker benötigt persistente Session-Storage pro ESP |
| Session-Bloat | — | Bei vielen ESPs oder häufigen Reconnects wächst Broker-Memory/Disk |
| Reconnect-Semantik | ESP erhält verpasste Nachrichten nach Reconnect | Race-Condition möglich: ESP empfängt veraltete Commands aus verlängerten Offline-Phasen |
| Mosquitto-Konfiguration | Kein Änderungsaufwand Server-seitig | `persistent_client_expiration` in `mosquitto.conf` muss gesetzt werden (sonst Sessions nie expired) |
| Testaufwand | — | Reconnect-Szenarien müssen neu verifiziert werden (AUT-54/AUT-69 betroffen) |

Das Hauptrisiko von `clean_session=false` in AutomationOne: Ein ESP der mehrere Stunden offline war würde bei Reconnect alle gepufferten Config-Pushs und Commands auf einmal empfangen — potenziell veraltete Aktor-Befehle. Die 5 Kompensationsmechanismen (insbesondere Heartbeat-State-Push) lösen dieses Problem eleganter, weil der Server den aktuellen Zustand aktiv pusht statt veraltete Nachrichten nachzuliefern.

---

## Konsequenzen

1. **QoS-2 = QoS-0 bei Disconnect** bleibt die operative Realität. Dies ist akzeptiert.
2. **Heartbeat-Cooldown ~120 s** ist die maximale theoretische Divergenz. In der Praxis kürzer wegen CRUD-getriggerter Push-Events.
3. **Monitoring:** Wenn Heartbeat-Ausfall länger als 120 s unbemerkt bleibt, ist die Kompensation unterbrochen. AUT-133 (Heartbeat Metrics Utilization) adressiert diese Lücke.
4. **Überprüfung empfohlen** wenn: >50 ESPs gleichzeitig aktiv (Session-Bloat wird dann relevant) oder QoS-2-Verluste durch Telemetrie messbar werden.

---

## Verweise

- Code: `El Trabajante/src/services/communication/mqtt_client.cpp:335`
- Commit: `5c34c3f60e3882c39a3da4b1a5fbc3a1b2431f38` (Fri Apr 24 02:05:50 2026 +0200)
- Verifikations-Bericht: `.claude/auftraege/verifikation-2026-04-26-hub-audit/bericht-AUT-189-mqtt-01-02-03-04-2026-04-26.md`
- Mosquitto-Config (verifiziert AUT-175 E5): `max_keepalive=300 s`, `max_inflight_messages=10`, `max_packet_size=256 KB`
- QoS-Regeln (kanonisch): `reference/api/MQTT_TOPICS.md`
