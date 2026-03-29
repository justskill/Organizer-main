"""Label queue API — server-side print queue for labels."""

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.item import Item
from app.models.label_queue import LabelQueueItem
from app.models.location import Location
from app.models.user import User

router = APIRouter(prefix="/label-queue", tags=["labels"])


class QueueAddRequest(BaseModel):
    entity_type: str = Field(..., description="'item' or 'location'")
    entity_id: UUID


class QueueBatchAddRequest(BaseModel):
    entities: list[QueueAddRequest]


class QueueItemResponse(BaseModel):
    id: UUID
    entity_type: str
    entity_id: UUID
    entity_name: str
    entity_code: str
    created_at: datetime

    model_config = {"from_attributes": True}


@router.get("", response_model=list[QueueItemResponse])
async def list_queue(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all items in the current user's label queue."""
    result = await db.execute(
        select(LabelQueueItem)
        .where(LabelQueueItem.user_id == current_user.id)
        .order_by(LabelQueueItem.created_at.asc())
    )
    return [QueueItemResponse.model_validate(q) for q in result.scalars().all()]


@router.post("", response_model=list[QueueItemResponse], status_code=status.HTTP_201_CREATED)
async def add_to_queue(
    body: QueueBatchAddRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Add one or more entities to the label queue. Duplicates are skipped."""
    added = []
    for entry in body.entities:
        if entry.entity_type not in ("item", "location"):
            continue

        # Check for duplicate
        existing = await db.execute(
            select(LabelQueueItem).where(
                LabelQueueItem.user_id == current_user.id,
                LabelQueueItem.entity_type == entry.entity_type,
                LabelQueueItem.entity_id == entry.entity_id,
            )
        )
        if existing.scalar_one_or_none():
            continue

        # Resolve entity name and code
        if entry.entity_type == "item":
            result = await db.execute(select(Item).where(Item.id == entry.entity_id))
            entity = result.scalar_one_or_none()
        else:
            result = await db.execute(select(Location).where(Location.id == entry.entity_id))
            entity = result.scalar_one_or_none()

        if entity is None:
            continue

        queue_item = LabelQueueItem(
            user_id=current_user.id,
            entity_type=entry.entity_type,
            entity_id=entry.entity_id,
            entity_name=entity.name,
            entity_code=entity.code,
        )
        db.add(queue_item)
        added.append(queue_item)

    await db.flush()
    # Refresh to load server-generated defaults (created_at)
    for q in added:
        await db.refresh(q)
    return [QueueItemResponse.model_validate(q) for q in added]


@router.delete("/{queue_item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_from_queue(
    queue_item_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove a single item from the label queue."""
    result = await db.execute(
        select(LabelQueueItem).where(
            LabelQueueItem.id == queue_item_id,
            LabelQueueItem.user_id == current_user.id,
        )
    )
    item = result.scalar_one_or_none()
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Queue item not found")
    await db.delete(item)
    await db.flush()


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
async def clear_queue(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Clear all items from the label queue."""
    await db.execute(
        delete(LabelQueueItem).where(LabelQueueItem.user_id == current_user.id)
    )
    await db.flush()
