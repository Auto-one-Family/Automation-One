# AutoOps ESP32 Error Report

**Erstellt:** 2026-03-31
**Modus:** A (Allgemeine Analyse — ESP32-bezogene Logs, Build-Status, Known Issues)
**Quellen analysiert:**
- `docker logs mqtt-broker --since 20m` (Container nicht aktiv)
- `.claude/reports/current/ESP32_DEBUG_REPORT.md`
- `.claude/reports/current/ESP32_DEV_REPORT.md`
- `.claude/reports/current/auftrag-ANALYSE-P4-NVS-sensor-read-konflikt-2026-03-31.md`
- `El Trabajante/src/services/safety/offline_mode_manager.h` + `.cpp`
- `El Trabajante/src/tasks/safety_task.h` + `.cpp`
- `El Trabajante/src/tasks/communication_task.h` + `.cpp`
- `El Trabajante/src/tasks/rtos_globals.h` + `.cpp`
- `El Trabajante/src/tasks/publish_queue.h`
- `El Trabajante/src/models/offline_rule.h`
- `El Trabajante/src/utils/watchdog_storage.h` + `.cpp`
- PlatformIO Build: `seeed_xiao_esp32c3` + `esp32_dev`

---

## 1. Zusammenfassung

Die ESP32-Firmware kompiliert fehlerfrei in beiden relevanten Environments (`esp32_dev` SUCCESS, `seeed_xiao_esp32c3` SUCCESS, 0 Errors, 0 Warnings). Der MQTT-Broker-Container ist derzeit nicht aktiv — keine Broker-Logs verfuegbar. Aus den bestehenden Analyse-Reports ergeben sich **1 kritischer offener Punkt** (server-seitig: `max_runtime_ms` fehlt im Config-Push) sowie mehrere Architektur-Hinweise und niedrig-priorisierte Designluecken, die bereits dokumentiert sind. Kein sofortiger Handlungsbedarf auf Firmware-Ebene.

---

## 2. Analysierte Quellen

| Quelle | Status | Bemerkung |
|--------|--------|-----------|
| `esp32_serial.log` | NICHT VERFUEGBAR | Kein laufendes Geraet, kein Serial-Capture |
| `mqtt-broker` Docker Container | NICHT AKTIV | `Error: No such container: mqtt-broker` |
| PlatformIO Build `esp32_dev` | SUCCESS | 0 Errors, 0 Warnings |
| PlatformIO Build `seeed_xiao_esp32c3` | SUCCESS | 0 Errors, 0 Warnings |
| `ESP32_DEBUG_REPORT.md` | OK gelesen | Safety-P1 Analyse vom 2026-03-30 |
| `ESP32_DEV_REPORT.md` | OK gelesen | SAFETY-P1 + P4 + RTOS-M0 Verifikation vom 2026-03-31 |
| `auftrag-ANALYSE-P4-NVS-sensor-read-konflikt-2026-03-31.md` | OK gelesen | P4-NVS Pre-Analyse |
| Neue Firmware-Dateien (safety/, tasks/, models/) | OK gelesen | Alle Dateien vorhanden und syntaktisch korrekt |

---

## 3. Build-Status

### 3.1 Environment: esp32_dev (Xtensa ESP32, 240MHz)

- **Status:** SUCCESS
- **Dauer:** 5.82 Sekunden (inkrementell — keine neuen Compiles noetig)
- **RAM-Nutzung:** 21.3% (69.652 von 327.680 Bytes)
- **Flash-Nutzung:** 86.9% (1.367.465 von 1.572.864 Bytes — Custom Partition 0x180000)
- **Build-Errors:** 0
- **Build-Warnings:** 0

**Flash-Hinweis (Schwere: Mittel):** 86.9% Flash-Auslastung auf `esp32_dev`. Jede weitere Funktion beansprucht den verbleibenden 13.1%-Puffer. Bezugspunkt ist `partitions_custom.csv` (app0/app1 je 0x180000 = 1.572.864 Bytes).

### 3.2 Environment: seeed_xiao_esp32c3 (RISC-V ESP32-C3)

- **Status:** SUCCESS
- **Dauer:** 17.30 Sekunden (Vollbuild inkl. Framework-Archivierung)
- **RAM-Nutzung:** 18.6% (60.820 von 327.680 Bytes)
- **Flash-Nutzung:** 92.2% (1.208.180 von 1.310.720 Bytes — Default Partition 0x140000)
- **Build-Errors:** 0
- **Build-Warnings:** 0

