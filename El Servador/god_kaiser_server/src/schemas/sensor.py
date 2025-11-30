"""
Sensor Pydantic Schemas

Phase: 2 (Week 3-4) - Data Layer
Priority: 🔴 CRITICAL
Status: PLANNED - To be implemented when REST API is added

Purpose:
    Pydantic models for sensor API request/response validation.

Planned Schemas:
    - SensorConfigCreate, SensorConfigUpdate, SensorConfigResponse
    - SensorDataQuery, SensorDataResponse
    - ProcessedSensorResponse, SensorCalibrationRequest

Example (when implementing):
    class SensorConfigCreate(BaseModel):
        esp_id: str
        gpio: int = Field(ge=0, le=39)
        sensor_type: str
        interval_ms: int = 5000
        enabled: bool = True

References:
    - .claude/PI_SERVER_REFACTORING.md (Lines 462-471, Phase 2)
"""
