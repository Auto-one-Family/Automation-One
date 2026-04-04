# Paket 02: ESP32 Runtime-Lifecycle und State-Model (P1.2)

## 1) Ziel, Scope, Quellen

Ziel ist ein belastbares Runtime-Lifecycle-Modell fuer `El Trabajante` von Boot bis Degraded/Recovery, mit klaren Zustands- und Triggerdefinitionen fuer Folgepakete P1.3, P1.5 und P1.6.

Pflicht-Input (P1.1):
- `architektur-autoone/esp32/paket-01-esp32-modul-inventar.md`
- `architektur-autoone/esp32/paket-01-esp32-abhaengigkeitskarte.md`
- `architektur-autoone/esp32/paket-01-esp32-contract-seedlist.md`

Codebasis (read-only analysiert):
- `El Trabajante/src/main.cpp`
- `El Trabajante/src/tasks/communication_task.*`
- `El Trabajante/src/tasks/safety_task.*`
- `El Trabajante/src/tasks/config_update_queue.*`
- `El Trabajante/src/tasks/actuator_command_queue.*`
- `El Trabajante/src/tasks/sensor_command_queue.*`
- `El Trabajante/src/tasks/publish_queue.*`
- `El Trabajante/src/services/communication/mqtt_client.*`
- `El Trabajante/src/services/communication/wifi_manager.*`
- `El Trabajante/src/services/safety/offline_mode_manager.*`
- Referenztypen: `El Trabajante/src/models/system_types.h`

## 2) Modellrahmen (3 ueberlagerte Ebenen)

1. **Persistierter SystemState (Shared)**
   - `STATE_*` aus `SystemState` (`STATE_BOOT`, `STATE_PENDING_APPROVAL`, `STATE_OPERATIONAL`, `STATE_SAFE_MODE_PROVISIONING`, `STATE_ERROR`).
2. **Connectivity Lifecycle (Core 0 + MQTT Event Task)**
   - WiFi/MQTT connect-disconnect, Registration-Gate, Portal-Fallback.
3. **Safety Overlay (Core 1 + Shared Hooks)**
   - ACK-timeout, Offline Grace/Rules, Emergency, Safe-State.

Wichtig: `STATE_OPERATIONAL` kann parallel mit `OfflineMode::OFFLINE_ACTIVE` auftreten. Das ist ein gueltiger Parallelzustand, kein Widerspruch.

---

## 3) Block A - Vollstaendiges State-Inventar

