# SI-9.4-FW Inventar — Connection-Strang Firmware-Audit

**SI:** SI-9.4-FW (AUT-426)
**Parent:** AUT-412 (Connection-Strang Full-Stack-Inventar)
**Datum:** 2026-05-22
**run_id:** 2026-05-22-si-9-4-fw
**Branch:** auto-debugger/work
**Audit-Typ:** Code-only (kein Hardware-Test)

---

## Komponenten-Inventar

| Komponente | Datei:Zeile | Ist-Verhalten | Kanonisch? |
|------------|-------------|---------------|------------|
| MQTT clean_session | mqtt_client.cpp:379 | `disable_clean_session = 0` (clean_session=true) — Broker wirft Session bei Reconnect | J (ADR 2026-04-26) |
| LWT-Topic | mqtt_client.cpp:362-363 | Heartbeat-Topic mit /heartbeat -> /will ersetzt; `kaiser/{k}/esp/{e}/system/will` | J |
| LWT-Payload | mqtt_client.cpp:367-370 | JSON: `{status:"offline", esp_id, reason:"unexpected_disconnect", timestamp}` | J |
| LWT-QoS | mqtt_client.cpp:387 | QoS=1, retain=1 | J |
| disable_auto_reconnect | mqtt_client.cpp:383 | true — IDF-Auto-Reconnect deaktiviert, eigenes Managed-Reconnect aktiv | J |
| MQTT_EVENT_DISCONNECTED Handler | mqtt_client.cpp:2222-2308 | g_mqtt_connected=false, CB.recordFailure(), offlineModeManager.onDisconnect(), xTaskNotify(NOTIFY_MQTT_DISCONNECTED), scheduleManagedReconnect_() | J |
| MQTT_EVENT_CONNECTED Handler | mqtt_client.cpp:2128-2219 | g_mqtt_connected=true, Registration-Gate reset, subscribeToAllTopics() via callback, offlineModeManager.onReconnect() (nur bei !is_first_connect) | J |
| Managed Reconnect | mqtt_client.cpp:1177-1271 | Exponential Backoff 1500ms Base, 12000ms Max, +649ms Jitter; Write-Timeout Boost 5000ms; 15s Auto-Grace nach Disconnect | J |
| Subscription-Wiederherstellung | main.cpp:661-693 + mqtt_client.cpp:1273-1335 | 12 Topics per queueSubscribe() nach CONNECTED; staged dispatch via processSubscriptionQueue() im Comm-Task | J |
| Bootstrap-Heartbeat-Sync | mqtt_client.cpp:1147-1159, 1295-1305 | Heartbeat erst nach SUBSCRIBED-Event fuer ack + config Topics — verhindert Race | J |
| OfflineModeManager 5-State-Machine | offline_mode_manager.h:16-22, offline_mode_manager.cpp | ONLINE/DISCONNECTED/OFFLINE_ACTIVE/RECONNECTING/ADOPTING; 30s Grace; 2s Adoption-Settle | J (Code korrekt, Doku "4-state" falsch) |
| DISCONNECTED-Trigger | offline_mode_manager.cpp:247, mqtt_client.cpp:2272 | MQTT_EVENT_DISCONNECTED -> onDisconnect() direkt im Event-Handler (Core 0) | J |
| OFFLINE_ACTIVE-Trigger | offline_mode_manager.cpp:482-484 | checkDelayTimer() im Safety-Task (Core 1): millis()-disconnect_timestamp_ms_ >= 30000 | J |
| RECONNECTING-Trigger | offline_mode_manager.cpp:288-293 | onReconnect() in onMqttConnectCallback (nur bei !is_first_connect) | J |
| ADOPTING-Trigger | offline_mode_manager.cpp:352-402 | onServerAckReceived() mit gueltiger Epoch | J |
| ONLINE via Adoption | offline_mode_manager.cpp:1378-1397 | finalizeAdoptingMode() nach 2s Settle -> deactivateOfflineMode() | J |
| ValueCache | sensor_manager.h:154-211 | Permanent aktiv; 20 Entries; 5-min Stale; kein On/Off-Schalter | J |
| ValueCache-Befuellung | sensor_manager.h:211 (updateValueCache) | Bei jedem publishSensorReading() automatisch | J |
| getSensorValue (P4-Lesepfad) | sensor_manager.h:160 | Gibt NaN wenn kein Eintrag oder >5min alt | J |
| NVS-Boot-Load Sensoren | main.cpp:3455 | STEP 12: nach MQTT-Connect; configManager.loadSensorConfig() -> sensorManager.configureSensor() | J |
| NVS-Boot-Load Aktoren | main.cpp:3501 | STEP 13: nach Sensoren; configManager.loadActuatorConfig() -> actuatorManager.configureActuator() | J |
| NVS-Boot-Load Offline-Rules | main.cpp:3513 | Nach Aktoren; offlineModeManager.loadOfflineRulesFromNVS() | J |
| Heartbeat-Trigger ESP-seitig | mqtt_client.cpp:1132 (loop()) | publishHeartbeat() im loop(); Bootstrap: erst nach ACK-Subscribe-Confirm | J |
| Discovery-Constraint | main.cpp:inferred | Discovery-Flow (session/announce) nur nach MQTT_EVENT_CONNECTED; publishSessionAnnounce() in Event-Handler | J |
| Actuator-State bei DISCONNECTED | safety_task.cpp:98-113 | NOTIFY_MQTT_DISCONNECTED: keine Offline-Rules -> setAllActuatorsToSafeState(); mit Regeln -> setUncoveredActuatorsToSafeState() | J |
| g_mqtt_connected atomic | mqtt_client.cpp:217 | std::atomic<bool> — cross-core safe (Core 0 write, Core 1 read) | J |

