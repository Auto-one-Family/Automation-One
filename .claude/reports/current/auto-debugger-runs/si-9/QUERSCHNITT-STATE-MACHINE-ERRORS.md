# Querschnitt-Tracking SI-9 — State-Machine und Error-System

**Zweck:** Cross-Strang-Konsistenz-Prüfung. Jeder Layer-Audit-Subagent schreibt seine State-Machine- und Error-Berührungen hierhin. Nach jedem Strang-Abschluss: TM prüft auf Widersprüche zu vorherigen Einträgen.

**Schreib-Pflicht:** Jedes Layer-Sub-Issue (SI-9.k-FW / -MQTT / -SRV / -DB / -FE) trägt nach Audit-Abschluss seine Berührungspunkte ein. Nicht nur in lokale Querschnitt-Sektion des Issues — auch HIER.

**Status:** Angelegt 2026-05-21 (TM, AUT-424). Erster Eintrag erwartet nach SI-9.4-FW Audit-Abschluss.

| Strang | Layer | Berührungspunkt | Code-Stelle | Beschreibung | Finding-Ref (AUT-X / BELEG-Y) | Status (OPEN/CLOSED/ACCEPTED-BACKLOG/CONFLICT) |
|--------|-------|-----------------|-------------|--------------|-------------------------------|------------------------------------------------|
| Safety (SI-9.3) | OfflineModeManager-Trigger | MQTT_EVENT_DISCONNECTED -> onDisconnect() | mqtt_client.cpp:2272, offline_mode_manager.cpp:247 | MQTT_EVENT_DISCONNECTED (Core 0 Event-Task) ruft direkt offlineModeManager.onDisconnect() auf. ONLINE->DISCONNECTED mit 30s Grace-Timer. Nach 30s: checkDelayTimer() (Core 1, Safety-Task) -> activateOfflineMode() -> OFFLINE_ACTIVE. | BELEG-SI94FW-01-2026-05-22.md | OPEN |
| Sensor (SI-9.1) | ValueCache-Aktivierung | sensor_manager.h:160 (getSensorValue), sensor_manager.h:211 (updateValueCache) | sensor_manager.h:154-211 | ValueCache ist IMMER aktiv — kein On/Off-Schalter bei OFFLINE_ACTIVE. updateValueCache() laeuft bei jedem publishSensorReading(). evaluateOfflineRules() liest via getSensorValue() — gibt NaN wenn kein gueltiger Eintrag (>5min oder noch nie gemessen). ADC-Typen (ph/ec/moisture) werden durch requiresCalibration()-Guard herausgefiltert. | BELEG-SI94FW-05-2026-05-22.md | OPEN |
| Error (SI-9.5) | audit_logs bei State-Transitions | mqtt_client.cpp:2223 (LOG_W) | mqtt_client.cpp:2222-2308 | FW schreibt KEINE direkten audit_logs. State-Transitions werden per LOG_W/LOG_I in Serial/Loki geloggt. Server-seitig via LWT: heartbeat_handler.py empfaengt LWT und erzeugt server-seitigen Eintrag. Bestaetigt. | BELEG-SI94FW-05-2026-05-22.md | OPEN |
| Aktor (SI-9.2) | actuator_states bei State-Wechsel | safety_task.cpp:98-113 | safety_task.cpp:98-113 | NOTIFY_MQTT_DISCONNECTED (Core 1 Safety-Task): ohne Offline-Rules -> setAllActuatorsToSafeState() sofort. Mit Regeln -> setUncoveredActuatorsToSafeState() (AUT-66). OFFLINE_ACTIVE-Transition loest KEINE sofortige Aktor-Aenderung aus — P4 evaluiert im naechsten 5s-Zyklus. | BELEG-SI94FW-01-2026-05-22.md | OPEN |
| Discovery (SI-9.7) | Discovery nur waehrend ONLINE | mqtt_client.cpp:2205 | mqtt_client.cpp:2198-2205 | publishSessionAnnounce() wird direkt in MQTT_EVENT_CONNECTED Handler publiziert (Core 0), VOR onMqttConnectCallback(). Nur erreichbar wenn g_mqtt_connected=true. Kein expliziter "nur waehrend ONLINE"-Guard — aber mechanisch nur im CONNECTED-Event moeglich. | BELEG-SI94FW-04-2026-05-22.md | OPEN |

*(SI-9.4-FW Eintraege hinzugefuegt 2026-05-22 durch AUT-426 Audit.)*