| State-ID | Name | Owner-Kontext | Entry | Exit | Zulaessige Trigger | Safety-Relevanz | Beteiligte Module |
|---|---|---|---|---|---|---|---|
| FW-STATE-001 | BOOT_STARTUP_SEQUENCE | Shared | `setup()` startet | Basis-Init und Config geladen | Boot, Persistenz-Read | kritisch | `main.cpp`, `config_manager`, `storage_manager` |
| FW-STATE-002 | BOOT_SAFE_GPIO | Shared | `initializeAllPinsToSafeMode()` | Safe-GPIO gesetzt | Boot, GPIO init ok/fail | kritisch | `main.cpp`, `gpio_manager` |
| FW-STATE-003 | BOOT_SAFE_MODE_LATCHED | Shared | Bootloop (`boot_count > 5` und `<60s`) | kein normaler Exit | Bootloop-Detektion | kritisch | `main.cpp` |
| FW-STATE-004 | PROVISIONING_REQUIRED | Shared | fehlende WiFi-Config oder Setup-Failure | AP/Portal aktiv oder Normalflow | provisioning_needed, WiFi fail, MQTT fail | hoch | `main.cpp`, `provision_manager` |
| FW-STATE-005 | SAFE_MODE_PROVISIONING_ACTIVE | Core0 + Shared | `STATE_SAFE_MODE_PROVISIONING` gesetzt | Config empfangen+Reboot oder Reconnect+Registration | portal submit, reconnect success | hoch | `main.cpp`, `communication_task.cpp`, `provision_manager` |
| FW-STATE-006 | WIFI_CONNECTING | Core0 | `wifiManager.connect()` | `WL_CONNECTED` oder Timeout/Fail | WiFi attempt/timeout | hoch | `wifi_manager.cpp` |
| FW-STATE-007 | WIFI_CONNECTED | Core0 | WiFi connect success | WiFi disconnect | WiFi link down, reconnect | mittel | `wifi_manager.cpp`, `communication_task.cpp` |
| FW-STATE-008 | MQTT_CONNECTING_ASYNC | Core0 (Event-driven) | `mqttClient.connect()` (ESP-IDF non-blocking) | `MQTT_EVENT_CONNECTED` oder persistenter Failure-Fallback | MQTT event connect/error | hoch | `mqtt_client.cpp`, `communication_task.cpp` |
| FW-STATE-009 | MQTT_CONNECTED_REGISTRATION_GATE | Core0 + Shared | `MQTT_EVENT_CONNECTED`, Gate geschlossen | ACK bestaetigt oder Gate timeout | heartbeat ack, registration timeout | hoch | `mqtt_client.cpp`, `main.cpp` |
| FW-STATE-010 | PENDING_APPROVAL_LIMITED | Shared (operativ Core0) | ACK status `pending_approval` oder device nicht approved | ACK approved/online oder rejected | heartbeat ack status | mittel | `main.cpp`, `communication_task.cpp` |
| FW-STATE-011 | OPERATIONAL_ONLINE | Shared (Core0+Core1) | approved + online | Disconnect/ACK-timeout/Error/Emergency | command/config/heartbeat/offline notify | kritisch | `main.cpp`, `communication_task.cpp`, `safety_task.cpp` |
| FW-STATE-012 | CONFIG_UPDATE_PENDING_CORE1 | Shared Queue | Config Topic empfangen und enqueued | Parse+Apply oder Parse-Fail/Drop | config queue receive | kritisch | `config_update_queue.cpp`, `safety_task.cpp` |
| FW-STATE-013 | COMMAND_PENDING_CORE1 | Shared Queue | Sensor/Aktor command enqueued | Queue drain auf Core1 | command queue receive | hoch | `actuator_command_queue.cpp`, `sensor_command_queue.cpp`, `safety_task.cpp` |
| FW-STATE-014 | OFFLINE_DISCONNECTED_GRACE | Shared (State in P4, Evaluation Core1) | `offlineModeManager.onDisconnect()` | reconnect/ACK oder delay->offline | disconnect, server ack, delay timer | kritisch | `offline_mode_manager.cpp`, `main.cpp`, `mqtt_client.cpp` |
| FW-STATE-015 | OFFLINE_ACTIVE_LOCAL_RULES | Core1 | `activateOfflineMode()` nach 30s Grace | reconnect+ACK oder emergency reset | eval tick 5s, override, ack | kritisch | `offline_mode_manager.cpp`, `safety_task.cpp`, `actuator_manager.cpp` |
| FW-STATE-016 | OFFLINE_RECONNECTING_WAIT_ACK | Shared | reconnect waehrend `OFFLINE_ACTIVE` | server ACK -> ONLINE | onReconnect, onServerAckReceived | kritisch | `offline_mode_manager.cpp`, `main.cpp` |
| FW-STATE-017 | EMERGENCY_ACTIVE | Core1 | emergency notify/command | clear emergency + verify + resume | NOTIFY_EMERGENCY_STOP, clear_emergency | kritisch | `safety_task.cpp`, `safety_controller.cpp`, `main.cpp` |
| FW-STATE-018 | SYSTEM_ERROR_LATCHED | Shared | ACK status `rejected` oder `STATE_ERROR` | kein auto recovery | rejected, critical watchdog gating | kritisch | `main.cpp`, `error_tracker` |
| FW-STATE-019 | LEGACY_SINGLE_THREAD_RUNTIME | Shared | setup endet vor Task-Erstellung | Tasks erstellt (normalerweise nein in diesem Pfad) oder reboot | provisioning loop, reconnect loop | hoch | `main.cpp` (legacy loop path) |

Hinweis: FW-STATE-019 ist ein impliziter Laufzeitmodus, nicht eigener `SystemState` Enum-Wert.

---

## 4) Block B/D - Uebergangslogik und Degraded/Recovery

### 4.1 Normalpfad
- `FW-STATE-001` -> `FW-STATE-002` -> (`FW-STATE-004` oder `FW-STATE-006`)
- `FW-STATE-006` -> `FW-STATE-007` -> `FW-STATE-008` -> `FW-STATE-009`
- `FW-STATE-009` + ACK `approved/online` -> `FW-STATE-011`

### 4.2 Approval-/Registration-Pfad
- ACK `pending_approval` fuehrt in `FW-STATE-010`.
- ACK `approved/online` wechselt `FW-STATE-010` -> `FW-STATE-011`.
- ACK `rejected` latches `FW-STATE-018`.
- Registration-Gate kann per Timeout oeffnen, auch ohne fruehes ACK.

### 4.3 Offline/Safety-Pfad
- Disconnect (MQTT, Server-LWT offline, ACK-timeout) startet immer `FW-STATE-014`.
- Wenn offline rules vorhanden: nach 30s Grace `FW-STATE-015`.
- Wenn keine rules vorhanden: sofortiger Safe-State fuer Aktoren (zusetzlich zu P4-Statewechsel).
- Reconnect allein fuehrt maximal in `FW-STATE-016`; erst ACK beendet Offline sicher.

