# God-Kaiser Server - Phase 3 & 4 Implementierungsplan

**Version:** 1.0
**Erstellt:** 2025-12-07
**Zweck:** Präziser Schritt-für-Schritt-Plan für fehlende Phase 3 & 4 Komponenten

---

## 0. EXECUTIVE SUMMARY

### Aktueller Stand (2025-12-07)

**Phase 3: Business Logic** - 🟡 **40% ABGESCHLOSSEN**
- ✅ **VOLLSTÄNDIG:** Sensor Processing (library_loader, 7/10 libraries, <10ms)
- ✅ **VOLLSTÄNDIG:** Data Layer (Repositories, Models)
- ✅ **VOLLSTÄNDIG:** MQTT Handlers (sensor_handler, actuator_handler)
- ❌ **FEHLT:** Logic Engine (Cross-ESP Automation)
- ❌ **FEHLT:** Safety Service (Actuator Safety Validation)
- ❌ **STUBS:** Alle 11 Business Services (bewusste Design-Entscheidung)

**Phase 4: Communication Layer** - 🟡 **80% ABGESCHLOSSEN**
- ✅ **VOLLSTÄNDIG:** MQTT Client, Subscriber, Publisher
- ✅ **VOLLSTÄNDIG:** MQTT Handlers (6/6)
- ❌ **FEHLT:** WebSocket Manager (Real-time Frontend Updates)

**Phase 5: API Layer** - 🟡 **10% ABGESCHLOSSEN**
- ✅ **IMPLEMENTIERT:** POST /api/v1/sensors/process (Production-Ready)
- ❌ **FEHLT:** Alle anderen REST Endpoints (ESP, Sensors CRUD, Actuators, Logic)

### Kritische Erkenntnisse

**Architektur-Entscheidung (dokumentiert in Code):**
```python
# sensor_service.py, Zeile 12-13:
"Current Architecture:
    MQTT Handler → Repository (DIRECT) - No service layer needed for MQTT"
```

**Bedeutung:**
- Server nutzt bewusst **MQTT-first Architecture**
- MQTT-Handler gehen direkt zu Repositories
- Services sind **Placeholder für REST-API** (Phase 5)
- Aktuelle Implementierung **funktioniert ohne Service-Layer**

**Kritische Lücke:**
- **Logic Engine fehlt komplett** - Cross-ESP Automation nicht möglich
- **Safety Service fehlt** - Keine Server-seitige Safety-Validation
- **WebSocket fehlt** - Kein Real-time Frontend

---

## 1. IMPLEMENTIERUNGS-PRIORITÄTEN

### 🔴 KRITISCH - Phase 3 (Woche 1-2)

1. **Logic Engine** - Cross-ESP Automation (Kern-Feature!)
2. **Safety Service** - Actuator Safety Validation

### 🟡 HOCH - Phase 4 (Woche 2-3)

3. **WebSocket Manager** - Real-time Frontend Updates

### 🟢 MITTEL - Phase 5 (Woche 3-4+)

4. **REST API Endpoints** - Frontend Integration
5. **Fehlende Sensor Libraries** - co2, light, flow (optional)

---

## 2. PHASE 3 - FEHLENDE KOMPONENTEN

### 2.1 Logic Engine Implementierung

**Datei:** `src/services/logic_engine.py`
**Status:** ❌ NUR 2 ZEILEN KOMMENTAR
**Priorität:** 🔴 **KRITISCH**
**Geschätzter Aufwand:** 8-12 Stunden

#### Anforderungen (aus PI_SERVER_REFACTORING.md)

**Kernfunktionalität:**
```python
class LogicEngine:
    """
    Cross-ESP Automation Engine (Background Task).

    Evaluates logic rules in background, triggers actuator actions
    based on sensor conditions across multiple ESPs.
    """

    # MUST HAVE:
    async def start_background_task() -> None
    async def stop_background_task() -> None
    async def evaluate_rules(sensor_data: dict) -> List[RuleExecution]
    async def execute_actions(actions: List[dict]) -> bool
    async def check_cooldown(rule_id: UUID) -> bool
    async def log_execution(rule_id: UUID, result: dict) -> None
```

**Datenfluss (KRITISCH):**
```
1. Sensor-Daten kommen via MQTT (sensor_handler.py)
2. sensor_handler ruft logic_engine.evaluate_rules() auf
3. Logic Engine lädt passende Rules aus DB (CrossESPLogic)
4. Conditions werden evaluiert (trigger_conditions JSON)
5. Bei Match: Actions ausführen (MQTT → Actuator)
6. Execution History speichern (LogicExecutionHistory)
7. WebSocket Notification (optional)
```

#### Implementierungsschritte

**Schritt 1: Basis-Klasse erstellen**
```python
# src/services/logic_engine.py
import asyncio
import logging
from datetime import datetime, timedelta
from typing import List, Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.models.logic import CrossESPLogic, LogicExecutionHistory
from ..db.session import get_session
from ..mqtt.publisher import MQTTPublisher

logger = logging.getLogger(__name__)

class LogicEngine:
    """Cross-ESP Automation Engine"""

    _instance: Optional["LogicEngine"] = None
    _background_task: Optional[asyncio.Task] = None
    _running: bool = False

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        self.mqtt_publisher = MQTTPublisher()
        self._last_execution: dict[UUID, datetime] = {}
```

**Schritt 2: Background Task implementieren**
```python
    async def start_background_task(self) -> None:
        """Start background rule evaluation task."""
        if self._running:
            logger.warning("Logic Engine already running")
            return

        self._running = True
        self._background_task = asyncio.create_task(self._run_evaluation_loop())
        logger.info("Logic Engine started")

    async def stop_background_task(self) -> None:
        """Stop background task gracefully."""
        self._running = False
        if self._background_task:
            self._background_task.cancel()
            try:
                await self._background_task
            except asyncio.CancelledError:
                pass
        logger.info("Logic Engine stopped")

    async def _run_evaluation_loop(self) -> None:
        """Background loop - evaluates rules periodically."""
        while self._running:
            try:
                async with get_session() as session:
                    await self._evaluate_all_active_rules(session)
            except Exception as e:
                logger.exception(f"Error in rule evaluation loop: {e}")

            await asyncio.sleep(1.0)  # Evaluate every 1 second
```

