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

import json
import time
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

# AUT-134 PKG-01: Pre-flight Config-Budget für serverseitigen Auto-Push.
#
# El Trabajante: ``CONFIG_PAYLOAD_MAX_LEN`` (config_update_queue.h) liegt bei
# 4352 Bytes inkl. MQTT-/Header-Overhead. Für reines JSON ist das effektive
# Budget ~4096 Bytes — wir nutzen diese konservative Schwelle als Pre-flight
# Gate VOR dem Auto-Push, damit der Server gar nicht erst Frames produziert,
# die der ESP32-Ingress beim Empfang verwirft. Die finale Wire-Schwelle in
# ``ESPService.send_config`` (4352) bleibt als Defense-in-Depth bestehen.
CONFIG_AUTOPUSH_BUDGET_BYTES = 4096


def estimate_config_wire_size(config: Dict[str, Any]) -> int:
    """
    Schätzt die finale JSON-Wire-Größe der Config wie ``ESPService.send_config``.

    Spiegelt die Felder, die der Publisher zusätzlich injiziert
    (``correlation_id``/``request_id``/``intent_id``/``generation``/
    ``config_fingerprint``/``reason_code``/``timestamp``), um eine realistische
    Vorab-Schätzung zu erhalten. Genaue Werte sind nicht kritisch — wir nutzen
    Platzhalter mit identischer Länge.

    Args:
        config: Config-Frame, der an ``send_config`` übergeben würde.

    Returns:
        Anzahl Bytes der serialisierten Wire-Form (UTF-8).
    """
    sentinel_correlation = "00000000-0000-0000-0000-000000000000"
    wire_for_size = {
        **config,
        "correlation_id": sentinel_correlation,
        "request_id": sentinel_correlation,
        "intent_id": sentinel_correlation,
        "generation": int(time.time() * 1000),
        "config_fingerprint": "0" * 64,
        "reason_code": str(config.get("reason_code", "auto_push")),
        "timestamp": int(time.time()),
    }
    try:
        return len(json.dumps(wire_for_size, default=str).encode("utf-8"))
    except (TypeError, ValueError) as exc:  # noqa: BLE001 — defensive
        logger.error("Config wire size estimation failed: %s", exc)
        # Konservative Annahme: bei Serialisierungsfehlern als oversize behandeln,
        # damit der Caller den sauberen Abbruchpfad wählt.
        return CONFIG_AUTOPUSH_BUDGET_BYTES + 1