**Flash-Warnung (Schwere: Hoch):** 92.2% Flash-Auslastung auf `seeed_xiao_esp32c3` mit `default.csv` (1.310.720 Bytes). Das ist kein Fehler, aber der Spielraum fuer weitere Features ist sehr gering. Die Custom-Partition ist nur fuer `esp32_dev` konfiguriert — `seeed_xiao_esp32c3` nutzt `default.csv` (beabsichtigt gemaess ESP32_DEV_REPORT: M0-Anforderung erfuellt).

---

## 4. MQTT-Broker Status

| Check | Ergebnis |
|-------|----------|
| `docker logs mqtt-broker --since 20m` | Fehler: Container `mqtt-broker` nicht gefunden |
| Docker Compose Status | Nicht geprueft (Container-Name-Mismatch, kein System aktiv) |
| Live MQTT-Traffic | Nicht verfuegbar (kein Broker) |

**Bewertung:** Der MQTT-Broker laeuft derzeit nicht. Dies ist kein Firmware-Fehler — der Docker-Stack ist offenbar gestoppt. Fuer Firmware-Analyse ohne laufendes System hat dies keine Auswirkung. Vor Hardware-Tests muss der Stack gestartet werden (`docker compose up -d`).

---

## 5. Neue Firmware-Dateien — Code-Review

### 5.1 `src/services/safety/` (SAFETY-P4)

**`offline_mode_manager.h` / `.cpp`**

| Aspekt | Befund | Schwere |
|--------|--------|---------|
| Singleton-Pattern | Korrekt implementiert — `getInstance()`, `delete` Copy/Assign | OK |
| 4-State-Machine | ONLINE / DISCONNECTED / OFFLINE_ACTIVE / RECONNECTING — vollstaendig | OK |
| NVS-Persistenz | Namespace `"offline"`, Individual-Keys, Shadow-Copy, Change-Detection | OK |
| Stale-Sensor-Handling | `isnan(val) → continue` — kein falsches Triggern bei leerem Cache | OK |
| Calibration-Guard | `requiresCalibration()` prueft ph/ec/moisture/soil_moisture — defensiv korrekt | OK |
| Alias-Coverage | `soil_moisture` als Alias fuer `moisture` im Guard enthalten — Backward-Compat. | OK |
| NVS Shadow-Copy Kosmetik | `memcpy(..., sizeof(OfflineRule) * MAX_OFFLINE_RULES)` statt `offline_rule_count_` | Niedrig |

**Shadow-Copy Kosmetik-Detail (Zeile 378 in offline_mode_manager.cpp):**
```cpp
memcpy(offline_rules_shadow_, offline_rules_, sizeof(OfflineRule) * MAX_OFFLINE_RULES);
// MAX_OFFLINE_RULES (8) statt offline_rule_count_ — kein Memory-Bug
// (Arrays gleich gross), aber kopiert ggf. 0-initialisierte Eintraege extra.
```
Kein funktionaler Fehler. Arrays sind gleich gross, kein Out-of-Bounds.

### 5.2 `src/tasks/` (SAFETY-RTOS)

**`safety_task.h` / `.cpp` (Core 1, Priority 5)**

| Aspekt | Befund | Schwere |
|--------|--------|---------|
| Task-Pinning | `xTaskCreatePinnedToCore(..., SAFETY_TASK_CORE=1)` — korrekt | OK |
| WDT-Registration | `#ifndef WOKWI_SIMULATION esp_task_wdt_add(NULL)` — Guard korrekt | OK |
| Cross-Core-Notify | `xTaskNotifyWait(0, UINT32_MAX, &bits, 0)` — non-blocking, atomares Clear | OK |
| Notify-Bits | `NOTIFY_EMERGENCY_STOP=0x01`, `NOTIFY_MQTT_DISCONNECTED=0x02`, `NOTIFY_SUBZONE_SAFE=0x04` | OK |
| Stack-Monitoring | `uxTaskGetStackHighWaterMark` alle ~60s — gut fuer Diagnose | OK |
| Stack-Groesse | `SAFETY_TASK_STACK_SIZE = 8192` Bytes — identisch zur Firmware-Rules-Vorgabe | OK |
| `checkServerAckTimeout()` | Extern aus `main.cpp` — Forward-Declaration vorhanden | OK |
| Loop-Intervall | `vTaskDelay(pdMS_TO_TICKS(10))` — 10ms, Watchdog-kompatibel | OK |