**Schritt 3: Rule Evaluation implementieren**
```python
    async def _evaluate_all_active_rules(self, session: AsyncSession) -> None:
        """Load and evaluate all active rules."""
        stmt = select(CrossESPLogic).where(
            CrossESPLogic.enabled == True
        ).order_by(CrossESPLogic.priority)

        result = await session.execute(stmt)
        rules = result.scalars().all()

        for rule in rules:
            await self._evaluate_single_rule(rule, session)

    async def _evaluate_single_rule(
        self, rule: CrossESPLogic, session: AsyncSession
    ) -> None:
        """Evaluate a single rule."""
        try:
            # Check cooldown
            if not self._check_cooldown(rule.id, rule.cooldown_seconds):
                return

            # Evaluate trigger conditions
            trigger_data = await self._evaluate_conditions(
                rule.trigger_conditions, session
            )

            if not trigger_data:
                return  # Conditions not met

            # Execute actions
            start_time = datetime.utcnow()
            success = await self._execute_actions(rule.actions)
            execution_time_ms = int((datetime.utcnow() - start_time).total_seconds() * 1000)

            # Update last execution
            self._last_execution[rule.id] = datetime.utcnow()

            # Log execution
            await self._log_execution(
                rule.id, trigger_data, rule.actions, success, execution_time_ms, session
            )

        except Exception as e:
            logger.exception(f"Error evaluating rule {rule.rule_name}: {e}")
```

**Schritt 4: Condition Evaluation**
```python
    async def _evaluate_conditions(
        self, conditions: dict, session: AsyncSession
    ) -> Optional[dict]:
        """
        Evaluate trigger conditions.

        Supports:
        - sensor_threshold: Temperature > 25°C
        - time_window: Between 06:00-22:00
        - composite: AND/OR logic
        """
        condition_type = conditions.get("type")

        if condition_type == "sensor_threshold":
            return await self._evaluate_sensor_threshold(conditions, session)

        elif condition_type == "time_window":
            return self._evaluate_time_window(conditions)

        elif condition_type == "composite":
            return await self._evaluate_composite(conditions, session)

        else:
            logger.warning(f"Unknown condition type: {condition_type}")
            return None

    async def _evaluate_sensor_threshold(
        self, conditions: dict, session: AsyncSession
    ) -> Optional[dict]:
        """Check if sensor value meets threshold."""
        from ..db.models.sensor import SensorData
        from ..db.repositories.sensor_repo import SensorRepository

        esp_id = conditions.get("esp_id")
        gpio = conditions.get("gpio")
        operator = conditions.get("operator")  # ">", "<", "==", ">=", "<="
        threshold = conditions.get("value")

        # Get latest sensor reading
        repo = SensorRepository(session)
        latest_data = await repo.get_latest_reading(esp_id, gpio)

        if not latest_data:
            return None

        # Compare
        sensor_value = latest_data.processed_value or latest_data.raw_value

        if self._compare_values(sensor_value, operator, threshold):
            return {
                "esp_id": esp_id,
                "gpio": gpio,
                "sensor_value": sensor_value,
                "threshold": threshold,
                "operator": operator,
                "timestamp": latest_data.timestamp.isoformat(),
            }

        return None

    def _compare_values(self, value: float, operator: str, threshold: float) -> bool:
        """Compare sensor value with threshold."""
        if operator == ">":
            return value > threshold
        elif operator == "<":
            return value < threshold
        elif operator == ">=":
            return value >= threshold
        elif operator == "<=":
            return value <= threshold
        elif operator == "==":
            return value == threshold
        else:
            return False
```

**Schritt 5: Action Execution**
```python
    async def _execute_actions(self, actions: List[dict]) -> bool:
        """Execute list of actions."""
        success = True

        for action in actions:
            action_type = action.get("type")

            try:
                if action_type == "actuator_command":
                    await self._execute_actuator_command(action)

                elif action_type == "notification":
                    await self._send_notification(action)

                else:
                    logger.warning(f"Unknown action type: {action_type}")
                    success = False

            except Exception as e:
                logger.exception(f"Error executing action {action_type}: {e}")
                success = False

        return success

    async def _execute_actuator_command(self, action: dict) -> None:
        """Send actuator command via MQTT."""
        esp_id = action.get("esp_id")
        gpio = action.get("gpio")
        value = action.get("value")

        # Build MQTT topic
        topic = f"kaiser/god/esp/{esp_id}/actuator/{gpio}/command"

        # Build payload
        payload = {
            "command": "SET",
            "value": value,
            "source": "automation",
            "timestamp": int(datetime.utcnow().timestamp() * 1000),
        }

        # Publish via MQTT
        await self.mqtt_publisher.publish(topic, payload)

        logger.info(f"Actuator command sent: {esp_id} GPIO {gpio} = {value}")
```

**Schritt 6: Cooldown & Execution History**
```python
    def _check_cooldown(self, rule_id: UUID, cooldown_seconds: Optional[int]) -> bool:
        """Check if rule is in cooldown period."""
        if not cooldown_seconds:
            return True

        last_exec = self._last_execution.get(rule_id)
        if not last_exec:
            return True

        time_since_last = (datetime.utcnow() - last_exec).total_seconds()
        return time_since_last >= cooldown_seconds

    async def _log_execution(
        self,
        rule_id: UUID,
        trigger_data: dict,
        actions: List[dict],
        success: bool,
        execution_time_ms: int,
        session: AsyncSession,
    ) -> None:
        """Log rule execution to database."""
        history = LogicExecutionHistory(
            logic_rule_id=rule_id,
            trigger_data=trigger_data,
            actions_executed=actions,
            success=success,
            error_message=None,
            execution_time_ms=execution_time_ms,
            timestamp=datetime.utcnow(),
        )

        session.add(history)
        await session.commit()
```

