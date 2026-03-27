"""Stock service — quantity adjustments and transaction recording."""

import uuid
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.item import Item
from app.models.stock import StockTransaction, TransactionType
from app.services import audit_service


async def adjust_stock(
    db: AsyncSession,
    item_id: uuid.UUID,
    transaction_type: TransactionType,
    quantity_delta: Decimal,
    user_id: uuid.UUID | None = None,
    reason: str | None = None,
    reference: str | None = None,
    unit_of_measure: str | None = None,
) -> StockTransaction:
    """Create a stock transaction and update item.quantity_on_hand.

    Returns the created StockTransaction.
    Raises ValueError if item not found.
    """
    result = await db.execute(select(Item).where(Item.id == item_id))
    item = result.scalar_one_or_none()
    if item is None:
        raise ValueError(f"Item {item_id} not found")

    current_qty = item.quantity_on_hand or Decimal("0")
    resulting_qty = current_qty + quantity_delta

    txn = StockTransaction(
        item_id=item_id,
        transaction_type=transaction_type,
        quantity_delta=quantity_delta,
        resulting_quantity=resulting_qty,
        unit_of_measure=unit_of_measure or item.unit_of_measure,
        reason=reason,
        reference=reference,
        performed_by=user_id,
    )
    db.add(txn)

    item.quantity_on_hand = resulting_qty
    await db.flush()

    await audit_service.record_event(
        db,
        actor_id=user_id,
        entity_type="item",
        entity_id=item_id,
        event_type="stock_adjusted",
        event_data={
            "transaction_type": transaction_type.value,
            "quantity_delta": str(quantity_delta),
            "resulting_quantity": str(resulting_qty),
            "reason": reason,
        },
    )
    return txn


async def get_stock_history(
    db: AsyncSession, item_id: uuid.UUID
) -> list[StockTransaction]:
    """Return all stock transactions for an item, newest first."""
    result = await db.execute(
        select(StockTransaction)
        .where(StockTransaction.item_id == item_id)
        .order_by(StockTransaction.created_at.desc())
    )
    return list(result.scalars().all())
