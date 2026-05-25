# P1.1 — ESP32 Offene Risiken (El Trabajante Firmware)

**Paket:** 01  
**Analyse-Datum:** 2026-04-04  
**Perspektive:** Inventar-Sicht (nicht Betrieb/Testing)

---

## Top-10 Risiken aus Inventar-Sicht

### R-001 — God-Object main.cpp (CRITICAL)

**Kategorie:** Architektur  
**Beschreibung:** Die gesamte Boot-Logik, MQTT-Message-Routing, Safety-Mechanismen P1–P5, alle on-connect-Hooks und globale Zustandsverwaltung sind in `main.cpp` konzentriert (~2000+ Zeilen). Die `core/`-Module (application.cpp, main_loop.cpp, system_controller.cpp) sind leere Stubs.  
**Auswirkung:** Jede Änderung hat systemweiten Wirkungsradius. Testbarkeit ohne Hardware/Simulation quasi unmöglich. Konkurrierende Zugriffe von Core 0 und Core 1 auf globale State-Variablen schwer nachzuverfolgen.  
**Folgepaket:** P1.2 (Lifecycle-Analyse wird das vollständig dokumentieren)

---

### R-002 — NVS kein Rollback bei Teil-Konfiguration (HIGH)

**Kategorie:** Persistenz / Datenintegrität  
**Beschreibung:** Config-Push verarbeitet Sensoren, Aktoren und Offline-Rules sequentiell. Bei einem NVS-Schreibfehler in der Mitte (z.B. nach 2 von 5 Sensoren) bleibt die Konfiguration in einem inkonsistenten Halbzustand. Es gibt keinen Rollback-Mechanismus.  
**Auswirkung:** ESP32 bootet mit halb-konfiguriertem Zustand → unvorhersehbares Verhalten. RuntimeReadinessPolicy kann fehlschlagen → STATE_CONFIG_PENDING_AFTER_RESET.  
**Folgepaket:** P1.4 (NVS-Analyse), P1.5 (Safety)

---

### R-003 — MQTT-Backend-Dualität (HIGH)

**Kategorie:** Architektur / Testbarkeit  
**Beschreibung:** Zwei völlig verschiedene MQTT-Backends (ESP-IDF für esp32_dev, PubSubClient für Xiao/Wokwi) hinter derselben MQTTClient-API. Safety-Mechanismen (xTaskNotify, Publish-Queue-Architektur) funktionieren nur vollständig im ESP-IDF-Pfad. Im PubSubClient-Pfad werden direkte function calls verwendet (flushActuatorCommandQueue + safetyController.emergencyStopAll direkt).  
**Auswirkung:** Wokwi-CI-Tests decken nicht alle RTOS-Sicherheitspfade ab. Das Produktiv-System (esp32_dev) ist strukturell anders als das Testsystem.  
**Folgepaket:** P1.2, P1.5

---

### R-004 — OfflineRule NVS-Blob APPEND-ONLY Schema (HIGH)

**Kategorie:** Persistenz / Downgrade-Risiko  
**Beschreibung:** Die `OfflineRule`-Struktur wird als binärer Blob in NVS persistiert. Das Struct-Layout ist APPEND-ONLY (Kommentar: "DO NOT REORDER — NVS blob byte layout"). Neue Felder (z.B. time_filter_enabled, days_of_week_mask) wurden am Ende angefügt.  
**Auswirkung:** Firmware-Downgrade auf eine ältere Version kann neue Felder nicht lesen → undefined behavior bei Offline-Rules. Es gibt keinen Versions-Header im Blob.  
**Folgepaket:** P1.4, P1.5

---

### R-005 — PublishQueue Overflow → Silent Drop (MEDIUM-HIGH)

**Kategorie:** Kommunikation / Datenverlust  
**Beschreibung:** Die Publish-Queue (Core 1 → Core 0) hat **10** Slots (~22 KB Heap, SSOT `El Trabajante/src/tasks/publish_queue_constants.h` `PUBLISH_QUEUE_SIZE`; früher 8/AUT-362, historisch 15/AUT-344; AUT-481 P3). queuePublish() ist non-blocking und gibt false zurück wenn die Queue voll ist. Shed ab fill≥5; actuator/status defer ab fill≥4. Adaptive Drain 1–2/Tick bei gesundem Transport. Es gibt keine Retry-Logik für gedroppte non-critical Publishes.  
**Auswirkung:** Bei hoher Sensor-Last (Burst über die Queue-Tiefe hinaus) oder langsamer MQTT-Verbindung können Sensor-Readings verloren gehen. Der Server erhält dann kein vollständiges Bild.  
**Folgepaket:** P1.6

---