#### Integration mit sensor_handler.py

**Änderung erforderlich in:** `src/mqtt/handlers/sensor_handler.py`

```python
# Am Ende von handle_sensor_data() hinzufügen:
from ...services.logic_engine import LogicEngine

async def handle_sensor_data(topic: str, payload: dict) -> None:
    # ... existing code ...

    # After saving to database:
    # Trigger Logic Engine evaluation (async, non-blocking)
    logic_engine = LogicEngine()
    asyncio.create_task(
        logic_engine._evaluate_all_active_rules(session)
    )
```

#### Integration mit main.py

**Änderung erforderlich in:** `src/main.py`

```python
from .services.logic_engine import LogicEngine

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Starting God-Kaiser Server...")

    # Start Logic Engine
    logic_engine = LogicEngine()
    await logic_engine.start_background_task()

    yield

    # Shutdown
    logger.info("Shutting down God-Kaiser Server...")
    await logic_engine.stop_background_task()
```

#### Tests (PFLICHT)

**Test-Datei:** `tests/unit/test_logic_engine.py`

```python
import pytest
from datetime import datetime
from uuid import uuid4

from god_kaiser_server.src.services.logic_engine import LogicEngine
from god_kaiser_server.src.db.models.logic import CrossESPLogic

@pytest.mark.asyncio
async def test_logic_engine_singleton():
    """Logic Engine should be singleton."""
    engine1 = LogicEngine()
    engine2 = LogicEngine()
    assert engine1 is engine2

@pytest.mark.asyncio
async def test_evaluate_sensor_threshold(mock_session, mock_sensor_data):
    """Should evaluate sensor threshold correctly."""
    engine = LogicEngine()

    conditions = {
        "type": "sensor_threshold",
        "esp_id": "ESP_TEST_01",
        "gpio": 34,
        "operator": ">",
        "value": 25.0,
    }

    result = await engine._evaluate_sensor_threshold(conditions, mock_session)

    assert result is not None
    assert result["sensor_value"] > 25.0

@pytest.mark.asyncio
async def test_execute_actuator_command(mock_mqtt_publisher):
    """Should send actuator command via MQTT."""
    engine = LogicEngine()

    action = {
        "type": "actuator_command",
        "esp_id": "ESP_TEST_02",
        "gpio": 18,
        "value": 0.75,
    }

    await engine._execute_actuator_command(action)

    mock_mqtt_publisher.publish.assert_called_once()
```

---

### 2.2 Safety Service Implementierung

**Datei:** `src/services/safety_service.py`
**Status:** ❌ NUR 29 ZEILEN KOMMENTAR
**Priorität:** 🔴 **KRITISCH**
**Geschätzter Aufwand:** 4-6 Stunden

#### Anforderungen (aus PI_SERVER_REFACTORING.md & CLAUDE.md Section 5)

**Kernfunktionalität:**
```python
class SafetyService:
    """
    Safety Checks für Actuator Commands.

    KRITISCHE Regeln (aus CLAUDE.md Section 5):
    1. PWM-Limits: 0.0 - 1.0
    2. GPIO-Conflict-Check
    3. Emergency-Stop hat IMMER Priorität
    4. Timeout-Protection
    """

    # MUST HAVE:
    def validate_actuator_command(esp_id, gpio, command, value) -> SafetyCheckResult
    def check_safety_constraints(esp_id, gpio, value) -> bool
    async def emergency_stop_all() -> None
    async def emergency_stop_esp(esp_id) -> None
    def is_emergency_stop_active(esp_id=None) -> bool
```

#### Implementierung

**Schritt 1: SafetyCheckResult Model**
```python
# src/schemas/safety.py (neu erstellen)
from pydantic import BaseModel, Field
from typing import Optional

class SafetyCheckResult(BaseModel):
    """Safety Check Result."""

    is_safe: bool = Field(..., description="Whether command is safe")
    error_code: Optional[str] = Field(None, description="Error code if unsafe")
    error_message: Optional[str] = Field(None, description="Human-readable error")

    class Config:
        json_schema_extra = {
            "example": {
                "is_safe": False,
                "error_code": "PWM_OUT_OF_RANGE",
                "error_message": "PWM value 1.5 exceeds maximum 1.0"
            }
        }
```