---

## Findings-Tabelle

| Finding-ID | Kategorie | Schwere | Beschreibung | Beleg-MD |
|------------|-----------|---------|--------------|----------|
| FW-F01 | inconsistency | low | OfflineModeManager hat 5 States, Header-Kommentar + AUT-412/AUT-426 beschreiben "4-state" | BELEG-SI94FW-01-2026-05-22.md |
| FW-F02 | inconsistency | low | disable_clean_session Zeilen-Drift: AUT-412 sagt Zeile 335, tatsaechlich Zeile 379 (AUT-426 korrekt) | BELEG-SI94FW-02-2026-05-22.md |
| FW-F03 | tracing-gap | medium | MQTT_EVENT_CONNECTED kann asynchron VOR SensorManager/ActuatorManager-Initialisierung feuern — durch Guards abgesichert aber undokumentiert | BELEG-SI94FW-03-2026-05-22.md |
| FW-F04 | inconsistency | low | subscribeToAllTopics() liegt auf Zeilen 661-693 (nicht 823-846 wie AUT-426 angab); 12 Subscriptions (nicht 11); 1 Subscription (BroadcastEmergency) mit QoS 2 statt 1 | BELEG-SI94FW-04-2026-05-22.md |
| FW-F05 | tracing-gap | low | ValueCache hat keinen On/Off-Schalter — laeuft immer; kein "ValueCache aktivieren bei OFFLINE_ACTIVE"; mode_ ist uint8_t ohne explicit atomic (akzeptabel, aber undokumentiert) | BELEG-SI94FW-05-2026-05-22.md |

---

## Querschnitt-Berührungen

| Strang | Layer | Berührungspunkt | Beschreibung | Code-Stelle |
|--------|-------|-----------------|--------------|-------------|
| Safety (SI-9.3) | OfflineModeManager-Trigger | MQTT_EVENT_DISCONNECTED | MQTT_EVENT_DISCONNECTED -> offlineModeManager.onDisconnect() (Core 0 direkt) -> ONLINE->DISCONNECTED; nach 30s -> OFFLINE_ACTIVE | mqtt_client.cpp:2272, offline_mode_manager.cpp:247 |
| Sensor (SI-9.1) | ValueCache-Aktivierung | Kein Schalter | ValueCache laeuft immer (updateValueCache in publishSensorReading); getSensorValue() liefert NaN wenn kein gueltiger Eintrag (>5min oder nie gemessen) | sensor_manager.h:160, 211 |
| Error (SI-9.5) | audit_logs bei State-Transitions | FW schreibt keine audit_logs | FW loggt State-Transitions per LOG_W/LOG_I (Serial/Loki). Keine direkten DB-audit_logs aus FW. Server-seitig via LWT (heartbeat_handler.py bei LWT-Empfang). Bestaetigt. | mqtt_client.cpp:2223 LOG_W |
| Aktor (SI-9.2) | actuator_states bei State-Wechsel | Safety-Task NOTIFY_MQTT_DISCONNECTED | MQTT_DISCONNECTED: ohne Offline-Rules -> setAllActuatorsToSafeState() sofort; mit Regeln -> setUncoveredActuatorsToSafeState(). OFFLINE_ACTIVE-Transition loest keine sofortige Aktor-Aenderung aus (P4 evaluiert in <5s automatisch). | safety_task.cpp:98-113 |
| Discovery (SI-9.7) | Discovery nur waehrend ONLINE | publishSessionAnnounce() nach MQTT_EVENT_CONNECTED | session/announce wird direkt in MQTT_EVENT_CONNECTED Handler (Core 0) publiziert, VOR onMqttConnectCallback(). Nur moeglich wenn g_mqtt_connected=true. | mqtt_client.cpp:2205, 2198-2204 |

---

## Pfad-/Zeilen-Drifts gegenueber AUT-412/AUT-426

| AUT | Behauptung | Live-Code | Bewertung |
|----|-----------|-----------|-----------|
| AUT-412 | disable_clean_session Zeile 335 | Zeile 379 | DRIFT — AUT-412 falsch |
| AUT-426 | disable_clean_session Zeile 379 | Zeile 379 | KORREKT |
| AUT-426 | "4-State-Machine" | 5 States (ADOPTING als 5.) | DRIFT — beide falsch |
| AUT-426 | "ca. Zeile 823-846, alle 11 Subscriptions" | Funktion Zeile 661-693, 12 Subscriptions | DRIFT — Zeile und Count falsch |

---

## Artefakt-Pfade

- Beleg-MDs: `.claude/reports/current/auto-debugger-runs/2026-05-22-si-9-4-fw/`
- Inventar: `docs/analysen/full-stack-bereinigung-2026/SI-9-4-FW-inventar.md`
- Live-Test: `.claude/reports/current/auto-debugger-runs/2026-05-22-si-9-4-fw/LIVE-TEST-PROTOKOLL.md`
- Querschnitt: `.claude/reports/current/auto-debugger-runs/si-9/QUERSCHNITT-STATE-MACHINE-ERRORS.md`
