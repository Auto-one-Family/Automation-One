# ESP32 Speicheranalyse — SAFETY-MEM

**Datum:** 2026-03-30
**Auftrag:** SAFETY-MEM (Voraussetzung für SAFETY-P1 + SAFETY-P4)
**Environment:** `esp32_dev` (ESP32 WROOM-32, 4MB Flash, 520KB SRAM)
**Status:** ✅ Analyse abgeschlossen — 5 Optimierungen implementiert

---

## TL;DR (Für P1/P4 Entscheidung)

> **KORREKTUR zur Auftrags-Prämisse:** Das "90%-Problem" ist **Flash (92.2%)**, NICHT RAM.
> Statisches RAM ist nur 25% belegt. Runtime-Heap nach WiFi+MQTT hat ~187KB frei (~72%).

| Frage | Antwort |
|-------|---------|
| **P1 RAM-Headroom?** | ✅ 22 Bytes benötigt — 187.000 Bytes frei |
| **P4 RAM-Headroom?** | ✅ 276 Bytes benötigt — 187.000 Bytes frei |
| **P4 NVS-Headroom?** | ✅ ~2,3 KB benötigt — ~4-6 KB frei |
| **Flash für P1+P4?** | ⚠️ 7-12 KB benötigt — 101.731 Bytes frei (92.2% → ~93%) |
| **Implementierung freigegeben?** | ✅ Ja — P1 und P4 können beginnen |

---

## 1. Compile-Time Speicher-Report

### 1.1 BEFORE Optimierung (Ausgangszustand)

| Bereich | Belegt | Gesamt | Prozent | Status |
|---------|--------|--------|---------|--------|
| **Flash** | 1.208.513 Bytes | 1.310.720 Bytes | **92.2%** | 🔴 KRITISCH |
| **RAM (BSS+data)** | 81.764 Bytes | 327.680 Bytes | **25.0%** | ✅ OK |

### 1.2 AFTER Optimierung (nach diesem Auftrag)

| Bereich | Belegt | Gesamt | Prozent | Ersparnis |
|---------|--------|--------|---------|-----------|
| **Flash** | 1.208.989 Bytes | 1.310.720 Bytes | **92.2%** | ~0 Bytes |
| **RAM (BSS+data)** | 68.508 Bytes | 327.680 Bytes | **20.9%** | **−13.256 Bytes** |

> **Hinweis:** Flash-Einsparungen aus den Buffer-Reduktionen sind minimal (BSS ist DRAM, kein Flash). Flash-Optimierung erfordert Code-Entfernung (siehe Abschnitt 6).

### 1.3 Flash Section-Analyse (AFTER)

| Section | Größe | Beschreibung |
|---------|-------|--------------|
| `.flash.text` | 858.019 Bytes | Ausführbarer Code |
| `.flash.rodata` | 236.172 Bytes | Konstante Strings, Lookup-Tables |
| `.flash.rodata_noload` | 15.895 Bytes | Read-only ohne Load |
| `.iram0.text` | 87.551 Bytes | IRAM-Code (ISR, WiFi critical path) |
| **Flash gesamt** | **1.208.989 Bytes** | **92.2% von 1.310.720** |

### 1.4 RAM Section-Analyse (AFTER)

| Section | Größe | Beschreibung |
|---------|-------|--------------|
| `.dram0.data` | 26.220 Bytes | Initialisierte globale Variablen |
| `.dram0.bss` | 42.288 Bytes | Null-initialisierte globale Variablen |
| **Statisches RAM gesamt** | **68.508 Bytes** | **20.9% von 327.680** |
| **Heap verfügbar** | **259.172 Bytes** | Heap beginnt direkt nach BSS |

---

## 2. Top-10 Speicherverbraucher

### 2.1 Statisches RAM (BSS) — identifiziert via `xtensa-esp32-elf-nm`

