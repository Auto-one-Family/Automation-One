# Paket 01: ESP32 Abhaengigkeitskarte (P1.1)

> **Stand:** 2026-04-05  
> **Status:** Abgeschlossen (P1.1)  
> **Ursprung:** Abgeleitet aus `paket-01-esp32-modul-inventar.md` und Firmware-Codeanalyse  
> **Naechster Schritt:** Input fuer P1.2 Runtime-Lifecycle/State-Model

## Ziel

Diese Karte dokumentiert die zentralen Modulabhaengigkeiten der Firmware inkl. Kopplungsart, zentraler Knoten und Fragilitaetsstellen.

## 1) Knotenliste (kritische Module)

| Knoten-ID | Modul | Rolle |
|---|---|---|
| FW-MOD-001 | `main.cpp` | Boot/Orchestrierung/Router |
| FW-MOD-003 | `tasks/safety_task.*` | Core-1 Safety-Ausfuehrung |
| FW-MOD-004 | `tasks/communication_task.*` | Core-0 Netzwerk-Ausfuehrung |
| FW-MOD-008 | `tasks/config_update_queue.*` | Config Core-Bridge |
| FW-MOD-010 | `services/sensor/sensor_manager.*` | Sensor-Lebenszyklus |
| FW-MOD-015 | `services/actuator/actuator_manager.*` | Aktor-Lebenszyklus |
| FW-MOD-016 | `services/actuator/safety_controller.*` | Emergency/Recovery |
| FW-MOD-021 | `services/communication/wifi_manager.*` | WLAN Connectivity |
| FW-MOD-022 | `services/communication/mqtt_client.*` | MQTT Connectivity + Pub/Sub |
| FW-MOD-024 | `services/config/config_manager.*` | Konfigurationsorchestrierung |
| FW-MOD-026 | `services/provisioning/provision_manager.*` | AP-/Portal-Provisioning |
| FW-MOD-027 | `services/config/storage_manager.*` | NVS Zugriff |
| FW-MOD-028 | `services/safety/offline_mode_manager.*` | Offline-Regelwerk |
| FW-MOD-030 | `drivers/gpio_manager.*` | Pin-Safety/Ownership |
| FW-MOD-031 | `error_handling/error_tracker.*` | Fehlertelemetrie |
| FW-MOD-033 | `error_handling/health_monitor.*` | Health-Snapshot |
| FW-MOD-035 | `utils/topic_builder.*` | Topic-Contracts |
| FW-MOD-036 | `utils/time_manager.*` | Zeitbasis |
| FW-MOD-043 | `tasks/intent_contract.*` | Intent-Metadaten, Safety-Epoch, TTL, Outcome-Publish |
| FW-MOD-044 | `tasks/command_admission.*` | Command-Gating (CONFIG/SENSOR/ACTUATOR/SYSTEM) |
| FW-MOD-045 | `services/config/runtime_readiness_policy.*` | Runtime-Readiness (Counts/Profile) fuer Events/ACK |

## 2) Kantenliste (A -> B)

| Flow-ID | Richtung | Beschreibung | Kopplung |
|---|---|---|---|
| FW-FLOW-001 | `main.cpp` -> `gpio_manager` | Safe-Mode als fruehester Boot-Schritt | hart |
| FW-FLOW-002 | `main.cpp` -> `storage_manager` | NVS frueh initialisieren | hart |
| FW-FLOW-003 | `main.cpp` -> `config_manager` | Basiskonfig laden/validieren | hart |
| FW-FLOW-004 | `config_manager` -> `storage_manager` | Persistenz fuer WiFi/System/Sensor/Aktor/Subzone | hart |
| FW-FLOW-005 | `main.cpp` -> `wifi_manager` | WLAN Connect | hart |
| FW-FLOW-006 | `main.cpp` -> `mqtt_client` | MQTT Connect + callbacks | hart |
| FW-FLOW-007 | `mqtt_client` -> `topic_builder` | Topic-Aufbau fuer publish/subscribe | hart |
| FW-FLOW-008 | `main.cpp` -> `topic_builder` | IDs setzen (`setEspId`,`setKaiserId`) | hart |
| FW-FLOW-009 | `main.cpp` -> `sensor_manager` | Sensor-Subsystem starten | hart |
| FW-FLOW-010 | `main.cpp` -> `safety_controller` | Safety vor Aktoren initialisieren | hart |
| FW-FLOW-011 | `main.cpp` -> `actuator_manager` | Aktoren initialisieren/steuern | hart |
| FW-FLOW-012 | `actuator_manager` -> `safety_controller` | Safety-Pruefung + Emergency-Pfade | hart |
| FW-FLOW-013 | `main.cpp` -> `offline_mode_manager` | Offline-Rules laden / state transitions | hart |
| FW-FLOW-014 | `offline_mode_manager` -> `sensor_manager` | liest Value-Cache fuer Rule-Eval | locker |
| FW-FLOW-015 | `offline_mode_manager` -> `actuator_manager` | setzt Aktorzustand bei Offline-Logik | hart |
| FW-FLOW-016 | `main.cpp` -> `config_update_queue` | Config-Pushes in Queue statt Direktzugriff | hart |
| FW-FLOW-017 | `config_update_queue` -> `sensor_manager` | Sensor-Config anwenden auf Core1 | hart |
| FW-FLOW-018 | `config_update_queue` -> `actuator_manager` | Aktor-Config anwenden auf Core1 | hart |
| FW-FLOW-019 | `config_update_queue` -> `offline_mode_manager` | Offline-Rules aus Config verarbeiten | hart |
| FW-FLOW-020 | `communication_task` -> `mqtt_client` | loop/reconnect/heartbeat/publish-drain | hart |
| FW-FLOW-021 | `communication_task` -> `wifi_manager` | Netzwerkzustand kontinuierlich pflegen | hart |
| FW-FLOW-022 | `safety_task` -> `actuator_manager` | Aktor-Loops + Command-Drain | hart |
| FW-FLOW-023 | `safety_task` -> `sensor_manager` | Mess-/Command-Loops | hart |
| FW-FLOW-024 | `safety_task` -> `offline_mode_manager` | Delay-Check + Rule-Eval | hart |
| FW-FLOW-025 | `error_tracker` -> `mqtt_client` | Fehlerpublishing ueber Callback | locker |
| FW-FLOW-026 | `health_monitor` -> `mqtt_client` | Diagnostikpublishing | locker |
| FW-FLOW-027 | `health_monitor` -> `wifi_manager` | RSSI/Connectivity Health | locker |
| FW-FLOW-028 | `health_monitor` -> `actuator_manager` + `sensor_manager` | aktive Modulcounts / status | locker |
| FW-FLOW-029 | `time_manager` -> `mqtt_client` | Heartbeat-/Payload-Timestamp-Basis | locker |
| FW-FLOW-030 | `provision_manager` -> `config_manager` | AP-Config speichern/laden | hart |
| FW-FLOW-031 | `main.cpp` / `routeIncomingMessage` -> `command_admission` | Vor-Enqueue-Gating Sensor/Aktor/Config (Core0) | hart |
| FW-FLOW-032 | `actuator_command_queue` / `sensor_command_queue` / `config_update_queue` (Core1) -> `intent_contract` | TTL/Epoch-Invalidierung, Admission erneut, Outcome | hart |
| FW-FLOW-033 | `intent_contract` -> `mqtt_client` / `g_publish_queue` | `publishIntentOutcome`, Outbox-Drain | locker |

