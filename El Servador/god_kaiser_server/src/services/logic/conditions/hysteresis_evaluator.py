"""
Hysteresis Condition Evaluator

Implementiert Hysterese-Logik für schwellwertbasierte Bedingungen.
Verhindert "Flattern" bei Werten nahe am Schwellwert.

PATTERN: Folgt BaseConditionEvaluator (siehe sensor_evaluator.py)
STATE: In-Memory pro Rule+Condition (geht bei Restart verloren → Default: inactive)

Phase: Logic Engine Phase 2
Author: AutomationOne Development Team
"""

from dataclasses import dataclass
from datetime import datetime, UTC
from typing import Dict, Optional

from ....core.logging_config import get_logger
from .base import BaseConditionEvaluator

logger = get_logger(__name__)


@dataclass
class HysteresisState:
    """
    Zustand einer Hysterese-Condition.

    Attributes:
        is_active: Aktueller Aktivierungszustand
        last_activation: Zeitpunkt der letzten Aktivierung
        last_deactivation: Zeitpunkt der letzten Deaktivierung
        last_value: Letzter verarbeiteter Sensor-Wert
    """
    is_active: bool = False
    last_activation: Optional[datetime] = None
    last_deactivation: Optional[datetime] = None
    last_value: Optional[float] = None


