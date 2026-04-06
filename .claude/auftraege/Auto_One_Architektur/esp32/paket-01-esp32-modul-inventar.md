# Paket 01: ESP32 Modul-Inventar (P1.1)

> **Stand:** 2026-04-05  
> **Status:** Abgeschlossen (P1.1)  
> **Scope-Quelle:** `.claude/auftraege/Auto_One_Architektur/roadmap-komplettanalyse.md`  
> **Referenzbasis:** Firmware-Analyse im Auto-one-Repo (`C:/Users/robin/Documents/PlatformIO/Projects/Auto-one`)

## 1) Ziel und Scope

Dieses Dokument bildet die belastbare Modul-Landkarte der Firmware `El Trabajante/src` als Grundlage fuer P1.2-P1.7.

- Fokus: Struktur, Verantwortung, I/O, Persistenzbezug, Safety-Relevanz, Kritikalitaet.
- Kein Scope: Detail-State-Machine, feldgenaue RAM/NVS-Budgetierung, Tiefenanalyse je Sensortyp.
- Analysemodus: Read-only auf Basis der aktuellen C++ Codebase.

## 2) Systemgrenze ESP32

### Gehoert zur Firmware (ESP32)
- Boot-/Runtime-Orchestrierung (`main.cpp`, FreeRTOS-Tasks, Queues).
- Hardware-Naehe (GPIO, I2C, OneWire, PWM, HAL).
- Kommunikationsausfuehrung (WiFi, MQTT, HTTP-Provisioning).
- Konfigurationspersistenz (NVS via `Preferences`/StorageManager).
- Sensor-Datenerfassung, Aktor-Ausfuehrung, lokale Safety-Mechanismen.

### Gehoert NICHT zur Firmware (nur als Interface)
- Business-Logik / Entscheidungslogik (server-zentrisch auf El Servador).
- Sensor-Kalibrierung/Finalverarbeitung.
- Regelmodellierung und API-Orchestrierung.

### Einheitliches ID-Schema
- Module: `FW-MOD-XXX`
- Datenfluesse: `FW-FLOW-XXX`
- Contracts: `FW-CON-XXX`

## 3) Modulcluster-Uebersicht

- Runtime/Boot
- Sensorik
- Aktorik
- Netzwerk/MQTT/WiFi
- Config/Provisioning
- Persistenz (NVS)
- Safety/Watchdog/Failsafe
- Diagnostics/Observability
- Utilities/Basisinfrastruktur

## 4) Vollstaendige Modultabelle

