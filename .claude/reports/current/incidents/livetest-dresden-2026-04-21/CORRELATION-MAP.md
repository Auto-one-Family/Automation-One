# CORRELATION-MAP — Live-Hartetest Dresden 2026-04-21

> Clustering nach: esp_id + Zeitfenster → MQTT-Schicht → Server-Schicht → Frontend-Schicht

---

## Cluster 1: Fokusbereich A — Sensor-Latenz (GRUEN)

```
ESP_EA5484 (Firmware)          MQTT Broker            Server god_kaiser        Frontend
─────────────────────────────────────────────────────────────────────────────────────────
07:30:38Z
sensor_read (GPIO4/0/32/33)
  ↓ ~0ms (sync)
mqtt_publish(sensor/data)
  QoS 1
  ↓ <100ms
                      mqtt-broker receive          
                      → god_kaiser subscribed       
                                                   sensor_handler.py          
                                                   pi_enhanced processing      
                                                   DB INSERT sensor_data      
                                                   <1s Gesamt-Latenz           
                                                   WS broadcast               
                                                                              applyDevicePatch()
                                                                              Vue Reactivity
                                                                              UI Update
                                                                              <50ms
──────────────────────────────────────────────────────────────────────────────────────────
ERGEBNIS: E2E-Latenz <2s SOLL erfüllt.
Heartbeat-Diskrepanz: Firmware 60s, Issue-SOLL 30s — Klärung nötig (A1).
```

---

## Cluster 2: Fokusbereich B — Aktor-Antwortzeit (NICHT GEMESSEN)

```
Frontend                       Server                  MQTT              ESP32
─────────────────────────────────────────────────────────────────────────────
[User klickt Actuator]
useActuatorCommand.ts
correlation_id generiert
WS send command
                               WS-Handler
                               Logic-Engine-Check
                               publish(actuator/GPIO/command, QoS 2)
                                                     ↓ Broker-Downgrade
                                                     Delivery: QoS 1 (!)
                                                     → ESP empfängt
                                                                         gpio_set()
                                                                         publishActuatorResponse()
                                                     ← QoS 1
                               actuator_handler.py
                               DB persist
                               WS broadcast actuator_response
[correlation_id match]
Toast SUCCESS
─────────────────────────────────────────────────────────────────────────────
PROBLEM: QoS-Downgrade auf Broker-Ebene (Subscribe QoS 1 statt SOLL QoS 2)
         Evidenz: Broker-Log 18:05:55Z
NICHT GEMESSEN: Kein Toggle im Lauf-1-Fenster — 29x persist_noop_skip
GAP: WS-Trennung während Bestätigung → false Timeout nach 30s
```

---

## Cluster 3: Fokusbereich C — LWT & Reconnect (GELB)

```
Zeitachse:    07:30:37Z           07:30:38Z           07:31:38Z
──────────────────────────────────────────────────────────────────
Server-Poller: [offline check]                        [reconnect eval]
               offline_seconds=60.9                   state_adoption(0)
               
mqtt-logger:                     heartbeat seq=335    heartbeat seq=350
                                 epoch=0→1           epoch=0→2
                                 
mqtt-broker:                     [KEIN DISCONNECT]    [KEIN DISCONNECT]

LWT-Topic:                       [NICHT ausgelöst]
──────────────────────────────────────────────────────────────────
BEFUND: Kein echter MQTT-Disconnect.
        Server-Offline = False-Positive des 60s-Pollers (knappes Timing).
        LWT-Handler im Server: NICHT direkt nachweisbar aktiv.

SOLL-Verhalten bei echtem Disconnect:
  Broker: LWT publish auf system/will (sofort)
  Server: lwt_handler.py → online_status=offline (sofort)
  Server: Failsafe → Heizung/Pumpe OFF (sofort)
  Frontend: source='lwt' → Device offline → Actuator-Reset → Toast

IST-Verhalten (nachgewiesen):
  Server: Poller erkennt nach 60s → state_adoption
  lwt_handler: Nicht im Log sichtbar → Subscription oder Handler unklar
```

---

## Cluster 4: Disconnect-Event 07:30-07:31 (False-Positive)

```
Zeitpunkt    | mqtt-broker        | mqtt-logger         | god_kaiser-Server
─────────────|────────────────────|─────────────────────|──────────────────
07:30:36Z    | [healthcheck only] | actuator_status     | actuator_handler OK
07:30:37Z    | [healthcheck only] |                     | POLLER: offline!
07:30:38Z    | [healthcheck only] | heartbeat seq=335   | heartbeat ACK (epoch→1)
07:31:25Z    | [healthcheck only] |                     | health_check: 1 online
07:31:38Z    | [healthcheck only] | heartbeat seq=350   | state_adoption (60.9s)
             |                    | handover epoch=2    | config push pending
─────────────|────────────────────|─────────────────────|──────────────────
Root Cause: Poller-Interval traf ~1s VOR Heartbeat-Eingang.
            KEIN echter Verbindungsverlust.
```

---

## Cluster 5: Retained-Message-Anomalien (GELB/Cleanup)

```
Retained Topics (ESP_00000001):
  kaiser/god/esp/ESP_00000001/zone/ack          → SOLL: retain=false
  kaiser/god/esp/ESP_00000001/subzone/ack       → SOLL: retain=false
  kaiser/god/esp/ESP_00000001/onewire/scan_result → nicht in MQTT_TOPICS.md
  kaiser/god/esp/ESP_00000001/system/command/response → nicht in MQTT_TOPICS.md

Auswirkung: Neue ESP-Clients erhalten veraltete Messages bei Subscribe.
Ursache: Noch zu ermitteln (Server publiziert mit retain=true? ESP?)
```

---

## Cluster 6: QoS-Mismatch (GELB/Sicherheit)

```
Topic                           SOLL-QoS  IST-QoS  Protokoll-Effekt
────────────────────────────────────────────────────────────────────
actuator/+/command              QoS 2     QoS 1    Exactly-Once→At-Least-Once
config                          QoS 2     QoS 1    Exactly-Once→At-Least-Once
broadcast/emergency             QoS 2     QoS 1    Exactly-Once→At-Least-Once
system/command                  QoS 2     QoS 1    Exactly-Once→At-Least-Once
sensor/+/command                QoS 2     QoS 1    Exactly-Once→At-Least-Once

Evidenz: Broker-Log 2026-04-20T18:05:55Z
  "ESP_EA5484 1 kaiser/god/esp/ESP_EA5484/actuator/+/command"
         ↑ Subscribe-QoS=1

Server publiziert mit QoS 2. Broker-Downgrade auf min(pub_qos, sub_qos) = QoS 1.
```

---

## Offene Korrelationen (für Lauf-3+)

| ID | Symptom | Schichten | Status |
|----|---------|-----------|--------|
| COR-01 | lwt_handler Aktivität | Server ↔ MQTT | Unbestätigt — Handler-Code prüfen |
| COR-02 | intent_outcome ohne flow (seq=489) | ESP32 ↔ Server | Firmware-Protokollfehler |
| COR-03 | QoS-Mismatch Actuator-Commands | ESP32 ↔ MQTT | Firmware-Fix erforderlich |
| COR-04 | Poller False-Positive Timing | Server | Dokumentation/Jitter-Analyse |
| COR-05 | Retained-Messages Quelle | Server/ESP32 ↔ MQTT | Ursache unklar |
