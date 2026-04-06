# Paket 02: ESP32 Core-Interaktionsbild und Queue-Disziplin (P1.2)

> **Stand:** 2026-04-05  
> **Status:** Abgestimmt mit Firmware `El Trabajante/src` (Intent/Admission-Pfad)

## 1) Core-Rollenmodell (IST aus Code)

### Core 0 - Communication Owner
- `communicationTask` (Priority 3, pinned Core 0): `wifiManager.loop()`, `mqttClient.loop()`, `checkRegistrationTimeout()`, `processPublishQueue()`, Provisioning-Fallback, Debounce/Persistent-Failure Timer.
- ESP-IDF MQTT Event Task (ebenfalls Core 0-nah): `MQTT_EVENT_CONNECTED`, `MQTT_EVENT_DISCONNECTED`, `MQTT_EVENT_DATA`.
- Hauptverantwortung: Netzwerk-I/O, Topic-Entry-Point, Core0->Core1 Weiterleitung.

### Core 1 - Safety Owner
- `safetyTask` (Priority 5, pinned Core 1): Sensor/Aktor-Loops, ACK-timeout check, command/config queue drain, P4 delay + rule evaluation.
- Hauptverantwortung: hardware-nahe Ausfuehrung, sichere Aktorik, Offline-Regelbetrieb.

### Shared
- Atomics: `g_mqtt_connected`, `g_last_server_ack_ms`, `g_server_timeout_triggered`.
- Queues: actuator/sensor/config/publish.
- Intent/Admission: `command_admission` (Vor-Enqueue Core0), `intent_contract` (TTL/Epoch auf Core1, Outcomes).
- Notify-Bits: `NOTIFY_EMERGENCY_STOP`, `NOTIFY_MQTT_DISCONNECTED`, `NOTIFY_SUBZONE_SAFE`.

---

## 2) Interaktionsbild (Core0/Core1)

```text
MQTT_EVENT_DATA (Core0)
  -> routeIncomingMessage()
     -> config            -> command_admission -> g_config_update_queue  ----\
     -> actuator command  -> command_admission -> g_actuator_cmd_queue    ---+--> SafetyTask (Core1)
     -> sensor command    -> command_admission -> g_sensor_cmd_queue      --/
     -> emergency         -> xTaskNotify(NOTIFY_EMERGENCY_STOP)
     -> heartbeat/server  -> atomics + OfflineMode hooks

SafetyTask (Core1)
  -> performAllMeasurements()
  -> processActuatorLoops()
  -> checkServerAckTimeout()
  -> process*Queue()  (Intent TTL/Epoch + Admission erneut, Outcomes bei reject/skip)
  -> offlineModeManager.checkDelayTimer/evaluateOfflineRules()
  -> mqttClient.publish(...) on Core1
        -> g_publish_queue -> CommunicationTask.processPublishQueue() -> Broker I/O (Core0)
```

---

## 3) Ownership-Grenzen (MUSS-Regeln)

| Bereich | Primaerer Owner | Erlaubte Uebergabe | Kritischer Verbotspfad |
|---|---|---|---|
| WiFi connect/reconnect/status | Core0 | direkt in `communicationTask` | Core1 initiiert selbst WiFi-Reconnect |
| MQTT event handling/publish I/O | Core0 | `routeIncomingMessage`, `g_publish_queue` | Core1 macht langes direktes Netz-I/O |
| Sensor loop + sensor command execute | Core1 | `g_sensor_cmd_queue` | Core0 mutiert Sensor-Owner-Daten direkt |
| Actuator loop + command execute | Core1 | `g_actuator_cmd_queue`, emergency notify | Core0 steuert Aktor-Driver direkt |
| Config apply (sensor/actuator/offline rules) | Core1 | `g_config_update_queue` | Core0 ruft Config-Handler direkt auf |
| Emergency stop execution | Core1 | `xTaskNotify` (trigger Core0) | unsynchroner bypass an SafetyController |

---

## 4) Queue-Disziplin und Risiko