## 3) Zentrale Knoten (High Coupling)

1. `FW-MOD-001` `main.cpp` (hoechste fan-out Kopplung)
2. `FW-MOD-022` `mqtt_client.*` (cross-cutting fuer Daten-, Command-, Health-, Error-Flows)
3. `FW-MOD-024` `config_manager.*` (NVS + Runtime-Config fuer mehrere Subsysteme)
4. `FW-MOD-015` `actuator_manager.*` (Safety, Commands, Offline, Status)
5. `FW-MOD-028` `offline_mode_manager.*` (Connectivity/Sensor/Aktor Verknuepfung)

## 4) Fragilitaetsstellen

### F-01: Boot-Reihenfolgeverletzung
- Betroffene Kette: `main.cpp` -> `gpio_manager` -> restliches System
- Risiko: Aktoren/Pins koennen kurzzeitig in unsicherem Zustand landen.
- Auswirkung: hoch, systemweit.

### F-02: Config-Concurrency ohne Queue-Disziplin
- Betroffene Kette: MQTT event (Core0) -> `command_admission` / `intent_contract` -> `config_update_queue` -> Core1 Handler
- Risiko: Race auf `sensors_[]` / `actuators_[]`, wenn Queue-Disziplin umgangen wird.
- Auswirkung: hoch, schwer reproduzierbare Runtime-Fehler.

### F-03: ACK-/Disconnect-Interlock
- Betroffene Kette: `mqtt_client` + `offline_mode_manager` + `checkServerAckTimeout`
- Risiko: stale ACK-Timestamps oder falscher Connect-State triggern unnoetige Safe-Transitions.
- Auswirkung: hoch, false positives in Safety.

### F-04: NVS-Konsistenz fuer Offline-Rules
- Betroffene Kette: `offline_mode_manager` <-> `storage_manager`
- Risiko: inkonsistente Rule-Sets zwischen RAM/NVS bei partiellen Fehlern.
- Auswirkung: hoch fuer Offline-Betrieb.

### F-05: Topic-Contract Drift
- Betroffene Kette: `topic_builder` <-> Server Handler Contracts
- Risiko: Publish/Subscribe auf nicht verarbeitete oder veraltete Topics.
- Auswirkung: mittel bis hoch (silent data loss / command loss).

### F-06: SafetyController-Bypass-Risiko
- Betroffene Kette: direkte Aktortreiber-Nutzung statt `actuator_manager`/`safety_controller`
- Risiko: Emergency- und Recovery-Guards greifen nicht.
- Auswirkung: kritisch.

## 5) Kurzfazit fuer Folgeschritte

- P1.2 sollte mit Fokus auf `main.cpp`, Task-Interaktion und Queue-Disziplin starten.
- P1.3 sollte den Sensorpfad um `sensor_manager` + Bus-Module + Topic-Vertrag vertiefen.
- P1.5 sollte insbesondere F-01, F-03 und F-06 formal absichern.

## 6) Qualitaetscheck

- Knotenliste auf kritische Module fokussiert (nicht ueberladen).
- Kantenliste bildet Boot-, Config-, Command-, Safety- und Diagnosepfade ab.
- Fragilitaetsstellen sind als priorisierbare Risiko-Hotspots fuer Folgepakete nutzbar.
