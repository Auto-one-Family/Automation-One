# Live-Test-Protokoll — SI-9.4-FW Connection-Strang Audit

**run_id:** 2026-05-22-si-9-4-fw
**Datum:** 2026-05-22
**SI:** SI-9.4-FW (AUT-426)

## Status

**Nicht getestet — Code-verified only**

## Begruendung

Hardware-Test via Agent nicht moeglich:
- Kein direkter COM-Port-Zugriff aus Agent-Kontext
- ESP32 Flash/Monitor erfordert physischen Port (COM5/CH340, verifiziert 2026-02-26)
- Kein Live-MQTT-Broker im Agent-Scope

## Was verifiziert wurde (Code-Level)

| Komponente | Methode | Ergebnis |
|------------|---------|----------|
| disable_clean_session=0 | Direkter Code-Read mqtt_client.cpp:379 | Bestaetigt |
| LWT-Setup (Topic, Payload, QoS=1, retain=1) | Code-Read mqtt_client.cpp:362-389 | Bestaetigt |
| MQTT_EVENT_DISCONNECTED -> onDisconnect() | Code-Read mqtt_client.cpp:2272 | Bestaetigt |
| Subscription-Wiederherstellung nach Reconnect | Code-Read main.cpp:703, mqtt_client.cpp:1273 | Bestaetigt |
| OfflineModeManager Transitions-Tabelle | Code-Read offline_mode_manager.cpp:246-458 | Vollstaendig |
| ValueCache immer aktiv (kein On/Off) | Code-Read sensor_manager.h:154-211 | Bestaetigt |
| Boot-Sequenz NVS-Reihenfolge | Code-Read main.cpp:3434-3513 | Bestaetigt |
| 12 Subscriptions (nicht 11) | Code-Read main.cpp:661-693 | Bestaetigt |

## Empfehlung fuer manuellen Test (Robin)

1. **Reconnect-Test:** ESP32 booten, MQTT-Broker kurz stoppen (docker compose stop mqtt-broker), wieder starten — verifikation: Serial zeigt MQTT_EVENT_DISCONNECTED, dann MQTT_EVENT_CONNECTED, dann alle 12 Subscribe-Confirms
2. **Offline-Rule-Test:** ESP32 mit aktiven Offline-Rules von Broker trennen, 30s warten — Verifikation: Serial zeigt "[SAFETY-P4] Grace period elapsed" und "[SAFETY-P4] Offline mode ACTIVE"
3. **Reconnect-nach-OFFLINE_ACTIVE:** Nach Offline-Rule-Aktivierung Broker wieder starten — Verifikation: Serial zeigt RECONNECTING -> ADOPTING -> ONLINE Transition
