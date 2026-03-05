"""
AI/God Layer Integration Endpoints (Phase K4 L3.3 + Phase 5)

- POST /v1/ai/query — Natural language query (rule-based stub; LLM optional later)
- Planned: POST /recommendation, GET /predictions, approve/reject, send_batch
"""

from __future__ import annotations

from fastapi import APIRouter

from ..deps import ActiveUser, DBSession
from pydantic import BaseModel, Field

router = APIRouter(prefix="/v1/ai", tags=["ai"])


class AIQueryRequest(BaseModel):
    """Natural language query request."""

    query: str = Field(
        ...,
        min_length=1,
        description="Natural language question, e.g. 'Wie ist die Temperatur in Zone Bluete-A?'",
    )


class AIQueryResponse(BaseModel):
    """Structured response for NLQ (V1: rule-based placeholder)."""

    answer: str = Field(..., description="Text answer or guidance")
    sources: list[str] = Field(default_factory=list, description="API or data sources used")
    confidence: float = Field(default=0.0, ge=0.0, le=1.0, description="Confidence score 0–1")


@router.post("/query", response_model=AIQueryResponse)
async def natural_language_query(
    request: AIQueryRequest,
    _user: ActiveUser,
    _db: DBSession,
) -> AIQueryResponse:
    """Natural language query (V1: rule-based stub).

    Examples:
    - 'Wie ist die Temperatur in Zone Bluete-A?' → guidance to use zone KPIs or sensor API
    - 'Welche Sensoren haben hohe Fehlerrate?' → guidance to use export or diagnostics

    V2 can add LLM + context injection for real answers.
    """
    q = request.query.strip().lower()
    if "temperatur" in q or "zone" in q:
        return AIQueryResponse(
            answer="Für Zonen-Temperatur nutzen Sie GET /api/v1/zone/context/{zone_id}/kpis (VPD/Temp) oder die Sensor-API pro Gerät.",
            sources=["/api/v1/zone/context/{zone_id}/kpis", "/api/v1/sensors"],
            confidence=0.8,
        )
    if "fehler" in q or "anomal" in q or "sensor" in q:
        return AIQueryResponse(
            answer="Für Sensor-Status und Anomalien: GET /api/v1/export/components oder Diagnostik-API.",
            sources=["/api/v1/export/components", "/api/v1/diagnostics"],
            confidence=0.7,
        )
    return AIQueryResponse(
        answer="NLQ V1 (regelbasiert). Nennen Sie konkret Temperatur, Zone, Fehler oder Sensoren für gezielte Hinweise. Vollständige Abfragen folgen in V2 (LLM + Kontext).",
        sources=[],
        confidence=0.5,
    )