| # | Symbol | Größe | Beschreibung | Datei |
|---|--------|-------|--------------|-------|
| 1 | `Logger::log_buffer_[50]` | **7.400 Bytes** | Log-Ringbuffer (50 × LogEntry 148B) | logger.h |
| 2 | `ErrorTracker::error_buffer_[30]` | **4.200 Bytes** | Error-Ringbuffer (30 × ErrorEntry ~140B) | error_tracker.h |
| 3 | `MQTTClient::offline_buffer_[25]` | **800 Bytes** | Offline-Nachrichten-Buffer | mqtt_client.h |
| 4 | `SensorManager::sensors_[20]` | **~1.680 Bytes** | SensorConfig-Array (20 × ~84B) | sensor_manager.h |
| 5 | `ActuatorManager::actuators_[12]` | **~1.200 Bytes** | RegisteredActuator-Array (12 × ~100B) | actuator_manager.h |
| 6 | `TopicBuilder::topic_buffer_` | **352 Bytes** | Statische Topic-Char-Arrays (256+32+64) | topic_builder.h |
| 7 | ConfigManager-Caches | **~240 Bytes** | WiFiConfig + KaiserZone + SystemConfig | config_manager.h |
| 8 | `.dram0.data` Globals | **26.220 Bytes** | Initialisierte globale Variablen (Arduino/ESP-IDF) | Framework |

> **BEFORE/AFTER Vergleich für Logger:**
> - BEFORE: `_ZZN6Logger11getInstanceEvE8instance` = **14.816 Bytes** (100 Entries)
> - AFTER: ~7.400 Bytes (50 Entries) — **Einsparung: 7.416 Bytes**

### 2.2 Größte Flash-Verbraucher (Code-Größe via nm)

| # | Symbol | Größe | Beschreibung |
|---|--------|-------|--------------|
| 1 | Lambda in `setup()` | **26.742 Bytes** | MQTT-Message-Handler-Callback-Lambda |
| 2 | `setup()` | **10.844 Bytes** | Boot-Sequenz |
| 3 | `SensorManager::configureSensor()` | **5.242 Bytes** | Sensor-Konfiguration |
| 4 | `SensorManager::performMeasurementForConfig()` | **4.360 Bytes** | Sensor-Messung |
| 5 | `ProvisionManager::handleProvision()` | **4.113 Bytes** | Provisioning-Handler |
| 6 | `WebServer::_parseForm()` | **3.426 Bytes** | HTTP-Formular-Parser |
| 7 | `loop()` | **2.478 Bytes** | Haupt-Loop |
| 8 | `ConfigManager::loadSensorConfig()` | **2.674 Bytes** | NVS Sensor-Load |

> **Größte Code-Datei:** `main.cpp.o` = 2,35 MB (inkl. Debug-Info)

---

## 3. Dynamic Heap zur Laufzeit (Schätzung)

### 3.1 Heap-Budget-Rechnung

```
Heap nach Boot (static BSS beendet):      259.172 Bytes  (100%)
  − WiFi-Stack (dynamisch):                −65.000 Bytes
  = Nach WiFi connect:                     194.172 Bytes  (75%)

  − PubSubClient Buffer (2048 Bytes):       −2.048 Bytes
  − MQTT Client internals:                  −1.500 Bytes
  = Nach MQTT connect:                     190.624 Bytes  (74%)

  − SensorConfig String-Inhalte (20×~150B): −3.000 Bytes
  − ActuatorConfig String-Inhalte (12×~80B): −960 Bytes
  − ArduinoJson-Allokationen (temporal):    −2.048 Bytes  (peak)
  = Normalbetrieb free heap:              ~184.616 Bytes  (~71%)
```

**Kritisches Risiko — Offline-Buffer wenn voll (BEHOBEN durch MEM-OPT-3):**
```
BEFORE: 100 MQTTMessage × (topic ~100B + payload ~512B) = ~61.200 Bytes Heap-Spike!
AFTER:   25 MQTTMessage × (topic ~100B + payload ~512B) = ~15.300 Bytes Heap-Spike
Einsparung: −45.900 Bytes worst-case Heap
```

### 3.2 DynamicJsonDocument Analyse