| Modul-ID | Name / Pfad | Cluster | Verantwortung | Input / Output | Persistenzbezug | Safety-Bezug | Kritikalitaet | Folgepaket-Relevanz |
|---|---|---|---|---|---|---|---|---|
| FW-MOD-001 | `main.cpp` | Runtime/Boot | Boot-Sequenz, globale Orchestrierung, Topic-Subscriptions, Handler-Routing | In: Boot, MQTT-Nachrichten; Out: Manager-Aufrufe, MQTT Publishes | Indirekt via Config/Storage | Setzt Safety-Reihenfolge (GPIO first, Safety vor Actuator) | kritisch | P1.2 P1.3 P1.4 P1.5 P1.6 P1.7 |
| FW-MOD-002 | `core/system_controller.*` | Runtime/Boot | (Aktuell faktisch nicht als zentrale Laufzeitsteuerung genutzt) | In/Out derzeit minimal | kein | keiner direkt | niedrig | P1.2 |
| FW-MOD-003 | `tasks/safety_task.*` | Runtime/Boot | Core-1 Safety-Loop fuer Aktor/Sensor-nahe Ausfuehrung | In: Notify-Bits, Queues; Out: Safety-Aktionen, Rule-Eval | kein | harte Safety-Ausfuehrung | kritisch | P1.2 P1.5 P1.6 |
| FW-MOD-004 | `tasks/communication_task.*` | Runtime/Boot | Core-0 Kommunikationsloop (WiFi/MQTT/Portal/Pub-Drain) | In: Netzwerkzustand; Out: reconnect/heartbeat/publish-drain | kein | beeinflusst Safe-Fallback bei Disconnect | hoch | P1.2 P1.6 |
| FW-MOD-005 | `tasks/actuator_command_queue.*` | Runtime/Boot | Thread-sicherer Transfer von Aktor-Commands zu Core 1 | In: MQTT Command; Out: queued command | RAM Queue | verhindert Core-Races | hoch | P1.2 P1.5 P1.6 |
| FW-MOD-006 | `tasks/sensor_command_queue.*` | Runtime/Boot | Thread-sicherer Transfer von Sensor-Commands zu Core 1 | In: MQTT Sensor command; Out: queued measurement trigger | RAM Queue | verhindert Core-Races | mittel | P1.2 P1.3 P1.6 |
| FW-MOD-007 | `tasks/publish_queue.*` | Runtime/Boot | Core-uebergreifende Publish-Entkopplung (M3) | In: publish jobs; Out: MQTT publish on core0 | RAM Queue | senkt Deadlock/Race-Risiko | hoch | P1.2 P1.6 |
| FW-MOD-008 | `tasks/config_update_queue.*` | Runtime/Boot | Queue fuer Config-Push Core0->Core1 inkl. zentrales Parse | In: raw config JSON; Out: handler invocations | RAM Queue | verhindert Config-Races | kritisch | P1.2 P1.4 P1.6 |
| FW-MOD-009 | `tasks/rtos_globals.*` | Runtime/Boot | gemeinsame RTOS Sync-Primitiven | In/Out: Mutex/Globals | RAM | indirekte Laufzeitsicherheit | mittel | P1.2 |
| FW-MOD-010 | `services/sensor/sensor_manager.*` | Sensorik | Sensor-Registry, Messzyklen, Publish, Value-Cache | In: SensorConfig, Trigger; Out: SensorReading/MQTT | RAM Cache (ValueCache) | liefert Basis fuer Offline-Rule-Eval | kritisch | P1.2 P1.3 P1.4 P1.5 P1.6 |
| FW-MOD-011 | `services/sensor/sensor_factory.*` | Sensorik | Erzeugung/Zuordnung von Sensortreibern | In: sensor_type/config; Out: driver mapping | kein | indirekt | mittel | P1.3 |
| FW-MOD-012 | `services/sensor/pi_enhanced_processor.*` | Sensorik | lokale Zusatzverarbeitung/Hilfsverarbeitung | In: Rohmesswerte; Out: aufbereitete Werte | kein | indirekt | mittel | P1.3 |
| FW-MOD-013 | `drivers/i2c_sensor_protocol.*` | Sensorik | I2C-Protokolllese-/schreibpfad fuer Sensorzugriffe | In: Adresse/Register; Out: Raw bytes | kein | Sensor-Fehlertoleranz | hoch | P1.3 |
| FW-MOD-014 | `models/sensor_registry.*` | Sensorik | statische Sensor-Mappings/Typzuordnung | In: Typname; Out: Mappingdaten | kein | indirekt | mittel | P1.3 |
| FW-MOD-015 | `services/actuator/actuator_manager.*` | Aktorik | Aktor-Registry, Command-Ausfuehrung, Status/Response Publishing | In: MQTT Commands, Config; Out: Driver calls, Status/Alerts | RAM (runtime state) | zentrale Aktor-Safety-Schnittstelle | kritisch | P1.2 P1.5 P1.6 |
| FW-MOD-016 | `services/actuator/safety_controller.*` | Aktorik | Emergency-Stop / Recovery / Isolationslogik | In: reason/gpio/subzone; Out: Stop/Resume-Befehle | RAM emergency state | direkter Safety-Kern | kritisch | P1.5 |
| FW-MOD-017 | `services/actuator/actuator_drivers/iactuator_driver.h` | Aktorik | Aktor-Driver-Contract | In: normalized/binary command; Out: hardware actions | kein | erzwingt Safety-Hooks in Treibern | hoch | P1.5 |
| FW-MOD-018 | `services/actuator/actuator_drivers/pump_actuator.*` | Aktorik | Pump/Relay Treiber inkl. runtime protection | In: setValue/setBinary; Out: GPIO/PWM effects | RAM timer/state | max-runtime/cooldown relevant | hoch | P1.5 |
| FW-MOD-019 | `services/actuator/actuator_drivers/pwm_actuator.*` | Aktorik | PWM Aktorsteuerung | In: normalized value; Out: PWM duty | kein | Not-Aus ueber Interface | hoch | P1.5 |
| FW-MOD-020 | `services/actuator/actuator_drivers/valve_actuator.*` | Aktorik | Binare Ventilsteuerung | In: ON/OFF; Out: GPIO state | kein | Not-Aus ueber Interface | hoch | P1.5 |
| FW-MOD-021 | `services/communication/wifi_manager.*` | Netzwerk/MQTT/WiFi | WiFi-Verbindung, Retry/Circuit-Breaker | In: WiFiConfig; Out: WLAN connect status | kein | Disconnect beeinflusst Safe-Pfade | hoch | P1.2 P1.6 |
| FW-MOD-022 | `services/communication/mqtt_client.*` | Netzwerk/MQTT/WiFi | MQTT connect/pub/sub, callbacks, heartbeat, backoff | In: MQTTConfig, queue payloads; Out: broker traffic | optional offline buffer (PubSubClient path) | Safety-Pfade auf ACK/Disconnect | kritisch | P1.2 P1.5 P1.6 |
| FW-MOD-023 | `services/communication/http_client.*` | Netzwerk/MQTT/WiFi | HTTP Hilfszugriffe (erg. Kommunikationspfad) | In: URL/Request; Out: response | kein | keiner direkt | niedrig | P1.6 |
| FW-MOD-024 | `services/config/config_manager.*` | Config/Provisioning | Gesamt-Config laden/speichern/validieren, Cache/Diagnostics | In: JSON->Struct; Out: NVS writes, runtime configs | NVS stark | beeinflusst sicheren Betriebszustand | kritisch | P1.2 P1.4 P1.5 P1.6 |
| FW-MOD-025 | `services/config/config_response.*` | Config/Provisioning | standardisierte Config-ACK Responses | In: apply result/errors; Out: MQTT config_response | kein | signalisiert Fehlzustand sauber | hoch | P1.6 |
| FW-MOD-026 | `services/provisioning/provision_manager.*` | Config/Provisioning | AP/Portal Provisioning, Captive DNS, Validation, Reset | In: HTTP POST config; Out: gespeicherte Konfig + reboot | indirekt via ConfigManager/NVS | sicherer Start ohne Vollkonfig | hoch | P1.2 P1.6 |
| FW-MOD-027 | `services/config/storage_manager.*` | Persistenz (NVS) | gekapselte NVS-Reads/Writes/Namespace-Handling | In: keys/values; Out: persisted values | NVS Kernmodul | bei Fehlern sicherer degradierter Betrieb noetig | kritisch | P1.4 P1.5 |
| FW-MOD-028 | `services/safety/offline_mode_manager.*` | Safety/Watchdog/Failsafe | Offline-Mode State-Machine, Rule-Eval, NVS-Rules | In: disconnect/ack/reconnect + sensor cache; Out: actuator safe/control | NVS (`offline` namespace) + RAM shadow | zentraler Fallback bei Serververlust | kritisch | P1.2 P1.4 P1.5 P1.6 |
| FW-MOD-029 | `utils/watchdog_storage.*` | Safety/Watchdog/Failsafe | Persistenz/Diagnostik fuer WDT-Events | In: WDT counters/state; Out: NVS diag data | NVS (`wdt_diag`) | WDT-Nachvollziehbarkeit | hoch | P1.4 P1.5 |
| FW-MOD-030 | `drivers/gpio_manager.*` | Safety/Watchdog/Failsafe | Pin-Ownership, Safe-Mode, Subzone-safe | In: pin requests/commands; Out: pin mode/write | RAM pin state | muss als erstes initialisieren | kritisch | P1.2 P1.5 |
| FW-MOD-031 | `error_handling/error_tracker.*` | Diagnostics/Observability | Fehlerklassifikation, Buffer, MQTT Error Publish | In: error events; Out: logs + MQTT error topic | RAM ringbuffer | fruehes Erkennen kritischer Fehler | hoch | P1.5 P1.6 |
| FW-MOD-032 | `error_handling/circuit_breaker.*` | Diagnostics/Observability | Schutz vor wiederholten Kommunikationsfehlern | In: success/failure events; Out: OPEN/HALF_OPEN gating | RAM state | verhindert Eskalation bei Instabilitaet | hoch | P1.5 P1.6 |
| FW-MOD-033 | `error_handling/health_monitor.*` | Diagnostics/Observability | Health-Snapshots (heap, wifi, mqtt, watchdog) + publish | In: runtime telemetry; Out: diagnostics topic | RAM snapshot | fruehe Degradationsdetektion | hoch | P1.2 P1.4 P1.5 P1.6 |
| FW-MOD-034 | `utils/logger.*` | Diagnostics/Observability | strukturierte Serial/Buffer Logs mit Tag/Level | In: log calls; Out: serial + ringbuffer | RAM ringbuffer | Diagnose fuer Safety-Faelle | mittel | P1.2 P1.5 |
| FW-MOD-035 | `utils/topic_builder.*` | Utilities/Basisinfrastruktur | zentrale Topic-Konstruktion | In: esp_id/kaiser_id/gpio; Out: topic strings | kein | vermeidet Topic-Fehlrouting | hoch | P1.6 |
| FW-MOD-036 | `utils/time_manager.*` | Utilities/Basisinfrastruktur | NTP-Sync + stabile Timestamps | In: WiFi availability; Out: unix ts/format | RAM sync state | Zeitbasis fuer ACK/timeout/diagnostics | hoch | P1.2 P1.6 |
| FW-MOD-037 | `drivers/i2c_bus.*` | Utilities/Basisinfrastruktur | I2C-Busverwaltung | In: bus init/read/write; Out: bytes/status | kein | Sensor-Kommunikationsstabilitaet | hoch | P1.3 |
| FW-MOD-038 | `drivers/onewire_bus.*` | Utilities/Basisinfrastruktur | OneWire-Busverwaltung | In: ROM/addrs; Out: raw temp data | kein | Sensor-Kommunikationsstabilitaet | hoch | P1.3 |
| FW-MOD-039 | `drivers/pwm_controller.*` | Utilities/Basisinfrastruktur | PWM-Hardwareabstraktion | In: duty settings; Out: PWM signal | kein | Aktor-Sicherheitswirkung indirekt | hoch | P1.5 |
| FW-MOD-040 | `utils/onewire_utils.*` | Utilities/Basisinfrastruktur | OneWire ROM-Helfer/Parsing | In: ROM string/bytes; Out: normalized forms | kein | indirekt | niedrig | P1.3 |
| FW-MOD-041 | `utils/json_helpers.h` | Utilities/Basisinfrastruktur | JSON-Hilfen fuer robustes Parsing | In: JsonObject; Out: typed fields | kein | verhindert Parsingfehler-Pfade | mittel | P1.6 |
| FW-MOD-042 | `models/*.h` (`config_types`, `sensor_types`, `actuator_types`, `mqtt_messages`, `system_types`, `watchdog_types`, `offline_rule`, `error_codes`) | Utilities/Basisinfrastruktur | zentrale Datentypen + Error-Codes | In/Out: type contracts fuer alle Layer | teilweise NVS-relevante Strukturfelder | starke Safety-Auswirkung bei Schemafehlern | hoch | P1.2 P1.3 P1.4 P1.5 P1.6 P1.7 |
| FW-MOD-043 | `tasks/intent_contract.*` | Runtime/Boot | Intent-Metadaten (correlation_id, TTL), Safety-Epoch, Outcome-Publish/Outbox | In: JSON-Payloads/Topics; Out: MQTT Outcomes | RAM/NVS pending replay | TTL/Epoch invalidiert Commands/Config-Intents | hoch | P1.2 P1.5 P1.6 |
| FW-MOD-044 | `tasks/command_admission.*` | Runtime/Boot | Gate fuer CONFIG/SENSOR/ACTUATOR/SYSTEM vor Queue/Execute | In: SystemState, Registration, Recovery-Intent | kein | blockiert unsichere Commands bei Safe/Error/Pending | hoch | P1.2 P1.5 P1.6 |
| FW-MOD-045 | `services/config/runtime_readiness_policy.*` | Config/Provisioning | Readiness-Entscheid aus Sensor/Aktor/Offline-Rule Counts | In: Snapshot; Out: Decision fuer Events/ACK | kein | beeinflusst Diagnose/ACK-Payload-Felder | mittel | P1.2 P1.6 |
| FW-MOD-046 | `tasks/emergency_broadcast_contract.h` | Safety/Watchdog/Failsafe | statischer Contract fuer Broadcast-Emergency JSON | In: Payload-Felder; Out: normalisierte Command-Erkennung | kein | Parsing/Auth-Entscheidung Emergency | hoch | P1.5 P1.6 |