class HysteresisConditionEvaluator(BaseConditionEvaluator):
    """
    Evaluator für Hysterese-Conditions.

    Zwei Modi:
    - Kühlung: activate_above + deactivate_below (z.B. Lüfter)
    - Heizung: activate_below + deactivate_above (z.B. Heizung)

    State-Key Format: "{rule_id}:{condition_index}"

    Beispiel Kühlung:
        {
            "type": "hysteresis",
            "esp_id": "ESP_GREENHOUSE_1",
            "gpio": 4,
            "sensor_type": "DS18B20",
            "activate_above": 28.0,
            "deactivate_below": 24.0
        }

    Beispiel Heizung:
        {
            "type": "hysteresis",
            "esp_id": "ESP_GREENHOUSE_1",
            "gpio": 4,
            "activate_below": 18.0,
            "deactivate_above": 22.0
        }
    """

    def __init__(self):
        """Initialisiert den Hysterese-Evaluator."""
        self._states: Dict[str, HysteresisState] = {}
        logger.info("HysteresisConditionEvaluator initialized")

    def supports(self, condition_type: str) -> bool:
        """
        Sagt der Engine dass wir 'hysteresis' Conditions handeln.

        Args:
            condition_type: Condition type string

        Returns:
            True wenn condition_type == "hysteresis"
        """
        return condition_type == "hysteresis"

    async def evaluate(self, condition: Dict, context: Dict) -> bool:
        """
        Evaluiert eine Hysterese-Condition.

        Args:
            condition: Die Condition-Definition aus der Regel mit:
                - type: "hysteresis"
                - esp_id: ESP device ID
                - gpio: GPIO pin number
                - sensor_type: Optional sensor type filter
                - Kühlung-Modus: activate_above, deactivate_below
                - Heizung-Modus: activate_below, deactivate_above
            context: Enthält:
                - sensor_data: dict mit esp_id, gpio, value, sensor_type
                - rule_id: Regel-UUID
                - condition_index: Index der Condition in der Regel

        Returns:
            True wenn Bedingung erfüllt (Aktion soll ausgeführt werden)
        """
        sensor_data = context.get("sensor_data", {})

        # 1. Prüfe ob dieser Sensor zur Condition passt
        if not self._matches_sensor(condition, sensor_data):
            # Nicht unser Sensor - keine Änderung am State
            # WICHTIG: Gib aktuellen State zurück, nicht False!
            state = self._get_state(context)
            return state.is_active

        # 2. Hole den Wert
        value = sensor_data.get("value")
        if value is None:
            logger.warning(
                f"No value in sensor_data for {sensor_data.get('esp_id')}:{sensor_data.get('gpio')}"
            )
            return self._get_state(context).is_active

        try:
            value = float(value)
        except (ValueError, TypeError) as e:
            logger.error(f"Invalid numeric value for hysteresis condition: {e}")
            return self._get_state(context).is_active

        # 3. Hole/Erstelle State für diese Rule+Condition
        state = self._get_state(context)
        state.last_value = value

        # 4. Hysterese-Logik
        activate_above = condition.get("activate_above")
        deactivate_below = condition.get("deactivate_below")
        activate_below = condition.get("activate_below")
        deactivate_above = condition.get("deactivate_above")

        now = datetime.now(UTC)

        # Mode A: Kühlung (activate_above / deactivate_below)
        if activate_above is not None and deactivate_below is not None:
            try:
                activate_above = float(activate_above)
                deactivate_below = float(deactivate_below)
            except (ValueError, TypeError) as e:
                logger.error(f"Invalid threshold values for cooling mode: {e}")
                return False

            if value > activate_above and not state.is_active:
                state.is_active = True
                state.last_activation = now
                logger.info(
                    f"Hysteresis ACTIVATED (cooling): value={value:.2f} > threshold={activate_above:.2f} "
                    f"[rule={context.get('rule_id')}, condition={context.get('condition_index')}]"
                )
            elif value < deactivate_below and state.is_active:
                state.is_active = False
                state.last_deactivation = now
                logger.info(
                    f"Hysteresis DEACTIVATED (cooling): value={value:.2f} < threshold={deactivate_below:.2f} "
                    f"[rule={context.get('rule_id')}, condition={context.get('condition_index')}]"
                )
            # Zwischen den Schwellen: Zustand bleibt!

        # Mode B: Heizung (activate_below / deactivate_above)
        elif activate_below is not None and deactivate_above is not None:
            try:
                activate_below = float(activate_below)
                deactivate_above = float(deactivate_above)
            except (ValueError, TypeError) as e:
                logger.error(f"Invalid threshold values for heating mode: {e}")
                return False

            if value < activate_below and not state.is_active:
                state.is_active = True
                state.last_activation = now
                logger.info(
                    f"Hysteresis ACTIVATED (heating): value={value:.2f} < threshold={activate_below:.2f} "
                    f"[rule={context.get('rule_id')}, condition={context.get('condition_index')}]"
                )
            elif value > deactivate_above and state.is_active:
                state.is_active = False
                state.last_deactivation = now
                logger.info(
                    f"Hysteresis DEACTIVATED (heating): value={value:.2f} > threshold={deactivate_above:.2f} "
                    f"[rule={context.get('rule_id')}, condition={context.get('condition_index')}]"
                )

        else:
            logger.error(
                "Invalid hysteresis config: need activate_above+deactivate_below "
                "OR activate_below+deactivate_above"
            )
            return False

        return state.is_active

    def _get_state_key(self, context: Dict) -> str:
        """
        Generiert eindeutigen Key für State-Speicherung.

        Args:
            context: Evaluation context

        Returns:
            State key im Format "rule_id:condition_index"
        """
        rule_id = context.get("rule_id", "unknown")
        condition_idx = context.get("condition_index", 0)
        return f"{rule_id}:{condition_idx}"

    def _get_state(self, context: Dict) -> HysteresisState:
        """
        Holt oder erstellt State für eine Rule+Condition.

        Args:
            context: Evaluation context

        Returns:
            HysteresisState für diese Rule+Condition
        """
        key = self._get_state_key(context)
        if key not in self._states:
            self._states[key] = HysteresisState()
            logger.debug(f"Created new hysteresis state for {key}")
        return self._states[key]

    def _matches_sensor(self, condition: Dict, sensor_data: Dict) -> bool:
        """
        Prüft ob der Sensor zur Condition passt.

        Args:
            condition: Condition definition
            sensor_data: Sensor data from context

        Returns:
            True wenn ESP-ID, GPIO und optional sensor_type matchen
        """
        # ESP-ID muss matchen
        if condition.get("esp_id") != sensor_data.get("esp_id"):
            return False

        # GPIO muss matchen
        if condition.get("gpio") != sensor_data.get("gpio"):
            return False

        # Sensor-Type ist optional
        cond_sensor_type = condition.get("sensor_type")
        if cond_sensor_type and cond_sensor_type != sensor_data.get("sensor_type"):
            return False

        return True

    def reset_state(self, rule_id: str, condition_index: int = 0) -> None:
        """
        Setzt State zurück (für Testing/Admin).

        Args:
            rule_id: Regel-UUID
            condition_index: Index der Condition in der Regel
        """
        key = f"{rule_id}:{condition_index}"
        if key in self._states:
            del self._states[key]
            logger.info(f"Hysteresis state reset for {key}")
        else:
            logger.debug(f"No state to reset for {key}")

    def get_all_states(self) -> Dict[str, HysteresisState]:
        """
        Gibt alle States zurück (für Debugging/Monitoring).

        Returns:
            Copy der State-Dictionary
        """
        return self._states.copy()

    def get_state_for_rule(self, rule_id: str, condition_index: int = 0) -> Optional[HysteresisState]:
        """
        Gibt State für eine spezifische Rule+Condition zurück.

        Args:
            rule_id: Regel-UUID
            condition_index: Index der Condition

        Returns:
            HysteresisState oder None wenn nicht vorhanden
        """
        key = f"{rule_id}:{condition_index}"
        return self._states.get(key)