Alle 37 Vorkommen nutzen `DynamicJsonDocument` (kein `StaticJsonDocument`).
Kritische Größen:

| Größe | Anzahl | Heap-Nutzung | Vorkommen |
|-------|--------|--------------|-----------|
| ~~4096 Bytes~~ → **2048 Bytes** | 2 | Peak 2.048 Bytes | handleSensorConfig, handleActuatorConfig |
| 2048 Bytes | 2 | Peak 2.048 Bytes | Subzone-Handlers |
| 1024 Bytes | 3 | Peak 1.024 Bytes | Verschiedene Handlers |
| 512 Bytes | 5 | Peak 512 Bytes | Kleinere Handlers |
| 384 Bytes | 5 | Peak 384 Bytes | ACK/Error Responses |
| 256 Bytes | 20 | Peak 256 Bytes | Standard Responses |

> **Hinweis:** Documents werden nach Scope-Ende freigegeben. Echte simultane Allokation unwahrscheinlich (single-threaded loop). Heap-Fragmentierung bei häufigen alloc/free möglich.

---

## 4. NVS-Budget

### 4.1 NVS-Partition (default.csv)
- Partition-Größe: **20.480 Bytes** (5 × 4096-Byte-Seiten)
- NVS-Overhead (State-Pages): ~2 Seiten = 8.192 Bytes
- **Nutzbare Kapazität: ~12.288 Bytes** (3 Datenseiten)

### 4.2 NVS-Belegung (worst case — vollständig konfiguriertes Gerät)

| Namespace | Keys (worst case) | Geschätzte Größe |
|-----------|-------------------|-----------------|
| `wifi_config` | 7 Keys | ~350 Bytes |
| `zone_config` | 7 Keys | ~350 Bytes |
| `system_config` | 6 Keys | ~300 Bytes |
| `subzone_config` | ~15 Keys | ~600 Bytes |
| `sensor_config` | 201 Keys (20×10 + count) | ~4.020 Bytes |
| `actuator_config` | 133 Keys (12×11 + count) | ~2.660 Bytes |
| **Gesamt** | **~369 Keys** | **~8.280 Bytes** |

**NVS-Headroom:** 12.288 − 8.280 = **~4.008 Bytes frei**

### 4.3 P4 NVS-Bedarf

P4 benötigt: 8 Regeln × 9 Keys + 1 Count = **73 neue Keys ≈ 2.336 Bytes**

```
Freier NVS nach P4: 4.008 − 2.336 = ~1.672 Bytes
Auslastung: (8.280 + 2.336) / 12.288 = ~86%
```

> **⚠️ NVS ist nach P4 bei ~86% — KEIN kritisches Problem, aber neue NVS-Features**
> **sollten NVS erst prüfen bevor sie hinzukommen.**

---

## 5. Struct-Größen (berechnet aus Code-Analyse)

| Struct | Größe (geschätzt) | Array | Total BSS |
|--------|-------------------|-------|-----------|
| `SensorConfig` | ~84 Bytes | [20] | ~1.680 Bytes |
| `ActuatorConfig` | ~80 Bytes | [12 via RegisteredActuator] | — |
| `RegisteredActuator` | ~100 Bytes | [12] | ~1.200 Bytes |
| `LogEntry` | ~148 Bytes | [50] | ~7.400 Bytes |
| `ErrorEntry` | ~140 Bytes | [30] | ~4.200 Bytes |
| `MQTTMessage` | ~32 Bytes (static) | [25] | ~800 Bytes |
| `RuntimeProtection` | ~12 Bytes | — | (in ActuatorConfig) |

> **SensorConfig hat 5 String-Felder** (sensor_type, sensor_name, subzone_id, operating_mode,
> onewire_address). Jedes String-Objekt: 12 Bytes statisch + Heap-Allokation für Inhalt.

---

## 6. Implementierte Optimierungen

