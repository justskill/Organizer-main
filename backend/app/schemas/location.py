"""Pydantic schemas for Location CRUD operations."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class LocationCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=500)
    description: str | None = None
    parent_location_id: UUID | None = None
    location_type: str | None = None
    notes: str | None = None


class LocationUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=500)
    description: str | None = None
    parent_location_id: UUID | None = None
    location_type: str | None = None
    notes: str | None = None


class TagBrief(BaseModel):
    id: UUID
    name: str
    slug: str
    color: str | None = None
    model_config = {"from_attributes": True}


class LocationResponse(BaseModel):
    id: UUID
    code: str
    name: str
    slug: str | None = None
    description: str | None = None
    parent_location_id: UUID | None = None
    path_text: str | None = None
    location_type: str | None = None
    notes: str | None = None
    created_at: datetime
    updated_at: datetime
    archived_at: datetime | None = None
    tags: list[TagBrief] = []
    children: list[LocationResponse] = []

    model_config = {"from_attributes": True}


class LocationTreeNode(BaseModel):
    id: UUID
    code: str
    name: str
    path_text: str | None = None
    location_type: str | None = None
    children: list[LocationTreeNode] = []

    model_config = {"from_attributes": True}


class ItemBrief(BaseModel):
    id: UUID
    code: str
    name: str
    item_type: str
    model_config = {"from_attributes": True}


class LocationContents(BaseModel):
    location: LocationResponse
    items: list[ItemBrief] = []
    child_locations: list[LocationResponse] = []


class LocationListResponse(BaseModel):
    locations: list[LocationResponse]
    total: int
    page: int
    page_size: int
