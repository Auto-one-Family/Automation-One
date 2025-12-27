"""
Sequence REST API Endpoints

Endpoints für Sequenz-Monitoring und -Steuerung.

Phase: 3 - Sequence Action Executor
Status: IMPLEMENTED
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status

from ...api.deps import get_current_user
from ...schemas.sequence import SequenceListResponse, SequenceProgressSchema, SequenceStatsResponse
from ...services.logic_engine import get_logic_engine

router = APIRouter(prefix="/sequences", tags=["Sequences"])


@router.get("", response_model=SequenceListResponse)
async def list_sequences(
    running_only: bool = False,
    limit: int = 100,
    current_user=Depends(get_current_user),
):
    """
    Liste aller Sequenzen.

    Args:
        running_only: Nur laufende Sequenzen anzeigen
        limit: Maximale Anzahl (1-500)
    """
    logic_engine = get_logic_engine()
    if not logic_engine:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Logic Engine not available",
        )

    # Hole Executor
    sequence_executor = None
    for executor in logic_engine.action_executors:
        if executor.supports("sequence"):
            sequence_executor = executor
            break

    if not sequence_executor:
        return SequenceListResponse(
            success=True,
            sequences=[],
            total=0,
            running=0,
            completed=0,
            failed=0,
        )

    sequences = sequence_executor.get_all_sequences(
        running_only=running_only, limit=min(limit, 500)
    )

    stats = sequence_executor.get_stats()

    return SequenceListResponse(
        success=True,
        sequences=sequences,
        total=stats["total_sequences"],
        running=stats["running"],
        completed=stats["completed_last_hour"],
        failed=stats["failed_last_hour"],
    )


@router.get("/stats", response_model=SequenceStatsResponse)
async def get_sequence_stats(current_user=Depends(get_current_user)):
    """Statistiken über Sequenz-Ausführungen."""
    logic_engine = get_logic_engine()
    if not logic_engine:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Logic Engine not available",
        )

    sequence_executor = None
    for executor in logic_engine.action_executors:
        if executor.supports("sequence"):
            sequence_executor = executor
            break

    if not sequence_executor:
        return SequenceStatsResponse(
            success=True,
            total_sequences=0,
            running=0,
            completed_last_hour=0,
            failed_last_hour=0,
            average_duration_seconds=0,
        )

    stats = sequence_executor.get_stats()
    return SequenceStatsResponse(success=True, **stats)


@router.get("/{sequence_id}", response_model=SequenceProgressSchema)
async def get_sequence(sequence_id: str, current_user=Depends(get_current_user)):
    """Status einer spezifischen Sequenz."""
    logic_engine = get_logic_engine()
    if not logic_engine:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Logic Engine not available",
        )

    sequence_executor = None
    for executor in logic_engine.action_executors:
        if executor.supports("sequence"):
            sequence_executor = executor
            break

    if not sequence_executor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sequence executor not available",
        )

    status_data = sequence_executor.get_sequence_status(sequence_id)
    if not status_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Sequence '{sequence_id}' not found",
        )

    return status_data


@router.post("/{sequence_id}/cancel")
async def cancel_sequence(
    sequence_id: str,
    reason: Optional[str] = "User cancelled",
    current_user=Depends(get_current_user),
):
    """
    Bricht eine laufende Sequenz ab.

    Requires: User muss eingeloggt sein
    """
    logic_engine = get_logic_engine()
    if not logic_engine:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Logic Engine not available",
        )

    sequence_executor = None
    for executor in logic_engine.action_executors:
        if executor.supports("sequence"):
            sequence_executor = executor
            break

    if not sequence_executor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sequence executor not available",
        )

    cancelled = await sequence_executor.cancel_sequence(sequence_id, reason)

    if not cancelled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot cancel sequence '{sequence_id}' (not running or not found)",
        )

    return {
        "success": True,
        "message": f"Sequence '{sequence_id}' cancelled",
        "reason": reason,
    }
