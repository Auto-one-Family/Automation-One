# Firmware-Lagebild — ESP32 El Trabajante
**Run:** ec-ista-2026-05-08  
**Datum:** 2026-05-08  
**Branch:** auto-debugger/work (read-only scan)  
**Log-Session:** Boot ESP_698EB4, t=0ms bis t=124170ms

---

## Methodik

1. ESP32-Log analysiert (vollständiger Session-Log, t=0–124170ms)
2. Codebase-Scan: `El Trabajante/src/**/*.{cpp,h}` — 53 Quelldateien gelesen
3. Grep-Analyse: CONFIG_PENDING_AFTER_RESET, saveSensorConfig, heartbeat_ack, handleActuatorConfig, NVS-Owner
4. Git-Diff: `git show HEAD vs. working tree` für runtime_readiness_policy.cpp
5. Cross-Layer: sensor_scheduler_service.py (El Servador) gegengeprüft

---

## Findings

### F1 — CRITICAL: require_actuator=true blockiert sensor-only Geräte dauerhaft

| Feld | Wert |
|------|------|
| ID | F1 |
| Kategorie | error |
| Schwere | CRITICAL |
| Schicht | El Trabajante |
| Linear | AUT-276 |

**Code-Beleg:**
- `El Trabajante/src/services/config/runtime_readiness_policy.cpp` (committed HEAD): `policy.require_actuator = true;`
- `El Trabajante/src/main.cpp:610-625` — `evaluatePendingExit()` → `evaluateRuntimeReadiness()` → loggt `decision_code`
- Uncommitted Fix im Working Tree: `policy.require_actuator = false;`

**Log-Beleg:**
```
[     20362] [WARNING ] [BOOT    ] [CONFIG] Pending exit blocked: MISSING_ACTUATORS (sensors=2, actuators=0, offline_rules=0)
[     20362] [WARNING ] [SYNC    ] [CONFIG] Runtime config still partial - staying in CONFIG_PENDING_AFTER_RESET
[     29008] [WARNING ] [BOOT    ] [ADMISSION] Sensor command rejected: CONFIG_PENDING_AFTER_RESET
[     40470] [WARNING ] [BOOT    ] [ADMISSION] Sensor command rejected: CONFIG_PENDING_AFTER_RESET
```

**Erläuterung:**
AUT-59 (Done) adressierte den Fall `offline_rules > 0, actuators = 0` per Auto-Exit. Der Fall `sensors > 0, actuators = 0, offline_rules = 0` (reiner Sensor-Node wie EC/pH-Sonde) ist nicht abgedeckt. Das Gerät bleibt dauerhaft in CONFIG_PENDING_AFTER_RESET, alle Commands werden permanently rejected. Der Fix (require_actuator = false) liegt uncommitted im Working Tree und muss committet werden.

---

### F2 — HIGH: Doppelter NVS-Write pro Sensor bei Config-Push

| Feld | Wert |
|------|------|
| ID | F2 |
| Kategorie | duplicate |
| Schwere | HIGH |
| Schicht | El Trabajante |
| Linear | AUT-277 |

**Code-Beleg:**
- `El Trabajante/src/services/sensor/sensor_manager.cpp:441` — `configManager.saveSensorConfig(config)` (update-Pfad)
- `El Trabajante/src/services/sensor/sensor_manager.cpp:546` — `configManager.saveSensorConfig(...)` (add-Pfad)
- `El Trabajante/src/main.cpp:4327` — zweiter `configManager.saveSensorConfig(config)` in `parseAndConfigureSensorWithTracking()`

