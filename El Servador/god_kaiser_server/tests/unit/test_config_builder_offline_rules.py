"""
Unit Tests: ConfigPayloadBuilder._build_offline_rules / _extract_offline_rule

Tests the offline hysteresis rule extraction added as part of SAFETY-P4.

Scenarios covered:
1. Local hysteresis rule (sensor + actuator on same ESP) → included
2. Cross-ESP rule (sensor on ESP-A, actuator on ESP-B) → excluded
3. ESP with no matching rules → offline_rules is empty list
4. More than MAX_OFFLINE_RULES matching rules → truncated to 8
5. Cooling-mode rule → thresholds mapped correctly
6. Heating-mode rule → thresholds mapped correctly
7. Hysteresis condition without valid threshold pair → excluded
8. Logic-repo failure → graceful fallback to empty list
"""

import pytest
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

from src.services.config_builder import ConfigPayloadBuilder


# ---------------------------------------------------------------------------
# Helper factories
# ---------------------------------------------------------------------------

ESP_ID_A = "ESP_AABB11CC"
ESP_ID_B = "ESP_DDEE22FF"


def _make_esp(device_id: str = ESP_ID_A) -> MagicMock:
    esp = MagicMock()
    esp.device_id = device_id
    esp.id = uuid.uuid4()
    esp.zone_id = "zone_greenhouse"
    esp.zone_name = "Greenhouse"
    return esp


def _make_rule(
    rule_name: str,
    trigger_conditions: object,
    actions: list,
    enabled: bool = True,
) -> MagicMock:
    rule = MagicMock()
    rule.rule_name = rule_name
    rule.trigger_conditions = trigger_conditions
    rule.actions = actions
    rule.enabled = enabled
    rule.priority = 100
    return rule


def _heating_condition(esp_id: str, gpio: int = 4, sensor_type: str = "ds18b20") -> dict:
    return {
        "type": "hysteresis",
        "esp_id": esp_id,
        "gpio": gpio,
        "sensor_type": sensor_type,
        "activate_below": 18.0,
        "deactivate_above": 22.0,
    }


def _cooling_condition(esp_id: str, gpio: int = 4, sensor_type: str = "sht31_temp") -> dict:
    return {
        "type": "hysteresis",
        "esp_id": esp_id,
        "gpio": gpio,
        "sensor_type": sensor_type,
        "activate_above": 28.0,
        "deactivate_below": 24.0,
    }


