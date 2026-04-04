# Paket 02: ESP32 Trigger-Matrix (P1.2)

## 1) Ziel und Notation

Diese Matrix modelliert Runtime-Uebergaenge in der Form:

`Current State -> Trigger -> Guard -> Action -> Next State -> Failure Path`

ID-Schema:
- Trigger: `FW-TRIG-XXX`
- States referenzieren `FW-STATE-*` aus `paket-02-esp32-runtime-lifecycle-state-model.md`.
- Quellen sind auf Event-, Timer-, Queue- und Safety-Trigger normiert.

## 2) Trigger-Matrix

| Trigger-ID | Quelle | Current State | Guard-Condition | Action | Next State | Failure-Path |
|---|---|---|---|---|---|---|
| FW-TRIG-001 | Boot | FW-STATE-001 | Power-on/restart | Start setup pipeline | FW-STATE-002 | Frueher Setup-Abbruch |
| FW-TRIG-002 | Boot Counter | FW-STATE-001/FW-STATE-002 | `boot_count > 5` und `<60s` | `STATE_SAFE_MODE` setzen, loop latch | FW-STATE-003 | Kein auto recovery |
| FW-TRIG-003 | Persistenz-Repair | FW-STATE-001 | `STATE_SAFE_MODE_PROVISIONING` + valide WiFi Config | Repair auf `STATE_BOOT` | FW-STATE-001 | Bei save fail bleibt inkonsistent |
| FW-TRIG-004 | Provisioning-Bedarf | FW-STATE-001/FW-STATE-004 | WiFi config fehlt/ungueltig | AP provisioning starten | FW-STATE-005 | AP start fail -> LED error hold |
| FW-TRIG-005 | WiFi Connect Attempt | FW-STATE-004 | WiFiManager init ok | `wifiManager.connect()` | FW-STATE-006 | Timeout/fail -> FW-STATE-005 |
| FW-TRIG-006 | WiFi Connected | FW-STATE-006 | `WL_CONNECTED` | NTP sync/start, CB success | FW-STATE-007 | NTP fail -> degradiert aber connected |
| FW-TRIG-007 | MQTT Connect Start | FW-STATE-007 | MQTT init ok | `mqttClient.connect()` (async) | FW-STATE-008 | connect setup fail -> provisioning branch |
| FW-TRIG-008 | MQTT_EVENT_CONNECTED | FW-STATE-008 | Event aus MQTT task | `g_mqtt_connected=true`, ACK reset, subscriptions, post-connect heartbeat | FW-STATE-009 | Callback/subscription drift |
| FW-TRIG-009 | Registration ACK Valid | FW-STATE-009 | ACK parse ok | `confirmRegistration()`, ACK timestamp reset | FW-STATE-010 oder FW-STATE-011 | Parse fail -> bleibt gate-locked |
| FW-TRIG-010 | Registration Timeout | FW-STATE-009 | `REGISTRATION_TIMEOUT_MS` | Gate fallback open | FW-STATE-011 | Betrieb ohne explizites ACK |
| FW-TRIG-011 | Approval Pending | FW-STATE-009/FW-STATE-011 | ACK status `pending_approval` | `STATE_PENDING_APPROVAL` setzen | FW-STATE-010 | Dauerhaft limitiertes System |
| FW-TRIG-012 | Approval Granted | FW-STATE-010 | ACK status `approved/online` | approved persistieren, `STATE_OPERATIONAL` | FW-STATE-011 | Persistenzfehler erzeugt Drift |
| FW-TRIG-013 | Approval Rejected | FW-STATE-010/FW-STATE-011 | ACK status `rejected` | trackError + `STATE_ERROR` | FW-STATE-018 | manueller Eingriff noetig |
| FW-TRIG-014 | MQTT_EVENT_DISCONNECTED | FW-STATE-009/FW-STATE-010/FW-STATE-011 | Disconnect event | `g_mqtt_connected=false`, `onDisconnect()`, notify SafetyTask | FW-STATE-014 | Flap/Thrash Verhalten |
| FW-TRIG-015 | ACK Timeout | FW-STATE-011 | `millis - g_last_server_ack_ms > 120s` | timeout flag, safe-state oder P4, `onDisconnect()` | FW-STATE-014 | False positive bei Timing-Randfall |
| FW-TRIG-016 | Server-LWT Offline | FW-STATE-011 | `/server/status` parse ok und `offline` | safe-state oder P4 disconnect | FW-STATE-014 | LWT parse fail -> ignoriert |
| FW-TRIG-017 | Server Status Online | FW-STATE-014/FW-STATE-016 | status `online` | ACK timer reset, `onServerAckReceived()` | FW-STATE-011 oder FW-STATE-014 | Ohne echten ACK evtl. Zwischenzustand |
| FW-TRIG-018 | Grace Expired | FW-STATE-014 | `>= OFFLINE_ACTIVATION_DELAY_MS` | `activateOfflineMode()` | FW-STATE-015 | Rule init failure -> safe fallback |
| FW-TRIG-019 | Reconnect in Grace | FW-STATE-014 | reconnect vor 30s | `mode=ONLINE` | FW-STATE-011 | Sofortiger Re-Disconnect |
| FW-TRIG-020 | Reconnect nach Offline | FW-STATE-015 | MQTT reconnect | `mode=RECONNECTING` | FW-STATE-016 | Ohne ACK bleiben Rules aktiv |
| FW-TRIG-021 | Server ACK in Reconnecting | FW-STATE-016 | ACK parse ok | `deactivateOfflineMode()` + reset rule state | FW-STATE-011 | NVS write fail kann stale state lassen |
| FW-TRIG-022 | Server ACK direkt in OFFLINE_ACTIVE | FW-STATE-015 | ACK parse ok | `deactivateOfflineMode()` | FW-STATE-011 | Parse fail -> OFFLINE_ACTIVE bleibt |
| FW-TRIG-023 | Emergency Command (ESP) | FW-STATE-011/FW-STATE-015/FW-STATE-016 | auth token valid/fail-open | `NOTIFY_EMERGENCY_STOP`/direct stop | FW-STATE-017 | unauthorized reject |
| FW-TRIG-024 | Emergency Broadcast | FW-STATE-011/FW-STATE-015/FW-STATE-016 | auth valid/fail-open | emergency stop all | FW-STATE-017 | invalid token/security reject |
| FW-TRIG-025 | Emergency Clear | FW-STATE-017 | `clearEmergencyStop()` true | resume operation | FW-STATE-011 oder FW-STATE-015 | verification fail -> bleibt emergency |
| FW-TRIG-026 | Config Push Arrived | FW-STATE-009/FW-STATE-010/FW-STATE-011 | payload < `CONFIG_PAYLOAD_MAX_LEN` | enqueue config update | FW-STATE-012 | payload too large -> config_response error |
| FW-TRIG-027 | Config Queue Full | FW-STATE-012 | queue send timeout (100ms) | drop config push | FW-STATE-011 | stiller Verlust (kein harter resync) |
| FW-TRIG-028 | Config Queue Drain | FW-STATE-012 | queue item vorhanden | parse once, apply sensor/actuator/offline | FW-STATE-011 | parse fail -> kein negatives config_response |
| FW-TRIG-029 | Actuator Command Arrived | FW-STATE-011/FW-STATE-015/FW-STATE-016 | topic valid | enqueue actuator command | FW-STATE-013 | queue full -> silent drop |
| FW-TRIG-030 | Sensor Command Arrived | FW-STATE-011/FW-STATE-015/FW-STATE-016 | topic valid | enqueue sensor command | FW-STATE-013 | queue full -> silent drop |
| FW-TRIG-031 | Command Queue Drain | FW-STATE-013 | queue item vorhanden | execute on Core1 owner modules | FW-STATE-011 oder overlay bleibt | handler error -> response/error |
| FW-TRIG-032 | Server Command waehrend OFFLINE_ACTIVE | FW-STATE-015 | actuator exists | `setServerOverride(gpio)` vor execute | FW-STATE-015 | actuator missing -> error response |
| FW-TRIG-033 | Publish from Core1 | FW-STATE-011/FW-STATE-015 | `xPortGetCoreID()==1` | enqueue `g_publish_queue` | gleicher State | queue full -> publish drop + CB failure |
| FW-TRIG-034 | Publish Queue Drain | FW-STATE-011/FW-STATE-015 | CommTask tick | Core0 `esp_mqtt_client_publish` | gleicher State | outbox full/disconnect -> drop |
| FW-TRIG-035 | Disconnect Debounce Portal | FW-STATE-011 | 30s `!mqtt && !wifi` | set provisioning state + AP portal | FW-STATE-005 | portal start fail |
| FW-TRIG-036 | MQTT Persistent Failure | FW-STATE-011 | CB OPEN fuer 5min | provisioning fallback | FW-STATE-005 | portal init/start fail |
| FW-TRIG-037 | Provisioning Config Received | FW-STATE-005 | `isConfigReceived()==true` | config reload + reboot | FW-STATE-001 | reboot fail -> provisioning bleibt |
| FW-TRIG-038 | Legacy No-Task Runtime | FW-STATE-005/FW-STATE-010 | setup return vor task creation | single-thread fallback loop | FW-STATE-019 | hoehere Latenz, reduzierte Core-Isolation |
| FW-TRIG-039 | Task-System Aktivierung | FW-STATE-001/FW-STATE-011 | queues+tasks erfolgreich erstellt | SafetyTask + CommTask starten | FW-STATE-011 | bei Task-Create-Fail fallback Legacy |
| FW-TRIG-040 | Watchdog Feed Blocked | FW-STATE-011/FW-STATE-018 | critical errors oder `STATE_ERROR` | WDT feed blockiert | FW-STATE-018 | reset/reboot cycle |