**Schritt 2: Safety Service Implementation**
```python
# src/services/safety_service.py
import logging
from typing import Dict, Optional
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ..db.models.esp import ESP
from ..db.models.actuator import ActuatorConfig, ActuatorState
from ..db.models.sensor import SensorConfig
from ..schemas.safety import SafetyCheckResult

logger = logging.getLogger(__name__)

class SafetyService:
    """Safety Checks für Actuator Commands."""

    # Emergency Stop State (in-memory)
    _emergency_stop_active: bool = False
    _emergency_stop_esp: Dict[str, bool] = {}

    # Constants (aus CLAUDE.md Section 5.1)
    PWM_MIN = 0.0
    PWM_MAX = 1.0

    def __init__(self, session: AsyncSession):
        self.session = session

    async def validate_actuator_command(
        self,
        esp_id: str,
        gpio: int,
        command: str,
        value: float,
    ) -> SafetyCheckResult:
        """
        Validate actuator command against all safety constraints.

        Checks:
        1. Emergency Stop Status
        2. PWM Range (0.0 - 1.0)
        3. GPIO Conflict (Sensor/Actuator)
        4. Actuator Exists in Config
        """
        # Check 1: Emergency Stop
        if self._emergency_stop_active or self._emergency_stop_esp.get(esp_id, False):
            return SafetyCheckResult(
                is_safe=False,
                error_code="EMERGENCY_STOP_ACTIVE",
                error_message=f"Emergency stop active for {esp_id}",
            )

        # Check 2: PWM Range
        if not self._is_pwm_value_safe(value):
            return SafetyCheckResult(
                is_safe=False,
                error_code="PWM_OUT_OF_RANGE",
                error_message=f"PWM value {value} out of range [{self.PWM_MIN}, {self.PWM_MAX}]",
            )

        # Check 3: GPIO Conflict
        gpio_conflict = await self._check_gpio_conflict(esp_id, gpio)
        if gpio_conflict:
            return SafetyCheckResult(
                is_safe=False,
                error_code="GPIO_CONFLICT",
                error_message=f"GPIO {gpio} already used by sensor on {esp_id}",
            )

        # Check 4: Actuator Config Exists
        actuator = await self._get_actuator_config(esp_id, gpio)
        if not actuator:
            return SafetyCheckResult(
                is_safe=False,
                error_code="ACTUATOR_NOT_CONFIGURED",
                error_message=f"Actuator GPIO {gpio} not configured on {esp_id}",
            )

        # All checks passed
        return SafetyCheckResult(is_safe=True)

    def _is_pwm_value_safe(self, value: float) -> bool:
        """Check if PWM value is within safe range."""
        return self.PWM_MIN <= value <= self.PWM_MAX

    async def _check_gpio_conflict(self, esp_id: str, gpio: int) -> bool:
        """Check if GPIO is already used by sensor."""
        stmt = select(SensorConfig).where(
            SensorConfig.esp_id == esp_id,
            SensorConfig.gpio == gpio,
        )
        result = await self.session.execute(stmt)
        sensor = result.scalar_one_or_none()
        return sensor is not None

    async def _get_actuator_config(self, esp_id: str, gpio: int) -> Optional[ActuatorConfig]:
        """Get actuator config from database."""
        stmt = select(ActuatorConfig).where(
            ActuatorConfig.esp_id == esp_id,
            ActuatorConfig.gpio == gpio,
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def emergency_stop_all(self) -> None:
        """
        Activate emergency stop for ALL ESPs.

        CRITICAL: This stops all actuators immediately.
        """
        self._emergency_stop_active = True
        logger.critical("EMERGENCY STOP ACTIVATED - ALL ESPS")

        # TODO: Send MQTT emergency stop to all ESPs
        # await mqtt_publisher.publish("kaiser/broadcast/emergency", {"stop": True})

    async def emergency_stop_esp(self, esp_id: str) -> None:
        """Activate emergency stop for specific ESP."""
        self._emergency_stop_esp[esp_id] = True
        logger.critical(f"EMERGENCY STOP ACTIVATED - {esp_id}")

        # TODO: Send MQTT emergency stop to ESP
        # await mqtt_publisher.publish(f"kaiser/god/esp/{esp_id}/system/emergency", {"stop": True})

    async def reset_emergency_stop(self, esp_id: Optional[str] = None) -> None:
        """Reset emergency stop."""
        if esp_id:
            self._emergency_stop_esp[esp_id] = False
            logger.info(f"Emergency stop reset for {esp_id}")
        else:
            self._emergency_stop_active = False
            self._emergency_stop_esp.clear()
            logger.info("Emergency stop reset for all ESPs")

    def is_emergency_stop_active(self, esp_id: Optional[str] = None) -> bool:
        """Check if emergency stop is active."""
        if esp_id:
            return self._emergency_stop_esp.get(esp_id, False) or self._emergency_stop_active
        return self._emergency_stop_active
```

#### Integration mit actuator_handler.py

**Änderung erforderlich in:** `src/mqtt/handlers/actuator_handler.py`

```python
from ...services.safety_service import SafetyService

async def handle_actuator_command(topic: str, payload: dict) -> None:
    """
    Handle actuator command request (REST API → MQTT → ESP).

    Flow:
    1. Validate command with SafetyService
    2. If safe: Send via MQTT to ESP
    3. If unsafe: Reject and log
    """
    async with get_session() as session:
        safety_service = SafetyService(session)

        esp_id = payload.get("esp_id")
        gpio = payload.get("gpio")
        command = payload.get("command")
        value = payload.get("value")

        # Safety Check
        result = await safety_service.validate_actuator_command(
            esp_id, gpio, command, value
        )

        if not result.is_safe:
            logger.error(f"Actuator command rejected: {result.error_message}")
            # TODO: Send error response via WebSocket
            return

        # Command is safe - proceed
        # ... existing MQTT publish code ...
```

#### Tests

**Test-Datei:** `tests/unit/test_safety_service.py`

```python
import pytest
from god_kaiser_server.src.services.safety_service import SafetyService

@pytest.mark.asyncio
async def test_pwm_range_validation(mock_session):
    """Should reject PWM values outside 0.0-1.0."""
    safety = SafetyService(mock_session)

    # Valid
    result = await safety.validate_actuator_command("ESP_01", 18, "SET", 0.75)
    assert result.is_safe

    # Invalid: > 1.0
    result = await safety.validate_actuator_command("ESP_01", 18, "SET", 1.5)
    assert not result.is_safe
    assert result.error_code == "PWM_OUT_OF_RANGE"

    # Invalid: < 0.0
    result = await safety.validate_actuator_command("ESP_01", 18, "SET", -0.5)
    assert not result.is_safe

@pytest.mark.asyncio
async def test_emergency_stop(mock_session):
    """Emergency stop should block all commands."""
    safety = SafetyService(mock_session)

    # Activate emergency stop
    await safety.emergency_stop_all()

    # Command should be rejected
    result = await safety.validate_actuator_command("ESP_01", 18, "SET", 0.5)
    assert not result.is_safe
    assert result.error_code == "EMERGENCY_STOP_ACTIVE"

    # Reset
    await safety.reset_emergency_stop()

    # Command should now be accepted
    result = await safety.validate_actuator_command("ESP_01", 18, "SET", 0.5)
    assert result.is_safe
```

---

## 3. PHASE 4 - FEHLENDE KOMPONENTEN

### 3.1 WebSocket Manager Implementierung

**Datei:** `src/websocket/manager.py`
**Status:** ❌ NUR 7 ZEILEN TODO
**Priorität:** 🟡 **HOCH**
**Geschätzter Aufwand:** 6-8 Stunden

#### Anforderungen