**Log-Beleg (GPIO 32, ph):**
```
[     20040] [NVS] txn_begin ok lock_ms=0 owner=SafetyTask     ← Write #1 (sensor_manager.cpp:441)
[     20051] [NVS] ns_open ok ns=sensor_config ro=0
[     20070] [CONFIG] ConfigManager: Saved sensor config for GPIO 32
[     20071] [SENSOR]   ✅ Configuration persisted to NVS
[     20081] [SENSOR] Sensor Manager: Updated sensor on GPIO 32 (ph)
[     20082] [NVS] txn_begin ok lock_ms=0 owner=SafetyTask     ← Write #2 (main.cpp:4327)
[     20093] [NVS] ns_open ok ns=sensor_config ro=0
[     20111] [CONFIG] ConfigManager: Saved sensor config for GPIO 32
[     20111] [BOOT] Sensor configured: GPIO 32 (ph)
```

Verdoppelung des Flash-Wear für jede Sensor-Konfiguration. NVS-Mutex wird doppelt so lang belegt.

---

### F3 — HIGH: Doppelter NVS-Read ns=system_config bei heartbeat_ack

| Feld | Wert |
|------|------|
| ID | F3 |
| Kategorie | duplicate |
| Schwere | HIGH |
| Schicht | El Trabajante |
| Linear | AUT-278 |

**Code-Beleg:**
- `El Trabajante/src/main.cpp:2480` — `configManager.isDeviceApproved()` — öffnet system_config RO
- `El Trabajante/src/main.cpp:2481` — `configManager.getApprovalTimestamp()` — öffnet system_config RO erneut
- `El Trabajante/src/services/config/config_manager.cpp:1279-1289` — `isDeviceApproved()` je mit beginNamespace
- `El Trabajante/src/services/config/config_manager.cpp:1342-1348` — `getApprovalTimestamp()` je mit beginNamespace

**Log-Beleg (t=4205ms, erster heartbeat_ack):**
```
[      4205] [NVS] ns_open ok ns=system_config ro=1 lock_ms=0 owner=mqtt_task
[      4217] [NVS] ns_open ok ns=system_config ro=1 lock_ms=0 owner=mqtt_task
```
Wiederholt bei jedem heartbeat_ack (t=64335, t=124168). Takt: ~60s → 2 NVS-Reads/min dauerhaft.

---

### F4 — MEDIUM: SafetyTask als NVS-Owner bei Config-Handling — Tracing-Gap

| Feld | Wert |
|------|------|
| ID | F4 |
| Kategorie | tracing-gap |
| Schwere | MEDIUM |
| Schicht | El Trabajante |
| Linear | AUT-279 |

**Code-Beleg:**
- `El Trabajante/src/services/config/storage_manager.cpp:114` — `owner = pcTaskGetName(nullptr)`
- `El Trabajante/src/tasks/safety_task.cpp:51` — SafetyTask führt `processConfigUpdateQueue()` aus
- Technisch korrekt (Config-Update läuft auf Core 1 SafetyTask), aber misleading im Tracing

**Log-Beleg (t=20040ms):**
```
[     20040] [NVS] txn_begin ok lock_ms=0 owner=SafetyTask
```
`owner=SafetyTask` bei sensor_config Write — Safety-Kontext und Config-Kontext nicht unterscheidbar im Log.

---

### F5 — MEDIUM: Doppelter Log "Handling actuator configuration from MQTT"

| Feld | Wert |
|------|------|
| ID | F5 |
| Kategorie | duplicate |
| Schwere | MEDIUM |
| Schicht | El Trabajante |
| Linear | AUT-280 |

**Code-Beleg:**
- `El Trabajante/src/main.cpp:4355-4356` — `handleActuatorConfig()` mit `LOG_I(TAG, "Handling actuator configuration from MQTT")`
- `El Trabajante/src/services/actuator/actuator_manager.cpp:954-955` — `ActuatorManager::handleActuatorConfig()` mit identischem `LOG_I`

**Log-Beleg (t=20229ms):**
```
[     20229] [INFO] [BOOT    ] Handling actuator configuration from MQTT
[     20239] [INFO] [ACTUATOR] Handling actuator configuration from MQTT
[     20239] [INFO] [ACTUATOR] No actuators configured (sensor-only device)
```

---