## 5) Kritikalitaets-Ranking (Top-10)

1. `FW-MOD-001` `main.cpp` (Boot- und Routing-Nadeloehr)
2. `FW-MOD-022` `mqtt_client.*` (Kommandokanal + ACK/Disconnect-Pfade)
3. `FW-MOD-028` `offline_mode_manager.*` (lokale Safety bei Serververlust)
4. `FW-MOD-015` `actuator_manager.*` (Aktor-Ausfuehrung)
5. `FW-MOD-030` `gpio_manager.*` (Safe-Mode und Pin-Konflikte)
6. `FW-MOD-024` `config_manager.*` (Konfigurationsintegritaet)
7. `FW-MOD-027` `storage_manager.*` (NVS-Persistenzkern)
8. `FW-MOD-003` `safety_task.*` (Core-1 Safety-Lauf)
9. `FW-MOD-008` `config_update_queue.*` (Race-freie Config-Uebernahme)
10. `FW-MOD-016` `safety_controller.*` (Emergency-Stop Kette)

## 6) Verweise auf Folgeartefakte

- Abhaengigkeiten/Knoten/Kanten: `.claude/auftraege/Auto_One_Architektur/esp32/paket-01-esp32-abhaengigkeitskarte.md`
- Contract-Seedlist (4 Kernketten): `.claude/auftraege/Auto_One_Architektur/esp32/paket-01-esp32-contract-seedlist.md`