**Kernfunktionalität:**
```python
class WebSocketManager:
    """
    WebSocket Manager (Singleton).
    Real-time Data Streaming für Frontend.

    Features:
    - Multiple client connections
    - Topic-based subscriptions
    - Real-time sensor data streaming
    - Actuator status updates
    - Logic execution notifications
    """

    # MUST HAVE:
    async def connect(websocket: WebSocket, client_id: str) -> None
    async def disconnect(client_id: str) -> None
    async def broadcast(message: dict, topic: Optional[str] = None) -> None
    async def send_to_client(client_id: str, message: dict) -> None
    async def subscribe(client_id: str, topic: str) -> None
    async def unsubscribe(client_id: str, topic: str) -> None
```

#### Implementierung

**Schritt 1: WebSocket Event Schemas**
```python
# src/schemas/websocket.py (neu erstellen)
from pydantic import BaseModel, Field
from typing import Optional, Literal
from datetime import datetime

class WebSocketEvent(BaseModel):
    """Base WebSocket Event."""

    event_type: str = Field(..., description="Event type (sensor_data, actuator_status, etc.)")
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    data: dict = Field(..., description="Event payload")

class SensorDataEvent(BaseModel):
    """Sensor data real-time event."""

    event_type: Literal["sensor_data"] = "sensor_data"
    esp_id: str
    gpio: int
    sensor_type: str
    value: float
    unit: Optional[str]
    timestamp: datetime

class ActuatorStatusEvent(BaseModel):
    """Actuator status update event."""

    event_type: Literal["actuator_status"] = "actuator_status"
    esp_id: str
    gpio: int
    actuator_type: str
    is_active: bool
    value: float
    timestamp: datetime

class LogicExecutionEvent(BaseModel):
    """Logic rule execution event."""

    event_type: Literal["logic_execution"] = "logic_execution"
    rule_name: str
    rule_id: str
    success: bool
    trigger_data: dict
    actions_executed: list
    timestamp: datetime
```

**Schritt 2: WebSocket Manager Implementation**
```python
# src/websocket/manager.py
import asyncio
import json
import logging
from typing import Dict, List, Optional, Set
from uuid import uuid4

from fastapi import WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)

class WebSocketManager:
    """
    WebSocket Manager (Singleton).
    Manages real-time connections to frontend clients.
    """

    _instance: Optional["WebSocketManager"] = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        if not hasattr(self, '_initialized'):
            self._connections: Dict[str, WebSocket] = {}
            self._subscriptions: Dict[str, Set[str]] = {}  # topic -> {client_ids}
            self._client_subscriptions: Dict[str, Set[str]] = {}  # client_id -> {topics}
            self._initialized = True
            logger.info("WebSocketManager initialized")

    async def connect(self, websocket: WebSocket, client_id: Optional[str] = None) -> str:
        """
        Accept WebSocket connection and register client.

        Args:
            websocket: FastAPI WebSocket connection
            client_id: Optional client ID (generates UUID if not provided)

        Returns:
            client_id: Assigned client ID
        """
        await websocket.accept()

        if not client_id:
            client_id = str(uuid4())

        self._connections[client_id] = websocket
        self._client_subscriptions[client_id] = set()

        logger.info(f"WebSocket connected: {client_id}")

        # Send welcome message
        await self.send_to_client(client_id, {
            "event_type": "connection_established",
            "client_id": client_id,
            "message": "Connected to God-Kaiser Server",
        })

        return client_id

    async def disconnect(self, client_id: str) -> None:
        """Disconnect client and cleanup."""
        # Remove all subscriptions
        if client_id in self._client_subscriptions:
            for topic in self._client_subscriptions[client_id]:
                if topic in self._subscriptions:
                    self._subscriptions[topic].discard(client_id)
            del self._client_subscriptions[client_id]

        # Remove connection
        if client_id in self._connections:
            del self._connections[client_id]

        logger.info(f"WebSocket disconnected: {client_id}")

    async def send_to_client(self, client_id: str, message: dict) -> bool:
        """
        Send message to specific client.

        Returns:
            bool: True if sent successfully, False if client disconnected
        """
        if client_id not in self._connections:
            logger.warning(f"Client {client_id} not connected")
            return False

        try:
            websocket = self._connections[client_id]
            await websocket.send_json(message)
            return True

        except WebSocketDisconnect:
            logger.warning(f"Client {client_id} disconnected during send")
            await self.disconnect(client_id)
            return False

        except Exception as e:
            logger.exception(f"Error sending to client {client_id}: {e}")
            return False

    async def broadcast(self, message: dict, topic: Optional[str] = None) -> int:
        """
        Broadcast message to all clients (or topic subscribers).

        Args:
            message: Message to broadcast
            topic: Optional topic filter (only clients subscribed to this topic)

        Returns:
            int: Number of clients that received the message
        """
        if topic:
            # Send to topic subscribers only
            client_ids = self._subscriptions.get(topic, set())
        else:
            # Send to all clients
            client_ids = set(self._connections.keys())

        successful_sends = 0

        for client_id in client_ids:
            if await self.send_to_client(client_id, message):
                successful_sends += 1

        logger.debug(f"Broadcast to {successful_sends}/{len(client_ids)} clients (topic: {topic})")

        return successful_sends

    async def subscribe(self, client_id: str, topic: str) -> bool:
        """Subscribe client to topic."""
        if client_id not in self._connections:
            logger.warning(f"Client {client_id} not connected")
            return False

        if topic not in self._subscriptions:
            self._subscriptions[topic] = set()

        self._subscriptions[topic].add(client_id)
        self._client_subscriptions[client_id].add(topic)

        logger.info(f"Client {client_id} subscribed to {topic}")
        return True

    async def unsubscribe(self, client_id: str, topic: str) -> bool:
        """Unsubscribe client from topic."""
        if topic in self._subscriptions:
            self._subscriptions[topic].discard(client_id)

        if client_id in self._client_subscriptions:
            self._client_subscriptions[client_id].discard(topic)

        logger.info(f"Client {client_id} unsubscribed from {topic}")
        return True

    def get_active_connections(self) -> int:
        """Get number of active connections."""
        return len(self._connections)

    def get_subscriptions(self, client_id: str) -> Set[str]:
        """Get topics that client is subscribed to."""
        return self._client_subscriptions.get(client_id, set())
```