**`communication_task.h` / `.cpp` (Core 0, Priority 3)**

| Aspekt | Befund | Schwere |
|--------|--------|---------|
| Task-Pinning | `COMM_TASK_CORE=0` — korrekt (WiFi-Stack auf Core 0) | OK |
| Provisioning-State | Mirror von loop()-Logik — vollstaendig portiert | OK |
| Pending-Approval-State | Korrekt — nur WiFi+MQTT aktiv | OK |
| Operational-State | WiFi/MQTT loop + alle Hilfsfunktionen | OK |
| Heap-Monitoring | `handleHeapMonitoring()` alle 60s mit Stack-HWM | OK |
| Boot-Counter-Reset | `handleBootCounterReset()` nach 60s stabil | OK |
| Stack-Groesse | `COMM_TASK_STACK_SIZE = 6144` Bytes | OK |
| Emoji in LOG_I | `"╔═══..."` und `"║  ✅ KONFIGURATION EMPFANGEN!          ║"` | Niedrig |

**Emoji-Hinweis:** `communication_task.cpp` Zeile 78 enthaelt `"║  ✅ KONFIGURATION EMPFANGEN!          ║"` mit UTF-8-Emoji. Dies kompiliert problemlos auf Xtensa/RISC-V, kann aber in Serial-Monitoren mit Latin-1-Encoding als Garbage erscheinen. Kein Compile-Fehler.

**`rtos_globals.h` / `.cpp` (RTOS-Mutexes)**

| Aspekt | Befund | Schwere |
|--------|--------|---------|
| 5 Mutexes | actuator / sensor / i2c / onewire / gpio_registry — alle erstellt | OK |
| NULL-Check nach Erstellung | Vorhanden — LOG_E bei Fehler | OK |
| Fehlende Panic-Reaktion | Bei Mutex-Create-Fehler nur LOG_E, kein `esp_restart()` oder Hang | Niedrig |

**Mutex-Create-Fehler-Detail:** Wenn Heap erschoepft ist und ein Mutex nicht erstellt werden kann, loggt `initRtosMutexes()` nur einen Fehler und faehrt fort. Die Tasks wuerden dann mit NULL-Handles arbeiten und bei `xSemaphoreTake(NULL, ...)` abstuerzen. Fuer Produktion waere ein `abort()` oder `esp_restart()` robuster — aber dies ist ein bekanntes Trade-off-Pattern im Embedded-Bereich.

**`publish_queue.h`**

| Aspekt | Befund | Schwere |
|--------|--------|---------|
| Queue-Groesse | `PUBLISH_QUEUE_SIZE=15`, je `~1156 B` → ~17.3 KB Heap | OK |
| Non-blocking | `queuePublish()` gibt `false` zurueck wenn voll — kein Block auf Core 1 | OK |
| Topic/Payload-Limits | `PUBLISH_TOPIC_MAX_LEN=128`, `PUBLISH_PAYLOAD_MAX_LEN=1024` | OK |

### 5.3 `src/models/offline_rule.h`

| Aspekt | Befund | Schwere |
|--------|--------|---------|
| `MAX_OFFLINE_RULES=8` | Als static const definiert (nicht `#define`) — korrekt | OK |
| `sensor_value_type[24]` | Festes char-Array, NUL-terminiert — kein dynamic allocation | OK |
| Alle Felder vorhanden | enabled, actuator_gpio, sensor_gpio, activate_below/above, deactivate_above/below, is_active, server_override | OK |
| Kein `#include <Arduino.h>` | Header ist platform-agnostisch (nur `<cstdint>`, `<cmath>`) | OK |

### 5.4 `src/utils/watchdog_storage.h` / `.cpp`