## 3) Trigger-Cluster und Vollstaendigkeit

- **Event-getrieben:** MQTT connect/disconnect/data, server status, emergency topics.
- **Timer-getrieben:** ACK timeout (120s), offline delay (30s), offline eval (5s), reconnect/backoff, persistent failure (5min), portal debounce (30s).
- **Queue-getrieben:** actuator/sensor/config/publish queues.
- **Safety-getrieben:** emergency notify, disconnect notify, safe-state immediate branch.

Abdeckung:
- Normalpfad: Boot -> WiFi -> MQTT -> Approval -> Operational.
- Fehlerpfad: WiFi/MQTT fail -> Provisioning, ACK timeout -> Offline, reject -> Error.
- Recoverypfad: reconnect + ACK -> ONLINE, provisioning submit -> reboot.

## 4) Kritische Trigger fuer Folgeschritte

Prioritaet fuer P1.3/P1.5/P1.6:
1. `FW-TRIG-015` (ACK timeout)
2. `FW-TRIG-018` (Grace -> OFFLINE_ACTIVE)
3. `FW-TRIG-021/022` (ACK-basierte Offline-Rueckfuehrung)
4. `FW-TRIG-027/028` (Config queue full + parse/apply)
5. `FW-TRIG-032` (ServerOverride im Offline-Betrieb)
6. `FW-TRIG-033/034` (Core1->Core0 publish queue / outbox drop)