### F6 — HIGH (Cross-Layer): Server sendet measure-Commands bevor ESP ready ist

| Feld | Wert |
|------|------|
| ID | F6 |
| Kategorie | error |
| Schwere | HIGH |
| Schicht | El Servador + El Trabajante |
| Linear | AUT-281 |

**Code-Beleg (Server):**
- `El Servador/god_kaiser_server/src/services/sensor_scheduler_service.py:364-406` — `_execute_scheduled_measurement()` prüft nur `esp.status != "online"`, kein `config_state`-Gate

**Code-Beleg (Firmware):**
- `El Trabajante/src/tasks/command_admission.cpp:35-42` — korrekte Rejection, aber kein NACK zurück an Server
- `El Trabajante/src/tasks/sensor_command_queue.cpp:127` — `STATE_CONFIG_PENDING_AFTER_RESET` Check

**Log-Beleg:**
```
[     20218] [CFGRESP] [CFGRESP] mqtt_ok=1 fail=0 [sensor] st=success ok_cnt=2 fail_cnt=0
[     28993] [MQTTIN] ...sensor/33/command pvw={"command": "measure"...}
[     29008] [WARNING] [ADMISSION] Sensor command rejected: CONFIG_PENDING_AFTER_RESET
[     40455] [MQTTIN] ...sensor/33/command pvw={"command": "measure"...}
[     40470] [WARNING] [ADMISSION] Sensor command rejected: CONFIG_PENDING_AFTER_RESET
```
Δt config_response→first-rejection: 8.8s. Server hat keinen Mechanismus um auf CONFIG_PENDING_EXIT zu warten.

---

### F7 — LOW: main.cpp Monolith — Config-Handler als freie Funktionen statt Manager-Delegation

| Feld | Wert |
|------|------|
| ID | F7 |
| Kategorie | overcomplexity |
| Schwere | LOW |
| Schicht | El Trabajante |
| Linear | AUT-282 |

**Code-Beleg:**
- `El Trabajante/src/main.cpp:4043-4353` — 310 Zeilen Config-Handler in main.cpp
- `El Trabajante/src/main.cpp:4355-4359` — triviale Wrapper-Funktion
- Struktureller Root-Cause für F2 (doppelter NVS-Write) und F5 (doppeltes Logging)

---

## Zusammenfassung

| ID | Schwere | Kategorie | Linear | Status |
|----|---------|-----------|--------|--------|
| F1 | CRITICAL | error | AUT-276 | Uncommitted Fix vorhanden |
| F2 | HIGH | duplicate | AUT-277 | Offen |
| F3 | HIGH | duplicate | AUT-278 | Offen |
| F4 | MEDIUM | tracing-gap | AUT-279 | Offen |
| F5 | MEDIUM | duplicate | AUT-280 | Offen |
| F6 | HIGH | error (Cross-Layer) | AUT-281 | Offen |
| F7 | LOW | overcomplexity | AUT-282 | Offen |

**Dedup-geprüft gegen:**
- AUT-59 (Done): offline_rules-only Auto-Exit — verwandt aber F1 ist separater verbleibender Fall
- AUT-61 (Done): Approval NVS Dedup — erledigt, F3 ist anderer Pfad (read statt write)

---

## Empfohlene Reihenfolge

1. **AUT-276** (CRITICAL): `require_actuator = false` committen — uncommitted Fix ist fertig
2. **AUT-277** (HIGH): NVS-Write in main.cpp:4327 entfernen — 2-Zeilen-Fix
3. **AUT-281** (HIGH): Server ESP-State-Gate in sensor_scheduler_service.py — Cross-Layer
4. **AUT-278** (MEDIUM): Approval-Status Batch-Read
5. **AUT-280** (MEDIUM): LOG_I in main.cpp:4356 entfernen
6. **AUT-279** (LOW): NVS Operation Context im Tracing
7. **AUT-282** (LOW): main.cpp Refactoring (strukturelles Langziel)