#### Integration mit FastAPI

**Endpoint erstellen:** `src/api/v1/websocket.py` (neu)

```python
# src/api/v1/websocket.py
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import logging

from ...websocket.manager import WebSocketManager

logger = logging.getLogger(__name__)
router = APIRouter(tags=["WebSocket"])

@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """
    WebSocket endpoint for real-time updates.

    Usage:
        ws://localhost:8000/api/v1/ws

    Messages:
        - connection_established
        - sensor_data
        - actuator_status
        - logic_execution
        - system_event
    """
    ws_manager = WebSocketManager()
    client_id = await ws_manager.connect(websocket)

    try:
        while True:
            # Receive messages from client
            data = await websocket.receive_json()

            # Handle client requests
            message_type = data.get("type")

            if message_type == "subscribe":
                topic = data.get("topic")
                await ws_manager.subscribe(client_id, topic)
                await ws_manager.send_to_client(client_id, {
                    "event_type": "subscribed",
                    "topic": topic,
                })

            elif message_type == "unsubscribe":
                topic = data.get("topic")
                await ws_manager.unsubscribe(client_id, topic)
                await ws_manager.send_to_client(client_id, {
                    "event_type": "unsubscribed",
                    "topic": topic,
                })

            elif message_type == "ping":
                await ws_manager.send_to_client(client_id, {
                    "event_type": "pong",
                    "timestamp": data.get("timestamp"),
                })

            else:
                logger.warning(f"Unknown message type: {message_type}")

    except WebSocketDisconnect:
        await ws_manager.disconnect(client_id)
```

**Router registrieren in** `src/main.py`:

```python
from .api.v1 import websocket

app.include_router(websocket.router, prefix="/api/v1")
```

#### Integration mit Handlers

**sensor_handler.py erweitern:**

```python
from ...websocket.manager import WebSocketManager

async def handle_sensor_data(topic: str, payload: dict) -> None:
    # ... existing code ...

    # After saving to database:
    # Broadcast real-time update via WebSocket
    ws_manager = WebSocketManager()
    await ws_manager.broadcast({
        "event_type": "sensor_data",
        "esp_id": esp_id,
        "gpio": gpio,
        "sensor_type": sensor_type,
        "value": processed_value,
        "unit": unit,
        "timestamp": datetime.utcnow().isoformat(),
    }, topic=f"sensor_data/{esp_id}")
```

**actuator_handler.py erweitern:**

```python
from ...websocket.manager import WebSocketManager

async def handle_actuator_status(topic: str, payload: dict) -> None:
    # ... existing code ...

    # Broadcast actuator status via WebSocket
    ws_manager = WebSocketManager()
    await ws_manager.broadcast({
        "event_type": "actuator_status",
        "esp_id": esp_id,
        "gpio": gpio,
        "actuator_type": actuator_type,
        "is_active": is_active,
        "value": value,
        "timestamp": datetime.utcnow().isoformat(),
    }, topic=f"actuator_status/{esp_id}")
```

#### Tests

**Test-Datei:** `tests/unit/test_websocket_manager.py`

```python
import pytest
from unittest.mock import AsyncMock, MagicMock

from god_kaiser_server.src.websocket.manager import WebSocketManager

@pytest.mark.asyncio
async def test_websocket_singleton():
    """WebSocketManager should be singleton."""
    ws1 = WebSocketManager()
    ws2 = WebSocketManager()
    assert ws1 is ws2

@pytest.mark.asyncio
async def test_connect_and_disconnect():
    """Should handle connection lifecycle."""
    ws_manager = WebSocketManager()
    mock_websocket = AsyncMock()

    # Connect
    client_id = await ws_manager.connect(mock_websocket)
    assert client_id is not None
    assert ws_manager.get_active_connections() == 1

    # Disconnect
    await ws_manager.disconnect(client_id)
    assert ws_manager.get_active_connections() == 0

@pytest.mark.asyncio
async def test_subscribe_and_broadcast():
    """Should handle topic subscriptions."""
    ws_manager = WebSocketManager()
    mock_ws1 = AsyncMock()
    mock_ws2 = AsyncMock()

    # Connect two clients
    client1 = await ws_manager.connect(mock_ws1)
    client2 = await ws_manager.connect(mock_ws2)

    # Subscribe client1 to topic
    await ws_manager.subscribe(client1, "sensor_data/ESP_01")

    # Broadcast to topic
    sent = await ws_manager.broadcast(
        {"event_type": "test", "value": 123},
        topic="sensor_data/ESP_01"
    )

    assert sent == 1  # Only client1 received
    mock_ws1.send_json.assert_called()
```

---

## 4. PHASE 5 - REST API ENDPOINTS (Optional für jetzt)

**Status:** ⏳ **GEPLANT** - Kann nach Phase 3 & 4 implementiert werden

**Priorität:** 🟢 **MITTEL** (Frontend Integration)

### 4.1 Fehlende Endpoints

| Endpoint | Datei | Priorität | Aufwand |
|----------|-------|-----------|---------|
| GET/POST /esp/ | esp.py | 🟡 HIGH | 4-6h |
| GET/POST /sensors/ | sensors.py | 🟡 HIGH | 4-6h |
| GET/POST /actuators/ | actuators.py | 🔴 CRITICAL | 6-8h |
| GET/POST /logic/ | logic.py | 🟡 HIGH | 6-8h |
| GET /health/ | health.py | 🟢 MEDIUM | 2-4h |
| POST /actuators/emergency_stop | actuators.py | 🔴 CRITICAL | 2h |

**Hinweis:** Aktuell läuft alles über MQTT. REST-API ist nur für Frontend-Management nötig.

---

## 5. IMPLEMENTIERUNGS-REIHENFOLGE

### Woche 1: Phase 3 Critical (Logic Engine + Safety)

**Montag-Dienstag:**
- ✅ Logic Engine Basis-Klasse
- ✅ Background Task
- ✅ Rule Evaluation
- ✅ Unit Tests (logic_engine)

