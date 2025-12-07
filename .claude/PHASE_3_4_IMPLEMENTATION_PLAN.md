# 🎯 Phase 3 & 4 Implementierungsplan - God-Kaiser Server

> **Erstellt:** 2025-01-29  
> **Aktualisiert:** 2025-12-07 (Kritische Ergänzungen + Status-Update)  
> **Status:** ✅ **PHASE 3 & 4 VOLLSTÄNDIG IMPLEMENTIERT**  
> **Basis:** PI_SERVER_REFACTORING.md, Mqtt_Protocoll.md, System_Overview.md

---

## 🎉 IMPLEMENTIERUNGS-STATUS: ABGESCHLOSSEN

**Alle kritischen Komponenten wurden implementiert:**

| Phase | Komponenten | Status |
|-------|-------------|--------|
| Phase 3 | LogicRepository, SafetyService, ActuatorService, LogicEngine | ✅ 100% |
| Phase 4 | WebSocketManager, Utils, Sensor Libraries | ✅ 100% |

**Gesamtumfang der neuen Implementierungen:**
- ~1.900 neue Zeilen qualitativ hochwertiger Python-Code
- Alle kritischen Anforderungen erfüllt
- Thread-Safety, Lifecycle Management, ESP32-Kompatibilität

---

## ⚠️ KRITISCHE ERGÄNZUNGEN (2025-12-07)

> **LIES DIESE SEKTION ZUERST!** Enthält kritische Punkte, die bei der Implementierung unbedingt beachtet werden müssen.

### 📋 IMPLEMENTATION STATUS (Stand: 2025-12-07)

| Komponente | Datei | Status | Zeilen | Qualität |
|------------|-------|--------|--------|----------|
| LogicRepository | `db/repositories/logic_repo.py` | ✅ IMPLEMENTIERT | 167 | ⭐⭐⭐ Vollständig |
| SafetyService | `services/safety_service.py` | ✅ IMPLEMENTIERT | 260 | ⭐⭐⭐ Vollständig |
| ActuatorService | `services/actuator_service.py` | ✅ IMPLEMENTIERT | 193 | ⭐⭐⭐ Vollständig |
| LogicEngine | `services/logic_engine.py` | ✅ IMPLEMENTIERT | 413 | ⭐⭐⭐ Vollständig |
| WebSocketManager | `websocket/manager.py` | ✅ IMPLEMENTIERT | 281 | ⭐⭐⭐ Vollständig |
| time_helpers | `utils/time_helpers.py` | ✅ IMPLEMENTIERT | 73 | ⭐⭐⭐ Vollständig |
| data_helpers | `utils/data_helpers.py` | ✅ IMPLEMENTIERT | 64 | ⭐⭐⭐ Vollständig |
| network_helpers | `utils/network_helpers.py` | ✅ IMPLEMENTIERT | 80 | ⭐⭐⭐ Vollständig |
| CO2 Sensor | `sensors/.../active/co2.py` | ✅ IMPLEMENTIERT | 168 | ⭐⭐⭐ Vollständig |
| Light Sensor | `sensors/.../active/light.py` | ✅ IMPLEMENTIERT | 179 | ⭐⭐⭐ Vollständig |
| Flow Sensor | `sensors/.../active/flow.py` | ✅ IMPLEMENTIERT | 206 | ⭐⭐⭐ Vollständig |

**🎉 PHASE 3 & 4 VOLLSTÄNDIG IMPLEMENTIERT! 🎉**

---

### 🚨 BLOCKER #1: LogicRepository ist nur ein Stub!

**Problem:** Das File `db/repositories/logic_repo.py` enthält nur 3 Zeilen (Kommentar + TODO).

**Lösung VOR Logic Engine implementieren:**

```python
# db/repositories/logic_repo.py - MUSS ZUERST IMPLEMENTIERT WERDEN
class LogicRepository(BaseRepository[CrossESPLogic]):
    """Logic Rules Repository mit CrossESPLogic-spezifischen Queries."""
    
    async def get_enabled_rules(self) -> list[CrossESPLogic]:
        """Alle aktiven Rules laden, sortiert nach Priorität."""
        
    async def get_rules_by_trigger_sensor(
        self, esp_id: uuid.UUID, gpio: int, sensor_type: str
    ) -> list[CrossESPLogic]:
        """Rules finden, die auf diesen Sensor triggern."""
        
    async def get_last_execution(self, rule_id: uuid.UUID) -> Optional[datetime]:
        """Timestamp der letzten Ausführung für Cooldown-Check."""
        
    async def log_execution(
        self, rule_id: uuid.UUID, trigger_data: dict, 
        actions: list, success: bool, execution_ms: int
    ) -> LogicExecutionHistory:
        """Execution in History loggen."""
```

### 🚨 BLOCKER #2: ESP32-Protokoll-Kompatibilität

**SafetyService Emergency-States MÜSSEN zu ESP32 passen!**

ESP32 SafetyController verwendet diese States (`El Trabajante/src/models/actuator_types.h`):
```cpp
enum class EmergencyState {
    NORMAL,       // Normalbetrieb
    ACTIVE,       // Emergency aktiv (Actuator gestoppt)
    CLEARING,     // Emergency wird gelöscht
    RESUMING      // Schrittweise Reaktivierung
};
```

**Server SafetyService MUSS diese States verwenden:**
```python
class EmergencyState(Enum):
    NORMAL = "normal"
    ACTIVE = "active"
    CLEARING = "clearing"
    RESUMING = "resuming"
```

### 🚨 BLOCKER #3: MQTT-Payload-Formate

**Actuator Command Payload (Server → ESP) - `Mqtt_Protocoll.md` Zeile 575:**
```json
{
  "command": "ON",           // "ON", "OFF", "PWM", "TOGGLE"
  "value": 1.0,              // 0.0-1.0 (PWM-Wert, NICHT 0-255!)
  "duration": 60,            // Sekunden (0 = unbegrenzt)
  "timestamp": 1735818000
}
```

