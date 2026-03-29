"""Pydantic schemas for Item CRUD operations."""

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.item import ItemCondition, ItemType


# --- Create / Update ---

class ItemCreate(BaseModel):
    """Payload for creating a new item."""
    name: str = Field(..., min_length=1, max_length=500)
    description: str | None = None
    item_type: ItemType
    is_container: bool = False
    is_consumable: bool = False
    is_serialized: bool = False
    brand: str | None = None
    model_number: str | None = None
    part_number: str | None = None
    serial_number: str | None = None
    barcode: str | None = None
    condition: ItemCondition | None = None
    status: str | None = None
    quantity_mode: str | None = None
    unit_of_measure: str | None = None
    quantity_on_hand: Decimal | None = Decimal("0")
    minimum_quantity: Decimal | None = None
    reorder_quantity: Decimal | None = None
    purchase_date: date | None = None
    purchase_source: str | None = None
    purchase_price: Decimal | None = None
    warranty_expiration: date | None = None
    calibration_due_date: date | None = None
    maintenance_due_date: date | None = None
    metadata_json: dict | None = None
    notes: str | None = None


class ItemUpdate(BaseModel):
    """Payload for partially updating an item. All fields optional."""
    name: str | None = Field(None, min_length=1, max_length=500)
    description: str | None = None
    item_type: ItemType | None = None
    is_container: bool | None = None
    is_consumable: bool | None = None
    is_serialized: bool | None = None
    brand: str | None = None
    model_number: str | None = None
    part_number: str | None = None
    serial_number: str | None = None
    barcode: str | None = None
    condition: ItemCondition | None = None
    status: str | None = None
    quantity_mode: str | None = None
    unit_of_measure: str | None = None
    quantity_on_hand: Decimal | None = None
    minimum_quantity: Decimal | None = None
    reorder_quantity: Decimal | None = None
    purchase_date: date | None = None
    purchase_source: str | None = None
    purchase_price: Decimal | None = None
    warranty_expiration: date | None = None
    calibration_due_date: date | None = None
    maintenance_due_date: date | None = None
    metadata_json: dict | None = None
    notes: str | None = None


# --- Response ---

class PlacementBrief(BaseModel):
    """Minimal placement info embedded in item responses."""
    id: UUID
    location_id: UUID | None = None
    parent_item_id: UUID | None = None
    location_name: str | None = None
    container_name: str | None = None
    placed_at: datetime

    model_config = {"from_attributes": True}


class TagBrief(BaseModel):
    id: UUID
    name: str
    slug: str
    color: str | None = None

    model_config = {"from_attributes": True}


class MediaBrief(BaseModel):
    id: UUID
    file_path: str
    original_filename: str
    mime_type: str
    file_size: int = 0
    is_primary: bool

    model_config = {"from_attributes": True}


class CategoryBrief(BaseModel):
    id: UUID
    name: str
    slug: str

    model_config = {"from_attributes": True}


class ItemResponse(BaseModel):
    """Full item detail response."""
    id: UUID
    code: str
    name: str
    description: str | None = None
    item_type: ItemType
    is_container: bool
    is_consumable: bool
    is_serialized: bool
    brand: str | None = None
    model_number: str | None = None
    part_number: str | None = None
    serial_number: str | None = None
    barcode: str | None = None
    condition: ItemCondition | None = None
    status: str | None = None
    quantity_mode: str | None = None
    unit_of_measure: str | None = None
    quantity_on_hand: Decimal | None = None
    minimum_quantity: Decimal | None = None
    reorder_quantity: Decimal | None = None
    purchase_date: date | None = None
    purchase_source: str | None = None
    purchase_price: Decimal | None = None
    warranty_expiration: date | None = None
    calibration_due_date: date | None = None
    maintenance_due_date: date | None = None
    metadata_json: dict | None = None
    notes: str | None = None
    created_by: UUID | None = None
    created_at: datetime
    updated_at: datetime
    archived_at: datetime | None = None

    current_placement: PlacementBrief | None = None
    tags: list[TagBrief] = []
    categories: list[CategoryBrief] = []
    primary_photo: MediaBrief | None = None
    media: list[MediaBrief] = []

    model_config = {"from_attributes": True}


class DuplicateCandidate(BaseModel):
    id: UUID
    code: str
    name: str
    model_number: str | None = None
    part_number: str | None = None

    model_config = {"from_attributes": True}


class ItemCreateResponse(BaseModel):
    """Response for item creation, includes duplicate candidates."""
    item: ItemResponse
    duplicate_candidates: list[DuplicateCandidate] = []


class ItemListResponse(BaseModel):
    """Paginated list of items."""
    items: list[ItemResponse]
    total: int
    page: int
    page_size: int