| Aspekt | Befund | Schwere |
|--------|--------|---------|
| `#ifndef NATIVE_TEST` Guard | Vollstaendige Implementierung nur auf ESP32-Target — native Tests nicht betroffen | OK |
| Rolling 24h-Fenster | `pruneAndAppend()` prueft Epoch-Validity und 24h-Cutoff | OK |
| `kMaxHistEntries=24` unused | `(void)kMaxHistEntries` in `pruneAndAppend()` — String-Laengen-Limit (220 Chars) stattdessen | Niedrig |
| 3x WDT Threshold | `c >= 3 → LOG_C(...)` — Logging vorhanden, SafeMode-Trigger noch nicht implementiert | Mittel |
| NVS-Namespace | `"wdt_diag"` — eigener Namespace, keine Kollision mit anderen Namespaces | OK |

---

## 6. Known Issues aus bestehenden Reports

### Kritisch (aus ESP32_DEV_REPORT.md — C1)

| Nr | Phase | Befund | Datei | Handlungsbedarf |
|----|-------|--------|-------|-----------------|
| C1 | SAFETY-P1 Mech.C | **Server sendet `max_runtime_ms` NICHT im Config-Push.** ESP32 nutzt 1h-Default fuer alle Aktoren. | `El Servador/.../config_builder.py` — `_build_actuator_payload()` fehlt das Feld | `server-dev`: `max_runtime_ms` aus DB-Aktuatorkonfiguration lesen und in Config-Dict schreiben |

**Auswirkung C1:** Pumpen und Ventile bleiben bei Verbindungsverlust bis zu **1 Stunde** aktiv, bis der Runtime-Timeout greift. Mit korrektem Server-Wert waere dies konfigurierbar pro Aktor-Typ.

### Warnung (aus ESP32_DEV_REPORT.md — W1)

| Nr | Phase | Befund | Datei:Zeile | Handlungsbedarf |
|----|-------|--------|-------------|-----------------|
| W1 | SAFETY-P1 Mech.C | Default `max_runtime_ms = 3600000UL` (1h) — Anforderung empfiehlt 120.000ms (2min) | `actuator_types.h:33` | Optional: Default reduzieren. Mit C1-Fix wird Default ohnehin ueberschrieben. |

### Architektur-Hinweise (aus P4-NVS Analyse — kein Blocker)

| Nr | Thema | Befund | Handlungsbedarf |
|----|-------|--------|-----------------|
| A1 | Analoge Sensoren in Offline-Rules | pH/EC/Moisture liefern RAW ADC-Werte (0-4095) — keine physikalischen Einheiten ohne Server-Kalibrierung. Offline-Rule-Thresholds in pH-Einheiten waeren bedeutungslos. | Server soll analoge Sensoren aus Offline-Rules ausschliessen ODER kalibrierte ADC-Thresholds senden. Firmware-Guard (`requiresCalibration()`) ist bereits implementiert und faengt diesen Fall ab. |
| B1 | Multi-Rule-Konflikt | Mehrere Rules auf denselben `actuator_gpio`: last-wins (hoechster Index gewinnt). Kein Safety-First-System. | Server-seitige Validierung beim Config-Build: keine zwei Rules mit identischem `actuator_gpio`. |
| E1 | `clean_session = true` + QoS 2 | Config-Push QoS 2 wird bei Disconnect des ESP32 vom Broker geloescht (clean_session=true). Naechster Heartbeat-Zyklus (~120s) korrigiert. | Optional: `disable_clean_session = 1` in `mqtt_client.cpp:172` setzen. Kein Blocker fuer P4-NVS. |

### Watchdog SafeMode — nicht implementiert (aus ESP32_DEBUG_REPORT.md)

| Befund | Datei:Zeile | Status |
|--------|-------------|--------|
| 3x Watchdog in 24h → SafeMode ist auskommentiert (TODO) | `main.cpp:461-467` | **TEILWEISE GELOEST** durch `watchdog_storage.cpp`: `LOG_C` bei Schwellwert-Erreichen. Aber SafeMode-Eintritt fehlt noch — nur Logging. |

### Subscriptions nach Reconnect (aus ESP32_DEBUG_REPORT.md)

| Befund | Status |
|--------|--------|
| Subscriptions nach MQTT-Reconnect nicht wiederhergestellt | **GELOEST** laut ESP32_DEV_REPORT.md: `subscribeToAllTopics()` in `onMqttConnectCallback()` aufgerufen (main.cpp:152/183). 11 Topics werden nach jedem Connect/Reconnect neu subscribed. |

---

## 7. Speicher-Uebersicht

