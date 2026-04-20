"""
Config Payload Builder Service

Builds ESP32-compatible configuration payloads from database models.

Features:
- Configurable field name mapping via ConfigMappingEngine
- Metadata extraction (subzone_id from sensor_metadata/actuator_metadata)
- Default value handling
- Zone information extraction for logging
- Runtime-configurable mapping overrides via SystemConfig
- Offline rules extraction for local hysteresis control during network loss

Converts Server DB models to ESP32 payload format using flexible mappings
that can be customized without code changes.

Phase: Runtime Config Flow Implementation
Priority: CRITICAL
Status: IMPLEMENTED
"""

from typing import Any, Dict, List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config_mapping import ConfigMappingEngine, get_mapping_engine
from ..core.logging_config import get_logger
from ..db.models.actuator import ActuatorConfig
from ..db.models.logic import LogicHysteresisState
from ..db.models.sensor import SensorConfig
from ..db.repositories import ESPRepository, SensorRepository, ActuatorRepository, LogicRepository
from ..sensors.sensor_type_registry import normalize_sensor_type

logger = get_logger(__name__)


def _get_default_deadband(sensor_type: str) -> float:
    """Return a type-specific deadband for auto-converting a simple threshold to hysteresis.

    Called only for digital sensors that deliver calibrated physical values directly
    on the ESP32 (temperature, humidity, pressure, CO2, light, flow). Analog sensors
    that require server-side calibration (ph, ec, moisture, soil_moisture) are
    filtered out by the P4-GUARD before this function is ever reached.
    """
    DEADBAND_MAP = {
        "sht31_temp": 2.0,       # °C — typical HVAC hysteresis band
        "ds18b20": 2.0,          # °C
        "bmp280_temp": 2.0,      # °C
        "bme280_temp": 2.0,      # °C
        "sht31_humidity": 5.0,   # %RH — higher variance for humidity
        "bme280_humidity": 5.0,
        "bmp280_pressure": 5.0,  # hPa
        "bme280_pressure": 5.0,
        "co2": 50.0,             # ppm — large natural fluctuations
        "light": 100.0,          # lux
        "flow": 0.5,             # l/min — conservative
    }
    for prefix, deadband in DEADBAND_MAP.items():
        if sensor_type.startswith(prefix):
            return deadband
    return 2.0  # Safe fallback for unmapped types


def _days_of_week_db_to_tm_mask(raw_days: Any) -> int:
    """
    Convert DB weekday list (0=Mon..6=Sun) to tm_wday bitmask (bit0=Sun..bit6=Sat).

    Defaults:
    - Field missing (None): all days (0x7F)
    - Empty list: no day active (0x00)
    - Invalid/non-list or all invalid values: all days (0x7F)
    """
    if raw_days is None:
        return 0x7F
    if isinstance(raw_days, list) and len(raw_days) == 0:
        return 0x00
    if not isinstance(raw_days, list):
        return 0x7F

    db_to_tm_wday = {0: 1, 1: 2, 2: 3, 3: 4, 4: 5, 5: 6, 6: 0}
    days_mask = 0
    for day in raw_days:
        try:
            tm_wday = db_to_tm_wday.get(int(day))
        except (TypeError, ValueError):
            tm_wday = None
        if tm_wday is not None:
            days_mask |= (1 << tm_wday)

    if days_mask == 0:
        logger.warning(
            "[CONFIG] Invalid days_of_week values (%s), fallback to all days (0x7F)",
            raw_days,
        )
        return 0x7F
    return days_mask


class ConfigConflictError(Exception):
    """
    Raised when config contains GPIO conflicts.

    This error indicates that multiple sensors/actuators are configured
    for the same GPIO pin, which would cause hardware conflicts on the ESP32.

    Phase: 2 (GPIO Validation)
    """

    pass


