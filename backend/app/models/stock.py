"""Stock transaction model for consumable quantity tracking."""

import enum
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, Enum, ForeignKey, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, UUIDMixin


class TransactionType(str, enum.Enum):
    add = "add"
    consume = "consume"
    adjust = "adjust"
    count = "count"
    dispose = "dispose"
    return_ = "return"


class StockTransaction(UUIDMixin, Base):
    __tablename__ = "stock_transactions"

    item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("items.id", ondelete="CASCADE"), nullable=False, index=True
    )
    transaction_type: Mapped[TransactionType] = mapped_column(
        Enum(TransactionType, name="transaction_type", native_enum=False), nullable=False
    )
    quantity_delta: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False)
    resulting_quantity: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False)
    unit_of_measure: Mapped[str | None] = mapped_column(String(50), nullable=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    reference: Mapped[str | None] = mapped_column(String(500), nullable=True)
    performed_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    item = relationship("Item", back_populates="stock_transactions")
    performer = relationship("User", foreign_keys=[performed_by])