def _actuator_action(esp_id: str, gpio: int = 18) -> dict:
    return {
        "type": "actuator_command",
        "esp_id": esp_id,
        "gpio": gpio,
        "command": "ON",
        "value": 1.0,
        "duration_seconds": 0,
    }


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestExtractOfflineRuleUnit:
    """Pure unit tests for _extract_offline_rule (no DB needed)."""

    def _builder(self) -> ConfigPayloadBuilder:
        return ConfigPayloadBuilder()

    # ------------------------------------------------------------------
    # 1. Local heating rule
    # ------------------------------------------------------------------

    def test_local_heating_rule_included(self):
        """Heating rule with sensor + actuator on same ESP → returned."""
        builder = self._builder()
        rule = _make_rule(
            rule_name="heat_rule",
            trigger_conditions=_heating_condition(ESP_ID_A),
            actions=[_actuator_action(ESP_ID_A, gpio=18)],
        )

        result = builder._extract_offline_rule(rule, ESP_ID_A)

        assert result is not None
        assert result["sensor_gpio"] == 4
        assert result["actuator_gpio"] == 18
        assert result["sensor_value_type"] == "ds18b20"
        assert result["activate_below"] == 18.0
        assert result["deactivate_above"] == 22.0
        # Cooling fields must be zero (heating mode)
        assert result["activate_above"] == 0.0
        assert result["deactivate_below"] == 0.0

    # ------------------------------------------------------------------
    # 2. Local cooling rule
    # ------------------------------------------------------------------

    def test_local_cooling_rule_included(self):
        """Cooling rule with sensor + actuator on same ESP → returned."""
        builder = self._builder()
        rule = _make_rule(
            rule_name="cool_rule",
            trigger_conditions=_cooling_condition(ESP_ID_A),
            actions=[_actuator_action(ESP_ID_A, gpio=22)],
        )

        result = builder._extract_offline_rule(rule, ESP_ID_A)

        assert result is not None
        assert result["sensor_gpio"] == 4
        assert result["actuator_gpio"] == 22
        assert result["sensor_value_type"] == "sht31_temp"
        assert result["activate_above"] == 28.0
        assert result["deactivate_below"] == 24.0
        # Heating fields must be zero (cooling mode)
        assert result["activate_below"] == 0.0
        assert result["deactivate_above"] == 0.0

    # ------------------------------------------------------------------
    # 3. Cross-ESP rule: sensor on ESP_A, actuator on ESP_B → excluded
    # ------------------------------------------------------------------

    def test_cross_esp_rule_excluded(self):
        """Rule where actuator is on a different ESP → not included."""
        builder = self._builder()
        rule = _make_rule(
            rule_name="cross_esp_rule",
            trigger_conditions=_heating_condition(ESP_ID_A),
            actions=[_actuator_action(ESP_ID_B, gpio=5)],  # different ESP!
        )

        result = builder._extract_offline_rule(rule, ESP_ID_A)

        assert result is None, "Cross-ESP rules must not appear in offline_rules"

    # ------------------------------------------------------------------
    # 4. Hysteresis condition references wrong ESP → excluded
    # ------------------------------------------------------------------

    def test_sensor_on_wrong_esp_excluded(self):
        """Hysteresis condition for ESP_B queried from perspective of ESP_A → None."""
        builder = self._builder()
        rule = _make_rule(
            rule_name="wrong_esp_rule",
            trigger_conditions=_heating_condition(ESP_ID_B),  # sensor on B
            actions=[_actuator_action(ESP_ID_B, gpio=5)],
        )

        result = builder._extract_offline_rule(rule, ESP_ID_A)

        assert result is None

    # ------------------------------------------------------------------
    # 5. Conditions stored as list (multi-condition rule)
    # ------------------------------------------------------------------

    def test_list_conditions_with_hysteresis_included(self):
        """trigger_conditions as list containing a hysteresis entry → included."""
        builder = self._builder()
        rule = _make_rule(
            rule_name="list_cond_rule",
            trigger_conditions=[
                {"type": "time_window", "start_hour": 6, "end_hour": 22},
                _heating_condition(ESP_ID_A, gpio=7, sensor_type="ds18b20"),
            ],
            actions=[_actuator_action(ESP_ID_A, gpio=12)],
        )

        result = builder._extract_offline_rule(rule, ESP_ID_A)

        assert result is not None
        assert result["sensor_gpio"] == 7
        assert result["actuator_gpio"] == 12

    # ------------------------------------------------------------------
    # 6. Hysteresis condition without valid threshold pair → excluded
    # ------------------------------------------------------------------

    def test_incomplete_thresholds_excluded(self):
        """Hysteresis condition with only activate_below (no deactivate_above) → None."""
        builder = self._builder()
        incomplete_cond = {
            "type": "hysteresis",
            "esp_id": ESP_ID_A,
            "gpio": 4,
            "sensor_type": "ds18b20",
            "activate_below": 18.0,
            # deactivate_above intentionally missing
        }
        rule = _make_rule(
            rule_name="incomplete_rule",
            trigger_conditions=incomplete_cond,
            actions=[_actuator_action(ESP_ID_A)],
        )

        result = builder._extract_offline_rule(rule, ESP_ID_A)

        assert result is None

    # ------------------------------------------------------------------
    # 7. sensor_value_type field name (NOT sensor_type in output)
    # ------------------------------------------------------------------

    def test_output_field_name_is_sensor_value_type(self):
        """Result dict must use 'sensor_value_type', not 'sensor_type'."""
        builder = self._builder()
        rule = _make_rule(
            rule_name="field_name_rule",
            trigger_conditions=_cooling_condition(ESP_ID_A, sensor_type="sht31_humidity"),
            actions=[_actuator_action(ESP_ID_A)],
        )

        result = builder._extract_offline_rule(rule, ESP_ID_A)

        assert result is not None
        assert "sensor_value_type" in result, "Field must be named 'sensor_value_type'"
        assert "sensor_type" not in result, "Field must NOT be named 'sensor_type'"
        assert result["sensor_value_type"] == "sht31_humidity"

    # ------------------------------------------------------------------
    # 8. actions not a list → excluded
    # ------------------------------------------------------------------

    def test_actions_not_list_excluded(self):
        """If actions field is not a list, rule is skipped gracefully."""
        builder = self._builder()
        rule = _make_rule(
            rule_name="bad_actions_rule",
            trigger_conditions=_heating_condition(ESP_ID_A),
            actions=None,  # type: ignore[arg-type]
        )

        result = builder._extract_offline_rule(rule, ESP_ID_A)

        assert result is None

    # ------------------------------------------------------------------
    # 9. Calibration-required sensor types → skipped (SAFETY-P4-GUARD)
    # ------------------------------------------------------------------

    def test_offline_rule_skips_ph_sensor(self):
        """Rule with pH sensor → skipped (ADC raw value, no calibration on ESP)."""
        builder = self._builder()
        rule = _make_rule(
            rule_name="ph_dosing_rule",
            trigger_conditions=_heating_condition(ESP_ID_A, gpio=34, sensor_type="ph"),
            actions=[_actuator_action(ESP_ID_A, gpio=25)],
        )

        result = builder._extract_offline_rule(rule, ESP_ID_A)

        assert result is None

    def test_offline_rule_skips_ec_sensor(self):
        """Rule with EC sensor → skipped (ADC raw value, no calibration on ESP)."""
        builder = self._builder()
        rule = _make_rule(
            rule_name="ec_dosing_rule",
            trigger_conditions=_heating_condition(ESP_ID_A, gpio=35, sensor_type="ec"),
            actions=[_actuator_action(ESP_ID_A, gpio=26)],
        )

        result = builder._extract_offline_rule(rule, ESP_ID_A)

        assert result is None

    def test_offline_rule_allows_sht31_sensor(self):
        """Rule with sht31_humidity sensor → included (digital sensor, real physical values)."""
        builder = self._builder()
        rule = _make_rule(
            rule_name="humidity_rule",
            trigger_conditions=_cooling_condition(ESP_ID_A, gpio=21, sensor_type="sht31_humidity"),
            actions=[_actuator_action(ESP_ID_A, gpio=27)],
        )

        result = builder._extract_offline_rule(rule, ESP_ID_A)

        assert result is not None
        assert result["sensor_value_type"] == "sht31_humidity"

    def test_offline_rule_skips_soil_moisture_alias(self):
        """Rule with soil_moisture alias → skipped (normalizes to moisture, calibration required)."""
        builder = self._builder()
        rule = _make_rule(
            rule_name="irrigation_rule",
            trigger_conditions=_heating_condition(ESP_ID_A, gpio=32, sensor_type="soil_moisture"),
            actions=[_actuator_action(ESP_ID_A, gpio=28)],
        )

        result = builder._extract_offline_rule(rule, ESP_ID_A)

        assert result is None

    def test_offline_rule_skips_ph_sensor_alias(self):
        """Rule with ph_sensor alias → skipped (normalizes to ph, calibration required)."""
        builder = self._builder()
        rule = _make_rule(
            rule_name="ph_dosing_alias_rule",
            trigger_conditions=_heating_condition(ESP_ID_A, gpio=33, sensor_type="ph_sensor"),
            actions=[_actuator_action(ESP_ID_A, gpio=29)],
        )

        result = builder._extract_offline_rule(rule, ESP_ID_A)

        assert result is None

    def test_normalized_type_in_returned_dict(self):
        """After normalization, sensor_value_type in result uses canonical form."""
        builder = self._builder()
        # "temperature_sht31" is an alias → normalizes to "sht31_temp"
        rule = _make_rule(
            rule_name="temp_alias_rule",
            trigger_conditions=_heating_condition(ESP_ID_A, gpio=4, sensor_type="temperature_sht31"),
            actions=[_actuator_action(ESP_ID_A, gpio=18)],
        )

        result = builder._extract_offline_rule(rule, ESP_ID_A)

        assert result is not None
        assert result["sensor_value_type"] == "sht31_temp"


