"""Item relationship model for accessory, spare-part, and kit associations."""

import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, UUIDMixin


class RelationshipType(str, enum.Enum):
    accessory_of = "accessory_of"
    spare_part_for = "spare_part_for"
    compatible_with = "compatible_with"
    belongs_to_kit = "belongs_to_kit"
    manual_for = "manual_for"


class ItemRelationship(UUIDMixin, Base):
    __tablename__ = "item_relationships"

    source_item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("items.id", ondelete="CASCADE"), nullable=False, index=True
    )
    target_item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("items.id", ondelete="CASCADE"), nullable=False, index=True
    )
    relationship_type: Mapped[RelationshipType] = mapped_column(
        Enum(RelationshipType, name="relationship_type", native_enum=False), nullable=False
    )
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    source_item = relationship("Item", foreign_keys=[source_item_id], back_populates="source_relationships")
    target_item = relationship("Item", foreign_keys=[target_item_id], back_populates="target_relationships")