def _get_default_deadband(sensor_type: str) -> float:
    """Return a type-specific deadband for auto-converting a simple threshold to hysteresis.

    Called only for digital sensors that deliver calibrated physical values directly
    on the ESP32 (temperature, humidity, pressure, CO2, light, flow). Analog sensors
    that require server-side calibration (ph, ec, moisture, soil_moisture) are
    filtered out by the P4-GUARD before this function is ever reached.
    """
    DEADBAND_MAP = {
        "sht31_temp": 2.0,  # °C — typical HVAC hysteresis band
        "ds18b20": 2.0,  # °C
        "bmp280_temp": 2.0,  # °C
        "bme280_temp": 2.0,  # °C
        "sht31_humidity": 5.0,  # %RH — higher variance for humidity
        "bme280_humidity": 5.0,
        "bmp280_pressure": 5.0,  # hPa
        "bme280_pressure": 5.0,
        "co2": 50.0,  # ppm — large natural fluctuations
        "light": 100.0,  # lux
        "flow": 0.5,  # l/min — conservative
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
            days_mask |= 1 << tm_wday

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
    TIME_WINDOW_ONLY_SENSOR_GPIO = 255
    TIME_WINDOW_ONLY_SENSOR_TYPE_ON = "__twindow_on"
    TIME_WINDOW_ONLY_SENSOR_TYPE_OFF = "__twindow_off"

    # =========================================================================
    # AUT-132: Offline-rules diagnostics — Reason-Code SSOT
    # =========================================================================
    # Stable strings shared with frontend / firmware diagnostics. Do NOT change
    # these literals without coordinating with consumers. The ESP32 firmware
    # treats these as opaque, but human operators read them in logs and UI.
    REASON_CALIBRATION_REQUIRED = "CALIBRATION_REQUIRED"
    REASON_GPIO_NOT_IN_FRAME = "GPIO_NOT_IN_FRAME"
    REASON_MAX_RULE_LIMIT = "MAX_RULE_LIMIT"
    REASON_UNSUPPORTED_CONDITION = "UNSUPPORTED_CONDITION"
    REASON_CONSISTENCY_CHECK_FAILED = "CONSISTENCY_CHECK_FAILED"

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

    @classmethod
    def _is_time_window_only_sensor_type(cls, sensor_value_type: str) -> bool:
        return sensor_value_type in (
            cls.TIME_WINDOW_ONLY_SENSOR_TYPE_ON,
            cls.TIME_WINDOW_ONLY_SENSOR_TYPE_OFF,
        )

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

        AUT-120 — fail_safe_on_disconnect:
            The optional ``fail_safe_on_disconnect`` column is added to the
            payload only when it is set on the DB row (``is not None``). A
            ``None`` value means "server has no opinion" so the ESP32 keeps
            its built-in default (true for critical actuators). This keeps
            the payload backward compatible for existing devices.

        Args:
            actuator: ActuatorConfig model instance

        Returns:
            Dictionary with ESP32-compatible actuator payload
        """
        payload = self.mapping_engine.apply_actuator_mapping(actuator)

        # AUT-120: Add fail_safe_on_disconnect only when the server has an
        # explicit opinion. None → field omitted → ESP32 default applies.
        fail_safe = getattr(actuator, "fail_safe_on_disconnect", None)
        if fail_safe is not None:
            payload["fail_safe_on_disconnect"] = bool(fail_safe)

        return payload

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
            s
            for s in active_sensors
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

        # AUT-132: Collect per-rule skip diagnostics so the ESP32 (and operators
        # reading the config push) see *why* offline rules were stripped.
        stripped_rules: List[Dict[str, Any]] = []
        candidate_counter: Dict[str, int] = {"total_candidate_rules": 0}

        # Build offline rules for local hysteresis control during network loss
        offline_rules = await self._build_offline_rules(
            db,
            esp_device,
            skip_collector=stripped_rules,
            candidate_counter=candidate_counter,
        )

        # AUT-59: Validate offline_rules consistency against config frame.
        # Rules referencing actuator/sensor GPIOs not present in this config
        # frame would cause a pending-exit blockade on the ESP32 firmware.
        offline_rules = self._validate_offline_rules_consistency(
            offline_rules,
            sensor_payloads,
            actuator_payloads,
            esp_device_id,
            skip_collector=stripped_rules,
        )

        # AUT-132: assemble the diagnostics block in a backward-compatible way.
        # The legacy ``offline_rules`` field is unchanged; ``offline_rules_diagnostics``
        # is additive metadata for operators and firmware diagnostics.
        accepted_count = len(offline_rules)
        stripped_count = len(stripped_rules)
        total_candidate_rules = candidate_counter.get("total_candidate_rules", 0)
        offline_rules_diagnostics: Dict[str, Any] = {
            "total_candidate_rules": total_candidate_rules,
            "accepted_count": accepted_count,
            "stripped_count": stripped_count,
            "stripped_rules": stripped_rules,
        }

        # Build combined config
        config = {
            "sensors": sensor_payloads,
            "actuators": actuator_payloads,
            "offline_rules": offline_rules,
            "offline_rules_diagnostics": offline_rules_diagnostics,
        }

        # Log zone information for better traceability
        zone_info = f"zone={esp_device.zone_id or 'none'}"
        if esp_device.zone_name:
            zone_info += f" ({esp_device.zone_name})"

        logger.info(
            f"Built config payload for {esp_device_id}: "
            f"{len(sensor_payloads)} sensors, {len(actuator_payloads)} actuators, "
            f"{len(offline_rules)} offline_rules "
            f"(candidates={total_candidate_rules}, stripped={stripped_count}), "
            f"{zone_info}"
        )

        return config

    async def _build_offline_rules(
        self,
        db: AsyncSession,
        esp_device: Any,
        skip_collector: Optional[List[Dict[str, Any]]] = None,
        candidate_counter: Optional[Dict[str, int]] = None,
    ) -> List[Dict[str, Any]]:
        """
        Build offline hysteresis rules for local ESP32 execution during network loss.

        Extracts enabled hysteresis rules where both the trigger sensor and the
        actuator action belong to the same ESP device. These rules are sent to the
        ESP32 so it can maintain basic hysteresis control without server connectivity.

        Only local rules are included — cross-ESP rules (sensor and actuator on
        different ESPs) cannot be executed locally and are excluded.

        ## Inclusion criteria (all must be met)
        A rule is included in offline_rules when:
        1. At least one actuator action targets this ESP (``action.esp_id == esp_id``).
        2. The rule has exactly one of: a hysteresis condition, a simple threshold
           condition (``sensor_threshold``/``sensor``), or a time-window-only condition
           (``time_window``/``time``) — all scoped to this ESP.
        3. For sensor-based conditions: ``sensor_gpio >= 0`` and a valid threshold pair
           (cooling: activate_above + deactivate_below; heating: activate_below +
           deactivate_above).
        4. Sensor type is NOT calibration-required (ph, ec, moisture, soil_moisture —
           these lack calibration data on the ESP32 so thresholds would fire against
           raw ADC counts, not physical units).
        5. ``sensor_value_type`` fits in 23 chars (ESP OfflineRule struct limit).
        6. For compound rules: operator must be AND (OR-compound cannot be flattened
           to a single ESP hysteresis struct).

        ## Why offline_rules count may differ from UI logic-rule count

        The UI displays all *CrossESPLogic* rules regardless of locality. The
        ``offline_rules`` array in the config payload only carries rules that the
        ESP32 can execute autonomously. The delta is expected and breaks down as:

        - **Cross-ESP rules** — actuator or sensor belongs to a different ESP.
        - **Calibration-required sensors** — ph / ec / moisture / soil_moisture excluded.
        - **OR-compound rules** — cannot be represented as a single hysteresis struct.
        - **No convertible condition** — unsupported operator or missing threshold value.
        - **Time-window-only rules** — *are* included but use ``sensor_gpio=255`` and
          ``sensor_value_type=__twindow_on`` or ``__twindow_off`` as a firmware
          display-semantic marker; these entries do NOT correspond to a physical sensor
          and may not be visible as "sensor rules" in the UI logic rule list.
        - **AUT-59 consistency strip** — rules referencing GPIOs absent in the current
          config frame are removed by ``_validate_offline_rules_consistency``.
        - **MAX_OFFLINE_RULES cap** — hard limit of 8; excess entries are truncated.

        Per-rule skip details are logged at WARNING/INFO level inside
        ``_extract_offline_rule``. A structured audit summary is emitted at INFO level
        after the build loop (search for "[CONFIG] offline_rules audit").

        Args:
            db: Database session
            esp_device: ESPDevice model instance (must have device_id attribute)

        Returns:
            List of offline rule dicts with fields:
                - actuator_gpio: int
                - sensor_gpio: int  (255 for time-window-only rules)
                - sensor_value_type: str  (e.g. "sht31_humidity", "__twindow_on")
                - activate_below: float   (heating mode; 0.0 if cooling mode)
                - deactivate_above: float (heating mode; 0.0 if cooling mode)
                - activate_above: float   (cooling mode; 0.0 if heating mode)
                - deactivate_below: float (cooling mode; 0.0 if heating mode)
                - current_state_active: bool
                - time_filter: dict  (optional, present when a time_window condition exists)
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
            logger.debug(
                "[CONFIG] Preloaded %d hysteresis states for ESP %s", len(hysteresis_states), esp_id
            )
        except Exception as exc:
            logger.warning(
                "[CONFIG] Could not preload hysteresis states for ESP %s: %s", esp_id, exc
            )

        offline_rules: List[Dict[str, Any]] = []

        if candidate_counter is not None:
            candidate_counter["total_candidate_rules"] = len(enabled_rules)

        for rule in enabled_rules:
            try:
                rule_entry = self._extract_offline_rule(
                    rule,
                    esp_id,
                    hysteresis_states,
                    skip_collector=skip_collector,
                )
                if rule_entry is not None:
                    offline_rules.append(rule_entry)
            except Exception as exc:
                logger.warning(
                    "[CONFIG] Skipping rule '%s' for offline_rules due to extraction error: %s",
                    getattr(rule, "rule_name", "<unknown>"),
                    exc,
                )
                if skip_collector is not None:
                    skip_collector.append(
                        {
                            "rule_id": str(getattr(rule, "id", "") or ""),
                            "rule_name": getattr(rule, "rule_name", "<unknown>")
                            or "<unknown>",
                            "actuator_gpio": None,
                            "reason_code": self.REASON_UNSUPPORTED_CONDITION,
                            "reason_detail": f"extraction error: {exc}",
                        }
                    )
                continue

        rules_before_cap = len(offline_rules)
        if rules_before_cap > self.MAX_OFFLINE_RULES:
            logger.warning(
                "[CONFIG] ESP %s: %d offline rules exceed limit of %d, truncating",
                esp_id,
                rules_before_cap,
                self.MAX_OFFLINE_RULES,
            )
            if skip_collector is not None:
                # AUT-132: Record each truncated rule so the diagnostics payload
                # tells operators *why* a rule did not reach the ESP.
                for dropped in offline_rules[self.MAX_OFFLINE_RULES :]:
                    skip_collector.append(
                        {
                            "rule_id": "",
                            "rule_name": "<truncated>",
                            "actuator_gpio": dropped.get("actuator_gpio"),
                            "reason_code": self.REASON_MAX_RULE_LIMIT,
                            "reason_detail": (
                                f"rule exceeded firmware limit of {self.MAX_OFFLINE_RULES} "
                                f"offline rules (had {rules_before_cap})"
                            ),
                        }
                    )
            offline_rules = offline_rules[: self.MAX_OFFLINE_RULES]

        twindow_count = sum(
            1
            for r in offline_rules
            if self._is_time_window_only_sensor_type(str(r.get("sensor_value_type", "")))
        )
        skipped_count = len(enabled_rules) - rules_before_cap
        capped_count = rules_before_cap - len(offline_rules)

        logger.info(
            "[CONFIG] offline_rules audit ESP %s: "
            "enabled_rules_checked=%d | included=%d (sensor_hysteresis=%d, time_window_only=%d) | "
            "skipped=%d | capped=%d. "
            "Skip reasons per rule logged above as [CONFIG] Rule/Offline-rule skip. "
            "Typical causes: cross_esp_actuator, calibration_required (ph/ec/moisture), "
            "or_compound, no_convertible_condition, invalid_gpio. "
            "time_window_only rules use sensor_gpio=255 and sensor_value_type=__twindow_on/off — "
            "these count in offline_rules but are not listed as sensor-based logic rules in the UI.",
            esp_id,
            len(enabled_rules),
            len(offline_rules),
            len(offline_rules) - twindow_count,
            twindow_count,
            skipped_count,
            capped_count,
        )

        return offline_rules

    def _validate_offline_rules_consistency(
        self,
        offline_rules: List[Dict[str, Any]],
        sensor_payloads: List[Dict[str, Any]],
        actuator_payloads: List[Dict[str, Any]],
        esp_id: str,
        skip_collector: Optional[List[Dict[str, Any]]] = None,
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
            sensor_value_type = str(rule.get("sensor_value_type", ""))
            is_time_window_only = self._is_time_window_only_sensor_type(sensor_value_type)
            reasons: List[str] = []

            if a_gpio is not None and int(a_gpio) not in actuator_gpios:
                reasons.append(f"actuator_gpio={a_gpio} not in config actuators")
            if not is_time_window_only and s_gpio is not None and int(s_gpio) not in sensor_gpios:
                reasons.append(f"sensor_gpio={s_gpio} not in config sensors")

            if reasons:
                stripped_details.append(
                    {
                        "actuator_gpio": a_gpio,
                        "sensor_gpio": s_gpio,
                        "sensor_value_type": rule.get("sensor_value_type", ""),
                        "reasons": reasons,
                    }
                )
                if skip_collector is not None:
                    # AUT-132: forward consistency-strip reasons into the
                    # diagnostics payload using the canonical reason code.
                    skip_collector.append(
                        {
                            "rule_id": "",
                            "rule_name": "<consistency-strip>",
                            "actuator_gpio": a_gpio,
                            "reason_code": self.REASON_GPIO_NOT_IN_FRAME,
                            "reason_detail": "; ".join(reasons),
                        }
                    )
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
        skip_collector: Optional[List[Dict[str, Any]]] = None,
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

        AUT-132: When a ``skip_collector`` list is provided, every rejection
        appends a structured diagnostic record::

            {
                "rule_id": str,
                "rule_name": str,
                "actuator_gpio": int | None,
                "reason_code": str,   # one of REASON_* constants
                "reason_detail": str,
            }

        The collector is optional so existing callers (and tests) keep their
        previous ``Optional[Dict]`` contract.

        Args:
            rule: CrossESPLogic model instance
            esp_id: Device ID of the target ESP (e.g. "ESP_12AB34CD")
            hysteresis_states: Preloaded hysteresis state map (rule_id:idx)
            skip_collector: Optional list that receives skip diagnostics

        Returns:
            Offline rule dict or None.
        """
        rule_id_str = str(getattr(rule, "id", "") or "")
        rule_name = getattr(rule, "rule_name", "<unknown>") or "<unknown>"

        def _skip(
            reason_code: str,
            reason_detail: str,
            actuator_gpio: Optional[int] = None,
        ) -> None:
            if skip_collector is not None:
                skip_collector.append(
                    {
                        "rule_id": rule_id_str,
                        "rule_name": rule_name,
                        "actuator_gpio": actuator_gpio,
                        "reason_code": reason_code,
                        "reason_detail": reason_detail,
                    }
                )

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
            _skip(
                self.REASON_UNSUPPORTED_CONDITION,
                f"trigger_conditions has unsupported type {type(tc).__name__}",
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
            _skip(
                self.REASON_UNSUPPORTED_CONDITION,
                "OR compound rules cannot be flattened to a single ESP hysteresis struct",
            )
            return None

        # Locate actuator action on the SAME ESP.
        actions = rule.actions
        if not isinstance(actions, list):
            logger.warning(
                "[CONFIG] Offline-rule skip: rule '%s' — actions is not a list (type: %s)",
                rule.rule_name,
                type(actions).__name__,
            )
            _skip(
                self.REASON_UNSUPPORTED_CONDITION,
                f"actions has unsupported type {type(actions).__name__}",
            )
            return None

        actuator_gpio: Optional[int] = None
        time_window_target_state: Optional[bool] = None
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

            command = str(action.get("command", "")).strip().upper()
            if command == "ON":
                time_window_target_state = True
            else:
                raw_value = action.get("value")
                if isinstance(raw_value, (int, float)):
                    if float(raw_value) > 0.0:
                        time_window_target_state = True
            break  # Take first matching local actuator action

        if actuator_gpio is None:
            seen_esp_ids = [
                str(a.get("esp_id", ""))
                for a in actions
                if isinstance(a, dict) and a.get("type") in ("actuator_command", "actuator")
            ]
            detail = (
                f"no actuator action targets ESP '{esp_id}'"
                f"; seen_esp_ids={seen_esp_ids}"
                if seen_esp_ids
                else f"no actuator action targets ESP '{esp_id}' (no matching action type or empty)"
            )
            logger.warning(
                "[CONFIG] Offline-rule skip: rule '%s' — %s",
                rule.rule_name,
                detail,
            )
            _skip(self.REASON_GPIO_NOT_IN_FRAME, detail)
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
                # 3d: time_window-only fallback for local binary actuator schedules.
                # Uses existing offline rule/time_filter mechanics without changing
                # payload contracts or firmware struct layout.
                time_cond = next(
                    (
                        c
                        for c in conditions_list
                        if isinstance(c, dict) and c.get("type") in ("time_window", "time")
                    ),
                    None,
                )
                if time_cond is None:
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
                    _skip(
                        self.REASON_UNSUPPORTED_CONDITION,
                        f"no hysteresis/threshold/time_window condition found "
                        f"(types: {condition_types})",
                        actuator_gpio=actuator_gpio,
                    )
                    return None

                if time_window_target_state is None:
                    logger.warning(
                        "[CONFIG] Offline-rule skip: rule '%s' — time_window-only rule "
                        "has no binary ON action for ESP %s",
                        rule.rule_name,
                        esp_id,
                    )
                    _skip(
                        self.REASON_UNSUPPORTED_CONDITION,
                        "time_window-only rule has no binary ON action",
                        actuator_gpio=actuator_gpio,
                    )
                    return None

                sensor_type_marker = (
                    self.TIME_WINDOW_ONLY_SENSOR_TYPE_ON
                    if time_window_target_state
                    else self.TIME_WINDOW_ONLY_SENSOR_TYPE_OFF
                )
                hysteresis_cond = {
                    "type": "hysteresis",
                    "esp_id": esp_id,
                    "gpio": self.TIME_WINDOW_ONLY_SENSOR_GPIO,
                    "sensor_type": sensor_type_marker,
                    # Keep a valid pair to satisfy existing mode checks; firmware
                    # special-cases these marker sensor types and ignores thresholds.
                    "activate_above": 1.0,
                    "deactivate_below": 0.0,
                    "activate_below": None,
                    "deactivate_above": None,
                }
                hysteresis_cond_index = -1
            else:
                # threshold fallback
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
                    _skip(
                        self.REASON_CALIBRATION_REQUIRED,
                        f"sensor type '{normalized_type}' requires calibration data",
                        actuator_gpio=actuator_gpio,
                    )
                    return None

                op: str = threshold_cond.get("operator", "")
                raw_value = threshold_cond.get("value")
                if raw_value is None:
                    logger.info(
                        "[CONFIG] Rule '%s': threshold condition missing 'value', skipping",
                        rule.rule_name,
                    )
                    _skip(
                        self.REASON_UNSUPPORTED_CONDITION,
                        "threshold condition missing 'value'",
                        actuator_gpio=actuator_gpio,
                    )
                    return None
                try:
                    threshold_value = float(raw_value)
                except (ValueError, TypeError):
                    logger.info(
                        "[CONFIG] Rule '%s': threshold 'value' is not numeric, skipping",
                        rule.rule_name,
                    )
                    _skip(
                        self.REASON_UNSUPPORTED_CONDITION,
                        f"threshold 'value' is not numeric ({raw_value!r})",
                        actuator_gpio=actuator_gpio,
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
                    _skip(
                        self.REASON_UNSUPPORTED_CONDITION,
                        f"operator '{op}' not convertible to offline hysteresis",
                        actuator_gpio=actuator_gpio,
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
                hysteresis_cond_index = (
                    -1
                )  # no DB hysteresis state entry for threshold-converted rules

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
            _skip(
                self.REASON_UNSUPPORTED_CONDITION,
                "hysteresis condition missing valid threshold pair "
                "(needs activate_above+deactivate_below or activate_below+deactivate_above)",
                actuator_gpio=actuator_gpio,
            )
            return None

        sensor_gpio: int = int(hysteresis_cond.get("gpio", -1))
        if sensor_gpio < 0:
            logger.debug(
                "[CONFIG] Rule '%s': hysteresis condition has invalid gpio, skipping",
                rule.rule_name,
            )
            _skip(
                self.REASON_GPIO_NOT_IN_FRAME,
                f"hysteresis sensor_gpio={sensor_gpio} is invalid (<0)",
                actuator_gpio=actuator_gpio,
            )
            return None

        # sensor_value_type — prefer explicit sensor_type on the condition;
        # this is the same value_type string used in SensorReading.sensor_type.
        # Normalize aliases to canonical types (e.g. "soil_moisture" → "moisture",
        # "ph_sensor" → "ph") so the calibration guard and the firmware ValueCache
        # key both operate on the same canonical string.
        raw_sensor_type = str(hysteresis_cond.get("sensor_type") or "")
        if self._is_time_window_only_sensor_type(raw_sensor_type):
            sensor_value_type = raw_sensor_type
        else:
            sensor_value_type = normalize_sensor_type(raw_sensor_type)

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
            _skip(
                self.REASON_UNSUPPORTED_CONDITION,
                f"sensor_value_type '{sensor_value_type}' exceeds firmware limit "
                f"({_MAX_SENSOR_VALUE_TYPE_LEN} chars)",
                actuator_gpio=actuator_gpio,
            )
            return None

        # Guard: analog sensors have no calibration parameters on the ESP32.
        # applyLocalConversion() delivers only the ADC raw value (0-4095) for
        # these types — comparing it against a physical-unit threshold would
        # produce wrong and potentially dangerous trigger decisions.
        # sensor_value_type is already normalized above, so direct set-membership
        # check is sufficient (no alias splitting needed).
        if (
            not self._is_time_window_only_sensor_type(sensor_value_type)
            and sensor_value_type in self.CALIBRATION_REQUIRED_SENSOR_TYPES
        ):
            logger.warning(
                "[CONFIG] Rule '%s': sensor_type '%s' requires calibration "
                "(actuator_gpio=%d) — ESP has no calibration parameters, "
                "applyLocalConversion delivers ADC raw value only. "
                "Offline rule skipped.",
                rule.rule_name,
                sensor_value_type,
                actuator_gpio,
            )
            _skip(
                self.REASON_CALIBRATION_REQUIRED,
                f"sensor type '{sensor_value_type}' requires calibration data",
                actuator_gpio=actuator_gpio,
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
                    start_h = cond.get("start_hour")
                    start_m = cond.get("start_minute")
                    end_h = cond.get("end_hour")
                    end_m = cond.get("end_minute")

                    # Backward-compatible fallback for old payloads using HH:MM strings.
                    start_time = cond.get("start_time")
                    end_time = cond.get("end_time")
                    if (start_h is None or start_m is None) and isinstance(start_time, str):
                        parts = start_time.split(":")
                        if len(parts) == 2:
                            start_h = int(parts[0])
                            start_m = int(parts[1])
                    if (end_h is None or end_m is None) and isinstance(end_time, str):
                        parts = end_time.split(":")
                        if len(parts) == 2:
                            end_h = int(parts[0])
                            end_m = int(parts[1])

                    start_h = int(start_h or 0)
                    start_m = int(start_m or 0)
                    end_h = int(end_h or 0)
                    end_m = int(end_m or 0)
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