## 7) Hand-off in Folgepakete

### Kernmodule fuer Lifecycle-Analyse (P1.2)
- `main.cpp`, `safety_task.*`, `communication_task.*`, `config_update_queue.*`
- `intent_contract.*`, `command_admission.*`, `runtime_readiness_policy.*`
- `mqtt_client.*`, `wifi_manager.*`, `time_manager.*`
- `offline_mode_manager.*`, `actuator_manager.*`, `sensor_manager.*`

### Kernmodule fuer Sensorhandling (P1.3)
- `sensor_manager.*`, `sensor_factory.*`, `pi_enhanced_processor.*`
- `i2c_bus.*`, `onewire_bus.*`, `i2c_sensor_protocol.*`, `sensor_registry.*`
- `topic_builder.*`, relevante `models/sensor_types.h`

### Offene Fragen fuer P1.2/P1.3
- Exakter Legacy-Pfad, wenn `setup()` vor Task-Erstellung frueh endet (Provisioning-Branch): welche Features sind dann bewusst deaktiviert?
- Welche Multi-Core-Invarianten gelten fuer Config-Rollout unter Last (mehrere Config-Pushes + laufende Messungen)?
- Welche Sensorpfade liefern lokal verarbeitete Werte vs. strikt Raw-only je Sensortyp in allen Codezweigen?
- Wo liegen harte Timing-Budgets fuer Safety-Notify (`NOTIFY_EMERGENCY_STOP`) unter hoher MQTT-Last?

## 8) Ergebnisbewertung P1.1

- Die ESP32-Modullandkarte ist fuer P1.2-P1.7 belastbar vorhanden.
- Kritische Knoten, Kopplungspunkte und Safety-relevante Module sind markiert.
- Die drei Kernartefakte (Inventar, Abhaengigkeiten, Contract-Seeds) sind konsistent aufeinander abgestimmt.