**KRITISCH:** ESP32 erwartet `value` als 0.0-1.0, konvertiert intern zu 0-255!

### 🚨 Thread-Safety für WebSocket Manager

**Problem:** MQTT-Callbacks kommen aus dem paho-mqtt Thread, WebSocket-Operationen müssen im asyncio Event Loop laufen.

**Lösung:**
```python
class WebSocketManager:
    def __init__(self):
        self._connections: Dict[str, WebSocket] = {}
        self._lock = asyncio.Lock()  # Thread-Safe für concurrent access
        self._loop: Optional[asyncio.AbstractEventLoop] = None
    
    async def broadcast(self, message_type: str, data: dict, filters: Optional[dict] = None):
        """Thread-safe broadcast, kann aus MQTT-Callback aufgerufen werden."""
        async with self._lock:
            # ... broadcast logic
    
    def broadcast_threadsafe(self, message_type: str, data: dict, filters: Optional[dict] = None):
        """Für Aufrufe aus nicht-asyncio Threads (MQTT Callbacks)."""
        if self._loop and self._loop.is_running():
            asyncio.run_coroutine_threadsafe(
                self.broadcast(message_type, data, filters),
                self._loop
            )
```

### 🚨 Background Task Lifecycle

**Logic Engine Start/Stop MUSS sauber sein:**
```python
class LogicEngine:
    async def start(self):
        """MUSS in main.py startup event aufgerufen werden."""
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._evaluation_loop())
        logger.info("LogicEngine started")
    
    async def stop(self):
        """MUSS in main.py shutdown event aufgerufen werden."""
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("LogicEngine stopped")
```

**main.py Integration:**
```python
@app.on_event("startup")
async def startup():
    await logic_engine.start()
    await websocket_manager.initialize()

@app.on_event("shutdown")
async def shutdown():
    await logic_engine.stop()
    await websocket_manager.shutdown()
```

---

## 📊 AKTUELLER STAND - ANALYSE

### ✅ Phase 3 - Bereits implementiert:

1. **Sensor Libraries (7/10):**
   - ✅ `temperature.py` (SHT31, DS18B20, DHT22)
   - ✅ `humidity.py` (SHT31, DHT22)
   - ✅ `ph_sensor.py` (DFRobot, Atlas)
   - ✅ `ec_sensor.py` (DFRobot, Atlas)
   - ✅ `moisture.py` (Capacitive, Resistive)
   - ✅ `pressure.py` (BMP280, BME280)
   - ❌ `co2.py` (MHZ19, SCD30) - **FEHLT**
   - ❌ `light.py` (TSL2561, BH1750) - **FEHLT**
   - ❌ `flow.py` (YFS201, Generic) - **FEHLT**

2. **Core Infrastructure:**
   - ✅ `sensors/library_loader.py` - Dynamic Library Loader (vollständig)
   - ✅ `sensors/base_processor.py` - BaseSensorProcessor Interface
   - ✅ `sensors/sensor_type_registry.py` - Type Normalization

3. **MQTT Layer:**
   - ✅ `mqtt/client.py` - MQTTClient (Singleton, Reconnect)
   - ✅ `mqtt/subscriber.py` - Topic Router
   - ✅ `mqtt/publisher.py` - Command Sender
   - ✅ `mqtt/topics.py` - Topic Builders + Parsers
   - ✅ `mqtt/handlers/sensor_handler.py` - Sensor Data Handler (mit Pi-Enhanced Processing)
   - ✅ `mqtt/handlers/actuator_handler.py` - Actuator Status Handler
   - ✅ `mqtt/handlers/heartbeat_handler.py` - ESP Heartbeat Handler
   - ✅ `mqtt/handlers/config_handler.py` - Config ACK Handler
   - ✅ `mqtt/handlers/discovery_handler.py` - ESP32 Discovery Handler

