"""
Plant Pydantic Schemas (AUT-222 — Phyta Plants Schema).

Schemas mirror the SQLAlchemy ``Plant`` model and intentionally restrict
the fields that can be set / updated via the public REST API.
"""

import uuid
from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from ..db.models.plant import PLANT_PHASES, PLANT_VISIBILITY


_PHASE_SET = set(PLANT_PHASES)
_VISIBILITY_SET = set(PLANT_VISIBILITY)


class PlantCreate(BaseModel):
    """Request schema for creating a new plant."""

    genotype_label: str = Field(
        ...,
        min_length=1,
        max_length=128,
        description="Genotype label (e.g. 'Northern Lights x White Widow')",
    )
    planting_date: date = Field(
        ...,
        description="Calendar date the plant was planted / cloned",
    )
    phase: str = Field(
        ...,
        max_length=32,
        description=f"Lifecycle phase. One of: {sorted(_PHASE_SET)}",
    )
    kaiser_id: Optional[str] = Field(
        None,
        max_length=50,
        description="Optional tenant anchor (kaiser installation ID)",
    )
    cultivar_or_variety: Optional[str] = Field(
        None,
        max_length=128,
        description="Cultivar / variety designation",
    )
    batch_label: Optional[str] = Field(
        None,
        max_length=64,
        description="Optional batch grouping label",
    )
    subzone_id: Optional[uuid.UUID] = Field(
        None,
        description="Optional subzone_configs.id (current location)",
    )
    notes: Optional[str] = Field(
        None,
        description="Free-form notes",
    )

    @field_validator("phase")
    @classmethod
    def validate_phase(cls, v: str) -> str:
        if v not in _PHASE_SET:
            raise ValueError(
                f"Invalid phase '{v}'. Must be one of: {sorted(_PHASE_SET)}"
            )
        return v


class PlantUpdate(BaseModel):
    """Partial-update schema for an existing plant."""

    external_plant_id: Optional[str] = Field(
        None,
        max_length=128,
        description="Override the auto-assigned external_plant_id",
    )
    phase: Optional[str] = Field(
        None,
        max_length=32,
        description="New lifecycle phase",
    )
    notes: Optional[str] = Field(
        None,
        description="Updated notes",
    )
    current_position_label: Optional[str] = Field(
        None,
        max_length=128,
        description="Updated free-form position label",
    )
    visibility: Optional[str] = Field(
        None,
        max_length=24,
        description=f"Visibility. One of: {sorted(_VISIBILITY_SET)}",
    )
    genotype_label: Optional[str] = Field(
        None,
        min_length=1,
        max_length=128,
        description="Updated genotype label",
    )
    cultivar_or_variety: Optional[str] = Field(
        None,
        max_length=128,
        description="Updated cultivar / variety",
    )

    @field_validator("phase")
    @classmethod
    def validate_phase(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in _PHASE_SET:
            raise ValueError(
                f"Invalid phase '{v}'. Must be one of: {sorted(_PHASE_SET)}"
            )
        return v

    @field_validator("visibility")
    @classmethod
    def validate_visibility(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in _VISIBILITY_SET:
            raise ValueError(
                f"Invalid visibility '{v}'. Must be one of: {sorted(_VISIBILITY_SET)}"
            )
        return v


class PlantResponse(BaseModel):
    """Response schema for a single plant."""

    plant_id: uuid.UUID = Field(..., description="Plant UUID")
    kaiser_id: Optional[str] = Field(None, description="Tenant anchor (kaiser ID)")
    subzone_id: Optional[uuid.UUID] = Field(None, description="Current subzone FK")
    qr_code: str = Field(..., description="Print label QR code (PL-XXXXXXXX)")
    external_plant_id: Optional[str] = Field(
        None, description="External system ID (PhotosynQ etc.)"
    )
    external_track_trace_id: Optional[str] = Field(
        None, description="Track-and-Trace anchor (CanG)"
    )
    genotype_label: str = Field(..., description="Genotype label")
    cultivar_or_variety: Optional[str] = Field(
        None, description="Cultivar / variety"
    )
    lineage_parent_plant_id: Optional[uuid.UUID] = Field(
        None, description="Mother-clone lineage parent"
    )
    batch_label: Optional[str] = Field(None, description="Batch label")
    planting_date: date = Field(..., description="Planting date")
    phase: str = Field(..., description="Current lifecycle phase")
    current_position_label: Optional[str] = Field(
        None, description="Free-form position label"
    )
    visibility: str = Field(..., description="Visibility level")
    notes: Optional[str] = Field(None, description="Notes")
    rooting_success: Optional[bool] = Field(
        None, description="Whether rooting succeeded"
    )
    rooting_date: Optional[date] = Field(None, description="Rooting confirmation date")
    deleted_at: Optional[datetime] = Field(
        None, description="Soft-delete timestamp"
    )
    created_at: datetime = Field(..., description="Creation timestamp")
    updated_at: datetime = Field(..., description="Last update timestamp")

    model_config = ConfigDict(from_attributes=True)


class PlantListResponse(BaseModel):
    """Response schema for listing plants."""

    plants: list[PlantResponse] = Field(
        default_factory=list, description="List of plants"
    )
    total: int = Field(0, description="Number of plants returned", ge=0)
