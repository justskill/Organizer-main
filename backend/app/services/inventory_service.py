"""Inventory service — item lifecycle, movement, and relationship management."""

import uuid
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.short_code import generate_short_code
from app.models.item import Item
from app.models.placement import ItemPlacement
from app.repositories import item_repository
from app.schemas.item import ItemCreate, ItemUpdate
from app.services import audit_service


# ---------------------------------------------------------------------------
# Item CRUD
# ---------------------------------------------------------------------------

async def create_item(
    db: AsyncSession,
    data: ItemCreate,
    user_id: uuid.UUID | None = None,
) -> tuple[Item, list[Item]]:
    """Create a new item with generated UUID + short code.

    Returns (created_item, duplicate_candidates).
    """
    code = await generate_short_code(db, "ITM")

    item = Item(
        code=code,
        created_by=user_id,
        **data.model_dump(exclude_unset=False),
    )
    item = await item_repository.create(db, item)

    # Duplicate detection
    duplicates = await item_repository.find_duplicates(
        db,
        name=data.name,
        model_number=data.model_number,
        part_number=data.part_number,
        exclude_id=item.id,
    )

    await audit_service.record_event(
        db,
        actor_id=user_id,
        entity_type="item",
        entity_id=item.id,
        event_type="created",
        event_data={"name": item.name, "code": item.code},
    )

    return item, duplicates


async def get_item(db: AsyncSession, item_id: uuid.UUID) -> Item | None:
    """Get item with current placement, tags, and primary photo."""
    return await item_repository.get_by_id(db, item_id)


async def update_item(
    db: AsyncSession,
    item_id: uuid.UUID,
    data: ItemUpdate,
    user_id: uuid.UUID | None = None,
) -> Item | None:
    """Partially update an item and record audit event."""
    item = await item_repository.get_by_id(db, item_id)
    if item is None:
        return None

    update_data = data.model_dump(exclude_unset=True)
    if not update_data:
        return item

    before = {k: getattr(item, k) for k in update_data}
    item = await item_repository.update(db, item, update_data)

    await audit_service.record_event(
        db,
        actor_id=user_id,
        entity_type="item",
        entity_id=item.id,
        event_type="updated",
        event_data={"before": _serialize(before), "after": _serialize(update_data)},
    )
    return item


async def archive_item(
    db: AsyncSession,
    item_id: uuid.UUID,
    user_id: uuid.UUID | None = None,
) -> Item | None:
    """Soft-delete: set archived_at, retain UUID and short code."""
    item = await item_repository.get_by_id(db, item_id)
    if item is None:
        return None

    now = datetime.now(timezone.utc)
    item = await item_repository.soft_delete(db, item, now)

    await audit_service.record_event(
        db,
        actor_id=user_id,
        entity_type="item",
        entity_id=item.id,
        event_type="archived",
        event_data={"archived_at": now.isoformat()},
    )
    return item


async def delete_item(
    db: AsyncSession,
    item_id: uuid.UUID,
    user_id: uuid.UUID | None = None,
) -> bool:
    """Hard-delete item and cascade placements/tags/media/relationships."""
    item = await item_repository.get_by_id(db, item_id)
    if item is None:
        return False

    entity_id = item.id
    await audit_service.record_event(
        db,
        actor_id=user_id,
        entity_type="item",
        entity_id=entity_id,
        event_type="deleted",
        event_data={"name": item.name, "code": item.code},
    )

    await item_repository.hard_delete(db, item)
    return True


# ---------------------------------------------------------------------------
# Movement
# ---------------------------------------------------------------------------

async def move_item(
    db: AsyncSession,
    item_id: uuid.UUID,
    *,
    location_id: uuid.UUID | None = None,
    container_id: uuid.UUID | None = None,
    user_id: uuid.UUID | None = None,
    note: str | None = None,
) -> ItemPlacement:
    """Move an item to a new location or container.

    Validates placement constraints and prevents self-containment.
    """
    if location_id is None and container_id is None:
        raise ValueError("Either location_id or container_id must be provided")

    item = await item_repository.get_by_id(db, item_id)
    if item is None:
        raise ValueError(f"Item {item_id} not found")

    # Prevent self-containment (direct)
    if container_id is not None and container_id == item_id:
        raise ValueError("Cannot place an item inside itself")

    # Prevent transitive self-containment
    if container_id is not None and item.is_container:
        await _check_transitive_containment(db, item_id, container_id)

    # Close current placement
    current = await item_repository.get_current_placement(db, item_id)
    if current is not None:
        current.removed_at = datetime.now(timezone.utc)
        await db.flush()

    # Create new placement
    placement = ItemPlacement(
        item_id=item_id,
        location_id=location_id,
        parent_item_id=container_id,
        created_by=user_id,
        note=note,
    )
    db.add(placement)
    await db.flush()

    await audit_service.record_event(
        db,
        actor_id=user_id,
        entity_type="item",
        entity_id=item_id,
        event_type="moved",
        event_data={
            "location_id": str(location_id) if location_id else None,
            "container_id": str(container_id) if container_id else None,
        },
    )
    return placement


async def get_current_placement(
    db: AsyncSession, item_id: uuid.UUID
) -> ItemPlacement | None:
    return await item_repository.get_current_placement(db, item_id)


async def get_movement_history(
    db: AsyncSession, item_id: uuid.UUID
) -> list[ItemPlacement]:
    return await item_repository.get_movement_history(db, item_id)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _check_transitive_containment(
    db: AsyncSession,
    container_item_id: uuid.UUID,
    target_container_id: uuid.UUID,
) -> None:
    """Walk the container chain to prevent cycles."""
    visited: set[uuid.UUID] = set()
    current_id = target_container_id

    while current_id is not None:
        if current_id in visited:
            break
        if current_id == container_item_id:
            raise ValueError("Cannot place a container inside itself (transitive cycle detected)")
        visited.add(current_id)
        placement = await item_repository.get_current_placement(db, current_id)
        current_id = placement.parent_item_id if placement else None


def _serialize(data: dict) -> dict:
    """Convert non-JSON-serializable values to strings."""
    from decimal import Decimal
    out = {}
    for k, v in data.items():
        if isinstance(v, Decimal):
            out[k] = float(v)
        elif isinstance(v, uuid.UUID):
            out[k] = str(v)
        elif hasattr(v, "isoformat"):
            out[k] = v.isoformat()
        elif hasattr(v, "value"):
            out[k] = v.value
        else:
            out[k] = v
    return out
