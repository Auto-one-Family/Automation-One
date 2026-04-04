"""
Intent Outcome API (P0.2 visibility).

Exposes persisted canonical intent_outcome records for realtime/API parity checks.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from ..deps import ActiveUser, DBSession
from ...db.repositories.command_contract_repo import CommandContractRepository
from ...services.intent_outcome_contract import serialize_intent_outcome_row

router = APIRouter(prefix="/v1/intent-outcomes", tags=["intent-outcomes"])


@router.get("", summary="List recent intent outcomes")
async def list_intent_outcomes(
    db: DBSession,
    _user: ActiveUser,
    limit: int = Query(default=100, ge=1, le=1000),
    esp_id: str | None = Query(default=None),
    flow: str | None = Query(default=None),
    outcome: str | None = Query(default=None),
) -> dict:
    repo = CommandContractRepository(db)
    rows = await repo.list_recent(limit=limit, esp_id=esp_id, flow=flow, outcome=outcome)
    return {
        "status": "success",
        "data": [serialize_intent_outcome_row(row) for row in rows],
    }


@router.get("/{intent_id}", summary="Get terminal outcome for intent")
async def get_intent_outcome(
    intent_id: str,
    db: DBSession,
    _user: ActiveUser,
) -> dict:
    repo = CommandContractRepository(db)
    row = await repo.get_by_intent_id(intent_id)
    if row is None:
        raise HTTPException(status_code=404, detail=f"Intent outcome not found: {intent_id}")

    return {
        "status": "success",
        "data": serialize_intent_outcome_row(row),
    }