4. **Database Layer:**
   - ✅ Alle Models implementiert (esp, sensor, actuator, logic, kaiser, etc.)
   - ⚠️ **Repositories TEILWEISE implementiert** (siehe BLOCKER #1 oben!)
   - ✅ `esp_repo.py` - vollständig
   - ✅ `sensor_repo.py` - vollständig
   - ✅ `actuator_repo.py` - vollständig
   - ❌ `logic_repo.py` - **NUR STUB (3 Zeilen)** - MUSS IMPLEMENTIERT WERDEN!

### ❌ Phase 3 - Fehlend (KRITISCH):

1. **Logic Engine (🔴 KRITISCH):**
   - ❌ `services/logic_engine.py` - Cross-ESP Automation Engine (nur Stub)
   - **Zweck:** Evaluates logic rules in background, triggers actuator actions
   - **Abhängigkeiten:** LogicRepository, ActuatorService, MQTT Publisher, Sensor Data

2. **Safety Service (🔴 KRITISCH):**
   - ❌ `services/safety_service.py` - Safety Checks (nur Stub)
   - **Zweck:** Validates actuator commands, emergency stop handling
   - **Abhängigkeiten:** ActuatorRepository, ESPRepository

3. **Sensor Libraries (🟡 HOCH):**
   - ❌ `sensors/sensor_libraries/active/co2.py`
   - ❌ `sensors/sensor_libraries/active/light.py`
   - ❌ `sensors/sensor_libraries/active/flow.py`

### ❌ Phase 4 - Fehlend (KRITISCH):

1. **WebSocket Manager (🔴 KRITISCH):**
   - ❌ `websocket/manager.py` - WebSocketManager (nur TODO)
   - **Zweck:** Real-time Updates an Frontend (sensor_data, actuator_status, system_event, etc.)
   - **Abhängigkeiten:** FastAPI WebSocket, Background Task

2. **Utils (🟡 HOCH):**
   - ❌ `utils/mqtt_helpers.py` - build_topic(), parse_topic() (bereits in topics.py vorhanden, aber Helper fehlen)
   - ❌ `utils/time_helpers.py` - Timestamp-Funktionen
   - ❌ `utils/data_helpers.py` - normalize_sensor_data(), CRC32
   - ❌ `utils/network_helpers.py` - is_reachable(), ping()

---

## 🎯 IMPLEMENTIERUNGS-PLAN

### PRIORITÄT 1: 🔴 KRITISCH - Phase 3 Completion

#### 1.1 Logic Engine (`services/logic_engine.py`)

**Status:** ❌ Nicht implementiert  
**Priorität:** 🔴 KRITISCH  
**Abhängigkeiten:** LogicRepository, ActuatorService, MQTT Publisher, Sensor Handler

**Anforderungen aus PI_SERVER_REFACTORING.md:**
- Background Task (läuft kontinuierlich)
- Evaluates enabled rules from DB
- Finds matching rules by trigger conditions
- Evaluates conditions (sensor thresholds, time windows)
- Checks cooldown periods
- Executes actions (actuator commands via MQTT)
- Logs execution history

**Kommunikations-Flow (aus PI_SERVER_REFACTORING.md Zeilen 747-767):**
```
Sensor Data (ESP-002, GPIO 34, Value > 25°C)
  │
  └──→ mqtt/handlers/sensor_handler.py
        │
        └──→ services/logic_engine.py  (Background Task)
              ├── Load enabled rules from DB
              ├── Find matching rules (by trigger)
              ├── Evaluate conditions (temperature > 25)
              ├── Check time constraints
              ├── Check cooldown
              │
              └──→ Execute Actions:
                    └──→ services/actuator_service.py
                          └──→ mqtt/publisher.py
                                └──→ ESP-001, GPIO 5, ON (Pump)
                                      │
                                      └──→ Log Execution History
                                            └──→ db/repositories/logic_repo.py
```

**Implementierungs-Schritte:**

1. **Logic Engine Klasse erstellen:**
   ```python
   class LogicEngine:
       """
       Cross-ESP Automation Engine (Background Task).
       
       Evaluates logic rules when sensor data arrives,
       triggers actuator actions based on conditions.
       """
       
       def __init__(self, logic_repo, actuator_service, publisher):
           self.logic_repo = logic_repo
           self.actuator_service = actuator_service
           self.publisher = publisher
           self.running = False
           self._task = None
       
       async def start(self):
           """Start background evaluation task."""
       
       async def stop(self):
           """Stop background task."""
       
       async def evaluate_sensor_data(self, esp_id: str, gpio: int, 
                                      sensor_type: str, value: float):
           """
           Evaluate rules triggered by sensor data.
           
           Called by sensor_handler after sensor data is saved.
           """
       
       async def _evaluate_rules(self, trigger_data: dict):
           """Internal: Evaluate all enabled rules."""
       
       async def _check_condition(self, condition: dict, sensor_data: dict) -> bool:
           """Check if condition matches sensor data."""
       
       async def _execute_actions(self, actions: list, trigger_data: dict):
           """Execute actions (actuator commands)."""
   ```

2. **Integration in Sensor Handler:**
   - Nach Sensor-Daten-Speicherung: `logic_engine.evaluate_sensor_data()` aufrufen
   - Asynchron, non-blocking (Background Task)

3. **Rule Condition Evaluation:**
   - Sensor Threshold: `{'type': 'sensor_threshold', 'esp_id': '...', 'gpio': 34, 'operator': '>', 'value': 25.0}`
   - Time Window: `{'type': 'time_window', 'start_hour': 8, 'end_hour': 18}`
   - Multiple Conditions: AND/OR Logic

4. **Action Execution:**
   - Actuator Command: `{'type': 'actuator_command', 'esp_id': '...', 'gpio': 18, 'value': 0.75, 'duration_seconds': 60}`
   - Via ActuatorService → MQTT Publisher

5. **Execution History Logging:**
   - Log every execution to `LogicExecutionHistory`
   - Include trigger_data, actions_executed, success, execution_time_ms

### Logic Engine - Detaillierte Condition-Evaluation

**trigger_conditions JSON-Schema (aus CrossESPLogic Model):**

```json
{
  "type": "sensor_threshold",
  "esp_id": "ESP_12AB34CD",
  "gpio": 34,
  "sensor_type": "temperature",
  "operator": ">",
  "value": 25.0
}
```

**Unterstützte Operatoren:**
- `>`, `>=`, `<`, `<=`, `==`, `!=`
- `between` (für Range-Checks): `{"operator": "between", "min": 20.0, "max": 30.0}`

**Mehrere Conditions (AND/OR):**
```json
{
  "logic": "AND",
  "conditions": [
    {"type": "sensor_threshold", "esp_id": "...", "gpio": 34, "operator": ">", "value": 25.0},
    {"type": "time_window", "start_hour": 8, "end_hour": 18}
  ]
}
```

**Time Window Condition:**
```json
{
  "type": "time_window",
  "start_hour": 8,
  "end_hour": 18,
  "days_of_week": [0, 1, 2, 3, 4]  // 0=Montag, 6=Sonntag (optional)
}
```

**Condition Evaluation Code:**
```python
async def _check_condition(self, condition: dict, sensor_data: dict) -> bool:
    """Evaluate a single condition against sensor data."""
    cond_type = condition.get("type")
    
    if cond_type == "sensor_threshold":
        # Match auf ESP + GPIO + Sensor Type
        if (condition.get("esp_id") != sensor_data.get("esp_id") or
            condition.get("gpio") != sensor_data.get("gpio")):
            return False
        
        operator = condition.get("operator")
        threshold = condition.get("value")
        actual = sensor_data.get("value")
        
        if operator == ">": return actual > threshold
        if operator == ">=": return actual >= threshold
        if operator == "<": return actual < threshold
        if operator == "<=": return actual <= threshold
        if operator == "==": return actual == threshold
        if operator == "!=": return actual != threshold
        if operator == "between":
            return condition.get("min") <= actual <= condition.get("max")
    
    elif cond_type == "time_window":
        now = datetime.now()
        start_hour = condition.get("start_hour", 0)
        end_hour = condition.get("end_hour", 24)
        days = condition.get("days_of_week")
        
        if days and now.weekday() not in days:
            return False
        return start_hour <= now.hour < end_hour
    
    return False
```

### Logic Engine - Action Execution

**actions JSON-Schema (aus CrossESPLogic Model):**

```json
[
  {
    "type": "actuator_command",
    "esp_id": "ESP_BBCCDDEE",
    "gpio": 18,
    "actuator_type": "pump",
    "command": "ON",
    "value": 0.75,
    "duration_seconds": 60
  }
]
```

**Action Execution Code:**
```python
async def _execute_actions(self, actions: list, trigger_data: dict):
    """Execute all actions for a triggered rule."""
    for action in actions:
        if action.get("type") == "actuator_command":
            await self.actuator_service.send_command(
                esp_id=action["esp_id"],
                gpio=action["gpio"],
                command=action.get("command", "ON"),
                value=action.get("value", 1.0),
                duration=action.get("duration_seconds", 0)
            )
            
            # WebSocket Broadcast
            await self.websocket_manager.broadcast("logic_execution", {
                "rule_id": str(trigger_data.get("rule_id")),
                "trigger": trigger_data,
                "action": action,
                "timestamp": int(time.time())
            })
```

**Deliverables:**
- ✅ Logic Engine läuft als Background Task
- ✅ Rules werden bei Sensor-Daten evaluiert
- ✅ Conditions: sensor_threshold, time_window, AND/OR Logic
- ✅ Cooldown wird via DB geprüft
- ✅ Actions werden via ActuatorService ausgeführt
- ✅ Execution History wird geloggt
- ✅ WebSocket Broadcast bei Execution
- ✅ Unit-Tests >80% Coverage

---

#### 1.2 Safety Service (`services/safety_service.py`)

**Status:** ❌ Nicht implementiert  
**Priorität:** 🔴 KRITISCH  
**Abhängigkeiten:** ActuatorRepository, ESPRepository

**Anforderungen aus PI_SERVER_REFACTORING.md:**
- Validates actuator commands before execution
- Checks GPIO conflicts
- Enforces timeout protection
- Emergency stop handling (all or specific ESP)

**Safety Rules (aus PI_SERVER_REFACTORING.md Zeilen 491):**
- PWM values: 0.0-1.0 range
- GPIO conflict detection
- Timeout enforcement
- Emergency stop has absolute priority

**Implementierungs-Schritte:**

1. **Safety Service Klasse erstellen:**
   ```python
   class SafetyService:
       """
       Safety validation for actuator commands.
       
       Validates commands before execution, handles emergency stops.
       """
       
       def __init__(self, actuator_repo, esp_repo):
           self.actuator_repo = actuator_repo
           self.esp_repo = esp_repo
           self._emergency_stop_active = {}  # {esp_id: bool}
       
       async def validate_actuator_command(
           self, esp_id: str, gpio: int, command: str, value: float
       ) -> SafetyCheckResult:
           """
           Validate actuator command before execution.
           
           Returns:
               SafetyCheckResult(valid: bool, error: str, warnings: list)
           """
       
       async def check_safety_constraints(
           self, esp_id: str, gpio: int, value: float
       ) -> SafetyCheckResult:
           """Check safety constraints (GPIO conflicts, value ranges)."""
       
       async def emergency_stop_all(self) -> None:
           """Emergency stop all ESPs."""
       
       async def emergency_stop_esp(self, esp_id: str) -> None:
           """Emergency stop specific ESP."""
       
       async def is_emergency_stop_active(self, esp_id: Optional[str] = None) -> bool:
           """Check if emergency stop is active."""
   ```

2. **Validation Rules:**
   - PWM Range: 0.0-1.0 (validieren)
   - GPIO Conflicts: Prüfen ob GPIO bereits verwendet
   - Timeout: Max runtime prüfen (aus ActuatorConfig)
   - Emergency Stop: Absolute Priority

3. **Integration in Actuator Service:**
   - Vor jedem Command: `safety_service.validate_actuator_command()` aufrufen
   - Bei Emergency Stop: Alle Commands blockieren

**Deliverables:**
- ✅ Safety Validation funktioniert
- ✅ Emergency Stop funktioniert
- ✅ GPIO Conflicts werden erkannt
- ✅ Unit-Tests >80% Coverage

---

#### 1.3 Fehlende Sensor Libraries

**Status:** ❌ 3 Libraries fehlen  
**Priorität:** 🟡 HOCH  
**Abhängigkeiten:** BaseSensorProcessor

**Implementierungs-Schritte:**

1. **CO2 Sensor (`sensors/sensor_libraries/active/co2.py`):**
   ```python
   class CO2Processor(BaseSensorProcessor):
       """
       CO2 Sensor Processor (MHZ19, SCD30).
       
       Supports:
       - MHZ19: UART-based CO2 sensor (0-5000 ppm)
       - SCD30: I2C CO2 sensor (400-10000 ppm)
       """
       
       def process(self, raw_value: float, **kwargs) -> ProcessingResult:
           """
           Process CO2 sensor raw value.
           
           Args:
               raw_value: Raw ADC value or UART reading
               sensor_model: "mhz19" or "scd30"
           
           Returns:
               ProcessingResult(value: float, unit: "ppm", quality: str)
           """
   ```

2. **Light Sensor (`sensors/sensor_libraries/active/light.py`):**
   ```python
   class LightProcessor(BaseSensorProcessor):
       """
       Light Sensor Processor (TSL2561, BH1750).
       
       Supports:
       - TSL2561: I2C lux sensor (0-40000 lux)
       - BH1750: I2C lux sensor (1-65535 lux)
       """
       
       def process(self, raw_value: float, **kwargs) -> ProcessingResult:
           """
           Process light sensor raw value.
           
           Args:
               raw_value: Raw I2C reading
               sensor_model: "tsl2561" or "bh1750"
           
           Returns:
               ProcessingResult(value: float, unit: "lux", quality: str)
           """
   ```

3. **Flow Sensor (`sensors/sensor_libraries/active/flow.py`):**
   ```python
   class FlowProcessor(BaseSensorProcessor):
       """
       Flow Sensor Processor (YFS201, Generic).
       
       Supports:
       - YFS201: Hall-effect flow sensor (pulses per liter)
       - Generic: Pulse-based flow sensors
       """
       
       def process(self, raw_value: float, **kwargs) -> ProcessingResult:
           """
           Process flow sensor raw value.
           
           Args:
               raw_value: Pulse count or frequency
               sensor_model: "yfs201" or "generic"
               calibration_factor: Pulses per liter
           
           Returns:
               ProcessingResult(value: float, unit: "L/min", quality: str)
           """
   ```

**Deliverables:**
- ✅ Alle 3 Libraries implementiert
- ✅ Unit-Tests für jede Library
- ✅ Integration in Library Loader

---

### PRIORITÄT 2: 🔴 KRITISCH - Phase 4 Completion

#### 2.1 WebSocket Manager (`websocket/manager.py`)

**Status:** ❌ Nicht implementiert  
**Priorität:** 🔴 KRITISCH  
**Abhängigkeiten:** FastAPI WebSocket, Background Task

**Anforderungen aus PI_SERVER_REFACTORING.md:**
- Real-time Updates an Frontend
- Message Types: sensor_data, actuator_status, system_event, esp_health, logic_execution, ai_prediction
- Filters: Subscribe by esp_id, sensor_type, etc.
- Rate Limit: Max 10 messages/sec per client

**Kommunikations-Flow (aus PI_SERVER_REFACTORING.md Zeilen 699-700):**
```
services/*, mqtt/handlers
  │
  └──→ websocket/manager.py  (Broadcast Events)
        │
        └──→ Frontend Clients (Real-time Updates)
```

**Implementierungs-Schritte:**

1. **WebSocket Manager Klasse erstellen:**
   ```python
   class WebSocketManager:
       """
       WebSocket Manager (Singleton).
       
       Manages WebSocket connections, broadcasts real-time updates.
       """
       
       def __init__(self):
           self._connections: Dict[str, WebSocket] = {}
           self._subscriptions: Dict[str, Set[str]] = {}  # {client_id: {filters}}
           self._rate_limiter: Dict[str, deque] = {}  # Rate limiting per client
       
       async def connect(self, websocket: WebSocket, client_id: str):
           """Accept WebSocket connection."""
       
       async def disconnect(self, client_id: str):
           """Close WebSocket connection."""
       
       async def broadcast(
           self, message_type: str, data: dict, filters: Optional[dict] = None
       ):
           """
           Broadcast message to all subscribed clients.
           
           Args:
               message_type: "sensor_data", "actuator_status", etc.
               data: Message payload
               filters: Optional filters (esp_id, sensor_type, etc.)
           """
       
       async def subscribe(self, client_id: str, filters: dict):
           """Subscribe client to specific message types/filters."""
       
       def _check_rate_limit(self, client_id: str) -> bool:
           """Check if client exceeds rate limit (10 msg/sec)."""
   ```

2. **Integration in Sensor Handler:**
   - Nach Sensor-Daten-Speicherung: `websocket_manager.broadcast("sensor_data", {...})`

3. **Integration in Actuator Handler:**
   - Nach Actuator-Status-Update: `websocket_manager.broadcast("actuator_status", {...})`

4. **Integration in Logic Engine:**
   - Nach Rule-Execution: `websocket_manager.broadcast("logic_execution", {...})`

5. **WebSocket Endpoint (`api/v1/websocket/realtime.py`):**
   ```python
   @router.websocket("/ws/realtime/{client_id}")
   async def websocket_realtime(websocket: WebSocket, client_id: str):
       """WebSocket endpoint for real-time updates."""
       manager = WebSocketManager.get_instance()
       await manager.connect(websocket, client_id)
       try:
           while True:
               # Handle client messages (subscribe/unsubscribe)
               data = await websocket.receive_json()
               if data.get("action") == "subscribe":
                   await manager.subscribe(client_id, data.get("filters", {}))
       finally:
           await manager.disconnect(client_id)
   ```

### WebSocket Message Formate (Server → Frontend)

**Alle Messages haben dieses Base-Format:**
```json
{
  "type": "sensor_data",      // Message type
  "timestamp": 1735818000,    // Unix timestamp
  "data": { ... }             // Type-specific payload
}
```

**sensor_data:**
```json
{
  "type": "sensor_data",
  "timestamp": 1735818000,
  "data": {
    "esp_id": "ESP_12AB34CD",
    "gpio": 34,
    "sensor_type": "temperature",
    "value": 23.5,
    "unit": "°C",
    "quality": "good"
  }
}
```

**actuator_status:**
```json
{
  "type": "actuator_status",
  "timestamp": 1735818000,
  "data": {
    "esp_id": "ESP_12AB34CD",
    "gpio": 18,
    "actuator_type": "pump",
    "state": "on",
    "value": 0.75,
    "emergency": "normal"
  }
}
```

**logic_execution:**
```json
{
  "type": "logic_execution",
  "timestamp": 1735818000,
  "data": {
    "rule_id": "uuid-string",
    "rule_name": "Temperature Control",
    "trigger": {
      "esp_id": "ESP_A1",
      "gpio": 34,
      "value": 26.5
    },
    "action": {
      "esp_id": "ESP_B2",
      "gpio": 18,
      "command": "ON"
    },
    "success": true
  }
}
```

**esp_health:**
```json
{
  "type": "esp_health",
  "timestamp": 1735818000,
  "data": {
    "esp_id": "ESP_12AB34CD",
    "status": "online",
    "heap_free": 245760,
    "wifi_rssi": -65,
    "uptime": 3600
  }
}
```

**Client Subscribe Message (Frontend → Server):**
```json
{
  "action": "subscribe",
  "filters": {
    "types": ["sensor_data", "actuator_status"],
    "esp_ids": ["ESP_12AB34CD"],
    "sensor_types": ["temperature", "humidity"]
  }
}
```

**Deliverables:**
- ✅ WebSocket Manager implementiert (Singleton)
- ✅ Thread-Safe für MQTT-Callback-Aufrufe
- ✅ Broadcasting funktioniert mit Filters
- ✅ Rate Limiting funktioniert (10 msg/sec per client)
- ✅ Message Formate konsistent (type, timestamp, data)
- ✅ Integration in Sensor Handler, Actuator Handler, Logic Engine
- ✅ WebSocket Endpoint funktioniert
- ✅ Unit-Tests >80% Coverage

---

#### 2.2 Utils (`utils/*.py`)

**Status:** ❌ Nicht implementiert  
**Priorität:** 🟡 HOCH  
**Abhängigkeiten:** Keine kritischen

**Implementierungs-Schritte:**

1. **Time Helpers (`utils/time_helpers.py`):**
   ```python
   def unix_timestamp_ms() -> int:
       """Get current Unix timestamp in milliseconds."""
   
   def unix_timestamp_s() -> int:
       """Get current Unix timestamp in seconds."""
   
   def parse_timestamp(timestamp: Union[int, str]) -> datetime:
       """Parse timestamp (Unix seconds or ISO string)."""
   
   def format_timestamp(dt: datetime) -> str:
       """Format datetime to ISO string."""
   ```

2. **Data Helpers (`utils/data_helpers.py`):**
   ```python
   def normalize_sensor_data(raw_value: float, min_val: float, max_val: float) -> float:
       """Normalize sensor value to 0.0-1.0 range."""
   
   def calculate_crc32(data: bytes) -> int:
       """Calculate CRC32 checksum."""
   
   def validate_sensor_range(value: float, min_val: float, max_val: float) -> bool:
       """Validate sensor value is in valid range."""
   ```

3. **Network Helpers (`utils/network_helpers.py`):**
   ```python
   async def is_reachable(host: str, port: int, timeout: float = 5.0) -> bool:
       """Check if host:port is reachable."""
   
   async def ping(host: str, timeout: float = 5.0) -> Optional[float]:
       """Ping host and return latency in seconds."""
   ```

4. **MQTT Helpers (`utils/mqtt_helpers.py`):**
   - **HINWEIS:** Topic-Building ist bereits in `mqtt/topics.py` implementiert
   - Optional: Helper-Funktionen für Message-Formatting, QoS-Level-Mapping

**Deliverables:**
- ✅ Alle Utils implementiert
- ✅ Unit-Tests für jede Funktion

---

## 📋 IMPLEMENTIERUNGS-REIHENFOLGE (KORRIGIERT!)

> ⚠️ **WICHTIG:** Die ursprüngliche Reihenfolge war falsch! LogicRepository MUSS zuerst implementiert werden.

### Schritt 0: LogicRepository (🔴 BLOCKER!)
**Grund:** Logic Engine KANN NICHT ohne Repository funktionieren!  
**Zeit:** 1-2 Stunden  
**Abhängigkeiten:** BaseRepository, CrossESPLogic Model, LogicExecutionHistory Model (alle bereits vorhanden)

**Zu implementieren:**
```python
# db/repositories/logic_repo.py
class LogicRepository(BaseRepository[CrossESPLogic]):
    async def get_enabled_rules(self) -> list[CrossESPLogic]
    async def get_rules_by_trigger_sensor(self, esp_id, gpio, sensor_type) -> list[CrossESPLogic]
    async def get_last_execution(self, rule_id: uuid.UUID) -> Optional[datetime]
    async def log_execution(self, rule_id, trigger_data, actions, success, execution_ms) -> LogicExecutionHistory
    async def update_rule_enabled(self, rule_id, enabled: bool) -> CrossESPLogic
```

### Schritt 1: Utils (🟡 HOCH)
**Grund:** Werden von allen anderen Komponenten gebraucht  
**Zeit:** 1-2 Stunden  
**Abhängigkeiten:** Keine

### Schritt 2: Safety Service (🔴 KRITISCH)
**Grund:** Wird von Actuator Service benötigt  
**Zeit:** 2-3 Stunden  
**Abhängigkeiten:** ActuatorRepository, ESPRepository (bereits vorhanden)

**Kritische Punkte:**
- EmergencyState Enum MUSS zu ESP32 passen (NORMAL, ACTIVE, CLEARING, RESUMING)
- PWM-Validierung: 0.0-1.0 (NICHT 0-255!)
- Thread-Safe für MQTT-Callback-Aufrufe

### Schritt 3: Actuator Service (🔴 KRITISCH)
**Grund:** Wird von Logic Engine benötigt  
**Zeit:** 2-3 Stunden  
**Abhängigkeiten:** ActuatorRepository (bereits vorhanden), SafetyService (Schritt 2), MQTT Publisher (bereits vorhanden)

**Kritische Punkte:**
- MUSS SafetyService VOR jedem Command aufrufen
- MQTT Payload MUSS zu Mqtt_Protocoll.md passen
- `value` als 0.0-1.0, ESP32 konvertiert zu 0-255

### Schritt 4: WebSocket Manager (🔴 KRITISCH)
**Grund:** Real-time Updates für Frontend + Logic Engine Notifications  
**Zeit:** 3-4 Stunden  
**Abhängigkeiten:** FastAPI WebSocket (bereits vorhanden)

**Kritische Punkte:**
- Thread-Safe (MQTT Callbacks kommen aus anderem Thread!)
- `asyncio.Lock()` für Connection Management
- `run_coroutine_threadsafe()` für Aufrufe aus MQTT Thread
- Proper Startup/Shutdown Lifecycle

### Schritt 5: Logic Engine (🔴 KRITISCH)
**Grund:** Kern-Feature für Automation  
**Zeit:** 4-6 Stunden  
**Abhängigkeiten:** LogicRepository (Schritt 0), ActuatorService (Schritt 3), WebSocket Manager (Schritt 4)

**Kritische Punkte:**
- Background Task mit sauberem Lifecycle (start/stop)
- Cooldown-Tracking pro Rule (via LogicRepository.get_last_execution)
- NICHT synchron im Sensor Handler ausführen!
- WebSocket Broadcast bei Rule Execution

### Schritt 6: Sensor Handler Integration (🔴 KRITISCH)
**Grund:** Verbindet alle Komponenten  
**Zeit:** 1-2 Stunden  
**Abhängigkeiten:** Logic Engine (Schritt 5), WebSocket Manager (Schritt 4)

**Zu integrieren in `mqtt/handlers/sensor_handler.py`:**
```python
# Nach Zeile 194 (nach session.commit())
# 1. WebSocket Broadcast
await websocket_manager.broadcast("sensor_data", {
    "esp_id": esp_id_str,
    "gpio": gpio,
    "sensor_type": sensor_type,
    "value": processed_value or raw_value,
    "unit": unit,
    "quality": quality,
    "timestamp": payload.get("ts")
})

# 2. Logic Engine Trigger (non-blocking!)
asyncio.create_task(
    logic_engine.evaluate_sensor_data(
        esp_id=esp_id_str,
        gpio=gpio,
        sensor_type=sensor_type,
        value=processed_value or raw_value
    )
)
```

### Schritt 7: Fehlende Sensor Libraries (🟡 HOCH)
**Grund:** Vollständigkeit  
**Zeit:** 2-3 Stunden pro Library (6-9 Stunden total)  
**Abhängigkeiten:** BaseSensorProcessor (bereits vorhanden)

---

## ✅ VALIDIERUNGS-CHECKLISTE

Nach jedem Schritt prüfen:

### LogicRepository (Schritt 0):
- [ ] `get_enabled_rules()` lädt Rules sortiert nach Priorität
- [ ] `get_rules_by_trigger_sensor()` findet passende Rules
- [ ] `get_last_execution()` gibt korrekten Timestamp zurück
- [ ] `log_execution()` speichert in LogicExecutionHistory
- [ ] Unit-Tests für alle Methoden

### Safety Service:
- [ ] Actuator Commands werden validiert
- [ ] GPIO Conflicts werden erkannt
- [ ] Emergency Stop funktioniert (all + specific ESP)
- [ ] PWM Range wird validiert (**0.0-1.0, NICHT 0-255!**)
- [ ] EmergencyState Enum passt zu ESP32 (NORMAL, ACTIVE, CLEARING, RESUMING)
- [ ] Thread-Safe für MQTT-Callback-Aufrufe
- [ ] Unit-Tests >80% Coverage

### Actuator Service:
- [ ] Ruft SafetyService.validate_actuator_command() VOR jedem Command
- [ ] MQTT Payload Format passt zu Mqtt_Protocoll.md
- [ ] `value` als 0.0-1.0 (ESP32 konvertiert zu 0-255)
- [ ] `duration` in Sekunden (0 = unbegrenzt)
- [ ] Logging aller Commands
- [ ] Unit-Tests >80% Coverage

### WebSocket Manager:
- [ ] **Thread-Safe** (asyncio.Lock für concurrent access)
- [ ] **broadcast_threadsafe()** für MQTT-Callback-Aufrufe
- [ ] Proper Startup/Shutdown Lifecycle
- [ ] WebSocket Connections werden verwaltet
- [ ] Broadcasting funktioniert (sensor_data, actuator_status, logic_execution)
- [ ] Rate Limiting funktioniert (10 msg/sec)
- [ ] Filters funktionieren (esp_id, sensor_type)
- [ ] Unit-Tests >80% Coverage

### Logic Engine:
- [ ] Background Task mit sauberem Lifecycle (start/stop)
- [ ] Rules werden bei Sensor-Daten evaluiert
- [ ] Conditions werden korrekt geprüft (threshold, time window)
- [ ] Cooldown wird via LogicRepository.get_last_execution() geprüft
- [ ] Actions werden via ActuatorService ausgeführt
- [ ] Execution History wird via LogicRepository geloggt
- [ ] WebSocket Broadcast bei Rule Execution
- [ ] **NICHT synchron im Sensor Handler!** (asyncio.create_task)
- [ ] Unit-Tests >80% Coverage

### Sensor Handler Integration:
- [ ] WebSocket Broadcast nach Daten-Speicherung
- [ ] Logic Engine Trigger (non-blocking via asyncio.create_task)
- [ ] Keine Breaking Changes an bestehendem Code

### Sensor Libraries:
- [ ] CO2 Processor implementiert (MHZ19, SCD30)
- [ ] Light Processor implementiert (TSL2561, BH1750)
- [ ] Flow Processor implementiert (YFS201, Generic)
- [ ] Alle Libraries in Library Loader registriert
- [ ] `get_sensor_type()` gibt korrekten Identifier zurück
- [ ] Unit-Tests für jede Library

### Utils:
- [ ] Time Helpers implementiert
- [ ] Data Helpers implementiert
- [ ] Network Helpers implementiert
- [ ] Unit-Tests für jede Funktion

---

## 🔄 INTEGRATION ZWISCHEN KOMPONENTEN

### Dependency Graph (wer braucht wen)

```
┌─────────────────────────────────────────────────────────────┐
│                     main.py (Startup)                       │
│  - Initialisiert alle Services                              │
│  - Startet Logic Engine Background Task                     │
│  - Registriert Shutdown Handler                             │
└───────────────────────────┬─────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│ WebSocket Mgr │   │ Logic Engine  │   │ MQTT Client   │
│ (Singleton)   │   │ (Background)  │   │ (Singleton)   │
└───────┬───────┘   └───────┬───────┘   └───────┬───────┘
        │                   │                   │
        │           ┌───────┴───────┐           │
        │           ▼               ▼           │
        │   ┌───────────────┐ ┌─────────────┐   │
        │   │ Logic Repo    │ │ Actuator    │   │
        │   │ (DB Access)   │ │ Service     │   │
        │   └───────────────┘ └──────┬──────┘   │
        │                            │          │
        │                    ┌───────┴───────┐  │
        │                    ▼               ▼  │
        │            ┌───────────────┐ ┌───────────┐
        │            │ Safety Service│ │ Publisher │
        │            └───────────────┘ └───────────┘
        │
        └──────────────────────────────────────────
                              │
        ┌─────────────────────┴─────────────────────┐
        ▼                                           ▼
┌───────────────────┐                   ┌───────────────────┐
│ Sensor Handler    │                   │ Actuator Handler  │
│ - Speichert Daten │                   │ - Status Updates  │
│ - Triggert Logic  │                   │ - History Logging │
│ - Broadcasts WS   │                   │ - Broadcasts WS   │
└───────────────────┘                   └───────────────────┘
```

### Startup Sequence (main.py)

```python
@app.on_event("startup")
async def startup():
    # 1. Database Session Pool
    await init_db()
    
    # 2. MQTT Client (Singleton)
    mqtt_client = MQTTClient.get_instance()
    mqtt_client.connect()
    
    # 3. WebSocket Manager (Singleton)
    ws_manager = WebSocketManager.get_instance()
    await ws_manager.initialize()
    
    # 4. Safety Service
    safety_service = SafetyService(actuator_repo, esp_repo)
    
    # 5. Actuator Service
    actuator_service = ActuatorService(
        actuator_repo=actuator_repo,
        safety_service=safety_service,
        publisher=publisher
    )
    
    # 6. Logic Engine (Background Task!)
    logic_engine = LogicEngine(
        logic_repo=logic_repo,
        actuator_service=actuator_service,
        websocket_manager=ws_manager
    )
    await logic_engine.start()
    
    logger.info("All services started")

@app.on_event("shutdown")
async def shutdown():
    await logic_engine.stop()
    await ws_manager.shutdown()
    mqtt_client.disconnect()
    await close_db()
```

---

## 🔗 RELEVANTE DOKUMENTE

- `.claude/PI_SERVER_REFACTORING.md` - Haupt-Spezifikation (Zeilen 700-800 für Flows)
- `.claude/CLAUDE.md` - KI-Agenten Workflow (Section 5: Safety-Constraints)
- `El Trabajante/docs/Mqtt_Protocoll.md` - MQTT-Protokoll-Spezifikation (KRITISCH für Payloads!)
- `El Trabajante/docs/System_Overview.md` - Server-Centric Architektur
- `El Trabajante/src/services/actuator/safety_controller.h` - ESP32 Safety States (MUSS MATCHEN!)
- `El Servador/god_kaiser_server/src/db/models/logic.py` - Logic Models (CrossESPLogic, LogicExecutionHistory)
- `El Servador/god_kaiser_server/src/mqtt/handlers/sensor_handler.py` - Sensor Handler (Integration Point)
- `El Servador/god_kaiser_server/src/mqtt/publisher.py` - MQTT Publisher (für Actions)

---

## 📝 NOTIZEN UND FALLSTRICKE

### ⚠️ Häufige Fehler vermeiden:

1. **PWM-Werte:** Server verwendet 0.0-1.0, ESP32 konvertiert zu 0-255 intern!
2. **Thread-Safety:** MQTT-Callbacks kommen aus paho-mqtt Thread, WebSocket ist asyncio!
3. **Background Task Lifecycle:** Logic Engine MUSS sauber gestoppt werden bei Shutdown!
4. **Cooldown:** Muss via DB (LogicRepository.get_last_execution) geprüft werden, NICHT im RAM!
5. **Non-Blocking:** Logic Engine Evaluation NICHT synchron im Sensor Handler ausführen!

### ✅ Best Practices:

1. **Singleton Pattern:** WebSocketManager, LogicEngine, SafetyService - alle als Singleton
2. **Dependency Injection:** Services erhalten Repos/andere Services im Constructor
3. **Async/Await:** Alle DB-Operationen sind async!
4. **Logging:** Jede Aktion loggen (Command, Execution, Error)
5. **Tests:** MockESP32Client aus `El Servador/docs/ESP32_TESTING.md` verwenden

### 📦 Neue Abhängigkeiten (falls fehlend):

```toml
# pyproject.toml - prüfen ob vorhanden
[tool.poetry.dependencies]
websockets = "^12.0"  # Für WebSocket Manager
```

---

**Letzte Aktualisierung:** 2025-12-07  
**Version:** 2.0 (mit kritischen Ergänzungen)