class ConfigPayloadBuilder:
    """
    Baut Config-Payloads für ESP32-Geräte.

    VERWENDUNG:
        Wird automatisch von Sensor/Actuator APIs aufgerufen nach CRUD-Operationen.

    ARCHITEKTUR:
        1. Sensor/Actuator CRUD API führt DB-Operation durch
        2. build_combined_config() lädt alle Sensoren/Aktoren eines ESP aus DB
        3. Für jeden Sensor/Actuator wird apply_sensor/actuator_mapping() aufgerufen
        4. Mappings kommen aus core/config_mapping.py (DEFAULT_SENSOR_MAPPINGS)
        5. Ergebnis wird an esp_service.send_config() übergeben
        6. MQTT Publisher sendet an: kaiser/{kaiser_id}/esp/{esp_id}/config

    FELD-KONFIGURATION:
        Welche Felder zum ESP32 gesendet werden, wird in
        core/config_mapping.py definiert (DEFAULT_SENSOR_MAPPINGS).

    HINWEIS:
        Ein manueller Config-Push-Endpoint existiert NICHT.
        Configs werden automatisch nach CRUD-Operationen gesendet.

    Converts database models to ESP32 payload format with configurable field mapping
    and zone information extraction.

    Field mappings can be customized via:
    1. Constructor parameter (custom_mapping_engine)
    2. SystemConfig entries (config_mapping.sensor, config_mapping.actuator)
    3. Default mappings in config_mapping.py

    Usage:
        # Default mappings
        builder = ConfigPayloadBuilder()
        config = await builder.build_combined_config(esp_id, db)

        # Custom mappings
        engine = ConfigMappingEngine(sensor_mappings=[...])
        builder = ConfigPayloadBuilder(mapping_engine=engine)
    """

    # Maximum offline rules per ESP32 (firmware limit: 8 rules max)
    MAX_OFFLINE_RULES = 8

    # Sensor types that require calibration parameters to convert ADC raw values
    # to physical units. The ESP32 firmware's applyLocalConversion() has no
    # calibration data for these sensors and returns only the ADC raw value
    # (0-4095). Offline rule thresholds expressed in physical units (e.g. pH 7.5,
    # EC 1.8 mS/cm) would be compared against raw ADC counts — meaningless and
    # potentially dangerous (e.g. ADC 2048 > pH 7.5 → dosing pump fires).
    CALIBRATION_REQUIRED_SENSOR_TYPES = {"ph", "ec", "moisture", "soil_moisture"}

    def __init__(
        self,
        sensor_repo: Optional[SensorRepository] = None,
        actuator_repo: Optional[ActuatorRepository] = None,
        esp_repo: Optional[ESPRepository] = None,
        logic_repo: Optional[LogicRepository] = None,
        mapping_engine: Optional[ConfigMappingEngine] = None,
    ):
        """
        Initialize ConfigPayloadBuilder.

        Args:
            sensor_repo: Sensor repository (optional, created if not provided)
            actuator_repo: Actuator repository (optional, created if not provided)
            esp_repo: ESP repository (optional, created if not provided)
            logic_repo: Logic repository (optional, created if not provided)
            mapping_engine: Custom field mapping engine (optional, uses global default)
        """
        self.sensor_repo = sensor_repo
        self.actuator_repo = actuator_repo
        self.esp_repo = esp_repo
        self.logic_repo = logic_repo
        self.mapping_engine = mapping_engine or get_mapping_engine()

    def build_sensor_payload(self, sensor: SensorConfig) -> Dict[str, Any]:
        """
        Convert SensorConfig model to ESP32 payload format.

        Uses configurable field mappings from ConfigMappingEngine.
        Default mappings:
        - sensor_name → sensor_name (direct)
        - sensor_type → sensor_type (direct)
        - gpio → gpio (direct)
        - enabled → active (boolean mapping)
        - sample_interval_ms → sample_interval_ms (direct)
        - sensor_metadata.subzone_id → subzone_id (extracted from metadata)
        - raw_mode → always true (ESP32 expects this field)

        Args:
            sensor: SensorConfig model instance

        Returns:
            Dictionary with ESP32-compatible sensor payload
        """
        return self.mapping_engine.apply_sensor_mapping(sensor)

    def build_actuator_payload(self, actuator: ActuatorConfig) -> Dict[str, Any]:
        """
        Convert ActuatorConfig model to ESP32 payload format.

        Uses configurable field mappings from ConfigMappingEngine.
        Default mappings:
        - actuator_name → actuator_name (direct)
        - actuator_type → actuator_type (direct)
        - gpio → gpio (direct)
        - enabled → active (boolean mapping)
        - actuator_metadata.subzone_id → subzone_id (extracted from metadata)
        - actuator_metadata.aux_gpio → aux_gpio (default: 255)
        - actuator_metadata.critical → critical (default: false)
        - actuator_metadata.inverted_logic → inverted_logic (default: false)
        - actuator_metadata.default_state → default_state (default: false)
        - actuator_metadata.default_pwm → default_pwm (default: 0)

        Args:
            actuator: ActuatorConfig model instance

        Returns:
            Dictionary with ESP32-compatible actuator payload
        """
        return self.mapping_engine.apply_actuator_mapping(actuator)

    async def build_combined_config(
        self,
        esp_device_id: str,
        db: AsyncSession,
    ) -> Dict[str, Any]:
        """
        Build combined sensor/actuator configuration payload for ESP32.

        Loads all active sensors and actuators for the ESP device and builds
        a combined payload in ESP32-compatible format.

        Args:
            esp_device_id: ESP device ID (e.g., "ESP_12AB34CD")
            db: Database session

        Returns:
            Dictionary with "sensors" and "actuators" arrays in ESP32 format

        Raises:
            ValueError: If ESP device not found
        """
        # Initialize repositories if not provided
        if not self.esp_repo:
            self.esp_repo = ESPRepository(db)
        if not self.sensor_repo:
            self.sensor_repo = SensorRepository(db)
        if not self.actuator_repo:
            self.actuator_repo = ActuatorRepository(db)
        if not self.logic_repo:
            self.logic_repo = LogicRepository(db)

        # Get ESP device
        esp_device = await self.esp_repo.get_by_device_id(esp_device_id)
        if not esp_device:
            raise ValueError(f"ESP device '{esp_device_id}' not found")

        # Load all sensors and actuators for this ESP
        sensors = await self.sensor_repo.get_by_esp(esp_device.id)
        actuators = await self.actuator_repo.get_by_esp(esp_device.id)

        # Filter only enabled sensors/actuators (ESP32 only processes active ones)
        active_sensors = [s for s in sensors if s.enabled]
        active_actuators = [a for a in actuators if a.enabled]

        # Filter out VIRTUAL sensors — computed server-side (e.g. VPD), never sent to ESP32
        active_sensors = [
            s for s in active_sensors
            if not (getattr(s, "interface_type", None) or "").upper() == "VIRTUAL"
        ]

        # =====================================================================
        # GPIO-Konflikt-Check (Phase 2)
        # Prüft ob mehrere Sensoren/Aktoren auf dem gleichen GPIO konfiguriert sind.
        # I2C and OneWire sensors are EXCLUDED — they share a bus and GPIO is valid
        # to be reused (e.g., two SHT31 configs on GPIO 0 for I2C SDA/SCL).
        # =====================================================================
        used_gpios: dict[int, str] = {}

        for sensor in active_sensors:
            # I2C/OneWire sensors share bus pins — no GPIO conflict possible
            iface = getattr(sensor, "interface_type", None)
            if iface and iface.upper() in ("I2C", "ONEWIRE"):
                continue
            if sensor.gpio in used_gpios:
                sensor_name = sensor.sensor_name or sensor.sensor_type
                raise ConfigConflictError(
                    f"GPIO {sensor.gpio} Konflikt: Sensor '{sensor_name}' "
                    f"kollidiert mit {used_gpios[sensor.gpio]}"
                )
            sensor_name = sensor.sensor_name or sensor.sensor_type
            used_gpios[sensor.gpio] = f"sensor:{sensor_name}"

        for actuator in active_actuators:
            if actuator.gpio in used_gpios:
                actuator_name = actuator.actuator_name or actuator.actuator_type
                raise ConfigConflictError(
                    f"GPIO {actuator.gpio} Konflikt: Actuator '{actuator_name}' "
                    f"kollidiert mit {used_gpios[actuator.gpio]}"
                )
            actuator_name = actuator.actuator_name or actuator.actuator_type
            used_gpios[actuator.gpio] = f"actuator:{actuator_name}"

        logger.debug(f"Config GPIO validation passed: {len(used_gpios)} unique GPIOs")
        # =====================================================================

        # Build payload arrays
        sensor_payloads = [self.build_sensor_payload(s) for s in active_sensors]
        actuator_payloads = [self.build_actuator_payload(a) for a in active_actuators]

        # Build offline rules for local hysteresis control during network loss
        offline_rules = await self._build_offline_rules(db, esp_device)

        # AUT-59: Validate offline_rules consistency against config frame.
        # Rules referencing actuator/sensor GPIOs not present in this config
        # frame would cause a pending-exit blockade on the ESP32 firmware.
        offline_rules = self._validate_offline_rules_consistency(
            offline_rules, sensor_payloads, actuator_payloads, esp_device_id
        )

        # Build combined config
        config = {
            "sensors": sensor_payloads,
            "actuators": actuator_payloads,
            "offline_rules": offline_rules,
        }

        # Log zone information for better traceability
        zone_info = f"zone={esp_device.zone_id or 'none'}"
        if esp_device.zone_name:
            zone_info += f" ({esp_device.zone_name})"

        logger.info(
            f"Built config payload for {esp_device_id}: "
            f"{len(sensor_payloads)} sensors, {len(actuator_payloads)} actuators, "
            f"{len(offline_rules)} offline_rules, {zone_info}"
        )

        return config

    async def _build_offline_rules(
        self,
        db: AsyncSession,
        esp_device: Any,
    ) -> List[Dict[str, Any]]:
        """
        Build offline hysteresis rules for local ESP32 execution during network loss.

        Extracts enabled hysteresis rules where both the trigger sensor and the
        actuator action belong to the same ESP device. These rules are sent to the
        ESP32 so it can maintain basic hysteresis control without server connectivity.

        Only local rules are included — cross-ESP rules (sensor and actuator on
        different ESPs) cannot be executed locally and are excluded.

        Args:
            db: Database session
            esp_device: ESPDevice model instance (must have device_id attribute)

        Returns:
            List of offline rule dicts with fields:
                - actuator_gpio: int
                - sensor_gpio: int
                - sensor_value_type: str  (e.g. "sht31_humidity", "ds18b20")
                - activate_below: float   (heating mode; 0.0 if cooling mode)
                - deactivate_above: float (heating mode; 0.0 if cooling mode)
                - activate_above: float   (cooling mode; 0.0 if heating mode)
                - deactivate_below: float (cooling mode; 0.0 if heating mode)
            Maximum MAX_OFFLINE_RULES entries; excess entries are truncated with a warning.
        """
        if not self.logic_repo:
            self.logic_repo = LogicRepository(db)

        esp_id = esp_device.device_id

        try:
            enabled_rules = await self.logic_repo.get_enabled_rules()
        except Exception as exc:
            logger.error(
                "[CONFIG] Failed to load logic rules for offline_rules build (ESP %s): %s",
                esp_id,
                exc,
                exc_info=True,
            )
            return []

        # Preload all persisted hysteresis states in one query.
        # Key format matches HysteresisConditionEvaluator: "{rule_id}:{condition_index}"
        # This allows _extract_offline_rule to include current_state_active in the payload
        # without N+1 DB queries.
        hysteresis_states: Dict[str, bool] = {}
        try:
            result = await db.execute(select(LogicHysteresisState))
            for row in result.scalars().all():
                key = f"{row.rule_id}:{row.condition_index}"
                hysteresis_states[key] = row.is_active
            logger.debug("[CONFIG] Preloaded %d hysteresis states for ESP %s", len(hysteresis_states), esp_id)
        except Exception as exc:
            logger.warning("[CONFIG] Could not preload hysteresis states for ESP %s: %s", esp_id, exc)

        offline_rules: List[Dict[str, Any]] = []

        for rule in enabled_rules:
            try:
                rule_entry = self._extract_offline_rule(rule, esp_id, hysteresis_states)
                if rule_entry is not None:
                    offline_rules.append(rule_entry)
            except Exception as exc:
                logger.warning(
                    "[CONFIG] Skipping rule '%s' for offline_rules due to extraction error: %s",
                    getattr(rule, "rule_name", "<unknown>"),
                    exc,
                )
                continue

        if len(offline_rules) > self.MAX_OFFLINE_RULES:
            logger.warning(
                "[CONFIG] ESP %s: %d offline rules exceed limit of %d, truncating",
                esp_id,
                len(offline_rules),
                self.MAX_OFFLINE_RULES,
            )
            offline_rules = offline_rules[: self.MAX_OFFLINE_RULES]

        logger.info(
            "[CONFIG] Built %d offline rules for ESP %s (checked %d active rules)",
            len(offline_rules),
            esp_id,
            len(enabled_rules),
        )

        return offline_rules

    def _validate_offline_rules_consistency(
        self,
        offline_rules: List[Dict[str, Any]],
        sensor_payloads: List[Dict[str, Any]],
        actuator_payloads: List[Dict[str, Any]],
        esp_id: str,
    ) -> List[Dict[str, Any]]:
        """
        Filter offline_rules that reference GPIOs absent from the config frame.

        AUT-59: An offline_rule whose actuator_gpio or sensor_gpio has no
        matching entry in the actuator/sensor payload arrays would cause the
        ESP32 firmware to enter a pending-exit blockade.  This guard removes
        such rules before the config is published.

        Args:
            offline_rules: Offline rule dicts from _build_offline_rules
            sensor_payloads: Sensor payloads that will be sent in this config
            actuator_payloads: Actuator payloads that will be sent in this config
            esp_id: Device ID for logging context

        Returns:
            Filtered list containing only consistent offline rules
        """
        if not offline_rules:
            return offline_rules

        actuator_gpios = {int(a["gpio"]) for a in actuator_payloads if "gpio" in a}
        sensor_gpios = {int(s["gpio"]) for s in sensor_payloads if "gpio" in s}

        consistent: List[Dict[str, Any]] = []
        stripped_details: List[Dict[str, Any]] = []

        for rule in offline_rules:
            a_gpio = rule.get("actuator_gpio")
            s_gpio = rule.get("sensor_gpio")
            reasons: List[str] = []

            if a_gpio is not None and int(a_gpio) not in actuator_gpios:
                reasons.append(f"actuator_gpio={a_gpio} not in config actuators")
            if s_gpio is not None and int(s_gpio) not in sensor_gpios:
                reasons.append(f"sensor_gpio={s_gpio} not in config sensors")

            if reasons:
                stripped_details.append({
                    "actuator_gpio": a_gpio,
                    "sensor_gpio": s_gpio,
                    "sensor_value_type": rule.get("sensor_value_type", ""),
                    "reasons": reasons,
                })
            else:
                consistent.append(rule)

        if stripped_details:
            logger.warning(
                "[CONFIG] AUT-59: ESP %s — stripped %d/%d offline_rules "
                "(referenced GPIOs absent in config frame): %s",
                esp_id,
                len(stripped_details),
                len(offline_rules),
                stripped_details,
            )

        return consistent

    def _extract_offline_rule(
        self,
        rule: Any,
        esp_id: str,
        hysteresis_states: Optional[Dict[str, bool]] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Extract a single offline rule entry from a CrossESPLogic rule.

        Returns None when the rule does not qualify as a local hysteresis rule
        for the given ESP device.

        Qualification criteria:
        1. trigger_conditions must be a hysteresis condition (type == "hysteresis")
           — single-condition rules only (compound conditions are excluded)
        2. The hysteresis condition's esp_id must equal esp_id
        3. At least one actuator_command action whose esp_id equals esp_id
        4. Either cooling mode (activate_above + deactivate_below) or
           heating mode (activate_below + deactivate_above) must be present

        Args:
            rule: CrossESPLogic model instance
            esp_id: Device ID of the target ESP (e.g. "ESP_12AB34CD")

        Returns:
            Offline rule dict or None
        """
        tc = rule.trigger_conditions

        # Normalise to a list of conditions for uniform processing
        if isinstance(tc, dict):
            conditions_list = [tc]
        elif isinstance(tc, list):
            conditions_list = tc
        else:
            logger.warning(
                "[CONFIG] Offline-rule skip: rule '%s' — malformed conditions_list (type: %s)",
                rule.rule_name,
                type(tc).__name__,
            )
            return None

        # Determine compound operator; used for 3b rejection and 3c time_filter extraction.
        compound_op: str = getattr(rule, "logic_operator", None) or "AND"

        # 3b: OR-compound rules cannot be expressed as a single ESP hysteresis rule struct.
        if compound_op == "OR" and len(conditions_list) > 1:
            logger.info(
                "[CONFIG] Rule '%s': OR compound not convertible to offline rule",
                rule.rule_name,
            )
            return None

        # Locate the first hysteresis condition that belongs to our ESP.
        # Track condition_index to match HysteresisConditionEvaluator's state key format.
        hysteresis_cond: Optional[Dict[str, Any]] = None
        hysteresis_cond_index: int = 0
        for idx, cond in enumerate(conditions_list):
            if not isinstance(cond, dict):
                continue
            if cond.get("type") == "hysteresis" and cond.get("esp_id") == esp_id:
                hysteresis_cond = cond
                hysteresis_cond_index = idx
                break

        if hysteresis_cond is None:
            # 3a: sensor_threshold / sensor condition fallback.
            # Simple threshold operators are converted to hysteresis by adding a
            # type-specific deadband so the ESP firmware can use its existing
            # hysteresis logic without a new condition type.
            threshold_cond: Optional[Dict[str, Any]] = None
            for cond in conditions_list:
                if not isinstance(cond, dict):
                    continue
                if (
                    cond.get("type") in ("sensor_threshold", "sensor")
                    and cond.get("esp_id") == esp_id
                ):
                    threshold_cond = cond
                    break

            if threshold_cond is None:
                condition_types = [
                    c.get("type", "MISSING") if isinstance(c, dict) else type(c).__name__
                    for c in conditions_list
                ]
                logger.warning(
                    "[CONFIG] Offline-rule skip: rule '%s' — no hysteresis or threshold "
                    "condition found (types: %s)",
                    rule.rule_name,
                    condition_types,
                )
                return None

            # P4-GUARD for threshold path: analog sensors have no calibration data
            # on the ESP32 — applyLocalConversion() delivers only the ADC raw value.
            raw_sensor_type: str = threshold_cond.get("sensor_type") or ""
            normalized_type: str = normalize_sensor_type(raw_sensor_type)
            if normalized_type in self.CALIBRATION_REQUIRED_SENSOR_TYPES:
                logger.info(
                    "[CONFIG] Rule '%s': sensor_type '%s' (normalized: '%s') requires "
                    "calibration — offline threshold rule skipped.",
                    rule.rule_name,
                    raw_sensor_type,
                    normalized_type,
                )
                return None

            op: str = threshold_cond.get("operator", "")
            raw_value = threshold_cond.get("value")
            if raw_value is None:
                logger.info(
                    "[CONFIG] Rule '%s': threshold condition missing 'value', skipping",
                    rule.rule_name,
                )
                return None
            try:
                threshold_value = float(raw_value)
            except (ValueError, TypeError):
                logger.info(
                    "[CONFIG] Rule '%s': threshold 'value' is not numeric, skipping",
                    rule.rule_name,
                )
                return None

            deadband = _get_default_deadband(normalized_type)

            if op in (">", ">="):
                synth_activate_above: Optional[float] = threshold_value
                synth_deactivate_below: Optional[float] = threshold_value - deadband
                synth_activate_below: Optional[float] = None
                synth_deactivate_above: Optional[float] = None
            elif op in ("<", "<="):
                synth_activate_above = None
                synth_deactivate_below = None
                synth_activate_below = threshold_value
                synth_deactivate_above = threshold_value + deadband
            else:
                logger.info(
                    "[CONFIG] Rule '%s': operator '%s' not convertible to offline hysteresis",
                    rule.rule_name,
                    op,
                )
                return None

            # Build a synthetic hysteresis_cond so the remaining validation and
            # output-building code can operate on a single unified path.
            hysteresis_cond = {
                "type": "hysteresis",
                "esp_id": esp_id,
                "gpio": threshold_cond.get("gpio", -1),
                "sensor_type": normalized_type,
                "activate_above": synth_activate_above,
                "deactivate_below": synth_deactivate_below,
                "activate_below": synth_activate_below,
                "deactivate_above": synth_deactivate_above,
            }
            hysteresis_cond_index = -1  # no DB hysteresis state entry for threshold-converted rules

        # Validate that threshold fields form a valid mode
        activate_above: Optional[float] = hysteresis_cond.get("activate_above")
        deactivate_below: Optional[float] = hysteresis_cond.get("deactivate_below")
        activate_below: Optional[float] = hysteresis_cond.get("activate_below")
        deactivate_above: Optional[float] = hysteresis_cond.get("deactivate_above")

        is_cooling = activate_above is not None and deactivate_below is not None
        is_heating = activate_below is not None and deactivate_above is not None

        if not is_cooling and not is_heating:
            logger.debug(
                "[CONFIG] Rule '%s': hysteresis condition missing valid threshold pair, skipping",
                rule.rule_name,
            )
            return None

        sensor_gpio: int = int(hysteresis_cond.get("gpio", -1))
        if sensor_gpio < 0:
            logger.debug(
                "[CONFIG] Rule '%s': hysteresis condition has invalid gpio, skipping",
                rule.rule_name,
            )
            return None

        # sensor_value_type — prefer explicit sensor_type on the condition;
        # this is the same value_type string used in SensorReading.sensor_type.
        # Normalize aliases to canonical types (e.g. "soil_moisture" → "moisture",
        # "ph_sensor" → "ph") so the calibration guard and the firmware ValueCache
        # key both operate on the same canonical string.
        sensor_value_type: str = normalize_sensor_type(
            hysteresis_cond.get("sensor_type") or ""
        )

        _MAX_SENSOR_VALUE_TYPE_LEN = 23  # ESP OfflineRule.sensor_value_type[24]
        if len(sensor_value_type) > _MAX_SENSOR_VALUE_TYPE_LEN:
            logger.warning(
                "[CONFIG] Offline-rule fuer Regel '%s' uebersprungen: sensor_value_type '%s' "
                "ist %d Zeichen lang (max %d fuer ESP OfflineRule struct)",
                rule.rule_name,
                sensor_value_type,
                len(sensor_value_type),
                _MAX_SENSOR_VALUE_TYPE_LEN,
            )
            return None

        # Locate actuator action on the SAME ESP
        actions = rule.actions
        if not isinstance(actions, list):
            logger.warning(
                "[CONFIG] Offline-rule skip: rule '%s' — actions is not a list (type: %s)",
                rule.rule_name,
                type(actions).__name__,
            )
            return None

        actuator_gpio: Optional[int] = None
        for action in actions:
            if not isinstance(action, dict):
                continue
            if action.get("type") not in ("actuator_command", "actuator"):
                continue
            if action.get("esp_id") != esp_id:
                # Cross-ESP action — rule is not fully local
                continue
            raw_gpio = action.get("gpio")
            if raw_gpio is None:
                continue
            try:
                actuator_gpio = int(raw_gpio)
            except (ValueError, TypeError):
                continue
            break  # Take the first matching local actuator action

        if actuator_gpio is None:
            logger.warning(
                "[CONFIG] Offline-rule skip: rule '%s' — no matching actuator action for esp %s",
                rule.rule_name,
                esp_id,
            )
            return None

        # Guard: analog sensors have no calibration parameters on the ESP32.
        # applyLocalConversion() delivers only the ADC raw value (0-4095) for
        # these types — comparing it against a physical-unit threshold would
        # produce wrong and potentially dangerous trigger decisions.
        # sensor_value_type is already normalized above, so direct set-membership
        # check is sufficient (no alias splitting needed).
        if sensor_value_type in self.CALIBRATION_REQUIRED_SENSOR_TYPES:
            logger.warning(
                "[CONFIG] Rule '%s': sensor_type '%s' requires calibration "
                "(actuator_gpio=%d) — ESP has no calibration parameters, "
                "applyLocalConversion delivers ADC raw value only. "
                "Offline rule skipped.",
                rule.rule_name,
                sensor_value_type,
                actuator_gpio,
            )
            return None

        # Look up the persisted hysteresis state for this rule+condition.
        # The ESP uses current_state_active to initialise is_active on config push,
        # preventing a cold-start reset when the server reconnects after a reboot.
        # Fallback is False (safe: actuator stays OFF until first sensor evaluation).
        current_state_active = False
        if hysteresis_states is not None:
            state_key = f"{rule.id}:{hysteresis_cond_index}"
            current_state_active = hysteresis_states.get(state_key, False)
            logger.debug(
                "[CONFIG] Rule '%s' hysteresis state key=%s -> current_state_active=%s",
                rule.rule_name,
                state_key,
                current_state_active,
            )

        # 3c: Extract time_filter from any time_window / time condition.
        # Only applies to AND-compounds (OR was rejected in 3b) or single-condition rules.
        time_filter: Optional[Dict[str, Any]] = None
        if compound_op == "AND" or len(conditions_list) == 1:
            for cond in conditions_list:
                if not isinstance(cond, dict):
                    continue
                if cond.get("type") in ("time_window", "time"):
                    tz = str(cond.get("timezone", "UTC") or "UTC")
                    start_h = int(cond.get("start_hour", 0))
                    start_m = int(cond.get("start_minute", 0))
                    end_h = int(cond.get("end_hour", 0))
                    end_m = int(cond.get("end_minute", 0))
                    raw_days = cond.get("days_of_week", None)
                    time_filter = {
                        "enabled": True,
                        "start_hour": start_h % 24,
                        "start_minute": start_m % 60,
                        "end_hour": end_h % 24,
                        "end_minute": end_m % 60,
                        "days_of_week_mask": _days_of_week_db_to_tm_mask(raw_days),
                        "timezone": tz,
                    }
                    break

        offline_rule: Dict[str, Any] = {
            "actuator_gpio": actuator_gpio,
            "sensor_gpio": sensor_gpio,
            "sensor_value_type": sensor_value_type,
            "activate_below": float(activate_below) if activate_below is not None else 0.0,
            "deactivate_above": float(deactivate_above) if deactivate_above is not None else 0.0,
            "activate_above": float(activate_above) if activate_above is not None else 0.0,
            "deactivate_below": float(deactivate_below) if deactivate_below is not None else 0.0,
            "current_state_active": current_state_active,
        }
        if time_filter is not None:
            offline_rule["time_filter"] = time_filter
        return offline_rule