class TestBuildOfflineRulesAsync:
    """Async integration-style tests for _build_offline_rules."""

    def _builder(self) -> ConfigPayloadBuilder:
        return ConfigPayloadBuilder()

    # ------------------------------------------------------------------
    # 9. No matching rules → offline_rules is empty list
    # ------------------------------------------------------------------

    @pytest.mark.asyncio
    async def test_no_matching_rules_returns_empty_list(self):
        """ESP with only non-hysteresis rules → offline_rules == []."""
        builder = self._builder()
        mock_logic_repo = AsyncMock()
        # Only a sensor_threshold rule — not hysteresis
        non_hysteresis_rule = _make_rule(
            rule_name="threshold_rule",
            trigger_conditions={
                "type": "sensor_threshold",
                "esp_id": ESP_ID_A,
                "gpio": 4,
                "sensor_type": "temperature",
                "operator": ">",
                "value": 30.0,
            },
            actions=[_actuator_action(ESP_ID_A)],
        )
        mock_logic_repo.get_enabled_rules = AsyncMock(return_value=[non_hysteresis_rule])
        builder.logic_repo = mock_logic_repo

        esp = _make_esp(ESP_ID_A)
        mock_db = MagicMock()

        result = await builder._build_offline_rules(mock_db, esp)

        assert result == []

    # ------------------------------------------------------------------
    # 10. One matching local rule → single entry
    # ------------------------------------------------------------------

    @pytest.mark.asyncio
    async def test_single_local_rule_included(self):
        """One enabled local heating rule → exactly one entry in result."""
        builder = self._builder()
        mock_logic_repo = AsyncMock()
        rule = _make_rule(
            rule_name="local_heat",
            trigger_conditions=_heating_condition(ESP_ID_A, gpio=4),
            actions=[_actuator_action(ESP_ID_A, gpio=18)],
        )
        mock_logic_repo.get_enabled_rules = AsyncMock(return_value=[rule])
        builder.logic_repo = mock_logic_repo

        esp = _make_esp(ESP_ID_A)
        mock_db = MagicMock()

        result = await builder._build_offline_rules(mock_db, esp)

        assert len(result) == 1
        assert result[0]["sensor_gpio"] == 4
        assert result[0]["actuator_gpio"] == 18

    # ------------------------------------------------------------------
    # 11. Cross-ESP rule mixed with local rule → only local included
    # ------------------------------------------------------------------

    @pytest.mark.asyncio
    async def test_cross_esp_rule_filtered_out(self):
        """Cross-ESP rule is excluded; local rule is still included."""
        builder = self._builder()
        mock_logic_repo = AsyncMock()

        local_rule = _make_rule(
            rule_name="local_cool",
            trigger_conditions=_cooling_condition(ESP_ID_A, gpio=4),
            actions=[_actuator_action(ESP_ID_A, gpio=22)],
        )
        cross_rule = _make_rule(
            rule_name="cross_rule",
            trigger_conditions=_heating_condition(ESP_ID_A, gpio=7),
            actions=[_actuator_action(ESP_ID_B, gpio=5)],  # actuator on different ESP
        )
        mock_logic_repo.get_enabled_rules = AsyncMock(return_value=[local_rule, cross_rule])
        builder.logic_repo = mock_logic_repo

        esp = _make_esp(ESP_ID_A)
        mock_db = MagicMock()

        result = await builder._build_offline_rules(mock_db, esp)

        assert len(result) == 1
        assert result[0]["actuator_gpio"] == 22

    # ------------------------------------------------------------------
    # 12. More than MAX_OFFLINE_RULES rules → truncated to MAX_OFFLINE_RULES
    # ------------------------------------------------------------------

    @pytest.mark.asyncio
    async def test_truncation_at_max_limit(self):
        """10 matching rules → truncated to MAX_OFFLINE_RULES (8) with warning logged."""
        builder = self._builder()
        mock_logic_repo = AsyncMock()

        rules = [
            _make_rule(
                rule_name=f"rule_{i}",
                trigger_conditions=_heating_condition(ESP_ID_A, gpio=i + 10),
                actions=[_actuator_action(ESP_ID_A, gpio=i + 20)],
            )
            for i in range(10)  # 10 rules > MAX_OFFLINE_RULES (8)
        ]
        mock_logic_repo.get_enabled_rules = AsyncMock(return_value=rules)
        builder.logic_repo = mock_logic_repo

        esp = _make_esp(ESP_ID_A)
        mock_db = MagicMock()

        with patch.object(builder.__class__._build_offline_rules, "__wrapped__", None, create=True):
            result = await builder._build_offline_rules(mock_db, esp)

        assert len(result) == ConfigPayloadBuilder.MAX_OFFLINE_RULES

    # ------------------------------------------------------------------
    # 13. Logic repo raises exception → graceful fallback to []
    # ------------------------------------------------------------------

    @pytest.mark.asyncio
    async def test_logic_repo_failure_returns_empty_list(self):
        """If get_enabled_rules raises, _build_offline_rules returns [] without propagating."""
        builder = self._builder()
        mock_logic_repo = AsyncMock()
        mock_logic_repo.get_enabled_rules = AsyncMock(
            side_effect=Exception("DB connection lost")
        )
        builder.logic_repo = mock_logic_repo

        esp = _make_esp(ESP_ID_A)
        mock_db = MagicMock()

        result = await builder._build_offline_rules(mock_db, esp)

        assert result == [], "Should return empty list on DB failure, not propagate exception"
