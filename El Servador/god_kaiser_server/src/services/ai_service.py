"""AI Analysis Service — Claude API integration for error intelligence (AUT-168)."""

from __future__ import annotations

import os
from typing import Literal, Optional

from anthropic import AsyncAnthropic
from pydantic import BaseModel

from ..core.logging_config import get_logger
from ..core.server_error_mapping import get_all_server_error_codes

logger = get_logger(__name__)


class CodeRef(BaseModel):
    file: str
    line: int
    symbol: str


class ErrorAnalysisRequest(BaseModel):
    error_code: int
    context: dict
    recent_errors: list[int]
    system_state: dict


class ErrorAnalysisFinding(BaseModel):
    root_cause: str
    affected_components: list[str]
    code_references: list[CodeRef]
    recommended_actions: list[str]
    linear_title: str
    linear_description: str
    severity: Literal["critical", "high", "medium", "low"]
    related_error_codes: list[int]


_ESP32_ERROR_CONTEXT = """
ESP32 Firmware Error-Codes (El Trabajante — C++):
HARDWARE (1000-1999): GPIO 1001-1006, I2C 1007-1019, OneWire 1020-1029, PWM 1030-1032, Sensor 1040-1043, Actuator 1050-1053, DS18B20 1060-1063
SERVICE (2000-2999): NVS 2001-2005, Config 2010-2014, Logger 2020-2021, Storage 2030-2032, Subzone 2500-2506
COMMUNICATION (3000-3999): WiFi 3001-3005, MQTT 3010-3016, HTTP 3020-3023, Network 3030-3032
APPLICATION (4000-4999): State 4001-4003, Operation 4010-4012, Command 4020-4022, Payload 4030-4033, Memory 4040-4042, System 4050-4052, Task 4060-4062, Watchdog 4070-4072

Wichtige Code-Referenzen:
- Error Tracker: El Trabajante/src/error_handling/error_tracker.cpp
- Offline Mode Manager: El Trabajante/src/services/safety/offline_mode_manager.cpp
- MQTT Client: El Trabajante/src/services/communication/mqtt_client.cpp
- Config Manager: El Trabajante/src/services/config/config_manager.cpp
"""

_CODE_REFERENCE_CONTEXT = """
Server-seitige Code-Referenzen:
- Logic Engine: El Servador/god_kaiser_server/src/services/logic_engine.py
- Logic Conditions: El Servador/god_kaiser_server/src/services/logic/conditions/
- MQTT Error Handler: El Servador/god_kaiser_server/src/mqtt/handlers/error_handler.py
- ESP Service: El Servador/god_kaiser_server/src/services/esp_service.py
- AI Notification Bridge: El Servador/god_kaiser_server/src/services/ai_notification_bridge.py
"""


def _build_server_error_context() -> str:
    codes = get_all_server_error_codes()
    lines = ["Server Error-Codes (5000-5999):"]
    for code, info in sorted(codes.items()):
        msg = info.get("message_user_de") or info.get("message_de", "")
        cat = info.get("category", "")
        lines.append(f"  {code} ({cat}): {msg}")
    return "\n".join(lines)


_SYSTEM_PROMPT = f"""Du bist ein AutomationOne IoT-Framework Debugging-Experte.

AutomationOne besteht aus:
- El Trabajante: ESP32 C++ Firmware (Sensoren, Aktoren, MQTT)
- El Servador: FastAPI Python Server (Logic Engine, MQTT-Broker-Bridge, REST API)
- El Frontend: Vue 3 Dashboard

{_ESP32_ERROR_CONTEXT}

{_build_server_error_context()}

{_CODE_REFERENCE_CONTEXT}

Deine Aufgabe: Analysiere Fehler-Events und gib strukturierte Befunde zurueck.
Benenne immer konkrete Datei-Pfade und Zeilennummern wenn moeglich.
"""


class AiService:
    def __init__(self) -> None:
        self._client: Optional[AsyncAnthropic] = None
        self._system_prompt = _SYSTEM_PROMPT

    def _get_client(self) -> AsyncAnthropic:
        if self._client is None:
            self._client = AsyncAnthropic()
        return self._client

    def is_available(self) -> bool:
        """Returns True if ANTHROPIC_API_KEY is configured."""
        return bool(os.environ.get("ANTHROPIC_API_KEY"))

    async def analyze_error(self, request: ErrorAnalysisRequest) -> ErrorAnalysisFinding:
        """
        Analyze an error event using Claude and return a structured finding.

        Uses messages.parse() with output_format for structured output
        (requires anthropic>=0.49.0).
        """
        response = await self._get_client().messages.parse(
            model="claude-opus-4-7",
            max_tokens=4096,
            system=[
                {
                    "type": "text",
                    "text": self._system_prompt,
                    "cache_control": {"type": "ephemeral"},
                }
            ],
            output_format=ErrorAnalysisFinding,
            messages=[
                {
                    "role": "user",
                    "content": request.model_dump_json(),
                }
            ],
        )
        result = response.parsed_output
        if result is None:
            raise ValueError("Claude returned no parsed output for error analysis request")
        return result


ai_service = AiService()