### MEM-OPT-1: Logger-Buffer 100 → 50 (`logger.h`)
```cpp
// BEFORE
static const size_t MAX_LOG_ENTRIES = 100;  // 14.816 Bytes BSS

// AFTER
static const size_t MAX_LOG_ENTRIES = 50;   // 7.400 Bytes BSS
```
**Einsparung: 7.416 Bytes BSS-RAM**
**Risiko: Keine — Log-History wird früher überschrieben (kein Datenverlust)**

### MEM-OPT-2: ErrorTracker-Buffer 50 → 30 (`error_tracker.h`)
```cpp
// BEFORE
static const size_t MAX_ERROR_ENTRIES = 50;  // 7.232 Bytes BSS

// AFTER
static const size_t MAX_ERROR_ENTRIES = 30;  // 4.200 Bytes BSS
```
**Einsparung: ~3.032 Bytes BSS-RAM**
**Risiko: Keine — Error-History wird früher überschrieben**

### MEM-OPT-3: MQTT Offline-Buffer 100 → 25 (`mqtt_client.h`)
```cpp
// BEFORE
static const uint16_t MAX_OFFLINE_MESSAGES = 100;  // 3.200 Bytes BSS + 61.200 Bytes Heap-Risk

// AFTER
static const uint16_t MAX_OFFLINE_MESSAGES = 25;   // 800 Bytes BSS + 15.300 Bytes Heap-Risk
```
**Einsparung: 2.400 Bytes BSS + bis zu 45.900 Bytes Heap-Spike verhindert**
**Risiko: Bei >25 offline Messages gehen ältere verloren — akzeptabel (MQTT reconnect << 25 Messages)**

### MEM-OPT-4: JSON-Doc 4096 → 2048 (`main.cpp`, `actuator_manager.cpp`)
```cpp
// BEFORE — in handleSensorConfig() und handleActuatorConfig()
DynamicJsonDocument doc(4096);

// AFTER — MQTT_MAX_PACKET_SIZE=2048, kein Payload kann größer sein
DynamicJsonDocument doc(2048);
```
**Einsparung: 2.048 Bytes Heap-Peak bei Config-Push**
**Risiko: Keine — MQTT_MAX_PACKET_SIZE=2048 ist die harte Grenze**

### MEM-OPT-5: CORE_DEBUG_LEVEL 3 → 2 (`platformio.ini` esp32_dev)
```ini
# BEFORE
-DCORE_DEBUG_LEVEL=3  # DEBUG (verbose ESP-IDF logging)

# AFTER
-DCORE_DEBUG_LEVEL=2  # INFO (only important ESP-IDF messages)
```
**Flash-Einsparung: Minimal (ESP-IDF internal logs bereits optimiert) — ≈ 0 Bytes**
**Risiko: Keine — ESP-IDF verbose debug messages nicht für Produktion benötigt**

### Gesamt-Ergebnis nach allen Optimierungen

| Metrik | BEFORE | AFTER | Differenz |
|--------|--------|-------|-----------|
| Static RAM (BSS+data) | 81.764 B (25.0%) | 68.508 B (20.9%) | **−13.256 B** |
| `.dram0.bss` | 55.544 B | 42.288 B | −13.256 B |
| `.dram0.data` | 26.220 B | 26.220 B | — |
| Heap verfügbar | 245.916 B | 259.172 B | **+13.256 B** |
| Flash | 1.208.513 B (92.2%) | 1.208.989 B (92.2%) | ~0 B |
| Offline-Buffer Heap-Risk | ~61.200 B (worst case) | ~15.300 B | −45.900 B |

---

## 7. Headroom-Rechnung für P1 + P4

### 7.1 RAM-Headroom

```
Freier Heap im Normalbetrieb (AFTER):     ~184.000 Bytes
P1 RAM-Bedarf:                                  +22 Bytes (Flag + Timer)
P4 RAM-Bedarf:                                 +276 Bytes (OfflineRule[8] + State)
                                          ─────────────
Freier Heap nach P1+P4:                  ~183.702 Bytes  (~71%)
```

**✅ RAM: Ample Headroom. P1+P4 passen problemlos.**

### 7.2 Flash-Headroom