### R-006 — ACK-Timeout 120s + 5s-Prüfintervall = 125s Worst-Case (MEDIUM-HIGH)

**Kategorie:** Safety  
**Beschreibung:** `SERVER_ACK_TIMEOUT_MS = 120000` (2 Minuten). Der Safety-Task prüft alle ~5 Sekunden. Worst-case: 125 Sekunden bis `setAllActuatorsToSafeState()` ausgelöst wird.  
**Auswirkung:** Kritische Aktoren (Pumpen, Heizungen) laufen bis zu 2 Minuten unkontrolliert weiter nach Server-Ausfall. Für Bewässerungs-Szenarien ist das akzeptabel; für andere Anwendungen könnte das zu lang sein.  
**Folgepaket:** P1.5

---

### R-007 — library_manager.cpp ist leerer Stub (MEDIUM)

**Kategorie:** Feature-Vollständigkeit  
**Beschreibung:** `services/config/library_manager.h/cpp` ist ein leerer Stub (1 Zeile). Die Feature-Flags `DYNAMIC_LIBRARY_SUPPORT=1` und `OTA_LIBRARY_ENABLED=1` sind aktiv in platformio.ini, aber die Library-Manager-Implementierung existiert nicht.  
**Auswirkung:** STATE_LIBRARY_DOWNLOADING ist in der State-Machine definiert aber nie erreichbar. Feature-Flags suggerieren Funktionalität die nicht existiert.  
**Folgepaket:** P1.2

---

### R-008 — ORPHANED MQTT Topics (MEDIUM)

**Kategorie:** Kommunikation / Protokoll-Konsistenz  
**Beschreibung:** TopicBuilder hat mehrere Topics als ORPHANED markiert:
- `buildSensorBatchTopic()` — kein Server-Handler
- `buildBroadcastEmergencyTopic()` — ESP subscribed aber Server published nie darauf (laut mqtt_client.md)
- `buildSubzoneStatusTopic()` — kein Server-Handler
- `buildActuatorEmergencyTopic()` — redundant zu `actuator/{gpio}/alert`

**Auswirkung:** Code-Komplexität durch nicht genutzte Topics. Emergency-Broadcast-Topic-Subscription belegt Subscription-Slot ohne Nutzen.  
**Folgepaket:** P1.6

---

### R-009 — NB6/NB7/NB8 Bekannte Sensor-Konfigurationsfehler (HIGH, aber bekannt)

**Kategorie:** Sensorik / Datenintegrität  
**Beschreibung:** (Bereits in MEMORY.md dokumentiert):
- **NB6**: Sensor-Key `{gpio}_{sensor_type}` überschreibt bei 2+ gleichen Typen auf gleichem GPIO
- **NB7**: DS18B20 OneWire Add-Flow ignoriert User-Inputs (name, raw_value, unit) im Frontend
- **NB8**: Dual-Storage Desync zwischen `device_metadata.simulation_config` (JSON) und `sensor_configs` (DB)

**Auswirkung:** Diese Bugs führen zu inkorrekten Sensor-Konfigurationen und unterschiedlichen Ansichten auf Server vs. ESP32.  
**Folgepaket:** P1.3 (wird NB6 genau analysieren)

---

### R-010 — g_system_config als Global ohne Mutex (MEDIUM)

**Kategorie:** Thread-Safety  
**Beschreibung:** `g_system_config` (SystemConfig) ist eine globale Variable in main.cpp, die von beiden Cores gelesen und geschrieben wird. Kein Mutex schützt diese Variable. Kritisch bei `g_system_config.current_state`-Zugriffen die gleichzeitig aus Core 0 (MQTT-Handler) und Core 1 (Safety-Task) erfolgen können.  
**Auswirkung:** Potenziell korrupter SystemState → falsche CommandAdmission-Entscheidungen.  
**Folgepaket:** P1.2 (Lifecycle), P1.5 (Safety)

---

## Risiko-Matrix

| ID | Wahrscheinlichkeit | Auswirkung | Priorität |
|----|---------------------|-----------|----------|
| R-001 | Hoch (strukturell) | Hoch | CRITICAL |
| R-002 | Mittel | Hoch | HIGH |
| R-003 | Mittel | Hoch | HIGH |
| R-004 | Niedrig | Hoch | HIGH |
| R-005 | Mittel | Mittel | MEDIUM-HIGH |
| R-006 | Hoch (bei Server-Ausfall) | Mittel | MEDIUM-HIGH |
| R-007 | Hoch (permanent) | Niedrig | MEDIUM |
| R-008 | Hoch (permanent) | Niedrig | MEDIUM |
| R-009 | Hoch (bekannt) | Hoch | HIGH (bereits bekannt) |
| R-010 | Niedrig (Race-Window klein) | Mittel | MEDIUM |