**Mittwoch-Donnerstag:**
- ✅ Safety Service vollständig
- ✅ Integration mit actuator_handler.py
- ✅ Unit Tests (safety_service)

**Freitag:**
- ✅ Integration Logic Engine mit sensor_handler.py
- ✅ Integration Logic Engine mit main.py (lifespan)
- ✅ Integration Tests (End-to-End: Sensor → Rule → Actuator)

### Woche 2: Phase 4 (WebSocket) + Phase 3 Polish

**Montag-Dienstag:**
- ✅ WebSocket Manager vollständig
- ✅ WebSocket Endpoint
- ✅ Unit Tests (websocket_manager)

**Mittwoch-Donnerstag:**
- ✅ Integration WebSocket mit sensor_handler.py
- ✅ Integration WebSocket mit actuator_handler.py
- ✅ Integration WebSocket mit logic_engine.py
- ✅ Integration Tests

**Freitag:**
- ✅ Fehlende Sensor Libraries (co2, light, flow) - OPTIONAL
- ✅ Code Review
- ✅ Dokumentation aktualisieren

### Woche 3+: Phase 5 (REST API Endpoints) - OPTIONAL

**Nach Bedarf:**
- ✅ ESP Endpoints (GET/POST /esp/)
- ✅ Sensors CRUD (GET/POST/DELETE /sensors/)
- ✅ Actuators Control (GET/POST /actuators/, emergency_stop)
- ✅ Logic Rules CRUD (GET/POST/DELETE /logic/)
- ✅ Health Checks (GET /health/)

---

## 6. TESTING-STRATEGIE

### Unit Tests (PFLICHT für jede Komponente)

**Coverage-Ziel:** >80% für jede neue Datei

**Test-Dateien:**
```
tests/unit/
├── test_logic_engine.py          # Logic Engine Tests
├── test_safety_service.py        # Safety Service Tests
├── test_websocket_manager.py     # WebSocket Tests
└── test_sensor_libraries.py      # co2, light, flow (wenn implementiert)
```

### Integration Tests

**Test-Dateien:**
```
tests/integration/
├── test_cross_esp_automation.py  # End-to-End: Sensor → Rule → Actuator
├── test_safety_integration.py    # Safety Service Integration
└── test_websocket_events.py      # WebSocket Real-time Events
```

**Test-Szenario (Cross-ESP Automation):**
```python
@pytest.mark.asyncio
async def test_cross_esp_automation_flow(mock_esp32, mock_session):
    """
    Test vollständiger Automation-Flow:
    1. Sensor-Daten kommen von ESP_01 GPIO 34 (Temperature > 25°C)
    2. Logic Engine evaluiert Rule
    3. Actuator-Command wird an ESP_02 GPIO 18 gesendet (Pump ON)
    4. WebSocket Notification
    """
    # Setup Rule
    rule = CrossESPLogic(
        rule_name="auto_irrigation",
        enabled=True,
        trigger_conditions={
            "type": "sensor_threshold",
            "esp_id": "ESP_01",
            "gpio": 34,
            "operator": ">",
            "value": 25.0,
        },
        actions=[
            {
                "type": "actuator_command",
                "esp_id": "ESP_02",
                "gpio": 18,
                "value": 1.0,
            }
        ],
    )
    mock_session.add(rule)

    # Simulate sensor data
    await mock_esp32.send_sensor_data("ESP_01", 34, 26.5)

    # Wait for Logic Engine to evaluate
    await asyncio.sleep(1.5)

    # Verify actuator command was sent
    actuator_command = mock_esp32.get_last_actuator_command("ESP_02", 18)
    assert actuator_command is not None
    assert actuator_command["value"] == 1.0

    # Verify WebSocket notification
    ws_events = mock_websocket.get_broadcasted_events()
    assert any(e["event_type"] == "logic_execution" for e in ws_events)
```

---

## 7. ABHÄNGIGKEITEN & KRITISCHE PFADE

### Komponenten-Abhängigkeiten

```
Logic Engine
    ↓ requires
    - CrossESPLogic Model (✅ fertig)
    - LogicExecutionHistory Model (✅ fertig)
    - SensorRepository (✅ fertig)
    - ActuatorRepository (✅ fertig)
    - MQTTPublisher (✅ fertig)
    ↓ integrates with
    - sensor_handler.py (✅ fertig)
    - main.py lifespan (⚠️ ändern)

Safety Service
    ↓ requires
    - ActuatorConfig Model (✅ fertig)
    - SensorConfig Model (✅ fertig)
    - SafetyCheckResult Schema (❌ erstellen)
    ↓ integrates with
    - actuator_handler.py (✅ fertig)
    - logic_engine.py (⚠️ ändern nach Safety-Impl.)

WebSocket Manager
    ↓ requires
    - FastAPI WebSocket (✅ vorhanden)
    - WebSocket Event Schemas (❌ erstellen)
    ↓ integrates with
    - sensor_handler.py (✅ fertig)
    - actuator_handler.py (✅ fertig)
    - logic_engine.py (⚠️ ändern)
    - api/v1/websocket.py (❌ erstellen)
```

### Kritischer Pfad (Reihenfolge wichtig!)

1. **SafetyCheckResult Schema** → Safety Service braucht das
2. **Safety Service** → Wird von actuator_handler.py gebraucht
3. **Logic Engine** → Kern-Feature, braucht Safety Service
4. **WebSocket Event Schemas** → WebSocket Manager braucht das
5. **WebSocket Manager** → Integration mit allen Handlers

---

## 8. CODE-QUALITÄTS-CHECKLISTE

### Vor jedem Commit

- [ ] **Code formatiert** (`black god_kaiser_server/`)
- [ ] **Keine Linting-Fehler** (`ruff check god_kaiser_server/`)
- [ ] **Unit-Tests geschrieben** (>80% Coverage)
- [ ] **Type Hints vollständig** (mypy-ready)
- [ ] **Docstrings vorhanden** (Google-Style)
- [ ] **Logging hinzugefügt** (INFO für wichtige Operationen, ERROR für Fehler)
- [ ] **Error Handling** (try/except mit logging)
- [ ] **Integration Tests** (wenn MQTT/API betroffen)
- [ ] **MQTT-Protokoll-Kompatibilität** (ESP32 Interaktion)
- [ ] **Database-Migration** (wenn Models geändert)

