"""Item category model with hierarchical support and metadata schemas."""

import uuid

from sqlalchemy import Column, ForeignKey, String, Table, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin

# Many-to-many association table
item_category_assignments = Table(
    "item_category_assignments",
    Base.metadata,
    Column("item_id", UUID(as_uuid=True), ForeignKey("items.id", ondelete="CASCADE"), primary_key=True),
    Column("category_id", UUID(as_uuid=True), ForeignKey("item_categories.id", ondelete="CASCADE"), primary_key=True),
)


class ItemCategory(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "item_categories"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    parent_category_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("item_categories.id"), nullable=True
    )
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    metadata_schema_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    parent = relationship("ItemCategory", remote_side="ItemCategory.id", back_populates="children")
    children = relationship("ItemCategory", back_populates="parent", cascade="all, delete-orphan")
    items = relationship("Item", secondary=item_category_assignments, back_populates="categories")
