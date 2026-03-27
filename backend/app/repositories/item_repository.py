"""Item data access layer — CRUD, placements, tags, relationships."""

import uuid

from sqlalchemy import and_, delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.item import Item
from app.models.media import MediaAsset
from app.models.placement import ItemPlacement
from app.models.relationship import ItemRelationship
from app.models.tag import Tag, item_tags


async def get_by_id(db: AsyncSession, item_id: uuid.UUID) -> Item | None:
    """Fetch a single item with eager-loaded tags and media."""
    result = await db.execute(
        select(Item)
        .options(selectinload(Item.tags), selectinload(Item.media), selectinload(Item.categories))
        .where(Item.id == item_id)
    )
    return result.scalar_one_or_none()


async def get_by_code(db: AsyncSession, code: str) -> Item | None:
    result = await db.execute(select(Item).where(Item.code == code))
    return result.scalar_one_or_none()


async def list_items(
    db: AsyncSession,
    *,
    page: int = 1,
    page_size: int = 50,
    archived: bool = False,
) -> tuple[list[Item], int]:
    """Return paginated items and total count."""
    base = select(Item)
    if not archived:
        base = base.where(Item.archived_at.is_(None))

    count_q = select(func.count()).select_from(base.subquery())
    total = (await db.execute(count_q)).scalar_one()

    items_q = (
        base
        .options(selectinload(Item.tags), selectinload(Item.media), selectinload(Item.categories))
        .order_by(Item.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    rows = (await db.execute(items_q)).scalars().all()
    return list(rows), total


async def create(db: AsyncSession, item: Item) -> Item:
    db.add(item)
    await db.flush()
    return item


async def update(db: AsyncSession, item: Item, data: dict) -> Item:
    for key, value in data.items():
        setattr(item, key, value)
    await db.flush()
    return item


async def soft_delete(db: AsyncSession, item: Item, archived_at) -> Item:
    item.archived_at = archived_at
    await db.flush()
    return item


async def hard_delete(db: AsyncSession, item: Item) -> None:
    # Cascade deletes placements, tags, media refs via FK cascades
    await db.execute(delete(item_tags).where(item_tags.c.item_id == item.id))
    await db.execute(
        delete(ItemPlacement).where(ItemPlacement.item_id == item.id)
    )
    await db.execute(
        delete(MediaAsset).where(
            and_(MediaAsset.owner_type == "item", MediaAsset.owner_id == item.id)
        )
    )
    await db.execute(
        delete(ItemRelationship).where(
            or_(
                ItemRelationship.source_item_id == item.id,
                ItemRelationship.target_item_id == item.id,
            )
        )
    )
    await db.delete(item)
    await db.flush()


# --- Duplicate detection ---

async def find_duplicates(
    db: AsyncSession,
    name: str,
    model_number: str | None = None,
    part_number: str | None = None,
    exclude_id: uuid.UUID | None = None,
) -> list[Item]:
    """Find potential duplicate items by name, model_number, or part_number."""
    normalized = name.lower()
    conditions = [Item.normalized_name == normalized]
    if model_number:
        conditions.append(Item.model_number == model_number)
    if part_number:
        conditions.append(Item.part_number == part_number)

    q = select(Item).where(
        and_(Item.archived_at.is_(None), or_(*conditions))
    )
    if exclude_id:
        q = q.where(Item.id != exclude_id)

    result = await db.execute(q.limit(10))
    return list(result.scalars().all())


# --- Placement helpers ---

async def get_current_placement(db: AsyncSession, item_id: uuid.UUID) -> ItemPlacement | None:
    result = await db.execute(
        select(ItemPlacement)
        .where(
            ItemPlacement.item_id == item_id,
            ItemPlacement.removed_at.is_(None),
        )
        .order_by(ItemPlacement.placed_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def get_movement_history(
    db: AsyncSession, item_id: uuid.UUID
) -> list[ItemPlacement]:
    result = await db.execute(
        select(ItemPlacement)
        .where(ItemPlacement.item_id == item_id)
        .order_by(ItemPlacement.placed_at.desc())
    )
    return list(result.scalars().all())


# --- Tag helpers ---

async def add_tag(db: AsyncSession, item_id: uuid.UUID, tag_id: uuid.UUID) -> None:
    await db.execute(item_tags.insert().values(item_id=item_id, tag_id=tag_id))
    await db.flush()


async def remove_tag(db: AsyncSession, item_id: uuid.UUID, tag_id: uuid.UUID) -> None:
    await db.execute(
        delete(item_tags).where(
            and_(item_tags.c.item_id == item_id, item_tags.c.tag_id == tag_id)
        )
    )
    await db.flush()


# --- Relationship helpers ---

async def get_relationships(db: AsyncSession, item_id: uuid.UUID) -> list[ItemRelationship]:
    result = await db.execute(
        select(ItemRelationship).where(
            or_(
                ItemRelationship.source_item_id == item_id,
                ItemRelationship.target_item_id == item_id,
            )
        )
    )
    return list(result.scalars().all())


async def create_relationship(db: AsyncSession, rel: ItemRelationship) -> ItemRelationship:
    db.add(rel)
    await db.flush()
    return rel
