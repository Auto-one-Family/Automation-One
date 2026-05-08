"""
Unit tests for ECSensorProcessor — calibration pipeline paths.

Covers:
- slope/offset path (new ec_1point / ec_2point format)
- cell_factor backward-compat path (old ec_1point sessions without slope/offset)
- default path (no calibration)
- validate: raw=0 → quality is not error (valid zero), raw=-1 → error
"""

import pytest

from src.sensors.sensor_libraries.active.ec_sensor import ECSensorProcessor


@pytest.fixture
def processor() -> ECSensorProcessor:
    return ECSensorProcessor()


class TestECSensorProcessorCalibrationPaths:
    """Tests for the three calibration paths in ECSensorProcessor.process()."""

    def test_slope_offset_path_happy(self, processor: ECSensorProcessor) -> None:
        """slope + offset in calibration dict → calibrated=True, expected EC value."""
        # ADC 625 on 12-bit 3.3V → voltage = 625/4095 * 3.3 ≈ 0.5037V
        # slope = 1413 / 0.5037 ≈ 2805  (typical after ec_1point fix)
        raw = 625
        voltage = (raw / 4095.0) * 3.3
        slope = 1413.0 / voltage  # matches ec_1point formula
        calibration = {"slope": slope, "offset": 0.0}

        result = processor.process(raw_value=raw, calibration=calibration)

        assert result.metadata["calibrated"] is True
        assert result.unit == "µS/cm"
        # EC should be close to reference value (1413 µS/cm ± 1%)
        assert result.value == pytest.approx(1413.0, rel=0.01)

    def test_slope_offset_path_with_nonzero_offset(self, processor: ECSensorProcessor) -> None:
        """slope + offset (2-point format) → correct EC = slope * V + offset."""
        raw = 1800
        voltage = (raw / 4095.0) * 3.3
        slope = 5000.0
        offset = -500.0
        calibration = {"slope": slope, "offset": offset}

        result = processor.process(raw_value=raw, calibration=calibration)

        expected_ec = max(0.0, min(20000.0, slope * voltage + offset))
        assert result.metadata["calibrated"] is True
        assert result.value == pytest.approx(expected_ec, rel=0.01)

    def test_cell_factor_backward_compat_path(self, processor: ECSensorProcessor) -> None:
        """cell_factor only (old ec_1point without slope/offset) → calibrated=True."""
        raw = 800
        cell_factor = 1.76  # = 1413 / 803 (typical range)
        calibration = {"cell_factor": cell_factor}

        result = processor.process(raw_value=raw, calibration=calibration)

        assert result.metadata["calibrated"] is True
        expected_ec = max(0.0, min(20000.0, cell_factor * raw))
        assert result.value == pytest.approx(expected_ec, rel=0.01)

    def test_cell_factor_path_ignored_when_slope_present(self, processor: ECSensorProcessor) -> None:
        """If both slope/offset and cell_factor present, slope/offset wins."""
        raw = 800
        voltage = (raw / 4095.0) * 3.3
        slope = 2800.0
        offset = 0.0
        cell_factor = 99.0  # would give absurdly high EC if used
        calibration = {"slope": slope, "offset": offset, "cell_factor": cell_factor}

        result = processor.process(raw_value=raw, calibration=calibration)

        expected_ec = max(0.0, min(20000.0, slope * voltage + offset))
        assert result.value == pytest.approx(expected_ec, rel=0.01)
        # Must NOT use cell_factor (99 * 800 = 79200, way above EC_MAX)
        assert result.value < 20000.0

    def test_default_path_no_calibration(self, processor: ECSensorProcessor) -> None:
        """No calibration dict → calibrated=False, default slope applied."""
        raw = 1800
        result = processor.process(raw_value=raw)

        assert result.metadata["calibrated"] is False
        assert result.unit == "µS/cm"
        assert result.value >= 0.0
        assert result.value <= 20000.0

    def test_validate_raw_zero_is_valid(self, processor: ECSensorProcessor) -> None:
        """raw_value=0 is within valid ADC range (pure water). quality != error."""
        result = processor.process(raw_value=0)
        # raw=0 is valid (pure water / distilled); quality is warning but not error
        assert result.quality != "error"

    def test_validate_raw_negative_returns_error(self, processor: ECSensorProcessor) -> None:
        """raw_value < 0 is out of ADC range → quality=error, value=0."""
        result = processor.process(raw_value=-1)
        assert result.quality == "error"
        assert result.value == 0.0

    def test_temperature_compensation_applied_via_params(self, processor: ECSensorProcessor) -> None:
        """temperature_compensation in params reduces EC at temp > 25°C."""
        slope = 2800.0
        calibration = {"slope": slope, "offset": 0.0}
        raw = 800

        result_no_atc = processor.process(raw_value=raw, calibration=calibration)
        result_with_atc = processor.process(
            raw_value=raw,
            calibration=calibration,
            params={"temperature_compensation": 30.0},
        )

        # At 30°C (>25°C ref), compensation divides by 1.1 → lower reading
        assert result_with_atc.value < result_no_atc.value
