"""Item model — the core inventory entity."""

import enum
import unicodedata
import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean, Date, DateTime, Enum, ForeignKey, Index, Numeric, String, Text, event, func,
)
from sqlalchemy.dialects.postgresql import JSONB, TSVECTOR, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, UUIDMixin


class ItemType(str, enum.Enum):
    Consumable = "Consumable"
    Equipment = "Equipment"
    Component = "Component"
    Tool = "Tool"
    Container = "Container"
    Kit = "Kit"
    Documented_Reference = "Documented_Reference"


class ItemCondition(str, enum.Enum):
    Available = "Available"
    In_Use = "In_Use"
    Loaned_Out = "Loaned_Out"
    Needs_Repair = "Needs_Repair"
    Retired = "Retired"


class Item(UUIDMixin, Base):
    __tablename__ = "items"

    code: Mapped[str] = mapped_column(String(20), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(500), nullable=False)
    normalized_name: Mapped[str | None] = mapped_column(String(500), nullable=True, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    item_type: Mapped[ItemType] = mapped_column(
        Enum(ItemType, name="item_type", native_enum=False), nullable=False
    )
    is_container: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_consumable: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_serialized: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    brand: Mapped[str | None] = mapped_column(String(255), nullable=True)
    model_number: Mapped[str | None] = mapped_column(String(255), nullable=True)
    part_number: Mapped[str | None] = mapped_column(String(255), nullable=True)
    serial_number: Mapped[str | None] = mapped_column(String(255), nullable=True)

    condition: Mapped[str | None] = mapped_column(
        Enum(ItemCondition, name="item_condition", native_enum=False), nullable=True
    )
    status: Mapped[str | None] = mapped_column(String(50), nullable=True)
    quantity_mode: Mapped[str | None] = mapped_column(String(50), nullable=True)
    unit_of_measure: Mapped[str | None] = mapped_column(String(50), nullable=True)
    quantity_on_hand: Mapped[Decimal | None] = mapped_column(Numeric(12, 4), nullable=True, default=0)
    minimum_quantity: Mapped[Decimal | None] = mapped_column(Numeric(12, 4), nullable=True)
    reorder_quantity: Mapped[Decimal | None] = mapped_column(Numeric(12, 4), nullable=True)

    purchase_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    purchase_source: Mapped[str | None] = mapped_column(String(500), nullable=True)
    purchase_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    warranty_expiration: Mapped[date | None] = mapped_column(Date, nullable=True)
    calibration_due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    maintenance_due_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    metadata_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    search_vector: Mapped[str | None] = mapped_column(TSVECTOR, nullable=True)

    # Relationships
    categories = relationship("ItemCategory", secondary="item_category_assignments", back_populates="items")
    creator = relationship("User", foreign_keys=[created_by])
    placements = relationship("ItemPlacement", foreign_keys="ItemPlacement.item_id", back_populates="item")
    tags = relationship("Tag", secondary="item_tags", back_populates="items")
    media = relationship("MediaAsset", primaryjoin="and_(Item.id == foreign(MediaAsset.owner_id), MediaAsset.owner_type == 'item')", viewonly=True)
    stock_transactions = relationship("StockTransaction", back_populates="item")
    source_relationships = relationship("ItemRelationship", foreign_keys="ItemRelationship.source_item_id", back_populates="source_item")
    target_relationships = relationship("ItemRelationship", foreign_keys="ItemRelationship.target_item_id", back_populates="target_item")

    __table_args__ = (
        Index("ix_items_search_vector", "search_vector", postgresql_using="gin"),
        Index("ix_items_name_trgm", "name", postgresql_using="gin", postgresql_ops={"name": "gin_trgm_ops"}),
        Index("ix_items_model_number_trgm", "model_number", postgresql_using="gin", postgresql_ops={"model_number": "gin_trgm_ops"}),
    )


def _normalize_name(name: str | None) -> str | None:
    """Lowercase and strip accents for case-insensitive search."""
    if name is None:
        return None
    nfkd = unicodedata.normalize("NFKD", name)
    return "".join(c for c in nfkd if not unicodedata.combining(c)).lower()


@event.listens_for(Item, "before_insert")
@event.listens_for(Item, "before_update")
def _set_normalized_name(mapper, connection, target):
    target.normalized_name = _normalize_name(target.name)
    # Auto-sync: item_type Container always implies is_container
    if target.item_type == ItemType.Container:
        target.is_container = True
