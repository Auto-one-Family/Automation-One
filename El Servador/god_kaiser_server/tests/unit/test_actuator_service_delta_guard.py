from types import SimpleNamespace

from src.services.actuator_service import ActuatorService


def test_is_noop_delta_off_when_already_off():
    state = SimpleNamespace(state="off", current_value=0.0)
    assert ActuatorService._is_noop_delta("OFF", 0.0, state) is True


def test_is_noop_delta_on_when_already_on():
    state = SimpleNamespace(state="on", current_value=1.0)
    assert ActuatorService._is_noop_delta("ON", 1.0, state) is True


def test_is_noop_delta_false_when_state_differs():
    state = SimpleNamespace(state="off", current_value=0.0)
    assert ActuatorService._is_noop_delta("ON", 1.0, state) is False