| Queue | Richtung | Producer | Consumer | Blocking-Verhalten | Risiko bei Vollstand |
|---|---|---|---|---|---|
| `g_actuator_cmd_queue` | Core0 -> Core1 | `routeIncomingMessage` | `safetyTask` | non-blocking; Recovery-Intent: bis 20ms fuer `SendToFront` | command drop + Intent-Outcome `QUEUE_FULL` (Core0) |
| `g_sensor_cmd_queue` | Core0 -> Core1 | `routeIncomingMessage` | `safetyTask` | wie Actuator-Queue | wie oben |
| `g_config_update_queue` | Core0 -> Core1 | `routeIncomingMessage` | `safetyTask` | bis 100ms blockierend | timeout/drop; Core0 kann `config_response`+Intent-Outcome feuern |
| `g_publish_queue` | Core1 -> Core0 | `mqttClient.publish` (Core1 branch) | `communicationTask` | non-blocking | publish drop + CB failure |

Queue-Invarianten:
1. Owner-Strukturen (`sensors_[]`, `actuators_[]`) werden nur auf Core1 mutiert.
2. Netz-I/O bleibt auf Core0, auch wenn ESP-IDF thread-safe APIs bietet.
3. Emergency bleibt Notify-Pfad, nicht Queue-Pfad.
4. Queue-Create-Reihenfolge vor Task-Start ist zwingend.

---

## 5) Kritische Interlocks (Block C)

### I1 - ACK vs Disconnect/Reconnect
- Disconnect: `g_mqtt_connected=false`, P4 `onDisconnect()`, optional Safety notify.
- Connect: ACK timestamp wird frueh atomar resetet (Race-Fix).
- Reconnect beendet Offline nicht; nur ACK (`onServerAckReceived`) beendet P4 sicher.

### I2 - Config Apply vs laufende Safety-Loops
- Config kommt auf Core0 an, wird aber erst auf Core1 geparsed/applied.
- Verhindert klassische Cross-Core Data-Races.
- Restluecke: parse failure erzeugt nicht immer negatives `config_response`.

### I3 - ACK Timeout vs MQTT Connected Flag
- Timeout-Pruefung auf Core1 liest atomics aus Core0-Pfaden.
- Guard: nur wenn `mqttClient.isConnected()` und ACK-Timestamp gesetzt.
- Risiko: Randfenster minimiert, aber Clock/Timing-Stoerungen bleiben als Rest-Risiko.

### I4 - Offline Rule vs Server Command
- In `OFFLINE_ACTIVE`: command setzt `server_override` pro Aktor.
- Damit kein direktes Rule/Server-Gegenspiel im gleichen Zyklus.
- Offene Frage: exakte Override-Lebensdauer bei Flap-Szenarien.

### I5 - Emergency Notify vs Queue Backlog
- Emergency hat Vorrang durch Notify-Handling zu Zyklusbeginn.
- Bereits gequeue-te Commands bleiben moeglich und muessen robust abgefangen werden.

---

## 6) Degradation-Hotspots (Core-Interaktion)

1. **Teilweise beobachtbare Drops**
   - actuator/sensor queue full: Log + ErrorTracker + Intent-Outcome; publish queue weiterhin still bis auf Logs/CB.
2. **Config Negative-ACK Luecke**
   - Bei parse fail in `processConfigUpdateQueue()` keine durchgaengige Fehlerantwort.
3. **Legacy-Single-Thread-Modus**
   - Wenn Tasks nicht erstellt wurden, entfaellt die Core-Isolation.
4. **Portal-Umschaltung bei Netzflattern**
   - Debounce (30s) und persistent failure (5min) koennen je nach Netzqualitaet aggressiv wirken.
5. **Dual Signal Reset (server/status + heartbeat ack)**
   - Beide resetten ACK-bezogene States; robust, aber potenziell uneindeutig bei inkonsistenten Payloads.

---

## 7) Regeln fuer Folgepakete

### P1.3 Sensorhandling
- Sensorbefehle nur ueber `g_sensor_cmd_queue`.
- Queue-Latenz und drop-rate im Safety-Zyklus quantifizieren.

### P1.5 Safety
- Emergency Notify bleibt priorisiert vor Queue-Drain.
- Offline-Evaluator darf keine Core0-Netzpfade erzwingen.

### P1.6 Netzwerk
- Reconnect/Portal-Policy bleibt Core0-only.
- ACK/Registration atomics bleiben zentrale Cross-Core Vertrauensanker.

---

## 8) Kurzfazit

Die Firmware ist klar dual-core segmentiert:
- Core0 fuer Kommunikation,
- Core1 fuer Safety/Hardware,
- Queues + atomics als definierte Uebergabeschicht.

Die kritischsten Restpunkte liegen in Drop-Transparenz, Config-Fehlerantworten und Verhalten im Legacy-No-Task-Pfad.

