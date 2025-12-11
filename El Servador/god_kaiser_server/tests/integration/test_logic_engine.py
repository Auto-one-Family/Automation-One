"""
Integration Tests: Logic Engine

Tests Logic Engine action execution with schema compatibility fixes.
"""

import pytest
import uuid
from unittest.mock import AsyncMock, MagicMock
from sqlalchemy.ext.asyncio import AsyncSession

from src.services.logic_engine import LogicEngine


@pytest.fixture
async def mock_actuator_service():
    """Create a mock ActuatorService."""
    service = AsyncMock()
    service.send_command = AsyncMock(return_value=True)
    return service


@pytest.fixture
async def mock_logic_repo():
    """Create a mock LogicRepository."""
    repo = AsyncMock()
    return repo


@pytest.fixture
async def mock_websocket_manager():
    """Create a mock WebSocketManager."""
    manager = AsyncMock()
    return manager


@pytest.fixture
async def logic_engine(mock_logic_repo, mock_actuator_service, mock_websocket_manager):
    """Create LogicEngine instance with mocked dependencies."""
    engine = LogicEngine(
        logic_repo=mock_logic_repo,
        actuator_service=mock_actuator_service,
        websocket_manager=mock_websocket_manager,
    )
    return engine


class TestLogicEngineSchemaCompatibility:
    """Test Logic Engine schema compatibility fixes."""
    
    @pytest.mark.asyncio
    async def test_action_type_actuator_command(self, logic_engine: LogicEngine, mock_actuator_service):
        """Test that action_type 'actuator_command' works (existing behavior)."""
        actions = [
            {
                "type": "actuator_command",
                "esp_id": "ESP_TEST_001",
                "gpio": 5,
                "command": "ON",
                "value": 1.0,
                "duration_seconds": 10,
            }
        ]
        
        rule_id = uuid.uuid4()
        trigger_data = {"type": "sensor", "timestamp": 1234567890}
        rule_name = "test_rule"
        
        await logic_engine._execute_actions(
            actions=actions,
            trigger_data=trigger_data,
            rule_id=rule_id,
            rule_name=rule_name
        )
        
        # Verify actuator service was called
        mock_actuator_service.send_command.assert_called_once()
        call_kwargs = mock_actuator_service.send_command.call_args[1]
        assert call_kwargs["esp_id"] == "ESP_TEST_001"
        assert call_kwargs["gpio"] == 5
        assert call_kwargs["command"] == "ON"
        assert call_kwargs["value"] == 1.0
        assert call_kwargs["duration"] == 10
    
    @pytest.mark.asyncio
    async def test_action_type_actuator(self, logic_engine: LogicEngine, mock_actuator_service):
        """Test that action_type 'actuator' works (schema compatibility fix)."""
        actions = [
            {
                "type": "actuator",  # Schema allows this, not just "actuator_command"
                "esp_id": "ESP_TEST_001",
                "gpio": 5,
                "command": "ON",
                "value": 1.0,
                "duration_seconds": 10,
            }
        ]
        
        rule_id = uuid.uuid4()
        trigger_data = {"type": "sensor", "timestamp": 1234567890}
        rule_name = "test_rule"
        
        await logic_engine._execute_actions(
            actions=actions,
            trigger_data=trigger_data,
            rule_id=rule_id,
            rule_name=rule_name
        )
        
        # Verify actuator service was called
        mock_actuator_service.send_command.assert_called_once()
        call_kwargs = mock_actuator_service.send_command.call_args[1]
        assert call_kwargs["esp_id"] == "ESP_TEST_001"
        assert call_kwargs["gpio"] == 5
        assert call_kwargs["duration"] == 10
    
    @pytest.mark.asyncio
    async def test_duration_seconds(self, logic_engine: LogicEngine, mock_actuator_service):
        """Test that duration_seconds works (existing behavior)."""
        actions = [
            {
                "type": "actuator_command",
                "esp_id": "ESP_TEST_001",
                "gpio": 5,
                "command": "ON",
                "value": 1.0,
                "duration_seconds": 30,  # Existing field name
            }
        ]
        
        rule_id = uuid.uuid4()
        trigger_data = {"type": "sensor", "timestamp": 1234567890}
        rule_name = "test_rule"
        
        await logic_engine._execute_actions(
            actions=actions,
            trigger_data=trigger_data,
            rule_id=rule_id,
            rule_name=rule_name
        )
        
        # Verify duration was read correctly
        call_kwargs = mock_actuator_service.send_command.call_args[1]
        assert call_kwargs["duration"] == 30
    
    @pytest.mark.asyncio
    async def test_duration_field(self, logic_engine: LogicEngine, mock_actuator_service):
        """Test that duration field works (schema compatibility fix)."""
        actions = [
            {
                "type": "actuator_command",
                "esp_id": "ESP_TEST_001",
                "gpio": 5,
                "command": "ON",
                "value": 1.0,
                "duration": 60,  # Schema allows this, not just "duration_seconds"
            }
        ]
        
        rule_id = uuid.uuid4()
        trigger_data = {"type": "sensor", "timestamp": 1234567890}
        rule_name = "test_rule"
        
        await logic_engine._execute_actions(
            actions=actions,
            trigger_data=trigger_data,
            rule_id=rule_id,
            rule_name=rule_name
        )
        
        # Verify duration was read correctly
        call_kwargs = mock_actuator_service.send_command.call_args[1]
        assert call_kwargs["duration"] == 60
    
    @pytest.mark.asyncio
    async def test_duration_fallback(self, logic_engine: LogicEngine, mock_actuator_service):
        """Test that duration_seconds takes precedence over duration."""
        actions = [
            {
                "type": "actuator_command",
                "esp_id": "ESP_TEST_001",
                "gpio": 5,
                "command": "ON",
                "value": 1.0,
                "duration_seconds": 30,  # Should take precedence
                "duration": 60,  # Should be ignored
            }
        ]
        
        rule_id = uuid.uuid4()
        trigger_data = {"type": "sensor", "timestamp": 1234567890}
        rule_name = "test_rule"
        
        await logic_engine._execute_actions(
            actions=actions,
            trigger_data=trigger_data,
            rule_id=rule_id,
            rule_name=rule_name
        )
        
        # Verify duration_seconds was used
        call_kwargs = mock_actuator_service.send_command.call_args[1]
        assert call_kwargs["duration"] == 30
    
    @pytest.mark.asyncio
    async def test_duration_default_zero(self, logic_engine: LogicEngine, mock_actuator_service):
        """Test that duration defaults to 0 if neither field is provided."""
        actions = [
            {
                "type": "actuator_command",
                "esp_id": "ESP_TEST_001",
                "gpio": 5,
                "command": "ON",
                "value": 1.0,
                # No duration fields
            }
        ]
        
        rule_id = uuid.uuid4()
        trigger_data = {"type": "sensor", "timestamp": 1234567890}
        rule_name = "test_rule"
        
        await logic_engine._execute_actions(
            actions=actions,
            trigger_data=trigger_data,
            rule_id=rule_id,
            rule_name=rule_name
        )
        
        # Verify duration defaults to 0
        call_kwargs = mock_actuator_service.send_command.call_args[1]
        assert call_kwargs["duration"] == 0