### ESP32-Kompatibilität (KRITISCH!)

Wenn du etwas implementierst, das mit ESP32 interagiert:

- [ ] **MQTT-Protokoll prüfen:** `El Trabajante/docs/Mqtt_Protocoll.md`
- [ ] **Topic-Schema korrekt:** `kaiser/{kaiser_id}/esp/{esp_id}/...`
- [ ] **Payload-Struktur korrekt:** JSON-Schema aus ESP32-Docs
- [ ] **QoS-Level korrekt:** QoS 1 für Sensor-Daten, QoS 2 für Commands
- [ ] **Error-Codes konsistent:** `El Trabajante/src/models/error_codes.h`

---

## 9. DOKUMENTATIONS-UPDATES

### Nach jeder implementierten Komponente

**Aktualisieren:**
- `.claude/CLAUDE_SERVER.md` Section 14: Implementierungs-Status
- `.claude/PI_SERVER_REFACTORING.md` Phase-Status (Deliverables)
- `El Servador/docs/ARCHITECTURE.md` (wenn Architektur geändert)
- `El Servador/docs/API.md` (wenn neue Endpoints)

**Neue Dokumentation erstellen:**
- `El Servador/docs/LOGIC_ENGINE.md` - Logic Engine Dokumentation
- `El Servador/docs/SAFETY_SERVICE.md` - Safety Service Dokumentation
- `El Servador/docs/WEBSOCKET_API.md` - WebSocket Event-Spezifikation

---

## 10. RISIKEN & MITIGATIONEN

### Risiko 1: Logic Engine Performance

**Risiko:** Background-Task evaluiert alle Rules jede Sekunde - könnte bei vielen Rules langsam werden.

**Mitigation:**
- Implementiere Rule-Caching
- Nur aktivierte Rules laden
- Indexierung auf CrossESPLogic.enabled + priority
- Performance-Test: 100 Rules in <100ms evaluieren

### Risiko 2: WebSocket Connection Limits

**Risiko:** Viele gleichzeitige WebSocket-Verbindungen könnten Server überlasten.

**Mitigation:**
- Connection Limit (max 100 concurrent)
- Rate Limiting für Broadcasts
- Automatic Disconnection nach Timeout (5 min Inaktivität)

### Risiko 3: MQTT-Payload Breaking Changes

**Risiko:** Änderungen an MQTT-Payloads könnten ESP32 brechen.

**Mitigation:**
- **NIE** MQTT-Payloads ohne ESP32-Anpassung ändern
- Backward-Compatibility testen
- Versionierung für Payload-Schema

### Risiko 4: Safety Service False Negatives

**Risiko:** Safety-Check könnte unsichere Commands durchlassen.

**Mitigation:**
- Comprehensive Unit-Tests für alle Edge-Cases
- ESP32-seitige Safety-Checks behalten (Defense in Depth)
- Logging aller Safety-Rejections

---

## 11. SUCCESS METRICS

### Phase 3 - Erfolgskriterien

- ✅ Logic Engine Background Task läuft ohne Crashes (24h Uptime-Test)
- ✅ Rule Evaluation <100ms für 100 aktive Rules
- ✅ Safety Service blockiert alle unsicheren Commands (0% False Negatives)
- ✅ Cross-ESP Automation funktioniert (Sensor A → Actuator B)
- ✅ Unit-Test Coverage >80% für logic_engine.py und safety_service.py
- ✅ Integration-Tests PASS (Cross-ESP Flow)

### Phase 4 - Erfolgskriterien

- ✅ WebSocket Manager läuft stabil (24h Uptime-Test)
- ✅ Real-time Updates <100ms Latency (Sensor → WebSocket → Frontend)
- ✅ Multiple Clients (>10) gleichzeitig verbunden
- ✅ Topic-Subscriptions funktionieren korrekt
- ✅ Unit-Test Coverage >80% für websocket_manager.py

### Integration - Erfolgskriterien

- ✅ End-to-End Test PASS: ESP32 → MQTT → Logic Engine → Actuator Command
- ✅ End-to-End Test PASS: Sensor Data → WebSocket → Frontend Update
- ✅ Safety-Rejections werden korrekt geloggt
- ✅ Emergency Stop blockiert alle Actuator-Commands

---

## 12. ZUSAMMENFASSUNG

### Was wird implementiert?

**Phase 3 (Kritisch):**
1. ✅ Logic Engine - Cross-ESP Automation Engine
2. ✅ Safety Service - Actuator Safety Validation

**Phase 4 (Hoch):**
3. ✅ WebSocket Manager - Real-time Frontend Updates

**Phase 5 (Optional):**
4. ⏳ REST API Endpoints - Frontend Management (später)

### Geschätzter Gesamt-Aufwand

- **Logic Engine:** 8-12h
- **Safety Service:** 4-6h
- **WebSocket Manager:** 6-8h
- **Tests & Integration:** 6-8h
- **Dokumentation:** 2-4h

**Total:** ~26-38 Stunden (ca. 2-3 Wochen bei 2-3h/Tag)

### Kritische Erfolgsfaktoren

1. **MQTT-Protokoll-Kompatibilität** - ESP32 muss weiterhin funktionieren
2. **Safety-First** - Safety Service MUSS alle unsicheren Commands blocken
3. **Performance** - Logic Engine <100ms für 100 Rules
4. **Test Coverage** - >80% für alle neuen Komponenten
5. **Integration Tests** - End-to-End Flows müssen funktionieren

---

**Ende des Implementierungsplans**

**Nächster Schritt:** Logic Engine Implementierung starten (Datei: `src/services/logic_engine.py`)

**Status-Updates:** Diese Datei als "Living Document" behandeln - nach jeder implementierten Komponente aktualisieren.