```
Freies Flash (AFTER):                    101.731 Bytes  (7.8%)
P1 Code-Schätzung:                        −3.000 Bytes  (Disconnect-Handler, ACK-Timeout)
P4 Code-Schätzung:                        −8.000 Bytes  (OfflineRule, NVS-Persistence, Logic)
                                          ─────────────
Freies Flash nach P1+P4:                  ~90.731 Bytes  (~6.9%)
```

**⚠️ Flash: Passt — aber NUR noch ~90KB Reservepuffer für zukünftige Features.**

### 7.3 NVS-Headroom

```
Freier NVS (AFTER):                       ~4.008 Bytes
P4 NVS-Bedarf:                            −2.336 Bytes  (73 neue Keys für 8 Regeln)
                                          ─────────────
Freier NVS nach P4:                       ~1.672 Bytes  (~86% belegt)
```

**⚠️ NVS: Eng nach P4. Keine weiteren NVS-intensiven Features ohne Partition-Anpassung.**

---

## 8. Weitere Optimierungsvorschläge (NICHT implementiert — Future Work)

### Quick-Wins für Flash (wenn weiterer Headroom benötigt):

| Maßnahme | Geschätzte Einsparung | Aufwand | Risiko |
|----------|----------------------|---------|--------|
| `CORE_DEBUG_LEVEL=1` in Produktion | ~5-10 KB Flash | Niedrig | Niedrig |
| `WebServer` nur bei Provisioning aktiv | ~15-25 KB Flash | Mittel | Mittel |
| `MAX_SENSORS=10` für esp32_dev | ~840 B RAM + Mini Flash | Niedrig | Niedrig |
| `StaticJsonDocument` für 256B-Docs (20 Stk.) | Heap-Fragmentierung ↓ | Mittel | Niedrig |
| `F()` macro für Log-Strings | 0 (ESP32 nutzt flash bereits) | — | — |

> **HINWEIS zu F() auf ESP32:** Anders als AVR lädt ESP32 String-Literals bereits aus Flash
> über Memory-Mapped IO. `F()` / `PROGMEM` hat auf ESP32 keinen RAM-Vorteil!

### NVS-Budget (wenn P4+ weitere Regeln):
Falls mehr als 8 Offline-Regeln benötigt werden, empfiehlt sich eine Custom-Partition-Table:
```csv
# partitions_custom.csv
nvs,      data, nvs,     0x9000,  0x8000,  # 32KB statt 20KB
```
Dadurch würde NVS von 12KB auf ~28KB nützbar anwachsen.

---

## 9. Fazit

### Korrektur der Auftrags-Prämisse
Die Firmware hatte **KEIN 90% RAM-Problem**. Der Fehler lag in der Verwechslung von:
- **Flash: 92.2%** → Das ist das echte "90%-Problem" gewesen (Code + Read-only Daten)
- **RAM (BSS+data): 25%** → Unkritisch
- **Runtime Heap: ~29% belegt** (nach WiFi+MQTT, ~184KB frei) → Unkritisch

### Hauptrisiken (nach Optimierung)
1. **Flash (92.2%) ist die eigentliche Engstelle** — nicht RAM
2. **DynamicJsonDocument überall** — erhöht Heap-Fragmentierung (kein stack-basierter Ansatz)
3. **SensorConfig/ActuatorConfig mit Strings** — jeder String allokiert individuell auf dem Heap

### P1 + P4 Freigabe
**✅ FREIGEGEBEN** — Beide Safety-Features können implementiert werden:
- RAM: 184.000 Bytes frei >> 298 Bytes benötigt
- NVS: ~4.008 Bytes frei >> 2.336 Bytes benötigt
- Flash: 101.731 Bytes frei >> ~11.000 Bytes benötigt (≈ Grenze 7.8% → 6.9%)

**Nach P1+P4 verbleiben ~90KB Flash frei (~6.9%).** Keine weiteren Features ohne Flash-Analyse.

---

*Report erstellt: 2026-03-30 | Umgebung: esp32_dev | Tool: xtensa-esp32-elf-size + Manual Analysis*