### 4.4 Provisioning-/Recovery-Pfad
- WiFi/MQTT-Fail, 30s Disconnect-Debounce oder 5min MQTT persistent failure -> `FW-STATE-005`.
- Bei gueltiger Portal-Konfig: Reboot -> zurück in Boot-Pfad.
- Bei reconnect + registration confirmed: `FW-STATE-005` -> `FW-STATE-011`.

### 4.5 Queue-/Config-Pfad
- Config Topic -> `FW-STATE-012` (Core0->Core1 queue).
- Sensor/Aktor command -> `FW-STATE-013`.
- Parse-Fail in Config-Queue fuehrt zu Drop ohne zwingenden negativen `config_response` (bekannte Luecke).

---

## 5) Kritische Interlocks und Race-Risiken

1. **ACK vs Reconnect Timing**
   - Gehaertet durch atomisches `g_last_server_ack_ms` Reset in `MQTT_EVENT_CONNECTED` und im connect-callback.
2. **Config Apply vs Sensor/Aktor Loops**
   - Durch `config_update_queue` serialisiert; direkte Core0-Mutationen an Owner-Strukturen werden vermieden.
3. **Offline Rules vs Server Commands**
   - `setServerOverride(gpio)` verhindert direktes Gegeneinander lokaler Rule und Servercommand.
4. **Emergency Notify vs Queue-Backlog**
   - Emergency laeuft als Notify-Pfad mit Prioritaet; Queue-Commands koennen danach noch anstehen.
5. **Queue Overflow / Drop-Visibility**
   - command/publish queue non-blocking; bei Vollstand droppen Nachrichten.
   - config queue wartet 100ms, kann danach ebenfalls droppen.
6. **Legacy No-Task Pfad**
   - Bei fruehem setup-return keine Core-Trennung; andere Timing-/Race-Charakteristik als Normalbetrieb.

---

## 6) Block E - Hand-off Fragen fuer P1.3/P1.5/P1.6 (priorisiert)

1. (P1.6) Wie oft und unter welchen Lastmustern oeffnet das Registration-Gate ohne ACK timeout-bedingt?
2. (P1.6) Welche MQTT-Outbox-/publish_queue-Full-Szenarien erzeugen stillen Statusverlust?
3. (P1.6) Wie robust ist `server/status=online` als frueher ACK-Ersatz bei Server-Restarts?
4. (P1.5) Ist `NOTIFY_EMERGENCY_STOP` unter Queue-Burst stets deterministisch vor Command-Drain wirksam?
5. (P1.5) Welche Garantien bleiben bei gleichzeitigen `OFFLINE_ACTIVE` + `server_override` + reconnect erhalten?
6. (P1.5) Welche Failure-Semantik gilt, wenn `deactivateOfflineMode()` Aktoren nicht OFF setzen kann?
7. (P1.5) Reicht die fixe 30s Grace fuer alle Aktortypen, oder braucht es typ-/subzone-spezifische Policies?
8. (P1.5) Welche Safety-Wirkung bleibt bei NVS-Fehlern (CRC mismatch, blob size mismatch) im Offline-Betrieb?
9. (P1.3) Welche Sensor-Command-Latenz entsteht im Safety-Task bei hoher Config/Actuator-Queue-Last?
10. (P1.3) Fuer welche Sensoren tritt `NaN/unavailable` im Offline-Rule-Pfad am haeufigsten auf?
11. (P1.3) Sind time-filter Guards fuer alle relevanten Sensor-/Rule-Typen ausreichend gegen Fehlaktivierung?
12. (P1.6) Wie aggressiv ist der Portal-Fallback bei transienten WLAN/MQTT-Flaps in Realnetzen?
13. (P1.6) Welche Unterschiede im Stateverlauf ergeben sich zwischen ESP-IDF und PubSubClient Build?
14. (P1.6) Wo fehlen explizite negative ACKs im Config-Pfad fuer sicheren Re-Sync?
15. (P1.5/P1.6) Wie wird im Legacy-Single-Thread-Pfad Safety-Aequivalenz zum Dual-Core-Betrieb abgesichert?

---

## 7) Ergebnis P1.2

Das Runtime-Modell ist als kombinierte State-Machine aus `SystemState`, Connectivity-Lifecycle und Safety-Overlay konsistent herleitbar. Damit sind folgende Leitfragen belastbar beantwortbar:
- aktueller Firmware-Zustand,
- Trigger fuer den naechsten Zustand,
- Core0/Core1 Verzahnung inkl. Queue-Disziplin,
- kritischste Uebergangs- und Race-Risiken.

