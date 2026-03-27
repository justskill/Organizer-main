"""Pydantic schemas for stock adjustment operations."""

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.stock import TransactionType


class StockAdjustRequest(BaseModel):
    """Payload for adjusting stock on an item."""
    transaction_type: TransactionType
    quantity_delta: Decimal = Field(..., description="Positive or negative quantity change")
    unit_of_measure: str | None = None
    reason: str | None = None
    reference: str | None = None


class StockTransactionResponse(BaseModel):
    """Stock transaction record."""
    id: UUID
    item_id: UUID
    transaction_type: TransactionType
    quantity_delta: Decimal
    resulting_quantity: Decimal
    unit_of_measure: str | None = None
    reason: str | None = None
    reference: str | None = None
    performed_by: UUID | None = None
    created_at: datetime

    model_config = {"from_attributes": True}