| Metrik | `esp32_dev` | `seeed_xiao_esp32c3` |
|--------|-------------|----------------------|
| RAM gesamt | 327.680 B | 327.680 B |
| RAM genutzt | 69.652 B (21.3%) | 60.820 B (18.6%) |
| Flash gesamt (Partition) | 1.572.864 B | 1.310.720 B |
| Flash genutzt | 1.367.465 B (86.9%) | 1.208.180 B (92.2%) |
| RTOS Publish-Queue | ~17.3 KB Heap (15 × ~1156 B) | ~17.3 KB Heap |
| Offline-Rules RAM | ~480 B BSS (OfflineRule[8]) | ~480 B BSS |
| Value-Cache RAM | ~720 B BSS (ValueCacheEntry[20]) | ~720 B BSS |

**Gesamt-Heap-Overhead SAFETY-RTOS (schaetzweise):**
- Publish-Queue: ~17.3 KB
- 5 Mutexes: ~200 B
- Safety-Task Stack: 8.192 B
- Communication-Task Stack: 6.144 B
- Offline-Rules + Value-Cache: ~1.2 KB BSS
- **Total RTOS-Overhead: ~33 KB** — bei 78.7% freiem RAM auf `esp32_dev` unkritisch.

---

## 8. Bewertung & Empfehlung

### Root Cause der offenen Punkte

Die Firmware ist funktional vollstaendig fuer SAFETY-P1, SAFETY-P4 und SAFETY-RTOS-M0. Der einzige echte Handlungsbedarf liegt **server-seitig** (C1: `max_runtime_ms` fehlt in `config_builder.py`). Alle anderen Punkte sind entweder bereits implementiert, kosmetisch oder dokumentierte Architektur-Trade-offs.

### Naechste Schritte

| Prioritaet | Schritt | Verantwortlich |
|------------|---------|----------------|
| **Hoch** | C1: `_build_actuator_payload()` in `config_builder.py` um `max_runtime_ms` erweitern | `server-dev` Agent |
| Mittel | `watchdog_storage.cpp`: 3x-WDT-Threshold triggert nur LOG_C — SafeMode-Eintritt implementieren wenn SafeMode-Policy definiert ist | `esp32-dev` Agent (nach TM-Decision) |
| Niedrig | `disable_clean_session = 1` in `mqtt_client.cpp:172` setzen (QoS-2-Reliability bei Disconnect) | `esp32-dev` Agent |
| Niedrig | `max_runtime_ms` Default von 3.600.000ms auf 120.000ms reduzieren | `esp32-dev` Agent (nach C1-Fix) |
| Info | Flash-Auslastung `seeed_xiao_esp32c3` bei 92.2% beobachten — kein Handlungsbedarf, aber kein Spielraum fuer grosse neue Features | TM |

---

## 9. Code-Referenz Schnellzugriff

| Befund | Datei:Zeile |
|--------|-------------|
| `max_runtime_ms = 3600000UL` Default | `El Trabajante/src/models/actuator_types.h:33` |
| `SERVER_ACK_TIMEOUT_MS = 120000UL` | `El Trabajante/src/main.cpp:89` |
| `subscribeToAllTopics()` | `El Trabajante/src/main.cpp:152` |
| `onMqttConnectCallback()` mit Re-Subscribe | `El Trabajante/src/main.cpp:183` |
| `setAllActuatorsToSafeState()` in handleDisconnection | `El Trabajante/src/services/communication/mqtt_client.cpp:829-833` |
| `offlineModeManager.onDisconnect()` | `El Trabajante/src/services/communication/mqtt_client.cpp:836` |
| `requiresCalibration()` Guard | `El Trabajante/src/services/safety/offline_mode_manager.cpp:93` |
| Shadow-Copy MAX_OFFLINE_RULES Kosmetik | `El Trabajante/src/services/safety/offline_mode_manager.cpp:378` |
| `initRtosMutexes()` ohne Panic bei Fehler | `El Trabajante/src/tasks/rtos_globals.cpp:19-27` |
| Watchdog 3x LOG_C ohne SafeMode | `El Trabajante/src/utils/watchdog_storage.cpp:139-141` |
| `clean_session = true` (disable_clean_session=0) | `El Trabajante/src/services/communication/mqtt_client.cpp:172` |
| `_build_actuator_payload()` fehlt max_runtime_ms | `El Servador/god_kaiser_server/src/services/config_builder.py` |
